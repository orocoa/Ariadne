"""Python Workers entry; Pages forwards /api/* using a service binding.

One Durable Object owns each origin/session/provider/key namespace. Only hashed
inference receipts are durable; keys, uploads and model answers remain transient.
Existing WSGI/domain code owns request validation and human-save boundaries.
"""
import os
os.environ["ARIADNE_CODEX_ENABLED"] = "0"

import hashlib
import io
import json
import logging
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse

from workers import WorkerEntrypoint, DurableObject, Response, wsgi
from pyodide.ffi import run_sync, to_js, create_proxy
import js

import app
from web_app import WebApplication, CHECK_PATHS, POST_PATHS, CONTROL_PATHS
from src.byok_providers import valid_key, PROVIDERS
from src.runtime_transport import PROVIDER_HTTP_OPEN
from src.pdf_delivery import PDF_RENDERER
from src.browser_pdf_delivery import BrowserPDFDelivery
from src.web_execution import WebBoundaryError
from src.conversation_events import CONTENT_TYPE, PATHS as TURN_PATHS, SINK, encode
from src.runtime_cancellation import CANCEL, Cancellation, ExecutionCancelled, check_cancelled

MAX_REQUEST = 12 * 1024 * 1024
ENDPOINTS = {app.DEEPSEEK_ENDPOINT, app.DEEPSEEK_MODELS_ENDPOINT, *(item["endpoint"] for item in PROVIDERS.values())}
logging.getLogger("pypdf").setLevel(logging.CRITICAL)


def error(code, status=400, network=False):
    return Response.json({"error": code, "network_call_made": network, "persistence": "not_written"},
                         status=status, headers={"Cache-Control": "no-store"})


def origins(env):
    return [value.strip().rstrip("/") for value in env.ARIADNE_WEB_ORIGINS.split(",") if value.strip()]


def allowed(request, env):
    url = urlparse(request.url)
    origin = f"{url.scheme}://{url.netloc}"
    return (origin in origins(env) and not url.query and not url.username
            and request.headers.get("Origin", origin) == origin
            and request.headers.get("Sec-Fetch-Site") != "cross-site")


async def read_body(request):
    chunks, size = [], 0
    if request.body:
        async for chunk in request.body:
            raw = chunk.to_bytes()
            size += len(raw)
            if size > MAX_REQUEST:
                raise ValueError("WEB_REQUEST_SIZE_INVALID")
            chunks.append(raw)
    return b"".join(chunks)


def namespace(request, body):
    path = urlparse(request.url).path
    provider = CHECK_PATHS.get(path, request.headers.get("X-Ariadne-Provider", "deepseek"))
    session = request.headers.get("X-Ariadne-Web-Session", "")
    if not re.fullmatch(r"[a-f0-9]{64}", session) or provider not in {"deepseek", "gemini", "qwen"}:
        raise ValueError("WEB_SESSION_REQUIRED")
    payload = json.loads(body)
    if not isinstance(payload, dict):
        raise ValueError("WEB_JSON_INVALID")
    key = payload.get("api_key") if path in CHECK_PATHS else request.headers.get("X-Ariadne-Provider-Key")
    if not valid_key(key):
        raise ValueError("WEB_OWN_API_KEY_REQUIRED")
    origin = request.headers.get("Origin", "")
    return hashlib.sha256((origin + "\0" + session + "\0" + provider + "\0" + key).encode()).hexdigest()


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        if not allowed(request, self.env):
            return error("WEB_ORIGIN_DENIED", 403)
        path = urlparse(request.url).path
        if request.method in {"GET", "HEAD"}:
            if path == "/api/web-runtime":
                return Response.json({"mode": "web", "byok": ["deepseek", "gemini", "qwen"], "storage": "browser",
                    "preview": True, "pdf_preparation": "browser_pdfjs_complete_pages_v1", "request_limit": MAX_REQUEST,
                    "network_call_made": False}, headers={"Cache-Control": "no-store"})
            return await wsgi.fetch(WebApplication(origins(self.env)), request, self.env)
        if request.method != "POST" or path not in POST_PATHS:
            return error("WEB_ROUTE_DENIED", 404)
        if request.headers.get("Origin") not in origins(self.env):
            return error("WEB_ORIGIN_REQUIRED", 403)
        if request.headers.get("Content-Type", "").split(";", 1)[0].lower() != "application/json":
            return error("WEB_JSON_REQUIRED", 415)
        try:
            body = await read_body(request)
            name = namespace(request, body)
        except (ValueError, TypeError, UnicodeError):
            return error("WEB_REQUEST_OR_CREDENTIAL_INVALID", 400)
        forwarding = {"method": "POST", "headers": dict(request.headers.items()), "body": body}
        incoming_signal = getattr(getattr(request, "js_object", request), "signal", None)
        if incoming_signal is not None:
            forwarding["signal"] = incoming_signal
        forwarded = js.Request.new(request.url, to_js(forwarding, dict_converter=js.Object.fromEntries))
        stub = self.env.EXECUTIONS.get(self.env.EXECUTIONS.idFromName(name))
        return await stub.fetch(forwarded)


class ProviderResponse(io.BytesIO):
    def __init__(self, data, status):
        super().__init__(data)
        self.status = status


class StreamingProviderResponse:
    """Pull SSE lines without buffering the whole Provider answer in Workers."""
    def __init__(self, response, release_cancellation=lambda: None):
        self.status = response.status
        self.reader, self.buffer, self.done, self.size = response.body.getReader(), b"", False, 0
        self.release_cancellation = release_cancellation

    def __enter__(self): return self

    def __exit__(self, *_):
        try:
            if not self.done: run_sync(self.reader.cancel())
        finally:
            try: self.reader.releaseLock()
            finally: self.release_cancellation()

    def readline(self, limit=8_000_001):
        check_cancelled()
        while b"\n" not in self.buffer and len(self.buffer) < limit and not self.done:
            part = run_sync(self.reader.read())
            check_cancelled()
            self.done = bool(part.done)
            if not self.done:
                chunk = part.value.to_bytes()
                self.size += len(chunk)
                if self.size > 8_000_000: raise ValueError("PROVIDER_RESPONSE_TOO_LARGE")
                self.buffer += chunk
        if self.buffer.find(b"\n") >= limit or (b"\n" not in self.buffer and len(self.buffer) >= limit):
            line, self.buffer = self.buffer[:limit], self.buffer[limit:]
            return line
        if b"\n" in self.buffer:
            line, self.buffer = self.buffer.split(b"\n", 1)
            return line + b"\n"
        tail, self.buffer = self.buffer, b""
        return tail


class ExecutionSession(DurableObject):
    def __init__(self, ctx, env):
        self.ctx, self.env = ctx, env
        self.application = WebApplication(origins(env))
        self.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS receipts (identity TEXT PRIMARY KEY, fingerprint TEXT NOT NULL)")
        self.active = 0

    async def fetch(self, request):
        if (request.headers.get("Accept") == CONTENT_TYPE and urlparse(request.url).path in TURN_PATHS
                and allowed(request, self.env)):
            # WSGI remains the domain/access boundary; the outer stream prevents
            # its buffered final JSON response from holding up public feedback.
            headers = {key: value for key, value in request.headers.items() if key.lower() != "accept"}
            headers["Accept"] = "application/json"
            forwarded = js.Request.new(getattr(request, "js_object", request), to_js({"headers": headers}, dict_converter=js.Object.fromEntries))
            cancelled = False
            cancellation = Cancellation()
            proxies = []
            async def start(controller):
                sequence = 0
                def send(event):
                    nonlocal sequence
                    if cancelled: raise ConnectionAbortedError()
                    sequence += 1
                    controller.enqueue(to_js(encode({**event, "seq": sequence})))
                token = SINK.set(send)
                cancel_token = CANCEL.set(cancellation)
                try:
                    send({"type": "received"})
                    response = await self._fetch(forwarded)
                    result = json.loads(await response.text())
                    send({"type": "result", "status": response.status, "result": result})
                except Exception:
                    if not cancelled:
                        send({"type": "result", "status": 500, "result": {"error": "WEB_STREAM_FAILED", "persistence": "not_written"}})
                finally:
                    CANCEL.reset(cancel_token)
                    SINK.reset(token)
                    if not cancelled: controller.close()
                    for proxy in proxies: proxy.destroy()
            def cancel(_reason=None):
                nonlocal cancelled
                cancelled = True
                cancellation.cancel()
            proxies.extend([create_proxy(start), create_proxy(cancel)])
            stream = js.ReadableStream.new(to_js({"start": proxies[0], "cancel": proxies[1]}, dict_converter=js.Object.fromEntries))
            return Response(stream, headers={"Content-Type": CONTENT_TYPE, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})
        incoming_signal = getattr(getattr(request, "js_object", request), "signal", None)
        if incoming_signal is None:
            return await self._fetch(request)
        state = Cancellation()
        abort_proxy = create_proxy(lambda _event=None: state.cancel())
        incoming_signal.addEventListener("abort", abort_proxy)
        if incoming_signal.aborted: state.cancel()
        token = CANCEL.set(state)
        try:
            state.check()
            return await self._fetch(request)
        finally:
            CANCEL.reset(token)
            incoming_signal.removeEventListener("abort", abort_proxy)
            abort_proxy.destroy()

    async def _fetch(self, request):
        if not allowed(request, self.env):
            return error("WEB_ORIGIN_DENIED", 403)
        path = urlparse(request.url).path
        control = path in CONTROL_PATHS
        if self.active >= 2 and not control:
            return error("WEB_SESSION_BUSY", 429)
        self.active += 1
        try:
            raw = await read_body(request)
            payload = json.loads(raw)
            if not isinstance(payload, dict):
                return error("WEB_JSON_INVALID")
            prepared = payload.pop("_cloudflare_pdf_pages", [])
            renderer = BrowserPDFDelivery(prepared)
            clean = json.dumps(payload, ensure_ascii=False).encode()
            fingerprint = hashlib.sha256(clean).hexdigest()
            operation = payload.get("operation_identity") or {}
            if not isinstance(operation, dict):
                return error("WEB_OPERATION_IDENTITY_INVALID", 422)
            identity = operation.get("operation_id")
            if not identity:
                turn = payload.get("turn") or {}
                if not isinstance(turn, dict):
                    return error("WEB_OPERATION_IDENTITY_INVALID", 422)
                identity = payload.get("request_id") or (f"{turn.get('execution_id')}:{turn.get('generation')}" if turn.get("execution_id") else None)
            receipt = hashlib.sha256((path + "\0" + identity).encode()).hexdigest() if isinstance(identity, str) else None

            async def provider_open_async(outbound, timeout):
                check_cancelled()
                if outbound.full_url not in ENDPOINTS or outbound.get_method() not in {"GET", "POST"}:
                    raise ValueError("PROVIDER_ENDPOINT_DENIED")
                # Replays after eviction are refused even though transient answers
                # were lost. No background retry can spend another API request.
                if outbound.get_method() == "POST" and receipt:
                    rows = list(self.ctx.storage.sql.exec("SELECT fingerprint FROM receipts WHERE identity = ?", receipt))
                    if rows:
                        code = "WEB_RESULT_EXPIRED_REVIEW_BEFORE_RETRY" if rows[0].fingerprint == fingerprint else "WEB_OPERATION_CONTENT_CONFLICT"
                        raise WebBoundaryError(code, 409)
                    count = self.ctx.storage.sql.exec("SELECT COUNT(*) AS n FROM receipts").one().n
                    if count >= 256:
                        raise WebBoundaryError("WEB_SESSION_OPERATION_LIMIT", 429)
                    self.ctx.storage.sql.exec("INSERT INTO receipts VALUES (?, ?)", receipt, fingerprint)
                abort = js.AbortController.new()
                state = CANCEL.get()
                release = state.register(lambda: abort.abort()) if state else lambda: None
                transferred = False
                options = {"method": outbound.get_method(), "headers": dict(outbound.header_items()),
                    "redirect": "manual", "signal": js.AbortSignal.any(to_js([abort.signal, js.AbortSignal.timeout(int(timeout * 1000))]))}
                if outbound.data is not None:
                    options["body"] = outbound.data
                try:
                    response = await js.fetch(outbound.full_url, to_js(options, dict_converter=js.Object.fromEntries))
                    if response.status != 200:
                        await response.body.cancel()
                        raise HTTPError(outbound.full_url, response.status, "PROVIDER_HTTP_ERROR", {}, None)
                    if SINK.get() and outbound.data and json.loads(outbound.data).get("stream") is True:
                        stream = StreamingProviderResponse(response, release)
                        transferred = True
                        return stream
                    reader = response.body.getReader()
                    chunks, size = [], 0
                    try:
                        while True:
                            check_cancelled()
                            part = await reader.read()
                            if part.done:
                                break
                            chunk = part.value.to_bytes()
                            size += len(chunk)
                            if size > 8_000_000:
                                await reader.cancel()
                                raise ValueError("PROVIDER_RESPONSE_TOO_LARGE")
                            chunks.append(chunk)
                    finally:
                        reader.releaseLock()
                    return ProviderResponse(b"".join(chunks), response.status)
                except (HTTPError, ValueError, ExecutionCancelled):
                    raise
                except Exception:
                    check_cancelled()
                    raise URLError("PROVIDER_NETWORK_FAILED") from None
                finally:
                    if not transferred: release()

            def provider_open(outbound, *, timeout):
                return run_sync(provider_open_async(outbound, timeout))

            provider_token = PROVIDER_HTTP_OPEN.set(provider_open)
            pdf_token = PDF_RENDERER.set(renderer)
            try:
                def application(environ, start_response):
                    environ["wsgi.input"] = io.BytesIO(clean)
                    environ["CONTENT_LENGTH"] = str(len(clean))
                    return self.application(environ, start_response)
                return await wsgi.fetch(application, request, self.env)
            finally:
                PDF_RENDERER.reset(pdf_token)
                PROVIDER_HTTP_OPEN.reset(provider_token)
        except (ValueError, TypeError, KeyError, UnicodeError):
            return error("WEB_REQUEST_OR_PDF_INVALID", 422)
        finally:
            self.active -= 1
