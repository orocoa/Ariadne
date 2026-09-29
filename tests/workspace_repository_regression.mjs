// Real HTTP/filesystem checks for legacy decisions and bounded journal reads.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const D = require('../public/content-database.js'), T = require('../public/truth-persistence-domain.js');
const C = require('../public/job-context-domain.js'), J = require('../public/job-journal-domain.js');
const contract = require('../data/workspace_storage_v1.json'), name = T.DB_NAME;
const workspace = crypto.randomUUID().replaceAll('-', '');
const root = await fs.mkdtemp(path.resolve('.cache/workspace-repository-'));
const child = spawn(process.env.ARIADNE_TEST_PYTHON || 'python3', ['-u', '-c', `
from app import JobRadarHandler, ThreadingHTTPServer
s=ThreadingHTTPServer(('127.0.0.1',0),JobRadarHandler)
print(s.server_port,flush=True)
s.serve_forever()
`], { env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', ARIADNE_CODEX_ENABLED: '0', ARIADNE_WORKSPACE_ROOT: root }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; child.stderr.on('data', data => { log += data; });
const originalFetch = globalThis.fetch;
try {
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('workspace_server_timeout')), 15000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.stdout.once('data', data => { clearTimeout(timer); resolve(Number(String(data).trim())); });
  });
  const http = (url, options) => originalFetch(new URL(url, `http://127.0.0.1:${port}`), { ...options, signal: options?.signal || AbortSignal.timeout(10000) });
  globalThis.fetch = http;
  const setup = await http('/api/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'commit', transaction_id: crypto.randomUUID().replaceAll('-', ''), workspace, database: name, expected: Object.fromEntries(Object.keys(contract.databases[name]).map(key => [key, null])), writes: [], initialize: true }) });
  assert.equal(setup.status, 200);
  const connection = () => D.connection(workspace, name, contract.databases[name]);
  const write = async (names, callback) => {
    const db = connection();
    try { await new Promise((resolve, reject) => { const tx = db.transaction(names, 'readwrite'); callback(tx); tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error); }); }
    finally { db.close(); }
  };
  const sourceId = 'synthetic-source';
  const initial = T.validateProposal({ contract_id: 'ariadne-context-proposal-v1', proposal_id: 'synthetic-proposal', proposal_type: 'JOB_CONTEXT', source_document_ids: [sourceId], processing_run_id: 'synthetic-run', runtime_snapshot_id: 'synthetic-snapshot', status: 'AWAITING_REVIEW', created_at: '2026-09-29T00:00:00Z', payload: { contract_id: C.PAYLOAD_CONTRACT, title: '合成职位', company: '测试公司', location: '上海', summary: '合成说明', requirements: [], source_document_ids: [sourceId], source_url: null, source_availability: 'STRUCTURED_ONLY', field_provenance: Object.fromEntries(C.EDITABLE_FIELDS.map(key => [key, 'HUMAN_CONFIRMED'])), uncertainties: [] }, grounding_refs: [{ source_document_id: sourceId, location: 'text', excerpt_or_reference: '合成职位' }], warnings: [], uncertainties: [], authority: T.AUTHORITY.proposal });
  let revision = C.reviewOutcome({ proposal: initial, decision: 'CONFIRM' }).revision;
  await write(['job_context_revisions'], tx => tx.objectStore('job_context_revisions').add(revision));
  const db = connection();
  const rejected = C.createChangeProposal({ current_revision: revision, field: 'location', desired_value: '深圳', reason: '合成人工请求' });
  await C.persistChangeProposal(db, rejected);
  await C.persistRejectedChange(db, rejected);
  await assert.rejects(C.persistRejectedChange(db, rejected), /job_change_already_decided/);
  await assert.rejects(C.persistAcceptedChange(db, revision, rejected), /job_change_already_decided/);
  assert.equal((await db.getRecords('job_context_revisions')).length, 1);

  const pending = C.createChangeProposal({ current_revision: revision, field: 'location', desired_value: '杭州', reason: '另一个合成人工请求' });
  await C.persistChangeProposal(db, pending);
  await assert.rejects(C.persistAcceptedChange(db, revision, { ...pending, desired_value: '被替换的值' }), /job_change_proposal_changed/);
  // Both pages can pass a pre-read; the commit read-set still permits one decision.
  const outcomes = await Promise.allSettled([C.persistAcceptedChange(db, revision, pending), C.persistRejectedChange(db, pending)]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await db.getRecords('job_change_decisions')).filter(item => item.job_change_proposal_id === pending.job_change_proposal_id).length, 1);
  revision = C.latestRevision(await db.getRecords('job_context_revisions'), revision.context_id);
  const removed = C.createChangeProposal({ current_revision: revision, field: 'location', desired_value: '北京', reason: '移除前待审请求' });
  await C.persistChangeProposal(db, removed);
  await C.persistRemoval(db, revision);
  await assert.rejects(C.persistAcceptedChange(db, revision, removed), /job_context_already_removed/);
  await C.persistRejectedChange(db, removed); // Stale/removed proposals remain rejectable.
  db.close();

  const file = new Blob(['synthetic-original'], { type: 'image/png' });
  await write([J.STORE, J.IMAGES], tx => {
    for (let i = 0; i < 40; i++) {
      const job = i < 20 ? 'journal-a' : 'journal-b';
      tx.objectStore(J.STORE).add({ entry_id: `entry-${i}`, job_context_id: job, feedback: 'UPDATE', text: `合成记录${i}`, observed_on: '2026-09-29', created_at: '2026-09-29T01:00:00Z', images: [{ image_id: `image-${i}`, name: 'synthetic.png' }] });
      tx.objectStore(J.IMAGES).add({ image_id: `image-${i}`, entry_id: `entry-${i}`, job_context_id: job, file });
    }
  });
  globalThis.AriadneJobFollowupStorage = { open: async () => connection() };
  const actions = [];
  globalThis.fetch = (url, options) => { if (options?.body) actions.push(JSON.parse(options.body)); return http(url, options); };
  const entries = await J.list('journal-a');
  assert.equal(entries.length, 20);
  assert.equal(await entries[0].images[0].file.text(), 'synthetic-original');
  assert.deepEqual(actions.map(item => item.action), ['query', 'batch_get']);
  assert.equal(actions[0].job_context_id, 'journal-a');
  assert.deepEqual(new Set(actions[1].keys), new Set(Array.from({ length: 20 }, (_, i) => `image-${i}`)));
  assert(actions.every(item => item.action !== 'read'), 'journal has no per-entry full-store snapshots');
  console.log('PASS real HTTP/files: legacy rejection/confirmation races and removed jobs; journal query + selected image batch without full-store N+1');
} catch (error) { console.error(log); throw error; }
finally {
  globalThis.fetch = originalFetch;
  if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
}
