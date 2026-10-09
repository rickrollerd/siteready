// Goal 7: a worker's sign-on carries on after a reload or lost signal. The phone sends back its
// read id, and the same read goes on (its start time, its questions and any wait) while it is
// unused, the SWMS unchanged and under a day old. A sign-on sent again after its answer was lost
// is not saved twice, and a reload after it tells the worker they are signed on.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const db = require('../db');
const signRead = require('../sign-read');
const { prepareDraft } = require('../draft');
const { withCompany } = require('../accounts');
const { setupAccounts, lastLinkToken, ANSWERED } = require('./helpers');

let server;
let base;

test.before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  server.keepAliveTimeout = 60000;
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

function call(method, route, { body, token } = {}) {
  return fetch(`${base}${route}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function abnFor(seed) {
  let n = 0;
  for (const ch of seed) n = (n * 31 + ch.charCodeAt(0)) % 1000000000;
  const tail = String(n).padStart(9, '0');
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  for (let head = 10; head <= 99; head += 1) {
    const digits = `${head}${tail}`;
    const total = [...digits].reduce((sum, d, i) => sum + (Number(d) - (i === 0 ? 1 : 0)) * weights[i], 0);
    if (total % 89 === 0) return digits;
  }
  return abnFor(`${seed}x`);
}

const INPUT = {
  ...ANSWERED,
  state: 'qld',
  task: 'Install sprinkler pipework in the ward ceilings from scissor lifts more than 2 m above the floor.',
  fallRisk: 'yes',
  facts: { fallControl: 'Scissor lifts with guardrails are used for all work above 2 m.' },
};
const SIGNATURE = `data:image/png;base64,${Buffer.from('signature').toString('base64')}`;
const KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90abcd';

async function savedSwms(email) {
  await call('POST', '/api/auth/email', { body: { email } });
  const { token } = await (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).json();
  await call('PUT', '/api/company', { token, body: { name: `Test business ${email}`, abn: abnFor(email) } });
  const { swms } = await (await call('POST', '/api/swms', { token, body: { input: INPUT, reviewConfirmed: true, reviewedBy: 'Alex Chen' } })).json();
  return { swms, key: new URLSearchParams(swms.signonPath.split('?')[1]).get('t') };
}

const openFor = (readId, seconds) => db.query('UPDATE sign_reads SET started_at = $1 WHERE id = $2', [new Date(Date.now() - seconds * 1000), readId]);

async function rightAnswers(swmsId, readId, round = 0) {
  const row = await db.one('SELECT * FROM swms WHERE id = $1', [swmsId]);
  const company = await db.one('SELECT * FROM companies WHERE id = $1', [row.company_id]);
  const questions = signRead.checkQuestions(swmsId, readId, prepareDraft(withCompany(row.input, company)), round);
  return Object.fromEntries(questions.map((q) => [q.id, q.answer]));
}

const view = async (key, query = '') => (await call('GET', `/api/sign/${key}${query}`)).json();
const reads = async (swmsId) => Number((await db.one('SELECT COUNT(*) AS n FROM sign_reads WHERE swms_id = $1', [swmsId])).n);

test('a reload with the kept read id carries on the same read, with its questions', async () => {
  const { swms, key } = await savedSwms('resume@keep.example');
  const first = await view(key);
  assert.equal(first.resumed, false);
  const again = await view(key, `?read=${encodeURIComponent(first.readId)}`);
  assert.equal(again.resumed, true);
  assert.equal(again.readId, first.readId);
  assert.deepEqual(again.questions, first.questions);
  assert.equal(again.wait, 0);
  assert.equal(await reads(swms.id), 1, 'no new read was started');
  // The time read before the reload counts: the read started when the page was first opened.
  await openFor(first.readId, 3600);
  const body = { name: 'Ana Silva', signature: SIGNATURE, confirmed: true, readId: again.readId, answers: await rightAnswers(swms.id, again.readId) };
  assert.equal((await call('POST', `/api/sign/${key}`, { body })).status, 201);
});

test('after wrong answers, a reload gets the new questions and the wait still to run', async () => {
  const { swms, key } = await savedSwms('wait@keep.example');
  const first = await view(key);
  await openFor(first.readId, 3600);
  const body = { name: 'Bo Li', signature: SIGNATURE, confirmed: true, readId: first.readId, answers: {} };
  await call('POST', `/api/sign/${key}`, { body });
  const second = await (await call('POST', `/api/sign/${key}`, { body })).json();
  assert.equal(second.wait, 30);
  const reloaded = await view(key, `?read=${encodeURIComponent(first.readId)}`);
  assert.equal(reloaded.resumed, true);
  assert.deepEqual(reloaded.questions, second.questions, 'the questions for the next try, not the first ones');
  assert.ok(reloaded.wait > 0 && reloaded.wait <= 30);
  assert.equal(await reads(swms.id), 1);
});

test('a used, changed, day-old, made-up or other SWMS\'s read starts a new read', async () => {
  const { swms, key } = await savedSwms('fresh@keep.example');
  const other = await savedSwms('other@keep.example');
  const otherRead = (await view(other.key)).readId;
  const fresh = async (readId) => {
    const got = await view(key, `?read=${encodeURIComponent(readId)}`);
    assert.equal(got.resumed, false, readId);
    assert.notEqual(got.readId, readId);
    return got;
  };
  await fresh('made-up');
  await fresh(otherRead);
  const changed = (await view(key)).readId;
  await db.query('UPDATE sign_reads SET content_hash = $1 WHERE id = $2', ['changed', changed]);
  await fresh(changed);
  const old = (await view(key)).readId;
  await openFor(old, signRead.RESUME_HOURS * 3600 + 60);
  await fresh(old);
  const used = (await view(key)).readId;
  await openFor(used, 3600);
  const body = { name: 'Cy Ng', signature: SIGNATURE, confirmed: true, readId: used, answers: await rightAnswers(swms.id, used) };
  assert.equal((await call('POST', `/api/sign/${key}`, { body })).status, 201);
  await fresh(used);
});

test('a sign-on sent again after its answer was lost is saved once, and a reload says the worker is signed on', async () => {
  const { swms, key } = await savedSwms('twice@keep.example');
  const first = await view(key);
  await openFor(first.readId, 3600);
  const body = { name: 'Dee Rao', company: 'Rao Pipe', signature: SIGNATURE, confirmed: true, readId: first.readId, answers: await rightAnswers(swms.id, first.readId), key: KEY };
  const sent = await call('POST', `/api/sign/${key}`, { body });
  assert.equal(sent.status, 201);
  const message = (await sent.json()).message;
  assert.match(message, /^Thanks Dee Rao\. You are signed on to /);
  // The phone did not get that answer and sends the same sign-on again.
  const again = await call('POST', `/api/sign/${key}`, { body });
  assert.equal(again.status, 201);
  assert.equal((await again.json()).message, message);
  const rows = await db.query('SELECT worker_name, client_key FROM signons WHERE swms_id = $1', [swms.id]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].client_key, KEY);
  // The page reloaded after the lost answer: told they are signed on, and no new read started.
  const before = await reads(swms.id);
  const reloaded = await view(key, `?read=${encodeURIComponent(first.readId)}&key=${KEY}`);
  assert.deepEqual(reloaded, { signed: true, message });
  assert.equal(await reads(swms.id), before);
  // The same key on another SWMS means nothing there.
  const other = await savedSwms('twice-other@keep.example');
  assert.equal((await view(other.key, `?key=${KEY}`)).signed, undefined);
});

test('a worker whose supervisor explained the SWMS is not saved twice either; a key not of the right form is ignored', async () => {
  const { swms, key } = await savedSwms('explained@keep.example');
  const body = { name: 'Eli Tam', signature: SIGNATURE, confirmed: true, explained: true, supervisor: 'J Smith', key: KEY };
  assert.equal((await call('POST', `/api/sign/${key}`, { body })).status, 201);
  assert.equal((await call('POST', `/api/sign/${key}`, { body })).status, 201);
  assert.equal((await db.query('SELECT id FROM signons WHERE swms_id = $1', [swms.id])).length, 1);
  const odd = { ...body, name: 'Fay Ono', key: "x' OR 1=1 --" };
  assert.equal((await call('POST', `/api/sign/${key}`, { body: odd })).status, 201);
  const row = await db.one('SELECT client_key FROM signons WHERE swms_id = $1 AND worker_name = $2', [swms.id, 'Fay Ono']);
  assert.equal(row.client_key, null);
});
