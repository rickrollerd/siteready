// Invite-only gate for the founding-member beta: new companies and new SiteLink orgs need an
// admin-issued invite when INVITE_ONLY is on. Existing accounts, company team joins and reviewers
// are not affected. Made-up companies and people only.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.RATE_LIMIT_HSE_REQUESTS = '5000';
process.env.ADMIN_EMAILS = 'owner@sitewrite.example';
delete process.env.INVITE_ONLY;

const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const db = require('../db');
const invites = require('../invites');
const abnRegister = require('../abn');
const { validAbn } = require('../accounts');
const { setupAccounts, lastLinkToken, mailbox } = require('./helpers');

abnRegister.lookupAbn = async () => ({ enabled: false });

let abnSeed = 61829374000;
function nextAbn() {
  for (abnSeed += 89; ; abnSeed += 1) if (validAbn(String(abnSeed))) return String(abnSeed);
}

let server;
let base;
let owner;
let someone;

test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  owner = (await signIn('owner@sitewrite.example')).session;
  someone = (await signIn('nosy@admin-test.example')).session;
});

test.after(() => {
  delete process.env.INVITE_ONLY;
  server.close();
});

const call = (method, route, { body, token, reviewer } = {}) => fetch(`${base}${route}`, {
  method,
  headers: {
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(reviewer ? { 'X-Reviewer-Token': reviewer } : {}),
  },
  body: body ? JSON.stringify(body) : undefined,
});

async function signIn(email, invite) {
  const sent = await call('POST', '/api/auth/email', { body: { email, ...(invite ? { invite } : {}) } });
  if (sent.status !== 200) return { status: sent.status, data: await sent.json() };
  const token = lastLinkToken(email);
  const verified = await call('POST', '/api/auth/verify', { body: { token } });
  const data = await verified.json();
  return { status: verified.status, data, session: data.token };
}

function mailCount(email) {
  return mailbox.filter((item) => item.to === email).length;
}

function on() { process.env.INVITE_ONLY = '1'; }
function off() { delete process.env.INVITE_ONLY; }

async function createInvite(note = 'test', maxUses = 1) {
  const res = await call('POST', '/api/admin/invites', { token: owner, body: { note, maxUses } });
  const data = await res.json();
  assert.equal(res.status, 200, data.message || 'admin can create an invite');
  return data;
}

test('with the flag off, config is not invite-only and a new email starts a trial', async () => {
  off();
  const config = await (await call('GET', '/api/config')).json();
  assert.equal(config.inviteOnly, false);
  assert.ok(config.supportEmail);
  const email = 'fresh@off.example';
  const result = await signIn(email);
  assert.equal(result.status, 200);
  const me = await (await call('GET', '/api/me', { token: result.session })).json();
  assert.equal(me.user.email, email);
  assert.equal(me.company.planStatus, 'trial');
  assert.equal(me.company.hasAccess, true);
});

test('with the flag on, config is invite-only', async () => {
  on();
  try {
    const config = await (await call('GET', '/api/config')).json();
    assert.equal(config.inviteOnly, true);
    assert.equal(config.supportEmail, 'sitereadyaus@gmail.com');
  } finally {
    off();
  }
});

test('with the flag on, a new email without an invite is refused and no account is created', async () => {
  on();
  try {
    const email = 'uninvited@new.example';
    const beforeMail = mailCount(email);
    const res = await call('POST', '/api/auth/email', { body: { email } });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.match(data.message, /invite-only/i);
    assert.match(data.message, /Request an invite/i);
    assert.equal(mailCount(email), beforeMail, 'no sign-in mail is sent');
    assert.equal(await db.one('SELECT id FROM users WHERE email = $1', [email]), null);
    assert.equal(await db.one('SELECT id FROM companies WHERE email = $1', [email]), null);
  } finally {
    off();
  }
});

test('with the flag on, an invalid or used invite is refused', async () => {
  on();
  try {
    const email = 'badcode@new.example';
    const invalid = await call('POST', '/api/auth/email', { body: { email, invite: 'not-a-real-code' } });
    assert.equal(invalid.status, 403);
    assert.match((await invalid.json()).message, /invite-only/i);

    const created = await createInvite('single use');
    const first = await signIn('first@used.example', created.code);
    assert.equal(first.status, 200);
    const reuse = await call('POST', '/api/auth/email', { body: { email: 'second@used.example', invite: created.code } });
    assert.equal(reuse.status, 403);
    assert.equal(await db.one('SELECT id FROM users WHERE email = $1', ['second@used.example']), null);
  } finally {
    off();
  }
});

test('with the flag on, a valid invite starts the trial and is consumed', async () => {
  on();
  try {
    const created = await createInvite('founding member');
    assert.ok(created.code);
    assert.match(created.link, /[?&]invite=/);
    const email = 'invited@new.example';
    const result = await signIn(email, created.code);
    assert.equal(result.status, 200);
    const me = await (await call('GET', '/api/me', { token: result.session })).json();
    assert.equal(me.user.email, email);
    assert.equal(me.company.planStatus, 'trial');
    const row = await db.one('SELECT use_count, last_used_by FROM invites WHERE code = $1', [created.code]);
    assert.equal(Number(row.use_count), 1);
    assert.equal(row.last_used_by, email);
  } finally {
    off();
  }
});

test('with the flag on, an existing account signs in without an invite, and a leftover invite is not consumed', async () => {
  on();
  try {
    const created = await createInvite('must not be used');
    const before = await db.one('SELECT use_count FROM invites WHERE code = $1', [created.code]);
    const res = await call('POST', '/api/auth/email', { body: { email: 'owner@sitewrite.example', invite: created.code } });
    assert.equal(res.status, 200);
    const token = lastLinkToken('owner@sitewrite.example');
    const verified = await call('POST', '/api/auth/verify', { body: { token } });
    assert.equal(verified.status, 200);
    const after = await db.one('SELECT use_count FROM invites WHERE code = $1', [created.code]);
    assert.equal(Number(after.use_count), Number(before.use_count));
  } finally {
    off();
  }
});

test('with the flag on, a company team invitation does not need a beta invite', async () => {
  on();
  try {
    const add = await call('POST', '/api/company/users', { token: owner, body: { email: 'mate@team.example' } });
    assert.equal(add.status, 200);
    const token = lastLinkToken('mate@team.example');
    const verified = await call('POST', '/api/auth/verify', { body: { token } });
    assert.equal(verified.status, 200);
    const session = (await verified.json()).token;
    const me = await (await call('GET', '/api/me', { token: session })).json();
    assert.equal(me.user.email, 'mate@team.example');
    const ownerMe = await (await call('GET', '/api/me', { token: owner })).json();
    assert.equal(me.company.id, ownerMe.company.id);
  } finally {
    off();
  }
});

test('only an admin can create and list invites', async () => {
  off();
  const blocked = await call('POST', '/api/admin/invites', { token: someone, body: { note: 'no' } });
  assert.equal(blocked.status, 403);
  const blockedList = await call('GET', '/api/admin/invites', { token: someone });
  assert.equal(blockedList.status, 403);
  const created = await createInvite('listed');
  const list = await call('GET', '/api/admin/invites', { token: owner });
  assert.equal(list.status, 200);
  const codes = (await list.json()).invites.map((item) => item.code);
  assert.ok(codes.includes(created.code));
});

test('with the flag on, a new SiteLink org needs a valid invite', async () => {
  on();
  try {
    const email = 'lead@sitelink.example';
    const sent = await call('POST', '/api/hse/email', { body: { email } });
    assert.equal(sent.status, 200);
    const login = lastLinkToken(email);
    const verified = await call('POST', '/api/hse/verify', { body: { token: login } });
    assert.equal(verified.status, 200);
    const reviewer = (await verified.json()).token;
    const profile = await call('PUT', '/api/hse/me', { reviewer, body: { name: 'Jo Park', position: 'HSE lead', phone: '0412 345 678' } });
    const profileBody = await profile.json();
    assert.equal(profile.status, 200, profileBody.message);
    // call() already consumed the body above? fetch body can only be read once. Re-do profile if needed.
    const refused = await call('POST', '/api/hse/orgs', { reviewer, body: { name: 'Specimen Build Pty Ltd', abn: nextAbn() } });
    assert.equal(refused.status, 403);
    assert.match((await refused.json()).message, /invite-only/i);
    assert.equal((await db.query('SELECT id FROM orgs WHERE created_by = (SELECT id FROM reviewers WHERE email = $1)', [email])).length, 0);

    const created = await createInvite('sitelink org');
    const allowed = await call('POST', '/api/hse/orgs', { reviewer, body: { name: 'Specimen Build Pty Ltd', abn: nextAbn(), invite: created.code } });
    const body = await allowed.json();
    assert.equal(allowed.status, 201, body.message);
    assert.ok(body.org && body.org.id);
    const row = await db.one('SELECT use_count, last_used_by FROM invites WHERE code = $1', [created.code]);
    assert.equal(Number(row.use_count), 1);
    assert.equal(row.last_used_by, email);
  } finally {
    off();
  }
});
