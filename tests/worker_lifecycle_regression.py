"""Exercise real Worker logic with offline JS/SQL bindings, not a deployed Worker."""
import asyncio
import importlib.util
import io
import json
from pathlib import Path
import sqlite3
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch
from urllib.request import Request

from src.runtime_cancellation import CANCEL, Cancellation, ExecutionCancelled
from src.runtime_transport import PROVIDER_HTTP_OPEN
from src.web_execution import WebBoundaryError


class Response:
    def __init__(self, body, status=200, headers=None):
        self.body, self.status, self.headers = body, status, headers or {}

    @classmethod
    def json(cls, value, status=200, headers=None):
        return cls(json.dumps(value), status, headers)

    async def text(self):
        return self.body


class Signal:
    def __init__(self):
        self.aborted = False
        self.event = asyncio.Event()
        self.listeners = set()

    def addEventListener(self, name, callback): self.listeners.add(callback)
    def removeEventListener(self, name, callback): self.listeners.discard(callback)
    def abort(self):
        self.aborted = True
        self.event.set()
        for callback in tuple(self.listeners): callback()


class Controller:
    def __init__(self):
        self.signal = Signal()

    def abort(self):
        self.signal.abort()


class Proxy:
    def __init__(self, callback): self.callback = callback
    def __call__(self, *args): return self.callback(*args)
    def destroy(self): self.callback = None


class SQL:
    def __init__(self):
        self.database = sqlite3.connect(":memory:")

    def exec(self, sql, *args):
        cursor = self.database.execute(sql, args)
        names = [field[0] for field in cursor.description] if cursor.description else []
        class Rows(list):
            def one(self): return self[0]
        return Rows(SimpleNamespace(**dict(zip(names, row))) for row in cursor.fetchall())


class Body:
    def __init__(self, value): self.value = value
    def __aiter__(self): return self.read()
    async def read(self):
        yield SimpleNamespace(to_bytes=lambda: self.value)


class WorkerLifecycleTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.started, self.calls, self.block = asyncio.Event(), 0, False
        async def fetch(url, options):
            self.calls += 1
            self.started.set()
            if self.block:
                await options["signal"].event.wait()
                raise RuntimeError("synthetic aborted fetch")
            reader = SimpleNamespace(read=self.empty, releaseLock=lambda: None)
            return SimpleNamespace(status=200, body=SimpleNamespace(getReader=lambda: reader))
        async def wsgi_fetch(application, request, env):
            outbound = Request("https://api.deepseek.com/chat/completions", data=b'{}', method="POST")
            result = await PROVIDER_HTTP_OPEN.get()(outbound, timeout=1)
            return Response.json({"bytes": len(result.getvalue())})
        workers = ModuleType("workers")
        workers.WorkerEntrypoint = workers.DurableObject = object
        workers.Response, workers.wsgi = Response, SimpleNamespace(fetch=wsgi_fetch)
        ffi = ModuleType("pyodide.ffi")
        ffi.run_sync = lambda coroutine: coroutine
        ffi.to_js = lambda value, **_: value
        ffi.create_proxy = Proxy
        js = ModuleType("js")
        js.fetch, js.Object = fetch, SimpleNamespace(fromEntries=lambda x: x)
        js.AbortController = SimpleNamespace(new=Controller)
        js.AbortSignal = SimpleNamespace(timeout=lambda _: Signal(), any=lambda signals: signals[0])
        self.modules = patch.dict(sys.modules, {"workers": workers, "pyodide": ModuleType("pyodide"), "pyodide.ffi": ffi, "js": js})
        self.modules.start()
        spec = importlib.util.spec_from_file_location("ariadne_worker_test", Path(__file__).resolve().parents[1] / "deploy/cloudflare/worker.py")
        self.worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.worker)
        self.sql = SQL()
        self.session = self.worker.ExecutionSession(SimpleNamespace(storage=SimpleNamespace(sql=self.sql)),
            SimpleNamespace(ARIADNE_WEB_ORIGINS="https://synthetic.example"))

    async def asyncTearDown(self):
        self.modules.stop()
        self.sql.database.close()

    async def empty(self): return SimpleNamespace(done=True)

    def request(self, identity="request-one", extra=None):
        value = {"request_id": identity, **(extra or {})}
        return SimpleNamespace(url="https://synthetic.example/api/personal-understanding-turn",
            headers={"Origin": "https://synthetic.example", "Content-Type": "application/json"},
            body=Body(json.dumps(value).encode()))

    async def test_replay_and_conflict_preserve_receipts_without_second_spend(self):
        await self.session._fetch(self.request())
        for extra, code in [(None, "WEB_RESULT_EXPIRED_REVIEW_BEFORE_RETRY"), ({"changed": True}, "WEB_OPERATION_CONTENT_CONFLICT")]:
            with self.assertRaises(WebBoundaryError) as caught:
                await self.session._fetch(self.request(extra=extra))
            self.assertEqual(caught.exception.code, code)
        self.assertEqual(self.calls, 1)
        self.assertEqual(self.session.active, 0)

    async def test_limit_rejects_before_provider_and_keeps_old_receipts(self):
        for n in range(256):
            self.sql.exec("INSERT INTO receipts VALUES (?, ?)", str(n), "fingerprint")
        with self.assertRaises(WebBoundaryError) as caught:
            await self.session._fetch(self.request())
        self.assertEqual(caught.exception.code, "WEB_SESSION_OPERATION_LIMIT")
        self.assertEqual(self.calls, 0)
        self.assertEqual(self.sql.exec("SELECT COUNT(*) AS n FROM receipts").one().n, 256)

    async def test_cancellation_aborts_silent_pending_fetch_and_retains_receipt(self):
        self.block = True
        cancellation = Cancellation()
        token = CANCEL.set(cancellation)
        try:
            task = asyncio.create_task(self.session._fetch(self.request()))
            await asyncio.wait_for(self.started.wait(), 1)
            cancellation.cancel()
            with self.assertRaises(ExecutionCancelled):
                await asyncio.wait_for(task, 1)
            self.assertEqual(self.calls, 1)
            self.assertEqual(self.session.active, 0)
            self.assertEqual(self.sql.exec("SELECT COUNT(*) AS n FROM receipts").one().n, 1)
            self.assertFalse(cancellation._callbacks)
        finally:
            CANCEL.reset(token)

    async def test_nonstream_request_abort_reaches_provider_and_releases_listener(self):
        self.block = True
        request = self.request("nonstream-abort")
        request.signal = Signal()
        task = asyncio.create_task(self.session.fetch(request))
        await asyncio.wait_for(self.started.wait(), 1)
        request.signal.abort()
        with self.assertRaises(ExecutionCancelled):
            await asyncio.wait_for(task, 1)
        self.assertFalse(request.signal.listeners)
        self.assertIsNone(CANCEL.get())
        self.assertEqual(self.session.active, 0)
        self.assertEqual(self.calls, 1)


if __name__ == "__main__":
    unittest.main()
