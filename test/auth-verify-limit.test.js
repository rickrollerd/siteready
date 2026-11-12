// Defence in depth: POST /api/auth/verify has its own per-address limit (D362).
process.env.RATE_LIMIT_AUTH_VERIFY_REQUESTS = '3';

const test = require('node:test');
const assert = require('node:assert/strict');
const { setupAccounts } = require('./helpers');
const { app } = require('../server');

function remaining(response, name) {
  const header = response.headers.get('ratelimit') || '';
  const match = new RegExp(`"${name}"; r=(\\d+)`).exec(header);
  return match ? Number(match[1]) : null;
}

test('the 4th sign-in verification from one address in the window is refused', async () => {
  await setupAccounts();
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (ip, token) => fetch(`${base}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify({ token }),
  });
  try {
    const ip = '203.0.113.80';
    const left = [];
    for (let i = 0; i < 3; i += 1) {
      const response = await send(ip, `not-a-real-token-${i}`);
      assert.notEqual(response.status, 429, `verify ${i + 1}`);
      left.push(remaining(response, 'auth-verify'));
    }
    assert.deepEqual(left, [2, 1, 0]);
    const fourth = await send(ip, 'not-a-real-token-3');
    assert.equal(fourth.status, 429);
    assert.equal((await fourth.json()).message, 'Too many requests. Try again in 15 minutes.');
    assert.ok(Number(fourth.headers.get('retry-after')) > 0);
    // Another address is not held up by this one.
    const other = await send('203.0.113.81', 'not-a-real-token-other');
    assert.notEqual(other.status, 429);
    assert.equal(remaining(other, 'auth-verify'), 2);
  } finally {
    server.close();
  }
});
