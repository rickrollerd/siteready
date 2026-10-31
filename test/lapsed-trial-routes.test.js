// D317: lapsed trials cannot spend on /api/check or /api/draft/translation.
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const db = require('../db');
const { setupAccounts, lastLinkToken } = require('./helpers');

let server;
let base;

async function call(method, route, { body, token } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

async function signIn(email) {
  await call('POST', '/api/auth/email', { body: { email } });
  return (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).data.token;
}

async function lapseTrial(token) {
  const user = await db.one('SELECT * FROM users JOIN sessions ON sessions.user_id = users.id WHERE sessions.token_hash = $1', [require('../auth').hash(token)]);
  await db.query('UPDATE companies SET trial_ends_at = $1 WHERE id = $2', [new Date(Date.now() - 24 * 60 * 60 * 1000), user.company_id]);
}

test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
});

const CHECK_BODY = { draft: { state: 'qld', task: 'Paint the shop walls.', fallRisk: 'no' } };
const TRANSLATION_BODY = { input: { state: 'qld', task: 'Dig a trench 1 m deep with an excavator.', fallRisk: 'no' }, language: 'vi' };

test('POST /api/check requires access, returning 402 for a lapsed trial', async () => {
  const token = await signIn('lapsed-check@example.com');
  await lapseTrial(token);
  const out = await call('POST', '/api/check', { token, body: CHECK_BODY });
  assert.equal(out.status, 402);
  assert.match(out.data.message, /Your free trial has ended. Subscribe to keep downloading, saving and sharing SWMS./);
});

test('POST /api/draft/translation requires access, returning 402 for a lapsed trial', async () => {
  const token = await signIn('lapsed-translate@example.com');
  await lapseTrial(token);
  const out = await call('POST', '/api/draft/translation', { token, body: TRANSLATION_BODY });
  assert.equal(out.status, 402);
  assert.match(out.data.message, /Your free trial has ended. Subscribe to keep downloading, saving and sharing SWMS./);
});
