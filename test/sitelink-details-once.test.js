// SiteLink site-details Save starts only one request at a time (D372).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadPage, settle } = require('./fake-dom');

const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8');

const PROJECT = {
  project: { id: 'proj-1', name: 'Harbour job' },
  siteDetails: { rev: 1, details: { musterPoint: 'Front gate' }, setBy: 'Sam' },
  fields: [{ key: 'musterPoint', label: 'Muster point' }],
  versions: [],
  team: [],
  log: [],
};
const ME = { me: { name: 'Sam', email: 'sam@example.com', position: 'HSE lead', phone: '' }, orgs: [{ id: 'org-1', name: 'Example Builder', role: 'lead', verified: true }] };

const bootRespond = (held) => async (method, route) => {
  const r = String(route);
  if (r.endsWith('/api/config')) return { body: { accounts: true, inviteOnly: false } };
  if (method === 'GET' && r.endsWith('/api/hse/me')) return { body: ME };
  if (method === 'GET' && r.endsWith('/api/hse/projects/proj-1')) return { body: PROJECT };
  if (method === 'PUT' && r.endsWith('/api/hse/projects/proj-1/site-details')) {
    await held;
    return { body: { message: 'Saved as version 2.' } };
  }
  return { body: {} };
};

async function bootDetails(respond) {
  const p = loadPage(['hse.js'], respond, {
    stored: { 'sitewrite.reviewer': 'token' },
    location: { hash: '#/project/proj-1/details' },
  });
  for (let i = 0; i < 40; i += 1) {
    await settle();
    const bound = (p.document.getElementById('details').listeners.get('submit') || []).length;
    const button = p.document.getElementById('d-save');
    if (bound && button && /Save as version 2/.test(button.textContent || '')) return p;
  }
  assert.fail('the site-details form did not open');
}

test('SiteLink site-details Save starts only one request at a time', () => {
  const src = read('hse.js');
  assert.match(src, /let savingDetails = false;/);
  assert.match(src, /if \(savingDetails \|\| \(button && button\.disabled\)\) return;/);
});

test('a second press of Save on site details is ignored while the first is on its way', async () => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const p = await bootDetails(bootRespond(held));
  const form = p.document.getElementById('details');
  const button = p.document.getElementById('d-save');
  form.requestSubmit();
  await settle();
  assert.equal(button.disabled, true, 'the button stays busy while the first request is on its way');
  form.requestSubmit();
  await settle();
  const puts = p.calls.filter((call) => call.method === 'PUT' && String(call.route) === '/api/hse/projects/proj-1/site-details');
  assert.equal(puts.length, 1, 'the second press is ignored');
  release();
  await settle();
  await settle();
  assert.equal(puts.length, 1);
});
