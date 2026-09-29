"""Check exported URL/cache behavior, without building or publishing a release."""
import hashlib
from pathlib import Path
import tempfile
import unittest

from scripts.fingerprint_web_assets import fingerprint


class FingerprintTest(unittest.TestCase):
    def export(self, dependency="body {}"):
        directory = Path(tempfile.mkdtemp(prefix="ariadne-asset-test-"))
        (directory / "vi").mkdir()
        (directory / "index.html").write_text('<script src="/app.js?v=old"></script><link href="/vi/style.css?v=another">')
        (directory / "app.js").write_text('import("/other.js?v=old"); const css = "/vi/style.css";')
        (directory / "other.js").write_text('const app = "/app.js";')
        (directory / "vi/style.css").write_text(dependency)
        (directory / "_worker.js").write_text("worker stays at its provider path")
        return directory, fingerprint(directory)

    def test_html_and_dynamic_imports_share_content_version(self):
        directory, manifest = self.export()
        for source, url in manifest["urls"].items():
            self.assertTrue((directory / source.lstrip("/")).exists(), "original retained")
            body = (directory / url.lstrip("/")).read_bytes()
            self.assertEqual(hashlib.sha256(body).hexdigest(), manifest["sha256"][url])
        html = (directory / "index.html").read_text()
        self.assertIn(manifest["urls"]["/app.js"], html)
        app = (directory / manifest["urls"]["/app.js"].lstrip("/")).read_text()
        self.assertIn(manifest["urls"]["/other.js"], app)
        self.assertNotIn("?v=", app + html)
        self.assertNotIn("/_worker.js", manifest["urls"])
        headers = (directory / "_headers").read_text()
        self.assertTrue(headers.startswith("/*\n"))
        self.assertIn("  Cache-Control: no-cache", headers)
        self.assertIn("  ! Cache-Control\n  Cache-Control: public", headers)
        self.assertIn("max-age=31536000, immutable", headers)

    def test_graph_is_deterministic_and_dependency_changes_invalidate_callers(self):
        _, first = self.export()
        _, same = self.export()
        _, changed = self.export("body {display: grid}")
        self.assertEqual(first, same)
        self.assertNotEqual(first["urls"]["/app.js"], changed["urls"]["/app.js"])

    def test_verified_previous_lazy_assets_survive_the_next_export(self):
        previous, old = self.export()
        current = Path(tempfile.mkdtemp(prefix="ariadne-next-asset-test-"))
        (current / "app.js").write_text('const changed = true;')
        latest = fingerprint(current, previous)
        for url, digest in old["sha256"].items():
            self.assertEqual(hashlib.sha256((current / url.lstrip("/")).read_bytes()).hexdigest(), digest)
            self.assertEqual(latest["retained_sha256"][url], digest)
        (previous / old["urls"]["/other.js"].lstrip("/")).write_text("corrupt")
        destination = Path(tempfile.mkdtemp(prefix="ariadne-corrupt-asset-test-"))
        with self.assertRaisesRegex(ValueError, "hash mismatch"):
            fingerprint(destination, previous)


if __name__ == "__main__":
    unittest.main()
