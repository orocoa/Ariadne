"use strict";
(async function jobOverviewPage() {
  const Domain = window.AriadneJobOverview, Truth = window.AriadneTruthPersistence, Gate = window.JobRadarRuntimeGate, UI = window.AriadneConversationUI;
  const el = (id) => document.getElementById(id), esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const intro = UI.createIntro(el("job-overview-intro"));
  let busy = false, state, visible = 15, pendingMessage = null;
  const status = (copy, error = false) => { el("job-overview-status").textContent = copy; el("job-overview-status").classList.toggle("error", error); };
  function runtime() {
    const gate = Gate.operationGate("job_overview"), current = gate.authority.runtime;
    el("job-overview-runtime").textContent = current.mode === "local" ? "Local · 查看已保存概况" : `${current.provider} · ${current.model}`;
    el("job-overview-consent-copy").textContent = current.mode === "local" ? "当前为 Local。选择可用模型后，可以汇总与讨论职位。" : `对话会将当前个人资料、已保存补充、职位与相关历史发送至 ${current.provider === "codex" ? "Codex" : `${current.provider} · ${current.model}`}；可能消耗额度。会尝试读取本轮消息中的公开链接，并将网页内容交给模型；不自动保存为个人事实。`;
    el("job-overview-consent").disabled = busy || !gate.allowed;
    const disabled = busy || !gate.allowed;
    el("refresh-job-overview").disabled = disabled; el("job-overview-form").querySelector('button[type="submit"]').disabled = disabled; return gate;
  }
  function links(identities) {
    return [...new Set(identities || [])].map((identity) => {
      const record = state.snapshot.records.find((entry) => entry.identity === identity);
      if (!record) return '<span>历史职位已不在当前范围</span>';
      const href = record.context_id ? `/job-detail.html?job=${encodeURIComponent(record.context_id)}` : "/jd-import.html";
      return `<a href="${href}">${esc(record.semantic.title)}${record.semantic.company ? ` · ${esc(record.semantic.company)}` : ""}${record.version ? "" : " · 未确认草稿"}</a>`;
    }).join("");
  }
  function insightsMarkup(insights) { return (insights || []).map((entry) => `<div class="job-overview-finding"><div>${esc(entry.text)}</div><div class="personal-evidence">${links(entry.identities)}${(entry.candidate_sources || []).map(source => `<a href="/personal-information.html">${esc(source.title)} · 个人资料</a>`).join("")}</div></div>`).join(""); }
  function unknownMarkup(values) { return values?.length ? `<ul class="job-overview-unknown">${values.map((entry) => `<li>${esc(entry)}</li>`).join("")}</ul>` : ""; }
  function webSourcesMarkup(sources) {
    return (sources || []).map(source => {
      if (source.status === "LINK_LIMIT") return `<div class="personal-evidence">其余 ${Number(source.omitted_links) || 0} 个链接未读取；每轮最多读取两个公开页面。</div>`;
      let url; try { url = new URL(source.final_url || source.url); } catch (_) { return `<div class="personal-evidence">链接地址不支持读取，未作为网页证据。</div>`; }
      if (!["https:", "http:"].includes(url.protocol)) return "";
      return `<div class="personal-evidence"><a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${esc(source.title || url.hostname)}</a> · ${source.status === "READ" ? `已读取当前页文字${source.truncated ? "（节选）" : ""}，不含整站或图片` : "未能读取，未作为网页证据"}</div>`;
    }).join("");
  }
  function render() {
    const { snapshot, turns } = state, overview = snapshot.overview;
    el("job-overview-state").textContent = `当前 ${snapshot.records.length} 份职位描述：${snapshot.confirmed_count} 份已保存，${snapshot.working_count} 份未确认草稿。${overview ? "概况已更新；结论为模型理解。" : "可直接讨论当前职位；资料较多时会分批理解。"}`;
    el("job-overview-summary").textContent = overview?.summary || (snapshot.records.length ? "先了解这些职位各自在做什么，再比较共同要求与差异。" : "还没有可汇总的职位描述。添加真实职位描述后，可以在这里一起讨论。演示卡片不纳入概况。");
    el("job-overview-insights").innerHTML = insightsMarkup(overview?.insights);
    el("job-overview-unknowns").innerHTML = overview?.uncertainties?.length ? `<div class="personal-unknowns"><h3>还需要确认</h3>${unknownMarkup(overview.uncertainties)}</div>` : "";
    el("job-overview-directory").innerHTML = snapshot.records.map((record) => `<div class="job-overview-directory-item">${links([record.identity])}<div>${esc(record.semantic.location || "地点未明确")} · ${record.version ? `当前版本 ${record.version}` : "尚未保存为正式职位"}</div></div>`).join("") || "暂无职位描述。";
    const messages = turns.slice(-visible).flatMap((turn) => [{ id: `${turn.turn_id}:user`, role: "USER", turn_id: turn.turn_id, text: turn.human_message }, ...(turn.status === "SUCCEEDED" ? [{ id: `${turn.turn_id}:assistant`, role: "ASSISTANT", runtime_snapshot: turn.runtime_snapshot, text: `${(turn.fingerprint !== snapshot.fingerprint || turn.candidate_fingerprint !== snapshot.candidate.aggregate_fingerprint || turn.prompt_version !== Domain.Contract.prompt_version) ? "（基于当时资料或旧读取范围的历史回答）\n" : ""}${turn.output.message}`, deliverable: turn.output.deliverable, web_search: turn.output.web_search, result: { ...turn.output, web_sources: turn.web_sources || [] } }] : [])]);
    if (pendingMessage) messages.push({ role: "USER", text: pendingMessage });
    const target = el("job-overview-messages");
    intro.update(messages.length > 0);
    UI.renderMessages(target, messages, { empty_text: "从整体概况、岗位共性或某几份职位描述的差异开始。也可以结合关于我，讨论哪些方向更适合你。" });
    const bubbles = target.querySelectorAll(".v1-conversation-message");
    messages.forEach((message, index) => { if (message.result) { const details = document.createElement("span"); details.innerHTML = `${insightsMarkup(message.result.insights)}${unknownMarkup(message.result.uncertainties)}${webSourcesMarkup(message.result.web_sources)}`; bubbles[index].append(details); } });
    el("job-overview-older").classList.toggle("hidden", turns.length <= visible);
    const last = turns.filter((turn) => turn.status === "SUCCEEDED").at(-1);
    el("job-overview-usage").textContent = last ? `最近一轮详细证据 ${last.context_coverage.included_jobs}/${last.context_coverage.total_jobs} 份，${last.context_coverage.truncated_jobs} 份节选；另参考当轮全量概况。${last.candidate_coverage ? `个人资料 ${last.candidate_coverage.included_records}/${last.candidate_coverage.total_records} 条。` : "旧轮次未读取个人资料。"}上下文 ${Math.round(last.context_bytes / 1024)} KB，${last.calls} 次模型调用。` : "概况分批汇总全部当前职位描述；对话按预算选取详细证据，保留原文和历史。";
    runtime();
  }
  async function load() { const db = await Truth.openDatabase(); try { state = { snapshot: await Domain.snapshotFromDatabase(db), turns: (await Domain.getAll(db, "job_overview_turns")).sort((a, b) => a.created_at.localeCompare(b.created_at)) }; render(); } finally { db.close(); } }
  async function run(task, input = null) {
    if (busy) return;
    if (!runtime().allowed) { status("请先在首页选择可用模型。", true); return; }
    if (!UI.requireTransferConsent(el("job-overview-consent"))) return;
    const draft = input ? UI.takeDraft(input) : null;
    pendingMessage = draft?.text.trim() || null;
    busy = true; if (state) render(); runtime(); status(""); UI.setExecutionState({ form: el("job-overview-form"), status: el("job-overview-processing"), active: true, copy: "正在读取个人资料与当前职位…" }); let db;
    try {
      const captured = Domain.runtimeSnapshot(); db = await Truth.openDatabase();
      const call = async (request) => { const current = Gate.operationGate("job_overview"); if (!current.allowed || current.authority.runtime.provider !== captured.provider || current.authority.runtime.model !== captured.model || !el("job-overview-consent").checked) throw new Error("JOB_OVERVIEW_RUNTIME_CHANGED"); return Domain.callRuntime(request); };
      await task(db, { runtime_snapshot: captured, consent: true, call, onProgress: (copy) => UI.setExecutionState({ form: el("job-overview-form"), status: el("job-overview-processing"), active: true, copy }) });
    } catch (error) {
      draft?.finish(true);
      status(window.AriadneRuntimeSelection?.errorCopy(error) || (/CONTEXT_CHANGED/.test(error.message) ? "个人资料或职位已经变化，本次结果未保存。请基于最新资料重试。" : /RUNTIME|CONSENT|capability/.test(error.message) ? "运行方式或资料传输确认已变化，请核对后重试。" : "本次处理未完成，没有生成替代回答或修改任何职位描述。原始资料与历史保留，可以重试。"), true);
    } finally {
      db?.close(); draft?.finish(); pendingMessage = null;
      try { await load(); }
      finally { busy = false; UI.setExecutionState({ form: el("job-overview-form"), status: el("job-overview-processing"), active: false }); runtime(); }
    }
  }
  el("job-overview-form").addEventListener("submit", (event) => { event.preventDefault(); if (!busy && runtime().allowed && !UI.requireTransferConsent(el("job-overview-consent"))) return; const message = el("job-overview-message").value.trim(); if (message) run(async (db, options) => { await Domain.discuss(db, { ...options, human_message: message }); }, el("job-overview-message")); });
  el("refresh-job-overview").addEventListener("click", () => run(async (db, options) => { const result = await Domain.refresh(db, options); status(!result.snapshot.records.length ? "请先添加真实职位描述。" : result.cached ? "当前职位没有变化，无需重复调用模型。" : `概况已更新：复用 ${result.snapshot.overview.reused_fragments} 段摘要，新理解 ${result.snapshot.overview.refreshed_fragments} 段。`); }));
  window.AriadneRuntimeSelection.bindTransferConsent("job_overview", el("job-overview-consent"));
  el("job-overview-consent").addEventListener("change", runtime);
  el("job-overview-older").addEventListener("click", () => { visible += 20; render(); });
  document.querySelectorAll("[data-job-overview-prompt]").forEach((button) => button.addEventListener("click", () => { el("job-overview-message").value = button.dataset.jobOverviewPrompt; el("job-overview-message").focus(); }));
  Gate.subscribe(() => { window.AriadneRuntimeSelection.syncTransferConsent("job_overview", el("job-overview-consent")); runtime(); });
  window.addEventListener("focus", () => { if (!busy) load().catch(() => status("暂时无法读取个人资料或职位，请重试；未将读取失败当作资料为空。", true)); });
  try { await load(); } catch (_error) { status("暂时无法读取个人资料或职位，请重试；未将读取失败当作资料为空。", true); }
}());
