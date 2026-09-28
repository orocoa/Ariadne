"use strict";
// Presentation over the existing recipient/settings/scope consent authority.
(function (root) {
  const doc = root.document, selection = root.AriadneRuntimeSelection;
  if (!doc || !selection || root.AriadneConversationEntry) return;
  const forms = {
    "personal-conversation-form": "personal_understanding", "job-overview-form": "job_overview",
    "candidate-workspace-composer": "candidate_conversation", "candidate-conversation-form": "candidate_conversation",
    "job-workspace-composer": "job_conversation", "job-conversation-form": "job_conversation",
  };
  const tr = (zh, en) => doc.documentElement.lang.startsWith("en") ? en : zh;
  const css = doc.createElement("link"); css.rel = "stylesheet"; css.href = "/conversation-entry-consent.css?v=1"; doc.head.append(css);
  const entries = new Map();
  function mount(form, operation) {
    const pane = form.closest(".v1-conversation-pane, .v1-ariadne-pane");
    if (!pane) return null;
    const gate = doc.createElement("section"); gate.className = "v1-conversation-entry"; gate.hidden = true;
    gate.setAttribute("role", "region"); gate.setAttribute("aria-labelledby", `${form.id}-entry-heading`);
    const title = doc.createElement("h2"); title.id = `${form.id}-entry-heading`;
    const copy = doc.createElement("p"), boundary = doc.createElement("p"), button = doc.createElement("button");
    boundary.className = "v1-entry-boundary";
    button.type = "button"; button.className = "v1-primary-button";
    gate.append(title, copy, boundary, button); pane.prepend(gate);
    const entry = { form, pane, gate, title, copy, boundary, button, operation, enteredToken: null, locked: false, transition: null, states: new Map() };
    button.addEventListener("click", () => enter(entry));
    entries.set(form.id, entry); return entry;
  }
  function cancelTransition(entry) {
    const transition = entry.transition;
    entry.transition = null;
    transition?.animation?.cancel();
    entry.button.disabled = false;
    delete entry.pane.dataset.entryTransition;
  }
  function lock(entry, locked, blocked = locked) {
    entry.locked = blocked;
    if (entry.gate.hidden === locked) entry.gate.hidden = !locked;
    for (const child of entry.pane.children) {
      if (child === entry.gate) continue;
      if (blocked) {
        if (!entry.states.has(child)) entry.states.set(child, child.inert);
        if (!child.inert) child.inert = true;
      } else if (entry.states.has(child)) {
        child.inert = entry.states.get(child); entry.states.delete(child);
      }
      child.classList.toggle("v1-entry-obscured", locked);
    }
  }
  async function enter(entry) {
    if (entry.transition || !entry.locked) return;
    const transition = { token: entry.token, animation: null };
    entry.transition = transition;
    entry.button.disabled = true;
    try {
      selection.acceptEntryConsent(entry.operation, transition.token);
      entry.enteredToken = transition.token;
      const style = root.getComputedStyle(entry.pane);
      const duration = name => {
        const value = style.getPropertyValue(name).trim();
        return parseFloat(value) * (value.endsWith("ms") ? 1 : 1000) || 0;
      };
      const animate = async (frames, time, easing) => {
        const previous = transition.animation;
        transition.animation = entry.pane.animate(frames, { duration: time, easing, fill: "both" });
        previous?.cancel();
        await transition.animation.finished;
      };
      if (!root.matchMedia("(prefers-reduced-motion: reduce)").matches && entry.pane.animate) {
        // Fade the whole pane so history, introduction and composer share one transition.
        entry.pane.dataset.entryTransition = "leaving";
        await animate([{ opacity: 1 }, { opacity: 0 }], duration("--vi-motion-close") / 2,
          style.getPropertyValue("--vi-ease-standard").trim() || "ease");
        if (entry.transition !== transition) return;
        lock(entry, false, true);
        entry.pane.dataset.entryTransition = "entering";
        await animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }],
          duration("--vi-motion-open"), style.getPropertyValue("--vi-ease-reveal").trim() || "ease");
      }
      if (entry.transition !== transition) return;
      cancelTransition(entry);
      refresh();
      if (!entry.locked) entry.form.querySelector("textarea")?.focus({ preventScroll: true });
    } catch (_) {
      // Cancellation belongs to a newer scope/settings state or page lifecycle.
      if (entry.transition !== transition) return;
      cancelTransition(entry);
      refresh();
      if (entry.locked) entry.boundary.textContent = tr("模型设置已变化，请核对后重新确认。", "Model settings changed. Review them before accepting.");
    }
  }
  function refresh() {
    for (const [id, operation] of Object.entries(forms)) {
      const form = doc.getElementById(id); if (!form) continue;
      const entry = entries.get(id) || mount(form, operation); if (!entry) continue;
      const state = selection.entryConsent(operation);
      // Existing checkbox stays as the domain guard, not a second visible consent.
      entry.pane.querySelectorAll(".personal-consent, .job-overview-consent").forEach(label => { if (!label.hidden) label.hidden = true; });
      // Every conversation requires acceptance for this visit and current settings.
      // Returning to a previously accepted model must not revive an older entry.
      if (entry.token !== state.token) entry.enteredToken = null;
      const locked = Boolean(state.scope && state.fingerprint && (!state.accepted || entry.enteredToken !== state.token));
      if (entry.transition && (entry.transition.token !== state.token || locked)) cancelTransition(entry);
      entry.token = state.token;
      const recipient = state.runtime.provider === "codex" ? "Codex / OpenAI" : state.runtime.provider;
      const scope = operation === "personal_understanding" || operation === "candidate_conversation"
        ? tr("后续问题、相关个人资料、已保存补充和对话历史", "Your subsequent questions, relevant personal records, saved notes and conversation history")
        : tr("后续问题、当前职位、相关个人资料、已保存补充和对话历史", "Your subsequent questions, current jobs, relevant personal records, saved notes and conversation history");
      const copy = tr(`${scope}将发送至 ${recipient} · ${state.runtime.model}，可能消耗模型额度或产生 API 费用。更新理解可能分批调用。`, `${scope} will be sent to ${recipient} · ${state.runtime.model}, using model credits or incurring API charges. Updating understanding may require multiple calls.`);
      if (entry.copy.textContent !== copy) entry.copy.textContent = copy;
      const title = tr("开始对话前", "Before starting a conversation"); if (entry.title.textContent !== title) entry.title.textContent = title;
      const search = state.runtime.provider === "codex"
        ? tr("提交后，本机 Codex 可按需查询公开网页；网上信息不属于你的个人经历。", "After submission, local Codex may search public websites when needed; online information is not your personal experience. ") : "";
      const boundary = tr("确认只是进入对话，不会立即发送资料。", "Accepting only opens the conversation; nothing is sent yet. ") + search
        + tr("资料修改仍需另行确认保存，附件仍按本轮单独确认。", "Record changes require separate confirmation, as do attachments for each turn.");
      if (entry.boundary.textContent !== boundary) entry.boundary.textContent = boundary;
      const button = tr("同意并进入对话", "Accept and enter conversation"); if (entry.button.textContent !== button) entry.button.textContent = button;
      if (!entry.transition) lock(entry, locked);
      entry.pane.dataset.entryReady = "true";
    }
  }
  let queued = false;
  const schedule = () => { if (queued) return; queued = true; root.requestAnimationFrame(() => { queued = false; refresh(); }); };
  function resetVisit() {
    for (const entry of entries.values()) {
      cancelTransition(entry);
      entry.enteredToken = null;
    }
    refresh();
  }
  root.AriadneConversationEntry = Object.freeze({ refresh, resetVisit, requiresConfirmation: operation => [...entries.values()].some(entry => entry.operation === operation && entry.locked) });
  root.addEventListener("pagehide", resetVisit);
  root.addEventListener("pageshow", event => { if (event.persisted) resetVisit(); });
  root.addEventListener("ariadne-runtime-selection", schedule);
  root.addEventListener("storage", schedule);
  root.JobRadarRuntimeGate?.subscribe(schedule);
  new MutationObserver(schedule).observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden", "data-model-scope", "lang"] });
  refresh();
}(globalThis));
