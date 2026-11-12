// Per-user daily limit on AI requests (D323).
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.RATE_LIMIT_AUTH_VERIFY_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupAccounts, lastLinkToken } = require('./helpers');
const cap = require('../ai-user-cap');

let server;
let base;

test.before(async () => {
  await setupAccounts();
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const { app } = require('../server');
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  delete process.env.AI_USER_DAILY_REQUESTS;
  if (server) server.close();
});

function call(method, route, { body, token } = {}) {
  return fetch(`${base}${route}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function signIn(email) {
  await call('POST', '/api/auth/email', { body: { email } });
  const { token } = await (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).json();
  return token;
}

const run = (req) => new Promise((resolve) => cap.userDailyCap(req, {}, resolve));

test('the limit is read from AI_USER_DAILY_REQUESTS, default 20', () => {
  delete process.env.AI_USER_DAILY_REQUESTS;
  assert.equal(cap.userDailyLimit(), 20);
  process.env.AI_USER_DAILY_REQUESTS = '0';
  assert.equal(cap.userDailyLimit(), 0);
  process.env.AI_USER_DAILY_REQUESTS = 'lots';
  assert.equal(cap.userDailyLimit(), 20);
});

test('a user over the daily limit is refused; another user is not', async () => {
  process.env.AI_USER_DAILY_REQUESTS = '2';
  assert.equal(await run({ user: { id: 'user-cap-a' } }), undefined);
  assert.equal(await run({ user: { id: 'user-cap-a' } }), undefined);
  const third = await run({ user: { id: 'user-cap-a' } });
  assert.equal(third.status, 429);
  assert.match(third.message, /today's 2 AI requests/);
  assert.equal(await run({ user: { id: 'user-cap-b' } }), undefined);
});

test('a limit of 0 blocks, and no signed-in user is not counted', async () => {
  process.env.AI_USER_DAILY_REQUESTS = '0';
  assert.equal((await run({ user: { id: 'user-cap-c' } })).status, 429);
  assert.equal(await run({}), undefined);
});

test('the third POST /api/scope/ai of the day gets 429; GET does not count', async () => {
  process.env.AI_USER_DAILY_REQUESTS = '2';
  const token = await signIn('pat.cap@example.com');
  const body = { text: 'Supply and install all ductwork.', state: 'qld' };
  for (let n = 0; n < 2; n += 1) assert.notEqual((await call('POST', '/api/scope/ai', { token, body })).status, 429);
  for (let n = 0; n < 3; n += 1) assert.equal((await call('GET', '/api/scope/ai', { token })).status, 200);
  const third = await call('POST', '/api/scope/ai', { token, body });
  assert.equal(third.status, 429);
  const other = await signIn('sam.cap@example.com');
  assert.notEqual((await call('POST', '/api/scope/ai', { token: other, body })).status, 429);
});

test('the third POST /api/draft/translation of the day gets 429', async () => {
  process.env.AI_USER_DAILY_REQUESTS = '2';
  const token = await signIn('pat.translate-cap@example.com');
  const body = { input: { state: 'qld', task: 'Erect a modular scaffold to 6 m.', fallRisk: 'yes' }, language: 'vi' };
  for (let n = 0; n < 2; n += 1) assert.notEqual((await call('POST', '/api/draft/translation', { token, body })).status, 429);
  const third = await call('POST', '/api/draft/translation', { token, body });
  assert.equal(third.status, 429);
});
