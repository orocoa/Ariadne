"use strict";

(function attachCandidateConversationPersistence(root, factory) {
  const truth = root.AriadneTruthPersistence
    || (typeof module === "object" && module.exports ? require("./truth-persistence-domain.js") : null);
  const conversation = root.AriadneCandidateConversation
    || (typeof module === "object" && module.exports ? require("./candidate-conversation-domain.js") : null);
  const api = factory(truth, conversation);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AriadneCandidateConversationPersistence = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createCandidateConversationPersistence(Truth, Conversation) {
  if (!Truth || !Conversation) throw new Error("candidate_conversation_persistence_dependency_required");
  const Delivery = globalThis.AriadneConversationOutput || (typeof module === "object" ? require("./conversation-output.js") : null);


  const ResumeSupport = () => globalThis.AriadneResumeTaskSupport || (typeof module === "object" ? require("./resume-task-support.js") : null);
  const Resume = () => globalThis.AriadneResumeTask || (typeof module === "object" ? require("./resume-task-domain.js") : null);
  const SESSION_CONTRACT = Conversation.CONTRACT_ID;
  const MESSAGE_CONTRACT = `${Conversation.CONTRACT_ID}-message-v1`;
  const TURN_CONTRACT = `${Conversation.CONTRACT_ID}-turn-execution-v1`;
  const ACTION_RECORD_CONTRACT = `${Conversation.ACTION_CONTRACT_ID}-record-v1`;
  const STORE_NAMES = Object.freeze({
    sessions: "conversation_sessions",
    messages: "conversation_messages",
    turns: "conversation_turn_executions",
    actions: "candidate_actions",
    working: "candidate_working_models",
  });
  const MESSAGE_ROLES = Object.freeze(["USER", "ASSISTANT"]);
  const ACTIVE_STATES = Object.freeze(Conversation.STATES.filter((state) => !Conversation.TERMINAL_STATES.includes(state)));
  const ACTION_RESULTS = Object.freeze(["APPLIED", "NO_CHANGE", "NEEDS_CLARIFICATION", "DRAFT_APPLIED"]);
  const FORBIDDEN_KEY = /(?:api[_-]?key|authorization|credential|access[_-]?token|refresh[_-]?token|reasoning|raw[_-]?(?:response|http|pdf)|pdf[_-]?bytes|rendered[_-]?page|image[_-]?data)/i;
  const FORBIDDEN_VALUE = /(?:\bBearer\s+\S+|\b(?:sk|rk|pk|sess)-[A-Za-z0-9_-]{8,}|^data:(?:application|image)\/|%PDF)/i;

  class CandidateConversationPersistenceError extends Error {
    constructor(code) { super(code); this.name = "CandidateConversationPersistenceError"; this.code = code; }
  }

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); }
    catch (_error) { throw new CandidateConversationPersistenceError("RECORD_NOT_JSON_SERIALIZABLE"); }
  }

  function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function exact(value, keys, code) {
    if (!isPlainObject(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
      throw new CandidateConversationPersistenceError(code);
    }
    return value;
  }

  function requiredString(value, code, maximum = 8000) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) throw new CandidateConversationPersistenceError(code);
    return value.trim();
  }

  function nullableString(value, code, maximum = 8000) {
    return value === null ? null : requiredString(value, code, maximum);
  }

  function iso(value, code) {
    if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
      throw new CandidateConversationPersistenceError(code);
    }
    return value;
  }

  function assertPrivateMaterialAbsent(value) {
    if (Array.isArray(value)) return value.forEach(assertPrivateMaterialAbsent);
    if (isPlainObject(value)) {
      Object.entries(value).forEach(([key, nested]) => {
        if (FORBIDDEN_KEY.test(key)) throw new CandidateConversationPersistenceError("PRIVATE_MATERIAL_FORBIDDEN");
        assertPrivateMaterialAbsent(nested);
      });
      return;
    }
    if (typeof value === "string" && FORBIDDEN_VALUE.test(value)) throw new CandidateConversationPersistenceError("PRIVATE_MATERIAL_FORBIDDEN");
  }

  function assertSafeDiagnosticValues(value) {
    if (Array.isArray(value)) return value.forEach(assertSafeDiagnosticValues);
    if (isPlainObject(value)) return Object.values(value).forEach(assertSafeDiagnosticValues);
    if (typeof value === "string" && FORBIDDEN_VALUE.test(value)) throw new CandidateConversationPersistenceError("PRIVATE_MATERIAL_FORBIDDEN");
  }

  function createSession({ candidate_context_id: candidateContextId, source_document_id: sourceDocumentId, created_at: createdAt = new Date() }) {
    const core = Conversation.createSession(candidateContextId, createdAt);
    return validateSession({
      ...core,
      source_document_id: requiredString(sourceDocumentId, "SESSION_SOURCE_INVALID", 256),
      updated_at: core.created_at,
    });
  }

  function validateSession(value) {
    const session = exact(value, ["contract_id", "conversation_id", "subject_type", "subject_id", "source_document_id", "created_at", "updated_at"], "SESSION_SHAPE_INVALID");
    try {
      Conversation.validateSession(Object.fromEntries(["contract_id", "conversation_id", "subject_type", "subject_id", "created_at"].map((key) => [key, session[key]])));
    } catch (_error) { throw new CandidateConversationPersistenceError("SESSION_IDENTITY_INVALID"); }
    requiredString(session.source_document_id, "SESSION_SOURCE_INVALID", 256);
    iso(session.created_at, "SESSION_TIMESTAMP_INVALID");
    iso(session.updated_at, "SESSION_TIMESTAMP_INVALID");
    if (Date.parse(session.updated_at) < Date.parse(session.created_at)) throw new CandidateConversationPersistenceError("SESSION_TIMESTAMP_INVALID");
    assertPrivateMaterialAbsent(session);
    return Object.freeze(clone(session));
  }

  function createUserMessage({ message_id: messageId, conversation_id: conversationId, turn_id: turnId, text, created_at: createdAt = new Date() }) {
    return validateMessage({
      contract_id: MESSAGE_CONTRACT,
      message_id: messageId,
      conversation_id: conversationId,
      turn_id: turnId,
      role: "USER",
      text,
      created_at: createdAt instanceof Date ? createdAt.toISOString() : String(createdAt),
      provider: null,
      model: null,
      runtime_snapshot_id: null,
      candidate_action_id: null,
    });
  }

  function createAssistantMessage({ message_id: messageId, conversation_id: conversationId, turn_id: turnId, text, provider, model, runtime_snapshot_id: runtimeSnapshotId, candidate_action_id: candidateActionId, personal_context_token = null, deliverable = null, web_search = null, resume_task = null, created_at: createdAt = new Date() }) {
    return validateMessage({
      contract_id: MESSAGE_CONTRACT,
      message_id: messageId,
      conversation_id: conversationId,
      turn_id: turnId,
      role: "ASSISTANT",
      text,
      created_at: createdAt instanceof Date ? createdAt.toISOString() : String(createdAt),
      provider,
      model,
      runtime_snapshot_id: runtimeSnapshotId,
      candidate_action_id: candidateActionId,
      ...(personal_context_token ? { personal_context_token } : {}),
      ...(resume_task ? { resume_task: ResumeSupport().validateMetadata(resume_task) } : {}),
      ...(deliverable ? { deliverable: Delivery.validate(deliverable) } : {}),
      ...(web_search ? { web_search: Delivery.searchFromResult({web_search}) } : {}),
    });
  }

  function validateMessage(value) {
    const message = exact(value, ["contract_id", "message_id", "conversation_id", "turn_id", "role", "text", "created_at", "provider", "model", "runtime_snapshot_id", "candidate_action_id", ...(Object.hasOwn(value || {}, "personal_context_token") ? ["personal_context_token"] : []), ...(Object.hasOwn(value || {}, "resume_task") ? ["resume_task"] : []), ...(Object.hasOwn(value || {}, "web_search") ? ["web_search"] : []), ...(Object.hasOwn(value || {}, "deliverable") ? ["deliverable"] : [])], "MESSAGE_SHAPE_INVALID");
    if (Object.hasOwn(message, "personal_context_token") && (message.role !== "ASSISTANT" || typeof message.personal_context_token !== "string" || !/^[a-f0-9]{64}$/.test(message.personal_context_token))) throw new CandidateConversationPersistenceError("MESSAGE_PERSONAL_CONTEXT_INVALID");
    if (Object.hasOwn(message, "resume_task")) {
      if (message.role !== "ASSISTANT" || message.deliverable?.kind !== "RESUME") throw new CandidateConversationPersistenceError("USER_MESSAGE_METADATA_FORBIDDEN");
      ResumeSupport().validateMetadata(message.resume_task);
    }
    if (Object.hasOwn(message, "web_search")) {
      if (message.role !== "ASSISTANT") throw new CandidateConversationPersistenceError("USER_MESSAGE_METADATA_FORBIDDEN");
      Delivery.searchFromResult(message);
    }
    if (Object.hasOwn(message, "deliverable")) {
      if (message.role !== "ASSISTANT") throw new CandidateConversationPersistenceError("USER_MESSAGE_METADATA_FORBIDDEN");
      Delivery.validate(message.deliverable);
    }
    if (message.contract_id !== MESSAGE_CONTRACT || !MESSAGE_ROLES.includes(message.role)) throw new CandidateConversationPersistenceError("MESSAGE_CONTRACT_INVALID");
    ["message_id", "conversation_id", "turn_id"].forEach((key) => requiredString(message[key], "MESSAGE_IDENTITY_INVALID", 256));
    requiredString(message.text, "MESSAGE_TEXT_INVALID", 8000);
    iso(message.created_at, "MESSAGE_TIMESTAMP_INVALID");
    const assistantFields = ["provider", "model", "runtime_snapshot_id", "candidate_action_id"];
    if (message.role === "USER" && assistantFields.some((key) => message[key] !== null)) throw new CandidateConversationPersistenceError("USER_MESSAGE_METADATA_FORBIDDEN");
    if (message.role === "ASSISTANT") assistantFields.forEach((key) => requiredString(message[key], "ASSISTANT_MESSAGE_LINKAGE_INVALID", 256));
    assertPrivateMaterialAbsent(message);
    return Object.freeze(clone(message));
  }

  function turnRecord(execution, { user_message_id: userMessageId, action_id: actionId = null, usage = {} } = {}) {
    return validateTurn({
      ...clone(execution),
      user_message_id: userMessageId,
      action_id: actionId,
      usage: clone(usage),
    });
  }

  function validateTurn(value) {
    // B1 diagnostics are additive.  Historical turns remain durable records and
    // must reopen without being rewritten just because this optional telemetry did
    // not exist when they were created.
    const legacyKeys = ["contract_id", "execution_id", "conversation_id", "operation", "generation", "observation", "runtime_snapshot_id", "state", "state_history", "failure_code", "result_action", "created_at", "updated_at", "cancelled_at", "user_message_id", "action_id", "usage"];
    const currentKeys = [...legacyKeys.slice(0, 10), "failure_diagnostics", ...legacyKeys.slice(10)];
    const candidate = isPlainObject(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(legacyKeys.slice().sort())
      ? { ...value, failure_diagnostics: null }
      : value;
    const turn = exact(candidate, currentKeys, "TURN_SHAPE_INVALID");
    if (turn.contract_id !== TURN_CONTRACT || turn.operation !== Conversation.OPERATION || !Conversation.STATES.includes(turn.state)) throw new CandidateConversationPersistenceError("TURN_CONTRACT_INVALID");
    ["execution_id", "conversation_id", "generation", "runtime_snapshot_id", "user_message_id"].forEach((key) => requiredString(turn[key], "TURN_IDENTITY_INVALID", 256));
    if (!isPlainObject(turn.observation) || !isPlainObject(turn.usage)) throw new CandidateConversationPersistenceError("TURN_METADATA_INVALID");
    if (!Array.isArray(turn.state_history) || !turn.state_history.length || turn.state_history.at(-1)?.state !== turn.state
      || turn.state_history.some((entry) => !isPlainObject(entry) || !Conversation.STATES.includes(entry.state) || Number.isNaN(Date.parse(entry.at)))) {
      throw new CandidateConversationPersistenceError("TURN_HISTORY_INVALID");
    }
    const allowed = { CREATED: ["SENDING", "CANCELLED", "FAILED"], SENDING: ["RECEIVED", "CANCELLED", "FAILED"], RECEIVED: ["VALIDATING", "CANCELLED", "FAILED"], VALIDATING: Conversation.TERMINAL_STATES };
    if (turn.state_history[0].state !== "CREATED" || turn.state_history.some((entry, index) => index > 0 && (!allowed[turn.state_history[index - 1].state]?.includes(entry.state) || Date.parse(entry.at) < Date.parse(turn.state_history[index - 1].at)))) {
      throw new CandidateConversationPersistenceError("TURN_HISTORY_INVALID");
    }
    iso(turn.created_at, "TURN_TIMESTAMP_INVALID");
    iso(turn.updated_at, "TURN_TIMESTAMP_INVALID");
    if (turn.cancelled_at !== null) iso(turn.cancelled_at, "TURN_TIMESTAMP_INVALID");
    if (turn.state === "FAILED") requiredString(turn.failure_code, "TURN_FAILURE_INVALID", 256);
    else if (turn.failure_code !== null) throw new CandidateConversationPersistenceError("TURN_FAILURE_INVALID");
    if (turn.failure_diagnostics !== null && !isPlainObject(turn.failure_diagnostics)) throw new CandidateConversationPersistenceError("TURN_FAILURE_DIAGNOSTICS_INVALID");
    if (turn.failure_diagnostics !== null) {
      const allowed = new Set(["stage", "error_code", "provider_called", "provider_response_received", "json_parse_passed", "semantic_schema_passed", "resolution_passed", "canonical_schema_passed", "semantic_guard_passed", "persistence_reached", "runtime_signature_compatible", "frontend_contract_version", "backend_contract_version", "provider_http_status", "exact_returned_model_match", "finish_reason", "content_type", "content_length", "prompt_tokens", "completion_tokens", "total_tokens", "reasoning_content_present", "reasoning_content_length", "refusal_present", "tool_calls_present", "message_key_names", "empty_response_classification"]);
      if (Object.keys(turn.failure_diagnostics).some((key) => !allowed.has(key))) throw new CandidateConversationPersistenceError("TURN_FAILURE_DIAGNOSTICS_INVALID");
      if (turn.failure_diagnostics.message_key_names !== undefined
        && (!Array.isArray(turn.failure_diagnostics.message_key_names)
          || turn.failure_diagnostics.message_key_names.some((key) => typeof key !== "string" || !/^[a-z_]{1,128}$/u.test(key)))) {
        throw new CandidateConversationPersistenceError("TURN_FAILURE_DIAGNOSTICS_INVALID");
      }
      // Diagnostic keys are already exact-allowlisted above.  Their values may
      // include structural names such as `reasoning_content`, so only scan
      // values for actual secret/raw-material signatures.
      assertSafeDiagnosticValues(turn.failure_diagnostics);
    }
    nullableString(turn.result_action, "TURN_RESULT_INVALID", 64);
    nullableString(turn.action_id, "TURN_ACTION_LINKAGE_INVALID", 256);
    if ((turn.action_id === null) !== (turn.result_action === null) || (turn.result_action !== null && !Conversation.ACTIONS.includes(turn.result_action))) {
      throw new CandidateConversationPersistenceError("TURN_ACTION_LINKAGE_INVALID");
    }
    if (Conversation.TERMINAL_STATES.includes(turn.state) && ["APPLIED", "NO_CHANGE", "NEEDS_CLARIFICATION"].includes(turn.state) && !turn.action_id) {
      throw new CandidateConversationPersistenceError("TURN_ACTION_LINKAGE_INVALID");
    }
    const { failure_diagnostics: failureDiagnostics, ...turnWithoutDiagnostics } = turn;
    void failureDiagnostics;
    assertPrivateMaterialAbsent(turnWithoutDiagnostics);
    return Object.freeze(clone(turn));
  }

  async function modelResponseHash(normalizedAction) {
    const bytes = new TextEncoder().encode(canonicalJson(normalizedAction));
    if (!globalThis.crypto?.subtle) throw new CandidateConversationPersistenceError("CRYPTO_UNAVAILABLE");
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }

  function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (isPlainObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
    return JSON.stringify(value);
  }

  async function createActionRecord({ action_id: actionId, conversation_id: conversationId, turn_id: turnId, originating_user_message_id: userMessageId, observation, normalized_action: normalizedAction, application, working_model: workingModel, human_message: humanMessage, draft = null, compiled_context: compiledContext = null, created_at: createdAt = new Date() }) {
    const validatedAction = Conversation.validateAction(normalizedAction, { observation, working_model: workingModel, human_message: humanMessage, draft, compiled_context: compiledContext });
    const mutation = application?.mutation || "NONE";
    const status = mutation === "NEW_WORKING_STATE" ? "APPLIED" : mutation === "ITEM_DRAFT_ONLY" ? "DRAFT_APPLIED"
      : validatedAction.action === "ASK_CLARIFICATION" ? "NEEDS_CLARIFICATION" : "NO_CHANGE";
    const resultingWorkingModelId = mutation === "NEW_WORKING_STATE" ? application.working_model?.working_model_id || null : null;
    const timestamp = createdAt instanceof Date ? createdAt.toISOString() : String(createdAt);
    return validateActionRecord({
      contract_id: ACTION_RECORD_CONTRACT,
      action_id: actionId,
      conversation_id: conversationId,
      turn_id: turnId,
      originating_user_message_id: userMessageId,
      observed_working_model: Conversation.observedWorkingModel(observation),
      focus_snapshot: clone(observation.focus),
      normalized_action: clone(validatedAction),
      validation_result: { status: "VALID", validator_contract_id: Conversation.ACTION_CONTRACT_ID },
      application_result: { status, mutation },
      resulting_working_model_id: resultingWorkingModelId,
      model_response_hash: await modelResponseHash(validatedAction),
      created_at: timestamp,
      updated_at: timestamp,
    });
  }

  function validateActionRecord(value) {
    const record = exact(value, ["contract_id", "action_id", "conversation_id", "turn_id", "originating_user_message_id", "observed_working_model", "focus_snapshot", "normalized_action", "validation_result", "application_result", "resulting_working_model_id", "model_response_hash", "created_at", "updated_at"], "ACTION_RECORD_SHAPE_INVALID");
    if (record.contract_id !== ACTION_RECORD_CONTRACT || record.normalized_action?.contract_id !== Conversation.ACTION_CONTRACT_ID) throw new CandidateConversationPersistenceError("ACTION_RECORD_CONTRACT_INVALID");
    ["action_id", "conversation_id", "turn_id", "originating_user_message_id"].forEach((key) => requiredString(record[key], "ACTION_RECORD_IDENTITY_INVALID", 256));
    exact(record.observed_working_model, ["candidate_context_id", "working_model_id", "version", "fingerprint"], "ACTION_OBSERVATION_INVALID");
    if (!isPlainObject(record.focus_snapshot) || !isPlainObject(record.normalized_action)) throw new CandidateConversationPersistenceError("ACTION_RECORD_PAYLOAD_INVALID");
    exact(record.validation_result, ["status", "validator_contract_id"], "ACTION_VALIDATION_RESULT_INVALID");
    if (record.validation_result.status !== "VALID" || record.validation_result.validator_contract_id !== Conversation.ACTION_CONTRACT_ID) throw new CandidateConversationPersistenceError("ACTION_VALIDATION_RESULT_INVALID");
    exact(record.application_result, ["status", "mutation"], "ACTION_APPLICATION_RESULT_INVALID");
    if (!ACTION_RESULTS.includes(record.application_result.status) || !["NONE", "NEW_WORKING_STATE", "ITEM_DRAFT_ONLY"].includes(record.application_result.mutation)) throw new CandidateConversationPersistenceError("ACTION_APPLICATION_RESULT_INVALID");
    const expectedStatus = record.application_result.mutation === "NEW_WORKING_STATE" ? "APPLIED" : record.application_result.mutation === "ITEM_DRAFT_ONLY" ? "DRAFT_APPLIED"
      : record.normalized_action.action === "ASK_CLARIFICATION" ? "NEEDS_CLARIFICATION" : "NO_CHANGE";
    if (record.application_result.status !== expectedStatus || canonicalJson(record.normalized_action.observed_working_model) !== canonicalJson(record.observed_working_model)) {
      throw new CandidateConversationPersistenceError("ACTION_APPLICATION_RESULT_INVALID");
    }
    const resulting = nullableString(record.resulting_working_model_id, "ACTION_WORKING_LINKAGE_INVALID", 256);
    if ((record.application_result.mutation === "NEW_WORKING_STATE") !== Boolean(resulting)) throw new CandidateConversationPersistenceError("ACTION_WORKING_LINKAGE_INVALID");
    if (!/^sha256:[a-f0-9]{64}$/.test(String(record.model_response_hash || ""))) throw new CandidateConversationPersistenceError("ACTION_RESPONSE_HASH_INVALID");
    iso(record.created_at, "ACTION_TIMESTAMP_INVALID");
    iso(record.updated_at, "ACTION_TIMESTAMP_INVALID");
    assertPrivateMaterialAbsent(record);
    return Object.freeze(clone(record));
  }

  function abortWith(transaction, state, error) {
    if (state.error) return;
    state.error = error instanceof CandidateConversationPersistenceError ? error : new CandidateConversationPersistenceError(String(error?.message || "PERSISTENCE_TRANSACTION_FAILED"));
    transaction.abort();
  }

  function ensureSession(database, value) {
    const session = validateSession(value);
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAMES.sessions, "readwrite");
      const state = { error: null };
      const store = transaction.objectStore(STORE_NAMES.sessions);
      const request = store.get(session.conversation_id);
      request.onsuccess = () => {
        try {
          if (!request.result) store.add(clone(session));
          else {
            const existing = validateSession(request.result);
            if (existing.subject_id !== session.subject_id || existing.source_document_id !== session.source_document_id) throw new CandidateConversationPersistenceError("SESSION_IDENTITY_CONFLICT");
          }
        } catch (error) { abortWith(transaction, state, error); }
      };
      request.onerror = () => abortWith(transaction, state, new CandidateConversationPersistenceError("SESSION_READ_FAILED"));
      transaction.oncomplete = () => resolve(session);
      transaction.onerror = () => reject(state.error || transaction.error || new CandidateConversationPersistenceError("SESSION_WRITE_FAILED"));
      transaction.onabort = () => reject(state.error || transaction.error || new CandidateConversationPersistenceError("SESSION_WRITE_ABORTED"));
    });
  }

  function persistUserTurn(database, { session: rawSession, user_message: rawMessage, turn: rawTurn }) {
    const session = validateSession(rawSession);
    const message = validateMessage(rawMessage);
    const turn = validateTurn(rawTurn);
    if (message.role !== "USER" || message.conversation_id !== session.conversation_id || turn.conversation_id !== session.conversation_id
      || message.turn_id !== turn.execution_id || message.message_id !== turn.user_message_id || Conversation.TERMINAL_STATES.includes(turn.state)) {
      return Promise.reject(new CandidateConversationPersistenceError("USER_TURN_LINKAGE_INVALID"));
    }
    const names = [STORE_NAMES.sessions, STORE_NAMES.messages, STORE_NAMES.turns];
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(names, "readwrite");
      const state = { error: null, pending: 3, session: null, message: null, turn: null, turns: [] };
      const ready = () => {
        state.pending -= 1;
        if (state.pending || state.error) return;
        try {
          if (!state.session) throw new CandidateConversationPersistenceError("SESSION_NOT_PERSISTED");
          validateSession(state.session);
          if (state.message) throw new CandidateConversationPersistenceError("DUPLICATE_MESSAGE_ID");
          if (state.turn) throw new CandidateConversationPersistenceError("DUPLICATE_TURN_ID");
          if (state.turns.some((entry) => entry.conversation_id === session.conversation_id && ACTIVE_STATES.includes(entry.state))) throw new CandidateConversationPersistenceError("CONVERSATION_TURN_ACTIVE");
          transaction.objectStore(STORE_NAMES.messages).add(clone(message));
          transaction.objectStore(STORE_NAMES.turns).add(clone(turn));
          transaction.objectStore(STORE_NAMES.sessions).put({ ...clone(session), updated_at: turn.updated_at });
        } catch (error) { abortWith(transaction, state, error); }
      };
      [[STORE_NAMES.sessions, "get", session.conversation_id, "session"], [STORE_NAMES.messages, "get", message.message_id, "message"], [STORE_NAMES.turns, "get", turn.execution_id, "turn"], [STORE_NAMES.turns, "getAll", null, "turns"]].forEach(([name, method, key, field], index) => {
        if (index === 3) state.pending += 1;
        const request = key === null ? transaction.objectStore(name)[method]() : transaction.objectStore(name)[method](key);
        request.onsuccess = () => { state[field] = request.result || (field === "turns" ? [] : null); ready(); };
        request.onerror = () => abortWith(transaction, state, new CandidateConversationPersistenceError("USER_TURN_READ_FAILED"));
      });
      transaction.oncomplete = () => resolve(Object.freeze({ session: { ...session, updated_at: turn.updated_at }, user_message: message, turn }));
      transaction.onerror = () => reject(state.error || transaction.error || new CandidateConversationPersistenceError("USER_TURN_WRITE_FAILED"));
      transaction.onabort = () => reject(state.error || transaction.error || new CandidateConversationPersistenceError("USER_TURN_WRITE_ABORTED"));
    });
  }

  function persistFailedTurn(database, rawTurn) {
    const turn = validateTurn(rawTurn);
    if (!["FAILED", "CANCELLED", "STALE"].includes(turn.state) || turn.action_id !== null) return Promise.reject(new CandidateConversationPersistenceError("FAILED_TURN_STATE_INVALID"));
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE_NAMES.sessions, STORE_NAMES.messages, STORE_NAMES.turns, STORE_NAMES.actions], "readwrite");
      const state = { error: null, pending: 5, session: null, user: null, existing: null, messages: [], actions: [] };
      const ready = () => {
        state.pending -= 1;
        if (state.pending || state.error) return;
        try {
          if (!state.user || validateMessage(state.user).role !== "USER" || state.user.turn_id !== turn.execution_id) throw new CandidateConversationPersistenceError("FAILED_TURN_USER_MISSING");
          if (!state.session || validateSession(state.session).conversation_id !== turn.conversation_id) throw new CandidateConversationPersistenceError("SESSION_NOT_PERSISTED");
          if (!state.existing || state.existing.conversation_id !== turn.conversation_id || Conversation.TERMINAL_STATES.includes(state.existing.state)) throw new CandidateConversationPersistenceError("TURN_NOT_ACTIVE");
          if (state.messages.some((message) => message.conversation_id === turn.conversation_id && message.turn_id === turn.execution_id && message.role === "ASSISTANT")
            || state.actions.some((action) => action.conversation_id === turn.conversation_id && action.turn_id === turn.execution_id)) throw new CandidateConversationPersistenceError("FAILED_TURN_OUTPUT_FORBIDDEN");
          transaction.objectStore(STORE_NAMES.turns).put(clone(turn));
          transaction.objectStore(STORE_NAMES.sessions).put({ ...clone(state.session), updated_at: turn.updated_at });
        } catch (error) { abortWith(transaction, state, error); }
      };
      const reads = [[STORE_NAMES.sessions, "get", turn.conversation_id, "session"], [STORE_NAMES.messages, "get", turn.user_message_id, "user"], [STORE_NAMES.turns, "get", turn.execution_id, "existing"], [STORE_NAMES.messages, "getAll", null, "messages"], [STORE_NAMES.actions, "getAll", null, "actions"]];
      reads.forEach(([name, method, key, field]) => {
        const request = key === null ? transaction.objectStore(name)[method]() : transaction.objectStore(name)[method](key);
        request.onsuccess = () => { state[field] = request.result || (key === null ? [] : null); ready(); };
        request.onerror = () => abortWith(transaction, state, new CandidateConversationPersistenceError("FAILED_TURN_READ_FAILED"));
      });
      transaction.oncomplete = () => resolve(turn);
      transaction.onerror = () => reject(state.error || transaction.error || new CandidateConversationPersistenceError("FAILED_TURN_WRITE_FAILED"));
      transaction.onabort = () => reject(state.error || transaction.error || new CandidateConversationPersistenceError("FAILED_TURN_WRITE_ABORTED"));
    });
  }

  function persistSuccessfulTurn(database, { turn: rawTurn, action: rawAction, assistant_message: rawAssistant, current_working_model: rawCurrent, resulting_working_model: rawResulting = null, resume_task: resumePrepared = null, personal_snapshot: personalSnapshot = null }) {
    const turn = validateTurn(rawTurn);
    const action = validateActionRecord(rawAction);
    const assistant = validateMessage(rawAssistant);
    const current = Truth.validateCandidateWorkingModel(rawCurrent);
    const resulting = rawResulting === null ? null : Truth.validateCandidateWorkingModel(rawResulting);
    if (!["APPLIED", "NO_CHANGE", "NEEDS_CLARIFICATION"].includes(turn.state) || assistant.role !== "ASSISTANT"
      || turn.action_id !== action.action_id || action.turn_id !== turn.execution_id || assistant.turn_id !== turn.execution_id
      || assistant.candidate_action_id !== action.action_id || assistant.runtime_snapshot_id !== turn.runtime_snapshot_id
      || action.originating_user_message_id !== turn.user_message_id || action.conversation_id !== turn.conversation_id || assistant.conversation_id !== turn.conversation_id
      || action.observed_working_model.working_model_id !== current.working_model_id || action.observed_working_model.version !== current.version
      || action.observed_working_model.fingerprint !== current.fingerprint) {
      return Promise.reject(new CandidateConversationPersistenceError("SUCCESSFUL_TURN_LINKAGE_INVALID"));
    }
    const expectedTerminal = action.application_result.status === "NEEDS_CLARIFICATION" ? "NEEDS_CLARIFICATION"
      : action.application_result.status === "NO_CHANGE" ? "NO_CHANGE" : "APPLIED";
    const expectedAssistantText = action.normalized_action.action === "ASK_CLARIFICATION" ? action.normalized_action.clarification : action.normalized_action.message;
    if (turn.state !== expectedTerminal || assistant.text !== expectedAssistantText) {
      return Promise.reject(new CandidateConversationPersistenceError("SUCCESSFUL_TURN_LINKAGE_INVALID"));
    }
    if ((action.application_result.mutation === "NEW_WORKING_STATE") !== Boolean(resulting)
      || (resulting && (action.resulting_working_model_id !== resulting.working_model_id || resulting.previous_working_model_id !== current.working_model_id || resulting.version !== current.version + 1))) {
      return Promise.reject(new CandidateConversationPersistenceError("ACTION_WORKING_LINKAGE_INVALID"));
    }
    const Candidate = globalThis.AriadneJobCandidateContext || (typeof module === "object" ? require("./job-candidate-context-domain.js") : null);
    const personalStores = personalSnapshot ? Candidate.transactionStores(personalSnapshot, database) : [];
    const names = [...new Set([STORE_NAMES.sessions, STORE_NAMES.messages, STORE_NAMES.turns, STORE_NAMES.actions, STORE_NAMES.working, "runtime_snapshots", ...personalStores, ...(resumePrepared ? Resume().transactionStores(resumePrepared) : [])])];
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(names, "readwrite");
      const state = { error: null, pending: 7, session: null, user: null, turn: null, assistant: null, action: null, models: [], snapshot: null };
      if (resumePrepared) Resume().commitInto(transaction, resumePrepared).catch(error => abortWith(transaction, state, error));
      if (personalSnapshot) Candidate.assertSnapshotInto(transaction, personalSnapshot, personalStores).catch(error => abortWith(transaction, state, error));
      const ready = () => {
        state.pending -= 1;
        if (state.pending || state.error) return;
        try {
          if (!state.user || validateMessage(state.user).role !== "USER" || state.user.turn_id !== turn.execution_id) throw new CandidateConversationPersistenceError("SUCCESSFUL_TURN_USER_MISSING");
          if (!state.session || validateSession(state.session).conversation_id !== turn.conversation_id) throw new CandidateConversationPersistenceError("SESSION_NOT_PERSISTED");
          if (!state.turn || Conversation.TERMINAL_STATES.includes(state.turn.state)) throw new CandidateConversationPersistenceError("TURN_NOT_ACTIVE");
          // Bind the answer to the durable runtime captured before dispatch,
          // rather than a legacy provider name or the current UI selection.
          if (!state.snapshot || state.turn.runtime_snapshot_id !== turn.runtime_snapshot_id) throw new CandidateConversationPersistenceError("SUCCESSFUL_TURN_RUNTIME_INVALID");
          const snapshot = Truth.validateRuntimeSnapshotRecord(state.snapshot);
          if (snapshot.snapshot_id !== turn.runtime_snapshot_id || snapshot.mode !== "model" || snapshot.operation !== turn.operation
            || assistant.provider !== snapshot.provider || assistant.model !== snapshot.model) throw new CandidateConversationPersistenceError("SUCCESSFUL_TURN_RUNTIME_INVALID");
          if (state.assistant) throw new CandidateConversationPersistenceError("DUPLICATE_MESSAGE_ID");
          if (state.action) throw new CandidateConversationPersistenceError("DUPLICATE_ACTION_ID");
          const head = state.models.map(Truth.validateCandidateWorkingModel).filter((model) => model.source_document_id === current.source_document_id).sort((left, right) => right.version - left.version)[0];
          if (!head || head.working_model_id !== current.working_model_id || head.version !== current.version || head.fingerprint !== current.fingerprint) throw new CandidateConversationPersistenceError("STALE_WORKING_OBSERVATION");
          if (resulting) transaction.objectStore(STORE_NAMES.working).add(clone(resulting));
          transaction.objectStore(STORE_NAMES.actions).add(clone(action));
          transaction.objectStore(STORE_NAMES.messages).add(clone(assistant));
          transaction.objectStore(STORE_NAMES.turns).put(clone(turn));
          transaction.objectStore(STORE_NAMES.sessions).put({ ...clone(state.session), updated_at: turn.updated_at });
        } catch (error) { abortWith(transaction, state, error); }
      };
      const reads = [[STORE_NAMES.sessions, "get", turn.conversation_id, "session"], [STORE_NAMES.messages, "get", turn.user_message_id, "user"], [STORE_NAMES.turns, "get", turn.execution_id, "turn"], [STORE_NAMES.messages, "get", assistant.message_id, "assistant"], [STORE_NAMES.actions, "get", action.action_id, "action"], [STORE_NAMES.working, "getAll", null, "models"], ["runtime_snapshots", "get", turn.runtime_snapshot_id, "snapshot"]];
      reads.forEach(([name, method, key, field]) => {
        const request = key === null ? transaction.objectStore(name)[method]() : transaction.objectStore(name)[method](key);
        request.onsuccess = () => { state[field] = request.result || (field === "models" ? [] : null); ready(); };
        request.onerror = () => abortWith(transaction, state, new CandidateConversationPersistenceError("SUCCESSFUL_TURN_READ_FAILED"));
      });
      transaction.oncomplete = () => resolve(Object.freeze({ turn, action, assistant_message: assistant, resulting_working_model: resulting }));
      transaction.onerror = () => reject(state.error || transaction.error || new CandidateConversationPersistenceError("SUCCESSFUL_TURN_WRITE_FAILED"));
      transaction.onabort = () => reject(state.error || transaction.error || new CandidateConversationPersistenceError("SUCCESSFUL_TURN_WRITE_ABORTED"));
    });
  }

  function restoreConversation(database, conversationId) {
    const id = requiredString(conversationId, "CONVERSATION_ID_INVALID", 256);
    const names = [STORE_NAMES.sessions, STORE_NAMES.messages, STORE_NAMES.turns, STORE_NAMES.actions];
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(names, "readonly");
      const output = { session: null, messages: [], turns: [], actions: [] };
      let pending = names.length;
      const finish = () => {
        pending -= 1;
        if (pending) return;
        try {
          if (!output.session) throw new CandidateConversationPersistenceError("SESSION_NOT_PERSISTED");
          output.session = validateSession(output.session);
          output.messages = output.messages.filter((entry) => entry?.contract_id === MESSAGE_CONTRACT && entry.conversation_id === id).map(validateMessage).sort(compareCreated);
          output.turns = output.turns.filter((entry) => entry?.contract_id === TURN_CONTRACT && entry.conversation_id === id).map(validateTurn).sort(compareCreated);
          output.actions = output.actions.filter((entry) => entry?.contract_id === ACTION_RECORD_CONTRACT && entry.conversation_id === id).map(validateActionRecord).sort(compareCreated);
          resolve(Object.freeze(clone(output)));
        } catch (error) { reject(error); }
      };
      const sessionRequest = transaction.objectStore(STORE_NAMES.sessions).get(id);
      sessionRequest.onsuccess = () => { output.session = sessionRequest.result || null; finish(); };
      sessionRequest.onerror = () => reject(sessionRequest.error || new CandidateConversationPersistenceError("RESTORE_READ_FAILED"));
      [[STORE_NAMES.messages, "messages"], [STORE_NAMES.turns, "turns"], [STORE_NAMES.actions, "actions"]].forEach(([name, field]) => {
        const request = transaction.objectStore(name).getAll();
        request.onsuccess = () => { output[field] = request.result || []; finish(); };
        request.onerror = () => reject(request.error || new CandidateConversationPersistenceError("RESTORE_READ_FAILED"));
      });
    });
  }

  function compareCreated(left, right) {
    return String(left.created_at).localeCompare(String(right.created_at)) || String(left.message_id || left.execution_id || left.action_id).localeCompare(String(right.message_id || right.execution_id || right.action_id));
  }

  return Object.freeze({
    SESSION_CONTRACT, MESSAGE_CONTRACT, TURN_CONTRACT, ACTION_RECORD_CONTRACT, STORE_NAMES, MESSAGE_ROLES, ACTIVE_STATES,
    CandidateConversationPersistenceError, createSession, validateSession, createUserMessage, createAssistantMessage, validateMessage,
    turnRecord, validateTurn, modelResponseHash, createActionRecord, validateActionRecord, ensureSession, persistUserTurn,
    persistFailedTurn, persistSuccessfulTurn, restoreConversation,
  });
}));
