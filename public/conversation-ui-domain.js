"use strict";

(function attachConversationUi(root, factory) {
  const processing = root.AriadneProcessingIndicator
    || (typeof module === "object" && module.exports ? require("./processing-indicator-domain.js") : null);
  const api = factory(processing);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AriadneConversationUI = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createConversationUi(ProcessingIndicator) {
  const renderedCounts = new WeakMap();
  const renderedEnds = new WeakMap();
  const enhancedForms = new WeakSet();
  const awaitingReplies = new WeakSet();
  const renderedKeys = new WeakMap();
  const renderedNodes = new WeakMap();
  const reveals = new WeakMap();
  let outputModule;
  function withOutput(callback) {
    if (!globalThis.document?.createElement) return;
    if (!outputModule) outputModule = new Promise(resolve => {
      const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "/conversation-output.css?v=2"; document.head.append(css);
      if (globalThis.AriadneConversationOutput) { resolve(globalThis.AriadneConversationOutput); return; }
      const script = document.createElement("script"); script.src = "/conversation-output.js?v=3";
      script.onload = () => resolve(globalThis.AriadneConversationOutput);
      script.onerror = () => resolve(null);
      document.head.append(script);
    });
    outputModule.then(api => { if (api) callback(api); });
  }

  function createIntro(element) {
    let dismissed = false;
    const update = (hasMessages = false) => {
      dismissed ||= hasMessages;
      element.hidden = dismissed;
    };
    element.addEventListener("click", (event) => {
      if (event.target.closest("button, a[href]")) update(true);
    });
    return Object.freeze({ update });
  }

  const consentHints = new WeakMap();
  function requireTransferConsent(checkbox) {
    // Browser validation bubbles have an unstyleable warning icon. Use the
    // shared VI popover instead; this changes presentation, not authorization.
    checkbox.setCustomValidity("");
    let hint = consentHints.get(checkbox);
    if (checkbox.checked) { hint?.dismiss(); return true; }
    if (!hint) {
      const doc = checkbox.ownerDocument, view = doc.defaultView;
      const panel = doc.createElement("div");
      panel.id = `${checkbox.id}-transfer-hint`;
      panel.className = "v1-consent-hint";
      panel.setAttribute("popover", "auto");
      panel.setAttribute("role", "alert");
      panel.textContent = "请先勾选底部的资料传输与费用说明，再点击发送。";
      doc.body.append(panel);
      const dismiss = () => { if (panel.matches(":popover-open")) panel.hidePopover(); };
      const position = () => {
        if (!panel.matches(":popover-open")) return;
        const styles = view.getComputedStyle(panel);
        const gap = parseFloat(styles.getPropertyValue("--vi-space-8"));
        const edge = parseFloat(styles.getPropertyValue("--vi-space-12"));
        const rect = checkbox.getBoundingClientRect();
        panel.style.left = `${Math.max(edge, Math.min(rect.left, view.innerWidth - panel.offsetWidth - edge))}px`;
        panel.style.top = `${Math.max(edge, Math.min(rect.top - panel.offsetHeight - gap, view.innerHeight - panel.offsetHeight - edge))}px`;
      };
      panel.addEventListener("toggle", event => {
        if (event.newState !== "closed") return;
        checkbox.removeAttribute("aria-invalid");
      });
      const describedBy = new Set((checkbox.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
      describedBy.add(panel.id); checkbox.setAttribute("aria-describedby", [...describedBy].join(" "));
      checkbox.addEventListener("change", dismiss);
      checkbox.addEventListener("blur", dismiss);
      view.addEventListener("resize", position);
      view.addEventListener("scroll", position, true);
      hint = { panel, dismiss, position }; consentHints.set(checkbox, hint);
    }
    checkbox.focus();
    checkbox.setAttribute("aria-invalid", "true");
    if (!hint.panel.matches(":popover-open")) hint.panel.showPopover();
    hint.position();
    return false;
  }

  function takeDraft(input) {
    const text = input.value;
    let edited = false, finished = false;
    const onInput = () => { edited = true; };
    input.value = "";
    input.addEventListener("input", onInput);
    return { text, finish(restore = false) {
      if (finished) return;
      finished = true;
      input.removeEventListener("input", onInput);
      if (restore && !edited && input.value === "") input.value = text;
    } };
  }

  function revealReply(target, bubble, key, previous = null) {
    const view = target.ownerDocument?.defaultView;
    if (!view?.queueMicrotask || view.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const state = { key, view, timer: null, started: previous?.started ?? view.performance.now(), shown: previous?.shown || 0 };
    reveals.set(target, state);
    bubble.style.visibility = "hidden";
    target.setAttribute("aria-busy", "true");
    // Callers may append source links or findings synchronously after rendering.
    // Reveal their text too, preserving the actual DOM and the stored reply.
    view.queueMicrotask(() => {
      if (reveals.get(target) !== state || !bubble.isConnected) return;
      const walker = target.ownerDocument.createTreeWalker(bubble, 4);
      const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("zh", { granularity: "grapheme" }) : null;
      const records = [];
      let node, length = 0;
      while ((node = walker.nextNode())) {
        // Cached downloads/search controls must remain usable across a resumed
        // text reveal; only prose and domain evidence participate in the reveal.
        if (node.parentElement?.closest?.(".v1-reply-exports")) continue;
        const text = node.data, chars = segmenter ? [...segmenter.segment(text)].map((part) => part.segment) : Array.from(text);
        records.push({ node, text, chars, start: length });
        length += chars.length;
      }
      const duration = Math.min(1800, Math.max(120, length * 6));
      const paint = (now) => {
        if (reveals.get(target) !== state || !bubble.isConnected) return;
        const scroll = target.closest(".v1-conversation-scroll, .v1-workspace-history");
        const follow = scroll && scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 32;
        state.shown = Math.min(length, Math.max(state.shown, 1, Math.floor(length * (now - state.started) / duration)));
        records.forEach((record) => {
          const count = Math.max(0, state.shown - record.start);
          record.node.data = count >= record.chars.length ? record.text : record.chars.slice(0, count).join("");
        });
        bubble.style.visibility = "";
        if (follow) scroll.scrollTop = scroll.scrollHeight;
        if (state.shown < length) state.timer = view.setTimeout(() => paint(view.performance.now()), 16);
        else { reveals.delete(target); target.setAttribute("aria-busy", "false"); }
      };
      paint(view.performance.now());
    });
  }

  function enhanceComposers(documentObject = globalThis.document) {
    if (!documentObject?.querySelectorAll) return;
    documentObject.querySelectorAll(".v1-conversation-form").forEach((form) => {
      if (enhancedForms.has(form)) return;
      const input = form.querySelector("textarea"), field = form.querySelector(".v1-composer-field");
      if (!input || !field) return;
      enhancedForms.add(form);
      const send = form.querySelector('button[type="submit"]');
      if (send) field.append(send);
      form.classList.add("has-integrated-composer");
      const doc = form.ownerDocument, view = doc.defaultView;
      const pane = form.parentElement;
      if (pane.matches(".v1-conversation-pane, .v1-ariadne-pane")) {
        const messages = pane.querySelector(".v1-conversation-messages");
        if (messages?.parentElement === pane) {
          const scroll = doc.createElement("div");
          scroll.className = "v1-conversation-scroll";
          scroll.tabIndex = 0;
          scroll.setAttribute("role", "region");
          scroll.setAttribute("aria-label", "对话记录");
          // The title, runtime note and first-use guidance belong to the
          // conversation history. Once messages arrive they scroll away,
          // leaving the available height to the actual dialogue.
          pane.insertBefore(scroll, pane.firstElementChild);
          while (scroll.nextElementSibling && scroll.nextElementSibling !== form) scroll.append(scroll.nextElementSibling);
          pane.classList.add("v1-chat-viewport");
        }
        const dock = doc.createElement("div");
        dock.className = "v1-composer-dock";
        pane.insertBefore(dock, form);
        while (dock.nextElementSibling) dock.append(dock.nextElementSibling);
      }

      const handle = doc.createElement("div");
      handle.className = "v1-composer-resize";
      handle.tabIndex = 0;
      handle.setAttribute("role", "separator");
      handle.setAttribute("aria-orientation", "horizontal");
      handle.setAttribute("aria-label", "调整输入框高度");
      handle.title = "上下拖动调整高度；方向键微调，Home 恢复";
      if (input.id) handle.setAttribute("aria-controls", input.id);
      field.append(handle);
      const minimum = parseFloat(view.getComputedStyle(input).minHeight) || 44;
      let chosenHeight = minimum, drag = null;
      function setHeight(value) {
        const viewportHeight = view.visualViewport?.height || view.innerHeight;
        const history = pane.querySelector(".v1-conversation-scroll, .v1-workspace-history");
        const available = history?.clientHeight > 0 ? history.clientHeight + input.getBoundingClientRect().height - 80 : Infinity;
        const maximum = Math.max(minimum, Math.min(320, viewportHeight * .4, available));
        chosenHeight = Math.round(Math.max(minimum, Math.min(maximum, value)));
        input.style.height = `${chosenHeight}px`;
        handle.setAttribute("aria-valuemin", String(minimum));
        handle.setAttribute("aria-valuemax", String(Math.floor(maximum)));
        handle.setAttribute("aria-valuenow", String(chosenHeight));
      }
      handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        handle.focus({ preventScroll: true });
        drag = { pointer: event.pointerId, y: event.clientY, height: input.getBoundingClientRect().height };
        handle.setPointerCapture(event.pointerId);
      });
      handle.addEventListener("pointermove", (event) => {
        if (drag?.pointer === event.pointerId) setHeight(drag.height + drag.y - event.clientY);
      });
      const stopDrag = () => { drag = null; };
      handle.addEventListener("pointerup", stopDrag);
      handle.addEventListener("pointercancel", stopDrag);
      handle.addEventListener("lostpointercapture", stopDrag);
      handle.addEventListener("keydown", (event) => {
        if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        setHeight(event.key === "Home" ? minimum : event.key === "End" ? Infinity : chosenHeight + (event.key === "ArrowUp" ? 20 : -20));
      });
      view.addEventListener("resize", () => setHeight(chosenHeight));
      view.visualViewport?.addEventListener("resize", () => setHeight(chosenHeight));
      setHeight(minimum);
    });
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  }

  const HUMAN_COPY_INTERNAL_REFERENCE = /(?:\s*[（(](?:(?:confirmed|working)-candidate|job-requirement|card)-[a-z0-9:_-]+[）)])|(?:(?:confirmed|working)-candidate|job-requirement|card)-[a-z0-9:_-]+|source-(?:candidate|job)-[a-f0-9]{16,}|sha256:[a-f0-9]{32,}|(?:revision|analysis|conversation|execution)[-_][a-z0-9:_-]{8,}/giu;

  function humanSafeText(value) {
    return String(value ?? "")
      .replace(HUMAN_COPY_INTERNAL_REFERENCE, "")
      .replace(/[ \t]{2,}/gu, " ")
      .replace(/\s+([，。；：！？,.!?:;])/gu, "$1")
      .trim();
  }

  function renderMessages(target, messages, { empty_text: emptyText, text_for: textFor = (message) => message.content ?? message.text } = {}) {
    if (!target) return;
    const previousCount = renderedCounts.get(target) || 0;
    const scroll = target.closest?.(".v1-conversation-scroll, .v1-workspace-history");
    const previousTop = scroll?.scrollTop || 0, previousHeight = scroll?.scrollHeight || 0;
    const readingHistory = scroll && previousCount > 0 && previousTop + scroll.clientHeight < previousHeight - 32;
    const previousEnds = renderedEnds.get(target);
    const first = messages.length ? textFor(messages[0]) : "", last = messages.length ? textFor(messages.at(-1)) : "";
    const occurrences = new Map();
    const keys = messages.map((message) => {
      const key = message.message_id || message.id || `${message.role}:${textFor(message)}`;
      const count = occurrences.get(key) || 0; occurrences.set(key, count + 1);
      return count ? `${key}:duplicate:${count}` : key;
    });
    const oldKeys = renderedKeys.get(target) || [];
    const oldKeySet = new Set(oldKeys);
    const previousReveal = reveals.get(target);
    if (previousReveal) {
      previousReveal.view.clearTimeout(previousReveal.timer);
      reveals.delete(target);
      target.setAttribute("aria-busy", "false");
    }
    const doc = target.ownerDocument;
    if (doc?.createElement && target.insertBefore) {
      const previous = renderedNodes.get(target) || new Map(), next = new Map();
      messages.forEach((message, index) => {
        const key = keys[index], text = String(textFor(message) ?? ""), role = message.role;
        let record = previous.get(key);
        if (!record || record.text !== text || record.role !== role) {
          const node = doc.createElement("p");
          node.className = `v1-conversation-message ${role === "USER" ? "user" : "assistant"}`;
          node.textContent = text;
          if (previousCount > 0 && !oldKeySet.has(key)) node.classList.add("is-entering");
          record = { node, text, role };
        } else {
          // Domain callers append evidence after this function. Rebuild those
          // attachments, while retaining the message and cached output nodes.
          for (const child of [...record.node.children]) if (!child.classList.contains("v1-reply-exports")) child.remove();
          if (previousReveal?.key === key) {
            if (record.node.firstChild) record.node.firstChild.data = text;
            record.node.style.visibility = "";
          }
        }
        record.node.dataset.messageKey = key;
        next.set(key, record);
        if (target.children[index] !== record.node) target.insertBefore(record.node, target.children[index] || null);
      });
      const keep = new Set([...next.values()].map(record => record.node));
      for (const child of [...target.children]) if (!keep.has(child)) child.remove();
      if (!messages.length) {
        const empty = doc.createElement("p"); empty.className = "v1-conversation-empty"; empty.textContent = emptyText || ""; target.append(empty);
      }
      renderedNodes.set(target, next);
    } else {
      // Minimal non-DOM adapters used by consumers retain the string renderer.
      target.innerHTML = messages.length
        ? messages.map((message, index) => `<p class="v1-conversation-message ${message.role === "USER" ? "user" : "assistant"}${previousCount > 0 && index >= previousCount ? " is-entering" : ""}">${escapeHtml(textFor(message))}</p>`).join("")
        : `<p class="v1-conversation-empty">${escapeHtml(emptyText || "")}</p>`;
    }
    renderedCounts.set(target, messages.length);
    renderedEnds.set(target, { first, last });
    renderedKeys.set(target, keys);
    const scheduleFrame = globalThis.requestAnimationFrame || ((callback) => globalThis.setTimeout(callback, 0));
    scheduleFrame(() => target.querySelectorAll(".v1-conversation-message.is-entering").forEach((message) => message.classList.remove("is-entering")));
    if (readingHistory) {
      const prepended = messages.length > previousCount && previousEnds?.last === last && previousEnds?.first !== first;
      scroll.scrollTop = previousTop + (prepended ? scroll.scrollHeight - previousHeight : 0);
    } else if (scroll) scroll.scrollTop = scroll.scrollHeight;
    else target.lastElementChild?.scrollIntoView?.({ block: "nearest" });
    const lastKey = keys.at(-1);
    const continuing = previousReveal && previousReveal.key === lastKey;
    const newReply = awaitingReplies.has(target) && messages.at(-1)?.role === "ASSISTANT" && !oldKeySet.has(lastKey);
    if (continuing || newReply) {
      awaitingReplies.delete(target);
      if (target.dataset?.liveReply === "true") delete target.dataset.liveReply;
      else revealReply(target, target.lastElementChild, lastKey, continuing ? previousReveal : null);
    }
    withOutput(api => {
      if (renderedKeys.get(target) === keys) api.decorate(target, messages, textFor);
    });
  }

  function setExecutionState({ form, status = null, active, copy = "" }) {
    withOutput(api => api.execution({ form, active }));
    form?.setAttribute?.("aria-busy", String(Boolean(active)));
    const submit = form?.querySelector?.('button[type="submit"]');
    const textarea = form?.querySelector?.("textarea");
    const target = form?.closest?.(".v1-conversation-pane, .v1-ariadne-pane")?.querySelector(".v1-conversation-messages");
    if (target) { if (active) awaitingReplies.add(target); else awaitingReplies.delete(target); }
    if (status && ProcessingIndicator) ProcessingIndicator.set(status, { active: Boolean(active), copy, state: active ? "WAITING" : copy ? "TERMINAL" : "IDLE" });
    else if (status) status.textContent = copy;
    if (submit && ProcessingIndicator?.setButton) ProcessingIndicator.setButton(submit, { active: Boolean(active) });
    else if (submit) submit.classList.toggle("is-loading", Boolean(active));
    if (submit) submit.disabled = Boolean(active);
    if (textarea) textarea.setAttribute("aria-busy", String(Boolean(active)));
    const view = form?.ownerDocument?.defaultView;
    if (view?.parent && view.parent !== view) {
      view.parent.postMessage({ type: "ariadne-conversation-execution-state", active: Boolean(active) }, view.location.origin);
    }
  }

  function settle({ form, messages, focus = true }) {
    const scroll = messages?.closest?.(".v1-conversation-scroll, .v1-workspace-history");
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
    else messages?.lastElementChild?.scrollIntoView?.({ block: "nearest" });
    if (focus) form?.querySelector?.("textarea")?.focus?.({ preventScroll: true });
  }

  function waitForIndicatorPaint(milliseconds = 0) {
    const scheduleFrame = globalThis.requestAnimationFrame || ((callback) => globalThis.setTimeout(callback, 0));
    return new Promise((resolve) => scheduleFrame(() => scheduleFrame(() => globalThis.setTimeout(resolve, milliseconds))));
  }

  if (globalThis.document) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => enhanceComposers(), { once: true });
    else enhanceComposers();
  }
  return Object.freeze({ createIntro, renderMessages, humanSafeText, setExecutionState, settle, waitForIndicatorPaint, enhanceComposers, takeDraft, requireTransferConsent, ProcessingIndicator });
}));
