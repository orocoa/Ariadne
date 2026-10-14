"use strict";

(function attach(root, factory) {
  const dep = (name, file) => root[name] || (typeof module === "object" ? require(file) : null);
  const api = factory(dep("AriadnePersonalUnderstandingContract", "../data/personal_understanding_contract_v1.json"),
    dep("AriadnePersonalMemory", "./personal-memory-domain.js"), dep("AriadnePersonalContext", "./personal-context-domain.js"),
    dep("AriadneJobCandidateContext", "./job-candidate-context-domain.js"), dep("AriadneRuntimeExecution", "./runtime-capabilities.js"), dep("JobRadarRuntimeGate", "./runtime-capability-gate.js"),
    dep("AriadnePersonalCandidateCards", "./personal-candidate-card-domain.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AriadnePersonalUnderstanding = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function create(Contract, Memory, Context, Candidate, Runtime, Gate, CandidateCards) {
  const clone = (value) => structuredClone(value);
  const Delivery = globalThis.AriadneConversationOutput || (typeof module === "object" ? require("./conversation-output.js") : null);
  function signature() {
    return Object.fromEntries(["contract_id", "request_contract", "result_contract", "operation", "adapter_version", "prompt_version", "request_config_version"].map((key) => [key, Contract[key]]));
  }
  function runtimeSnapshot(storage = globalThis.localStorage) {
    const gate = Gate.requireOperation("personal_understanding", Gate.operationAuthority("personal_understanding", storage));
    const descriptor = Gate.modelDescriptorForRuntime(gate.authority.runtime, "personal_understanding");
    return Runtime.createRuntimeSnapshot(gate.authority.runtime, {
      modelDescriptor: descriptor, snapshotId: Memory.id("runtime-personal"), capturedAt: Memory.now(),
      credentialRef: Gate.credentialFor(gate.authority.runtime), adapterVersion: descriptor.adapter_version,
      promptVersion: Contract.prompt_version, schemaVersion: Contract.contract_id, operation: Contract.operation,
      capabilityBasis: "adapter_verified", actionSchemaVersion: Contract.contract_id,
      requestConfigVersion: Contract.request_config_version, deliveryMethod: "compiled_context_text",
    });
  }
  function requestFor(phase, context, humanMessage, snapshot, consent) {
    if (!Contract.phases.includes(phase) || Context.bytes(context) > Contract.limits.context_bytes) throw new Error("PERSONAL_CONTEXT_LIMIT");
    if (!consent || snapshot.mode !== "model" || !Gate.isModelRuntimeEligible({ mode: snapshot.mode, provider: snapshot.provider, model: snapshot.model })) throw new Error("PERSONAL_CONSENT_REQUIRED");
    return { contract_id: Contract.request_contract, request_id: Memory.id("personal-request"), phase,
      context: clone(context), human_message: humanMessage, runtime_snapshot: snapshot,
      consent: { confirmed: true, purpose: "PERSONAL_UNDERSTANDING", provider: snapshot.provider, model: snapshot.model } };
  }
  async function callRuntime(request) {
    const check = await (globalThis.AriadneTransport || globalThis).fetch("/api/personal-understanding-signature", { cache: "no-store" });
    const payload = await check.json();
    if (!check.ok || !Memory.same(payload.runtime_signature, signature())) throw new Error("RUNTIME_CONTRACT_VERSION_MISMATCH");
    const transport = globalThis.AriadneConversationTurnTransport;
    if (!transport) throw new Error("CONVERSATION_TURN_TRANSPORT_UNAVAILABLE");
    return transport.execute({ request, domain: "PERSONAL", endpoint: "/api/personal-understanding-turn",
      fallback_error: "PERSONAL_PROVIDER_FAILED" });
  }
  function validateResult(result, request) {
    if (result?.contract_id !== Contract.result_contract || result.request_id !== request.request_id || result.phase !== request.phase
      || result.runtime_snapshot_id !== request.runtime_snapshot.snapshot_id || result.provider !== request.runtime_snapshot.provider || result.model !== request.runtime_snapshot.model
      || result.network_call_made !== true || result.persistence !== "not_written" || result.authority !== "NON_AUTHORITATIVE_PERSONAL_UNDERSTANDING" || !result.output) throw new Error("PERSONAL_RESULT_INVALID");
    return result.output;
  }
  async function fragmentsFor(snapshot, runtimeIdentity) {
    const fragments = [];
    for (const entry of Context.records(snapshot)) {
      const parts = Context.splitText(JSON.stringify(entry.semantic), Contract.limits.fragment_bytes);
      for (let index = 0; index < parts.length; index++) fragments.push({
        fragment_id: `personal-fragment-${(await Candidate.fingerprint({ identity: entry.identity, semantic_hash: entry.semantic_hash, part: index, prompt: Contract.prompt_version, runtime_identity: runtimeIdentity })).slice(7)}`,
        identity: entry.identity, semantic_hash: entry.semantic_hash, title: entry.semantic.title,
        part_index: index, part_count: parts.length, text: parts[index], source_availability: entry.semantic.source_availability,
      });
    }
    return fragments;
  }
  const batches = Context.batches;
  function overviewFor(snapshot) {
    const value = snapshot.personal_understanding;
    if (!value || value.source_fingerprint !== snapshot.aggregate_fingerprint) return null;
    return { authority: "NON_AUTHORITATIVE_PERSONAL_UNDERSTANDING", summary: value.summary,
      insights: value.insights.map((entry) => ({ text: entry.text })), uncertainties: value.uncertainties,
      covered_records: value.covered_records };
  }
  async function refresh(database, { runtime_snapshot, consent, call = callRuntime, onProgress = () => {} } = {}) {
    const snapshot = await Candidate.buildSnapshotFromDatabase(database);
    const runtimeIdentity = Context.runtimeIdentity(runtime_snapshot);
    if (snapshot.personal_understanding?.runtime_identity === runtimeIdentity) return { snapshot, calls: 0, usage: {}, cached: true };
    const fragments = await fragmentsFor(snapshot, runtimeIdentity);
    if (!fragments.length) return { snapshot, calls: 0, usage: {}, cached: true };
    const stored = await Memory.getAll(database, "personal_understanding_fragments");
    const cache = new Map(stored.filter((entry) => entry.prompt_version === Contract.prompt_version && entry.authority === "NON_AUTHORITATIVE_PERSONAL_DIGEST").map((entry) => [entry.fragment_id, entry]));
    const missing = fragments.filter((entry) => !cache.has(entry.fragment_id));
    const usage = {}; let calls = 0;
    const run = async (phase, context) => {
      const request = requestFor(phase, context, "", runtime_snapshot, consent);
      const result = await call(request); const output = validateResult(result, request); calls++;
      for (const key of ["prompt_tokens", "completion_tokens", "total_tokens"]) usage[key] = (usage[key] || 0) + (result.usage?.[key] || 0);
      return output;
    };
    const groups = batches(missing.map((entry) => ({ ...entry, ref: entry.fragment_id })));
    for (let index = 0; index < groups.length; index++) {
      onProgress(`正在理解新增或变化的资料（${index + 1}/${groups.length}）…`);
      const group = groups[index];
      const evidence = group.map((entry, part) => ({ ref: `fragment-${part + 1}`, title: entry.title, part: entry.part_index + 1, total_parts: entry.part_count, text: entry.text }));
      const output = await run("DISTILL", { evidence });
      if (!Array.isArray(output.summaries) || output.summaries.length !== group.length || new Set(output.summaries.map((entry) => entry.ref)).size !== group.length) throw new Error("PERSONAL_COVERAGE_INCOMPLETE");
      for (let part = 0; part < group.length; part++) {
        const found = output.summaries.find((entry) => entry.ref === `fragment-${part + 1}`);
        const record = { fragment_id: group[part].fragment_id, identity: group[part].identity, semantic_hash: group[part].semantic_hash,
          part_index: group[part].part_index, part_count: group[part].part_count, summary: Memory.text(found?.summary, 600),
          prompt_version: Contract.prompt_version, created_at: Memory.now(), authority: "NON_AUTHORITATIVE_PERSONAL_DIGEST" };
        // Concurrent refreshes may have cached the same immutable fragment.
        try { await Memory.write(database, "personal_understanding_fragments", record); }
        catch (error) { if (error?.name !== "ConstraintError") throw error; }
        cache.set(record.fragment_id, record);
      }
    }
    const digests = fragments.map((entry, index) => ({ ref: `digest-${index + 1}`, title: entry.title, summary: cache.get(entry.fragment_id).summary }));
    let understanding = null;
    const digestGroups = batches(digests, 14000, 30);
    for (let index = 0; index < digestGroups.length; index++) {
      onProgress(`正在综合当前资料（${index + 1}/${digestGroups.length}）…`);
      const allowed = new Set([...digestGroups[index].map((entry) => entry.ref), ...(understanding?.insights || []).flatMap((entry) => entry.evidence_refs)]);
      const output = await run("SYNTHESIZE", { evidence: digestGroups[index], previous: understanding, traversal: { part: index + 1, total_parts: digestGroups.length } });
      Memory.text(output.summary, 2400);
      if (!Array.isArray(output.insights) || output.insights.length > 8 || !Array.isArray(output.uncertainties) || output.uncertainties.length > 8) throw new Error("PERSONAL_OUTPUT_INVALID");
      for (const insight of output.insights) {
        Memory.text(insight.text, 600);
        if (!Array.isArray(insight.evidence_refs) || !insight.evidence_refs.length || insight.evidence_refs.length > 8 || insight.evidence_refs.some((ref) => !allowed.has(ref))) throw new Error("PERSONAL_GROUNDING_INVALID");
      }
      output.uncertainties.forEach((entry) => Memory.text(entry, 400));
      understanding = output;
    }
    const fresh = await Candidate.buildSnapshotFromDatabase(database);
    if (!Candidate.observationsMatch(snapshot, fresh)) throw new Error("PERSONAL_CONTEXT_CHANGED");
    const record = {
      understanding_id: Memory.id("personal-understanding"), source_fingerprint: snapshot.aggregate_fingerprint,
      authority: "NON_AUTHORITATIVE_PERSONAL_UNDERSTANDING", prompt_version: Contract.prompt_version, created_at: Memory.now(), summary: understanding.summary,
      insights: understanding.insights.map((entry) => ({ text: entry.text, evidence: entry.evidence_refs.map((ref) => {
        const index = digests.findIndex((item) => item.ref === ref); const item = fragments[index];
        return { identity: item.identity, semantic_hash: item.semantic_hash, title: item.title };
      }) })), uncertainties: understanding.uncertainties, covered_records: Context.records(snapshot).length,
      covered_fragments: fragments.length, refreshed_fragments: missing.length, reused_fragments: fragments.length - missing.length,
      provider: runtime_snapshot.provider, model: runtime_snapshot.model, runtime_identity: runtimeIdentity, calls, usage,
    };
    await Memory.write(database, "personal_understanding_snapshots", record);
    return { snapshot: { ...fresh, personal_understanding: record }, calls, usage, cached: false };
  }
  function discussionContext(snapshot, humanMessage, memories, turns) {
    const memoryHeads = new Map(Memory.latest(memories).map(entry => [entry.memory_id, entry]));
    const activeIds = new Set(Context.records(snapshot).map(entry => entry.identity));
    const obsolete = memories.filter(entry => {
      const head = memoryHeads.get(entry.memory_id);
      return head && (entry.revision_id !== head.revision_id || head.status === "RETRACTED" || !activeIds.has(`memory:${entry.memory_id}`));
    });
    // Retraction/replacement/source invalidation must not resurrect the same
    // claim through its original chat turn. Visible history is not deleted.
    const conversationalTurns = turns.filter(turn => !obsolete.some(entry => entry.origin?.turn_id === turn.turn_id
      || (entry.human_quote && turn.created_at <= memoryHeads.get(entry.memory_id).created_at && turn.human_message?.includes(entry.human_quote))));
    let budget = Contract.limits.evidence_bytes, selected, context, localMemories;
    do {
      selected = Context.select(snapshot, humanMessage, budget);
      const refs = new Set(Context.records(selected).map((entry) => entry.identity));
      localMemories = Memory.active(memories).filter((entry) => refs.has(`memory:${entry.memory_id}`)).map((entry, index) => ({ ...entry, ref: `memory-${index + 1}` }));
      context = { candidate: selected.provider_view, overview: overviewFor(snapshot), coverage: selected.context_coverage,
        catalog: Context.catalog(snapshot),
        memories: localMemories.map((entry) => ({ ref: entry.ref, kind: entry.kind, text: entry.text })),
        history: Context.boundedHistory(conversationalTurns, 10000, { assistantCurrent: turn => turn.source_fingerprint === snapshot.aggregate_fingerprint }),
        history_policy: "Human words are conversational self-reports, not saved facts. Older assistant conclusions are omitted when evidence changes. Current corrections take precedence; do not treat omission as denial." };
      budget -= 2000;
    } while (Context.bytes(context) > Contract.limits.context_bytes && budget >= 2000);
    if (Context.bytes(context) > Contract.limits.context_bytes) throw new Error("PERSONAL_CONTEXT_LIMIT");
    return { context, selected, memories: localMemories };
  }
  async function discuss(database, { human_message, runtime_snapshot, consent, origin = { type: "PERSONAL" }, call = callRuntime, onProgress = () => {} }) {
    const humanMessage = Memory.text(human_message, Contract.limits.human_message);
    const turn = { turn_id: Memory.id("personal-turn"), kind: "DISCUSSION", created_at: Memory.now(), human_message: humanMessage, origin: clone(origin), status: "SENDING", output: null };
    await Memory.write(database, "personal_conversation_turns", turn);
    try {
      // Ordinary discussion reads current evidence directly. Rebuilding the
      // entire derived portrait is an explicit refresh operation, not a toll
      // charged before every question after a source/settings change.
      onProgress("正在读取当前资料与对话…");
      const snapshot = await Candidate.buildSnapshotFromDatabase(database);
      const runtimeIdentity = Context.runtimeIdentity(runtime_snapshot);
      const [memories, turns] = await Promise.all([Memory.getAll(database, "personal_memory_revisions"), Memory.getAll(database, "personal_conversation_turns")]);
      const compiled = discussionContext({ ...snapshot, personal_understanding: snapshot.personal_understanding?.runtime_identity === runtimeIdentity ? snapshot.personal_understanding : null }, humanMessage, memories, turns.sort((a, b) => a.created_at.localeCompare(b.created_at)));
      onProgress("正在结合个人资料回应…");
      const request = { ...requestFor("DISCUSS", compiled.context, humanMessage, runtime_snapshot, consent), request_id: turn.turn_id };
      const result = await call(request); const output = validateResult(result, request);
      Memory.text(output.message, 6000);
      if (!Array.isArray(output.proposals) || output.proposals.length > 4 || !Array.isArray(output.card_proposals) || output.card_proposals.length > Contract.limits.card_proposals_per_turn) throw new Error("PERSONAL_OUTPUT_INVALID");
      const fresh = await Candidate.buildSnapshotFromDatabase(database);
      if (!Candidate.observationsMatch(snapshot, fresh)) throw new Error("PERSONAL_CONTEXT_CHANGED");
      const selectedRefs = new Set(Context.records(compiled.selected).map((entry) => entry.ref));
      const proposals = output.proposals.map((entry) => Memory.createProposal(entry, { human_message: humanMessage,
        origin: { ...origin, turn_id: turn.turn_id }, memories: compiled.memories,
        // Provider excerpts are bounded, but Save must bind the complete local
        // evidence version, not compare an excerpt to the full source later.
        evidence: Context.records(snapshot).filter((item) => selectedRefs.has(item.ref) && item.semantic.item_type !== "PERSONAL_MEMORY") }));
      const preparedCards = await CandidateCards.prepare(database, { raw_proposals: output.card_proposals, human_message: humanMessage,
        context: compiled.context, snapshot, runtime_snapshot, turn_id: turn.turn_id });
      const completed = { ...turn, runtime_snapshot: clone(runtime_snapshot), status: "SUCCEEDED", output: { message: output.message, deliverable: Delivery.fromResult(result), web_search: Delivery.searchFromResult(result) }, source_fingerprint: snapshot.aggregate_fingerprint,
        context_coverage: compiled.selected.context_coverage, context_bytes: Context.bytes(compiled.context),
        calls: 1, refresh_usage: {}, usage: result.usage || {}, proposal_ids: proposals.map((entry) => entry.proposal_id), card_proposal_ids: preparedCards.proposals.map((entry) => entry.proposal_id) };
      await new Promise((resolve, reject) => {
        const cardStores = preparedCards.proposals.length ? [...(preparedCards.runtime_snapshot ? ["runtime_snapshots"] : []), "processing_runs", "context_proposals"] : [];
        const tx = database.transaction(["personal_conversation_turns", "personal_memory_proposals", ...cardStores], "readwrite");
        tx.objectStore("personal_conversation_turns").put(completed);
        proposals.forEach((entry) => tx.objectStore("personal_memory_proposals").add(entry));
        if (preparedCards.proposals.length) {
          if (preparedCards.runtime_snapshot) tx.objectStore("runtime_snapshots").add(clone(preparedCards.runtime_snapshot));
          tx.objectStore("processing_runs").add(clone(preparedCards.processing_run));
          preparedCards.proposals.forEach((entry) => tx.objectStore("context_proposals").add(clone(entry)));
        }
        tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error || new Error("personal_turn_write_failed"));
      });
      return { turn: completed, proposals, card_proposals: preparedCards.proposals, snapshot: fresh };
    } catch (error) {
      await Memory.write(database, "personal_conversation_turns", { ...turn, status: "FAILED", error_code: String(error?.message || "PERSONAL_FAILED").slice(0, 100) }, { replace: true });
      throw error;
    }
  }
  return Object.freeze({ Contract, signature, runtimeSnapshot, requestFor, callRuntime, validateResult, fragmentsFor, batches, overviewFor, refresh, discussionContext, discuss });
}));
