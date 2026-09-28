"""Native lifecycle contract, using only isolated synthetic services and data."""
import importlib.util
import json
import os
from pathlib import Path
import select
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
from http.server import BaseHTTPRequestHandler
import http.client
import threading

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.loopback_server import LoopbackHTTPServer
spec = importlib.util.spec_from_file_location('local_package', ROOT / 'scripts/local_package.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


@unittest.skipUnless(sys.platform == 'darwin', 'macOS process lifecycle')
class LifecycleTests(unittest.TestCase):
    def setUp(self):
        output = ROOT / '.cache/desktop-app-20260918/regression'
        output.mkdir(parents=True, exist_ok=True)
        self.root = Path(tempfile.mkdtemp(prefix='case-', dir=output))
        self.bundle = self.root / '下载 含空格'
        (self.bundle / 'app/data').mkdir(parents=True)
        (self.bundle / 'app/src').mkdir()
        (self.bundle / 'app/src/loopback_server.py').write_bytes((ROOT / 'src/loopback_server.py').read_bytes())
        (self.bundle / 'python/bin').mkdir(parents=True)
        (self.bundle / 'python/bin/python3').symlink_to(sys.executable)
        (self.bundle / 'release.json').write_text('{"release":"desktop-fixture"}')
        (self.bundle / 'local_package.py').write_bytes((ROOT / 'scripts/local_package.py').read_bytes())
        (self.bundle / 'app/app.py').write_text('''from http.server import SimpleHTTPRequestHandler
from pathlib import Path
class JobRadarHandler(SimpleHTTPRequestHandler):
    def local_request_allowed(self): return True
    def send_json(self, code, value):
        import json
        self.send_response(code); self.end_headers(); self.wfile.write(json.dumps(value).encode())
def initialize_database():
    Path('data/workspaces/retained.txt').write_text('synthetic retained data')
''')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            self.port = sock.getsockname()[1]
        self.processes = []

    def tearDown(self):
        for process in self.processes:
            if process.stdin: process.stdin.close()
            if process.stdout: process.stdout.close()
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=8)

    def start(self):
        with (self.root / f'run-{len(self.processes)}.log').open('wb') as log:
            process = subprocess.Popen([sys.executable, '-B', str(self.bundle / 'local_package.py'),
                'desktop', '--home', str(self.root / '安装'), '--port', str(self.port)],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=log)
        self.processes.append(process)
        return process

    def ready(self, process):
        readable, _, _ = select.select([process.stdout], [], [], 10)
        self.assertTrue(readable, 'No readiness event')
        self.assertEqual(json.loads(process.stdout.readline()), {'status': 'ready', 'origin': f'http://127.0.0.1:{self.port}'})

    def assert_closed(self):
        with socket.socket() as sock:
            self.assertNotEqual(sock.connect_ex(('127.0.0.1', self.port)), 0)

    def test_loopback_http_works_without_reverse_dns(self):
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"local workspace")
            def log_message(self, *args): pass
        with patch("socket.getfqdn", side_effect=AssertionError("DNS must not be used")):
            server = LoopbackHTTPServer(("127.0.0.1", 0), Handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=2)
                connection.request("GET", "/")
                response = connection.getresponse()
                self.assertEqual(response.status, 200)
                self.assertEqual(response.read(), b"local workspace")
                connection.close()
                self.assertEqual(server.server_name, "127.0.0.1")
            finally:
                server.shutdown(); server.server_close(); thread.join(timeout=2)
        with self.assertRaises(ValueError):
            LoopbackHTTPServer(("0.0.0.0", 0), Handler)

    def test_eof_stops_service_reopen_preserves_data(self):
        first = self.start(); self.ready(first)
        first.stdin.close(); self.assertEqual(first.wait(timeout=8), 0)
        self.assert_closed()
        data = self.root / '安装/data/workspaces/retained.txt'
        self.assertEqual(data.read_text(), 'synthetic retained data')
        second = self.start(); self.ready(second)
        second.stdin.close(); self.assertEqual(second.wait(timeout=8), 0)
        self.assert_closed()
        self.assertTrue(data.is_file())

    def test_port_conflict_preserves_existing_service(self):
        first = self.start(); self.ready(first)
        second = self.start()
        self.assertEqual(second.wait(timeout=8), 1)
        self.assertIsNone(first.poll())
        with socket.create_connection(('127.0.0.1', self.port), timeout=2): pass
        first.stdin.close(); first.wait(timeout=8)

    def test_signal_closes_owned_service(self):
        process = self.start(); self.ready(process)
        process.terminate(); self.assertEqual(process.wait(timeout=8), 0)
        self.assert_closed()

    def test_parent_lost_during_install_never_starts_service(self):
        process = self.start(); process.stdin.close()
        self.assertEqual(process.wait(timeout=8), 0)
        self.assert_closed()

    def test_shutdown_stops_detached_descendant_not_unrelated_process(self):
        child_file = self.root / 'child.pid'
        process = subprocess.Popen([sys.executable, '-c',
            'import subprocess,sys,time; from pathlib import Path; '
            'child=subprocess.Popen([sys.executable,"-c","import signal,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);time.sleep(60)"],start_new_session=True); '
            f'Path({str(child_file)!r}).write_text(str(child.pid));time.sleep(60)'], start_new_session=True)
        unrelated = subprocess.Popen([sys.executable, '-c', 'import time;time.sleep(60)'])
        self.processes.extend([process, unrelated])
        for _ in range(100):
            if child_file.exists(): break
            time.sleep(.02)
        detached = int(child_file.read_text())
        module.stop_owned_server(process)
        self.assertIsNotNone(process.poll())
        self.assertIsNone(unrelated.poll())
        for _ in range(100):
            status = subprocess.run(['/bin/ps', '-p', str(detached), '-o', 'stat='], capture_output=True, text=True).stdout.strip()
            if not status or status.startswith('Z'): break
            time.sleep(.02)
        self.assertTrue(not status or status.startswith('Z'), status)


if __name__ == '__main__': unittest.main(verbosity=2)
