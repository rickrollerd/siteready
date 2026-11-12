// Admin delete and invite actions start only one request at a time (D370).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadPage, settle, FakeEvent } = require('./fake-dom');

const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8');

const COMPANY = {
  company: { id: 'co-1', name: 'Example Crew', abn: '11 111 111 111', address: '', phone: '', email: '', createdAt: '2026-01-01' },
  plan: { status: 'trial', trialEndsAt: '2026-12-01' },
  users: [],
  trialAbn: null,
  downloadsByMonth: [],
  refs: [],
  signins: { days: 30, total: 0, devices: 0, networks: 0, users: [] },
};

const CHECKED = {
  id: 'cs-1',
  fileName: 'fence.pdf',
  keptAt: '2026-11-12T08:00:00.000Z',
  lastCheckedAt: '2026-11-12T08:00:00.000Z',
  checks: 1,
  score: 80,
  band: 'Accepted',
  state: 'qld',
  trade: 'fence',
  storage: 'database',
  bytes: 1024,
  uploaders: [],
  learning: { organisationKnown: false, text: '' },
  result: { findings: [] },
  lines: [],
  text: '',
};

const bootRespond = (heldRoute, held) => async (method, route) => {
  const r = String(route);
  if (r.endsWith('/api/admin/stats')) {
    return { body: { companies: 1, newCompanies: { days7: 0 }, plans: { trial: 0, trialEnded: 0, active: 0, past_due: 0, canceled: 0 }, monthlyRevenue: 0, actions: { days30: {}, days7: {} }, unusualSignins: [], errors: [] } };
  }
  if (r.includes('/api/admin/control-learning/report')) return { status: 400, body: { message: 'Not available.' } };
  if (r.endsWith('/api/admin/warnings')) return { body: { warnings: [] } };
  if (r.endsWith('/api/admin/ai-readings')) return { body: { readings: [] } };
  if (r.endsWith('/api/admin/checked-swms/status')) return { body: { keeping: false, total: 0 } };
  if (method === 'GET' && r.endsWith('/api/admin/invites')) return { body: { invites: [] } };
  if (r.endsWith('/api/admin/access-log')) return { body: { entries: [] } };
  if (method === 'GET' && r.endsWith('/api/admin/checked-swms/cs-1')) return { body: CHECKED };
  if (method === 'GET' && r.endsWith('/api/admin/checked-swms')) return { body: { documents: [] } };
  if (method === 'GET' && r.endsWith('/api/admin/companies/co-1')) return { body: COMPANY };
  if (method === 'POST' && r === heldRoute) {
    await held;
    return { body: { ok: true, code: 'invite-code', link: 'http://localhost/?invite=invite-code', deletedAt: '2026-11-12T08:00:00.000Z', id: 'co-1' } };
  }
  return { body: {} };
};

async function bootAdmin(respond, { location } = {}) {
  const p = loadPage(['admin.js'], respond, { stored: { 'sitewrite.session': 'token' }, location });
  for (let i = 0; i < 40; i += 1) {
    await settle();
    const bound = (p.document.getElementById('invite-form').listeners.get('submit') || []).length;
    if (bound) return p;
  }
  assert.fail('the admin page did not finish loading');
}

test('admin delete and invite forms start only one request at a time', () => {
  const src = read('admin.js');
  const html = read('admin.html');
  assert.match(src, /let deleting = false;/);
  assert.match(src, /if \(deleting\) return;/);
  assert.match(src, /let deletingChecked = false;/);
  assert.match(src, /if \(deletingChecked\) return;/);
  assert.match(src, /let creatingInvite = false;/);
  assert.match(src, /if \(creatingInvite\) return;/);
  assert.match(src, /if \(button\.disabled\) return;/);
  assert.match(html, /id="invite-go"/);
  assert.match(src, /id="delete-go"/);
  assert.match(src, /id="checked-delete-go"/);
});

test('a second press of Create invite is ignored while the first is on its way', async () => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const p = await bootAdmin(bootRespond('/api/admin/invites', held));
  const form = p.document.getElementById('invite-form');
  const button = p.document.getElementById('invite-go');
  form.requestSubmit();
  await settle();
  assert.equal(button.disabled, true, 'the button stays busy while the first request is on its way');
  form.requestSubmit();
  await settle();
  const posts = p.calls.filter((call) => call.method === 'POST' && String(call.route) === '/api/admin/invites');
  assert.equal(posts.length, 1, 'the second press is ignored');
  release();
  await settle();
  await settle();
  assert.equal(button.disabled, false, 'the button is free again once the invite has been created');
});

test('a second press of Delete this business is ignored while the first is on its way', async () => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const p = await bootAdmin(bootRespond('/api/admin/companies/co-1/delete', held), { location: { hash: '#account=co-1' } });
  for (let i = 0; i < 20; i += 1) {
    await settle();
    if ((p.document.getElementById('account-detail').innerHTML || '').includes('id="delete-form"')) break;
  }
  assert.match(p.document.getElementById('account-detail').innerHTML || '', /id="delete-form"/, 'the account is open');
  p.document.getElementById('delete-confirm').value = 'Example Crew';
  const form = p.document.getElementById('delete-form');
  const button = p.document.getElementById('delete-go');
  form.requestSubmit();
  await settle();
  assert.equal(button.disabled, true, 'the button stays busy while the first request is on its way');
  form.requestSubmit();
  await settle();
  const posts = p.calls.filter((call) => call.method === 'POST' && String(call.route) === '/api/admin/companies/co-1/delete');
  assert.equal(posts.length, 1, 'the second press is ignored');
  release();
  await settle();
  await settle();
});

test('a second press of Delete this SWMS is ignored while the first is on its way', async () => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const p = await bootAdmin(bootRespond('/api/admin/checked-swms/cs-1/delete', held));
  const open = new FakeEvent('click', { bubbles: true });
  open.target = { closest: (selector) => (selector === 'a[data-checked]' ? { dataset: { checked: 'cs-1' } } : null) };
  p.document.getElementById('checked').dispatchEvent(open);
  for (let i = 0; i < 20; i += 1) {
    await settle();
    if ((p.document.getElementById('checked-detail').innerHTML || '').includes('id="checked-delete"')) break;
  }
  assert.match(p.document.getElementById('checked-detail').innerHTML || '', /id="checked-delete"/, 'the kept SWMS is open');
  const form = p.document.getElementById('checked-delete');
  const button = p.document.getElementById('checked-delete-go');
  form.requestSubmit();
  await settle();
  assert.equal(button.disabled, true, 'the button stays busy while the first request is on its way');
  form.requestSubmit();
  await settle();
  const posts = p.calls.filter((call) => call.method === 'POST' && String(call.route) === '/api/admin/checked-swms/cs-1/delete');
  assert.equal(posts.length, 1, 'the second press is ignored');
  release();
  await settle();
  await settle();
});
