"use strict";

(function attachJobConversationPersistence(root, factory) {
  const manifest = root.AriadneJobIntelligenceContract
    || (typeof module === "object" && module.exports ? require("../data/job_intelligence_contract_v1.json") : null);
  const conversation = root.AriadneJobConversation
    || (typeof module === "object" && module.exports ? require("./job-conversation-domain.js") : null);
  const api = factory(manifest, conversation);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AriadneJobConversationPersistence = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createJobConversationPersistence(Manifest, Conversation) {
  if (!Manifest || !Conversation) throw new Error("job_conversation_persistence_dependencies_required");

  class JobPersistenceError extends Error {
    constructor(code) { super(code); this.name = "JobPersistenceError"; this.code = code; }
  }

  const clone = (value) => structuredClone(value);
  const id = (prefix) => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  const nowIso = () => new Date().toISOString();

  function getAll(database, storeName) {
    return new Promise((resolve, reject) => {
      const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new JobPersistenceError("job_persistence_read_failed"));
    });
  }

  function get(database, storeName, key) {
    return new Promise((resolve, reject) => {
      const request = database.transaction(storeName, "readonly").objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new JobPersistenceError("job_persistence_read_failed"));
    });
  }

  function write(database, storeName, value, method = "add") {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName)[method](clone(value));
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = () => reject(transaction.error || new JobPersistenceError("job_persistence_write_failed"));
      transaction.onabort = () => reject(transaction.error || new JobPersistenceError("job_persistence_write_failed"));
    });
  }

  async function ensureSession(database, session) {
    const validated = Conversation.validateSession(session);
    const existing = await get(database, "job_conversation_sessions", validated.conversation_id);
    if (existing) return Conversation.validateSession(existing);
    return write(database, "job_conversation_sessions", validated, "add");
  }

  function persistMessage(database, message) {
    return write(database, "job_conversation_messages", message, "add");
  }

  function persistExecution(database, execution) {
    return write(database, "job_turn_executions", execution, "put");
  }

  function transitionExecution(execution, state, errorCode = null, finishedAt = nowIso()) {
    if (!["SUCCEEDED", "HARD_FAILED", "ANALYSIS_STALE", "SOURCE_UNAVAILABLE"].includes(state)) throw new JobPersistenceError("job_execution_state_invalid");
    return Object.freeze({
      ...clone(execution),
      state,
      state_history: [...execution.state_history, { state, at: finishedAt }],
      error_code: errorCode,
      finished_at: finishedAt,
    });
  }

  function createAnalysis({ session, execution, job_revision: jobRevision, job_subject: jobSubject, candidate_snapshot: candidateSnapshot, candidate_delta: candidateDelta, source_excerpt_manifest: sourceManifest, runtime_snapshot: runtimeSnapshot, output, previous_analysis_id: previousAnalysisId = null }) {
    Conversation.assertHumanCopySafe(output);
    const subject = Conversation.normalizedJobSubject(jobSubject || jobRevision);
    return Object.freeze({
      contract_id: Manifest.job_analysis_version,
      analysis_id: id("job-analysis"),
      conversation_id: session.conversation_id,
      execution_id: execution.execution_id,
      previous_analysis_id: previousAnalysisId,
      job_observation: {
        context_id: subject.context_id,
        revision_id: subject.subject_id,
        version: subject.version,
        authority: subject.authority,
      },
      candidate_observation: {
        confirmed_manifest: clone(candidateSnapshot.confirmed_manifest),
        working_manifest: clone(candidateSnapshot.working_manifest),
        provider_view: clone(candidateSnapshot.provider_view),
        confirmed_fingerprint: candidateSnapshot.confirmed_fingerprint,
        working_fingerprint: candidateSnapshot.working_fingerprint,
        aggregate_fingerprint: candidateSnapshot.aggregate_fingerprint,
        working_inclusion_policy: candidateSnapshot.working_inclusion_policy,
      },
      candidate_delta: clone(candidateDelta),
      source_excerpt_manifest: { ...clone(sourceManifest), provider_view: [] },
      runtime: {
        runtime_snapshot_id: runtimeSnapshot.snapshot_id,
        provider: runtimeSnapshot.provider,
        model: runtimeSnapshot.model,
        protocol: runtimeSnapshot.protocol,
        adapter_version: runtimeSnapshot.adapter_version,
        prompt_version: runtimeSnapshot.prompt_version,
        schema_version: runtimeSnapshot.schema_version,
        compiler_version: "ariadne-job-context-compiler-v1",
        source_retrieval_policy_version: sourceManifest.policy_version,
      },
      output: clone(output),
      status: "SUCCEEDED",
      created_at: nowIso(),
      authority: "NON_AUTHORITATIVE_JOB_ANALYSIS",
    });
  }

  function persistAnalysis(database, analysis) {
    if (analysis?.contract_id !== Manifest.job_analysis_version || analysis?.authority !== "NON_AUTHORITATIVE_JOB_ANALYSIS") throw new JobPersistenceError("job_analysis_invalid");
    return write(database, "job_analyses", analysis, "add");
  }

  async function latestAnalysis(database, jobContextId) {
    const records = await getAll(database, "job_analyses");
    return records.filter((entry) => entry?.job_observation?.context_id === jobContextId && entry?.status === "SUCCEEDED")
      .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))[0] || null;
  }

  async function messages(database, conversationId) {
    return (await getAll(database, "job_conversation_messages")).filter((entry) => entry.conversation_id === conversationId)
      .sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)));
  }

  async function persistSuccessfulTurn(database, { execution, analysis, assistant_message: assistantMessage, change_proposal: changeProposal = null }) {
    const completed = transitionExecution(execution, "SUCCEEDED");
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(["job_turn_executions", "job_analyses", "job_conversation_messages", ...(changeProposal ? ["job_change_proposals"] : [])], "readwrite");
      if (changeProposal) transaction.objectStore("job_change_proposals").add(clone(changeProposal));
      transaction.objectStore("job_turn_executions").put(clone(completed));
      transaction.objectStore("job_analyses").add(clone(analysis));
      transaction.objectStore("job_conversation_messages").add({ ...clone(assistantMessage), candidate_fingerprint: analysis.candidate_observation.aggregate_fingerprint, runtime_snapshot_id: analysis.runtime.runtime_snapshot_id });
      transaction.oncomplete = () => resolve(Object.freeze({ execution: completed, analysis, assistant_message: assistantMessage }));
      transaction.onerror = () => reject(transaction.error || new JobPersistenceError("job_turn_persistence_failed"));
      transaction.onabort = () => reject(transaction.error || new JobPersistenceError("job_turn_persistence_failed"));
    });
  }

  return Object.freeze({
    JobPersistenceError, getAll, get, write, ensureSession, persistMessage, persistExecution,
    transitionExecution, createAnalysis, persistAnalysis, latestAnalysis, messages, persistSuccessfulTurn,
  });
}));
