// Actual repositories over the file adapter: every read failure must settle.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const D = require('../public/content-database.js');
const C = require('../data/workspace_storage_v1.json');
const Job = require('../public/job-conversation-persistence-domain.js');
const Candidate = require('../public/candidate-conversation-persistence-domain.js');
const name = 'job-radar-local-first-v1';
const database = () => D.connection('a'.repeat(32), name, C.databases[name]);
const originalFetch = globalThis.fetch;
const bounded = promise => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('READ_DID_NOT_SETTLE')), 1000); })]).finally(() => clearTimeout(timer));
};
try {
  for (const fetcher of [async () => { throw Error('synthetic disconnect'); }, async () => new Response('{"error":"WORKSPACE_FILE_CHANGED"}', { status: 409 })]) {
    globalThis.fetch = fetcher;
    const db = database();
    await assert.rejects(bounded(Job.getAll(db, 'job_conversation_messages')), error => error.code?.startsWith('WORKSPACE_'));
    await assert.rejects(bounded(Job.get(db, 'job_conversation_sessions', 'missing')), error => error.code?.startsWith('WORKSPACE_'));
    await assert.rejects(bounded(Candidate.restoreConversation(db, 'synthetic-conversation')), error => error.code?.startsWith('WORKSPACE_'));
    await assert.rejects(bounded(D.readRecords(db, 'demo_ui_state')), error => error.code?.startsWith('WORKSPACE_'));
    db.close();
  }

  let started, aborted = false;
  const began = new Promise(resolve => { started = resolve; });
  globalThis.fetch = (_url, options) => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => { aborted = true; reject(Error('aborted')); }, { once: true });
    started();
  });
  const db = database(), tx = db.transaction('demo_ui_state');
  const requests = [tx.objectStore('demo_ui_state').get('a'), tx.objectStore('demo_ui_state').getAll()];
  let aborts = 0;
  tx.onabort = () => { aborts++; };
  const outcomes = requests.map(request => new Promise(resolve => { request.onerror = () => resolve(request.error.name); }));
  await began;
  tx.abort();
  assert.deepEqual(await bounded(Promise.all(outcomes)), ['AbortError', 'AbortError']);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(aborts, 1); assert.equal(aborted, true, 'aborting a read releases its transport and lock');

  let commits = 0;
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    if (payload.action === 'commit') commits++;
    return new Response(JSON.stringify({ initialized: true, stores: { demo_ui_state: [{ state_id: 'a', value: 'original' }] }, versions: { demo_ui_state: 'version' } }));
  };
  const next = database().transaction('demo_ui_state', 'readwrite'), store = next.objectStore('demo_ui_state');
  const first = store.get('a'), second = store.put({ state_id: 'a', value: 'must not persist' });
  first.onsuccess = () => next.abort();
  const secondError = new Promise(resolve => { second.onerror = () => resolve(second.error.name); });
  assert.equal(await bounded(secondError), 'AbortError');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(commits, 0);
  console.log('PASS read recovery: production repositories reject disconnected/corrupt reads; queued requests abort once without writes');
} finally { globalThis.fetch = originalFetch; }
