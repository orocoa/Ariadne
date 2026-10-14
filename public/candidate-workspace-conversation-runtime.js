"use strict";

(function attachCandidateWorkspaceConversationRuntime(root, factory) {
  const runtime = root.AriadneRuntimeExecution
    || (typeof module === "object" && module.exports ? require("./runtime-capabilities.js") : null);
  const gate = root.JobRadarRuntimeGate
    || (typeof module === "object" && module.exports ? require("./runtime-capability-gate.js") : null);
  const truth = root.AriadneTruthPersistence
    || (typeof module === "object" && module.exports ? require("./truth-persistence-domain.js") : null);
  const conversation = root.AriadneCandidateConversation
    || (typeof module === "object" && module.exports ? require("./candidate-conversation-domain.js") : null);
  const persistence = root.AriadneCandidateConversationPersistence
    || (typeof module === "object" && module.exports ? require("./candidate-conversation-persistence-domain.js") : null);
  const compiler = root.AriadneCandidateConversationContextCompiler
    || (typeof module === "object" && module.exports ? require("./candidate-conversation-context-compiler.js") : null);
  const api = factory(runtime, gate, truth, conversation, persistence, compiler);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AriadneCandidateWorkspaceConversationRuntime = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createCandidateWorkspaceConversationRuntime(Runtime, RuntimeGate, Truth, Conversation, Persistence, Compiler) {
  if (!Runtime || !RuntimeGate || !Truth || !Conversation || !Persistence || !Compiler) {
    throw new Error("candidate_workspace_conversation_dependencies_required");
  }

  const PROVIDER = "deepseek";
  const Delivery = globalThis.AriadneConversationOutput || (typeof module === "object" ? require("./conversation-output.js") : null);
  const MODEL = "deepseek-flash";
  const PROTOCOL = "OPENAI_CHAT_COMPLETIONS";
  const RUNTIME_CONTRACTS = Conversation.CONTRACT_MANIFEST.runtime_contracts;
  const ADAPTER_VERSION = RUNTIME_CONTRACTS.adapter_version;
  const PROMPT_VERSION = RUNTIME_CONTRACTS.prompt_version;
  const ACTION_SCHEMA_VERSION = Conversation.ACTION_CONTRACT_ID;
  const REQUEST_CONFIG_VERSION = RUNTIME_CONTRACTS.request_config_version;
  const CAPABILITY_BASIS = "adapter_verified";
  const CREDENTIAL_REF = "keychain://AI-Learning-OS.JobRadar.DeepSeek/local-vision";
  const REQUEST_CONTRACT = RUNTIME_CONTRACTS.request_contract_version;
  const RESULT_CONTRACT = RUNTIME_CONTRACTS.result_contract_version;

  const ResumeSupport = () => globalThis.AriadneResumeTaskSupport || (typeof module === "object" ? require("./resume-task-support.js") : null);
  const Resume = () => globalThis.AriadneResumeTask || (typeof module === "object" ? require("./resume-task-domain.js") : null);
  const Candidate = () => globalThis.AriadneJobCandidateContext || (typeof module === "object" ? require("./job-candidate-context-domain.js") : null);
  const PersonalContext = () => globalThis.AriadnePersonalContext || (typeof module === "object" ? require("./personal-context-domain.js") : null);
  const RESULT_KEYS = Object.freeze([
    "contract_id", "execution_id", "generation", "conversation_id", "operation", "provider", "model", "protocol",
    "runtime_snapshot_id", "finish_reason", "usage", "action", "authority", "network_call_made", "persistence",
  ]);

  class CandidateWorkspaceConversationError extends Error {
    constructor(code, details = {}) {
      super(code);
      this.name = "CandidateWorkspaceConversationError";
      this.code = code;
      Object.assign(this, details);
    }
  }

  function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function exactKeys(value, keys, code) {
    if (!isPlainObject(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
      throw new CandidateWorkspaceConversationError(code);
    }
    return value;
  }

  function requiredText(value, code, maximum = 8000) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) throw new CandidateWorkspaceConversationError(code);
    return value.trim();
  }

  function nowIso(now) {
    const value = typeof now === "function" ? now() : new Date();
    const result = value instanceof Date ? value.toISOString() : String(value);
    if (Number.isNaN(Date.parse(result))) throw new CandidateWorkspaceConversationError("TURN_TIMESTAMP_INVALID");
    return result;
  }

  function defaultId(prefix) {
    const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${suffix}`;
  }

  function runtimeSession(session) {
    return Object.freeze(Object.fromEntries(
      ["contract_id", "conversation_id", "subject_type", "subject_id", "created_at"].map((key) => [key, session[key]]),
    ));
  }

  function candidateContextIdFor(sourceDocumentId) {
    return `candidate-workspace-context-${requiredText(sourceDocumentId, "SESSION_SOURCE_INVALID", 256)}`;
  }

  async function resolveSession(database, sourceDocumentId, createdAt = new Date()) {
    const candidate = Persistence.createSession({
      candidate_context_id: candidateContextIdFor(sourceDocumentId),
      source_document_id: sourceDocumentId,
      created_at: createdAt,
    });
    try {
      return (await Persistence.restoreConversation(database, candidate.conversation_id)).session;
    } catch (error) {
      if (String(error?.code || error?.message) !== "SESSION_NOT_PERSISTED") throw error;
    }
    return Persistence.ensureSession(database, candidate);
  }

  function createRuntimeSnapshot({ snapshot_id: snapshotId, captured_at: capturedAt = new Date(), scope = null } = {}) {
    const currentRuntime = RuntimeGate.runtimeForSnapshot("candidate_conversation", null, scope);
    const descriptor = RuntimeGate.modelDescriptorForRuntime(currentRuntime, "candidate_conversation");
    return Runtime.createRuntimeSnapshot(currentRuntime, {
      modelDescriptor: descriptor,
      snapshotId,
      capturedAt: capturedAt instanceof Date ? capturedAt.toISOString() : String(capturedAt),
      credentialRef: RuntimeGate.credentialFor(currentRuntime),
      adapterVersion: descriptor?.adapter_version,
      promptVersion: PROMPT_VERSION,
      schemaVersion: ACTION_SCHEMA_VERSION,
      operation: Conversation.OPERATION,
      capabilityBasis: CAPABILITY_BASIS,
      actionSchemaVersion: ACTION_SCHEMA_VERSION,
      requestConfigVersion: REQUEST_CONFIG_VERSION,
      deliveryMethod: null,
    });
  }

  function runtimeSignature() {
    return Object.freeze({
      manifest_version: Conversation.CONTRACT_MANIFEST.manifest_version,
      semantic_action_schema_version: Conversation.CONTRACT_MANIFEST.semantic_action_version,
      canonical_action_schema_version: ACTION_SCHEMA_VERSION,
      runtime_request_contract_version: REQUEST_CONTRACT,
      runtime_result_contract_version: RESULT_CONTRACT,
      adapter_version: ADAPTER_VERSION,
      prompt_version: PROMPT_VERSION,
      request_config_version: REQUEST_CONFIG_VERSION,
    });
  }

  function runtimeSignaturesMatch(frontendSignature, backendSignature) {
    const expected = runtimeSignature();
    const keys = Object.keys(expected);
    return isPlainObject(frontendSignature) && isPlainObject(backendSignature)
      && keys.every((key) => frontendSignature[key] === expected[key] && backendSignature[key] === expected[key]);
  }

  function latestWorkingModel(database, sourceDocumentId) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("candidate_working_models", "readonly");
      const request = transaction.objectStore("candidate_working_models").getAll();
      request.onsuccess = () => {
        try {
          const head = (request.result || []).map(Truth.validateCandidateWorkingModel)
            .filter((model) => model.source_document_id === sourceDocumentId)
            .sort((left, right) => right.version - left.version)[0] || null;
          if (!head) throw new CandidateWorkspaceConversationError("WORKING_MODEL_MISSING");
          resolve(head);
        } catch (error) { reject(error); }
      };
      request.onerror = () => reject(request.error || new CandidateWorkspaceConversationError("WORKING_MODEL_READ_FAILED"));
    });
  }

  function validateRuntimeResult(value, execution, session, snapshot) {
    const result = exactKeys(value, [...RESULT_KEYS, ...(Object.hasOwn(value || {}, "delivery_calls") ? ["delivery_calls"] : []), ...(Object.hasOwn(value || {}, "web_search") ? ["web_search"] : []), ...(Object.hasOwn(value || {}, "resume_task") ? ["resume_task", "delivery_version", ...(Object.hasOwn(value || {}, "deliverable") ? ["deliverable"] : [])] : Object.hasOwn(value || {}, "deliverable") ? ["deliverable", "delivery_version"] : [])], "RUNTIME_RESULT_SHAPE_INVALID");
    Delivery.fromResult(result);
    Delivery.searchFromResult(result);
    if (result.contract_id !== RESULT_CONTRACT || result.execution_id !== execution.execution_id
      || result.generation !== execution.generation || result.conversation_id !== session.conversation_id
      || result.operation !== Conversation.OPERATION || result.provider !== snapshot.provider || result.model !== snapshot.model
      || result.protocol !== snapshot.protocol || result.runtime_snapshot_id !== snapshot.snapshot_id
      || result.finish_reason !== "stop" || result.authority !== "NON_AUTHORITATIVE_WORKING_ACTION"
      || result.network_call_made !== true || result.persistence !== "not_written" || !isPlainObject(result.usage)) {
      throw new CandidateWorkspaceConversationError("RUNTIME_RESULT_IDENTITY_INVALID");
    }
    return result;
  }

  function createRuntimeRequest({ session: rawSession, human_message: rawHumanMessage, observation, working_model: workingModel, compiled_context: compiledContext, runtime_snapshot: snapshot, execution }) {
    const session = Persistence.validateSession(rawSession);
    const humanMessage = requiredText(rawHumanMessage, "HUMAN_MESSAGE_INVALID", Conversation.LIMITS.human_message);
    if (!isPlainObject(observation) || !isPlainObject(workingModel) || !isPlainObject(compiledContext) || !isPlainObject(snapshot) || !isPlainObject(execution)) {
      throw new CandidateWorkspaceConversationError("RUNTIME_REQUEST_INPUT_INVALID");
    }
    return Object.freeze({
      contract_id: REQUEST_CONTRACT,
      conversation: runtimeSession(session),
      human_message: humanMessage,
      observation,
      working_model: workingModel,
      compiled_context: compiledContext,
      runtime_snapshot: snapshot,
      draft: null,
      turn: { execution_id: requiredText(execution.execution_id, "TURN_EXECUTION_ID_INVALID", 256), generation: requiredText(execution.generation, "TURN_GENERATION_INVALID", 256) },
    });
  }

  function failureCode(error) {
    const code = String(error?.code || error?.message || "CANDIDATE_CONVERSATION_FAILED").trim();
    return code && code.length <= 256 ? code : "CANDIDATE_CONVERSATION_FAILED";
  }

  function assertWorkingAuthorityCopy(action) {
    const text = action.action === "ASK_CLARIFICATION" ? action.clarification : action.message;
    const escalation = /(?:已(?:自动)?保存到(?:你的)?个人资料|已(?:自动)?写入(?:你的)?正式资料|(?:我|我们|系统|Ariadne)\s*(?:已|已经|现已)(?:确认|保存|写入)|(?:更正|修改|更新|补充|资料|记录|事实)(?:已|已经|现已)(?:被)?(?:确认|保存|写入)|(?:^|[。！？；\n.!?;])\s*已确认(?=[。！？；，,\n.!?;]|$)|(?:I|we|Ariadne|the system)\s+(?:(?:have|has)\s+)?(?:already\s+)?confirmed\s+(?:(?:the|your)\s+)?(?:profile|record|facts?)|saved\s+to\s+(?:(?:the|your)\s+)?profile)/giu;
    const copy = String(text || "");
    for (const match of copy.matchAll(escalation)) {
      const prefix = copy.slice(0, match.index).split(/[。！？；\n.!?;]/u).at(-1);
      if (/(?:你|用户|人类)(?:此前|之前|曾经|曾|当时)?\s*$|\byou\s+(?:previously\s+|already\s+)?$/iu.test(prefix)) continue;
      if (/(?:未|没有|并未|不会|不能|不应|尚未|\bnot\b|\bnever\b)[^，,。！？；\n.!?;]{0,10}$/iu.test(prefix)) continue;
      throw new CandidateWorkspaceConversationError("AUTHORITY_COPY_INVALID");
    }
  }

  function canonicalValue(value) {
    if (Array.isArray(value)) return value.map(canonicalValue);
    if (isPlainObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
    return value;
  }

  function sameValue(left, right) {
    return JSON.stringify(canonicalValue(left)) === JSON.stringify(canonicalValue(right));
  }

  function receiptAfterValue(operation) {
    if (operation.operation === "CLEAR_ITEM_FIELD") return null;
    return operation.operation === "SET_UNCERTAINTY_STATUS" ? operation.status : operation.value;
  }

  function resolutionVerificationsForAction(action, currentWorkingModel) {
    const patchAction = ["PATCH_ITEM", "PATCH_MULTIPLE_ITEMS"].includes(action.action);
    if (!patchAction) return Object.freeze([]);
    const currentItems = new Map((currentWorkingModel.payload.items || []).map((item) => [item.item_id, item]));
    const operations = action.patches.flatMap((patch) => patch.operations.map((operation) => ({ patch, operation })));
    return Object.freeze(operations.map(({ patch, operation }) => {
      const currentItem = currentItems.get(patch.target_item_id);
      const descriptor = currentItem ? Conversation.fieldDescriptorForOperation(currentItem, operation) : null;
      if (!descriptor) throw new CandidateWorkspaceConversationError("RESOLUTION_VERIFICATION_FAILED");
      return Object.freeze({
        active_item_identity: patch.target_item_id,
        resolved_field_identity: descriptor.canonical_target_identity,
        semantic_key: descriptor.semantic_key,
        canonical_display_label: descriptor.canonical_display_label,
        expected_before_value: descriptor.current_value,
        desired_after_value: receiptAfterValue(operation),
        canonical_operation: canonicalValue(operation),
        storage_target: canonicalValue(descriptor.storage_target),
      });
    }));
  }

  function successCopyForReceipts(receipts, currentItems) {
    const short = (value, maximum = 180) => String(value ?? "").length > maximum ? `${String(value).slice(0, maximum)}…` : String(value ?? "");
    const details = receipts.slice(0, 12).map((receipt) => {
      const label = receipt.canonical_display_label;
      const before = receipt.expected_before_value == null ? null : short(receipt.expected_before_value);
      const after = receipt.desired_after_value == null ? null : short(receipt.desired_after_value);
      const title = short(currentItems.get(receipt.active_item_identity)?.title || "未命名卡片", 100);
      if (after === null) return `「${title}」：已清空「${label}」（原值：「${before ?? ""}」）。`;
      return `「${title}」：「${label}」${before == null || before === "" ? "已设为" : `从「${before}」改为`}「${after}」。`;
    }).join("\n");
    const count = new Set(receipts.map((receipt) => receipt.active_item_identity)).size;
    return `已更新 ${count} 张卡片的草稿，其他卡片保持不变。\n${details}${receipts.length > 12 ? "\n其余改动请在左侧卡片中核对。" : ""}\n尚未保存到个人资料，请核对后点击“保存到个人资料”。`;
  }

  function verifiedAppliedAction(action, receipts, currentWorkingModel, resultingWorkingModel) {
    if (!["PATCH_ITEM", "PATCH_MULTIPLE_ITEMS"].includes(action.action)) return action;
    if (!resultingWorkingModel || !receipts.length) throw new CandidateWorkspaceConversationError("APPLICATION_RESULT_MISMATCH");
    const currentItems = new Map((currentWorkingModel.payload.items || []).map((item) => [item.item_id, item]));
    const resultingItems = new Map((resultingWorkingModel.payload.items || []).map((item) => [item.item_id, item]));
    receipts.forEach((receipt) => {
      const currentDescriptor = Conversation.candidateFieldDescriptors(currentItems.get(receipt.active_item_identity))
        .find((descriptor) => descriptor.canonical_target_identity === receipt.resolved_field_identity);
      const resultingDescriptor = Conversation.candidateFieldDescriptors(resultingItems.get(receipt.active_item_identity))
        .find((descriptor) => descriptor.canonical_target_identity === receipt.resolved_field_identity);
      if (!currentDescriptor || !resultingDescriptor
        || !sameValue(currentDescriptor.storage_target, receipt.storage_target)
        || !sameValue(resultingDescriptor.storage_target, receipt.storage_target)
        || currentDescriptor.semantic_key !== receipt.semantic_key || resultingDescriptor.semantic_key !== receipt.semantic_key
        || !sameValue(resultingDescriptor.current_value, receipt.desired_after_value)) {
        throw new CandidateWorkspaceConversationError("APPLICATION_RESULT_MISMATCH");
      }
    });
    return Object.freeze({ ...action, message: successCopyForReceipts(receipts, currentItems) });
  }

  const INTERNAL_IDENTITY_KEYS = Object.freeze([
    "item_id", "fact_id", "uncertainty_id", "working_model_id", "source_document_id", "session_id",
    "conversation_id", "turn_id", "execution_id", "generation", "action_id", "candidate_action_id",
    "runtime_snapshot_id", "candidate_context_id", "fingerprint", "card_ref", "active_card_ref",
    "version_token", "revision_token", "source_token", "scope_token", "ref",
  ]);

  function collectInternalIdentities(value, result = new Set()) {
    if (Array.isArray(value)) value.forEach((entry) => collectInternalIdentities(entry, result));
    else if (isPlainObject(value)) Object.entries(value).forEach(([key, nested]) => {
      if (typeof nested === "string" && INTERNAL_IDENTITY_KEYS.includes(key)) {
        if (nested.trim()) result.add(nested.trim());
      }
      collectInternalIdentities(nested, result);
    });
    return result;
  }

  function copyContainsInternalIdentity(text, identities) {
    const copy = String(text || "");
    return [...identities].some((identity) => {
      const escaped = identity.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      return new RegExp(`(^|[^A-Za-z0-9._:-])${escaped}(?=$|[^A-Za-z0-9._:-])`, "u").test(copy);
    });
  }

  function humanSafeAction(action, identities) {
    if (["PATCH_ITEM", "PATCH_MULTIPLE_ITEMS"].includes(action.action)) {
      if (copyContainsInternalIdentity(action.message, identities)) throw new CandidateWorkspaceConversationError("HUMAN_COPY_IDENTITY_LEAK");
      return action;
    }
    const text = action.action === "ASK_CLARIFICATION" ? action.clarification : action.message;
    if (!copyContainsInternalIdentity(text, identities)) return action;
    if (action.action === "ASK_CLARIFICATION") return Object.freeze({ ...action, clarification: "请使用卡片标题或字段名称说明要修改的内容。" });
    if (action.action === "NO_CHANGE") return Object.freeze({ ...action, message: "当前字段无需修改。" });
    return Object.freeze({ ...action, message: "我无法安全显示这段说明，请换一种问法。" });
  }

  async function executeListTurn({
    database,
    session: rawSession,
    human_message: rawHumanMessage,
    focus = Object.freeze({ type: "CANDIDATE" }),
    runtime_snapshot: rawSnapshot = null,
    call_runtime: callRuntime,
    id_factory: idFactory = defaultId,
    now = () => new Date(),
    on_user_persisted: onUserPersisted = null,
  }) {
    if (!database || typeof callRuntime !== "function") throw new CandidateWorkspaceConversationError("CONVERSATION_EXECUTION_DEPENDENCY_MISSING");
    const humanMessage = requiredText(rawHumanMessage, "HUMAN_MESSAGE_INVALID", Conversation.LIMITS.human_message);
    const session = Persistence.validateSession(rawSession);
    const sourceDocumentId = session.source_document_id;
    const initialWorkingModel = await latestWorkingModel(database, sourceDocumentId);
    const observation = Conversation.createObservation({
      candidate_context_id: session.subject_id,
      working_model: initialWorkingModel,
      focus,
    });
    const snapshot = rawSnapshot ? Runtime.validateRuntimeSnapshot(rawSnapshot) : createRuntimeSnapshot();
    const executionId = idFactory("candidate-conversation-turn");
    const generation = idFactory("candidate-conversation-generation");
    const userMessageId = idFactory("candidate-conversation-user");
    let execution = Conversation.createTurnExecution({
      execution_id: executionId,
      session: runtimeSession(session),
      observation,
      runtime_snapshot_id: snapshot.snapshot_id,
      generation,
      created_at: nowIso(now),
    });
    execution = Conversation.transitionExecution(execution, "SENDING", { at: nowIso(now) });
    const userMessage = Persistence.createUserMessage({
      message_id: userMessageId,
      conversation_id: session.conversation_id,
      turn_id: executionId,
      text: humanMessage,
      created_at: execution.created_at,
    });
    let userPersisted = false;
    let validatingExecution = null;

    try {
      await Truth.persistRecord(database, "runtime_snapshots", snapshot);
      await Persistence.persistUserTurn(database, {
        session,
        user_message: userMessage,
        turn: Persistence.turnRecord(execution, { user_message_id: userMessage.message_id }),
      });
      userPersisted = true;
      if (typeof onUserPersisted === "function") await onUserPersisted(Object.freeze({ session, user_message: userMessage, execution }));

      const restored = await Persistence.restoreConversation(database, session.conversation_id);
      if (!Candidate() || !PersonalContext()) throw new CandidateWorkspaceConversationError("PERSONAL_CONTEXT_DEPENDENCY_REQUIRED");
      const personalSnapshot = await Candidate().buildSnapshotFromDatabase(database);
      const itemIds = observation.focus.type === "CANDIDATE" ? initialWorkingModel.payload.items.map(item => item.item_id) : [observation.focus.item_id];
      const cardRefs = Object.fromEntries(initialWorkingModel.payload.items.map((item, index) => [item.item_id, `card-${index + 1}`]));
      const personalContext = PersonalContext().savedContext(personalSnapshot, { source_document_id: sourceDocumentId, item_ids: itemIds, card_ref_by_item: cardRefs });
      personalContext.scope_token = (await Candidate().fingerprint({ source_document_id: sourceDocumentId, observed_working_model: { working_model_id: initialWorkingModel.working_model_id, version: initialWorkingModel.version, fingerprint: initialWorkingModel.fingerprint }, focus: observation.focus })).slice(7);
      const compiledContext = Compiler.compileContext({
        session,
        working_model: initialWorkingModel,
        observation,
        messages: restored.messages,
        actions: restored.actions,
        current_user_message: userMessage,
        personal_context: personalContext,
        personal_history_blockers: personalSnapshot.personal_history_blockers,
      });
      const request = createRuntimeRequest({
        session,
        human_message: humanMessage,
        observation,
        working_model: initialWorkingModel,
        compiled_context: compiledContext,
        runtime_snapshot: snapshot,
        execution,
      });
      const rawResult = await callRuntime(request);
      execution = Conversation.transitionExecution(execution, "RECEIVED", { at: nowIso(now) });
      execution = Conversation.transitionExecution(execution, "VALIDATING", { at: nowIso(now) });
      validatingExecution = execution;
      const result = validateRuntimeResult(rawResult, execution, session, snapshot);
      const currentWorkingModel = await latestWorkingModel(database, sourceDocumentId);
      let resolutionVerifications = Object.freeze([]);
      try {
        Conversation.assertCurrentObservation(observation, runtimeSession(session), currentWorkingModel);
        const canonicalAction = Conversation.validateAction(result.action, {
          observation, working_model: currentWorkingModel, human_message: humanMessage, compiled_context: compiledContext,
        });
        resolutionVerifications = resolutionVerificationsForAction(canonicalAction, currentWorkingModel);
      } catch (error) {
        if (String(error?.code || error?.message) !== "STALE_WORKING_OBSERVATION") throw error;
      }
      const outcome = await Conversation.applyExecutionResult({
        execution,
        generation,
        action: result.action,
        compiled_context: compiledContext,
        session: runtimeSession(session),
        current_working_model: currentWorkingModel,
        human_message: humanMessage,
        at: nowIso(now),
      });
      if (outcome.execution.state === "STALE") {
        const staleTurn = Persistence.turnRecord(outcome.execution, { user_message_id: userMessage.message_id, usage: result.usage });
        await Persistence.persistFailedTurn(database, staleTurn);
        return Object.freeze({ status: "STALE", session, user_message: userMessage, turn: staleTurn, action: null, working_model: currentWorkingModel, runtime_result: result });
      }
      if (!Candidate().observationsMatch(personalSnapshot, await Candidate().buildSnapshotFromDatabase(database))) throw new CandidateWorkspaceConversationError("PERSONAL_CONTEXT_CHANGED");

      const resultingWorkingModel = outcome.application.mutation === "NEW_WORKING_STATE" ? outcome.application.working_model : null;
      let appliedAction = verifiedAppliedAction(outcome.application.action, resolutionVerifications, currentWorkingModel, resultingWorkingModel);
      const actionId = idFactory("candidate-conversation-action");
      const assistantMessageId = idFactory("candidate-conversation-assistant");
      const internalIdentities = collectInternalIdentities({
        request, result, session, observation, snapshot, execution, currentWorkingModel, resultingWorkingModel,
        action_id: actionId, assistant_message_id: assistantMessageId,
      });
      appliedAction = humanSafeAction(appliedAction, internalIdentities);
      assertWorkingAuthorityCopy(appliedAction);
      const actionRecord = await Persistence.createActionRecord({
        action_id: actionId,
        conversation_id: session.conversation_id,
        turn_id: execution.execution_id,
        originating_user_message_id: userMessage.message_id,
        observation,
        normalized_action: appliedAction,
        compiled_context: compiledContext,
        application: outcome.application,
        working_model: currentWorkingModel,
        human_message: humanMessage,
        created_at: nowIso(now),
      });
      const terminalTurn = Persistence.turnRecord(outcome.execution, {
        user_message_id: userMessage.message_id,
        action_id: actionRecord.action_id,
        usage: result.usage,
      });
      const resumePrepared = await ResumeSupport().prepareResult(database, request, result);
      const assistantMessage = Persistence.createAssistantMessage({
        message_id: assistantMessageId,
        conversation_id: session.conversation_id,
        turn_id: execution.execution_id,
        text: appliedAction.action === "ASK_CLARIFICATION" ? appliedAction.clarification : appliedAction.message,
        provider: snapshot.provider,
        model: snapshot.model,
        runtime_snapshot_id: snapshot.snapshot_id,
        candidate_action_id: actionRecord.action_id,
        personal_context_token: personalContext.source_token,
        resume_task: ResumeSupport().metadata(resumePrepared), deliverable: Delivery.fromResult(result), web_search: Delivery.searchFromResult(result),
        created_at: nowIso(now),
      });
      try {
        await Persistence.persistSuccessfulTurn(database, {
          turn: terminalTurn,
          action: actionRecord,
          assistant_message: assistantMessage,
          current_working_model: currentWorkingModel,
          resulting_working_model: resultingWorkingModel,
          resume_task: resumePrepared,
          personal_snapshot: personalSnapshot,
        });
        if (resumePrepared) globalThis.dispatchEvent?.(new Event("ariadne-resume-saved"));
      } catch (error) {
        if (String(error?.code || error?.message) !== "STALE_WORKING_OBSERVATION") throw error;
        const staleExecution = Conversation.transitionExecution(validatingExecution, "STALE", { at: nowIso(now) });
        const staleTurn = Persistence.turnRecord(staleExecution, { user_message_id: userMessage.message_id, usage: result.usage });
        await Persistence.persistFailedTurn(database, staleTurn);
        return Object.freeze({ status: "STALE", session, user_message: userMessage, turn: staleTurn, action: null, working_model: await latestWorkingModel(database, sourceDocumentId), runtime_result: result });
      }
      return Object.freeze({
        status: "SUCCEEDED",
        session,
        user_message: userMessage,
        assistant_message: assistantMessage,
        turn: terminalTurn,
        action: actionRecord,
        working_model: resultingWorkingModel || currentWorkingModel,
        runtime_result: result,
      });
    } catch (error) {
      if (!userPersisted) throw error;
      const activeExecution = validatingExecution || execution;
      if (!Conversation.TERMINAL_STATES.includes(activeExecution.state)) {
        const failedExecution = Conversation.transitionExecution(activeExecution, "FAILED", {
          at: nowIso(now), failure_code: failureCode(error), failure_diagnostics: safeFailureDiagnostics(error),
        });
        await Persistence.persistFailedTurn(database, Persistence.turnRecord(failedExecution, { user_message_id: userMessage.message_id }));
      }
      if (error instanceof CandidateWorkspaceConversationError) throw error;
      throw new CandidateWorkspaceConversationError(failureCode(error), { cause: error });
    }
  }

  function safeFailureDiagnostics(error) {
    const raw = isPlainObject(error?.diagnostics) ? error.diagnostics : {};
    const booleanKeys = ["provider_called", "provider_response_received", "json_parse_passed", "semantic_schema_passed", "resolution_passed", "canonical_schema_passed", "semantic_guard_passed", "persistence_reached", "runtime_signature_compatible"];
    const result = { stage: typeof raw.stage === "string" ? raw.stage : "RUNTIME", error_code: failureCode(error) };
    booleanKeys.forEach((key) => { result[key] = raw[key] === true; });
    ["exact_returned_model_match", "reasoning_content_present", "refusal_present", "tool_calls_present"].forEach((key) => {
      if (typeof raw[key] === "boolean") result[key] = raw[key];
    });
    ["provider_http_status", "content_length", "prompt_tokens", "completion_tokens", "total_tokens", "reasoning_content_length"].forEach((key) => {
      if (raw[key] === null || Number.isInteger(raw[key])) result[key] = raw[key];
    });
    ["finish_reason", "content_type", "empty_response_classification"].forEach((key) => {
      if (typeof raw[key] === "string" && raw[key].length <= 128) result[key] = raw[key];
    });
    if (Array.isArray(raw.message_key_names) && raw.message_key_names.length <= 32
      && raw.message_key_names.every((key) => typeof key === "string" && key.length <= 128)) {
      result.message_key_names = [...raw.message_key_names];
    }
    ["frontend_contract_version", "backend_contract_version"].forEach((key) => {
      if (typeof raw[key] === "string" && raw[key].length <= 128) result[key] = raw[key];
    });
    return Object.freeze(result);
  }

  return Object.freeze({
    PROVIDER, MODEL, PROTOCOL, ADAPTER_VERSION, PROMPT_VERSION, ACTION_SCHEMA_VERSION, REQUEST_CONFIG_VERSION, REQUEST_CONTRACT,
    CAPABILITY_BASIS, CREDENTIAL_REF, RESULT_CONTRACT, RESULT_KEYS, CandidateWorkspaceConversationError,
    candidateContextIdFor, runtimeSession, resolveSession, createRuntimeSnapshot, latestWorkingModel,
    runtimeSignature, runtimeSignaturesMatch, validateRuntimeResult, createRuntimeRequest, verifiedAppliedAction, executeListTurn,
    resolutionVerificationsForAction, collectInternalIdentities, copyContainsInternalIdentity, humanSafeAction,
  });
}));
