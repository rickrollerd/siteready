// A saved SWMS's Copy or Delete starts only one request at a time (D369).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { prepareDraft } = require('../draft');
const { draftBody } = require('../input');
const { loadPage, settle, FakeEvent } = require('./fake-dom');

const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8');

const INPUT = { state: 'qld', task: 'Replace a 3m length of timber fence along the site boundary.', fallRisk: 'no', workplace: '12 Wattle Road, Hamilton QLD 4007' };
const SAVED = {
  swms: { id: 'saved-once', title: 'Fence repair', revision: 1, revisedAt: '2026-11-12', lastReviewedAt: '2026-11-12', reviewDueAt: '2027-02-12', reviewedBy: 'Sam', signonPath: '/sign.html?t=x' },
  input: INPUT, draft: prepareDraft(draftBody(INPUT)), signons: [], revisions: [], update: { available: false, changes: [] },
};

async function openSaved(respond) {
  const p = loadPage(['gate-rules.js', 'app.js', 'account.js'], respond, { stored: { 'sitewrite.session': 'token' } });
  for (let i = 0; i < 8; i += 1) await settle();
  const open = new FakeEvent('click', { bubbles: true });
  open.target = { closest: (selector) => (selector === '[data-swms]' ? { dataset: { swms: 'saved-once' } } : null) };
  p.document.getElementById('swms-list').dispatchEvent(open);
  for (let i = 0; i < 12; i += 1) {
    await settle();
    if ((p.document.getElementById('result').innerHTML || '').includes('id="saved-copy"')) break;
  }
  assert.match(p.document.getElementById('result').innerHTML || '', /id="saved-copy"/, 'the saved SWMS is on the page');
  return p;
}

const baseRespond = (heldRoute, held) => async (method, route) => {
  if (route === '/api/config') return { body: { accounts: true, trialDays: 14 } };
  if (route === '/api/me') return { body: { user: { email: 'a@b.example', name: 'Sam' }, company: { name: 'Example Crew', abn: '1', hasAccess: true, planStatus: 'active' } } };
  if (route === '/api/sites' || (method === 'GET' && route === '/api/swms')) return { body: { sites: [], swms: [] } };
  if (route === '/api/steps') return { body: { groups: [] } };
  if (method === 'GET' && route === '/api/swms/saved-once') return { body: SAVED };
  if (route === '/api/swms/saved-once/qr.svg') return { body: '<svg></svg>', headers: { 'content-type': 'image/svg+xml' } };
  if (method === 'POST' && String(route) === heldRoute) {
    await held;
    return { body: { swms: { id: 'saved-copy', title: 'Fence repair (copy)', revision: 1 } } };
  }
  if (method === 'DELETE' && String(route) === heldRoute) {
    await held;
    return { body: { ok: true } };
  }
  return { body: {} };
};

test('a saved SWMS ignores a second Copy or Delete while one is already on its way', () => {
  const src = read('account.js');
  assert.match(src, /let acting = false;/);
  assert.match(src, /if \(acting\) return;/);
  assert.match(src, /acting = true;/);
});

test('a second press of Copy for another job is ignored while the first is on its way', async () => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const p = await openSaved(baseRespond('/api/swms/saved-once/copy', held));
  p.window.SiteWrite.humanCheck.value = () => ({ check: { parts: {}, partHashes: {}, name: 'Sam Lee', role: 'Supervisor', ack: true } });
  p.document.getElementById('saved-copy').click();
  await settle();
  p.document.getElementById('saved-copy').click();
  await settle();
  const posts = p.calls.filter((call) => call.method === 'POST' && String(call.route) === '/api/swms/saved-once/copy');
  assert.equal(posts.length, 1, 'the second press is ignored');
  release();
  await settle();
  await settle();
  assert.equal(posts.length, 1);
});

test('a second press of Delete is ignored while the first is on its way', async () => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const p = await openSaved(baseRespond('/api/swms/saved-once', held));
  p.document.getElementById('saved-delete').click();
  await settle();
  p.document.getElementById('saved-delete').click();
  await settle();
  const deletes = p.calls.filter((call) => call.method === 'DELETE' && String(call.route) === '/api/swms/saved-once');
  assert.equal(deletes.length, 1, 'the second press is ignored');
  release();
  await settle();
  await settle();
  assert.equal(deletes.length, 1);
});
