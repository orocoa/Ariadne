import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { databaseFor, sourceInput, requestFor, template, commitPrepared, revision, WORKSPACE, HUMAN, PRIOR_HUMAN_CORRECTION, conversationHistoryFixture } from './helpers/resume-task-fixtures.mjs';
import { documentFixture, settleDom, waitForDom } from './helpers/resume-dom-fixture.mjs';

const require = createRequire(import.meta.url);
const Task = require('../public/resume-task-domain.js');
const Truth = require('../public/truth-persistence-domain.js');
const Support = require('../public/resume-task-support.js');
const Transport = require('../public/conversation-turn-transport.js');
const Understanding = require('../public/personal-understanding-domain.js');
const Output = require('../public/conversation-output.js');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const python = process.env.ARIADNE_TEST_PYTHON || '/Users/kai/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const saved = new Map(['AriadneTruthPersistence', 'AriadneResumeTask', 'AriadneResumeTaskSupport', 'AriadneRuntimeSelection', 'AriadneTransport', 'AriadneConversationAttachments', 'AriadneProduct', 'document', 'localStorage', 'location'].map(key => [key, globalThis[key]]));
let currentDb, currentWorkspace = WORKSPACE, opens = 0, closes = 0;
let selectedRuntime = (() => { const snapshot = requestFor().runtime_snapshot; return { mode: snapshot.mode, provider: snapshot.provider, model: snapshot.model, execution_settings: snapshot.execution_settings }; })();
function useDatabase(database) { currentDb = database; database.close = () => closes++; return database; }
function resultFor(context, runtime, extra = {}) {
  const input = { context, runtime_snapshot: runtime, intent: { instruction: context.current_human, template_name: context.template?.name || '', continue: Boolean(context.prior_task) },
    ...(context.template ? { attachment_parts: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,synthetic' } }] } : {}), ...extra };
  const output = spawnSync(python, [resolve(root, 'tests/resume_task_runtime_regression.py'), '--result'], { cwd: root, env: { ...process.env, PYTHONPATH: root }, input: JSON.stringify(input), encoding: 'utf8', maxBuffer: 2000000 });
  assert.equal(output.status, 0, output.stderr || output.stdout); return JSON.parse(output.stdout);
}
function outerResult(request, taskResult) {
  return { contract_id: Understanding.Contract.result_contract, request_id: request.request_id, phase: request.phase, runtime_snapshot_id: request.runtime_snapshot.snapshot_id,
    provider: request.runtime_snapshot.provider, model: request.runtime_snapshot.model,
    output: { message: taskResult.message, proposals: [], card_proposals: [] }, usage: { prompt_tokens: 120, completion_tokens: 60, total_tokens: 180 },
    authority: 'NON_AUTHORITATIVE_PERSONAL_UNDERSTANDING', network_call_made: true, persistence: 'not_written',
    resume_task: taskResult, delivery_version: 'ariadne-conversation-delivery-v3', ...(taskResult.status === 'READY' ? { deliverable: taskResult.deliverable } : {}) };
}
async function preparedRequest(human = HUMAN) {
  const request = requestFor(human), packet = await Support.prepare(request, 'PERSONAL');
  assert(packet.resume_context); return { request, packet };
}

try {
  globalThis.localStorage = { getItem: key => key === 'ariadne-content-workspace-v1' ? currentWorkspace : null };
  globalThis.location = { origin: 'https://qa.example.test' };
  globalThis.AriadneTruthPersistence = { ...Truth, openDatabase: async () => { opens++; return currentDb; } };
  globalThis.AriadneResumeTask = Task; globalThis.AriadneResumeTaskSupport = Support;
  globalThis.AriadneRuntimeSelection = { scopeFor: operation => operation === 'personal_understanding' ? 'PERSONAL' : null,
    resolve: () => selectedRuntime };
  delete globalThis.AriadneConversationAttachments;

  const db = useDatabase(databaseFor(sourceInput({ large: true })));
  const first = await preparedRequest();
  assert(Task.bytes(first.packet.resume_context) > 128000);
  assert.equal(await Support.beforeDispatch(first.request, first.packet), first.packet, 'fresh dispatch preserves the concrete outbound body');
  const raw = resultFor(first.packet.resume_context, first.request.runtime_snapshot);
  const prepared = await Support.prepareResult(db, first.request, { resume_task: raw });
  const proof = Support.metadata(prepared);
  await commitPrepared(Task, db, prepared);
  const message = { id: 'qa-reviewed-first', role: 'ASSISTANT', text: raw.message, deliverable: raw.deliverable, resume_task: proof };
  assert.equal((await Support.verifyMessage(message)).version_id, prepared.document_version.version_id);
  assert.equal(proof.evidence_hash, prepared.document_version.evidence_hash);
  for (const mode of ['changed_body', 'changed_hash', 'missing_version', 'scope']) {
    const corrupt = structuredClone(message);
    if (mode === 'changed_body') corrupt.deliverable.resume.blocks[0].text = 'Wrong identity';
    else if (mode === 'changed_hash') corrupt.resume_task.document_hash = 'sha256:' + 'c'.repeat(64);
    else if (mode === 'missing_version') corrupt.resume_task.version_id = 'not-a-version';
    else corrupt.resume_task.scope.conversation_id = 'OTHER';
    await assert.rejects(Support.verifyMessage(corrupt), /RESUME_/, mode);
  }
  // Simulate corrupted read storage outside the authorized append-only path.
  // Recomputing a new local snapshot hash cannot reuse the old message proof.
  const originalDocument = structuredClone(prepared.document_version), resealedDocument = structuredClone(originalDocument);
  const resealedHuman = resealedDocument.evidence_snapshot.evidence.find(source => source.role === 'CURRENT_HUMAN');
  resealedHuman.content.text = 'Synthetic altered source: I performed deployment myself.';
  resealedDocument.evidence_snapshot.manifest.find(entry => entry.ref === resealedHuman.ref).semantic_hash = await Task.fingerprint(resealedHuman.content);
  resealedDocument.evidence_hash = await Task.fingerprint(resealedDocument.evidence_snapshot);
  resealedDocument.task_human_history.find(item => item.text === originalDocument.evidence_snapshot.evidence.find(source => source.role === 'CURRENT_HUMAN').content.text).text = resealedHuman.content.text;
  await Task.validateDocument(resealedDocument);
  db.data.get('resume_document_versions').set(resealedDocument.version_id, resealedDocument);
  try { await assert.rejects(Support.verifyMessage(message), /RESUME_DOCUMENT_INVALID|RESUME_PROOF_/, 'a changed snapshot+hash fails the immutable assistant evidence proof'); }
  finally { db.data.get('resume_document_versions').set(originalDocument.version_id, originalDocument); }
  for (const mutate of [value => { value.resume_task.status = 'REVISION_REQUIRED'; }, value => { value.resume_task.deliverable.resume.blocks[0].text = 'Wrong identity'; }]) {
    const envelope = { delivery_version: 'ariadne-conversation-delivery-v3', deliverable: structuredClone(raw.deliverable), resume_task: structuredClone(raw) };
    mutate(envelope); assert.throws(() => Output.fromResult(envelope), /审核/);
  }

  // Use the actual shared transport and actual Support module, including full
  // request preparation. The network itself is a deterministic JSON substitute.
  let sent;
  globalThis.AriadneTransport = { async fetch(endpoint, options) { sent = JSON.parse(options.body); assert.equal(endpoint, '/api/personal-understanding'); return { ok: true, async json() { return { answer: 'synthetic' }; } }; } };
  const transportRequest = requestFor();
  await Transport.execute({ request: transportRequest, domain: 'PERSONAL', endpoint: '/api/personal-understanding' });
  assert(sent.resume_context); assert(Task.bytes(sent.resume_context) > 128000);
  assert.equal(sent.resume_context.prior_version.deliverable.resume.blocks.length, raw.deliverable.resume.blocks.length);

  const changedDb = useDatabase(databaseFor(sourceInput()));
  const changing = await preparedRequest();
  changedDb.data.get('candidate_context_revisions').set('qa-task-revision-1-2', { ...revision(1), revision_id: 'qa-task-revision-1-2', version: 2 });
  const stripped = await Support.beforeDispatch(changing.request, { ...changing.packet, resume_template_data: 'synthetic-old-template' });
  assert.equal(stripped.resume_context_error, 'RESUME_CONTEXT_CHANGED');
  assert.equal(stripped.resume_context, undefined); assert.equal(stripped.resume_template_data, undefined);
  assert.equal(stripped.human_message, HUMAN, 'ordinary domain discussion retains its original request');
  await assert.rejects(Support.prepareResult(changedDb, changing.request, { resume_task: resultFor(changing.packet.resume_context, changing.request.runtime_snapshot) }), /RESUME_CONTEXT_UNAVAILABLE/);
  assert.equal(await Support.beforeDispatch(requestFor(), stripped), stripped, 'no prepared context still preserves an ordinary outbound body');

  // A fresh workspace switch never sends the old workspace full-data packet.
  useDatabase(databaseFor(sourceInput())); const workspaceChange = await preparedRequest();
  currentWorkspace = 'b'.repeat(32);
  assert.equal((await Support.beforeDispatch(workspaceChange.request, workspaceChange.packet)).resume_context_error, 'RESUME_SCOPE_CHANGED');
  currentWorkspace = WORKSPACE;

  const tooBig = useDatabase(databaseFor(sourceInput({ overLimit: true })));
  const oversized = await Support.prepare(requestFor(), 'PERSONAL');
  assert.equal(oversized.resume_context_error, 'RESUME_EVIDENCE_LIMIT'); assert.equal(oversized.resume_context, undefined);
  assert.equal(tooBig.data.get('resume_tasks').size, 0);
  const distill = { phase: 'DISTILL' }, openCount = opens;
  assert.equal(await Support.prepare(distill, 'PERSONAL'), distill); assert.equal(opens, openCount);

  // The existing successful-turn transaction owns both the message and the
  // task/document writes. Inject an atomic storage failure into that transaction.
  const atomic = useDatabase(databaseFor(sourceInput()));
  const runtime = requestFor().runtime_snapshot;
  const taskCall = async request => {
    const outbound = await Support.beforeDispatch(request, await Support.prepare(request, 'PERSONAL'));
    return outerResult(request, resultFor(outbound.resume_context, request.runtime_snapshot));
  };
  const readyTurn = await Understanding.discuss(atomic, { runtime_snapshot: runtime, consent: true, human_message: HUMAN, call: taskCall });
  assert.equal(readyTurn.turn.calls, 3); assert(readyTurn.turn.output.resume_task);
  assert.equal(atomic.data.get('resume_document_versions').size, 1);
  assert.equal(atomic.data.get('personal_conversation_turns').get(readyTurn.turn.turn_id).output.resume_task.version_id,
    (await Task.restore(atomic, readyTurn.turn.output.resume_task.scope)).version.version_id);

  const failed = useDatabase(databaseFor(sourceInput()));
  await assert.rejects(Understanding.discuss(failed, { runtime_snapshot: runtime, consent: true, human_message: HUMAN, call: async request => {
    const result = await taskCall(request); failed.failNextCommit = true; return result;
  } }), /synthetic_atomic_commit_failure/);
  assert.equal(failed.data.get('resume_tasks').size, 0); assert.equal(failed.data.get('resume_document_versions').size, 0);
  assert([...failed.data.get('personal_conversation_turns').values()].every(turn => turn.status === 'FAILED'));

  const clarification = useDatabase(databaseFor(sourceInput()));
  const clarifying = await Understanding.discuss(clarification, { runtime_snapshot: runtime, consent: true, human_message: HUMAN, call: async request => {
    const outbound = await Support.beforeDispatch(request, await Support.prepare(request, 'PERSONAL'));
    return outerResult(request, resultFor(outbound.resume_context, request.runtime_snapshot, { generation_status: 'NEEDS_FACTS' }));
  } });
  assert.equal(clarifying.turn.calls, 2); assert.equal(clarifying.turn.output.deliverable, null); assert.equal(clarifying.turn.output.resume_task, undefined);
  assert.equal(clarification.data.get('resume_tasks').size, 1); assert.equal(clarification.data.get('resume_document_versions').size, 0);
  const answered = await Understanding.discuss(clarification, { runtime_snapshot: runtime, consent: true, human_message: HUMAN + ' My name is Synthetic Name.', call: async request => {
    const outbound = await Support.beforeDispatch(request, await Support.prepare(request, 'PERSONAL'));
    assert.equal(outbound.resume_context.prior_task.latest_status, 'NEEDS_FACTS');
    assert.match(outbound.resume_context.prior_task.last_result_message, /What name/);
    const earlierHuman = outbound.resume_context.evidence.find(source => source.role === 'CONVERSATION_HUMAN_UNCONFIRMED' && source.content.text === HUMAN);
    assert(earlierHuman, 'the actual saved USER turn supplies exact earlier words without duplicating them as task-only history');
    assert.equal(earlierHuman.source_state, 'CONVERSATION_HISTORY_UNCONFIRMED');
    assert.deepEqual(earlierHuman.content, { text: HUMAN, created_at: clarifying.turn.created_at });
    assert.equal(outbound.resume_context.evidence_manifest.find(entry => entry.ref === earlierHuman.ref).identity,
      `conversation-human:personal_conversation_turns:${clarifying.turn.turn_id}`);
    assert(!outbound.resume_context.evidence.some(source => source.role === 'TASK_HUMAN_UNCONFIRMED' && source.content.text === HUMAN), 'the same actual utterance is not supplied twice');
    return outerResult(request, resultFor(outbound.resume_context, request.runtime_snapshot));
  } });
  assert.equal(answered.turn.calls, 3); assert.equal(clarification.data.get('resume_document_versions').size, 1);
  assert.equal((await Task.restore(clarification, answered.turn.output.resume_task.scope)).task.revision, 2);

  // Template reuse is an explicit current-task/current-recipient choice. The
  // checkbox must not carry an old approval into a later saved task revision.
  const templateDb = useDatabase(databaseFor(sourceInput())), templateRequest = requestFor();
  const meta = { name: 'Synthetic-Reference.pdf', mime_type: 'application/pdf', size: 1234, content_hash: 'sha256:' + 'b'.repeat(64) };
  const outbound = { ...templateRequest, attachments: { request_id: templateRequest.request_id, files: [meta] } };
  const templatePacket = await Support.prepare(templateRequest, 'PERSONAL', outbound);
  const currentTemplate = { ...meta, archive: { ...templatePacket.resume_context.scope, request_id: templateRequest.request_id, index: 0 } };
  const templatedContext = await Task.withTemplate(templatePacket.resume_context, currentTemplate, { templateReuseConfirmed: false });
  const templatedResult = resultFor(templatedContext, templateRequest.runtime_snapshot);
  const templatePrepared = await Support.prepareResult(templateDb, templateRequest, { resume_task: templatedResult });
  await commitPrepared(Task, templateDb, templatePrepared);
  const consentDoc = documentFixture(), form = consentDoc.createElement('form');
  consentDoc.documentElement = { lang: 'zh' }; consentDoc.getElementById = id => id === 'personal-conversation-form' ? form : null;
  consentDoc.body.append(form); globalThis.document = consentDoc; globalThis.AriadneProduct = { storage: 'filesystem' };
  await Support.refresh();
  const checkbox = form.querySelector('input'); assert(checkbox); assert.equal(checkbox.checked, false);
  checkbox.checked = true;
  await Support.refresh(); assert.equal(checkbox.checked, true, 'same current task and exact recipient retain a still-unconsumed selection');
  const reuseRequest = requestFor(), reusePacket = await Support.prepare(reuseRequest, 'PERSONAL');
  assert.deepEqual(reusePacket.resume_context.template, currentTemplate); assert.equal(reusePacket.resume_context.consent.template_reuse_confirmed, true);
  const reusedPrepared = await Support.prepareResult(templateDb, reuseRequest, { resume_task: resultFor(reusePacket.resume_context, reuseRequest.runtime_snapshot) });
  await commitPrepared(Task, templateDb, reusedPrepared);
  // Even if refresh has not yet run, prepare compares the current revision.
  assert.equal((await Support.prepare(requestFor(), 'PERSONAL')).resume_context.template, null, 'an old checked control cannot grant reuse after save');
  await Support.refresh(); assert.equal(checkbox.checked, false, 'the saved task revision resets the visible checkbox');
  checkbox.checked = true;
  const previousRuntime = selectedRuntime;
  selectedRuntime = { ...selectedRuntime, execution_settings: { ...selectedRuntime.execution_settings, effective_settings: { synthetic_test_parameter: 'changed' } } };
  await Support.refresh(); assert.equal(checkbox.checked, false, 'an exact parameter identity change resets consent');
  selectedRuntime = previousRuntime; await Support.refresh(); assert.equal(checkbox.checked, false, 'returning to old settings does not restore an old selection');
  checkbox.checked = true; currentWorkspace = 'b'.repeat(32); await Support.refresh(); assert.equal(checkbox.checked, false, 'workspace scope change resets consent');
  currentWorkspace = WORKSPACE; await Support.refresh();
  delete globalThis.document;

  const evidenceDoc = documentFixture(), factualHeading = structuredClone(prepared.document_version);
  const humanSource = factualHeading.evidence_snapshot.evidence.find(source => source.role === 'CURRENT_HUMAN');
  factualHeading.deliverable.resume.blocks[1].text = 'Synthetic education facts';
  factualHeading.review.block_reviews[1].text = { status: 'SUPPORTED', source_refs: [humanSource.ref], source_states: ['CURRENT_TURN'], reason: 'Heading names an actual user-stated education fact.' };
  const headingEvidence = Support.evidenceView(evidenceDoc, factualHeading);
  assert.match(headingEvidence.textContent, /Synthetic education facts/);
  assert.match(headingEvidence.textContent, /Heading names an actual user-stated education fact/);
  assert.match(headingEvidence.textContent, /Generate a resume for Synthetic Name/, 'source field viewer keeps the exact original user statement');

  // A first task can cite a genuine unsaved earlier USER correction. Saving
  // it binds the exact historical source to the message proof and raw viewer.
  const priorHistory = conversationHistoryFixture('PERSONAL'), historicalDb = useDatabase(databaseFor(priorHistory.input));
  const historicalPacket = await Support.prepare(priorHistory.request, 'PERSONAL');
  assert.equal(historicalPacket.resume_context.prior_task, null);
  const historicalRaw = resultFor(historicalPacket.resume_context, priorHistory.request.runtime_snapshot, { historical_grounding: true });
  const historicalPrepared = await Support.prepareResult(historicalDb, priorHistory.request, { resume_task: historicalRaw });
  await commitPrepared(Task, historicalDb, historicalPrepared);
  const historicalMessage = { id: 'qa-reviewed-historical', role: 'ASSISTANT', text: historicalRaw.message,
    deliverable: historicalRaw.deliverable, resume_task: Support.metadata(historicalPrepared) };
  const historicalVersion = await Support.verifyMessage(historicalMessage);
  const historicalView = Support.evidenceView(evidenceDoc, historicalVersion);
  assert.match(historicalView.textContent, /未保存的对话自述|Unsaved conversational self report/);
  assert(historicalView.textContent.includes(PRIOR_HUMAN_CORRECTION));
  assert(historicalView.textContent.includes(priorHistory.prior[0].created_at));
  assert.match(historicalView.textContent, /Earlier actual user statement/, 'the independent reviewer reason is readable with the original words');
  const changedPrior = { ...priorHistory.prior[0], human_message: 'Edited historical statement after generation.' };
  historicalDb.data.get(priorHistory.store).set(changedPrior.turn_id, changedPrior);
  await assert.rejects(Support.verifyMessage(historicalMessage), /RESUME_/, 'a saved proof cannot mask an edited actual historical source');

  // Check an export using the persisted READY proof. A cached export keeps its
  // rendered URL but repeats the database/current-source gate on each click.
  useDatabase(db);
  const doc = documentFixture(), target = doc.createElement('section'), bubble = doc.createElement('div');
  bubble.className = 'v1-conversation-message'; bubble.dataset.messageKey = message.id;
  target.append(bubble); doc.body.append(target);
  const urls = [], revoked = [], originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = blob => { const url = `blob:qa-${urls.length}`; urls.push({ url, blob }); return url; };
  URL.revokeObjectURL = url => revoked.push(url);
  try {
    Output.decorate(target, [message]); await waitForDom(() => Boolean(target.querySelector('a') || target.querySelector('button')));
    const link = target.querySelector('a'); assert(link, target.textContent); assert.equal(urls.length, 1);
    assert.match(target.textContent, /逐条事实依据/); assert.match(target.textContent, /不等于外部事实核验/);
    let prevented = false;
    await link.listeners.get('click')({ preventDefault() { prevented = true; } });
    assert(prevented); assert.equal(doc.clicks.length, 1);
    Output.decorate(target, [message]); await settleDom(); assert.equal(urls.length, 1, 'refresh reuses the rendered reviewed file');
    db.data.get('candidate_context_revisions').set('qa-task-revision-1-2', { ...revision(1), revision_id: 'qa-task-revision-1-2', version: 2 });
    await link.listeners.get('click')({ preventDefault() {} });
    assert.equal(doc.clicks.length, 1, 'changed current data rejects even a cached download click');
    assert.match(target.textContent, /资料或简历版本已变化/);
    await assert.rejects(Support.verifyMessage(message), /RESUME_CONTEXT_CHANGED/);
    Output.dispose(target); assert.equal(revoked.length, 1);
    const deniedTarget = doc.createElement('section'), deniedBubble = doc.createElement('div');
    deniedBubble.className = 'v1-conversation-message'; deniedBubble.dataset.messageKey = 'qa-stale-render';
    deniedTarget.append(deniedBubble); doc.body.append(deniedTarget);
    Output.decorate(deniedTarget, [{ ...message, id: 'qa-stale-render' }]); await waitForDom(() => Boolean(deniedTarget.querySelector('a') || deniedTarget.querySelector('button')));
    assert.equal(deniedTarget.querySelector('a'), null, 'stale proof cannot render a download initially');
    assert.equal(urls.length, 1);
  } finally { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; }

  assert.equal(opens, closes, 'opened support database handles are closed across successful and failed branches');
} finally {
  for (const [key, value] of saved) if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
}
console.log('ResumeTask support: actual transport/fresh dispatch, stale scope/context strip, full packet/sealed evidence proof, shared atomic turn save/failure, clarification continuation, template consent revision/settings reset, factual SECTION source viewer, reviewed render/cache click gate and closed handles PASS');
