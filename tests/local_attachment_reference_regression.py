"""Real file-library attachment reuse and isolation, with synthetic originals."""
import base64
import copy
import hashlib
import tempfile
import unittest
import subprocess
import sys
from pathlib import Path

from src.conversation_attachments import CONTRACT, validate_attachments
from src.local_attachment_delivery import LOCAL_ATTACHMENT_RESOLVER, resolver
from src.workspace_storage import WorkspaceStorage


class AttachmentError(ValueError):
    def __init__(self, code, *_):
        super().__init__(code)


class LocalAttachmentTest(unittest.TestCase):
    def test_web_import_does_not_load_local_filesystem_modules(self):
        source = '''
import importlib.abc, sys
class BlockLocal(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, *args):
        if fullname == "fcntl": raise ModuleNotFoundError("fcntl unavailable in Python Workers")
sys.meta_path.insert(0, BlockLocal())
import app, web_app
assert "src.workspace_storage" not in sys.modules
from src.local_attachment_delivery import local_attachment_scope, LOCAL_ATTACHMENT_RESOLVER
class Web: web_request = True
@local_attachment_scope("PERSONAL")
def check(handler): assert LOCAL_ATTACHMENT_RESOLVER.get() is None
check(Web())
'''
        result = subprocess.run([sys.executable, "-c", source], cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)

    def setUp(self):
        self.library = WorkspaceStorage(tempfile.mkdtemp(prefix="ariadne-attachment-reference-"))
        self.workspace, self.request_id = "a" * 32, "turn-synthetic-reference"
        self.raw = "A synthetic attachment. 合成附件。".encode()
        self.item = {"name": "example.txt", "mime_type": "text/plain", "size": len(self.raw),
                     "content_hash": "sha256:" + hashlib.sha256(self.raw).hexdigest()}
        blob = self.library.stage_blob(self.workspace, {"$blob": "base64", "type": "text/plain",
                                       "data": base64.b64encode(self.raw).decode()}, self.item["name"])
        record = {"request_id": self.request_id, "domain": "PERSONAL", "conversation_id": "PERSONAL",
                  "authority": "SOURCE_INPUT_ONLY", "files": [{**self.item, "file": blob}]}
        self.library.commit(self.workspace, CONTRACT, {"turns": None},
                            [{"store": "turns", "operation": "add", "value": record}], initialize=True)
        self.request = {"request_id": self.request_id,
                        "runtime_snapshot": {"mode": "model", "provider": "codex", "model": "test-model", "capabilities": {"vision": "supported"}},
                        "attachments": {"contract_id": CONTRACT, "request_id": self.request_id,
                                        "files": [{**self.item, "local_reference": {"workspace": self.workspace, "request_id": self.request_id, "index": 0}}],
                                        "consent": {"confirmed": True, "provider": "codex", "model": "test-model", "purpose": "CURRENT_CONVERSATION_TURN"}}}

    def validate(self, request, domain="PERSONAL"):
        token = LOCAL_ATTACHMENT_RESOLVER.set(resolver(domain, self.library))
        try:
            return validate_attachments(request, AttachmentError)
        finally:
            LOCAL_ATTACHMENT_RESOLVER.reset(token)

    def test_saved_original_reused_without_data_url(self):
        self.assertEqual(self.validate(self.request), [("example.txt", "text/plain", self.raw)])
        self.assertIsNone(LOCAL_ATTACHMENT_RESOLVER.get())

    def test_web_and_wrong_provider_cannot_resolve_local_files(self):
        with self.assertRaisesRegex(AttachmentError, "reference_unavailable"):
            validate_attachments(self.request, AttachmentError)
        request = copy.deepcopy(self.request)
        request["runtime_snapshot"]["provider"] = request["attachments"]["consent"]["provider"] = "gemini"
        with self.assertRaisesRegex(AttachmentError, "reference_unavailable"):
            self.validate(request)

    def test_other_turn_workspace_domain_or_metadata_are_rejected(self):
        mutations = [("workspace", "b" * 32), ("request_id", "another-turn"), ("index", 1),
                     ("index", True), ("workspace", "../outside")]
        for field, value in mutations:
            request = copy.deepcopy(self.request)
            request["attachments"]["files"][0]["local_reference"][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(AttachmentError):
                self.validate(request)
        with self.assertRaises(AttachmentError):
            self.validate(self.request, "JOB")
        request = copy.deepcopy(self.request)
        request["attachments"]["files"][0]["name"] = "different.txt"
        with self.assertRaises(AttachmentError):
            self.validate(request)

    def test_consent_is_still_required_and_corruption_rejected(self):
        request = copy.deepcopy(self.request)
        request["attachments"]["consent"]["confirmed"] = False
        with self.assertRaisesRegex(AttachmentError, "consent_required"):
            self.validate(request)
        saved = self.library.read_record(self.workspace, CONTRACT, "turns", self.request_id)["record"]
        (self.library.directory(self.workspace) / saved["files"][0]["file"]["path"]).write_bytes(b"corrupted")
        with self.assertRaisesRegex(AttachmentError, "reference_invalid"):
            self.validate(self.request)

    def test_inline_web_payload_compatibility(self):
        request = copy.deepcopy(self.request)
        request["attachments"]["files"] = [{**self.item, "data_url": "data:text/plain;base64," + base64.b64encode(self.raw).decode()}]
        self.assertEqual(validate_attachments(request, AttachmentError)[0][2], self.raw)


if __name__ == "__main__":
    unittest.main()
