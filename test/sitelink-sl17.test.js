// SiteLink sl17 fixes: asQuestion trailing strip, In-ground folding, plainBore, late answers mark list changed.
// Made-up companies, people and sites only.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.RATE_LIMIT_HSE_REQUESTS = '5000';
process.env.RATE_LIMIT_MAX_REQUESTS = '5000';
process.env.RATE_LIMIT_LIST_REQUESTS = '5000';
process.env.RATE_LIMIT_LIST_UPLOADS = '1000';
process.env.RATE_LIMIT_LIST_SENDS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const db = require('../db');
const handover = require('../handover');
const abnRegister = require('../abn');
const { validAbn } = require('../accounts');
const { setupAccounts, mailbox } = require('./helpers');

abnRegister.lookupAbn = async () => ({ enabled: false });
let abnSeed = 51824753000;
function nextAbn() {
  for (abnSeed += 97; ; abnSeed += 1) if (validAbn(String(abnSeed))) return String(abnSeed);
}

let server;
let base;
test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  server.keepAliveTimeout = 120000;
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

async function call(method, route, { body, reviewer, session, headers, raw } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(reviewer ? { 'X-Reviewer-Token': reviewer } : {}), ...(session ? { Authorization: `Bearer ${session}` } : {}), ...headers },
    body: raw !== undefined ? raw : body ? JSON.stringify(body) : undefined,
  });
  const type = response.headers.get('content-type') || '';
  return { status: response.status, headers: response.headers, data: type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
}

function inDays(days) {
  const today = require('../sitelink-send').todayIn('qld');
  const day = new Date(`${today}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

async function leadSignIn(email, name = 'Dana Whitfield') {
  assert.equal((await call('POST', '/api/hse/email', { body: { email } })).status, 200);
  const text = [...mailbox].reverse().find((item) => item.to === email).text;
  const token = /\/sitelink\?login=([A-Za-z0-9_-]+)/.exec(text)[1];
  const { data } = await call('POST', '/api/hse/verify', { body: { token } });
  if (name) assert.equal((await call('PUT', '/api/hse/me', { reviewer: data.token, body: { name, position: 'HSE manager', phone: '0412 555 012' } })).status, 200);
  return data.token;
}

async function builder(prefix, orgName = 'Specimen Build Pty Ltd', { abn = '', email = `office@${prefix}-sub.example`, verified = true } = {}) {
  const leadEmail = `dana@${prefix}.example`;
  const lead = await leadSignIn(leadEmail);
  const org = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: orgName, abn: nextAbn() } });
  assert.equal(org.status, 201, JSON.stringify(org.data));
  if (verified) await db.query("UPDATE orgs SET abn_check = 'verified', abn_verified_at = $1 WHERE id = $2", [new Date(), org.data.org.id]);
  const project = await call('POST', `/api/hse/orgs/${org.data.org.id}/projects`, { reviewer: lead, body: { name: 'Northgate Health Hub', workplace: '12 Wattle Road, Hamilton QLD 4007', state: 'qld' } });
  const projectId = project.data.project.id;
  const details = await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 0, details: { musterPoint: 'Assembly area A at the Wattle Road gate', hospital: 'Northside General Hospital, Emergency Department', siteRules: ['Sign in at the site office before starting.'] } } });
  assert.equal(details.status, 200, JSON.stringify(details.data));
  const added = await call('POST', `/api/hse/projects/${projectId}/subcontracts`, { reviewer: lead, body: { name: 'Tallow Formwork Pty Ltd', trade: 'Formwork', email, abn } });
  assert.equal(added.status, 201, JSON.stringify(added.data));
  const subId = added.data.subcontract.id;
  for (const [title, task] of [['Formwork to suspended slabs', 'Form up, pour and strip the suspended slabs on levels 1 to 4.'], ['Edge protection to slab edges', 'Install and dismantle the edge screens at each slab edge.']]) {
    assert.equal((await call('POST', `/api/hse/subcontracts/${subId}/items`, { reviewer: lead, body: { title, task } })).status, 201);
  }
  return { lead, leadEmail, orgId: org.data.org.id, projectId, subId };
}

async function sendList(b, due = inDays(14)) {
  const preview = await call('POST', `/api/hse/subcontracts/${b.subId}/send/preview`, { reviewer: b.lead, body: { due } });
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  const sent = await call('POST', `/api/hse/subcontracts/${b.subId}/send`, { reviewer: b.lead, body: { due, check: preview.data.preview.check } });
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  return { preview: preview.data.preview, page: sent.data };
}

const linkOf = (message) => /\/list\.html\?t=([A-Za-z0-9_-]+)/.exec(message.text)[1];

// ---- Fix 1: asQuestion strips trailing phrase and does/do ----

test('asQuestion strips "must be confirmed" and forms does/do question', () => {
  assert.equal(handover.asQuestion('Whether the builder is liable must be confirmed'), 'Is the builder liable?');
  assert.equal(handover.asQuestion('Whether the subcontractor does the work must be confirmed'), 'Does the subcontractor do the work?');
  assert.equal(handover.asQuestion('Whether they do it must be confirmed.'), 'Do they do it?');
  // The round 20 SiteLink rerun line, word for word.
  assert.equal(handover.asQuestion('Whether the Mechanical subcontractor does these inspections must be confirmed.'), 'Does the Mechanical subcontractor do these inspections?');
});

test('asQuestion leaves non-matching text unchanged', () => {
  assert.equal(handover.asQuestion('Whether the builder provides the hoist must be confirmed'), 'Whether the builder provides the hoist must be confirmed');
  assert.equal(handover.asQuestion('Who provides the hoist?'), 'Who provides the hoist?');
  assert.equal(handover.asQuestion('It is not stated who operates the crane.'), 'It is not stated who operates the crane.');
});

// ---- Fix 2: listItems folds In-ground services into longer In-ground ... services ----

test('listItems folds In-ground services into In-ground drainage services', () => {
  const reading = {
    activities: [
      { activity: 'General ground works', type: 'Site work', package: 'In-ground services', crew: 'Civil', clause: '1.1', quotes: ['Carry out general ground works.'], where: '', plant: '', conditions: '', unknowns: '' },
      { activity: 'Install stormwater pits', type: 'Site work', package: 'In-ground drainage services', crew: 'Drainers', clause: '1.2', quotes: ['Install stormwater pits and pipes.'], where: '', plant: '', conditions: '', unknowns: '' },
    ],
  };
  const items = handover.listItems(reading);
  const services = items.find((item) => item.package === 'In-ground services');
  const target = items.find((item) => item.package === 'In-ground drainage services');
  assert.ok(services, 'In-ground services item exists');
  assert.ok(target, 'In-ground drainage services item exists');
  assert.equal(services.removedWhy, 'folded');
  assert.equal(services.foldedInto, 'In-ground drainage services');
});

// ---- Fix 3: plainBore converts NB/DN to mm nominal bore ----

test('plainBore converts NB/NB and DN to mm nominal bore', () => {
  assert.equal(handover.plainBore('Install NB100 pipe'), 'Install 100 mm nominal bore pipe');
  assert.equal(handover.plainBore('Install NB 100mm pipe'), 'Install 100 mm nominal bore pipe');
  assert.equal(handover.plainBore('Install DN50 pipe'), 'Install 50 mm nominal bore pipe');
  assert.equal(handover.plainBore('Install DN 100 fittings'), 'Install 100 mm nominal bore fittings');
});

test('readingWords applies plainBore to title, task, scopeTask and activities', () => {
  const names = new Map();
  const item = handover.readingWords({
    title: 'Pipework NB100',
    task: 'Lay DN 50 pipes',
    scopeTask: { plain: 'Connect NB 25mm services' },
    activities: [
      { activity: 'Install NB200 pipe', clause: 'Cl.1', where: 'DN 100 area' },
      'String DN150 cable',
    ],
  }, names);
  assert.equal(item.title, 'Pipework 100 mm nominal bore');
  assert.equal(item.task, 'Lay 50 mm nominal bore pipes');
  assert.equal(item.scopeTask.plain, 'Connect 25 mm nominal bore services');
  assert.equal(item.activities[0].activity, 'Install 200 mm nominal bore pipe');
  assert.equal(item.activities[0].clause, 'Cl.1');
  assert.equal(item.activities[0].where, '100 mm nominal bore area');
  assert.equal(item.activities[1], 'String 150 mm nominal bore cable');
});

// ---- Fix 4: an answer given after the list went marks it changed ----

test('an answer given after the list is sent marks the list changed and sends an updated list', async () => {
  const b = await builder('sl17late');
  const pointId = require('../auth').newId();
  await db.query('INSERT INTO subcontract_points (id, subcontract_id, position, activity, clause, question) VALUES ($1, $2, 0, $3, $4, $5)',
    [pointId, b.subId, 'Formwork to suspended slabs', '2.1', 'Who supplies the props?']);
  const { page } = await sendList(b);
  const first = linkOf([...mailbox].reverse().find((item) => item.to === 'office@sl17late-sub.example'));
  const before = await call('GET', `/api/hse/subcontracts/${b.subId}`, { reviewer: b.lead });
  assert.equal(before.data.sending.changes, null, JSON.stringify(page.sending && page.sending.changes));
  const answered = await call('PUT', `/api/hse/subcontracts/${b.subId}/points/${pointId}`, { reviewer: b.lead, body: { answer: 'Specimen Build supplies the props.' } });
  assert.equal(answered.status, 200, JSON.stringify(answered.data));
  assert.match(answered.data.message, /The list has changed since it was sent/);
  const after = await call('GET', `/api/hse/subcontracts/${b.subId}`, { reviewer: b.lead });
  assert.equal(after.data.sending.changes.pointsChanged, true);
  assert.equal(after.data.sending.remind.can, false);
  assert.equal((await call('GET', `/api/list/${first}`)).data.changed, true);
  const { preview } = await sendList(b);
  assert.equal(preview.kind, 'list_changed');
  assert.match(preview.email.text, /has answered questions on the SWMS list for Northgate Health Hub\./);
  const again = await call('GET', `/api/hse/subcontracts/${b.subId}`, { reviewer: b.lead });
  assert.equal(again.data.sending.changes, null);
});

test('a link kept before points were stored counts only answers given after it was sent', async () => {
  const b = await builder('sl17old');
  const pointId = require('../auth').newId();
  await db.query('INSERT INTO subcontract_points (id, subcontract_id, position, activity, clause, question, answer, answered_by, answered_by_name, answered_at) VALUES ($1, $2, 0, $3, $4, $5, $6, $7, $8, $9)',
    [pointId, b.subId, 'Formwork to suspended slabs', '2.1', 'Who supplies the props?', 'Specimen Build supplies the props.', 'x', 'Dana Whitfield', new Date(Date.now() - 60000)]);
  await sendList(b);
  await db.query("UPDATE list_links SET points = '[]' WHERE subcontract_id = $1", [b.subId]);
  assert.equal((await call('GET', `/api/hse/subcontracts/${b.subId}`, { reviewer: b.lead })).data.sending.changes, null);
  await db.query('UPDATE subcontract_points SET answered_at = $1 WHERE id = $2', [new Date(Date.now() + 60000), pointId]);
  assert.equal((await call('GET', `/api/hse/subcontracts/${b.subId}`, { reviewer: b.lead })).data.sending.changes.pointsChanged, true);
});
