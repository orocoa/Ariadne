/* Semantic operations are compiled against one local workspace snapshot.
 * Provider references never become storage identities; Human Save is atomic. */
(function (root, factory) {
  const load = (name, file) => root[name] || (typeof module === 'object' && module.exports ? require(file) : null);
  const api = factory(root, load('AriadneJobIntelligenceContract', '../data/job_intelligence_contract_v1.json'),
    load('AriadneJobContext', './job-context-domain.js'), load('AriadneJobApplications', './job-application-domain.js'), load('AriadneJobJournal', './job-journal-domain.js'));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AriadneJobWorkspaceChanges = api;
}(globalThis, function (root, M, C, A, J) {
  'use strict';
  const CONTRACT = 'ariadne-job-workspace-change-set-v1';
  const clone = value => structuredClone(value);
  const fail = () => { throw Error('JOB_CHANGE_SET_INVALID'); };
  const recordRef = index => `journal-record-${index + 1}`;
  function journalContext(entries = []) {
    let length = 0;
    const selected = [];
    // Whole records only, newest first. Excluded records cannot be targeted.
    for (let index = entries.length - 1; index >= 0; index--) {
      const entry = entries[index];
      if (selected.length >= 40 || length + entry.text.length > 24000) break;
      selected.unshift({ record_ref: recordRef(index), text: entry.text, observed_on: entry.observed_on,
        feedback: entry.feedback, image_count: entry.images.length, image_content: 'NOT_INCLUDED', authority: 'HUMAN_RECORDED_FOLLOWUP' });
      length += entry.text.length;
    }
    return { entries: selected, coverage: { total: entries.length, included: selected.length, complete: entries.length === selected.length } };
  }
  function validate(changes, context) {
    if (!Array.isArray(changes) || changes.length > M.limits.changes) fail();
    const seen = new Set(), refs = new Set((context.journal?.entries || []).map(entry => entry.record_ref));
    const checked = changes.map(change => {
      if (!change || Object.keys(change).sort().join(',') !== 'reason,record_ref,target,value') fail();
      const spec = M.change_targets[change.target];
      if (!spec || !context.change_policy?.targets?.includes(change.target)) fail();
      if (typeof change.value !== 'string' || change.value.length > spec.max_length || (!spec.allow_empty && !spec.enum && !change.value.trim())
        || spec.enum && !spec.enum.includes(change.value) || typeof change.reason !== 'string' || !change.reason.trim() || change.reason.length > 4000) fail();
      if (spec.record_required ? !refs.has(change.record_ref) : change.record_ref !== null) fail();
      const key = spec.record_required ? `journal:${change.record_ref}` : change.target;
      if (change.target !== 'journal.append' && seen.has(key)) fail();
      seen.add(key);
      return { ...change, value: change.value.trim(), reason: change.reason.trim() };
    });
    const stage = checked.find(c => c.target === 'application.stage')?.value || context.application?.stage;
    const outcome = checked.find(c => c.target === 'application.outcome');
    if (outcome?.value && stage !== 'CLOSED') fail();
    return checked;
  }
  function semanticContext(application, entries) {
    return { application, journal: journalContext(entries), change_policy: { targets: Object.keys(M.change_targets) } };
  }
  function assertSnapshot(proposal, revision, application, entries) {
    if (proposal.contract_id !== CONTRACT || proposal.authority !== 'NON_AUTHORITATIVE_JOB_PROPOSAL'
      || proposal.job_context_id !== revision?.context_id || application.job_context_id !== revision.context_id
      || proposal.base_revision_id !== revision.revision_id || proposal.base_application_revision !== application.revision
      || proposal.base_journal_fingerprint !== J.fingerprint(entries)) throw Error('职位或跟进记录已变化，这组建议已过期，请重新生成。');
  }
  function draft(proposal, revision, application, entries) {
    assertSnapshot(proposal, revision, application, entries);
    const changes = validate(proposal.changes, semanticContext(application, entries));
    const edits = clone(revision.payload), nextEntries = clone(entries), nextApplication = { ...application, draftStage: application.stage, draftNote: application.note, draftOutcome: application.outcome };
    const preview = [];
    for (const change of changes) {
      const { target, value, record_ref: ref } = change;
      let before = '', after = value;
      if (target.startsWith('job.')) {
        const field = target.slice(4);
        before = field === 'requirements' ? edits.requirements.map(r => r.detail).join('\n') : edits[field] || '';
        if (field === 'requirements') {
          // Retain provenance only for exactly unchanged requirements, never by index.
          edits.requirements = value.split('\n').map(s => s.trim()).filter(Boolean).map((detail, i) => {
            const previous = revision.payload.requirements.find(r => r.detail === detail);
            return previous ? clone(previous) : { requirement_id: `${proposal.job_change_proposal_id}-requirement-${i + 1}`,
              label: detail.length > 36 ? `${detail.slice(0, 34)}…` : detail, detail, grounding_refs: [], content_origin: 'HUMAN_EDITED' };
          });
        } else edits[field] = value || null;
      } else if (target.startsWith('application.')) {
        const field = target.slice(12);
        before = application[field];
        if (field === 'stage') nextApplication.draftStage = value;
        else if (field === 'outcome') nextApplication.draftOutcome = value;
        else nextApplication.draftNote = value;
        if (field === 'stage') { before = A.STAGES[before]; after = A.STAGES[value]; }
        if (field === 'outcome') { before = A.OUTCOMES[before]; after = A.OUTCOMES[value]; }
      } else if (target === 'journal.append') {
        const ordinal = changes.indexOf(change);
        nextEntries.push({ entry_id: `${proposal.job_change_proposal_id}-entry-${ordinal}`, job_context_id: revision.context_id,
          text: value, feedback: 'UPDATE', observed_on: proposal.local_date, created_at: proposal.created_at, images: [],
          provenance: { kind: 'HUMAN_CONFIRMED_CONVERSATION', proposal_id: proposal.job_change_proposal_id, analysis_id: proposal.source_analysis_id, message_id: proposal.source_message_id } });
      } else {
        const old = entries.find((entry, index) => recordRef(index) === ref);
        if (!old) fail();
        before = old.text;
        const index = nextEntries.findIndex(e => e.entry_id === old.entry_id);
        if (target === 'journal.remove') { nextEntries.splice(index, 1); after = '（移除，历史保留）'; }
        else nextEntries[index] = { ...nextEntries[index], text: value };
      }
      preview.push({ label: M.change_targets[target].label, before: before || '（空）', after: after || '（清空）', reason: change.reason });
    }
    const explicitOutcome = changes.some(c => c.target === 'application.outcome');
    if (nextApplication.draftStage !== application.stage && !explicitOutcome) {
      nextApplication.draftOutcome = '';
      if (application.outcome) preview.push({ label: '结束结果', before: A.OUTCOMES[application.outcome], after: '暂不填写', reason: '阶段变化时清除旧的当前结果，历史保留。' });
    }
    C.validateJobPayload(edits);
    A.next(application, { stage: nextApplication.draftStage, outcome: nextApplication.draftOutcome, note: nextApplication.draftNote }, application.revision);
    nextEntries.forEach(J.validate);
    return { application: nextApplication, entries: nextEntries, edits, preview };
  }
  function create({ revision, application, entries, changes, analysisId, messageId }) {
    const now = new Date(), proposal = {
      contract_id: CONTRACT, job_change_proposal_id: `job-workspace-proposal-${crypto.randomUUID()}`,
      job_context_id: revision.context_id, base_revision_id: revision.revision_id, base_application_revision: application.revision,
      base_journal_fingerprint: J.fingerprint(entries), changes: clone(changes), source_analysis_id: analysisId,
      source_message_id: messageId, created_at: now.toISOString(), local_date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
      authority: 'NON_AUTHORITATIVE_JOB_PROPOSAL',
    };
    if (!changes.length) fail();
    proposal.preview = draft(proposal, revision, application, entries).preview;
    return Object.freeze(proposal);
  }
  async function accept(proposal, revision) {
    const [applications, entries] = await Promise.all([A.all(), J.list(proposal.job_context_id)]);
    const application = applications.get(proposal.job_context_id) || A.initial(proposal.job_context_id);
    const change = draft(proposal, revision, application, entries);
    return root.AriadneJobFollowupStorage.save({ jobId: proposal.job_context_id, ...change, observedEntries: entries,
      currentJob: C.recordForUi(revision), currentRevision: revision, changeProposal: proposal });
  }
  async function reject(database, proposal) {
    return new Promise((resolve, reject) => {
      const tx = database.transaction(['job_change_proposals', 'job_change_decisions'], 'readwrite');
      let failure;
      const read = tx.objectStore('job_change_proposals').get(proposal.job_change_proposal_id);
      read.onsuccess = () => {
        if (JSON.stringify(read.result) !== JSON.stringify(proposal)) { failure = Error('建议已变化。'); tx.abort(); return; }
        const decisions = tx.objectStore('job_change_decisions').getAll();
        decisions.onsuccess = () => {
          if (decisions.result.some(d => d.job_change_proposal_id === proposal.job_change_proposal_id)) { failure = Error('这组建议已处理。'); tx.abort(); return; }
          tx.objectStore('job_change_decisions').add(decision(proposal, 'REJECT'));
        };
      };
      tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(failure || tx.error || Error('决定未保存。'));
    });
  }
  function decision(proposal, value) {
    return { contract_id: 'ariadne-job-change-decision-v1', job_change_decision_id: `job-workspace-decision-${crypto.randomUUID()}`,
      job_change_proposal_id: proposal.job_change_proposal_id, decision: value, decided_at: new Date().toISOString(), authority: 'AUTHORITATIVE_USER_DECISION' };
  }
  return Object.freeze({ CONTRACT, journalContext, validate, create, draft, accept, reject, decision });
}));
