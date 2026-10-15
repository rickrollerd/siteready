// The app's name is SiteWrite (owner D294, D295, D299). What a browser kept under the old SiteReady
// names is moved once to the new names before any page script reads it, so no one is signed out and
// no work is lost; each page loads that script first; the app's name, icons and new references are
// SiteWrite's.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUBLIC = path.join(__dirname, '../public');
const read = (name) => fs.readFileSync(path.join(PUBLIC, name), 'utf8');

// A browser's storage, with the length and key() the script walks.
function storage(initial = {}, { full = false } = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get length() { return data.size; },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { if (full) throw new Error('QuotaExceededError'); data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
  };
}
const run = (store) => vm.runInNewContext(read('old-keys.js'), { window: { localStorage: store } });

test('the sign-in and work kept under the old names move to the new names', () => {
  const store = storage({
    'siteready.session': 'token-1',
    'siteready.unsaved': '{"at":1,"input":{"task":"Dig a trench"}}',
    'siteready.project': '{"items":[]}',
    'siteready-scope-reading': '{"id":"r1"}',
    'siteready-reviewer': 'Sam Lee',
    'siteready.signon.abc': '{"name":"Ana"}',
    'siteready.review.SR-ABCD-2345': '{"text":"draft"}',
    'something.else': 'kept',
  });
  run(store);
  assert.deepEqual(Object.fromEntries(store.data), {
    'sitewrite.session': 'token-1',
    'sitewrite.unsaved': '{"at":1,"input":{"task":"Dig a trench"}}',
    'sitewrite.project': '{"items":[]}',
    'sitewrite-scope-reading': '{"id":"r1"}',
    'sitewrite-reviewer': 'Sam Lee',
    'sitewrite.signon.abc': '{"name":"Ana"}',
    'sitewrite.review.SR-ABCD-2345': '{"text":"draft"}',
    'something.else': 'kept',
  });
  // Run again (every page load): nothing changes.
  run(store);
  assert.equal(store.data.get('sitewrite.session'), 'token-1');
});

test('a key already kept under the new name is not overwritten, and full or blocked storage loses nothing', () => {
  const both = storage({ 'siteready.session': 'old', 'sitewrite.session': 'new' });
  run(both);
  assert.deepEqual(Object.fromEntries(both.data), { 'sitewrite.session': 'new' });
  const full = storage({ 'siteready.unsaved': 'work' }, { full: true });
  run(full);
  assert.deepEqual(Object.fromEntries(full.data), { 'siteready.unsaved': 'work' }, 'the old key stays where it could not be moved');
  assert.doesNotThrow(() => vm.runInNewContext(read('old-keys.js'), { window: { get localStorage() { throw new Error('SecurityError'); } } }));
});

test('every page that keeps anything in the browser loads the move first', () => {
  for (const page of ['index.html', 'check.html', 'review.html', 'sign.html', 'admin.html']) {
    const scripts = [...read(page).matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(scripts[0], '/old-keys.js', page);
  }
});

test('the app is named SiteWrite, its icons say SW, and new references start SW-', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.name, 'SiteWrite');
  assert.equal(manifest.short_name, 'SiteWrite');
  assert.match(read('index.html'), /<title>[^<]*SiteWrite/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(__dirname, '../capacitor.config.json'), 'utf8')).appName, 'SiteWrite');
  const { newRef, REF_PATTERN } = require('../refs');
  for (let i = 0; i < 20; i += 1) assert.match(newRef(), /^SW-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  assert.ok(REF_PATTERN.test('SR-ABCD-2345'), 'an old reference is still a reference');
  assert.ok(!REF_PATTERN.test('SX-ABCD-2345'));
});
