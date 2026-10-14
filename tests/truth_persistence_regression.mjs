import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const Truth = require("../public/truth-persistence-domain.js");
const Runtime = require("../public/runtime-capabilities.js");
const Demo = require("../public/v1-demo-domain.js");
const schema = JSON.parse(fs.readFileSync(path.join(root, "data", "truth_persistence_v1.schema.json"), "utf8"));

assert.equal(Truth.CONTRACT_ID, schema["x-contract-id"]);
assert.equal(Truth.DB_NAME, schema["x-indexeddb-name"]);
assert.equal(Truth.DB_VERSION, schema["x-indexeddb-version"]);
assert.equal(Truth.DB_VERSION, 20, "the task/document store upgrade has an explicit new database version");
assert.deepEqual(
  Truth.STORE_SPECS.map(({ name, keyPath, lifecycle }) => ({ name, keyPath, lifecycle })),
  schema["x-stores"],
);
for (const [name, keyPath] of [["resume_tasks", "task_id"], ["resume_document_versions", "version_id"]]) {
  assert.deepEqual(Truth.STORE_SPECS.find(spec => spec.name === name), { name, keyPath, lifecycle: "new" });
}
assert(Truth.APPEND_ONLY_STORES.includes("resume_document_versions"), "complete resume document versions are immutable history");
assert(!Truth.APPEND_ONLY_STORES.includes("resume_tasks"), "the task head can advance through CAS");
assert.deepEqual([...Truth.FIELDS.source], schema.$defs.sourceDocument.required);
assert.deepEqual([...Truth.FIELDS.extraction], schema.$defs.extractionArtifact.required);
assert.deepEqual([...Truth.FIELDS.run], schema.$defs.processingRun.required);
assert.deepEqual([...Truth.FIELDS.batch], schema.$defs.processingBatch.required);
assert.deepEqual([...Truth.FIELDS.proposal], schema.$defs.proposal.required);
assert.deepEqual([...Truth.FIELDS.review], schema.$defs.reviewDecision.required);
assert.deepEqual([...Truth.FIELDS.working], schema.$defs.candidateWorkingModel.required);
assert.deepEqual([...Truth.FIELDS.workspace_acceptance], schema.$defs.candidateWorkspaceAcceptance.required);
assert.deepEqual([...Truth.FIELDS.revision], schema.$defs.contextRevision.required);
assert.deepEqual([...Truth.FIELDS.workspace_revision], schema.$defs.workspaceContextRevision.required);
assert.deepEqual([...Truth.FIELDS.lifecycle], schema.$defs.candidateContextLifecycle.required);
assert.deepEqual([...Truth.SOURCE_TYPES], schema.$defs.sourceDocument.properties.source_type.enum);
assert.deepEqual([...Truth.MATERIAL_TYPES], schema.$defs.sourceDocument.properties.material_type.enum);
assert.deepEqual([...Truth.PROCESSING_STATUSES], schema.$defs.processingRun.properties.status.enum);
assert.deepEqual([...Truth.BATCH_STATUSES], schema.$defs.processingBatch.properties.status.enum);
assert.deepEqual([...Truth.PROPOSAL_TYPES], schema.$defs.proposal.properties.proposal_type.enum);
assert.deepEqual([...Truth.PROPOSAL_STATUSES], schema.$defs.proposal.properties.status.enum);
assert.deepEqual([...Truth.REVIEW_DECISIONS], schema.$defs.reviewDecision.properties.decision.enum);
assert.deepEqual([...Truth.CONTEXT_TYPES], schema.$defs.contextRevision.properties.context_type.enum);
assert.match(schema["x-status-semantics"].processing_run, /never retroactively rewritten/);

const timestamp = "2026-09-02T01:00:00Z";
const source = {
  contract_id: "ariadne-source-document-v1",
  source_document_id: "source-candidate-1",
  source_type: "PDF",
  filename: "candidate.pdf",
  label: null,
  mime_type: "application/pdf",
  content_hash: "sha256:candidate-1",
  created_at: timestamp,
  material_type: "CANDIDATE",
  local_reference: "indexeddb://source-candidate-1",
  batch_id: "batch-candidate-1",
  provenance: { supplied_by: "USER", captured_via: "FILE_PICKER" },
  authority: Truth.AUTHORITY.source,
};
assert.equal(Truth.validateSourceDocument(source).authority, "SOURCE_INPUT_ONLY");
assert.throws(
  () => Truth.validateSourceDocument({ ...source, file_blob: { bytes: "not-allowed" } }),
  (error) => error.code === "embedded_source_bytes_forbidden",
);

const localSnapshot = Runtime.createRuntimeSnapshot(
  { mode: "local" },
  { snapshotId: "runtime-snapshot-local-slice-3", capturedAt: timestamp },
);
const restoredSnapshot = Truth.validateRuntimeSnapshotRecord(JSON.parse(JSON.stringify(localSnapshot)));
assert.equal(restoredSnapshot.snapshot_id, localSnapshot.snapshot_id);
assert.equal(restoredSnapshot.mode, "local");

const run = {
  contract_id: "ariadne-processing-run-v1",
  run_id: "run-candidate-1",
  operation_type: "CANDIDATE_IMPORT",
  source_document_id: source.source_document_id,
  batch_id: source.batch_id,
  runtime_snapshot_id: localSnapshot.snapshot_id,
  started_at: timestamp,
  finished_at: "2026-09-02T01:00:03Z",
  status: "SUCCEEDED",
  error_code: null,
  output_artifact_ids: ["artifact-candidate-1"],
  proposal_ids: ["proposal-candidate-1"],
  authority: Truth.AUTHORITY.execution,
};
assert.equal(Truth.validateProcessingRun(run).status, "SUCCEEDED");
const failedRun = { ...run, run_id: "run-failed", status: "FAILED", error_code: "EXTRACTION_FAILED", proposal_ids: [] };
const cancelledRun = { ...run, run_id: "run-cancelled", status: "CANCELLED", error_code: "USER_CANCELLED_UPLOAD", proposal_ids: [] };
assert.equal(Truth.validateProcessingRun(failedRun).status, "FAILED");
assert.equal(Truth.validateProcessingRun(cancelledRun).status, "CANCELLED");
assert.throws(
  () => Truth.validateProcessingRun({ ...failedRun, authorization: "Bearer test-value" }),
  (error) => ["persistence_secret_field_forbidden", "processing_run_shape_invalid"].includes(error.code),
);
assert.throws(
  () => Truth.validateProcessingRun({ ...cancelledRun, proposal_ids: ["proposal-for-cancelled-source"] }),
  (error) => error.code === "cancelled_run_proposal_forbidden",
);

const artifact = {
  contract_id: "ariadne-extraction-artifact-v1",
  artifact_id: "artifact-candidate-1",
  source_document_id: source.source_document_id,
  processing_run_id: run.run_id,
  extraction_method: "PDF_TEXT",
  payload: { text: "source-supported text", document_blocks: [{ block_id: "block-1", text: "source-supported text" }] },
  source_refs: [{ source_document_id: source.source_document_id, location: "p. 1", excerpt_or_reference: "source-supported text" }],
  quality: { text_layer: "available" },
  warnings: [],
  errors: [],
  created_at: "2026-09-02T01:00:02Z",
  authority: Truth.AUTHORITY.extraction,
};
assert.equal(Truth.validateExtractionArtifact(artifact).authority, "NON_AUTHORITATIVE_EXTRACTION");
assert.throws(
  () => Truth.validateExtractionArtifact({ ...artifact, payload: { document_data_url: "data:application/pdf;base64,ZXhhbXBsZQ==" } }),
  (error) => error.code === "embedded_source_bytes_forbidden",
);

const proposal = {
  contract_id: "ariadne-context-proposal-v1",
  proposal_id: "proposal-candidate-1",
  proposal_type: "CANDIDATE_CONTEXT",
  source_document_ids: [source.source_document_id],
  processing_run_id: run.run_id,
  runtime_snapshot_id: localSnapshot.snapshot_id,
  status: "AWAITING_REVIEW",
  created_at: "2026-09-02T01:00:03Z",
  payload: { items: [{ item_id: "work-1", review_status: "NEEDS_REVIEW" }] },
  grounding_refs: [{ source_document_id: source.source_document_id, location: "p. 1", excerpt_or_reference: "source-supported text" }],
  warnings: [],
  uncertainties: [{ code: "OUTCOME_UNKNOWN" }],
  authority: Truth.AUTHORITY.proposal,
};
assert.equal(Truth.validateProposal(proposal).authority, "NON_AUTHORITATIVE_PROPOSAL");
const workspaceProposal = Truth.validateProposal({ ...proposal, proposal_id: "proposal-candidate-model-workspace-1", payload: { contract_id: "ariadne-model-candidate-proposal-payload-v1", items: [{ item_id: "work-1", review_status: "NEEDS_REVIEW" }] } });
assert.equal(Truth.validateExecutionChain({ runtime_snapshot: localSnapshot, processing_run: run, proposal, source_documents: [source] }).proposal.proposal_id, proposal.proposal_id);
assert.throws(
  () => Truth.validateExecutionChain({ runtime_snapshot: { ...localSnapshot, snapshot_id: "runtime-snapshot-other" }, processing_run: run, proposal, source_documents: [source] }),
  (error) => error.code === "runtime_snapshot_linkage_mismatch",
);

const confirm = {
  contract_id: "ariadne-context-review-decision-v1",
  review_id: "review-candidate-1",
  proposal_id: proposal.proposal_id,
  decision: "CONFIRM",
  reviewed_at: "2026-09-02T01:01:00Z",
  accepted_payload: proposal.payload,
  authority: Truth.AUTHORITY.review,
};
const confirmed = Truth.applyReviewDecision({
  proposal,
  review_decision: confirm,
  current_revision: null,
  expected_version: 0,
  context_id: "candidate-context-1",
  revision_id: "candidate-context-1-v1",
});
assert.equal(confirmed.proposal.status, "ACCEPTED");
assert.equal(confirmed.review_decision.authority, "AUTHORITATIVE_USER_DECISION");
assert.equal(confirmed.revision.authority, "AUTHORITATIVE_CONFIRMED_CONTEXT");
assert.equal(confirmed.revision.version, 1);
assert.equal(confirmed.revision.previous_revision_id, null);
assert.equal(confirmed.revision.confirmed_from_proposal_id, proposal.proposal_id);
assert.equal(confirmed.revision.review_decision_id, confirm.review_id);
assert.equal(confirmed.revision.provenance.runtime_snapshot_id, localSnapshot.snapshot_id);
const lifecycle = Truth.validateCandidateContextLifecycle({
  contract_id: "ariadne-candidate-context-lifecycle-v1",
  lifecycle_id: "candidate-context-removal-1",
  context_id: confirmed.revision.context_id,
  item_id: confirmed.revision.payload.items[0].item_id,
  state: "REMOVED",
  removed_from_revision_id: confirmed.revision.revision_id,
  removed_at: "2026-09-02T01:01:30Z",
  reason: "USER_REMOVED",
  authority: Truth.AUTHORITY.lifecycle,
});
assert.equal(lifecycle.item_id, "work-1");
assert.throws(() => Truth.validateCandidateContextLifecycle({ ...lifecycle, item_id: "" }), (error) => error.code === "candidate_context_lifecycle_item_id_invalid");
assert.throws(
  () => Truth.applyReviewDecision({ proposal, review_decision: { ...confirm, accepted_payload: { items: [] } }, current_revision: null, expected_version: 0, context_id: "candidate-context-mislabeled-edit", revision_id: "candidate-context-mislabeled-edit-v1" }),
  (error) => error.code === "review_confirm_payload_mismatch",
);

const reject = {
  ...confirm,
  review_id: "review-candidate-reject",
  decision: "REJECT",
  accepted_payload: null,
};
const rejected = Truth.applyReviewDecision({ proposal, review_decision: reject });
assert.equal(rejected.proposal.status, "REJECTED");
assert.equal(rejected.revision, null);

const editedPayload = { items: [{ item_id: "work-1", summary: "user-edited final payload", review_status: "CONFIRMED" }] };
const editAndConfirm = { ...confirm, review_id: "review-candidate-edit", decision: "EDIT_AND_CONFIRM", accepted_payload: editedPayload };
const edited = Truth.applyReviewDecision({
  proposal,
  review_decision: editAndConfirm,
  current_revision: confirmed.revision,
  expected_version: 1,
  context_id: "candidate-context-1",
  revision_id: "candidate-context-1-v2",
});
assert.equal(edited.revision.version, 2);
assert.equal(edited.revision.previous_revision_id, confirmed.revision.revision_id);
assert.deepEqual(edited.revision.payload, editedPayload);
assert.throws(
  () => Truth.applyReviewDecision({ proposal, review_decision: editAndConfirm, current_revision: confirmed.revision, expected_version: 0, context_id: "candidate-context-1", revision_id: "candidate-context-1-v2-conflict" }),
  (error) => error.code === "context_version_conflict",
);
assert.throws(
  () => Truth.applyReviewDecision({ proposal: { ...proposal, grounding_refs: [] }, review_decision: confirm, current_revision: null, expected_version: 0, context_id: "candidate-context-invalid", revision_id: "candidate-context-invalid-v1" }),
  (error) => error.code === "proposal_grounding_refs_invalid",
);

const workingModel = Truth.validateCandidateWorkingModel({
  contract_id: "ariadne-candidate-working-model-v1",
  working_model_id: "candidate-working-v1",
  source_document_id: source.source_document_id,
  processing_run_id: run.run_id,
  runtime_snapshot_id: localSnapshot.snapshot_id,
  proposal_ids: [workspaceProposal.proposal_id],
  version: 1,
  previous_working_model_id: null,
  fingerprint: `sha256:${"a".repeat(64)}`,
  created_at: "2026-09-02T01:02:00Z",
  payload: { contract_id: "ariadne-candidate-working-payload-v1", material_type: "resume", items: [{ item_id: "work-1", title: "User-ready card" }] },
  authority: Truth.AUTHORITY.working,
});
const workspaceOutcome = Truth.applyWorkspaceAcceptance({
  working_model: workingModel,
  proposals: [workspaceProposal],
  current_revision: null,
  expected_revision_version: 0,
  context_id: "candidate-workspace-context-1",
  acceptance_id: "candidate-workspace-acceptance-1",
  revision_id: "candidate-workspace-revision-1",
  accepted_at: "2026-09-02T01:03:00Z",
});
assert.equal(workspaceOutcome.workspace_acceptance.authority, Truth.AUTHORITY.workspace_acceptance);
assert.equal(workspaceOutcome.workspace_acceptance.working_model_fingerprint, workingModel.fingerprint);
assert.equal(workspaceOutcome.revision.contract_id, "ariadne-context-revision-v2");
assert.equal(workspaceOutcome.revision.workspace_acceptance_id, workspaceOutcome.workspace_acceptance.acceptance_id);
assert.equal(workspaceOutcome.revision.previous_revision_id, null);
assert(!("review_decision_id" in workspaceOutcome.revision));
assert.throws(
  () => Truth.applyWorkspaceAcceptance({ working_model: { ...workingModel, proposal_ids: [proposal.proposal_id] }, proposals: [proposal], current_revision: null, expected_revision_version: 0, context_id: "candidate-workspace-local-route-forbidden", acceptance_id: "candidate-workspace-local-route-forbidden", revision_id: "candidate-workspace-local-route-forbidden", accepted_at: "2026-09-02T01:03:00Z" }),
  (error) => error.code === "workspace_acceptance_lineage_mismatch",
);
assert.throws(
  () => Truth.applyWorkspaceAcceptance({ ...workspaceOutcome, working_model: workingModel, proposals: [workspaceProposal], current_revision: null, expected_revision_version: 1, context_id: "candidate-workspace-context-1", acceptance_id: "candidate-workspace-acceptance-conflict", revision_id: "candidate-workspace-revision-conflict", accepted_at: "2026-09-02T01:03:00Z" }),
  (error) => error.code === "context_version_conflict",
);

const jobSource = { ...source, source_document_id: "source-job-1", material_type: "JOB", filename: "job.md", source_type: "MARKDOWN", content_hash: "sha256:job-1" };
const jobProposal = {
  ...proposal,
  proposal_id: "proposal-job-1",
  proposal_type: "JOB_CONTEXT",
  source_document_ids: [jobSource.source_document_id],
  grounding_refs: [{ source_document_id: jobSource.source_document_id, location: "lines 1-8", excerpt_or_reference: "Job title and requirements" }],
  payload: { title: "AI Product Manager", requirements: ["Product judgment"] },
};
const jobDecision = { ...confirm, review_id: "review-job-1", proposal_id: jobProposal.proposal_id, accepted_payload: jobProposal.payload };
const jobOutcome = Truth.applyReviewDecision({ proposal: jobProposal, review_decision: jobDecision, current_revision: null, expected_version: 0, context_id: "job-context-1", revision_id: "job-context-1-v1" });
assert.equal(jobOutcome.revision.context_type, "JOB");
assert.equal(Truth.validateForStore("job_context_revisions", jobOutcome.revision).revision_id, "job-context-1-v1");
assert.throws(
  () => Truth.validateForStore("candidate_context_revisions", jobOutcome.revision),
  (error) => error.code === "context_revision_store_mismatch",
);

const cancelledBatch = {
  contract_id: "ariadne-processing-batch-v1",
  batch_id: "batch-cancel-1",
  operation_type: "CANDIDATE_IMPORT",
  source_document_ids: ["source-prior", "source-cancelled", "source-never-started"],
  completed_source_ids: ["source-prior"],
  cancelled_source_id: "source-cancelled",
  not_started_source_ids: ["source-never-started"],
  status: "CANCELLED",
  created_at: timestamp,
  finished_at: "2026-09-02T01:05:00Z",
  cancelled_at: "2026-09-02T01:05:00Z",
  cancel_reason: Truth.CANCEL_REASON,
  authority: Truth.AUTHORITY.execution,
};
assert.deepEqual(Truth.validateProcessingBatch(cancelledBatch).completed_source_ids, ["source-prior"]);
const completedBatch = {
  ...cancelledBatch,
  completed_source_ids: [...cancelledBatch.source_document_ids],
  cancelled_source_id: null,
  not_started_source_ids: [],
  status: "COMPLETED",
  cancelled_at: null,
  cancel_reason: null,
};
assert.equal(Truth.validateProcessingBatch(completedBatch).status, "COMPLETED");
assert.throws(() => Truth.validateProcessingBatch({ ...completedBatch, status: "SUCCEEDED" }), (error) => error.code === "processing_batch_status_invalid");
assert.throws(
  () => Truth.validateProcessingBatch({ ...cancelledBatch, completed_source_ids: ["source-prior", "source-cancelled"] }),
  (error) => error.code === "processing_batch_source_partition_overlap",
);
assert.throws(
  () => Truth.validateProcessingBatch({ ...cancelledBatch, cancel_reason: "CONTINUE_QUEUE" }),
  (error) => error.code === "processing_batch_cancel_contract_invalid",
);

// Case 1: execution really stops before a Proposal exists.
const currentSourceCancelledBatch = {
  ...cancelledBatch,
  batch_id: source.batch_id,
  source_document_ids: [source.source_document_id, "source-next"],
  completed_source_ids: [],
  cancelled_source_id: source.source_document_id,
  not_started_source_ids: ["source-next"],
};
const runningBeforeCancel = {
  ...run,
  run_id: "run-cancel-before-output",
  started_at: "2026-09-02T01:02:00Z",
  finished_at: null,
  status: "RUNNING",
  error_code: null,
  output_artifact_ids: [],
  proposal_ids: [],
};
const cancelledBeforeOutput = Truth.cancelProcessingRun(runningBeforeCancel, currentSourceCancelledBatch.cancelled_at);
assert.equal(cancelledBeforeOutput.status, "CANCELLED");
assert.deepEqual(cancelledBeforeOutput.proposal_ids, []);
assert.equal(Truth.validateCancelledWorkflowState({ processing_batch: currentSourceCancelledBatch, processing_run: cancelledBeforeOutput, proposal: null }).processing_batch.status, "CANCELLED");

// Case 2: a successful run is historical fact; later workflow cancellation only cancels the Proposal/disposition.
const proposalCancelledAfterSuccess = Truth.cancelProposal(proposal);
const cancelledAfterSuccess = Truth.validateCancelledWorkflowState({
  processing_batch: currentSourceCancelledBatch,
  processing_run: run,
  proposal: proposalCancelledAfterSuccess,
});
assert.equal(cancelledAfterSuccess.processing_run.status, "SUCCEEDED");
assert.equal(cancelledAfterSuccess.proposal.status, "CANCELLED_BY_USER");
assert.equal(cancelledAfterSuccess.proposal.authority, "NON_AUTHORITATIVE_PROPOSAL");
assert.throws(
  () => Truth.applyReviewDecision({ proposal: proposalCancelledAfterSuccess, review_decision: confirm, current_revision: null, expected_version: 0, context_id: "candidate-cancelled", revision_id: "candidate-cancelled-v1" }),
  (error) => error.code === "proposal_not_reviewable",
);

// Case 3: a non-cancellable in-flight request may finish, but the workflow/batch remains cancelled and the queue remains stopped.
const inFlightAfterWorkflowCancel = {
  ...runningBeforeCancel,
  run_id: "run-provider-in-flight-after-cancel",
};
const inFlightState = Truth.validateCancelledWorkflowState({ processing_batch: currentSourceCancelledBatch, processing_run: inFlightAfterWorkflowCancel, proposal: null });
assert.equal(inFlightState.processing_run.status, "RUNNING");
assert.equal(inFlightState.processing_batch.status, "CANCELLED");
const lateSucceededRun = {
  ...inFlightAfterWorkflowCancel,
  status: "SUCCEEDED",
  finished_at: "2026-09-02T01:06:00Z",
  output_artifact_ids: ["artifact-provider-response-after-cancel"],
};
const lateResultState = Truth.validateCancelledWorkflowState({ processing_batch: currentSourceCancelledBatch, processing_run: lateSucceededRun, proposal: null });
assert.equal(lateResultState.processing_run.status, "SUCCEEDED");
assert.equal(lateResultState.processing_batch.status, "CANCELLED");
assert.deepEqual(lateResultState.processing_batch.not_started_source_ids, ["source-next"]);
assert.throws(
  () => Truth.validateCancelledWorkflowState({ processing_batch: currentSourceCancelledBatch, processing_run: lateSucceededRun, proposal: { ...proposal, processing_run_id: lateSucceededRun.run_id } }),
  (error) => error.code === "cancelled_workflow_proposal_reviewable",
);

const cancelledJobProposal = Truth.cancelProposal(jobProposal);
assert.equal(cancelledJobProposal.status, "CANCELLED_BY_USER");
assert.throws(
  () => Truth.applyReviewDecision({ proposal: cancelledJobProposal, review_decision: jobDecision, current_revision: null, expected_version: 0, context_id: "job-cancelled", revision_id: "job-cancelled-v1" }),
  (error) => error.code === "proposal_not_reviewable",
);

function migrationDatabase(existingNames) {
  const names = new Set(existingNames);
  const created = [];
  return {
    objectStoreNames: { contains: (name) => names.has(name) },
    createObjectStore(name, options) { names.add(name); created.push({ name, keyPath: options.keyPath }); return {}; },
    created,
  };
}

const legacyDemoRow = { item_id: "demo-existing", data_class: "DEMO_FIXTURE", review_status: "NEEDS_REVIEW" };
const migrationDb = migrationDatabase(["source_documents", "processing_runs", "conversation_sessions", "conversation_messages", "demo_candidate_items", "demo_job_contexts", "demo_conversations", "demo_ui_state"]);
const createdStores = Truth.ensureTruthStores(migrationDb);
assert.deepEqual(createdStores.sort(), Truth.NEW_STORE_SPECS.map((spec) => spec.name).sort());
for (const [name, keyPath] of [["resume_tasks", "task_id"], ["resume_document_versions", "version_id"]]) {
  assert.deepEqual(migrationDb.created.find(spec => spec.name === name), { name, keyPath });
}
assert.equal(legacyDemoRow.data_class, "DEMO_FIXTURE");
assert.equal(Demo.DATA_CLASS, "DEMO_FIXTURE");
assert(Demo.STORES.some(([name]) => name === "demo_candidate_items"));
assert(Demo.STORES.some(([name]) => name === "demo_job_contexts"));

function memoryDatabase() {
  const specs = new Map(Truth.STORE_SPECS.map((spec) => [spec.name, spec]));
  const records = new Map([...specs].map(([name]) => [name, new Map()]));
  return {
    records,
    transaction(storeNames) {
      let completionQueued = false;
      const tx = {
        abort() { queueMicrotask(() => tx.onabort?.()); },
        objectStore(name) {
          const spec = specs.get(name);
          assert(spec, `unknown memory store ${name}`);
          const scheduleComplete = () => {
            if (completionQueued) return;
            completionQueued = true;
            queueMicrotask(() => tx.oncomplete?.());
          };
          return {
            put(value) { records.get(name).set(value[spec.keyPath], structuredClone(value)); scheduleComplete(); },
            add(value) {
              const key = value[spec.keyPath];
              if (records.get(name).has(key)) throw new Error("ConstraintError");
              records.get(name).set(key, structuredClone(value));
              scheduleComplete();
            },
            getAll() {
              const request = {};
              queueMicrotask(() => { request.result = [...records.get(name).values()].map((value) => structuredClone(value)); request.onsuccess?.(); });
              return request;
            },
            get(key) {
              const request = {};
              queueMicrotask(() => { request.result = records.get(name).has(key) ? structuredClone(records.get(name).get(key)) : undefined; request.onsuccess?.(); });
              return request;
            },
          };
        },
      };
      return tx;
    },
  };
}

const memoryDb = memoryDatabase();
await Truth.persistRecord(memoryDb, "source_documents", source);
assert(memoryDb.records.get("source_documents").has(source.source_document_id));
assert.equal(memoryDb.records.get("candidate_context_revisions").size, 0); // Persisting Source alone creates no Candidate/Job truth.
await Truth.persistRecord(memoryDb, "runtime_snapshots", localSnapshot);
assert.deepEqual(memoryDb.records.get("runtime_snapshots").get(localSnapshot.snapshot_id), JSON.parse(JSON.stringify(localSnapshot)));
await assert.rejects(Truth.persistRecord(memoryDb, "runtime_snapshots", localSnapshot), /ConstraintError/);
await Truth.persistRecord(memoryDb, "extraction_artifacts", artifact);
await Truth.persistRecord(memoryDb, "processing_runs", run);
await Truth.persistRecord(memoryDb, "context_proposals", proposal);
await Truth.persistRecord(memoryDb, "context_proposals", workspaceProposal);
assert.equal(memoryDb.records.get("context_proposals").get(proposal.proposal_id).authority, "NON_AUTHORITATIVE_PROPOSAL");
assert.equal(memoryDb.records.get("candidate_context_revisions").size, 0); // Persisted Proposal is still not authoritative.
await Truth.persistRecord(memoryDb, "candidate_working_models", workingModel);
assert.equal(memoryDb.records.get("candidate_context_revisions").size, 0); // Working Model is still not authoritative.
const reviewCountBeforeWorkspaceAcceptance = memoryDb.records.get("context_review_decisions").size;
await Truth.persistWorkspaceAcceptance(memoryDb, workspaceOutcome);
assert(memoryDb.records.get("candidate_workspace_acceptances").has(workspaceOutcome.workspace_acceptance.acceptance_id));
assert(memoryDb.records.get("candidate_context_revisions").has(workspaceOutcome.revision.revision_id));
assert.equal(memoryDb.records.get("context_review_decisions").size, reviewCountBeforeWorkspaceAcceptance); // Workspace acceptance never fabricates item reviews.
const newerWorkingModel = Truth.validateCandidateWorkingModel({ ...workingModel, working_model_id: "candidate-working-v2", version: 2, previous_working_model_id: workingModel.working_model_id, fingerprint: `sha256:${"b".repeat(64)}`, created_at: "2026-09-02T01:04:00Z" });
await Truth.persistCandidateWorkingModel(memoryDb, newerWorkingModel);
const parallelWorkingModel = Truth.validateCandidateWorkingModel({ ...newerWorkingModel, working_model_id: "candidate-working-v2-parallel", fingerprint: `sha256:${"c".repeat(64)}` });
await assert.rejects(Truth.persistCandidateWorkingModel(memoryDb, parallelWorkingModel), (error) => error.code === "candidate_working_model_stale");
const workspaceOutcomeV2 = Truth.applyWorkspaceAcceptance({ working_model: newerWorkingModel, proposals: [workspaceProposal], current_revision: workspaceOutcome.revision, expected_revision_version: 1, context_id: workspaceOutcome.revision.context_id, acceptance_id: "candidate-workspace-acceptance-2", revision_id: "candidate-workspace-revision-2", accepted_at: "2026-09-02T01:04:30Z" });
await Truth.persistWorkspaceAcceptance(memoryDb, workspaceOutcomeV2);
assert.equal(workspaceOutcomeV2.revision.version, 2);
assert.equal(workspaceOutcomeV2.revision.previous_revision_id, workspaceOutcome.revision.revision_id);
assert.equal(memoryDb.records.get("context_review_decisions").size, reviewCountBeforeWorkspaceAcceptance);
const staleWorkspaceOutcome = Truth.applyWorkspaceAcceptance({ working_model: workingModel, proposals: [workspaceProposal], current_revision: null, expected_revision_version: 0, context_id: "candidate-workspace-stale", acceptance_id: "candidate-workspace-acceptance-stale", revision_id: "candidate-workspace-revision-stale", accepted_at: "2026-09-02T01:05:00Z" });
await assert.rejects(Truth.persistWorkspaceAcceptance(memoryDb, staleWorkspaceOutcome), (error) => error.code === "candidate_working_model_stale");
assert.equal(memoryDb.records.get("candidate_workspace_acceptances").has(staleWorkspaceOutcome.workspace_acceptance.acceptance_id), false);
const persistedCancellationCandidate = { ...proposal, proposal_id: "proposal-cancelled-after-persist" };
await Truth.persistRecord(memoryDb, "context_proposals", persistedCancellationCandidate);
await Truth.persistRecord(memoryDb, "context_proposals", Truth.cancelProposal(persistedCancellationCandidate));
assert.equal(memoryDb.records.get("context_proposals").get(persistedCancellationCandidate.proposal_id).status, "CANCELLED_BY_USER");
assert.equal(memoryDb.records.get("candidate_context_revisions").size, 2);
const cancelledPersistenceReview = { ...confirm, review_id: "review-cancelled-persistence", proposal_id: persistedCancellationCandidate.proposal_id };
const cancelledPersistenceOutcome = {
  proposal: { ...persistedCancellationCandidate, status: "ACCEPTED" },
  review_decision: cancelledPersistenceReview,
  revision: {
    ...confirmed.revision,
    context_id: "candidate-context-cancelled-persistence",
    revision_id: "candidate-context-cancelled-persistence-v1",
    confirmed_from_proposal_id: persistedCancellationCandidate.proposal_id,
    review_decision_id: cancelledPersistenceReview.review_id,
  },
};
await assert.rejects(Truth.persistReviewOutcome(memoryDb, cancelledPersistenceOutcome), (error) => error.code === "proposal_not_reviewable");
assert.equal(memoryDb.records.get("candidate_context_revisions").size, 2);
await Truth.persistRecord(memoryDb, "processing_batches", currentSourceCancelledBatch);
await Truth.persistRecord(memoryDb, "processing_runs", inFlightAfterWorkflowCancel);
await Truth.persistRecord(memoryDb, "processing_runs", lateSucceededRun);
assert.equal(memoryDb.records.get("processing_batches").get(currentSourceCancelledBatch.batch_id).status, "CANCELLED");
assert.equal(memoryDb.records.get("processing_runs").get(lateSucceededRun.run_id).status, "SUCCEEDED");
assert.equal(memoryDb.records.get("candidate_context_revisions").size, 2);
await Truth.persistReviewOutcome(memoryDb, confirmed);
assert(memoryDb.records.get("context_review_decisions").has(confirm.review_id));
assert(memoryDb.records.get("candidate_context_revisions").has(confirmed.revision.revision_id));
const persistedConflictProposal = { ...proposal, proposal_id: "proposal-persisted-version-conflict" };
const persistedConflictDecision = { ...confirm, review_id: "review-persisted-version-conflict", proposal_id: persistedConflictProposal.proposal_id };
const persistedConflictOutcome = Truth.applyReviewDecision({ proposal: persistedConflictProposal, review_decision: persistedConflictDecision, current_revision: null, expected_version: 0, context_id: "candidate-context-1", revision_id: "candidate-context-1-conflicting-v1" });
await Truth.persistRecord(memoryDb, "context_proposals", persistedConflictProposal);
await assert.rejects(Truth.persistReviewOutcome(memoryDb, persistedConflictOutcome), (error) => error.code === "context_version_conflict");
await assert.rejects(Truth.persistReviewOutcome(memoryDb, confirmed), (error) => error.code === "proposal_not_reviewable");
const staleParallelOutcome = Truth.applyReviewDecision({
  proposal,
  review_decision: { ...confirm, review_id: "review-candidate-stale-parallel" },
  current_revision: null,
  expected_version: 0,
  context_id: "candidate-context-1",
  revision_id: "candidate-context-1-stale-v1",
});
await assert.rejects(
  Truth.persistReviewOutcome(memoryDb, staleParallelOutcome),
  (error) => error.code === "proposal_not_reviewable",
);
const persistedRejectionProposal = { ...proposal, proposal_id: "proposal-rejected-persisted" };
const persistedRejectionDecision = { ...reject, review_id: "review-rejected-persisted", proposal_id: persistedRejectionProposal.proposal_id };
const persistedRejectedOutcome = Truth.applyReviewDecision({ proposal: persistedRejectionProposal, review_decision: persistedRejectionDecision });
await Truth.persistRecord(memoryDb, "context_proposals", persistedRejectionProposal);
await Truth.persistReviewOutcome(memoryDb, persistedRejectedOutcome);
assert(memoryDb.records.get("context_review_decisions").has(persistedRejectionDecision.review_id));
assert.equal(memoryDb.records.get("candidate_context_revisions").size, 3); // Reject creates no revision.
await Truth.persistRecord(memoryDb, "processing_batches", cancelledBatch);
assert.equal(memoryDb.records.get("processing_batches").get(cancelledBatch.batch_id).status, "CANCELLED");
assert.equal(memoryDb.records.get("candidate_context_revisions").size, 3); // Prior successes remain; cancelled/not-started sources create no revision and cause no rollback.

const sharedStorageSchema = JSON.parse(fs.readFileSync(path.join(root, "data/workspace_storage_v1.json"), "utf8")).databases[Truth.DB_NAME];
for (const filename of ["v1-demo-domain.js", "career-evidence.js", "local-first.js", "career-profile.js", "local-jobs.js"]) {
  const sourceText = fs.readFileSync(path.join(root, "public", filename), "utf8");
  assert.match(sourceText, /AriadneContentDatabase\.open\(DB_NAME/, `${filename} must use the same content repository`);
}
for (const spec of Truth.STORE_SPECS) assert.equal(sharedStorageSchema[spec.name], spec.keyPath);
for (const legacyStore of ["demo_candidate_items", "demo_job_contexts", "demo_conversations", "demo_ui_state"]) assert(sharedStorageSchema[legacyStore]);

const domainSource = fs.readFileSync(path.join(root, "public", "truth-persistence-domain.js"), "utf8");
assert.doesNotMatch(domainSource, /\bfetch\s*\(|XMLHttpRequest|DeepSeek|Qwen|Gemini/);
console.log("truth_persistence_browser_contract=pass");
