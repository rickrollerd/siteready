// SiteLink decisions the owner accepted (D307, D311), built after the stage 3, 4, 5 and round 6 builds:
// only a verified account sends list emails; the register's name is said, not offered, at set-up; a
// second account for an ABN can ask that account's lead, or tell SiteWrite; a lead handover emails the
// new lead and the old. Made-up companies, people and sites only.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.RATE_LIMIT_HSE_REQUESTS = '5000';
process.env.RATE_LIMIT_MAX_REQUESTS = '5000';
process.env.RATE_LIMIT_LIST_SENDS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const db = require('../db');
const send = require('../sitelink-send');
const abnRegister = require('../abn');
const { validAbn } = require('../accounts');
const { setupAccounts, mailbox } = require('./helpers');

// The ABN register as these tests set it: an ABN not listed is answered as when the lookup is not set up.
const register = new Map();
abnRegister.lookupAbn = async (raw) => register.get(String(raw || '').replace(/\D/g, '')) || { enabled: false };
const listed = (entityName) => ({ enabled: true, found: true, active: true, status: 'Active', entityName, businessNames: [] });
let abnSeed = 63100200000;
function nextAbn() {
  for (abnSeed += 89; ; abnSeed += 1) if (validAbn(String(abnSeed))) return String(abnSeed);
}

let server;
let base;
test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  server.keepAliveTimeout = 120000;
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

async function call(method, route, { body, reviewer } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(reviewer ? { 'X-Reviewer-Token': reviewer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

async function signIn(email, name = 'Dana Whitfield') {
  assert.equal((await call('POST', '/api/hse/email', { body: { email } })).status, 200);
  const text = [...mailbox].reverse().find((item) => item.to === email).text;
  const token = /\/sitelink\?login=([A-Za-z0-9_-]+)/.exec(text)[1];
  const { data } = await call('POST', '/api/hse/verify', { body: { token } });
  if (name) assert.equal((await call('PUT', '/api/hse/me', { reviewer: data.token, body: { name, position: 'HSE manager', phone: '0412 555 012' } })).status, 200);
  return data.token;
}

function inDays(days) {
  const day = new Date(`${send.todayIn('qld')}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

// An account (Unverified: the register is not set up here), a project with site details, and a
// subcontract with one SWMS on its list.
async function builder(leadEmail, subEmail, orgName = 'Corbel Build Pty Ltd') {
  const lead = await signIn(leadEmail);
  const org = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: orgName, abn: nextAbn() } });
  assert.equal(org.status, 201, JSON.stringify(org.data));
  const project = await call('POST', `/api/hse/orgs/${org.data.org.id}/projects`, { reviewer: lead, body: { name: 'Northgate Health Hub', workplace: '12 Wattle Road, Hamilton QLD 4007', state: 'qld' } });
  const projectId = project.data.project.id;
  await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 0, details: { musterPoint: 'Assembly area A at the Wattle Road gate' } } });
  const added = await call('POST', `/api/hse/projects/${projectId}/subcontracts`, { reviewer: lead, body: { name: 'Tallow Formwork Pty Ltd', trade: 'Formwork', email: subEmail } });
  const subId = added.data.subcontract.id;
  assert.equal((await call('POST', `/api/hse/subcontracts/${subId}/items`, { reviewer: lead, body: { title: 'Formwork to suspended slabs', task: 'Form up, pour and strip the suspended slabs on levels 1 to 4.' } })).status, 201);
  return { lead, orgId: org.data.org.id, projectId, subId, added: added.data };
}

// ---- Only verified accounts send list emails (D311, stage 5 decision 2) ----

test('an Unverified account cannot send or remind: the card says why and links to Account settings; once verified, it sends', async () => {
  const b = await builder('dana@unverified-send.example', 'office@unverified-sub.example');
  // The card says so before anything is pressed.
  const blocked = b.added.sending.blocked;
  assert.ok(blocked, 'the send card is blocked');
  assert.equal(blocked.orgId, b.orgId);
  assert.equal(blocked.message, 'Corbel Build Pty Ltd shows Unverified, so SiteLink cannot send its lists yet. Only an account whose ABN matches the ABN register can email subcontractors. The lead can check the register again in Account settings, or contact SiteWrite at sitereadyaus@gmail.com.');
  // Checking or sending the email is refused by the server too, and nothing goes.
  const before = mailbox.length;
  const preview = await call('POST', `/api/hse/subcontracts/${b.subId}/send/preview`, { reviewer: b.lead, body: { due: inDays(14) } });
  assert.equal(preview.status, 403);
  assert.equal(preview.data.unverified, true);
  assert.equal(preview.data.message, blocked.message);
  const sent = await call('POST', `/api/hse/subcontracts/${b.subId}/send`, { reviewer: b.lead, body: { due: inDays(14), check: 'x' } });
  assert.equal(sent.status, 403);
  assert.equal((await call('POST', `/api/hse/subcontracts/${b.subId}/remind/preview`, { reviewer: b.lead })).status, 403);
  assert.equal(mailbox.length, before);
  assert.equal(Number((await db.one('SELECT COUNT(*) AS n FROM list_links WHERE subcontract_id = $1', [b.subId])).n), 0);
  // Verified by the register: the card is open, and the list goes.
  const abn = (await db.one('SELECT abn FROM orgs WHERE id = $1', [b.orgId])).abn;
  register.set(abn, listed('CORBEL BUILD PTY LTD'));
  const checked = await call('POST', `/api/hse/orgs/${b.orgId}/abn-check`, { reviewer: b.lead });
  assert.equal(checked.data.org.verified, true);
  const page = await call('GET', `/api/hse/subcontracts/${b.subId}`, { reviewer: b.lead });
  assert.equal(page.data.sending.blocked, null);
  const ok = await call('POST', `/api/hse/subcontracts/${b.subId}/send/preview`, { reviewer: b.lead, body: { due: inDays(14) } });
  assert.equal(ok.status, 200);
  const done = await call('POST', `/api/hse/subcontracts/${b.subId}/send`, { reviewer: b.lead, body: { due: inDays(14), check: ok.data.preview.check } });
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.ok(mailbox.some((item) => item.to === 'office@unverified-sub.example' && /SWMS required for Northgate Health Hub/.test(item.subject)));
  // An account that later shows Unverified again (a new name not on the register) stops sending.
  await call('PUT', `/api/hse/orgs/${b.orgId}`, { reviewer: b.lead, body: { name: 'Corbel Group' } });
  const again = await call('POST', `/api/hse/subcontracts/${b.subId}/remind/preview`, { reviewer: b.lead });
  assert.equal(again.status, 403);
  // The list page still says the builder is Unverified.
  const token = /\/list\.html\?t=([A-Za-z0-9_-]+)/.exec(mailbox.filter((item) => item.to === 'office@unverified-sub.example').pop().text)[1];
  assert.equal((await call('GET', `/api/list/${token}`)).data.builder.verified, false);
});

test('with the staging test hooks on, a test address may send to a test address from an Unverified account, and to no one else', async () => {
  const before = process.env.TEST_HOOKS_SECRET;
  process.env.TEST_HOOKS_SECRET = 't'.repeat(40);
  try {
    const b = await builder('lead-rec7@siteready.test', 'office-rec7@siteready.test', 'Test Builders Pty Ltd');
    assert.equal(b.added.sending.blocked, null);
    const preview = await call('POST', `/api/hse/subcontracts/${b.subId}/send/preview`, { reviewer: b.lead, body: { due: inDays(10) } });
    assert.equal(preview.status, 200, JSON.stringify(preview.data));
    // To a real address it is refused, as in production.
    await call('PUT', `/api/hse/subcontracts/${b.subId}`, { reviewer: b.lead, body: { name: 'Tallow Formwork Pty Ltd', trade: 'Formwork', email: 'office@real-sub.example' } });
    assert.equal((await call('POST', `/api/hse/subcontracts/${b.subId}/send/preview`, { reviewer: b.lead, body: { due: inDays(10) } })).status, 403);
    // A real address that leads an Unverified account cannot send to a test address either.
    const real = await builder('dana@real-lead.example', 'office-rec7b@siteready.test', 'Real Builders Pty Ltd');
    assert.ok(real.added.sending.blocked);
    assert.equal((await call('POST', `/api/hse/subcontracts/${real.subId}/send/preview`, { reviewer: real.lead, body: { due: inDays(10) } })).status, 403);
  } finally {
    if (before === undefined) delete process.env.TEST_HOOKS_SECRET; else process.env.TEST_HOOKS_SECRET = before;
  }
  // Hooks off: the test address is refused like any other.
  const off = await builder('lead-rec7c@siteready.test', 'office-rec7c@siteready.test', 'Off Builders Pty Ltd');
  assert.ok(off.added.sending.blocked);
});

// ---- Set-up: the register's name said, not offered (sl6 decision 5) ----

test('at set-up, a register name that differs is said with the contact address, and there is no one-click rename', async () => {
  const lead = await signIn('dana@register-name.example');
  const abn = nextAbn();
  register.set(abn, listed('MARLIN CONSTRUCTIONS PTY LTD'));
  const asked = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Corbel Build Pty Ltd', abn } });
  assert.equal(asked.status, 409);
  assert.equal(asked.data.message, `The ABN register lists ABN ${abn.slice(0, 2)} ${abn.slice(2, 5)} ${abn.slice(5, 8)} ${abn.slice(8)} under Marlin Constructions Pty Ltd, not Corbel Build Pty Ltd. Check the ABN. If this account is for Marlin Constructions Pty Ltd, contact SiteWrite at sitereadyaus@gmail.com to have it checked.`);
  assert.equal(asked.data.support, 'sitereadyaus@gmail.com');
  assert.equal(Number((await db.one('SELECT COUNT(*) AS n FROM orgs WHERE abn = $1', [abn])).n), 0, 'nothing is set up');
  // Keeping their own name sets it up Unverified.
  const kept = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Corbel Build Pty Ltd', abn, keepName: true } });
  assert.equal(kept.status, 201);
  assert.equal(kept.data.org.verified, false);
  // The page offers no "Use {name}" button at set-up any more.
  const page = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'hse.js'), 'utf8');
  assert.doesNotMatch(page, /setup-use/);
  assert.doesNotMatch(page, />Use \$\{esc\(error\.register\.name\)\}</);
});

// ---- A second account for an ABN: ask the lead, or tell SiteWrite (stage 3 decisions 3 and 4) ----

test('a second account for an ABN is refused with the contact address; "Ask the lead for me" emails the lead and names no one back', async () => {
  const first = await signIn('lead@kestrel-group.example', 'Robin Hale');
  const abn = nextAbn();
  const org = await call('POST', '/api/hse/orgs', { reviewer: first, body: { name: 'Kestrel Group Pty Ltd', abn } });
  assert.equal(org.status, 201);
  // A project made first, so the account's log entries show on it.
  const project = await call('POST', `/api/hse/orgs/${org.data.org.id}/projects`, { reviewer: first, body: { name: 'Harbour Lane', workplace: '3 Harbour Lane, Hamilton QLD 4007', state: 'qld' } });
  const second = await signIn('ash@kestrel-group.example', 'Ash Kim');
  const refused = await call('POST', '/api/hse/orgs', { reviewer: second, body: { name: 'Kestrel Group', abn } });
  assert.equal(refused.status, 409);
  assert.equal(refused.data.taken, true);
  assert.equal(refused.data.support, 'sitereadyaus@gmail.com');
  assert.doesNotMatch(refused.data.message, /Kestrel|Robin|lead@/);
  // Ask the lead for me.
  const before = mailbox.length;
  const asked = await call('POST', '/api/hse/ask-lead', { reviewer: second, body: { abn: `${abn.slice(0, 2)} ${abn.slice(2)}` } });
  assert.equal(asked.status, 200, JSON.stringify(asked.data));
  assert.equal(asked.data.message, 'SiteLink has emailed that account\'s lead your name and email, and asked them to add you to the team. When they have, sign in again with this email to see the account.');
  assert.doesNotMatch(JSON.stringify(asked.data), /Kestrel|Robin|lead@kestrel/);
  const mail = mailbox.slice(before);
  assert.equal(mail.length, 1);
  assert.equal(mail[0].to, 'lead@kestrel-group.example');
  assert.equal(mail[0].subject, 'Ash Kim asks to join Kestrel Group Pty Ltd on SiteLink');
  assert.equal(mail[0].replyTo, 'ash@kestrel-group.example');
  assert.match(mail[0].text, /^Ash Kim \(ash@kestrel-group\.example\) tried to set up a SiteLink account with Kestrel Group Pty Ltd's ABN, \d\d \d\d\d \d\d\d \d\d\d, and asked to be added to your team instead\./);
  assert.match(mail[0].text, /open Team and add ash@kestrel-group\.example/);
  assert.match(mail[0].text, /SiteLink has not told them who you are\./);
  // The lead sees it in the account's log on each project.
  const log = (await call('GET', `/api/hse/projects/${project.data.project.id}`, { reviewer: first })).data.log;
  assert.ok(log.some((entry) => entry.text === 'Ash Kim (ash@kestrel-group.example) asked to be added to the team, after trying to set up a second account with its ABN.'));
  // Asking again the same day sends nothing more.
  const again = await call('POST', '/api/hse/ask-lead', { reviewer: second, body: { abn } });
  assert.equal(again.status, 200);
  assert.match(again.data.message, /^You asked in the last day\./);
  assert.equal(mailbox.length, before + 1);
  // At most five people a day ask one account's lead.
  for (let i = 0; i < 4; i += 1) assert.equal((await call('POST', '/api/hse/ask-lead', { reviewer: await signIn(`p${i}@kestrel-ask.example`, `Pat Moore${'e'.repeat(i)}`), body: { abn } })).status, 200);
  const flood = await call('POST', '/api/hse/ask-lead', { reviewer: await signIn('p9@kestrel-ask.example', 'Sam Reid'), body: { abn } });
  assert.equal(flood.status, 429);
  // Someone already in the team, an ABN with no account and a bad ABN.
  assert.equal((await call('POST', '/api/hse/ask-lead', { reviewer: first, body: { abn } })).status, 409);
  assert.equal((await call('POST', '/api/hse/ask-lead', { reviewer: second, body: { abn: nextAbn() } })).status, 404);
  assert.equal((await call('POST', '/api/hse/ask-lead', { reviewer: second, body: { abn: '12 345 678 901' } })).status, 400);
  // Signed out: refused.
  assert.equal((await call('POST', '/api/hse/ask-lead', { body: { abn } })).status, 401);
  // The page links "Tell SiteWrite" from the duplicate message.
  const page = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'hse.js'), 'utf8');
  assert.match(page, /id="setup-tell">tell SiteWrite<\/a>/);
  assert.match(page, />Ask the lead for me</);
});

// ---- Handing over the lead: a short email to both (stage 3 decision 5) ----

test('handing over the lead emails the new lead and the old lead', async () => {
  const lead = await signIn('robin@heron-build.example', 'Robin Hale');
  const org = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Heron Build Pty Ltd', abn: nextAbn() } });
  await call('POST', `/api/hse/orgs/${org.data.org.id}/members`, { reviewer: lead, body: { email: 'ash@heron-build.example' } });
  // Ash joins on signing in.
  await call('GET', '/api/hse/me', { reviewer: await signIn('ash@heron-build.example', 'Ash Kim') });
  const team = (await call('GET', `/api/hse/orgs/${org.data.org.id}`, { reviewer: lead })).data.team;
  const ash = team.find((person) => person.email === 'ash@heron-build.example');
  const before = mailbox.length;
  const made = await call('POST', `/api/hse/orgs/${org.data.org.id}/members/${ash.id}/lead`, { reviewer: lead });
  assert.equal(made.status, 200);
  assert.equal(made.data.message, 'Ash Kim is now the lead. You are now a member.');
  const mail = mailbox.slice(before);
  assert.deepEqual(mail.map((item) => [item.to, item.subject]), [
    ['ash@heron-build.example', 'You are now the lead of Heron Build Pty Ltd on SiteLink'],
    ['robin@heron-build.example', 'Ash Kim is now the lead of Heron Build Pty Ltd on SiteLink'],
  ]);
  assert.match(mail[0].text, /^Robin Hale made you the lead of Heron Build Pty Ltd on SiteLink by SiteWrite on \d{1,2} \w+ \d{4}\. As the lead, you add and remove people, change the account settings and can hand the lead role on\./);
  assert.match(mail[1].text, /^You made Ash Kim the lead of Heron Build Pty Ltd on SiteLink by SiteWrite on \d{1,2} \w+ \d{4}\. You are now a member\./);
  assert.match(mail[1].text, /If you did not do this, contact SiteWrite at sitereadyaus@gmail\.com straight away\./);
  // A refused handover sends nothing.
  const after = mailbox.length;
  assert.equal((await call('POST', `/api/hse/orgs/${org.data.org.id}/members/${ash.id}/lead`, { reviewer: lead })).status, 403);
  assert.equal(mailbox.length, after);
});
