"use strict";

(function attachCandidateConversationContextCompiler(root, factory) {
  const truth = root.AriadneTruthPersistence
    || (typeof module === "object" && module.exports ? require("./truth-persistence-domain.js") : null);
  const conversation = root.AriadneCandidateConversation
    || (typeof module === "object" && module.exports ? require("./candidate-conversation-domain.js") : null);
  const persistence = root.AriadneCandidateConversationPersistence
    || (typeof module === "object" && module.exports ? require("./candidate-conversation-persistence-domain.js") : null);
  const api = factory(truth, conversation, persistence);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AriadneCandidateConversationContextCompiler = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createCandidateConversationContextCompiler(Truth, Conversation, Persistence) {
  if (!Truth || !Conversation || !Persistence) throw new Error("candidate_conversation_context_compiler_dependency_required");

  const CONTRACT_ID = "ariadne-candidate-conversation-context-v1";
  const COMPILER_VERSION = "candidate-conversation-context-compiler-v2";
  const HISTORY_TURN_LIMIT = 8;
  const DEFAULT_MAX_SERIALIZED_BYTES = 64 * 1024;
  const FORBIDDEN_KEY = /(?:api[_-]?key|authorization|credential|access[_-]?token|refresh[_-]?token|raw[_-]?(?:pdf|response|http)|pdf[_-]?bytes|rendered[_-]?page|image[_-]?data)/i;
  const FORBIDDEN_VALUE = /(?:\bBearer\s+\S+|\b(?:sk|rk|pk|sess)-[A-Za-z0-9_-]{8,}|^data:(?:application|image)\/|%PDF)/i;

  class CandidateConversationContextError extends Error {
    constructor(code) { super(code); this.name = "CandidateConversationContextError"; this.code = code; }
  }

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); }
    catch (_error) { throw new CandidateConversationContextError("CONTEXT_NOT_JSON_SERIALIZABLE"); }
  }

  function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function boundedText(value, maximum) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text.length <= maximum ? text : `${text.slice(0, Math.max(0, maximum - 1))}…`;
  }

  function requiredString(value, code, maximum = 8000) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) throw new CandidateConversationContextError(code);
    return value.trim();
  }

  function assertSafe(value) {
    if (Array.isArray(value)) return value.forEach(assertSafe);
    if (isPlainObject(value)) {
      Object.entries(value).forEach(([key, nested]) => {
        if (FORBIDDEN_KEY.test(key)) throw new CandidateConversationContextError("CONTEXT_PRIVATE_MATERIAL_FORBIDDEN");
        assertSafe(nested);
      });
      return;
    }
    if (typeof value === "string" && FORBIDDEN_VALUE.test(value)) throw new CandidateConversationContextError("CONTEXT_PRIVATE_MATERIAL_FORBIDDEN");
  }

  function canonicalFact(fact) {
    if (!isPlainObject(fact) || !String(fact.fact_id || "").trim()) return null;
    return {
      fact_id: String(fact.fact_id).trim(),
      label: boundedText(fact.label, 160),
      value: boundedText(fact.value, 1000),
    };
  }

  function canonicalUncertainty(entry) {
    if (!isPlainObject(entry) || entry.status !== "OPEN" || !String(entry.uncertainty_id || "").trim()) return null;
    return {
      uncertainty_id: String(entry.uncertainty_id).trim(),
      question: boundedText(entry.question, 1000),
      affects: boundedText(entry.affects, 256),
      status: "OPEN",
    };
  }

  function canonicalGrounding(ref) {
    if (!isPlainObject(ref)) return null;
    const groundingId = ref.grounding_ref_id || ref.source_ref_id;
    if (!String(groundingId || "").trim()) return null;
    return {
      grounding_ref_id: String(groundingId).trim(),
      source_document_id: boundedText(ref.source_document_id, 256),
      location: boundedText(ref.location, 256),
      excerpt_or_reference: boundedText(ref.excerpt_or_reference, 1200),
    };
  }

  function canonicalItem(item) {
    if (!isPlainObject(item) || !String(item.item_id || "").trim()) throw new CandidateConversationContextError("CONTEXT_ITEM_INVALID");
    return {
      item_id: String(item.item_id).trim(),
      item_type: boundedText(item.item_type, 128),
      item_subtype: boundedText(item.item_subtype, 128),
      category: boundedText(item.category, 120),
      title: boundedText(item.title, 500),
      subtitle: boundedText(item.subtitle, 500),
      time: boundedText(item.time, 256),
      summary: boundedText(item.summary, 1600),
      ownership: boundedText(item.ownership, 1200),
      facts: (item.facts || []).map(canonicalFact).filter(Boolean).slice(0, 64),
      open_uncertainties: (item.uncertainties || []).map(canonicalUncertainty).filter(Boolean).slice(0, 32),
      grounding_refs: (item.grounding_refs || item.source_refs || []).map(canonicalGrounding).filter(Boolean).slice(0, 64),
    };
  }

  function directoryItem(item) {
    if (!isPlainObject(item) || !String(item.item_id || "").trim()) throw new CandidateConversationContextError("CONTEXT_ITEM_INVALID");
    return {
      item_id: String(item.item_id).trim(),
      item_type: boundedText(item.item_type, 128),
      title: boundedText(item.title, 300),
      identifying_summary: boundedText(item.summary || item.subtitle || item.time, 400),
    };
  }

  function compileCandidateData(workingModel, focus, draft) {
    const items = workingModel.payload.items || [];
    const active = focus.type === "CANDIDATE" ? null : items.find((item) => item.item_id === focus.item_id);
    if (focus.type !== "CANDIDATE" && !active) throw new CandidateConversationContextError("INVALID_TARGET");
    if (focus.type === "CANDIDATE") {
      return { target_mode: "CANDIDATE", candidate_items: items.map(canonicalItem), current_item: null, persisted_item: null, draft_item: null, draft_fingerprint: null, other_item_directory: [] };
    }
    const directory = items.filter((item) => item.item_id !== focus.item_id).map(directoryItem);
    if (focus.type === "ITEM") {
      return { target_mode: "ITEM", candidate_items: [], current_item: canonicalItem(active), persisted_item: null, draft_item: null, draft_fingerprint: null, other_item_directory: directory };
    }
    if (!isPlainObject(draft) || draft.item_id !== focus.item_id || draft.draft_fingerprint !== focus.draft_fingerprint || draft.item?.item_id !== focus.item_id) {
      throw new CandidateConversationContextError("STALE_WORKING_OBSERVATION");
    }
    return {
      target_mode: "CURRENT_TARGET_IS_DRAFT",
      candidate_items: [],
      current_item: null,
      persisted_item: canonicalItem(active),
      draft_item: canonicalItem(draft.item),
      draft_fingerprint: requiredString(draft.draft_fingerprint, "DRAFT_FINGERPRINT_INVALID", 80),
      other_item_directory: directory,
    };
  }

  function actionMatchesFocus(action, focus, observation) {
    if (focus.type === "CANDIDATE") return true;
    return action?.focus_snapshot?.item_id === focus.item_id
      && ["ITEM", "ITEM_DRAFT"].includes(action.focus_snapshot.type)
      && action?.observed_working_model?.working_model_id === observation.working_model_id
      && action?.observed_working_model?.version === observation.version
      && action?.observed_working_model?.fingerprint === observation.fingerprint;
  }

  function completeHistory(messages, actions, currentMessage, focus, observation, personalContext = null, historyBlockers = []) {
    const Delivery = globalThis.AriadneConversationOutput || (typeof module === "object" ? require("./conversation-output.js") : null);
    const relevantActions = (actions || []).filter((entry) => entry?.conversation_id === currentMessage.conversation_id && actionMatchesFocus(entry, focus, observation));
    const actionsByTurn = new Map(relevantActions.map((entry) => [entry.turn_id, entry]));
    const byTurn = new Map();
    (messages || []).forEach((raw) => {
      if (raw?.contract_id !== Persistence.MESSAGE_CONTRACT || raw.message_id === currentMessage.message_id) return;
      let message;
      try { message = Persistence.validateMessage(raw); } catch (_error) { return; }
      if (message.conversation_id !== currentMessage.conversation_id) return;
      const turn = byTurn.get(message.turn_id) || {};
      turn[message.role.toLowerCase()] = message;
      byTurn.set(message.turn_id, turn);
    });
    const complete = [...byTurn.entries()].filter(([turnId, pair]) => pair.user && pair.assistant
      && (focus.type === "CANDIDATE" || actionsByTurn.has(turnId))
      && !historyBlockers.some(blocker => blocker.origin?.turn_id === turnId || blocker.origin?.message_id === pair.user.message_id
        || blocker.human_quote && pair.user.created_at <= blocker.invalidated_at && pair.user.text.includes(blocker.human_quote))).map(([turnId, pair]) => ({
      turn_id: turnId,
      user: { message_id: pair.user.message_id, text: pair.user.text, created_at: pair.user.created_at },
      assistant: personalContext && pair.assistant.personal_context_token !== personalContext.source_token ? null
        : { message_id: pair.assistant.message_id, text: Delivery ? Delivery.historyText(pair.assistant).slice(0, 8000) : pair.assistant.text, created_at: pair.assistant.created_at,
          ...(personalContext ? { personal_context_token: pair.assistant.personal_context_token } : {}) },
      action_result: actionsByTurn.get(turnId)?.normalized_action ? {
        status: actionsByTurn.get(turnId).application_result.status,
        action: actionsByTurn.get(turnId).normalized_action.action,
        target_item_ids: (actionsByTurn.get(turnId).normalized_action.patches || []).map((patch) => patch.target_item_id),
      } : null,
    })).sort((left, right) => left.user.created_at.localeCompare(right.user.created_at) || left.turn_id.localeCompare(right.turn_id));
    const recent = complete.slice(-HISTORY_TURN_LIMIT);
    const latestAction = relevantActions.sort((left, right) => String(left.created_at).localeCompare(String(right.created_at))).at(-1);
    if (latestAction?.application_result?.status === "NEEDS_CLARIFICATION" && !recent.some((turn) => turn.turn_id === latestAction.turn_id)) {
      const clarificationTurn = complete.find((turn) => turn.turn_id === latestAction.turn_id);
      if (clarificationTurn) return { turns: [clarificationTurn, ...recent.slice(-(HISTORY_TURN_LIMIT - 1))].sort((left, right) => left.user.created_at.localeCompare(right.user.created_at)), total: complete.length };
    }
    return { turns: recent, total: complete.length };
  }

  function byteSize(value) {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  }

  function finalizeDiagnostics(context) {
    let prior = -1;
    for (let index = 0; index < 8; index += 1) {
      const size = byteSize(context);
      context.diagnostics.serialized_size_bytes = size;
      context.diagnostics.estimated_tokens = Math.ceil(size / 4);
      if (size === prior) break;
      prior = size;
    }
    return context;
  }

  function compileContext({ session: rawSession, working_model: rawWorking, observation, draft = null, messages = [], actions = [], current_user_message: rawCurrent, personal_context = null, personal_history_blockers = [], max_serialized_bytes: maxBytes = DEFAULT_MAX_SERIALIZED_BYTES }) {
    const session = Persistence.validateSession(rawSession);
    const working = Truth.validateCandidateWorkingModel(rawWorking);
    const current = Persistence.validateMessage(rawCurrent);
    if (current.role !== "USER" || current.conversation_id !== session.conversation_id || current.turn_id === "") throw new CandidateConversationContextError("CURRENT_MESSAGE_INVALID");
    if (!isPlainObject(observation) || observation.candidate_context_id !== session.subject_id || observation.working_model_id !== working.working_model_id
      || observation.version !== working.version || observation.fingerprint !== working.fingerprint) throw new CandidateConversationContextError("STALE_WORKING_OBSERVATION");
    const focus = Conversation.validateFocus(observation.focus, working);
    const candidateData = compileCandidateData(working, focus, draft);
    const historySelection = completeHistory(messages, actions, current, focus, observation, personal_context, personal_history_blockers);
    const history = historySelection.turns;
    const latestAction = (actions || []).filter((entry) => entry?.conversation_id === current.conversation_id && actionMatchesFocus(entry, focus, observation)).sort((left, right) => String(left.created_at).localeCompare(String(right.created_at))).at(-1);
    const protectedClarificationTurnId = latestAction?.application_result?.status === "NEEDS_CLARIFICATION" ? latestAction.turn_id : null;
    const openUncertainties = focus.type === "CANDIDATE"
      ? candidateData.candidate_items.flatMap((item) => item.open_uncertainties.map((entry) => ({ item_id: item.item_id, ...entry })))
      : (focus.type === "ITEM_DRAFT" ? candidateData.draft_item : candidateData.current_item).open_uncertainties.map((entry) => ({ item_id: focus.item_id, ...entry }));
    const context = {
      contract_id: CONTRACT_ID,
      compiler_version: personal_context ? "candidate-conversation-context-compiler-v3" : COMPILER_VERSION,
      conversation_subject: { conversation_id: session.conversation_id, subject_type: "CANDIDATE", candidate_context_id: session.subject_id, source_document_id: session.source_document_id },
      observed_working_model: { working_model_id: working.working_model_id, version: working.version, fingerprint: working.fingerprint },
      focus: clone(focus),
      candidate: candidateData,
      open_uncertainties: openUncertainties,
      bounded_history: history,
      current_user_message: { message_id: current.message_id, turn_id: current.turn_id, text: current.text, created_at: current.created_at },
      summary: null,
      ...(personal_context ? { personal_context: clone(personal_context) } : {}),
      diagnostics: {
        serialized_size_bytes: 0,
        estimated_tokens: 0,
        history_turn_count: history.length,
        candidate_item_count: (working.payload.items || []).length,
        focus_type: focus.type,
        compiler_version: personal_context ? "candidate-conversation-context-compiler-v3" : COMPILER_VERSION,
        history_turn_limit: HISTORY_TURN_LIMIT,
        trimmed_history_turn_count: Math.max(0, historySelection.total - history.length),
        trimmed_directory_item_count: 0,
      },
    };
    if (!Number.isInteger(maxBytes) || maxBytes < 1024) throw new CandidateConversationContextError("CONTEXT_LIMIT_INVALID");
    finalizeDiagnostics(context);
    while (context.diagnostics.serialized_size_bytes > maxBytes && context.candidate.other_item_directory.length) {
      context.candidate.other_item_directory.pop();
      context.diagnostics.trimmed_directory_item_count += 1;
      finalizeDiagnostics(context);
    }
    while (context.diagnostics.serialized_size_bytes > maxBytes && context.bounded_history.length) {
      const removableIndex = context.bounded_history.findIndex((turn) => turn.turn_id !== protectedClarificationTurnId);
      if (removableIndex < 0) break;
      context.bounded_history.splice(removableIndex, 1);
      context.diagnostics.trimmed_history_turn_count += 1;
      context.diagnostics.history_turn_count = context.bounded_history.length;
      finalizeDiagnostics(context);
    }
    if (context.diagnostics.serialized_size_bytes > maxBytes) throw new CandidateConversationContextError(personal_context?.memories?.length ? "PERSONAL_SAVED_CONTEXT_LIMIT" : "CONTEXT_LIMIT_EXCEEDED");
    assertSafe(context);
    return Object.freeze(clone(context));
  }

  return Object.freeze({
    CONTRACT_ID, COMPILER_VERSION, HISTORY_TURN_LIMIT, DEFAULT_MAX_SERIALIZED_BYTES,
    CandidateConversationContextError, canonicalItem, directoryItem, compileContext,
  });
}));
