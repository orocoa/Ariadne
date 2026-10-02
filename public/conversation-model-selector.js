"use strict";
(function (root) {
  const Selection = root.AriadneRuntimeSelection, Settings = root.AriadneModelSettings, Gate = root.JobRadarRuntimeGate;
  const FORMS = { "candidate-workspace-composer": "candidate_conversation", "candidate-conversation-form": "candidate_conversation",
    "job-workspace-composer": "job_conversation", "job-conversation-form": "job_conversation",
    "personal-conversation-form": "personal_understanding", "job-overview-form": "job_overview" };
  async function models(operation) {
    // Re-read on each open so newly qualified models (and removals) are reflected.
    const response = await (root.AriadneTransport || root).fetch("/api/runtime-options", { cache: "no-store" });
    if (!response.ok) throw Error("无法读取可用模型，请检查本地服务或连接。");
    const result = await response.json();
    if (root.AriadneProduct?.kind === "skill" && result.settings_catalog) Settings.refreshCodex(result.settings_catalog);
    return { entries: Selection.eligibleModels(result.models, operation), unavailable: result.unavailable_models || [], note: result.effort_note || "", verification: result.verification };
  }
  function mount(form, operation) {
    const field = form.querySelector(".v1-composer-field");
    if (!field) return;
    field.classList.add("has-model-selector");
    const trigger = document.createElement("button");
    trigger.type = "button"; trigger.className = "v1-model-trigger";
    trigger.setAttribute("aria-label", "选择模型与推理强度"); trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-haspopup", "menu");
    field.insertBefore(trigger, field.querySelector('button[type="submit"]'));
    const panel = document.createElement("div");
    panel.className = "v1-model-panel"; panel.setAttribute("popover", "auto"); panel.setAttribute("role", "menu");
    panel.setAttribute("aria-label", "选择模型"); panel.tabIndex = -1;
    const prefix = form.id + "-model";
    panel.id = prefix;
    trigger.setAttribute("aria-controls", prefix);
    panel.innerHTML = `<h3>选择模型</h3><div data-model-options role="group"></div><p>${root.AriadneProduct?.kind === "skill" ? "由 Ariadne Skill 使用本机 Codex。对话可按需搜索公开网页，查询词会发送至搜索服务；网页信息只作外部参考，不写入个人经历。" : '切换模型服务请前往<a href="/index.html">连接设置</a>。'}</p><p data-model-error role="status"></p>`;
    document.body.append(panel);
    const choices = panel.querySelector("[data-model-options]"), error = panel.querySelector("[data-model-error]");
    let openedRevision, openedScope, original, saving = false, opening = 0, poll = null;
    const scope = () => Selection.bindings.get(form.id)?.scope || Selection.scopeFor(operation);
    const busy = () => form.getAttribute("aria-busy") === "true" || saving;
    const render = () => {
      const runtime = Selection.resolve(operation, scope());
      trigger.textContent = Settings.label(runtime, true);
      trigger.setAttribute("aria-label", `选择模型与推理强度：${Settings.label(runtime, true)}`);
      trigger.title = `${Settings.label(runtime)} · ${Selection.hasOverride(scope()) ? "此对话设置" : "继承默认设置"}`;
      trigger.disabled = busy();
      if (panel.matches(":popover-open") && (busy() || openedRevision !== Selection.version() || openedScope !== scope())) panel.hidePopover();
    };
    const position = () => {
      if (!panel.matches(":popover-open")) return;
      const rect = trigger.getBoundingClientRect();
      panel.style.maxHeight = `${Math.max(44, rect.top - 20)}px`;
      panel.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - panel.offsetWidth - 12))}px`;
      panel.style.top = `${Math.max(12, rect.top - panel.offsetHeight - 8)}px`;
    };
    trigger.onclick = async () => {
      if (busy()) return;
      if (panel.matches(":popover-open")) { panel.hidePopover(); return; }
      const ticket = ++opening;
      openedRevision = Selection.version(); openedScope = scope(); original = Selection.resolve(operation, openedScope);
      error.textContent = "正在读取可用模型…"; choices.replaceChildren();
      panel.showPopover(); trigger.setAttribute("aria-expanded", "true"); position();
      try {
        if (original.mode !== "model") throw Error("当前处于 Local 模式。请先在连接设置选择模型。");
        if (!openedScope) throw Error("请先打开一份资料或职位。");
        let { entries, unavailable, note, verification } = await models(operation);
        if (ticket !== opening || !panel.matches(":popover-open") || busy()) return;
        error.textContent = "";
        let selected = entries.find(entry => entry.model_id === original.model);
        if (!entries.length && !verification) throw Error("当前没有通过验证且可用的模型。");
        let effort = selected?.model_id === original.model ? original.execution_settings?.effective_settings?.reasoning_effort : null;
        const live = () => ticket === opening && panel.matches(":popover-open") && !busy() && scope() === openedScope && Selection.version() === openedRevision;
        let changingVerification = false;
        const reload = async () => {
          clearTimeout(poll);
          try {
            const result = await models(operation);
            if (!live()) return;
            const selectedId = selected?.model_id;
            const focused = choices.contains(document.activeElement) ? document.activeElement.textContent : null;
            ({ entries, unavailable, note, verification } = result);
            selected = entries.find(entry => entry.model_id === selectedId);
            draw(); position();
            if (focused) [...choices.querySelectorAll('button:not(:disabled)')].find(button => button.textContent === focused)?.focus({ preventScroll: true });
            if (verification?.active) poll = setTimeout(reload, 2000);
          } catch (_) {
            if (live()) error.textContent = "无法更新验证状态；重新打开菜单可查看结果。";
          }
        };
        const changeVerification = async body => {
          if (!live() || changingVerification) return;
          changingVerification = true; draw();
          try {
            const response = await (root.AriadneTransport || root).fetch("/api/codex-verification", {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            if (!response.ok) throw Error("无法更新验证设置，请检查 Codex 登录或稍后重试。");
            changingVerification = false;
            if (live()) await reload();
          } catch (err) { changingVerification = false; if (live()) { draw(); error.textContent = err.message; } }
          finally { changingVerification = false; }
        };
        const draw = () => {
          choices.replaceChildren();
          error.textContent = selected ? "" : "当前模型不可用，请重新选择。";
          const heading = text => { const node = document.createElement("h3"); node.textContent = text; choices.append(node); };
          const option = (text, checked, choose, data = {}, parent = choices) => {
            const button = document.createElement("button"); button.type = "button"; button.dataset.modelChoice = "";
            Object.assign(button.dataset, data); button.setAttribute("role", "menuitemradio"); button.setAttribute("aria-checked", String(checked));
            button.textContent = text; button.onclick = choose; parent.append(button); return button;
          };
          const modelGroup = document.createElement("div"); modelGroup.setAttribute("role", "group"); modelGroup.setAttribute("aria-label", "模型"); choices.append(modelGroup);
          for (const entry of entries) {
            option(Settings.descriptor(entry.provider_id, entry.model_id).short_label, entry === selected, () => {
              selected = entry; draw(); choices.querySelector(`[data-model-id="${CSS.escape(entry.model_id)}"]`)?.focus(); position();
            }, { modelId: entry.model_id }, modelGroup);
          }
          const item = selected && Settings.descriptor(selected.provider_id, selected.model_id), spec = item?.parameters.reasoning_effort;
          if (spec) {
            if (!spec.options.some(option => option.value === effort)) effort = spec.default;
            heading("推理强度");
            const effortGroup = document.createElement("div"); effortGroup.className = "v1-model-efforts"; effortGroup.setAttribute("role", "group"); effortGroup.setAttribute("aria-label", "推理强度"); choices.append(effortGroup);
            for (const value of spec.options) option(value.label, value.value === effort, () => {
              effort = value.value; draw(); choices.querySelector(`[data-effort="${CSS.escape(effort)}"]`)?.focus();
            }, { effort: value.value }, effortGroup);
          }
          if (note) { const hint = document.createElement("p"); hint.textContent = note; choices.append(hint); }
          if (unavailable.length) {
            heading("其他模型");
            for (const entry of unavailable) {
              const hint = document.createElement("p"); hint.textContent = `${entry.display_name} · ${entry.reason}`; choices.append(hint);
              if (entry.can_retry) {
                const retry = option(`重新验证 ${entry.display_name}`, false, () => changeVerification({ retry: entry.model, consent: true }));
                retry.setAttribute("role", "menuitem"); retry.removeAttribute("aria-checked"); retry.disabled = changingVerification;
              }
            }
          }
          if (verification) {
            const hint = document.createElement("p"); hint.textContent = verification.message; choices.append(hint);
            const toggle = option(verification.enabled ? "关闭自动验证" : "允许自动验证新型号", false,
              () => changeVerification({ enabled: !verification.enabled, consent: true }));
            toggle.setAttribute("role", "menuitem"); toggle.removeAttribute("aria-checked");
            toggle.dataset.verificationToggle = ""; toggle.disabled = changingVerification || !verification.available;
          }
          const apply = document.createElement("button"); apply.type = "button"; apply.className = "v1-model-apply";
          apply.textContent = "应用"; apply.disabled = !selected; apply.onclick = () => {
            const runtime = { mode: "model", provider: selected.provider_id, model: selected.model_id };
            runtime.execution_settings = Settings.envelope(runtime, spec ? { reasoning_effort: effort } : {});
            save(runtime);
          }; choices.append(apply);
        };
        draw(); position();
        if (verification?.active) poll = setTimeout(reload, 2000);
        (choices.querySelector('[aria-checked="true"]') || choices.querySelector("button"))?.focus({ preventScroll: true });
      } catch (err) {
        if (ticket === opening && panel.matches(":popover-open")) { error.textContent = err.message; position(); panel.focus(); }
      }
    };
    panel.addEventListener("keydown", event => {
      const buttons = [...choices.querySelectorAll("button:not(:disabled)")];
      if (event.key === "Tab") { panel.hidePopover(); trigger.focus(); return; }
      if (!buttons.length || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const index = buttons.indexOf(document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
    });
    panel.addEventListener("toggle", event => {
      trigger.setAttribute("aria-expanded", String(event.newState === "open"));
      if (event.newState === "closed") {
        clearTimeout(poll);
        opening++;
        if (!trigger.disabled && (panel.contains(document.activeElement) || document.activeElement === document.body)) trigger.focus({ preventScroll: true });
      }
    });
    root.addEventListener("resize", position);
    root.addEventListener("scroll", position, true);
    async function save(runtime) {
      try {
        if (busy() || scope() !== openedScope) throw Error("当前对话已变化，请重新打开模型菜单。");
        saving = true;
        for (const button of choices.querySelectorAll("button")) button.disabled = true;
        await Selection.update({ scope: openedScope, runtime, expectedRevision: openedRevision });
        panel.hidePopover();
      } catch (err) { error.textContent = err.message; position(); }
      finally {
        saving = false;
        for (const button of choices.querySelectorAll("button")) button.disabled = false;
        render();
      }
    }
    new MutationObserver(render).observe(form, { attributes: true, attributeFilter: ["aria-busy", "data-model-scope"] });
    Gate.subscribe(render); render();
  }
  document.addEventListener("DOMContentLoaded", () => {
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "/conversation-model-selector.css?v=model-effort-2"; document.head.append(link);
    for (const [id, operation] of Object.entries(FORMS)) { const form = document.getElementById(id); if (form) mount(form, operation); }
  }, { once: true });
}(globalThis));
