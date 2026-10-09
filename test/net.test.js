// Goal 7: when a request fails because there is no signal, the page says so plainly, the request
// waits, and Try again (or the signal coming back) sends it again. public/net.js runs here in a
// small stand-in for the browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'net.js'), 'utf8');
const MESSAGE = 'No signal. Your work is kept on this phone; try again when you have signal.';

// A browser whose network answers as the test says: 'down' fails as Chrome does with no signal.
function browser() {
  const net = { mode: 'up', sent: [] };
  const windowListeners = {};
  const made = [];
  function element(tag) {
    const listeners = {};
    const el = {
      tagName: tag.toUpperCase(), className: '', textContent: '', isConnected: false, children: [], attributes: {},
      set innerHTML(html) {
        // The bar's message and its two buttons.
        el.parts = { p: element('p'), retry: element('button'), close: element('button') };
        el.html = html;
      },
      setAttribute(name, value) { el.attributes[name] = value; },
      querySelector(selector) { return selector === 'p' ? el.parts.p : selector === '.net-retry' ? el.parts.retry : selector === '.net-close' ? el.parts.close : null; },
      addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
      click() { (listeners.click || []).forEach((fn) => fn({ target: el })); },
      remove() { el.isConnected = false; },
    };
    made.push(el);
    return el;
  }
  const bodyClasses = new Set();
  const document = {
    currentScript: { dataset: {} },
    head: { appendChild() {} },
    body: { appendChild(child) { child.isConnected = true; }, classList: { add: (name) => bodyClasses.add(name), remove: (name) => bodyClasses.delete(name) } },
    createElement: element,
  };
  async function fetch(url, init) {
    net.sent.push(String(url));
    if (net.mode === 'down') throw new TypeError('Failed to fetch');
    if (net.mode === 'abort') throw Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' });
    return { ok: true, status: 200, url: String(url), init };
  }
  const window = {
    document, fetch, navigator: { onLine: true }, console, Promise, Error, TypeError, String, Object,
    addEventListener(type, fn) { (windowListeners[type] = windowListeners[type] || []).push(fn); },
  };
  window.window = window;
  vm.createContext(window);
  vm.runInContext(SOURCE, window, { filename: 'net.js' });
  const bar = () => made.find((el) => el.className === 'net-bar');
  return {
    window, net, bar, bodyClasses,
    goOnline: () => (windowListeners.online || []).forEach((fn) => fn()),
  };
}

const settle = () => new Promise((resolve) => { setImmediate(resolve); });

test('with signal, requests go as before', async () => {
  const b = browser();
  const response = await b.window.fetch('/api/states');
  assert.equal(response.url, '/api/states');
  assert.equal(b.bar(), undefined, 'no message shown');
});

test('a request with no signal shows the plain message and waits; Try again sends it again', async () => {
  const b = browser();
  b.net.mode = 'down';
  let done = null;
  b.window.fetch('/api/draft', { method: 'POST', body: '{"task":"x"}' }).then((response) => { done = response; });
  await settle();
  const bar = b.bar();
  assert.ok(bar && bar.isConnected, 'the message is shown');
  assert.equal(bar.parts.p.textContent, MESSAGE);
  assert.equal(bar.attributes.role, 'alert');
  assert.equal(done, null, 'the request waits');
  assert.ok(b.bodyClasses.has('net-waiting'));
  // Still no signal: it waits again.
  bar.parts.retry.click();
  await settle();
  assert.equal(done, null);
  assert.ok(bar.isConnected);
  // Signal back: Try again sends the same request and the page carries on.
  b.net.mode = 'up';
  bar.parts.retry.click();
  await settle();
  assert.equal(done.url, '/api/draft');
  assert.equal(done.init.body, '{"task":"x"}', 'the same request is sent');
  assert.equal(bar.isConnected, false, 'the message goes');
  assert.equal(b.bodyClasses.has('net-waiting'), false);
});

test('the signal coming back sends the waiting requests by itself', async () => {
  const b = browser();
  b.net.mode = 'down';
  const answers = [];
  b.window.fetch('/api/swms').then((response) => answers.push(response.url));
  b.window.fetch('/api/sites').then((response) => answers.push(response.url));
  await settle();
  b.net.mode = 'up';
  b.goOnline();
  await settle();
  assert.deepEqual(answers.sort(), ['/api/sites', '/api/swms']);
});

test('Close gives up: the page gets the plain message, not "Failed to fetch"', async () => {
  const b = browser();
  b.net.mode = 'down';
  const failed = b.window.fetch('/api/draft/questions', { method: 'POST' }).catch((error) => error);
  await settle();
  b.bar().parts.close.click();
  const error = await failed;
  assert.equal(error.message, MESSAGE);
  assert.equal(error.noSignal, true);
  assert.equal(b.bar().isConnected, false);
});

test('look-ups made while typing do not wait or show the message', async () => {
  const b = browser();
  b.net.mode = 'down';
  for (const route of ['/api/address?q=12%20Smith', '/api/steps/search?q=core', '/api/abn?abn=1']) {
    const error = await b.window.fetch(route).catch((e) => e);
    assert.equal(error.message, MESSAGE, route);
  }
  assert.equal(b.bar(), undefined);
});

test('other failures are left to the page as before', async () => {
  const b = browser();
  b.net.mode = 'abort';
  const error = await b.window.fetch('/api/draft').catch((e) => e);
  assert.equal(error.name, 'AbortError');
  assert.equal(b.bar(), undefined);
  assert.equal(b.window.siteReadyNet.noSignal(new TypeError("Failed to execute 'fetch': Invalid name")), false);
  // Safari and Firefox word a lost connection their own way.
  assert.equal(b.window.siteReadyNet.noSignal(new TypeError('Load failed')), true);
  assert.equal(b.window.siteReadyNet.noSignal(new TypeError('NetworkError when attempting to fetch resource.')), true);
});
