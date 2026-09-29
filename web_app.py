"""Public WSGI entry: own-key execution and browser-owned persistence only.

Run with deploy/gunicorn.conf.py, behind HTTPS. app.py remains loopback-only.
The allowlist is intentional: never expose the local server's ambient features.
"""
from __future__ import annotations

import io
import json
import mimetypes
import os
import re
import threading
from email.message import Message
from http import HTTPStatus
from pathlib import Path
from urllib.parse import urlparse
from wsgiref.util import FileWrapper

import app
from src.runtime_binding import BROWSER_CREDENTIAL
from src.byok_providers import BROWSER_REFERENCES, valid_key
from src.web_execution import Sessions, WebBoundaryError
from src.web_source_read import read_source
from src.pdf_delivery import PUBLIC_PDF_LIMITS

GET_PATHS = frozenset({
    "/product-config.js",
    "/workspace-storage-contract.js", "/candidate-conversation-contract-manifest.js",
    "/job-intelligence-contract-manifest.js", "/model-settings-catalog-data.js",
    "/job-overview-contract.js", "/personal-understanding-contract.js",
    "/api/candidate-conversation-runtime-signature", "/api/job-conversation-runtime-signature",
    "/api/job-model-import-runtime-signature", "/api/conversation-attachment-capabilities",
    "/api/job-overview-signature", "/api/personal-understanding-signature",
})
MODEL_PATHS = frozenset({
    "/api/candidate-model-structure", "/api/job-model-structure",
    "/api/candidate-conversation-turn", "/api/job-conversation-turn",
    "/api/personal-understanding-turn", "/api/job-overview-turn",
})
CONTROL_PATHS = frozenset({"/api/candidate-conversation-turn/cancel", "/api/candidate-model-operation-state/delete"})
CHECK_PATH = "/api/runtime-providers/deepseek/connection-check"
CHECK_PATHS = {f"/api/runtime-providers/{provider}/connection-check": provider for provider in BROWSER_REFERENCES.values()}
POST_PATHS = MODEL_PATHS | CONTROL_PATHS | set(CHECK_PATHS) | {"/api/runtime-check", "/api/local-source-read"}
PUBLIC_SUFFIXES = {".html", ".js", ".css", ".json", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico", ".woff", ".woff2", ".ttf", ".txt", ".zip"}


class RequestHandler(app.JobRadarHandler):
    """Reuse domain routes without creating an HTTP socket or global state."""
    web_request = True
    def __init__(self, environ, body, registries):
        self.path = environ["PATH_INFO"]
        self.command = environ["REQUEST_METHOD"]
        self.headers = Message()
        self.headers["Content-Type"] = environ.get("CONTENT_TYPE", "")
        self.headers["Content-Length"] = str(len(body))
        self.headers["X-Ariadne-Provider-Key"] = environ.get("HTTP_X_ARIADNE_PROVIDER_KEY", "")
        self.headers["X-Ariadne-Provider"] = environ.get("HTTP_X_ARIADNE_PROVIDER", "deepseek")
        self.rfile, self.wfile = io.BytesIO(body), io.BytesIO()
        self._execution_registries = registries
        self.status, self.response_headers = 200, []

    def local_request_allowed(self):
        return True  # The WSGI boundary checked origin, method and route first.

    def runtime_api_key(self, reference=BROWSER_CREDENTIAL):
        if reference not in BROWSER_REFERENCES:
            return None
        return super().runtime_api_key(reference)

    def send_response(self, code, message=None):
        self.status = int(code)

    def send_header(self, name, value):
        self.response_headers.append((name, str(value)))

    def end_headers(self):
        pass

    def log_message(self, *args):
        pass

    def read_local_source_for_model(self):
        try:
            result = read_source(json.loads(self.rfile.read()))
        except (ValueError, TypeError, KeyError, UnicodeError):
            self.send_json(422, {"error": "WEB_SOURCE_PREPARATION_FAILED", "read_only": True,
                                "writeback": False, "model_call_made": False, "network_call_made": False})
            return
        self.send_json(200, result)


class WebApplication:
    def __init__(self, origins, *, public_path=app.PUBLIC_PATH, max_concurrent=2):
        self.origins = frozenset(origins)
        if not self.origins:
            raise ValueError("ARIADNE_WEB_ORIGINS_REQUIRED")
        for origin in self.origins:
            parsed = urlparse(origin)
            local = parsed.hostname in {"127.0.0.1", "localhost"} or (parsed.hostname or "").endswith(".localhost")
            if (parsed.scheme != "https" and not (local and parsed.scheme == "http")) or not parsed.netloc or parsed.path or parsed.query or parsed.fragment or parsed.username:
                raise ValueError("ARIADNE_WEB_ORIGIN_INVALID")
        self.hosts = {urlparse(origin).netloc for origin in self.origins}
        self.public = Path(public_path).resolve()
        self.sessions = Sessions()
        self.slots = threading.BoundedSemaphore(max_concurrent)

    def __call__(self, environ, start_response):
        from src.conversation_events import CONTENT_TYPE, PATHS
        if (environ.get("REQUEST_METHOD") == "POST" and environ.get("PATH_INFO") in PATHS
                and environ.get("HTTP_ACCEPT") == CONTENT_TYPE):
            return self.stream(environ, start_response)
        try:
            status, headers, content = self.dispatch(environ)
        except WebBoundaryError as error:
            status, headers, content = self.json_response(error.status, {"error": error.code, "network_call_made": False, "persistence": "not_written"})
        except Exception:
            # Never echo provider responses, user payloads, paths or credentials.
            status, headers, content = self.json_response(500, {"error": "WEB_REQUEST_FAILED", "persistence": "not_written"})
        headers.extend([
            ("Cache-Control", "no-store"), ("X-Content-Type-Options", "nosniff"),
            ("Referrer-Policy", "no-referrer"), ("X-Frame-Options", "DENY"),
            ("Content-Security-Policy", "frame-ancestors 'none'; object-src 'none'; base-uri 'self'"),
        ])
        if all(origin.startswith("https:") for origin in self.origins):
            headers.append(("Strict-Transport-Security", "max-age=31536000"))
        start_response(f"{status} {HTTPStatus(status).phrase}", headers)
        if environ.get("REQUEST_METHOD") == "HEAD":
            if hasattr(content, "close"):
                content.close()
            return []
        return content

    def stream(self, environ, start_response):
        """WSGI event channel; normal dispatch still owns every access check."""
        import queue
        from src.runtime_cancellation import CANCEL, Cancellation
        from contextvars import copy_context
        from src.conversation_events import CONTENT_TYPE, SINK, encode
        events, closed = queue.Queue(maxsize=64), threading.Event()
        cancellation = Cancellation()
        sequence = 0
        def send(event):
            nonlocal sequence
            if closed.is_set(): raise ConnectionAbortedError()
            sequence += 1
            try:
                events.put(encode({**event, "seq": sequence}), timeout=5)
            except queue.Full:
                raise ConnectionAbortedError() from None
        def run():
            token = SINK.set(send)
            cancel_token = CANCEL.set(cancellation)
            try:
                send({"type": "received"})
                try:
                    status, _, body = self.dispatch(environ)
                    result = json.loads(b"".join(body))
                except WebBoundaryError as error:
                    status, result = error.status, {"error": error.code, "persistence": "not_written"}
                except Exception:
                    status, result = 500, {"error": "WEB_REQUEST_FAILED", "persistence": "not_written"}
                send({"type": "result", "status": status, "result": result})
            except (ConnectionAbortedError, BrokenPipeError):
                pass
            finally:
                SINK.reset(token)
                CANCEL.reset(cancel_token)
        def body():
            start_response("200 OK", [("Content-Type", CONTENT_TYPE), ("Cache-Control", "no-store"),
                           ("X-Content-Type-Options", "nosniff"), ("X-Accel-Buffering", "no")])
            context = copy_context()
            threading.Thread(target=lambda: context.run(run), daemon=True).start()
            try:
                while True:
                    try:
                        chunk = events.get(timeout=15)
                    except queue.Empty:
                        # Transport keepalive, never displayed as invented progress.
                        yield b"\n"
                        continue
                    yield chunk
                    if json.loads(chunk)["type"] == "result": break
            finally:
                closed.set()
                cancellation.cancel()
        return body()

    @staticmethod
    def json_response(status, value):
        body = json.dumps(value, ensure_ascii=False).encode()
        return status, [("Content-Type", "application/json; charset=utf-8"), ("Content-Length", str(len(body)))], [body]

    def dispatch(self, env):
        path, method = env.get("PATH_INFO", "/"), env.get("REQUEST_METHOD", "GET")
        if env.get("HTTP_HOST") not in self.hosts:
            raise WebBoundaryError("WEB_HOST_DENIED", 403)
        if method not in {"GET", "HEAD", "POST"}:
            raise WebBoundaryError("WEB_METHOD_DENIED", 405)
        if env.get("HTTP_SEC_FETCH_SITE") == "cross-site" and path.startswith("/api/"):
            raise WebBoundaryError("WEB_ORIGIN_DENIED", 403)
        origin = env.get("HTTP_ORIGIN")
        if origin is not None and origin not in self.origins:
            raise WebBoundaryError("WEB_ORIGIN_DENIED", 403)
        if origin and urlparse(origin).netloc != env.get("HTTP_HOST"):
            raise WebBoundaryError("WEB_ORIGIN_DENIED", 403)
        if path.startswith("/api/") and env.get("QUERY_STRING"):
            raise WebBoundaryError("WEB_QUERY_DENIED", 400)
        if method in {"GET", "HEAD"}:
            if path == "/healthz":
                return self.json_response(200, {"ok": True, "mode": "web"})
            if path == "/api/web-runtime":
                return self.json_response(200, {"mode": "web", "byok": list(BROWSER_REFERENCES.values()), "storage": "browser", "network_call_made": False})
            if path == "/api/runtime-options":
                return self.json_response(200, {"models": [], "local_preference": None, "network_call_made": False, "career_data_sent": False})
            if path == "/api/model-updates":
                return self.json_response(200, {"ok": True, "models": [], "network_call_made": False})
            if path in GET_PATHS:
                handler = RequestHandler(env, b"", {})
                handler.do_GET()
                return handler.status, handler.response_headers, [handler.wfile.getvalue()]
            if path.startswith("/api/"):
                raise WebBoundaryError("WEB_ROUTE_DENIED", 404)
            return self.static(path)
        if path not in POST_PATHS:
            raise WebBoundaryError("WEB_ROUTE_DENIED", 404)
        if not origin or origin not in self.origins:
            raise WebBoundaryError("WEB_ORIGIN_REQUIRED", 403)
        if env.get("CONTENT_TYPE", "").split(";", 1)[0].strip().lower() != "application/json":
            raise WebBoundaryError("WEB_JSON_REQUIRED", 415)
        try:
            size = int(env.get("CONTENT_LENGTH", "0"))
        except ValueError:
            raise WebBoundaryError("WEB_REQUEST_SIZE_INVALID", 400)
        # Public service budget: roughly 30 MB original material per request,
        # including a multi-file batch. Local mode keeps its existing limits.
        limit = 4000 if path in CONTROL_PATHS | set(CHECK_PATHS) | {"/api/runtime-check"} else app.MAX_FILE_REQUEST_BYTES
        if not 0 < size <= limit:
            raise WebBoundaryError("WEB_REQUEST_SIZE_INVALID", 413)
        session = env.get("HTTP_X_ARIADNE_WEB_SESSION", "")
        if not re.fullmatch(r"[a-f0-9]{64}", session):
            raise WebBoundaryError("WEB_SESSION_REQUIRED", 400)
        expensive = path not in CONTROL_PATHS
        if expensive and not self.slots.acquire(blocking=False):
            raise WebBoundaryError("WEB_SERVICE_BUSY", 503)
        try:
            body = env["wsgi.input"].read(size)
            if len(body) != size:
                raise WebBoundaryError("WEB_REQUEST_INCOMPLETE", 400)
            try:
                payload = json.loads(body)
            except (ValueError, UnicodeError):
                raise WebBoundaryError("WEB_JSON_INVALID", 400)
            if not isinstance(payload, dict):
                raise WebBoundaryError("WEB_JSON_INVALID", 400)
            key = payload.get("api_key") if path in CHECK_PATHS else env.get("HTTP_X_ARIADNE_PROVIDER_KEY")
            if not valid_key(key):
                raise WebBoundaryError("WEB_OWN_API_KEY_REQUIRED", 428)
            provider = CHECK_PATHS.get(path, env.get("HTTP_X_ARIADNE_PROVIDER", "deepseek"))
            if provider not in BROWSER_REFERENCES.values():
                raise WebBoundaryError("WEB_RUNTIME_NOT_ALLOWED", 422)
            if path in MODEL_PATHS | {"/api/local-source-read"}:
                snapshot = payload.get("runtime_snapshot")
                if not isinstance(snapshot, dict) or snapshot.get("provider") != provider or snapshot.get("credential_ref") != f"browser-key://{provider}/request":
                    raise WebBoundaryError("WEB_RUNTIME_NOT_ALLOWED", 422)
            with self.sessions.acquire(session, key, provider=provider, control=path in CONTROL_PATHS) as state:
                state.bind_request(path, payload)
                handler = RequestHandler(env, body, state.registries)
                token = PUBLIC_PDF_LIMITS.set(True)
                try:
                    handler.do_POST()
                finally:
                    PUBLIC_PDF_LIMITS.reset(token)
                return handler.status, handler.response_headers, [handler.wfile.getvalue()]
        finally:
            if expensive:
                self.slots.release()

    def static(self, path):
        parts = path.split("/")
        if any(part.startswith(".") for part in parts if part) or "\\" in path or "\0" in path:
            raise WebBoundaryError("WEB_NOT_FOUND", 404)
        target = (self.public / ("index.html" if path == "/" else path.lstrip("/"))).resolve()
        if not target.is_relative_to(self.public) or not target.is_file() or target.suffix.lower() not in PUBLIC_SUFFIXES:
            raise WebBoundaryError("WEB_NOT_FOUND", 404)
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        return 200, [("Content-Type", content_type), ("Content-Length", str(target.stat().st_size))], FileWrapper(target.open("rb"), 65536)


def create_app():
    origins = [value.strip().rstrip("/") for value in os.environ.get("ARIADNE_WEB_ORIGINS", "").split(",") if value.strip()]
    return WebApplication(origins)
