const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const { setupAccounts, lastLinkToken } = require('./helpers');

let server;
let base;
let session;

test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

const post = (route, body, raw, token) => fetch(`${base}${route}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: raw || JSON.stringify(body),
});

const put = (route, body, token) => fetch(`${base}${route}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});

async function signIn(email) {
  await post('/api/auth/email', { email });
  const response = await post('/api/auth/verify', { token: lastLinkToken(email) });
  return (await response.json()).token;
}

test('the old AI routes are gone', async () => {
  for (const route of ['/api/questions', '/api/generate-swms']) {
    const response = await post(route, { jobDescription: 'x' });
    assert.equal(response.status, 404);
  }
});

test('a bad request body gets a plain message', async () => {
  const response = await post('/api/draft', null, '{not json');
  assert.equal(response.status, 400);
  const data = await response.json();
  assert.equal(data.message, 'The request could not be read.');
  assert.doesNotMatch(JSON.stringify(data), /Unexpected|JSON at position/);
});

test('security headers and rate limit headers are set', async () => {
  const response = await fetch(`${base}/api/states`);
  assert.equal(response.status, 200);
  assert.ok(response.headers.get('content-security-policy'));
  assert.ok(response.headers.get('ratelimit-policy') || response.headers.get('ratelimit'));
});

test('a draft and its Word file are prepared', async () => {
  const body = { state: 'qld', task: 'Replace a 3m length of fence.', fallRisk: 'no' };
  const draft = await post('/api/draft', body);
  assert.equal(draft.status, 200);
  assert.equal((await draft.json()).kind, 'draft');
  const anonymous = await post('/api/draft.docx', { ...body, reviewConfirmed: true, reviewedBy: 'Sam Lee' });
  assert.equal(anonymous.status, 401, 'without an account the SWMS is preview only');
  session = await signIn('sam@example.com');
  const noCompany = await post('/api/draft.docx', { ...body, reviewConfirmed: true, reviewedBy: 'Sam Lee' }, null, session);
  assert.equal(noCompany.status, 400, 'no download until the company name and ABN are added');
  assert.match((await noCompany.json()).message, /company name and ABN/);
  assert.equal((await put('/api/company', { name: 'Lee Fencing', abn: '51 824 753 556' }, session)).status, 200);
  const refused = await post('/api/draft.docx', body, null, session);
  assert.equal(refused.status, 400);
  assert.match((await refused.json()).message, /review and approve/);
  const docx = await post('/api/draft.docx', { ...body, reviewConfirmed: true, reviewedBy: 'Sam Lee' }, null, session);
  assert.equal(docx.status, 200);
  assert.match(docx.headers.get('content-type'), /wordprocessingml/);
  const zip = Buffer.from(await docx.arrayBuffer()).toString('latin1');
  assert.ok(zip.includes('footer'), 'the file has a footer');
});

test('the company name and ABN are fixed once a SWMS is downloaded', async () => {
  const renamed = await put('/api/company', { name: 'Someone Else Pty Ltd', abn: '51 824 753 556' }, session);
  assert.equal(renamed.status, 403);
  assert.match((await renamed.json()).message, /fixed once a SWMS/);
  assert.equal((await put('/api/company', { name: 'Lee Fencing', abn: '51824753556', phone: '0400 000 000' }, session)).status, 200, 'other details can still change');
});

test('the Word file is refused without a name, even when confirmed', async () => {
  const body = { state: 'qld', task: 'Replace a 3m length of fence.', fallRisk: 'no', reviewConfirmed: true, reviewedBy: '   ' };
  assert.equal((await post('/api/draft.docx', body, null, session)).status, 400);
});

test('trade and task pick lists come from the tested project sets', async () => {
  const response = await fetch(`${base}/api/presets`);
  assert.equal(response.status, 200);
  const { trades } = await response.json();
  const ids = trades.map((trade) => trade.id);
  assert.ok(ids.includes('piling'));
  for (const id of ['structure', 'electrical', 'plumbing', 'mechanical', 'facade', 'tiling']) assert.ok(ids.includes(id), id);
  assert.equal(new Set(ids).size, ids.length);
  for (const trade of trades) {
    assert.ok(trade.tasks.length >= 1);
    for (const item of trade.tasks) {
      assert.ok(item.task && item.title);
      assert.ok(['yes', 'no'].includes(item.fallRisk));
      assert.ok(['company', 'own'].includes(item.crane));
    }
  }
});

test('required questions carry standard answers, and each answer is accepted', async () => {
  const { prepareDraft } = require('../draft');
  const { answersFor } = require('../presets');
  const task = 'Install ductwork in the apartment ceilings and risers, drilling into the post-tensioned slabs for hanger anchors, working from scissor lifts more than 2 m above the floor.';
  const response = await post('/api/draft/questions', { state: 'qld', task, fallRisk: 'yes' });
  const data = await response.json();
  const fall = data.required.find((item) => item.id === 'fallControl');
  assert.ok(fall.suggestions.length >= 3);
  for (const pick of answersFor('fallControl')) {
    // A harness answer brings the harness question, answered with its standard answer.
    const done = prepareDraft({ state: 'qld', task, fallRisk: 'yes', facts: { fallControl: pick.text, harnessSystem: answersFor('harnessSystem')[0].text, silicaControls: answersFor('silicaControls')[0].text } });
    assert.equal(done.kind, 'draft', `${pick.label}: ${(done.missing || []).join('; ')}`);
  }
});

test('a project downloads as one zip with a Word file for each ready SWMS', async () => {
  const fence = { state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no' };
  const paint = { state: 'qld', task: 'Paint the interior walls of a shop with water-based paint.', fallRisk: 'no', residential: 'no', facts: { safetyDataSheet: 'Water-based acrylic paint SDS, revision 2, at the work area.' } };
  const unready = { state: 'qld', task: 'Lift steel beams with a crane.', fallRisk: 'no', crane: 'own' };
  const refused = await post('/api/project.zip', { swms: [fence] }, null, session);
  assert.equal(refused.status, 400, 'needs the review confirmation');
  const response = await post('/api/project.zip', { swms: [fence, paint, unready], reviewConfirmed: true, reviewedBy: 'Sam Lee' }, null, session);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /zip/);
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
  const names = Object.keys(zip.files).sort();
  assert.equal(names.filter((name) => name.endsWith('.docx')).length, 2);
  assert.ok(names.includes('Not included.txt'));
  assert.match(await zip.file('Not included.txt').async('string'), /Lift steel beams/);
});

test('project zip files are named by the task titles from the scope', async () => {
  const fence = { state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no', swmsTitle: 'Fencing' };
  const response = await post('/api/project.zip', { swms: [fence], reviewConfirmed: true, reviewedBy: 'Sam Lee' }, null, session);
  const zip = await require('jszip').loadAsync(Buffer.from(await response.arrayBuffer()));
  assert.deepEqual(Object.keys(zip.files), ['01 Fencing.docx']);
});

test('the welcome page figures match what the app offers (Australian Consumer Law: claims must be provable)', () => {
  const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'welcome.html'), 'utf8');
  const { TRADES } = require('../presets');
  const trades = TRADES.length;
  const tasks = TRADES.reduce((n, trade) => n + (trade.tasks || []).length, 0);
  const claimed = html.match(/(\d+) trades and over (\d+) common tasks/);
  assert.ok(claimed, 'the figures are on the page');
  assert.equal(Number(claimed[1]), trades, 'trades');
  assert.ok(tasks > Number(claimed[2]), `over ${claimed[2]} tasks (now ${tasks})`);
  const { STATES } = require('../legislation');
  assert.equal(STATES.filter((state) => state.loaded).length, 8, 'every state and territory');
});
