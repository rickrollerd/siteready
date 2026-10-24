// Starting the server (outside review, findings 4 and 12): the tables are set up once, before
// anything listens; a failed set-up stops the start; the health check says not ready until the
// tables are; and WEB_CONCURRENCY is cut back to what the memory holds.
process.env.WEB_CONCURRENCY = '1';
process.env.PORT = '0';
const test = require('node:test');
const assert = require('node:assert/strict');
const { newDb } = require('pg-mem');
const db = require('../db');
const server = require('../server');

const { app, start, workerCount } = server;

// An in-memory database whose CREATE statements wait for the gate, or fail.
function database({ gate, failing } = {}) {
  const { Pool } = newDb().adapters.createPg();
  const real = new Pool();
  return {
    query: async (text, params) => {
      if (/^\s*CREATE TABLE/i.test(String(text))) {
        if (failing) throw new Error('permission denied for schema public');
        if (gate) await gate;
      }
      return real.query(text, params);
    },
    connect: () => real.connect(),
    on: () => {},
  };
}

async function health(port) {
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  return { status: response.status, body: await response.json() };
}

let probe;
let port;
const listens = [];
const realListen = app.listen.bind(app);

test.before(async () => {
  // A second listener on the same app, to ask /api/health while start() is still setting up.
  probe = realListen(0);
  await new Promise((resolve) => probe.once('listening', resolve));
  port = probe.address().port;
  app.listen = (...args) => { listens.push(args[0]); const made = realListen(...args); return made; };
});
test.after(() => { app.listen = realListen; probe.close(); });

test('a failed set-up stops the start, and the health check says so', async () => {
  db.useDatabase(database({ failing: true }));
  const errors = [];
  const was = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  try {
    await assert.rejects(start(), /Database setup failed: permission denied/);
  } finally {
    console.error = was;
  }
  assert.equal(listens.length, 0, 'the server never listened');
  assert.equal(db.readiness(), 'failed');
  assert.deepEqual(await health(port), { status: 503, body: { ok: false, database: 'setup failed' } });
});

test('a slow set-up holds the start, and the server is not ready until it is done', async () => {
  let open;
  const gate = new Promise((resolve) => { open = resolve; });
  db.useDatabase(database({ gate }));
  let started = false;
  const starting = start().then((made) => { started = true; return made; });
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(started, false);
  assert.equal(listens.length, 0, 'not listening while the tables are set up');
  assert.equal(db.readiness(), 'running');
  assert.deepEqual(await health(port), { status: 503, body: { ok: false, database: 'starting' } });
  open();
  const made = await starting;
  assert.equal(listens.length, 1, 'listening once the tables are set up');
  await new Promise((resolve) => (made.listening ? resolve() : made.once('listening', resolve)));
  assert.equal(db.readiness(), 'ready');
  assert.deepEqual(await health(made.address().port), { status: 200, body: { ok: true, database: 'ok' } });
  // The tables are there.
  assert.ok(Array.isArray(await db.query('SELECT id FROM users')));
  made.close();
});

test('WEB_CONCURRENCY is used up to what the memory holds, and cut back above it with a warning', () => {
  const was = process.env.WEB_CONCURRENCY;
  const warnings = [];
  try {
    process.env.WEB_CONCURRENCY = '2';
    assert.equal(workerCount({ warn: (line) => warnings.push(line) }), 2);
    assert.equal(warnings.length, 0);
    process.env.WEB_CONCURRENCY = '100000';
    const count = workerCount({ warn: (line) => warnings.push(line) });
    assert.ok(count >= 1 && count < 100000);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /^WEB_CONCURRENCY is 100000, but the memory holds \d+ workers? at about 512 MB each: running \d+\.$/);
  } finally {
    process.env.WEB_CONCURRENCY = was;
  }
});
