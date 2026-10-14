(function attachTruthPersistence(root, factory) {
  const runtime = typeof module === "object" && module.exports
    ? require("./runtime-capabilities.js")
    : root.AriadneRuntimeExecution;
  const api = factory(runtime);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AriadneTruthPersistence = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createTruthPersistence(RuntimeExecution) {
  "use strict";

  const CONTRACT_ID = "ariadne-truth-persistence-v1";
  const DB_NAME = "job-radar-local-first-v1";
  const DB_VERSION = 20;
  const STORE_SPECS = Object.freeze([
    Object.freeze({ name: "applications", keyPath: "job_context_id", lifecycle: "new" }),
    Object.freeze({ name: "job_journal_entries", keyPath: "entry_id", lifecycle: "new" }),
    Object.freeze({ name: "job_journal_images", keyPath: "image_id", lifecycle: "new" }),
    Object.freeze({ name: "job_followup_migrations", keyPath: "migration_id", lifecycle: "new" }),

    Object.freeze({ name: "source_documents", keyPath: "source_document_id", lifecycle: "reused" }),
    Object.freeze({ name: "runtime_snapshots", keyPath: "snapshot_id", lifecycle: "new" }),
    Object.freeze({ name: "extraction_artifacts", keyPath: "artifact_id", lifecycle: "new" }),
    Object.freeze({ name: "processing_runs", keyPath: "run_id", lifecycle: "reused" }),
    Object.freeze({ name: "processing_batches", keyPath: "batch_id", lifecycle: "new" }),
    Object.freeze({ name: "context_proposals", keyPath: "proposal_id", lifecycle: "new" }),
    Object.freeze({ name: "context_review_decisions", keyPath: "review_id", lifecycle: "new" }),
    Object.freeze({ name: "candidate_working_models", keyPath: "working_model_id", lifecycle: "new" }),
    Object.freeze({ name: "candidate_workspace_acceptances", keyPath: "acceptance_id", lifecycle: "new" }),
    Object.freeze({ name: "candidate_context_revisions", keyPath: "revision_id", lifecycle: "new" }),
    Object.freeze({ name: "candidate_context_lifecycle", keyPath: "lifecycle_id", lifecycle: "new" }),
    Object.freeze({ name: "job_context_revisions", keyPath: "revision_id", lifecycle: "new" }),
    Object.freeze({ name: "job_context_lifecycle", keyPath: "lifecycle_id", lifecycle: "new" }),
    Object.freeze({ name: "conversation_sessions", keyPath: "conversation_id", lifecycle: "reused" }),
    Object.freeze({ name: "conversation_messages", keyPath: "message_id", lifecycle: "reused" }),
    Object.freeze({ name: "conversation_turn_executions", keyPath: "execution_id", lifecycle: "new" }),
    Object.freeze({ name: "candidate_actions", keyPath: "action_id", lifecycle: "new" }),
    Object.freeze({ name: "job_analyses", keyPath: "analysis_id", lifecycle: "new" }),
    Object.freeze({ name: "job_conversation_sessions", keyPath: "conversation_id", lifecycle: "new" }),
    Object.freeze({ name: "job_conversation_messages", keyPath: "message_id", lifecycle: "new" }),
    Object.freeze({ name: "job_turn_executions", keyPath: "execution_id", lifecycle: "new" }),
    Object.freeze({ name: "job_change_proposals", keyPath: "job_change_proposal_id", lifecycle: "new" }),
    Object.freeze({ name: "job_change_decisions", keyPath: "job_change_decision_id", lifecycle: "new" }),
    Object.freeze({ name: "personal_memory_revisions", keyPath: "revision_id", lifecycle: "new" }),
    Object.freeze({ name: "personal_memory_proposals", keyPath: "proposal_id", lifecycle: "new" }),
    Object.freeze({ name: "personal_memory_decisions", keyPath: "decision_id", lifecycle: "new" }),
    Object.freeze({ name: "personal_understanding_fragments", keyPath: "fragment_id", lifecycle: "new" }),
    Object.freeze({ name: "personal_understanding_snapshots", keyPath: "understanding_id", lifecycle: "new" }),
    Object.freeze({ name: "resume_tasks", keyPath: "task_id", lifecycle: "new" }),
    Object.freeze({ name: "resume_document_versions", keyPath: "version_id", lifecycle: "new" }),
    Object.freeze({ name: "personal_conversation_turns", keyPath: "turn_id", lifecycle: "new" }),
    Object.freeze({ name: "job_overview_fragments", keyPath: "fragment_id", lifecycle: "new" }),
    Object.freeze({ name: "job_overview_snapshots", keyPath: "overview_id", lifecycle: "new" }),
    Object.freeze({ name: "job_overview_turns", keyPath: "turn_id", lifecycle: "new" }),
  ]);
  const STORE_NAMES = Object.freeze(Object.fromEntries(STORE_SPECS.map((spec) => [spec.name.toUpperCase(), spec.name])));
  const NEW_STORE_SPECS = Object.freeze(STORE_SPECS.filter((spec) => spec.lifecycle === "new"));
  const SOURCE_TYPES = Object.freeze(["PDF", "DOCX", "TXT", "MARKDOWN", "IMAGE", "PASTED_TEXT"]);
  const MATERIAL_TYPES = Object.freeze(["CANDIDATE", "JOB"]);
  const PROCESSING_STATUSES = Object.freeze(["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"]);
  const BATCH_STATUSES = Object.freeze(["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]);
  const PROPOSAL_TYPES = Object.freeze(["CANDIDATE_CONTEXT", "JOB_CONTEXT"]);
  const PROPOSAL_STATUSES = Object.freeze(["AWAITING_REVIEW", "ACCEPTED", "REJECTED", "CANCELLED_BY_USER", "SUPERSEDED"]);
  const REVIEW_DECISIONS = Object.freeze(["CONFIRM", "REJECT", "EDIT_AND_CONFIRM"]);
  const CONTEXT_TYPES = Object.freeze(["CANDIDATE", "JOB"]);
  const CANDIDATE_CONTEXT_LIFECYCLE_STATES = Object.freeze(["REMOVED"]);
  const CANCEL_REASON = "USER_CANCELLED_UPLOAD";
  const APPEND_ONLY_STORES = Object.freeze([
    "resume_document_versions",
    "runtime_snapshots",
    "extraction_artifacts",
    "context_review_decisions",
    "candidate_working_models",
    "candidate_workspace_acceptances",
    "candidate_context_revisions",
    "candidate_context_lifecycle",
    "job_context_revisions",
    "job_context_lifecycle",
    "conversation_messages",
    "candidate_actions",
    "job_analyses",
    "job_conversation_messages",
    "job_change_proposals",
    "job_change_decisions",
  ]);
  const AUTHORITY = Object.freeze({
    source: "SOURCE_INPUT_ONLY",
    extraction: "NON_AUTHORITATIVE_EXTRACTION",
    execution: "EXECUTION_HISTORY",
    proposal: "NON_AUTHORITATIVE_PROPOSAL",
    review: "AUTHORITATIVE_USER_DECISION",
    working: "NON_AUTHORITATIVE_WORKING_MODEL",
    workspace_acceptance: "AUTHORITATIVE_WORKSPACE_ACCEPTANCE",
    revision: "AUTHORITATIVE_CONFIRMED_CONTEXT",
    lifecycle: "AUTHORITATIVE_USER_DECISION",
  });
  const SECRET_KEY_PATTERN = /(?:api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|bearer|secret)/i;
  const EMBEDDED_BYTES_KEY_PATTERN = /(?:file[_-]?blob|file[_-]?bytes|raw[_-]?bytes|document[_-]?data[_-]?url|image[_-]?data[_-]?url|base64[_-]?data)/i;
  const EMBEDDED_BYTES_VALUE_PATTERN = /^data:(?:application|image)\/[^;,]+;base64,/i;
  const SECRET_VALUE_PATTERNS = Object.freeze([
    /\bBearer\s+\S+/i,
    /\b(?:sk|rk|pk|sess)-[A-Za-z0-9_-]{8,}/,
    /\bAIza[0-9A-Za-z_-]{20,}/,
    /\b(?:api[_ -]?key|authorization|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*\S+/i,
  ]);

  const FIELDS = Object.freeze({
    source: Object.freeze(["contract_id", "source_document_id", "source_type", "filename", "label", "mime_type", "content_hash", "created_at", "material_type", "local_reference", "batch_id", "provenance", "authority"]),
    extraction: Object.freeze(["contract_id", "artifact_id", "source_document_id", "processing_run_id", "extraction_method", "payload", "source_refs", "quality", "warnings", "errors", "created_at", "authority"]),
    run: Object.freeze(["contract_id", "run_id", "operation_type", "source_document_id", "batch_id", "runtime_snapshot_id", "started_at", "finished_at", "status", "error_code", "output_artifact_ids", "proposal_ids", "authority"]),
    batch: Object.freeze(["contract_id", "batch_id", "operation_type", "source_document_ids", "completed_source_ids", "cancelled_source_id", "not_started_source_ids", "status", "created_at", "finished_at", "cancelled_at", "cancel_reason", "authority"]),
    proposal: Object.freeze(["contract_id", "proposal_id", "proposal_type", "source_document_ids", "processing_run_id", "runtime_snapshot_id", "status", "created_at", "payload", "grounding_refs", "warnings", "uncertainties", "authority"]),
    review: Object.freeze(["contract_id", "review_id", "proposal_id", "decision", "reviewed_at", "accepted_payload", "authority"]),
    working: Object.freeze(["contract_id", "working_model_id", "source_document_id", "processing_run_id", "runtime_snapshot_id", "proposal_ids", "version", "previous_working_model_id", "fingerprint", "created_at", "payload", "authority"]),
    workspace_acceptance: Object.freeze(["contract_id", "acceptance_id", "context_id", "source_document_id", "processing_run_id", "runtime_snapshot_id", "proposal_ids", "working_model_id", "working_model_version", "working_model_fingerprint", "accepted_at", "confirmed_revision_id", "previous_revision_id", "accepted_payload", "authority"]),
    revision: Object.freeze(["contract_id", "context_type", "context_id", "revision_id", "version", "previous_revision_id", "confirmed_from_proposal_id", "review_decision_id", "created_at", "provenance", "payload", "authority"]),
    workspace_revision: Object.freeze(["contract_id", "context_type", "context_id", "revision_id", "version", "previous_revision_id", "workspace_acceptance_id", "created_at", "provenance", "payload", "authority"]),
    lifecycle: Object.freeze(["contract_id", "lifecycle_id", "context_id", "item_id", "state", "removed_from_revision_id", "removed_at", "reason", "authority"]),
  });

  class TruthPersistenceError extends Error {
    constructor(code) { super(code); this.name = "TruthPersistenceError"; this.code = code; }
  }

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); }
    catch (_error) { throw new TruthPersistenceError("record_not_json_serializable"); }
  }

  function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (isPlainObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
    return JSON.stringify(value);
  }

  function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function assertJsonValue(value, seen = new Set()) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number" && Number.isFinite(value)) return;
    if (Array.isArray(value)) {
      if (seen.has(value)) throw new TruthPersistenceError("record_not_json_serializable");
      seen.add(value); value.forEach((item) => assertJsonValue(item, seen)); seen.delete(value); return;
    }
    if (isPlainObject(value)) {
      if (seen.has(value)) throw new TruthPersistenceError("record_not_json_serializable");
      seen.add(value);
      Object.entries(value).forEach(([key, nested]) => {
        if (!key) throw new TruthPersistenceError("record_key_invalid");
        assertJsonValue(nested, seen);
      });
      seen.delete(value); return;
    }
    throw new TruthPersistenceError("record_not_json_serializable");
  }

  function assertNoSecretLike(value) {
    if (Array.isArray(value)) { value.forEach(assertNoSecretLike); return; }
    if (isPlainObject(value)) {
      Object.entries(value).forEach(([key, nested]) => {
        if (SECRET_KEY_PATTERN.test(key)) throw new TruthPersistenceError("persistence_secret_field_forbidden");
        assertNoSecretLike(nested);
      });
      return;
    }
    if (typeof value === "string" && SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
      throw new TruthPersistenceError("persistence_secret_value_forbidden");
    }
  }

  function assertNoEmbeddedSourceBytes(value) {
    if (Array.isArray(value)) { value.forEach(assertNoEmbeddedSourceBytes); return; }
    if (isPlainObject(value)) {
      Object.entries(value).forEach(([key, nested]) => {
        if (EMBEDDED_BYTES_KEY_PATTERN.test(key)) throw new TruthPersistenceError("embedded_source_bytes_forbidden");
        assertNoEmbeddedSourceBytes(nested);
      });
      return;
    }
    if (typeof value === "string" && EMBEDDED_BYTES_VALUE_PATTERN.test(value)) throw new TruthPersistenceError("embedded_source_bytes_forbidden");
  }

  function prepare(value, fields, code) {
    if (!isPlainObject(value)) throw new TruthPersistenceError(`${code}_malformed`);
    assertJsonValue(value);
    assertNoSecretLike(value);
    assertNoEmbeddedSourceBytes(value);
    const actual = Object.keys(value).sort();
    const expected = [...fields].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new TruthPersistenceError(`${code}_shape_invalid`);
    return value;
  }

  function requiredString(value, code) {
    if (typeof value !== "string" || !value.trim()) throw new TruthPersistenceError(code);
    return value.trim();
  }

  function nullableString(value, code) {
    if (value === null) return null;
    return requiredString(value, code);
  }

  function validIso(value, code, nullable = false) {
    if (nullable && value === null) return null;
    if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value))) {
      throw new TruthPersistenceError(code);
    }
    return value;
  }

  function stringArray(value, code, options = {}) {
    if (!Array.isArray(value)) throw new TruthPersistenceError(code);
    const result = value.map((item) => requiredString(item, code));
    if (options.nonEmpty && !result.length) throw new TruthPersistenceError(code);
    if (new Set(result).size !== result.length) throw new TruthPersistenceError(`${code}_duplicate`);
    return result;
  }

  function plainObject(value, code) {
    if (!isPlainObject(value)) throw new TruthPersistenceError(code);
    return clone(value);
  }

  function sourceRef(value) {
    if (!isPlainObject(value)) throw new TruthPersistenceError("source_ref_malformed");
    if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(["excerpt_or_reference", "location", "source_document_id"])) {
      throw new TruthPersistenceError("source_ref_shape_invalid");
    }
    return {
      source_document_id: requiredString(value.source_document_id, "source_ref_source_id_invalid"),
      location: requiredString(value.location, "source_ref_location_invalid"),
      excerpt_or_reference: requiredString(value.excerpt_or_reference, "source_ref_excerpt_invalid"),
    };
  }

  function validateSourceDocument(source) {
    const value = prepare(source, FIELDS.source, "source_document");
    if (value.contract_id !== "ariadne-source-document-v1") throw new TruthPersistenceError("source_document_contract_invalid");
    if (!SOURCE_TYPES.includes(value.source_type)) throw new TruthPersistenceError("source_document_type_invalid");
    if (!MATERIAL_TYPES.includes(value.material_type)) throw new TruthPersistenceError("source_document_material_type_invalid");
    const filename = value.filename === null ? null : requiredString(value.filename, "source_document_filename_invalid");
    const label = value.label === null ? null : requiredString(value.label, "source_document_label_invalid");
    if (filename === null && label === null) throw new TruthPersistenceError("source_document_name_required");
    return Object.freeze({
      contract_id: value.contract_id,
      source_document_id: requiredString(value.source_document_id, "source_document_id_invalid"),
      source_type: value.source_type,
      filename,
      label,
      mime_type: value.mime_type === null ? null : requiredString(value.mime_type, "source_document_mime_type_invalid"),
      content_hash: requiredString(value.content_hash, "source_document_hash_invalid"),
      created_at: validIso(value.created_at, "source_document_created_at_invalid"),
      material_type: value.material_type,
      local_reference: value.local_reference === null ? null : requiredString(value.local_reference, "source_document_local_reference_invalid"),
      batch_id: value.batch_id === null ? null : requiredString(value.batch_id, "source_document_batch_id_invalid"),
      provenance: plainObject(value.provenance, "source_document_provenance_invalid"),
      authority: value.authority === AUTHORITY.source ? value.authority : (() => { throw new TruthPersistenceError("source_document_authority_invalid"); })(),
    });
  }

  function validateExtractionArtifact(artifact) {
    const value = prepare(artifact, FIELDS.extraction, "extraction_artifact");
    if (value.contract_id !== "ariadne-extraction-artifact-v1") throw new TruthPersistenceError("extraction_artifact_contract_invalid");
    if (value.authority !== AUTHORITY.extraction) throw new TruthPersistenceError("extraction_artifact_authority_invalid");
    const refs = Array.isArray(value.source_refs) ? value.source_refs.map(sourceRef) : (() => { throw new TruthPersistenceError("extraction_artifact_source_refs_invalid"); })();
    const sourceDocumentId = requiredString(value.source_document_id, "extraction_artifact_source_id_invalid");
    if (refs.some((ref) => ref.source_document_id !== sourceDocumentId)) throw new TruthPersistenceError("extraction_artifact_source_ref_mismatch");
    return Object.freeze({
      contract_id: value.contract_id,
      artifact_id: requiredString(value.artifact_id, "extraction_artifact_id_invalid"),
      source_document_id: sourceDocumentId,
      processing_run_id: requiredString(value.processing_run_id, "extraction_artifact_run_id_invalid"),
      extraction_method: requiredString(value.extraction_method, "extraction_artifact_method_invalid"),
      payload: plainObject(value.payload, "extraction_artifact_payload_invalid"),
      source_refs: refs,
      quality: value.quality === null ? null : plainObject(value.quality, "extraction_artifact_quality_invalid"),
      warnings: stringArray(value.warnings, "extraction_artifact_warnings_invalid"),
      errors: stringArray(value.errors, "extraction_artifact_errors_invalid"),
      created_at: validIso(value.created_at, "extraction_artifact_created_at_invalid"),
      authority: value.authority,
    });
  }

  function validateProcessingRun(run) {
    const value = prepare(run, FIELDS.run, "processing_run");
    if (value.contract_id !== "ariadne-processing-run-v1") throw new TruthPersistenceError("processing_run_contract_invalid");
    if (!PROCESSING_STATUSES.includes(value.status)) throw new TruthPersistenceError("processing_run_status_invalid");
    if (value.authority !== AUTHORITY.execution) throw new TruthPersistenceError("processing_run_authority_invalid");
    const sourceDocumentId = value.source_document_id === null ? null : requiredString(value.source_document_id, "processing_run_source_id_invalid");
    const batchId = value.batch_id === null ? null : requiredString(value.batch_id, "processing_run_batch_id_invalid");
    if (sourceDocumentId === null && batchId === null) throw new TruthPersistenceError("processing_run_scope_required");
    const startedAt = validIso(value.started_at, "processing_run_started_at_invalid", true);
    const finishedAt = validIso(value.finished_at, "processing_run_finished_at_invalid", true);
    const errorCode = value.error_code === null ? null : requiredString(value.error_code, "processing_run_error_code_invalid");
    if (value.status === "PENDING" && (startedAt !== null || finishedAt !== null || errorCode !== null)) throw new TruthPersistenceError("processing_run_pending_state_invalid");
    if (value.status === "RUNNING" && (startedAt === null || finishedAt !== null || errorCode !== null)) throw new TruthPersistenceError("processing_run_running_state_invalid");
    if (value.status === "SUCCEEDED" && (startedAt === null || finishedAt === null || errorCode !== null)) throw new TruthPersistenceError("processing_run_succeeded_state_invalid");
    if (value.status === "FAILED" && (finishedAt === null || errorCode === null)) throw new TruthPersistenceError("processing_run_failed_state_invalid");
    if (value.status === "CANCELLED" && finishedAt === null) throw new TruthPersistenceError("processing_run_cancelled_state_invalid");
    const proposalIds = stringArray(value.proposal_ids, "processing_run_proposal_ids_invalid");
    if (value.status === "CANCELLED" && proposalIds.length) throw new TruthPersistenceError("cancelled_run_proposal_forbidden");
    return Object.freeze({
      contract_id: value.contract_id,
      run_id: requiredString(value.run_id, "processing_run_id_invalid"),
      operation_type: requiredString(value.operation_type, "processing_run_operation_invalid"),
      source_document_id: sourceDocumentId,
      batch_id: batchId,
      runtime_snapshot_id: requiredString(value.runtime_snapshot_id, "processing_run_snapshot_id_invalid"),
      started_at: startedAt,
      finished_at: finishedAt,
      status: value.status,
      error_code: errorCode,
      output_artifact_ids: stringArray(value.output_artifact_ids, "processing_run_artifact_ids_invalid"),
      proposal_ids: proposalIds,
      authority: value.authority,
    });
  }

  function validateProcessingBatch(batch) {
    const value = prepare(batch, FIELDS.batch, "processing_batch");
    if (value.contract_id !== "ariadne-processing-batch-v1") throw new TruthPersistenceError("processing_batch_contract_invalid");
    if (!BATCH_STATUSES.includes(value.status)) throw new TruthPersistenceError("processing_batch_status_invalid");
    if (value.authority !== AUTHORITY.execution) throw new TruthPersistenceError("processing_batch_authority_invalid");
    const sourceIds = stringArray(value.source_document_ids, "processing_batch_source_ids_invalid", { nonEmpty: true });
    const completed = stringArray(value.completed_source_ids, "processing_batch_completed_ids_invalid");
    const notStarted = stringArray(value.not_started_source_ids, "processing_batch_not_started_ids_invalid");
    const cancelledSourceId = value.cancelled_source_id === null ? null : requiredString(value.cancelled_source_id, "processing_batch_cancelled_source_invalid");
    const finishedAt = validIso(value.finished_at, "processing_batch_finished_at_invalid", true);
    const cancelledAt = validIso(value.cancelled_at, "processing_batch_cancelled_at_invalid", true);
    const cancelReason = value.cancel_reason === null ? null : requiredString(value.cancel_reason, "processing_batch_cancel_reason_invalid");
    const allKnown = new Set(sourceIds);
    if ([...completed, ...notStarted, ...(cancelledSourceId ? [cancelledSourceId] : [])].some((id) => !allKnown.has(id))) throw new TruthPersistenceError("processing_batch_source_partition_invalid");
    const partition = [...completed, ...notStarted, ...(cancelledSourceId ? [cancelledSourceId] : [])];
    if (new Set(partition).size !== partition.length) throw new TruthPersistenceError("processing_batch_source_partition_overlap");
    if (value.status === "CANCELLED") {
      if (!cancelledSourceId || !cancelledAt || !finishedAt || cancelReason !== CANCEL_REASON) throw new TruthPersistenceError("processing_batch_cancel_contract_invalid");
      if (partition.length !== sourceIds.length) throw new TruthPersistenceError("processing_batch_cancel_partition_incomplete");
    } else if (cancelledSourceId !== null || cancelledAt !== null || cancelReason !== null) {
      throw new TruthPersistenceError("processing_batch_non_cancelled_metadata_invalid");
    }
    return Object.freeze({
      contract_id: value.contract_id,
      batch_id: requiredString(value.batch_id, "processing_batch_id_invalid"),
      operation_type: requiredString(value.operation_type, "processing_batch_operation_invalid"),
      source_document_ids: sourceIds,
      completed_source_ids: completed,
      cancelled_source_id: cancelledSourceId,
      not_started_source_ids: notStarted,
      status: value.status,
      created_at: validIso(value.created_at, "processing_batch_created_at_invalid"),
      finished_at: finishedAt,
      cancelled_at: cancelledAt,
      cancel_reason: cancelReason,
      authority: value.authority,
    });
  }

  function validateProposal(proposal) {
    const value = prepare(proposal, FIELDS.proposal, "proposal");
    if (value.contract_id !== "ariadne-context-proposal-v1") throw new TruthPersistenceError("proposal_contract_invalid");
    if (!PROPOSAL_TYPES.includes(value.proposal_type)) throw new TruthPersistenceError("proposal_type_invalid");
    if (!PROPOSAL_STATUSES.includes(value.status)) throw new TruthPersistenceError("proposal_status_invalid");
    if (value.authority !== AUTHORITY.proposal) throw new TruthPersistenceError("proposal_authority_invalid");
    const sourceIds = stringArray(value.source_document_ids, "proposal_source_ids_invalid", { nonEmpty: true });
    if (!Array.isArray(value.grounding_refs) || !value.grounding_refs.length) throw new TruthPersistenceError("proposal_grounding_refs_invalid");
    const refs = value.grounding_refs.map(sourceRef);
    if (refs.some((ref) => !sourceIds.includes(ref.source_document_id))) throw new TruthPersistenceError("proposal_grounding_source_mismatch");
    if (!Array.isArray(value.uncertainties)) throw new TruthPersistenceError("proposal_uncertainties_invalid");
    return Object.freeze({
      contract_id: value.contract_id,
      proposal_id: requiredString(value.proposal_id, "proposal_id_invalid"),
      proposal_type: value.proposal_type,
      source_document_ids: sourceIds,
      processing_run_id: requiredString(value.processing_run_id, "proposal_run_id_invalid"),
      runtime_snapshot_id: requiredString(value.runtime_snapshot_id, "proposal_snapshot_id_invalid"),
      status: value.status,
      created_at: validIso(value.created_at, "proposal_created_at_invalid"),
      payload: plainObject(value.payload, "proposal_payload_invalid"),
      grounding_refs: refs,
      warnings: stringArray(value.warnings, "proposal_warnings_invalid"),
      uncertainties: clone(value.uncertainties),
      authority: value.authority,
    });
  }

  function cancelProcessingRun(run, cancelledAt) {
    // Use only when execution actually stopped; an unabortable request remains RUNNING until its real outcome arrives.
    const value = validateProcessingRun(run);
    if (!["PENDING", "RUNNING"].includes(value.status)) throw new TruthPersistenceError("processing_run_not_cancellable");
    if (value.proposal_ids.length) throw new TruthPersistenceError("processing_run_with_proposal_not_cancellable");
    return validateProcessingRun({
      ...value,
      status: "CANCELLED",
      finished_at: validIso(cancelledAt, "processing_run_cancelled_at_invalid"),
      error_code: CANCEL_REASON,
      proposal_ids: [],
    });
  }

  function cancelProposal(proposal) {
    const value = validateProposal(proposal);
    if (value.status === "CANCELLED_BY_USER") return value;
    if (value.status !== "AWAITING_REVIEW") throw new TruthPersistenceError("proposal_not_user_cancellable");
    return validateProposal({ ...value, status: "CANCELLED_BY_USER" });
  }

  function validateCancelledWorkflowState(input) {
    const batch = validateProcessingBatch(input?.processing_batch);
    const run = validateProcessingRun(input?.processing_run);
    const proposal = input?.proposal === null || input?.proposal === undefined ? null : validateProposal(input.proposal);
    if (batch.status !== "CANCELLED") throw new TruthPersistenceError("workflow_batch_not_cancelled");
    if (!run.source_document_id || batch.cancelled_source_id !== run.source_document_id || batch.batch_id !== run.batch_id) {
      throw new TruthPersistenceError("cancelled_workflow_scope_mismatch");
    }
    if (!["RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"].includes(run.status)) {
      throw new TruthPersistenceError("cancelled_workflow_run_state_invalid");
    }
    if (run.status === "CANCELLED" && proposal !== null) throw new TruthPersistenceError("cancelled_run_proposal_forbidden");
    if (["RUNNING", "FAILED"].includes(run.status) && proposal !== null) throw new TruthPersistenceError("incomplete_run_proposal_forbidden");
    if (proposal) {
      if (run.status !== "SUCCEEDED") throw new TruthPersistenceError("proposal_requires_succeeded_run");
      if (proposal.status !== "CANCELLED_BY_USER") throw new TruthPersistenceError("cancelled_workflow_proposal_reviewable");
      if (proposal.processing_run_id !== run.run_id || proposal.runtime_snapshot_id !== run.runtime_snapshot_id) {
        throw new TruthPersistenceError("cancelled_workflow_proposal_linkage_mismatch");
      }
      if (!proposal.source_document_ids.includes(run.source_document_id)) throw new TruthPersistenceError("cancelled_workflow_proposal_source_mismatch");
    }
    return Object.freeze({ processing_batch: batch, processing_run: run, proposal });
  }

  function validateReviewDecision(review) {
    const value = prepare(review, FIELDS.review, "review_decision");
    if (value.contract_id !== "ariadne-context-review-decision-v1") throw new TruthPersistenceError("review_decision_contract_invalid");
    if (!REVIEW_DECISIONS.includes(value.decision)) throw new TruthPersistenceError("review_decision_value_invalid");
    if (value.authority !== AUTHORITY.review) throw new TruthPersistenceError("review_decision_authority_invalid");
    const acceptedPayload = value.accepted_payload === null ? null : plainObject(value.accepted_payload, "review_decision_payload_invalid");
    if (value.decision === "REJECT" && acceptedPayload !== null) throw new TruthPersistenceError("rejected_review_payload_forbidden");
    if (value.decision !== "REJECT" && acceptedPayload === null) throw new TruthPersistenceError("confirmed_review_payload_required");
    return Object.freeze({
      contract_id: value.contract_id,
      review_id: requiredString(value.review_id, "review_decision_id_invalid"),
      proposal_id: requiredString(value.proposal_id, "review_decision_proposal_id_invalid"),
      decision: value.decision,
      reviewed_at: validIso(value.reviewed_at, "review_decision_reviewed_at_invalid"),
      accepted_payload: acceptedPayload,
      authority: value.authority,
    });
  }

  function validateCandidateWorkingModel(model) {
    const value = prepare(model, FIELDS.working, "candidate_working_model");
    for (const item of Array.isArray(value.payload?.items) ? value.payload.items : []) {
      if (!item || typeof item !== "object") continue;
      if (item.category != null && (typeof item.category !== "string" || !item.category.trim() || item.category.length > 120)) throw new TruthPersistenceError("candidate_category_invalid");
    }
    if (value.contract_id !== "ariadne-candidate-working-model-v1") throw new TruthPersistenceError("candidate_working_model_contract_invalid");
    if (value.authority !== AUTHORITY.working) throw new TruthPersistenceError("candidate_working_model_authority_invalid");
    if (!Number.isInteger(value.version) || value.version < 1) throw new TruthPersistenceError("candidate_working_model_version_invalid");
    const previousWorkingModelId = value.previous_working_model_id === null ? null : requiredString(value.previous_working_model_id, "candidate_working_model_previous_id_invalid");
    if ((value.version === 1) !== (previousWorkingModelId === null)) throw new TruthPersistenceError("candidate_working_model_lineage_invalid");
    const fingerprint = requiredString(value.fingerprint, "candidate_working_model_fingerprint_invalid");
    if (!/^sha256:[a-f0-9]{64}$/.test(fingerprint)) throw new TruthPersistenceError("candidate_working_model_fingerprint_invalid");
    return Object.freeze({
      contract_id: value.contract_id,
      working_model_id: requiredString(value.working_model_id, "candidate_working_model_id_invalid"),
      source_document_id: requiredString(value.source_document_id, "candidate_working_model_source_id_invalid"),
      processing_run_id: requiredString(value.processing_run_id, "candidate_working_model_run_id_invalid"),
      runtime_snapshot_id: requiredString(value.runtime_snapshot_id, "candidate_working_model_snapshot_id_invalid"),
      proposal_ids: stringArray(value.proposal_ids, "candidate_working_model_proposal_ids_invalid", { nonEmpty: true }),
      version: value.version,
      previous_working_model_id: previousWorkingModelId,
      fingerprint,
      created_at: validIso(value.created_at, "candidate_working_model_created_at_invalid"),
      payload: plainObject(value.payload, "candidate_working_model_payload_invalid"),
      authority: value.authority,
    });
  }

  function validateCandidateWorkspaceAcceptance(acceptance) {
    const value = prepare(acceptance, FIELDS.workspace_acceptance, "candidate_workspace_acceptance");
    if (value.contract_id !== "ariadne-candidate-workspace-acceptance-v1") throw new TruthPersistenceError("candidate_workspace_acceptance_contract_invalid");
    if (value.authority !== AUTHORITY.workspace_acceptance) throw new TruthPersistenceError("candidate_workspace_acceptance_authority_invalid");
    if (!Number.isInteger(value.working_model_version) || value.working_model_version < 1) throw new TruthPersistenceError("candidate_workspace_acceptance_version_invalid");
    const fingerprint = requiredString(value.working_model_fingerprint, "candidate_workspace_acceptance_fingerprint_invalid");
    if (!/^sha256:[a-f0-9]{64}$/.test(fingerprint)) throw new TruthPersistenceError("candidate_workspace_acceptance_fingerprint_invalid");
    return Object.freeze({
      contract_id: value.contract_id,
      acceptance_id: requiredString(value.acceptance_id, "candidate_workspace_acceptance_id_invalid"),
      context_id: requiredString(value.context_id, "candidate_workspace_acceptance_context_id_invalid"),
      source_document_id: requiredString(value.source_document_id, "candidate_workspace_acceptance_source_id_invalid"),
      processing_run_id: requiredString(value.processing_run_id, "candidate_workspace_acceptance_run_id_invalid"),
      runtime_snapshot_id: requiredString(value.runtime_snapshot_id, "candidate_workspace_acceptance_snapshot_id_invalid"),
      proposal_ids: stringArray(value.proposal_ids, "candidate_workspace_acceptance_proposal_ids_invalid", { nonEmpty: true }),
      working_model_id: requiredString(value.working_model_id, "candidate_workspace_acceptance_working_model_id_invalid"),
      working_model_version: value.working_model_version,
      working_model_fingerprint: fingerprint,
      accepted_at: validIso(value.accepted_at, "candidate_workspace_acceptance_timestamp_invalid"),
      confirmed_revision_id: requiredString(value.confirmed_revision_id, "candidate_workspace_acceptance_revision_id_invalid"),
      previous_revision_id: value.previous_revision_id === null ? null : requiredString(value.previous_revision_id, "candidate_workspace_acceptance_previous_revision_id_invalid"),
      accepted_payload: plainObject(value.accepted_payload, "candidate_workspace_acceptance_payload_invalid"),
      authority: value.authority,
    });
  }

  function normalizedRevisionProvenance(value) {
    const provenance = plainObject(value, "context_revision_provenance_invalid");
    if (JSON.stringify(Object.keys(provenance).sort()) !== JSON.stringify(["processing_run_id", "runtime_snapshot_id", "source_document_ids"])) throw new TruthPersistenceError("context_revision_provenance_shape_invalid");
    return {
      source_document_ids: stringArray(provenance.source_document_ids, "context_revision_source_ids_invalid", { nonEmpty: true }),
      processing_run_id: requiredString(provenance.processing_run_id, "context_revision_run_id_invalid"),
      runtime_snapshot_id: requiredString(provenance.runtime_snapshot_id, "context_revision_snapshot_id_invalid"),
    };
  }

  function validateContextRevision(revision) {
    const contractId = revision?.contract_id;
    const workspaceRoute = contractId === "ariadne-context-revision-v2";
    const value = prepare(revision, workspaceRoute ? FIELDS.workspace_revision : FIELDS.revision, "context_revision");
    if (!workspaceRoute && value.contract_id !== "ariadne-context-revision-v1") throw new TruthPersistenceError("context_revision_contract_invalid");
    if (!CONTEXT_TYPES.includes(value.context_type)) throw new TruthPersistenceError("context_revision_type_invalid");
    if (workspaceRoute && value.context_type !== "CANDIDATE") throw new TruthPersistenceError("workspace_revision_type_invalid");
    if (value.authority !== AUTHORITY.revision) throw new TruthPersistenceError("context_revision_authority_invalid");
    if (!Number.isInteger(value.version) || value.version < 1) throw new TruthPersistenceError("context_revision_version_invalid");
    const previousRevisionId = value.previous_revision_id === null ? null : requiredString(value.previous_revision_id, "context_revision_previous_id_invalid");
    if ((value.version === 1) !== (previousRevisionId === null)) throw new TruthPersistenceError("context_revision_linkage_invalid");
    const base = {
      contract_id: value.contract_id,
      context_type: value.context_type,
      context_id: requiredString(value.context_id, "context_revision_context_id_invalid"),
      revision_id: requiredString(value.revision_id, "context_revision_id_invalid"),
      version: value.version,
      previous_revision_id: previousRevisionId,
      created_at: validIso(value.created_at, "context_revision_created_at_invalid"),
      provenance: normalizedRevisionProvenance(value.provenance),
      payload: plainObject(value.payload, "context_revision_payload_invalid"),
      authority: value.authority,
    };
    if (workspaceRoute) base.workspace_acceptance_id = requiredString(value.workspace_acceptance_id, "context_revision_workspace_acceptance_id_invalid");
    else {
      base.confirmed_from_proposal_id = requiredString(value.confirmed_from_proposal_id, "context_revision_proposal_id_invalid");
      base.review_decision_id = requiredString(value.review_decision_id, "context_revision_review_id_invalid");
    }
    return Object.freeze(base);
  }

  function validateCandidateContextLifecycle(record) {
    const value = prepare(record, FIELDS.lifecycle, "candidate_context_lifecycle");
    if (value.contract_id !== "ariadne-candidate-context-lifecycle-v1") throw new TruthPersistenceError("candidate_context_lifecycle_contract_invalid");
    if (!CANDIDATE_CONTEXT_LIFECYCLE_STATES.includes(value.state)) throw new TruthPersistenceError("candidate_context_lifecycle_state_invalid");
    if (value.reason !== "USER_REMOVED") throw new TruthPersistenceError("candidate_context_lifecycle_reason_invalid");
    if (value.authority !== AUTHORITY.lifecycle) throw new TruthPersistenceError("candidate_context_lifecycle_authority_invalid");
    return Object.freeze({
      contract_id: value.contract_id,
      lifecycle_id: requiredString(value.lifecycle_id, "candidate_context_lifecycle_id_invalid"),
      context_id: requiredString(value.context_id, "candidate_context_lifecycle_context_id_invalid"),
      item_id: requiredString(value.item_id, "candidate_context_lifecycle_item_id_invalid"),
      state: value.state,
      removed_from_revision_id: requiredString(value.removed_from_revision_id, "candidate_context_lifecycle_revision_id_invalid"),
      removed_at: validIso(value.removed_at, "candidate_context_lifecycle_removed_at_invalid"),
      reason: value.reason,
      authority: value.authority,
    });
  }

  function validateJobContextLifecycle(record) {
    const value = prepare(record, FIELDS.lifecycle.filter((field) => field !== "item_id"), "job_context_lifecycle");
    if (value.contract_id !== "ariadne-job-context-lifecycle-v1") throw new TruthPersistenceError("job_context_lifecycle_contract_invalid");
    if (value.state !== "REMOVED") throw new TruthPersistenceError("job_context_lifecycle_state_invalid");
    if (value.reason !== "USER_REMOVED") throw new TruthPersistenceError("job_context_lifecycle_reason_invalid");
    if (value.authority !== AUTHORITY.lifecycle) throw new TruthPersistenceError("job_context_lifecycle_authority_invalid");
    return Object.freeze({
      contract_id: value.contract_id,
      lifecycle_id: requiredString(value.lifecycle_id, "job_context_lifecycle_id_invalid"),
      context_id: requiredString(value.context_id, "job_context_lifecycle_context_id_invalid"),
      state: value.state,
      removed_from_revision_id: requiredString(value.removed_from_revision_id, "job_context_lifecycle_revision_id_invalid"),
      removed_at: validIso(value.removed_at, "job_context_lifecycle_removed_at_invalid"),
      reason: value.reason,
      authority: value.authority,
    });
  }

  function validateRuntimeSnapshotRecord(snapshot) {
    if (!RuntimeExecution || typeof RuntimeExecution.validateRuntimeSnapshot !== "function") throw new TruthPersistenceError("runtime_snapshot_validator_unavailable");
    try { return RuntimeExecution.validateRuntimeSnapshot(snapshot); }
    catch (_error) { throw new TruthPersistenceError("runtime_snapshot_invalid"); }
  }

  function validateExecutionChain(input) {
    const snapshot = validateRuntimeSnapshotRecord(input?.runtime_snapshot);
    const run = validateProcessingRun(input?.processing_run);
    const proposal = validateProposal(input?.proposal);
    const sources = (input?.source_documents || []).map(validateSourceDocument);
    const sourceIds = new Set(sources.map((source) => source.source_document_id));
    if (run.runtime_snapshot_id !== snapshot.snapshot_id || proposal.runtime_snapshot_id !== snapshot.snapshot_id) throw new TruthPersistenceError("runtime_snapshot_linkage_mismatch");
    if (proposal.processing_run_id !== run.run_id) throw new TruthPersistenceError("proposal_run_linkage_mismatch");
    if (proposal.source_document_ids.some((id) => !sourceIds.has(id))) throw new TruthPersistenceError("proposal_source_linkage_mismatch");
    if (run.source_document_id && !proposal.source_document_ids.includes(run.source_document_id)) throw new TruthPersistenceError("processing_run_source_linkage_mismatch");
    return Object.freeze({ runtime_snapshot: snapshot, processing_run: run, proposal, source_documents: sources });
  }

  function applyReviewDecision(input) {
    const proposal = validateProposal(input?.proposal);
    const review = validateReviewDecision(input?.review_decision);
    if (proposal.status !== "AWAITING_REVIEW") throw new TruthPersistenceError("proposal_not_reviewable");
    if (review.proposal_id !== proposal.proposal_id) throw new TruthPersistenceError("review_proposal_linkage_mismatch");
    if (review.decision === "CONFIRM" && canonicalJson(review.accepted_payload) !== canonicalJson(proposal.payload)) {
      throw new TruthPersistenceError("review_confirm_payload_mismatch");
    }
    if (review.decision === "REJECT") {
      return Object.freeze({ proposal: Object.freeze({ ...proposal, status: "REJECTED" }), review_decision: review, revision: null });
    }
    const contextType = proposal.proposal_type === "CANDIDATE_CONTEXT" ? "CANDIDATE" : "JOB";
    const current = input.current_revision === null || input.current_revision === undefined ? null : validateContextRevision(input.current_revision);
    const expectedVersion = input.expected_version;
    const actualVersion = current?.version || 0;
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0 || expectedVersion !== actualVersion) throw new TruthPersistenceError("context_version_conflict");
    const contextId = requiredString(input.context_id, "context_revision_context_id_invalid");
    if (current && (current.context_id !== contextId || current.context_type !== contextType)) throw new TruthPersistenceError("context_revision_base_mismatch");
    const revision = validateContextRevision({
      contract_id: "ariadne-context-revision-v1",
      context_type: contextType,
      context_id: contextId,
      revision_id: requiredString(input.revision_id, "context_revision_id_invalid"),
      version: actualVersion + 1,
      previous_revision_id: current?.revision_id || null,
      confirmed_from_proposal_id: proposal.proposal_id,
      review_decision_id: review.review_id,
      created_at: review.reviewed_at,
      provenance: {
        source_document_ids: proposal.source_document_ids,
        processing_run_id: proposal.processing_run_id,
        runtime_snapshot_id: proposal.runtime_snapshot_id,
      },
      payload: review.accepted_payload,
      authority: AUTHORITY.revision,
    });
    return Object.freeze({ proposal: Object.freeze({ ...proposal, status: "ACCEPTED" }), review_decision: review, revision });
  }

  function applyWorkspaceAcceptance(input) {
    const workingModel = validateCandidateWorkingModel(input?.working_model);
    const proposals = (input?.proposals || []).map(validateProposal);
    if (!proposals.length || proposals.length !== workingModel.proposal_ids.length) throw new TruthPersistenceError("workspace_acceptance_proposal_set_invalid");
    const proposalIds = new Set(proposals.map((proposal) => proposal.proposal_id));
    if (workingModel.proposal_ids.some((proposalId) => !proposalIds.has(proposalId))) throw new TruthPersistenceError("workspace_acceptance_proposal_set_invalid");
    if (proposals.some((proposal) => proposal.proposal_type !== "CANDIDATE_CONTEXT" || proposal.status !== "AWAITING_REVIEW"
      || proposal.payload?.contract_id !== "ariadne-model-candidate-proposal-payload-v1" || !proposal.source_document_ids.includes(workingModel.source_document_id)
      || proposal.processing_run_id !== workingModel.processing_run_id || proposal.runtime_snapshot_id !== workingModel.runtime_snapshot_id)) {
      throw new TruthPersistenceError("workspace_acceptance_lineage_mismatch");
    }
    const current = input?.current_revision === null || input?.current_revision === undefined ? null : validateContextRevision(input.current_revision);
    const actualVersion = current?.version || 0;
    if (!Number.isInteger(input?.expected_revision_version) || input.expected_revision_version !== actualVersion) throw new TruthPersistenceError("context_version_conflict");
    const acceptedAt = validIso(input?.accepted_at, "candidate_workspace_acceptance_timestamp_invalid");
    const contextId = requiredString(input?.context_id, "candidate_workspace_acceptance_context_id_invalid");
    if (current && (current.context_id !== contextId || current.context_type !== "CANDIDATE")) throw new TruthPersistenceError("context_revision_base_mismatch");
    const acceptanceId = requiredString(input?.acceptance_id, "candidate_workspace_acceptance_id_invalid");
    const revisionId = requiredString(input?.revision_id, "context_revision_id_invalid");
    const acceptance = validateCandidateWorkspaceAcceptance({
      contract_id: "ariadne-candidate-workspace-acceptance-v1",
      acceptance_id: acceptanceId,
      context_id: contextId,
      source_document_id: workingModel.source_document_id,
      processing_run_id: workingModel.processing_run_id,
      runtime_snapshot_id: workingModel.runtime_snapshot_id,
      proposal_ids: workingModel.proposal_ids,
      working_model_id: workingModel.working_model_id,
      working_model_version: workingModel.version,
      working_model_fingerprint: workingModel.fingerprint,
      accepted_at: acceptedAt,
      confirmed_revision_id: revisionId,
      previous_revision_id: current?.revision_id || null,
      accepted_payload: workingModel.payload,
      authority: AUTHORITY.workspace_acceptance,
    });
    const revision = validateContextRevision({
      contract_id: "ariadne-context-revision-v2",
      context_type: "CANDIDATE",
      context_id: contextId,
      revision_id: revisionId,
      version: actualVersion + 1,
      previous_revision_id: current?.revision_id || null,
      workspace_acceptance_id: acceptanceId,
      created_at: acceptedAt,
      provenance: {
        source_document_ids: [workingModel.source_document_id],
        processing_run_id: workingModel.processing_run_id,
        runtime_snapshot_id: workingModel.runtime_snapshot_id,
      },
      payload: workingModel.payload,
      authority: AUTHORITY.revision,
    });
    return Object.freeze({ working_model: workingModel, workspace_acceptance: acceptance, revision });
  }

  function validateForStore(storeName, value) {
    const validators = {
      source_documents: validateSourceDocument,
      runtime_snapshots: validateRuntimeSnapshotRecord,
      extraction_artifacts: validateExtractionArtifact,
      processing_runs: validateProcessingRun,
      processing_batches: validateProcessingBatch,
      context_proposals: validateProposal,
      context_review_decisions: validateReviewDecision,
      candidate_working_models: validateCandidateWorkingModel,
      candidate_workspace_acceptances: validateCandidateWorkspaceAcceptance,
      candidate_context_revisions: validateContextRevision,
      candidate_context_lifecycle: validateCandidateContextLifecycle,
      job_context_revisions: validateContextRevision,
      job_context_lifecycle: validateJobContextLifecycle,
    };
    const validator = validators[storeName];
    if (!validator) throw new TruthPersistenceError("persistence_store_unsupported");
    const validated = validator(value);
    if (storeName === "candidate_context_revisions" && validated.context_type !== "CANDIDATE") throw new TruthPersistenceError("context_revision_store_mismatch");
    if (storeName === "job_context_revisions" && validated.context_type !== "JOB") throw new TruthPersistenceError("context_revision_store_mismatch");
    return validated;
  }

  function ensureTruthStores(database) {
    if (!database || !database.objectStoreNames || typeof database.createObjectStore !== "function") throw new TruthPersistenceError("indexeddb_upgrade_target_invalid");
    const created = [];
    STORE_SPECS.forEach((spec) => {
      if (!database.objectStoreNames.contains(spec.name)) {
        database.createObjectStore(spec.name, { keyPath: spec.keyPath });
        created.push(spec.name);
      }
    });
    return created;
  }

  function openDatabase(indexedDb = globalThis.indexedDB) {
    if (indexedDb === globalThis.indexedDB && globalThis.AriadneContentDatabase) {
      return globalThis.AriadneContentDatabase.open(DB_NAME);
    }
    return openNativeDatabase(indexedDb);
  }

  function openNativeDatabase(indexedDb) {
    if (!indexedDb || typeof indexedDb.open !== "function") return Promise.reject(new TruthPersistenceError("indexeddb_unavailable"));
    return new Promise((resolve, reject) => {
      const request = indexedDb.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => ensureTruthStores(request.result);
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error || new TruthPersistenceError("indexeddb_open_failed"));
      request.onblocked = () => reject(new TruthPersistenceError("indexeddb_upgrade_blocked"));
    });
  }

  function persistRecord(database, storeName, record) {
    if (storeName === "candidate_working_models") return persistCandidateWorkingModel(database, record);
    if (storeName === "candidate_workspace_acceptances") return Promise.reject(new TruthPersistenceError("workspace_acceptance_specialized_persistence_required"));
    const validated = validateForStore(storeName, record);
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const method = APPEND_ONLY_STORES.includes(storeName) ? "add" : "put";
      store[method](clone(validated));
      transaction.oncomplete = () => resolve(validated);
      transaction.onerror = () => reject(transaction.error || new TruthPersistenceError("persistence_write_failed"));
      transaction.onabort = () => reject(transaction.error || new TruthPersistenceError("persistence_write_aborted"));
    });
  }

  function persistCandidateWorkingModel(database, model) {
    const workingModel = validateCandidateWorkingModel(model);
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("candidate_working_models", "readwrite");
      let contractError = null;
      const store = transaction.objectStore("candidate_working_models");
      const request = store.getAll();
      request.onsuccess = () => {
        try {
          const models = (request.result || []).map(validateCandidateWorkingModel).filter((entry) => entry.source_document_id === workingModel.source_document_id).sort((left, right) => right.version - left.version);
          const head = models[0] || null;
          const expectedVersion = (head?.version || 0) + 1;
          const expectedPreviousId = head?.working_model_id || null;
          if (workingModel.version !== expectedVersion || workingModel.previous_working_model_id !== expectedPreviousId) throw new TruthPersistenceError("candidate_working_model_stale");
          store.add(clone(workingModel));
        } catch (error) {
          contractError = error;
          transaction.abort();
        }
      };
      request.onerror = () => { contractError = new TruthPersistenceError("candidate_working_model_read_failed"); transaction.abort(); };
      transaction.oncomplete = () => resolve(workingModel);
      transaction.onerror = () => reject(contractError || transaction.error || new TruthPersistenceError("candidate_working_model_persistence_failed"));
      transaction.onabort = () => reject(contractError || transaction.error || new TruthPersistenceError("candidate_working_model_persistence_aborted"));
    });
  }

  function persistReviewOutcome(database, outcome) {
    const proposal = validateProposal(outcome?.proposal);
    const review = validateReviewDecision(outcome?.review_decision);
    const revision = outcome?.revision === null ? null : validateContextRevision(outcome?.revision);
    if (review.proposal_id !== proposal.proposal_id) throw new TruthPersistenceError("review_proposal_linkage_mismatch");
    if (revision) {
      const expectedContextType = proposal.proposal_type === "CANDIDATE_CONTEXT" ? "CANDIDATE" : "JOB";
      if (review.decision === "REJECT" || proposal.status !== "ACCEPTED") throw new TruthPersistenceError("confirmed_outcome_status_invalid");
      if (revision.context_type !== expectedContextType || revision.confirmed_from_proposal_id !== proposal.proposal_id || revision.review_decision_id !== review.review_id) {
        throw new TruthPersistenceError("confirmed_outcome_linkage_mismatch");
      }
      if (canonicalJson(revision.payload) !== canonicalJson(review.accepted_payload)) throw new TruthPersistenceError("confirmed_outcome_payload_mismatch");
    } else if (review.decision !== "REJECT" || proposal.status !== "REJECTED") {
      throw new TruthPersistenceError("rejected_outcome_status_invalid");
    }
    const revisionStore = revision?.context_type === "CANDIDATE" ? "candidate_context_revisions" : "job_context_revisions";
    const storeNames = ["context_proposals", "context_review_decisions", ...(revision ? [revisionStore] : [])];
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeNames, "readwrite");
      let contractError = null;
      let persistedProposalReady = false;
      let revisionHeadReady = revision === null;
      let writeStarted = false;
      const writeOutcome = () => {
        if (writeStarted || !persistedProposalReady || !revisionHeadReady) return;
        writeStarted = true;
        transaction.objectStore("context_proposals").put(clone(proposal));
        transaction.objectStore("context_review_decisions").add(clone(review));
        if (revision) transaction.objectStore(revisionStore).add(clone(revision));
      };
      const abortWith = (error) => {
        if (contractError) return;
        contractError = error;
        transaction.abort();
      };
      const proposalRequest = transaction.objectStore("context_proposals").get(proposal.proposal_id);
      proposalRequest.onsuccess = () => {
        try {
          if (!proposalRequest.result) throw new TruthPersistenceError("proposal_not_persisted");
          const persistedProposal = validateProposal(proposalRequest.result);
          if (persistedProposal.status !== "AWAITING_REVIEW") throw new TruthPersistenceError("proposal_not_reviewable");
          if (persistedProposal.processing_run_id !== proposal.processing_run_id || persistedProposal.runtime_snapshot_id !== proposal.runtime_snapshot_id) {
            throw new TruthPersistenceError("proposal_persistence_linkage_mismatch");
          }
          persistedProposalReady = true;
          writeOutcome();
        } catch (error) {
          abortWith(error instanceof TruthPersistenceError ? error : new TruthPersistenceError("persisted_proposal_invalid"));
        }
      };
      proposalRequest.onerror = () => abortWith(new TruthPersistenceError("proposal_persistence_read_failed"));
      if (revision) {
        const request = transaction.objectStore(revisionStore).getAll();
        request.onsuccess = () => {
          const current = (request.result || [])
            .filter((item) => item?.context_id === revision.context_id)
            .sort((left, right) => Number(right.version || 0) - Number(left.version || 0))[0] || null;
          const currentVersion = Number(current?.version || 0);
          const currentRevisionId = current?.revision_id || null;
          if (revision.version !== currentVersion + 1 || revision.previous_revision_id !== currentRevisionId) {
            abortWith(new TruthPersistenceError("context_version_conflict"));
            return;
          }
          revisionHeadReady = true;
          writeOutcome();
        };
        request.onerror = () => abortWith(new TruthPersistenceError("context_revision_read_failed"));
      } else {
        writeOutcome();
      }
      transaction.oncomplete = () => resolve(Object.freeze({ proposal, review_decision: review, revision }));
      transaction.onerror = () => reject(transaction.error || new TruthPersistenceError("persistence_review_write_failed"));
      transaction.onabort = () => reject(contractError || transaction.error || new TruthPersistenceError("persistence_review_write_aborted"));
    });
  }

  function persistWorkspaceAcceptance(database, outcome) {
    const workingModel = validateCandidateWorkingModel(outcome?.working_model);
    const acceptance = validateCandidateWorkspaceAcceptance(outcome?.workspace_acceptance);
    const revision = validateContextRevision(outcome?.revision);
    if (revision.contract_id !== "ariadne-context-revision-v2" || revision.workspace_acceptance_id !== acceptance.acceptance_id
      || acceptance.confirmed_revision_id !== revision.revision_id || acceptance.context_id !== revision.context_id
      || acceptance.previous_revision_id !== revision.previous_revision_id || acceptance.source_document_id !== workingModel.source_document_id
      || acceptance.processing_run_id !== workingModel.processing_run_id || acceptance.runtime_snapshot_id !== workingModel.runtime_snapshot_id
      || canonicalJson(acceptance.proposal_ids) !== canonicalJson(workingModel.proposal_ids)
      || acceptance.working_model_id !== workingModel.working_model_id || acceptance.working_model_version !== workingModel.version
      || acceptance.working_model_fingerprint !== workingModel.fingerprint || canonicalJson(acceptance.accepted_payload) !== canonicalJson(workingModel.payload)
      || canonicalJson(revision.payload) !== canonicalJson(workingModel.payload)
      || canonicalJson(revision.provenance) !== canonicalJson({ source_document_ids: [workingModel.source_document_id], processing_run_id: workingModel.processing_run_id, runtime_snapshot_id: workingModel.runtime_snapshot_id })) {
      throw new TruthPersistenceError("workspace_acceptance_outcome_linkage_mismatch");
    }
    const storeNames = ["context_proposals", "candidate_working_models", "candidate_workspace_acceptances", "candidate_context_revisions"];
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeNames, "readwrite");
      let contractError = null;
      let workingReady = false;
      let proposalsReady = false;
      let revisionReady = false;
      let writeStarted = false;
      const abortWith = (error) => { if (!contractError) contractError = error; transaction.abort(); };
      const writeWhenReady = () => {
        if (writeStarted || !workingReady || !proposalsReady || !revisionReady) return;
        writeStarted = true;
        transaction.objectStore("candidate_workspace_acceptances").add(clone(acceptance));
        transaction.objectStore("candidate_context_revisions").add(clone(revision));
      };
      const workingRequest = transaction.objectStore("candidate_working_models").getAll();
      workingRequest.onsuccess = () => {
        try {
          const models = (workingRequest.result || []).map(validateCandidateWorkingModel).filter((model) => model.source_document_id === workingModel.source_document_id).sort((a, b) => b.version - a.version);
          const head = models[0];
          if (!head || head.working_model_id !== workingModel.working_model_id || head.version !== workingModel.version || head.fingerprint !== workingModel.fingerprint) throw new TruthPersistenceError("candidate_working_model_stale");
          workingReady = true;
          writeWhenReady();
        } catch (error) { abortWith(error); }
      };
      workingRequest.onerror = () => abortWith(new TruthPersistenceError("candidate_working_model_read_failed"));
      const proposalRequest = transaction.objectStore("context_proposals").getAll();
      proposalRequest.onsuccess = () => {
        try {
          const persisted = new Map((proposalRequest.result || []).map((proposal) => [proposal.proposal_id, validateProposal(proposal)]));
          if (acceptance.proposal_ids.some((proposalId) => !persisted.has(proposalId))) throw new TruthPersistenceError("workspace_acceptance_proposal_not_persisted");
          proposalsReady = true;
          writeWhenReady();
        } catch (error) { abortWith(error); }
      };
      proposalRequest.onerror = () => abortWith(new TruthPersistenceError("workspace_acceptance_proposal_read_failed"));
      const revisionRequest = transaction.objectStore("candidate_context_revisions").getAll();
      revisionRequest.onsuccess = () => {
        const current = (revisionRequest.result || []).map(validateContextRevision).filter((item) => item.context_id === revision.context_id).sort((a, b) => b.version - a.version)[0] || null;
        if (revision.version !== (current?.version || 0) + 1 || revision.previous_revision_id !== (current?.revision_id || null)) return abortWith(new TruthPersistenceError("context_version_conflict"));
        revisionReady = true;
        writeWhenReady();
      };
      revisionRequest.onerror = () => abortWith(new TruthPersistenceError("context_revision_read_failed"));
      transaction.oncomplete = () => resolve(Object.freeze({ working_model: workingModel, workspace_acceptance: acceptance, revision }));
      transaction.onerror = () => reject(contractError || transaction.error || new TruthPersistenceError("persistence_workspace_acceptance_failed"));
      transaction.onabort = () => reject(contractError || transaction.error || new TruthPersistenceError("persistence_workspace_acceptance_aborted"));
    });
  }

  return Object.freeze({
    CONTRACT_ID,
    DB_NAME,
    DB_VERSION,
    STORE_SPECS,
    NEW_STORE_SPECS,
    STORE_NAMES,
    SOURCE_TYPES,
    MATERIAL_TYPES,
    PROCESSING_STATUSES,
    BATCH_STATUSES,
    PROPOSAL_TYPES,
    PROPOSAL_STATUSES,
    REVIEW_DECISIONS,
    CONTEXT_TYPES,
    CANDIDATE_CONTEXT_LIFECYCLE_STATES,
    CANCEL_REASON,
    APPEND_ONLY_STORES,
    AUTHORITY,
    FIELDS,
    TruthPersistenceError,
    validateSourceDocument,
    validateExtractionArtifact,
    validateProcessingRun,
    validateProcessingBatch,
    validateProposal,
    cancelProcessingRun,
    cancelProposal,
    validateCancelledWorkflowState,
    validateReviewDecision,
    validateCandidateWorkingModel,
    validateCandidateWorkspaceAcceptance,
    validateContextRevision,
    validateCandidateContextLifecycle,
    validateJobContextLifecycle,
    validateRuntimeSnapshotRecord,
    validateExecutionChain,
    applyReviewDecision,
    applyWorkspaceAcceptance,
    validateForStore,
    ensureTruthStores,
    openDatabase,
    persistRecord,
    persistCandidateWorkingModel,
    persistReviewOutcome,
    persistWorkspaceAcceptance,
  });
}));
