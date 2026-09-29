/** Synthetic read-protocol comparison. No HTTP server, private data or Provider.
 * Run: node scripts/benchmarks/storage_reads.mjs [--root repo] [--output new.json]
 * Baseline modules are read directly from the pinned pre-optimization Git commit.
 * Payload byte counts use compact UTF-8 JSON, before compression/HTTP headers.
 * This measures client request amplification; it does NOT measure disk latency,
 * HEAD size, hash verification cost, IndexedDB performance, or write transactions.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash, webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {parseArgs} from 'node:util';

const here = path.dirname(fileURLToPath(import.meta.url));
const {values} = parseArgs({options: {root: {type: 'string'}, output: {type: 'string'}, baseline: {type: 'string'}, help: {type: 'boolean'}}});
if (values.help) {
  console.log('node scripts/benchmarks/storage_reads.mjs [--root repo] [--baseline commit] [--output new.json]\nDefault output: work/benchmarks/storage/results-<timestamp>.json; existing files are never overwritten.');
  process.exit(0);
}
const root = values.root ? path.resolve(values.root) : path.resolve(here, '../..');
const output = values.output ? path.resolve(values.output) : path.join(root, 'work', 'benchmarks', 'storage', `results-${new Date().toISOString().replaceAll(/[:.]/g, '-')}.json`);
if (fs.existsSync(output)) throw Error('Output already exists; use a new filename to retain earlier evidence');
const require = createRequire(path.join(root, 'package.json'));
const Content = require(path.join(root, 'public/content-document.js'));
const Contract = require(path.join(root, 'data/workspace_storage_v1.json'));
const baselineRef = values.baseline || 'a16e004cfcb85b430cb808c7b78b1f992f795302';
const baselineCommit = execFileSync('git', ['rev-parse', `${baselineRef}^{commit}`], {cwd: root, encoding: 'utf8'}).trim();
const moduleNames = ['public/content-database.js', 'public/job-journal-domain.js'];
const source = {
  before: Object.fromEntries(moduleNames.map(name => [name, execFileSync('git', ['show', `${baselineCommit}:${name}`], {cwd: root, encoding: 'utf8'})])),
  after: Object.fromEntries(moduleNames.map(name => [name, fs.readFileSync(path.join(root, name), 'utf8')])),
};
const sha256 = value => createHash('sha256').update(value).digest('hex');
const database = 'job-radar-local-first-v1', workspace = '0'.repeat(32);
const schema = Contract.databases[database];
const imageBytes = 4096;

function fixture(totalEntries, imagesPerEntry) {
  const entries = [], images = [], sources = [], blobs = new Map();
  const selectedEntries = totalEntries / 10;
  const original = Buffer.alloc(imageBytes, 0x53), originalHash = sha256(original);
  for (let i = 0; i < totalEntries; i++) {
    const id = `synthetic-entry-${String(i).padStart(4, '0')}`;
    const job = i < selectedEntries ? 'synthetic-selected-job' : `synthetic-other-${i % 9}`;
    const refs = [];
    for (let j = 0; j < imagesPerEntry; j++) {
      const imageId = `${id}:1:${j}`;
      const file = {$blob: 'file', type: 'image/png', path: `originals/${originalHash}-${i}-${j}.bin`, sha256: originalHash, size: imageBytes};
      refs.push({image_id: imageId, name: 'synthetic.png'});
      images.push({image_id: imageId, entry_id: id, job_context_id: job, file});
      blobs.set(file.path, {$blob: 'base64', type: 'image/png', data: original.toString('base64')});
    }
    entries.push({entry_id: id, job_context_id: job, feedback: 'UPDATE', text: `Synthetic journal ${i}: ` + 'synthetic text '.repeat(20),
      observed_on: '2026-09-29', created_at: '2026-09-29T00:00:00Z', revision: 1, images: refs});
    sources.push({source_document_id: `synthetic-source-${String(i).padStart(4, '0')}`, filename: `synthetic-${i}.txt`,
      source_type: 'TEXT', content_hash: `sha256:${sha256(String(i))}`, text: 'synthetic source '.repeat(32)});
  }
  const stores = {job_journal_entries: entries, job_journal_images: images, source_documents: sources};
  const packed = Object.fromEntries(Object.entries(stores).map(([name, rows]) => [name, rows.map(row => Content.pack(name, schema[name], row))]));
  return {totalEntries, selectedEntries, imagesPerEntry, stores, packed, blobs};
}

function client(version, data) {
  const metrics = {requests: 0, request_json_bytes: 0, response_json_bytes: 0, actions: {}};
  const hydrate = value => value?.$blob === 'file' ? {...data.blobs.get(value.path), size: value.size}
    : Array.isArray(value) ? value.map(hydrate)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, hydrate(item)])) : value;
  const fetch = async (url, options) => {
    assert.equal(url, '/api/workspace');
    const request = JSON.parse(options.body);
    assert.equal(request.workspace, workspace);
    assert.equal(request.database, database);
    const keyPath = schema[request.store];
    let reply;
    if (request.action === 'read') {
      assert.equal(request.metadata_only, true);
      reply = {initialized: true, stores: Object.fromEntries(request.stores.map(name => [name, data.packed[name]])),
        versions: Object.fromEntries(request.stores.map(name => [name, 'f'.repeat(64)]))};
    } else if (request.action === 'get') {
      reply = {initialized: true, record: data.packed[request.store].find(row => row[keyPath] === request.key) ?? null};
    } else if (request.action === 'query') {
      const records = data.stores[request.store].filter(row => request.job_context_id == null || row.job_context_id === request.job_context_id)
        .map(row => Content.pack(request.store, keyPath, row));
      reply = {initialized: true, records: request.metadata_only ? records : records.map(hydrate)};
    } else if (request.action === 'batch_get') {
      const index = new Map(data.packed[request.store].map(row => [row[keyPath], row]));
      reply = {initialized: true, records: request.keys.map(key => index.has(key) ? hydrate(index.get(key)) : null)};
    } else if (request.action === 'blob') reply = data.blobs.get(request.entry.path);
    else throw Error(`unexpected mutation or action: ${request.action}`);
    const encoded = JSON.stringify(reply);
    metrics.requests++;
    metrics.actions[request.action] = (metrics.actions[request.action] || 0) + 1;
    metrics.request_json_bytes += Buffer.byteLength(options.body);
    metrics.response_json_bytes += Buffer.byteLength(encoded);
    return {ok: true, json: async () => JSON.parse(encoded)};
  };
  const context = vm.createContext({AriadneContentDocument: Content, AriadneWorkspaceStorageContract: Contract,
    Blob, File, DOMException, AbortController, structuredClone, atob, btoa, setTimeout, queueMicrotask, crypto: webcrypto, fetch});
  for (const name of moduleNames) vm.runInContext(source[version][name], context, {filename: `${version}/${name}`});
  const open = () => context.AriadneContentDatabase.connection(workspace, database, schema);
  context.AriadneJobFollowupStorage = {open: async () => open()};
  return {context, metrics, open};
}

async function snapshotGet(db, store, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store), read = tx.objectStore(store).get(key);
    read.onsuccess = () => resolve(read.result);
    read.onerror = tx.onerror = tx.onabort = () => reject(read.error || tx.error);
  });
}

function comparison(before, after) {
  const total = metrics => metrics.request_json_bytes + metrics.response_json_bytes;
  return {before, after, request_reduction_percent: +(100 * (1 - after.requests / before.requests)).toFixed(3),
    json_byte_reduction_percent: +(100 * (1 - total(after) / total(before))).toFixed(3)};
}

const cases = [];
for (const count of [100, 500, 1000]) {
  const data = fixture(count, 0);
  for (const keys of [['synthetic-source-0000'], Array.from({length: 10}, (_, i) => `synthetic-source-${String(i).padStart(4, '0')}`)]) {
    const results = {}, metrics = {};
    for (const version of ['before', 'after']) {
      const c = client(version, data), db = c.open();
      results[version] = version === 'before' ? await Promise.all(keys.map(key => snapshotGet(db, 'source_documents', key)))
        : keys.length === 1 ? [await db.getRecord('source_documents', keys[0])] : await db.batchGet('source_documents', keys);
      db.close(); metrics[version] = c.metrics;
    }
    assert.equal(JSON.stringify(results.before), JSON.stringify(results.after));
    cases.push({scenario: keys.length === 1 ? 'independent_point_read' : 'ten_independent_point_reads', total_store_records: count,
      selected_records: keys.length, ...comparison(metrics.before, metrics.after)});
  }
  for (const images of [0, 1, 2]) {
    const fixtureData = fixture(count, images), results = {}, metrics = {};
    for (const version of ['before', 'after']) {
      const c = client(version, fixtureData);
      const rows = await c.context.AriadneJobJournal.list('synthetic-selected-job');
      assert.equal(rows.length, fixtureData.selectedEntries);
      assert(rows.every(row => row.images.length === images));
      for (const row of rows) for (const image of row.images) assert.equal(sha256(Buffer.from(await image.file.arrayBuffer())), sha256(Buffer.alloc(imageBytes, 0x53)));
      results[version] = JSON.stringify(rows);
      metrics[version] = c.metrics;
    }
    assert.equal(results.before, results.after, 'same selected journal entries and validated original bytes');
    cases.push({scenario: 'journal_list', total_journal_records: count, selected_journal_records: fixtureData.selectedEntries,
      total_image_records: count * images, selected_images: fixtureData.selectedEntries * images, images_per_entry: images,
      image_bytes: imageBytes, ...comparison(metrics.before, metrics.after)});
  }
}
const report = {benchmark_version: 1, generated_at: new Date().toISOString(), baseline_commit: baselineCommit,
  measurement: 'Actual baseline/current client modules; synthetic read-only workspace endpoint; compact uncompressed UTF-8 JSON bytes excluding HTTP headers.',
  caveats: ['Point-read comparisons compare the legacy transaction.get call pattern with independent getRecord/batchGet; getRecord already existed before this turn.',
    'Journal comparison executes the unchanged baseline list() and the current list() against the same synthetic records.',
    'Each fixture has ten percent of journal records assigned to the selected job; all selected records and image bytes are compared for equality.',
    'The current server query still scans and hash-checks the store once; no disk/time improvement or production workload distribution is claimed.',
    'Migration/open/schema/HEAD/lock/write costs are excluded. Write transaction read-set, CAS, and hash integrity remain unchanged.',
    'Images contain synthetic 4096-byte payloads with image/png metadata; this benchmark does not test image decoding.'],
  module_sha256: Object.fromEntries(Object.entries(source).map(([version, files]) => [version, Object.fromEntries(Object.entries(files).map(([name, body]) => [name, sha256(body)]))])), cases};
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({output, cases: cases.length, journal: cases.filter(row => row.scenario === 'journal_list').map(row => ({records: row.total_journal_records,
  selected: row.selected_journal_records, images: row.selected_images, requests_before: row.before.requests, requests_after: row.after.requests,
  response_bytes_before: row.before.response_json_bytes, response_bytes_after: row.after.response_json_bytes, byte_reduction_percent: row.json_byte_reduction_percent}))}, null, 2));
