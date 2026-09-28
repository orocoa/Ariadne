"use strict";
(function (root, factory) {
  const Settings = root.AriadneModelSettings || (typeof module === "object" ? require("./model-settings.js") : null);
  const api = factory(root, Settings);
  if (typeof module === "object") module.exports = api;
  root.AriadneRuntimeSelection = api;
}(globalThis, function (root, Settings) {
  const KEY = "ariadne-model-selection-v2", CURRENT = "job-radar-selected-runtime", LEGACY = "ariadne-operation-runtimes-v1";
  const TRANSFER_CONSENT_KEY = "ariadne-model-transfer-consents-v1";
  const TRANSFER_DISCLOSURE_VERSION = "conversation-context-and-cost-v1";
  const bindings = new Map();
  const transferConsents = new Map();
  if (root.document?.createElement && root.document?.head) {
    const attachUpdates = () => {
      const script = root.document.createElement("script"); script.src = "/model-updates.js?v=1";
      root.document.head.append(script);
      const entry = root.document.createElement("script"); entry.src = "/conversation-entry-consent.js?v=5";
      root.document.head.append(entry);
    };
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", attachUpdates, { once: true });
    else attachUpdates();
  }
  const read = (key, storage = root.localStorage) => { const raw = storage?.getItem(key); return raw ? JSON.parse(raw) : null; };
  const revision = () => root.crypto.randomUUID();
  const notify = () => root.dispatchEvent?.(new Event("ariadne-runtime-selection"));
  const COPIES = { RUNTIME_SELECTION_CHANGED: "模型设置已变化，本轮尚未发送；请确认当前设置后重试。", RUNTIME_SELECTION_UPGRADE: "运行设置已升级，请刷新页面后重试。", RUNTIME_SELECTION_DECLINED: "本轮未发送，输入和附件已保留。", RUNTIME_CONSENT_REQUIRED: "请先勾选底部的资料传输与费用说明，再点击发送。" };
  const errorCopy = error => (error?.code || error?.message) === "RUNTIME_CONSENT_REQUIRED" && root.AriadneConversationEntry
    ? "请先确认资料传输与费用说明，再进入对话。" : COPIES[error?.code || error?.message] || "";
  const fail = code => { const error = new Error(code); error.code = code; throw error; };
  function scopeFor(operation) {
    if (["personal_understanding", "job_overview"].includes(operation)) return operation;
    return [...bindings.values()].find(value => value.operation === operation)?.scope || null;
  }
  function bind(formId, operation, scope) {
    if (!scope) bindings.delete(formId);
    else bindings.set(formId, { operation, scope });
    const form = root.document?.getElementById(formId);
    if (form) form.dataset.modelScope = scope || "";
    notify();
  }
  function homepage(storage = root.localStorage) {
    const saved = read(CURRENT, storage) || { mode: "local" };
    const stored = root.AriadneProduct?.runtime(saved) || saved;
    return root.AriadneRuntimeExecution?.normalizeCurrentRuntime(stored) || stored;
  }
  function eligibleModels(entries, operation, storage = root.localStorage) {
    const selected = homepage(storage);
    if (selected.mode !== "model" || !Array.isArray(entries)) return [];
    const seen = new Set();
    return entries.filter(item => {
      if (item?.provider_id !== selected.provider || !Settings.descriptor(item.provider_id, item.model_id)) return false;
      const key = `${item.provider_id}/${item.model_id}`;
      const runtime = { mode: "model", provider: item.provider_id, model: item.model_id };
      if (seen.has(key) || !root.JobRadarRuntimeGate?.operationGate(operation, root.JobRadarRuntimeGate.authorityFrom(runtime, operation)).allowed) return false;
      seen.add(key); return true;
    });
  }
  function resolve(operation, scope = null, storage = root.localStorage) {
    const raw = homepage(storage);
    if (raw.mode === "local") return { mode: "local", provider: null, model: null };
    const state = read(KEY, storage);
    // A homepage change is an explicit new app default. Do not resurrect an older identity.
    const matches = state?.default?.provider === raw.provider && state?.default?.model === raw.model;
    const legacy = read(LEGACY, storage)?.[operation];
    const differingLegacy = !state?.inherit?.[scope] && legacy && (legacy.provider !== raw.provider || legacy.model !== raw.model);
    // Provider is owned by the homepage. Preserve incompatible stored preferences
    // for history/revisiting, but never let them route a turn to another service.
    const chosen = [(scope && state?.overrides?.[scope]), (differingLegacy && legacy),
      (matches && state.default), (!state?.inherit?.[scope] && legacy), raw]
      .find(value => value && value.provider === raw.provider);
    const runtime = { mode: "model", provider: chosen.provider, model: Settings.currentModel(chosen.provider, chosen.model) };
    const rev = chosen.revision || `legacy:${runtime.provider}:${runtime.model}`;
    return { ...runtime, execution_settings: Settings.envelope(runtime, chosen.settings, rev, scope) };
  }
  function version(storage = root.localStorage) { return JSON.stringify([read(KEY, storage)?.revision || "legacy", read(CURRENT, storage), read(LEGACY, storage)]); }
  async function update({ scope, runtime, expectedRevision, clear = false, makeDefault = false, isCurrent = () => true }, storage = root.localStorage) {
    const change = () => {
      if (!isCurrent()) throw Error("对话状态已变化，请重新确认切换。");
      if (version(storage) !== expectedRevision) throw Error("模型设置已在另一页面变化，请重新打开菜单后选择。");
      const before = read(KEY, storage), raw = read(CURRENT, storage) || {};
      const state = before || { default: null, overrides: {}, revision: "legacy" };
      const next = revision();
      if (!clear) {
        const selected = homepage(storage);
        if (selected.mode !== "model" || runtime?.mode !== "model" || runtime?.provider !== selected.provider) throw Error("切换模型服务请前往连接设置；对话内只能选择当前服务的模型。");
        if (!Settings.descriptor(runtime.provider, runtime.model) || !root.JobRadarRuntimeGate?.isModelRuntimeEligible(runtime)) throw Error("此模型尚未通过当前操作的能力验证。");
        Settings.validate(runtime.execution_settings, runtime.provider, runtime.model);
      }
      state.inherit ||= {};
      if (clear) { delete state.overrides[scope]; state.inherit[scope] = true; }
      else {
        delete state.inherit[scope];
        const selected = { provider: runtime.provider, model: runtime.model, settings: runtime.execution_settings.effective_settings, revision: next };
        if (makeDefault) {
          state.default = selected;
          delete state.overrides[scope];
          storage.setItem(CURRENT, JSON.stringify({ mode: "model", provider: selected.provider, model: selected.model }));
          // Explicit default selection completes migration of legacy per-operation assignments.
          storage.setItem(LEGACY, "{}");
        } else state.overrides[scope] = selected;
      }
      if (!state.default && raw.provider) {
        const fallback = Settings.envelope({ ...raw, mode: "model" });
        state.default = { provider: raw.provider, model: raw.model, settings: fallback?.effective_settings, revision: `legacy:${raw.provider}:${raw.model}` };
      }
      state.revision = next;
      storage.setItem(KEY, JSON.stringify(state));
      notify();
      return next;
    };
    if (root.document && root.navigator?.locks) return root.navigator.locks.request(KEY, change);
    if (root.document) throw Error("当前浏览器不支持安全保存跨页面模型偏好。");
    return change();
  }
  function assertCurrent(snapshot, operation, storage = root.localStorage) {
    const captured = snapshot.execution_settings;
    if (!captured) fail("RUNTIME_SELECTION_UPGRADE");
    const current = resolve(operation, captured.scope, storage);
    if (Settings.identity(current) !== Settings.identity(snapshot) || current.execution_settings?.selection_revision !== captured.selection_revision) {
      fail("RUNTIME_SELECTION_CHANGED");
    }
  }
  const consentFingerprint = (snapshot, operation) => JSON.stringify([operation === "job_overview" ? "job-personal-context-public-links-v2" : operation === "job_conversation" ? "job-workspace-followup-text-v2" : TRANSFER_DISCLOSURE_VERSION, Settings.identity(snapshot)]);
  function consentStore(storage = root.localStorage) {
    try {
      const value = read(TRANSFER_CONSENT_KEY, storage);
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (_error) { return {}; }
  }
  function rememberedConsent(operation, scope, fingerprint, storage = root.localStorage) {
    const values = consentStore(storage)[`${operation}:${scope}`];
    return Array.isArray(values) && values.includes(fingerprint);
  }
  function updateRememberedConsent(operation, scope, fingerprint, accepted, storage = root.localStorage) {
    if (!storage || !fingerprint) return;
    const state = consentStore(storage), key = `${operation}:${scope}`;
    const values = new Set(Array.isArray(state[key]) ? state[key] : []);
    if (accepted) values.add(fingerprint); else values.delete(fingerprint);
    if (values.size) state[key] = [...values].slice(-12); else delete state[key];
    storage.setItem(TRANSFER_CONSENT_KEY, JSON.stringify(state));
  }
  function syncTransferConsent(operation, checkbox, storage = root.localStorage) {
    const scope = scopeFor(operation), entry = transferConsents.get(`${operation}:${scope}`);
    if (!entry || entry.checkbox !== checkbox) return false;
    const runtime = resolve(operation, scope, storage);
    if (runtime.mode !== "model" || !runtime.execution_settings) {
      checkbox.checked = false; entry.fingerprint = null; return false;
    }
    const fingerprint = consentFingerprint(runtime, operation);
    const accepted = rememberedConsent(operation, scope, fingerprint, storage);
    checkbox.checked = accepted;
    entry.fingerprint = accepted ? fingerprint : null;
    checkbox.setCustomValidity("");
    return accepted;
  }
  function bindTransferConsent(operation, checkbox) {
    // A visible, explicit checkbox replaces the generic confirmation for this
    // scope. Remember an accepted disclosure for the same browser origin and
    // exact model/settings identity; a different recipient or settings revision
    // remains unchecked until the Human accepts it.
    const scope = scopeFor(operation), entry = { checkbox, fingerprint: null };
    transferConsents.set(`${operation}:${scope}`, entry);
    syncTransferConsent(operation, checkbox);
    checkbox.addEventListener("change", () => {
      checkbox.setCustomValidity("");
      const runtime = resolve(operation, scope);
      const fingerprint = runtime.mode === "model" && runtime.execution_settings ? consentFingerprint(runtime, operation) : null;
      entry.fingerprint = checkbox.checked ? fingerprint : null;
      updateRememberedConsent(operation, scope, fingerprint, checkbox.checked);
    });
  }
  function entryConsent(operation, storage = root.localStorage) {
    const scope = scopeFor(operation), runtime = resolve(operation, scope, storage);
    const fingerprint = runtime.mode === "model" && runtime.execution_settings ? consentFingerprint(runtime, operation) : null;
    return { scope, runtime, fingerprint, token: JSON.stringify([scope, fingerprint]), accepted: Boolean(scope && fingerprint && rememberedConsent(operation, scope, fingerprint, storage)) };
  }
  function acceptEntryConsent(operation, expected, storage = root.localStorage) {
    const current = entryConsent(operation, storage);
    if (!current.scope || !current.fingerprint || current.token !== expected) fail("RUNTIME_SELECTION_CHANGED");
    updateRememberedConsent(operation, current.scope, current.fingerprint, true, storage);
    const explicit = transferConsents.get(`${operation}:${current.scope}`);
    if (explicit) {
      syncTransferConsent(operation, explicit.checkbox, storage);
      explicit.checkbox.dispatchEvent?.(new Event("change", { bubbles: true }));
    }
    notify();
  }
  async function beforeDispatch(snapshot, operation) {
    assertCurrent(snapshot, operation);
    if (root.AriadneConversationEntry?.requiresConfirmation?.(operation)) fail("RUNTIME_CONSENT_REQUIRED");
    const explicit = transferConsents.get(`${operation}:${snapshot.execution_settings.scope}`);
    if (explicit) {
      if (!explicit.checkbox.checked || explicit.fingerprint !== consentFingerprint(snapshot, operation)) fail("RUNTIME_CONSENT_REQUIRED");
      return;
    }
    if (!snapshot.execution_settings.scope) return;
    if (rememberedConsent(operation, snapshot.execution_settings.scope, consentFingerprint(snapshot, operation))) return;
    if (root.AriadneConversationEntry) fail("RUNTIME_CONSENT_REQUIRED");
    const key = `ariadne-model-consent:${snapshot.execution_settings.scope}`;
    const fingerprint = JSON.stringify([Settings.identity(snapshot), snapshot.execution_settings.selection_revision]);
    if (root.sessionStorage?.getItem(key) !== fingerprint) {
      const accepted = root.confirm(`本轮将把当前对话所需的资料上下文、相关历史、来源摘录及已确认的附件发送给 ${snapshot.provider === "codex" ? "Codex / OpenAI" : snapshot.provider} / ${snapshot.model}（${Settings.label(snapshot, true)}）。可能消耗额度；修改仍须由你保存。是否继续？`);
      if (!accepted) fail("RUNTIME_SELECTION_DECLINED");
      root.sessionStorage?.setItem(key, fingerprint);
    }
    assertCurrent(snapshot, operation);
  }
  function hasOverride(scope) { return read(KEY)?.overrides?.[scope]?.provider === homepage().provider && homepage().mode === "model"; }
  function legacyDifference(operation) {
    const raw = read(CURRENT), old = read(LEGACY)?.[operation];
    return old && old.provider === homepage().provider && old.model !== raw?.model;
  }
  return Object.freeze({ KEY, TRANSFER_CONSENT_KEY, errorCopy, bind, bindings, scopeFor, homepage, eligibleModels, resolve, version, update, assertCurrent, beforeDispatch, bindTransferConsent, syncTransferConsent, entryConsent, acceptEntryConsent, hasOverride, legacyDifference });
}));
