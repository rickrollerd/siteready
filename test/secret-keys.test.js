// The secret keys for the industry data and control learning (goal 9): in production a missing or
// short key switches the feature off and the log names the variable, never its value. Staging and
// local copies keep working with the built-in key.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawn } = require('child_process');
const keys = require('../secret-keys');
const db = require('../db');
const { recordIndustry } = require('../industry');
const controlLearning = require('../control-learning');
const { prepareDraft } = require('../draft');
const { draftBody } = require('../input');
const { setupAccounts } = require('./helpers');

const NAMES = ['RAILWAY_ENVIRONMENT_NAME', 'NODE_ENV', 'INDUSTRY_KEY', 'SESSION_SECRET', 'CONTROL_LEARNING', 'CONTROL_LEARNING_KEY'];
// Made-up keys for these tests only.
const LONG_KEY = `test-only-${'k'.repeat(40)}`;
const SHORT_KEY = 'test-only-short';

let saved;
test.beforeEach(() => {
  saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));
  for (const name of NAMES) delete process.env[name];
});
test.afterEach(() => {
  for (const name of NAMES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

test.before(async () => { await setupAccounts(); });

test('production is the Railway environment named production, or NODE_ENV=production off Railway', () => {
  assert.equal(keys.isProduction(), false, 'a local copy');
  process.env.NODE_ENV = 'production';
  assert.equal(keys.isProduction(), true, 'a server outside Railway');
  process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
  assert.equal(keys.isProduction(), false, 'staging, even with NODE_ENV=production');
  process.env.RAILWAY_ENVIRONMENT_NAME = 'Production';
  delete process.env.NODE_ENV;
  assert.equal(keys.isProduction(), true);
});

test('outside production the built-in keys still work; in production a missing or short key gives none', () => {
  assert.equal(keys.industryKey(), 'siteready-industry');
  assert.equal(keys.controlLearningKey(), 'siteready-control-learning');
  process.env.SESSION_SECRET = SHORT_KEY;
  assert.equal(keys.industryKey(), SHORT_KEY, 'staging and local copies keep the old order');
  delete process.env.SESSION_SECRET;

  process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
  assert.equal(keys.industryKey(), '');
  assert.equal(keys.controlLearningKey(), '');
  process.env.INDUSTRY_KEY = SHORT_KEY;
  process.env.CONTROL_LEARNING_KEY = SHORT_KEY;
  assert.equal(keys.industryKey(), '', `shorter than ${keys.MIN_LENGTH} characters`);
  assert.equal(keys.controlLearningKey(), '');
  process.env.INDUSTRY_KEY = LONG_KEY;
  process.env.CONTROL_LEARNING_KEY = LONG_KEY;
  assert.equal(keys.industryKey(), LONG_KEY);
  assert.equal(keys.controlLearningKey(), LONG_KEY);
  delete process.env.INDUSTRY_KEY;
  process.env.SESSION_SECRET = LONG_KEY;
  assert.equal(keys.industryKey(), LONG_KEY, 'SESSION_SECRET still serves the industry data, as before');
});

test('the start-up lines name the missing variable and never a value', () => {
  assert.deepEqual(keys.keyProblems(), [], 'nothing outside production');
  process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
  process.env.INDUSTRY_KEY = SHORT_KEY;
  let lines = keys.keyProblems();
  assert.equal(lines.length, 1, 'control learning is not mentioned while it is off');
  assert.match(lines[0], /^INDUSTRY_KEY is not set, or is shorter than 32 characters: industry records are off in production until it is set\.$/);
  process.env.CONTROL_LEARNING = 'on';
  process.env.CONTROL_LEARNING_KEY = SHORT_KEY;
  lines = keys.keyProblems();
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^CONTROL_LEARNING_KEY is not set, or is shorter than 32 characters: control learning is off in production until it is set\.$/);
  assert.ok(lines.every((line) => !line.includes(SHORT_KEY)), 'no value is logged');
  process.env.INDUSTRY_KEY = LONG_KEY;
  process.env.CONTROL_LEARNING_KEY = LONG_KEY;
  assert.deepEqual(keys.keyProblems(), []);
});

const INPUT = { state: 'qld', task: 'Dig a trench 1 m deep with an excavator.', fallRisk: 'no', trade: 'civil', workplace: '5 Example Road, Toowong QLD 4066' };
const industryCount = async () => Number((await db.one('SELECT COUNT(*) AS n FROM industry_records')).n);

test('in production without INDUSTRY_KEY no industry record is kept; with it, records are kept as before', async () => {
  const draft = prepareDraft(draftBody(INPUT));
  const start = await industryCount();
  process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
  await recordIndustry(draft, INPUT, { id: 'company-no-key' });
  assert.equal(await industryCount(), start);
  process.env.INDUSTRY_KEY = LONG_KEY;
  await recordIndustry(draft, INPUT, { id: 'company-with-key' });
  assert.equal(await industryCount(), start + 1);
  delete process.env.RAILWAY_ENVIRONMENT_NAME;
  delete process.env.INDUSTRY_KEY;
  await recordIndustry(draft, INPUT, { id: 'company-on-staging' });
  assert.equal(await industryCount(), start + 2, 'staging and local copies still keep records');
});

test('in production, control learning stays off without CONTROL_LEARNING_KEY, even when CONTROL_LEARNING=on', async () => {
  process.env.CONTROL_LEARNING = 'on';
  assert.equal(controlLearning.enabled(), true, 'on outside production with the built-in key');
  process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
  assert.equal(controlLearning.enabled(), false);
  const draft = prepareDraft(draftBody({ ...INPUT, controlEdits: { Excavate: { added: ['Spoil is kept 2 m back from the edge.'] } } }));
  assert.equal(await controlLearning.recordControlEdits(draft, INPUT, { company: { id: 'c' }, swmsId: 'production-no-key' }), 0);
  process.env.CONTROL_LEARNING_KEY = LONG_KEY;
  assert.equal(controlLearning.enabled(), true);
  assert.equal(await controlLearning.recordControlEdits(draft, INPUT, { company: { id: 'c' }, swmsId: 'production-with-key' }), 1);
  assert.equal((await controlLearning.summary()).enabled, true);
});

// The server itself, started as production without the keys: it still starts, and logs both lines.
test('a production server without the keys starts, and its log names each variable', async () => {
  const env = { ...process.env, RAILWAY_ENVIRONMENT_NAME: 'production', CONTROL_LEARNING: 'on', PORT: '0', WEB_CONCURRENCY: '1', INDUSTRY_KEY: SHORT_KEY };
  for (const name of ['DATABASE_URL', 'SESSION_SECRET', 'CONTROL_LEARNING_KEY', 'NODE_ENV']) delete env[name];
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`The server did not start: ${output}`)), 20000);
      const read = (chunk) => {
        output += chunk;
        if (/SiteReady server running/.test(output)) { clearTimeout(timer); resolve(); }
      };
      child.stdout.on('data', read);
      child.stderr.on('data', read);
      child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`The server stopped (${code}): ${output}`)); });
    });
  } finally {
    child.kill();
  }
  assert.match(output, /INDUSTRY_KEY is not set, or is shorter than 32 characters: industry records are off in production until it is set\./);
  assert.match(output, /CONTROL_LEARNING_KEY is not set, or is shorter than 32 characters: control learning is off in production until it is set\./);
  assert.ok(!output.includes(SHORT_KEY), 'no value is logged');
});
