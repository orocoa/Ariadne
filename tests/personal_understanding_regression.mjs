import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Truth = require("../public/truth-persistence-domain.js");
const Memory = require("../public/personal-memory-domain.js");
const Context = require("../public/personal-context-domain.js");
const Candidate = require("../public/job-candidate-context-domain.js");
const CandidateCards = require("../public/personal-candidate-card-domain.js");
const Understanding = require("../public/personal-understanding-domain.js");

function databaseFor(input = {}) {
  const specs = new Map([...Truth.STORE_SPECS, { name: "career_entities", keyPath: "entity_id" }, { name: "career_evidence", keyPath: "evidence_id" }].map((entry) => [entry.name, entry.keyPath]));
  const data = new Map([...specs].map(([name]) => [name, new Map((input[name] || []).map((entry) => [entry[specs.get(name)], structuredClone(entry)]))]));
  return {
    data, objectStoreNames: { contains: (name) => data.has(name) },
    transaction(names, mode = "readonly") {
      const stores = Array.isArray(names) ? names : [names];
      const pending = new Map(stores.map((name) => [name, new Map(data.get(name))]));
      let count = 0, timer, aborted = false;
      const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { if (aborted || count) return; if (mode === "readwrite") pending.forEach((records, name) => data.set(name, records)); tx.oncomplete?.(); }, 0); };
      const tx = {
        abort() { aborted = true; clearTimeout(timer); queueMicrotask(() => tx.onabort?.()); },
        objectStore(name) {
          return {
            get(key) { const request = {}; count++; queueMicrotask(() => { request.result = pending.get(name).get(key); request.onsuccess?.(); count--; schedule(); }); return request; },
            getAll() { const request = {}; count++; queueMicrotask(() => { request.result = [...pending.get(name).values()].map((entry) => structuredClone(entry)); request.onsuccess?.(); count--; schedule(); }); return request; },
            add(entry) { if (pending.get(name).has(entry[specs.get(name)])) { tx.error = Object.assign(new Error("duplicate"), { name: "ConstraintError" }); tx.abort(); return; } pending.get(name).set(entry[specs.get(name)], structuredClone(entry)); schedule(); },
            put(entry) { pending.get(name).set(entry[specs.get(name)], structuredClone(entry)); schedule(); },
          };
        },
      };
      return tx;
    },
  };
}
function revision(index, summary = `Synthetic research evidence ${index}`) {
  return { contract_id: "ariadne-context-revision-v1", context_type: "CANDIDATE", context_id: `context-${index}`, revision_id: `revision-${index}-1`, version: 1,
    previous_revision_id: null, created_at: "2026-09-09T08:00:00Z", confirmed_from_proposal_id: `proposal-${index}`, review_decision_id: `decision-${index}`,
    provenance: { source_document_ids: [`source-${index}`], processing_run_id: `run-${index}`, runtime_snapshot_id: "runtime-source" },
    authority: Truth.AUTHORITY.revision, payload: { items: [{ item_id: `item-${index}`, item_type: "PROJECT", title: `Synthetic project ${index}`, summary,
      facts: [{ label: "Role", value: "Research and evaluation; deployment by colleagues" }], uncertainties: [], grounding_refs: [] }] } };
}
const runtime = Understanding.runtimeSnapshot({ getItem: (key) => key === "job-radar-selected-runtime" ? JSON.stringify({ mode: "model", provider: "deepseek", model: "deepseek-flash" }) : null });
if (process.argv.includes("--request")) {
  console.log(JSON.stringify(Understanding.requestFor("DISCUSS", {
    candidate: { confirmed: [], working: [], policy: "Human Save required" }, memories: [], history: [], overview: null,
    coverage: { total_records: 0, included_records: 0, complete: true },
  }, "我更喜欢远程协作。", runtime, true)));
  process.exit(0);
}
assert.throws(() => Understanding.runtimeSnapshot({ getItem: () => JSON.stringify({ mode: "local" }) }), /runtime_capability/);
assert.throws(() => Understanding.requestFor("DISCUSS", {}, "x", runtime, false), /CONSENT_REQUIRED/);
const calls = [];
let discussionOutput = { message: "这是可审阅的补充，确认保存后才会用于之后的分析。", proposals: [], card_proposals: [] };
async function stub(request) {
  calls.push(structuredClone(request));
  let output;
  if (request.phase === "DISTILL") output = { summaries: request.context.evidence.map((entry) => ({ ref: entry.ref, summary: `${entry.title}：由模型替身生成的资料摘要。` })) };
  else if (request.phase === "SYNTHESIZE") output = { summary: "模型替身：这些资料包含研究与评估经历。", insights: [{ text: "模型替身：经历之间可能互补。", evidence_refs: [request.context.evidence[0].ref] }], uncertainties: ["模型替身：跨项目责任需要校准。"] };
  else output = structuredClone(discussionOutput);
  return { contract_id: Understanding.Contract.result_contract, request_id: request.request_id, phase: request.phase, runtime_snapshot_id: request.runtime_snapshot.snapshot_id,
    provider: runtime.provider, model: runtime.model, output, usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 },
    authority: "NON_AUTHORITATIVE_PERSONAL_UNDERSTANDING", network_call_made: true, persistence: "not_written" };
}
const db = databaseFor({ candidate_context_revisions: [revision(1), revision(2)] });
const options = { runtime_snapshot: runtime, consent: true, call: stub };
const uncached = databaseFor({ candidate_context_revisions: [revision(90)] });
const beforeDirect = calls.length;
const direct = await Understanding.discuss(uncached, { ...options, human_message: "请根据当前资料回答，不需要先重建画像。" });
assert.equal(direct.turn.calls, 1);
assert.equal(calls.at(-1).request_id, direct.turn.turn_id, "the stored discussion and attachment request share one exact identity");
assert.deepEqual(calls.slice(beforeDirect).map(item => item.phase), ["DISCUSS"], "uncached discussion must not wait for DISTILL/SYNTHESIZE");
assert.equal(uncached.data.get("personal_understanding_snapshots").size, 0);
assert.equal(uncached.data.get("candidate_context_revisions").size, 1);
const continuity = [
  { status: "SUCCEEDED", human_message: "星桥是我自己发起并独立负责的项目。", output: { message: "请补充细节。" }, source_fingerprint: "old" },
  ...Array.from({ length: 6 }, (_, index) => ({ status: "SUCCEEDED", human_message: `继续讨论 ${index}`, output: { message: "长回复。".repeat(1500) }, source_fingerprint: "old" })),
];
const history = Context.boundedHistory(continuity, 10000, { assistantCurrent: () => false });
assert(history.some(item => item.human === continuity[0].human_message), "long answers and more than four turns cannot erase earlier Human statements");
assert(history.every(item => !item.assistant));
assert(Context.bytes(history) <= 10000);
assert.equal(Context.boundedHistory([{status:"FAILED",human_message:"之前提交的自述",output:null}])[0].human,"之前提交的自述");
const extreme = Context.boundedHistory(Array.from({length:60},()=>({status:"SUCCEEDED",human_message:"中文".repeat(3000),output:{message:"回复".repeat(3000)}})));
assert(Context.bytes(extreme)<=10000);assert(extreme.every(item=>item.human_truncated));
const first = await Understanding.refresh(db, options);
assert.equal(first.calls, 2);
assert.equal(first.snapshot.personal_understanding.covered_records, 2);
assert.equal((await Understanding.refresh(db, options)).calls, 0, "unchanged sources must reuse a current overview without a model call");
const cachedPortrait = [...db.data.get("personal_understanding_snapshots").values()][0];
db.data.get("personal_understanding_snapshots").set(cachedPortrait.understanding_id, { ...cachedPortrait, prompt_version: "obsolete-prompt" });
assert.equal((await Candidate.buildSnapshotFromDatabase(db)).personal_understanding, null, "old compiler prompts cannot supply current understanding");
db.data.get("personal_understanding_snapshots").set(cachedPortrait.understanding_id, cachedPortrait);
db.data.get("candidate_context_revisions").set("revision-3-1", revision(3));
assert.equal((await Candidate.buildSnapshotFromDatabase(db)).personal_understanding, null, "stale overview must never leak to a new query");
const added = await Understanding.refresh(db, options);
assert.equal(added.snapshot.personal_understanding.refreshed_fragments, 1);
assert.equal(added.snapshot.personal_understanding.reused_fragments, 2);

const statement = "我更喜欢远程协作。";
discussionOutput.proposals = [{ operation: "ADD", kind: "PREFERENCE", text: statement, reason: "当前用户明确陈述了偏好。", human_quote: statement, target_memory_ref: null, related_refs: [] }];
const discussed = await Understanding.discuss(db, { ...options, human_message: statement });
assert.equal(db.data.get("personal_memory_revisions").size, 0, "discussion must not confirm memory");
assert.equal(discussed.proposals.length, 1);
const accepted = await Memory.decide(db, discussed.proposals[0].proposal_id, "SAVE");
const acceptedOriginal = structuredClone(accepted.revision);
const savedSnapshot = await Candidate.buildSnapshotFromDatabase(db);
assert(savedSnapshot.provider_view.confirmed.some((entry) => entry.item_type === "PERSONAL_MEMORY" && entry.summary === statement), "new JD/candidate snapshot must include saved preference");
assert.equal(savedSnapshot.personal_understanding, null);
const changedHistory = Understanding.discussionContext(savedSnapshot, "偏好", [accepted.revision], [discussed.turn]).context.history;
assert.equal(changedHistory[0].human, statement, "source changes preserve actual Human utterances for continuity");
assert.equal(changedHistory[0].assistant, undefined, "source changes exclude obsolete assistant reasoning");
assert.equal((await Understanding.refresh(db, options)).snapshot.personal_understanding.refreshed_fragments, 1);
await assert.rejects(Memory.decide(db, discussed.proposals[0].proposal_id, "SAVE"), /already_decided/);

const rawChange = { operation: "REPLACE", kind: "PREFERENCE", text: "我更喜欢现场协作。", reason: "用户修正偏好。", human_quote: "我更喜欢现场协作。", target_memory_ref: "memory-current", related_refs: [] };
const proposalOptions = { human_message: rawChange.text, origin: { type: "PERSONAL" }, memories: [{ ...accepted.revision, ref: "memory-current" }] };
const replaceA = Memory.createProposal(rawChange, proposalOptions), replaceB = Memory.createProposal(rawChange, proposalOptions);
await Memory.write(db, "personal_memory_proposals", replaceA); await Memory.write(db, "personal_memory_proposals", replaceB);
const updated = await Memory.decide(db, replaceA.proposal_id, "SAVE");
await assert.rejects(Memory.decide(db, replaceB.proposal_id, "SAVE"), /version_conflict/);
assert.deepEqual(db.data.get("personal_memory_revisions").get(accepted.revision.revision_id), acceptedOriginal);
assert.equal(Memory.active(await Memory.getAll(db, "personal_memory_revisions"))[0].version, 2);
await Memory.decide(db, replaceB.proposal_id, "REJECT");
assert.equal(db.data.get("personal_memory_revisions").size, 2);

const current = await Candidate.buildSnapshotFromDatabase(db);
const evidence = Context.records(current).filter((entry) => entry.semantic.item_type !== "PERSONAL_MEMORY");
const correction = { operation: "ADD", kind: "CORRECTION", text: "部署由同事负责。", reason: "澄清本人责任。", human_quote: "部署由同事负责。", target_memory_ref: null, related_refs: [evidence[0].ref] };
const anchored = Memory.createProposal(correction, { human_message: correction.text, origin: { type: "JOB", message_id: "synthetic-message" }, evidence });
await Memory.write(db, "personal_memory_proposals", anchored);
await Memory.decide(db, anchored.proposal_id, "SAVE");
const duplicate = Memory.createProposal(correction, { human_message: correction.text, origin: {}, evidence });
await Memory.write(db, "personal_memory_proposals", duplicate);
await assert.rejects(Memory.decide(db, duplicate.proposal_id, "SAVE"), /already_saved/);
const anchoredRevision = Memory.active(await Memory.getAll(db, "personal_memory_revisions")).find((entry) => entry.kind === "CORRECTION");
const anchoredEdit = Memory.createProposal({ ...correction, operation: "REPLACE", related_refs: [], target_memory_ref: "target" }, { human_message: correction.text, origin: {}, memories: [{ ...anchoredRevision, ref: "target" }], evidence });
assert.deepEqual(anchoredEdit.evidence_bindings, anchoredRevision.evidence_bindings, "editing text must retain the source version binding");
assert((await Candidate.buildSnapshotFromDatabase(db)).provider_view.confirmed.some((entry) => entry.memory_kind === "CORRECTION" && entry.related_candidate_refs.length === 1));
const concurrent = Memory.createProposal(correction, { human_message: correction.text, origin: {}, evidence });
await Memory.write(db, "personal_memory_proposals", concurrent);
const next = revision(1, "Updated responsibility evidence"); next.version = 2; next.revision_id = "revision-1-2";
db.data.get("candidate_context_revisions").set(next.revision_id, next);
await assert.rejects(Memory.decide(db, concurrent.proposal_id, "SAVE"), /evidence_changed/);
assert(!(await Candidate.buildSnapshotFromDatabase(db)).provider_view.confirmed.some((entry) => entry.memory_kind === "CORRECTION"), "a memory grounded in changed evidence must become inactive until re-reviewed");
assert.throws(() => Memory.createProposal({ ...correction, human_quote: "not actually said" }, { human_message: correction.text, origin: {}, evidence }), /quote_not_in_user_message/);
assert.throws(() => Memory.createProposal({ ...correction, related_refs: ["invented-evidence"] }, { human_message: correction.text, origin: {}, evidence }), /evidence_invalid/);

const cardDb = databaseFor();
const cardStatement = "请把 Ariadne 新增为项目资料卡；这是我负责产品设计和实现的个人项目。";
discussionOutput = { message: "我已整理出一张待审阅的项目资料卡。", proposals: [], card_proposals: [{
  operation: "CREATE", target_candidate_ref: null, item_type: "PROJECT", category: "个人项目", title: "Ariadne", subtitle: null, time: null,
  summary: "帮助理解个人资料与目标职位。", ownership: "产品设计和实现", facts: [{ label: "项目性质", value: "个人项目" }], uncertainties: [],
  reason: "用户明确要求新增项目资料卡。", source_quotes: [cardStatement], related_refs: [],
}] };
const cardTurn = await Understanding.discuss(cardDb, { ...options, human_message: cardStatement });
assert.equal(cardTurn.card_proposals.length, 1);
assert.equal(cardDb.data.get("candidate_context_revisions").size, 0, "model card proposal must remain non-authoritative before Human Save");
assert.equal(CandidateCards.pending([...cardDb.data.get("context_proposals").values()]).length, 1);
const cardProposal = cardTurn.card_proposals[0];
const cardItem = cardProposal.payload.items[0];
await CandidateCards.decide(cardDb, cardProposal.proposal_id, "SAVE", { ...cardItem, facts: cardItem.facts });
const cardSnapshot = await Candidate.buildSnapshotFromDatabase(cardDb);
assert(cardSnapshot.provider_view.confirmed.some((entry) => entry.item_type === "PROJECT" && entry.title === "Ariadne"));
assert.equal(CandidateCards.pending([...cardDb.data.get("context_proposals").values()]).length, 0);
const savedSource = [...cardDb.data.get("source_documents").values()].find((entry) => entry.contract_id === "ariadne-source-document-v1");
assert.equal(savedSource.provenance.captured_via, "PERSONAL_UNDERSTANDING_CONVERSATION");
const updateStatement = "把 Ariadne 项目卡的负责内容改为产品定义、交互设计和核心实现。";
discussionOutput = { message: "我已生成待审阅的资料卡修改。", proposals: [], card_proposals: [{
  operation: "UPDATE", target_candidate_ref: "confirmed-candidate-1", item_type: "PROJECT", category: "个人项目", title: "Ariadne", subtitle: null, time: null,
  summary: "帮助理解个人资料与目标职位。", ownership: "产品定义、交互设计和核心实现", facts: [{ label: "项目性质", value: "个人项目" }], uncertainties: [],
  reason: "用户明确修改负责内容。", source_quotes: [updateStatement], related_refs: ["confirmed-candidate-1"],
}] };
const updateTurn = await Understanding.discuss(cardDb, { ...options, human_message: updateStatement });
assert.equal(updateTurn.card_proposals[0].payload.operation, "UPDATE");
const updateItem = updateTurn.card_proposals[0].payload.items[0];
const updatedOutcome = await CandidateCards.decide(cardDb, updateTurn.card_proposals[0].proposal_id, "SAVE", { ...updateItem, facts: updateItem.facts });
assert.equal(updatedOutcome.revision.version, 2);
assert.equal(updatedOutcome.revision.payload.items[0].ownership, "产品定义、交互设计和核心实现");
assert.equal(cardDb.data.get("candidate_context_revisions").size, 2, "card update appends a revision and preserves the original");
discussionOutput = { message: "这是可审阅的补充，确认保存后才会用于之后的分析。", proposals: [], card_proposals: [] };
const forget = Memory.createProposal({ ...rawChange, operation: "RETRACT", target_memory_ref: "memory-current" }, { ...proposalOptions, memories: [{ ...updated.revision, ref: "memory-current" }] });
await Memory.write(db, "personal_memory_proposals", forget); await Memory.decide(db, forget.proposal_id, "SAVE");
assert(!(await Candidate.buildSnapshotFromDatabase(db)).provider_view.confirmed.some((entry) => entry.memory_kind === "PREFERENCE"));
assert.equal(db.data.get("candidate_context_revisions").size, 4, "memory changes never rewrite source cards");

const large = await Candidate.buildSnapshot({ candidate_context_revisions: Array.from({ length: 90 }, (_, index) => revision(index + 20, "研究与产品设计。".repeat(800))) });
const selected = Context.select(large, "产品设计的责任与成果");
assert(selected.context_coverage.omitted_records > 0);
assert(selected.context_coverage.truncated_records > 0);
assert(Context.bytes(selected.provider_view) < 26000);
assert.equal(selected.context_coverage.complete, false);
const fullSummary = "完整项目经历。".repeat(420) + "结尾保留：部署由同事完成。";
const smallCollection = await Candidate.buildSnapshot({ candidate_context_revisions: [revision(201, fullSummary), revision(202)] });
const completeSelection = Context.select(smallCollection, "一个没有命中标题的问题");
assert(Context.bytes(smallCollection.provider_view.confirmed[0]) > 6000);
assert.equal(completeSelection.context_coverage.strategy, "COMPLETE_CURRENT_EVIDENCE");
assert.equal(completeSelection.context_coverage.complete, true);
assert.deepEqual(completeSelection.provider_view, smallCollection.provider_view, "small collections preserve full details, references and confirmation layers without ranking or excerpting");
assert(completeSelection.provider_view.confirmed.some(entry => entry.summary === fullSummary));
const limitedSelection = Context.select(smallCollection, "项目", 2000);
assert.equal(limitedSelection.context_coverage.complete, false, "the full-content path never exceeds a caller's smaller evidence budget");
assert(limitedSelection.context_coverage.evidence_bytes <= 2000);
assert.equal(Context.runtimeIdentity(runtime), JSON.stringify([runtime.provider, runtime.model, runtime.protocol, runtime.execution_settings?.connection_id, runtime.execution_settings?.descriptor_revision, runtime.execution_settings?.settings_schema_version, runtime.execution_settings?.effective_settings]), "shared identity preserves existing cache keys");
const directory = Context.catalog(large);
assert(directory.records.length > 0);
assert.equal(directory.total_records,90);
assert(Context.bytes(directory) <= 8000);
const parts = Context.splitText("中文😀".repeat(6000));
assert.equal(parts.join(""), "中文😀".repeat(6000));
assert(parts.every((part) => Context.bytes(part) <= 6000));
const longDb = databaseFor({ candidate_context_revisions: [revision(111, "完整的长项目责任材料。".repeat(800))] });
const beforeLongMemory = await Candidate.buildSnapshotFromDatabase(longDb);
discussionOutput.proposals = [{ ...correction, related_refs: ["confirmed-candidate-1"] }];
const longTurn = await Understanding.discuss(longDb, { ...options, human_message: correction.text });
assert.equal(longTurn.turn.context_coverage.truncated_records, 1);
await Memory.decide(longDb, longTurn.proposals[0].proposal_id, "SAVE");
assert((await Candidate.buildSnapshotFromDatabase(longDb)).provider_view.confirmed.some((entry) => entry.memory_kind === "CORRECTION"), "long source excerpts must still bind complete local evidence for Save");
const longMemory = Memory.active(await Memory.getAll(longDb, "personal_memory_revisions"))[0];
const retractLong = Memory.createProposal({ ...correction, operation: "RETRACT", related_refs: [], target_memory_ref: "target" }, { human_message: correction.text, origin: {}, memories: [{ ...longMemory, ref: "target" }] });
await Memory.write(longDb, "personal_memory_proposals", retractLong);
await Memory.decide(longDb, retractLong.proposal_id, "SAVE");
const afterLongRetraction = await Candidate.buildSnapshotFromDatabase(longDb);
assert.deepEqual(afterLongRetraction.provider_view, beforeLongMemory.provider_view);
assert.notEqual(afterLongRetraction.aggregate_fingerprint, beforeLongMemory.aggregate_fingerprint, "returning to an old active evidence set must not reactivate old portraits or conversations after retraction");
assert.equal(Understanding.discussionContext(afterLongRetraction, "继续", await Memory.getAll(longDb,"personal_memory_revisions"),[longTurn.turn]).context.history.length,0,"retracted memory must not resurrect through its origin chat turn");

const staleDb = databaseFor({ candidate_context_revisions: [revision(10)] });
await assert.rejects(Understanding.refresh(staleDb, { ...options, call: async (request) => {
  const result = await stub(request);
  if (request.phase === "SYNTHESIZE") staleDb.data.get("candidate_context_lifecycle").set("removed", { context_id: "context-10", item_id: "item-10", state: "REMOVED", authority: Truth.AUTHORITY.lifecycle });
  return result;
} }), /PERSONAL_CONTEXT_CHANGED/);
assert.equal(staleDb.data.get("personal_understanding_snapshots").size, 0);
assert.equal(staleDb.data.get("candidate_context_revisions").size, 1);
const racing = databaseFor({ candidate_context_revisions: [revision(12)] });
await assert.rejects(Understanding.discuss(racing,{...options,human_message:"继续解释",call:async request=>{
  const result=await stub(request);
  racing.data.get("candidate_context_lifecycle").set("removed",{context_id:"context-12",item_id:"item-12",state:"REMOVED",authority:Truth.AUTHORITY.lifecycle});
  return result;
}}),/PERSONAL_CONTEXT_CHANGED/);
assert.equal(racing.data.get("personal_memory_proposals").size,0);
assert.equal([...racing.data.get("personal_conversation_turns").values()][0].status,"FAILED");
const unavailable=databaseFor();
await assert.rejects(Understanding.discuss(unavailable,{...options,human_message:"我独立做了一个项目",call:async()=>{throw new Error("synthetic_offline");}}),/synthetic_offline/);
assert.equal(unavailable.data.get("personal_memory_revisions").size,0);
assert.equal([...unavailable.data.get("personal_conversation_turns").values()][0].status,"FAILED");
const delivered = {kind:"PDF",title:"合成介绍文件",body:"来自本轮对话的草稿内容。",nodes:[],edges:[]};
const fileDb = databaseFor();
discussionOutput = {message:"文件如下。",proposals:[],card_proposals:[]};
const fileTurn = await Understanding.discuss(fileDb,{...options,human_message:"制作介绍文件",call:async request=>({...await stub(request),deliverable:delivered,delivery_version:"ariadne-conversation-delivery-v1"})});
assert.deepEqual(fileTurn.turn.output.deliverable,delivered);
assert.deepEqual([...fileDb.data.get("personal_conversation_turns").values()][0].output.deliverable,delivered);
assert.equal(fileDb.data.get("candidate_context_revisions").size,0);
assert.equal(fileDb.data.get("personal_memory_revisions").size,0);
assert.match(Context.boundedHistory([fileTurn.turn])[0].assistant,/合成介绍文件/);
console.log(JSON.stringify({ cache_and_invalidation: "pass", human_save_version_boundary: "pass", source_grounding: "pass", bounded_context: "pass", immutable_history: "pass", live_provider_calls: 0 }));
