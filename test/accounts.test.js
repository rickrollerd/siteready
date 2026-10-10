process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const db = require('../db');
const { sendReviewReminders, removeExpired } = require('../accounts');
const { setupAccounts, lastLinkToken, mailbox, ANSWERED, ready } = require('./helpers');

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

// A valid ABN for each test business: nine digits from the email, and the two leading
// digits that make the ABN check work.
function abnFor(seed) {
  let n = 0;
  for (const ch of seed) n = (n * 31 + ch.charCodeAt(0)) % 1000000000;
  const tail = String(n).padStart(9, '0');
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  for (let head = 10; head <= 99; head += 1) {
    const digits = `${head}${tail}`;
    const total = [...digits].reduce((sum, d, i) => sum + (Number(d) - (i === 0 ? 1 : 0)) * weights[i], 0);
    if (total % 89 === 0) return digits;
  }
  return abnFor(`${seed}x`);
}

async function signIn(email, { company = true } = {}) {
  const sent = await call('POST', '/api/auth/email', { body: { email } });
  assert.equal(sent.status, 200);
  const response = await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } });
  assert.equal(response.status, 200);
  const { token } = await response.json();
  // Saving and downloading need the business name and ABN.
  if (company) await call('PUT', '/api/company', { token, body: { name: `Test business ${email}`, abn: abnFor(email) } });
  return token;
}

// The site questions answered, as a SWMS needs before it is saved or downloaded (goal 2).
const INPUT = ready({
  ...ANSWERED,
  state: 'qld',
  task: 'Install sprinkler pipework in the ward ceilings from scissor lifts more than 2 m above the floor.',
  fallRisk: 'yes',
  facts: { fallControl: 'Scissor lifts with guardrails are used for all work above 2 m.' },
});
const CONFIRM = { reviewConfirmed: true, reviewedBy: 'Alex Chen' };

// The right answers to one read's check questions, worked out as the server does.
async function rightAnswers(swmsId, readId) {
  const { prepareDraft } = require('../draft');
  const { withCompany } = require('../accounts');
  const { checkQuestions } = require('../sign-read');
  const row = await db.one('SELECT * FROM swms WHERE id = $1', [swmsId]);
  const company = await db.one('SELECT * FROM companies WHERE id = $1', [row.company_id]);
  return Object.fromEntries(checkQuestions(row.id, readId, prepareDraft(withCompany(row.input, company))).map((q) => [q.id, q.answer]));
}

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
  const profile = await call('PUT', '/api/company', { token, body: { name: 'Builder Co', abn: '53 004 085 616', address: '1 Site St, Brisbane' } });
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

  // The worker has had the SWMS open long enough, and answers the check questions.
  await db.query('UPDATE sign_reads SET started_at = $1 WHERE id = $2', [new Date(Date.now() - 60 * 60 * 1000), view.readId]);
  const answers = await rightAnswers(swms.id, view.readId);
  const signature = `data:image/png;base64,${Buffer.from('signature').toString('base64')}`;
  assert.equal((await call('POST', `/api/sign/${key}`, { body: { name: 'Jo Worker', signature, confirmed: true, readId: view.readId, answers } })).status, 201);
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
  process.env.APP_URL = 'https://siteready.example/';
  try {
    await sendReviewReminders();
  } finally {
    delete process.env.APP_URL;
  }
  const sent = mailbox.slice(before).filter((item) => item.to === 'remind@me.example');
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /3 monthly review/);
  assert.match(sent[0].text, /Open My SWMS: https:\/\/siteready\.example\/#my-swms/, 'the email links to My SWMS at the app\'s own address');
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

test('a deleted site is hidden at once and removed after 30 days', async () => {
  const token = await signIn('purge-site@delete.example');
  const { site } = await (await call('POST', '/api/sites', { token, body: { name: 'Old job', workplace: '1 Old Road, Toowong QLD 4066', principalContractor: 'Old Builders' } })).json();
  assert.equal((await call('DELETE', `/api/sites/${site.id}`, { token })).status, 200);
  assert.equal((await (await call('GET', '/api/sites', { token })).json()).sites.length, 0, 'hidden at once');
  await removeExpired();
  assert.equal((await db.query('SELECT * FROM sites WHERE id = $1', [site.id])).length, 1, 'kept for 30 days');
  await db.query('UPDATE sites SET updated_at = $1 WHERE id = $2', [new Date(Date.now() - 31 * 24 * 60 * 60 * 1000), site.id]);
  await removeExpired();
  assert.equal((await db.query('SELECT * FROM sites WHERE id = $1', [site.id])).length, 0);
});

test('a business can export all its saved SWMS in one zip: every revision, its sign-ons, the team and sites', async () => {
  const JSZip = require('jszip');
  const token = await signIn('export@all.example');
  assert.equal((await call('GET', '/api/swms/export.zip', { token })).status, 404, 'nothing saved yet');
  await call('PUT', '/api/me', { token, body: { name: 'Erin Export' } });
  const { site } = await (await call('POST', '/api/sites', { token, body: { name: 'Hospital job', workplace: '12 Smith Street, Paddington QLD 4064', principalContractor: 'ABC Builders Pty Ltd', firstAider: 'Jo Smith' } })).json();
  const first = (await (await call('POST', '/api/swms', { token, body: { input: INPUT, siteId: site.id, ...CONFIRM } })).json()).swms;
  await call('POST', '/api/swms', { token, body: { input: INPUT, ...CONFIRM } });
  // A worker signs revision 1, then revision 2 is saved and another worker signs it.
  const key = first.signonPath.split('t=')[1];
  const signature = `data:image/png;base64,${Buffer.from('signature').toString('base64')}`;
  const sign = (name) => call('POST', `/api/sign/${key}`, { body: { name, company: 'Crew Co', signature, confirmed: true, explained: true, supervisor: 'Sam Lee' } });
  assert.equal((await sign('Rev One Worker')).status, 201);
  assert.equal((await call('PUT', `/api/swms/${first.id}`, { token, body: { input: { ...INPUT, musterPoint: 'Rear gate' }, ...CONFIRM, reason: 'Muster point moved' } })).status, 200);
  assert.equal((await sign('Rev Two Worker')).status, 201);
  // A sign-on to a revision SiteReady did not keep (saved before each revision was kept).
  await db.query('INSERT INTO signons (id, swms_id, worker_name, worker_company, signature, signed_at, revision) VALUES ($1, $2, $3, $4, $5, $6, $7)', ['s-unkept', first.id, 'Old Rev Worker', 'Crew Co', signature, new Date(), 7]);

  const response = await call('GET', '/api/swms/export.zip', { token });
  assert.equal(response.status, 200);
  const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
  const names = Object.keys(zip.files).sort();
  const title = first.title.replace(/[^A-Za-z0-9 -]+/g, '').trim().replace(/\s+/g, ' ').slice(0, 60);
  assert.deepEqual(names, ['Company, team and sites.txt', `${title} (2) revision 1.docx`, `${title} revision 1.docx`, `${title} revision 2.docx`].sort());
  const xml = async (name) => (await JSZip.loadAsync(await zip.file(name).async('nodebuffer'))).file('word/document.xml').async('string');
  const rev1 = await xml(`${title} revision 1.docx`);
  const rev2 = await xml(`${title} revision 2.docx`);
  assert.ok(rev1.includes('Rev One Worker') && !rev1.includes('Rev Two Worker'), 'revision 1 has its own sign-ons');
  assert.ok(rev2.includes('Rev Two Worker') && !rev2.includes('Rev One Worker'), 'revision 2 has its own sign-ons');
  assert.ok(rev2.includes('Rear gate') && !rev1.includes('Rear gate'));
  const text = await zip.file('Company, team and sites.txt').async('string');
  assert.match(text, /Name: Test business export@all\.example/);
  assert.match(text, /Erin Export, Administrator, export@all\.example/);
  assert.match(text, /Hospital job\r\n  Job address: 12 Smith Street, Paddington QLD 4064\r\n  Principal contractor: ABC Builders Pty Ltd/);
  assert.match(text, /First aider: Jo Smith/);
  assert.match(text, /Old Rev Worker, Crew Co, signed .*, revision 7/, 'a sign-on no Word file can print is listed');
  // Workers who signed on are not listed with the team, and nothing of another business is in it.
  assert.ok(!/Rev One Worker|Rev Two Worker/.test(text));
  assert.ok(!/remind@me\.example|lapsed@trial/.test(text));
});

test('one free trial per ABN, and the ABN must be a valid ABN', async () => {
  const first = await signIn('first@abn.example', { company: false });
  const bad = await call('PUT', '/api/company', { token: first, body: { name: 'First Co', abn: '12 345 678 901' } });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).message, /not a valid ABN/);
  const ok = await call('PUT', '/api/company', { token: first, body: { name: 'First Co', abn: '83 914 571 673' } });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).company.hasAccess, true, 'the first business with the ABN gets the trial');
  const second = await signIn('second@abn.example', { company: false });
  const again = await call('PUT', '/api/company', { token: second, body: { name: 'Second Co', abn: '83914571673' } });
  const data = await again.json();
  assert.equal(again.status, 200);
  assert.match(data.notice, /already had its free trial/);
  assert.equal(data.company.hasAccess, false, 'a second account with the same ABN gets no trial');
  const save = await call('POST', '/api/swms', { token: await signIn('nocompany@abn.example', { company: false }), body: { input: INPUT, ...CONFIRM } });
  assert.equal(save.status, 400, 'saving needs the business name and ABN');
});

test('the session also works in X-Session-Token, which wins over a replaced Authorization header', async () => {
  const token = await signIn('header@co.example');
  const me = (headers) => fetch(`${base}/api/me`, { headers });
  assert.equal((await me({ 'X-Session-Token': token })).status, 200);
  assert.equal((await me({ Authorization: 'Bearer something-else', 'X-Session-Token': token })).status, 200);
  assert.equal((await me({ Authorization: `Bearer ${token}` })).status, 200);
  assert.equal((await me({ 'X-Session-Token': 'not-a-session' })).status, 401);
});

test('a database that cannot answer gives 503 (busy), not 401 (signed out)', async () => {
  const token = await signIn('busy@co.example');
  const one = db.one;
  db.one = async () => { throw new Error('timeout exceeded when trying to connect'); };
  try {
    const res = await fetch(`${base}/api/swms/export.zip`, { headers: { 'X-Session-Token': token } });
    assert.equal(res.status, 503);
    assert.match((await res.json()).message, /busy/);
  } finally {
    db.one = one;
  }
  assert.equal((await fetch(`${base}/api/me`, { headers: { 'X-Session-Token': token } })).status, 200);
});

test('ten accounts saving the same ABN at the same moment leave exactly one trial', async () => {
  const abn = abnFor('race@abn.example');
  const tokens = await Promise.all(Array.from({ length: 10 }, (_, i) => signIn(`race${i}@abn.example`, { company: false })));
  const results = await Promise.all(tokens.map((token, i) => call('PUT', '/api/company', { token, body: { name: `Race Co ${i}`, abn } })));
  assert.ok(results.every((res) => res.status === 200), results.map((res) => res.status).join(','));
  const companies = await Promise.all(results.map((res) => res.json()));
  assert.equal(companies.filter((data) => data.company.hasAccess).length, 1);
});

test('a sign-in request whose email is not a plain string is refused with 400, not a server error', async () => {
  for (const email of [['first@co.example'], { address: 'first@co.example' }, 42, null]) {
    const res = await call('POST', '/api/auth/email', { body: { email } });
    assert.equal(res.status, 400, JSON.stringify(email));
  }
});

test('a new sign-in link replaces an earlier unused one', async () => {
  const email = 'twice@link.example';
  await call('POST', '/api/auth/email', { body: { email } });
  const first = lastLinkToken(email);
  await call('POST', '/api/auth/email', { body: { email } });
  const second = lastLinkToken(email);
  assert.notEqual(first, second);
  assert.equal((await call('POST', '/api/auth/verify', { body: { token: first } })).status, 400, 'the earlier link no longer works');
  assert.equal((await call('POST', '/api/auth/verify', { body: { token: second } })).status, 200);
});

test('a SWMS stops taking sign-ons at its limit', async () => {
  process.env.SIGNON_LIMIT = '2';
  try {
    const token = await signIn('limit@signon.example');
    const { swms } = await (await call('POST', '/api/swms', { token, body: { input: INPUT, ...CONFIRM } })).json();
    const key = new URLSearchParams(swms.signonPath.split('?')[1]).get('t');
    const signature = `data:image/png;base64,${Buffer.from('signature').toString('base64')}`;
    const explained = { explained: true, supervisor: 'Sam Lead' };
    for (const name of ['One', 'Two']) assert.equal((await call('POST', `/api/sign/${key}`, { body: { name, signature, confirmed: true, ...explained } })).status, 201);
    const third = await call('POST', `/api/sign/${key}`, { body: { name: 'Three', signature, confirmed: true, ...explained } });
    assert.equal(third.status, 409);
    assert.match((await third.json()).message, /limit of 2 sign-ons/);
  } finally {
    delete process.env.SIGNON_LIMIT;
  }
});
