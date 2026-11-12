// QuantityForge Measure, review and bill changes wait their turn (D373).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadPage, settle } = require('./fake-dom');

const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8');

const MEASURED = {
  bill: { lines: [] },
  view: { lines: [], currency: 'AUD', total: 0, warnings: [], heldBackGroups: [], notes: [] },
  questions: [],
  profile: 'all',
  reviews: {},
  page: { widthPt: 1, heightPt: 1 },
};

const bootRespond = (held) => async (method, route) => {
  const r = String(route);
  if (r.endsWith('/api/qf/status')) return { body: { enabled: true } };
  if (r.includes('/api/qf/profiles')) return { body: { profiles: [{ id: 'all', label: 'All trades' }] } };
  if (method === 'POST' && r.includes('/api/qf/measure')) {
    await held;
    return { body: MEASURED };
  }
  return { body: {} };
};

async function bootQf(respond) {
  const p = loadPage(['qf.js'], respond, { stored: { 'sitewrite.session': 'token' } });
  for (let i = 0; i < 20; i += 1) {
    await settle();
    const bound = (p.document.getElementById('sheet-form').listeners.get('submit') || []).length;
    if (bound) break;
  }
  p.document.getElementById('qf-file').files = [{ name: 'slab.pdf', size: 100, lastModified: 1 }];
  return p;
}

test('QuantityForge Measure, review and bill changes start only one request at a time', () => {
  const src = read('qf.js');
  assert.match(src, /let measuring = false;/);
  assert.match(src, /if \(measuring\) return;/);
  assert.match(src, /let reviewing = false;/);
  assert.match(src, /if \(!button \|\| !state\.picked \|\| reviewing\) return;/);
  assert.match(src, /let changing = Promise\.resolve\(\);/);
});

test('a second press of Measure is ignored while the first is on its way', async () => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const p = await bootQf(bootRespond(held));
  const form = p.document.getElementById('sheet-form');
  const button = p.document.getElementById('qf-measure');
  form.requestSubmit();
  await settle();
  assert.equal(button.disabled, true, 'the button stays busy while the first request is on its way');
  form.requestSubmit();
  await settle();
  const posts = p.calls.filter((call) => call.method === 'POST' && String(call.route).includes('/api/qf/measure'));
  assert.equal(posts.length, 1, 'the second press is ignored');
  release();
  await settle();
  await settle();
  assert.equal(posts.length, 1);
});

test('Measure again is ignored while a measure is already on its way', async () => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const p = await bootQf(bootRespond(held));
  p.document.getElementById('sheet-form').requestSubmit();
  await settle();
  p.document.getElementById('questions').requestSubmit();
  await settle();
  const posts = p.calls.filter((call) => call.method === 'POST' && String(call.route).includes('/api/qf/measure'));
  assert.equal(posts.length, 1, 'the second form is ignored while the first measure is on its way');
  release();
  await settle();
  await settle();
  assert.equal(posts.length, 1);
});
