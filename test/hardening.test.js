// Smaller fixes from the outside review (23 October 2026): the database's certificate is checked when
// DATABASE_CA is given (finding 6), the test hooks follow the shared production check (finding 9), and
// the Android app keeps nothing in backups (finding 10).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const testhooks = require('../testhooks');

const ROOT = path.join(__dirname, '..');
const URL_REMOTE = 'postgres://user:not-a-password@db.example.com:5432/railway';
// Made up, not a real certificate.
const CA = '-----BEGIN CERTIFICATE-----\nMIIBtest\n-----END CERTIFICATE-----';

test('the database certificate is checked when DATABASE_CA is given', () => {
  assert.deepEqual(db.sslSettings({ DATABASE_URL: URL_REMOTE, DATABASE_CA: CA }), { rejectUnauthorized: true, ca: CA });
  // Pasted into one line, with \n for each line break.
  assert.deepEqual(db.sslSettings({ DATABASE_URL: URL_REMOTE, DATABASE_CA: CA.replace(/\n/g, '\\n') }), { rejectUnauthorized: true, ca: CA });
  assert.equal(db.tlsProblem({ DATABASE_URL: URL_REMOTE, DATABASE_CA: CA }), null);
});

test('without DATABASE_CA the connection is as today, with one warning; local and off have no TLS', () => {
  assert.deepEqual(db.sslSettings({ DATABASE_URL: URL_REMOTE }), { rejectUnauthorized: false });
  assert.match(db.tlsProblem({ DATABASE_URL: URL_REMOTE }), /^DATABASE_CA is not set: the database connection is encrypted, but its certificate is not checked\.$/);
  assert.equal(db.sslSettings({ DATABASE_URL: 'postgres://u@localhost:5432/x', DATABASE_CA: CA }), false);
  assert.equal(db.sslSettings({ DATABASE_URL: URL_REMOTE, DATABASE_SSL: 'off' }), false);
  assert.equal(db.tlsProblem({ DATABASE_URL: 'postgres://u@127.0.0.1/x' }), null);
  assert.equal(db.tlsProblem({}), null, 'no database, nothing to say');
});

test('the test hooks stay off in production outside Railway, and on in staging', () => {
  const names = ['RAILWAY_ENVIRONMENT_NAME', 'NODE_ENV', 'TEST_HOOKS_SECRET'];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    process.env.TEST_HOOKS_SECRET = 'a'.repeat(40);
    assert.equal(testhooks.enabled(), true, 'a local copy');
    process.env.NODE_ENV = 'production';
    assert.equal(testhooks.enabled(), false, 'NODE_ENV=production with no Railway variable');
    process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
    assert.equal(testhooks.enabled(), true, 'Railway staging, as today');
    process.env.RAILWAY_ENVIRONMENT_NAME = 'Production ';
    assert.equal(testhooks.enabled(), false, 'Railway production');
    delete process.env.NODE_ENV;
    assert.equal(testhooks.enabled(), false, 'Railway production without NODE_ENV');
    process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
    process.env.TEST_HOOKS_SECRET = 'short';
    assert.equal(testhooks.enabled(), false, 'a short secret');
  } finally {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});

test('the Android app is left out of cloud backups and phone-to-phone transfers', () => {
  const manifest = fs.readFileSync(path.join(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
  assert.match(manifest, /android:allowBackup="false"/);
  assert.ok(!/android:allowBackup="true"/.test(manifest));
  assert.match(manifest, /android:dataExtractionRules="@xml\/data_extraction_rules"/);
  const rules = fs.readFileSync(path.join(ROOT, 'android', 'app', 'src', 'main', 'res', 'xml', 'data_extraction_rules.xml'), 'utf8');
  for (const part of ['cloud-backup', 'device-transfer']) {
    const block = new RegExp(`<${part}>([\\s\\S]*?)</${part}>`).exec(rules);
    assert.ok(block, part);
    for (const domain of ['root', 'file', 'database', 'sharedpref', 'external']) assert.match(block[1], new RegExp(`<exclude domain="${domain}" path="\\." />`), `${part} ${domain}`);
    assert.ok(!/<include/.test(block[1]));
  }
});

test('the old copy of the server is gone', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'server.js.backup')), false);
});
