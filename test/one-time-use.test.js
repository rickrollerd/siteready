// Sign-in links and Face ID challenges work once (outside review, finding 5): two requests with the
// same one at the same moment, and exactly one gets through.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.RATE_LIMIT_EMAIL_IP_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const db = require('../db');
const auth = require('../auth');
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

const call = (route, body) => fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
const both = async (route, body) => Promise.all([call(route, body), call(route, body)]);
const statuses = (responses) => responses.map((response) => response.status).sort();

test('an account sign-in link used twice at once signs in once', async () => {
  for (let round = 0; round < 5; round += 1) {
    const email = `twice${round}@co.example`;
    assert.equal((await call('/api/auth/email', { email })).status, 200);
    const responses = await both('/api/auth/verify', { token: lastLinkToken(email) });
    assert.deepEqual(statuses(responses), [200, 400], `round ${round}`);
    const sessions = await db.query('SELECT sessions.token_hash FROM sessions JOIN users ON users.id = sessions.user_id WHERE users.email = $1', [email]);
    assert.equal(sessions.length, 1, 'one session');
    assert.equal((await db.query('SELECT id FROM users WHERE email = $1', [email])).length, 1, 'one user');
  }
});

test('a reviewer sign-in link used twice at once signs in once, and neither link opens the other kind', async () => {
  for (let round = 0; round < 5; round += 1) {
    const email = `lead${round}@builder.example`;
    assert.equal((await call('/api/hse/email', { email })).status, 200);
    const token = lastLinkToken(email);
    // An account's sign-in does not take a reviewer's link, and leaves it unused.
    assert.equal((await call('/api/auth/verify', { token })).status, 400);
    const responses = await both('/api/hse/verify', { token });
    assert.deepEqual(statuses(responses), [200, 400], `round ${round}`);
    const reviewer = await db.one('SELECT id FROM reviewers WHERE email = $1', [email]);
    assert.equal((await db.query('SELECT token_hash FROM reviewer_sessions WHERE reviewer_id = $1', [reviewer.id])).length, 1);
  }
  const email = 'plain@co.example';
  await call('/api/auth/email', { email });
  assert.equal((await call('/api/hse/verify', { token: lastLinkToken(email) })).status, 400, 'a reviewer sign-in does not take an account link');
  assert.equal((await call('/api/auth/verify', { token: lastLinkToken(email) })).status, 200, 'and leaves it unused');
});

test('an expired sign-in link is refused', async () => {
  const email = 'late@co.example';
  await call('/api/auth/email', { email });
  await db.query('UPDATE login_tokens SET expires_at = $1 WHERE email = $2', [new Date(Date.now() - 1000), email]);
  const response = await call('/api/auth/verify', { token: lastLinkToken(email) });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /expired or has been used/);
});

test('a Face ID challenge used twice at once is taken once', async () => {
  for (let round = 0; round < 5; round += 1) {
    const { challengeId } = await (await call('/api/auth/passkey/login/options')).json();
    assert.ok(challengeId);
    // No passkey has this id: the request that takes the challenge goes on to look for the key.
    const responses = await both('/api/auth/passkey/login', { challengeId, response: { id: 'no-such-key' } });
    const messages = (await Promise.all(responses.map((response) => response.json()))).map((body) => body.message).sort();
    assert.deepEqual(messages, ['Face ID sign-in timed out. Try again.', 'This Face ID is not set up for SiteWrite on this device. Sign in with an email link first.'], `round ${round}`);
    assert.equal(await db.one('SELECT id FROM challenges WHERE id = $1', [challengeId]), null);
  }
});

test('an expired Face ID challenge is refused', async () => {
  const { challengeId } = await (await call('/api/auth/passkey/login/options')).json();
  await db.query('UPDATE challenges SET expires_at = $1 WHERE id = $2', [new Date(Date.now() - 1000), challengeId]);
  const response = await call('/api/auth/passkey/login', { challengeId, response: { id: 'no-such-key' } });
  assert.match((await response.json()).message, /timed out/);
  assert.equal(typeof auth.finishLogin, 'function');
});
