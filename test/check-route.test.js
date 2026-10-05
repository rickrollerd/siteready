// POST /api/check: signed-in users only; a SiteReady draft is checked with no AI, and an
// uploaded SWMS is read by the stand-in model (nothing is billed).
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const aiScope = require('../ai-scope');
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
  assert.ok(data.hardFails.includes('H7'), 'no worker has signed a fresh draft');
  assert.equal(data.band, 'Not accepted');
  assert.match(data.email.body, /^Hi Jo,/);
  assert.match(data.email.body, /Must fix before work starts:/);
});

test('a stood-down draft says what it still needs', async () => {
  const response = await post('/api/check', { draft: { state: 'qld', task: 'Install metal roof sheeting on a new two storey house.', fallRisk: 'yes' } }, token);
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /stood down/);
});

test('a pasted SWMS is read by the AI when it is switched on', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const off = await post('/api/check', { text: 'SWMS text' }, token);
  assert.equal(off.status, 503);
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
  const reading = {
    state: 'qld', task: 'Paint the shop walls.', fallRisk: 'no', siteAddress: '', siteConditions: [], highRisk: [],
    steps: [{ step: 'Paint', hazards: ['Paint fumes.'], controls: ['Ventilate the shop.'] }],
    ppe: [], responsiblePerson: '', consultation: '', signatures: [], revision: '', date: '', reviewDate: '', principalContractor: '',
    licences: [], plant: [], emergency: [], review: '', legislation: [], riskMatrix: false,
  };
  aiScope.useClient({ beta: { messages: { stream: () => ({ finalMessage: async () => ({ stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: JSON.stringify(reading) }] }) }) } } });
  const response = await post('/api/check', { text: 'Task: Paint the shop walls. Paint fumes. Ventilate the shop.' }, token);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.source, 'document');
  assert.equal(data.task, 'Paint the shop walls.');
  assert.deepEqual(data.notFound, []);
  assert.ok(data.hardFails.includes('H4'));
  const empty = await post('/api/check', { text: '  ' }, token);
  assert.equal(empty.status, 400);
});
