// A very small stand-in for the browser, so the page scripts (public/app.js, account.js and
// scope.js) can be loaded and driven in a test without a real browser. Elements are found by
// id only; setting innerHTML replaces any element whose id the new HTML names, as a browser
// does. Server calls go to a function the test gives, which records them.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = Boolean(init.bubbles);
    this.defaultPrevented = false;
    this.target = null;
    this.submitter = init.submitter || null;
  }

  preventDefault() { this.defaultPrevented = true; }

  stopPropagation() {}
}

function makeDocument() {
  const byId = new Map();
  const docListeners = new Map();
  let doc = null;

  class Element {
    constructor(tag = 'div', id = '') {
      this.tagName = tag.toUpperCase();
      this.id = id;
      this.value = '';
      this.checked = false;
      this.disabled = false;
      this.textContent = '';
      this.dataset = {};
      this.style = {};
      this.listeners = new Map();
      this.attributes = new Map();
      this.html = '';
      const classes = new Set();
      this.classList = {
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        toggle: (name, on) => { const next = on === undefined ? !classes.has(name) : Boolean(on); if (next) classes.add(name); else classes.delete(name); return next; },
        contains: (name) => classes.has(name),
      };
    }

    get innerHTML() { return this.html; }

    // New HTML replaces the elements it names, so state kept on the old ones is lost.
    set innerHTML(value) {
      this.html = String(value);
      for (const match of this.html.matchAll(/\bid="([^"]+)"/g)) byId.delete(match[1]);
    }

    insertAdjacentHTML(_where, html) { this.html += html; }

    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(fn);
    }

    removeEventListener() {}

    dispatchEvent(event) {
      if (!event.target) event.target = this;
      for (const fn of this.listeners.get(event.type) || []) fn(event);
      if (event.bubbles) for (const fn of docListeners.get(event.type) || []) fn(event);
      return !event.defaultPrevented;
    }

    click() { this.dispatchEvent(new FakeEvent('click', { bubbles: true })); }

    requestSubmit(submitter) { this.dispatchEvent(new FakeEvent('submit', { bubbles: true, submitter })); }

    checkValidity() { return true; }

    focus() {}

    blur() {}

    scrollIntoView() {}

    closest(selector) {
      if (selector.startsWith('#') && selector.slice(1) === this.id) return this;
      return null;
    }

    matches() { return false; }

    contains(other) { return other === this; }

    querySelector() { return null; }

    querySelectorAll() { return []; }

    setAttribute(name, value) { this.attributes.set(name, String(value)); }

    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }

    removeAttribute(name) { this.attributes.delete(name); }

    appendChild(child) { return child; }

    after() {}

    remove() {}

    getContext() { return null; }
  }

  doc = {
    body: new Element('body'),
    getElementById(id) {
      if (!byId.has(id)) byId.set(id, new Element(id === 'task' ? 'textarea' : 'div', id));
      return byId.get(id);
    },
    querySelector(selector) {
      const id = /^#([\w-]+)$/.exec(selector);
      if (id) return doc.getElementById(id[1]);
      // A radio or box by name is there but not ticked.
      return /^input\[name=/.test(selector) && !selector.includes(':checked') ? new Element('input') : null;
    },
    querySelectorAll() { return []; },
    createElement(tag) { return new Element(tag); },
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
    removeEventListener() {},
  };
  return doc;
}

// Loads the page scripts into one shared global scope, as script tags do.
// respond(method, route, body) answers each server call with { status, body }. stored is
// what the browser's storage holds before the page loads.
function loadPage(scripts, respond, { stored = {} } = {}) {
  const document = makeDocument();
  const calls = [];
  const storage = new Map(Object.entries(stored));
  const localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  async function fetch(url, options = {}) {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ method, route: String(url), body });
    const answer = (await respond(method, String(url), body)) || {};
    const status = answer.status || 200;
    const data = answer.body === undefined ? {} : answer.body;
    const headers = new Map(Object.entries(answer.headers || { 'content-type': 'application/json' }));
    return {
      ok: status < 400,
      status,
      headers: { get: (name) => headers.get(name.toLowerCase()) || null },
      json: async () => data,
      text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
      blob: async () => ({}),
    };
  }
  const window = {
    document,
    localStorage,
    fetch,
    Event: FakeEvent,
    URL: class extends URL { static createObjectURL() { return 'blob:'; } static revokeObjectURL() {} },
    URLSearchParams,
    location: { search: '', pathname: '/', origin: 'http://localhost', href: 'http://localhost/' },
    history: { replaceState: () => {} },
    navigator: {},
    isSecureContext: false,
    requestAnimationFrame: (fn) => fn(),
    setTimeout: (fn) => { fn(); return 0; },
    setInterval: () => 0,
    clearTimeout: () => {},
    alert: () => {},
    confirm: () => true,
    prompt: () => '',
    console,
    atob: (text) => Buffer.from(text, 'base64').toString('binary'),
    btoa: (text) => Buffer.from(text, 'binary').toString('base64'),
    Intl,
    Date,
    JSON,
    Promise,
    Math,
  };
  window.window = window;
  window.self = window;
  const context = vm.createContext(window);
  for (const name of scripts) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8');
    vm.runInContext(source, context, { filename: name });
  }
  return { window, document, calls, context, run: (code) => vm.runInContext(code, context) };
}

// Lets the page's pending server calls finish.
const settle = async (rounds = 20) => { for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => { setImmediate(resolve); }); };

module.exports = { loadPage, settle, FakeEvent };
