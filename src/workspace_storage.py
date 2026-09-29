"""Local document library: immutable files and one atomic manifest per workspace.

The manifest contains identities and file hashes, never a second copy of prose.
Old generations and imported browser data remain available for recovery. This
module does not interpret Candidate/Job semantics or grant model write access.
"""
import base64
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import threading
import uuid

CONTRACT = json.loads((Path(__file__).resolve().parents[1] / "data/workspace_storage_v1.json").read_text())
FORMAT = "ariadne-markdown-v1"
_LOCK = threading.RLock()


class WorkspaceError(ValueError):
    def __init__(self, code, status=400):
        super().__init__(code)
        self.code, self.status = code, status


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def source_hash_matches(claimed, actual):
    # Learning-era sources stored bare hex; canonical sources include the scheme.
    # Compare bytes' digest without rewriting either source record or its identity.
    if not isinstance(claimed, str):
        return False
    match = re.fullmatch(r"(?:sha256:)?([a-fA-F0-9]{64})", claimed)
    return bool(match and match[1].lower() == actual)


class WorkspaceStorage:
    def __init__(self, root=None):
        self.root = Path(root or os.environ.get("ARIADNE_WORKSPACE_ROOT") or
                         Path(__file__).resolve().parents[1] / "data/workspaces")

    def directory(self, workspace):
        if not isinstance(workspace, str) or not re.fullmatch(r"[a-f0-9]{32}", workspace):
            raise WorkspaceError("WORKSPACE_ID_INVALID")
        directory = self.root / workspace
        if directory.is_symlink() or self.root.is_symlink():
            raise WorkspaceError("WORKSPACE_PATH_INVALID")
        return directory

    @contextmanager
    def _locked(self, workspace):
        with _LOCK:
            directory = self.directory(workspace)
            directory.mkdir(parents=True, exist_ok=True)
            with self._file(directory, ".lock").open("a") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX)
                try:
                    yield directory
                finally:
                    fcntl.flock(lock, fcntl.LOCK_UN)

    def status(self, workspace, database):
        if database not in CONTRACT["databases"]:
            raise WorkspaceError("WORKSPACE_STORE_INVALID")
        with self._locked(workspace) as directory:
            return {"initialized": database in self._head(directory)["databases"]}

    def _head(self, directory):
        path = self._file(directory, "HEAD.json")
        if not path.exists():
            return {"contract_id": CONTRACT["contract_id"], "generation": None, "databases": {}}
        try:
            value = json.loads(path.read_text())
            if value["contract_id"] != CONTRACT["contract_id"] or not isinstance(value["databases"], dict):
                raise ValueError()
            return value
        except (ValueError, KeyError, OSError):
            raise WorkspaceError("WORKSPACE_MANIFEST_INVALID", 409)

    @staticmethod
    def _schema(database, stores):
        schema = CONTRACT["databases"].get(database)
        if schema is None or not isinstance(stores, list) or not stores or len(stores) != len(set(stores)) or any(s not in schema for s in stores):
            raise WorkspaceError("WORKSPACE_STORE_INVALID")
        return schema

    def _file(self, directory, relative):
        path = directory / relative
        if not path.resolve().is_relative_to(directory.resolve()) or path.is_symlink():
            raise WorkspaceError("WORKSPACE_PATH_INVALID")
        return path

    def _write_object(self, directory, folder, body, extension, filename=None):
        fingerprint = digest(body)
        relative = f"{folder}/{fingerprint}.{extension}"
        if filename:
            safe_name = re.sub(r"[^\w. -]", "_", filename).lstrip(".")[:160] or "original.bin"
            relative = f"{folder}/{fingerprint}/{safe_name}"
        path = self._file(directory, relative)
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            if path.read_bytes() != body:
                raise WorkspaceError("WORKSPACE_FILE_CHANGED", 409)
        else:
            # A failed byte write leaves only an unreferenced temporary file;
            # retries must not mistake a partial file for an immutable object.
            temporary = self._file(directory, str(path.relative_to(directory)) + "." + uuid.uuid4().hex + ".tmp")
            with temporary.open("xb") as output:
                output.write(body)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, path)
            parent = path.parent
            while parent.is_relative_to(directory):
                descriptor = os.open(parent, os.O_RDONLY)
                try:
                    os.fsync(descriptor)
                finally:
                    os.close(descriptor)
                if parent == directory:
                    break
                parent = parent.parent
        return {"path": relative, "sha256": fingerprint}

    def _read_object(self, directory, entry):
        try:
            body = self._file(directory, entry["path"]).read_bytes()
        except OSError:
            raise WorkspaceError("WORKSPACE_FILE_MISSING", 409)
        if digest(body) != entry["sha256"]:
            raise WorkspaceError("WORKSPACE_FILE_CHANGED", 409)
        return body

    def _save_record(self, directory, database, store, key_path, record):
        if not isinstance(record, dict) or not isinstance(record.get(key_path), str) or not record[key_path]:
            raise WorkspaceError("WORKSPACE_RECORD_ID_INVALID")
        folder = f"documents/{store}"
        if record.get("content_format") == FORMAT:
            markdown = record.get("markdown")
            if not isinstance(markdown, str) or not markdown.startswith("---\n"):
                raise WorkspaceError("WORKSPACE_MARKDOWN_INVALID")
            try:
                header = json.loads(markdown[4:markdown.index("\n---\n", 4)])
                if header["format"] != FORMAT or header["record"][key_path] != record[key_path]:
                    raise ValueError()
            except (ValueError, KeyError, TypeError):
                raise WorkspaceError("WORKSPACE_MARKDOWN_INVALID")
            return self._write_object(directory, folder, markdown.encode("utf-8"), "md")
        # Original files stay as bytes. Their logical source IDs/filenames and
        # existing hash checks remain in the source envelope, independent of paths.
        def save_blobs(value, parent=None):
            if isinstance(value, dict) and value.get("$blob") in {"base64", "file"}:
                entry = self._blob_reference(directory, value, (parent or {}).get("filename"))
                if parent and parent.get("content_hash") and not source_hash_matches(parent["content_hash"], entry["sha256"]):
                    raise WorkspaceError("WORKSPACE_SOURCE_HASH_MISMATCH", 409)
                return entry
            if isinstance(value, dict):
                return {key: save_blobs(child, value) for key, child in value.items()}
            if isinstance(value, list):
                return [save_blobs(child) for child in value]
            return value
        record = save_blobs(record)
        return self._write_object(directory, f"state/{database}/{store}", encoded(record), "json")

    def _blob_reference(self, directory, value, filename=None):
        if not isinstance(value, dict) or value.get("$blob") not in {"base64", "file"}:
            raise WorkspaceError("WORKSPACE_BLOB_INVALID")
        if value["$blob"] == "file":
            if not isinstance(value.get("path"), str) or not value["path"].startswith("originals/"):
                raise WorkspaceError("WORKSPACE_BLOB_INVALID")
            self._read_object(directory, value)
            return {key: item for key, item in value.items() if key != "size"}
        try:
            body = base64.b64decode(value["data"], validate=True)
        except (ValueError, KeyError):
            raise WorkspaceError("WORKSPACE_BLOB_INVALID")
        entry = self._write_object(directory, "originals", body, "bin", value.get("name") or filename)
        return {**{key: item for key, item in value.items() if key != "data"}, "$blob": "file", **entry}

    def stage_blob(self, workspace, value, filename=None):
        # Large migrations upload originals individually. Files become visible
        # to the workspace only when the complete index commits atomically.
        with self._locked(workspace) as directory:
            return self._blob_reference(directory, value, filename)

    def _load_record(self, directory, entry, key_path, key, include_blobs=True):
        body = self._read_object(directory, entry)
        if entry["path"].endswith(".md"):
            return {key_path: key, "content_format": FORMAT, "markdown": body.decode("utf-8")}
        return self._restore_blobs(directory, json.loads(body), include_blobs)

    def _restore_blobs(self, directory, value, include_blobs=True):
        def load_blobs(value):
            if isinstance(value, dict) and value.get("$blob") == "file":
                if not include_blobs:
                    try:
                        return {**value, "size": self._file(directory, value["path"]).stat().st_size}
                    except OSError:
                        raise WorkspaceError("WORKSPACE_FILE_MISSING", 409)
                return {**{k: v for k, v in value.items() if k not in {"path", "sha256"}}, "$blob": "base64", "data": base64.b64encode(self._read_object(directory, value)).decode()}
            if isinstance(value, dict):
                return {key: load_blobs(child) for key, child in value.items()}
            if isinstance(value, list):
                return [load_blobs(child) for child in value]
            return value
        return load_blobs(value)

    def read(self, workspace, database, stores, *, include_blobs=True):
        schema = self._schema(database, stores)
        with self._locked(workspace) as directory:
            head = self._head(directory)
            current = head["databases"].get(database)
            if current is None:
                return {"initialized": False, "stores": {}, "versions": {}}
            records, versions = {}, {}
            for name in stores:
                index = current.get(name, {})
                records[name] = [self._load_record(directory, index[key], schema[name], key, include_blobs) for key in sorted(index)]
                versions[name] = digest(encoded(index))
            return {"initialized": True, "stores": records, "versions": versions}

    def blob(self, workspace, entry):
        if not isinstance(entry, dict) or not isinstance(entry.get("path"), str) or not entry["path"].startswith("originals/"):
            raise WorkspaceError("WORKSPACE_BLOB_INVALID")
        with self._locked(workspace) as directory:
            return {**{k: v for k, v in entry.items() if k not in {"path", "sha256", "size"}}, "$blob": "base64", "data": base64.b64encode(self._read_object(directory, entry)).decode()}

    def read_record(self, workspace, database, store, key):
        """Independent lookup; write transactions still read/version whole stores."""
        schema = self._schema(database, [store])
        if not isinstance(key, str) or not key:
            raise WorkspaceError("WORKSPACE_RECORD_ID_INVALID")
        with self._locked(workspace) as directory:
            current = self._head(directory)["databases"].get(database)
            if current is None:
                return {"initialized": False, "record": None}
            entry = current.get(store, {}).get(key)
            record = self._load_record(directory, entry, schema[store], key, False) if entry else None
            return {"initialized": True, "record": record}

    def read_records(self, workspace, database, store, keys):
        """One ordered point-read batch, including only the requested originals.

        No versions are issued here: these reads cannot stand in for a write
        transaction's complete read set or relax its conflict/hash checks.
        """
        schema = self._schema(database, [store])
        if (not isinstance(keys, list) or len(keys) > 1000
                or any(not isinstance(key, str) or not 0 < len(key) <= 1024 for key in keys)):
            raise WorkspaceError("WORKSPACE_RECORD_ID_INVALID")
        with self._locked(workspace) as directory:
            current = self._head(directory)["databases"].get(database)
            if current is None:
                return {"initialized": False, "records": []}
            index = current.get(store, {})
            records = [self._load_record(directory, index[key], schema[store], key) if key in index else None for key in keys]
            return {"initialized": True, "records": records}

    def query_records(self, workspace, database, store, *, job_context_id=None, metadata_only=False):
        """Filter one verified scan; no derived index or duplicate prose authority."""
        schema = self._schema(database, [store])
        if not isinstance(metadata_only, bool) or (job_context_id is not None and (
                store not in {"applications", "job_journal_entries", "job_journal_images"}
                or not isinstance(job_context_id, str) or not 0 < len(job_context_id) <= 1024)):
            raise WorkspaceError("WORKSPACE_QUERY_INVALID")
        with self._locked(workspace) as directory:
            current = self._head(directory)["databases"].get(database)
            if current is None:
                return {"initialized": False, "records": []}
            records = []
            for key, entry in sorted(current.get(store, {}).items()):
                record = self._load_record(directory, entry, schema[store], key, False)
                identity = record
                if record.get("content_format") == FORMAT:
                    try:
                        markdown = record["markdown"]
                        identity = json.loads(markdown[4:markdown.index("\n---\n", 4)])["record"]
                        if not isinstance(identity, dict):
                            raise ValueError()
                    except (ValueError, KeyError, TypeError):
                        raise WorkspaceError("WORKSPACE_MARKDOWN_INVALID", 409)
                if job_context_id is not None and identity.get("job_context_id") != job_context_id:
                    continue
                records.append(record if metadata_only else self._restore_blobs(directory, record))
            return {"initialized": True, "records": records}

    def commit(self, workspace, database, expected, writes, *, initialize=False, transaction_id=None):
        if not isinstance(expected, dict) or not isinstance(initialize, bool):
            raise WorkspaceError("WORKSPACE_REQUEST_INVALID")
        schema = self._schema(database, list(expected))
        if not isinstance(writes, list):
            raise WorkspaceError("WORKSPACE_WRITES_INVALID")
        if transaction_id is not None and (not isinstance(transaction_id, str) or not re.fullmatch(r"[a-f0-9]{32}", transaction_id)):
            raise WorkspaceError("WORKSPACE_TRANSACTION_ID_INVALID")
        request_hash = digest(encoded([database, expected, writes, initialize]))
        with self._locked(workspace) as directory:
            head = self._head(directory)
            receipt = head.get("receipts", {}).get(transaction_id)
            if receipt:
                if receipt["request_hash"] != request_hash:
                    raise WorkspaceError("WORKSPACE_TRANSACTION_REUSED", 409)
                return {"ok": True, "generation": receipt["generation"]}
            current = head["databases"].get(database)
            if initialize and current is not None:
                raise WorkspaceError("WORKSPACE_ALREADY_INITIALIZED", 409)
            if not initialize and current is None:
                raise WorkspaceError("WORKSPACE_NOT_INITIALIZED", 409)
            current = current or {}
            if not initialize and any(version != digest(encoded(current.get(name, {}))) for name, version in expected.items()):
                raise WorkspaceError("WORKSPACE_VERSION_CONFLICT", 409)
            # Check every read file before committing, so external edits cannot
            # be silently replaced or promoted to a Human Save.
            for name in expected:
                for entry in current.get(name, {}).values():
                    self._read_object(directory, entry)
            for write in writes:
                name, operation = write.get("store"), write.get("operation")
                if name not in expected or operation not in {"add", "put", "delete"}:
                    raise WorkspaceError("WORKSPACE_WRITE_INVALID")
                index = current.setdefault(name, {})
                key = write.get("key") if operation == "delete" else write.get("value", {}).get(schema[name])
                if not isinstance(key, str) or not key:
                    raise WorkspaceError("WORKSPACE_RECORD_ID_INVALID")
                if operation == "add" and key in index:
                    raise WorkspaceError("WORKSPACE_RECORD_EXISTS", 409)
                if operation == "delete":
                    index.pop(key, None)  # History and files are retained.
                else:
                    index[key] = self._save_record(directory, database, name, schema[name], write["value"])
                    if self._load_record(directory, index[key], schema[name], key) != self._restore_blobs(directory, write["value"]):
                        raise WorkspaceError("WORKSPACE_ROUNDTRIP_FAILED", 409)
            head["databases"][database] = current
            head["generation"] = uuid.uuid4().hex
            if transaction_id:
                receipts = head.setdefault("receipts", {})
                receipts[transaction_id] = {"request_hash": request_hash, "generation": head["generation"]}
                head["receipts"] = dict(list(receipts.items())[-64:])
            body = encoded(head)
            self._write_object(directory, "history", body, "json")
            directory.mkdir(parents=True, exist_ok=True)
            temporary = directory / f"HEAD.{head['generation']}.tmp"
            with temporary.open("xb") as output:
                output.write(body)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, directory / "HEAD.json")
            descriptor = os.open(directory, os.O_RDONLY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
            return {"ok": True, "generation": head["generation"]}
