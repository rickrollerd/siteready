// The owner's own accounts (ADMIN_EMAILS) keep full access after the free trial ends,
// so the owner can always use the app. Everyone else still meets the paywall.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.ADMIN_EMAILS = 'owner@sitewrite.example';
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const db = require('../db');
const { setupAccounts, lastLinkToken } = require('./helpers');

let server;
let base;

test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

const call = (method, route, { body, token } = {}) => fetch(`${base}${route}`, {
  method,
  headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});

async function signIn(email) {
  await call('POST', '/api/auth/email', { body: { email } });
  return (await (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).json()).token;
}

async function endTrial(email) {
  await db.query('UPDATE companies SET trial_ends_at = $1 WHERE email = $2', [new Date(Date.now() - 86400000), email]);
}

test('an owner email keeps access after its trial has ended', async () => {
  const token = await signIn('owner@sitewrite.example');
  await endTrial('owner@sitewrite.example');
  const { company } = await (await call('GET', '/api/company', { token })).json();
  assert.equal(company.planStatus, 'trial');
  assert.ok(new Date(company.trialEndsAt) < new Date());
  assert.equal(company.hasAccess, true);
  // A gated route lets the owner through: whatever it answers, it is not the paywall.
  const gated = await call('POST', '/api/swms', { token, body: {} });
  assert.notEqual(gated.status, 402);
  assert.notEqual(gated.status, 401);
});

test('any other email still meets the paywall after its trial has ended', async () => {
  const token = await signIn('subbie@co.example');
  await endTrial('subbie@co.example');
  const { company } = await (await call('GET', '/api/company', { token })).json();
  assert.equal(company.hasAccess, false);
  const gated = await call('POST', '/api/swms', { token, body: {} });
  assert.equal(gated.status, 402);
});
