// Deterministic DOM/canvas adapter for logic QA. It cannot prove visual fidelity.
export function documentFixture() {
  class Text {
    constructor(data) { this.data = String(data); this.parentElement = null; }
    get textContent() { return this.data; }
    get isConnected() { return Boolean(this.parentElement?.isConnected); }
  }
  class Element {
    constructor(tag) {
      this.tagName = tag; this.ownerDocument = doc; this.childNodes = []; this.dataset = {}; this.attributes = {}; this.style = {};
      this.listeners = new Map(); this.className = ''; this.parentElement = null;
      this.classList = { contains: name => this.className.split(' ').includes(name),
        add: name => { if (!this.classList.contains(name)) this.className += ` ${name}`; },
        remove: name => { this.className = this.className.split(' ').filter(value => value !== name).join(' '); },
        toggle: (name, enabled) => enabled ? this.classList.add(name) : this.classList.remove(name) };
    }
    get children() { return this.childNodes.filter(child => child instanceof Element); }
    get isConnected() { return this === doc.body || Boolean(this.parentElement?.isConnected); }
    get textContent() { return this.childNodes.map(node => node.textContent).join(''); }
    set textContent(value) { this.replaceChildren(new Text(value)); }
    append(...nodes) { for (const node of nodes) { node.parentElement?.removeChild(node); this.childNodes.push(node); node.parentElement = this; } }
    removeChild(node) { this.childNodes.splice(this.childNodes.indexOf(node), 1); node.parentElement = null; }
    remove() { this.parentElement?.removeChild(this); }
    replaceChildren(...nodes) { for (const child of [...this.childNodes]) this.removeChild(child); this.append(...nodes); }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    matches(selector) { return selector.split(',').some(value => { value = value.trim(); return value.startsWith('.') ? this.classList.contains(value.slice(1)) : this.tagName === value; }); }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest() { return null; }
    click() { doc.clicks.push({ href: this.href, download: this.download }); }
  }
  const doc = { encodes: 0, failEncode: false, clicks: [], fonts: { ready: Promise.resolve() },
    defaultView: { getComputedStyle: () => ({ getPropertyValue: key => key === '--vi-font-ui' ? 'sans-serif' : '#000' }), addEventListener() {}, removeEventListener() {},
      MutationObserver: class { observe() {} disconnect() {} } },
    createElement(tag) {
      const node = new Element(tag);
      if (tag === 'canvas') {
        const ctx = { font: '', measureText(text) { const size = Number(this.font.match(/([\d.]+)px/)?.[1] || 10); return { width: [...text].length * size * .5 }; },
          fillRect() {}, fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} };
        node.getContext = () => ctx;
        node.toBlob = (callback, type) => { doc.encodes++; queueMicrotask(() => callback(doc.failEncode ? null : new Blob([new Uint8Array([255, 216, 255, 217])], { type }))); };
      }
      return node;
    },
    createTextNode: value => new Text(value),
  };
  doc.body = new Element('body');
  return doc;
}

export async function settleDom() {
  for (let index = 0; index < 20; index++) await new Promise(resolve => setImmediate(resolve));
}

export async function waitForDom(predicate, milliseconds = 2000) {
  const deadline = Date.now() + milliseconds;
  while (!predicate()) {
    if (Date.now() >= deadline) throw Error('synthetic_DOM_result_timeout');
    await new Promise(resolve => setTimeout(resolve, 2));
  }
}
