"use strict";
(function (root, factory) {
  const catalog = root.AriadneModelSettingsCatalog || (typeof module === "object" ? require("./model-settings-catalog.json") : null);
  const api = factory(catalog);
  if (typeof module === "object") module.exports = api;
  root.AriadneModelSettings = api;
}(globalThis, function (catalog) {
  const descriptor = (provider, model) => [...(catalog?.models || []), ...(catalog?.retired_models || [])].find(item => item.provider === provider && item.model === model);
  function refreshCodex(entries) {
    if (!Array.isArray(entries) || entries.some(item => item.provider !== "codex" || !item.qualification || !item.parameters?.reasoning_effort?.options?.length)) throw Error("codex_catalog_invalid");
    // Keep absent entries for historical labels; availability is checked separately.
    for (const entry of entries) {
      const index = catalog.models.findIndex(item => item.provider === "codex" && item.model === entry.model);
      const copy = JSON.parse(JSON.stringify(entry));
      if (index < 0) catalog.models.push(copy); else catalog.models[index] = copy;
    }
  }
  const currentModel = (provider, model) => catalog?.migrations?.[provider]?.[model] || model;
  function envelope(runtime, settings, revision = "default", scope = null) {
    const item = descriptor(runtime.provider, runtime.model);
    if (!item || runtime.mode !== "model") return null;
    return { contract_version: catalog.version, connection_id: item.connection_id, descriptor_revision: item.descriptor_revision,
      settings_schema_version: item.settings_schema_version, effective_settings: settings ?? Object.fromEntries(Object.entries(item.parameters).map(([key, spec]) => [key, spec.default])),
      selection_revision: revision, scope };
  }
  function validate(value, provider, model) {
    const item = descriptor(provider, model), expected = envelope({ mode: "model", provider, model });
    if (!item || !value || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(Object.keys(expected).sort())) throw Error("runtime_execution_settings_invalid");
    for (const key of ["contract_version", "connection_id", "descriptor_revision", "settings_schema_version"]) if (value[key] !== expected[key]) throw Error("runtime_execution_settings_identity_mismatch");
    const settings = value.effective_settings;
    if (!settings || typeof settings !== "object" || Array.isArray(settings) || JSON.stringify(Object.keys(settings).sort()) !== JSON.stringify(Object.keys(item.parameters).sort())) throw Error("runtime_execution_settings_invalid");
    for (const [key, spec] of Object.entries(item.parameters)) if (!spec.options.some(option => option.value === settings[key])) throw Error("runtime_execution_settings_unsupported");
    if (typeof value.selection_revision !== "string" || !value.selection_revision.length || value.selection_revision.length > 200
      || (value.scope !== null && (typeof value.scope !== "string" || !value.scope.length || value.scope.length > 300))) throw Error("runtime_selection_revision_invalid");
    return Object.freeze({ ...value, effective_settings: Object.freeze({ ...settings }) });
  }
  function identity(runtime) {
    return JSON.stringify([runtime.mode, runtime.provider, runtime.model, runtime.execution_settings?.connection_id,
      runtime.execution_settings?.descriptor_revision, runtime.execution_settings?.settings_schema_version, runtime.execution_settings?.effective_settings]);
  }
  function label(runtime, compact = false) {
    if (runtime?.mode !== "model") return "Local";
    const item = descriptor(runtime.provider, runtime.model);
    const effort = runtime.execution_settings?.effective_settings?.reasoning_effort;
    const suffix = item?.parameters.reasoning_effort?.options.find(option => option.value === effort)?.label;
    return `${item?.[compact ? "compact_label" : "short_label"] || runtime.model}${compact && suffix ? ` · ${suffix}` : ""}`;
  }
  return Object.freeze({ catalog, descriptor, refreshCodex, currentModel, envelope, validate, identity, label });
}));
