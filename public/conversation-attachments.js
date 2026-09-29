"use strict";
(function (root) {
  const CONTRACT = "ariadne-conversation-attachments-v1", MAX_BYTES = 30000000;
  const TYPES = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain", md: "text/markdown", markdown: "text/markdown" };
  const FORMS = { "candidate-workspace-composer": "CANDIDATE", "candidate-conversation-form": "CANDIDATE", "job-workspace-composer": "JOB", "job-conversation-form": "JOB", "personal-conversation-form": "PERSONAL", "job-overview-form": "JOB_OVERVIEW" };
  const controllers = new Map(), pending = new Map();
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const requestId = (r) => r.turn?.execution_id || r.request_id;
  const providerName = (runtime) => runtime?.provider === "codex" ? "Codex" : runtime?.provider || "当前模型";
  const attachmentLabel = (files) => files.every((file) => /\.(png|jpe?g)$/i.test(file.name)) ? `${files.length} 张图片` : `${files.length} 个附件`;
  function setStatus(state, stage, copy) {
    state.status.dataset.stage = stage;
    state.status.textContent = copy;
  }
  function errorCopy(error) {
    const code = String(error?.code || error?.message || error);
    if (/docx_complex/.test(code)) return "这个 Word 文件含暂不能完整读取的图表或嵌入对象，请导出为 PDF 后重试。";
    if (/docx_/.test(code)) return "Word 文件无法完整读取，请确认是未加密的 DOCX，或导出为 PDF 后重试。";
    if (/attachment_content_limit/.test(code)) return "附件展开后内容过多（合计最多 48 张图片或 PDF 页、12 万字），请分批发送；没有截断发送。";
    if (/attachment_image_invalid_or_too_large/.test(code)) return "图片无法读取，或超过模型单张图片 20 MB 的传输限制，请压缩图片后重试。";
    if (/attachment_pdf/.test(code)) return "PDF 无法完整转为页面图片，请确认文件未加密且可以打开，再重试。";
    if (/attachment_/.test(code)) return "附件未发送成功，请检查格式、总大小与传输确认后重试；已选附件保留。";
    return null;
  }
  function validateFiles(files) {
    if (files.length > 4 || files.reduce((n, f) => n + f.size, 0) > MAX_BYTES) throw Error("每轮最多 4 个附件，单个及合计最大 30 MB。");
    for (const file of files) if (!file.size || !TYPES[file.name.split('.').pop().toLowerCase()] || file.name.length > 240) throw Error("支持 PDF、DOCX、PNG、JPG、TXT、Markdown；文件不能为空。");
    return files;
  }
  async function recordFor(file, inline = true) {
    const raw = await file.arrayBuffer(), mime = TYPES[file.name.split('.').pop().toLowerCase()];
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", raw))].map((x) => x.toString(16).padStart(2, "0")).join("");
    const metadata = { name: file.name, mime_type: mime, size: raw.byteLength, content_hash: `sha256:${digest}` };
    if (!inline) return metadata;
    const blob = new Blob([raw], { type: mime });
    const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
    return { ...metadata, data_url: dataUrl };
  }
  async function persist(request, files, records, domain) {
    const nativeOpen = () => new Promise((resolve, reject) => { const open = indexedDB.open(CONTRACT, 1); open.onupgradeneeded = () => open.result.createObjectStore("turns", { keyPath: "request_id" }); open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    const db = await (root.AriadneContentDatabase ? root.AriadneContentDatabase.open(CONTRACT, nativeOpen) : nativeOpen());
    try {
      await new Promise((resolve, reject) => { const tx = db.transaction("turns", "readwrite");
        tx.objectStore("turns").add({ request_id: requestId(request), domain, conversation_id: request.conversation?.conversation_id || domain,
          created_at: new Date().toISOString(), authority: "SOURCE_INPUT_ONLY", files: files.map((file, i) => ({ file, ...Object.fromEntries(Object.entries(records[i]).filter(([k]) => k !== "data_url")) })) });
        tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || Error("attachment_persistence_failed")); tx.onerror = () => reject(tx.error); });
    } finally { db.close(); }
  }
  function mount(form, domain) {
    const field = form.querySelector(".v1-composer-field"), text = form.querySelector("textarea");
    if (!field || !text) return;
    field.classList.add("has-attachment-input");
    const panel = document.createElement("div"); panel.className = "v1-conversation-attachments hidden";
    panel.innerHTML = '<ul data-attachment-list aria-label="本轮待发送附件"></ul>';
    field.prepend(panel);
    const addButton = document.createElement("button");
    addButton.type = "button"; addButton.className = "v1-attachment-add";
    addButton.setAttribute("data-attachment-add", "");
    addButton.setAttribute("aria-label", "添加图片或文件");
    addButton.title = "添加图片或文件，也可直接粘贴图片或拖入文件";
    field.insertBefore(addButton, field.querySelector('.v1-model-trigger, button[type="submit"]'));
    const feedback = document.createElement("div"); feedback.className = "v1-attachment-feedback";
    feedback.innerHTML = '<input type="file" hidden multiple accept=".pdf,.docx,.png,.jpg,.jpeg,.txt,.md,.markdown"><label class="v1-attachment-consent hidden"><input type="checkbox"><span></span></label><p class="v1-attachment-status" role="status"></p>';
    form.append(feedback);
    const input = feedback.querySelector('input[type="file"]'), consent = feedback.querySelector('input[type="checkbox"]'), list = panel.querySelector("ul"), status = feedback.querySelector('[role="status"]');
    const state = { form, domain, panel, files: [], consent, status, busy: false, urls: new Map(), runtime: null };
    state.identityFor = (r) => root.AriadneModelSettings ? root.AriadneModelSettings.identity(r) : `${r?.mode}/${r?.provider}/${r?.model}`;
    controllers.set(form.id, state);
    const runtime = () => root.JobRadarRuntimeGate?.authority?.()?.runtime || root.JobRadarRuntimeGate?.operationGate?.(domain === "PERSONAL" ? "personal_understanding" : domain === "JOB_OVERVIEW" ? "job_overview" : domain === "JOB" ? "job_conversation" : "candidate_conversation")?.authority?.runtime;
    const runtimeIdentity = (r) => root.AriadneModelSettings ? root.AriadneModelSettings.identity(r) : `${r?.mode}/${r?.provider}/${r?.model}`;
    const identity = () => runtimeIdentity(runtime());
    const render = () => {
      const r = runtime();
      panel.classList.toggle("hidden", !state.files.length);
      field.setAttribute("aria-busy", String(state.busy));
      addButton.disabled = state.busy;
      list.innerHTML = state.files.map((file, i) => {
        const isImage = /\.(png|jpe?g)$/i.test(file.name);
        let preview = `<span class="v1-attachment-file-type">${esc(file.name.split('.').pop().toUpperCase())}</span>`;
        if (isImage) { const url = state.urls.get(file) || URL.createObjectURL(file); state.urls.set(file, url); preview = `<img src="${url}" alt="${esc(file.name)} 的缩略图">`; }
        return `<li class="${isImage ? "is-image" : "is-document"}" title="${esc(file.name)} · ${(file.size / 1000000).toFixed(2)} MB">${preview}<span class="v1-attachment-name">${esc(file.name)}</span><button type="button" class="v1-attachment-remove" data-attachment-remove="${i}" aria-label="移除 ${esc(file.name)}" ${state.busy ? "disabled" : ""}></button></li>`;
      }).join("");
      // Busy/consent updates reuse previews; revoke only removed files, after detaching their images.
      for (const [file, url] of state.urls) if (!state.files.includes(file)) { URL.revokeObjectURL(url); state.urls.delete(file); }
      consent.parentElement.classList.toggle("hidden", !state.files.length);
      consent.nextElementSibling.textContent = `同意将所选附件发送给 ${r?.provider === "codex" ? "Codex / OpenAI" : r?.provider || "当前模型"} / ${r?.model || "未选择"} 用于本轮对话，可能消耗额度。附件不会自动保存到个人资料或职位。`;
    };
    const add = (files) => {
      if (state.busy) return;
      try {
        const seen = new Set(state.files.map(f => `${f.name}:${f.size}:${f.lastModified}`));
        const merged = [...state.files]; for (const file of files) { const k = `${file.name}:${file.size}:${file.lastModified}`; if (!seen.has(k)) { seen.add(k); merged.push(file); } }
        state.files = validateFiles(merged); consent.checked = false; state.runtime = identity(); status.textContent = ""; render();
      } catch (error) { status.textContent = error.message; }
    };
    addButton.onclick = () => { if (!state.busy) { input.value = ""; input.click(); } };
    input.onchange = () => add(Array.from(input.files));
    list.onclick = (event) => { const b = event.target.closest('[data-attachment-remove]'); if (b && !state.busy) { state.files.splice(Number(b.dataset.attachmentRemove), 1); consent.checked = false; status.textContent = ""; render(); text.focus({ preventScroll: true }); } };
    form.addEventListener("paste", (event) => {
      const images = [...(event.clipboardData?.items || [])].filter(x => x.kind === "file" && ["image/png", "image/jpeg"].includes(x.type)).map(x => x.getAsFile()).filter(Boolean);
      if (images.length) {
        event.preventDefault();
        const pastedPrefix = root.AriadneI18n?.locale?.() === "en" ? "pasted-image" : "粘贴图片";
        add(images.map((blob, i) => new File([blob], `${pastedPrefix}-${Date.now()}-${i + 1}.${blob.type === "image/png" ? "png" : "jpg"}`, { type: blob.type })));
        const pastedText = event.clipboardData.getData("text/plain");
        if (pastedText && event.target === text) {
          text.setRangeText(pastedText, text.selectionStart, text.selectionEnd, "end");
          text.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
    });
    form.addEventListener("dragover", event => {
      if (!Array.from(event.dataTransfer?.types || []).includes("Files")) return;
      event.preventDefault(); event.stopPropagation();
      event.dataTransfer.dropEffect = state.busy ? "none" : "copy";
      field.classList.toggle("is-file-dragover", !state.busy);
    });
    form.addEventListener("dragleave", event => { if (!form.contains(event.relatedTarget)) field.classList.remove("is-file-dragover"); });
    form.addEventListener("drop", event => {
      field.classList.remove("is-file-dragover");
      if (event.dataTransfer?.files.length) { event.preventDefault(); event.stopPropagation(); add([...event.dataTransfer.files]); }
    });
    form.addEventListener("submit", event => {
      if (!state.files.length) return;
      if (state.busy || !consent.checked || state.runtime !== identity() || runtime()?.mode !== "model") { event.preventDefault(); event.stopImmediatePropagation(); status.textContent = state.busy ? "附件正在发送，请稍候。" : "请先选择模型，并勾选本轮附件的传输确认。"; return; }
      const text = form.querySelector("textarea"); if (!text.value.trim()) text.value = root.AriadneI18n?.t("请解读本轮附件。") || "请解读本轮附件。";
    }, true);
    root.JobRadarRuntimeGate?.subscribe?.(() => { consent.checked = false; state.runtime = identity(); render(); });
    state.render = render; render();
  }
  async function prepare(request, domain) {
    if (request.phase && request.phase !== "DISCUSS") return request;
    const state = [...controllers.values()].find(s => s.domain === domain && s.files.length);
    if (!state) return request;
    if (state.busy || !state.consent.checked) throw Error("attachment_consent_required");
    const runtime = request.runtime_snapshot;
    if (state.runtime !== state.identityFor(runtime)) throw Error("attachment_runtime_invalid");
    state.busy = true;
    setStatus(state, "CHECKING_CAPABILITY", "正在检查附件格式与模型能力…");
    state.render();
    try {
      const check = await (root.AriadneTransport || root).fetch("/api/conversation-attachment-capabilities", { cache: "no-store" });
      if (!check.ok || (await check.json()).contract_id !== CONTRACT) throw Error("attachment_contract_invalid");
      setStatus(state, "READING_AND_HASHING", "正在读取并校验附件完整性…");
      const local = root.AriadneProduct?.kind === "skill" && runtime.provider === "codex" && root.AriadneContentDatabase;
      const files = [...state.files], records = await Promise.all(files.map(file => recordFor(file, !local)));
      if (new Set(records.map(r => r.content_hash)).size !== records.length) throw Error("attachment_duplicate_content");
      if (!state.consent.checked) throw Error("attachment_consent_required");
      await persist(request, files, records, domain);
      if (!state.consent.checked || state.runtime !== state.identityFor(runtime)) throw Error("attachment_consent_required");
      pending.set(requestId(request), { state, files });
      setStatus(state, "SAVED_LOCALLY", `附件已安全保存在本机；准备发送给 ${providerName(runtime)}…`);
      const outbound = local ? records.map((record, index) => ({ ...record, local_reference: {
        workspace: root.localStorage.getItem(root.AriadneContentDatabase.WORKSPACE_KEY), request_id: requestId(request), index,
      } })) : records;
      return { ...request, attachments: { contract_id: CONTRACT, request_id: requestId(request), files: outbound,
        consent: { confirmed: true, provider: runtime.provider, model: runtime.model, purpose: "CURRENT_CONVERSATION_TURN" } } };
    } catch (error) { state.busy = false; state.status.textContent = errorCopy(error) || error.message; state.render(); throw error; }
  }
  function stage(request, value) {
    const active = pending.get(requestId(request));
    if (!active) return;
    if (value === "MODEL_REQUEST") {
      setStatus(active.state, value, `附件已安全保存在本机；正在发送给 ${providerName(request.runtime_snapshot)}…`);
      active.state.render();
    }
  }
  function dispatch(request) {
    const active = pending.get(requestId(request));
    if (!active || active.dispatched) return;
    const { state, files } = active;
    active.dispatched = true;
    state.files = state.files.filter((file) => !files.includes(file));
    state.consent.checked = false;
    setStatus(state, "MODEL_REQUEST", `本轮已发送 ${attachmentLabel(files)}给 ${providerName(request.runtime_snapshot)}；正在等待模型理解与回复…`);
    state.render();
  }
  function finish(request, ok, error = null, result = null) {
    const active = pending.get(requestId(request)); if (!active) return;
    pending.delete(requestId(request)); const { state, files } = active; state.busy = false;
    if (ok) {
      state.files = state.files.filter(f => !files.includes(f)); state.consent.checked = false;
      const next = result?.deliverable ? "生成文件正在本轮回复中准备，可直接下载。" : "本轮回复已生成。";
      setStatus(state, "COMPLETED", `本轮 ${attachmentLabel(files)} 已发送并处理完成；${next}`);
    } else {
      if (active.dispatched) {
        const selected = new Set(state.files.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
        state.files = [...files.filter((file) => !selected.has(`${file.name}:${file.size}:${file.lastModified}`)), ...state.files];
        state.consent.checked = false;
      }
      setStatus(state, "FAILED", errorCopy(error) || "本轮未完成，附件已恢复；请重新确认后重试。");
    }
    state.render();
  }
  root.AriadneConversationAttachments = { prepare, stage, dispatch, finish, errorCopy, validateFiles, recordFor, CONTRACT };
  if (typeof module === "object") module.exports = root.AriadneConversationAttachments;
  if (root.document) document.addEventListener("DOMContentLoaded", () => {
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "/conversation-attachments.css?v=inline-composer-4"; document.head.append(link);
    Object.entries(FORMS).forEach(([id, domain]) => { const form = document.getElementById(id); if (form) mount(form, domain); });
  }, { once: true });
}(typeof globalThis === "undefined" ? this : globalThis));
