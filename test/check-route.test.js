// POST /api/check: signed-in users only; a SiteReady draft is checked with no AI, and an
// uploaded SWMS is read by the stand-in model (nothing is billed). A reading is started as a check
// and the result asked for by its id (GET /api/check/:id), so a long SWMS does not outlast a proxy.
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const aiScope = require('../ai-scope');
const checkJobs = require('../check-jobs');
const { setupAccounts, lastLinkToken } = require('./helpers');

let server;
let base;
let token;
const post = (route, body, session) => fetch(`${base}${route}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session}` } : {}) },
  body: JSON.stringify(body),
});

test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  await post('/api/auth/email', { email: 'checker@example.com' });
  token = (await (await post('/api/auth/verify', { token: lastLinkToken('checker@example.com') })).json()).token;
});

test.after(() => {
  server.close();
  delete process.env.ANTHROPIC_API_KEY;
  aiScope.useClient(null);
});

const DRAFT = {
  state: 'qld',
  task: 'Erect a tube and fitting scaffold 4 lifts high, about 8 m, on the front facade of a commercial building above a public footpath.',
  fallRisk: 'yes',
  workplace: '12 Smith Street, Paddington QLD 4064',
  principalContractor: 'ABC Builders Pty Ltd',
  complianceResponsible: 'Sam Lee, supervisor',
  // Goal 2: answered before any download, so a SWMS sent to a builder has them (H8 otherwise).
  reviewer: 'Sam Lee, supervisor',
  firstAider: 'Jo Smith',
  musterPoint: 'Front gate on Smith Street',
  scaffoldSupervisor: 'Pat Doyle, Doyle Scaffolding',
  facts: {
    fallControl: 'Scaffolders install each lift with advance guardrails before stepping up, and the working deck is fully planked.',
    systemInstructions: 'Tube and fitting scaffold erected to the scaffold designer\'s drawings SD-01 revision A.',
  },
  site: { access: 'Scaffold stair on the east side.', publicInterface: 'Footpath closed under the scaffold with a gantry.' },
};

test('the check needs a signed-in user', async () => {
  const response = await post('/api/check', { draft: DRAFT });
  assert.equal(response.status, 401);
});

test('a SiteReady draft is checked without the AI, and the email is drafted', async () => {
  const response = await post('/api/check', { draft: DRAFT, to: 'Jo' }, token);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.source, 'draft');
  assert.equal(typeof data.score, 'number');
  // Sent for review, a fresh draft is not signed yet: the sign-on is a condition before work starts.
  assert.ok(!data.hardFails.includes('H7'));
  assert.deepEqual(data.preStart, ['Workers must sign on before work starts.']);
  // In use on site, no sign-on fails H7.
  const onSite = await (await post('/api/check', { draft: DRAFT, stage: 'on-site' }, token)).json();
  assert.ok(onSite.hardFails.includes('H7'), 'no worker has signed a fresh draft');
  assert.equal(data.band, 'Accepted');
  assert.match(data.email.body, /^Hi Jo,/);
  assert.match(data.email.body, /Before work starts: Workers must sign on before work starts\./);
  assert.equal(onSite.band, 'Not accepted');
  assert.match(onSite.email.body, /Must fix before work starts:/);
});

test('a stood-down draft says what it still needs', async () => {
  const response = await post('/api/check', { draft: { state: 'qld', task: 'Install metal roof sheeting on a new two storey house.', fallRisk: 'yes' } }, token);
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /stood down/);
});

const READING = {
  state: 'qld', task: 'Paint the shop walls.', fallRisk: 'no', siteAddress: '', siteConditions: [], highRisk: [],
  steps: [{ step: 'Paint', hazards: ['Paint fumes.'], controls: ['Ventilate the shop.'] }],
  ppe: [], responsiblePerson: '', consultation: '', signatures: [], revision: '', date: '', reviewDate: '', principalContractor: '',
  licences: [], plant: [], emergency: [], review: '', legislation: [], riskMatrix: false,
};
// A stand-in model that answers after a delay, as a long SWMS does; nothing is billed.
function standIn(delayMs = 0, reading = READING) {
  const sent = [];
  aiScope.useClient({ beta: { messages: { stream: (params) => {
    sent.push(params);
    return { finalMessage: async () => {
      await new Promise((resolve) => { setTimeout(resolve, delayMs); });
      return { stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: JSON.stringify(reading) }] };
    } };
  } } } });
  return sent;
}
const get = (route, session) => fetch(`${base}${route}`, { headers: session ? { Authorization: `Bearer ${session}` } : {} });
// Asks for the check until it is no longer being read, as the page does.
async function finished(id, session = token) {
  for (let i = 0; i < 200; i += 1) {
    const response = await get(`/api/check/${id}`, session);
    const data = await response.json();
    if (response.status !== 200 || data.status !== 'checking') return { response, data };
    await new Promise((resolve) => { setTimeout(resolve, 25); });
  }
  throw new Error('the check never finished');
}

test('a pasted SWMS is read by the AI when it is switched on', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const off = await post('/api/check', { text: 'SWMS text' }, token);
  assert.equal(off.status, 503);
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
  standIn();
  const response = await post('/api/check', { text: 'Task: Paint the shop walls. Paint fumes. Ventilate the shop.' }, token);
  assert.equal(response.status, 202);
  const started = await response.json();
  assert.equal(started.status, 'checking');
  const { data } = await finished(started.id);
  assert.equal(data.status, 'done');
  assert.equal(data.source, 'document');
  assert.equal(data.task, 'Paint the shop walls.');
  assert.deepEqual(data.notFound, []);
  assert.ok(data.hardFails.includes('H4'));
  assert.match(data.email.body, /^Hi,/);
  const empty = await post('/api/check', { text: '  ' }, token);
  assert.equal(empty.status, 400);
});

// Goal 3: a full-length SWMS outlasted a 30 second gateway when it was read inside one request.
test('a long reading returns at once with an id, and the page asks for the result', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
  standIn(600);
  const before = Date.now();
  const response = await post('/api/check', { text: 'Task: Paint the shop walls. Paint fumes. Ventilate the shop.', to: 'Jo' }, token);
  assert.equal(response.status, 202);
  assert.ok(Date.now() - before < 400, 'the request did not wait for the reading');
  const { id } = await response.json();
  const waiting = await (await get(`/api/check/${id}`, token)).json();
  assert.equal(waiting.status, 'checking');
  assert.equal(typeof waiting.seconds, 'number');
  assert.equal(waiting.score, undefined);
  const { data } = await finished(id);
  assert.equal(data.status, 'done');
  assert.equal(typeof data.score, 'number');
  assert.match(data.email.body, /^Hi Jo,/);
  // Dropped once read: nothing is kept after the check.
  const again = await get(`/api/check/${id}`, token);
  assert.equal(again.status, 404);
  assert.match((await again.json()).message, /not kept any more/);
});

test('only the account that started a check can read it, and only when signed in', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
  standIn(100);
  const { id } = await (await post('/api/check', { text: 'Task: Paint the shop walls. Paint fumes. Ventilate the shop.' }, token)).json();
  await post('/api/auth/email', { email: 'other-builder@example.com' });
  const other = (await (await post('/api/auth/verify', { token: lastLinkToken('other-builder@example.com') })).json()).token;
  assert.equal((await get(`/api/check/${id}`, other)).status, 404);
  assert.equal((await get(`/api/check/${id}`)).status, 401);
  assert.equal((await get('/api/check/not-an-id', token)).status, 404);
  // The other account's look did not use it up.
  assert.equal((await finished(id)).data.status, 'done');
});

test('a reading that fails says why', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
  aiScope.useClient({ beta: { messages: { stream: () => ({ finalMessage: async () => ({ stop_reason: 'refusal', usage: {}, content: [] }) }) } } });
  const { id } = await (await post('/api/check', { text: 'Task: Paint the shop walls.' }, token)).json();
  const { data } = await finished(id);
  assert.equal(data.status, 'failed');
  assert.equal(data.code, 422);
  assert.match(data.error, /could not read this SWMS/);
});

test('the sign-on is still taken out before the AI reads the SWMS, and still counted', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
  const sent = standIn(100);
  const method = 'Task: Paint the shop walls.\nStep 1 Paint the walls\nHazard: Paint fumes.\nControl: Ventilate the shop.';
  const text = `${method}\f\nWorker sign-on\nName\tCompany\tSignature\tDate\nJarrah Quillfeather\tFernleaf Plumbing\t\t06/10/2026 6:48 am`;
  const { id } = await (await post('/api/check', { text, stage: 'on-site' }, token)).json();
  const { data } = await finished(id);
  assert.equal(data.status, 'done');
  assert.equal(sent.length, 1);
  const message = JSON.stringify(sent[0].messages);
  assert.ok(message.includes('Ventilate the shop.'));
  for (const item of ['Jarrah', 'Fernleaf', '6:48']) assert.ok(!message.includes(item), `"${item}" was sent to the AI`);
  assert.ok(!data.hardFails.includes('H7'), 'the worker counted before the sign-on was taken out');
});

test('a finished check is dropped after a short time if no one reads it, and a stuck one is given up', async (t) => {
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
  t.after(() => checkJobs.useTimes());
  checkJobs.useTimes({ keepMs: 50 });
  standIn();
  const kept = await (await post('/api/check', { text: 'Task: Paint the shop walls. Paint fumes. Ventilate the shop.' }, token)).json();
  await new Promise((resolve) => { setTimeout(resolve, 250); });
  assert.equal((await get(`/api/check/${kept.id}`, token)).status, 404);
  checkJobs.useTimes({ limitMs: 100 });
  standIn(400);
  const stuck = await (await post('/api/check', { text: 'Task: Paint the shop walls. Paint fumes. Ventilate the shop.' }, token)).json();
  await new Promise((resolve) => { setTimeout(resolve, 200); });
  const { data } = await finished(stuck.id);
  assert.equal(data.status, 'failed');
  assert.match(data.error, /took too long/);
  // The late answer is not kept either.
  await new Promise((resolve) => { setTimeout(resolve, 400); });
  assert.equal(checkJobs.jobCount(), 0);
});

test('only starting a check counts against its limit; asking for the result does not', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
  standIn(50);
  const response = await post('/api/check', { text: 'Task: Paint the shop walls. Paint fumes. Ventilate the shop.' }, token);
  assert.match(response.headers.get('ratelimit-policy') || '', /"30-in-15min"/);
  const { id } = await response.json();
  const poll = await get(`/api/check/${id}`, token);
  assert.doesNotMatch(poll.headers.get('ratelimit-policy') || '', /"30-in-15min"/);
  await finished(id);
});
