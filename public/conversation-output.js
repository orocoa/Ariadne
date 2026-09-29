"use strict";

(function attach(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AriadneConversationOutput = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function create(root) {
  const MAX_TEXT = 40000, MAX_PAGES = 32;
  const exports = new WeakMap();
  const utf8 = text => new TextEncoder().encode(text);
  const VERSION = "ariadne-conversation-delivery-v1";
  function validate(value) {
    if (value == null) return null;
    const exact = (v, keys) => v && !Array.isArray(v) && Object.keys(v).sort().join() === keys.sort().join();
    const fail = () => { throw new Error("文件内容不符合输出契约，请重新生成"); };
    const text = (v, max, empty = false) => { if (typeof v !== "string" || v.length > max || (!empty && !v.trim())) fail(); };
    if (!exact(value, ["kind", "title", "body", "nodes", "edges"]) || !["PDF", "DIAGRAM", "UNSUPPORTED"].includes(value.kind)) fail();
    text(value.title, 100); text(value.body, { PDF: 20000, DIAGRAM: 1200, UNSUPPORTED: 400 }[value.kind]);
    if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) fail();
    if (value.kind !== "DIAGRAM") { if (value.nodes.length || value.edges.length) fail(); }
    else {
      if (!value.nodes.length || value.nodes.length > 8 || value.edges.length > 12) fail();
      value.nodes.forEach(node => text(node, 70));
      const pairs = new Set();
      value.edges.forEach(edge => {
        if (!exact(edge, ["from", "to", "label"])) fail();
        const pair = `${edge.from}:${edge.to}`;
        if (![edge.from, edge.to].every(i => Number.isInteger(i) && i >= 0 && i < value.nodes.length) || edge.from === edge.to || pairs.has(pair)) fail();
        text(edge.label, 28, true); pairs.add(pair);
      });
    }
    return JSON.parse(JSON.stringify(value));
  }
  function fromResult(result) {
    if (result.deliverable == null) return null;
    if (result.delivery_version !== VERSION) throw new Error("文件输出版本不兼容，请刷新后重试");
    return validate(result.deliverable);
  }
  function searchFromResult(result) {
    const value = result.web_search;
    if (value == null) return null;
    const fail = () => { throw new Error("搜索来源信息无效，请重试"); };
    if (value.version !== "ariadne-public-search-v1" || value.authority !== "EXTERNAL_WEB_NON_AUTHORITATIVE"
      || value.personal_data_written !== false || value.source_verification !== "MODEL_CITED"
      || !Number.isInteger(value.calls) || value.calls < 1 || value.calls > 12
      || typeof value.searched_at !== "string" || !Number.isFinite(Date.parse(value.searched_at))
      || !Array.isArray(value.sources) || value.sources.length > 6) fail();
    for (const source of value.sources) {
      if (!source || typeof source.title !== "string" || !source.title.trim() || source.title.length > 160
        || typeof source.url !== "string" || source.url.length > 2000 || /[\s\x00-\x1f]/.test(source.url)) fail();
      let url; try { url = new URL(source.url); } catch (_) { fail(); }
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password
        || !url.hostname.includes(".") || ["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname)) fail();
    }
    return JSON.parse(JSON.stringify(value));
  }
  function documentText(value) {
    // Avoid adding a second title when the model already included it verbatim.
    const body = value.body.trim();
    return body.split(/\r?\n/, 1)[0].trim() === value.title.trim() ? body : `${value.title}\n\n${body}`;
  }
  function concatenate(parts) {
    const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) { output.set(part, offset); offset += part.length; }
    return output;
  }

  // Image-only PDF: browser-rendered glyphs preserve Chinese and mixed fonts
  // offline without transmitting text or requiring a server font installation.
  function pdfFromJpegs(pages) {
    if (!pages.length || pages.length > MAX_PAGES) throw new Error("页数超出导出范围");
    const objects = [], offsets = [0], parts = [utf8("%PDF-1.4\n")];
    let size = parts[0].length;
    const add = (id, body) => { objects[id] = typeof body === "string" ? utf8(body) : body; };
    add(1, "<< /Type /Catalog /Pages 2 0 R >>");
    add(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] >>`);
    pages.forEach((page, index) => {
      if (!(page.bytes instanceof Uint8Array) || page.bytes[0] !== 255 || page.bytes[1] !== 216
        || !Number.isInteger(page.width) || page.width < 1 || !Number.isInteger(page.height) || page.height < 1) throw new Error("图片数据无效");
      const id = 3 + index * 3, content = "q 595.28 0 0 841.89 0 0 cm /Im0 Do Q\n";
      add(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`);
      add(id + 1, concatenate([utf8(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`), page.bytes, utf8("\nendstream")]));
      add(id + 2, `<< /Length ${utf8(content).length} >>\nstream\n${content}endstream`);
    });
    for (let id = 1; id < objects.length; id++) {
      offsets[id] = size;
      const bytes = concatenate([utf8(`${id} 0 obj\n`), objects[id], utf8("\nendobj\n")]);
      parts.push(bytes); size += bytes.length;
    }
    parts.push(utf8(`xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map(value => `${String(value).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`));
    return concatenate(parts);
  }

  function wrapText(text, measure, width) {
    if (typeof text !== "string" || !text.trim() || text.length > MAX_TEXT) throw new Error("回复为空或超过 4 万字，请分段导出");
    const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("zh", { granularity: "grapheme" }) : null;
    const lines = [];
    for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
      let line = "";
      const chars = segmenter ? [...segmenter.segment(paragraph)].map(part => part.segment) : Array.from(paragraph);
      for (const char of chars) {
        if (line && measure(line + char) > width) { lines.push(line); line = ""; }
        line += char;
      }
      lines.push(line);
    }
    return lines;
  }

  async function renderPages(text, doc = root.document) {
    await doc.fonts?.ready;
    const style = doc.defaultView.getComputedStyle(doc.documentElement);
    const token = name => style.getPropertyValue(name).trim();
    const font = token("--vi-font-ui");
    if (!font || !token("--vi-ink") || !token("--vi-surface")) throw new Error("排版资源未加载，请刷新后重试");
    const canvas = doc.createElement("canvas"); canvas.width = 1240; canvas.height = 1754;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("浏览器不支持图片导出");
    ctx.font = `29px ${font}`;
    const lines = wrapText(text, value => ctx.measureText(value).width, 1052);
    const perPage = 32, count = Math.ceil(lines.length / perPage);
    if (count > MAX_PAGES) throw new Error("回复超过 32 页，请分段导出");
    const pages = [];
    for (let page = 0; page < count; page++) {
      ctx.fillStyle = token("--vi-surface"); ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = token("--vi-ink"); ctx.font = `550 38px ${font}`;
      ctx.fillText("Ariadne · 衡", 94, 115);
      ctx.fillStyle = token("--vi-text-secondary"); ctx.font = `23px ${font}`;
      ctx.fillText("生成文件 · 非确认资料 · 未经外部事实核验", 94, 162);
      ctx.fillStyle = token("--vi-ink"); ctx.font = `29px ${font}`;
      lines.slice(page * perPage, (page + 1) * perPage).forEach((line, index) => ctx.fillText(line, 94, 244 + index * 44));
      ctx.fillStyle = token("--vi-text-secondary"); ctx.font = `23px ${font}`;
      ctx.fillText(`第 ${page + 1} / ${count} 页`, 94, 1655);
      const jpeg = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", .94));
      if (!jpeg) throw new Error("图片生成失败，请重试");
      pages.push({ bytes: new Uint8Array(await jpeg.arrayBuffer()), width: canvas.width, height: canvas.height });
    }
    return pages;
  }

  async function renderDiagram(raw, doc = root.document) {
    const value = validate(raw);
    if (value.kind !== "DIAGRAM") throw new Error("图解类型无效");
    await doc.fonts?.ready;
    const style = doc.defaultView.getComputedStyle(doc.documentElement);
    const token = name => style.getPropertyValue(name).trim(), font = token("--vi-font-ui");
    if (!font || !token("--vi-ink") || !token("--vi-surface")) throw new Error("排版资源未加载，请刷新后重试");
    const canvas = doc.createElement("canvas"); canvas.width = 1240;
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("浏览器不支持图解生成");
    ctx.font = `550 38px ${font}`;
    const titleLines = wrapText(value.title, text => ctx.measureText(text).width, 1080);
    const top = 130 + titleLines.length * 46;
    canvas.height = top + 110 + value.nodes.length * 230 + value.edges.length * 110;
    ctx.fillStyle = token("--vi-surface"); ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = token("--vi-ink"); ctx.font = `550 38px ${font}`;
    titleLines.forEach((line, i) => ctx.fillText(line, 80, 80 + i * 46));
    const x = 80, width = 580, height = 140, y = index => top + index * 230;
    ctx.lineWidth = 3; ctx.strokeStyle = token("--vi-text-secondary");
    const arrow = (points) => {
      ctx.beginPath(); points.forEach(([a, b], i) => i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)); ctx.stroke();
      const end = points.at(-1), prev = points.at(-2), angle = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      ctx.beginPath(); ctx.moveTo(end[0], end[1]);
      ctx.lineTo(end[0] - 15 * Math.cos(angle - .5), end[1] - 15 * Math.sin(angle - .5));
      ctx.moveTo(end[0], end[1]); ctx.lineTo(end[0] - 15 * Math.cos(angle + .5), end[1] - 15 * Math.sin(angle + .5)); ctx.stroke();
    };
    value.edges.forEach((edge, index) => {
      let labelX, labelY;
      if (edge.to === edge.from + 1) {
        arrow([[x + width / 2, y(edge.from) + height], [x + width / 2, y(edge.to)]]);
        labelX = x + width / 2 + 20; labelY = y(edge.to) - 42;
      } else {
        const lane = 720 + index * 32;
        arrow([[x + width, y(edge.from) + height / 2], [lane, y(edge.from) + height / 2], [lane, y(edge.to) + height / 2], [x + width, y(edge.to) + height / 2]]);
        // Edge legend avoids overlapping long labels in the narrow routing lanes.
        labelX = lane + 6; labelY = (y(edge.from) + y(edge.to)) / 2 + height / 2;
      }
      ctx.fillStyle = token("--vi-ink"); ctx.font = `22px ${font}`;
      const label = String(index + 1);
      wrapText(label, text => ctx.measureText(text).width, 260).forEach((line, i) => ctx.fillText(line, labelX, labelY + i * 26));
    });
    ctx.fillStyle = token("--vi-ink"); ctx.font = `23px ${font}`;
    value.edges.forEach((edge, index) => {
      const legend = `${index + 1}. ${edge.label || `${value.nodes[edge.from]} → ${value.nodes[edge.to]}`}`;
      wrapText(legend, text => ctx.measureText(text).width, 1080).forEach((line, row) => ctx.fillText(line, 80, top + value.nodes.length * 230 + index * 110 + row * 28));
    });
    value.nodes.forEach((node, index) => {
      ctx.fillStyle = token("--vi-surface"); ctx.fillRect(x, y(index), width, height);
      ctx.strokeRect(x, y(index), width, height);
      ctx.fillStyle = token("--vi-ink"); ctx.font = `28px ${font}`;
      const lines = wrapText(node, text => ctx.measureText(text).width, width - 48);
      lines.forEach((line, i) => ctx.fillText(line, x + 24, y(index) + (height - lines.length * 32) / 2 + 26 + i * 32));
    });
    ctx.fillStyle = token("--vi-text-secondary"); ctx.font = `21px ${font}`;
    ctx.fillText("Ariadne · 衡 / 模型图解 · 非确认资料", 80, canvas.height - 45);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("图解生成失败");
    return blob;
  }

  function release(record) { record.urls.forEach(url => root.URL.revokeObjectURL(url)); record.urls.length = 0; }
  function dispose(target) {
    const state = exports.get(target); if (!state) return;
    exports.delete(target); state.observer?.disconnect();
    target.ownerDocument.defaultView.removeEventListener("pagehide", state.pagehide);
    state.items.forEach(record => { release(record); record.nodes.forEach(node => node.remove()); });
    state.items.clear();
  }
  function decorate(target, messages, textFor) {
    if (!target?.isConnected) return;
    const doc = target.ownerDocument;
    const bubbles = [...target.querySelectorAll(".v1-conversation-message")];
    let state = exports.get(target);
    if (!state) {
      state = { items: new Map(), queue: Promise.resolve(), observer: null };
      exports.set(target, state);
      state.observer = new doc.defaultView.MutationObserver(() => { if (!target.isConnected) dispose(target); });
      state.observer.observe(doc.body, { childList: true, subtree: true });
      state.pagehide = event => { if (!event.persisted) dispose(target); };
      doc.defaultView.addEventListener("pagehide", state.pagehide);
    }
    const used = new Set();
    messages.forEach((message, index) => {
      const bubble = bubbles[index];
      if (message.role !== "ASSISTANT" || !bubble || !message.deliverable && !message.web_search) return;
      const key = bubble.dataset.messageKey || message.message_id || message.id || `reply:${index}`;
      // Content and renderer version, rather than DOM identity, own the export.
      const signature = JSON.stringify([VERSION, "render-v2", message.deliverable ?? null, message.web_search ?? null]);
      used.add(key);
      let record = state.items.get(key);
      if (record?.signature === signature) {
        record.bubble = bubble;
        record.nodes.forEach(node => { if (node.parentElement !== bubble) bubble.append(node); });
        return;
      }
      if (record) { release(record); record.nodes.forEach(node => node.remove()); }
      record = { signature, bubble, urls: [], nodes: [] };
      state.items.set(key, record);
      const live = () => exports.get(target) === state && state.items.get(key) === record && record.bubble.isConnected;
      if (message.web_search) {
        const area = doc.createElement("span"); area.className = "v1-reply-exports v1-web-search";
        try {
          const search = searchFromResult(message);
          const label = doc.createElement("span"); label.className = "v1-reply-export-status";
          label.textContent = search.sources.length ? "外部网页参考 · 不属于个人经历 · 未写入资料" : "已尝试搜索，未取得可用来源 · 未写入资料";
          const links = doc.createElement("span"); links.className = "v1-reply-export-files";
          for (const source of search.sources) {
            const link = doc.createElement("a"); link.textContent = source.title; link.href = source.url;
            link.target = "_blank"; link.rel = "noopener noreferrer"; links.append(link);
          }
          area.append(label, links);
        } catch (_) { area.textContent = "搜索来源信息无效 · 请勿据此确认个人经历"; }
        record.nodes.push(area); bubble.append(area);
      }
      if (!message.deliverable) return;
      const area = doc.createElement("span"); area.className = "v1-reply-exports";
      const actions = doc.createElement("span"); actions.className = "v1-reply-export-actions";
      const status = doc.createElement("span"); status.className = "v1-reply-export-status"; status.setAttribute("role", "status");
      const files = doc.createElement("span"); files.className = "v1-reply-export-files";
      area.append(actions, status, files); bubble.append(area); record.nodes.push(area);
      const generate = async () => {
        if (!live() || record.generating) return;
        record.generating = true;
        actions.replaceChildren(); files.replaceChildren(); status.textContent = "正在生成文件…";
        try {
          const value = validate(message.deliverable);
          if (value.kind === "UNSUPPORTED") { status.textContent = value.body; return; }
          const format = value.kind;
          const name = value.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").slice(0, 80);
          const pages = format === "PDF" ? await renderPages(documentText(value), doc) : null;
          const blob = format === "PDF" ? new Blob([pdfFromJpegs(pages)], { type: "application/pdf" }) : await renderDiagram(value, doc);
          if (!live()) return;
          const item = doc.createElement("span"); item.dataset.format = format;
          const url = root.URL.createObjectURL(blob); record.urls.push(url);
          if (format === "DIAGRAM") {
            const image = doc.createElement("img"); image.src = url; image.alt = value.body;
            const preview = doc.createElement("a"); preview.href = url; preview.target = "_blank"; preview.rel = "noopener";
            preview.setAttribute("aria-label", `查看${value.title}`); preview.append(image); item.append(preview);
            const description = doc.createElement("span");
            description.textContent = [value.body, ...value.edges.map((edge, i) => `${i + 1}. ${value.nodes[edge.from]} → ${value.nodes[edge.to]}${edge.label ? `：${edge.label}` : ""}`)].join("\n");
            item.append(description);
          }
          const link = doc.createElement("a"); link.href = url; link.download = `${name}.${format === "PDF" ? "pdf" : "png"}`;
          link.textContent = `下载 ${link.download}`; item.append(link); files.append(item);
          status.textContent = format === "PDF" ? `已生成 ${pages.length} 页 PDF · 文字不可选取` : "图解已生成";
        } catch (error) {
          if (!live()) return;
          status.textContent = error.message || "生成失败，请重试";
          const retry = doc.createElement("button"); retry.type = "button"; retry.textContent = "重试生成文件";
          retry.addEventListener("click", () => { state.queue = state.queue.then(generate); }); actions.append(retry);
        } finally { record.generating = false; }
      };
      // A cached historical export does not re-enter this queue on refresh.
      state.queue = state.queue.then(generate);
    });
    for (const [key, record] of state.items) if (!used.has(key)) {
      release(record); record.nodes.forEach(node => node.remove()); state.items.delete(key);
    }
  }

  function execution({ form }) {
    // Waiting state already lives beside the conversation. Keep the composer
    // dock compact instead of leaving a permanent per-turn timer underneath it.
    form?.parentElement?.querySelectorAll?.(".v1-conversation-elapsed").forEach((label) => label.remove());
  }
  function historyText(message, limit = 1200) {
    const text = (message.web_search ? "[含外部网页参考，非个人经历，不得作为个人修改依据]\n" : "") + (message.content ?? message.text ?? message.message ?? "");
    if (!message.deliverable) return text;
    try {
      const value = validate(message.deliverable);
      return `${text}\n[历史生成文件，非确认资料，内容可能截断]\n${JSON.stringify(value).slice(0, limit)}`;
    } catch (_) { return text; }
  }
  return Object.freeze({ VERSION, validate, fromResult, searchFromResult, documentText, historyText, pdfFromJpegs, wrapText, renderPages, renderDiagram, decorate, dispose, execution });
}));
