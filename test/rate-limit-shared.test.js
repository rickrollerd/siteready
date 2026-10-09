// Goals 7 and 9: every server process shares one rate limit count (rate-store.js). Before, each
// of staging's 24 processes kept its own, so the 10 sign-in emails allowed in 15 minutes became
// as many as 240. Here four copies of the app stand in for four processes, sharing one database.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const db = require('../db');
const { SharedStore, fingerprint, TIMEOUT_MS } = require('../rate-store');
const { setupAccounts, mailbox } = require('./helpers');

const SERVER = require.resolve('../server');
const workers = [];

// A fresh copy of server.js: its own app and its own limiters, as in a separate process.
function loadWorker() {
  delete require.cache[SERVER];
  return require(SERVER).app;
}

test.before(async () => {
  await setupAccounts();
  // A real test database (TEST_DATABASE_URL) keeps counts from an earlier run.
  await db.query('DELETE FROM rate_limits');
  for (let i = 0; i < 4; i += 1) {
    const server = loadWorker().listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    workers.push({ server, base: `http://127.0.0.1:${server.address().port}` });
  }
});

test.after(() => {
  for (const { server } of workers) server.close();
});

// Requests go to the workers in turn, as the cluster hands them out. X-Forwarded-For stands
// in for the client's address (the server trusts one proxy, as on Railway).
let turn = 0;
function send(method, route, { body, ip = '203.0.113.7' } = {}) {
  const { base } = workers[turn % workers.length];
  turn += 1;
  return fetch(`${base}${route}`, {
    method,
    headers: { 'X-Forwarded-For': ip, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// What the named limit has left, from the RateLimit header.
function remaining(response, name) {
  const header = response.headers.get('ratelimit') || '';
  const match = new RegExp(`"${name}"; r=(\\d+)`).exec(header);
  return match ? Number(match[1]) : null;
}

test('the 11th sign-in email for one inbox in the window is refused, across four processes', async () => {
  const before = mailbox.length;
  const left = [];
  for (let i = 0; i < 10; i += 1) {
    const response = await send('POST', '/api/auth/email', { body: { email: 'flood@example.com' } });
    assert.equal(response.status, 200, `email ${i + 1}`);
    left.push(remaining(response, 'sign-in-email-inbox'));
  }
  assert.deepEqual(left, [9, 8, 7, 6, 5, 4, 3, 2, 1, 0], 'the count goes down by one each time, whichever process answers');
  const eleventh = await send('POST', '/api/auth/email', { body: { email: 'flood@example.com' } });
  assert.equal(eleventh.status, 429);
  assert.match((await eleventh.json()).message, /Too many requests/);
  assert.ok(Number(eleventh.headers.get('retry-after')) > 0);
  assert.equal(mailbox.length - before, 10, 'only 10 emails sent');
  // Upper case and spaces are the same inbox.
  assert.equal((await send('POST', '/api/auth/email', { body: { email: ' FLOOD@example.com ' } })).status, 429);
});

test('one address can send links to three times as many inboxes, then is refused', async () => {
  const ip = '198.51.100.20';
  for (let i = 0; i < 30; i += 1) {
    const response = await send('POST', '/api/auth/email', { body: { email: `crew${i}@example.com` }, ip });
    assert.equal(response.status, 200, `inbox ${i + 1}`);
    assert.equal(remaining(response, 'sign-in-email-ip'), 29 - i);
  }
  const refused = await send('POST', '/api/auth/email', { body: { email: 'crew30@example.com' }, ip });
  assert.equal(refused.status, 429);
  // Another address on the same inbox count is not held up by this one.
  assert.equal((await send('POST', '/api/auth/email', { body: { email: 'crew30@example.com' }, ip: '198.51.100.21' })).status, 200);
});

test('opening the team list does not use up the sign-in email limit', async () => {
  const response = await send('GET', '/api/company/users', { ip: '198.51.100.30' });
  assert.equal(response.status, 401);
  assert.equal(remaining(response, 'sign-in-email-inbox'), null);
  assert.equal(remaining(response, 'sign-in-email-ip'), null);
  assert.equal(typeof remaining(response, 'api'), 'number', 'the general limit still counts it');
});

test('the general limit counts down evenly across processes', async () => {
  const left = [];
  for (let i = 0; i < 8; i += 1) left.push(remaining(await send('GET', '/api/states', { ip: '198.51.100.40' }), 'api'));
  assert.deepEqual(left, [599, 598, 597, 596, 595, 594, 593, 592]);
});

test('the database holds a fingerprint, never the IP address or email address', async () => {
  const rows = await db.query('SELECT key, hits FROM rate_limits');
  assert.ok(rows.length > 0);
  for (const { key } of rows) {
    assert.doesNotMatch(key, /203\.0\.113|198\.51\.100|@|example/);
    assert.equal(key.length, 32);
  }
  const inbox = rows.find((row) => row.key === fingerprint('sign-in-email-inbox:inbox:flood@example.com'));
  assert.equal(inbox && inbox.hits, 12, 'every request was counted in the one row, refused ones included');
});

test('a window that has ended starts again at one', async () => {
  const store = new SharedStore('window-test');
  store.init({ windowMs: 100 });
  assert.equal((await store.increment('a')).totalHits, 1);
  assert.equal((await store.increment('a')).totalHits, 2);
  await new Promise((resolve) => { setTimeout(resolve, 150); });
  const next = await store.increment('a');
  assert.equal(next.totalHits, 1);
  assert.ok(next.resetTime.getTime() > Date.now());
});

test('if the shared count cannot be read, drafting carries on and sign-in emails stop', async (t) => {
  const real = db.connect();
  const warnings = [];
  t.mock.method(console, 'warn', (line) => warnings.push(line));
  t.mock.method(console, 'error', () => {});
  db.useDatabase({ query: async () => { throw new Error('connect ECONNREFUSED'); } });
  try {
    const states = await send('GET', '/api/states', { ip: '198.51.100.50' });
    assert.equal(states.status, 200, 'fails open: counted in the process instead');
    assert.equal(remaining(states, 'api'), 599);
    const email = await send('POST', '/api/auth/email', { body: { email: 'down@example.com' }, ip: '198.51.100.50' });
    assert.equal(email.status, 503, 'fails closed for sign-in emails');
    assert.equal((await email.json()).message, 'Sign-in emails cannot be sent just now. Try again in a few minutes.');
  } finally {
    db.useDatabase(real);
  }
  assert.ok(warnings.some((line) => /Rate limits: the shared count could not be read \(connect ECONNREFUSED\)/.test(line)));
});

test('a database that does not answer holds a request up for at most a moment', async (t) => {
  const real = db.connect();
  t.mock.method(console, 'warn', () => {});
  db.useDatabase({ query: () => new Promise(() => {}) });
  try {
    const started = Date.now();
    const states = await send('GET', '/api/states', { ip: '198.51.100.60' });
    assert.equal(states.status, 200);
    assert.ok(Date.now() - started < TIMEOUT_MS + 1500);
  } finally {
    db.useDatabase(real);
  }
});

test('a process busy for longer than the time limit still waits for the answer', async (t) => {
  const real = db.connect();
  const warnings = [];
  t.mock.method(console, 'warn', (line) => warnings.push(line));
  // The answer takes several turns of reading input, as connecting to the database does.
  const resetAt = new Date(Date.now() + 60000);
  const turn = (next) => fs.stat(__filename, next);
  db.useDatabase({ query: () => new Promise((resolve) => { turn(() => turn(() => turn(() => resolve({ rows: [{ hits: 7, reset_at: resetAt }] })))); }) });
  try {
    const store = new SharedStore('busy-test', { failClosed: true });
    store.init({ windowMs: 60000 });
    const counted = store.increment('a');
    const until = Date.now() + TIMEOUT_MS + 300;
    while (Date.now() < until) { /* a long draft holding up the process */ }
    assert.equal((await counted).totalHits, 7, 'the shared count, not a refusal or the process count');
  } finally {
    db.useDatabase(real);
  }
  assert.equal(warnings.length, 0);
});

test('without a database, one process still counts and refuses the 11th email', async (t) => {
  const real = db.connect();
  t.mock.method(console, 'error', () => {});
  db.useDatabase(null);
  const app = loadWorker();
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const statuses = [];
    for (let i = 0; i < 11; i += 1) {
      const response = await fetch(`${base}/api/auth/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.70' },
        body: JSON.stringify({ email: 'nodb@example.com' }),
      });
      statuses.push(response.status);
    }
    assert.equal(statuses[10], 429);
    assert.ok(statuses.slice(0, 10).every((status) => status !== 429));
  } finally {
    server.close();
    db.useDatabase(real);
  }
});

test('a database connection dropped while idle does not stop the process', async (t) => {
  const real = db.connect();
  const saved = process.env.DATABASE_URL;
  const warnings = [];
  t.mock.method(console, 'warn', (line) => warnings.push(line));
  process.env.DATABASE_URL = 'postgres://nobody@127.0.0.1:1/none';
  db.useDatabase(null);
  try {
    const pool = db.connect();
    assert.doesNotThrow(() => pool.emit('error', new Error('terminating connection due to administrator command')));
    assert.deepEqual(warnings, ['Database connection lost: terminating connection due to administrator command']);
    await pool.end();
  } finally {
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
    db.useDatabase(real);
  }
});

// With a real Postgres (TEST_DATABASE_URL), the real server in cluster mode with four workers.
test('cluster of four workers on Postgres: the 11th sign-in email is refused', { skip: !process.env.TEST_DATABASE_URL && 'needs TEST_DATABASE_URL' }, async () => {
  const port = 4300 + Math.floor(Math.random() * 500);
  const child = spawn(process.execPath, [SERVER], {
    cwd: path.dirname(SERVER),
    env: { ...process.env, PORT: String(port), WEB_CONCURRENCY: '4', DATABASE_URL: process.env.TEST_DATABASE_URL, DATABASE_SSL: 'off', NODE_ENV: 'test' },
    stdio: 'ignore',
  });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i += 1) {
      try {
        if ((await fetch(`${base}/api/states`)).ok) break;
      } catch {
        // Not listening yet.
      }
      await new Promise((resolve) => { setTimeout(resolve, 100); });
    }
    // Let every worker finish setting up its tables.
    await new Promise((resolve) => { setTimeout(resolve, 1000); });
    const email = `cluster${Date.now()}@example.com`;
    const ip = `192.0.2.${1 + Math.floor(Math.random() * 250)}`;
    const left = [];
    let status = 0;
    for (let i = 0; i < 11; i += 1) {
      const response = await fetch(`${base}/api/auth/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
        body: JSON.stringify({ email }),
      });
      status = response.status;
      if (i < 10) {
        assert.equal(status, 200, `email ${i + 1}`);
        left.push(remaining(response, 'sign-in-email-inbox'));
      }
    }
    assert.deepEqual(left, [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    assert.equal(status, 429);
  } finally {
    child.kill();
  }
});
