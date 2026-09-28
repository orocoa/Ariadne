/* One database lets Human Save commit Job fields, notes and journal together.
 * Legacy databases remain intact; their first copy and migration marker are atomic. */
(function (root) {
  "use strict";
  const DB = "job-radar-local-first-v1", MARKERS = "job_followup_migrations";
  const readAll = (db, stores) => new Promise((resolve, reject) => {
    const result = {}, tx = db.transaction(stores);
    for (const name of stores) { const read = tx.objectStore(name).getAll(); read.onsuccess = () => { result[name] = read.result; }; }
    tx.oncomplete = () => resolve(result); tx.onerror = tx.onabort = () => reject(tx.error || Error("跟进记录读取失败。"));
  });
  async function open(legacyName, nativeOpen) {
    const db = await root.AriadneContentDatabase.open(DB);
    try {
      const migrated = await new Promise((resolve, reject) => {
        const tx = db.transaction(MARKERS), read = tx.objectStore(MARKERS).get(legacyName);
        read.onsuccess = () => resolve(Boolean(read.result)); tx.onerror = tx.onabort = () => reject(tx.error || Error("跟进记录迁移状态无法读取。"));
      });
      if (!migrated) {
        const old = await root.AriadneContentDatabase.open(legacyName, nativeOpen);
        let records;
        try { records = await readAll(old, Array.from(old.objectStoreNames).filter(name => name !== "__workspace")); }
        finally { old.close(); }
        await new Promise((resolve, reject) => {
          const tx = db.transaction([MARKERS, ...Object.keys(records)], "readwrite"), marker = tx.objectStore(MARKERS).get(legacyName);
          marker.onsuccess = () => {
            if (marker.result) return;
            for (const [name, values] of Object.entries(records)) for (const record of values) tx.objectStore(name).add(record);
            tx.objectStore(MARKERS).add({ migration_id: legacyName, migrated_at: new Date().toISOString() });
          };
          tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error || Error("跟进记录迁移未完成，旧资料仍保留。"));
        });
      }
      return db;
    } catch (error) { db.close(); throw error; }
  }
  async function save({ jobId, application, entries, observedEntries, currentJob, currentRevision, edits, changeProposal = null }) {
    const A = root.AriadneJobApplications, J = root.AriadneJobJournal, C = root.AriadneJobContext, T = root.AriadneTruthPersistence;
    if (application.job_context_id !== jobId || currentJob.job_context_id !== jobId || currentRevision && currentRevision.context_id !== jobId) throw Error("职位与跟进记录身份不一致。");
    const nextApplication = A.next(application, { stage: application.draftStage ?? application.stage, note: application.draftNote, outcome: application.draftOutcome }, application.revision);
    entries.forEach(entry => { J.validate(entry); if (entry.job_context_id !== jobId) throw Error("求职记录不属于当前职位。"); });
    if (new Set(entries.map(entry => entry.entry_id)).size !== entries.length) throw Error("求职记录重复，请重新打开后修改。");
    const baseline = changeProposal ? currentRevision.payload : currentJob;
    const changed = ["title", "company", "location", "summary", "requirements"].some(key => JSON.stringify(edits[key]) !== JSON.stringify(baseline[key]));
    let outcome = null, demo = null;
    if (changed && currentRevision) {
      const proposal = C.directEditProposal(currentRevision, edits);
      outcome = C.reviewOutcome({ proposal, decision: "CONFIRM", current_revision: currentRevision });
    } else if (changed) demo = { ...currentJob, ...edits, item_version: (Number(currentJob.item_version) || 1) + 1, updated_at: new Date().toISOString() };
    let savedEntries = [];
    const db = await T.openDatabase();
    try { await new Promise((resolve, reject) => {
      const stores = ["applications", J.STORE, J.IMAGES, ...(currentRevision ? ["job_context_lifecycle"] : []), currentRevision ? "job_context_revisions" : "demo_job_contexts", ...(outcome ? ["context_proposals", "context_review_decisions"] : []), ...(changeProposal ? ["job_change_proposals", "job_change_decisions"] : [])];
      const tx = db.transaction(stores, "readwrite");
      let failure, pending = (changeProposal ? 5 : 3) + (currentRevision ? 1 : 0), storedApplication, storedEntries, head, storedProposal, decisions, lifecycle = [];
      const abort = error => { failure = error; tx.abort(); };
      const ready = () => {
        if (--pending) return;
        try {
          if ((storedApplication?.revision || 0) !== application.revision || J.fingerprint(storedEntries) !== J.fingerprint(observedEntries)) throw Error("资料已在其他页面更新。输入仍保留，请取消后重新编辑。");
          if (currentRevision && !C.activeRevisions([head].filter(Boolean), lifecycle).length) throw Error("职位已移除，这组修改不能保存。");
          if (currentRevision ? head?.revision_id !== currentRevision.revision_id : head && (head.item_version || 1) !== (currentJob.item_version || 1)) throw Error("职位内容已更新，请取消后重新编辑。");
          if (changeProposal && (JSON.stringify(storedProposal) !== JSON.stringify(changeProposal)
            || changeProposal.job_context_id !== jobId || changeProposal.base_revision_id !== head?.revision_id
            || changeProposal.base_application_revision !== (storedApplication?.revision || 0)
            || changeProposal.base_journal_fingerprint !== J.fingerprint(storedEntries))) throw Error("这组建议已变化，请重新生成。");
          if (changeProposal && decisions.some(d => d.job_change_proposal_id === changeProposal.job_change_proposal_id)) throw Error("这组建议已处理。");
          const prior = new Map(storedEntries.map(entry => [entry.entry_id, entry]));
          const now = new Date().toISOString();
          for (const entry of entries) {
            const old = prior.get(entry.entry_id);
            // New IDs may not replace a record from another job, including a deleted record.
            if (!old && observedEntries.some(item => item.entry_id === entry.entry_id)) throw Error("记录已变化，请重新编辑。");
            const unchanged = old && ["text", "observed_on", "feedback"].every(key => old[key] === entry[key]) && old.images.length === entry.images.length && old.images.every((image, i) => image.image_id === entry.images[i].image_id);
            if (unchanged) { savedEntries.push(entry); prior.delete(entry.entry_id); continue; }
            const revision = (old?.revision || 0) + 1;
            const images = entry.images.map((image, index) => ({ image_id: `${entry.entry_id}:${revision}:${index}`, name: image.name }));
            entry.images.forEach((image, index) => tx.objectStore(J.IMAGES).add({ ...images[index], entry_id: entry.entry_id, job_context_id: jobId, file: image.file }));
            const history = old ? [...(old.history || []), { ...old, history: undefined }] : [];
            const value = { ...entry, images, history, revision, updated_at: now };
            delete value.deleted_at;
            tx.objectStore(J.STORE)[old ? "put" : "add"](value);
            savedEntries.push({ ...value, images: entry.images.map((image, i) => ({ ...image, image_id: images[i].image_id })) });
            prior.delete(entry.entry_id);
          }
          for (const old of prior.values()) tx.objectStore(J.STORE).put({ ...old, revision: (old.revision || 0) + 1, deleted_at: now });
          const { draftStage, draftNote, draftOutcome, ...cleanApplication } = nextApplication;
          // A record-only edit does not create an unrelated application revision.
          if (["stage", "outcome", "note"].some(key => cleanApplication[key] !== (storedApplication || A.initial(jobId))[key])) tx.objectStore("applications").put(cleanApplication);
          else Object.assign(nextApplication, storedApplication || A.initial(jobId));
          if (changeProposal) tx.objectStore("job_change_decisions").add({ ...root.AriadneJobWorkspaceChanges.decision(changeProposal, "CONFIRM"),
            result_job_revision_id: outcome?.revision.revision_id || currentRevision.revision_id,
            result_application_revision: nextApplication.revision, result_journal_fingerprint: J.fingerprint(savedEntries) });
          if (outcome) {
            tx.objectStore("context_proposals").add(outcome.proposal);
            tx.objectStore("context_review_decisions").add(outcome.review_decision);
            tx.objectStore("job_context_revisions").add(outcome.revision);
          }
          if (demo) tx.objectStore("demo_job_contexts").put(demo);
        } catch (error) { abort(error); }
      };
      if (currentRevision) {
        const lifeRead = tx.objectStore("job_context_lifecycle").getAll();
        lifeRead.onsuccess = () => { lifecycle = lifeRead.result; ready(); };
      }
      if (changeProposal) {
        const proposalRead = tx.objectStore("job_change_proposals").get(changeProposal.job_change_proposal_id);
        proposalRead.onsuccess = () => { storedProposal = proposalRead.result; ready(); };
        const decisionRead = tx.objectStore("job_change_decisions").getAll();
        decisionRead.onsuccess = () => { decisions = decisionRead.result; ready(); };
      }
      const app = tx.objectStore("applications").get(jobId);
      app.onsuccess = () => { storedApplication = app.result; ready(); };
      const journal = tx.objectStore(J.STORE).getAll();
      journal.onsuccess = () => { storedEntries = journal.result.filter(entry => entry.job_context_id === jobId && !entry.deleted_at); ready(); };
      const job = tx.objectStore(currentRevision ? "job_context_revisions" : "demo_job_contexts")[currentRevision ? "getAll" : "get"](...(currentRevision ? [] : [jobId]));
      job.onsuccess = () => { head = currentRevision ? C.latestRevision(job.result, jobId) : job.result; ready(); };
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () => reject(failure || tx.error || Error("保存未完成，输入仍保留，请重试。"));
    }); } finally { db.close(); }
    const { draftStage, draftNote, draftOutcome, ...cleanApplication } = nextApplication;
    return { revision: outcome?.revision || currentRevision, job: demo || currentJob, application: cleanApplication, entries: savedEntries };
  }
  root.AriadneJobFollowupStorage = Object.freeze({ open, save });
}(globalThis));
