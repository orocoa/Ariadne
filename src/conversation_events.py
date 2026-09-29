"""Request-local public feedback. Never forward reasoning text or raw tool arguments."""
from contextvars import ContextVar
import json

SINK = ContextVar("conversation_event_sink", default=None)
CONTENT_TYPE = "application/x-ariadne-turn+ndjson"
PATHS = frozenset({"/api/candidate-conversation-turn", "/api/job-conversation-turn",
                   "/api/personal-understanding-turn", "/api/job-overview-turn"})


def emit(kind, **data):
    sink = SINK.get()
    if sink:
        sink({"type": kind, **data})


def encode(event):
    return (json.dumps(event, ensure_ascii=True, separators=(",", ":")) + "\n").encode()


class PublicPreviewParser:
    """Append-only JSON lexer for three public paths; final validation stays separate.

    Strings in arrays, source objects, patches and deliverables are never public.
    Once the first allowed string ends, later private JSON needs no preview scan.
    """
    ALLOWED = {("message",), ("summary",), ("semantic_action", "message")}

    def __init__(self):
        self.stack = []
        self.mode, self.string_kind = None, None
        self.token, self.escape, self.unicode, self.surrogate = "", False, None, None
        self.text, self.selected, self.finished, self.failed = "", False, False, False
        self.seen = 0

    def _complete(self):
        if self.stack: self.stack[-1]["state"] = "comma"
        else: self.finished = True

    def _character(self, character):
        if self.string_kind == "key":
            if len(self.token) >= 256: self.failed = True
            else: self.token += character
        elif self.string_kind == "public" and len(self.text) < 6000:
            code = ord(character)
            if self.surrogate is not None:
                if 0xDC00 <= code <= 0xDFFF:
                    self.text += chr(0x10000 + (self.surrogate - 0xD800) * 1024 + code - 0xDC00)
                    self.surrogate = None
                    return
                self.text += "?"
                self.surrogate = None
            if 0xD800 <= code <= 0xDBFF: self.surrogate = code
            elif 0xDC00 <= code <= 0xDFFF: self.text += "?"
            elif len(self.text) < 6000: self.text += character

    def feed(self, fragment):
        for character in fragment:
            if self.finished or self.failed or self.seen >= 160000: break
            self.seen += 1
            if self.mode == "string":
                if self.unicode is not None:
                    if character not in "0123456789abcdefABCDEF": self.failed = True; break
                    self.unicode += character
                    if len(self.unicode) == 4:
                        self._character(chr(int(self.unicode, 16))); self.unicode = None
                elif self.escape:
                    self.escape = False
                    if character == "u": self.unicode = ""
                    elif character in '\"\\/bfnrt': self._character({'b': '\b', 'f': '\f', 'n': '\n', 'r': '\r', 't': '\t'}.get(character, character))
                    else: self.failed = True; break
                elif character == "\\": self.escape = True
                elif character == '\"':
                    self.mode = None
                    if self.string_kind == "key":
                        self.stack[-1].update(key=self.token, state="colon")
                    else:
                        self._complete()
                        if self.string_kind == "public": self.finished = True
                elif ord(character) < 32: self.failed = True; break
                else: self._character(character)
                continue
            if self.mode == "primitive":
                if character not in " \r\n\t,]}":
                    self.token += character
                    if len(self.token) > 1000: self.failed = True
                    continue
                try:
                    value = json.loads(self.token)
                    if isinstance(value, (dict, list, str)): raise ValueError()
                except ValueError: self.failed = True; break
                self.mode = None; self._complete()
            if character.isspace(): continue
            frame = self.stack[-1] if self.stack else None
            state = frame["state"] if frame else "value"
            if state in {"key", "first_key"}:
                if character == "}" and state == "first_key": self.stack.pop(); self._complete(); continue
                if character != '\"': self.failed = True; break
                self.mode, self.string_kind, self.token = "string", "key", ""
                continue
            if state == "colon":
                if character != ":": self.failed = True; break
                frame["state"] = "value"; continue
            if state == "comma":
                closer = "}" if frame["kind"] == "object" else "]"
                if character == closer: self.stack.pop(); self._complete(); continue
                if character != ",": self.failed = True; break
                frame["state"] = "key" if frame["kind"] == "object" else "value"
                continue
            if state == "first_value" and character == "]": self.stack.pop(); self._complete(); continue
            path = () if frame is None else frame["path"] + ((frame["key"],) if frame["kind"] == "object" else ("[]",))
            if character in "{[":
                if len(self.stack) >= 20: self.failed = True; break
                self.stack.append({"kind": "object" if character == "{" else "array", "path": path,
                                   "state": "first_key" if character == "{" else "first_value", "key": None})
            elif character == '\"':
                self.mode, self.token = "string", ""
                self.string_kind = "public" if not self.selected and path in self.ALLOWED else "private"
                if self.string_kind == "public": self.selected = True
            elif character in "-0123456789tfn": self.mode, self.token = "primitive", character
            else: self.failed = True; break
        return self.text


def public_preview(raw):
    return PublicPreviewParser().feed(raw)


class Preview:
    def __init__(self):
        self.previous, self.raw = "", ""
        self.fragments = []
        self.parser = PublicPreviewParser()

    def append(self, fragment):
        self.fragments.append(fragment)
        self._publish(self.parser.feed(fragment))

    def update(self, raw):
        # Completed App Server items can replace their deltas. Streaming callers
        # use append(), avoiding repeated scans/comparisons of the growing JSON.
        previous_raw = self.raw + "".join(self.fragments)
        self.fragments.clear()
        if raw.startswith(previous_raw):
            fragment = raw[len(previous_raw):]
        else:
            self.parser = PublicPreviewParser()
            fragment = raw
        self.raw = raw
        self._publish(self.parser.feed(fragment))

    def _publish(self, text):
        if text and text != self.previous:
            if self.previous and text.startswith(self.previous):
                emit("preview_delta", text=text[len(self.previous):])
            else:
                emit("preview", text=text)
            self.previous = text


class ChatStream:
    """Bounded Chat Completions SSE -> unchanged domain envelope."""
    def __init__(self, limit):
        self.limit, self.size, self.buffer = limit, 0, b""
        self.response = {"choices": [{"index": 0, "message": {"content": ""}, "finish_reason": None}]}
        self.tools, self.done, self.preview, self.tool_previews = {}, False, Preview(), {}

    def feed(self, chunk):
        self.size += len(chunk)
        if self.size > self.limit: raise ValueError("PROVIDER_RESPONSE_TOO_LARGE")
        self.buffer += chunk
        while b"\n" in self.buffer:
            line, self.buffer = self.buffer.split(b"\n", 1)
            line = line.rstrip(b"\r")
            if not line.startswith(b"data:"): continue
            data = line[5:].strip()
            if not data: continue
            if data == b"[DONE]":
                self.done = True
                continue
            if self.done: raise ValueError("PROVIDER_STREAM_AFTER_END")
            event = json.loads(data)
            if event.get("error"): raise ValueError("PROVIDER_STREAM_ERROR")
            for key in ("id", "model", "usage"):
                if event.get(key) is not None:
                    if key in {"id", "model"} and key in self.response and self.response[key] != event[key]:
                        raise ValueError("PROVIDER_STREAM_IDENTITY_CHANGED")
                    self.response[key] = event[key]
            for choice in event.get("choices", []):
                if choice.get("index", 0) != 0: raise ValueError("PROVIDER_STREAM_CHOICES_INVALID")
                target = self.response["choices"][0]
                delta = choice.get("delta") or {}
                # reasoning_content, reasoning and tool arguments are never UI events.
                if isinstance(delta.get("content"), str):
                    target["message"]["content"] += delta["content"]
                    self.preview.append(delta["content"])
                if delta.get("refusal"): target["message"]["refusal"] = delta["refusal"]
                for tool in delta.get("tool_calls") or []:
                    index = tool.get("index", 0)
                    if type(index) is not int or index != 0: raise ValueError("PROVIDER_STREAM_TOOLS_INVALID")
                    dest = self.tools.setdefault(index, {"type": "function", "function": {"name": "", "arguments": ""}})
                    if tool.get("id"): dest["id"] = tool["id"]
                    if tool.get("type") and tool["type"] != "function": raise ValueError("PROVIDER_STREAM_TOOLS_INVALID")
                    for key in ("name", "arguments"):
                        fragment = (tool.get("function") or {}).get(key, "")
                        if not isinstance(fragment, str): raise ValueError("PROVIDER_STREAM_INVALID")
                        dest["function"][key] += fragment
                    self.tool_previews.setdefault(index, Preview()).append((tool.get("function") or {}).get("arguments", ""))
                if choice.get("finish_reason") is not None: target["finish_reason"] = choice["finish_reason"]

    def finish(self):
        if self.buffer.strip(): self.feed(b"\n")
        target = self.response["choices"][0]
        if not self.done or target["finish_reason"] not in {"stop", "tool_calls"}:
            raise ValueError("PROVIDER_STREAM_INCOMPLETE")
        if self.tools:
            target["message"]["tool_calls"] = list(self.tools.values())
            if not target["message"]["content"]: target["message"]["content"] = None
        emit("checking")
        return self.response


def read_chat_stream(response, limit):
    from src.runtime_cancellation import check_cancelled
    parser = ChatStream(limit)
    while True:
        check_cancelled()
        line = response.readline(limit + 1)
        check_cancelled()
        if not line: break
        parser.feed(line)
    return parser.finish()
