"""Actual stream parsers and both HTTP boundaries; synthetic inputs, zero AI calls."""
import io
import json
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch
from http.server import ThreadingHTTPServer
import http.client
import copy
import os
import subprocess

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.conversation_events import ChatStream, CONTENT_TYPE, SINK, emit, public_preview, Preview
import app
from web_app import WebApplication


def sse(value):
    return b"data: " + json.dumps(value, ensure_ascii=False).encode() + b"\n\n"


class EventsTests(unittest.TestCase):
    def test_small_answer_deltas_are_not_buffered(self):
        seen = []; token = SINK.set(seen.append)
        try:
            preview = Preview()
            for text in ['你', '你好', '你好。', '你好。']:
                preview.update('{"message":"' + text)
            self.assertEqual(seen, [{'type': 'preview', 'text': '你'}, {'type': 'preview_delta', 'text': '好'}, {'type': 'preview_delta', 'text': '。'}])
            for i in range(1, 6001):
                preview.update('{"message":"' + '字' * i)
            self.assertLess(len(json.dumps(seen).encode()), 1_000_000, 'long per-character streams must remain bounded')
        finally: SINK.reset(token)

    def test_web_domain_stream_success_and_invalid_action(self):
        node = os.environ.get("ARIADNE_NODE_BINARY", "node")
        request = json.loads(subprocess.check_output([node, str(Path(__file__).with_name("personal_understanding_regression.mjs")), "--request"], text=True))
        request["runtime_snapshot"]["credential_ref"] = "browser-key://deepseek/request"
        for invalid in (False, True):
            current = copy.deepcopy(request)
            output = {"message": "公开答复预览，不是已确认资料。", "proposals": [], "card_proposals": [], "deliverable": None}
            if invalid: output["card_proposals"] = [{"unexpected": "invalid"}]
            arguments = json.dumps(output, ensure_ascii=False)
            first, rest = arguments[:20], arguments[20:]
            wire = b"".join([
                sse({"model": request["runtime_snapshot"]["model"], "choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"name": "deliver_personal_understanding", "arguments": first}}]}}]}),
                sse({"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"arguments": rest}}]}, "finish_reason": "tool_calls"}]}), b"data: [DONE]\n\n"])
            calls = []
            def provider_open(outbound, **_):
                sent = json.loads(outbound.data)
                self.assertTrue(sent["stream"])
                self.assertEqual(sent["model"], request["runtime_snapshot"]["model"])
                calls.append(True)
                response = io.BytesIO(wire); response.status = 200
                return response
            raw = json.dumps(current).encode()
            env = {"REQUEST_METHOD": "POST", "PATH_INFO": "/api/personal-understanding-turn", "HTTP_ACCEPT": CONTENT_TYPE,
                   "HTTP_HOST": "ariadne.example", "HTTP_ORIGIN": "https://ariadne.example", "CONTENT_TYPE": "application/json",
                   "CONTENT_LENGTH": str(len(raw)), "HTTP_X_ARIADNE_WEB_SESSION": "a" * 64,
                   "HTTP_X_ARIADNE_PROVIDER_KEY": "synthetic-own-key-for-test", "wsgi.input": io.BytesIO(raw)}
            web = WebApplication(["https://ariadne.example"])
            with patch.object(app, "provider_urlopen", provider_open):
                events = [json.loads(line) for line in web(env, lambda *_: None) if line.strip()]
            self.assertEqual(calls, [True])
            self.assertTrue(any(event["type"] == "preview" for event in events))
            self.assertEqual(events[-1]["status"], 422 if invalid else 200)
            self.assertEqual(events[-1]["result"]["persistence"], "not_written")
            if not invalid: self.assertEqual(events[-1]["result"]["output"]["message"], output["message"])

    def test_public_only_and_incomplete_unicode(self):
        self.assertEqual(public_preview('{"message":"正在核对资料'), "正在核对资料")
        self.assertEqual(public_preview('{"semantic_action":{"message":"初步结论'), "初步结论")
        self.assertEqual(public_preview('{"patches":[{"message":"PRIVATE"}],"reasoning":"SECRET"}'), "")
        self.assertEqual(public_preview('{"message":"引号\\\"和换行\\n测试\\u4e2d'), '引号"和换行\n测试中')
        self.assertEqual(public_preview('{"summary":"中文\\'), "中文")
        self.assertEqual(public_preview('{"source":"\\\"message\\\":\\\"SECRET\\\""}'), "")

    def test_sse_byte_boundaries_and_preview_before_end(self):
        events = []
        token = SINK.set(events.append)
        try:
            parser = ChatStream(10000)
            first = sse({"model": "selected-model", "choices": [{"index": 0, "delta": {"reasoning_content": "HIDDEN", "tool_calls": [{"index": 0, "id": "f1", "type": "function", "function": {"name": "deliver", "arguments": '{"message":"依据当前资料'}}]}}]})
            for byte in first: parser.feed(bytes([byte]))
            self.assertEqual(events, [{"type": "preview", "text": "依据当前资料"}])
            parser.feed(sse({"choices": [{"index": 0, "delta": {"tool_calls": [{"index": 0, "function": {"arguments": '，尚缺证据。"}'}}]}, "finish_reason": "tool_calls"}]}))
            parser.feed(sse({"choices": [], "usage": {"total_tokens": 42}}))
            parser.feed(b"data: [DONE]\n\n")
            result = parser.finish()
            self.assertEqual(result["usage"]["total_tokens"], 42)
            self.assertEqual(json.loads(result["choices"][0]["message"]["tool_calls"][0]["function"]["arguments"])["message"], "依据当前资料，尚缺证据。")
            self.assertNotIn("HIDDEN", json.dumps(events))
            self.assertEqual(events[-1]["type"], "checking")
        finally:
            SINK.reset(token)

    def test_incomplete_error_limit_and_multiple_tool_refused(self):
        for wire in [sse({"choices": []}), sse({"error": {"message": "secret"}}),
                     sse({"choices": [{"delta": {"tool_calls": [{"index": 1}]}}]})]:
            with self.assertRaises(ValueError):
                parser = ChatStream(1000); parser.feed(wire); parser.finish()
        with self.assertRaises(ValueError): ChatStream(2).feed(b"too big")

    def test_wsgi_first_content_before_terminal_and_isolation(self):
        web = WebApplication(["http://127.0.0.1"])
        proceed, entered = threading.Event(), threading.Event()
        def dispatch(env):
            emit("preview", text="合成公开反馈")
            entered.set()
            self.assertTrue(proceed.wait(3))
            return web.json_response(422, {"error": "SYNTHETIC_VALIDATION_FAILED"})
        headers = []
        env = {"REQUEST_METHOD": "POST", "PATH_INFO": "/api/job-conversation-turn", "HTTP_ACCEPT": CONTENT_TYPE}
        with patch.object(web, "dispatch", dispatch):
            body = iter(web(env, lambda status, values: headers.append((status, dict(values)))))
            self.assertEqual(json.loads(next(body))["type"], "received")
            self.assertEqual(json.loads(next(body))["text"], "合成公开反馈")
            self.assertTrue(entered.is_set())
            self.assertIsNone(SINK.get())
            proceed.set()
            terminal = json.loads(next(body))
            self.assertEqual(terminal["status"], 422)
            self.assertEqual(list(body), [])
            self.assertEqual(headers[0][1]["Content-Type"], CONTENT_TYPE)

    def test_local_disconnect_cancels_silent_work_without_new_public_events(self):
        import socket
        import time
        from src.runtime_cancellation import check_cancelled, ExecutionCancelled
        entered, cancelled = threading.Event(), threading.Event()
        class Handler(app.JobRadarHandler):
            def _do_POST(self):
                self.rfile.read(int(self.headers.get("Content-Length", "0")))
                entered.set()
                deadline = time.monotonic() + 3
                try:
                    while time.monotonic() < deadline:
                        check_cancelled()
                        time.sleep(0.02)
                except ExecutionCancelled:
                    cancelled.set()
                    raise
            def log_message(self, *_): pass
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=4)
        try:
            connection.request("POST", "/api/job-conversation-turn", "{}", {"Accept": CONTENT_TYPE, "Content-Type": "application/json"})
            response = connection.getresponse()
            self.assertEqual(json.loads(response.readline())["type"], "received")
            self.assertTrue(entered.wait(2))
            response.fp.raw._sock.shutdown(socket.SHUT_RDWR)
            response.close(); connection.close()
            self.assertTrue(cancelled.wait(2), "silent model work must observe a disconnected request")
        finally:
            connection.close(); server.shutdown(); server.server_close()

    def test_skill_nonstream_import_disconnect_reaches_request_cancellation(self):
        import socket
        import time
        from src.runtime_cancellation import check_cancelled, ExecutionCancelled
        from src.product_application import skill_handler
        from src.runtime_binding import CODEX_MODEL
        entered, cancelled = threading.Event(), threading.Event()
        class Base(app.JobRadarHandler):
            def do_POST(self):
                self.rfile.read(int(self.headers.get("Content-Length", "0")))
                entered.set()
                try:
                    deadline = time.monotonic() + 3
                    while time.monotonic() < deadline:
                        check_cancelled(); time.sleep(0.02)
                except ExecutionCancelled:
                    cancelled.set(); raise
            def log_message(self, *_): pass
        server = ThreadingHTTPServer(("127.0.0.1",0),skill_handler(Base))
        threading.Thread(target=server.serve_forever,daemon=True).start()
        connection = http.client.HTTPConnection("127.0.0.1",server.server_port,timeout=4)
        try:
            with patch('src.product_application.codex_enabled',return_value=True):
                body = json.dumps({"runtime_snapshot":{"provider":"codex","model":CODEX_MODEL}})
                connection.request("POST","/api/candidate-model-structure",body,{"Content-Type":"application/json"})
                self.assertTrue(entered.wait(2))
                connection.sock.shutdown(socket.SHUT_RDWR); connection.close()
                self.assertTrue(cancelled.wait(2))
        finally:
            connection.close(); server.shutdown(); server.server_close()

    def test_local_socket_flushes_before_completion(self):
        proceed = threading.Event()
        class Handler(app.JobRadarHandler):
            def _do_POST(self):
                emit("update", text="合成阶段反馈")
                proceed.wait(3)
                self.send_json(200, {"synthetic": True})
            def log_message(self, *_): pass
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=4)
        try:
            connection.request("POST", "/api/job-conversation-turn", "{}", {"Accept": CONTENT_TYPE, "Content-Type": "application/json"})
            response = connection.getresponse()
            self.assertEqual(json.loads(response.readline())["seq"], 1)
            self.assertEqual(json.loads(response.readline())["text"], "合成阶段反馈")
            proceed.set()
            self.assertTrue(json.loads(response.readline())["result"]["synthetic"])
        finally:
            proceed.set(); connection.close(); server.shutdown(); server.server_close()


if __name__ == "__main__": unittest.main()
