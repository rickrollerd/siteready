// SiteLink account settings Save starts only one request at a time (D371).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadPage, settle, FakeEvent } = require('./fake-dom');

const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8');

const ORG = {
  id: 'org-1',
  name: 'Example Builder',
  role: 'lead',
  verified: true,
  abn: '51824753556',
  abnShown: '51 824 753 556',
  abnNote: '',
  support: '',
  abnCheck: 'match',
};
const TEAM = [{ id: 'u-1', name: 'Sam', email: 'sam@example.com', role: 'lead', joined: true }];
const ME = { me: { name: 'Sam', email: 'sam@example.com', position: 'HSE lead', phone: '' }, orgs: [{ id: 'org-1', name: 'Example Builder', role: 'lead', verified: true }] };

const bootRespond = (held) => async (method, route) => {
  const r = String(route);
  if (r.endsWith('/api/config')) return { body: { accounts: true, inviteOnly: false } };
  if (method === 'GET' && r.endsWith('/api/hse/me')) return { body: ME };
  if (method === 'GET' && r.endsWith('/api/hse/orgs/org-1')) return { body: { org: ORG, team: TEAM } };
  if (method === 'PUT' && r.endsWith('/api/hse/orgs/org-1')) {
    await held;
    return { body: { org: ORG, team: TEAM, message: 'Saved.' } };
  }
  return { body: {} };
};

async function bootSettings(respond) {
  const p = loadPage(['hse.js'], respond, {
    stored: { 'sitewrite.reviewer': 'token' },
    location: { hash: '#/account/org-1' },
  });
  for (let i = 0; i < 40; i += 1) {
    await settle();
    if ((p.document.getElementById('account').innerHTML || '').includes('id="acct-form"')) return p;
  }
  assert.fail('the account settings form did not open');
}

function submitSave(p) {
  const form = p.document.getElementById('acct-form');
  form.id = 'acct-form';
  const event = new FakeEvent('submit', { bubbles: true });
  event.target = form;
  p.document.getElementById('account').dispatchEvent(event);
}

test('SiteLink account settings Save starts only one request at a time', () => {
  const src = read('hse.js');
  assert.match(src, /let savingAccount = false;/);
  assert.match(src, /if \(savingAccount\) return;/);
  assert.match(src, /if \(button && button\.disabled\) return;/);
});

test('a second press of Save on account settings is ignored while the first is on its way', async () => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const p = await bootSettings(bootRespond(held));
  p.document.getElementById('acct-name').value = 'Example Builder';
  const button = p.document.getElementById('acct-save');
  submitSave(p);
  await settle();
  assert.equal(button.disabled, true, 'the button stays busy while the first request is on its way');
  submitSave(p);
  await settle();
  const puts = p.calls.filter((call) => call.method === 'PUT' && String(call.route) === '/api/hse/orgs/org-1');
  assert.equal(puts.length, 1, 'the second press is ignored');
  release();
  await settle();
  await settle();
});
