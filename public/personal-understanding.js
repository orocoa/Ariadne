"use strict";

(async function personalUnderstandingPage() {
  const Memory = window.AriadnePersonalMemory, Understanding = window.AriadnePersonalUnderstanding;
  const Candidate = window.AriadneJobCandidateContext, Context = window.AriadnePersonalContext;
  const CandidateCards = window.AriadnePersonalCandidateCards;
  const Truth = window.AriadneTruthPersistence, Gate = window.JobRadarRuntimeGate, UI = window.AriadneConversationUI;
  const byId = (name) => document.getElementById(name);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const labels = { FACT: "经历与背景", PREFERENCE: "个人偏好", GOAL: "已确认目标", CORRECTION: "理解修正" };
  const intro = UI.createIntro(byId("personal-intro"));
  // Editable proposals are separate from refreshed, non-authoritative results.
  // The key includes the reviewed proposal and its observed target revision.
  const proposalViews = new Map();
  let loadGeneration = 0;
  function proposalBase(entry, kind) {
    const target = kind === "card" ? entry.payload.target : null;
    const current = kind === "card" && target
      ? Context.records(state.snapshot).find(record => record.identity === target.identity)?.lineage
      : kind === "memory" && entry.target_memory_id
        ? Memory.latest(state.memories).find(record => record.memory_id === entry.target_memory_id)?.revision_id : null;
    return JSON.stringify([entry, current ?? null]);
  }
  function syncProposalControls(view) {
    view.node.querySelectorAll("button").forEach(button => { button.disabled = busy || view.conflict && !button.hasAttribute("data-proposal-reset"); });
  }
  function renderProposals(container, entries, kind, markup) {
    const wanted = new Set();
    for (const entry of entries) {
      const key = `${kind}:${entry.proposal_id}`, base = proposalBase(entry, kind);
      wanted.add(key);
      let view = proposalViews.get(key);
      if (view && view.base !== base && view.dirty) view.conflict = true;
      if (!view || view.base !== base && !view.dirty) {
        const template = document.createElement("template"); template.innerHTML = markup(entry);
        const node = template.content.firstElementChild;
        const previous = view;
        view = { key, node, base, proposal: entry, dirty: false, conflict: false, editVersion: 0, values: new Map() };
        node.addEventListener("input", event => {
          if (!event.target.matches("input, textarea, select")) return;
          view.dirty = true;
          view.editVersion += 1;
          view.values.set(event.target.dataset.cardField || event.target.id, event.target.value);
        });
        node.addEventListener("change", event => {
          if (event.target.matches("select")) { view.dirty = true; view.editVersion += 1; view.values.set(event.target.dataset.cardField, event.target.value); }
        });
        previous?.node.remove();
        proposalViews.set(key, view);
      }
    }
    // An externally decided/replaced proposal must not erase an unsaved edit.
    for (const [key, view] of proposalViews) {
      if (!key.startsWith(`${kind}:`)) continue;
      if (!wanted.has(key)) {
        if (!view.dirty) { view.node.remove(); proposalViews.delete(key); continue; }
        view.conflict = true;
      }
      let warning = view.node.querySelector("[data-proposal-conflict]");
      if (view.conflict && !warning) {
        warning = document.createElement("p"); warning.dataset.proposalConflict = ""; warning.setAttribute("role", "alert");
        warning.className = "v1-inline-message error";
        warning.textContent = "这条建议或相关资料已变化；你的编辑仍保留，请复制需要的内容后重新核对。";
        const reset = document.createElement("button"); reset.type = "button"; reset.className = "v1-edit-text-action";
        reset.dataset.proposalReset = ""; reset.textContent = "放弃这份编辑并读取最新建议";
        reset.addEventListener("click", () => { if (busy) return; view.node.remove(); proposalViews.delete(key); render(); });
        warning.append(reset); view.node.append(warning);
      }
      syncProposalControls(view);
    }
    const ordered = entries.map(entry => proposalViews.get(`${kind}:${entry.proposal_id}`)?.node).filter(Boolean);
    for (const [key, view] of proposalViews) if (key.startsWith(`${kind}:`) && !wanted.has(key)) ordered.push(view.node);
    ordered.forEach((node, index) => { if (container.children[index] !== node) container.insertBefore(node, container.children[index] || null); });
  }
  function assertProposalDraft(kind, id) {
    const view = proposalViews.get(`${kind}:${id}`);
    if (!view || view.conflict) throw Error("personal_proposal_version_conflict");
    return view;
  }
  function settleProposalDraft(view, submittedVersion) {
    if (view.editVersion === submittedVersion) view.dirty = false;
  }
  let pendingMessage = null;
  let busy = false, state, origin = { type: "PERSONAL" }, visibleTurns = 15, draftLoaded = false;
  const status = (value, error = false) => { byId("personal-message-status").textContent = value; byId("personal-message-status").classList.toggle("error", error); };
  function runtimeMode() {
    const gate = Gate.operationGate("personal_understanding");
    const runtime = gate.authority.runtime;
    byId("personal-runtime").textContent = runtime.mode === "local" ? "Local · 查看已保存内容" : `${runtime.provider === "codex" ? "Codex / OpenAI" : runtime.provider} · ${runtime.model}`;
    byId("personal-consent-copy").textContent = runtime.mode === "local" ? "当前为 Local。切换到已验证的模型后，可以综合资料与对话。" : `问题、相关个人资料及对话历史将发送至 ${runtime.provider === "codex" ? "Codex / OpenAI" : runtime.provider} · ${runtime.model}；更新理解可能分批调用并产生 API 费用。`;
    byId("personal-model-consent").disabled = !gate.allowed || busy;
    const allowed = gate.allowed && !busy;
    byId("personal-conversation-form").querySelector('button[type="submit"]').disabled = !allowed;
    byId("refresh-understanding").disabled = !allowed;
    proposalViews.forEach(syncProposalControls);
    return gate;
  }
  function errorCopy(error) {
    if (window.AriadneRuntimeSelection?.errorCopy(error)) return window.AriadneRuntimeSelection.errorCopy(error);
    const code = String(error?.message || error);
    if (/CONTEXT_CHANGED|evidence_changed|version_conflict/.test(code)) return "相关资料或记忆已经变化。这次结果未保存，请基于最新内容重试。";
    if (/CONSENT|capability|RUNTIME/.test(code)) return "当前模型或资料传输确认已变化，请核对运行方式后重试。";
    if (/CONTEXT_LIMIT/.test(code)) return "本轮内容超过处理预算，请缩小问题范围。原始资料仍然保留。";
    if (/already_saved/.test(code)) return "相同的补充已经保存，无需重复添加。可以暂不采纳这条重复建议。";
    if (/already_decided/.test(code)) return "这条建议已经处理，请查看最新的个人补充。";
    return "本次处理未完成，没有生成替代回复或保存个人事实。你可以重试；原始资料与历史仍保留。";
  }
  function sourceMarkup(binding) {
    const record = Context.records(state.snapshot).find((entry) => entry.identity === binding.identity);
    if (record?.lineage?.context_id && record.identity.startsWith("canonical:")) {
      const itemId = record.identity.slice(`canonical:${record.lineage.context_id}:`.length);
      return `<a href="/candidate-detail.html?context=${encodeURIComponent(record.lineage.context_id)}&amp;item=${encodeURIComponent(itemId)}">${esc(binding.title)}</a>`;
    }
    return `<span>${esc(binding.title)}</span>`;
  }
  function render() {
    const overview = state.snapshot.personal_understanding;
    const records = Context.records(state.snapshot);
    byId("understanding-state").textContent = overview
      ? `已综合当前 ${overview.covered_records} 条资料与补充 · 模型推断，可继续校准`
      : records.length ? `已有 ${records.length} 条资料与补充 · 整体理解待更新；可直接根据当前资料对话` : "尚无个人资料。可以添加文件，也可以从对话中补充。";
    byId("understanding-summary").textContent = overview?.summary || "从你做过的项目开始，聊聊当时负责什么、怎么做、为什么这样做。你的补充会帮助我逐步了解你。";
    byId("understanding-insights").innerHTML = (overview?.insights || []).map((entry) => `<article class="personal-insight"><p>${esc(entry.text)}</p><div class="personal-evidence">${entry.evidence.map(sourceMarkup).join("")}</div></article>`).join("");
    byId("understanding-unknowns").innerHTML = overview?.uncertainties?.length ? `<div class="personal-unknowns"><h3>还需要澄清</h3><ul>${overview.uncertainties.map((entry) => `<li>${esc(entry)}</li>`).join("")}</ul></div>` : "";
    const activeIds = new Set(records.filter((entry) => entry.identity.startsWith("memory:")).map((entry) => entry.lineage.memory_id));
    const memories = Memory.latest(state.memories).filter((entry) => entry.status === "ACTIVE");
    byId("memory-count").textContent = `${activeIds.size} 条当前有效`;
    byId("saved-memories").innerHTML = memories.map((entry) => `<article class="personal-memory" data-inactive="${!activeIds.has(entry.memory_id)}"><small>${esc(labels[entry.kind])} · 版本 ${entry.version}${activeIds.has(entry.memory_id) ? "" : " · 关联资料已变化，暂不使用"}</small><p>${esc(entry.text)}</p><button type="button" class="personal-text-button" data-memory-edit="${esc(entry.memory_id)}">修改这条补充</button><button type="button" class="personal-text-button" data-memory-forget="${esc(entry.memory_id)}">不再使用</button></article>`).join("") || '<p class="personal-meta">尚未保存补充。对话中的建议只有经你确认，才会出现在这里。</p>';
    byId("memory-history").innerHTML = [...state.memories].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((entry) => `<p>${esc(labels[entry.kind])} · v${entry.version} · ${entry.status === "RETRACTED" ? "已停止使用，历史保留" : "已保存"}<br>${esc(entry.text)}</p>`).join("") || "暂无历史版本。";
    const turns = state.turns.filter((entry) => entry.kind === "DISCUSSION").sort((a, b) => a.created_at.localeCompare(b.created_at));
    const messages = turns.slice(-visibleTurns).flatMap((turn) => [{ id: `${turn.turn_id}:user`, role: "USER", text: turn.human_message }, ...(turn.status === "SUCCEEDED" ? [{ id: `${turn.turn_id}:assistant`, role: "ASSISTANT", runtime_snapshot: turn.runtime_snapshot, text: turn.output.message, deliverable: turn.output.deliverable, web_search: turn.output.web_search }] : [])]);
    if (pendingMessage) messages.push({ role: "USER", text: pendingMessage });
    intro.update(messages.length > 0);
    UI.renderMessages(byId("personal-conversation-messages"), messages, { empty_text: "这里的对话围绕你已添加的资料展开，可以跨文件讨论，也可以直接补充新的个人信息。" });
    byId("personal-older-messages").classList.toggle("hidden", turns.length <= visibleTurns);
    const cardTypeOptions = { WORK_EXPERIENCE: "工作经历", PROJECT: "项目经历", EDUCATION: "教育经历", OTHER: "其他资料" };
    const cardProposals = CandidateCards.pending(state.cardProposals);
    renderProposals(byId("personal-card-proposals"), cardProposals, "card", (entry) => {
      const item = entry.payload.items[0], proposalId = esc(entry.proposal_id);
      const optionMarkup = Object.entries(cardTypeOptions).map(([value, label]) => `<option value="${value}"${item.item_type === value ? " selected" : ""}>${label}</option>`).join("");
      const facts = (item.facts || []).map((fact) => `${fact.label}：${fact.value}`).join("\n");
      return `<article class="personal-proposal personal-card-proposal" data-card-proposal="${proposalId}"><h3>${entry.payload.operation === "CREATE" ? "待确认的新资料卡" : "待确认的资料卡修改"}</h3><p class="personal-meta">${esc(entry.payload.reason)} · 保存前可以修改；确认后生成新的资料版本，原版本和对话依据保留。</p><blockquote>${esc(entry.payload.source_quotes.join("\n"))}</blockquote><div class="personal-card-fields"><label>类型<select data-card-field="item_type">${optionMarkup}</select></label><label>标题<input type="text" maxlength="300" data-card-field="title" value="${esc(item.title)}"></label><label>分类标签<input type="text" maxlength="120" data-card-field="category" value="${esc(item.category || "")}"></label><label>副标题<input type="text" maxlength="600" data-card-field="subtitle" value="${esc(item.subtitle || "")}"></label><label>时间<input type="text" maxlength="300" data-card-field="time" value="${esc(item.time || "")}"></label><label class="personal-card-wide">摘要<textarea maxlength="4000" data-card-field="summary">${esc(item.summary || "")}</textarea></label><label class="personal-card-wide">负责内容<textarea maxlength="2000" data-card-field="ownership">${esc(item.ownership || "")}</textarea></label><label class="personal-card-wide">事实（每行“标签：内容”）<textarea data-card-field="facts">${esc(facts)}</textarea></label></div><div class="personal-proposal-actions v1-edit-actions"><button type="button" class="v1-edit-text-action" data-card-save="${proposalId}">确认保存资料卡</button><button type="button" class="v1-edit-text-action" data-card-reject="${proposalId}">暂不采纳</button></div></article>`;
    });
    const decided = new Set(state.decisions.map((entry) => entry.proposal_id));
    const pending = state.proposals.filter((entry) => !decided.has(entry.proposal_id));
    renderProposals(byId("personal-proposals"), pending, "memory", (entry) => `<article class="personal-proposal" data-proposal="${esc(entry.proposal_id)}"><h3>${entry.operation === "RETRACT" ? "确认停止使用这条补充" : "待确认的个人补充"} · ${esc(labels[entry.kind])}</h3><p class="personal-meta">${esc(entry.reason)}</p><blockquote>你的原话：${esc(entry.human_quote)}</blockquote>${entry.before_text ? `<p class="personal-meta">原有内容：${esc(entry.before_text)}</p>` : ""}<label for="proposal-${esc(entry.proposal_id)}">${entry.operation === "RETRACT" ? "将停止用于之后的分析；历史仍保留" : "确认内容，可在保存前修改"}</label><textarea id="proposal-${esc(entry.proposal_id)}" maxlength="1200" ${entry.operation === "RETRACT" ? "readonly" : ""}>${esc(entry.text)}</textarea><div class="personal-proposal-actions v1-edit-actions"><button type="button" class="v1-edit-text-action" data-memory-save="${esc(entry.proposal_id)}">${entry.operation === "RETRACT" ? "确认停止使用" : "确认保存"}</button><button type="button" class="v1-edit-text-action" data-memory-reject="${esc(entry.proposal_id)}">暂不采纳</button></div></article>`);
    const last = turns.filter((entry) => entry.status === "SUCCEEDED").at(-1);
    byId("personal-context-usage").textContent = last ? `最近一轮：选取 ${last.context_coverage.included_records}/${last.context_coverage.total_records} 条详细证据，${last.context_coverage.truncated_records} 条节选。对话上下文 ${Math.round(last.context_bytes / 1024)} KB；${last.calls} 次模型调用${Number.isInteger(last.usage?.prompt_tokens) ? `，对话输入 ${last.usage.prompt_tokens} tokens` : ""}。` : "原始资料长期保留；每轮加载当前证据、资料目录与预算内的对话原话，有有效整体理解时复用。";
    runtimeMode();
  }
  async function load() {
    const generation = ++loadGeneration;
    const db = await Truth.openDatabase();
    try {
      const [snapshot, memories, proposals, decisions, turns, cardProposals] = await Promise.all([Candidate.buildSnapshotFromDatabase(db), ...["personal_memory_revisions", "personal_memory_proposals", "personal_memory_decisions", "personal_conversation_turns", "context_proposals"].map((name) => Memory.getAll(db, name))]);
      if (generation !== loadGeneration) return;
      state = { snapshot, memories, proposals, decisions, turns, cardProposals };
      if (!draftLoaded) {
        const draftId = new URLSearchParams(location.search).get("draft");
        const draft = turns.find((entry) => entry.turn_id === draftId && entry.kind === "INTAKE");
        if (draft) {
          byId("personal-message").value = draft.human_message; origin = draft.origin;
          byId("personal-origin").classList.remove("hidden");
          byId("personal-origin").textContent = "来自原对话的个人补充。请核对下面的原话，再发送整理；尚未保存为个人事实。";
        }
        draftLoaded = true;
      }
      render();
    } finally { db.close(); }
  }
  async function reloadAfterAction() {
    try { await load(); }
    catch (error) { status(errorCopy(error), true); }
    finally { runtimeMode(); }
  }
  async function run(task, input = null) {
    if (busy) return;
    const gate = runtimeMode();
    if (!gate.allowed) { status("请先在首页选择可用模型。", true); return; }
    if (!UI.requireTransferConsent(byId("personal-model-consent"))) return;
    const draft = input ? UI.takeDraft(input) : null;
    pendingMessage = draft?.text.trim() || null;
    busy = true; status(""); if (state) render(); runtimeMode();
    UI.setExecutionState({ form: byId("personal-conversation-form"), status: byId("personal-processing"), active: true, copy: "正在准备当前个人资料…" });
    let db;
    try {
      const snapshot = Understanding.runtimeSnapshot();
      db = await Truth.openDatabase();
      const call = async (request) => {
        const current = Gate.operationGate("personal_understanding");
        if (!current.allowed || current.authority.runtime.model !== snapshot.model || current.authority.runtime.provider !== snapshot.provider || !byId("personal-model-consent").checked) throw new Error("PERSONAL_RUNTIME_CHANGED");
        return Understanding.callRuntime(request);
      };
      await task(db, { runtime_snapshot: snapshot, consent: true, call,
        onProgress: (copy) => UI.setExecutionState({ form: byId("personal-conversation-form"), status: byId("personal-processing"), active: true, copy }) });
    } catch (error) { draft?.finish(true); status(errorCopy(error), true); }
    finally {
      db?.close(); draft?.finish(); pendingMessage = null;
      try { await load(); }
      finally { busy = false; UI.setExecutionState({ form: byId("personal-conversation-form"), status: byId("personal-processing"), active: false }); runtimeMode(); }
    }
  }
  byId("personal-conversation-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!busy && runtimeMode().allowed && !UI.requireTransferConsent(byId("personal-model-consent"))) return;
    const humanMessage = byId("personal-message").value.trim(); if (!humanMessage) return;
    run(async (db, options) => {
      await Understanding.discuss(db, { ...options, human_message: humanMessage, origin });
      byId("personal-origin").classList.add("hidden"); origin = { type: "PERSONAL" };
    }, byId("personal-message"));
  });
  byId("refresh-understanding").addEventListener("click", () => run(async (db, options) => {
    const result = await Understanding.refresh(db, options);
    status(!result.snapshot.personal_understanding ? "尚无可综合的个人资料，可以先添加资料或补充信息。" : result.cached ? "当前理解已与资料一致，无需重复调用模型。" : `理解已更新：复用 ${result.snapshot.personal_understanding.reused_fragments} 段摘要，重新理解 ${result.snapshot.personal_understanding.refreshed_fragments} 段。`);
  }));
  window.AriadneRuntimeSelection.bindTransferConsent("personal_understanding", byId("personal-model-consent"));
  byId("personal-model-consent").addEventListener("change", runtimeMode);
  byId("personal-older-messages").addEventListener("click", () => { visibleTurns += 20; render(); });
  document.querySelectorAll("[data-personal-prompt]").forEach((button) => button.addEventListener("click", () => { byId("personal-message").value = button.dataset.personalPrompt; byId("personal-message").focus(); }));
  byId("saved-memories").addEventListener("click", async (event) => {
    const button = event.target.closest("button"); if (!button || busy) return;
    const memoryId = button.dataset.memoryEdit || button.dataset.memoryForget;
    const memory = Memory.latest(state.memories).find((entry) => entry.memory_id === memoryId); if (!memory) return;
    if (button.dataset.memoryEdit) { byId("personal-message").value = window.AriadneI18n?.t(`我想修正这条已保存的补充：“${memory.text}”。实际情况是：`) || `我想修正这条已保存的补充：“${memory.text}”。实际情况是：`; byId("personal-message").focus(); return; }
    let db;
    try {
      db = await Truth.openDatabase();
      const proposal = Memory.createProposal({ operation: "RETRACT", kind: memory.kind, text: memory.text, reason: "你选择不再使用这条补充。", human_quote: memory.text, target_memory_ref: "memory-selected", related_refs: [] },
        { human_message: memory.text, origin: { type: "PERSONAL_MEMORY_CONTROL" }, memories: [{ ...memory, ref: "memory-selected" }] });
      await Memory.write(db, "personal_memory_proposals", proposal); await load();
      byId("personal-proposals").scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) { status(errorCopy(error), true); } finally { db?.close(); }
  });
  byId("personal-proposals").addEventListener("click", async (event) => {
    const button = event.target.closest("button"); if (!button || busy) return;
    const proposalId = button.dataset.memorySave || button.dataset.memoryReject; if (!proposalId) return;
    busy = true; button.disabled = true; runtimeMode(); let db;
    try {
      const view = assertProposalDraft("memory", proposalId);
      db = await Truth.openDatabase();
      const submittedVersion = view.editVersion;
      const result = await Memory.decide(db, proposalId, button.dataset.memorySave ? "SAVE" : "REJECT", byId(`proposal-${proposalId}`).value);
      settleProposalDraft(view, submittedVersion);
      status(result.revision ? "已保存。后续个人对话与职位分析会读取最新补充；历史版本保留。" : "已暂不采纳，个人确认信息没有变化。");
    } catch (error) { status(errorCopy(error), true); }
    finally { db?.close(); busy = false; await reloadAfterAction(); }
  });
  byId("personal-card-proposals").addEventListener("click", async (event) => {
    const button = event.target.closest("button"); if (!button || busy) return;
    const proposalId = button.dataset.cardSave || button.dataset.cardReject; if (!proposalId) return;
    const article = button.closest("[data-card-proposal]");
    const value = (name) => article.querySelector(`[data-card-field="${name}"]`).value;
    const facts = () => value("facts").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
      const separator = Math.max(line.indexOf("："), line.indexOf(":"));
      return separator > 0 ? { label: line.slice(0, separator).trim(), value: line.slice(separator + 1).trim() } : { label: "补充信息", value: line };
    }).filter((fact) => fact.value);
    busy = true; button.disabled = true; runtimeMode(); let db;
    try {
      const view = assertProposalDraft("card", proposalId);
      db = await Truth.openDatabase();
      const submittedVersion = view.editVersion;
      const outcome = await CandidateCards.decide(db, proposalId, button.dataset.cardSave ? "SAVE" : "REJECT", button.dataset.cardSave ? {
        item_type: value("item_type"), title: value("title"), category: value("category"), subtitle: value("subtitle"), time: value("time"),
        summary: value("summary"), ownership: value("ownership"), facts: facts(),
      } : null);
      settleProposalDraft(view, submittedVersion);
      status(outcome.revision ? `资料卡已保存为确认版本 ${outcome.revision.version}；原版本和对话依据仍保留。` : "已暂不采纳，个人资料卡没有变化。");
    } catch (error) { status(errorCopy(error), true); }
    finally { db?.close(); busy = false; await reloadAfterAction(); }
  });
  Gate.subscribe(() => { window.AriadneRuntimeSelection.syncTransferConsent("personal_understanding", byId("personal-model-consent")); runtimeMode(); });
  window.addEventListener("focus", () => { if (!busy) load().catch((error) => status(errorCopy(error), true)); });
  try { await load(); } catch (error) { status(errorCopy(error), true); }
}());
