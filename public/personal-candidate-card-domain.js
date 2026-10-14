"use strict";

(function attach(root, factory) {
  const dep = (name, file) => root[name] || (typeof module === "object" ? require(file) : null);
  const api = factory(dep("AriadneTruthPersistence", "./truth-persistence-domain.js"),
    dep("AriadneRawSourceStorage", "./raw-source-storage-domain.js"),
    dep("AriadnePersonalContext", "./personal-context-domain.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AriadnePersonalCandidateCards = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function create(Truth, RawSource, PersonalContext) {
  if (!Truth || !RawSource || !PersonalContext) throw new Error("personal_candidate_card_dependencies_required");

  const PAYLOAD_CONTRACT = "ariadne-personal-conversation-candidate-proposal-v1";
  const ACCEPTED_PAYLOAD_CONTRACT = "ariadne-personal-conversation-candidate-payload-v1";
  const OPERATION_TYPE = "PERSONAL_CONVERSATION_CANDIDATE_CHANGE";
  const ITEM_TYPES = Object.freeze(["WORK_EXPERIENCE", "PROJECT", "EDUCATION", "OTHER"]);
  const subtypeFor = Object.freeze({ WORK_EXPERIENCE: "work_experience", PROJECT: "project", EDUCATION: "education", OTHER: "custom_section" });
  const clone = (value) => structuredClone(value);
  const now = () => new Date().toISOString();
  const id = (prefix) => `${prefix}-${globalThis.crypto.randomUUID()}`;
  const required = (value, maximum, code) => {
    if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new Error(code);
    return value.trim();
  };
  const optional = (value, maximum, code) => value === null || value === undefined || value === "" ? null : required(value, maximum, code);

  async function sha256(value) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function validateRaw(raw, availableRefs, confirmedRefs, utterances) {
    if (!raw || !["CREATE", "UPDATE"].includes(raw.operation) || !ITEM_TYPES.includes(raw.item_type)) throw new Error("personal_candidate_card_proposal_invalid");
    const target = raw.target_candidate_ref;
    if ((raw.operation === "CREATE" && target !== null) || (raw.operation === "UPDATE" && !confirmedRefs.has(target))) throw new Error("personal_candidate_card_target_invalid");
    if (!Array.isArray(raw.related_refs) || raw.related_refs.length > 8 || raw.related_refs.some((ref) => !availableRefs.has(ref))) throw new Error("personal_candidate_card_evidence_invalid");
    if (raw.operation === "UPDATE" && !raw.related_refs.includes(target)) throw new Error("personal_candidate_card_target_grounding_required");
    if (!Array.isArray(raw.source_quotes) || !raw.source_quotes.length || raw.source_quotes.length > 8) throw new Error("personal_candidate_card_quote_invalid");
    const quotes = raw.source_quotes.map((quote) => required(quote, 1200, "personal_candidate_card_quote_invalid"));
    if (quotes.some((quote) => !utterances.some((utterance) => utterance.includes(quote)))) throw new Error("personal_candidate_card_quote_invalid");
    const facts = Array.isArray(raw.facts) ? raw.facts.map((fact) => ({
      label: required(fact?.label, 120, "personal_candidate_card_fact_invalid"),
      value: required(fact?.value, 1200, "personal_candidate_card_fact_invalid"),
    })) : (() => { throw new Error("personal_candidate_card_fact_invalid"); })();
    if (facts.length > 20) throw new Error("personal_candidate_card_fact_invalid");
    const uncertainties = Array.isArray(raw.uncertainties) ? raw.uncertainties.map((value) => required(value, 500, "personal_candidate_card_uncertainty_invalid")) : [];
    if (uncertainties.length > 8) throw new Error("personal_candidate_card_uncertainty_invalid");
    return Object.freeze({
      operation: raw.operation, target_candidate_ref: target, item_type: raw.item_type,
      category: optional(raw.category, 120, "personal_candidate_card_field_invalid"),
      title: required(raw.title, 300, "personal_candidate_card_field_invalid"),
      subtitle: optional(raw.subtitle, 600, "personal_candidate_card_field_invalid"),
      time: optional(raw.time, 300, "personal_candidate_card_field_invalid"),
      summary: optional(raw.summary, 4000, "personal_candidate_card_field_invalid"),
      ownership: optional(raw.ownership, 2000, "personal_candidate_card_field_invalid"),
      facts, uncertainties, reason: required(raw.reason, 800, "personal_candidate_card_reason_invalid"),
      source_quotes: quotes, related_refs: [...raw.related_refs],
    });
  }

  function itemFor(raw, sourceId, index) {
    return {
      item_id: `personal-card-${globalThis.crypto.randomUUID()}`,
      item_type: raw.item_type,
      item_subtype: subtypeFor[raw.item_type],
      category: raw.category,
      title: raw.title,
      subtitle: raw.subtitle,
      time: raw.time,
      summary: raw.summary,
      ownership: raw.ownership,
      facts: raw.facts.map((fact, factIndex) => ({ fact_id: `personal-card-fact-${index + 1}-${factIndex + 1}-${globalThis.crypto.randomUUID()}`, ...fact })),
      uncertainties: raw.uncertainties.map((question, uncertaintyIndex) => ({ uncertainty_id: `personal-card-uncertainty-${index + 1}-${uncertaintyIndex + 1}-${globalThis.crypto.randomUUID()}`, question, affects: null, status: "OPEN" })),
      grounding_refs: [{ source_document_id: sourceId, location: "个人对话原话", excerpt_or_reference: raw.source_quotes.join("\n") }],
      confidence: "low", warnings: ["model_inferred_non_authoritative"], review_status: "NEEDS_REVIEW",
      content_origin: "MODEL_PROPOSAL", dedupe_state: "unique",
    };
  }

  async function prepare(database, { raw_proposals: rawProposals, human_message: humanMessage, context, snapshot, runtime_snapshot: runtimeSnapshot, turn_id: turnId }) {
    if (!Array.isArray(rawProposals) || !rawProposals.length) return Object.freeze({ source_document: null, processing_run: null, runtime_snapshot: null, proposals: [] });
    if (rawProposals.length > 4) throw new Error("personal_candidate_card_proposal_invalid");
    const records = PersonalContext.records(snapshot);
    const selectedRefs = new Set([...(context.candidate.confirmed || []), ...(context.candidate.working || [])].map((entry) => entry.candidate_ref));
    const available = new Map(records.filter((entry) => selectedRefs.has(entry.ref) && entry.semantic.item_type !== "PERSONAL_MEMORY").map((entry) => [entry.ref, entry]));
    const confirmedRefs = new Set(records.filter((entry) => entry.layer === "confirmed" && selectedRefs.has(entry.ref) && entry.semantic.item_type !== "PERSONAL_MEMORY").map((entry) => entry.ref));
    const utterances = [humanMessage, ...(context.history || []).map((entry) => entry.human).filter(Boolean)];
    const checked = rawProposals.map((raw) => validateRaw(raw, new Set(available.keys()), confirmedRefs, utterances));
    const sourceBody = ["# Ariadne 个人对话资料卡依据", "", `当前请求：${humanMessage}`, "", "## 被引用的用户原话",
      ...[...new Set(checked.flatMap((entry) => entry.source_quotes))].map((quote) => `- ${quote}`)].join("\n");
    const hash = await sha256(sourceBody), sourceId = `source-candidate-conversation-${hash}`;
    const filename = `Ariadne-个人对话-${turnId.slice(-12)}.md`;
    const file = typeof File === "function" ? new File([sourceBody], filename, { type: "text/markdown", lastModified: Date.now() })
      : Object.assign(new Blob([sourceBody], { type: "text/markdown" }), { name: filename });
    const sourceDocument = Truth.validateSourceDocument({
      contract_id: "ariadne-source-document-v1", source_document_id: sourceId, source_type: "MARKDOWN", filename, label: null,
      mime_type: "text/markdown", content_hash: `sha256:${hash}`, created_at: now(), material_type: "CANDIDATE",
      local_reference: RawSource.localReferenceFor(sourceId), batch_id: null,
      provenance: { supplied_by: "USER", captured_via: "PERSONAL_UNDERSTANDING_CONVERSATION", raw_source_recoverability: "DURABLE_BROWSER_LOCAL", turn_id: turnId },
      authority: Truth.AUTHORITY.source,
    });
    const archived = await RawSource.persistDurableSource(database, sourceDocument, file);
    const runId = id("run-personal-candidate-change"), proposalIds = checked.map((_entry, index) => `${runId}-proposal-${index + 1}`);
    const processingRun = Truth.validateProcessingRun({
      contract_id: "ariadne-processing-run-v1", run_id: runId, operation_type: OPERATION_TYPE, source_document_id: sourceId, batch_id: null,
      runtime_snapshot_id: runtimeSnapshot.snapshot_id, started_at: now(), finished_at: now(), status: "SUCCEEDED", error_code: null,
      output_artifact_ids: [], proposal_ids: proposalIds, authority: Truth.AUTHORITY.execution,
    });
    const proposals = checked.map((entry, index) => {
      const target = entry.target_candidate_ref ? available.get(entry.target_candidate_ref) : null;
      const item = itemFor(entry, sourceId, index);
      if (target) item.item_id = target.identity.split(":").at(-1);
      const originalSources = target?.source_ids || [];
      const sourceIds = [...new Set([...originalSources, sourceId])];
      const refs = [item.grounding_refs[0], ...originalSources.map((idValue) => ({ source_document_id: idValue, location: "当前资料卡原有来源", excerpt_or_reference: target.semantic.title }))];
      item.grounding_refs = refs;
      return Truth.validateProposal({
        contract_id: "ariadne-context-proposal-v1", proposal_id: proposalIds[index], proposal_type: "CANDIDATE_CONTEXT",
        source_document_ids: sourceIds, processing_run_id: runId, runtime_snapshot_id: runtimeSnapshot.snapshot_id,
        status: "AWAITING_REVIEW", created_at: now(),
        payload: {
          contract_id: PAYLOAD_CONTRACT, operation: entry.operation, reason: entry.reason, source_quotes: entry.source_quotes,
          related_refs: entry.related_refs, target: target ? { candidate_ref: entry.target_candidate_ref, identity: target.identity,
            context_id: target.lineage.context_id, revision_id: target.lineage.revision_id, version: target.lineage.version, item_id: item.item_id } : null,
          items: [item], manual_review_required: true,
        },
        grounding_refs: refs, warnings: ["MODEL_OUTPUT_NON_AUTHORITATIVE", "HUMAN_SAVE_REQUIRED"], uncertainties: clone(item.uncertainties), authority: Truth.AUTHORITY.proposal,
      });
    });
    const validatedSnapshot = Truth.validateRuntimeSnapshotRecord(runtimeSnapshot);
    const existingSnapshot = (await readAll(database, "runtime_snapshots")).find((entry) => entry.snapshot_id === validatedSnapshot.snapshot_id);
    if (existingSnapshot && JSON.stringify(existingSnapshot) !== JSON.stringify(validatedSnapshot)) throw new Error("runtime_snapshot_identity_conflict");
    return Object.freeze({ source_document: sourceDocument, source_records: archived.source_records, processing_run: processingRun, runtime_snapshot: existingSnapshot ? null : validatedSnapshot, proposals });
  }

  function readAll(database, storeName) {
    return new Promise((resolve, reject) => {
      const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error("personal_candidate_card_read_failed"));
    });
  }

  function editedItem(proposal, values) {
    const original = proposal.payload.items[0];
    if (!ITEM_TYPES.includes(values.item_type)) throw new Error("personal_candidate_card_type_invalid");
    const facts = Array.isArray(values.facts) ? values.facts.map((fact, index) => ({
      fact_id: original.facts?.[index]?.fact_id || `personal-card-fact-${index + 1}-${globalThis.crypto.randomUUID()}`,
      label: required(fact.label, 120, "personal_candidate_card_fact_invalid"), value: required(fact.value, 1200, "personal_candidate_card_fact_invalid"),
    })) : [];
    return {
      ...clone(original), item_type: values.item_type, item_subtype: subtypeFor[values.item_type],
      category: optional(values.category, 120, "personal_candidate_card_field_invalid"),
      title: required(values.title, 300, "personal_candidate_card_field_invalid"),
      subtitle: optional(values.subtitle, 600, "personal_candidate_card_field_invalid"),
      time: optional(values.time, 300, "personal_candidate_card_field_invalid"),
      summary: optional(values.summary, 4000, "personal_candidate_card_field_invalid"),
      ownership: optional(values.ownership, 2000, "personal_candidate_card_field_invalid"), facts,
      content_origin: "USER_CONFIRMED", review_status: "CONFIRMED",
    };
  }

  async function decide(database, proposalId, decision, values = null) {
    const proposals = await readAll(database, "context_proposals");
    const proposal = Truth.validateProposal(proposals.find((entry) => entry.proposal_id === proposalId));
    if (proposal.status !== "AWAITING_REVIEW" || proposal.payload?.contract_id !== PAYLOAD_CONTRACT) throw new Error("personal_candidate_card_proposal_unavailable");
    const reviewedAt = now();
    if (decision === "REJECT") {
      const review = Truth.validateReviewDecision({ contract_id: "ariadne-context-review-decision-v1", review_id: id("review-personal-card"),
        proposal_id: proposal.proposal_id, decision: "REJECT", reviewed_at: reviewedAt, accepted_payload: null, authority: Truth.AUTHORITY.review });
      const outcome = Truth.applyReviewDecision({ proposal, review_decision: review });
      await Truth.persistReviewOutcome(database, outcome); return outcome;
    }
    if (decision !== "SAVE") throw new Error("personal_candidate_card_decision_invalid");
    const item = editedItem(proposal, values || proposal.payload.items[0]);
    const target = proposal.payload.target;
    let current = null, contextId, acceptedPayload;
    if (proposal.payload.operation === "UPDATE") {
      const revisions = await readAll(database, "candidate_context_revisions");
      current = revisions.filter((entry) => entry.context_id === target.context_id).sort((a, b) => b.version - a.version)[0] || null;
      if (!current || current.revision_id !== target.revision_id || current.version !== target.version) throw new Error("context_version_conflict");
      const index = (current.payload.items || []).findIndex((entry) => entry.item_id === target.item_id);
      if (index < 0) throw new Error("candidate_item_not_found");
      acceptedPayload = clone(current.payload); acceptedPayload.items[index] = item;
      acceptedPayload.user_edits = [...(acceptedPayload.user_edits || []), { support_relation: "USER_CONFIRMED", edited_at: reviewedAt, paths: [`/items/${index}`] }];
      contextId = current.context_id;
    } else {
      contextId = `candidate-context-${proposal.source_document_ids.at(-1).replace(/[^a-z0-9_-]+/gi, "-")}-${item.item_id.replace(/[^a-z0-9_-]+/gi, "-")}`;
      acceptedPayload = { contract_id: ACCEPTED_PAYLOAD_CONTRACT, candidate_material_type: "other", items: [item],
        manual_review_required: false, user_edits: [{ support_relation: "USER_CONFIRMED", edited_at: reviewedAt, paths: ["/items/0"] }] };
    }
    const review = Truth.validateReviewDecision({ contract_id: "ariadne-context-review-decision-v1", review_id: id("review-personal-card"),
      proposal_id: proposal.proposal_id, decision: "EDIT_AND_CONFIRM", reviewed_at: reviewedAt, accepted_payload: acceptedPayload, authority: Truth.AUTHORITY.review });
    const outcome = Truth.applyReviewDecision({ proposal, review_decision: review, current_revision: current,
      expected_version: current?.version || 0, context_id: contextId, revision_id: `${contextId}-v${(current?.version || 0) + 1}-${globalThis.crypto.randomUUID()}` });
    await Truth.persistReviewOutcome(database, outcome); return outcome;
  }

  function pending(records) {
    return (records || []).filter((proposal) => proposal.status === "AWAITING_REVIEW" && proposal.payload?.contract_id === PAYLOAD_CONTRACT);
  }

  return Object.freeze({ PAYLOAD_CONTRACT, ACCEPTED_PAYLOAD_CONTRACT, OPERATION_TYPE, ITEM_TYPES, validateRaw, prepare, editedItem, decide, pending });
}));
