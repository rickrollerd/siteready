// Invite-only gate for the founding-member beta: new companies and new SiteLink orgs need an
// admin-issued invite when INVITE_ONLY is on. Existing accounts, company team joins and reviewers
// are not affected. Made-up companies and people only.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.RATE_LIMIT_AUTH_VERIFY_REQUESTS = '1000';
process.env.RATE_LIMIT_HSE_REQUESTS = '5000';
process.env.RATE_LIMIT_LIST_REQUESTS = '5000';
process.env.RATE_LIMIT_LIST_SENDS = '1000';
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

function inviteRow(code) {
  return db.one('SELECT * FROM invites WHERE code_hash = $1', [invites.hashCode(code)]);
}

function lastMail(email) {
  return [...mailbox].reverse().find((item) => item.to === email) || null;
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

test('with the flag on, a new email without an invite gets the same message as a known email, and no account is created', async () => {
  on();
  try {
    const email = 'uninvited@new.example';
    const beforeMail = mailCount(email);
    const unknown = await call('POST', '/api/auth/email', { body: { email } });
    const unknownBody = await unknown.json();
    assert.equal(unknown.status, 200);
    assert.equal(unknownBody.message, require('../auth').signInMailSentMessage());
    assert.doesNotMatch(unknownBody.message, /invite-only/i);
    const known = await call('POST', '/api/auth/email', { body: { email: 'owner@sitewrite.example' } });
    const knownBody = await known.json();
    assert.equal(known.status, 200);
    assert.equal(knownBody.message, unknownBody.message);
    assert.equal(mailCount(email), beforeMail + 1);
    const mail = lastMail(email);
    assert.ok(mail);
    assert.match(mail.text, /invite-only/i);
    assert.match(mail.text, /sitereadyaus@gmail.com/i);
    assert.equal(lastLinkToken(email), null, 'no sign-in link is sent');
    assert.equal(await db.one('SELECT id FROM users WHERE email = $1', [email]), null);
    assert.equal(await db.one('SELECT id FROM companies WHERE email = $1', [email]), null);
    assert.ok(lastLinkToken('owner@sitewrite.example'));
  } finally {
    off();
  }
});

test('with the flag on, an invalid or used invite is treated like no invite', async () => {
  on();
  try {
    const email = 'badcode@new.example';
    const invalid = await call('POST', '/api/auth/email', { body: { email, invite: 'not-a-real-code' } });
    assert.equal(invalid.status, 200);
    assert.equal((await invalid.json()).message, require('../auth').signInMailSentMessage());
    assert.equal(lastLinkToken(email), null);

    const created = await createInvite('single use');
    const first = await signIn('first@used.example', created.code);
    assert.equal(first.status, 200);
    const reuse = await call('POST', '/api/auth/email', { body: { email: 'second@used.example', invite: created.code } });
    assert.equal(reuse.status, 200);
    assert.equal(lastLinkToken('second@used.example'), null);
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
    const row = await inviteRow(created.code);
    assert.equal(Number(row.use_count), 1);
    assert.equal(row.last_used_by, email);
    assert.equal(row.code, invites.hashCode(created.code));
    assert.equal(row.code_hash, invites.hashCode(created.code));
  } finally {
    off();
  }
});

test('with the flag on, an existing account signs in without an invite, and a leftover invite is not consumed', async () => {
  on();
  try {
    const created = await createInvite('must not be used');
    const before = await inviteRow(created.code);
    const res = await call('POST', '/api/auth/email', { body: { email: 'owner@sitewrite.example', invite: created.code } });
    assert.equal(res.status, 200);
    const token = lastLinkToken('owner@sitewrite.example');
    const verified = await call('POST', '/api/auth/verify', { body: { token } });
    assert.equal(verified.status, 200);
    const after = await inviteRow(created.code);
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
  const rows = (await list.json()).invites;
  assert.ok(rows.every((item) => !item.code && !item.code_hash && !item.codeHash));
  const found = rows.find((item) => item.id === created.id);
  assert.ok(found);
  assert.equal(found.codeHint, created.code.slice(-4));
  assert.ok(found.expiresAt);
  const days = (new Date(found.expiresAt) - Date.now()) / (24 * 60 * 60 * 1000);
  assert.ok(days > 29 && days < 31, 'default expiry is 30 days');
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
    const refused = await call('POST', '/api/hse/orgs', { reviewer, body: { name: 'Specimen Build Pty Ltd', abn: nextAbn() } });
    assert.equal(refused.status, 403);
    assert.match((await refused.json()).message, /invite-only/i);
    assert.equal((await db.query('SELECT id FROM orgs WHERE created_by = (SELECT id FROM reviewers WHERE email = $1)', [email])).length, 0);

    const created = await createInvite('sitelink org');
    const allowed = await call('POST', '/api/hse/orgs', { reviewer, body: { name: 'Specimen Build Pty Ltd', abn: nextAbn(), invite: created.code } });
    const body = await allowed.json();
    assert.equal(allowed.status, 201, body.message);
    assert.ok(body.org && body.org.id);
    const row = await inviteRow(created.code);
    assert.equal(Number(row.use_count), 1);
    assert.equal(row.last_used_by, email);
  } finally {
    off();
  }
});

test('a revoked or expired invite cannot be used, and revoke is idempotent', async () => {
  on();
  try {
    const created = await createInvite('to revoke');
    const first = await call('POST', `/api/admin/invites/${created.id}/revoke`, { token: owner, body: {} });
    assert.equal(first.status, 200);
    const again = await call('POST', `/api/admin/invites/${created.id}/revoke`, { token: owner, body: {} });
    assert.equal(again.status, 200);
    const missing = await call('POST', '/api/admin/invites/not-a-real-id/revoke', { token: owner, body: {} });
    assert.equal(missing.status, 404);
    const blocked = await call('POST', `/api/admin/invites/${created.id}/revoke`, { token: someone, body: {} });
    assert.equal(blocked.status, 403);

    const email = 'revoked@new.example';
    const res = await call('POST', '/api/auth/email', { body: { email, invite: created.code } });
    assert.equal(res.status, 200);
    assert.equal(lastLinkToken(email), null);
    assert.equal(await db.one('SELECT id FROM users WHERE email = $1', [email]), null);

    const expired = await invites.create({ note: 'already expired', createdBy: 'test', expiresAt: new Date(Date.now() - 60 * 1000) });
    const late = await call('POST', '/api/auth/email', { body: { email: 'expired@new.example', invite: expired.code } });
    assert.equal(late.status, 200);
    assert.equal(lastLinkToken('expired@new.example'), null);
  } finally {
    off();
  }
});

test('a SiteLink sign-in link carries the invite code', async () => {
  on();
  try {
    const created = await createInvite('sitelink sign-in');
    const email = 'lead@keep-invite.example';
    const sent = await call('POST', '/api/hse/email', { body: { email, invite: created.code } });
    assert.equal(sent.status, 200);
    const mail = lastMail(email);
    assert.ok(mail);
    assert.match(mail.text, /[?&]login=/);
    assert.match(mail.text, new RegExp(`[?&]invite=${created.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  } finally {
    off();
  }
});

test('a duplicate ABN does not consume the invite', async () => {
  on();
  try {
    async function reviewerFor(email) {
      const sent = await call('POST', '/api/hse/email', { body: { email } });
      assert.equal(sent.status, 200);
      const verified = await call('POST', '/api/hse/verify', { body: { token: lastLinkToken(email) } });
      const token = (await verified.json()).token;
      const profile = await call('PUT', '/api/hse/me', { reviewer: token, body: { name: 'Jo Park', position: 'HSE lead', phone: '0412 345 678' } });
      assert.equal(profile.status, 200);
      return token;
    }
    const firstInvite = await createInvite('first org');
    const first = await reviewerFor('lead@dup-one.example');
    const abn = nextAbn();
    const made = await call('POST', '/api/hse/orgs', { reviewer: first, body: { name: 'Specimen Build Pty Ltd', abn, invite: firstInvite.code } });
    assert.equal(made.status, 201, (await made.clone().json().catch(() => made.json())).message || '');

    const secondInvite = await createInvite('second org');
    const second = await reviewerFor('lead@dup-two.example');
    const taken = await call('POST', '/api/hse/orgs', { reviewer: second, body: { name: 'Specimen Build Pty Ltd', abn, invite: secondInvite.code } });
    assert.equal(taken.status, 409);
    const row = await inviteRow(secondInvite.code);
    assert.equal(Number(row.use_count), 0);
    assert.equal(row.revoked_at, null);
    const reused = await call('POST', '/api/hse/orgs', { reviewer: second, body: { name: 'Specimen Build Pty Ltd', abn: nextAbn(), invite: secondInvite.code } });
    assert.equal(reused.status, 201, (await reused.json()).message || '');
    assert.equal(Number((await inviteRow(secondInvite.code)).use_count), 1);
  } finally {
    off();
  }
});

test('with the flag on, list sign-in uses the same message for known and uninvited emails', async () => {
  // The list is set up with the gate off, then the gate is turned on for sign-in.
  off();
  const leadEmail = 'dana@list-invite.example';
  const sent = await call('POST', '/api/hse/email', { body: { email: leadEmail } });
  assert.equal(sent.status, 200);
  const lead = (await (await call('POST', '/api/hse/verify', { body: { token: lastLinkToken(leadEmail) } })).json()).token;
  assert.equal((await call('PUT', '/api/hse/me', { reviewer: lead, body: { name: 'Dana Whitfield', position: 'HSE manager', phone: '0412 555 012' } })).status, 200);
  const org = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Specimen Build Pty Ltd', abn: nextAbn() } });
  assert.equal(org.status, 201, JSON.stringify(await org.clone().json().catch(() => ({}))));
  const orgId = (await org.json()).org.id;
  await db.query("UPDATE orgs SET abn_check = 'verified', abn_verified_at = $1 WHERE id = $2", [new Date(), orgId]);
  const project = await call('POST', `/api/hse/orgs/${orgId}/projects`, { reviewer: lead, body: { name: 'Northgate Health Hub', workplace: '12 Wattle Road, Hamilton QLD 4007', state: 'qld' } });
  assert.equal(project.status, 201, JSON.stringify(await project.clone().json().catch(async () => project.json())));
  const projectId = (await project.json()).project.id;
  const details = await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 0, details: { musterPoint: 'Assembly area A at the Wattle Road gate', hospital: 'Northside General Hospital, Emergency Department', siteRules: ['Sign in at the site office before starting.'] } } });
  assert.equal(details.status, 200, JSON.stringify(await details.clone().json().catch(() => ({}))));
  const added = await call('POST', `/api/hse/projects/${projectId}/subcontracts`, { reviewer: lead, body: { name: 'Tallow Formwork Pty Ltd', trade: 'Formwork', email: 'office@list-invite-sub.example' } });
  assert.equal(added.status, 201, JSON.stringify(await added.clone().json().catch(() => ({}))));
  const subId = (await added.json()).subcontract.id;
  assert.equal((await call('POST', `/api/hse/subcontracts/${subId}/items`, { reviewer: lead, body: { title: 'Formwork to suspended slabs', task: 'Form up, pour and strip the suspended slabs.' } })).status, 201);
  const due = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const preview = await call('POST', `/api/hse/subcontracts/${subId}/send/preview`, { reviewer: lead, body: { due } });
  assert.equal(preview.status, 200, JSON.stringify(await preview.clone().json().catch(() => ({}))));
  const previewBody = await preview.json();
  const sentList = await call('POST', `/api/hse/subcontracts/${subId}/send`, { reviewer: lead, body: { due, check: previewBody.preview.check } });
  assert.equal(sentList.status, 200, JSON.stringify(await sentList.clone().json().catch(() => ({}))));
  const listMail = lastMail('office@list-invite-sub.example');
  const token = /\/list\.html\?t=([A-Za-z0-9_-]+)/.exec(listMail.text)[1];

  on();
  try {
    const unknown = 'uninvited-list@new.example';
    const uninvited = await call('POST', `/api/list/${token}/sign-in`, { body: { email: unknown } });
    const uninvitedBody = await uninvited.json();
    assert.equal(uninvited.status, 200);
    assert.equal(uninvitedBody.message, require('../auth').signInMailSentMessage());
    assert.equal(lastLinkToken(unknown), null);
    assert.equal(await db.one('SELECT id FROM users WHERE email = $1', [unknown]), null);

    const known = await call('POST', `/api/list/${token}/sign-in`, { body: { email: 'owner@sitewrite.example' } });
    const knownBody = await known.json();
    assert.equal(known.status, 200);
    assert.equal(knownBody.message, uninvitedBody.message);
    const knownMail = lastMail('owner@sitewrite.example');
    assert.ok(knownMail && /[?&]login=/.test(knownMail.text), 'a sign-in link is sent to the existing account');

    const created = await createInvite('list sign-in');
    const invitedEmail = 'invited-list@new.example';
    const invited = await call('POST', `/api/list/${token}/sign-in`, { body: { email: invitedEmail, invite: created.code } });
    assert.equal(invited.status, 200);
    const invitedMail = lastMail(invitedEmail);
    assert.ok(invitedMail && /[?&]login=/.test(invitedMail.text), 'a sign-in link is sent to the invited email');
  } finally {
    off();
  }
});
