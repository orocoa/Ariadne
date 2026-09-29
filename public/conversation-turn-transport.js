"use strict";

(function attach(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AriadneConversationTurnTransport = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function create(root) {
  const STREAM = "application/x-ariadne-turn+ndjson";
  const FORM_IDS = { CANDIDATE: ["candidate-workspace-composer", "candidate-conversation-form"], JOB: ["job-workspace-composer", "job-conversation-form"], PERSONAL: ["personal-conversation-form"], JOB_OVERVIEW: ["job-overview-form"] };
  const tr = (zh, en) => root.document?.documentElement.lang?.startsWith("en") ? en : zh;

  function feedback(domain) {
    const doc = root.document;
    const form = FORM_IDS[domain]?.map(id => doc?.getElementById(id)).find(Boolean);
    const pane = form?.closest(".v1-conversation-pane, .v1-ariadne-pane") || form?.parentElement;
    const messages = pane?.querySelector(".v1-conversation-messages") || pane?.querySelector(".v1-workspace-history");
    if (!messages) return { event() {}, finish() {} };
    if (!doc.querySelector('link[data-turn-feedback]')) {
      const css = doc.createElement("link"); css.rel = "stylesheet"; css.href = "/conversation-feedback.css?v=3"; css.dataset.turnFeedback = ""; doc.head.append(css);
    }
    pane.querySelectorAll(".v1-turn-feedback").forEach(node => node.remove());
    const panel = doc.createElement("section"); panel.className = "v1-turn-feedback is-active";
    panel.setAttribute("aria-label", tr("模型动态", "Model activity"));
    const status = doc.createElement("div"); status.className = "v1-conversation-status";
    const stage = copy => root.AriadneProcessingIndicator?.set(status, { active: true, copy });
    stage(tr("正在连接模型", "Connecting to the model"));
    const thoughts = doc.createElement("div"); thoughts.className = "v1-turn-commentary"; thoughts.hidden = true;
    const heading = doc.createElement("p"); heading.className = "v1-turn-commentary-heading"; heading.textContent = tr("思路说明", "Approach"); thoughts.append(heading);
    const preview = doc.createElement("p"); preview.className = "v1-turn-preview"; preview.hidden = true;
    panel.append(status, thoughts, preview); messages.after(panel);
    const commentary = new Map(), activities = new Map();
    const labels = { thinking: ["正在思考", "Thinking"], search: ["正在搜索公开网页", "Searching public websites"], reading: ["正在读取公开网页", "Reading a public page"], finding: ["正在查找网页内容", "Finding information on a page"] };
    // Highlight only newly received text, without replaying or inventing tokens.
    const updateText = (node, text) => {
      const previous = node.textContent;
      if (text === previous) return;
      const prefix = text.startsWith(previous) ? previous : "";
      const next = doc.createElement("span"); next.className = "v1-turn-fragment"; next.textContent = text.slice(prefix.length);
      node.replaceChildren(doc.createTextNode(prefix), next);
    };
    let ended = false;
    return {
      event(event) {
        if (ended || !panel.isConnected) return;
        const scroll = panel.closest(".v1-conversation-scroll, .v1-workspace-history");
        const follow = scroll && scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 80;
        if (event.type === "model_started") stage(tr("正在等待模型回应", "Waiting for the model"));
        if (event.type === "activity") {
          if (event.state === "started") activities.set(event.id, event.activity); else activities.delete(event.id);
          const active = [...activities.values()].at(-1);
          stage(active ? tr(...labels[active]) : tr("正在整理回应", "Preparing the response"));
        }
        // Compatibility with older servers: a public activity update is a status,
        // never a numbered technical log or a claim about private reasoning.
        if (event.type === "update") stage(event.text);
        if (event.type === "commentary") {
          thoughts.hidden = false;
          let item = commentary.get(event.id);
          if (!item) { item = doc.createElement("p"); thoughts.append(item); commentary.set(event.id, item); }
          updateText(item, event.text);
        }
        if (event.type === "preview") {
          stage(tr("正在生成回答", "Writing the reply"));
          preview.hidden = false; updateText(preview, event.text);
          messages.dataset.liveReply = "true";
        }
        if (event.type === "checking") stage(tr("正在完成回答", "Finishing the reply"));
        if (follow) scroll.scrollTop = scroll.scrollHeight;
      },
      finish(ok) {
        if (ended) return; ended = true;
        panel.classList.remove("is-active"); root.AriadneProcessingIndicator?.clear(status);
        preview.textContent = ""; preview.hidden = true;
        if (!ok) delete messages.dataset.liveReply;
        // Only public model commentary remains; domain UI owns final answers/errors.
        if (!ok || !commentary.size) panel.remove();
      },
    };
  }

  async function readStream(response, onEvent) {
    const reader = response.body?.getReader();
    if (!reader) throw fallbackError({ error: "CONVERSATION_STREAM_UNAVAILABLE" });
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let buffer = "", size = 0, sequence = 0, terminal = null, previewText = "";
    const commentaryText = new Map();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { buffer += decoder.decode(); break; }
        size += value.byteLength;
        if (size > 16000000) throw Error("CONVERSATION_STREAM_LIMIT");
        buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (terminal || event.seq !== ++sequence) throw Error("CONVERSATION_STREAM_SEQUENCE_INVALID");
          if (event.type === "result") {
            if (!Number.isInteger(event.status) || !event.result || typeof event.result !== "object") throw Error("CONVERSATION_STREAM_RESULT_INVALID");
            terminal = event;
          } else if (["received", "input_ready", "model_started", "checking"].includes(event.type)) {
            if (event.type === "input_ready" && (!Number.isInteger(event.images) || event.images < 0 || event.images > 80)) throw Error("CONVERSATION_STREAM_EVENT_INVALID");
            onEvent(event);
          } else if (event.type === "activity") {
            if (!["thinking", "search", "reading", "finding"].includes(event.activity) || !["started", "completed"].includes(event.state)
              || typeof event.id !== "string" || !event.id || event.id.length > 200 || Object.keys(event).some(key => !["seq", "type", "id", "activity", "state"].includes(key))) throw Error("CONVERSATION_STREAM_EVENT_INVALID");
            onEvent(event);
          } else if (["update", "preview", "preview_delta", "commentary", "commentary_delta"].includes(event.type) && typeof event.text === "string" && event.text.length <= 12000) {
            if (["commentary", "commentary_delta"].includes(event.type) && (typeof event.id !== "string" || !event.id || event.id.length > 200 || Object.keys(event).some(key => !["seq", "type", "id", "text"].includes(key)))) throw Error("CONVERSATION_STREAM_EVENT_INVALID");
            if (event.type === "preview" || event.type === "preview_delta") {
              if (event.type === "preview_delta" && !previewText) throw Error("CONVERSATION_STREAM_EVENT_INVALID");
              previewText = event.type === "preview" ? event.text : previewText + event.text;
              if (previewText.length > 12000) throw Error("CONVERSATION_STREAM_EVENT_INVALID");
              onEvent({ ...event, type: "preview", text: previewText });
            } else if (["commentary", "commentary_delta"].includes(event.type)) {
              const previous = commentaryText.get(event.id);
              if (event.type === "commentary_delta" && previous === undefined) throw Error("CONVERSATION_STREAM_EVENT_INVALID");
              const text = event.type === "commentary" ? event.text : previous + event.text;
              if (text.length > 12000 || (!commentaryText.has(event.id) && commentaryText.size >= 200)) throw Error("CONVERSATION_STREAM_EVENT_INVALID");
              commentaryText.set(event.id, text);
              onEvent({ ...event, type: "commentary", text });
            } else onEvent(event);
          } else throw Error("CONVERSATION_STREAM_EVENT_INVALID");
        }
      }
      if (buffer.trim() || !terminal) throw Error("CONVERSATION_STREAM_INCOMPLETE");
      return terminal;
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  function fallbackError(result, fallback) {
    const code = result?.error || fallback;
    const error = new Error(code);
    error.code = code;
    error.failure_layer = result?.failure_layer || "runtime";
    error.network_call_made = result?.network_call_made === true;
    error.diagnostics = result?.diagnostics;
    return error;
  }

  async function execute({
    request,
    domain,
    endpoint,
    fallback_error: fallback = "CONVERSATION_TURN_FAILED",
    malformed_error: malformed = "MALFORMED_RESPONSE",
    include_attachments: includeAttachments = true,
    create_error: createError = null,
    on_event: onEvent = null,
  }) {
    if (!request || typeof domain !== "string" || !domain || typeof endpoint !== "string" || !endpoint.startsWith("/api/")) {
      throw new Error("CONVERSATION_TURN_TRANSPORT_INPUT_INVALID");
    }
    const attachments = includeAttachments ? root.AriadneConversationAttachments : null;
    const live = request.phase && request.phase !== "DISCUSS" ? { event() {}, finish() {} } : feedback(domain);
    let finished = false;
    try {
      const outbound = attachments ? await attachments.prepare(request, domain) : request;
      attachments?.stage(request, "MODEL_REQUEST");
      const responsePromise = (root.AriadneTransport || root).fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: request.phase && request.phase !== "DISCUSS" ? "application/json" : STREAM },
        body: JSON.stringify(outbound),
      });
      attachments?.dispatch(request);
      let response = await responsePromise;
      const streamed = response.headers?.get("Content-Type")?.split(";")[0] === STREAM;
      let result;
      if (streamed) {
        const terminal = await readStream(response, event => { live.event(event); onEvent?.(event); });
        result = terminal.result;
        response = { ok: terminal.status >= 200 && terminal.status < 300, status: terminal.status };
      } else result = await response.json().catch(() => ({ error: malformed }));
      if (!response.ok || result?.error) {
        root.AriadneTransport?.noteError?.(result?.error);
        throw createError ? createError({ response, result }) : fallbackError(result, fallback);
      }
      finished = true;
      attachments?.finish(request, true, null, result);
      live.finish(true, streamed, result);
      return result;
    } catch (error) {
      if (!finished) attachments?.finish(request, false, error);
      live.finish(false);
      throw error;
    }
  }

  return Object.freeze({ execute, fallbackError, readStream, STREAM });
}));
