"use strict";

(function attachJobContextDomain(root, factory) {
  const truth = root.AriadneTruthPersistence
    || (typeof module === "object" && module.exports ? require("./truth-persistence-domain.js") : null);
  const manifest = root.AriadneJobIntelligenceContract
    || (typeof module === "object" && module.exports ? require("../data/job_intelligence_contract_v1.json") : null);
  const api = factory(truth, manifest);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AriadneJobContext = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createJobContextDomain(Truth, Manifest) {
  if (!Truth || !Manifest) throw new Error("job_context_dependencies_required");

  const PAYLOAD_CONTRACT = Manifest.job_context_payload_version;
  const CHANGE_PROPOSAL_CONTRACT = Manifest.job_change_proposal_version;
  const CONTENT_ORIGINS = Object.freeze(["SOURCE_DERIVED", "HUMAN_EDITED", "HUMAN_CONFIRMED", "MODEL_PROPOSED"]);
  const EDITABLE_FIELDS = Object.freeze([...Manifest.editable_job_fields]);
  const REQUIREMENT_HEADINGS = Object.freeze([
    "任职要求", "岗位要求", "职位要求", "任职资格", "我们要找的人", "我们希望你", "我们需要你",
    "requirements", "qualifications", "what you bring", "who you are",
  ]);
  const COMPANY_HINT = /(?:公司|集团|科技|实验室|工作室|studio|labs?|inc\.?|ltd\.?|company|corporation)/iu;
  const LOCATION_HINT = /(?:北京|上海|深圳|广州|杭州|成都|武汉|南京|苏州|西安|重庆|香港|澳门|台北|remote|hybrid|on[- ]?site|远程|混合办公)/iu;
  const BULLET = /^(?:[•●▪‣·*\-]|\d+[.、)])\s*/u;

  class JobContextError extends Error {
    constructor(code) { super(code); this.name = "JobContextError"; this.code = code; }
  }

  const nowIso = () => new Date().toISOString();
  const clone = (value) => structuredClone(value);
  const id = (prefix) => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  const safe = (value) => String(value || "job").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").slice(-96);

  function requiredText(value, code, maximum = 12000) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) throw new JobContextError(code);
    return value.trim();
  }

  function optionalText(value, code, maximum = 12000) {
    if (value === null) return null;
    return requiredText(value, code, maximum);
  }

  function sourceRef(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new JobContextError("job_source_ref_invalid");
    return Object.freeze({
      source_document_id: requiredText(value.source_document_id, "job_source_ref_source_invalid", 256),
      location: requiredText(value.location, "job_source_ref_location_invalid", 256),
      excerpt_or_reference: requiredText(value.excerpt_or_reference, "job_source_ref_excerpt_invalid", 4000),
    });
  }

  function validateRequirement(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new JobContextError("job_requirement_invalid");
    const refs = Array.isArray(value.grounding_refs) ? value.grounding_refs.map(sourceRef) : (() => { throw new JobContextError("job_requirement_grounding_invalid"); })();
    if (!CONTENT_ORIGINS.includes(value.content_origin)) throw new JobContextError("job_requirement_origin_invalid");
    return Object.freeze({
      requirement_id: requiredText(value.requirement_id, "job_requirement_id_invalid", 256),
      label: requiredText(value.label, "job_requirement_label_invalid", 240),
      detail: requiredText(value.detail, "job_requirement_detail_invalid", 4000),
      grounding_refs: refs,
      content_origin: value.content_origin,
    });
  }

  function validateJobPayload(value) {
    if (!value || typeof value !== "object" || Array.isArray(value) || value.contract_id !== PAYLOAD_CONTRACT) {
      throw new JobContextError("job_payload_contract_invalid");
    }
    const requirements = Array.isArray(value.requirements) ? value.requirements.map(validateRequirement) : (() => { throw new JobContextError("job_requirements_invalid"); })();
    const sourceIds = Array.isArray(value.source_document_ids)
      ? value.source_document_ids.map((entry) => requiredText(entry, "job_source_id_invalid", 256))
      : (() => { throw new JobContextError("job_source_ids_invalid"); })();
    if (!sourceIds.length || new Set(sourceIds).size !== sourceIds.length) throw new JobContextError("job_source_ids_invalid");
    if (!Manifest.source_availability.includes(value.source_availability)) throw new JobContextError("job_source_availability_invalid");
    const fieldProvenance = value.field_provenance;
    if (!fieldProvenance || typeof fieldProvenance !== "object" || Array.isArray(fieldProvenance)) throw new JobContextError("job_field_provenance_invalid");
    for (const field of EDITABLE_FIELDS) {
      if (!CONTENT_ORIGINS.includes(fieldProvenance[field])) throw new JobContextError("job_field_provenance_invalid");
    }
    if (!Array.isArray(value.uncertainties)) throw new JobContextError("job_uncertainties_invalid");
    return Object.freeze({
      contract_id: PAYLOAD_CONTRACT,
      title: requiredText(value.title, "job_title_required", 500),
      company: optionalText(value.company, "job_company_invalid", 500),
      location: optionalText(value.location, "job_location_invalid", 500),
      summary: optionalText(value.summary, "job_summary_invalid", 12000),
      requirements,
      source_document_ids: sourceIds,
      source_url: value.source_url === null ? null : requiredText(value.source_url, "job_source_url_invalid", 4000),
      source_availability: value.source_availability,
      field_provenance: Object.freeze(Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, fieldProvenance[field]]))),
      uncertainties: clone(value.uncertainties),
    });
  }

  function normalizedLines(text) {
    return String(text || "").normalize("NFKC").split(/\r?\n/).map((line, index) => ({
      number: index + 1,
      text: line.replace(/\s+/g, " ").trim(),
    })).filter((line) => line.text);
  }

  function headingIndex(lines) {
    return lines.findIndex((line) => REQUIREMENT_HEADINGS.some((heading) => line.text.toLocaleLowerCase().includes(heading.toLocaleLowerCase())));
  }

  function refFor(sourceId, line) {
    return { source_document_id: sourceId, location: `line ${line.number}`, excerpt_or_reference: line.text.slice(0, 1200) };
  }

  function deriveJobPayload({ source, artifact, source_url: sourceUrl = null }) {
    const sourceId = requiredText(source?.source_document_id, "job_source_required", 256);
    const text = String(artifact?.payload?.extracted_text || "").trim();
    const lines = normalizedLines(text);
    if (!lines.length) throw new JobContextError("job_extracted_text_required");
    const first = lines[0];
    const title = first.text.slice(0, 500);
    const companyLine = lines.slice(1, 8).find((line) => COMPANY_HINT.test(line.text) && !LOCATION_HINT.test(line.text)) || null;
    const locationLine = lines.slice(1, 12).find((line) => LOCATION_HINT.test(line.text)) || null;
    const start = headingIndex(lines);
    const requirementLines = lines.filter((line, index) => {
      if (index === 0 || index === start) return false;
      if (start >= 0 && index > start) return BULLET.test(line.text) || line.text.length <= 360;
      return BULLET.test(line.text);
    }).slice(0, 40);
    const requirements = requirementLines.map((line, index) => {
      const detail = line.text.replace(BULLET, "").trim();
      const label = detail.length > 36 ? `${detail.slice(0, 34)}…` : detail;
      return {
        requirement_id: `job-requirement-${safe(sourceId)}-${index + 1}`,
        label,
        detail,
        grounding_refs: [refFor(sourceId, line)],
        content_origin: "SOURCE_DERIVED",
      };
    });
    const summaryLines = lines.slice(1).filter((line) => !requirementLines.includes(line) && line !== companyLine && line !== locationLine).slice(0, 8);
    const summary = summaryLines.map((line) => line.text).join(" ").slice(0, 1800) || null;
    const uncertainties = [];
    if (!companyLine) uncertainties.push({ field: "company", code: "DETERMINISTIC_VALUE_UNRESOLVED" });
    if (!locationLine) uncertainties.push({ field: "location", code: "DETERMINISTIC_VALUE_UNRESOLVED" });
    if (!requirements.length) uncertainties.push({ field: "requirements", code: "DETERMINISTIC_REQUIREMENTS_UNRESOLVED" });
    return validateJobPayload({
      contract_id: PAYLOAD_CONTRACT,
      title,
      company: companyLine?.text || null,
      location: locationLine?.text || null,
      summary,
      requirements,
      source_document_ids: [sourceId],
      source_url: sourceUrl,
      source_availability: source?.local_reference ? "ORIGINAL_AVAILABLE" : "RAW_TEXT_AVAILABLE",
      field_provenance: { title: "SOURCE_DERIVED", company: "SOURCE_DERIVED", location: "SOURCE_DERIVED", summary: "SOURCE_DERIVED" },
      uncertainties,
    });
  }

  function proposalFor({ source, artifact, structuring_run: structuringRun, source_url: sourceUrl = null }) {
    const payload = deriveJobPayload({ source, artifact, source_url: sourceUrl });
    const refs = [...new Map([
      ...(artifact.source_refs || []),
      ...payload.requirements.flatMap((entry) => entry.grounding_refs),
    ].map((ref) => [`${ref.source_document_id}|${ref.location}|${ref.excerpt_or_reference}`, ref])).values()];
    return Truth.validateProposal({
      contract_id: "ariadne-context-proposal-v1",
      proposal_id: id("proposal-job-local"),
      proposal_type: "JOB_CONTEXT",
      source_document_ids: [source.source_document_id],
      processing_run_id: structuringRun.run_id,
      runtime_snapshot_id: structuringRun.runtime_snapshot_id,
      status: "AWAITING_REVIEW",
      created_at: nowIso(),
      payload,
      grounding_refs: refs.length ? refs : [{ source_document_id: source.source_document_id, location: "document", excerpt_or_reference: "Source retained; no text block was extractable." }],
      warnings: [...(artifact.warnings || [])],
      uncertainties: clone(payload.uncertainties),
      authority: Truth.AUTHORITY.proposal,
    });
  }

  function structuringRunFor(source, snapshotId, status = "PENDING", patch = {}) {
    const timestamp = patch.timestamp || nowIso();
    const terminal = ["SUCCEEDED", "FAILED", "CANCELLED"].includes(status);
    return Truth.validateProcessingRun({
      contract_id: "ariadne-processing-run-v1",
      run_id: patch.run_id || id("run-job-structuring"),
      operation_type: "JOB_LOCAL_DETERMINISTIC_STRUCTURING",
      source_document_id: source.source_document_id,
      batch_id: source.batch_id,
      runtime_snapshot_id: snapshotId,
      started_at: status === "PENDING" ? null : (patch.started_at || timestamp),
      finished_at: terminal ? (patch.finished_at || timestamp) : null,
      status,
      error_code: patch.error_code || null,
      output_artifact_ids: [],
      proposal_ids: patch.proposal_ids || [],
      authority: Truth.AUTHORITY.execution,
    });
  }

  function contextIdForProposal(proposal) { return `job-context-${safe(proposal.proposal_id)}`; }

  function latestRevision(revisions, contextId) {
    return (revisions || []).filter((entry) => entry.context_type === "JOB" && (!contextId || entry.context_id === contextId))
      .sort((left, right) => Number(right.version || 0) - Number(left.version || 0))[0] || null;
  }

  function latestRevisions(revisions) {
    const heads = new Map();
    (revisions || []).filter((entry) => entry.context_type === "JOB" && entry.authority === Truth.AUTHORITY.revision).forEach((entry) => {
      const current = heads.get(entry.context_id);
      if (!current || entry.version > current.version) heads.set(entry.context_id, entry);
    });
    return [...heads.values()];
  }

  function activeRevisions(revisions, lifecycle = []) {
    const removed = new Set(lifecycle.map(Truth.validateJobContextLifecycle).map((entry) => entry.context_id));
    return latestRevisions(revisions).filter((entry) => !removed.has(entry.context_id));
  }

  function persistRemoval(database, currentRevision) {
    const current = Truth.validateContextRevision(currentRevision);
    if (current.context_type !== "JOB") throw new Error("job_context_removal_type_invalid");
    const removal = Truth.validateJobContextLifecycle({
      contract_id: "ariadne-job-context-lifecycle-v1", lifecycle_id: `job-removal-${crypto.randomUUID()}`,
      context_id: current.context_id, state: "REMOVED", removed_from_revision_id: current.revision_id,
      removed_at: new Date().toISOString(), reason: "USER_REMOVED", authority: Truth.AUTHORITY.lifecycle,
    });
    return new Promise((resolve, reject) => {
      const tx = database.transaction(["job_context_revisions", "job_context_lifecycle"], "readwrite");
      let revisions, lifecycle, failure;
      const write = () => {
        if (!revisions || !lifecycle) return;
        const head = latestRevision(revisions, current.context_id);
        if (!head || head.revision_id !== current.revision_id || head.version !== current.version) failure = new Error("context_version_conflict");
        else if (!activeRevisions(revisions, lifecycle).some((entry) => entry.context_id === current.context_id)) failure = new Error("job_context_already_removed");
        if (failure) { tx.abort(); return; }
        tx.objectStore("job_context_lifecycle").add(removal);
      };
      const revisionRequest = tx.objectStore("job_context_revisions").getAll();
      revisionRequest.onsuccess = () => { revisions = revisionRequest.result; write(); };
      const lifecycleRequest = tx.objectStore("job_context_lifecycle").getAll();
      lifecycleRequest.onsuccess = () => { lifecycle = lifecycleRequest.result; write(); };
      tx.oncomplete = () => resolve(removal);
      tx.onerror = tx.onabort = () => reject(failure || tx.error || new Error("job_context_removal_failed"));
    });
  }

  function acceptedPayload(proposal, edits = {}) {
    const payload = clone(validateJobPayload(proposal.payload));
    for (const field of EDITABLE_FIELDS) {
      if (!Object.hasOwn(edits, field)) continue;
      const nextValue = field === "title" ? requiredText(edits[field], "job_title_required", 500) : (String(edits[field] || "").trim() || null);
      const changed = nextValue !== payload[field];
      payload[field] = nextValue;
      payload.field_provenance[field] = changed ? "HUMAN_EDITED" : ["SOURCE_DERIVED", "MODEL_PROPOSED"].includes(payload.field_provenance[field]) ? "HUMAN_CONFIRMED" : payload.field_provenance[field];
    }
    if (Array.isArray(edits.requirements)) {
      payload.requirements = edits.requirements.map((entry, index) => validateRequirement({
        ...entry,
        requirement_id: entry.requirement_id || `job-requirement-${safe(proposal.source_document_ids[0])}-human-${index + 1}`,
        content_origin: ["SOURCE_DERIVED", "MODEL_PROPOSED"].includes(entry.content_origin) ? "HUMAN_CONFIRMED" : "HUMAN_EDITED",
        grounding_refs: entry.grounding_refs || [],
      }));
    }
    // Saving a field does not resolve unrelated unknowns in the source material.
    return validateJobPayload(payload);
  }

  function workingPayload(proposal, edits = {}) {
    const checked = Truth.validateProposal(proposal);
    if (checked.proposal_type !== "JOB_CONTEXT" || checked.status !== "AWAITING_REVIEW") throw new JobContextError("job_working_proposal_invalid");
    if (!checked.warnings.includes("model_generated_non_authoritative")) throw new JobContextError("job_working_model_proposal_required");
    const payload = clone(validateJobPayload(checked.payload));
    for (const field of EDITABLE_FIELDS) {
      if (!Object.hasOwn(edits, field)) continue;
      const nextValue = field === "title" ? requiredText(edits[field], "job_title_required", 500) : (String(edits[field] || "").trim() || null);
      if (nextValue !== payload[field]) payload.field_provenance[field] = "HUMAN_EDITED";
      payload[field] = nextValue;
    }
    if (Array.isArray(edits.requirements)) {
      payload.requirements = edits.requirements.map((entry, index) => {
        const current = payload.requirements[index];
        const unchanged = current && current.detail === entry.detail && current.label === entry.label;
        return validateRequirement({
          ...entry,
          requirement_id: entry.requirement_id || current?.requirement_id || `job-requirement-${safe(checked.source_document_ids[0])}-working-${index + 1}`,
          content_origin: unchanged ? current.content_origin : "HUMAN_EDITED",
          grounding_refs: entry.grounding_refs || current?.grounding_refs || [],
        });
      });
    }
    return validateJobPayload(payload);
  }

  function workingSubjectFor(proposal, edits = {}) {
    const checked = Truth.validateProposal(proposal);
    return Object.freeze({
      subject_type: "WORKING_JOB",
      context_id: contextIdForProposal(checked),
      subject_id: checked.proposal_id,
      version: 0,
      created_at: checked.created_at,
      provenance: Object.freeze({
        source_document_ids: [...checked.source_document_ids],
        processing_run_id: checked.processing_run_id,
        runtime_snapshot_id: checked.runtime_snapshot_id,
      }),
      payload: workingPayload(checked, edits),
      authority: Truth.AUTHORITY.working,
    });
  }

  function reviewOutcome({ proposal, decision, edits = {}, current_revision: currentRevision = null, reviewed_at: reviewedAt = nowIso() }) {
    const accepted = decision === "REJECT" ? null : acceptedPayload(proposal, edits);
    const review = Truth.validateReviewDecision({
      contract_id: "ariadne-context-review-decision-v1",
      review_id: id("review-job"),
      proposal_id: proposal.proposal_id,
      decision: decision === "REJECT" ? "REJECT" : (Object.keys(edits).length ? "EDIT_AND_CONFIRM" : "CONFIRM"),
      reviewed_at: reviewedAt,
      accepted_payload: accepted,
      authority: Truth.AUTHORITY.review,
    });
    const contextId = currentRevision?.context_id || contextIdForProposal(proposal);
    return Truth.applyReviewDecision({
      proposal,
      review_decision: review,
      current_revision: currentRevision,
      expected_version: currentRevision?.version || 0,
      context_id: contextId,
      revision_id: `${contextId}-v${(currentRevision?.version || 0) + 1}-${safe(id("revision"))}`,
    });
  }

  function getAll(database, storeName) {
    if (storeName === "source_documents" && database.getAllMetadata) return database.getAllMetadata(storeName);
    return new Promise((resolve, reject) => {
      const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new JobContextError("job_persistence_read_failed"));
    });
  }

  async function persistReview(database, proposal, decision, edits = {}) {
    const revisions = await getAll(database, "job_context_revisions");
    const current = latestRevision(revisions.filter((revision) => revision.provenance?.source_document_ids?.includes(proposal.source_document_ids[0])));
    return Truth.persistReviewOutcome(database, reviewOutcome({ proposal, decision, edits, current_revision: current }));
  }

  function directEditProposal(currentRevision, edits) {
    const current = Truth.validateContextRevision(currentRevision);
    if (current.context_type !== "JOB") throw new JobContextError("job_direct_edit_revision_invalid");
    const payload = clone(validateJobPayload(current.payload));
    for (const field of EDITABLE_FIELDS) {
      if (!Object.hasOwn(edits, field)) continue;
      payload[field] = field === "title" ? requiredText(edits[field], "job_title_required", 500) : (String(edits[field] || "").trim() || null);
      if (payload[field] !== current.payload[field]) payload.field_provenance[field] = "HUMAN_EDITED";
    }
    if (Array.isArray(edits.requirements)) {
      payload.requirements = edits.requirements.map((entry, index) => {
        const previous = current.payload.requirements[index];
        const unchanged = previous && previous.label === entry.label && previous.detail === entry.detail;
        return validateRequirement({
          ...entry,
          requirement_id: entry.requirement_id || previous?.requirement_id || `job-requirement-${safe(current.context_id)}-human-${index + 1}`,
          content_origin: unchanged ? previous.content_origin : "HUMAN_EDITED",
          grounding_refs: entry.grounding_refs || previous?.grounding_refs || [],
        });
      });
    }
    const refs = payload.requirements.flatMap((entry) => entry.grounding_refs || []);
    return Truth.validateProposal({
      contract_id: "ariadne-context-proposal-v1",
      proposal_id: id("proposal-job-human-edit"),
      proposal_type: "JOB_CONTEXT",
      source_document_ids: [...current.provenance.source_document_ids],
      processing_run_id: current.provenance.processing_run_id,
      runtime_snapshot_id: current.provenance.runtime_snapshot_id,
      status: "AWAITING_REVIEW",
      created_at: nowIso(),
      payload: validateJobPayload(payload),
      grounding_refs: refs.length ? refs : [{ source_document_id: current.provenance.source_document_ids[0], location: "human edit", excerpt_or_reference: "Human-authored Job field revision" }],
      warnings: [],
      uncertainties: [],
      authority: Truth.AUTHORITY.proposal,
    });
  }

  async function persistDirectEdit(database, currentRevision, edits) {
    const proposal = directEditProposal(currentRevision, edits);
    await Truth.persistRecord(database, "context_proposals", proposal);
    const outcome = reviewOutcome({ proposal, decision: "CONFIRM", current_revision: currentRevision });
    return Truth.persistReviewOutcome(database, outcome);
  }

  function validateChangeProposal(value) {
    if (!value || typeof value !== "object" || Array.isArray(value) || value.contract_id !== CHANGE_PROPOSAL_CONTRACT) throw new JobContextError("job_change_proposal_invalid");
    if (value.status !== "AWAITING_REVIEW") throw new JobContextError("job_change_proposal_status_invalid");
    if (!EDITABLE_FIELDS.includes(value.field)) throw new JobContextError("job_change_field_invalid");
    if (!["MODEL_PROPOSED", "HUMAN_EDITED"].includes(value.origin)) throw new JobContextError("job_change_origin_invalid");
    return Object.freeze({
      contract_id: CHANGE_PROPOSAL_CONTRACT,
      job_change_proposal_id: requiredText(value.job_change_proposal_id, "job_change_proposal_id_invalid", 256),
      job_context_id: requiredText(value.job_context_id, "job_change_context_id_invalid", 256),
      base_revision_id: requiredText(value.base_revision_id, "job_change_revision_id_invalid", 256),
      base_revision_version: Number.isInteger(value.base_revision_version) && value.base_revision_version > 0 ? value.base_revision_version : (() => { throw new JobContextError("job_change_revision_version_invalid"); })(),
      field: value.field,
      before_value: value.before_value === null ? null : String(value.before_value),
      desired_value: requiredText(value.desired_value, "job_change_value_invalid", Manifest.limits.job_field_value),
      reason: requiredText(value.reason, "job_change_reason_invalid", 4000),
      origin: value.origin,
      source_analysis_id: value.source_analysis_id === null ? null : requiredText(value.source_analysis_id, "job_change_analysis_id_invalid", 256),
      status: value.status,
      created_at: requiredText(value.created_at, "job_change_created_at_invalid", 64),
      authority: value.authority === "NON_AUTHORITATIVE_JOB_PROPOSAL" ? value.authority : (() => { throw new JobContextError("job_change_authority_invalid"); })(),
    });
  }

  function createChangeProposal({ current_revision: currentRevision, field, desired_value: desiredValue, reason, source_analysis_id: analysisId = null, origin = "MODEL_PROPOSED" }) {
    const current = Truth.validateContextRevision(currentRevision);
    if (current.context_type !== "JOB") throw new JobContextError("job_change_revision_type_invalid");
    const payload = validateJobPayload(current.payload);
    return validateChangeProposal({
      contract_id: CHANGE_PROPOSAL_CONTRACT,
      job_change_proposal_id: id("job-change-proposal"),
      job_context_id: current.context_id,
      base_revision_id: current.revision_id,
      base_revision_version: current.version,
      field,
      before_value: payload[field],
      desired_value: desiredValue,
      reason,
      origin,
      source_analysis_id: analysisId,
      status: "AWAITING_REVIEW",
      created_at: nowIso(),
      authority: "NON_AUTHORITATIVE_JOB_PROPOSAL",
    });
  }

  function persistChangeProposal(database, proposal) {
    const validated = validateChangeProposal(proposal);
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("job_change_proposals", "readwrite");
      transaction.objectStore("job_change_proposals").add(clone(validated));
      transaction.oncomplete = () => resolve(validated);
      transaction.onerror = () => reject(transaction.error || new JobContextError("job_change_proposal_persistence_failed"));
      transaction.onabort = () => reject(transaction.error || new JobContextError("job_change_proposal_persistence_failed"));
    });
  }

  function revisionFromChangeProposal(currentRevision, proposal, createdAt = nowIso(), reviewDecisionId = null) {
    const current = Truth.validateContextRevision(currentRevision);
    const change = validateChangeProposal(proposal);
    if (current.context_id !== change.job_context_id || current.revision_id !== change.base_revision_id || current.version !== change.base_revision_version) throw new JobContextError("ANALYSIS_STALE");
    const payload = clone(validateJobPayload(current.payload));
    payload[change.field] = change.desired_value;
    payload.field_provenance[change.field] = change.origin === "MODEL_PROPOSED" ? "HUMAN_CONFIRMED" : "HUMAN_EDITED";
    return Truth.validateContextRevision({
      ...clone(current),
      revision_id: `${current.context_id}-v${current.version + 1}-${safe(id("revision"))}`,
      version: current.version + 1,
      previous_revision_id: current.revision_id,
      confirmed_from_proposal_id: change.job_change_proposal_id,
      review_decision_id: reviewDecisionId || `pending-${change.job_change_proposal_id}`,
      created_at: createdAt,
      payload: validateJobPayload(payload),
    });
  }

  function changeDecision(proposal, decision, decidedAt = nowIso()) {
    const change = validateChangeProposal(proposal);
    if (!["CONFIRM", "REJECT"].includes(decision)) throw new JobContextError("job_change_decision_invalid");
    return Object.freeze({
      contract_id: Manifest.job_change_decision_version,
      job_change_decision_id: id("job-change-decision"),
      job_change_proposal_id: change.job_change_proposal_id,
      decision,
      decided_at: decidedAt,
      authority: "AUTHORITATIVE_USER_DECISION",
    });
  }

  function persistChangeDecision(database, proposal, decision, currentRevision = null) {
    const checked = validateChangeProposal(proposal), decided = changeDecision(checked, decision);
    const revision = decision === "CONFIRM"
      ? revisionFromChangeProposal(currentRevision, checked, decided.decided_at, decided.job_change_decision_id) : null;
    return new Promise((resolve, reject) => {
      const names = ["job_change_proposals", "job_change_decisions", ...(revision ? ["job_context_revisions", "job_context_lifecycle"] : [])];
      const transaction = database.transaction(names, "readwrite");
      let failure = null, pending = names.length;
      const records = {};
      const abort = error => { failure = error; transaction.abort(); };
      const ready = () => {
        if (--pending) return;
        try {
          if (!records.job_change_proposals || JSON.stringify(validateChangeProposal(records.job_change_proposals)) !== JSON.stringify(checked)) {
            throw new JobContextError("job_change_proposal_changed");
          }
          if (records.job_change_decisions.some(item => item.job_change_proposal_id === checked.job_change_proposal_id)) {
            throw new JobContextError("job_change_already_decided");
          }
          if (revision) {
            const head = latestRevision(records.job_context_revisions, currentRevision.context_id);
            if (!head || head.revision_id !== currentRevision.revision_id || head.version !== currentRevision.version) throw new JobContextError("ANALYSIS_STALE");
            if (!activeRevisions([head], records.job_context_lifecycle).length) throw new JobContextError("job_context_already_removed");
            transaction.objectStore("job_context_revisions").add(clone(revision));
          }
          transaction.objectStore("job_change_decisions").add(clone(decided));
        } catch (error) { abort(error); }
      };
      for (const name of names) {
        const store = transaction.objectStore(name);
        const request = name === "job_change_proposals" ? store.get(checked.job_change_proposal_id) : store.getAll();
        request.onsuccess = () => { records[name] = request.result; ready(); };
        request.onerror = () => abort(request.error || new JobContextError("job_change_read_failed"));
      }
      transaction.oncomplete = () => resolve(revision ? Object.freeze({ proposal, decision: decided, revision }) : decided);
      transaction.onerror = transaction.onabort = () => reject(failure || transaction.error || new JobContextError("job_change_persistence_failed"));
    });
  }

  function persistAcceptedChange(database, currentRevision, proposal) {
    return persistChangeDecision(database, proposal, "CONFIRM", currentRevision);
  }

  function persistRejectedChange(database, proposal) {
    return persistChangeDecision(database, proposal, "REJECT");
  }

  function archivedSourceUrl(sourceRecords, sourceIds) {
    if (!Array.isArray(sourceRecords) || !Array.isArray(sourceIds) || !sourceIds.length) return null;
    const expected = JSON.stringify(sourceIds);
    const matches = sourceRecords.filter((record) => record?.contract_id === "ariadne-source-archive-v1"
      && record.material_type === "JOB"
      && typeof record.source_url === "string"
      && record.source_url.trim()
      && JSON.stringify(record.source_document_ids) === expected);
    matches.sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")));
    return matches[0]?.source_url.trim() || null;
  }

  function recordForUi(revision, sourceRecords = []) {
    const current = Truth.validateContextRevision(revision);
    const payload = validateJobPayload(current.payload);
    return Object.freeze({
      job_context_id: current.context_id,
      revision_id: current.revision_id,
      revision_version: current.version,
      data_class: "CANONICAL_CONFIRMED",
      title: payload.title,
      company: payload.company || "公司待确认",
      location: payload.location || "地点待确认",
      summary: payload.summary || "摘要待确认",
      requirements: payload.requirements,
      source_document_ids: payload.source_document_ids,
      source_url: payload.source_url || archivedSourceUrl(sourceRecords, payload.source_document_ids),
      source_availability: payload.source_availability,
      review_status: "CONFIRMED",
      updated_at: current.created_at,
    });
  }

  return Object.freeze({
    PAYLOAD_CONTRACT, CHANGE_PROPOSAL_CONTRACT, CONTENT_ORIGINS, EDITABLE_FIELDS, JobContextError,
    validateRequirement, validateJobPayload, normalizedLines, deriveJobPayload, proposalFor, structuringRunFor,
    contextIdForProposal, latestRevision, latestRevisions, activeRevisions, persistRemoval, acceptedPayload, workingPayload, workingSubjectFor, reviewOutcome, getAll, persistReview,
    directEditProposal, persistDirectEdit,
    validateChangeProposal, createChangeProposal, persistChangeProposal, revisionFromChangeProposal,
    changeDecision, persistAcceptedChange, persistRejectedChange, archivedSourceUrl, recordForUi,
  });
}));
