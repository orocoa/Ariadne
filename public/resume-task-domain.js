"use strict";

(function attach(root, factory) {
  const contract = root.AriadneResumeTaskContract || (typeof module === "object" && module.exports ? require("../data/resume_task_contract_v1.json") : null);
  const api = factory(root, contract);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AriadneResumeTask = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createResumeTask(root, suppliedContract) {
  // The browser contract script is supplied by the same application as the
  // module; require it explicitly instead of maintaining a second constants set.
  const Contract = suppliedContract;
  const SOURCE_STORES = Object.freeze(["candidate_context_revisions", "candidate_context_lifecycle", "candidate_working_models", "candidate_workspace_acceptances", "career_entities", "career_evidence", "source_documents", "personal_memory_revisions", "job_context_revisions", "job_context_lifecycle"]);
  const HISTORY_STORES = Object.freeze(Contract?.history_stores || {});
  const HUMAN_ROLES = Object.freeze(["CURRENT_HUMAN", "TASK_HUMAN_UNCONFIRMED", "CONVERSATION_HUMAN_UNCONFIRMED"]);
  const guards = new WeakMap();
  const clone = value => structuredClone(value);
  function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  const dependency = (name, path) => root[name] || (typeof module === "object" && module.exports ? require(path) : null);
  function fail(code) { throw Object.assign(new Error(code), { code }); }
  function requireContract() { if (!Contract || Contract.contract_id !== "ariadne-resume-task-contract-v1") fail("RESUME_CONTRACT_UNAVAILABLE"); return Contract; }
  function exact(value, keys, code = "RESUME_CONTEXT_INVALID") {
    if (!value || Array.isArray(value) || typeof value !== "object" || Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")) fail(code);
    return value;
  }
  function text(value, maximum = 1024, code = "RESUME_CONTEXT_INVALID", empty = false) {
    if (typeof value !== "string" || value.length > maximum || (!empty && !value.trim()) || /[\u0000]/u.test(value)) fail(code);
    return value;
  }
  const integer = (value, minimum = 0, code = "RESUME_CONTEXT_INVALID") => { if (!Number.isSafeInteger(value) || value < minimum) fail(code); return value; };
  const hashValue = (value, code = "RESUME_CONTEXT_INVALID") => { if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) fail(code); return value; };
  function keyOrder(a, b) {
    const left = Array.from(a), right = Array.from(b);
    for (let index = 0; index < Math.min(left.length, right.length); index++) {
      const difference = left[index].codePointAt(0) - right[index].codePointAt(0);
      if (difference) return difference;
    }
    return left.length - right.length;
  }
  function canonicalJson(value) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
    if (typeof value === "number") { if (!Number.isFinite(value)) fail("RESUME_CONTEXT_INVALID"); return JSON.stringify(value); }
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) fail("RESUME_CONTEXT_INVALID");
    return `{${Object.keys(value).sort(keyOrder).map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  const same = (left, right) => canonicalJson(left) === canonicalJson(right);
  const bytes = value => new TextEncoder().encode(canonicalJson(value)).length;
  async function fingerprint(value) {
    const raw = new TextEncoder().encode(canonicalJson(value));
    const digest = await root.crypto.subtle.digest("SHA-256", raw);
    return `sha256:${[...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("")}`;
  }
  function scopeFor(request, domain, options = {}) {
    requireContract();
    if (!Contract.domains.includes(domain)) fail("RESUME_SCOPE_INVALID");
    let workspace = options.workspace || request?.resume_context?.scope?.workspace;
    if (!workspace) workspace = root.localStorage?.getItem("ariadne-content-workspace-v1") || `browser:${root.location?.origin || "isolated"}`;
    const conversation = request?.conversation?.conversation_id || (["PERSONAL", "JOB_OVERVIEW"].includes(domain) ? domain : null);
    return validateScope({ workspace, domain, conversation_id: conversation });
  }
  function validateScope(scope) {
    exact(scope, ["workspace", "domain", "conversation_id"], "RESUME_SCOPE_INVALID");
    text(scope.workspace, Contract.limits.id_characters, "RESUME_SCOPE_INVALID");
    text(scope.conversation_id, Contract.limits.id_characters, "RESUME_SCOPE_INVALID");
    if (!Contract.domains.includes(scope.domain)) fail("RESUME_SCOPE_INVALID");
    return clone(scope);
  }
  function conversationSourceId(identity, scope, code = "RESUME_CONTEXT_INVALID") {
    const prefix = `conversation-human:${HISTORY_STORES[scope.domain]}:`;
    if (typeof identity !== "string" || !identity.startsWith(prefix)) fail(code);
    return text(identity.slice(prefix.length), Contract.limits.id_characters, code);
  }
  function validateTemplate(template, scope) {
    if (template === null) return null;
    exact(template, ["name", "mime_type", "size", "content_hash", "archive"], "RESUME_TEMPLATE_INVALID");
    text(template.name, 240, "RESUME_TEMPLATE_INVALID");
    if (/[\\/\u0000-\u001f]/u.test(template.name) || [".", ".."].includes(template.name)) fail("RESUME_TEMPLATE_INVALID");
    const types = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain", md: "text/markdown", markdown: "text/markdown" };
    if (types[template.name.split(".").at(-1).toLowerCase()] !== template.mime_type) fail("RESUME_TEMPLATE_INVALID");
    integer(template.size, 1, "RESUME_TEMPLATE_INVALID");
    if (template.size > Contract.limits.template_bytes) fail("RESUME_TEMPLATE_INVALID");
    hashValue(template.content_hash, "RESUME_TEMPLATE_INVALID");
    exact(template.archive, ["workspace", "domain", "conversation_id", "request_id", "index"], "RESUME_TEMPLATE_INVALID");
    if (!same({ workspace: template.archive.workspace, domain: template.archive.domain, conversation_id: template.archive.conversation_id }, scope)) fail("RESUME_TEMPLATE_SCOPE_MISMATCH");
    text(template.archive.request_id, Contract.limits.id_characters, "RESUME_TEMPLATE_INVALID");
    integer(template.archive.index, 0, "RESUME_TEMPLATE_INVALID");
    if (template.archive.index > Contract.limits.template_index) fail("RESUME_TEMPLATE_INVALID");
    return clone(template);
  }
  function validateJob(job, scope) {
    if (job === null) return null;
    if (scope.domain !== "JOB") fail("RESUME_JOB_SCOPE_INVALID");
    exact(job, ["binding", "content"], "RESUME_JOB_CONTEXT_INVALID");
    exact(job.binding, ["context_id", "revision_id", "version"], "RESUME_JOB_CONTEXT_INVALID");
    text(job.binding.context_id); text(job.binding.revision_id); integer(job.binding.version, 1);
    if (!job.content || Array.isArray(job.content) || typeof job.content !== "object") fail("RESUME_JOB_CONTEXT_INVALID");
    canonicalJson(job.content);
    return clone(job);
  }
  function validateHead(head, scope = null) {
    exact(head, Contract.task_fields, "RESUME_TASK_INVALID");
    if (head.contract_id !== Contract.task_contract || head.authority !== Contract.authority.task) fail("RESUME_TASK_INVALID");
    text(head.task_id); validateScope(head.scope); integer(head.revision, 1); integer(head.current_version);
    if (head.current_version === 0 ? head.current_version_id !== null : typeof head.current_version_id !== "string") fail("RESUME_TASK_INVALID");
    if (head.current_version_id !== null) text(head.current_version_id);
    hashValue(head.candidate_fingerprint);
    if (!Contract.statuses.includes(head.latest_status) || head.latest_status === "READY" && head.current_version === 0 || !Array.isArray(head.task_human_history)) fail("RESUME_TASK_INVALID");
    text(head.latest_request, Contract.limits.human_characters);
    text(head.last_result_message, 6000, "RESUME_TASK_INVALID");
    for (const human of head.task_human_history) { exact(human, ["text", "candidate_fingerprint"], "RESUME_TASK_INVALID"); text(human.text, Contract.limits.human_characters); hashValue(human.candidate_fingerprint); }
    for (const field of ["created_at", "updated_at"]) if (typeof head[field] !== "string" || !Number.isFinite(Date.parse(head[field]))) fail("RESUME_TASK_INVALID");
    if (scope && !same(head.scope, scope)) fail("RESUME_TASK_SCOPE_MISMATCH");
    validateTemplate(head.template, head.scope);
    if (head.job_binding !== null) validateJob({ binding: head.job_binding, content: {} }, head.scope);
    return clone(head);
  }
  function delivery(value) {
    const Output = dependency("AriadneConversationOutput", "./conversation-output.js");
    if (!Output) fail("RESUME_DELIVERY_UNAVAILABLE");
    const checked = Output.validate(value);
    if (checked?.kind !== "RESUME") fail("RESUME_DOCUMENT_INVALID");
    return checked;
  }
  function refs(values, evidence, code = "RESUME_GROUNDING_INVALID") {
    if (!Array.isArray(values) || values.length > 8 || new Set(values).size !== values.length || values.some(value => !evidence.has(value))) fail(code);
    return values;
  }
  function validateGrounding(grounding, proposal, evidence = null) {
    if (!Array.isArray(grounding) || grounding.length !== proposal.resume.blocks.length) fail("RESUME_GROUNDING_INVALID");
    const allowed = evidence || new Map(grounding.flatMap(item => [...(item.text_source_refs || []), ...(item.right_source_refs || [])]).map(ref => [ref, null]));
    const byIndex = new Map();
    for (const item of grounding) {
      exact(item, ["block_index", "text_source_refs", "right_source_refs"], "RESUME_GROUNDING_INVALID");
      integer(item.block_index, 0, "RESUME_GROUNDING_INVALID");
      if (byIndex.has(item.block_index) || item.block_index >= proposal.resume.blocks.length) fail("RESUME_GROUNDING_INVALID");
      refs(item.text_source_refs, allowed); refs(item.right_source_refs, allowed);
      const block = proposal.resume.blocks[item.block_index];
      const structural = ["SECTION", "PAGE_BREAK"].includes(block.type);
      if ((!structural && block.text && !item.text_source_refs.length) || (block.right && !item.right_source_refs.length)
          || ((!block.text || block.type === "PAGE_BREAK") && item.text_source_refs.length) || (!block.right && item.right_source_refs.length)) fail("RESUME_GROUNDING_INVALID");
      byIndex.set(item.block_index, item);
    }
    return byIndex;
  }
  function validateReview(review, proposal, grounding, { contextFingerprint, documentHash, evidence = null, ready = false } = {}) {
    exact(review, ["contract_id", "context_fingerprint", "document_hash", "status", "message", "block_reviews", "checks", "issues"], "RESUME_REVIEW_INVALID");
    if (review.contract_id !== Contract.review_contract || review.context_fingerprint !== contextFingerprint || review.document_hash !== documentHash || !Contract.statuses.includes(review.status)) fail("RESUME_REVIEW_INVALID");
    text(review.message, 6000, "RESUME_REVIEW_INVALID");
    exact(review.checks, Contract.review_checks, "RESUME_REVIEW_INVALID");
    if (Object.values(review.checks).some(value => !["PASS", "BLOCK"].includes(value))) fail("RESUME_REVIEW_INVALID");
    if (!Array.isArray(review.block_reviews) || review.block_reviews.length !== proposal.resume.blocks.length || !Array.isArray(review.issues) || review.issues.length > 40) fail("RESUME_REVIEW_INVALID");
    const checked = validateGrounding(grounding, proposal, evidence);
    const seen = new Set();
    for (const item of review.block_reviews) {
      exact(item, ["block_index", "text", "right"], "RESUME_REVIEW_INVALID");
      if (!checked.has(item.block_index) || seen.has(item.block_index)) fail("RESUME_REVIEW_INVALID");
      seen.add(item.block_index);
      const block = proposal.resume.blocks[item.block_index];
      for (const field of ["text", "right"]) {
        const verdict = item[field];
        exact(verdict, ["status", "source_refs", "source_states", "reason"], "RESUME_REVIEW_INVALID");
        if (!["SUPPORTED", "CONTRADICTED", "UNKNOWN", "STRUCTURAL"].includes(verdict.status)) fail("RESUME_REVIEW_INVALID");
        text(verdict.reason, 2000, "RESUME_REVIEW_INVALID", verdict.status === "STRUCTURAL");
        if (!Array.isArray(verdict.source_refs) || !Array.isArray(verdict.source_states) || verdict.source_refs.length !== verdict.source_states.length) fail("RESUME_REVIEW_INVALID");
        if (verdict.status === "STRUCTURAL") {
          if (verdict.source_refs.length || verdict.source_states.length || (field === "right" ? block.right : !["SECTION", "PAGE_BREAK"].includes(block.type) && block.text)) fail("RESUME_REVIEW_INVALID");
        } else {
          if (verdict.status === "SUPPORTED" && !verdict.source_refs.length) fail("RESUME_REVIEW_INVALID");
          if (evidence) {
            refs(verdict.source_refs, evidence, "RESUME_REVIEW_INVALID");
            if (verdict.source_refs.some((ref, index) => evidence.get(ref).source_state !== verdict.source_states[index])) fail("RESUME_REVIEW_INVALID");
          } else if (verdict.source_states.some(state => !Contract.source_states.includes(state))) fail("RESUME_REVIEW_INVALID");
        }
        if (ready && (verdict.status !== "STRUCTURAL" && verdict.status !== "SUPPORTED"
          || !same(verdict.source_refs, checked.get(item.block_index)[`${field}_source_refs`]))) fail("RESUME_REVIEW_NOT_READY");
      }
    }
    const allowedKinds = ["UNSUPPORTED_FACT", "IDENTITY_CONFLICT", "UNRESOLVED_FACT", "REJECTED_CLAIM_RETURNED", "SCOPE_CHANGE", "OMISSION", "TEMPLATE_FACT_LEAK", "CHAT_MISMATCH", "PRODUCTION_NOTE", "FORMAT_UNSUPPORTED"];
    for (const issue of review.issues) {
      exact(issue, ["kind", "block_indexes", "source_refs", "explanation", "question"], "RESUME_REVIEW_INVALID");
      if (!allowedKinds.includes(issue.kind) || !Array.isArray(issue.block_indexes) || new Set(issue.block_indexes).size !== issue.block_indexes.length || issue.block_indexes.some(index => !checked.has(index))) fail("RESUME_REVIEW_INVALID");
      if (evidence) refs(issue.source_refs, evidence, "RESUME_REVIEW_INVALID");
      else if (!Array.isArray(issue.source_refs)) fail("RESUME_REVIEW_INVALID");
      text(issue.explanation, 2000, "RESUME_REVIEW_INVALID"); text(issue.question, 1000, "RESUME_REVIEW_INVALID", true);
    }
    if (review.status === "FORMAT_UNSUPPORTED" && (!review.issues.some(issue => issue.kind === "FORMAT_UNSUPPORTED") || review.issues.some(issue => issue.question.trim()))) fail("RESUME_REVIEW_INVALID");
    if (review.status === "NEEDS_FACTS" && (!review.issues.some(issue => issue.question.trim()) || review.issues.every(issue => issue.kind === "FORMAT_UNSUPPORTED"))) fail("RESUME_REVIEW_INVALID");
    if (ready && (review.status !== "READY" || review.issues.length || Object.values(review.checks).some(value => value !== "PASS"))) fail("RESUME_REVIEW_NOT_READY");
    return clone(review);
  }
  async function validateDocument(value, scope = null, { continuityView = false } = {}) {
    exact(value, Contract.document_fields, "RESUME_DOCUMENT_INVALID");
    if (value.contract_id !== Contract.document_contract || value.authority !== Contract.authority.document) fail("RESUME_DOCUMENT_INVALID");
    text(value.version_id); text(value.task_id); validateScope(value.scope);
    integer(value.version, 1); integer(value.expected_task_revision); hashValue(value.candidate_fingerprint); hashValue(value.context_fingerprint); hashValue(value.document_hash); hashValue(value.evidence_hash, "RESUME_DOCUMENT_INVALID");
    if (value.parent_version_id !== null) text(value.parent_version_id);
    if (scope && !same(value.scope, scope)) fail("RESUME_TASK_SCOPE_MISMATCH");
    if (typeof value.created_at !== "string" || !Number.isFinite(Date.parse(value.created_at))) fail("RESUME_DOCUMENT_INVALID");
    const proposal = delivery(value.deliverable);
    if (await fingerprint(proposal) !== value.document_hash) fail("RESUME_DOCUMENT_HASH_MISMATCH");
    validateTemplate(value.template, value.scope); validateJob(value.job_context, value.scope);
    if (proposal.resume.template_name !== (value.template?.name || "")) fail("RESUME_TEMPLATE_REFERENCE_INVALID");
    let evidence = null;
    if (value.evidence_snapshot === null) {
      if (!continuityView) fail("RESUME_DOCUMENT_EVIDENCE_MISSING");
    } else {
      exact(value.evidence_snapshot, ["evidence", "manifest"], "RESUME_DOCUMENT_INVALID");
      if (!Array.isArray(value.evidence_snapshot.evidence) || !Array.isArray(value.evidence_snapshot.manifest)
        || value.evidence_snapshot.evidence.length !== value.evidence_snapshot.manifest.length
        || value.evidence_snapshot.evidence.length > Contract.limits.evidence_records) fail("RESUME_DOCUMENT_INVALID");
      if (await fingerprint(value.evidence_snapshot) !== value.evidence_hash) fail("RESUME_DOCUMENT_EVIDENCE_HASH_MISMATCH");
      evidence = new Map(); const identities = new Set(); let currentHumans = 0;
      for (const [index, item] of value.evidence_snapshot.evidence.entries()) {
        exact(item, ["ref", "title", "role", "source_state", "content"], "RESUME_DOCUMENT_INVALID");
        const manifest = value.evidence_snapshot.manifest[index];
        exact(manifest, ["ref", "identity", "semantic_hash", "source_ids"], "RESUME_DOCUMENT_INVALID");
        if (item.ref !== `evidence-${index + 1}` || manifest.ref !== item.ref || !Contract.roles.includes(item.role) || !Contract.source_states.includes(item.source_state)) fail("RESUME_DOCUMENT_INVALID");
        text(item.title, Contract.limits.context_bytes, "RESUME_DOCUMENT_INVALID");
        if (!item.content || typeof item.content !== "object" || Array.isArray(item.content)) fail("RESUME_DOCUMENT_INVALID");
        text(manifest.identity, Contract.limits.id_characters, "RESUME_DOCUMENT_INVALID");
        if (identities.has(manifest.identity)) fail("RESUME_DOCUMENT_INVALID");
        identities.add(manifest.identity);
        if (!Array.isArray(manifest.source_ids) || new Set(manifest.source_ids).size !== manifest.source_ids.length) fail("RESUME_DOCUMENT_INVALID");
        manifest.source_ids.forEach(source => text(source, Contract.limits.id_characters, "RESUME_DOCUMENT_INVALID"));
        hashValue(manifest.semantic_hash, "RESUME_DOCUMENT_INVALID");
        if (HUMAN_ROLES.includes(item.role)) {
          const conversationHuman = item.role === "CONVERSATION_HUMAN_UNCONFIRMED";
          exact(item.content, conversationHuman ? ["text", "created_at"] : ["text"], "RESUME_DOCUMENT_INVALID"); text(item.content.text, Contract.limits.human_characters, "RESUME_DOCUMENT_INVALID");
          if (conversationHuman) {
            text(item.content.created_at, 64, "RESUME_DOCUMENT_INVALID");
            if (!Number.isFinite(Date.parse(item.content.created_at)) || manifest.source_ids.length) fail("RESUME_DOCUMENT_INVALID");
            conversationSourceId(manifest.identity, value.scope, "RESUME_DOCUMENT_INVALID");
          }
          if (item.source_state !== (item.role === "CURRENT_HUMAN" ? "CURRENT_TURN" : conversationHuman ? "CONVERSATION_HISTORY_UNCONFIRMED" : "TASK_HISTORY_UNCONFIRMED")) fail("RESUME_DOCUMENT_INVALID");
          if (await fingerprint(item.content) !== manifest.semantic_hash) fail("RESUME_DOCUMENT_EVIDENCE_HASH_MISMATCH");
          if (item.role === "CURRENT_HUMAN") currentHumans++;
        } else if (["CURRENT_TURN", "TASK_HISTORY_UNCONFIRMED", "CONVERSATION_HISTORY_UNCONFIRMED"].includes(item.source_state)) fail("RESUME_DOCUMENT_INVALID");
        evidence.set(item.ref, item);
      }
      if (currentHumans !== 1) fail("RESUME_DOCUMENT_INVALID");
      for (const item of evidence.values()) if (item.content.related_candidate_refs && (!Array.isArray(item.content.related_candidate_refs)
          || item.content.related_candidate_refs.some(ref => !evidence.has(ref)))) fail("RESUME_DOCUMENT_INVALID");
    }
    if (!Array.isArray(value.task_human_history)) fail("RESUME_DOCUMENT_INVALID");
    for (const human of value.task_human_history) { exact(human, ["text", "candidate_fingerprint"], "RESUME_DOCUMENT_INVALID"); text(human.text, Contract.limits.human_characters); hashValue(human.candidate_fingerprint); }
    if (evidence) for (const item of evidence.values()) if (["CURRENT_HUMAN", "TASK_HUMAN_UNCONFIRMED"].includes(item.role)
        && !value.task_human_history.some(human => human.text === item.content.text && human.candidate_fingerprint === value.candidate_fingerprint)) fail("RESUME_DOCUMENT_INVALID");
    validateReview(value.review, proposal, value.grounding, { contextFingerprint: value.context_fingerprint, documentHash: value.document_hash, evidence, ready: true });
    return clone(value);
  }
  function stripBlobs(value) {
    if (typeof root.Blob === "function" && value instanceof root.Blob || value?.$blob) return undefined;
    if (Array.isArray(value)) return value.map(stripBlobs);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stripBlobs(item)]).filter(([, item]) => item !== undefined));
    return value;
  }
  function historyRows(name, rows) {
    const domain = Object.keys(HISTORY_STORES).find(kind => HISTORY_STORES[kind] === name);
    if (!domain) return (rows || []).map(stripBlobs);
    const messages = ["CANDIDATE", "JOB"].includes(domain);
    return (rows || []).filter(row => messages ? row.role === "USER" : ["SENDING", "SUCCEEDED", "FAILED"].includes(row.status)
      && (domain !== "PERSONAL" || row.kind === "DISCUSSION")).map(row => ({
      record_id: messages ? row.message_id : row.turn_id, turn_id: row.turn_id || null,
      conversation_id: messages ? row.conversation_id : row.conversation_id ?? domain,
      text: messages ? domain === "JOB" ? row.content : row.text : row.human_message,
      created_at: row.created_at, origin: row.origin ? clone(row.origin) : null,
      contract_id: messages ? row.contract_id || null : null,
      authority: domain === "JOB" ? row.authority || null : null
    }));
  }
  function checkedHistory(row, scope) {
    if (row.conversation_id !== scope.conversation_id) return null;
    text(row.record_id, Contract.limits.id_characters, "RESUME_HISTORY_SOURCE_INVALID");
    if (row.turn_id !== null) text(row.turn_id, Contract.limits.id_characters, "RESUME_HISTORY_SOURCE_INVALID");
    text(row.text, Contract.limits.human_characters, "RESUME_HISTORY_SOURCE_INVALID");
    if (typeof row.created_at !== "string" || !Number.isFinite(Date.parse(row.created_at))) fail("RESUME_HISTORY_SOURCE_INVALID");
    if (scope.domain === "CANDIDATE" && row.contract_id !== "ariadne-candidate-conversation-v1-message-v1"
        || scope.domain === "JOB" && (row.contract_id !== "ariadne-job-conversation-message-v1" || row.authority !== "HUMAN_INPUT")) fail("RESUME_HISTORY_SOURCE_INVALID");
    return row;
  }
  function historyBlockers(collected, snapshot) {
    const Memory = dependency("AriadnePersonalMemory", "./personal-memory-domain.js"), Context = dependency("AriadnePersonalContext", "./personal-context-domain.js");
    if (!Memory || !Context) fail("RESUME_CONTEXT_DEPENDENCY_UNAVAILABLE");
    return (snapshot.personal_history_blockers || []).map(record => {
      const obsoleteAt = record.invalidated_at;
      if (typeof obsoleteAt !== "string" || !Number.isFinite(Date.parse(obsoleteAt))) fail("RESUME_HISTORY_SOURCE_INVALID");
      return { origin: clone(record.origin || {}), quote: typeof record.human_quote === "string" ? record.human_quote : null, obsolete_at: obsoleteAt };
    });
  }
  function blockedHistory(row, blockers) {
    return blockers.some(blocker => blocker.origin.turn_id && [row.record_id, row.turn_id].includes(blocker.origin.turn_id)
      || blocker.origin.message_id && [row.record_id, row.origin?.message_id].includes(blocker.origin.message_id)
      || blocker.quote && Date.parse(row.created_at) <= Date.parse(blocker.obsolete_at) && row.text.includes(blocker.quote));
  }
  function captureHistory(collected, snapshot, scope, request = null) {
    const store = HISTORY_STORES[scope.domain]; if (!store) fail("RESUME_HISTORY_SCOPE_INVALID");
    const rows = (collected[store] || []).filter(row => row.conversation_id === scope.conversation_id).map(row => checkedHistory(row, scope));
    const requestId = request?.turn?.execution_id || request?.request_id || null;
    const current = requestId ? rows.filter(row => row.record_id === requestId || row.turn_id === requestId) : [];
    if (current.length > 1 || current.length && current[0].text !== request.human_message) fail("RESUME_HISTORY_SOURCE_INVALID");
    const cutoff = current[0]?.created_at || new Date().toISOString(), blockers = historyBlockers(collected, snapshot);
    const records = rows.filter(row => row !== current[0] && Date.parse(row.created_at) <= Date.parse(cutoff) && !blockedHistory(row, blockers))
      .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at) || keyOrder(left.record_id, right.record_id));
    return { store, scope: clone(scope), current: current[0] || null, records, blockers };
  }
  function assertHistoryRows(rows, guard) {
    const scoped = (rows || []).filter(row => row.conversation_id === guard.scope.conversation_id);
    for (const expected of [...guard.records, ...(guard.current ? [guard.current] : [])]) {
      const matches = scoped.filter(row => row.record_id === expected.record_id);
      if (matches.length !== 1 || !same(matches[0], expected) || guard.records.includes(expected) && blockedHistory(matches[0], guard.blockers)) fail("RESUME_CONVERSATION_HISTORY_CHANGED");
    }
  }
  function sourceHistoryGuard(collected, context, original = null) {
    if (original?._history_guard) { assertHistoryRows(collected[original._history_guard.store], original._history_guard); return original._history_guard; }
    // An external snapshot may establish a guard only in an empty conversation;
    // it cannot attest to omitted durable Human records from an existing chat.
    const store = HISTORY_STORES[context.scope.domain];
    if ((collected[store] || []).some(row => row.conversation_id === context.scope.conversation_id)) fail("RESUME_HISTORY_SOURCE_GUARD_REQUIRED");
    return { store, scope: clone(context.scope), current: null, records: [], blockers: [] };
  }
  function readStores(database, names) {
    if (!database || typeof database.transaction !== "function") fail("RESUME_DATABASE_UNAVAILABLE");
    const existing = names.filter(name => database.objectStoreNames.contains(name));
    if (!existing.length) return Promise.resolve(Object.fromEntries(names.map(name => [name, []])));
    return new Promise((resolve, reject) => {
      const tx = database.transaction(existing, "readonly"), result = Object.fromEntries(names.map(name => [name, []]));
      for (const name of existing) {
        const read = tx.objectStore(name).getAll();
        read.onsuccess = () => { result[name] = historyRows(name, read.result || []); };
        read.onerror = () => reject(read.error || tx.error || Error("RESUME_SOURCE_READ_FAILED"));
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(tx.error || Error("RESUME_SOURCE_READ_FAILED"));
    });
  }
  async function restore(database, scope, { taskId = null, versionId = null } = {}) {
    requireContract(); validateScope(scope);
    if (!database.objectStoreNames.contains(Contract.stores.tasks.name) || !database.objectStoreNames.contains(Contract.stores.documents.name)) fail("RESUME_STORAGE_UPGRADE_REQUIRED");
    const stored = await readStores(database, [Contract.stores.tasks.name, Contract.stores.documents.name]);
    const all = stored[Contract.stores.tasks.name];
    const match = taskId ? all.filter(task => task.task_id === taskId) : all.filter(task => same(task.scope, scope));
    if (!match.length) {
      if (taskId || versionId) fail("RESUME_TASK_UNAVAILABLE");
      return { task: null, version: null };
    }
    if (match.length !== 1) fail("RESUME_TASK_AMBIGUOUS");
    const task = validateHead(match[0], scope), wanted = versionId || task.current_version_id;
    if (wanted === null) return { task, version: null };
    const versions = stored[Contract.stores.documents.name].filter(version => version.version_id === wanted);
    if (versions.length !== 1) fail("RESUME_DOCUMENT_UNAVAILABLE");
    const version = await validateDocument(versions[0], scope);
    if (version.task_id !== task.task_id || version.version > task.current_version || !versionId && version.version !== task.current_version) fail("RESUME_DOCUMENT_INVALID");
    return { task, version };
  }
  function evidenceFor(snapshot, Context) {
    const records = Context.records(snapshot), evidence = [], manifest = [];
    const aliases = new Map(records.map((record, index) => [record.ref, `evidence-${index + 1}`]));
    for (const record of records) {
      const content = clone(record.semantic);
      for (const field of ["candidate_ref", "authority", "source_availability"]) delete content[field];
      if (content.related_candidate_refs) content.related_candidate_refs = content.related_candidate_refs.map(ref => aliases.get(ref)).filter(Boolean);
      const role = content.item_type === "PERSONAL_MEMORY" ? `PERSONAL_${content.memory_kind}` : record.layer === "working" ? "CANDIDATE_WORKING" : "CANDIDATE_CONFIRMED";
      const ref = aliases.get(record.ref);
      evidence.push({ ref, title: String(record.semantic.title || "个人资料"), role, source_state: record.semantic.source_availability || record.source_availability || "LEGACY_PROVENANCE_UNKNOWN", content });
      manifest.push({ ref, identity: record.identity, semantic_hash: record.semantic_hash, source_ids: clone(record.source_ids || []) });
    }
    return { evidence, manifest };
  }
  async function buildContext({ database, request, domain, workspace = null, sourceSnapshot = null, template = undefined, templateReuseConfirmed = false, consentConfirmed = true, taskId = null, priorVersionId = null }) {
    requireContract();
    const scope = scopeFor(request, domain, { workspace }), runtime = request.runtime_snapshot;
    if (!runtime || runtime.mode !== "model" || consentConfirmed !== true) fail("RESUME_CONSENT_REQUIRED");
    text(runtime.provider); text(runtime.model);
    const currentHuman = text(request.human_message, Contract.limits.human_characters);
    const collected = database ? await readStores(database, [...SOURCE_STORES, HISTORY_STORES[domain]]) : null;
    const Candidate = dependency("AriadneJobCandidateContext", "./job-candidate-context-domain.js");
    const Context = dependency("AriadnePersonalContext", "./personal-context-domain.js");
    if (!Candidate || !Context) fail("RESUME_CONTEXT_DEPENDENCY_UNAVAILABLE");
    const snapshot = collected ? await Candidate.buildSnapshot(collected) : sourceSnapshot;
    if (!snapshot) fail("RESUME_SOURCE_UNAVAILABLE");
    hashValue(snapshot.aggregate_fingerprint);
    if (sourceSnapshot && collected && (sourceSnapshot.aggregate_fingerprint !== snapshot.aggregate_fingerprint
        || !same(evidenceFor(sourceSnapshot, Context), evidenceFor(snapshot, Context)))) fail("RESUME_CONTEXT_CHANGED");
    const prior = database ? await restore(database, scope, { taskId, versionId: priorVersionId }) : { task: null, version: null };
    const selectedTaskId = prior.task?.task_id || taskId || `resume-task-${root.crypto.randomUUID()}`;
    const { evidence, manifest: evidenceManifest } = evidenceFor(snapshot, Context);
    const history = collected ? captureHistory(collected, snapshot, scope, request) : null;
    if (collected) collected._history_guard = history;
    const usablePrior = prior.version ? { ...prior.version, evidence_snapshot: null } : null;
    const historicalHumans = prior.task?.task_human_history || [];
    for (let index = 0; index < historicalHumans.length; index++) {
      const human = historicalHumans[index];
      if (human.candidate_fingerprint !== snapshot.aggregate_fingerprint || human.text === currentHuman
        || history?.records.some(row => row.text === human.text)
        || history && (collected[history.store] || []).some(row => row.conversation_id === scope.conversation_id && row.text === human.text && blockedHistory(row, history.blockers))
        || history?.blockers.some(blocker => blocker.quote && human.text.includes(blocker.quote))) continue;
      const ref = `evidence-${evidence.length + 1}`, content = { text: human.text }, semanticHash = await fingerprint(content);
      evidence.push({ ref, title: "此简历任务中先前的用户原话", role: "TASK_HUMAN_UNCONFIRMED", source_state: "TASK_HISTORY_UNCONFIRMED", content });
      evidenceManifest.push({ ref, identity: `${selectedTaskId}:human:${semanticHash}`, semantic_hash: semanticHash, source_ids: [] });
    }
    if (evidence.length + (history?.records.length || 0) + 1 > Contract.limits.evidence_records) fail("RESUME_EVIDENCE_LIMIT");
    for (const row of history?.records || []) {
      const ref = `evidence-${evidence.length + 1}`, content = { text: row.text, created_at: row.created_at }, semanticHash = await fingerprint(content);
      evidence.push({ ref, title: "同一会话中先前的用户原话", role: "CONVERSATION_HUMAN_UNCONFIRMED", source_state: "CONVERSATION_HISTORY_UNCONFIRMED", content });
      evidenceManifest.push({ ref, identity: `conversation-human:${history.store}:${row.record_id}`, semantic_hash: semanticHash, source_ids: [] });
    }
    const humanRef = `evidence-${evidence.length + 1}`, humanContent = { text: currentHuman }, humanHash = await fingerprint(humanContent);
    evidence.push({ ref: humanRef, title: "本轮用户原话", role: "CURRENT_HUMAN", source_state: "CURRENT_TURN", content: humanContent });
    evidenceManifest.push({ ref: humanRef, identity: `${selectedTaskId}:human:${humanHash}`, semantic_hash: humanHash, source_ids: [] });
    let selectedTemplate = template === undefined ? templateReuseConfirmed ? prior.task?.template || null : null : template;
    selectedTemplate = validateTemplate(selectedTemplate, scope);
    if (selectedTemplate && selectedTemplate.archive.request_id !== (request.turn?.execution_id || request.request_id) && !templateReuseConfirmed) fail("RESUME_TEMPLATE_CONSENT_REQUIRED");
    let jobContext = null;
    if (domain === "JOB") {
      const contextId = request.observation?.job_context_id;
      if (contextId) {
        if (!collected) fail("RESUME_JOB_CONTEXT_UNAVAILABLE");
        const Job = dependency("AriadneJobContext", "./job-context-domain.js");
        if (!Job) fail("RESUME_CONTEXT_DEPENDENCY_UNAVAILABLE");
        const revisions = Job.activeRevisions(Job.latestRevisions(collected.job_context_revisions), collected.job_context_lifecycle);
        const revision = revisions.find(item => item.context_id === contextId);
        if (!revision || revision.revision_id !== request.observation.job_revision_id || revision.version !== request.observation.job_revision_version) fail("RESUME_JOB_CONTEXT_CHANGED");
        jobContext = { binding: { context_id: revision.context_id, revision_id: revision.revision_id, version: revision.version }, content: clone(revision.payload) };
      }
    }
    const context = { contract_id: Contract.context_contract, scope, task_id: selectedTaskId, expected_task_revision: prior.task?.revision || 0,
      candidate_fingerprint: snapshot.aggregate_fingerprint, current_human: currentHuman, evidence, evidence_manifest: evidenceManifest,
      prior_task: prior.task, prior_version: usablePrior, template: selectedTemplate, job_context: jobContext,
      consent: { confirmed: true, purpose: Contract.consent_purpose, provider: runtime.provider, model: runtime.model, template_reuse_confirmed: templateReuseConfirmed === true } };
    context.context_fingerprint = await fingerprint(context);
    const checked = await validateContext(context);
    if (collected) guards.set(checked, collected);
    return checked;
  }
  async function validateContext(context) {
    requireContract();
    exact(context, Contract.context_fields);
    if (context.contract_id !== Contract.context_contract) fail("RESUME_CONTEXT_INVALID");
    validateScope(context.scope); text(context.task_id); integer(context.expected_task_revision); hashValue(context.candidate_fingerprint);
    text(context.current_human, Contract.limits.human_characters);
    exact(context.consent, ["confirmed", "purpose", "provider", "model", "template_reuse_confirmed"]);
    if (context.consent.confirmed !== true || context.consent.purpose !== Contract.consent_purpose || typeof context.consent.template_reuse_confirmed !== "boolean") fail("RESUME_CONSENT_REQUIRED");
    text(context.consent.provider); text(context.consent.model);
    if (!Array.isArray(context.evidence) || !Array.isArray(context.evidence_manifest) || context.evidence.length !== context.evidence_manifest.length) fail("RESUME_CONTEXT_INVALID");
    if (context.evidence.length > Contract.limits.evidence_records || bytes(context) > Contract.limits.context_bytes) fail("RESUME_EVIDENCE_LIMIT");
    const references = new Set(), identities = new Set(); let currentHumans = 0;
    for (const [index, item] of context.evidence.entries()) {
      exact(item, ["ref", "title", "role", "source_state", "content"]);
      if (item.ref !== `evidence-${index + 1}` || references.has(item.ref) || !Contract.roles.includes(item.role) || !Contract.source_states.includes(item.source_state)) fail("RESUME_CONTEXT_INVALID");
      references.add(item.ref); text(item.title, Contract.limits.context_bytes);
      if (!item.content || typeof item.content !== "object" || Array.isArray(item.content)) fail("RESUME_CONTEXT_INVALID");
      canonicalJson(item.content);
      if (HUMAN_ROLES.includes(item.role)) {
        const conversationHuman = item.role === "CONVERSATION_HUMAN_UNCONFIRMED";
        exact(item.content, conversationHuman ? ["text", "created_at"] : ["text"]); text(item.content.text, Contract.limits.human_characters);
        if (conversationHuman) { text(item.content.created_at, 64); if (!Number.isFinite(Date.parse(item.content.created_at))) fail("RESUME_CONTEXT_INVALID"); }
        if (item.role === "CURRENT_HUMAN") { currentHumans++; if (item.content.text !== context.current_human || item.source_state !== "CURRENT_TURN") fail("RESUME_CONTEXT_INVALID"); }
        else if (item.source_state !== (conversationHuman ? "CONVERSATION_HISTORY_UNCONFIRMED" : "TASK_HISTORY_UNCONFIRMED")) fail("RESUME_CONTEXT_INVALID");
      } else if (["CURRENT_TURN", "TASK_HISTORY_UNCONFIRMED", "CONVERSATION_HISTORY_UNCONFIRMED"].includes(item.source_state)) fail("RESUME_CONTEXT_INVALID");
      const manifest = context.evidence_manifest[index];
      exact(manifest, ["ref", "identity", "semantic_hash", "source_ids"]);
      if (manifest.ref !== item.ref || identities.has(manifest.identity)) fail("RESUME_CONTEXT_INVALID");
      identities.add(manifest.identity); text(manifest.identity); hashValue(manifest.semantic_hash);
      if (!Array.isArray(manifest.source_ids) || new Set(manifest.source_ids).size !== manifest.source_ids.length) fail("RESUME_CONTEXT_INVALID");
      manifest.source_ids.forEach(value => text(value));
      if (HUMAN_ROLES.includes(item.role) && await fingerprint(item.content) !== manifest.semantic_hash) fail("RESUME_CONTEXT_HASH_MISMATCH");
      if (item.role === "CONVERSATION_HUMAN_UNCONFIRMED") { conversationSourceId(manifest.identity, context.scope); if (manifest.source_ids.length) fail("RESUME_CONTEXT_INVALID"); }
    }
    if (currentHumans !== 1) fail("RESUME_CONTEXT_INVALID");
    for (const item of context.evidence) if (item.content.related_candidate_refs && (!Array.isArray(item.content.related_candidate_refs) || item.content.related_candidate_refs.some(ref => !references.has(ref)))) fail("RESUME_CONTEXT_INVALID");
    validateTemplate(context.template, context.scope); validateJob(context.job_context, context.scope);
    if (context.prior_task === null) { if (context.expected_task_revision !== 0 || context.prior_version !== null) fail("RESUME_CONTEXT_INVALID"); }
    else {
      const prior = validateHead(context.prior_task, context.scope);
      if (prior.task_id !== context.task_id || prior.revision !== context.expected_task_revision) fail("RESUME_CONTEXT_INVALID");
      if (context.prior_version !== null) {
        const document = await validateDocument(context.prior_version, context.scope, { continuityView: true });
        if (document.task_id !== context.task_id || document.version > prior.current_version) fail("RESUME_CONTEXT_INVALID");
      }
    }
    for (const item of context.evidence) if (item.role === "TASK_HUMAN_UNCONFIRMED" && !context.prior_task?.task_human_history.some(human =>
        human.text === item.content.text && human.candidate_fingerprint === context.candidate_fingerprint)) fail("RESUME_CONTEXT_INVALID");
    hashValue(context.context_fingerprint);
    const unhashed = { ...context }; delete unhashed.context_fingerprint;
    if (await fingerprint(unhashed) !== context.context_fingerprint) fail("RESUME_CONTEXT_HASH_MISMATCH");
    const result = clone(context);
    if (guards.has(context)) guards.set(result, guards.get(context));
    return freeze(result);
  }
  async function withTemplate(context, template, { templateReuseConfirmed = context.consent?.template_reuse_confirmed } = {}) {
    const copy = clone(await validateContext(context));
    copy.template = validateTemplate(template, copy.scope);
    copy.consent.template_reuse_confirmed = templateReuseConfirmed === true;
    delete copy.context_fingerprint;
    copy.context_fingerprint = await fingerprint(copy);
    const result = await validateContext(copy);
    if (guards.has(context)) guards.set(result, guards.get(context));
    return result;
  }
  async function validateResult(raw, context) {
    requireContract();
    const input = await validateContext(context);
    exact(raw, Contract.result_fields, "RESUME_RESULT_INVALID");
    if (raw.contract_id !== Contract.result_contract || raw.task_id !== input.task_id || raw.expected_task_revision !== input.expected_task_revision
      || !same(raw.scope, input.scope) || raw.candidate_fingerprint !== input.candidate_fingerprint || raw.context_fingerprint !== input.context_fingerprint
      || !same(raw.template, input.template) || raw.provider !== input.consent.provider || raw.model !== input.consent.model || raw.persistence !== "not_written"
      || !Contract.statuses.includes(raw.status)) fail("RESUME_RESULT_INVALID");
    text(raw.message, 6000, "RESUME_RESULT_INVALID"); integer(raw.calls, 1, "RESUME_RESULT_INVALID");
    if (raw.calls > 2 || !raw.usage || typeof raw.usage !== "object" || Array.isArray(raw.usage)) fail("RESUME_RESULT_INVALID");
    canonicalJson(raw.usage);
    const evidence = new Map(input.evidence.map(item => [item.ref, item]));
    if (raw.proposal === null) {
      if (raw.deliverable !== null || raw.document_hash !== null || raw.review !== null || !Array.isArray(raw.grounding) || raw.grounding.length || !["NEEDS_FACTS", "FORMAT_UNSUPPORTED"].includes(raw.status)) fail("RESUME_RESULT_INVALID");
    } else {
      const proposal = delivery(raw.proposal), expectedHash = await fingerprint(proposal);
      if (proposal.resume.template_name !== (input.template?.name || "")) fail("RESUME_TEMPLATE_REFERENCE_INVALID");
      if (raw.document_hash !== expectedHash) fail("RESUME_DOCUMENT_HASH_MISMATCH");
      validateGrounding(raw.grounding, proposal, evidence);
      validateReview(raw.review, proposal, raw.grounding, { contextFingerprint: input.context_fingerprint, documentHash: expectedHash, evidence, ready: raw.status === "READY" });
      if (raw.review.status !== raw.status || (raw.status === "READY" ? !same(raw.deliverable, proposal) || raw.calls !== 2 : raw.deliverable !== null)) fail("RESUME_RESULT_INVALID");
    }
    const prepared = { contract_id: Contract.prepared_contract, status: raw.status, scope: clone(input.scope), task_id: input.task_id,
      expected_task_revision: input.expected_task_revision, candidate_fingerprint: input.candidate_fingerprint, context_fingerprint: input.context_fingerprint, task: null, document_version: null };
    const now = new Date().toISOString(), versionId = raw.status === "READY" ? `resume-version-${root.crypto.randomUUID()}` : null, prior = input.prior_task;
    const humans = clone(input.prior_task?.task_human_history || []);
    if (!humans.some(human => human.text === input.current_human && human.candidate_fingerprint === input.candidate_fingerprint)) humans.push({ text: input.current_human, candidate_fingerprint: input.candidate_fingerprint });
    const evidenceSnapshot = raw.status === "READY" ? { evidence: clone(input.evidence), manifest: clone(input.evidence_manifest) } : null;
    const evidenceHash = evidenceSnapshot ? await fingerprint(evidenceSnapshot) : null;
    if (raw.status === "READY") prepared.document_version = { contract_id: Contract.document_contract, version_id: versionId, task_id: input.task_id, scope: clone(input.scope), version: (prior?.current_version || 0) + 1,
      parent_version_id: input.prior_version?.version_id || prior?.current_version_id || null, expected_task_revision: input.expected_task_revision,
      candidate_fingerprint: input.candidate_fingerprint, context_fingerprint: input.context_fingerprint, document_hash: raw.document_hash,
      deliverable: clone(raw.deliverable), grounding: clone(raw.grounding), review: clone(raw.review), template: clone(raw.template), job_context: clone(input.job_context),
      evidence_snapshot: evidenceSnapshot, evidence_hash: evidenceHash, task_human_history: humans,
      created_at: now, authority: Contract.authority.document };
    prepared.task = { contract_id: Contract.task_contract, task_id: input.task_id, scope: clone(input.scope), revision: input.expected_task_revision + 1,
      candidate_fingerprint: input.candidate_fingerprint, current_version_id: versionId || prior?.current_version_id || null, current_version: prepared.document_version?.version || prior?.current_version || 0,
      template: clone(input.template), job_binding: clone(input.job_context?.binding || null), task_human_history: humans, latest_status: raw.status, latest_request: input.current_human, last_result_message: raw.message,
      created_at: prior?.created_at || now, updated_at: now, authority: Contract.authority.task };
    guards.set(prepared, { records: guards.get(context) || guards.get(input) || null, prior_task: input.prior_task, job_binding: input.job_context?.binding || null, context: input,
      writes: canonicalJson([prepared.task, prepared.document_version]) });
    return freeze(prepared);
  }
  function transactionStores(result = null) {
    requireContract();
    if (result && !result.task) return [];
    return [...SOURCE_STORES, ...(result?.scope ? [HISTORY_STORES[result.scope.domain]] : Object.values(HISTORY_STORES)), Contract.stores.tasks.name, Contract.stores.documents.name];
  }
  async function assertContextFresh(database, context) {
    const checked = await validateContext(context);
    if (root.location?.origin && scopeFor({ conversation: { conversation_id: checked.scope.conversation_id } }, checked.scope.domain).workspace !== checked.scope.workspace) fail("RESUME_SCOPE_CHANGED");
    const collected = await readStores(database, [...SOURCE_STORES, HISTORY_STORES[checked.scope.domain]]);
    const Candidate = dependency("AriadneJobCandidateContext", "./job-candidate-context-domain.js");
    const Context = dependency("AriadnePersonalContext", "./personal-context-domain.js");
    if (!Candidate || !Context) fail("RESUME_CONTEXT_DEPENDENCY_UNAVAILABLE");
    const snapshot = await Candidate.buildSnapshot(collected), actual = evidenceFor(snapshot, Context);
    const personal = checked.evidence.filter(item => !HUMAN_ROLES.includes(item.role));
    const personalRefs = new Set(personal.map(item => item.ref));
    if (snapshot.aggregate_fingerprint !== checked.candidate_fingerprint || !same(personal, actual.evidence)
        || !same(checked.evidence_manifest.filter(item => personalRefs.has(item.ref)), actual.manifest)) fail("RESUME_CONTEXT_CHANGED");
    const initial = guards.get(context) || guards.get(checked);
    if (initial && SOURCE_STORES.some(name => !same(initial[name] || [], collected[name] || []))) fail("RESUME_CONTEXT_CHANGED");
    collected._history_guard = sourceHistoryGuard(collected, checked, initial);
    if (checked.job_context) {
      const Job = dependency("AriadneJobContext", "./job-context-domain.js"), binding = checked.job_context.binding;
      if (!Job) fail("RESUME_CONTEXT_DEPENDENCY_UNAVAILABLE");
      const current = Job.activeRevisions(Job.latestRevisions(collected.job_context_revisions), collected.job_context_lifecycle).find(item => item.context_id === binding.context_id);
      if (!current || !same(binding, { context_id: current.context_id, revision_id: current.revision_id, version: current.version })
          || !same(checked.job_context.content, current.payload)) fail("RESUME_JOB_CONTEXT_CHANGED");
    }
    const prior = await restore(database, checked.scope, {
      taskId: checked.expected_task_revision ? checked.task_id : null,
      versionId: checked.prior_version?.version_id || null
    });
    if (checked.expected_task_revision ? !prior.task || !same(prior.task, checked.prior_task) : prior.task !== null) fail("RESUME_TASK_VERSION_CONFLICT");
    if (checked.prior_version && !same(checked.prior_version, { ...prior.version, evidence_snapshot: null })) fail("RESUME_DOCUMENT_VERSION_CONFLICT");
    // Browser IndexedDB is the source authority for Web requests. Preserve this
    // snapshot for the independent post-model and transaction-time checks.
    guards.set(context, collected); guards.set(checked, collected);
    return true;
  }
  async function assertFresh(database, result, sourceSnapshotBuilder = null) {
    if (!result?.task) return true;
    const collected = await readStores(database, [...SOURCE_STORES, HISTORY_STORES[result.scope.domain]]), Candidate = dependency("AriadneJobCandidateContext", "./job-candidate-context-domain.js");
    if (!Candidate) fail("RESUME_CONTEXT_DEPENDENCY_UNAVAILABLE");
    const snapshot = await Candidate.buildSnapshot(collected);
    if (snapshot.aggregate_fingerprint !== result.candidate_fingerprint) fail("RESUME_CONTEXT_CHANGED");
    if (sourceSnapshotBuilder && (await sourceSnapshotBuilder(database)).aggregate_fingerprint !== result.candidate_fingerprint) fail("RESUME_CONTEXT_CHANGED");
    const guard = guards.get(result);
    if (!guard) fail("RESUME_SOURCE_GUARD_REQUIRED");
    const Context = dependency("AriadnePersonalContext", "./personal-context-domain.js");
    const actual = evidenceFor(snapshot, Context), personal = guard.context.evidence.filter(item => !HUMAN_ROLES.includes(item.role));
    const personalRefs = new Set(personal.map(item => item.ref));
    if (!same(personal, actual.evidence) || !same(guard.context.evidence_manifest.filter(item => personalRefs.has(item.ref)), actual.manifest)) fail("RESUME_CONTEXT_CHANGED");
    if (guard.records && SOURCE_STORES.some(name => !same(guard.records[name] || [], collected[name] || []))) fail("RESUME_CONTEXT_CHANGED");
    collected._history_guard = sourceHistoryGuard(collected, guard.context, guard.records);
    if (guard.job_binding) {
      const Job = dependency("AriadneJobContext", "./job-context-domain.js");
      const current = Job.activeRevisions(Job.latestRevisions(collected.job_context_revisions), collected.job_context_lifecycle).find(item => item.context_id === guard.job_binding.context_id);
      if (!current || !same(guard.job_binding, { context_id: current.context_id, revision_id: current.revision_id, version: current.version })) fail("RESUME_JOB_CONTEXT_CHANGED");
    }
    const prior = await restore(database, result.scope, { taskId: result.expected_task_revision ? result.task_id : null });
    if (result.expected_task_revision ? !prior.task || !same(prior.task, guard.prior_task) : prior.task !== null) fail("RESUME_TASK_VERSION_CONFLICT");
    guard.records = collected;
    return true;
  }
  function commitInto(tx, result) {
    requireContract();
    if (!result?.task) return Promise.resolve(false);
    if (result.contract_id !== Contract.prepared_contract || !Contract.statuses.includes(result.status) || result.status === "READY" && !result.document_version) return Promise.reject(Error("RESUME_RESULT_INVALID"));
    const guard = guards.get(result);
    if (!guard?.records) return Promise.reject(Error("RESUME_SOURCE_GUARD_REQUIRED"));
    if (canonicalJson([result.task, result.document_version]) !== guard.writes) return Promise.reject(Error("RESUME_RESULT_INVALID"));
    // Schedule all reads synchronously. No WebCrypto or await inside an IDB
    // callback, so the domain-owned transaction remains active until writes.
    return new Promise((resolve, reject) => {
      const source = {}, reads = [], abort = code => { const error = Object.assign(new Error(code), { code }); reject(error); try { tx.abort(); } catch (_) { /* owner observes its abort */ } };
      const historyGuard = guard.records._history_guard;
      let remaining = SOURCE_STORES.length + 1 + (historyGuard ? 1 : 0) + (result.document_version ? 1 : 0), tasks = null, duplicate = null, settled = false;
      const finish = () => {
        if (--remaining || settled) return;
        settled = true;
        try {
          if (SOURCE_STORES.some(name => !same(source[name] || [], guard.records[name] || []))) return abort("RESUME_CONTEXT_CHANGED");
          if (historyGuard) assertHistoryRows(source[historyGuard.store], historyGuard);
          const current = tasks.find(task => task.task_id === result.task_id);
          const sameScopeTasks = tasks.filter(task => same(task.scope, result.scope));
          if (result.expected_task_revision === 0 ? current || sameScopeTasks.length : !current || current.revision !== result.expected_task_revision || !same(current, guard.prior_task)) return abort("RESUME_TASK_VERSION_CONFLICT");
          if (sameScopeTasks.some(task => task.task_id !== result.task_id)) return abort("RESUME_TASK_AMBIGUOUS");
          if (duplicate !== undefined && duplicate !== null) return abort("RESUME_DOCUMENT_VERSION_EXISTS");
          if (result.document_version) tx.objectStore(Contract.stores.documents.name).add(clone(result.document_version));
          tx.objectStore(Contract.stores.tasks.name)[result.expected_task_revision === 0 ? "add" : "put"](clone(result.task));
          resolve(true);
        } catch (error) { reject(error); try { tx.abort(); } catch (_) { /* owner observes its abort */ } }
      };
      try {
        for (const name of SOURCE_STORES) {
          const read = tx.objectStore(name).getAll(); reads.push(read);
          read.onsuccess = () => { source[name] = (read.result || []).map(stripBlobs); finish(); };
        }
        if (historyGuard) {
          const read = tx.objectStore(historyGuard.store).getAll(); reads.push(read);
          read.onsuccess = () => { source[historyGuard.store] = historyRows(historyGuard.store, read.result || []); finish(); };
        }
        const head = tx.objectStore(Contract.stores.tasks.name).getAll(); reads.push(head);
        head.onsuccess = () => { tasks = head.result || []; finish(); };
        if (result.document_version) {
          const version = tx.objectStore(Contract.stores.documents.name).get(result.document_version.version_id); reads.push(version);
          version.onsuccess = () => { duplicate = version.result; finish(); };
        }
        reads.forEach(read => { read.onerror = () => abort("RESUME_TASK_WRITE_FAILED"); });
      } catch (error) { reject(error); try { tx.abort(); } catch (_) { /* owner observes its abort */ } }
    });
  }
  function providerView(context) {
    return { current_human: context.current_human, evidence: clone(context.evidence),
      prior_document: context.prior_version ? clone(context.prior_version.deliverable) : null,
      clarification: context.prior_task?.last_result_message ? { authority: "NON_AUTHORITATIVE_CLARIFICATION_CONTEXT", text: context.prior_task.last_result_message } : null,
      template_name: context.template?.name || null, job_context: context.job_context ? clone(context.job_context.content) : null };
  }
  async function assertDocumentFresh(database, document) {
    requireContract();
    const checked = await validateDocument(document), historyStore = HISTORY_STORES[checked.scope.domain];
    const collected = await readStores(database, [...SOURCE_STORES, historyStore]);
    const Candidate = dependency("AriadneJobCandidateContext", "./job-candidate-context-domain.js");
    if (!Candidate) fail("RESUME_CONTEXT_DEPENDENCY_UNAVAILABLE");
    const snapshot = await Candidate.buildSnapshot(collected);
    if (snapshot.aggregate_fingerprint !== checked.candidate_fingerprint) fail("RESUME_CONTEXT_CHANGED");
    const blockers = historyBlockers(collected, snapshot);
    for (const item of checked.evidence_snapshot.evidence) if (item.role === "CONVERSATION_HUMAN_UNCONFIRMED") {
      const manifest = checked.evidence_snapshot.manifest.find(entry => entry.ref === item.ref), recordId = conversationSourceId(manifest.identity, checked.scope);
      const rows = (collected[historyStore] || []).filter(row => row.record_id === recordId && row.conversation_id === checked.scope.conversation_id);
      if (rows.length !== 1 || !same(item.content, { text: rows[0].text, created_at: rows[0].created_at }) || blockedHistory(rows[0], blockers)) fail("RESUME_CONVERSATION_HISTORY_CHANGED");
    }
    if (checked.job_context) {
      const Job = dependency("AriadneJobContext", "./job-context-domain.js");
      const binding = checked.job_context.binding;
      const current = Job.activeRevisions(Job.latestRevisions(collected.job_context_revisions), collected.job_context_lifecycle).find(item => item.context_id === binding.context_id);
      if (!current || !same(binding, { context_id: current.context_id, revision_id: current.revision_id, version: current.version })) fail("RESUME_JOB_CONTEXT_CHANGED");
    }
    return true;
  }
  return Object.freeze({ Contract, SOURCE_STORES, HISTORY_STORES, create: buildContext, buildContext, validateContext, validateResult, transactionStores, commitInto, assertFresh, assertContextFresh, scopeFor, restore,
    withTemplate, fingerprint, canonicalJson, bytes, same, providerView, validateHead, validateDocument, validateTemplate, assertDocumentFresh });
}));
