"""Read-only batches preserve scope and integrity without weakening write CAS."""
import base64
import json
from pathlib import Path
import tempfile
from unittest.mock import patch
from src.workspace_storage import WorkspaceStorage, WorkspaceError


def rejected(code, callback):
    try:
        callback()
    except WorkspaceError as error:
        assert error.code == code, (error.code, code)
    else:
        raise AssertionError("expected " + code)


with tempfile.TemporaryDirectory() as directory:
    storage = WorkspaceStorage(directory)
    workspace, database = "a" * 32, "job-radar-local-first-v1"
    names = ["job_journal_entries", "job_journal_images"]
    entries = []
    for job in ("job-a", "job-b"):
        record = {"entry_id": job + "-entry", "job_context_id": job, "text": None}
        markdown = '---\n' + json.dumps({"format": "ariadne-markdown-v1", "record": record, "fields": [["text"]], "fence": "```"}) + '\n---\n\n## text\n\n```text\nsynthetic\n```\n'
        entries.append({"store": names[0], "operation": "add", "value": {"entry_id": record["entry_id"], "content_format": "ariadne-markdown-v1", "markdown": markdown}})
        entries.append({"store": names[1], "operation": "add", "value": {"image_id": job + "-image", "entry_id": record["entry_id"], "job_context_id": job, "file": {"$blob": "base64", "type": "image/png", "data": base64.b64encode(job.encode()).decode()}}})
    storage.commit(workspace, database, dict.fromkeys(names), entries, initialize=True)
    head = (Path(directory) / workspace / "HEAD.json").read_bytes()
    result = storage.query_records(workspace, database, names[0], job_context_id="job-a")
    assert result["initialized"] and [r["entry_id"] for r in result["records"]] == ["job-a-entry"]
    with patch.object(storage, "_load_record", wraps=storage._load_record) as load:
        result = storage.read_records(workspace, database, names[1], ["job-a-image", "absent", "job-a-image"])
        assert load.call_count == 2, "batch reads only requested identities, with no full image-store scan"
    assert result["records"][0] == result["records"][2] and result["records"][1] is None
    assert result["records"][0]["file"]["data"] == base64.b64encode(b"job-a").decode()
    assert storage.read_records(workspace, database, names[1], [])["records"] == []
    assert (Path(directory) / workspace / "HEAD.json").read_bytes() == head
    for keys in ([""], [123], ["x" * 1025], ["x"] * 1001, "not-a-list"):
        rejected("WORKSPACE_RECORD_ID_INVALID", lambda: storage.read_records(workspace, database, names[1], keys))
    for field in ("", 123, "x" * 1025):
        rejected("WORKSPACE_QUERY_INVALID", lambda: storage.query_records(workspace, database, names[0], job_context_id=field))
    rejected("WORKSPACE_QUERY_INVALID", lambda: storage.query_records(workspace, database, "source_documents", job_context_id="job-a"))
    rejected("WORKSPACE_QUERY_INVALID", lambda: storage.query_records(workspace, database, names[0], metadata_only="true"))
    assert not storage.query_records("b" * 32, database, names[0])["initialized"]
    # A corrupted unrelated original does not poison point reads, but selecting
    # that original still fails hash verification and write snapshots retain CAS.
    manifest = json.loads(head)
    image_entry = manifest["databases"][database][names[1]]["job-b-image"]
    saved_image = json.loads((Path(directory) / workspace / image_entry["path"]).read_text())
    (Path(directory) / workspace / saved_image["file"]["path"]).write_bytes(b"corrupt")
    assert storage.read_records(workspace, database, names[1], ["job-a-image"])["records"]
    rejected("WORKSPACE_FILE_CHANGED", lambda: storage.read_records(workspace, database, names[1], ["job-b-image"]))
    versions = storage.read(workspace, database, [names[0]])["versions"]
    storage.commit(workspace, database, versions, [{"store": names[0], "operation": "delete", "key": "job-b-entry"}])
    rejected("WORKSPACE_VERSION_CONFLICT", lambda: storage.commit(workspace, database, versions, []))
print("PASS workspace query/batch: ordered keys, scoped records, no writes, original integrity and unchanged CAS")
