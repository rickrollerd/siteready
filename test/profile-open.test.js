// The company profile is open in the HTML for a first visit, so LCP is not held for app.js (D364).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { app } = require('../server');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'profile-open.js'), 'utf8');

function run(stored) {
  const el = { open: true };
  const storage = new Map(Object.entries(stored));
  const window = {
    document: { getElementById: (id) => (id === 'profile' ? el : null) },
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    },
  };
  window.window = window;
  vm.runInNewContext(source, window, { filename: 'profile-open.js' });
  return el;
}

test('the company profile is open in the HTML, with the early close script', () => {
  assert.match(html, /<details class="panel" id="profile" open>/);
  assert.match(html, /<details class="panel" id="profile" open>/);
  assert.match(html, /<\/details>\s*<script src="\/old-keys\.js"><\/script>\s*<script src="\/profile-open\.js"><\/script>/);
  const first = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(first[0], '/old-keys.js');
  assert.equal(first[1], '/profile-open.js');
});

test('a first visit keeps the profile open, a saved company name closes it', () => {
  assert.equal(run({}).open, true);
  assert.equal(run({ 'sitewrite.profile': '{' }).open, true, 'bad JSON leaves it open');
  assert.equal(run({ 'sitewrite.profile': JSON.stringify({ name: 'Example Build Pty Ltd' }) }).open, false);
  assert.equal(run({ 'sitewrite.profile': JSON.stringify({ abn: '51824753556' }) }).open, true, 'a name is required');
});

test('the served home page still includes the early script after fingerprinting', async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /<details class="panel" id="profile" open>/);
    assert.match(body, /<script src="\/profile-open\.js\?v=[a-f0-9]+"><\/script>/);
  } finally {
    server.close();
  }
});
