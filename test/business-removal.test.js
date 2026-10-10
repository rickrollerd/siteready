// Deleting a whole business (privacy policy: deleted within 30 days of a request) and the list of
// businesses due for removal 12 months after they stop paying.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.ADMIN_EMAILS = 'owner@removal.example';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('../server');
const db = require('../db');
const { validAbn } = require('../accounts');
const { businessCode } = require('../industry');
const { dueForRemoval } = require('../business-removal');
const { setupAccounts, lastLinkToken, ANSWERED, ready } = require('./helpers');

let server;
let base;
let owner;

test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  owner = await signIn('owner@removal.example');
});

test.after(() => server.close());

const call = (method, route, { body, token } = {}) => fetch(`${base}${route}`, {
  method,
  headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});
const json = async (method, route, options) => {
  const response = await call(method, route, options);
  return { status: response.status, data: await response.json().catch(() => ({})) };
};

async function signIn(email) {
  await call('POST', '/api/auth/email', { body: { email } });
  return (await json('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).data.token;
}

function abnFor(seed) {
  for (let n = 0; ; n += 1) {
    const digits = crypto.createHash('sha256').update(`${seed}${n}`).digest('hex').replace(/\D/g, '').slice(0, 11);
    if (digits.length === 11 && digits[0] !== '0' && validAbn(digits)) return digits;
  }
}

// A 1 by 1 pixel PNG, as a logo.
const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SIGNATURE = `data:image/png;base64,${Buffer.from('signature').toString('base64')}`;
const CONFIRM = { reviewConfirmed: true, reviewedBy: 'Alex Chen' };

// Every table in db.js, and the rows in it tied to one business. The de-identified tables are
// checked separately: their rows stay and hold nothing of the business.
const ID = (b) => [b.companyId];
const TIED = {
  companies: ['SELECT id FROM companies WHERE id = $1', ID],
  users: ['SELECT id FROM users WHERE company_id = $1', ID],
  login_tokens: ['SELECT token_hash FROM login_tokens WHERE company_id = $1 OR email LIKE $2', (b) => [b.companyId, `%@${b.domain}`]],
  sessions: ['SELECT token_hash FROM sessions WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)', ID],
  passkeys: ['SELECT id FROM passkeys WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)', ID],
  challenges: ['SELECT id FROM challenges WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)', ID],
  signins: ['SELECT id FROM signins WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)', ID],
  sites: ['SELECT id FROM sites WHERE company_id = $1', ID],
  swms: ['SELECT id FROM swms WHERE company_id = $1', ID],
  swms_revisions: ['SELECT id FROM swms_revisions WHERE swms_id = $1', (b) => [b.swmsId]],
  signons: ['SELECT id FROM signons WHERE swms_id = $1', (b) => [b.swmsId]],
  sign_reads: ['SELECT id FROM sign_reads WHERE swms_id = $1', (b) => [b.swmsId]],
  sign_translations: ['SELECT id FROM sign_translations WHERE swms_id = $1', (b) => [b.swmsId]],
  swms_review_flags: ['SELECT swms_id FROM swms_review_flags WHERE swms_id = $1', (b) => [b.swmsId]],
  swms_refs: ['SELECT ref FROM swms_refs WHERE company_id = $1 OR swms_id = $2', (b) => [b.companyId, b.swmsId]],
  ai_readings: ['SELECT id FROM ai_readings WHERE company_id = $1', ID],
  events: ['SELECT id FROM events WHERE company_id = $1', ID],
  industry_records: ['SELECT id FROM industry_records WHERE business = $1', (b) => [businessCode(b.companyId)]],
  admin_access_log: ["SELECT id FROM admin_access_log WHERE action <> 'business_deleted' AND (target = $1 OR target = $2 OR target = $3)", (b) => [b.companyId, b.refs[0], b.search]],
  trial_abns: ['SELECT abn FROM trial_abns WHERE company_id = $1', ID],
};
// No business, account, site or SWMS id in them: kept when a business is deleted.
const DE_IDENTIFIED = ['control_edit_events', 'control_edits', 'check_question_misses', 'draft_translations'];
// Not about any one business: the server's error log and the record of library notices sent.
const NOT_BUSINESS = ['errors', 'library_notices'];

async function tiedCounts(business) {
  const out = {};
  for (const [table, [sql, params]] of Object.entries(TIED)) out[table] = (await db.query(sql, params(business))).length;
  return out;
}

// A business with rows in every table, made as a user would, through the app, where the app can.
async function seedBusiness(key) {
  const domain = `${key.toLowerCase()}-removal.example`;
  const admin = `admin@${domain}`;
  const name = `${key} Removal Test Pty Ltd`;
  const abn = abnFor(key);
  const token = await signIn(admin);
  assert.equal((await json('PUT', '/api/company', { token, body: { name, abn, address: `1 ${key} Street, Paddington QLD 4064`, phone: '0400 000 000', email: admin, logo: LOGO } })).status, 200);
  const { company_id: companyId } = await db.one('SELECT company_id FROM users WHERE email = $1', [admin]);
  // A second person, signed in, and a sign-in link not yet used.
  await call('POST', '/api/company/users', { token, body: { email: `member@${domain}` } });
  await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(`member@${domain}`) } });
  assert.equal((await db.one('SELECT company_id FROM users WHERE email = $1', [`member@${domain}`])).company_id, companyId);
  await call('POST', '/api/auth/email', { body: { email: admin } });
  // Face ID: a challenge from the app, and a key (the browser's part cannot run in a test).
  await call('POST', '/api/auth/passkey/register/options', { token });
  const userId = (await db.one('SELECT id FROM users WHERE email = $1', [admin])).id;
  await db.query('INSERT INTO passkeys (id, user_id, public_key, created_at) VALUES ($1, $2, $3, $4)', [`pk-${key}`, userId, 'key', new Date()]);
  const { data: { site } } = await json('POST', '/api/sites', { token, body: { name: `${key} site`, workplace: `9 ${key} Road, Toowong QLD 4066`, principalContractor: 'ABC Builders Pty Ltd' } });
  // A saved SWMS, with a second revision, a download and worker sign-ons.
  const input = ready({
    ...ANSWERED, workplace: `9 ${key} Road, Toowong QLD 4066`, state: 'qld', trade: 'fire',
    task: 'Install sprinkler pipework in the ward ceilings from scissor lifts more than 2 m above the floor.',
    fallRisk: 'yes', facts: { fallControl: 'Scissor lifts with guardrails are used for all work above 2 m.' },
  });
  const saved = await json('POST', '/api/swms', { token, body: { input, siteId: site.id, ...CONFIRM } });
  assert.equal(saved.status, 201);
  const swms = saved.data.swms;
  process.env.CONTROL_LEARNING = 'on';
  try {
    // A changed control, kept de-identified by control learning.
    const step = (await json('GET', `/api/swms/${swms.id}`, { token })).data.draft.jobSteps[0].step;
    const revised = { ...input, controlEdits: { [step]: { added: ['A toolbox talk is held each morning.'] } } };
    assert.equal((await json('PUT', `/api/swms/${swms.id}`, { token, body: { input: revised, ...CONFIRM, reason: 'Toolbox talk added' } })).status, 200);
  } finally {
    delete process.env.CONTROL_LEARNING;
  }
  assert.equal((await call('GET', `/api/swms/${swms.id}/docx`, { token })).status, 200);
  const signKey = swms.signonPath.split('t=')[1];
  await call('GET', `/api/sign/${signKey}`);
  const signed = await json('POST', `/api/sign/${signKey}`, { body: { name: `${key} Worker`, company: `${key} Crew`, signature: SIGNATURE, confirmed: true, explained: true, supervisor: `${key} Supervisor` } });
  assert.equal(signed.status, 201);
  // Rows the app makes only with the AI key or a released library notice, written here.
  const now = new Date();
  await db.query('INSERT INTO sign_translations (id, swms_id, content_hash, language, translation, created_at) VALUES ($1, $2, $3, $4, $5, $6)', [`tr-${key}`, swms.id, 'h', 'vi', '{}', now]);
  await db.query('INSERT INTO swms_review_flags (swms_id, notice_id, revision, reason, flagged_at) VALUES ($1, $2, $3, $4, $5)', [swms.id, 'notice-1', 2, 'A code changed.', now]);
  await db.query('INSERT INTO ai_readings (id, company_id, doc_hash, brief_version, status, created_at) VALUES ($1, $2, $3, $4, $5, $6)', [`ai-${key}`, companyId, 'doc', 'v1', 'done', now]);
  // The owner looks at the account, a reference and searches for it: all in the access log.
  const refs = (await db.query('SELECT ref FROM swms_refs WHERE company_id = $1', [companyId])).map((row) => row.ref);
  assert.equal((await json('GET', `/api/admin/companies/${companyId}`, { token: owner })).status, 200);
  assert.equal((await json('GET', `/api/admin/refs/${refs[0]}`, { token: owner })).status, 200);
  const search = `${key.toLowerCase()} removal`;
  assert.equal((await json('GET', `/api/admin/companies?q=${encodeURIComponent(search)}`, { token: owner })).status, 200);
  return { key, domain, admin, name, abn, token, companyId, swmsId: swms.id, signKey, refs, search };
}

// Every table named in db.js.
const SCHEMA_TABLES = [...fs.readFileSync(path.join(__dirname, '..', 'db.js'), 'utf8').matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);

test('every table in db.js is either checked here or holds no business link', () => {
  const covered = new Set([...Object.keys(TIED), ...DE_IDENTIFIED, ...NOT_BUSINESS]);
  assert.deepEqual(SCHEMA_TABLES.filter((table) => !covered.has(table)), [], 'a new table must be added to the deletion and to this test');
});

test('the owner deletes a whole business: every row tied to it goes, another business is untouched', async () => {
  const a = await seedBusiness('Alpha');
  const b = await seedBusiness('Bravo');
  const before = { a: await tiedCounts(a), b: await tiedCounts(b) };
  for (const [table, n] of Object.entries(before.a)) assert.ok(n > 0, `the seeded business has rows in ${table}`);
  for (const [table, n] of Object.entries(before.b)) assert.ok(n > 0, `the other business has rows in ${table}`);
  assert.equal((await db.one('SELECT logo FROM companies WHERE id = $1', [a.companyId])).logo, LOGO, 'the logo is kept in the company row, which goes');
  const learning = Number((await db.one('SELECT COUNT(*) AS n FROM control_edit_events')).n);
  assert.ok(learning >= 2, 'control learning rows for both businesses');
  const verified = await json('GET', `/api/verify/${a.refs[0]}`);
  assert.equal(verified.data.found, true);
  assert.equal(verified.data.business, a.name);

  // Only the owner; the name must be typed; a running subscription is refused.
  assert.equal((await json('POST', `/api/admin/companies/${a.companyId}/delete`, { token: a.token, body: { confirm: a.name } })).status, 403);
  const wrong = await json('POST', `/api/admin/companies/${a.companyId}/delete`, { token: owner, body: { confirm: 'Alpha' } });
  assert.equal(wrong.status, 400);
  assert.match(wrong.data.message, /business name/);
  for (const status of ['active', 'past_due', 'trialing']) {
    await db.query('UPDATE companies SET plan_status = $1 WHERE id = $2', [status, a.companyId]);
    const live = await json('POST', `/api/admin/companies/${a.companyId}/delete`, { token: owner, body: { confirm: a.name } });
    assert.equal(live.status, 409, status);
    assert.match(live.data.message, /Cancel the subscription in Stripe first/);
  }
  await db.query("UPDATE companies SET plan_status = 'canceled', stripe_customer_id = 'cus_alpha' WHERE id = $1", [a.companyId]);
  assert.deepEqual(await tiedCounts(a), before.a, 'nothing removed by a refused delete');

  const done = await json('POST', `/api/admin/companies/${a.companyId}/delete`, { token: owner, body: { confirm: `  ${a.name.toUpperCase()} ` } });
  assert.equal(done.status, 200);
  assert.equal(done.data.id, a.companyId);
  assert.equal(done.data.stripeCustomer, 'cus_alpha', 'the owner is told the Stripe customer is still in Stripe');

  // Nothing tied to the deleted business is left in any table; the other business keeps all of its rows.
  const after = await tiedCounts(a);
  for (const table of Object.keys(TIED)) assert.equal(after[table], 0, `${table} still holds rows of the deleted business`);
  assert.deepEqual(await tiedCounts(b), before.b);
  // No row anywhere holds its name, ids, emails, site, workers, references or sign-on key. Its
  // ABN is kept, in trial_abns only, and its account id only in the one access log entry.
  const markers = [a.companyId, a.swmsId, a.signKey, a.name, a.domain, `${a.key} site`, `${a.key} Road`, `${a.key} Street`, `${a.key} Worker`, `${a.key} Crew`, `${a.key} Supervisor`, ...a.refs];
  for (const table of SCHEMA_TABLES) {
    const rows = await db.query(`SELECT * FROM ${table}`);
    for (const row of rows) {
      const text = JSON.stringify(row);
      const allowed = table === 'admin_access_log' && row.action === 'business_deleted';
      for (const marker of markers) if (!allowed) assert.ok(!text.includes(marker), `${table} still holds ${marker}`);
      if (table !== 'trial_abns') assert.ok(!text.includes(a.abn), `${table} still holds the ABN`);
    }
  }
  const abnRow = await db.one('SELECT * FROM trial_abns WHERE abn = $1', [a.abn]);
  assert.equal(abnRow.company_id, '', 'the ABN is kept with no link to the account');
  // The de-identified control learning rows stay.
  assert.equal(Number((await db.one('SELECT COUNT(*) AS n FROM control_edit_events')).n), learning);

  // One access log entry: a business was deleted, its account id and the date, no name.
  const logged = await db.query("SELECT * FROM admin_access_log WHERE action = 'business_deleted'");
  assert.equal(logged.length, 1);
  assert.equal(logged[0].target, a.companyId);
  assert.equal(logged[0].admin_email, 'owner@removal.example');
  assert.ok(Date.now() - new Date(logged[0].created_at).getTime() < 60000);

  // The public check no longer finds its references; its people are signed out; the sign-on link is gone.
  const gone = await json('GET', `/api/verify/${a.refs[0]}`);
  assert.equal(gone.data.found, false);
  assert.match(gone.data.message, /not in SiteReady's records/);
  assert.equal((await call('GET', '/api/me', { token: a.token })).status, 401);
  assert.equal((await call('GET', `/api/sign/${a.signKey}`)).status, 404);
  assert.equal((await json('GET', `/api/admin/companies/${a.companyId}`, { token: owner })).status, 404);
  // The other business still works.
  assert.equal((await call('GET', '/api/me', { token: b.token })).status, 200);
  assert.equal((await json('GET', `/api/verify/${b.refs[0]}`)).data.found, true);

  // Signing up again with the same ABN does not give a second free trial.
  const again = await signIn(`again@${a.domain}`);
  const profile = await json('PUT', '/api/company', { token: again, body: { name: a.name, abn: a.abn } });
  assert.match(profile.data.notice, /already had its free trial/);
  assert.equal(profile.data.company.hasAccess, false);
  // The owner's page says the trial was on an account since deleted.
  const fresh = (await db.one('SELECT company_id FROM users WHERE email = $1', [`again@${a.domain}`])).company_id;
  const view = await json('GET', `/api/admin/companies/${fresh}`, { token: owner });
  assert.equal(view.data.trialAbn.holderDeleted, true);
});

test('a delete stopped part way is finished by running it again', async () => {
  const c = await seedBusiness('Charlie');
  const query = db.query;
  let calls = 0;
  db.query = async (text, params) => {
    calls += 1;
    if (/DELETE FROM swms WHERE/.test(text)) throw new Error('connection lost');
    return query(text, params);
  };
  try {
    const failed = await json('POST', `/api/admin/companies/${c.companyId}/delete`, { token: owner, body: { confirm: c.name } });
    assert.equal(failed.status, 500);
  } finally {
    db.query = query;
  }
  assert.ok(calls > 0);
  assert.equal((await json('POST', `/api/admin/companies/${c.companyId}/delete`, { token: owner, body: { confirm: c.name } })).status, 200);
  for (const [table, n] of Object.entries(await tiedCounts(c))) assert.equal(n, 0, table);
});

test('businesses due for removal: subscription or trial ended more than 12 months ago, with the date, listed for the owner only', async () => {
  const DAY = 86400000;
  const now = Date.now();
  const add = async (name, plan, { trialEnds = now + 14 * DAY, ended = null } = {}) => {
    const id = crypto.randomUUID();
    await db.query('INSERT INTO companies (id, name, trial_ends_at, plan_status, plan_ended_at, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, name, new Date(trialEnds), plan, ended ? new Date(ended) : null, new Date(now - 800 * DAY)]);
    return id;
  };
  const oldTrial = await add('Old Trial Co', 'trial', { trialEnds: now - 400 * DAY });
  const recentTrial = await add('Recent Trial Co', 'trial', { trialEnds: now - 300 * DAY });
  const onTrial = await add('On Trial Co', 'trial');
  const oldCancel = await add('Old Cancel Co', 'canceled', { ended: now - 380 * DAY });
  const recentCancel = await add('Recent Cancel Co', 'canceled', { ended: now - 100 * DAY });
  const paying = await add('Paying Co', 'active');
  const overdue = await add('Overdue Co', 'past_due');
  // Cancelled before the end date was kept: the day the cancellation was counted.
  const counted = await add('Counted Cancel Co', 'canceled');
  await db.query('INSERT INTO events (id, company_id, type, created_at) VALUES ($1, $2, $3, $4)', [crypto.randomUUID(), counted, 'plan_canceled', new Date(now - 500 * DAY)]);
  const unknown = await add('Unknown End Co', 'canceled');

  const list = await dueForRemoval(new Date(now));
  const ids = list.map((item) => item.id);
  for (const id of [oldTrial, oldCancel, counted, unknown]) assert.ok(ids.includes(id));
  for (const id of [recentTrial, onTrial, recentCancel, paying, overdue]) assert.ok(!ids.includes(id));
  const item = (id) => list.find((entry) => entry.id === id);
  assert.equal(item(oldTrial).reason, 'Free trial ended');
  assert.equal(new Date(item(oldTrial).endedAt).getTime(), now - 400 * DAY);
  assert.equal(item(oldCancel).reason, 'Subscription ended');
  assert.equal(new Date(item(counted).endedAt).getTime(), now - 500 * DAY);
  assert.equal(item(unknown).endedAt, null, 'no date known: listed for the owner to check in Stripe');
  assert.ok(ids.indexOf(counted) < ids.indexOf(oldTrial), 'oldest first');

  const shown = await json('GET', '/api/admin/removal-due', { token: owner });
  assert.equal(shown.status, 200);
  assert.equal(shown.data.months, 12);
  assert.ok(shown.data.companies.some((entry) => entry.id === oldTrial && entry.accountLink.includes(oldTrial)));
  const nosy = await signIn('nosy@removal-list.example');
  assert.equal((await json('GET', '/api/admin/removal-due', { token: nosy })).status, 403);
  // Nothing is deleted by listing.
  assert.ok(await db.one('SELECT id FROM companies WHERE id = $1', [oldTrial]));
  assert.ok((await db.query("SELECT id FROM admin_access_log WHERE action = 'removal_list'")).length >= 1);
});
