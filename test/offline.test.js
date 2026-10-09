// Goal 7: a page opened or reloaded with no signal shows SiteReady's own "No signal" page (sw.js
// and offline.html) instead of the browser's error. Only that page is kept, never the server's
// answers; with signal every page comes from the server; a release that changes it replaces the
// kept copy. A worker's sign-on details kept on the phone (sign-keep.js) go after 24 hours.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const { staticFiles, SHELL_MARK } = require('../delivery');

const PUBLIC = path.join(__dirname, '..', 'public');
const read = (name) => fs.readFileSync(path.join(PUBLIC, name), 'utf8');
const HOUR = 60 * 60 * 1000;

// The service worker in a small stand-in for the browser: its kept copies, and a network that is
// up or down.
function worker(source = read('sw.js').split(SHELL_MARK).join('v1'), stored = {}) {
  const listeners = {};
  const net = { up: true, sent: [] };
  const caches = new Map(Object.entries(stored).map(([name, entries]) => [name, new Map(Object.entries(entries))]));
  const store = (name) => ({
    async addAll(requests) { for (const request of requests) { net.sent.push(request.url); caches.get(name).set(request.url, `kept ${request.url}`); } },
    async keys() { return [...caches.get(name).keys()]; },
  });
  const scope = {
    location: { origin: 'https://siteready.example' },
    registration: {},
    clients: { claimed: false, async claim() { scope.clients.claimed = true; } },
    skipWaiting() { scope.skipped = true; },
    addEventListener(type, fn) { listeners[type] = fn; },
    caches: {
      async open(name) { if (!caches.has(name)) caches.set(name, new Map()); return store(name); },
      async keys() { return [...caches.keys()]; },
      async delete(name) { return caches.delete(name); },
      async match(url, { cacheName } = {}) {
        for (const [name, entries] of caches) if ((!cacheName || cacheName === name) && entries.has(url)) return entries.get(url);
        return undefined;
      },
    },
    async fetch(request) {
      net.sent.push(request.url);
      if (!net.up) throw new TypeError('Failed to fetch');
      return `server ${request.url}`;
    },
    Request: class { constructor(url, init) { this.url = url; this.cache = init && init.cache; } },
    Response: { error: () => 'error' },
    URL,
    Promise,
  };
  scope.self = scope;
  vm.createContext(scope);
  vm.runInContext(source, scope, { filename: 'sw.js' });
  const run = async (type, extra = {}) => {
    const waits = [];
    let answer;
    listeners[type]({ ...extra, waitUntil: (p) => waits.push(p), respondWith: (p) => { answer = p; } });
    await Promise.all(waits);
    return answer === undefined ? undefined : answer;
  };
  const open = (url, mode = 'navigate', method = 'GET') => run('fetch', { request: { url: `https://siteready.example${url}`, mode, method } });
  return { scope, net, caches, run, open };
}

test('installing keeps the offline page only, fetched fresh, and takes over at once', async () => {
  const sw = worker();
  await sw.run('install');
  assert.deepEqual([...sw.caches.keys()], ['siteready-shell-v1']);
  assert.deepEqual([...sw.caches.get('siteready-shell-v1').keys()], ['/offline.html']);
  assert.equal(sw.scope.skipped, true);
});

test('with signal a page comes from the server; with none, the offline page at the same address', async () => {
  const sw = worker(undefined, { 'siteready-shell-v1': { '/offline.html': 'offline page' } });
  assert.equal(await sw.open('/sign.html?t=abc'), 'server https://siteready.example/sign.html?t=abc');
  assert.equal(await sw.open('/'), 'server https://siteready.example/');
  sw.net.up = false;
  assert.equal(await sw.open('/sign.html?t=abc'), 'offline page');
  assert.equal(await sw.open('/'), 'offline page');
});

test('the server\'s answers, downloads, scripts and posts are never touched', async () => {
  const sw = worker(undefined, { 'siteready-shell-v1': { '/offline.html': 'offline page' } });
  sw.net.up = false;
  assert.equal(await sw.open('/api/sign/abc'), undefined);
  assert.equal(await sw.open('/api/swms/1/pdf'), undefined);
  assert.equal(await sw.open('/app.js?v=1', 'no-cors'), undefined);
  assert.equal(await sw.open('/api/sign/abc', 'cors', 'POST'), undefined);
  assert.equal(await sw.open('/', 'navigate', 'POST'), undefined);
  assert.equal(sw.net.sent.length, 0);
});

test('a new version removes the old kept copy, and leaves other sites\' caches alone', async () => {
  const sw = worker(read('sw.js').split(SHELL_MARK).join('v2'), {
    'siteready-shell-v1': { '/offline.html': 'old' },
    'something-else': { '/x': 'x' },
  });
  await sw.run('install');
  await sw.run('activate');
  assert.deepEqual([...sw.caches.keys()].sort(), ['siteready-shell-v2', 'something-else']);
  assert.equal(sw.scope.clients.claimed, true);
});

test('the offline page says there is no signal and that typed work is kept, with no script', () => {
  const html = read('offline.html');
  assert.match(html, /<h1>No signal<\/h1>/);
  assert.match(html, /What you typed is kept on this device/);
  assert.match(html, /href="">Try again</);
  assert.match(html, /http-equiv="refresh" content="20"/);
  // The server's content rules allow no inline script, so none is relied on.
  assert.doesNotMatch(html, /<script/);
});

test('the server names the service worker\'s version from itself and the offline page, and a change replaces it', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-shell-'));
  fs.copyFileSync(path.join(PUBLIC, 'sw.js'), path.join(root, 'sw.js'));
  fs.writeFileSync(path.join(root, 'offline.html'), '<h1>No signal</h1>');
  const app = express();
  app.use(staticFiles(root));
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const get = (route) => fetch(`http://127.0.0.1:${server.address().port}${route}`);
  const version = async () => {
    const response = await get('/sw.js');
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    const text = await response.text();
    assert.ok(!text.includes(SHELL_MARK));
    return /const VERSION = '([0-9a-f]{12})'/.exec(text)[1];
  };
  try {
    const first = await version();
    assert.equal(await version(), first);
    fs.writeFileSync(path.join(root, 'offline.html'), '<h1>No signal at all</h1>');
    // A file's change is seen by its size or time on disk.
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(path.join(root, 'offline.html'), later, later);
    const second = await version();
    assert.notEqual(second, first);
  } finally {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// net.js and sign-keep.js in a small page, with storage that lists its keys as a browser's does.
function page(scripts, { stored = {}, serviceWorker = true, capacitor = false } = {}) {
  const data = new Map(Object.entries(stored));
  const localStorage = {
    get length() { return data.size; },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => {
      if (page.full && String(v).length > 200) throw new Error('QuotaExceededError');
      data.set(k, String(v));
    },
    removeItem: (k) => data.delete(k),
  };
  const registered = [];
  const listeners = {};
  const window = {
    document: { currentScript: { dataset: {} }, readyState: 'loading', head: { appendChild() {} }, body: { appendChild() {}, classList: { add() {}, remove() {} } }, createElement: () => ({}) },
    navigator: { onLine: true, ...(serviceWorker ? { serviceWorker: { register: (url, options) => { registered.push({ url, options }); return Promise.resolve(); } } } : {}) },
    localStorage, fetch: async () => ({}), console, Promise, Error, TypeError, String, Object, JSON, Number, Date, Math,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    ...(capacitor ? { Capacitor: {} } : {}),
  };
  window.window = window;
  vm.createContext(window);
  for (const name of scripts) vm.runInContext(read(name), window, { filename: name });
  return { window, data, registered, load: () => (listeners.load || []).forEach((fn) => fn()) };
}

test('pages with net.js register the service worker once loaded, but not in the phone app shell or old browsers', () => {
  const p = page(['net.js']);
  assert.equal(p.registered.length, 0);
  p.load();
  assert.deepEqual(JSON.parse(JSON.stringify(p.registered)), [{ url: '/sw.js', options: { scope: '/', updateViaCache: 'none' } }]);
  const shell = page(['net.js'], { capacitor: true });
  shell.load();
  assert.equal(shell.registered.length, 0);
  const old = page(['net.js'], { serviceWorker: false });
  assert.doesNotThrow(() => old.load());
});

test('every page with net.js removes sign-on details kept for 24 hours or more, and nothing else', () => {
  const now = Date.now();
  const p = page(['net.js'], {
    stored: {
      'siteready.signon.old': JSON.stringify({ kept: now - 25 * HOUR, name: 'Ana Silva' }),
      'siteready.signon.broken': 'not json',
      'siteready.signon.new': JSON.stringify({ kept: now - 2 * HOUR, name: 'Bo Li' }),
      'siteready.unsaved': JSON.stringify({ at: now - 25 * HOUR }),
    },
  });
  assert.deepEqual([...p.data.keys()].sort(), ['siteready.signon.new', 'siteready.unsaved']);
});

test('sign-keep keeps a worker\'s sign-on per link, clears it, and does not use one 24 hours old', () => {
  const p = page(['sign-keep.js']);
  const keep = p.window.siteReadySignKeep;
  const now = Date.now();
  assert.equal(keep.read('abc'), null);
  assert.equal(keep.write('abc', { kept: now, name: 'Ana Silva', readId: 'r1' }), true);
  assert.equal(keep.read('abc').name, 'Ana Silva');
  assert.equal(keep.read('other'), null);
  assert.equal(keep.read('abc', now + 23 * HOUR).name, 'Ana Silva');
  assert.equal(keep.read('abc', now + 24 * HOUR), null);
  assert.equal(p.data.has('siteready.signon.abc'), false, 'removed, not just ignored');
  keep.write('abc', { kept: now, name: 'Ana Silva' });
  keep.clear('abc');
  assert.equal(p.data.size, 0);
});

test('a phone short of space keeps the sign-on without the signature drawing', () => {
  const p = page(['sign-keep.js']);
  page.full = true;
  try {
    const keep = p.window.siteReadySignKeep;
    assert.equal(keep.write('abc', { kept: Date.now(), name: 'Ana', signature: `data:image/png;base64,${'A'.repeat(500)}` }), true);
    assert.equal(keep.read('abc').signature, '');
    assert.equal(keep.read('abc').name, 'Ana');
  } finally {
    page.full = false;
  }
});

test('the sign-on page has the lost-signal bar, keeps what is typed, and a 16 px progress bar on phones', () => {
  const html = read('sign.html');
  const order = ['/net.js', '/sign-keep.js', '/sign.js'].map((src) => html.indexOf(`<script src="${src}"`));
  assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), 'net.js and sign-keep.js load before sign.js');
  assert.match(html, /data-message="No signal\. What you have read and typed is kept on this phone\./);
  const phone = html.slice(html.indexOf('@media (max-width: 640px)'));
  assert.match(phone, /label, \.progress \{ font-size: 16px; \}/);
  assert.match(phone, /#sign-error, \.q \{ scroll-margin-bottom: 128px; \}/);
  const js = read('sign.js');
  assert.match(js, /key,\n\s+\}\),/, 'the sign-on carries its key');
  assert.match(js, /forget\(\);\n\s+\$\('sign-form'\)\.classList\.add\('hidden'\)/, 'cleared once signed on');
});
