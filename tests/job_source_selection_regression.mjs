import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RawSource = require('../public/raw-source-storage-domain.js');
const source = fs.readFileSync(new URL('../public/v1-pages.js', import.meta.url), 'utf8');
const functions = [
  ['async function selectSavedJobSources(', 'function proposalItemEditor('],
  ['function resetJobSource(', 'async function jobSourceImportState('],
  ['async function saveJobSourceName(', 'function initJobImport('],
  ['async function openJobModelConsent(', 'function runJobModelProcessing('],
].map(([start, end]) => source.slice(source.indexOf('  ' + start), source.indexOf('  ' + end))).join('\n');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const restored = id => ({ source_url: 'https://example.test/' + id, sources: [{ file: { size: 12 }, source_document: {
  source_document_id: id, filename: id + '.txt', content_hash: 'synthetic-' + id,
  source_type: 'PASTED_TEXT', mime_type: 'text/plain', batch_id: 'synthetic-batch',
} }] });

function harness() {
  const nodes = new Map(), calls = { rename: [], archive: [], durable: 0, dialogs: 0, download: 0 };
  function byId(id) {
    if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', disabled: false, open: false,
      classList: { add() {}, remove() {}, toggle() {} }, querySelectorAll: () => [],
      focus() {}, showModal() { this.open = true; calls.dialogs++; },
      get selectedOptions() { return [{ dataset: { displayName: 'Name ' + this.value } }]; },
    });
    return nodes.get(id);
  }
  const database = { close() {} }, gate = { allowed: true, authority: { runtime: { mode: 'model', provider: 'codex', model: 'synthetic-model' } } };
  const context = vm.createContext({
    jobSelectionVersion: 0, jobProcessingInProgress: false, selectedJobArchiveId: 'source-archive-v1::A',
    selectedJobSource: { source_document_id: 'A' }, selectedJobSources: [{ source_document_id: 'A' }],
    selectedJobImportType: 'Document', jobPasteTimer: null, jobPastePending: false, jobImportLifecycle: null,
    jobModelConsentSelectionVersion: null, jobModelConsentRuntimeIdentity: null, jobModelConsentId: null,
    jobModelConsentBundle: null, jobExecutionState: 'SOURCE_STORED',
    byId, window: { clearTimeout() {}, setTimeout() {} }, crypto: { randomUUID: () => 'synthetic' },
    Truth: { openDatabase: async () => database },
    RawSource: { ...RawSource,
      resolveArchive: async (_database, id) => restored(id),
      renameArchive: async (_database, id, name) => { calls.rename.push({ id, name }); return { source_document_id: id, display_name: name }; },
      persistArchive: async (_database, documents, url, name = '') => {
        const archive = { source_document_id: 'source-archive-v1::saved', source_document_ids: documents.map(item => item.source_document_id), source_url: url, display_name: name };
        calls.archive.push(archive); return archive;
      },
    },
    currentAriadneMode: () => 'local', formatBytes: value => String(value),
    jobSourceImportState: async () => 'RETRY', refreshJobImportGate: () => gate,
    renderSavedSources: async () => {}, prepareCurrentJobPaste: async () => {},
    ModelImportLifecycle: { STATES: { SOURCE_SELECTED: 'SOURCE_SELECTED', SOURCE_STORED: 'SOURCE_STORED', WORKING: 'WORKING' } },
    beginJobImportLifecycle(state) { context.jobExecutionState = state; },
    showJobSource(value) { context.selectedJobSource = value; },
    transitionJobImportLifecycle(state) { context.jobImportLifecycle.state = state; },
    runtimeIdentity: () => 'synthetic-runtime',
    JobModel: { assertEligibleGate: value => value, sourceBundleFor: async (_sources, documents) => ({ source_document_ids: documents.map(item => item.source_document_id) }) },
    LocalJob: { sourceDocumentFor() {}, persistCanonicalSource() {} },
    SourceInput: { persistDurableBundle: async ({ sources }) => { calls.durable++; return sources; } },
    URL: { createObjectURL() { calls.download++; return 'blob:synthetic'; } },
  });
  vm.runInContext(functions, context);
  byId('job-source-name').value = 'Name A';
  byId('job-link-input').value = 'https://example.test/A';
  byId('saved-job-source-select').value = 'source-archive-v1::A';
  return { context, calls, byId };
}

const cases = [
  ['pending selection clears every old actionable source and successful restore binds B', async () => {
    const h = harness(), pending = deferred();
    h.context.RawSource.resolveArchive = () => pending.promise;
    h.byId('saved-job-source-select').value = 'source-archive-v1::B';
    const selection = h.context.selectSavedJobSources('source-archive-v1::B');
    assert.equal(h.context.selectedJobArchiveId, null);
    assert.equal(h.context.selectedJobSource, null);
    assert.equal(h.context.selectedJobSources.length, 0);
    assert.equal(h.byId('job-source-name').value, '');
    assert.equal(h.byId('job-link-input').value, '');
    await h.context.saveJobSourceName(); await h.context.downloadJobSources();
    assert.deepEqual(h.calls.rename, []); assert.equal(h.calls.download, 0);
    pending.resolve(restored('B')); await selection;
    assert.equal(h.context.selectedJobArchiveId, 'source-archive-v1::B');
    assert.equal(h.context.selectedJobSource.source_document_id, 'B');
    assert.equal(h.byId('job-link-input').value, 'https://example.test/B');
    assert.equal(h.byId('job-source-name').value, 'Name source-archive-v1::B');
    h.byId('job-source-name').value = 'Renamed B'; await h.context.saveJobSourceName();
    assert.deepEqual(h.calls.rename, [{ id: 'source-archive-v1::B', name: 'Renamed B' }]);
  }],
  ['failed restore leaves no A target; late B cannot replace the later C selection', async () => {
    const h = harness(); h.context.RawSource.resolveArchive = async () => { throw Error('raw_source_integrity_mismatch'); };
    await assert.rejects(h.context.selectSavedJobSources('source-archive-v1::B'), /raw_source_integrity_mismatch/);
    assert.equal(h.context.selectedJobArchiveId, null); assert.equal(h.context.selectedJobSource, null);
    assert.equal(h.byId('job-link-input').value, '');
    const pending = deferred(); h.context.RawSource.resolveArchive = (_database, id) => id.endsWith('B') ? pending.promise : Promise.resolve(restored('C'));
    const old = h.context.selectSavedJobSources('source-archive-v1::B'); await tick();
    await h.context.selectSavedJobSources('source-archive-v1::C');
    pending.resolve(restored('B')); await old;
    assert.equal(h.context.selectedJobArchiveId, 'source-archive-v1::C');
    assert.equal(h.context.selectedJobSource.source_document_id, 'C');
    const failure = deferred(); h.context.RawSource.resolveArchive = (_database, id) => id.endsWith('B') ? failure.promise : Promise.resolve(restored('C'));
    const staleFailure = h.context.selectSavedJobSources('source-archive-v1::B'); await tick();
    await h.context.selectSavedJobSources('source-archive-v1::C');
    failure.reject(Error('outdated_storage_failure')); await staleFailure;
    assert.equal(h.context.selectedJobArchiveId, 'source-archive-v1::C');
  }],
  ['name save rechecks its captured target after asynchronous database open', async () => {
    const h = harness(), pending = deferred(); h.context.Truth.openDatabase = () => pending.promise;
    const saving = h.context.saveJobSourceName();
    h.context.jobSelectionVersion++; h.context.selectedJobArchiveId = 'source-archive-v1::B';
    pending.resolve({ close() {} }); await saving;
    assert.deepEqual(h.calls.rename, []);
    assert.equal(h.context.selectedJobArchiveId, 'source-archive-v1::B');
    assert.equal(h.context.jobProcessingInProgress, false);
  }],
  ['Model consent durably preserves supplied name and optional empty name without a model call', async () => {
    for (const name of ['User name · Synthetic role', '']) {
      const h = harness(); h.byId('job-source-name').value = name; h.byId('job-link-input').value = 'https://example.test/job';
      await h.context.openJobModelConsent();
      assert.equal(h.calls.archive.length, 1); assert.equal(h.calls.archive[0].display_name, name);
      assert.deepEqual(Array.from(h.calls.archive[0].source_document_ids), ['A']);
      assert.equal(h.calls.archive[0].source_url, 'https://example.test/job');
      assert.equal(h.calls.dialogs, 1); assert.equal(h.calls.durable, 1);
      assert.equal(h.context.selectedJobArchiveId, 'source-archive-v1::saved');
      // Consent is merely opened: no model or confirmed-domain save dependency exists in the harness.
    }
  }],
  ['Model name validation and persistence failure retain input without opening consent', async () => {
    const invalid = harness(); invalid.byId('job-source-name').value = 'x'.repeat(161);
    await assert.rejects(invalid.context.openJobModelConsent(), /source_archive_name_invalid/);
    assert.equal(invalid.calls.durable, 0); assert.equal(invalid.calls.dialogs, 0);
    const failed = harness(); failed.context.RawSource.persistArchive = async () => { throw Error('synthetic_storage_failure'); };
    await assert.rejects(failed.context.openJobModelConsent(), /synthetic_storage_failure/);
    assert.equal(failed.byId('job-source-name').value, 'Name A');
    assert.equal(failed.context.selectedJobSource.source_document_id, 'A'); assert.equal(failed.calls.dialogs, 0);
  }],
  ['selection change during Model archival cannot bind or open stale consent', async () => {
    const h = harness(), pending = deferred(); h.context.SourceInput.persistDurableBundle = () => pending.promise;
    const opening = h.context.openJobModelConsent(); await tick();
    h.context.configureJobImportType('Document'); pending.resolve([{ source_document_id: 'A' }]);
    await assert.rejects(opening, /job_model_consent_mismatch/);
    assert.equal(h.context.selectedJobArchiveId, null); assert.equal(h.calls.dialogs, 0);
    assert.equal(h.calls.archive[0].display_name, 'Name A', 'the archived snapshot retains the original input');
  }],
];
let failures = 0;
for (const [name, run] of cases) {
  try { await run(); console.log('PASS ' + name); }
  catch (error) { failures++; console.error('FAIL ' + name + '\n' + error.stack); }
}
if (failures) process.exitCode = 1;
