process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const db = require('../db');
const { sendReviewReminders, removeExpired } = require('../accounts');
const { setupAccounts, lastLinkToken, mailbox } = require('./helpers');

let server;
let base;

test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

function call(method, route, { body, token } = {}) {
  return fetch(`${base}${route}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function signIn(email) {
  const sent = await call('POST', '/api/auth/email', { body: { email } });
  assert.equal(sent.status, 200);
  const response = await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } });
  assert.equal(response.status, 200);
  return (await response.json()).token;
}

const INPUT = {
  state: 'qld',
  task: 'Install sprinkler pipework in the ward ceilings from scissor lifts more than 2 m above the floor.',
  fallRisk: 'yes',
  facts: { fallControl: 'Scissor lifts with guardrails are used for all work above 2 m.' },
};
const CONFIRM = { reviewConfirmed: true, reviewedBy: 'Alex Chen' };

test('an email link signs in once, and the first sign-in starts a 14 day trial', async () => {
  await call('POST', '/api/auth/email', { body: { email: 'Alex@Example.com ' } });
  const token = lastLinkToken('alex@example.com');
  assert.ok(token, 'the link was emailed');
  const first = await call('POST', '/api/auth/verify', { body: { token } });
  assert.equal(first.status, 200);
  const again = await call('POST', '/api/auth/verify', { body: { token } });
  assert.equal(again.status, 400, 'a link works once');
  const session = (await first.json()).token;
  const me = await (await call('GET', '/api/me', { token: session })).json();
  assert.equal(me.user.email, 'alex@example.com');
  assert.equal(me.company.planStatus, 'trial');
  assert.equal(me.company.hasAccess, true);
  const days = (new Date(me.company.trialEndsAt) - Date.now()) / 86400000;
  assert.ok(days > 13.9 && days <= 14, `trial is 14 days (${days})`);
  assert.equal((await call('GET', '/api/me')).status, 401);
  assert.equal((await call('POST', '/api/auth/email', { body: { email: 'not an email' } })).status, 400);
});

test('company profile, sites and saved SWMS, with Word and PDF downloads', async () => {
  const token = await signIn('owner@builder.example');
  const profile = await call('PUT', '/api/company', { token, body: { name: 'Builder Co', abn: '11 222 333 444', address: '1 Site St, Brisbane' } });
  assert.equal((await profile.json()).company.name, 'Builder Co');

  const site = await (await call('POST', '/api/sites', { token, body: { name: 'Hospital job', workplace: '10 Ward Rd, Brisbane', principalContractor: 'Main Builder Pty Ltd' } })).json();
  assert.equal(site.site.principalContractor, 'Main Builder Pty Ltd');

  assert.equal((await call('POST', '/api/swms', { token, body: { input: INPUT, siteId: site.site.id } })).status, 400, 'saving needs the review confirmation');
  const saved = await call('POST', '/api/swms', { token, body: { input: INPUT, siteId: site.site.id, ...CONFIRM } });
  assert.equal(saved.status, 201);
  const { swms } = await saved.json();
  const months = (new Date(swms.reviewDueAt) - new Date(swms.lastReviewedAt)) / 86400000;
  assert.ok(months > 88 && months < 93, 'review is due in 3 months');

  const list = await (await call('GET', '/api/swms', { token })).json();
  assert.equal(list.swms.length, 1);

  const docx = await call('GET', `/api/swms/${swms.id}/docx`, { token });
  assert.equal(docx.status, 200);
  assert.match(docx.headers.get('content-type'), /wordprocessingml/);
  const pdf = await call('GET', `/api/swms/${swms.id}/pdf`, { token });
  assert.equal(pdf.status, 200);
  const pdfBytes = Buffer.from(await pdf.arrayBuffer());
  assert.equal(pdfBytes.subarray(0, 4).toString(), '%PDF');

  const copy = await call('POST', `/api/swms/${swms.id}/copy`, { token, body: CONFIRM });
  assert.equal(copy.status, 201);
  assert.match((await copy.json()).swms.title, /^Copy of /);

  const other = await signIn('someone@else.example');
  assert.equal((await call('GET', `/api/swms/${swms.id}`, { token: other })).status, 404, 'another company cannot see it');
  assert.equal((await call('GET', `/api/swms/${swms.id}/pdf`, { token: other })).status, 404);
});

test('a stood-down SWMS cannot be saved', async () => {
  const token = await signIn('stood@down.example');
  const response = await call('POST', '/api/swms', { token, body: { input: { ...INPUT, facts: {} }, ...CONFIRM } });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /stood down/);
});

test('workers sign on with the QR link, and their signatures go on the SWMS', async () => {
  const token = await signIn('super@visor.example');
  const { swms } = await (await call('POST', '/api/swms', { token, body: { input: INPUT, ...CONFIRM } })).json();
  const key = new URLSearchParams(swms.signonPath.split('?')[1]).get('t');

  const view = await (await call('GET', `/api/sign/${key}`)).json();
  assert.ok(view.jobSteps.length > 2, 'the worker can read the job steps');

  const signature = `data:image/png;base64,${Buffer.from('signature').toString('base64')}`;
  assert.equal((await call('POST', `/api/sign/${key}`, { body: { name: 'Jo Worker', signature, confirmed: true } })).status, 201);
  assert.equal((await call('POST', `/api/sign/${key}`, { body: { name: 'No Signature', confirmed: true } })).status, 400);
  assert.equal((await call('POST', `/api/sign/${key}`, { body: { name: 'No Tick', signature } })).status, 400);
  assert.equal((await call('GET', '/api/sign/not-a-real-key')).status, 404);

  const detail = await (await call('GET', `/api/swms/${swms.id}`, { token })).json();
  assert.deepEqual(detail.signons.map((item) => item.worker_name), ['Jo Worker']);
  const qr = await call('GET', `/api/swms/${swms.id}/qr.svg`, { token });
  assert.match(await qr.text(), /<svg/);
});

test('an invited person joins the company', async () => {
  const token = await signIn('boss@team.example');
  assert.equal((await call('POST', '/api/company/users', { token, body: { email: 'mate@team.example' } })).status, 200);
  const mate = await call('POST', '/api/auth/verify', { body: { token: lastLinkToken('mate@team.example') } });
  const mateToken = (await mate.json()).token;
  const users = await (await call('GET', '/api/company/users', { token: mateToken })).json();
  assert.deepEqual(users.users.map((item) => item.email).sort(), ['boss@team.example', 'mate@team.example']);

  // The person who made the company is its administrator; only they add or remove people.
  assert.equal((await (await call('GET', '/api/me', { token })).json()).user.isAdmin, true);
  assert.equal((await (await call('GET', '/api/me', { token: mateToken })).json()).user.isAdmin, false);
  assert.equal((await call('POST', '/api/company/users', { token: mateToken, body: { email: 'other@team.example' } })).status, 403);
  assert.equal((await call('DELETE', '/api/company/users/boss%40team.example', { token: mateToken })).status, 403);
  assert.equal((await call('DELETE', '/api/company/users/boss%40team.example', { token })).status, 400);
  assert.equal((await call('DELETE', '/api/company/users/mate%40team.example', { token })).status, 200);
  assert.equal((await call('GET', '/api/me', { token: mateToken })).status, 401, 'a removed person is signed out');
  const left = await (await call('GET', '/api/company/users', { token })).json();
  assert.deepEqual(left.users.map((item) => item.email), ['boss@team.example']);
});

test('an ended trial is preview only until the company subscribes', async () => {
  const token = await signIn('lapsed@trial.example');
  const user = await db.one('SELECT company_id FROM users WHERE email = $1', ['lapsed@trial.example']);
  await db.query('UPDATE companies SET trial_ends_at = $1 WHERE id = $2', [new Date(Date.now() - 1000), user.company_id]);
  const response = await call('POST', '/api/swms', { token, body: { input: INPUT, ...CONFIRM } });
  assert.equal(response.status, 402);
  assert.match((await response.json()).message, /trial has ended/);
  assert.equal((await call('POST', '/api/draft', { token, body: INPUT })).status, 200, 'preview still works');
  await db.query("UPDATE companies SET plan_status = 'active' WHERE id = $1", [user.company_id]);
  assert.equal((await call('POST', '/api/swms', { token, body: { input: INPUT, ...CONFIRM } })).status, 201);
});

test('review reminders go out once per review period, and a review restarts the period', async () => {
  const token = await signIn('remind@me.example');
  const { swms } = await (await call('POST', '/api/swms', { token, body: { input: INPUT, ...CONFIRM } })).json();
  await db.query('UPDATE swms SET review_due_at = $1 WHERE id = $2', [new Date(Date.now() + 2 * 86400000), swms.id]);
  const before = mailbox.length;
  await sendReviewReminders();
  const sent = mailbox.slice(before).filter((item) => item.to === 'remind@me.example');
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /3 monthly review/);
  await sendReviewReminders();
  assert.equal(mailbox.slice(before).filter((item) => item.to === 'remind@me.example').length, 1, 'not sent twice');

  const reviewed = await (await call('POST', `/api/swms/${swms.id}/reviewed`, { token, body: CONFIRM })).json();
  assert.equal(reviewed.swms.reviewDue, false);
});

test('Face ID set-up and sign-in options are offered', async () => {
  const token = await signIn('face@id.example');
  const register = await (await call('POST', '/api/auth/passkey/register/options', { token })).json();
  assert.ok(register.challengeId && register.options.challenge);
  assert.equal(register.options.authenticatorSelection.userVerification, 'required');
  const login = await (await call('POST', '/api/auth/passkey/login/options')).json();
  assert.ok(login.challengeId && login.options.challenge);
  const bad = await call('POST', '/api/auth/passkey/login', { body: { challengeId: login.challengeId, response: { id: 'unknown' } } });
  assert.equal(bad.status, 400);
});

test('expired sign-in links and sessions are removed', async () => {
  await call('POST', '/api/auth/email', { body: { email: 'old@link.example' } });
  await db.query('UPDATE login_tokens SET expires_at = $1 WHERE email = $2', [new Date(Date.now() - 1000), 'old@link.example']);
  await removeExpired();
  assert.equal((await db.query('SELECT * FROM login_tokens WHERE email = $1', ['old@link.example'])).length, 0);
});

test('a deleted SWMS is hidden at once and removed with its sign-ons after 30 days', async () => {
  const token = await signIn('purge@delete.example');
  const { swms } = await (await call('POST', '/api/swms', { token, body: { input: INPUT, ...CONFIRM } })).json();
  await db.query('INSERT INTO signons (id, swms_id, worker_name, worker_company, signature, signed_at) VALUES ($1, $2, $3, $4, $5, $6)', ['s-purge', swms.id, 'Pat', 'Crew Co', 'data:image/png;base64,AA', new Date()]);
  assert.equal((await call('DELETE', `/api/swms/${swms.id}`, { token })).status, 200);
  await removeExpired();
  assert.equal((await db.query('SELECT * FROM swms WHERE id = $1', [swms.id])).length, 1, 'kept for 30 days');
  await db.query('UPDATE swms SET updated_at = $1 WHERE id = $2', [new Date(Date.now() - 31 * 24 * 60 * 60 * 1000), swms.id]);
  await removeExpired();
  assert.equal((await db.query('SELECT * FROM swms WHERE id = $1', [swms.id])).length, 0);
  assert.equal((await db.query('SELECT * FROM signons WHERE swms_id = $1', [swms.id])).length, 0);
});

test('a business can export all its saved SWMS in one zip', async () => {
  const token = await signIn('export@all.example');
  assert.equal((await call('GET', '/api/swms/export.zip', { token })).status, 404, 'nothing saved yet');
  await call('POST', '/api/swms', { token, body: { input: INPUT, ...CONFIRM } });
  await call('POST', '/api/swms', { token, body: { input: INPUT, ...CONFIRM } });
  const response = await call('GET', '/api/swms/export.zip', { token });
  assert.equal(response.status, 200);
  const zip = await require('jszip').loadAsync(Buffer.from(await response.arrayBuffer()));
  assert.equal(Object.keys(zip.files).filter((name) => name.endsWith('.docx')).length, 2);
});
