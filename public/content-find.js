/* Local text lookup only. No Provider calls, writes or context-scope changes. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AriadneContentFind = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const states = new WeakMap();
  const tr = (zh, en) => root.document?.documentElement.lang?.startsWith('en') ? en : zh;
  const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim();
  function matches(text, query) { const body = normalize(text); return normalize(query).split(' ').filter(Boolean).every(term => body.includes(term)); }
  function words(value) {
    if (Array.isArray(value)) return value.map(words).join('\n');
    if (value && typeof value === 'object') return Object.entries(value).filter(([key]) => ['title', 'company', 'location', 'subtitle', 'time', 'summary', 'ownership', 'category', 'facts', 'label', 'value', 'requirements', 'detail', 'text'].includes(key)).map(([, item]) => words(item)).join('\n');
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  }
  function mount(target, label) {
    let state = states.get(target); if (state) return state;
    const doc = target.ownerDocument;
    const panel = doc.createElement('div'); panel.className = 'v1-content-find';
    const field = doc.createElement('label'), caption = doc.createElement('span'), input = doc.createElement('input');
    caption.textContent = label; input.type = 'search'; input.maxLength = 200; input.autocomplete = 'off';
    field.append(caption, input);
    const status = doc.createElement('p'); status.className = 'v1-inline-message'; status.setAttribute('role', 'status'); status.hidden = true;
    const results = doc.createElement('div'); results.className = 'v1-find-results'; results.hidden = true;
    panel.append(field, status, results);
    const scroll = target.closest('.v1-conversation-scroll, .v1-workspace-history');
    (scroll || target).before(panel);
    state = { target, panel, input, status, results, entries: [], reveal: null, limit: 50, paint: () => {} }; states.set(target, state);
    input.addEventListener('input', () => { state.limit = 50; state.paint(); });
    input.addEventListener('keydown', event => { if (event.key === 'Escape' && input.value) { event.preventDefault(); input.value = ''; state.paint(); } });
    return state;
  }
  function library(grid, records) {
    if (!grid?.ownerDocument) return;
    const state = mount(grid, tr('查找卡片内容', 'Find cards'));
    const cards = [...grid.querySelectorAll('.v1-candidate-card')];
    state.entries = cards.map((card, index) => ({ node: card.closest('.v1-library-card, .v1-job-tracked-card') || card, text: words(records[index]) }));
    state.paint = () => {
      state.status.hidden = !state.input.value.trim();
      let found = 0;
      for (const entry of state.entries) { const hit = matches(entry.text, state.input.value); entry.node.hidden = !hit; if (hit) found++; }
      state.status.textContent = state.input.value.trim() ? tr(`找到 ${found} / ${state.entries.length} 张卡片`, `${found} / ${state.entries.length} cards found`) : '';
    };
    state.paint();
  }
  function messages(target, visible, textFor, { all = visible, reveal = null } = {}) {
    if (!target?.ownerDocument || !target.insertBefore) return;
    const state = mount(target, tr('查找本对话', 'Find in this conversation'));
    state.entries = all.filter(message => message.message_id || message.id).map(message => ({ message,
      key: message.message_id || message.id, text: String(textFor(message) || '') }));
    state.reveal = reveal;
    state.paint = () => {
      state.results.replaceChildren();
      const query = state.input.value.trim(); state.results.hidden = !query; state.status.hidden = !query;
      if (!query) { state.status.textContent = ''; return; }
      const found = state.entries.filter(entry => matches(entry.text, query));
      state.status.textContent = tr(`找到 ${found.length} 条记录${found.length > state.limit ? `，显示前 ${state.limit} 条` : ''}`, `${found.length} messages found${found.length > state.limit ? `, showing the first ${state.limit}` : ''}`);
      for (const entry of found.slice(0, state.limit)) {
        const button = target.ownerDocument.createElement('button'); button.dataset.i18n = 'off'; button.type = 'button'; button.className = 'v1-detail-edit-button';
        const label = entry.message.role === 'USER' ? tr('你', 'You') : 'Ariadne';
        const at = normalize(entry.text).indexOf(normalize(query).split(' ')[0]);
        const start = Math.max(0, at - 30);
        button.textContent = `${label} · ${start ? '…' : ''}${entry.text.slice(start, start + 140)}`;
        button.addEventListener('click', () => {
          if (![...target.children].some(node => node.dataset.messageKey === entry.key)) state.reveal?.(entry.message);
          const node = [...target.children].find(item => item.dataset.messageKey === entry.key);
          if (!node) return;
          target.querySelectorAll('.is-find-target').forEach(item => item.classList.remove('is-find-target'));
          node.classList.add('is-find-target'); node.tabIndex = -1; node.focus({ preventScroll: true }); node.scrollIntoView({ block: 'center' });
        });
        state.results.append(button);
      }
      if (found.length > state.limit) {
        const more = target.ownerDocument.createElement('button'); more.type = 'button'; more.className = 'v1-detail-edit-button';
        more.textContent = tr('显示更多查找结果', 'Show more results');
        more.addEventListener('click', () => { const previous = state.limit; state.limit += 50; state.paint(); state.results.children[previous]?.focus(); });
        state.results.append(more);
      }
    };
    state.paint();
  }
  // Follow-up records share the same plain-text find behavior; images stay untouched.
  function records(target) {
    if (!target?.ownerDocument) return;
    const state = mount(target, tr('查找求职记录', 'Find follow-up records'));
    state.paint = () => {
      state.status.hidden = !state.input.value.trim();
      const entries = [...target.querySelectorAll('.v1-journal-entry')]; let found = 0;
      for (const entry of entries) { const hit = matches(entry.textContent, state.input.value); entry.hidden = !hit; if (hit) found++; }
      state.status.textContent = state.input.value.trim() ? tr(`找到 ${found} 条记录`, `${found} records found`) : '';
    };
    state.paint();
  }
  return Object.freeze({ matches, words, library, messages, records });
}));
