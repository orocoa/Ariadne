"use strict";

(function attach(root) {
  const nativeFetch = root.fetch.bind(root);
  const WEB_SESSION_KEY = "ariadne-web-api-session-v1";
  const WEB_OPERATIONS_KEY = "ariadne-web-operation-sessions-v1";
  let webRuntimePromise;
  const localOrigin = () => root.AriadneProduct?.kind === "skill";
  const apiProviders = ["deepseek", "gemini", "qwen"];
  function webSession() {
    let value = root.sessionStorage.getItem(WEB_SESSION_KEY);
    if (!/^[a-f0-9]{64}$/.test(value || "")) {
      value = (root.crypto.randomUUID() + root.crypto.randomUUID()).replaceAll("-", "");
      root.sessionStorage.setItem(WEB_SESSION_KEY, value);
    }
    return value;
  }
  async function operationSession(path, body, provider, credential) {
    const payload = JSON.parse(body || "null") || {};
    const cancel = path === "/api/candidate-conversation-turn/cancel";
    const turn = payload.turn || (cancel ? payload : {});
    const id = payload.operation_identity?.operation_id || payload.request_id ||
      (turn.execution_id ? `${turn.execution_id}:${turn.generation}` : null);
    if (typeof id !== "string") return webSession();
    const route = cancel ? "/api/candidate-conversation-turn" : path;
    const key = JSON.stringify([route, id]);
    const fingerprint = [...new Uint8Array(await root.crypto.subtle.digest("SHA-256", await new Blob([`${provider}\0${credential || ""}`]).arrayBuffer()))].map(v => v.toString(16).padStart(2, "0")).join("");
    // Read after hashing so overlapping requests do not overwrite each other's
    // bindings while awaiting WebCrypto. Never persist the API credential.
    const bindings = JSON.parse(root.sessionStorage.getItem(WEB_OPERATIONS_KEY) || "{}");
    if (Object.hasOwn(bindings, JSON.stringify([provider, route, id]))) throw Error("WEB_OPERATION_CREDENTIAL_CHANGED");
    if (Object.hasOwn(bindings, key)) {
      const binding = bindings[key];
      if (!binding || !/^[a-f0-9]{64}$/.test(binding.session)) throw Error("WEB_SESSION_STATE_INVALID");
      if (binding.credential !== fingerprint) throw Error("WEB_OPERATION_CREDENTIAL_CHANGED");
      return binding.session;
    }
    const session = webSession();
    // Keep prior operation bindings across explicit session renewal. An old
    // request must still hit its original server receipt, never spend twice.
    bindings[key] = {session, credential: fingerprint};
    root.sessionStorage.setItem(WEB_OPERATIONS_KEY, JSON.stringify(bindings));
    return session;
  }
  function beginNewSession() {
    if (localOrigin()) throw Error("SKILL_AGENT_ONLY");
    const session = (root.crypto.randomUUID() + root.crypto.randomUUID()).replaceAll("-", "");
    root.sessionStorage.setItem(WEB_SESSION_KEY, session);
    return session;
  }
  function noteError(code) {
    if (code !== "WEB_SESSION_OPERATION_LIMIT" || localOrigin() || !root.document?.createElement) return;
    const previous = root.document.getElementById("web-session-recovery");
    if (previous?.querySelector("button")) return;
    previous?.remove();
    const box = root.document.createElement("section"); box.id = "web-session-recovery";
    box.className = "v1-inline-feedback"; box.setAttribute("role", "status");
    const copy = root.document.createElement("p");
    const english = root.document.documentElement.lang?.startsWith("en");
    copy.textContent = english ? "This connection has reached its operation limit. Review existing results before starting a new connection. Existing requests retain their replay protection." : "本次连接已达到处理上限。请先核对已有结果，再开始新连接；旧请求仍保留防重复执行保护。";
    const button = root.document.createElement("button"); button.type = "button"; button.className = "v1-primary";
    button.textContent = english ? "Results reviewed — start a new connection" : "已核对结果，开始新连接";
    button.onclick = () => {
      try {
        beginNewSession(); button.remove();
        copy.textContent = english ? "New connection ready. Review the materials and explicitly start a new request." : "新连接已准备好。请重新核对材料并发起新的请求。";
      } catch (_) { copy.textContent = english ? "Session storage is unavailable. Open Ariadne in a new tab." : "无法保存连接状态，请在新标签页重新打开 Ariadne。"; }
    };
    box.append(copy, button);
    (root.document.querySelector("main") || root.document.body).prepend(box);
  }
  async function webRuntime() {
    if (!webRuntimePromise) webRuntimePromise = nativeFetch("/api/web-runtime", { cache: "no-store", redirect: "error" })
      .then(async response => {
        const value = await response.json();
        if (!response.ok || value.mode !== "web" || !value.byok?.includes("deepseek")) throw new Error("WEB_API_RUNTIME_UNAVAILABLE");
        return value;
      }).catch(error => { webRuntimePromise = null; throw error; });
    return webRuntimePromise;
  }
  function errorCopy(error) {
    const code = String(error?.code || error?.message || error || "");
    return ({ SKILL_AGENT_ONLY: "本地 Skill 只使用当前 Agent；API 连接请使用网页版。",
      SKILL_AGENT_UNAVAILABLE: "Codex 暂不可用，请在 Agent 中检查 Ariadne 登录和依赖后重新打开。", WEB_API_RUNTIME_UNAVAILABLE: "网站的 API 服务暂不可用，请稍后重试或使用本地版。",
      WEB_PDF_SIZE_LIMIT: "网页预览版每份 PDF 最多 5 MB，更大的文件请使用本地版。",
      WEB_PDF_PAGE_LIMIT: "网页预览版每份 PDF 最多 16 页，更长的文件请使用本地版。",
      WEB_PDF_IMAGE_LIMIT: "这份 PDF 转图后超过网页预览容量，请使用本地版完整分析。",
      WEB_PDF_COUNT_LIMIT: "网页预览版一次最多处理 4 份 PDF，请减少本次附件。",
      WEB_PDF_PREPARATION_FAILED: "PDF 未能完整读取，请使用无密码且可正常打开的 PDF，或使用本地版。",
      WEB_PAGE_RESOURCES_UNAVAILABLE: "页面所需文件未能载入。请保留未保存的编辑后刷新，再重新确认材料；本次未自动重发。",
      WEB_PREVIEW_REQUEST_SIZE_LIMIT: "本次材料超过网页预览容量，请减少文件数量，或使用本地版。",
      WEB_OWN_API_KEY_REQUIRED: "请先在连接设置中填写并验证你自己的 API Key。",
      WEB_SERVICE_BUSY: "网站正在处理其他请求，请稍后手动重试。",
      WEB_SESSION_BUSY: "本页已有请求正在处理，请等待完成。",
      WEB_SESSION_OPERATION_LIMIT: "本次连接已达到处理上限，请先核对已有结果，再使用页面上的按钮开始新连接。",
      WEB_OPERATION_CONTENT_CONFLICT: "请求内容已变化，请重新确认材料后再分析。",
      WEB_OPERATION_CREDENTIAL_CHANGED: "这个请求使用过另一份连接凭据。请先核对已有结果，再重新确认并发起新请求；不会用新凭据自动重跑旧请求。",
      WEB_RESULT_EXPIRED_REVIEW_BEFORE_RETRY: "这次分析已经执行，结果缓存已失效；请先核对已有结果，再决定是否重新付费分析。",
      WEB_SOURCE_PREPARATION_FAILED: "原件未能完整读取，请核对文件；复杂 Word 文档可导出为 PDF 后重试。",
      WEB_REQUEST_SIZE_INVALID: "网页版单次材料总量约限 30 MB，请减少本次文件数量后重试。",
      WEB_RUNTIME_NOT_ALLOWED: "网页版需要使用你自己验证过的 API 连接；本地 Agent 请通过 Ariadne Skill 使用。",
    })[code] || null;
  }
  async function apiFetch(input, options = {}) {
    const url = new URL(input, root.location.href);
    if (url.origin !== root.location.origin || !url.pathname.startsWith("/api/")) return nativeFetch(input, options);
    const operations = { "/api/candidate-conversation-turn": "candidate_conversation", "/api/job-conversation-turn": "job_conversation",
      "/api/personal-understanding-turn": "personal_understanding", "/api/job-overview-turn": "job_overview",
      "/api/candidate-model-structure": "candidate_import", "/api/job-model-structure": "job_model_import" };
    if (options.method === "POST" && operations[url.pathname] && root.AriadneRuntimeSelection) {
      const request = JSON.parse(options.body);
      if (request.runtime_snapshot?.mode === "model") {
        const declared = request.runtime_snapshot.operation?.toLowerCase();
        const operation = url.pathname.endsWith("model-structure") && root.JobRadarRuntimeGate?.OPERATION_CAPABILITIES[declared] ? declared : operations[url.pathname];
        await root.AriadneRuntimeSelection.beforeDispatch(request.runtime_snapshot, operation);
      }
    }
    let provider;
    try { provider = JSON.parse(options.body || "null")?.runtime_snapshot?.provider; }
    catch (_) { /* The domain endpoint owns malformed-request validation. */ }
    const checkProvider = /^\/api\/runtime-providers\/(deepseek|gemini|qwen)\/connection-check$/.exec(url.pathname)?.[1];
    const check = Boolean(checkProvider);
    if (check) provider = checkProvider;
    if (url.pathname === "/api/runtime-check") provider = "deepseek";
    if (!provider && ["/api/candidate-conversation-turn/cancel", "/api/candidate-model-operation-state/delete"].includes(url.pathname)) {
      try { provider = root.AriadneProduct?.runtime(JSON.parse(root.localStorage.getItem("job-radar-selected-runtime") || "null"))?.provider; }
      catch (_) { /* The server rejects an unavailable runtime. */ }
    }
    {
      // Product identity, not the hostname or an old pairing token, owns routing.
      if (provider === "codex" && !localOrigin()) throw new Error("WEB_RUNTIME_NOT_ALLOWED");
      if (localOrigin() && (apiProviders.includes(provider) || check)) throw new Error("SKILL_AGENT_ONLY");
      // API credentials go only to this Web product’s same-origin service.
      const ownKeyRoute = (apiProviders.includes(provider) && (operations[url.pathname] || url.pathname === "/api/local-source-read"))
        || ["/api/runtime-check", "/api/candidate-conversation-turn/cancel", "/api/candidate-model-operation-state/delete"].includes(url.pathname);
      if (ownKeyRoute || check) {
        const headers = new Headers(options.headers || {});
        let key;
        try { key = provider && root.localStorage.getItem(`job-radar-provider-api-key:${provider}`); }
        catch (_) { /* Existing local Keychain remains a supported credential source. */ }
        if (!localOrigin()) {
          const service = await webRuntime();
          if (provider && !service.byok.includes(provider)) throw new Error("WEB_API_RUNTIME_UNAVAILABLE");
          const credential = check ? JSON.parse(options.body || "{}").api_key : key;
          headers.set("X-Ariadne-Web-Session", await operationSession(url.pathname, options.body, provider, credential));
          if (service.pdf_preparation === "browser_pdfjs_complete_pages_v1" && options.method === "POST" && typeof options.body === "string") {
            let delivery;
            try { delivery = await import("/browser-pdf-delivery.js"); }
            catch (_) { throw new Error("WEB_PAGE_RESOURCES_UNAVAILABLE"); }
            options = await delivery.prepareRequest(url.pathname, options, service, nativeFetch);
          }
          if (typeof options.body === "string" && new Blob([options.body]).size > 41000000) throw new Error("WEB_REQUEST_SIZE_INVALID");
        }
        headers.delete("X-Ariadne-Provider-Key");
        if (provider) headers.set("X-Ariadne-Provider", provider);
        if (key && !check) headers.set("X-Ariadne-Provider-Key", key);
        options = { ...options, headers, redirect: "error" };
      }
      const response = await nativeFetch(input, options);
      if (response.status === 429 && response.headers?.get("Content-Type")?.includes("application/json")) {
        const result = await response.clone().json().catch(() => null);
        noteError(result?.error);
      }
      return response;
    }
  }
  root.AriadneTransport = Object.freeze({ fetch: apiFetch, webRuntime, errorCopy, beginNewSession, noteError });
}(globalThis));
