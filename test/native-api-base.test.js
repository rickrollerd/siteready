// The phone app loads its own copy of public/, so every page that calls the server must read the server
// address from <meta name="sitewrite-api">, as the main page does, and the web page (blank content) calls
// the server it was loaded from.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PUBLIC = path.join(__dirname, '..', 'public');
const read = (name) => fs.readFileSync(path.join(PUBLIC, name), 'utf8');
const PAGES = ['admin', 'check', 'hse', 'list', 'review', 'verify', 'sign', 'qf'];
const HELPER = "const API_BASE = (document.querySelector('meta[name=\"sitewrite-api\"]')?.content || '').replace(/\\/+$/, '');";

test('every page that calls the server carries the sitewrite-api meta tag once, blank on the web', () => {
  for (const name of ['index', ...PAGES]) {
    const html = read(`${name}.html`);
    const tags = html.match(/<meta name="sitewrite-api" content="([^"]*)">/g) || [];
    assert.equal(tags.length, 1, `${name}.html has one sitewrite-api meta tag`);
    assert.match(tags[0], /content=""/, `${name}.html leaves it blank for the web`);
  }
});

test('every page script reads the meta tag and sends no request to a bare /api address', () => {
  for (const name of PAGES) {
    const source = read(`${name}.js`);
    assert.ok(source.includes(HELPER), `${name}.js reads the meta tag`);
    assert.ok(source.includes('const apiUrl = (route) => `${API_BASE}${route}`;'), `${name}.js has apiUrl`);
    const raw = source.split('\n').filter((line) => /\bfetch\(\s*['"`]\/api/.test(line) || /\bfetch\(\s*(route|path)\b/.test(line));
    assert.deepEqual(raw, [], `${name}.js: every fetch goes through apiUrl`);
  }
  // sign.js keeps one address for the signing link and builds every request from it.
  assert.match(read('sign.js'), /const api = apiUrl\(`\/api\/sign\//);
  // The QuantityForge tab on the main page, and leftover fetches on the QF page, must use the same helper.
  const tab = read('qf-tab.js');
  assert.ok(tab.includes(HELPER), 'qf-tab.js reads the meta tag');
  assert.ok(tab.includes('const apiUrl = (route) => `${API_BASE}${route}`;'), 'qf-tab.js has apiUrl');
  assert.deepEqual(tab.split('\n').filter((line) => /\bfetch\(\s*['"`]\/api/.test(line)), [], 'qf-tab.js: every fetch goes through apiUrl');
});

// A stand-in for the browser: any element, any property, any method.
function stub() {
  const fn = function () { return stub(); };
  return new Proxy(fn, {
    get(target, key) {
      if (key === Symbol.toPrimitive) return () => '';
      if (key === 'then') return undefined;
      if (key in target && key !== 'length' && key !== 'name') return target[key];
      if (key === 'value' || key === 'textContent' || key === 'innerHTML') return '';
      if (key === 'files') return [];
      return (target[key] = stub());
    },
    set(target, key, value) { target[key] = value; return true; },
    apply() { return stub(); },
  });
}

async function run(file, server, extra = {}) {
  const urls = [];
  const document = stub();
  document.querySelector = (selector) => (selector === 'meta[name="sitewrite-api"]' ? { content: server } : null);
  document.querySelectorAll = () => [];
  document.getElementById = () => stub();
  const fetch = async (url) => { urls.push(String(url)); return { ok: false, status: 401, headers: { get: () => 'application/json' }, json: async () => ({}), text: async () => '' }; };
  const context = vm.createContext({
    document, fetch, console, setTimeout, clearTimeout, URLSearchParams, URL,
    localStorage: { getItem: () => 'session-for-test', setItem() {}, removeItem() {} },
    location: { search: '', pathname: `/${file.replace('.js', '.html')}`, href: '' },
    window: stub(), navigator: stub(), alert() {}, ...extra,
  });
  vm.runInContext(read(file), context);
  await new Promise((resolve) => { setTimeout(resolve, 30); });
  return urls;
}

test('check page: the phone app calls the named server; the web calls its own host', async () => {
  assert.deepEqual(await run('check.js', 'https://app.example.test/'), ['https://app.example.test/api/states', 'https://app.example.test/api/check/keeping']);
  assert.deepEqual(await run('check.js', ''), ['/api/states', '/api/check/keeping']);
});

test('admin page: the phone app calls the named server; the web calls its own host', async () => {
  assert.deepEqual(await run('admin.js', 'https://app.example.test'), ['https://app.example.test/api/admin/stats']);
  assert.deepEqual(await run('admin.js', ''), ['/api/admin/stats']);
});

test('verify page: a reference in the address is checked on the named server', async () => {
  const location = { search: '?ref=SW-ABCD-2345', pathname: '/verify.html', href: '' };
  assert.deepEqual(await run('verify.js', 'https://app.example.test/', { location }), ['https://app.example.test/api/verify/SW-ABCD-2345']);
  assert.deepEqual(await run('verify.js', '', { location }), ['/api/verify/SW-ABCD-2345']);
});
