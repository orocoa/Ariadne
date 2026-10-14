import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const UI = createRequire(import.meta.url)('../public/conversation-ui-domain.js');

// A controllable browser clock exercises the public rendering/execution boundary.
let now = 0, reduced = false, nextTimer = 0;
const microtasks = [], timers = new Map();
const view = {
  queueMicrotask: fn => microtasks.push(fn),
  performance: { now: () => now },
  setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer; },
  clearTimeout: id => timers.delete(id),
  matchMedia: () => ({ matches: reduced }),
};
const scroll = { scrollTop: 180, clientHeight: 300, scrollHeight: 1000 };
const target = {
  attributes: {}, children: [], closest: () => scroll, querySelectorAll: () => [],
  setAttribute(name, value) { this.attributes[name] = value; },
  set innerHTML(html) {
    this.children.forEach(bubble => { bubble.isConnected = false; });
    this.children = [...html.matchAll(/<(p|div)[^>]*>(.*?)<\/\1>/gs)].map(match => ({
      nodes: [{ data: match[2] }], style: {}, isConnected: true,
    }));
  },
  get lastElementChild() { return this.children.at(-1); },
  ownerDocument: {
    defaultView: view,
    createTreeWalker(bubble) { let i = 0; return { nextNode: () => bubble.nodes[i++] }; },
  },
};
const form = { closest: () => ({ querySelector: () => target }) };
const render = messages => UI.renderMessages(target, messages);
const flush = () => { while (microtasks.length) microtasks.shift()(); };
const tick = elapsed => { now += elapsed; const work = [...timers.values()]; timers.clear(); work.forEach(fn => fn()); };
const text = () => target.lastElementChild.nodes.map(node => node.data).join('');
const history = [{ id: 'old', role: 'ASSISTANT', text: '已有的历史回复' }];

render([]); flush();
assert.notEqual(target.attributes['aria-busy'], 'true', 'empty history does not start a reply animation');
assert.equal(timers.size, 0);
render(history);
assert.equal(text(), history[0].text, 'initial history appears in full');
UI.setExecutionState({ form, active: true });
render(history);
flush();
assert.equal(text(), history[0].text, 'waiting/failure refresh must not replay the old answer');
const answer = '👩🏽‍💻' + '新的回复与完整来源。'.repeat(30);
const messages = [...history, { id: 'new', role: 'ASSISTANT', text: answer }];
render(messages);
const sourceNode = { data: '来源标题' };
target.lastElementChild.nodes.push(sourceNode); // synchronous caller-added evidence
UI.setExecutionState({ form, active: false });
flush();
assert.equal(text(), '👩🏽‍💻', 'first visible character is a complete grapheme');
assert.equal(sourceNode.data, '', 'appended evidence follows the same reveal');
assert.equal(target.lastElementChild.style.visibility, '');
assert.equal(target.attributes['aria-busy'], 'true');
scroll.scrollTop = 180;
tick(300);
const partial = text();
assert.ok(partial.length > 7 && partial.length < answer.length, 'reply progresses before completion');
assert.equal(scroll.scrollTop, 180, 'reveal does not pull a reader out of history');
render(messages);
target.lastElementChild.nodes.push({ data: '来源标题' });
flush();
assert.equal(text(), partial, 'a refresh resumes without restarting');
tick(1700);
assert.equal(text(), answer + '来源标题', 'final reply and appended evidence remain exact');
assert.equal(target.attributes['aria-busy'], 'false');
assert.equal(timers.size, 0);
render(messages); flush();
assert.equal(text(), answer, 'completed replies do not replay on reload');

reduced = true;
UI.setExecutionState({ form, active: true });
render([...messages, { id: 'reduced', role: 'ASSISTANT', text: '减少动效时直接显示完整回复' }]);
flush();
assert.equal(text(), '减少动效时直接显示完整回复');
assert.equal(timers.size, 0);
console.log('reply reveal: history, progressive text, graphemes, evidence, refresh, scrolling and reduced motion PASS');
