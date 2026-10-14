// Independent acceptance: saved Human corrections across production request builders.
// Synthetic data only. Stub results prove transport/persistence boundaries, not AI quality.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { databaseFor } from './helpers/resume-task-fixtures.mjs';

const require = createRequire(import.meta.url);
const Truth = require('../public/truth-persistence-domain.js');
const Memory = require('../public/personal-memory-domain.js');
const Candidate = require('../public/job-candidate-context-domain.js');
const Context = require('../public/personal-context-domain.js');
const Understanding = require('../public/personal-understanding-domain.js');
const Overview = require('../public/job-overview-domain.js');
const Integration = require('../public/candidate-workspace-conversation-runtime.js');
const Conversation = require('../public/candidate-conversation-domain.js');
const Job = require('../public/job-context-domain.js');
const JobConversation = require('../public/job-conversation-domain.js');
const JobPersistence = require('../public/job-conversation-persistence-domain.js');
const Retrieval = require('../public/source-retrieval-domain.js');

export const correction1 = '桥木项目更正：访谈实际为11人。我负责研究计划、访谈和交互原型；工程部署由同事负责，原材料40%增长数字已撤回，不能作为我的成果。';
export const correction2 = '桥木项目最新更正：有效访谈实际为13人。我负责研究计划、访谈和交互原型；工程部署由同事负责，原材料40%增长数字已撤回，不能作为我的成果。';
export const unsaved = '桥木项目我又想改成27人，但这条只是待审阅提案，尚未保存。';
export const unrelated = '南岬项目更正：我只做图形编排，没有参与招募。UNRELATED_SCOPE_MARKER';
export const query = '依据当前记录，怎样准确介绍这次调研经历里我做的部分、样本规模和成果？请指出材料与已保存补充的冲突，不要替我补未知事实。';
export const synonymQuery = '如果面试官问这段经历的贡献、受访者人数和落地责任，我应该怎么说明？哪些数字需要避免？';
let sequence = 0;
const next = prefix => `${prefix}-consistency-${++sequence}`;
const at = '2026-10-14T03:00:00.000Z';
const selectedRuntime = { mode: 'model', provider: 'deepseek', model: 'deepseek-flash' };
const storage = { getItem: key => key === 'job-radar-selected-runtime' ? JSON.stringify(selectedRuntime) : null };

export async function fixture({ long = true, state = 'saved' } = {}) {
  const source = Truth.validateSourceDocument({ contract_id: 'ariadne-source-document-v1', source_document_id: 'synthetic-consistency-source',
    source_type: 'TXT', filename: 'synthetic-consistency.txt', label: '合成资料', mime_type: 'text/plain', content_hash: 'sha256:' + 'a'.repeat(64),
    created_at: at, material_type: 'CANDIDATE', local_reference: 'synthetic-reference', batch_id: null, provenance: { synthetic: true }, authority: Truth.AUTHORITY.source });
  const target = { item_id: 'synthetic-consistency-target', item_type: 'PROJECT', item_subtype: 'project', category: '研究', title: '桥木研究项目', subtitle: null, time: '2025',
    summary: (long ? 'Synthetic context about a research archive and interview notes. '.repeat(120) : '')
      + '原材料声称18人访谈、本人完成工程部署、带来40%增长。尾部证据：只有研究和交互原型试点，没有正式生产交付。FULL_RELATED_EVIDENCE_TAIL',
    ownership: '旧材料声称研究、工程部署与增长', facts: [{ fact_id: 'synthetic-consistency-fact', label: '原材料样本规模', value: '18人' }],
    grounding_refs: [{ grounding_ref_id: 'synthetic-consistency-ground', source_document_id: source.source_document_id, location: '合成原件尾部', excerpt_or_reference: '旧材料表述保留供冲突分析' }],
    uncertainties: [], review_status: 'ACCEPTED', item_version: 1, content_origin: 'USER_SELECTED' };
  const other = { ...target, item_id: 'synthetic-consistency-other', title: '南岬图形项目', summary: '无关资料；其他经历不会混入当前卡片。', ownership: '招募与图形编排', facts: [], grounding_refs: [] };
  const payload = { contract_id: 'ariadne-candidate-working-payload-v1', material_type: 'resume', items: [target, other] };
  const working = Truth.validateCandidateWorkingModel({ contract_id: 'ariadne-candidate-working-model-v1', working_model_id: 'synthetic-consistency-working',
    source_document_id: source.source_document_id, processing_run_id: 'synthetic-consistency-run', runtime_snapshot_id: 'synthetic-consistency-original-runtime',
    proposal_ids: ['synthetic-consistency-original-proposal'], version: 1, previous_working_model_id: null, fingerprint: await Candidate.fingerprint(payload),
    created_at: at, payload, authority: Truth.AUTHORITY.working });
  const revision = Truth.validateContextRevision({ contract_id: 'ariadne-context-revision-v1', context_type: 'CANDIDATE', context_id: 'synthetic-consistency-context',
    revision_id: 'synthetic-consistency-revision-1', version: 1, previous_revision_id: null, created_at: at,
    confirmed_from_proposal_id: 'synthetic-consistency-original-proposal', review_decision_id: 'synthetic-consistency-original-decision',
    provenance: { source_document_ids: [source.source_document_id], processing_run_id: working.processing_run_id, runtime_snapshot_id: working.runtime_snapshot_id },
    payload: { items: [target, other] }, authority: Truth.AUTHORITY.revision });
  const extra = long ? Array.from({ length: 5 }, (_, i) => ({ ...revision, context_id: `synthetic-filler-${i}`, revision_id: `synthetic-filler-revision-${i}`,
    provenance: { ...revision.provenance, source_document_ids: [`synthetic-filler-source-${i}`] }, payload: { items: [{ ...other, item_id: `synthetic-filler-item-${i}`, title: `Synthetic unrelated archive ${i}`, summary: 'Unrelated historical study context. '.repeat(200) }] } })) : [];
  const jobProposal = Job.proposalFor({ source: { source_document_id: 'synthetic-consistency-job-source' }, artifact: { payload: { extracted_text: '用户研究设计师\n合成公司\n上海\n任职要求\n- 研究计划、访谈和交互原型；工程部署由工程师负责' } }, structuring_run: { run_id: 'synthetic-consistency-job-run', runtime_snapshot_id: 'synthetic-consistency-job-runtime' } });
  const job = Job.reviewOutcome({ proposal: jobProposal, decision: 'CONFIRM' }).revision;
  const acceptance = Truth.validateCandidateWorkspaceAcceptance({ contract_id: 'ariadne-candidate-workspace-acceptance-v1', acceptance_id: 'synthetic-consistency-acceptance',
    context_id: revision.context_id, source_document_id: source.source_document_id, processing_run_id: working.processing_run_id, runtime_snapshot_id: working.runtime_snapshot_id,
    proposal_ids: working.proposal_ids, working_model_id: working.working_model_id, working_model_version: working.version, working_model_fingerprint: working.fingerprint,
    accepted_at: at, confirmed_revision_id: revision.revision_id, previous_revision_id: null, accepted_payload: working.payload, authority: Truth.AUTHORITY.workspace_acceptance });
  const input = { source_documents: [source], candidate_context_revisions: [revision, ...extra], candidate_working_models: [working],
    candidate_workspace_acceptances: [acceptance], job_context_revisions: [job] };
  const db = databaseFor(input);
  async function addSaved(text, itemId) {
    const snapshot = await Candidate.buildSnapshotFromDatabase(db);
    const evidence = Context.records(snapshot).filter(entry => entry.identity === `canonical:${revision.context_id}:${itemId}`);
    assert.equal(evidence.length, 1);
    const proposal = Memory.createProposal({ operation: 'ADD', kind: 'CORRECTION', text, human_quote: text, reason: '合成用户明确纠正原材料', target_memory_ref: null, related_refs: [evidence[0].ref] },
      { human_message: text, origin: { type: 'PERSONAL', turn_id: next('synthetic-origin') }, evidence });
    await Memory.write(db, 'personal_memory_proposals', proposal);
    const saved = await Memory.decide(db, proposal.proposal_id, 'SAVE');
    return saved.revision;
  }
  const saved1 = await addSaved(correction1, target.item_id);
  const related = await addSaved(unrelated, other.item_id);
  const replace = Memory.createProposal({ operation: 'REPLACE', kind: 'CORRECTION', text: correction2, human_quote: correction2, reason: '合成用户确认最新人数', target_memory_ref: 'memory-current', related_refs: [] },
    { human_message: correction2, origin: { type: 'PERSONAL', turn_id: next('synthetic-origin') }, memories: [{ ...saved1, ref: 'memory-current' }], evidence: [] });
  await Memory.write(db, 'personal_memory_proposals', replace);
  const saved2 = (await Memory.decide(db, replace.proposal_id, 'SAVE')).revision;
  const currentSnapshot = await Candidate.buildSnapshotFromDatabase(db);
  const pending = Memory.createProposal({ operation: 'REPLACE', kind: 'CORRECTION', text: unsaved, human_quote: unsaved, reason: '合成未保存提案', target_memory_ref: 'memory-current', related_refs: [] },
    { human_message: unsaved, origin: { type: 'PERSONAL', turn_id: 'synthetic-unrelated-unsaved-chat' }, memories: [{ ...saved2, ref: 'memory-current' }], evidence: [] });
  await Memory.write(db, 'personal_memory_proposals', pending);
  if (state === 'retracted') {
    const proposal = Memory.createProposal({ operation: 'RETRACT', kind: 'CORRECTION', text: correction2, human_quote: '停止使用这条更正', reason: '合成用户撤回', target_memory_ref: 'memory-current', related_refs: [] },
      { human_message: '停止使用这条更正', origin: { type: 'PERSONAL' }, memories: [{ ...saved2, ref: 'memory-current' }], evidence: [] });
    await Memory.write(db, 'personal_memory_proposals', proposal); await Memory.decide(db, proposal.proposal_id, 'SAVE');
  } else if (state === 'invalidated') {
    const changed = { ...revision, revision_id: 'synthetic-consistency-revision-2', version: 2, previous_revision_id: revision.revision_id,
      payload: { items: [{ ...target, ownership: '用户更新后的当前资料', summary: '当前资料已替换；旧更正须重新审阅。' }, other] } };
    db.data.get('candidate_context_revisions').set(changed.revision_id, changed);
  }
  return { db, input, source, working, revision, target, other, job, saved1, saved2, related, pending, currentSnapshot };
}

export function candidateResult(request, message = '合成替身只验证机制，不作为模型理解证据。') {
  return { contract_id: Integration.RESULT_CONTRACT, execution_id: request.turn.execution_id, generation: request.turn.generation,
    conversation_id: request.conversation.conversation_id, operation: Conversation.OPERATION, provider: request.runtime_snapshot.provider,
    model: request.runtime_snapshot.model, protocol: request.runtime_snapshot.protocol, runtime_snapshot_id: request.runtime_snapshot.snapshot_id,
    finish_reason: 'stop', usage: {}, action: { contract_id: Conversation.ACTION_CONTRACT_ID, action: 'EXPLAIN', message,
      observed_working_model: Conversation.observedWorkingModel(request.observation), patches: [], clarification: null },
    authority: 'NON_AUTHORITATIVE_WORKING_ACTION', network_call_made: true, persistence: 'not_written' };
}
export function personalResult(request) {
  return { contract_id: Understanding.Contract.result_contract, request_id: request.request_id, phase: request.phase, runtime_snapshot_id: request.runtime_snapshot.snapshot_id,
    provider: request.runtime_snapshot.provider, model: request.runtime_snapshot.model, output: { message: '合成替身只验证机制。', proposals: [], card_proposals: [] },
    authority: 'NON_AUTHORITATIVE_PERSONAL_UNDERSTANDING', network_call_made: true, persistence: 'not_written', usage: {} };
}
export function overviewResult(request) {
  return { contract_id: Overview.Contract.result_contract, request_id: request.request_id, phase: request.phase, runtime_snapshot_id: request.runtime_snapshot.snapshot_id,
    provider: request.runtime_snapshot.provider, model: request.runtime_snapshot.model, output: { summary: '合成替身只验证机制。', insights: [], uncertainties: [] },
    authority: 'NON_AUTHORITATIVE_JOB_OVERVIEW', network_call_made: true, persistence: 'not_written', usage: {} };
}

export async function captureRequest(f, entry, human = query) {
  let request;
  if (entry.startsWith('candidate-')) {
    const session = await Integration.resolveSession(f.db, f.source.source_document_id, at);
    await Integration.executeListTurn({ database: f.db, session, human_message: human,
      focus: entry === 'candidate-card' ? { type: 'ITEM', item_id: f.target.item_id } : { type: 'CANDIDATE' }, runtime_snapshot: Integration.createRuntimeSnapshot(),
      call_runtime: async value => { request = structuredClone(value); return candidateResult(value); } });
  } else if (entry === 'personal') {
    await Understanding.discuss(f.db, { human_message: human, runtime_snapshot: Understanding.runtimeSnapshot(storage), consent: true,
      call: async value => { request = structuredClone(value); return personalResult(value); } });
  } else if (entry === 'overview') {
    await Overview.discuss(f.db, { human_message: human, runtime_snapshot: Overview.runtimeSnapshot(storage), consent: true,
      call: async value => { request = structuredClone(value); return overviewResult(value); } });
  } else {
    const snapshot = await Candidate.buildSnapshotFromDatabase(f.db), delta = Candidate.candidateDelta(null, snapshot);
    const sourceManifest = await Retrieval.retrieve({ mode: 'model', purpose: 'JOB_REQUIREMENT_DETAIL', structured_sufficient: true });
    const session = JobConversation.createSession(f.job.context_id), runtime = JobConversation.createRuntimeSnapshot({ runtime: selectedRuntime });
    const compiled = JobConversation.compileContext({ job_revision: f.job, candidate_snapshot: snapshot, candidate_delta: delta, source_excerpt_manifest: sourceManifest, human_message: human, messages: [] });
    const observation = JobConversation.observationFor(f.job, snapshot), execution = JobConversation.createTurnExecution(session, observation, runtime,
      { candidate_snapshot: snapshot, candidate_delta: delta, source_excerpt_manifest: sourceManifest });
    request = JobConversation.createRuntimeRequest({ session, human_message: human, observation, compiled_context: compiled, candidate_snapshot: snapshot,
      candidate_delta: delta, source_excerpt_manifest: sourceManifest, runtime_snapshot: runtime, execution });
  }
  assert(request); return request;
}

export async function saveCorrectionFor(db, text, identities) {
  const evidence = Context.records(await Candidate.buildSnapshotFromDatabase(db)).filter(entry => identities.includes(entry.identity));
  assert.equal(evidence.length, identities.length);
  const proposal = Memory.createProposal({ operation: 'ADD', kind: 'CORRECTION', text, human_quote: text, reason: '合成作用域验收', target_memory_ref: null, related_refs: evidence.map(entry => entry.ref) },
    { human_message: text, origin: { type: 'PERSONAL' }, evidence });
  await Memory.write(db, 'personal_memory_proposals', proposal);
  return (await Memory.decide(db, proposal.proposal_id, 'SAVE')).revision;
}

export async function exportRequests() {
  const requests = [];
  for (const entry of ['candidate-aggregate', 'candidate-card', 'job-aggregate', 'job-card', 'personal', 'overview']) {
    const f = await fixture(); const request = await captureRequest(f, entry, entry.endsWith('card') ? synonymQuery : query);
    requests.push({ id: entry, domain: entry.startsWith('candidate') ? 'CANDIDATE' : entry.startsWith('job') ? 'JOB' : entry === 'personal' ? 'PERSONAL' : 'JOB_OVERVIEW', request,
      expected: { current_saved: correction2, replaced_saved: correction1, unsaved_excluded: unsaved, target: f.target.title, interview_count: 13, deployment_by: '同事', withdrawn_metric: '40%', related_tail: 'FULL_RELATED_EVIDENCE_TAIL' },
      source: Object.fromEntries([...f.db.data].map(([name, rows]) => [name, [...rows.values()]])) });
  }
  for (const state of ['retracted', 'invalidated']) {
    const f = await fixture({ state });
    requests.push({ id: `personal-${state}`, domain: 'PERSONAL', request: await captureRequest(f, 'personal'), expected: { obsolete_saved_excluded: correction2, no_memory_13_as_confirmed: true },
      source: Object.fromEntries([...f.db.data].map(([name, rows]) => [name, [...rows.values()]])) });
  }
  return { synthetic_only: true, generator: 'production builders; results are capture-only stubs', requests };
}

export async function continuationFixture(state, priorReply = correction2) {
  const f = await fixture(); const session = await Integration.resolveSession(f.db, f.source.source_document_id);
  await Integration.executeListTurn({ database: f.db, session, human_message: synonymQuery, focus: { type: 'ITEM', item_id: f.target.item_id },
    runtime_snapshot: Integration.createRuntimeSnapshot(), call_runtime: async request => candidateResult(request, priorReply) });
  if (state === 'invalidated') {
    const changed = { ...f.revision, revision_id: 'synthetic-followup-source-revision-2', version: 2, previous_revision_id: f.revision.revision_id,
      payload: { items: [{ ...f.target, summary: '当前资料版本已替换。没有已保存的新职责或新人数；旧更正须重新审阅。', ownership: '当前职责未说明', facts: [] }, f.other] } };
    f.db.data.get('candidate_context_revisions').set(changed.revision_id, changed);
  } else if (state === 'retracted') {
    const retract = Memory.createProposal({ operation: 'RETRACT', kind: 'CORRECTION', text: correction2, human_quote: '停止使用当前更正', reason: '合成用户撤回', target_memory_ref: 'current-memory', related_refs: [] },
      { human_message: '停止使用当前更正', origin: { type: 'PERSONAL' }, memories: [{ ...f.saved2, ref: 'current-memory' }], evidence: [] });
    await Memory.write(f.db, 'personal_memory_proposals', retract); await Memory.decide(f.db, retract.proposal_id, 'SAVE');
  } else if (state === 'replaced') {
    const updated = '桥木项目重新保存的更正：有效访谈为15人；我负责研究和交互，部署归同事，没有有效增长指标。';
    const replacement = Memory.createProposal({ operation: 'REPLACE', kind: 'CORRECTION', text: updated, human_quote: updated, reason: '合成再次修正', target_memory_ref: 'current-memory', related_refs: [] },
      { human_message: updated, origin: { type: 'PERSONAL' }, memories: [{ ...f.saved2, ref: 'current-memory' }], evidence: [] });
    await Memory.write(f.db, 'personal_memory_proposals', replacement); await Memory.decide(f.db, replacement.proposal_id, 'SAVE');
  }
  return f;
}

export async function exportRequestsV3() {
  const actualFile = new URL('../work/understanding-consistency-20261014/real/candidate-card-v2/result.json', import.meta.url);
  const prior = JSON.parse(readFileSync(actualFile, 'utf8'));
  assert.equal(prior.provider, 'codex'); assert.equal(prior.model, 'gpt-6.1-sol'); assert.equal(prior.action.action, 'EXPLAIN');
  const requests = [];
  for (const entry of ['candidate-aggregate', 'candidate-card']) {
    const f = await fixture();
    requests.push({ id: `${entry}-fresh`, domain: 'CANDIDATE', request: await captureRequest(f, entry, synonymQuery), expected: { current_saved: correction2, interview_count: 13 },
      source: Object.fromEntries([...f.db.data].map(([name, rows]) => [name, [...rows.values()]])) });
  }
  for (const state of ['retracted', 'invalidated']) {
    const f = await continuationFixture(state, prior.action.message), request = await captureRequest(f, 'candidate-card', '请继续根据现在有效的记录说明桥木项目的访谈人数、我的职责和成果；如果已有依据变化，请明确未知。');
    assert(!JSON.stringify(request.compiled_context.bounded_history).includes(prior.action.message), 'obsolete actual reply still selected');
    requests.push({ id: `candidate-card-${state}-followup`, domain: 'CANDIDATE', request, expected: { no_current_saved_13: true, obsolete_reply_excluded: true, source_18_is_only_historical: state === 'retracted' },
      preceding_turn: { prose_origin: 'actual real/candidate-card-v2/result.json action.message', persistence: 'replayed in real production executeListTurn via synthetic receipt; no preceding new model call', final_request: 'only this final request will be a new real model execution' },
      source: Object.fromEntries([...f.db.data].map(([name, rows]) => [name, [...rows.values()]])) });
  }
  return { synthetic_only: true, generator: 'production request builders; preceding actual model prose faithfully replayed via labelled synthetic receipt', requests };
}

export async function exportCurrentHistoryRequest() {
  const f = await continuationFixture('unchanged');
  return { synthetic_only: true, requests: [{ id: 'candidate-card-current-history', domain: 'CANDIDATE',
    request: await captureRequest(f, 'candidate-card', synonymQuery), expected: { current_saved: correction2, replaced_saved: correction1,
      unsaved_excluded: unsaved, related_tail: 'FULL_RELATED_EVIDENCE_TAIL' } }] };
}

export async function runAcceptance() {
  const results = [];
  const check = async (name, run) => { try { await run(); results.push({ name, status: 'PASS' }); } catch (error) { results.push({ name, status: 'FAIL', error: String(error?.message || error) }); } };
  for (const entry of ['candidate-aggregate', 'candidate-card', 'job-aggregate', 'job-card', 'personal', 'overview']) {
    await check(`${entry}: latest saved correction, complete related tail, no unsaved proposal`, async () => {
      const f = await fixture(); const before = JSON.stringify([...f.db.data.get('candidate_context_revisions').values()]);
      const request = await captureRequest(f, entry, synonymQuery); const body = JSON.stringify(request.compiled_context || request.context);
      assert(body.includes(correction2), 'current saved correction absent from actual dispatched context');
      assert(!body.includes(correction1), 'replaced correction revived'); assert(!body.includes(unsaved), 'unsaved proposal entered unrelated conversation');
      assert(body.includes('FULL_RELATED_EVIDENCE_TAIL'), 'full correction-bound evidence tail was truncated');
      assert.equal(JSON.stringify([...f.db.data.get('candidate_context_revisions').values()]), before, 'ordinary conversation mutated confirmed Candidate');
      if (entry === 'candidate-card') assert(!body.includes(unrelated), 'unrelated card correction entered current card scope');
    });
  }
  await check('Human Save boundary and append-only memory revisions', async () => {
    const f = await fixture({ long: false }); const before = await Candidate.buildSnapshotFromDatabase(f.db);
    assert(!JSON.stringify(before.provider_view).includes(unsaved));
    const originals = structuredClone([...f.db.data.get('source_documents').values()]);
    await Memory.decide(f.db, f.pending.proposal_id, 'SAVE');
    const after = await Candidate.buildSnapshotFromDatabase(f.db);
    assert(JSON.stringify(after.provider_view).includes(unsaved)); assert.notEqual(after.aggregate_fingerprint, before.aggregate_fingerprint);
    assert.deepEqual([...f.db.data.get('source_documents').values()], originals);
    assert(f.db.data.get('personal_memory_revisions').has(f.saved1.revision_id)); assert(f.db.data.get('personal_memory_revisions').has(f.saved2.revision_id));
    await assert.rejects(Memory.decide(f.db, f.pending.proposal_id, 'SAVE'), /already_decided/);
  });
  for (const state of ['retracted', 'invalidated']) for (const entry of ['candidate-card', 'personal', 'job-card', 'overview']) {
    await check(`${entry}: ${state} correction excluded`, async () => {
      const f = await fixture({ state }); const request = await captureRequest(f, entry); const body = JSON.stringify(request.compiled_context || request.context);
      assert(!body.includes(correction1)); assert(!body.includes(correction2), 'obsolete memory revived as current correction');
    });
  }
  await check('Wrong evidence reference rejected without saved change', async () => {
    const f = await fixture({ long: false }); const before = f.db.data.get('personal_memory_revisions').size;
    const evidence = Context.records(await Candidate.buildSnapshotFromDatabase(f.db));
    assert.throws(() => Memory.createProposal({ operation: 'ADD', kind: 'CORRECTION', text: '错引用', reason: '合成反例', human_quote: '错引用', related_refs: ['foreign-ref'], target_memory_ref: null },
      { human_message: '错引用', origin: {}, evidence }), /evidence_invalid/);
    assert.equal(f.db.data.get('personal_memory_revisions').size, before);
  });
  for (const entry of ['candidate-card', 'personal', 'overview']) await check(`${entry}: memory changed after dispatch rejects success`, async () => {
    const f = await fixture({ long: false });
    const change = async () => { await Memory.decide(f.db, f.pending.proposal_id, 'SAVE'); };
    if (entry === 'candidate-card') {
      const session = await Integration.resolveSession(f.db, f.source.source_document_id, at);
      let outcome, rejected = false;
      try { outcome = await Integration.executeListTurn({ database: f.db, session, human_message: synonymQuery, focus: { type: 'ITEM', item_id: f.target.item_id },
        runtime_snapshot: Integration.createRuntimeSnapshot(), call_runtime: async request => { await change(); return candidateResult(request); } }); } catch (error) { assert.match(String(error.code || error.message), /CONTEXT_CHANGED|STALE/); rejected = true; }
      assert(rejected || outcome.status === 'STALE', 'success survived newer saved correction');
      assert(![...f.db.data.get('conversation_messages').values()].some(value => value.role === 'ASSISTANT'));
    } else if (entry === 'personal') await assert.rejects(Understanding.discuss(f.db, { human_message: query, runtime_snapshot: Understanding.runtimeSnapshot(storage), consent: true,
      call: async request => { await change(); return personalResult(request); } }), /CONTEXT_CHANGED|STALE/);
    else await assert.rejects(Overview.discuss(f.db, { human_message: query, runtime_snapshot: Overview.runtimeSnapshot(storage), consent: true,
      call: async request => { await change(); return overviewResult(request); } }), /CONTEXT_CHANGED|STALE/);
  });
  for (const entry of ['personal', 'overview']) await check(`${entry}: Model failure stays explicit; no confirmation write`, async () => {
    const f = await fixture({ long: false }); const before = JSON.stringify([...f.db.data.get('personal_memory_revisions').values()]); let calls = 0;
    const options = { human_message: query, runtime_snapshot: entry === 'personal' ? Understanding.runtimeSnapshot(storage) : Overview.runtimeSnapshot(storage), consent: true,
      call: async () => { calls++; throw Error('synthetic_provider_failure'); } };
    await assert.rejects((entry === 'personal' ? Understanding : Overview).discuss(f.db, options), /synthetic_provider_failure/);
    assert.equal(calls, 1); assert.equal(JSON.stringify([...f.db.data.get('personal_memory_revisions').values()]), before);
  });
  for (const collision of ['same-source-suffix', 'other-source-same-item']) await check(`Candidate card: ${collision} correction excluded`, async () => {
    const f = await fixture({ long: false });
    const sameSource = collision === 'same-source-suffix', foreignContext = `synthetic-collision-context-${collision}`;
    const foreign = { ...f.revision, context_id: foreignContext, revision_id: `${foreignContext}-revision`,
      provenance: { ...f.revision.provenance, source_document_ids: [sameSource ? f.source.source_document_id : 'synthetic-foreign-source'] },
      payload: { items: [{ ...f.target, item_id: sameSource ? `decoy:${f.target.item_id}` : f.target.item_id, title: '独立无关项目', summary: 'Independent source data',
        grounding_refs: [{ ...f.target.grounding_refs[0], source_document_id: sameSource ? f.source.source_document_id : 'synthetic-foreign-source' }] }] } };
    f.db.data.get('candidate_context_revisions').set(foreign.revision_id, foreign);
    const wrong = `无关绑定更正：${collision} FOREIGN_CORRECTION_MARKER`;
    await saveCorrectionFor(f.db, wrong, [`canonical:${foreignContext}:${foreign.payload.items[0].item_id}`]);
    const request = await captureRequest(f, 'candidate-card');
    assert(!JSON.stringify(request.compiled_context.personal_context).includes(wrong), 'identity collision polluted focused card context');
  });
  await check('Candidate card: multi-item correction is supporting evidence without extra edit targets', async () => {
    const f = await fixture({ long: false }); const text = '桥木负责研究，南岬只负责图形编排。这条说明关联两项资料，不授权修改其他卡片。MULTI_RELATED_MARKER';
    await saveCorrectionFor(f.db, text, [`canonical:${f.revision.context_id}:${f.target.item_id}`, `canonical:${f.revision.context_id}:${f.other.item_id}`]);
    const request = await captureRequest(f, 'candidate-card'), bundle = request.compiled_context.personal_context;
    const memory = bundle.memories.find(entry => entry.text === text);
    assert(memory); assert.deepEqual(memory.related_refs, ['card-1']); assert.equal(memory.related_evidence.length, 2);
    assert.deepEqual(request.observation.focus, { type: 'ITEM', item_id: f.target.item_id });
    assert.equal(request.compiled_context.candidate.current_item.item_id, f.target.item_id);
  });
  for (const entry of ['candidate-card', 'personal', 'overview']) await check(`${entry}: terminal transaction rejects memory changed after freshness check`, async () => {
    const f = await fixture({ long: false }); const originalTx = f.db.transaction.bind(f.db); let injected = false;
    f.db.transaction = (names, mode = 'readonly') => {
      const stores = Array.isArray(names) ? names : [names];
      if (!injected && mode === 'readwrite' && stores.includes('personal_memory_revisions')
          && (stores.includes('candidate_actions') || stores.includes('personal_conversation_turns') || stores.includes('job_overview_turns'))) {
        injected = true;
        const changed = { ...f.saved2, revision_id: 'synthetic-concurrent-memory-revision', version: f.saved2.version + 1,
          previous_revision_id: f.saved2.revision_id, text: '并发保存的新更正：真实人数29，其他职责须重审。', decision_id: 'synthetic-concurrent-decision' };
        f.db.data.get('personal_memory_revisions').set(changed.revision_id, changed);
      }
      return originalTx(names, mode);
    };
    await assert.rejects(captureRequest(f, entry), /PERSONAL_CONTEXT_CHANGED|STALE/);
    assert(injected, 'production success transaction never bound memory read set');
    assert(![...f.db.data.get('conversation_messages').values()].some(value => value.role === 'ASSISTANT'));
    assert(![...f.db.data.get('personal_conversation_turns').values()].some(value => value.status === 'SUCCEEDED'));
    assert(![...f.db.data.get('job_overview_turns').values()].some(value => value.status === 'SUCCEEDED'));
  });
  await check('Context budget exhaustion fails explicitly instead of dropping saved correction', async () => {
    const f = await fixture({ long: false });
    const snapshot = await Candidate.buildSnapshotFromDatabase(f.db);
    assert.throws(() => Context.select(snapshot, '同义询问', 1), /PERSONAL_SAVED_CONTEXT_LIMIT/);
  });
  await check('Human Save refuses replacement based on an old memory version', async () => {
    const f = await fixture({ long: false });
    const stale = Memory.createProposal({ operation: 'REPLACE', kind: 'CORRECTION', text: '旧版本覆盖请求', human_quote: '旧版本覆盖请求', reason: '合成旧版本反例', target_memory_ref: 'stale-memory', related_refs: [] },
      { human_message: '旧版本覆盖请求', origin: {}, memories: [{ ...f.saved1, ref: 'stale-memory' }], evidence: [] });
    await Memory.write(f.db, 'personal_memory_proposals', stale);
    const before = f.db.data.get('personal_memory_revisions').size;
    await assert.rejects(Memory.decide(f.db, stale.proposal_id, 'SAVE'), /version_conflict/);
    assert.equal(f.db.data.get('personal_memory_revisions').size, before);
  });
  await check('Removed Candidate source/item does not resurrect its saved correction', async () => {
    const f = await fixture({ long: false });
    f.db.data.get('candidate_context_lifecycle').set('synthetic-removal', { state: 'REMOVED', authority: 'AUTHORITATIVE_USER_DECISION', context_id: f.revision.context_id, item_id: f.target.item_id });
    const current = await Candidate.buildSnapshotFromDatabase(f.db);
    assert(!JSON.stringify(current.provider_view).includes(correction2));
    assert(!JSON.stringify(current.saved_personal_memories).includes(correction2));
    assert(f.db.data.get('personal_memory_revisions').has(f.saved2.revision_id));
    assert(f.db.data.get('candidate_context_revisions').has(f.revision.revision_id));
  });
  await check('Candidate card: retracted correction does not revive through obsolete assistant history', async () => {
    const f = await fixture({ long: false }); const session = await Integration.resolveSession(f.db, f.source.source_document_id);
    await Integration.executeListTurn({ database: f.db, session, human_message: query, focus: { type: 'ITEM', item_id: f.target.item_id },
      runtime_snapshot: Integration.createRuntimeSnapshot(), call_runtime: async request => candidateResult(request, correction2) });
    const retract = Memory.createProposal({ operation: 'RETRACT', kind: 'CORRECTION', text: correction2, human_quote: '停止使用当前更正', reason: '合成用户明确停止使用', target_memory_ref: 'current-memory', related_refs: [] },
      { human_message: '停止使用当前更正', origin: { type: 'PERSONAL' }, memories: [{ ...f.saved2, ref: 'current-memory' }], evidence: [] });
    await Memory.write(f.db, 'personal_memory_proposals', retract); await Memory.decide(f.db, retract.proposal_id, 'SAVE');
    const request = await captureRequest(f, 'candidate-card', synonymQuery);
    assert(!JSON.stringify(request.compiled_context.bounded_history).includes(correction2), 'obsolete assistant revived retracted saved memory in backend-bound history');
    assert([...f.db.data.get('conversation_messages').values()].some(message => message.role === 'ASSISTANT' && message.text === correction2), 'visible old history should remain durable');
  });
  await check('Candidate card: retracted saved quote does not revive through old Human history', async () => {
    const f = await fixture({ long: false }); const session = await Integration.resolveSession(f.db, f.source.source_document_id);
    await Integration.executeListTurn({ database: f.db, session, human_message: correction2, focus: { type: 'ITEM', item_id: f.target.item_id },
      runtime_snapshot: Integration.createRuntimeSnapshot(), call_runtime: async request => candidateResult(request, '合成旧轮次确认读到了当时上下文。') });
    const retract = Memory.createProposal({ operation: 'RETRACT', kind: 'CORRECTION', text: correction2, human_quote: '不再使用这条更正', reason: '合成明确撤回', target_memory_ref: 'current-memory', related_refs: [] },
      { human_message: '不再使用这条更正', origin: { type: 'PERSONAL' }, memories: [{ ...f.saved2, ref: 'current-memory' }], evidence: [] });
    await Memory.write(f.db, 'personal_memory_proposals', retract); await Memory.decide(f.db, retract.proposal_id, 'SAVE');
    const request = await captureRequest(f, 'candidate-card', synonymQuery);
    assert(!JSON.stringify(request.compiled_context.bounded_history).includes(correction2), 'withdrawn saved quote reintroduced from historical Human turn');
    assert([...f.db.data.get('conversation_messages').values()].some(message => message.role === 'USER' && message.text === correction2), 'visible original Human history should remain durable');
  });
  for (const state of ['invalidated', 'replaced']) await check(`Candidate card: ${state} prior assistant is retained visibly but not compiled`, async () => {
    const f = await continuationFixture(state); const request = await captureRequest(f, 'candidate-card', synonymQuery);
    assert(!JSON.stringify(request.compiled_context.bounded_history).includes(correction2));
    assert([...f.db.data.get('conversation_messages').values()].some(message => message.role === 'ASSISTANT' && message.text === correction2));
  });
  await check('Candidate card: same-context continuation preserves current assistant and unsaved Human self-report', async () => {
    const f = await fixture({ long: false }); const session = await Integration.resolveSession(f.db, f.source.source_document_id), statement = '这条只是当前对话中的未保存自述：我在旁听中做过一次记录整理。';
    await Integration.executeListTurn({ database: f.db, session, human_message: statement, focus: { type: 'ITEM', item_id: f.target.item_id },
      runtime_snapshot: Integration.createRuntimeSnapshot(), call_runtime: async request => candidateResult(request, '当前有效的合成回复；保留对话连续性。CURRENT_ASSISTANT_MARKER') });
    const request = await captureRequest(f, 'candidate-card', synonymQuery);
    assert(JSON.stringify(request.compiled_context.bounded_history).includes(statement));
    assert(JSON.stringify(request.compiled_context.bounded_history).includes('CURRENT_ASSISTANT_MARKER'));
    assert(!JSON.stringify(request.compiled_context.personal_context).includes(statement));
  });
  await check('Candidate card: source-invalidated saved quote is excluded even if repeated after original Save', async () => {
    const f = await fixture({ long: false }); const session = await Integration.resolveSession(f.db, f.source.source_document_id);
    await Integration.executeListTurn({ database: f.db, session, human_message: correction2, focus: { type: 'ITEM', item_id: f.target.item_id },
      runtime_snapshot: Integration.createRuntimeSnapshot(), call_runtime: async request => candidateResult(request, '这是依据旧源版本的合成说明。') });
    const changed = { ...f.revision, revision_id: 'synthetic-quote-source-revision-2', version: 2, previous_revision_id: f.revision.revision_id, created_at: new Date().toISOString(),
      payload: { items: [{ ...f.target, summary: '来源版本已经替换，需要重新审阅绑定的更正。' }, f.other] } };
    f.db.data.get('candidate_context_revisions').set(changed.revision_id, changed);
    const request = await captureRequest(f, 'candidate-card', synonymQuery);
    assert(!JSON.stringify(request.compiled_context.bounded_history).includes(correction2), 'source-invalidated saved quote revived because Human turn followed the original memory Save timestamp');
    assert([...f.db.data.get('conversation_messages').values()].some(message => message.role === 'USER' && message.text === correction2));
  });
  await check('Personal: source-invalidated saved quote repeated after Save cannot revive through history', async () => {
    const f = await fixture({ long: false });
    await Understanding.discuss(f.db, { human_message: correction2, runtime_snapshot: Understanding.runtimeSnapshot(storage), consent: true, call: personalResult });
    const changed = { ...f.revision, revision_id: 'synthetic-personal-quote-source-2', version: 2, previous_revision_id: f.revision.revision_id, created_at: new Date().toISOString(),
      payload: { items: [{ ...f.target, summary: '新资料版本，不使用先前更正。' }, f.other] } };
    f.db.data.get('candidate_context_revisions').set(changed.revision_id, changed);
    const request = await captureRequest(f, 'personal', synonymQuery);
    assert(!JSON.stringify(request.context.history).includes(correction2), 'obsolete saved quote revived from old Personal Human turn after source version change');
    assert([...f.db.data.get('personal_conversation_turns').values()].some(turn => turn.human_message === correction2));
    const current = await captureRequest(f, 'personal', correction2);
    assert.equal(current.human_message, correction2, 'Human may explicitly restate a fact in the current turn without automatic confirmation');
    assert(!JSON.stringify(current.context.personal_context).includes(correction2));
  });
  for (const [message, rejected] of [['没有看到新的已确认依据，不能断言人数已经更正。本次未修改记录。', false],
    ['这是用户已确认的现有资料，当前回复没有修改或保存。', false], ['你此前已确认并人工保存的记录仍然有效，本次只做说明。', false],
    ['我已保存到个人资料。', true], ['我已确认你的个人资料。', true], ['已确认。', true]]) {
    await check(`Candidate frontend: ${rejected ? 'reject fake save' : 'allow existing authority or unknown'} — ${message}`, async () => {
      const f = await fixture({ long: false }); const session = await Integration.resolveSession(f.db, f.source.source_document_id);
      const run = () => Integration.executeListTurn({ database: f.db, session, human_message: synonymQuery, focus: { type: 'ITEM', item_id: f.target.item_id },
        runtime_snapshot: Integration.createRuntimeSnapshot(), call_runtime: async request => candidateResult(request, message) });
      if (rejected) await assert.rejects(run(), /AUTHORITY_COPY_INVALID/);
      else { const outcome = await run(); assert.equal(outcome.status, 'SUCCEEDED'); assert.equal(outcome.assistant_message.text, message); }
    });
  }
  for (const phase of ['normal', 'after-dispatch', 'terminal-transaction']) await check(`Job: ${phase} saved-context / Candidate write boundary`, async () => {
    const f = await fixture({ long: false }), before = JSON.stringify([...f.db.data.get('candidate_context_revisions').values()]);
    const snapshot = await Candidate.buildSnapshotFromDatabase(f.db), delta = Candidate.candidateDelta(null, snapshot);
    const source = await Retrieval.retrieve({ mode: 'model', purpose: 'JOB_REQUIREMENT_DETAIL', structured_sufficient: true });
    const session = await JobPersistence.ensureSession(f.db, JobConversation.createSession(f.job.context_id));
    const runtime = JobConversation.createRuntimeSnapshot({ runtime: selectedRuntime });
    const observed = JobConversation.observationFor(f.job, snapshot);
    const execution = JobConversation.createTurnExecution(session, observed, runtime, { candidate_snapshot: snapshot, candidate_delta: delta, source_excerpt_manifest: source });
    await JobPersistence.persistExecution(f.db, execution);
    const user = { ...JobConversation.createMessage(session, 'USER', query), turn_id: execution.execution_id };
    await JobPersistence.persistMessage(f.db, user);
    const output = { contract_id: require('../data/job_intelligence_contract_v1.json').semantic_output_version, action: 'EXPLAIN', message: '合成Job替身：不修改个人事实。',
      fit_findings: [], gap_findings: [], recommendations: [], candidate_delta_interpretation: null, clarification: null, source_need: null, changes: [] };
    const analysis = JobPersistence.createAnalysis({ session, execution, job_revision: f.job, candidate_snapshot: snapshot, candidate_delta: delta, source_excerpt_manifest: source, runtime_snapshot: runtime, output });
    const assistant = { ...JobConversation.createMessage(session, 'ASSISTANT', output.message), turn_id: execution.execution_id };
    let injected = false;
    if (phase === 'after-dispatch') {
      await Memory.decide(f.db, f.pending.proposal_id, 'SAVE');
      assert(!JobConversation.observationMatches(observed, f.job, await Candidate.buildSnapshotFromDatabase(f.db)), 'Job observation ignored newer saved correction');
    } else if (phase === 'terminal-transaction') {
      const original = f.db.transaction.bind(f.db);
      f.db.transaction = (names, mode = 'readonly') => {
        const stores = Array.isArray(names) ? names : [names];
        if (!injected && mode === 'readwrite' && stores.includes('job_analyses') && stores.includes('personal_memory_revisions')) {
          injected = true;
          const changed = { ...f.saved2, revision_id: 'synthetic-job-concurrent-revision', version: 3, previous_revision_id: f.saved2.revision_id, text: 'Job回执前并发更正', decision_id: 'synthetic-job-concurrent-decision' };
          f.db.data.get('personal_memory_revisions').set(changed.revision_id, changed);
        }
        return original(names, mode);
      };
    }
    const save = () => JobPersistence.persistSuccessfulTurn(f.db, { execution, analysis, assistant_message: assistant, personal_snapshot: snapshot });
    if (phase === 'normal') {
      await save(); assert.equal(f.db.data.get('job_analyses').size, 1); assert.equal(f.db.data.get('job_conversation_messages').size, 2);
    } else {
      await assert.rejects(save(), /PERSONAL_CONTEXT_CHANGED/);
      assert.equal(f.db.data.get('job_analyses').size, 0); assert.equal(f.db.data.get('job_conversation_messages').size, 1);
      if (phase === 'terminal-transaction') assert(injected);
    }
    assert.equal(JSON.stringify([...f.db.data.get('candidate_context_revisions').values()]), before);
  });
  await check('Six entry HTML files invalidate cached ResumeTask after shared stale-history repair', async () => {
    for (const name of ['personal-import.html', 'candidate-detail.html', 'jd-import.html', 'job-detail.html', 'personal-understanding.html', 'job-overview.html']) {
      const html = readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');
      const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gu)].map(match => match[1].replace(/&amp;/g, '&'));
      const refs = scripts.filter(src => src.split('?')[0] === '/resume-task-domain.js');
      assert.equal(refs.length, 1, `${name}: missing or duplicated actual ResumeTask script`);
      assert.equal(new URL(refs[0], 'http://synthetic.invalid').searchParams.get('v'), 'understanding-consistency-20261014', `${name}: stale cached ResumeTask may revive invalidated quote`);
    }
  });
  return { synthetic_only: true, network_calls: 0, passed: results.filter(r => r.status === 'PASS').length, failed: results.filter(r => r.status === 'FAIL').length, results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--requests-v3')) process.stdout.write(JSON.stringify(await exportRequestsV3()) + '\n');
  else if (process.argv.includes('--current-history-request')) process.stdout.write(JSON.stringify(await exportCurrentHistoryRequest()) + '\n');
  else if (process.argv.includes('--requests')) process.stdout.write(JSON.stringify(await exportRequests()) + '\n');
  else { const report = await runAcceptance(); process.stdout.write(JSON.stringify(report, null, 2) + '\n'); if (report.failed) process.exitCode = 1; }
}
