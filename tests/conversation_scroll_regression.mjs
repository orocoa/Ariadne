import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const UI = require('../public/conversation-ui-domain.js');

// A long thread must not pull a reader away from older messages on refresh.
let scrollTop = 0;
const scroll = { clientHeight: 300, scrollHeight: 0,
  get scrollTop() { return scrollTop; },
  set scrollTop(value) { scrollTop = Math.min(value, Math.max(0, this.scrollHeight - this.clientHeight)); },
};
let jumps = 0;
const target = {
  closest: () => scroll,
  querySelectorAll: () => [],
  set innerHTML(value) { scroll.scrollHeight = (value.match(/<(?:p|div) /g) || []).length * 100; },
  lastElementChild: { scrollIntoView() { jumps++; scroll.scrollTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight); } },
};
const messages = Array.from({ length: 20 }, (_, index) => ({ role: 'USER', text: `message ${index}` }));
UI.renderMessages(target, messages);
assert.equal(scroll.scrollTop, 1700);
scroll.scrollTop = 420;
UI.renderMessages(target, messages);
assert.equal(scroll.scrollTop, 420);
assert.equal(jumps, 0, "no ancestor scrolling while reading history");
const earlier = [{ role: 'USER', text: 'earlier 1' }, { role: 'ASSISTANT', text: 'earlier 2' }, ...messages];
UI.renderMessages(target, earlier);
assert.equal(scroll.scrollTop, 620, 'prepending history preserves the visible message position');
const appended = [...earlier, { role: 'ASSISTANT', text: 'new answer' }];
UI.renderMessages(target, appended);
assert.equal(scroll.scrollTop, 620, 'a reader stays in history when a reply arrives');
scroll.scrollTop = scroll.scrollHeight - scroll.clientHeight;
UI.renderMessages(target, [...appended, { role: 'USER', text: 'next question' }]);
assert.equal(scroll.scrollTop, 2100);
assert.equal(jumps, 0, 'bottom following only scrolls the message region');
console.log('conversation scroll: refresh, older history, appended replies and bottom following PASS');
