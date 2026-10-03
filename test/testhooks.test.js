process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.TEST_HOOKS_SECRET = 'a'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const testhooks = require('../testhooks');
const { setupAccounts, mailbox } = require('./helpers');

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

test('the hooks are never on in production or with a short secret', () => {
  assert.equal(testhooks.enabled(), true);
  process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
  assert.equal(testhooks.enabled(), false);
  delete process.env.RAILWAY_ENVIRONMENT_NAME;
  process.env.TEST_HOOKS_SECRET = 'short';
  assert.equal(testhooks.enabled(), false);
  process.env.TEST_HOOKS_SECRET = 'a'.repeat(40);
});
