"use strict";
globalThis.AriadneJobJournalUI = { async mount(jobId) {
  const D = globalThis.AriadneJobJournal, A = globalThis.AriadneJobApplications, byId = id => document.getElementById(id);
  const timeline = byId("job-journal-timeline"), editor = byId("job-journal-editor"), note = byId("job-application-note"), outcome = byId("job-application-outcome");
  const urls = new Map(), message = byId("job-detail-message");
  let entries = [], application, drafts = [], editing = false, busy = false, preparing = 0, moving = 0, generation = 0, channel;
  const element = (tag, value, className) => { const node = document.createElement(tag); if (value) node.textContent = value; if (className) node.className = className; return node; };
  const clearURLs = key => { (urls.get(key) || []).forEach(URL.revokeObjectURL); urls.set(key, []); };
  const clearPreviews = () => { for (const key of urls.keys()) if (key.startsWith("preview:")) { clearURLs(key); urls.delete(key); } };
  const imageURL = (file, key) => { const url = URL.createObjectURL(file); if (!urls.has(key)) urls.set(key, []); urls.get(key).push(url); return url; };
  const say = (text, error = false) => { message.textContent = text; message.classList.toggle("error", error); };
  function controls() {
    byId("job-edit-form").querySelectorAll("input, textarea, select, button").forEach(node => { node.disabled = busy || preparing > 0 || moving > 0; });
    byId("open-job-edit").disabled = busy || preparing > 0 || moving > 0;
  }
  function thumbnail(image, key) {
    const button = element("button", "", "v1-journal-thumbnail"), img = element("img");
    button.type = "button"; button.setAttribute("aria-label", `查看图片 ${image.name}`);
    img.src = imageURL(image.file, key); img.alt = image.name; img.loading = "lazy"; button.append(img);
    button.onclick = () => {
      const dialog = byId("job-journal-lightbox"), full = byId("job-journal-full-image");
      full.src = img.src; full.alt = image.name; dialog.showModal();
    };
    return button;
  }
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const blank = () => ({ entry_id: crypto.randomUUID(), job_context_id: jobId, observed_on: today(), feedback: "UPDATE", text: "", images: [], created_at: new Date().toISOString(), provenance: "USER_RECORDED" });
  function render() {
    clearURLs("history"); timeline.replaceChildren();
    const notes = byId("job-application-notes"); notes.replaceChildren();
    application.note.split("\n").map(line => line.trim()).filter(Boolean).forEach((line, index) => {
      const row = element("div"), text = element("p", line); text.dataset.i18n = "off";
      row.append(element("span", String(index + 1).padStart(2, "0")), text); notes.append(row);
    });
    if (!notes.children.length) notes.append(element("p", "暂无备注", "v1-source-note"));
    byId("job-application-stage").textContent = A.STAGES[application.stage] + (application.outcome ? ` · ${A.OUTCOMES[application.outcome]}` : "");
    if (!entries.length) timeline.append(element("p", "暂无求职记录", "v1-source-note"));
    entries.forEach(entry => {
      const article = element("article", "", "v1-journal-entry");
      article.append(element("p", `${entry.observed_on}${entry.feedback === "UPDATE" ? "" : ` · ${D.FEEDBACK[entry.feedback]}`}`, "v1-section-label"));
      const prose = element("p", entry.text, "v1-journal-text"); prose.dataset.i18n = "off"; article.append(prose);
      const gallery = element("div", "", "v1-journal-images");
      entry.images.forEach(image => gallery.append(thumbnail(image, "history")));
      article.append(gallery); timeline.append(article);
    });
  }
  async function load() {
    if (editing || busy) return;
    const reading = ++generation;
    const [all, loaded] = await Promise.all([A.all(), D.list(jobId)]);
    if (reading !== generation || editing || busy) return;
    application = all.get(jobId) || A.initial(jobId); entries = loaded; render();
  }
  function field(title, input) { const label = element("label", title, "v1-edit-field"); label.append(input); return label; }
  const locked = () => !editing || busy || preparing > 0 || moving > 0;
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  async function animateRow(row, entering) {
    if (reducedMotion() || !row.animate) return;
    const style = getComputedStyle(row), timing = style.getPropertyValue(entering ? "--vi-motion-open" : "--vi-motion-close").trim();
    const duration = parseFloat(timing) * (timing.endsWith("ms") ? 1 : 1000);
    const expanded = { height: `${row.getBoundingClientRect().height}px`, opacity: 1, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom, borderTopWidth: style.borderTopWidth, transform: "translateY(0)" };
    const collapsed = { height: "0px", opacity: 0, paddingTop: "0px", paddingBottom: "0px", borderTopWidth: "0px", transform: "translateY(-8px)" };
    row.style.overflow = "hidden";
    row.dataset.transition = entering ? "entering" : "leaving";
    try {
      await row.animate(entering ? [collapsed, expanded] : [expanded, collapsed], { duration, easing: style.getPropertyValue("--vi-ease-standard").trim(), fill: "both" }).finished;
    } finally {
      row.getAnimations().forEach(animation => animation.cancel());
      row.style.removeProperty("overflow"); delete row.dataset.transition;
    }
  }
  function renumber() {
    [...editor.children].forEach((row, index) => { row.querySelector(".v1-journal-draft-heading p").textContent = `记录 ${index + 1}`; });
  }
  function createRow(entry) {
    const row = element("section", "", "v1-journal-draft"); row.dataset.entryId = entry.entry_id;
    const key = `preview:${entry.entry_id}`;
    const header = element("div", "", "v1-journal-draft-heading"), remove = element("button", "删除记录", "v1-edit-text-action v1-detail-remove-button"); remove.type = "button"; remove.dataset.editDestructive = "";
    remove.onclick = async () => {
      if (locked()) return;
      moving++; controls();
      try {
        await animateRow(row, false);
        drafts = drafts.filter(item => item !== entry); row.remove(); clearURLs(key); urls.delete(key); renumber();
      } finally { moving--; controls(); }
      if (editing) byId("job-journal-add").focus({ preventScroll: true });
    };
    header.append(element("p", "", "v1-section-label"), remove);
    const text = element("textarea"); text.rows = 4; text.maxLength = 6000; text.value = entry.text; text.placeholder = "记录沟通经过、反馈或下一步安排"; text.oninput = () => { entry.text = text.value; };
    const input = element("input"); input.type = "file"; input.accept = "image/png,image/jpeg,image/webp"; input.multiple = true; input.hidden = true; input.setAttribute("aria-label", "选择记录图片");
    const zone = element("button", "", "v1-file-dropzone v1-journal-dropzone"); zone.type = "button"; zone.setAttribute("aria-label", "添加图片，可拖拽或粘贴");
    zone.append(element("span", "拖拽图片到这里，或点击选择"), element("small", "也可直接粘贴图片"));
    zone.onclick = () => { if (!locked()) input.click(); };
    const gallery = element("div", "", "v1-journal-images");
    function preview() {
      clearURLs(key); gallery.replaceChildren();
      entry.images.forEach((image, imageIndex) => {
        const figure = element("figure"), removeImage = element("button", "移除图片", "v1-edit-text-action"); removeImage.type = "button";
        removeImage.setAttribute("aria-label", `移除图片 ${image.name}`);
        removeImage.onclick = () => { if (!locked()) { entry.images.splice(imageIndex, 1); preview(); } };
        figure.append(thumbnail(image, key), removeImage); gallery.append(figure);
      });
    }
    async function addImages(files) {
      if (!files.length || locked()) return;
      const attempt = generation;
      preparing++; controls();
      try {
        // All entry routes share the same limits, signature and decoding checks.
        if (entry.images.length + files.length > 4) throw Error("每条记录最多 4 张图片。");
        const added = await D.prepareImages(files);
        const next = [...entry.images, ...added];
        D.validate({ ...entry, images: next });
        for (const image of added) {
          let bitmap;
          try { bitmap = await createImageBitmap(image.file); } catch (_) { throw Error("图片无法解码，请换一张完整的 PNG、JPEG 或 WebP 图片。"); }
          const tooLarge = bitmap.width * bitmap.height > 30000000; bitmap.close();
          if (tooLarge) throw Error("图片分辨率过大，请使用截图或较小的图片。");
        }
        if (attempt !== generation || !editing || !drafts.includes(entry)) return;
        entry.images = next; say(""); preview();
      } catch (error) { if (attempt === generation && editing) say(error.message, true); }
      finally { input.value = ""; preparing--; controls(); }
    }
    input.onchange = () => addImages([...input.files]);
    const isFiles = event => [...(event.dataTransfer?.types || [])].includes("Files");
    ["dragenter", "dragover"].forEach(type => zone.addEventListener(type, event => {
      if (!isFiles(event)) return;
      event.preventDefault(); event.stopPropagation();
      event.dataTransfer.dropEffect = locked() ? "none" : "copy";
      zone.classList.toggle("is-dragover", !locked());
    }));
    zone.addEventListener("dragleave", event => { if (!zone.contains(event.relatedTarget)) zone.classList.remove("is-dragover"); });
    zone.addEventListener("drop", event => {
      if (!isFiles(event)) return;
      event.preventDefault(); event.stopPropagation(); zone.classList.remove("is-dragover");
      addImages([...(event.dataTransfer?.files || [])]);
    });
    row.addEventListener("paste", event => {
      const files = [...(event.clipboardData?.items || [])].filter(item => item.kind === "file" && item.type.startsWith("image/")).map(item => item.getAsFile()).filter(Boolean);
      if (!files.length) return; // Plain text keeps normal textarea paste behavior.
      event.preventDefault(); event.stopPropagation();
      if (locked()) return;
      const pastedText = event.clipboardData.getData("text/plain");
      if (pastedText && event.target === text) { text.setRangeText(pastedText, text.selectionStart, text.selectionEnd, "end"); entry.text = text.value; }
      addImages(files);
    });
    const imageField = field("添加图片", zone);
    row.append(header, field("内容", text), imageField, input, gallery); preview(); return row;
  }
  function renderEditor() {
    clearPreviews(); editor.replaceChildren(...drafts.map(createRow)); renumber(); controls();
  }
  for (const [value, label] of Object.entries(A.OUTCOMES)) { const option = element("option", label); option.value = value; outcome.append(option); }
  byId("job-journal-add").onclick = async () => {
    if (locked()) return;
    const entry = blank(), row = createRow(entry); drafts.push(entry); editor.append(row); renumber();
    moving++; controls();
    try { await animateRow(row, true); }
    finally { moving--; controls(); }
    if (editing && row.isConnected) { row.querySelector("textarea").focus({ preventScroll: true }); row.scrollIntoView({ behavior: reducedMotion() ? "instant" : "smooth", block: "nearest" }); }
  };
  byId("job-journal-close-image").onclick = () => byId("job-journal-lightbox").close();
  byId("job-journal-lightbox").onclick = event => { if (event.target === event.currentTarget) event.currentTarget.close(); };
  const refresh = () => load().catch(error => say(error.message, true));
  const connect = () => { if (!channel && typeof BroadcastChannel === "function") { channel = new BroadcastChannel("ariadne-job-applications"); channel.onmessage = refresh; } };
  window.addEventListener("focus", refresh);
  window.addEventListener("pagehide", () => { clearURLs("history"); clearPreviews(); channel?.close(); channel = null; generation++; });
  window.addEventListener("pageshow", event => { if (event.persisted) { connect(); if (editing) renderEditor(); else refresh(); } });
  connect(); await load();
  return {
    refresh,
    announce() { channel?.postMessage({ changed: true }); },
    begin() {
      editing = true; generation++;
      drafts = entries.map(entry => ({ ...entry, images: entry.images.map(image => ({ ...image })) }));
      if (!drafts.length) drafts.push(blank());
      note.value = application.note; outcome.value = application.outcome;
      byId("job-application-outcome-field").hidden = application.stage !== "CLOSED";
      say(""); renderEditor();
    },
    cancel() { generation++; editing = false; drafts = []; clearPreviews(); editor.replaceChildren(); say(""); refresh(); },
    async save(context) {
      if (busy || preparing || moving) return false;
      const savedIds = new Set(entries.map(entry => entry.entry_id));
      const values = drafts.filter(entry => savedIds.has(entry.entry_id) || entry.text.trim() || entry.images.length).map(entry => ({ ...entry, text: entry.text.trim() }));
      // Empty new rows are ignored; existing records require content or explicit deletion.
      values.forEach(D.validate);
      busy = true; controls();
      try {
        const result = await globalThis.AriadneJobFollowupStorage.save({ ...context, jobId, application: { ...application, draftNote: note.value, draftOutcome: application.stage === "CLOSED" ? outcome.value : "" }, entries: values, observedEntries: entries });
        editing = false; busy = false; clearPreviews(); drafts = [];
        application = result.application; entries = result.entries.sort((a, b) => a.observed_on.localeCompare(b.observed_on) || a.created_at.localeCompare(b.created_at) || a.entry_id.localeCompare(b.entry_id));
        render(); channel?.postMessage({ jobId });
        return result;
      } finally { busy = false; controls(); }
    },
  };
} };
