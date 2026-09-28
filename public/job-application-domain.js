(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AriadneJobApplications = api;
}(globalThis, function () {
  "use strict";
  // User follow-up metadata is independent of immutable Job/Candidate content.
  const DB_NAME = "ariadne-job-applications-v1";
  const STAGES = Object.freeze({ NOT_APPLIED: "未投递", APPLIED: "已投递", IN_PROGRESS: "推进中", CLOSED: "已结束" });
  const OUTCOMES = Object.freeze({ "": "暂不填写", RESUME_REJECTED: "简历未通过", INTERVIEW_REJECTED: "面试未通过", HIRED: "已入职", WITHDRAWN: "主动放弃", POSITION_CLOSED: "岗位关闭", OTHER: "其他结果" });
  const PROPOSAL_CONTRACT = "ariadne-job-application-stage-proposal-v1";
  const DECISION_CONTRACT = "ariadne-job-change-decision-v1";
  function initial(jobId) {
    if (typeof jobId !== "string" || !jobId.trim() || jobId.length > 300) throw Error("职位标识无效。");
    return { job_context_id: jobId, stage: "NOT_APPLIED", outcome: "", note: "", revision: 0, updated_at: null, history: [] };
  }
  function validate(record) {
    initial(record?.job_context_id);
    if (!Object.hasOwn(STAGES, record.stage) || !Object.hasOwn(OUTCOMES, record.outcome)
      || (record.stage !== "CLOSED" && record.outcome !== "") || typeof record.note !== "string" || record.note.length > 300
      || !Number.isSafeInteger(record.revision) || record.revision < 0 || !Array.isArray(record.history)) throw Error("职位跟进记录无法读取，请保留数据后重试。");
    return record;
  }
  function next(previous, change, expectedRevision, now = new Date().toISOString()) {
    validate(previous);
    if (previous.revision !== expectedRevision) throw Error("这项职位的阶段已在其他页面更新，请重新打开后修改。");
    if (!Object.hasOwn(STAGES, change.stage) || !Object.hasOwn(OUTCOMES, change.outcome) || typeof change.note !== "string" || change.note.trim().length > 300) throw Error("请选择有效阶段，备注最多 300 字。");
    if (change.stage !== "CLOSED" && change.outcome) throw Error("结束结果只适用于已结束的职位。");
    const entry = { stage: change.stage, outcome: change.outcome, note: change.note.trim(), changed_at: now };
    return validate({ ...previous, ...entry, revision: previous.revision + 1, updated_at: now, history: [...previous.history, entry] });
  }
  function matches(record, filter) { return filter === "ALL" || (filter === "ACTIVE" ? record.stage !== "CLOSED" : record.stage === filter); }
  function orderJobs(records, applications) {
    if (!Array.isArray(records) || !(applications instanceof Map)) throw Error("职位列表无法排序。");
    const isClosed = job => (applications.get(job.job_context_id) || initial(job.job_context_id)).stage === "CLOSED";
    return [...records.filter(job => !isClosed(job)), ...records.filter(isClosed)];
  }
  function sourceLink(job) {
    const raw = job?.source_url || job?.imported_from?.source_url;
    if (typeof raw !== "string" || !raw.trim()) return null;
    try {
      const url = new URL(raw.trim());
      if (!["http:", "https:"].includes(url.protocol)) return null;
      return Object.freeze({
        href: url.href,
        visible: `${url.host}${url.pathname === "/" ? "" : url.pathname}${url.search}`,
      });
    } catch (_error) { return null; }
  }
  function open(indexedDb = globalThis.indexedDB) {
    if (indexedDb === globalThis.indexedDB && globalThis.AriadneJobFollowupStorage) return globalThis.AriadneJobFollowupStorage.open(DB_NAME, () => openNative(indexedDb));
    if (indexedDb === globalThis.indexedDB && globalThis.AriadneContentDatabase) {
      return globalThis.AriadneContentDatabase.open(DB_NAME, () => openNative(indexedDb));
    }
    return openNative(indexedDb);
  }
  function openNative(indexedDb) {
    return new Promise((resolve, reject) => {
      if (!indexedDb) { reject(Error("浏览器无法保存职位阶段。")); return; }
      const request = indexedDb.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("applications", { keyPath: "job_context_id" });
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
      request.onerror = () => reject(Error("职位阶段数据库无法打开。"));
      request.onblocked = () => reject(Error("请关闭其他旧页面后重试。"));
    });
  }
  async function all() {
    const db = await open();
    try { return await new Promise((resolve, reject) => {
      const request = db.transaction("applications").objectStore("applications").getAll();
      request.onsuccess = () => { try { resolve(new Map(request.result.map(record => [record.job_context_id, validate(record)]))); } catch (error) { reject(error); } };
      request.onerror = () => reject(Error("职位阶段读取失败，请重试。"));
    }); } finally { db.close(); }
  }
  async function save(jobId, change, expectedRevision) {
    initial(jobId);
    const db = await open();
    try { return await new Promise((resolve, reject) => {
      const tx = db.transaction("applications", "readwrite"), store = tx.objectStore("applications");
      let result, failure;
      const request = store.get(jobId);
      request.onsuccess = () => {
        try { result = next(request.result || initial(jobId), change, expectedRevision); store.put(result); }
        catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(failure || Error("阶段保存失败，原记录仍保留。请重试。"));
    }); } finally { db.close(); }
  }
  function stageProposal(application, desiredStage, reason, analysisId) {
    validate(application);
    if (typeof desiredStage !== "string" || !Object.hasOwn(STAGES, desiredStage) || typeof reason !== "string" || !reason.trim() || reason.length > 4000) throw Error("投递状态建议无效。");
    return Object.freeze({
      contract_id: PROPOSAL_CONTRACT,
      job_change_proposal_id: `job-stage-proposal-${crypto.randomUUID()}`,
      job_context_id: application.job_context_id,
      base_application_revision: application.revision,
      before_value: application.stage,
      desired_value: desiredStage,
      reason: reason.trim(),
      source_analysis_id: analysisId,
      created_at: new Date().toISOString(),
      authority: "NON_AUTHORITATIVE_JOB_PROPOSAL",
    });
  }
  function validateStageProposal(proposal) {
    if (proposal?.contract_id !== PROPOSAL_CONTRACT || proposal.authority !== "NON_AUTHORITATIVE_JOB_PROPOSAL"
      || typeof proposal.job_change_proposal_id !== "string" || typeof proposal.job_context_id !== "string"
      || !Number.isSafeInteger(proposal.base_application_revision) || proposal.base_application_revision < 0
      || typeof proposal.before_value !== "string" || typeof proposal.desired_value !== "string"
      || !Object.hasOwn(STAGES, proposal.before_value) || !Object.hasOwn(STAGES, proposal.desired_value)
      || typeof proposal.reason !== "string" || !proposal.reason.trim()) throw Error("投递状态建议无效。");
    return proposal;
  }
  async function persistStageProposal(database, proposal) {
    validateStageProposal(proposal);
    return new Promise((resolve, reject) => {
      const tx = database.transaction("job_change_proposals", "readwrite");
      tx.objectStore("job_change_proposals").add(proposal);
      tx.oncomplete = () => resolve(proposal);
      tx.onerror = tx.onabort = () => reject(tx.error || Error("投递状态建议未保存。"));
    });
  }
  async function decideStageProposal(database, proposal, decision) {
    validateStageProposal(proposal);
    if (!["CONFIRM", "REJECT"].includes(decision)) throw Error("投递状态决定无效。");
    return new Promise((resolve, reject) => {
      const tx = database.transaction(["applications", "job_change_proposals", "job_change_decisions"], "readwrite");
      let failure, application = null;
      const abort = error => { failure = error; tx.abort(); };
      const storedProposal = tx.objectStore("job_change_proposals").get(proposal.job_change_proposal_id);
      storedProposal.onsuccess = () => {
        if (JSON.stringify(storedProposal.result) !== JSON.stringify(proposal)) { abort(Error("建议已变化，请重新打开。")); return; }
        const decisions = tx.objectStore("job_change_decisions").getAll();
        decisions.onsuccess = () => {
          if (decisions.result.some(entry => entry.job_change_proposal_id === proposal.job_change_proposal_id)) { abort(Error("这条建议已处理，请重新打开。")); return; }
          const applicationRead = tx.objectStore("applications").get(proposal.job_context_id);
          applicationRead.onsuccess = () => {
            try {
              const current = validate(applicationRead.result || initial(proposal.job_context_id));
              if (decision === "CONFIRM" && (current.revision !== proposal.base_application_revision || current.stage !== proposal.before_value)) throw Error("投递状态已在其他页面更新，这条建议已过期。");
              application = decision === "CONFIRM" && current.stage !== proposal.desired_value
                ? next(current, { stage: proposal.desired_value, outcome: "", note: current.note }, current.revision)
                : current;
              if (decision === "CONFIRM" && application !== current) tx.objectStore("applications").put(application);
              tx.objectStore("job_change_decisions").add({ contract_id: DECISION_CONTRACT,
                job_change_decision_id: `job-stage-decision-${crypto.randomUUID()}`,
                job_change_proposal_id: proposal.job_change_proposal_id, decision,
                decided_at: new Date().toISOString(), authority: "AUTHORITATIVE_USER_DECISION" });
            } catch (error) { abort(error); }
          };
        };
      };
      tx.oncomplete = () => resolve(application);
      tx.onerror = tx.onabort = () => reject(failure || tx.error || Error("投递状态未保存。"));
    });
  }
  return Object.freeze({ DB_NAME, STAGES, OUTCOMES, initial, validate, next, matches, orderJobs, sourceLink, all, save,
    PROPOSAL_CONTRACT, stageProposal, validateStageProposal, persistStageProposal, decideStageProposal });
}));
