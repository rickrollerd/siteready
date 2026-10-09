process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.TEST_HOOKS_SECRET = 'a'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const testhooks = require('../testhooks');
const { setupAccounts, mailbox, lastLinkToken, ANSWERED } = require('./helpers');

let server;
let base;
const SECRET = { 'X-Test-Secret': 'a'.repeat(40) };

test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

const call = (method, route, { body, headers } = {}) => fetch(`${base}${route}`, {
  method,
  headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
  body: body ? JSON.stringify(body) : undefined,
});

test('mail to a test address goes to the test inbox, not out', async () => {
  const before = mailbox.length;
  assert.equal((await call('POST', '/api/auth/email', { body: { email: 'tester1@siteready.test' } })).status, 200);
  assert.equal(mailbox.length, before, 'nothing was sent');
  const inbox = await (await call('GET', '/api/test/inbox?to=tester1@siteready.test', { headers: SECRET })).json();
  assert.equal(inbox.messages.length, 1);
  const link = /\?login=([A-Za-z0-9_-]+)/.exec(inbox.messages[0].text);
  assert.ok(link, 'the sign-in link is readable');
  assert.equal((await call('POST', '/api/auth/verify', { body: { token: link[1] } })).status, 200);
  // Other addresses are sent as normal.
  await call('POST', '/api/auth/email', { body: { email: 'real@co.example' } });
  assert.equal(mailbox.length, before + 1);
});

test('the hooks answer only with the secret', async () => {
  assert.equal((await call('GET', '/api/test/inbox?to=tester1@siteready.test')).status, 404);
  assert.equal((await call('GET', '/api/test/inbox?to=tester1@siteready.test', { headers: { 'X-Test-Secret': 'b'.repeat(40) } })).status, 404);
  assert.equal((await call('POST', '/api/test/run-reminders', { body: {} })).status, 404);
  assert.equal((await call('GET', '/api/test/inbox?to=real@co.example', { headers: SECRET })).status, 400, 'only test addresses can be read');
});

test('reminders can be run as if on a later date', async () => {
  const later = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString();
  const run = await (await call('POST', '/api/test/run-reminders', { headers: SECRET, body: { now: later } })).json();
  assert.equal(run.ok, true);
  assert.equal(run.now, later);
  assert.equal((await call('POST', '/api/test/run-reminders', { headers: SECRET, body: { now: 'soon' } })).status, 400);
});

let abnSeed = 600;
// A valid ABN for each test business.
function newAbn() {
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  for (;;) {
    abnSeed += 1;
    const tail = String(700000000 + abnSeed * 7919).slice(-9);
    for (let head = 10; head <= 99; head += 1) {
      const digits = `${head}${tail}`;
      const total = [...digits].reduce((sum, d, i) => sum + (Number(d) - (i === 0 ? 1 : 0)) * weights[i], 0);
      if (total % 89 === 0) return digits;
    }
  }
}

// A business signed in by the test inbox, with one saved SWMS.
async function testBusiness(email, name, abn = newAbn()) {
  await call('POST', '/api/auth/email', { body: { email } });
  const inbox = email.endsWith('@siteready.test') ? (await (await call('GET', `/api/test/inbox?to=${email}`, { headers: SECRET })).json()).messages : [];
  const link = inbox.length ? /\?login=([A-Za-z0-9_-]+)/.exec(inbox[0].text)[1] : lastLinkToken(email);
  const { token } = await (await call('POST', '/api/auth/verify', { body: { token: link } })).json();
  const auth = { Authorization: `Bearer ${token}` };
  await call('PUT', '/api/company', { headers: auth, body: { name, abn } });
  const input = { ...ANSWERED, state: 'nsw', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no', date: '5 October 2026' };
  const saved = await (await call('POST', '/api/swms', { headers: auth, body: { input, title: 'Test fence', reviewConfirmed: true, reviewedBy: 'Alex Chen' } })).json();
  return { auth, id: saved.swms.id };
}

test('a change to the law can be released to a test business, and its notice read in the test inbox (goal 10)', async () => {
  const mine = await testBusiness('notice-admin@siteready.test', 'Notice Test Pty Ltd');
  const reason = 'Test: the NSW Work Health and Safety Regulation 2025 has a new version in force.';
  const run = await (await call('POST', '/api/test/library-notice', { headers: SECRET, body: { reason, swmsIds: [mine.id] } })).json();
  assert.equal(run.ok, true);
  assert.deepEqual(run.results.map((item) => [item.swms, item.companies, item.emails]), [[1, 1, 1]]);
  const inbox = await (await call('GET', '/api/test/inbox?to=notice-admin@siteready.test', { headers: SECRET })).json();
  assert.equal(inbox.messages[0].subject, 'SiteReady: 1 SWMS to review after a change');
  assert.match(inbox.messages[0].text, /- Test fence \(revision 1\): 1 change/);
  const list = (await (await call('GET', '/api/swms', { headers: mine.auth })).json()).swms;
  assert.deepEqual(list[0].changeReview, [reason]);
  // A real business's SWMS cannot be changed by the hook.
  const real = await testBusiness('owner@realco.example', 'Real Co Pty Ltd');
  assert.equal((await call('POST', '/api/test/library-notice', { headers: SECRET, body: { reason, swmsIds: [real.id] } })).status, 400);
  assert.equal((await call('POST', '/api/test/library-notice', { body: { reason, swmsIds: [mine.id] } })).status, 404);
});

test('the hooks are never on in production or with a short secret', () => {
  assert.equal(testhooks.enabled(), true);
  process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
  assert.equal(testhooks.enabled(), false);
  delete process.env.RAILWAY_ENVIRONMENT_NAME;
  process.env.TEST_HOOKS_SECRET = 'short';
  assert.equal(testhooks.enabled(), false);
  process.env.TEST_HOOKS_SECRET = 'a'.repeat(40);
});
