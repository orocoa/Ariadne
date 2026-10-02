"""Disposable loopback QA origin, synthetic fixture only; model execution disabled."""
import os
from pathlib import Path
import sys
import tempfile
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ["ARIADNE_CODEX_ENABLED"] = "0"
os.environ["ARIADNE_WORKSPACE_ROOT"] = tempfile.mkdtemp(prefix="ariadne-browser-qa-")
from app import JobRadarHandler, ThreadingHTTPServer


class Handler(JobRadarHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/personal-understanding.html" and parse_qs(parsed.query).get("qa") == ["synthetic"]:
            body = (ROOT / "public/personal-understanding.html").read_text()
            body = body.replace('<script src="/personal-understanding.js', '<script src="/__qa/personal-fixture.js"></script>\n<script src="/personal-understanding.js')
            self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.end_headers()
            self.wfile.write(body.encode())
            return
        if parsed.path == "/__qa/personal-fixture.js":
            self.send_response(200); self.send_header("Content-Type", "text/javascript; charset=utf-8"); self.end_headers()
            self.wfile.write((ROOT / "tests/helpers/optimization-personal-fixture.js").read_bytes())
            return
        super().do_GET()

    def do_POST(self):
        # Browser scenarios may exercise storage, never a paid Provider route.
        if urlparse(self.path).path != "/api/workspace":
            self.send_json(403, {"error": "SYNTHETIC_QA_PROVIDER_DISABLED", "network_call_made": False})
            return
        super().do_POST()

    def log_message(self, *_):
        pass


class BrowserQAServer(ThreadingHTTPServer):
    # Chromium can request many fixture scripts at once. The stdlib backlog
    # of five produces intermittent connection resets on the local QA host.
    # This only configures the disposable test server, not the product server.
    request_queue_size = 64


if __name__ == "__main__":
    server = BrowserQAServer(("127.0.0.1", 0), Handler)
    print(server.server_port, flush=True)
    server.serve_forever()
