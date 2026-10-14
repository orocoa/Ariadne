"""Offline cross-language regression for Slice 3 truth/persistence contracts."""

from pathlib import Path
import json
import os
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.execution_contract import create_runtime_snapshot  # noqa: E402
from src.truth_persistence import (  # noqa: E402
    AUTHORITY,
    BATCH_STATUSES,
    CANDIDATE_CONTEXT_LIFECYCLE_STATES,
    CANCEL_REASON,
    CONTEXT_TYPES,
    CONTRACT_ID,
    DB_NAME,
    DB_VERSION,
    FIELDS,
    MATERIAL_TYPES,
    NEW_STORE_SPECS,
    PROCESSING_STATUSES,
    PROPOSAL_STATUSES,
    PROPOSAL_TYPES,
    REVIEW_DECISIONS,
    SCHEMA,
    SOURCE_TYPES,
    STORE_SPECS,
    TruthPersistenceError,
    apply_workspace_acceptance,
    apply_review_decision,
    cancel_processing_run,
    cancel_proposal,
    validate_cancelled_workflow_state,
    validate_context_revision,
    validate_candidate_context_lifecycle,
    validate_candidate_working_model,
    validate_candidate_workspace_acceptance,
    validate_execution_chain,
    validate_extraction_artifact,
    validate_for_store,
    validate_processing_batch,
    validate_processing_run,
    validate_proposal,
    validate_review_decision,
    validate_runtime_snapshot_record,
    validate_source_document,
)


assert CONTRACT_ID == SCHEMA["x-contract-id"]
assert DB_NAME == SCHEMA["x-indexeddb-name"]
assert DB_VERSION == SCHEMA["x-indexeddb-version"] == 20
assert STORE_SPECS == tuple((item["name"], item["keyPath"], item["lifecycle"]) for item in SCHEMA["x-stores"])
assert NEW_STORE_SPECS == tuple(item for item in STORE_SPECS if item[2] == "new")
NODE = os.environ.get("ARIADNE_NODE_BINARY") or shutil.which("node") or str(Path(sys.executable).resolve().parents[2] / "node" / "bin" / "node")
assert Path(NODE).is_file(), "node_required_for_cross_language_storage_contract"
javascript_storage = json.loads(subprocess.run([NODE, "-e", """
const Truth = require('./public/truth-persistence-domain.js');
process.stdout.write(JSON.stringify({contract_id:Truth.CONTRACT_ID, db_name:Truth.DB_NAME, db_version:Truth.DB_VERSION,
  store_specs:Truth.STORE_SPECS, new_store_specs:Truth.NEW_STORE_SPECS, append_only_stores:Truth.APPEND_ONLY_STORES}));
"""], cwd=ROOT, check=True, capture_output=True, text=True).stdout)
assert javascript_storage["contract_id"] == CONTRACT_ID
assert javascript_storage["db_name"] == DB_NAME
assert javascript_storage["db_version"] == DB_VERSION == 20
assert tuple((item["name"], item["keyPath"], item["lifecycle"]) for item in javascript_storage["store_specs"]) == STORE_SPECS
assert tuple((item["name"], item["keyPath"], item["lifecycle"]) for item in javascript_storage["new_store_specs"]) == NEW_STORE_SPECS
resume_contract = json.loads((ROOT / "data" / "resume_task_contract_v1.json").read_text(encoding="utf-8"))
store_by_name = {name: (key_path, lifecycle) for name, key_path, lifecycle in STORE_SPECS}
for name, key_path, kind in [("resume_tasks", "task_id", "tasks"), ("resume_document_versions", "version_id", "documents")]:
    assert store_by_name[name] == (key_path, "new")
    assert resume_contract["stores"][kind]["name"] == name
    assert resume_contract["stores"][kind]["keyPath"] == key_path
assert resume_contract["stores"]["documents"]["append_only"] is True
assert "resume_document_versions" in javascript_storage["append_only_stores"]
assert "resume_tasks" not in javascript_storage["append_only_stores"]
assert SOURCE_TYPES == tuple(SCHEMA["$defs"]["sourceDocument"]["properties"]["source_type"]["enum"])
assert MATERIAL_TYPES == tuple(SCHEMA["$defs"]["sourceDocument"]["properties"]["material_type"]["enum"])
assert PROCESSING_STATUSES == tuple(SCHEMA["$defs"]["processingRun"]["properties"]["status"]["enum"])
assert BATCH_STATUSES == tuple(SCHEMA["$defs"]["processingBatch"]["properties"]["status"]["enum"])
assert PROPOSAL_TYPES == tuple(SCHEMA["$defs"]["proposal"]["properties"]["proposal_type"]["enum"])
assert PROPOSAL_STATUSES == tuple(SCHEMA["$defs"]["proposal"]["properties"]["status"]["enum"])
assert REVIEW_DECISIONS == tuple(SCHEMA["$defs"]["reviewDecision"]["properties"]["decision"]["enum"])
assert CONTEXT_TYPES == tuple(SCHEMA["$defs"]["contextRevision"]["properties"]["context_type"]["enum"])
assert CANDIDATE_CONTEXT_LIFECYCLE_STATES == ("REMOVED",)
assert FIELDS["source"] == tuple(SCHEMA["$defs"]["sourceDocument"]["required"])
assert FIELDS["proposal"] == tuple(SCHEMA["$defs"]["proposal"]["required"])
assert FIELDS["working"] == tuple(SCHEMA["$defs"]["candidateWorkingModel"]["required"])
assert FIELDS["workspace_acceptance"] == tuple(SCHEMA["$defs"]["candidateWorkspaceAcceptance"]["required"])
assert "never retroactively rewritten" in SCHEMA["x-status-semantics"]["processing_run"]


def expect_error(code: str, callback) -> None:
    try:
        callback()
        raise AssertionError(f"expected {code}")
    except TruthPersistenceError as error:
        assert error.code == code, (error.code, code)


timestamp = "2026-09-02T01:00:00Z"
source = {
    "contract_id": "ariadne-source-document-v1",
    "source_document_id": "source-candidate-1",
    "source_type": "PDF",
    "filename": "candidate.pdf",
    "label": None,
    "mime_type": "application/pdf",
    "content_hash": "sha256:candidate-1",
    "created_at": timestamp,
    "material_type": "CANDIDATE",
    "local_reference": "indexeddb://source-candidate-1",
    "batch_id": "batch-candidate-1",
    "provenance": {"supplied_by": "USER", "captured_via": "FILE_PICKER"},
    "authority": AUTHORITY["source"],
}
assert validate_source_document(source)["authority"] == "SOURCE_INPUT_ONLY"
expect_error("embedded_source_bytes_forbidden", lambda: validate_source_document({**source, "file_bytes": "not-allowed"}))

snapshot = create_runtime_snapshot(
    {"mode": "local"},
    snapshot_id="runtime-snapshot-local-slice-3",
    captured_at=timestamp,
)
restored_snapshot = validate_runtime_snapshot_record(json.loads(json.dumps(snapshot.to_dict())))
assert restored_snapshot["snapshot_id"] == snapshot.snapshot_id
assert restored_snapshot["mode"] == "local"

run = {
    "contract_id": "ariadne-processing-run-v1",
    "run_id": "run-candidate-1",
    "operation_type": "CANDIDATE_IMPORT",
    "source_document_id": source["source_document_id"],
    "batch_id": source["batch_id"],
    "runtime_snapshot_id": snapshot.snapshot_id,
    "started_at": timestamp,
    "finished_at": "2026-09-02T01:00:03Z",
    "status": "SUCCEEDED",
    "error_code": None,
    "output_artifact_ids": ["artifact-candidate-1"],
    "proposal_ids": ["proposal-candidate-1"],
    "authority": AUTHORITY["execution"],
}
assert validate_processing_run(run)["status"] == "SUCCEEDED"
failed_run = {**run, "run_id": "run-failed", "status": "FAILED", "error_code": "EXTRACTION_FAILED", "proposal_ids": []}
cancelled_run = {**run, "run_id": "run-cancelled", "status": "CANCELLED", "error_code": "USER_CANCELLED_UPLOAD", "proposal_ids": []}
assert validate_processing_run(failed_run)["status"] == "FAILED"
assert validate_processing_run(cancelled_run)["status"] == "CANCELLED"
expect_error("persistence_secret_field_forbidden", lambda: validate_processing_run({**failed_run, "authorization": "Bearer test-value"}))
expect_error("cancelled_run_proposal_forbidden", lambda: validate_processing_run({**cancelled_run, "proposal_ids": ["proposal-cancelled"]}))

artifact = {
    "contract_id": "ariadne-extraction-artifact-v1",
    "artifact_id": "artifact-candidate-1",
    "source_document_id": source["source_document_id"],
    "processing_run_id": run["run_id"],
    "extraction_method": "PDF_TEXT",
    "payload": {"text": "source-supported text", "document_blocks": [{"block_id": "block-1", "text": "source-supported text"}]},
    "source_refs": [{"source_document_id": source["source_document_id"], "location": "p. 1", "excerpt_or_reference": "source-supported text"}],
    "quality": {"text_layer": "available"},
    "warnings": [],
    "errors": [],
    "created_at": "2026-09-02T01:00:02Z",
    "authority": AUTHORITY["extraction"],
}
assert validate_extraction_artifact(artifact)["authority"] == "NON_AUTHORITATIVE_EXTRACTION"
expect_error(
    "embedded_source_bytes_forbidden",
    lambda: validate_extraction_artifact({**artifact, "payload": {"document_data_url": "data:application/pdf;base64,ZXhhbXBsZQ=="}}),
)

proposal = {
    "contract_id": "ariadne-context-proposal-v1",
    "proposal_id": "proposal-candidate-1",
    "proposal_type": "CANDIDATE_CONTEXT",
    "source_document_ids": [source["source_document_id"]],
    "processing_run_id": run["run_id"],
    "runtime_snapshot_id": snapshot.snapshot_id,
    "status": "AWAITING_REVIEW",
    "created_at": "2026-09-02T01:00:03Z",
    "payload": {"items": [{"item_id": "work-1", "review_status": "NEEDS_REVIEW"}]},
    "grounding_refs": [{"source_document_id": source["source_document_id"], "location": "p. 1", "excerpt_or_reference": "source-supported text"}],
    "warnings": [],
    "uncertainties": [{"code": "OUTCOME_UNKNOWN"}],
    "authority": AUTHORITY["proposal"],
}
assert validate_proposal(proposal)["authority"] == "NON_AUTHORITATIVE_PROPOSAL"
workspace_proposal = validate_proposal({
    **proposal,
    "proposal_id": "proposal-candidate-model-workspace-1",
    "payload": {"contract_id": "ariadne-model-candidate-proposal-payload-v1", "items": [{"item_id": "work-1", "review_status": "NEEDS_REVIEW"}]},
})
chain = validate_execution_chain({"runtime_snapshot": snapshot, "processing_run": run, "proposal": proposal, "source_documents": [source]})
assert chain["proposal"]["proposal_id"] == proposal["proposal_id"]
expect_error(
    "runtime_snapshot_linkage_mismatch",
    lambda: validate_execution_chain({
        "runtime_snapshot": {**snapshot.to_dict(), "snapshot_id": "runtime-snapshot-other"},
        "processing_run": run,
        "proposal": proposal,
        "source_documents": [source],
    }),
)

confirm = {
    "contract_id": "ariadne-context-review-decision-v1",
    "review_id": "review-candidate-1",
    "proposal_id": proposal["proposal_id"],
    "decision": "CONFIRM",
    "reviewed_at": "2026-09-02T01:01:00Z",
    "accepted_payload": proposal["payload"],
    "authority": AUTHORITY["review"],
}
assert validate_review_decision(confirm)["decision"] == "CONFIRM"
confirmed = apply_review_decision({
    "proposal": proposal,
    "review_decision": confirm,
    "current_revision": None,
    "expected_version": 0,
    "context_id": "candidate-context-1",
    "revision_id": "candidate-context-1-v1",
})
assert confirmed["proposal"]["status"] == "ACCEPTED"
assert confirmed["revision"]["authority"] == "AUTHORITATIVE_CONFIRMED_CONTEXT"
assert confirmed["revision"]["version"] == 1
assert confirmed["revision"]["previous_revision_id"] is None
assert confirmed["revision"]["confirmed_from_proposal_id"] == proposal["proposal_id"]
assert confirmed["revision"]["review_decision_id"] == confirm["review_id"]
assert confirmed["revision"]["provenance"]["runtime_snapshot_id"] == snapshot.snapshot_id
expect_error(
    "review_confirm_payload_mismatch",
    lambda: apply_review_decision({
        "proposal": proposal,
        "review_decision": {**confirm, "accepted_payload": {"items": []}},
        "current_revision": None,
        "expected_version": 0,
        "context_id": "candidate-context-mislabeled-edit",
        "revision_id": "candidate-context-mislabeled-edit-v1",
    }),
)

reject = {**confirm, "review_id": "review-candidate-reject", "decision": "REJECT", "accepted_payload": None}
rejected = apply_review_decision({"proposal": proposal, "review_decision": reject})
assert rejected["proposal"]["status"] == "REJECTED"
assert rejected["revision"] is None

edited_payload = {"items": [{"item_id": "work-1", "summary": "user-edited final payload", "review_status": "CONFIRMED"}]}
edit_and_confirm = {**confirm, "review_id": "review-candidate-edit", "decision": "EDIT_AND_CONFIRM", "accepted_payload": edited_payload}
edited = apply_review_decision({
    "proposal": proposal,
    "review_decision": edit_and_confirm,
    "current_revision": confirmed["revision"],
    "expected_version": 1,
    "context_id": "candidate-context-1",
    "revision_id": "candidate-context-1-v2",
})
assert edited["revision"]["version"] == 2
assert edited["revision"]["previous_revision_id"] == confirmed["revision"]["revision_id"]
assert edited["revision"]["payload"] == edited_payload
expect_error(
    "context_version_conflict",
    lambda: apply_review_decision({
        "proposal": proposal,
        "review_decision": edit_and_confirm,
        "current_revision": confirmed["revision"],
        "expected_version": 0,
        "context_id": "candidate-context-1",
        "revision_id": "candidate-context-conflict",
    }),
)
expect_error(
    "proposal_grounding_refs_invalid",
    lambda: apply_review_decision({
        "proposal": {**proposal, "grounding_refs": []},
        "review_decision": confirm,
        "current_revision": None,
        "expected_version": 0,
        "context_id": "candidate-context-invalid",
        "revision_id": "candidate-context-invalid-v1",
    }),
)

working_model = validate_candidate_working_model({
    "contract_id": "ariadne-candidate-working-model-v1",
    "working_model_id": "candidate-working-v1",
    "source_document_id": source["source_document_id"],
    "processing_run_id": run["run_id"],
    "runtime_snapshot_id": snapshot.snapshot_id,
    "proposal_ids": [workspace_proposal["proposal_id"]],
    "version": 1,
    "previous_working_model_id": None,
    "fingerprint": f"sha256:{'a' * 64}",
    "created_at": "2026-09-02T01:02:00Z",
    "payload": {"contract_id": "ariadne-candidate-working-payload-v1", "material_type": "resume", "items": [{"item_id": "work-1", "title": "User-ready card"}]},
    "authority": AUTHORITY["working"],
})
workspace_outcome = apply_workspace_acceptance({
    "working_model": working_model,
    "proposals": [workspace_proposal],
    "current_revision": None,
    "expected_revision_version": 0,
    "context_id": "candidate-workspace-context-1",
    "acceptance_id": "candidate-workspace-acceptance-1",
    "revision_id": "candidate-workspace-revision-1",
    "accepted_at": "2026-09-02T01:03:00Z",
})
assert validate_candidate_workspace_acceptance(workspace_outcome["workspace_acceptance"])["working_model_id"] == working_model["working_model_id"]
assert workspace_outcome["revision"]["contract_id"] == "ariadne-context-revision-v2"
assert workspace_outcome["revision"]["workspace_acceptance_id"] == workspace_outcome["workspace_acceptance"]["acceptance_id"]
assert "review_decision_id" not in workspace_outcome["revision"]
expect_error(
    "workspace_acceptance_lineage_mismatch",
    lambda: apply_workspace_acceptance({
        "working_model": {**working_model, "proposal_ids": [proposal["proposal_id"]]},
        "proposals": [proposal],
        "current_revision": None,
        "expected_revision_version": 0,
        "context_id": "candidate-workspace-local-route-forbidden",
        "acceptance_id": "candidate-workspace-local-route-forbidden",
        "revision_id": "candidate-workspace-local-route-forbidden",
        "accepted_at": "2026-09-02T01:03:00Z",
    }),
)
working_model_v2 = validate_candidate_working_model({
    **working_model,
    "working_model_id": "candidate-working-v2",
    "version": 2,
    "previous_working_model_id": working_model["working_model_id"],
    "fingerprint": f"sha256:{'b' * 64}",
    "created_at": "2026-09-02T01:04:00Z",
})
workspace_outcome_v2 = apply_workspace_acceptance({
    "working_model": working_model_v2,
    "proposals": [workspace_proposal],
    "current_revision": workspace_outcome["revision"],
    "expected_revision_version": 1,
    "context_id": workspace_outcome["revision"]["context_id"],
    "acceptance_id": "candidate-workspace-acceptance-2",
    "revision_id": "candidate-workspace-revision-2",
    "accepted_at": "2026-09-02T01:04:30Z",
})
assert workspace_outcome_v2["revision"]["version"] == 2
assert workspace_outcome_v2["revision"]["previous_revision_id"] == workspace_outcome["revision"]["revision_id"]
expect_error(
    "context_version_conflict",
    lambda: apply_workspace_acceptance({
        "working_model": working_model,
        "proposals": [workspace_proposal],
        "current_revision": None,
        "expected_revision_version": 1,
        "context_id": "candidate-workspace-context-1",
        "acceptance_id": "candidate-workspace-acceptance-conflict",
        "revision_id": "candidate-workspace-revision-conflict",
        "accepted_at": "2026-09-02T01:03:00Z",
    }),
)

job_proposal = {
    **proposal,
    "proposal_id": "proposal-job-1",
    "proposal_type": "JOB_CONTEXT",
    "source_document_ids": ["source-job-1"],
    "grounding_refs": [{"source_document_id": "source-job-1", "location": "lines 1-8", "excerpt_or_reference": "Job title and requirements"}],
    "payload": {"title": "AI Product Manager", "requirements": ["Product judgment"]},
}
job_decision = {**confirm, "review_id": "review-job-1", "proposal_id": job_proposal["proposal_id"], "accepted_payload": job_proposal["payload"]}
job_outcome = apply_review_decision({
    "proposal": job_proposal,
    "review_decision": job_decision,
    "current_revision": None,
    "expected_version": 0,
    "context_id": "job-context-1",
    "revision_id": "job-context-1-v1",
})
assert job_outcome["revision"]["context_type"] == "JOB"
assert validate_for_store("job_context_revisions", job_outcome["revision"])["revision_id"] == "job-context-1-v1"
expect_error("context_revision_store_mismatch", lambda: validate_for_store("candidate_context_revisions", job_outcome["revision"]))

cancelled_batch = {
    "contract_id": "ariadne-processing-batch-v1",
    "batch_id": "batch-cancel-1",
    "operation_type": "CANDIDATE_IMPORT",
    "source_document_ids": ["source-prior", "source-cancelled", "source-not-started"],
    "completed_source_ids": ["source-prior"],
    "cancelled_source_id": "source-cancelled",
    "not_started_source_ids": ["source-not-started"],
    "status": "CANCELLED",
    "created_at": timestamp,
    "finished_at": "2026-09-02T01:05:00Z",
    "cancelled_at": "2026-09-02T01:05:00Z",
    "cancel_reason": CANCEL_REASON,
    "authority": AUTHORITY["execution"],
}
validated_batch = validate_processing_batch(cancelled_batch)
assert validated_batch["completed_source_ids"] == ["source-prior"]
assert validated_batch["cancelled_source_id"] not in validated_batch["completed_source_ids"]
completed_batch = {
    **cancelled_batch,
    "completed_source_ids": list(cancelled_batch["source_document_ids"]),
    "cancelled_source_id": None,
    "not_started_source_ids": [],
    "status": "COMPLETED",
    "cancelled_at": None,
    "cancel_reason": None,
}
assert validate_processing_batch(completed_batch)["status"] == "COMPLETED"
expect_error("processing_batch_status_invalid", lambda: validate_processing_batch({**completed_batch, "status": "SUCCEEDED"}))
expect_error("processing_batch_source_partition_overlap", lambda: validate_processing_batch({**cancelled_batch, "completed_source_ids": ["source-prior", "source-cancelled"]}))
expect_error("processing_batch_cancel_contract_invalid", lambda: validate_processing_batch({**cancelled_batch, "cancel_reason": "CONTINUE_QUEUE"}))

# Case 1: execution stops before a valid Proposal exists.
current_source_cancelled_batch = {
    **cancelled_batch,
    "batch_id": source["batch_id"],
    "source_document_ids": [source["source_document_id"], "source-next"],
    "completed_source_ids": [],
    "cancelled_source_id": source["source_document_id"],
    "not_started_source_ids": ["source-next"],
}
running_before_cancel = {
    **run,
    "run_id": "run-cancel-before-output",
    "started_at": "2026-09-02T01:02:00Z",
    "finished_at": None,
    "status": "RUNNING",
    "error_code": None,
    "output_artifact_ids": [],
    "proposal_ids": [],
}
cancelled_before_output = cancel_processing_run(running_before_cancel, current_source_cancelled_batch["cancelled_at"])
assert cancelled_before_output["status"] == "CANCELLED"
assert cancelled_before_output["proposal_ids"] == []
case_one = validate_cancelled_workflow_state({
    "processing_batch": current_source_cancelled_batch,
    "processing_run": cancelled_before_output,
    "proposal": None,
})
assert case_one["processing_batch"]["status"] == "CANCELLED"

# Case 2: successful execution is not rewritten when the user later cancels the workflow.
proposal_cancelled_after_success = cancel_proposal(proposal)
case_two = validate_cancelled_workflow_state({
    "processing_batch": current_source_cancelled_batch,
    "processing_run": run,
    "proposal": proposal_cancelled_after_success,
})
assert case_two["processing_run"]["status"] == "SUCCEEDED"
assert case_two["proposal"]["status"] == "CANCELLED_BY_USER"
assert case_two["proposal"]["authority"] == "NON_AUTHORITATIVE_PROPOSAL"
expect_error(
    "proposal_not_reviewable",
    lambda: apply_review_decision({
        "proposal": proposal_cancelled_after_success,
        "review_decision": confirm,
        "current_revision": None,
        "expected_version": 0,
        "context_id": "candidate-cancelled",
        "revision_id": "candidate-cancelled-v1",
    }),
)

# Case 3: an in-flight request can report its true late outcome without restoring the cancelled workflow.
in_flight_after_workflow_cancel = {**running_before_cancel, "run_id": "run-provider-in-flight-after-cancel"}
case_three_in_flight = validate_cancelled_workflow_state({
    "processing_batch": current_source_cancelled_batch,
    "processing_run": in_flight_after_workflow_cancel,
    "proposal": None,
})
assert case_three_in_flight["processing_run"]["status"] == "RUNNING"
assert case_three_in_flight["processing_batch"]["status"] == "CANCELLED"
late_succeeded_run = {
    **in_flight_after_workflow_cancel,
    "status": "SUCCEEDED",
    "finished_at": "2026-09-02T01:06:00Z",
    "output_artifact_ids": ["artifact-provider-response-after-cancel"],
}
case_three_late = validate_cancelled_workflow_state({
    "processing_batch": current_source_cancelled_batch,
    "processing_run": late_succeeded_run,
    "proposal": None,
})
assert case_three_late["processing_run"]["status"] == "SUCCEEDED"
assert case_three_late["processing_batch"]["status"] == "CANCELLED"
assert case_three_late["processing_batch"]["not_started_source_ids"] == ["source-next"]
expect_error(
    "cancelled_workflow_proposal_reviewable",
    lambda: validate_cancelled_workflow_state({
        "processing_batch": current_source_cancelled_batch,
        "processing_run": late_succeeded_run,
        "proposal": {**proposal, "processing_run_id": late_succeeded_run["run_id"]},
    }),
)

cancelled_job_proposal = cancel_proposal(job_proposal)
assert cancelled_job_proposal["status"] == "CANCELLED_BY_USER"
expect_error(
    "proposal_not_reviewable",
    lambda: apply_review_decision({
        "proposal": cancelled_job_proposal,
        "review_decision": job_decision,
        "current_revision": None,
        "expected_version": 0,
        "context_id": "job-cancelled",
        "revision_id": "job-cancelled-v1",
    }),
)

candidate_revision = validate_context_revision(confirmed["revision"])
assert candidate_revision["version"] == 1
lifecycle = {
    "contract_id": "ariadne-candidate-context-lifecycle-v1",
    "lifecycle_id": "candidate-context-removal-1",
    "context_id": candidate_revision["context_id"],
    "item_id": candidate_revision["payload"]["items"][0]["item_id"],
    "state": "REMOVED",
    "removed_from_revision_id": candidate_revision["revision_id"],
    "removed_at": "2026-09-02T01:07:00Z",
    "reason": "USER_REMOVED",
    "authority": AUTHORITY["lifecycle"],
}
assert validate_candidate_context_lifecycle(lifecycle)["context_id"] == candidate_revision["context_id"]
assert validate_for_store("candidate_context_lifecycle", lifecycle)["state"] == "REMOVED"
expect_error("candidate_context_lifecycle_reason_invalid", lambda: validate_candidate_context_lifecycle({**lifecycle, "reason": "HARD_DELETE"}))
assert source["source_document_id"] == "source-candidate-1"  # Lifecycle validation never mutates source/evidence history.
assert artifact["artifact_id"] == "artifact-candidate-1"
assert proposal["proposal_id"] == "proposal-candidate-1"

source_text = (ROOT / "src" / "truth_persistence.py").read_text(encoding="utf-8")
assert "requests." not in source_text and "urlopen" not in source_text
print("truth_persistence_python_contract=pass")

job_removal = {
    "contract_id": "ariadne-job-context-lifecycle-v1", "lifecycle_id": "job-removal-test",
    "context_id": "job-context-1", "state": "REMOVED", "removed_from_revision_id": "job-context-1-v1",
    "removed_at": "2026-09-20T00:00:00Z", "reason": "USER_REMOVED", "authority": "AUTHORITATIVE_USER_DECISION",
}
assert validate_for_store("job_context_lifecycle", job_removal) == job_removal
try:
    validate_for_store("job_context_lifecycle", {**job_removal, "authority": "MODEL"})
    raise AssertionError("model cannot authorize card removal")
except TruthPersistenceError:
    pass
