import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createRequire } from "node:module";

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const require = createRequire(import.meta.url);
const Truth = require("../public/truth-persistence-domain.js");
const Conversation = require("../public/candidate-conversation-domain.js");
const Persistence = require("../public/candidate-conversation-persistence-domain.js");
const Compiler = require("../public/candidate-conversation-context-compiler.js");
const Review = require("../public/local-candidate-review-domain.js");
const Integration = require("../public/candidate-workspace-conversation-runtime.js");
const Gate = require("../public/runtime-capability-gate.js");
const Runtime = require("../public/runtime-capabilities.js");

function memoryDatabase() {
  const specs = new Map(Truth.STORE_SPECS.map((spec) => [spec.name, spec]));
  const records = new Map([...specs].map(([name]) => [name, new Map()]));
  return {
    records,
    transaction(storeNames) {
      const names = Array.isArray(storeNames) ? storeNames : [storeNames];
      const staged = new Map(names.map((name) => [name, new Map(records.get(name))]));
      let completionQueued = false;
      let aborted = false;
      const tx = {
        abort() {
          if (aborted) return;
          aborted = true;
          queueMicrotask(() => tx.onabort?.());
        },
        objectStore(name) {
          const spec = specs.get(name);
          assert(spec, `unknown memory store ${name}`);
          const values = staged.get(name);
          const scheduleComplete = () => {
            if (completionQueued) return;
            completionQueued = true;
            queueMicrotask(() => {
              if (aborted) return;
              names.forEach((storeName) => records.set(storeName, staged.get(storeName)));
              tx.oncomplete?.();
            });
          };
          return {
            add(value) {
              const key = value[spec.keyPath];
              if (values.has(key)) throw new Error("ConstraintError");
              values.set(key, structuredClone(value));
              scheduleComplete();
            },
            put(value) { values.set(value[spec.keyPath], structuredClone(value)); scheduleComplete(); },
            delete(key) { values.delete(key); scheduleComplete(); },
            get(key) {
              const request = {};
              queueMicrotask(() => {
                if (aborted) return;
                request.result = values.has(key) ? structuredClone(values.get(key)) : undefined;
                request.onsuccess?.();
              });
              return request;
            },
            getAll() {
              const request = {};
              queueMicrotask(() => {
                if (aborted) return;
                request.result = [...values.values()].map((value) => structuredClone(value));
                request.onsuccess?.();
              });
              return request;
            },
          };
        },
      };
      return tx;
    },
  };
}

const timestamp = (minute, second = 0) => `2026-09-03T10:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}Z`;
const working = Truth.validateCandidateWorkingModel({
  contract_id: "ariadne-candidate-working-model-v1",
  working_model_id: "synthetic-working-v3",
  source_document_id: "source-candidate-synthetic-persistence",
  processing_run_id: "run-synthetic-persistence",
  runtime_snapshot_id: "runtime-snapshot-synthetic-source",
  proposal_ids: ["proposal-synthetic-persistence"],
  version: 3,
  previous_working_model_id: "synthetic-working-v2",
  fingerprint: `sha256:${"a".repeat(64)}`,
  created_at: timestamp(0),
  payload: {
    contract_id: "ariadne-candidate-working-payload-v1",
    material_type: "resume",
    storage_debug_metadata: "must-not-enter-context",
    items: [
      {
        item_id: "item-work-001", item_type: "WORK", item_subtype: "employment", title: "Synthetic Designer",
        subtitle: "Synthetic Studio", time: "2022–2024", summary: "Synthetic work summary.", ownership: "Synthetic ownership.",
        facts: [{ fact_id: "fact-role-001", label: "Role", value: "Designer" }],
        grounding_refs: [{ grounding_ref_id: "ground-work-001", source_document_id: "source-candidate-synthetic-persistence", location: "synthetic:1", excerpt_or_reference: "Synthetic evidence only." }],
        uncertainties: [{ uncertainty_id: "uncertain-work-001", question: "Was this full-time?", affects: "fact-role-001", status: "OPEN" }, { uncertainty_id: "resolved-work-001", question: "Resolved", affects: "title", status: "RESOLVED" }],
        review_status: "NEEDS_REVIEW", item_version: 1, content_origin: "MODEL_PROPOSAL",
      },
      {
        item_id: "item-education-001", item_type: "EDUCATION", item_subtype: "degree", title: "Synthetic University",
        subtitle: "Synthetic programme", time: "2020–2022", summary: "Synthetic education summary.", ownership: null,
        facts: [{ fact_id: "fact-degree-001", label: "Degree", value: "Synthetic degree" }],
        grounding_refs: [],
        uncertainties: [{ uncertainty_id: "uncertain-education-001", question: "Exact month?", affects: "time", status: "OPEN" }],
        review_status: "NEEDS_REVIEW", item_version: 1, content_origin: "MODEL_PROPOSAL",
      },
    ],
  },
  authority: Truth.AUTHORITY.working,
});

const session = Persistence.createSession({ candidate_context_id: "synthetic-candidate-context-persistence", source_document_id: working.source_document_id, created_at: timestamp(1) });
const runtimeSession = Object.fromEntries(["contract_id", "conversation_id", "subject_type", "subject_id", "created_at"].map((key) => [key, session[key]]));
assert.equal(session.conversation_id, Conversation.conversationIdFor(session.subject_id));
const itemObservation = Conversation.createObservation({ candidate_context_id: session.subject_id, working_model: working, focus: { type: "ITEM", item_id: "item-work-001" } });
const candidateObservation = Conversation.createObservation({ candidate_context_id: session.subject_id, working_model: working, focus: { type: "CANDIDATE" } });
assert.equal(session.conversation_id, Persistence.createSession({ candidate_context_id: session.subject_id, source_document_id: working.source_document_id, created_at: timestamp(2) }).conversation_id);
assert.notDeepEqual(itemObservation.focus, candidateObservation.focus); // Focus never enters conversation identity.

const database = memoryDatabase();
const capturedRuntime = Integration.createRuntimeSnapshot({ snapshot_id: "runtime-snapshot-conversation", captured_at: timestamp(0) });
database.records.get("runtime_snapshots").set(capturedRuntime.snapshot_id, structuredClone(capturedRuntime));
database.records.get("candidate_working_models").set(working.working_model_id, structuredClone(working));
database.records.get("source_documents").set(working.source_document_id, { source_document_id: working.source_document_id });
await Persistence.ensureSession(database, session);

// USER survives a failed Provider turn; no fake ASSISTANT or CandidateAction is created.
const failedUser = Persistence.createUserMessage({ message_id: "message-user-failed", conversation_id: session.conversation_id, turn_id: "turn-failed", text: "Synthetic failed request.", created_at: timestamp(3) });
let failedExecution = Conversation.createTurnExecution({ execution_id: "turn-failed", session: runtimeSession, observation: candidateObservation, runtime_snapshot_id: "runtime-snapshot-conversation", generation: "generation-failed", created_at: timestamp(3) });
failedExecution = Conversation.transitionExecution(failedExecution, "SENDING", { at: timestamp(3, 1) });
await Persistence.persistUserTurn(database, { session, user_message: failedUser, turn: Persistence.turnRecord(failedExecution, { user_message_id: failedUser.message_id }) });
await assert.rejects(Persistence.persistUserTurn(database, { session, user_message: failedUser, turn: Persistence.turnRecord(failedExecution, { user_message_id: failedUser.message_id }) }), (error) => error.code === "DUPLICATE_MESSAGE_ID");
const concurrentUser = Persistence.createUserMessage({ message_id: "message-user-concurrent", conversation_id: session.conversation_id, turn_id: "turn-concurrent", text: "Synthetic concurrent request.", created_at: timestamp(3, 2) });
const concurrentExecution = Conversation.transitionExecution(Conversation.createTurnExecution({ execution_id: "turn-concurrent", session: runtimeSession, observation: candidateObservation, runtime_snapshot_id: "runtime-snapshot-conversation", generation: "generation-concurrent", created_at: timestamp(3, 2) }), "SENDING", { at: timestamp(3, 3) });
await assert.rejects(Persistence.persistUserTurn(database, { session, user_message: concurrentUser, turn: Persistence.turnRecord(concurrentExecution, { user_message_id: concurrentUser.message_id }) }), (error) => error.code === "CONVERSATION_TURN_ACTIVE");
failedExecution = Conversation.transitionExecution(failedExecution, "FAILED", { at: timestamp(3, 4), failure_code: "PROVIDER_TRANSPORT_ERROR" });
await Persistence.persistFailedTurn(database, Persistence.turnRecord(failedExecution, { user_message_id: failedUser.message_id }));
// B1 diagnostic telemetry is additive: a persisted Slice A turn has no such
// field and must still let an already-analysed source reopen without a write or
// migration.  The stored legacy record stays legacy; only the read projection
// is normalized.
const legacyFailedTurn = structuredClone(database.records.get("conversation_turn_executions").get(failedExecution.execution_id));
delete legacyFailedTurn.failure_diagnostics;
database.records.get("conversation_turn_executions").set(failedExecution.execution_id, legacyFailedTurn);
const legacyRestored = await Persistence.restoreConversation(database, session.conversation_id);
assert.equal(legacyRestored.turns[0].failure_diagnostics, null);
assert.equal(Object.hasOwn(database.records.get("conversation_turn_executions").get(failedExecution.execution_id), "failure_diagnostics"), false);
const duplicateTurnUser = Persistence.createUserMessage({ message_id: "message-user-duplicate-turn", conversation_id: session.conversation_id, turn_id: failedExecution.execution_id, text: "Synthetic duplicate turn id.", created_at: timestamp(3, 5) });
let duplicateTurnExecution = Conversation.createTurnExecution({ execution_id: failedExecution.execution_id, session: runtimeSession, observation: candidateObservation, runtime_snapshot_id: "runtime-snapshot-conversation", generation: "generation-duplicate-turn", created_at: timestamp(3, 5) });
duplicateTurnExecution = Conversation.transitionExecution(duplicateTurnExecution, "SENDING", { at: timestamp(3, 6) });
await assert.rejects(Persistence.persistUserTurn(database, { session, user_message: duplicateTurnUser, turn: Persistence.turnRecord(duplicateTurnExecution, { user_message_id: duplicateTurnUser.message_id }) }), (error) => error.code === "DUPLICATE_TURN_ID");
let restored = await Persistence.restoreConversation(database, session.conversation_id);
assert.deepEqual(restored.messages.map((message) => message.role), ["USER"]);
assert.equal(restored.turns[0].state, "FAILED");
assert.equal(restored.actions.length, 0);

// Validated Action + new Working head + terminal Turn + ASSISTANT are one transaction.
const user = Persistence.createUserMessage({ message_id: "message-user-applied", conversation_id: session.conversation_id, turn_id: "turn-applied", text: "把标题改成 Synthetic Product Designer。", created_at: timestamp(4) });
let execution = Conversation.createTurnExecution({ execution_id: "turn-applied", session: runtimeSession, observation: itemObservation, runtime_snapshot_id: "runtime-snapshot-conversation", generation: "generation-applied", created_at: timestamp(4) });
execution = Conversation.transitionExecution(execution, "SENDING", { at: timestamp(4, 1) });
await Persistence.persistUserTurn(database, { session, user_message: user, turn: Persistence.turnRecord(execution, { user_message_id: user.message_id }) });
execution = Conversation.transitionExecution(execution, "RECEIVED", { at: timestamp(4, 2) });
execution = Conversation.transitionExecution(execution, "VALIDATING", { at: timestamp(4, 3) });
const normalizedAction = {
  contract_id: Conversation.ACTION_CONTRACT_ID,
  action: "PATCH_ITEM",
  message: "Updated the synthetic title.",
  observed_working_model: Conversation.observedWorkingModel(itemObservation),
  patches: [{ target_item_id: "item-work-001", operations: [{ operation: "SET_ITEM_FIELD", field: "title", value: "Synthetic Product Designer" }], reason: "Synthetic correction.", origin: "MODEL_PROPOSAL", evidence_refs: [] }],
  clarification: null,
};
const outcome = await Conversation.applyExecutionResult({ execution, generation: "generation-applied", action: normalizedAction, session: runtimeSession, current_working_model: working, human_message: user.text, at: timestamp(4, 4) });
const actionRecord = await Persistence.createActionRecord({ action_id: "candidate-action-applied", conversation_id: session.conversation_id, turn_id: execution.execution_id, originating_user_message_id: user.message_id, observation: itemObservation, normalized_action: normalizedAction, application: outcome.application, working_model: working, human_message: user.text, created_at: timestamp(4, 4) });
const terminalTurn = Persistence.turnRecord(outcome.execution, { user_message_id: user.message_id, action_id: actionRecord.action_id, usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } });
const assistant = Persistence.createAssistantMessage({ message_id: "message-assistant-applied", conversation_id: session.conversation_id, turn_id: execution.execution_id, text: normalizedAction.message, provider: "deepseek", model: "deepseek-flash", runtime_snapshot_id: terminalTurn.runtime_snapshot_id, candidate_action_id: actionRecord.action_id, created_at: timestamp(4, 4) });
// Every accepted provider uses the captured runtime; a mismatch or missing
// snapshot must abort before any assistant/action/new Working is persisted.
for (const [provider, model] of [["deepseek", "deepseek-flash"], ["codex", "gpt-5.6-sol"]]) {
  const runtime = { mode: "model", provider, model };
  const descriptor = Gate.modelDescriptorForRuntime(runtime, "candidate_conversation");
  const captured = Runtime.createRuntimeSnapshot(runtime, {
    snapshotId: capturedRuntime.snapshot_id, capturedAt: timestamp(0),
    modelDescriptor: descriptor, credentialRef: Gate.credentialFor(runtime),
    adapterVersion: descriptor.adapter_version, promptVersion: Integration.PROMPT_VERSION,
    schemaVersion: Integration.ACTION_SCHEMA_VERSION, operation: Conversation.OPERATION,
    capabilityBasis: Integration.CAPABILITY_BASIS, actionSchemaVersion: Integration.ACTION_SCHEMA_VERSION,
    requestConfigVersion: Integration.REQUEST_CONFIG_VERSION, deliveryMethod: null,
  });
  for (const invalid of ["missing", "provider", "model", "operation", "snapshot-id", "text", "action-id", null]) {
    const isolated = memoryDatabase();
    for (const [name, records] of database.records) isolated.records.set(name, new Map([...records].map(([key, value]) => [key, structuredClone(value)])));
    isolated.records.get("runtime_snapshots").set(captured.snapshot_id, structuredClone(captured));
    const reply = { ...assistant, provider, model };
    const turn = structuredClone(terminalTurn);
    if (invalid === "missing") isolated.records.get("runtime_snapshots").delete(captured.snapshot_id);
    if (invalid === "provider") reply.provider = "wrong-provider";
    if (invalid === "model") reply.model = "wrong-model";
    if (invalid === "operation") isolated.records.get("runtime_snapshots").get(captured.snapshot_id).operation = "JOB_CONVERSATION_TURN";
    if (invalid === "snapshot-id") isolated.records.get("conversation_turn_executions").get(turn.execution_id).runtime_snapshot_id = "different-snapshot";
    if (invalid === "text") reply.text = "Unrelated output";
    if (invalid === "action-id") reply.candidate_action_id = "different-action";
    const bundle = { turn, action: actionRecord, assistant_message: reply, current_working_model: working, resulting_working_model: outcome.application.working_model };
    if (invalid) {
      await assert.rejects(Persistence.persistSuccessfulTurn(isolated, bundle));
      assert.equal(isolated.records.get("conversation_messages").has(reply.message_id), false);
      assert.equal(isolated.records.get("candidate_actions").has(actionRecord.action_id), false);
      assert.equal(isolated.records.get("candidate_working_models").has(outcome.application.working_model.working_model_id), false);
      assert.equal(isolated.records.get("conversation_turn_executions").get(turn.execution_id).state, "SENDING");
    } else {
      await Persistence.persistSuccessfulTurn(isolated, bundle);
      const reopened = await Persistence.restoreConversation(isolated, session.conversation_id);
      assert.equal(reopened.messages.at(-1).provider, provider);
      assert.equal(reopened.messages.at(-1).model, model);
      assert.equal(reopened.turns.at(-1).state, "APPLIED");
      assert.equal(isolated.records.get("candidate_context_revisions").size, 0);
    }
  }
}
await Persistence.persistSuccessfulTurn(database, { turn: terminalTurn, action: actionRecord, assistant_message: assistant, current_working_model: working, resulting_working_model: outcome.application.working_model });
assert(database.records.get("candidate_working_models").has(outcome.application.working_model.working_model_id));
assert.equal(database.records.get("candidate_actions").get(actionRecord.action_id).resulting_working_model_id, outcome.application.working_model.working_model_id);
assert.equal(database.records.get("conversation_turn_executions").get(execution.execution_id).state, "APPLIED");

// A stale atomic write produces no partial Action, Assistant, or new Working version.
const staleUser = Persistence.createUserMessage({ message_id: "message-user-stale", conversation_id: session.conversation_id, turn_id: "turn-stale", text: "Synthetic stale correction.", created_at: timestamp(5) });
let staleExecution = Conversation.createTurnExecution({ execution_id: "turn-stale", session: runtimeSession, observation: itemObservation, runtime_snapshot_id: "runtime-snapshot-conversation", generation: "generation-stale", created_at: timestamp(5) });
staleExecution = Conversation.transitionExecution(staleExecution, "SENDING", { at: timestamp(5, 1) });
await Persistence.persistUserTurn(database, { session, user_message: staleUser, turn: Persistence.turnRecord(staleExecution, { user_message_id: staleUser.message_id }) });
staleExecution = Conversation.transitionExecution(staleExecution, "RECEIVED", { at: timestamp(5, 2) });
staleExecution = Conversation.transitionExecution(staleExecution, "VALIDATING", { at: timestamp(5, 3) });
const staleOutcome = await Conversation.applyExecutionResult({ execution: staleExecution, generation: "generation-stale", action: normalizedAction, session: runtimeSession, current_working_model: working, human_message: staleUser.text, at: timestamp(5, 4) });
const staleAction = await Persistence.createActionRecord({ action_id: "candidate-action-stale", conversation_id: session.conversation_id, turn_id: staleExecution.execution_id, originating_user_message_id: staleUser.message_id, observation: itemObservation, normalized_action: normalizedAction, application: staleOutcome.application, working_model: working, human_message: staleUser.text, created_at: timestamp(5, 4) });
const staleTerminal = Persistence.turnRecord(staleOutcome.execution, { user_message_id: staleUser.message_id, action_id: staleAction.action_id });
const staleAssistant = Persistence.createAssistantMessage({ message_id: "message-assistant-stale", conversation_id: session.conversation_id, turn_id: staleExecution.execution_id, text: normalizedAction.message, provider: "deepseek", model: "deepseek-flash", runtime_snapshot_id: staleTerminal.runtime_snapshot_id, candidate_action_id: staleAction.action_id, created_at: timestamp(5, 4) });
await assert.rejects(Persistence.persistSuccessfulTurn(database, { turn: staleTerminal, action: staleAction, assistant_message: staleAssistant, current_working_model: working, resulting_working_model: staleOutcome.application.working_model }), (error) => error.code === "STALE_WORKING_OBSERVATION");
assert.equal(database.records.get("candidate_actions").has(staleAction.action_id), false);
assert.equal(database.records.get("conversation_messages").has(staleAssistant.message_id), false);
assert.equal(database.records.get("conversation_turn_executions").get(staleExecution.execution_id).state, "SENDING");
staleExecution = Conversation.transitionExecution(staleExecution, "FAILED", { at: timestamp(5, 5), failure_code: "STALE_WORKING_OBSERVATION" });
await Persistence.persistFailedTurn(database, Persistence.turnRecord(staleExecution, { user_message_id: staleUser.message_id }));

const diagnosticUser = Persistence.createUserMessage({ message_id: "message-user-diagnostic", conversation_id: session.conversation_id, turn_id: "turn-diagnostic", text: "Synthetic diagnostic instruction.", created_at: timestamp(6) });
let diagnosticExecution = Conversation.createTurnExecution({ execution_id: "turn-diagnostic", session: runtimeSession, observation: candidateObservation, runtime_snapshot_id: "runtime-snapshot-conversation", generation: "generation-diagnostic", created_at: timestamp(6) });
diagnosticExecution = Conversation.transitionExecution(diagnosticExecution, "SENDING", { at: timestamp(6, 1) });
await Persistence.persistUserTurn(database, { session, user_message: diagnosticUser, turn: Persistence.turnRecord(diagnosticExecution, { user_message_id: diagnosticUser.message_id }) });
diagnosticExecution = Conversation.transitionExecution(diagnosticExecution, "FAILED", {
  at: timestamp(6, 2), failure_code: "EMPTY_RESPONSE", failure_diagnostics: {
    stage: "PROVIDER_OUTPUT", error_code: "EMPTY_RESPONSE", provider_called: true, provider_response_received: true,
    json_parse_passed: false, semantic_schema_passed: false, resolution_passed: false, canonical_schema_passed: false,
    semantic_guard_passed: false, persistence_reached: false, provider_http_status: 200, exact_returned_model_match: true,
    finish_reason: "stop", content_type: "string", content_length: 0, empty_response_classification: "EMPTY_RESPONSE_ZERO_COMPLETION",
  },
});
await Persistence.persistFailedTurn(database, Persistence.turnRecord(diagnosticExecution, { user_message_id: diagnosticUser.message_id }));

// Refresh restore uses only durable stores and preserves order/linkage.
restored = await Persistence.restoreConversation(database, session.conversation_id);
assert.deepEqual(restored.messages.map((message) => message.message_id), ["message-user-failed", "message-user-applied", "message-assistant-applied", "message-user-stale", "message-user-diagnostic"]);
assert.equal(restored.actions[0].originating_user_message_id, user.message_id);
assert.equal(restored.actions[0].resulting_working_model_id, outcome.application.working_model.working_model_id);
assert.equal(restored.turns.find((turn) => turn.execution_id === "turn-applied").action_id, actionRecord.action_id);
assert.throws(() => Persistence.validateMessage({ ...terminalTurn }), (error) => error.code === "MESSAGE_SHAPE_INVALID"); // ExecutionEvent != ConversationMessage.

// Deterministic context compiler policies.
const historicalMessages = [];
for (let index = 0; index < 10; index += 1) {
  const turnId = `history-turn-${index}`;
  historicalMessages.push(Persistence.createUserMessage({ message_id: `history-user-${index}`, conversation_id: session.conversation_id, turn_id: turnId, text: `Synthetic history user ${index}`, created_at: timestamp(10 + index) }));
  historicalMessages.push(Persistence.createAssistantMessage({ message_id: `history-assistant-${index}`, conversation_id: session.conversation_id, turn_id: turnId, text: `Synthetic history assistant ${index}`, provider: "deepseek", model: "deepseek-flash", runtime_snapshot_id: "runtime-snapshot-conversation", candidate_action_id: `history-action-${index}`, created_at: timestamp(10 + index, 1) }));
}
const current = Persistence.createUserMessage({ message_id: "message-user-current", conversation_id: session.conversation_id, turn_id: "turn-current", text: "Current synthetic instruction must survive trimming.", created_at: timestamp(30) });
const candidateContext = Compiler.compileContext({ session, working_model: working, observation: candidateObservation, messages: historicalMessages, current_user_message: current });
assert.equal(candidateContext.candidate.candidate_items.length, 2);
assert.deepEqual(candidateContext.open_uncertainties.map((entry) => entry.uncertainty_id).sort(), ["uncertain-education-001", "uncertain-work-001"]);
assert.equal(candidateContext.bounded_history.length, 10);
assert.equal(candidateContext.bounded_history[0].turn_id, "history-turn-0");
assert.equal(candidateContext.diagnostics.trimmed_history_turn_count, 0);
assert.equal(candidateContext.current_user_message.text, current.text);
assert.deepEqual(candidateContext.observed_working_model, { working_model_id: working.working_model_id, version: working.version, fingerprint: working.fingerprint });
assert.equal(candidateContext.diagnostics.candidate_item_count, 2);
assert.equal(new TextEncoder().encode(JSON.stringify(candidateContext)).length, candidateContext.diagnostics.serialized_size_bytes);
const clarificationPriority = Compiler.compileContext({
  session, working_model: working, observation: candidateObservation, messages: historicalMessages, current_user_message: current,
  actions: [{ conversation_id: session.conversation_id, turn_id: "history-turn-0", created_at: timestamp(29), application_result: { status: "NEEDS_CLARIFICATION" } }],
});
assert(clarificationPriority.bounded_history.some((turn) => turn.turn_id === "history-turn-0"));

const itemContext = Compiler.compileContext({ session, working_model: working, observation: itemObservation, messages: [], current_user_message: current });
assert.equal(itemContext.candidate.current_item.item_id, "item-work-001");
assert.equal(itemContext.candidate.other_item_directory[0].item_id, "item-education-001");
assert(!("facts" in itemContext.candidate.other_item_directory[0]));
assert.deepEqual(itemContext.open_uncertainties.map((entry) => entry.uncertainty_id), ["uncertain-work-001"]);

// ITEM context carries history only for the currently open Candidate Material.
// The full durable conversation remains available for Human-visible history,
// while unrelated material bodies are not sent to the Provider.
const switchedMaterialMessages = [
  Persistence.createUserMessage({ message_id: "history-user-work", conversation_id: session.conversation_id, turn_id: "history-turn-work", text: "Synthetic work question.", created_at: timestamp(20) }),
  Persistence.createAssistantMessage({ message_id: "history-assistant-work", conversation_id: session.conversation_id, turn_id: "history-turn-work", text: "Synthetic work answer.", provider: "deepseek", model: "deepseek-flash", runtime_snapshot_id: "runtime-snapshot-conversation", candidate_action_id: "history-action-work", created_at: timestamp(20, 1) }),
  Persistence.createUserMessage({ message_id: "history-user-education", conversation_id: session.conversation_id, turn_id: "history-turn-education", text: "Synthetic education question.", created_at: timestamp(21) }),
  Persistence.createAssistantMessage({ message_id: "history-assistant-education", conversation_id: session.conversation_id, turn_id: "history-turn-education", text: "Synthetic education answer.", provider: "deepseek", model: "deepseek-flash", runtime_snapshot_id: "runtime-snapshot-conversation", candidate_action_id: "history-action-education", created_at: timestamp(21, 1) }),
];
const switchedMaterialActions = [
  { conversation_id: session.conversation_id, turn_id: "history-turn-work", created_at: timestamp(20, 1), focus_snapshot: { type: "ITEM", item_id: "item-work-001" }, observed_working_model: { working_model_id: working.working_model_id, version: working.version, fingerprint: working.fingerprint }, application_result: { status: "APPLIED" } },
  { conversation_id: session.conversation_id, turn_id: "history-turn-education", created_at: timestamp(21, 1), focus_snapshot: { type: "ITEM", item_id: "item-education-001" }, observed_working_model: { working_model_id: working.working_model_id, version: working.version, fingerprint: working.fingerprint }, application_result: { status: "APPLIED" } },
];
const switchedItemContext = Compiler.compileContext({ session, working_model: working, observation: itemObservation, messages: switchedMaterialMessages, actions: switchedMaterialActions, current_user_message: current });
assert.deepEqual(switchedItemContext.bounded_history.map((turn) => turn.turn_id), ["history-turn-work"]);
assert.equal(switchedItemContext.diagnostics.history_turn_count, 1);

const draftItem = { ...structuredClone(working.payload.items[0]), title: "Unsaved synthetic title" };
const draft = { item_id: draftItem.item_id, item: draftItem, draft_fingerprint: await Conversation.draftFingerprintFor(draftItem) };
const draftObservation = Conversation.createObservation({ candidate_context_id: session.subject_id, working_model: working, focus: { type: "ITEM_DRAFT", item_id: draft.item_id, draft_fingerprint: draft.draft_fingerprint } });
const draftContext = Compiler.compileContext({ session, working_model: working, observation: draftObservation, draft, messages: [], current_user_message: current });
assert.equal(draftContext.candidate.target_mode, "CURRENT_TARGET_IS_DRAFT");
assert.equal(draftContext.candidate.persisted_item.title, working.payload.items[0].title);
assert.equal(draftContext.candidate.draft_item.title, draftItem.title);
assert.equal(draftContext.candidate.draft_fingerprint, draft.draft_fingerprint);

const serializedContext = JSON.stringify(candidateContext);
assert(!serializedContext.includes("storage_debug_metadata"));
assert(!serializedContext.includes("processing_run_id"));
assert(!serializedContext.includes("%PDF"));
assert(!serializedContext.includes("credential"));
assert.throws(() => Compiler.compileContext({ session, working_model: working, observation: itemObservation, messages: historicalMessages, current_user_message: Persistence.createUserMessage({ message_id: "message-user-large", conversation_id: session.conversation_id, turn_id: "turn-large", text: "X".repeat(8000), created_at: timestamp(31) }), max_serialized_bytes: 1024 }), (error) => error.code === "CONTEXT_LIMIT_EXCEEDED");

// Source hard delete cascades durable conversation records. Remove Card remains a separate item-only operation.
const recordsForDelete = Object.fromEntries([...database.records].map(([name, values]) => [name, [...values.values()].map((value) => structuredClone(value))]));
const deletePlan = Review.sourceHardDeletePlan(recordsForDelete, working.source_document_id);
assert.deepEqual(deletePlan.conversation_sessions, [session.conversation_id]);
assert(deletePlan.conversation_messages.includes(user.message_id));
assert(deletePlan.conversation_turn_executions.includes(execution.execution_id));
assert(deletePlan.candidate_actions.includes(actionRecord.action_id));
await Review.persistSourceHardDelete(database, working.source_document_id);
assert.equal(database.records.get("conversation_sessions").size, 0);
assert.equal(database.records.get("conversation_messages").size, 0);
assert.equal(database.records.get("conversation_turn_executions").size, 0);
assert.equal(database.records.get("candidate_actions").size, 0);

const cardStorage = {
  candidates: new Map([["item-only", { item_id: "item-only" }]]),
  conversations: new Map([["conversation-kept", { conversation_id: "conversation-kept" }]]),
  async get(store, key) { return this[store].get(key); },
  async remove(store, key) { this[store].delete(key); },
};
await Review.removeLegacyContext(cardStorage, "candidates", "item-only");
assert(cardStorage.conversations.has("conversation-kept"));

console.log("candidate_conversation_persistence_context=pass");
