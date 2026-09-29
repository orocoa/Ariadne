import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const UI = require('../public/conversation-ui-domain.js');
const Output = require('../public/conversation-output.js');

// Deterministic DOM adapter: identity, events, resource disposal and canvas calls
// are observable here. Layout/visual acceptance is covered by the browser check.
class TextNode {
  constructor(data) { this.data = data; this.parentElement = null; }
  get textContent() { return this.data; }
  get isConnected() { return this.parentElement?.isConnected || false; }
}
class Element {
  constructor(tag, doc) {
    this.tagName = tag; this.ownerDocument = doc; this.childNodes = []; this.dataset = {}; this.attributes = {};
    this.style = {}; this.listeners = new Map(); this.className = ''; this.parentElement = null;
    this.classList = { contains: name => this.className.split(' ').includes(name),
      add: name => { if (!this.classList.contains(name)) this.className += ` ${name}`; },
      remove: name => { this.className = this.className.split(' ').filter(value => value !== name).join(' '); },
      toggle: (name, enabled) => enabled ? this.classList.add(name) : this.classList.remove(name) };
  }
  get children() { return this.childNodes.filter(node => node instanceof Element); }
  get firstChild() { return this.childNodes[0]; }
  get firstElementChild() { return this.children[0]; }
  get lastElementChild() { return this.children.at(-1); }
  get isConnected() { return this === this.ownerDocument.body || Boolean(this.parentElement?.isConnected); }
  get textContent() { return this.childNodes.map(node => node.textContent).join(''); }
  set textContent(text) { this.replaceChildren(new TextNode(String(text))); }
  append(...nodes) { nodes.forEach(node => this.insertBefore(node, null)); }
  insertBefore(node, next) {
    if (node === next) return;
    node.parentElement?.removeChild(node);
    const index = next ? this.childNodes.indexOf(next) : this.childNodes.length;
    this.childNodes.splice(index, 0, node); node.parentElement = this;
  }
  removeChild(node) { this.childNodes.splice(this.childNodes.indexOf(node), 1); node.parentElement = null; }
  remove() { this.parentElement?.removeChild(this); }
  replaceChildren(...nodes) { [...this.childNodes].forEach(node => this.removeChild(node)); this.append(...nodes); }
  setAttribute(name, value) { this.attributes[name] = value; }
  hasAttribute(name) { return name in this.attributes || name.startsWith('data-') && name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()) in this.dataset; }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  matches(selector) {
    return selector.split(',').some(value => {
      value = value.trim();
      if (value.startsWith('.')) return this.classList.contains(value.slice(1));
      if (value.startsWith('[')) return this.hasAttribute(value.slice(1, -1));
      return this.tagName === value;
    });
  }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest() { return null; }
}
let encodes = [], failEncode = false;
const events = new Map();
const doc = { fonts: { ready: Promise.resolve() },
  defaultView: { matchMedia: () => ({ matches: true }),
    addEventListener: (name, callback) => events.set(name, callback), removeEventListener: name => events.delete(name),
    getComputedStyle: () => ({ getPropertyValue: name => name === '--vi-font-ui' ? 'sans-serif' : '#000' }),
    MutationObserver: class { observe() {} disconnect() {} } },
  createElement(tag) {
    const node = new Element(tag, doc);
    if (tag === 'template') {
      node.content = new Element('fragment', doc);
      Object.defineProperty(node, 'innerHTML', { set(value) { node.content.append(value); } });
    }
    if (tag === 'canvas') {
      node.getContext = () => ({ measureText: text => ({ width: text.length * 12 }), fillRect() {}, fillText() {} });
      node.toBlob = (callback, type) => { encodes.push(type); queueMicrotask(() => callback(failEncode ? null : new Blob([new Uint8Array([255, 216, 255, 217])], { type }))); };
    }
    return node;
  },
};
doc.body = new Element('body', doc);
const target = doc.createElement('section'); doc.body.append(target);
const old = [{ id: 'one', role: 'ASSISTANT', text: 'Historical reply' }];
UI.renderMessages(target, old);
const original = target.firstElementChild;
UI.renderMessages(target, [...old, { id: 'two', role: 'USER', text: 'New question' }]);
assert.equal(target.firstElementChild, original, 'appending a turn preserves historical message DOM');
const evidence = doc.createElement('span'); evidence.textContent = 'old evidence'; original.append(evidence);
UI.renderMessages(target, [{ id: 'earlier', role: 'USER', text: 'Earlier question' }, ...old]);
assert.equal(target.children[1], original, 'prepending preserves historical node identity');
assert.equal(original.textContent, old[0].text, 'domain evidence is replaced rather than duplicated');
UI.renderMessages(target, [old[0], { ...old[0] }]);
assert.equal(target.children.length, 2, 'duplicate fallback identities cannot collapse messages');

const created = [], revoked = [];
const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
URL.createObjectURL = blob => { const url = `blob:test-${created.length}`; created.push({ url, blob }); return url; };
URL.revokeObjectURL = url => revoked.push(url);
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve)); };
try {
  const message = { ...old[0], deliverable: { kind: 'PDF', title: 'Synthetic', body: 'Complete content', nodes: [], edges: [] } };
  UI.renderMessages(target, [message]); Output.decorate(target, [message]); await settle();
  assert.deepEqual(encodes, ['image/jpeg'], 'PDF export does not encode an unused PNG');
  const firstLink = target.querySelector('a');
  UI.renderMessages(target, [message, { id: 'question', role: 'USER', text: 'next' }]); Output.decorate(target, [message, { role: 'USER' }]); await settle();
  assert.equal(encodes.length, 1, 'history refresh never regenerates unchanged exports');
  assert.equal(target.querySelector('a'), firstLink); assert.equal(revoked.length, 0);
  // A caller can replace a node without invalidating identical file content.
  const replacement = doc.createElement('p'); replacement.className = 'v1-conversation-message'; replacement.dataset.messageKey = 'one';
  target.replaceChildren(replacement); Output.decorate(target, [message]); await settle();
  assert.equal(target.querySelector('a'), firstLink); assert.equal(encodes.length, 1);
  const changed = { ...message, deliverable: { ...message.deliverable, body: 'Changed full content' } };
  Output.decorate(target, [changed]); await settle();
  assert.equal(encodes.length, 2); assert.deepEqual(revoked, ['blob:test-0'], 'changed content invalidates only its old URL');
  failEncode = true; Output.decorate(target, [{ ...changed, deliverable: { ...changed.deliverable, title: 'Retry' } }]); await settle();
  assert.match(target.textContent, /图片生成失败/);
  failEncode = false; target.querySelector('button').listeners.get('click')(); await settle();
  assert.equal(target.querySelector('a').download, 'Retry.pdf', 'failed generation remains retryable');
  events.get('pagehide')({ persisted: true }); assert.equal(revoked.length, 2, 'BFCache retains usable exports');
  events.get('pagehide')({ persisted: false }); assert.equal(revoked.length, 3, 'leaving the document releases all URLs');
} finally { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; }

const pageSource = readFileSync(new URL('../public/personal-understanding.js', import.meta.url), 'utf8');
const draftCode = pageSource.slice(pageSource.indexOf('  const proposalViews ='), pageSource.indexOf('  let pendingMessage ='));
const container = doc.createElement('section'); doc.body.append(container);
const context = { document: doc, state: { snapshot: {}, memories: [] }, busy: false,
  Context: { records: () => [] }, Memory: { latest: value => value }, render() {} };
vm.createContext(context); vm.runInContext(`${draftCode}\nglobalThis.drafts = { renderProposals, assertProposalDraft, settleProposalDraft, proposalViews };`, context);
const markup = entry => {
  const node = doc.createElement('article'), input = doc.createElement('textarea'); input.id = `proposal-${entry.proposal_id}`; input.value = entry.text;
  node.append(input, doc.createElement('button')); return node;
};
const proposal = { proposal_id: 'p1', expected_version: 1, text: 'Original' };
const renderDrafts = entries => context.drafts.renderProposals(container, entries, 'memory', markup);
renderDrafts([proposal]); const article = container.firstElementChild, input = article.querySelector('textarea');
input.value = 'Unsaved user edit'; article.listeners.get('input')({ target: input });
renderDrafts([structuredClone(proposal)]);
assert.equal(container.firstElementChild, article); assert.equal(input.value, 'Unsaved user edit', 'reload/history preserves unsaved input');
renderDrafts([{ ...proposal, expected_version: 2 }]);
assert.equal(input.value, 'Unsaved user edit'); assert.equal(article.querySelector('button').disabled, true);
assert.throws(() => context.drafts.assertProposalDraft('memory', 'p1'), /version_conflict/, 'stale drafts cannot be saved against a new base');
renderDrafts([]); assert.equal(container.firstElementChild, article, 'an externally decided proposal retains a dirty draft for recovery');
const reset = article.querySelector('[data-proposal-reset]'); reset.listeners.get('click')();
renderDrafts([{ ...proposal, expected_version: 2 }]);
assert.notEqual(container.firstElementChild, article, 'explicit discard permits the latest proposal to replace the draft');
assert.equal(container.querySelector('textarea').value, 'Original');
context.busy = true; renderDrafts([{ ...proposal, expected_version: 2 }]);
assert.equal(container.querySelector('button').disabled, true);
context.busy = false; renderDrafts([{ ...proposal, expected_version: 2 }]);
assert.equal(container.querySelector('button').disabled, false, 'stable controls become available again after an operation finishes');
const saving = context.drafts.assertProposalDraft('memory', 'p1'), submittedVersion = saving.editVersion;
const laterInput = saving.node.querySelector('textarea'); laterInput.value = 'Typed while save was in flight';
saving.node.listeners.get('input')({ target: laterInput });
context.drafts.settleProposalDraft(saving, submittedVersion); renderDrafts([]);
assert.equal(container.firstElementChild, saving.node, 'successful save cannot discard edits typed after its submitted version');
assert.equal(laterInput.value, 'Typed while save was in flight');
context.drafts.settleProposalDraft(saving, saving.editVersion); renderDrafts([]);
assert.equal(container.children.length, 0, 'a completed unmodified draft can be released');
console.log('frontend rendering: keyed history, export reuse/invalidation/retry/disposal, JPEG-only PDF, draft preservation and base conflicts PASS');
