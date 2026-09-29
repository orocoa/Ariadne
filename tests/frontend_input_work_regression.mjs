import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../public/v1-pages.js', import.meta.url), 'utf8');
function functionSource(name, next) {
  const start = source.indexOf(`  ${name}`), end = source.indexOf(`  ${next}`, start);
  assert.ok(start >= 0 && end > start); return source.slice(start, end);
}
const mapCode = functionSource('async function mapSourceReads(', 'function prepareCurrentJobPaste(');
const mapSourceReads = vm.runInNewContext(`${mapCode}; mapSourceReads`, {});
let active = 0, peak = 0, started = [];
const output = await mapSourceReads([0, 1, 2, 3, 4, 5], async value => {
  started.push(value); peak = Math.max(peak, ++active);
  await new Promise(resolve => setTimeout(resolve, value % 2 ? 1 : 5)); active--; return value * 10;
});
assert.deepEqual([...output], [0, 10, 20, 30, 40, 50]); assert.equal(peak, 2, 'at most two original source reads run together');
started = []; let settled = false;
await assert.rejects(mapSourceReads([0, 1, 2, 3], async value => {
  started.push(value);
  if (!value) throw Error('source unreadable');
  await new Promise(resolve => setTimeout(resolve, 5)); settled = true;
}), /source unreadable/);
assert.deepEqual(started, [0, 1]); assert.equal(settled, true, 'all in-flight readers settle before the database closes');
const controller = new AbortController(); controller.abort();
await assert.rejects(mapSourceReads([0, 1], () => assert.fail('cancelled read cannot start'), controller.signal), { name: 'AbortError' });

const prepareCode = functionSource('function prepareCurrentJobPaste(', 'function initJobImport(');
let completeHash, opened = 0, closed = 0, reads = 0, renders = 0;
const input = { value: 'first paste' };
const context = {
  window: { clearTimeout() {} }, jobPasteTimer: null, jobPastePreparation: null, jobPastePending: true, jobSelectionVersion: 1,
  selectedJobImportType: 'Paste', selectedJobSource: null, selectedJobSources: [], crypto: { randomUUID: () => 'synthetic' },
  byId: id => id === 'job-paste-input' ? input : { value: '' },
  LocalJob: { preparePastedText: () => new Promise(resolve => { completeHash = resolve; }) },
  Truth: { openDatabase: async () => { opened++; return { close() { closed++; } }; } },
  refreshJobImportGate: () => ({ authority: { runtime: { mode: 'local' } } }),
  jobSourceImportState: async () => { reads++; return 'NEW'; },
  beginJobImportLifecycle() {}, showJobSource() {},
  renderAwaitingJobReviews: async () => { renders++; }, ModelImportLifecycle: { STATES: {} },
};
vm.createContext(context); vm.runInContext(prepareCode, context);
const stale = context.prepareCurrentJobPaste();
input.value = 'new paste'; context.jobSelectionVersion++;
completeHash({ source_document_id: 'old-hash' }); await stale;
assert.equal(opened, 0, 'obsolete hashing result must not start full-table reads');
const current = context.prepareCurrentJobPaste();
assert.equal(context.prepareCurrentJobPaste(), current, 'flush shares an already-running preparation');
completeHash({ source_document_id: 'new-hash' }); await current;
assert.equal(opened, 1); assert.equal(closed, 1); assert.equal(reads, 1); assert.equal(renders, 1);
assert.equal(context.selectedJobSource.source_document_id, 'new-hash'); assert.equal(context.jobPastePending, false);
context.jobPastePending = true; context.jobSelectionVersion++;
context.jobSourceImportState = async () => { throw Error('storage unavailable'); };
const failed = context.prepareCurrentJobPaste(); completeHash({ source_document_id: 'retry' });
await assert.rejects(failed, /storage unavailable/); assert.equal(closed, 2, 'failed preparation closes its connection');

const eventStart = source.indexOf('    byId("job-paste-input").addEventListener("input", () => {');
const eventEnd = source.indexOf('    jobSourceInputBinding = SourceInput.bind({', eventStart);
let inputHandler, pendingTimer, expensive = 0, resets = 0;
const eventContext = {
  byId: () => ({ value: 'typing', addEventListener: (_name, fn) => { inputHandler = fn; } }),
  resetJobSource: () => { resets++; pendingTimer = null; }, jobSelectionVersion: 0, jobPastePending: false,
  window: { setTimeout: (fn, delay) => { assert.equal(delay, 200); pendingTimer = fn; return 1; } },
  prepareCurrentJobPaste: async () => { expensive++; }, showJobError: assert.fail,
};
vm.runInNewContext(source.slice(eventStart, eventEnd), eventContext);
for (let i = 0; i < 100; i++) inputHandler();
assert.equal(expensive, 0); assert.equal(resets, 100, 'selection and consent invalidate synchronously for every input');
await pendingTimer(); assert.equal(expensive, 1, 'a burst prepares only its last input');
console.log('frontend input work: bounded ordered source reads, cancellation/failure, stale paste suppression, flush and burst debounce PASS');

const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const Truth = require('../public/truth-persistence-domain.js');
const countSource = functionSource('async function readWorkspaceCounts(', 'async function initWorkspace(');
const revision = (type, id, version, items = []) => ({ context_type: type, context_id: id, version, authority: Truth.AUTHORITY.revision, payload: { items } });
const data = {
  candidate_context_revisions: [revision('CANDIDATE', 'c1', 1, [{ item_id: 'old' }]), revision('CANDIDATE', 'c1', 2, [{ item_id: 'kept' }, { item_id: 'removed' }]), revision('CANDIDATE', 'c2', 1, [{ item_id: 'another' }])],
  candidate_context_lifecycle: [{ context_id: 'c1', item_id: 'removed', state: 'REMOVED', authority: Truth.AUTHORITY.lifecycle }],
  demo_candidate_items: [{ item_id: 'legacy' }],
  job_context_revisions: [revision('JOB', 'j1', 1), revision('JOB', 'j1', 2), revision('JOB', 'j2', 1)],
  job_context_lifecycle: [{ contract_id: 'ariadne-job-context-lifecycle-v1', lifecycle_id: 'removed-j2', context_id: 'j2', state: 'REMOVED', removed_from_revision_id: 'j2-v1', removed_at: '2026-09-01T00:00:00Z', reason: 'USER_REMOVED', authority: Truth.AUTHORITY.lifecycle }],
  demo_job_contexts: [{ job_context_id: 'j1' }, { job_context_id: 'j2' }, { job_context_id: 'j3' }, { job_context_id: 'draft', imported_from: { source_document_id: 'draft-source' }, review_status: 'NEEDS_REVIEW' }],
};
let transactions = 0, storesRead = [], countClosed = 0;
const countContext = {
  Truth: { openDatabase: async () => ({ objectStoreNames: { contains: name => name in data }, close() { countClosed++; },
    transaction(names, mode) {
      transactions++; storesRead.push(...names); assert.equal(mode, 'readonly');
      const tx = { objectStore(name) { return { getAll() { const read = {}; queueMicrotask(() => { read.result = structuredClone(data[name]); read.onsuccess(); }); return read; } }; } };
      setImmediate(() => tx.oncomplete()); return tx;
    },
  }) },
  LocalCandidateReview: require('../public/local-candidate-review-domain.js'), JobContext: require('../public/job-context-domain.js'),
  LocalJobLifecycle: require('../public/local-job-lifecycle-domain.js'), Demo: { DEMO_STORES: { candidates: 'demo_candidate_items', jobs: 'demo_job_contexts' } },
};
vm.createContext(countContext); vm.runInContext(countSource, countContext);
const counts = await countContext.readWorkspaceCounts();
assert.equal(counts.candidateCount, 3, 'latest Candidate revisions and per-item removals determine the count');
assert.equal(counts.jobCount, 2, 'latest Jobs, lifecycle removals, legacy duplicates and unconfirmed drafts keep their existing semantics');
assert.equal(transactions, 1); assert.equal(countClosed, 1); assert.equal(storesRead.includes('source_documents'), false);
console.log('workspace count: single read-only snapshot, current revisions, item removals, legacy dedupe and no source loading PASS');
