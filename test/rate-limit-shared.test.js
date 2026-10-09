// Goals 7 and 9: every worker process shares one rate limit count, kept in the primary
// process's memory (rate-store.js). Before, each of staging's 24 workers kept its own, so the
// 10 sign-in emails allowed in 15 minutes became as many as 240. Here four copies of the app
// stand in for four workers, asking one primary; the last test runs the real cluster.
const test = require('node:test');
const assert = require('node:assert/strict');
const cluster = require('cluster');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const db = require('../db');
const { SharedStore, answer, TAG, TIMEOUT_MS } = require('../rate-store');
const { setupAccounts, mailbox } = require('./helpers');

const SERVER = require.resolve('../server');
const workers = [];
const asked = [];

// A fresh copy of server.js: its own app and its own limiters, as in a separate worker.
function loadWorker() {
  delete require.cache[SERVER];
  return require(SERVER).app;
}

// The worker's channel to the primary, as the cluster gives it: questions sent together reach
// the primary together, and each answer comes back as a message when the worker next reads
// its input.
let queue = [];
function primaryAnswers(message, handle, options, callback) {
  asked.push(message);
  if (!queue.length) {
    setImmediate(() => {
      const batch = queue;
      queue = [];
      for (const question of batch) Promise.resolve(answer(question)).then((reply) => process.emit('message', reply));
    });
  }
  queue.push(message);
  if (callback) callback(null);
  return true;
}

let realSend;
test.before(async () => {
  await setupAccounts();
  realSend = process.send;
  process.send = primaryAnswers;
  cluster.isWorker = true;
  for (let i = 0; i < 4; i += 1) {
    const server = loadWorker().listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    workers.push({ server, base: `http://127.0.0.1:${server.address().port}` });
  }
});

test.after(() => {
  cluster.isWorker = false;
  process.send = realSend;
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

test('the 11th sign-in email for one inbox in the window is refused, across four workers', async () => {
  const before = mailbox.length;
  const left = [];
  for (let i = 0; i < 10; i += 1) {
    const response = await send('POST', '/api/auth/email', { body: { email: 'flood@example.com' } });
    assert.equal(response.status, 200, `email ${i + 1}`);
    left.push(remaining(response, 'sign-in-email-inbox'));
  }
  assert.deepEqual(left, [9, 8, 7, 6, 5, 4, 3, 2, 1, 0], 'the count goes down by one each time, whichever worker answers');
  const eleventh = await send('POST', '/api/auth/email', { body: { email: 'flood@example.com' } });
  assert.equal(eleventh.status, 429);
  assert.equal((await eleventh.json()).message, 'Too many requests. Try again in 15 minutes.');
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
  // Another address is not held up by this one.
  assert.equal((await send('POST', '/api/auth/email', { body: { email: 'crew30@example.com' }, ip: '198.51.100.21' })).status, 200);
});

test('opening the team list does not use up the sign-in email limit', async () => {
  const response = await send('GET', '/api/company/users', { ip: '198.51.100.30' });
  assert.equal(response.status, 401);
  assert.equal(remaining(response, 'sign-in-email-inbox'), null);
  assert.equal(remaining(response, 'sign-in-email-ip'), null);
  assert.equal(typeof remaining(response, 'api'), 'number', 'the general limit still counts it');
});

test('the general limit counts down evenly across workers', async () => {
  const left = [];
  for (let i = 0; i < 8; i += 1) left.push(remaining(await send('GET', '/api/states', { ip: '198.51.100.40' }), 'api'));
  assert.deepEqual(left, [599, 598, 597, 596, 595, 594, 593, 592]);
});

test('requests arriving together each get their own count', async () => {
  const replies = await Promise.all(Array.from({ length: 40 }, () => send('GET', '/api/states', { ip: '198.51.100.45' })));
  const left = replies.map((response) => remaining(response, 'api')).sort((x, y) => y - x);
  assert.deepEqual(left, Array.from({ length: 40 }, (_, i) => 599 - i));
});

test('counts are kept in memory only: no email address goes to the primary, nothing to the database', async () => {
  assert.ok(asked.length > 0);
  for (const message of asked) {
    assert.equal(message.tag, TAG);
    assert.doesNotMatch(message.key, /@|example/);
  }
  assert.ok(asked.some((message) => message.key === '203.0.113.7'), 'the IP address, held in the primary\'s memory');
  const tables = await db.query("SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%rate%'");
  assert.deepEqual(tables, []);
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

test('if the primary cannot be reached, drafting carries on and sign-in emails stop', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (line) => warnings.push(line));
  t.mock.method(console, 'error', () => {});
  process.send = undefined;
  try {
    const states = await send('GET', '/api/states', { ip: '198.51.100.50' });
    assert.equal(states.status, 200, 'fails open: counted in the worker instead');
    assert.equal(remaining(states, 'api'), 599);
    const email = await send('POST', '/api/auth/email', { body: { email: 'down@example.com' }, ip: '198.51.100.50' });
    assert.equal(email.status, 503, 'fails closed for sign-in emails');
    assert.equal((await email.json()).message, 'Sign-in emails cannot be sent just now. Try again in a few minutes.');
  } finally {
    process.send = primaryAnswers;
  }
  assert.ok(warnings.some((line) => /Rate limits: the shared count could not be read \(the primary process cannot be reached\)/.test(line)));
});

test('a primary that does not answer holds a request up for at most a moment', async (t) => {
  t.mock.method(console, 'warn', () => {});
  process.send = () => true;
  try {
    const started = Date.now();
    const states = await send('GET', '/api/states', { ip: '198.51.100.60' });
    assert.equal(states.status, 200);
    assert.ok(Date.now() - started < TIMEOUT_MS + 1500);
  } finally {
    process.send = primaryAnswers;
  }
});

test('a worker busy for longer than the time limit still waits for the answer', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (line) => warnings.push(line));
  // The answer takes several turns of reading input to arrive.
  const turnOf = (next) => fs.stat(__filename, next);
  process.send = (message) => {
    turnOf(() => turnOf(() => turnOf(async () => process.emit('message', await answer(message)))));
    return true;
  };
  try {
    const store = new SharedStore('busy-test', { failClosed: true });
    store.init({ windowMs: 60000 });
    const counted = store.increment('a');
    const until = Date.now() + TIMEOUT_MS + 300;
    while (Date.now() < until) { /* a long draft holding up the worker */ }
    assert.equal((await counted).totalHits, 1, 'the shared count, not a refusal');
  } finally {
    process.send = primaryAnswers;
  }
  assert.equal(warnings.length, 0);
});

test('a single process counts in its own memory and refuses the 11th email', async (t) => {
  t.mock.method(console, 'error', () => {});
  cluster.isWorker = false;
  const before = asked.length;
  try {
    const { base } = workers[0];
    const statuses = [];
    for (let i = 0; i < 11; i += 1) {
      const response = await fetch(`${base}/api/auth/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.70' },
        body: JSON.stringify({ email: 'single@example.com' }),
      });
      statuses.push(response.status);
    }
    assert.equal(statuses[10], 429);
    assert.ok(statuses.slice(0, 10).every((status) => status === 200));
    assert.equal(asked.length, before, 'no primary asked');
  } finally {
    cluster.isWorker = true;
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

test('the real server with four workers: the 11th sign-in email is refused', async () => {
  const port = 4300 + Math.floor(Math.random() * 500);
  const child = spawn(process.execPath, [path.join(__dirname, 'rate-cluster.js')], {
    cwd: path.dirname(SERVER),
    env: { ...process.env, RATE_CLUSTER_PORT: String(port), NODE_ENV: 'test' },
    stdio: 'ignore',
  });
  try {
    const base = `http://127.0.0.1:${port}`;
    // Wait until all four workers are listening (a page that is not rate limited).
    for (let i = 0; i < 150; i += 1) {
      try {
        if ((await fetch(`${base}/`)).ok) break;
      } catch {
        // Not listening yet.
      }
      await new Promise((resolve) => { setTimeout(resolve, 100); });
    }
    await new Promise((resolve) => { setTimeout(resolve, 1500); });
    const left = [];
    let status = 0;
    for (let i = 0; i < 11; i += 1) {
      const response = await fetch(`${base}/api/auth/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '192.0.2.10' },
        body: JSON.stringify({ email: 'cluster@example.com' }),
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
