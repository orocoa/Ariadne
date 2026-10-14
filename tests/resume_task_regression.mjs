import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { databaseFor, sourceInput, requestFor, template, commitPrepared, revision, WORKSPACE, HUMAN, PRIOR_HUMAN_CORRECTION, NUMERIC_SOURCE, conversationHistoryFixture } from './helpers/resume-task-fixtures.mjs';
const require = createRequire(import.meta.url);
const Task = require('../public/resume-task-domain.js');
const Candidate = require('../public/job-candidate-context-domain.js');
const PersonalContext = require('../public/personal-context-domain.js');
const Output = require('../public/conversation-output.js');
const Job = require('../public/job-context-domain.js');
const JobConversation = require('../public/job-conversation-domain.js');
const Memory = require('../public/personal-memory-domain.js');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const python = process.env.ARIADNE_TEST_PYTHON || '/Users/kai/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';

async function fixture({ large = false, overLimit = false, database = null, human = HUMAN, templateValue = undefined,
  templateReuseConfirmed = false, priorVersionId = null, taskId = null, withTemplate = false, numericSource = false } = {}) {
  const input = sourceInput({ large, overLimit });
  if (numericSource) input.candidate_context_revisions[0].payload.items[0].facts.push({ label: 'Accepted numeric structured field', value: NUMERIC_SOURCE });
  const db = database || databaseFor(input), request = requestFor(human);
  if (withTemplate) { templateValue = template(); templateValue.archive.request_id = request.request_id; }
  const context = await Task.buildContext({ database: db, request, domain: 'PERSONAL', workspace: WORKSPACE,
    ...(templateValue === undefined ? {} : { template: templateValue }), templateReuseConfirmed, taskId, priorVersionId });
  const serialized = { context, runtime_snapshot: request.runtime_snapshot,
    intent: { instruction: human, template_name: context.template?.name || '', continue: Boolean(context.prior_task) } };
  // The runtime owns model protocol only. Its caller separately verifies these
  // synthetic two-page parts against the archived original/hash.
  if (context.template) serialized.attachment_parts = [
    { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/2Q==' } },
    { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/2Q==' } },
  ];
  return { db, request, ...serialized };
}

async function historyFixture(domain = 'PERSONAL', { count = 1, text = PRIOR_HUMAN_CORRECTION, workspace = WORKSPACE } = {}) {
  const history = conversationHistoryFixture(domain, { count, text });
  const db = databaseFor(history.input);
  const context = await Task.buildContext({ database: db, request: history.request, domain, workspace });
  return { ...history, db, context, runtime_snapshot: history.request.runtime_snapshot,
    intent: { instruction: context.current_human, template_name: '', continue: false } };
}

if (process.argv.includes('--fixture')) {
  const historyDomain = process.argv.includes('--history-domain') ? process.argv[process.argv.indexOf('--history-domain') + 1] : 'PERSONAL';
  let value = process.argv.includes('--with-history') ? await historyFixture(historyDomain, { count: process.argv.includes('--many-history') ? 55 : 1 })
    : await fixture({ large: process.argv.includes('--large'), withTemplate: process.argv.includes('--with-template'), numericSource: process.argv.includes('--numeric-source') });
  if (process.argv.includes('--continuation')) {
    const prior = await Task.validateResult(resultFor(value, { proposal_text: 'Modified packaging and designed posters. '.repeat(34) + 'PRIOR_DOC_FINAL_TAIL_DEPLOYMENT_BY_COLLEAGUES' }), value.context);
    await Task.assertFresh(value.db, prior); await commitPrepared(Task, value.db, prior);
    value = await fixture({ database: value.db, human: HUMAN + ' Translate every intended section of the complete previous draft.' });
  }
  await new Promise((resolve, reject) => process.stdout.write(JSON.stringify({ context: value.context, runtime_snapshot: value.runtime_snapshot, intent: value.intent,
    ...(value.attachment_parts ? { attachment_parts: value.attachment_parts } : {}) }) + '\n', error => error ? reject(error) : resolve()));
  process.exit(0);
}

function resultFor(value, extra = {}) {
  const input = { context: value.context, runtime_snapshot: value.runtime_snapshot, intent: value.intent,
    ...(value.attachment_parts ? { attachment_parts: value.attachment_parts } : {}), ...extra };
  const call = spawnSync(python, [resolve(root, 'tests/resume_task_runtime_regression.py'), '--result'], {
    cwd: root, input: JSON.stringify(input), encoding: 'utf8', maxBuffer: 2000000,
    env: { ...process.env, PYTHONPATH: root },
  });
  assert.equal(call.status, 0, call.stderr || call.stdout);
  return JSON.parse(call.stdout);
}

const first = await fixture({ large: true });
assert(Task.bytes(first.context) > 128000, 'fixture exercises full evidence above the old 24 KB retrieval budget');
assert.equal(first.context.evidence.length, 13, 'all twelve records plus the actual current user source');
for (let index = 1; index <= 12; index++) assert(JSON.stringify(first.context.evidence).includes(`TAIL_${index}_DEPLOYMENT_BY_COLLEAGUES`));
assert.equal(first.context.evidence.find(item => item.role === 'CURRENT_HUMAN').source_state, 'CURRENT_TURN', 'Human self-report is not externally verified');
await Task.assertContextFresh(first.db, first.context);
await assert.rejects(fixture({ overLimit: true }), /RESUME_EVIDENCE_LIMIT/);
const tampered = structuredClone(first.context); tampered.evidence[0].content.summary += 'changed';
await assert.rejects(Task.validateContext(tampered), /RESUME_CONTEXT_HASH_MISMATCH/);
const missing = structuredClone(first.context); missing.evidence.pop();
await assert.rejects(Task.validateContext(missing), /RESUME_CONTEXT_INVALID/);

const raw = resultFor(first), prepared = await Task.validateResult(raw, first.context);
assert.equal(prepared.status, 'READY');
assert.equal(prepared.document_version.evidence_snapshot.evidence.length, 13);
await Task.assertFresh(first.db, prepared); await commitPrepared(Task, first.db, prepared);
assert.equal(first.db.data.get('resume_tasks').size, 1); assert.equal(first.db.data.get('resume_document_versions').size, 1);
assert.equal(first.db.data.get('candidate_context_revisions').size, 12, 'artifact persistence never confirms or changes Candidate data');
const restored = await Task.restore(first.db, first.context.scope);
assert.deepEqual(restored.version.deliverable, raw.deliverable);
assert.equal(restored.version.review.status, 'READY');
await assert.rejects(commitPrepared(Task, first.db, prepared), /RESUME_TASK_VERSION_CONFLICT/);
await assert.rejects(Task.assertContextFresh(first.db, first.context), /RESUME_TASK_VERSION_CONFLICT/, 'a concurrently completed first task is rejected before another dispatch');

const resumed = await fixture({ database: first.db, human: HUMAN + ' Translate the complete previous draft.' });
assert(resumed.context.prior_version, 'ready full document survives reopening');
assert.equal(resumed.context.prior_version.evidence_snapshot, null, 'full current records are not duplicated as old source packets');
assert(Task.bytes(resumed.context) < 256000);
assert.deepEqual(resumed.context.prior_version.deliverable, raw.deliverable);
assert(resumed.context.evidence.some(item => item.role === 'TASK_HUMAN_UNCONFIRMED'));
const falseHistory = structuredClone(resumed.context), historicalSource = falseHistory.evidence.find(item => item.role === 'TASK_HUMAN_UNCONFIRMED');
historicalSource.content.text = 'Fabricated statement from another conversation.';
falseHistory.evidence_manifest.find(item => item.ref === historicalSource.ref).semantic_hash = await Task.fingerprint(historicalSource.content);
falseHistory.context_fingerprint = await Task.fingerprint(Object.fromEntries(Object.entries(falseHistory).filter(([key]) => key !== 'context_fingerprint')));
await assert.rejects(Task.validateContext(falseHistory), /RESUME_CONTEXT_/, 'a resealed earlier-Human source must be an actual statement in this task and Candidate version');
const falseHumanHash = structuredClone(first.context), currentHumanSource = falseHumanHash.evidence.find(item => item.role === 'CURRENT_HUMAN');
falseHumanHash.evidence_manifest.find(item => item.ref === currentHumanSource.ref).semantic_hash = 'sha256:' + '0'.repeat(64);
falseHumanHash.context_fingerprint = await Task.fingerprint(Object.fromEntries(Object.entries(falseHumanHash).filter(([key]) => key !== 'context_fingerprint')));
await assert.rejects(Task.validateContext(falseHumanHash), /RESUME_CONTEXT_/, 'a resealed context still requires the exact actual Human content digest');

const fail = await fixture(), failedPrepared = await Task.validateResult(resultFor(fail), fail.context);
await Task.assertFresh(fail.db, failedPrepared); fail.db.failNextCommit = true;
await assert.rejects(commitPrepared(Task, fail.db, failedPrepared), /synthetic_atomic_commit_failure/);
assert.equal(fail.db.data.get('resume_tasks').size, 0); assert.equal(fail.db.data.get('resume_document_versions').size, 0);

const race = await fixture(), rawRace = resultFor(race);
const a = await Task.validateResult(rawRace, race.context), b = await Task.validateResult(rawRace, race.context);
await Task.assertFresh(race.db, a); await Task.assertFresh(race.db, b);
await commitPrepared(Task, race.db, a);
await assert.rejects(commitPrepared(Task, race.db, b), /RESUME_TASK_VERSION_CONFLICT/);
assert.equal(race.db.data.get('resume_document_versions').size, 1);

const changed = await fixture(), changedPrepared = await Task.validateResult(resultFor(changed), changed.context);
changed.db.data.get('candidate_context_revisions').set('qa-task-revision-1-2', { ...revision(1, 'Current replacement responsibility'), revision_id: 'qa-task-revision-1-2', version: 2 });
await assert.rejects(Task.assertContextFresh(changed.db, changed.context), /RESUME_CONTEXT_CHANGED/, 'source changes must fail before dispatch, as well as before save');
await assert.rejects(Task.assertFresh(changed.db, changedPrepared), /RESUME_CONTEXT_CHANGED/);
await assert.rejects(commitPrepared(Task, changed.db, changedPrepared), /RESUME_CONTEXT_CHANGED/);
assert.equal(changed.db.data.get('resume_document_versions').size, 0);

// A packet built without a database cannot establish completeness by its own
// manifest. Dispatch rereads the actual synthetic database and acquires a guard.
const detachedDb = databaseFor(sourceInput()), detachedRequest = requestFor();
const detachedSnapshot = await Candidate.buildSnapshot(sourceInput());
const detachedContext = await Task.buildContext({ database: null, request: detachedRequest, sourceSnapshot: detachedSnapshot, domain: 'PERSONAL', workspace: WORKSPACE });
await Task.assertContextFresh(detachedDb, detachedContext);
const detached = { context: detachedContext, runtime_snapshot: detachedRequest.runtime_snapshot, intent: { instruction: HUMAN, template_name: '', continue: false } };
const detachedPrepared = await Task.validateResult(resultFor(detached), detachedContext);
await Task.assertFresh(detachedDb, detachedPrepared);
await commitPrepared(Task, detachedDb, detachedPrepared);
assert.equal(detachedDb.data.get('resume_document_versions').size, 1);
const incompleteDb = databaseFor(sourceInput());
const incompleteSnapshot = await Candidate.buildSnapshot({ candidate_context_revisions: [revision(1)] });
const incompleteContext = await Task.buildContext({ database: null, request: detachedRequest, sourceSnapshot: incompleteSnapshot, domain: 'PERSONAL', workspace: WORKSPACE });
await Task.validateContext(incompleteContext);
await assert.rejects(Task.assertContextFresh(incompleteDb, incompleteContext), /RESUME_CONTEXT_CHANGED/, 'a resealed internally consistent partial packet is not full database coverage');

const rawSourceChange = await fixture();
rawSourceChange.db.data.get('source_documents').set('qa-unrelated-source', { source_document_id: 'qa-unrelated-source', synthetic_status: 'new availability' });
await assert.rejects(Task.assertContextFresh(rawSourceChange.db, rawSourceChange.context), /RESUME_CONTEXT_CHANGED/, 'the captured source read-set is rechecked immediately before dispatch');

const old = { kind: 'PDF', title: 'Legacy v1 report', body: 'Original historical text.', nodes: [], edges: [] };
assert.deepEqual(Output.fromResult({ deliverable: old, delivery_version: 'ariadne-conversation-delivery-v1' }), old);

// A blocked review advances only recoverable task context; it never creates an
// employer-facing file version or replaces the previous successful document.
const blocked = await fixture(), blockedRaw = resultFor(blocked, { review_status: 'REVISION_REQUIRED', proposal_text: 'Designed 20 products and managed 8 suppliers.' });
assert.equal(blockedRaw.status, 'REVISION_REQUIRED'); assert.equal(blockedRaw.deliverable, null);
const blockedPrepared = await Task.validateResult(blockedRaw, blocked.context);
assert.equal(blockedPrepared.document_version, null);
await Task.assertFresh(blocked.db, blockedPrepared); await commitPrepared(Task, blocked.db, blockedPrepared);
assert.equal(blocked.db.data.get('resume_document_versions').size, 0);
assert.equal((await Task.restore(blocked.db, blocked.context.scope)).task.latest_status, 'REVISION_REQUIRED');
const fakeReady = structuredClone(blockedRaw); fakeReady.status = 'READY'; fakeReady.deliverable = fakeReady.proposal;
await assert.rejects(Task.validateResult(fakeReady, blocked.context), /RESUME_REVIEW_/);

const clarify = await fixture({ human: HUMAN.replace('Generate a resume for Synthetic Name.', 'Generate a resume; my name has not been supplied.') });
const question = await Task.validateResult(resultFor(clarify, { generation_status: 'NEEDS_FACTS' }), clarify.context);
await Task.assertFresh(clarify.db, question); await commitPrepared(Task, clarify.db, question);
const unanswered = await Task.restore(clarify.db, clarify.context.scope);
assert.equal(unanswered.task.current_version, 0); assert.equal(unanswered.version, null);
assert.match(unanswered.task.last_result_message, /What name/);
const answer = await fixture({ database: clarify.db, human: HUMAN });
assert(answer.context.evidence.some(item => item.role === 'TASK_HUMAN_UNCONFIRMED' && item.content.text.includes('name has not been supplied')));
assert.equal(answer.context.prior_version, null);
const answered = await Task.validateResult(resultFor(answer), answer.context);
await Task.assertFresh(answer.db, answered); await commitPrepared(Task, answer.db, answered);
assert.equal(answered.task.revision, 2); assert.equal(answered.document_version.version, 1);
assert.equal(answered.document_version.parent_version_id, null);

const templated = await fixture({ withTemplate: true }), templateRaw = resultFor(templated);
const templatePrepared = await Task.validateResult(templateRaw, templated.context);
await Task.assertFresh(templated.db, templatePrepared); await commitPrepared(Task, templated.db, templatePrepared);
// A format limitation preserves the exact prior complete version and template.
const unsupportedContext = await fixture({ database: templated.db, templateReuseConfirmed: true });
const unsupportedRaw = resultFor(unsupportedContext, { generation_status: 'NEEDS_FACTS' });
unsupportedRaw.status = 'FORMAT_UNSUPPORTED'; unsupportedRaw.message = 'Photos are unsupported; two-column text layout is available.';
const unsupported = await Task.validateResult(unsupportedRaw, unsupportedContext.context);
assert.equal(unsupported.document_version, null);
assert.equal(unsupported.task.current_version_id, templatePrepared.document_version.version_id);
assert.deepEqual(unsupported.task.template, templated.context.template);
await Task.assertFresh(templated.db, unsupported); await commitPrepared(Task, templated.db, unsupported);
const formatRestored = await Task.restore(templated.db, unsupportedContext.context.scope);
assert.equal(formatRestored.task.latest_status, 'FORMAT_UNSUPPORTED');
assert.equal(formatRestored.version.version_id, templatePrepared.document_version.version_id);
const forgedFormat = structuredClone(unsupportedRaw); forgedFormat.deliverable = templateRaw.deliverable;
await assert.rejects(Task.validateResult(forgedFormat, unsupportedContext.context), /RESUME_RESULT_INVALID/);

const noReuse = await fixture({ database: templated.db }); assert.equal(noReuse.context.template, null);
const reuse = await fixture({ database: templated.db, templateReuseConfirmed: true });
assert.deepEqual(reuse.context.template, templated.context.template); assert.equal(reuse.context.consent.template_reuse_confirmed, true);
await assert.rejects(Task.withTemplate(reuse.context, template({ workspace: 'b'.repeat(32) })), /RESUME_TEMPLATE_SCOPE_MISMATCH/);
const changedHash = structuredClone(templateRaw); changedHash.template.content_hash = 'sha256:' + 'c'.repeat(64);
await assert.rejects(Task.validateResult(changedHash, templated.context), /RESUME_RESULT_INVALID/);

// Explicit old versions read the complete artifact, independently of the
// 1200-character prior-message display excerpt. The old bytes remain immutable.
const versions = await fixture(), firstTail = 'Modified packaging and designed posters. '.repeat(34) + 'Final contribution remains packaging and poster design.';
const versionOne = await Task.validateResult(resultFor(versions, { proposal_text: firstTail }), versions.context);
await Task.assertFresh(versions.db, versionOne); await commitPrepared(Task, versions.db, versionOne);
const originalVersion = structuredClone(versionOne.document_version);
const versionTwoContext = await fixture({ database: versions.db, human: HUMAN + ' Use wording: Designed posters and modified packaging.' });
const versionTwo = await Task.validateResult(resultFor(versionTwoContext, { proposal_text: 'Designed posters and modified packaging.' }), versionTwoContext.context);
await Task.assertFresh(versions.db, versionTwo); await commitPrepared(Task, versions.db, versionTwo);
assert.equal(versionTwo.document_version.version, 2);
const chosenOld = await fixture({ database: versions.db, human: HUMAN, priorVersionId: versionOne.document_version.version_id });
assert.equal(chosenOld.context.prior_version.deliverable.resume.blocks.at(-1).text, firstTail);
assert.equal((await Task.restore(versions.db, versions.context.scope)).version.version_id, versionTwo.document_version.version_id);
assert.deepEqual((await Task.restore(versions.db, versions.context.scope, { versionId: versionOne.document_version.version_id })).version, originalVersion);
assert(!Output.historyText({ message: 'Old artifact', deliverable: originalVersion.deliverable }).includes('Final contribution remains packaging and poster design.'));
assert(Task.providerView(chosenOld.context).prior_document.resume.blocks.at(-1).text.endsWith('Final contribution remains packaging and poster design.'));
await assert.rejects(Task.restore(versions.db, versions.context.scope, { versionId: 'unknown-version' }), /RESUME_DOCUMENT_UNAVAILABLE/);
const corrupt = structuredClone(originalVersion); corrupt.evidence_snapshot = null;
await assert.rejects(Task.validateDocument(corrupt), /RESUME_DOCUMENT_EVIDENCE_MISSING/);
corrupt.evidence_snapshot = structuredClone(originalVersion.evidence_snapshot);
corrupt.grounding[0].text_source_refs = ['unknown-ref']; corrupt.review.block_reviews[0].text.source_refs = ['unknown-ref'];
await assert.rejects(Task.validateDocument(corrupt), /RESUME_GROUNDING_INVALID|RESUME_REVIEW_INVALID/);
const alteredBasis = structuredClone(originalVersion), alteredHuman = alteredBasis.evidence_snapshot.evidence.find(item => item.role === 'CURRENT_HUMAN');
alteredHuman.content.text = 'Synthetic changed source: I personally performed all deployments.';
await assert.rejects(Task.validateDocument(alteredBasis), /RESUME_DOCUMENT_EVIDENCE_/, 'stored original basis fields cannot change under an old snapshot seal');
alteredBasis.evidence_hash = await Task.fingerprint(alteredBasis.evidence_snapshot);
await assert.rejects(Task.validateDocument(alteredBasis), /RESUME_DOCUMENT_EVIDENCE_HASH_MISMATCH/, 'a new snapshot seal still cannot preserve an obsolete Human source digest');
const changedAuthority = structuredClone(originalVersion), authorityHuman = changedAuthority.evidence_snapshot.evidence.find(item => item.role === 'CURRENT_HUMAN');
authorityHuman.source_state = 'ORIGINAL_AVAILABLE';
for (const blockReview of changedAuthority.review.block_reviews) for (const field of ['text', 'right']) {
  const verdict = blockReview[field]; verdict.source_refs.forEach((ref, index) => { if (ref === authorityHuman.ref) verdict.source_states[index] = 'ORIGINAL_AVAILABLE'; });
}
changedAuthority.evidence_hash = await Task.fingerprint(changedAuthority.evidence_snapshot);
await assert.rejects(Task.validateDocument(changedAuthority), /RESUME_DOCUMENT_INVALID/, 'current Human role cannot be relabeled as an original even after recomputing its snapshot seal');

versions.db.data.get('candidate_context_lifecycle').set('removed', { context_id: 'qa-task-context-1', item_id: 'qa-task-item-1', state: 'REMOVED', authority: 'AUTHORITATIVE_USER_DECISION' });
const withdrawn = await fixture({ database: versions.db });
assert.equal(withdrawn.context.prior_version.document_hash, (await Task.restore(versions.db, withdrawn.context.scope)).version.document_hash, 'retain complete old draft as editing data after Candidate withdrawal');
assert.equal(withdrawn.context.prior_version.evidence_snapshot, null, 'old evidence never becomes current sources');
assert(!withdrawn.context.evidence.some(item => item.role === 'TASK_HUMAN_UNCONFIRMED'), 'old self-reports are not reintroduced after evidence scope changed');
await assert.rejects(Task.assertDocumentFresh(versions.db, originalVersion), /RESUME_CONTEXT_CHANGED/);

// Current target Job content is a separate requirement context. It is never
// inserted into personal factual sources, and its revision is checked twice.
const jobProposal = Job.proposalFor({ source: { source_document_id: 'qa-job-source' }, artifact: { payload: { extracted_text: 'Product Designer\nSynthetic Studio\nShanghai\nRequirements\n- Packaging design and user research.' } },
  structuring_run: { run_id: 'qa-job-run', runtime_snapshot_id: 'qa-job-runtime' } });
const jobRevision = Job.reviewOutcome({ proposal: jobProposal, decision: 'CONFIRM' }).revision;
const jobDb = databaseFor({ ...sourceInput(), job_context_revisions: [jobRevision] });
const jobRequest = requestFor();
jobRequest.runtime_snapshot = JobConversation.createRuntimeSnapshot({ runtime: { mode: 'model', provider: 'deepseek', model: 'deepseek-flash' } });
jobRequest.conversation = { conversation_id: 'qa-selected-job-resume' };
jobRequest.observation = { job_context_id: jobRevision.context_id, job_revision_id: jobRevision.revision_id, job_revision_version: jobRevision.version };
const jobContext = await Task.buildContext({ database: jobDb, request: jobRequest, domain: 'JOB', workspace: WORKSPACE });
await Task.assertContextFresh(jobDb, jobContext);
assert.deepEqual(jobContext.job_context.content, jobRevision.payload);
assert(!jobContext.evidence.some(item => item.role.startsWith('JOB')), 'Job requirements cannot become personal evidence refs');
const jobFixture = { context: jobContext, runtime_snapshot: jobRequest.runtime_snapshot, intent: { instruction: HUMAN, template_name: '', continue: false } };
const jobPrepared = await Task.validateResult(resultFor(jobFixture), jobContext);
await Task.assertFresh(jobDb, jobPrepared); await commitPrepared(Task, jobDb, jobPrepared);
await Task.assertDocumentFresh(jobDb, jobPrepared.document_version);
const newJob = { ...structuredClone(jobRevision), revision_id: 'qa-job-revision-new', previous_revision_id: jobRevision.revision_id, version: 2,
  payload: { ...structuredClone(jobRevision.payload), summary: 'New exact requirement at the tail.' } };
jobDb.data.get('job_context_revisions').set(newJob.revision_id, newJob);
await assert.rejects(Task.assertContextFresh(jobDb, jobContext), /RESUME_CONTEXT_CHANGED|RESUME_JOB_CONTEXT_CHANGED/, 'exact Job source/version change is rejected before dispatch');
await assert.rejects(Task.assertDocumentFresh(jobDb, jobPrepared.document_version), /RESUME_JOB_CONTEXT_CHANGED/);
await assert.rejects(Task.buildContext({ database: jobDb, request: jobRequest, domain: 'JOB', workspace: WORKSPACE }), /RESUME_JOB_CONTEXT_CHANGED/);

// The first resume task must see actual earlier Human utterances in its exact
// conversation. A task head cannot supply this continuity on the first turn.
for (const domain of ['CANDIDATE', 'JOB', 'PERSONAL', 'JOB_OVERVIEW']) {
  const history = await historyFixture(domain), words = JSON.stringify(history.context.evidence);
  const sources = history.context.evidence.filter(item => item.role === 'CONVERSATION_HUMAN_UNCONFIRMED');
  assert.equal(history.context.prior_task, null); assert.equal(sources.length, 1, domain);
  assert.equal(sources[0].source_state, 'CONVERSATION_HISTORY_UNCONFIRMED');
  assert.equal(sources[0].content.text, PRIOR_HUMAN_CORRECTION);
  assert.equal(sources[0].content.created_at, history.prior[0].created_at);
  assert(!words.includes('ASSISTANT_ONLY_CORRECTION_MUST_NOT_BECOME_FACTS'), 'assistant claims are never evidence');
  assert(!words.includes('Other chat Human exclusion marker'), 'a different selected conversation never enters');
  const manifest = history.context.evidence_manifest.find(item => item.ref === sources[0].ref);
  const rowId = history.prior[0].message_id || history.prior[0].turn_id;
  assert.equal(manifest.identity, `conversation-human:${history.store}:${rowId}`);
  assert.equal(manifest.semantic_hash, await Task.fingerprint(sources[0].content));
  assert.deepEqual(manifest.source_ids, []);
  await Task.assertContextFresh(history.db, history.context);
  const snapshotWithoutHistory = await Candidate.buildSnapshot(sourceInput());
  const detachedHistory = await Task.buildContext({ database: null, sourceSnapshot: snapshotWithoutHistory,
    request: history.request, domain, workspace: WORKSPACE });
  await assert.rejects(Task.assertContextFresh(history.db, detachedHistory), /RESUME_HISTORY_SOURCE_GUARD_REQUIRED/,
    'a packet made from Candidate alone cannot attest to omitted durable same-chat Human sources');
  const archivedRaw = resultFor(history, { historical_grounding: true });
  const archived = await Task.validateResult(archivedRaw, history.context);
  assert(Task.transactionStores(archived).includes(history.store));
  for (const store of Object.values(Task.HISTORY_STORES).filter(store => store !== history.store)) assert(!Task.transactionStores(archived).includes(store));
  await Task.assertFresh(history.db, archived); await commitPrepared(Task, history.db, archived);
  assert.equal(archived.document_version.evidence_snapshot.evidence.find(item => item.role === 'CONVERSATION_HUMAN_UNCONFIRMED').content.text, PRIOR_HUMAN_CORRECTION);
  assert.equal(archived.document_version.review.block_reviews.at(-1).text.source_refs[0], sources[0].ref);

  // Source projection freshness ignores mutable completion fields and later
  // messages. Those do not rewrite the selected historical statement.
  const currentKey = history.current.message_id || history.current.turn_id;
  history.db.data.get(history.store).set(currentKey, { ...history.current, status: 'SUCCEEDED', output: { message: 'Current request completed.' } });
  const later = history.make(92, 'A later actual user question that is not part of this old document.');
  history.db.data.get(history.store).set(later.message_id || later.turn_id, later);
  const assistantRow = ['PERSONAL', 'JOB_OVERVIEW'].includes(domain) ? history.prior[0] : history.assistant;
  history.db.data.get(history.store).set(assistantRow.message_id || assistantRow.turn_id, { ...assistantRow, output: { message: 'Changed assistant commentary.' } });
  await Task.assertDocumentFresh(history.db, archived.document_version);
  const textField = domain === 'CANDIDATE' ? 'text' : domain === 'JOB' ? 'content' : 'human_message';
  history.db.data.get(history.store).set(rowId, { ...history.prior[0], [textField]: 'Changed earlier actual responsibility.' });
  await assert.rejects(Task.assertDocumentFresh(history.db, archived.document_version), /RESUME_/, 'changing the selected historical statement invalidates its original basis');
  history.db.data.get(history.store).delete(rowId);
  await assert.rejects(Task.assertDocumentFresh(history.db, archived.document_version), /RESUME_/, 'a missing selected historical statement is not silently replaced');

  const dispatch = await historyFixture(domain), ownKey = dispatch.current.message_id || dispatch.current.turn_id;
  dispatch.db.data.get(dispatch.store).set(ownKey, { ...dispatch.current, status: 'SUCCEEDED', output: { message: 'Self completion status only.' } });
  const dispatchAssistant = ['PERSONAL', 'JOB_OVERVIEW'].includes(domain) ? dispatch.prior[0] : dispatch.assistant;
  dispatch.db.data.get(dispatch.store).set(dispatchAssistant.message_id || dispatchAssistant.turn_id, { ...dispatchAssistant, output: { message: 'Unrelated assistant change.' } });
  await Task.assertContextFresh(dispatch.db, dispatch.context);
  const selectedKey = dispatch.prior[0].message_id || dispatch.prior[0].turn_id;
  const beforeEdit = await Task.validateResult(resultFor(dispatch, { historical_grounding: true }), dispatch.context);
  await Task.assertFresh(dispatch.db, beforeEdit);
  dispatch.db.data.get(dispatch.store).set(selectedKey, { ...dispatch.prior[0], [textField]: 'Prior contribution text changed before save.' });
  await assert.rejects(Task.assertContextFresh(dispatch.db, dispatch.context), /RESUME_/, 'selected prior Human changes are rejected before provider dispatch');
  await assert.rejects(Task.assertFresh(dispatch.db, beforeEdit), /RESUME_/, 'selected prior Human changes are rejected after provider execution');
  await assert.rejects(commitPrepared(Task, dispatch.db, beforeEdit), /RESUME_/, 'selected prior Human changes are rechecked in the same save transaction');
  assert.equal(dispatch.db.data.get('resume_document_versions').size, 0);

  const foreign = await historyFixture(domain, { workspace: 'b'.repeat(32), text: 'Foreign workspace actual Human marker' });
  assert(!JSON.stringify(history.context.evidence).includes('Foreign workspace actual Human marker'));
  assert.equal(foreign.context.scope.workspace, 'b'.repeat(32));
}

const manyHistory = await historyFixture('PERSONAL', { count: 55 });
assert.equal(manyHistory.context.evidence.filter(item => item.role === 'CONVERSATION_HUMAN_UNCONFIRMED').length, 55, 'ordinary 48-turn display/history budget cannot truncate complete task Human sources');
for (let index = 1; index <= 55; index++) assert(JSON.stringify(manyHistory.context.evidence).includes(`ROW_${index}_TAIL`));
await assert.rejects(historyFixture('PERSONAL', { count: 55, text: 'Long actual user statement. '.repeat(280) + 'History final tail' }), /RESUME_EVIDENCE_LIMIT/, 'oversized complete history fails instead of silently choosing a recent subset');

// A saved-and-retracted note must not be resurrected via its original typed
// statement. Exercise the existing memory Save/Retract APIs and real lineage.
const memoryHistory = await historyFixture('PERSONAL');
const originTurn = memoryHistory.prior[0];
const rawMemory = { operation: 'ADD', kind: 'CORRECTION', text: PRIOR_HUMAN_CORRECTION, human_quote: PRIOR_HUMAN_CORRECTION,
  reason: 'User explicitly saves a responsibility correction.', target_memory_ref: null, related_refs: [] };
const proposal = Memory.createProposal(rawMemory, { human_message: PRIOR_HUMAN_CORRECTION, origin: { type: 'PERSONAL', turn_id: originTurn.turn_id } });
await Memory.write(memoryHistory.db, 'personal_memory_proposals', proposal);
const savedMemory = await Memory.decide(memoryHistory.db, proposal.proposal_id, 'SAVE');
const retract = Memory.createProposal({ ...rawMemory, operation: 'RETRACT', target_memory_ref: 'selected-memory' },
  { human_message: PRIOR_HUMAN_CORRECTION, origin: { type: 'PERSONAL_MEMORY_CONTROL' }, memories: [{ ...savedMemory.revision, ref: 'selected-memory' }] });
await Memory.write(memoryHistory.db, 'personal_memory_proposals', retract); await Memory.decide(memoryHistory.db, retract.proposal_id, 'SAVE');
const retractedContext = await Task.buildContext({ database: memoryHistory.db, request: memoryHistory.request, domain: 'PERSONAL', workspace: WORKSPACE });
assert(!JSON.stringify(retractedContext.evidence).includes('PRIOR_UNSAVED_CORRECTION_TAIL'), 'a retracted memory cannot reappear from its old Human origin or quote');
const legacyIntake = { turn_id: 'qa-legacy-intake', kind: 'INTAKE', status: 'SUCCEEDED', human_message: 'Raw imported source instructions should never count as typed Human.', created_at: '2026-10-14T00:00:00Z', origin: { type: 'SOURCE_IMPORT' } };
memoryHistory.db.data.get('personal_conversation_turns').set(legacyIntake.turn_id, legacyIntake);
const noIntake = await Task.buildContext({ database: memoryHistory.db, request: memoryHistory.request, domain: 'PERSONAL', workspace: WORKSPACE });
assert(!JSON.stringify(noIntake.evidence).includes('Raw imported source instructions'), 'source/import records are not actual Human instructions');

// IDs and exact quotations are different established lineage forms. They must
// all withdraw the old raw statement without a semantic keyword classifier.
for (const [domain, operation, lineage] of [['CANDIDATE', 'RETRACT', 'message'], ['JOB', 'REPLACE', 'turn'], ['JOB_OVERVIEW', 'RETRACT', 'quote']]) {
  const history = await historyFixture(domain), row = history.prior[0];
  const origin = { type: domain, ...(lineage === 'message' ? { message_id: row.message_id } : lineage === 'turn' ? { turn_id: row.turn_id } : {}) };
  const old = Memory.createProposal(rawMemory, { human_message: PRIOR_HUMAN_CORRECTION, origin });
  await Memory.write(history.db, 'personal_memory_proposals', old);
  const saved = await Memory.decide(history.db, old.proposal_id, 'SAVE');
  const replacementWords = 'Replacement actual statement: a different current contribution.';
  const changed = Memory.createProposal({ ...rawMemory, operation, target_memory_ref: 'selected-memory',
    text: replacementWords, human_quote: replacementWords }, { human_message: replacementWords,
    origin: { type: 'PERSONAL_MEMORY_CONTROL' }, memories: [{ ...saved.revision, ref: 'selected-memory' }] });
  await Memory.write(history.db, 'personal_memory_proposals', changed); await Memory.decide(history.db, changed.proposal_id, 'SAVE');
  const after = await Task.buildContext({ database: history.db, request: history.request, domain, workspace: WORKSPACE });
  assert(!after.evidence.some(item => item.role === 'CONVERSATION_HUMAN_UNCONFIRMED' && item.content.text === PRIOR_HUMAN_CORRECTION), `${domain}/${operation}/${lineage}`);
  if (operation === 'REPLACE') assert(after.evidence.some(item => item.role === 'PERSONAL_CORRECTION' && item.content.summary === replacementWords));
}

const invalidatedSource = await historyFixture('PERSONAL');
const candidateSnapshot = await Candidate.buildSnapshot(sourceInput()), relatedRecords = PersonalContext.records(candidateSnapshot), related = relatedRecords[0];
const bound = Memory.createProposal({ ...rawMemory, related_refs: [related.ref] }, { human_message: PRIOR_HUMAN_CORRECTION,
  origin: { type: 'PERSONAL', turn_id: invalidatedSource.prior[0].turn_id }, evidence: relatedRecords });
await Memory.write(invalidatedSource.db, 'personal_memory_proposals', bound); await Memory.decide(invalidatedSource.db, bound.proposal_id, 'SAVE');
invalidatedSource.db.data.get('candidate_context_lifecycle').set('qa-source-removed', { lifecycle_id: 'qa-source-removed',
  context_id: related.lineage.context_id, item_id: 'qa-task-item-1', state: 'REMOVED', authority: 'AUTHORITATIVE_USER_DECISION' });
const noRevival = await Task.buildContext({ database: invalidatedSource.db, request: invalidatedSource.request, domain: 'PERSONAL', workspace: WORKSPACE });
assert(!noRevival.evidence.some(item => item.role === 'CONVERSATION_HUMAN_UNCONFIRMED' && item.content.text === PRIOR_HUMAN_CORRECTION), 'invalidated bound Candidate evidence cannot be restored through its old Human origin');

const numeric = await fixture({ numericSource: true });
const numericFact = numeric.context.evidence[0].content.facts.find(item => item.label === 'Accepted numeric structured field');
assert.deepEqual(numericFact.value, NUMERIC_SOURCE, 'accepted nested numeric data survives real current Candidate retrieval');
await Task.assertContextFresh(numeric.db, numeric.context);
const numericPrepared = await Task.validateResult(resultFor(numeric), numeric.context);
await Task.assertFresh(numeric.db, numericPrepared); await commitPrepared(Task, numeric.db, numericPrepared);
assert.deepEqual((await Task.restore(numeric.db, numeric.context.scope)).version.evidence_snapshot.evidence[0].content.facts.find(item => item.label === numericFact.label).value, NUMERIC_SOURCE);

console.log('ResumeTask: full >128 KB/tails, sealed ledger, 4 scoped actual-Human stores/first-task history/withdrawal/projection freshness, omitted-history rejection, numeric wire round-trip, source/context/CAS gates, template continuity, NEEDS_FACTS, old complete versions, Job scope and v1 history PASS');
