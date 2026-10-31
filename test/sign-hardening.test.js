const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const db = require('../db');
const { setupAccounts, lastLinkToken, ANSWERED, ready, checked } = require('./helpers');

let server;
let base;

test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
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

async function signIn(email, { company = true } = {}) {
  const sent = await call('POST', '/api/auth/email', { body: { email } });
  assert.equal(sent.status, 200);
  const response = await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } });
  assert.equal(response.status, 200);
  const { token } = await response.json();
  if (company) await call('PUT', '/api/company', { token, body: { name: `Test business ${email}`, abn: abnFor(email) } });
  return token;
}

const INPUT = ready({
  ...ANSWERED,
  state: 'qld',
  task: 'Install sprinkler pipework in the ward ceilings from scissor lifts more than 2 m above the floor.',
  fallRisk: 'yes',
  facts: { fallControl: 'Scissor lifts with guardrails are used for all work above 2 m.' },
});
const CONFIRM = { reviewConfirmed: true, reviewedBy: 'Alex Chen' };

const VALID_SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAABRB27rAAAADElEQVR4nGNgYGAAAAAEAAGnV0ytAAAAAElFTkTINXpH';
const INVALID_SIGNATURE = 'data:image/png;base64,QUFBQQ==';

test('a valid tiny PNG signature is accepted', async () => {
  const token = await signIn('valid-png@example.com');
  const { swms } = await (await call('POST', '/api/swms', { token, body: checked({ input: INPUT, ...CONFIRM }) })).json();
  const key = new URLSearchParams(swms.signonPath.split('?')[1]).get('t');
  const res = await call('POST', `/api/sign/${key}`, { body: { name: 'Jo Worker', signature: VALID_SIGNATURE, confirmed: true, explained: true, supervisor: 'Sam Lee' } });
  assert.equal(res.status, 201);
  const detail = await (await call('GET', `/api/swms/${swms.id}`, { token })).json();
  assert.equal(detail.signons.length, 1);
  assert.equal(detail.signons[0].worker_name, 'Jo Worker');
});

test('an invalid PNG signature is rejected and not inserted', async () => {
  const token = await signIn('invalid-png@example.com');
  const { swms } = await (await call('POST', '/api/swms', { token, body: checked({ input: INPUT, ...CONFIRM }) })).json();
  const key = new URLSearchParams(swms.signonPath.split('?')[1]).get('t');
  const res = await call('POST', `/api/sign/${key}`, { body: { name: 'Bad Worker', signature: INVALID_SIGNATURE, confirmed: true, explained: true, supervisor: 'Sam Lee' } });
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.match(json.message, /not a valid PNG/);
  const detail = await (await call('GET', `/api/swms/${swms.id}`, { token })).json();
  assert.equal(detail.signons.length, 0);
});

test('a business can delete its own sign-on, another business cannot', async () => {
  const token = await signIn('own-signon@example.com');
  const { swms } = await (await call('POST', '/api/swms', { token, body: checked({ input: INPUT, ...CONFIRM }) })).json();
  const key = new URLSearchParams(swms.signonPath.split('?')[1]).get('t');
  await call('POST', `/api/sign/${key}`, { body: { name: 'Del Worker', signature: VALID_SIGNATURE, confirmed: true, explained: true, supervisor: 'Sam Lee' } });
  const signon = await db.one('SELECT id FROM signons WHERE swms_id = $1', [swms.id]);
  assert.ok(signon);
  const del = await call('DELETE', `/api/swms/${swms.id}/signons/${signon.id}`, { token });
  assert.equal(del.status, 200);
  const remaining = await db.query('SELECT * FROM signons WHERE swms_id = $1', [swms.id]);
  assert.equal(remaining.length, 0);

  const other = await signIn('other-signon@example.com');
  const otherDel = await call('DELETE', `/api/swms/${swms.id}/signons/${signon.id}`, { token: other });
  assert.equal(otherDel.status, 404);
});

test('per-token rate limit returns 429 after the cap', async () => {
  const token = await signIn('rate-limit@example.com');
  const { swms } = await (await call('POST', '/api/swms', { token, body: checked({ input: INPUT, ...CONFIRM }) })).json();
  const key = new URLSearchParams(swms.signonPath.split('?')[1]).get('t');
  const body = { name: 'Rate Worker', signature: VALID_SIGNATURE, confirmed: true, explained: true, supervisor: 'Sam Lee' };
  for (let i = 0; i < 30; i += 1) {
    const res = await call('POST', `/api/sign/${key}`, { body: { ...body, name: `Rate Worker ${i}` } });
    assert.equal(res.status, 201, `request ${i + 1} should succeed`);
  }
  const blocked = await call('POST', `/api/sign/${key}`, { body: { ...body, name: 'Rate Worker 30' } });
  assert.equal(blocked.status, 429);
  const json = await blocked.json();
  assert.match(json.message, /Too many requests/);
});
