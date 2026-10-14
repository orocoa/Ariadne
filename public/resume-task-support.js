"use strict";
// Shared transport preparation and presentation; domain transactions own writes.
(function attach(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AriadneResumeTaskSupport = api;
}(globalThis, function create(root) {
  const contexts = new WeakMap(), outboundRequests = new WeakMap(), controls = new Map();
  let refreshRevision = 0;
  const forms = { CANDIDATE: ["candidate-workspace-composer", "candidate-conversation-form"], JOB: ["job-workspace-composer", "job-conversation-form"], PERSONAL: ["personal-conversation-form"], JOB_OVERVIEW: ["job-overview-form"] };
  const operations = { CANDIDATE: "candidate_conversation", JOB: "job_conversation", PERSONAL: "personal_understanding", JOB_OVERVIEW: "job_overview" };
  const tr = (zh, en) => root.document?.documentElement.lang?.startsWith("en") ? en : zh;
  const domain = () => root.AriadneResumeTask || (typeof module === "object" ? require("./resume-task-domain.js") : null);
  const truth = () => root.AriadneTruthPersistence || (typeof module === "object" ? require("./truth-persistence-domain.js") : null);
  const candidate = () => root.AriadneJobCandidateContext || (typeof module === "object" ? require("./job-candidate-context-domain.js") : null);
  function errorCopy(error) {
    const code = String(error?.code || error?.message || error);
    if (!/RESUME_/i.test(code)) return null;
    if (/LIMIT/.test(code)) return tr("当前完整资料超过简历任务上限，未截断或生成文件。请整理当前有效资料后重试。", "The complete records exceed this resume task's limit. Nothing was truncated or exported. Review the active records and retry.");
    if (/TEMPLATE|CONSENT/.test(code)) return tr("参考模板未能完整读取或缺少本轮复用确认，请确认原件后重试。", "The complete template could not be read, or reuse needs confirmation. Review the original and retry.");
    if (/STALE|CHANGED|CONFLICT/.test(code)) return tr("资料或简历版本已变化，这次结果未保存。请基于最新版本重试。", "The records or resume version changed. This result was not saved. Retry with the latest version.");
    return tr("简历任务未通过完整资料或事实审核，没有生成可下载文件。请核对资料后重试。", "The resume task failed its completeness or factual review. No download was created. Review the records and retry.");
  }
  function currentScope(kind) {
    const scope = root.AriadneRuntimeSelection?.scopeFor(operations[kind]);
    if (!scope) return null;
    return domain().scopeFor(["PERSONAL", "JOB_OVERVIEW"].includes(kind) ? {} : { conversation: { conversation_id: scope } }, kind);
  }
  function consentIdentity(scope, task, runtime) {
    const settings = root.AriadneModelSettings || (typeof module === "object" ? require("./model-settings.js") : null);
    return JSON.stringify([scope, task?.task_id, task?.revision, task?.template || null, settings?.identity(runtime)]);
  }
  async function refresh() {
    const revision = ++refreshRevision;
    if (!root.document || !domain() || !truth()) return;
    for (const [kind, ids] of Object.entries(forms)) for (const id of ids) {
      const form = root.document.getElementById(id); if (!form) continue;
      let state = controls.get(id);
      if (!state) {
        const label = root.document.createElement("label"); label.className = "v1-attachment-consent v1-resume-template-consent hidden"; label.hidden = true;
        const input = root.document.createElement("input"); input.type = "checkbox";
        const text = root.document.createElement("span"); label.append(input, text); form.append(label);
        state = { form, label, input, text, identity: null, template: null, scope: null }; controls.set(id, state);
      }
      const scope = currentScope(kind); if (!scope) { state.label.hidden = true; continue; }
      const db = await truth().openDatabase();
      try {
        const prior = await domain().restore(db, scope);
        const template = prior?.task?.template || null;
        const runtime = root.AriadneRuntimeSelection?.resolve(operations[kind]);
        const identity = consentIdentity(scope, prior?.task, runtime);
        if (revision !== refreshRevision) return;
        if (state.identity !== identity) state.input.checked = false;
        state.identity = identity; state.template = template; state.scope = scope;
        state.label.hidden = !template; state.label.classList.toggle("hidden", !template);
        state.text.textContent = template ? tr(`本轮继续使用参考模板「${template.name}」，发送完整模板至 ${runtime?.provider === "codex" ? "Codex" : runtime?.provider}，用于简历生成与事实审核。`, `Reuse “${template.name}” for this turn and send the complete template to ${runtime?.provider === "codex" ? "Codex" : runtime?.provider} for resume generation and review.`) : "";
      } catch (_) { state.label.hidden = true; state.template = null; }
      finally { db.close(); }
    }
  }
  async function inlineTemplate(template) {
    const attachments = root.AriadneConversationAttachments;
    if (!attachments?.readOriginal) throw Error("RESUME_TEMPLATE_UNAVAILABLE");
    const file = await attachments.readOriginal(template.archive.request_id, template.archive.index, template, template.archive);
    return (await attachments.recordFor(new File([file], template.name), true)).data_url;
  }
  async function prepare(request, kind, outbound = request) {
    if (request.phase && request.phase !== "DISCUSS") return outbound;
    const db = await truth().openDatabase();
    try {
      const scope = domain().scopeFor(request, kind);
      const prior = await domain().restore(db, scope);
      const state = forms[kind]?.map(id => controls.get(id)).find(entry => entry && JSON.stringify(entry.scope) === JSON.stringify(scope));
      const reuse = Boolean(state?.input.checked && state.template && state.identity === consentIdentity(scope, prior?.task, request.runtime_snapshot) && JSON.stringify(state.template) === JSON.stringify(prior?.task?.template));
      const context = await domain().buildContext({ database: db, request, domain: kind, template: reuse ? prior.task.template : null, templateReuseConfirmed: reuse, consentConfirmed: true });
      contexts.set(request, context); outboundRequests.set(request, outbound);
      const packet = { ...outbound, resume_context: context };
      if (reuse && root.AriadneProduct?.storage !== "filesystem") packet.resume_template_data = await inlineTemplate(context.template);
      return packet;
    } catch (error) {
      contexts.delete(request); outboundRequests.delete(request);
      // Ordinary discussion retains its existing bounded context. A semantic
      // resume intent receives this explicit failure instead of a fallback CV.
      return { ...outbound, resume_context_error: /^RESUME_[A-Z_]+$/.test(error?.code || error?.message) ? error.code || error.message : "RESUME_CONTEXT_UNAVAILABLE" };
    } finally { db.close(); }
  }
  async function beforeDispatch(request, outbound) {
    const context = contexts.get(request); if (!context) return outbound;
    const db = await truth().openDatabase();
    try { await domain().assertContextFresh(db, context); return outbound; }
    catch (error) {
      contexts.delete(request); outboundRequests.delete(request);
      const { resume_context, resume_template_data, ...ordinary } = outbound;
      return { ...ordinary, resume_context_error: /^RESUME_[A-Z_]+$/.test(error?.code || error?.message) ? error.code || error.message : "RESUME_CONTEXT_UNAVAILABLE" };
    } finally { db.close(); }
  }
  function attachmentTemplate(outbound, scope, name) {
    const files = outbound?.attachments?.files || [], matches = files.map((file, index) => ({ file, index })).filter(entry => entry.file.name === name);
    if (matches.length !== 1) throw Error("RESUME_TEMPLATE_UNAVAILABLE");
    const { file, index } = matches[0];
    return { name: file.name, mime_type: file.mime_type, size: file.size, content_hash: file.content_hash,
      archive: { ...scope, request_id: outbound.attachments.request_id, index } };
  }
  async function prepareResult(database, request, result) {
    if (!result?.resume_task) return null;
    let context = contexts.get(request); if (!context) throw Error("RESUME_CONTEXT_UNAVAILABLE");
    const selected = result.resume_task.template;
    if (JSON.stringify(context.template) !== JSON.stringify(selected)) {
      if (!selected) context = await domain().withTemplate(context, null, { templateReuseConfirmed: false });
      else {
        const expected = attachmentTemplate(outboundRequests.get(request), context.scope, selected.name);
        if (JSON.stringify(expected) !== JSON.stringify(selected)) throw Error("RESUME_TEMPLATE_INVALID");
        context = await domain().withTemplate(context, expected, { templateReuseConfirmed: false });
      }
    }
    const prepared = await domain().validateResult(result.resume_task, context);
    if (prepared) await domain().assertFresh(database, prepared);
    return prepared;
  }
  function metadata(prepared) {
    if (!prepared || prepared.status !== "READY") return null;
    return { task_id: prepared.task.task_id, version_id: prepared.document_version.version_id,
      scope: prepared.task.scope, status: "READY", document_hash: prepared.document_version.document_hash, evidence_hash: prepared.document_version.evidence_hash };
  }
  function validateMetadata(value) {
    if (!value || Object.keys(value).sort().join() !== ["task_id", "version_id", "scope", "status", "document_hash", "evidence_hash"].sort().join() || value.status !== "READY"
      || ![value.task_id, value.version_id, value.document_hash, value.evidence_hash].every(item => typeof item === "string" && item.length > 0 && item.length <= 1024)
      || !/^sha256:[a-f0-9]{64}$/.test(value.document_hash) || !/^sha256:[a-f0-9]{64}$/.test(value.evidence_hash)
      || !value.scope || Object.keys(value.scope).sort().join() !== ["workspace", "domain", "conversation_id"].sort().join() || !["workspace", "domain", "conversation_id"].every(key => typeof value.scope[key] === "string" && value.scope[key])) throw Error("RESUME_PROOF_INVALID");
    return structuredClone(value);
  }
  async function verifyMessage(message, { fresh = true } = {}) {
    const proof = validateMetadata(message.resume_task), expected = currentScope(proof.scope.domain);
    if (!expected || JSON.stringify(expected) !== JSON.stringify(proof.scope)) throw Error("RESUME_SCOPE_CHANGED");
    const db = await truth().openDatabase();
    try {
      const restored = await domain().restore(db, proof.scope, { taskId: proof.task_id, versionId: proof.version_id });
      const document = restored?.version;
      if (!document || document.document_hash !== proof.document_hash || document.evidence_hash !== proof.evidence_hash || JSON.stringify(document.deliverable) !== JSON.stringify(message.deliverable)) throw Error("RESUME_DOCUMENT_INVALID");
      if (fresh) await domain().assertDocumentFresh(db, document);
      return document;
    } finally { db.close(); }
  }
  function evidenceView(doc, document) {
    const details = doc.createElement("details"), summary = doc.createElement("summary"); summary.textContent = tr("逐条事实依据", "Factual basis for each item"); details.append(summary);
    const note = doc.createElement("p"); note.textContent = tr("依据来自当前资料及你的陈述；模型审核不等于外部事实核验。", "The basis is your current records and statements. Model review does not constitute external fact verification."); details.append(note);
    const roles = { CANDIDATE_CONFIRMED: tr("已保存资料", "Saved record"), CANDIDATE_WORKING: tr("未保存草稿", "Unsaved draft"), PERSONAL_FACT: tr("已保存补充", "Saved note"), PERSONAL_CORRECTION: tr("已保存更正", "Saved correction"), PERSONAL_PREFERENCE: tr("已保存偏好", "Saved preference"), PERSONAL_GOAL: tr("已保存目标", "Saved goal"), CURRENT_HUMAN: tr("本轮陈述", "Current statement"), TASK_HUMAN_UNCONFIRMED: tr("先前任务陈述", "Earlier task statement"), CONVERSATION_HUMAN_UNCONFIRMED: tr("先前对话陈述", "Earlier conversation statement") };
    const availability = { ORIGINAL_AVAILABLE: tr("原件可读", "Original available"), SOURCE_REFERENCE_ONLY: tr("保留来源索引", "Source reference retained"), LEGACY_PROVENANCE_UNKNOWN: tr("历史来源状态未知", "Historical provenance unknown"), SOURCE_UNAVAILABLE: tr("原件暂不可用", "Original unavailable"), CURRENT_TURN: tr("当前自述", "Current self report"), TASK_HISTORY_UNCONFIRMED: tr("未保存的任务自述", "Unsaved task self report"), CONVERSATION_HISTORY_UNCONFIRMED: tr("未保存的对话自述", "Unsaved conversational self report") };
    const readable = content => [content.created_at ? `${tr("对话时间", "Statement time")}：${content.created_at}` : null, content.text, content.title, content.subtitle, content.time, content.summary, content.ownership,
      ...(content.facts || []).map(fact => `${fact.label}：${fact.value}`), ...(content.uncertainties || []).map(item => `${tr("待确认", "Unknown")}：${item.question}`)].filter(item => typeof item === "string" && item.trim()).join("\n");
    const evidence = new Map((document.evidence_snapshot?.evidence || []).map(item => [item.ref, item]));
    const list = doc.createElement("ol");
    for (const entry of document.review.block_reviews || []) {
      const block = document.deliverable.resume.blocks[entry.block_index]; if (!block || block.type === "PAGE_BREAK" || block.type === "SECTION" && entry.text?.status === "STRUCTURAL" && !entry.text?.source_refs?.length) continue;
      const item = doc.createElement("li"); item.textContent = [block.text, block.right].filter(Boolean).join(" · ");
      for (const [field, review] of [["text", entry.text], ["right", entry.right]]) {
        if (!review?.source_refs?.length) continue;
        const basis = doc.createElement("p");
        const sources = review.source_refs.map(ref => evidence.get(ref)).filter(Boolean);
        basis.textContent = `${field === "right" ? tr("日期或地点", "Date or place") : tr("正文", "Text")}：${sources.map(source => `${source.title} · ${roles[source.role]} · ${availability[source.source_state]}`).join("；")} · ${review.reason}`;
        item.append(basis);
        const raw = doc.createElement("details"), label = doc.createElement("summary"); label.textContent = tr("查看原始依据字段", "View source fields"); raw.append(label);
        for (const source of sources) { const text = doc.createElement("pre"); text.textContent = readable(source.content); raw.append(text); }
        item.append(raw);
      }
      list.append(item);
    }
    details.append(list); return details;
  }
  root.addEventListener?.("ariadne-runtime-selection", () => { refresh().catch(() => {}); });
  root.addEventListener?.("ariadne-resume-saved", () => { refresh().catch(() => {}); });
  if (root.document) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", () => { refresh().catch(() => {}); }, { once: true });
    else refresh().catch(() => {});
  }
  return Object.freeze({ prepare, beforeDispatch, prepareResult, metadata, validateMetadata, verifyMessage, evidenceView, refresh, errorCopy });
}));
