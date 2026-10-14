// The reviewer's sign-in emails share the tight email limit, and the review pages have their own (goal 3).
process.env.RATE_LIMIT_EMAIL_REQUESTS = '2';
process.env.RATE_LIMIT_REVIEW_REQUESTS = '3';
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');

test('reviewer sign-in emails and review pages are rate limited', async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const email = () => fetch(`${base}/api/review/email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'pc@builder.example', ref: 'SR-2222-2222' }) });
    assert.notEqual((await email()).status, 429);
    assert.notEqual((await email()).status, 429);
    const third = await email();
    assert.equal(third.status, 429);
    assert.match((await third.json()).message, /Too many requests/);
    // The emails let through count against the review limit too: one more request is let
    // through, then the next is refused.
    assert.equal((await fetch(`${base}/api/review/swms/SR-2222-2222`)).status, 401);
    assert.equal((await fetch(`${base}/api/review/swms/SR-2222-2222`)).status, 429);
  } finally {
    server.close();
  }
});
