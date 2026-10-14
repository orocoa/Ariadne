// Shared synthetic fixtures for the independent ResumeTask regressions.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Truth = require('../../public/truth-persistence-domain.js');
const Understanding = require('../../public/personal-understanding-domain.js');
const CandidatePersistence = require('../../public/candidate-conversation-persistence-domain.js');
const CandidateRuntime = require('../../public/candidate-workspace-conversation-runtime.js');
const JobConversation = require('../../public/job-conversation-domain.js');
const JobOverview = require('../../public/job-overview-domain.js');

export const WORKSPACE = 'a'.repeat(32);
export const HUMAN = 'Generate a resume for Synthetic Name. My work was packaging modifications and poster design. I studied at Synthetic University in 2024-2025. My research involved 12 participants. The current correction is: deployment was done by colleagues; old claims about 20 products and 8 suppliers are withdrawn. Use complete current records, not template example wording.';
export const PRIOR_HUMAN_CORRECTION = 'Earlier actual Human correction: my contribution was packaging modifications and poster design; deployment was performed by colleagues. PRIOR_UNSAVED_CORRECTION_TAIL';
export const NUMERIC_SOURCE = { values: [0, -0, 1, 1.5, 10.5, 1e-7, 1e-6, 9.999999999999997e-7,
  1e20, 1e21, 1e23, 1.2345678901234567e19, 1.7976931348623157e308, 5e-324, 2.2250738585072014e-308,
  333333333.33333329, -1e-7, -1e-6, -1e23], tail: 'NUMERIC_SOURCE_FULL_TAIL' };

// These use the real persisted USER shapes for the four existing domains. They
// do not pre-build the new history registry or perform product source selection.
export function conversationHistoryFixture(domain = 'PERSONAL', { human = HUMAN, count = 1, text = PRIOR_HUMAN_CORRECTION } = {}) {
  const request = requestFor(human), selected = { mode: 'model', provider: 'deepseek', model: 'deepseek-flash' };
  const storage = { getItem: key => key === 'job-radar-selected-runtime' ? JSON.stringify(selected) : null };
  const currentId = `qa-current-${domain.toLowerCase()}-turn`;
  request.request_id = currentId;
  request.turn = { execution_id: currentId, generation: 'qa-current-generation' };
  if (domain === 'CANDIDATE') {
    request.runtime_snapshot = CandidateRuntime.createRuntimeSnapshot();
    request.conversation = { conversation_id: 'candidate-conversation:qa-history-candidate' };
  } else if (domain === 'JOB') {
    request.runtime_snapshot = JobConversation.createRuntimeSnapshot({ runtime: selected });
    request.conversation = JobConversation.createSession('qa-history-job');
  } else if (domain === 'JOB_OVERVIEW') request.runtime_snapshot = JobOverview.runtimeSnapshot(storage);
  const store = { CANDIDATE: 'conversation_messages', JOB: 'job_conversation_messages', PERSONAL: 'personal_conversation_turns', JOB_OVERVIEW: 'job_overview_turns' }[domain];
  const conversationId = request.conversation?.conversation_id || domain;
  const make = (index, words, { role = 'USER', conversation = conversationId, current = false } = {}) => {
    const id = current ? currentId : `qa-prior-${domain.toLowerCase()}-${index}`;
    const at = current ? '2026-10-14T01:50:00Z' : new Date(Date.parse('2026-10-14T00:00:00Z') + index * 1000).toISOString();
    if (domain === 'CANDIDATE') {
      const common = { message_id: `${id}-message`, conversation_id: conversation, turn_id: id, text: words, created_at: at };
      return role === 'USER' ? CandidatePersistence.createUserMessage(common) : CandidatePersistence.createAssistantMessage({ ...common,
        provider: 'deepseek', model: 'deepseek-flash', runtime_snapshot_id: request.runtime_snapshot.snapshot_id, candidate_action_id: `${id}-action` });
    }
    if (domain === 'JOB') {
      const session = conversation === conversationId ? request.conversation : JobConversation.createSession(conversation.startsWith('job-conversation:') ? decodeURIComponent(conversation.slice(17)) : conversation);
      return { ...JobConversation.createMessage(session, role, words, at), message_id: `${id}-message`, turn_id: id };
    }
    return { turn_id: id, ...(domain === 'PERSONAL' ? { kind: 'DISCUSSION', origin: { type: domain } } : {}),
      ...(conversation !== domain ? { conversation_id: conversation } : {}),
      created_at: at, human_message: role === 'USER' ? words : '', status: current ? 'SENDING' : 'SUCCEEDED',
      output: { message: role === 'USER' ? `ASSISTANT_ONLY_FOR_ROW_${index}` : words } };
  };
  const prior = Array.from({ length: count }, (_, index) => make(index + 1, count === 1 ? text : `${text} ROW_${index + 1}_TAIL`));
  const current = make(0, human, { current: true });
  const assistant = make(90, 'ASSISTANT_ONLY_CORRECTION_MUST_NOT_BECOME_FACTS', { role: 'ASSISTANT' });
  const other = make(91, 'Other chat Human exclusion marker', { conversation: 'qa-other-conversation' });
  return { domain, request, store, conversationId, prior, current, assistant, other, make,
    input: { ...sourceInput(), [store]: ['CANDIDATE', 'JOB'].includes(domain) ? [...prior, current, assistant, other] : [...prior, current] } };
}

export function revision(index, summary = `Synthetic evidence ${index}: packaging modifications and poster design.`) {
  return { contract_id: 'ariadne-context-revision-v1', context_type: 'CANDIDATE', context_id: `qa-task-context-${index}`,
    revision_id: `qa-task-revision-${index}-1`, version: 1, previous_revision_id: null, created_at: '2026-10-14T05:00:00Z',
    confirmed_from_proposal_id: `qa-task-proposal-${index}`, review_decision_id: `qa-task-decision-${index}`,
    provenance: { source_document_ids: [`qa-task-source-${index}`], processing_run_id: `qa-task-run-${index}`, runtime_snapshot_id: 'qa-task-runtime' },
    authority: Truth.AUTHORITY.revision,
    payload: { items: [{ item_id: `qa-task-item-${index}`, item_type: 'PROJECT', title: `Synthetic record ${index}`, summary,
      facts: [{ label: 'Contribution', value: 'Packaging modifications and poster design; deployment by colleagues.' }], uncertainties: [], grounding_refs: [] }] } };
}

export function sourceInput({ large = false, overLimit = false } = {}) {
  const repeat = overLimit ? 1050 : 350;
  return { candidate_context_revisions: Array.from({ length: large || overLimit ? 12 : 2 }, (_, index) => revision(index + 1,
    large || overLimit ? (`Synthetic full contribution ${index + 1}. `).repeat(repeat) + `TAIL_${index + 1}_DEPLOYMENT_BY_COLLEAGUES` : undefined)) };
}

export function requestFor(human = HUMAN) {
  const runtime = Understanding.runtimeSnapshot({ getItem: key => key === 'job-radar-selected-runtime' ? JSON.stringify({ mode: 'model', provider: 'deepseek', model: 'deepseek-flash' }) : null });
  return Understanding.requestFor('DISCUSS', { candidate: { confirmed: [], working: [], policy: 'Human Save required' },
    memories: [], history: [], overview: null, coverage: { total_records: 0, included_records: 0, complete: true } }, human, runtime, true);
}

export function template({ name = 'Synthetic-Reference.pdf', hash = 'b'.repeat(64), workspace = WORKSPACE } = {}) {
  return { name, mime_type: 'application/pdf', size: 1234, content_hash: `sha256:${hash}`,
    archive: { workspace, domain: 'PERSONAL', conversation_id: 'PERSONAL', request_id: 'qa-template-turn', index: 0 } };
}

// A transaction writes into an isolated snapshot; abort/failed commit never
// applies any store. CAS behavior is owned by the product commitInto(), not here.
export function databaseFor(input = {}) {
  const specs = new Map([...Truth.STORE_SPECS, { name: 'career_entities', keyPath: 'entity_id' }, { name: 'career_evidence', keyPath: 'evidence_id' },
    { name: 'resume_tasks', keyPath: 'task_id' }, { name: 'resume_document_versions', keyPath: 'version_id' }].map(entry => [entry.name, entry.keyPath]));
  const data = new Map([...specs].map(([name, key]) => [name, new Map((input[name] || []).map(record => [record[key], structuredClone(record)]))]));
  const database = {
    data, writes: [], failNextCommit: false, objectStoreNames: { contains: name => data.has(name) },
    async getRecord(name, key) { if (!data.has(name)) throw Error(`unknown_store:${name}`); return structuredClone(data.get(name).get(key)); },
    async getRecords(name) { if (!data.has(name)) throw Error(`unknown_store:${name}`); return [...data.get(name).values()].map(record => structuredClone(record)); },
    transaction(names, mode = 'readonly') {
      const stores = Array.isArray(names) ? names : [names];
      for (const name of stores) if (!data.has(name)) throw Error(`unknown_store:${name}`);
      const pending = new Map(stores.map(name => [name, new Map(data.get(name))]));
      let count = 0, timer, ended = false;
      const failAtCommit = mode === 'readwrite' && database.failNextCommit;
      if (mode === 'readwrite') database.failNextCommit = false;
      const schedule = () => { clearTimeout(timer); timer = setTimeout(() => {
        if (ended || count) return;
        if (failAtCommit) { tx.error = Error('synthetic_atomic_commit_failure'); tx.abort(); return; }
        if (mode === 'readwrite') pending.forEach((rows, name) => data.set(name, rows));
        ended = true; tx.oncomplete?.();
      }, 0); };
      const tx = { error: null,
        abort() { if (ended) return; ended = true; clearTimeout(timer); queueMicrotask(() => tx.onabort?.()); },
        objectStore(name) {
          if (!stores.includes(name)) throw Error(`store_not_in_transaction:${name}`);
          const rows = pending.get(name), key = specs.get(name);
          return {
            get(value) { const r = {}; count++; queueMicrotask(() => { if (ended) return; r.result = structuredClone(rows.get(value)); r.onsuccess?.(); count--; schedule(); }); return r; },
            getAll() { const r = {}; count++; queueMicrotask(() => { if (ended) return; r.result = [...rows.values()].map(record => structuredClone(record)); r.onsuccess?.(); count--; schedule(); }); return r; },
            put(record) { if (mode !== 'readwrite') throw Error('readonly_write'); const copy = structuredClone(record); rows.set(copy[key], copy); database.writes.push({ name, operation: 'put', key: copy[key] }); schedule(); return {}; },
            add(record) { if (mode !== 'readwrite') throw Error('readonly_write'); if (rows.has(record[key])) throw Error(`duplicate_key:${record[key]}`); const copy = structuredClone(record); rows.set(copy[key], copy); database.writes.push({ name, operation: 'add', key: copy[key] }); schedule(); return {}; },
            delete(value) { if (mode !== 'readwrite') throw Error('readonly_write'); rows.delete(value); schedule(); return {}; },
          };
        },
      };
      return tx;
    },
  };
  return database;
}

export async function commitPrepared(Module, database, prepared) {
  const tx = database.transaction(Module.transactionStores(prepared), 'readwrite');
  const done = new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error || Error('transaction_aborted')); });
  // Always attach a rejection handler before a product validation can abort.
  const observed = done.catch(error => { throw error; });
  try { await Module.commitInto(tx, prepared); } catch (error) { tx.abort(); await observed.catch(() => {}); throw error; }
  await observed;
}
