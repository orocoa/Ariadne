"use strict";

(function attachRuntimeCapabilityGate(root, factory) {
  const contract = root.AriadneRuntimeExecution
    || (typeof module === "object" && module.exports ? require("./runtime-capabilities.js") : null);
  const api = factory(contract);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.JobRadarRuntimeGate = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createRuntimeCapabilityGate(Contract) {
  if (!Contract) throw new Error("runtime_execution_contract_required");

  const CURRENT_RUNTIME_STORAGE_KEY = "job-radar-selected-runtime";
  const OPERATION_RUNTIME_STORAGE_KEY = "ariadne-operation-runtimes-v1";
  const CANDIDATE_MULTIMODAL_IMPORT_ADAPTER = Object.freeze({
    provider_id: "deepseek",
    model_id: "deepseek-flash",
    protocol: "OPENAI_CHAT_COMPLETIONS",
    capabilities: Object.freeze(["TEXT", "VISION"]),
    multimodal_readiness: "VERIFIED",
    discovery_source: "qualification_2026-09-03",
    runtime_capability_basis: "adapter_verified",
    runtime_capabilities: Object.freeze({
      semantic_understanding: "supported",
      candidate_model_structuring: "supported",
      job_model_structuring: "unsupported",
      model_merge: "unsupported",
      ai_conversation: "unsupported",
      vision: "supported",
    }),
    adapter_version: "deepseek-candidate-multimodal-v2",
    delivery_method: "source_or_rendered_images",
    supports_complete_document_review: true,
    document_delivery: "rendered_pdf_pages",
  });
  const CANDIDATE_PDF_MODEL_ADAPTER = CANDIDATE_MULTIMODAL_IMPORT_ADAPTER;
  const DEEPSEEK_VISION_MODEL_DESCRIPTOR = Object.freeze({
    ...CANDIDATE_MULTIMODAL_IMPORT_ADAPTER,
    runtime_capabilities: Object.freeze({
      ...CANDIDATE_MULTIMODAL_IMPORT_ADAPTER.runtime_capabilities,
      candidate_model_structuring: "unsupported",
    }),
    adapter_version: null,
    delivery_method: null,
  });
  const DEEPSEEK_PRO_MODEL_DESCRIPTOR = Object.freeze({
    provider_id: "deepseek",
    model_id: "deepseek-v4-pro",
    protocol: "OPENAI_CHAT_COMPLETIONS",
    capabilities: Object.freeze(["TEXT", "STRUCTURED_JSON"]),
    multimodal_readiness: "NOT_MULTIMODAL",
    discovery_source: "qualification_2026-09-03",
    runtime_capability_basis: "adapter_verified",
    runtime_capabilities: Object.freeze({
      semantic_understanding: "supported",
      candidate_model_structuring: "unsupported",
      job_model_structuring: "unsupported",
      model_merge: "unsupported",
      ai_conversation: "unsupported",
      vision: "unsupported",
    }),
    delivery_method: null,
  });
  const CANDIDATE_CONVERSATION_MODEL_ADAPTER = Object.freeze({
    ...DEEPSEEK_VISION_MODEL_DESCRIPTOR,
    runtime_capabilities: Object.freeze({
      ...DEEPSEEK_VISION_MODEL_DESCRIPTOR.runtime_capabilities,
      ai_conversation: "supported",
    }),
    discovery_source: "qualification_2026-09-08",
    adapter_version: "deepseek-candidate-conversation-v9",
    delivery_method: "compiled_context_text",
  });
  const JOB_CONVERSATION_MODEL_ADAPTER = Object.freeze({
    ...CANDIDATE_CONVERSATION_MODEL_ADAPTER,
    adapter_version: "deepseek-job-conversation-v12",
  });
  const PERSONAL_UNDERSTANDING_MODEL_ADAPTER = Object.freeze({
    ...CANDIDATE_CONVERSATION_MODEL_ADAPTER,
    adapter_version: "deepseek-personal-understanding-v1",
  });
  const JOB_OVERVIEW_MODEL_ADAPTER = Object.freeze({ ...CANDIDATE_CONVERSATION_MODEL_ADAPTER, adapter_version: "deepseek-job-overview-v1" });
  const JOB_MULTIMODAL_IMPORT_ADAPTER = Object.freeze({
    ...CANDIDATE_MULTIMODAL_IMPORT_ADAPTER,
    runtime_capabilities: Object.freeze({
      ...CANDIDATE_MULTIMODAL_IMPORT_ADAPTER.runtime_capabilities,
      candidate_model_structuring: "unsupported",
      job_model_structuring: "supported",
    }),
    adapter_version: "deepseek-job-multimodal-import-v3",
    delivery_method: "source_images_with_prepared_text",
  });
  const OPERATION_CAPABILITIES = Object.freeze({
    candidate_import: Object.freeze({ local: "deterministic_structuring", model: "candidate_model_structuring" }),
    candidate_image_import: Object.freeze({ local: "deterministic_structuring", model: "candidate_model_structuring" }),
    candidate_text_import: Object.freeze({ local: "deterministic_structuring", model: "candidate_model_structuring" }),
    job_import: Object.freeze({ local: "deterministic_structuring", model: "job_model_structuring" }),
    job_model_import: Object.freeze({ local: "job_model_structuring", model: "job_model_structuring" }),
    job_image_import: Object.freeze({ local: "deterministic_structuring", model: "job_model_structuring" }),
    job_text_import: Object.freeze({ local: "deterministic_structuring", model: "job_model_structuring" }),
    ai_conversation: Object.freeze({ local: "ai_conversation", model: "ai_conversation" }),
    candidate_conversation: Object.freeze({ local: "ai_conversation", model: "ai_conversation" }),
    job_conversation: Object.freeze({ local: "ai_conversation", model: "ai_conversation" }),
    job_overview: Object.freeze({ local: "ai_conversation", model: "ai_conversation" }),
    personal_understanding: Object.freeze({ local: "ai_conversation", model: "ai_conversation" }),
    model_merge: Object.freeze({ local: "model_merge", model: "model_merge" }),
    legacy_candidate_semantic: Object.freeze({ local: "candidate_model_structuring", model: "candidate_model_structuring" }),
    legacy_job_semantic: Object.freeze({ local: "job_model_structuring", model: "job_model_structuring" }),
  });

  class RuntimeGateError extends Error {
    constructor(code) { super(code); this.name = "RuntimeGateError"; this.code = code; }
  }

  function readStoredRuntime(storage = globalThis.localStorage) {
    if (globalThis.AriadneProduct?.kind === "skill") return globalThis.AriadneProduct.runtime();
    if (!storage || typeof storage.getItem !== "function") return { mode: "local" };
    const serialized = storage.getItem(CURRENT_RUNTIME_STORAGE_KEY);
    if (!serialized) return { mode: "local" };
    try { const saved = JSON.parse(serialized); return globalThis.AriadneProduct?.runtime(saved) || saved; }
    catch (_error) { throw new RuntimeGateError("current_runtime_storage_malformed"); }
  }

  function authorityFrom(currentRuntime, operation = null) {
    let runtime;
    try { runtime = { ...Contract.normalizeCurrentRuntime(currentRuntime), ...(currentRuntime.execution_settings ? { execution_settings: currentRuntime.execution_settings } : {}) }; }
    catch (_error) { throw new RuntimeGateError("current_runtime_invalid"); }
    const descriptor = runtime.mode === "model" ? modelDescriptorForRuntime(runtime, operation) : null;
    const capabilities = runtime.mode === "local"
      ? Contract.resolveRuntimeCapability(runtime)
      : Contract.resolveRuntimeCapability(runtime, descriptor);
    return Object.freeze({ runtime, capabilities });
  }

  function modelDescriptorForRuntime(runtime, operation = null) {
    const normalized = Contract.normalizeCurrentRuntime(runtime);
    if (normalized.mode !== "model") return null;
    if ((normalized.provider === "gemini" && normalized.model === "gemini-3.7-flash")
      || (normalized.provider === "qwen" && normalized.model === "qwen3.8-max")) {
      const domain = modelDescriptorForRuntime({ mode: "model", provider: "deepseek", model: "deepseek-flash" }, operation);
      return Object.freeze({ ...domain, provider_id: normalized.provider, model_id: normalized.model,
        discovery_source: "official_contract_and_shared_adapter_2026-09-18",
        adapter_version: domain.adapter_version?.replace(/^deepseek-/, `${normalized.provider}-`) ?? null });
    }
    if (normalized.provider === "codex" && (normalized.model === "gpt-5.6-sol"
      || (globalThis.AriadneProduct?.kind === "skill" && globalThis.AriadneModelSettings?.descriptor("codex", normalized.model)?.qualification))) {
      const domain = modelDescriptorForRuntime({ mode: "model", provider: "deepseek", model: "deepseek-flash" }, operation);
      return Object.freeze({ ...domain, provider_id: "codex", model_id: normalized.model, protocol: "CODEX_APP_SERVER",
        discovery_source: "ariadne_codex_visual_qualification", adapter_version: domain.adapter_version?.replace(/^deepseek-/, "codex-") ?? null });
    }
    if (normalized.provider === CANDIDATE_PDF_MODEL_ADAPTER.provider_id && normalized.model === CANDIDATE_PDF_MODEL_ADAPTER.model_id) {
      if (operation === "job_conversation") return JOB_CONVERSATION_MODEL_ADAPTER;
      if (operation === "job_overview") return JOB_OVERVIEW_MODEL_ADAPTER;
      if (operation === "personal_understanding") return PERSONAL_UNDERSTANDING_MODEL_ADAPTER;
      if (["candidate_conversation", "ai_conversation", null].includes(operation)) return CANDIDATE_CONVERSATION_MODEL_ADAPTER;
      if (["job_image_import", "job_text_import", "job_model_import"].includes(operation)) return JOB_MULTIMODAL_IMPORT_ADAPTER;
      if (["candidate_image_import", "candidate_import"].includes(operation)) return CANDIDATE_MULTIMODAL_IMPORT_ADAPTER;
      return DEEPSEEK_VISION_MODEL_DESCRIPTOR;
    }
    if (normalized.provider === DEEPSEEK_PRO_MODEL_DESCRIPTOR.provider_id && normalized.model === DEEPSEEK_PRO_MODEL_DESCRIPTOR.model_id) {
      return DEEPSEEK_PRO_MODEL_DESCRIPTOR;
    }
    return Object.freeze({
      provider_id: normalized.provider,
      model_id: normalized.model,
      discovery_source: "current_runtime_selection",
    });
  }

  function credentialFor(runtime) {
    if (["gemini", "qwen"].includes(runtime?.provider)) return `browser-key://${runtime.provider}/request`;
    if (runtime?.provider === "deepseek") {
      try {
        if (globalThis.localStorage?.getItem("job-radar-provider-api-key:deepseek")) return "browser-key://deepseek/request";
      } catch (_) { /* Local Keychain is still available when browser storage is disabled. */ }
    }
    return runtime?.provider === "codex" ? "local-codex://authenticated-session" : "keychain://AI-Learning-OS.JobRadar.DeepSeek/local-vision";
  }

  function runtimeForSnapshot(operation, supplied, scope = null) {
    if (supplied) return { ...Contract.normalizeCurrentRuntime(supplied), ...(supplied.execution_settings ? { execution_settings: supplied.execution_settings } : {}) };
    if (globalThis.AriadneRuntimeSelection && globalThis.localStorage) return globalThis.AriadneRuntimeSelection.resolve(operation, scope ?? globalThis.AriadneRuntimeSelection.scopeFor(operation));
    // Node contract tests have no browser selection; browser execution always
    // resolves the actual operation authority, including an explicit Local.
    if (typeof globalThis.localStorage === "undefined") return { mode: "model", provider: "deepseek", model: "deepseek-flash" };
    return runtimeForOperation(operation);
  }

  function currentAuthority(storage = globalThis.localStorage) {
    return authorityFrom(readStoredRuntime(storage));
  }

  function isModelRuntimeEligible(runtime) {
    try {
      return Contract.isEligibleModelDescriptor(modelDescriptorForRuntime(runtime));
    } catch (_error) { return false; }
  }

  function readOperationRuntimes(storage = globalThis.localStorage) {
    if (!storage || typeof storage.getItem !== "function") return Object.freeze({});
    try {
      const value = JSON.parse(storage.getItem(OPERATION_RUNTIME_STORAGE_KEY) || "{}");
      if (!value || typeof value !== "object" || Array.isArray(value)) return Object.freeze({});
      return Object.freeze(Object.fromEntries(Object.entries(value).flatMap(([operation, runtime]) => {
        if (!Object.hasOwn(OPERATION_CAPABILITIES, operation)) return [];
        try {
          const normalized = Contract.normalizeCurrentRuntime(runtime);
          return normalized.mode === "model" ? [[operation, normalized]] : [];
        } catch (_error) { return []; }
      })));
    } catch (_error) { return Object.freeze({}); }
  }

  function operationCompatible(operation, runtime) {
    try { return operationGate(operation, authorityFrom(runtime, operation)).allowed; }
    catch (_error) { return false; }
  }

  function compatibleModelOperations(runtime) {
    const normalized = Contract.normalizeCurrentRuntime(runtime);
    if (normalized.mode !== "model") return Object.freeze([]);
    return Object.freeze(Object.keys(OPERATION_CAPABILITIES).filter((operation) => operationCompatible(operation, normalized)));
  }

  function recordOperationRuntimeSelection(runtime, storage = globalThis.localStorage, options = {}) {
    const normalized = Contract.normalizeCurrentRuntime(runtime);
    if (normalized.mode !== "model" || !storage || typeof storage.setItem !== "function") return Object.freeze({});
    const assignments = { ...readOperationRuntimes(storage) };
    compatibleModelOperations(normalized).forEach((operation) => {
      if (!options.only_unassigned || !assignments[operation]) assignments[operation] = normalized;
    });
    storage.setItem(OPERATION_RUNTIME_STORAGE_KEY, JSON.stringify(assignments));
    return Object.freeze(assignments);
  }

  function runtimeForOperation(operation, storage = globalThis.localStorage) {
    if (!Object.hasOwn(OPERATION_CAPABILITIES, operation)) throw new RuntimeGateError("runtime_operation_unknown");
    if (globalThis.AriadneRuntimeSelection && storage) return globalThis.AriadneRuntimeSelection.resolve(operation, globalThis.AriadneRuntimeSelection.scopeFor(operation), storage);
    const selected = Contract.normalizeCurrentRuntime(readStoredRuntime(storage));
    if (selected.mode === "local") return selected;
    if (!isModelRuntimeEligible(selected)) return selected;
    const assigned = readOperationRuntimes(storage)[operation];
    if (assigned?.provider === selected.provider && operationCompatible(operation, assigned)) return assigned;
    return selected;
  }

  function operationAuthority(operation, storage = globalThis.localStorage) {
    return authorityFrom(runtimeForOperation(operation, storage), operation);
  }

  function operationGate(operation, authority = null) {
    const requirement = OPERATION_CAPABILITIES[operation];
    if (!requirement) throw new RuntimeGateError("runtime_operation_unknown");
    const resolvedAuthority = authority || operationAuthority(operation);
    const capability = requirement[resolvedAuthority.runtime.mode];
    const state = resolvedAuthority.capabilities[capability];
    return Object.freeze({
      allowed: state === "supported" && (resolvedAuthority.runtime.mode === "local" || isModelRuntimeEligible(resolvedAuthority.runtime)),
      operation,
      capability,
      state,
      authority: resolvedAuthority,
    });
  }

  function requireOperation(operation, authority = null) {
    const gate = operationGate(operation, authority);
    if (!gate.allowed) throw new RuntimeGateError(`runtime_capability_${gate.state}`);
    return gate;
  }

  function legacyProviderAction({ provider, model = null, capability }, authority = currentAuthority()) {
    const runtime = authority.runtime;
    const state = authority.capabilities[capability];
    const identityMatches = runtime.mode === "model"
      && runtime.provider === String(provider || "").trim().toLowerCase()
      && (!model || runtime.model === String(model).trim());
    return Object.freeze({
      allowed: identityMatches && state === "supported" && isModelRuntimeEligible(runtime),
      capability,
      state,
      identity_matches: identityMatches,
      authority,
    });
  }

  function subscribe(listener, eventTarget = globalThis) {
    if (!eventTarget || typeof eventTarget.addEventListener !== "function") return () => {};
    const handler = (event) => {
      if (event.type === "ariadne-runtime-selection" || [CURRENT_RUNTIME_STORAGE_KEY, OPERATION_RUNTIME_STORAGE_KEY, "ariadne-model-selection-v2", null].includes(event.key)) listener(currentAuthority());
    };
    eventTarget.addEventListener("storage", handler);
    eventTarget.addEventListener("ariadne-runtime-selection", handler);
    return () => { eventTarget.removeEventListener("storage", handler); eventTarget.removeEventListener("ariadne-runtime-selection", handler); };
  }

  return Object.freeze({
    CURRENT_RUNTIME_STORAGE_KEY,
    OPERATION_RUNTIME_STORAGE_KEY,
    OPERATION_CAPABILITIES,
    credentialFor, runtimeForSnapshot,
    CANDIDATE_PDF_MODEL_ADAPTER,
    CANDIDATE_MULTIMODAL_IMPORT_ADAPTER,
    DEEPSEEK_VISION_MODEL_DESCRIPTOR,
    DEEPSEEK_PRO_MODEL_DESCRIPTOR,
    CANDIDATE_CONVERSATION_MODEL_ADAPTER,
    JOB_CONVERSATION_MODEL_ADAPTER,
    PERSONAL_UNDERSTANDING_MODEL_ADAPTER, JOB_OVERVIEW_MODEL_ADAPTER,
    JOB_MULTIMODAL_IMPORT_ADAPTER,
    RuntimeGateError,
    readStoredRuntime,
    authorityFrom,
    modelDescriptorForRuntime,
    currentAuthority,
    isModelRuntimeEligible,
    readOperationRuntimes,
    compatibleModelOperations,
    recordOperationRuntimeSelection,
    runtimeForOperation,
    operationAuthority,
    operationGate,
    requireOperation,
    legacyProviderAction,
    subscribe,
  });
}));
