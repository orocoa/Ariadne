"""One ephemeral, bounded App Server turn; only public answer deltas leave it.

No shared daemon/thread, config writes, auth-file reads or automatic retries.
The CLI owns login. App Server has no ignore-user-config flag: explicit in-memory
overrides and effective-policy checks replace that exec-only mechanism.
"""
import json
import os
from pathlib import Path
import select
import signal
import subprocess
import time

from src.conversation_events import Preview, emit
from src.codex_account import environment


class Channel:
    def __init__(self, process, timeout, maximum=8_000_000):
        self.process, self.deadline, self.maximum = process, time.monotonic() + timeout, maximum
        self.buffer, self.size, self.counter = b"", 0, 0
        self.pending = []

    def send(self, value):
        self.process.stdin.write((json.dumps(value, ensure_ascii=True) + "\n").encode())
        self.process.stdin.flush()

    def read(self):
        while b"\n" not in self.buffer:
            remaining = self.deadline - time.monotonic()
            if remaining <= 0: raise TimeoutError("CODEX_TIMEOUT")
            if not select.select([self.process.stdout], [], [], min(remaining, 1))[0]: continue
            chunk = os.read(self.process.stdout.fileno(), 65536)
            if not chunk: raise ValueError("CODEX_STREAM_INCOMPLETE")
            self.size += len(chunk)
            if self.size > self.maximum: raise ValueError("CODEX_OUTPUT_LIMIT")
            self.buffer += chunk
        line, self.buffer = self.buffer.split(b"\n", 1)
        event = json.loads(line)
        if not isinstance(event, dict): raise ValueError("CODEX_EVENT_INVALID")
        if "method" in event and "id" in event:
            self.send({"id": event["id"], "error": {"code": -32601, "message": "Ariadne does not grant interactive permissions or tools"}})
            raise ValueError("CODEX_UNEXPECTED_TOOL_REQUEST")
        return event

    def request(self, method, params):
        self.counter += 1
        self.send({"id": self.counter, "method": method, "params": params})
        while True:
            event = self.read()
            if event.get("id") == self.counter:
                if "error" in event: raise ValueError("CODEX_APP_SERVER_REQUEST_FAILED")
                return event["result"]
            if "method" in event: self.pending.append(event)
            if len(self.pending) > 200: raise ValueError("CODEX_EVENT_LIMIT")


def overrides(directory, effort, search, disabled_features):
    values = {
        "model_reasoning_effort": effort, "web_search": "live" if search else "disabled",
        "tools.view_image": False, "project_doc_max_bytes": 0,
        "instructions": "", "developer_instructions": "", "notify": [],
        "model_instructions_file": str(directory / "engine-instructions.txt"),
        "include_apps_instructions": False, "include_environment_context": False,
        "skills.include_instructions": False, "analytics.enabled": False,
        "otel.log_user_prompt": False, "otel.exporter": "none", "otel.trace_exporter": "none",
        "include_collaboration_mode_instructions": False,
        "agents.enabled": False, "history.persistence": "none",
        "log_dir": str(directory / "logs"), "sqlite_home": str(directory / "state"),
        "model_provider": "ariadne-openai",
        "model_providers.ariadne-openai": {"name": "OpenAI", "requires_openai_auth": True, "supports_websockets": False},
    }
    values.update({f"features.{feature}": bool(search and feature in ("code_mode", "code_mode_host")) for feature in disabled_features})
    return values


def cli_value(value):
    # The CLI accepts TOML, not JSON inline objects.
    if isinstance(value, dict): return "{" + ",".join(json.dumps(k) + "=" + cli_value(v) for k, v in value.items()) + "}"
    return json.dumps(value, ensure_ascii=True)


def check_policy(result, model, directory, effort):
    if (result.get("model") != model or result.get("modelProvider") != "ariadne-openai"
            or result.get("cwd") != str(directory) or result.get("approvalPolicy") != "never"
            or result.get("sandbox", {}).get("type") != "readOnly"
            or result.get("instructionSources") or result.get("thread", {}).get("ephemeral") is not True
            or result.get("reasoningEffort") != effort):
        raise ValueError("CODEX_ISOLATION_NOT_CONFIRMED")


class PublicEvents:
    def __init__(self, thread, turn, search, limit):
        self.thread, self.turn, self.search, self.limit = thread, turn, search, limit
        self.items, self.messages, self.previews = {}, {}, {}
        self.final, self.usage, self.completed = None, {}, False
        self.searches = set()
        self.legacy = [{"type": "thread.started", "thread_id": thread}]

    def accept(self, event):
        method, p = event.get("method"), event.get("params") or {}
        if not isinstance(p, dict): raise ValueError("CODEX_EVENT_INVALID")
        if method in {"item/agentMessage/delta", "item/started", "item/completed", "turn/completed"}:
            if p.get("threadId") != self.thread: raise ValueError("CODEX_THREAD_MISMATCH")
            if method != "turn/completed" and p.get("turnId") != self.turn: raise ValueError("CODEX_TURN_MISMATCH")
        if p.get("threadId") not in (None, self.thread): raise ValueError("CODEX_THREAD_MISMATCH")
        if p.get("turnId") not in (None, self.turn): raise ValueError("CODEX_TURN_MISMATCH")
        if method == "item/agentMessage/delta":
            ident, delta = p.get("itemId"), p.get("delta")
            if not isinstance(ident, str) or not isinstance(delta, str): raise ValueError("CODEX_DELTA_INVALID")
            if self.items.get(ident, {}).get("type") != "agentMessage": raise ValueError("CODEX_DELTA_WITHOUT_ITEM")
            value = self.messages.get(ident, "") + delta
            if len(value) > 160000: raise ValueError("CODEX_OUTPUT_LIMIT")
            self.messages[ident] = value
            if self.items[ident].get("phase") != "commentary" or value.lstrip().startswith("{"):
                self.previews.setdefault(ident, Preview()).update(value)
            elif value.strip():
                # Public commentary, never reasoning/summaryTextDelta.
                emit("commentary", id=ident, text=value[:6000])
        elif method in {"item/started", "item/completed"}:
            item = p.get("item", {})
            if not isinstance(item, dict): raise ValueError("CODEX_ITEM_INVALID")
            kind, ident = item.get("type"), item.get("id")
            if not isinstance(ident, str) or not ident or len(ident) > 200: raise ValueError("CODEX_ITEM_INVALID")
            if kind not in {"userMessage", "agentMessage", "reasoning", "webSearch"}:
                raise ValueError("CODEX_UNEXPECTED_TOOL_ACTIVITY")
            self.items[ident] = item
            if kind == "reasoning":
                # Expose lifecycle only, never summaries, deltas, or private reasoning.
                emit("activity", id=ident, activity="thinking", state="completed" if method.endswith("completed") else "started")
            if kind == "webSearch":
                if not self.search: raise ValueError("CODEX_UNEXPECTED_TOOL_ACTIVITY")
                self.searches.add(ident)
                if len(self.searches) > self.limit: raise ValueError("CODEX_SEARCH_LIMIT")
                action = dict(item.get("action") or {})
                action["type"] = {"openPage": "open_page", "findInPage": "find_in_page"}.get(action.get("type"), action.get("type", "other"))
                self.legacy.append({"type": "item.completed" if method.endswith("completed") else "item.started", "item": {"id": ident, "type": "web_search", "action": action}})
                activity = {"open_page": "reading", "find_in_page": "finding"}.get(action["type"], "search")
                emit("activity", id=ident, activity=activity, state="completed" if method.endswith("completed") else "started")
            if kind == "agentMessage" and method == "item/completed":
                text = item.get("text", "")
                if not isinstance(text, str): raise ValueError("CODEX_MESSAGE_INVALID")
                if item.get("phase") == "final_answer" or text.lstrip().startswith("{"):
                    self.final = text
                    self.previews.setdefault(ident, Preview()).update(text)
                elif item.get("phase") == "commentary" and text.strip(): emit("commentary", id=ident, text=text[:6000])
        elif method == "thread/tokenUsage/updated":
            total = p.get("tokenUsage", {}).get("last", {})
            self.usage = {"input_tokens": total.get("inputTokens", 0), "output_tokens": total.get("outputTokens", 0)}
        elif method == "turn/completed":
            turn = p.get("turn", {})
            if turn.get("id") != self.turn or turn.get("status") != "completed" or turn.get("error"):
                raise ValueError("CODEX_TURN_FAILED")
            if not self.final: raise ValueError("CODEX_STREAM_INCOMPLETE")
            self.completed = True
        elif method == "error": raise ValueError("CODEX_TURN_FAILED")

    def result_events(self):
        if not self.completed: raise ValueError("CODEX_STREAM_INCOMPLETE")
        events = self.legacy + [{"type": "item.completed", "item": {"type": "agent_message", "text": self.final}}, {"type": "turn.completed", "usage": self.usage}]
        return b"\n".join(json.dumps(e, ensure_ascii=True).encode() for e in events)


def execute(directory, prompt, images, schema, payload, timeout, runtime):
    search = runtime.Search.enabled(payload)
    effort = payload["reasoning_effort"]
    # A fixed instruction file prevents inherited model instruction-file content.
    base = "You are Ariadne's bounded semantic engine. Use only the supplied context and permitted public search. No shell, files, apps, MCP, skills, memory, or record writes. Return the required JSON as final output."
    (directory / "engine-instructions.txt").write_text(base)
    settings = overrides(directory, effort, search, runtime.DISABLED_FEATURES)
    args = [runtime.codex_binary(), "app-server", "--stdio"]
    for key, value in settings.items(): args.extend(["-c", f"{key}={cli_value(value)}"])
    process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                               cwd=directory, env=environment(), start_new_session=True)
    channel = Channel(process, timeout)
    try:
        channel.request("initialize", {"clientInfo": {"name": "ariadne", "version": "2"}, "capabilities": {"experimentalApi": True}})
        channel.send({"method": "initialized"})
        config = channel.request("config/read", {"includeLayers": False})["config"]
        if any(config.get("features", {}).get(k) != settings[f"features.{k}"] for k in runtime.DISABLED_FEATURES):
            raise ValueError("CODEX_ISOLATION_NOT_CONFIRMED")
        # Discovery is local metadata only. Disable every inherited server/skill
        # in this thread's in-memory config, before a model turn can start.
        settings.update({f'mcp_servers.{json.dumps(name)}.enabled': False for name in config.get("mcp_servers", {})})
        skills = channel.request("skills/list", {"cwds": [str(directory)], "forceReload": True})
        settings["skills.config"] = [{"path": item["path"], "enabled": False} for group in skills.get("data", []) for item in group.get("skills", [])]
        started = channel.request("thread/start", {"model": payload["model"], "modelProvider": "ariadne-openai",
            "cwd": str(directory), "runtimeWorkspaceRoots": [str(directory)], "approvalPolicy": "never", "sandbox": "read-only",
            "ephemeral": True, "allowProviderModelFallback": False, "baseInstructions": base,
            "developerInstructions": "", "config": settings, "dynamicTools": [], "environments": [], "selectedCapabilityRoots": []})
        check_policy(started, payload["model"], directory, effort)
        servers = channel.request("mcpServerStatus/list", {"limit": 100})
        if servers.get("data") or servers.get("nextCursor"):
            raise ValueError("CODEX_MCP_ISOLATION_NOT_CONFIRMED")
        thread = started["thread"]["id"]
        inputs = [{"type": "text", "text": prompt}] + [{"type": "localImage", "path": str(path)} for path in images]
        params = {"threadId": thread, "input": inputs, "model": payload["model"], "effort": effort,
                  "approvalPolicy": "never", "sandboxPolicy": {"type": "readOnly"}}
        if schema: params["outputSchema"] = json.loads(schema.read_text())
        emit("model_started")  # Isolation has passed; the next request starts the model.
        turn = channel.request("turn/start", params)["turn"]["id"]
        events = PublicEvents(thread, turn, search, runtime.Search.MAX_CALLS)
        for event in channel.pending: events.accept(event)
        while not events.completed: events.accept(channel.read())
        emit("checking")
        output_schema = payload["tools"][0]["function"]["parameters"] if schema else None
        name = payload["tools"][0]["function"]["name"] if schema else None
        return 200, runtime.parse_events(events.result_events(), name, output_schema, allow_search=search, model=payload["model"])
    except TimeoutError:
        raise runtime.CodexTimeoutError(timeout, len(images)) from None
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try: process.wait(timeout=3)
            except subprocess.TimeoutExpired: os.killpg(process.pid, signal.SIGKILL); process.wait()
        process.stdin.close(); process.stdout.close()
