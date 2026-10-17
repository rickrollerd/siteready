// SiteLink, Goal 12 stage 6: the subcontractor's drafts. A list taken up opens with its SWMS, the
// builder's site details filled in ("Set by {builder}"), the company's own details from its profile,
// its work kept on the server for that company only, and the lead's Release button (D311).
// Made-up companies, people and sites only.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.RATE_LIMIT_HSE_REQUESTS = '5000';
process.env.RATE_LIMIT_MAX_REQUESTS = '5000';
process.env.RATE_LIMIT_LIST_REQUESTS = '5000';
process.env.RATE_LIMIT_LIST_SENDS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const db = require('../db');
const send = require('../sitelink-send');
const abnRegister = require('../abn');
const builderSet = require('../public/builder-set');
const { validAbn } = require('../accounts');
const { prepareDraft } = require('../draft');
const { draftBody } = require('../input');
const { partContent } = require('../public/check-parts');
const { setupAccounts, mailbox, lastLinkToken } = require('./helpers');

abnRegister.lookupAbn = async () => ({ enabled: false });
let abnSeed = 63918275000;
function nextAbn() {
  for (abnSeed += 89; ; abnSeed += 1) if (validAbn(String(abnSeed))) return String(abnSeed);
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

async function call(method, route, { body, reviewer, session } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(reviewer ? { 'X-Reviewer-Token': reviewer } : {}), ...(session ? { Authorization: `Bearer ${session}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = response.headers.get('content-type') || '';
  return { status: response.status, data: type.includes('json') ? await response.json() : await response.text() };
}

function inDays(days) {
  const day = new Date(`${send.todayIn('qld')}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

async function leadSignIn(email, name = 'Dana Whitfield') {
  assert.equal((await call('POST', '/api/hse/email', { body: { email } })).status, 200);
  const text = [...mailbox].reverse().find((item) => item.to === email).text;
  const token = /\/sitelink\?login=([A-Za-z0-9_-]+)/.exec(text)[1];
  const { data } = await call('POST', '/api/hse/verify', { body: { token } });
  assert.equal((await call('PUT', '/api/hse/me', { reviewer: data.token, body: { name, position: 'HSE manager', phone: '0412 555 012' } })).status, 200);
  return data.token;
}

const DETAILS = {
  musterPoint: 'Assembly area A at the Wattle Road gate',
  firstAider: 'Priya Nair, site office, 0412 555 019',
  firstAidLocation: 'Site office, ground floor',
  hospital: 'Northside General Hospital, Emergency Department',
  siteManager: 'Ravi Patel, 0412 555 020',
  siteRules: ['Sign in at the site office before starting.', 'No work before 6:30 am.'],
};

// A builder's account with a project, its site details, a subcontract with two SWMS and an answered
// point, and the list sent to the subcontractor.
async function builder(prefix, { abn = '' } = {}) {
  const lead = await leadSignIn(`dana@${prefix}.example`);
  const org = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Corbel Build Pty Ltd', abn: nextAbn() } });
  assert.equal(org.status, 201, JSON.stringify(org.data));
  // The register is not reachable here; only a verified account sends list emails (D311), so the
  // account is marked verified, as the register would.
  await db.query("UPDATE orgs SET abn_check = 'verified', abn_verified_at = $1 WHERE id = $2", [new Date(), org.data.org.id]);
  const project = await call('POST', `/api/hse/orgs/${org.data.org.id}/projects`, { reviewer: lead, body: { name: 'Northgate Health Hub', workplace: '12 Wattle Road, Hamilton QLD 4007', state: 'qld' } });
  const projectId = project.data.project.id;
  assert.equal((await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 0, details: DETAILS } })).status, 200);
  const email = `office@${prefix}-sub.example`;
  const added = await call('POST', `/api/hse/projects/${projectId}/subcontracts`, { reviewer: lead, body: { name: 'Tallow Formwork Pty Ltd', trade: 'Formwork', email, abn } });
  assert.equal(added.status, 201, JSON.stringify(added.data));
  const subId = added.data.subcontract.id;
  for (const [title, task] of [['Formwork to suspended slabs', 'Form up, pour and strip the suspended slabs on levels 1 to 4.'], ['Edge protection to slab edges', 'Install and dismantle the edge screens at each slab edge.']]) {
    assert.equal((await call('POST', `/api/hse/subcontracts/${subId}/items`, { reviewer: lead, body: { title, task } })).status, 201);
  }
  // An answered point, as stage 4 keeps them.
  await db.query('INSERT INTO subcontract_points (id, subcontract_id, position, activity, clause, question, answer, answered_by, answered_by_name, answered_at) VALUES ($1, $2, 0, $3, $4, $5, $6, $7, $8, $9)',
    [`pt-${prefix}`, subId, 'Form up the slabs', '3.2', 'Confirm who supplies the edge screens.', 'Corbel supplies the screens. Tallow puts them up.', 'x', 'Dana Whitfield', new Date()]);
  const due = inDays(14);
  const preview = await call('POST', `/api/hse/subcontracts/${subId}/send/preview`, { reviewer: lead, body: { due } });
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  assert.equal((await call('POST', `/api/hse/subcontracts/${subId}/send`, { reviewer: lead, body: { due, check: preview.data.preview.check } })).status, 200);
  const token = /\/list\.html\?t=([A-Za-z0-9_-]+)/.exec(mailbox.filter((item) => item.to === email).pop().text)[1];
  return { lead, orgId: org.data.org.id, projectId, subId, token, email };
}

async function subbie(email, name = '', abn = '') {
  assert.equal((await call('POST', '/api/auth/email', { body: { email } })).status, 200);
  const { data } = await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } });
  if (name) assert.equal((await call('PUT', '/api/company', { session: data.token, body: { name, abn, address: '4 Tallow Lane, Darra QLD 4076', phone: '07 3555 0100', email } })).status, 200);
  return data.token;
}

// A team member of the company: the foreman, invited by the office admin.
async function teammate(admin, email) {
  assert.equal((await call('POST', '/api/company/users', { session: admin, body: { email } })).status, 200);
  const { data } = await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } });
  return data.token;
}

async function claimed(prefix, opts) {
  const b = await builder(prefix, opts);
  const abn = (opts && opts.abn) || nextAbn();
  const office = await subbie(`admin@${prefix}-sub.example`, 'Tallow Formwork Pty Ltd', abn);
  const claim = await call('POST', `/api/list/${b.token}/claim`, { session: office });
  assert.equal(claim.status, 200, JSON.stringify(claim.data));
  assert.equal(claim.data.listId, b.subId, 'the claim says where the list is in SiteWrite');
  return { ...b, office, abn };
}

// The project page as scope.js keeps it, for the list's two SWMS, with the page above.
function pageWork(list, page = {}, extra = {}) {
  return {
    project: { stage: 'questions', current: 0, items: list.items.map((item) => ({ ...item, body: null, status: 'todo' })), shared: { crane: 'none', site: { liveServices: 'None' } }, ...extra },
    page: { state: 'qld', workplace: list.project.workplace, ...page },
  };
}

// ---- The merge: company details always win, the builder's details follow the builder ----

test('company details always come from the company, never the builder or the page', () => {
  const set = builderSet.builderSetOf({ workplace: '12 Wattle Road, Hamilton QLD 4007', pcName: 'Corbel Build Pty Ltd' }, DETAILS);
  const company = { name: 'Tallow Formwork Pty Ltd', abn: '51 824 753 556', address: '4 Tallow Lane', phone: '07 3555 0100', email: 'office@tallow.example' };
  const merged = builderSet.mergePage({ company, builderSet: set, page: { company: 'Corbel Build Pty Ltd', companyAbn: '11 111 111 111', companyEmail: 'dana@corbel.example', subcontractor: 'Corbel' }, seen: null });
  assert.equal(merged.page.company, 'Tallow Formwork Pty Ltd');
  assert.equal(merged.page.companyAbn, '51 824 753 556');
  assert.equal(merged.page.companyEmail, 'office@tallow.example');
  assert.equal(merged.page.subcontractor, undefined);
  // The builder's details fill in, the principal contractor and the job address too.
  assert.equal(merged.page.musterPoint, DETAILS.musterPoint);
  assert.equal(merged.page.principalContractor, 'Corbel Build Pty Ltd');
  assert.deepEqual(merged.page.siteRules, DETAILS.siteRules);
  // A company with no details yet gets empty ones, never the builder's.
  assert.equal(builderSet.mergePage({ company: {}, builderSet: set, page: { company: 'Corbel Build Pty Ltd' } }).page.company, '');
  assert.deepEqual(builderSet.withoutCompany({ company: 'X', companyAbn: '1', task: 'Formwork' }), { task: 'Formwork' });
});

test('overrides are found correctly: a changed detail, an emptied one, never a detail changed back or only spaced differently', () => {
  const set = builderSet.builderSetOf({ workplace: '12 Wattle Road, Hamilton QLD 4007', pcName: 'Corbel Build Pty Ltd' }, DETAILS);
  const as = builderSet.mergePage({ company: {}, builderSet: set, page: {} }).page;
  assert.deepEqual(builderSet.overridesOf(set, as), []);
  // Changed, then back with other case, spacing and a full stop: no change.
  assert.deepEqual(builderSet.overridesOf(set, { ...as, musterPoint: '  assembly area A at the  Wattle Road gate. ', siteRules: '- Sign in at the site office before starting.\n• No work before 6:30 am.' }), []);
  const changed = builderSet.overridesOf(set, { ...as, musterPoint: 'Car park behind the site sheds', hospital: '', siteRules: ['Sign in at the site office before starting.'] });
  assert.deepEqual(changed.map((item) => item.key), ['hospital', 'musterPoint', 'siteRules']);
  assert.deepEqual(changed.find((item) => item.key === 'musterPoint'), { key: 'musterPoint', label: 'Muster point', set: DETAILS.musterPoint, now: 'Car park behind the site sheds' });
  // A detail the builder did not set is the company's to give.
  assert.deepEqual(builderSet.overridesOf(set, { ...as, scaffoldSupervisor: 'Pat Doyle' }), []);
  // The warning names the builder and what it asked for.
  assert.equal(builderSet.changedWarning('Corbel Build Pty Ltd', DETAILS.musterPoint), 'This was set by Corbel Build Pty Ltd. They asked all contractors to use: "Assembly area A at the Wattle Road gate". Corbel Build Pty Ltd will see this change when you submit.');
});

test('a detail the company did not change follows the builder\'s new version; one it changed stays as typed', () => {
  const before = builderSet.builderSetOf({ workplace: '12 Wattle Road', pcName: 'Corbel' }, DETAILS);
  const first = builderSet.mergePage({ company: {}, builderSet: before, page: {} });
  const typed = { ...first.page, hospital: 'Northside Private Hospital, Emergency Department' };
  const after = builderSet.builderSetOf({ workplace: '12 Wattle Road', pcName: 'Corbel' }, { ...DETAILS, musterPoint: 'Assembly area B at the Lutwyche Road gate', hospital: 'Royal Brisbane Hospital, Emergency Department', scaffoldSupervisor: 'Pat Doyle, Doyle Scaffolding, 0412 345 678' });
  const next = builderSet.mergePage({ company: {}, builderSet: after, page: typed, seen: first.seen });
  assert.equal(next.page.musterPoint, 'Assembly area B at the Lutwyche Road gate', 'not changed by the company: the new version');
  assert.equal(next.page.hospital, 'Northside Private Hospital, Emergency Department', 'changed by the company: kept');
  assert.equal(next.page.scaffoldSupervisor, 'Pat Doyle, Doyle Scaffolding, 0412 345 678', 'newly set: filled in');
  assert.deepEqual(builderSet.overridesOf(after, next.page).map((item) => item.key), ['hospital']);
});

// ---- Opening a list ----

test('a list taken up opens with its SWMS, the builder\'s site details, answers and "set by", and the company\'s own details', async () => {
  const c = await claimed('open1');
  const lists = await call('GET', '/api/from-builders', { session: c.office });
  assert.equal(lists.status, 200);
  assert.equal(lists.data.lists.length, 1);
  assert.equal(lists.data.lists[0].builder.name, 'Corbel Build Pty Ltd');
  assert.equal(lists.data.lists[0].progress.started, false);
  assert.equal(lists.data.lists[0].progress.total, 2);
  const opened = await call('GET', `/api/from-builders/${c.subId}`, { session: c.office });
  assert.equal(opened.status, 200, JSON.stringify(opened.data));
  const { list, progress } = opened.data;
  assert.deepEqual(list.items.map((item) => item.title), ['Formwork to suspended slabs', 'Edge protection to slab edges']);
  assert.equal(list.items[0].task, 'Form up, pour and strip the suspended slabs on levels 1 to 4.');
  assert.deepEqual(list.items[0].scopeTask, { plain: list.items[0].task, full: list.items[0].task, notes: '' }, 'a SWMS the lead wrote is read from the lead\'s words');
  assert.ok(list.items.every((item) => item.requiredId));
  assert.equal(list.builderSet.musterPoint.value, DETAILS.musterPoint);
  assert.equal(list.builderSet.principalContractor.value, 'Corbel Build Pty Ltd');
  assert.equal(list.builderSet.workplace.value, '12 Wattle Road, Hamilton QLD 4007');
  assert.equal(list.siteDetails.rev, 1);
  assert.equal(list.siteDetails.setBy, 'Dana Whitfield');
  assert.deepEqual(list.answers.map((answer) => answer.answer), ['Corbel supplies the screens. Tallow puts them up.']);
  assert.equal(list.contact.email, 'dana@open1.example');
  assert.equal(list.due.date, inDays(14));
  // Nothing saved yet: the page is the builder's details with the company's own.
  assert.equal(progress.version, 0);
  assert.equal(progress.project, null);
  assert.equal(progress.page.musterPoint, DETAILS.musterPoint);
  assert.equal(progress.page.state, 'qld');
  assert.equal(progress.page.company, 'Tallow Formwork Pty Ltd');
  assert.equal(progress.page.companyAddress, '4 Tallow Lane, Darra QLD 4076');
  assert.deepEqual(progress.overrides, []);
  // The list page knows the list is the company's, and where it is.
  const page = await call('GET', `/api/list/${c.token}`, { session: c.office });
  assert.equal(page.data.listId, c.subId);
  // Claiming twice says it is already the company's.
  const again = await call('POST', `/api/list/${c.token}/claim`, { session: c.office });
  assert.equal(again.data.already, true);
  assert.equal(again.data.listId, c.subId);
});

test('the office saves on a desktop and the foreman carries on on a phone; a save from a device that is behind is refused with the newer work', async () => {
  const c = await claimed('prog1');
  const foreman = await teammate(c.office, `foreman@prog1-sub.example`);
  const { list } = (await call('GET', `/api/from-builders/${c.subId}`, { session: c.office })).data;
  const work = pageWork(list, { worksManager: 'Sam Lee', musterPoint: 'Car park behind the site sheds', company: 'Corbel Build Pty Ltd', companyAbn: '99 999 999 999' });
  // A SWMS body naming another company is kept without it.
  work.project.items[0].body = { task: list.items[0].task, company: 'Corbel Build Pty Ltd', companyEmail: 'dana@corbel.example', facts: { pourMethod: 'Pump' } };
  const saved = await call('PUT', `/api/from-builders/${c.subId}/progress`, { session: c.office, body: { baseVersion: 0, ...work } });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.version, 1);
  assert.deepEqual(saved.data.overrides.map((item) => item.key), ['musterPoint']);
  const row = await db.one('SELECT * FROM sub_progress WHERE subcontract_id = $1', [c.subId]);
  assert.doesNotMatch(JSON.stringify(row.body), /Corbel Build Pty Ltd|99 999 999 999|dana@corbel/, 'no company details are kept with the work');
  assert.deepEqual(row.overrides.map((item) => item.key), ['musterPoint']);
  // The foreman, in the same company, on another device, sees the work.
  const phone = await call('GET', `/api/from-builders/${c.subId}`, { session: foreman });
  assert.equal(phone.status, 200);
  assert.equal(phone.data.progress.version, 1);
  assert.equal(phone.data.progress.page.worksManager, 'Sam Lee');
  assert.equal(phone.data.progress.page.musterPoint, 'Car park behind the site sheds', 'the company\'s change stays');
  assert.equal(phone.data.progress.page.company, 'Tallow Formwork Pty Ltd', 'company details from the profile');
  assert.deepEqual(phone.data.progress.overrides.map((item) => item.key), ['musterPoint']);
  assert.equal(phone.data.progress.project.items[0].body.facts.pourMethod, 'Pump');
  assert.equal(phone.data.progress.project.items[0].body.company, undefined);
  assert.match(phone.data.progress.updatedOn, /\d{4}/);
  // The foreman changes the muster point back and saves: no change from the builder's now.
  // Named by the "Prepared by" name on the page, as the foreman has no name on his account (messy round 7:
  // it showed an email address).
  const back = await call('PUT', `/api/from-builders/${c.subId}/progress`, { session: foreman, body: { baseVersion: 1, ...pageWork(list, { worksManager: 'Sam Lee', musterPoint: DETAILS.musterPoint, preparedBy: 'Tom Beck, Foreman' }) } });
  assert.equal(back.status, 200);
  assert.deepEqual(back.data.overrides, []);
  // The office's tab, still on version 1, is refused, and given the foreman's work.
  const behind = await call('PUT', `/api/from-builders/${c.subId}/progress`, { session: c.office, body: { baseVersion: 1, ...work } });
  assert.equal(behind.status, 409);
  assert.match(behind.data.message, /^This list was saved on another device by Tom Beck on .+\. The newest work is shown\.$/);
  assert.equal(behind.data.progress.version, 2);
  assert.equal(behind.data.progress.page.musterPoint, DETAILS.musterPoint);
  // The list of lists shows how far the work has got.
  const lists = (await call('GET', '/api/from-builders', { session: c.office })).data.lists;
  assert.equal(lists[0].progress.started, true);
  assert.equal(lists[0].progress.prepared, 0);
  // Bad bodies are refused plainly.
  assert.equal((await call('PUT', `/api/from-builders/${c.subId}/progress`, { session: c.office, body: { baseVersion: 2, project: { items: 'x' } } })).status, 400);
  assert.equal((await call('PUT', `/api/from-builders/${c.subId}/progress`, { session: c.office, body: { baseVersion: -1, ...work } })).status, 400);
});

test('SWMS the company adds are its own; a SWMS the builder takes off the list stays as the company\'s own', async () => {
  const c = await claimed('own1');
  const { list } = (await call('GET', `/api/from-builders/${c.subId}`, { session: c.office })).data;
  const work = pageWork(list);
  work.project.items.push({ title: 'Core holes for services', task: 'Core drill holes through the level 2 slab.', ownId: 'own-1', body: null, status: 'todo' });
  // A requiredId that is not on this list (made up, or another company's) is not taken as the builder's.
  work.project.items.push({ title: 'Something else', task: 'Other work entirely here.', requiredId: 'not-on-this-list', body: null, status: 'todo' });
  work.project.offList = [{ requiredId: 'not-on-this-list', title: 'x' }];
  const saved = await call('PUT', `/api/from-builders/${c.subId}/progress`, { session: c.office, body: { baseVersion: 0, ...work } });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const kept = (await call('GET', `/api/from-builders/${c.subId}`, { session: c.office })).data.progress.project;
  assert.equal(kept.items[2].ownId, 'own-1');
  assert.equal(kept.items[3].requiredId, undefined);
  assert.equal(kept.items[3].wasRequired, 'not-on-this-list');
  assert.deepEqual(kept.offList, []);
  const lists = (await call('GET', '/api/from-builders', { session: c.office })).data.lists;
  assert.equal(lists[0].progress.own, 2);
});

test('the scope\'s notes kept on a list item (rec7) reach the company as plain notes, once each, with no price', async () => {
  const c = await claimed('notes1');
  const row = await db.one('SELECT id, item FROM required_swms WHERE subcontract_id = $1 ORDER BY position LIMIT 1', [c.subId]);
  const item = { ...row.item, draftNotes: ['working hours are 6:30 am to 5 pm on weekdays.', { note: 'Working hours are 6:30 am to 5 pm on weekdays.' }, { note: 'Crane hire at $1,200 a day.', clause: '4.1' }, { text: 'Levels 3 and 4 are occupied during the works.', clause: '2.3' }, 7] };
  await db.query('UPDATE required_swms SET item = $1 WHERE id = $2', [JSON.stringify(item), row.id]);
  const { list } = (await call('GET', `/api/from-builders/${c.subId}`, { session: c.office })).data;
  assert.deepEqual(list.items[0].draftNotes, [{ text: 'Working hours are 6:30 am to 5 pm on weekdays.', clause: '' }, { text: 'Levels 3 and 4 are occupied during the works.', clause: '2.3' }]);
  assert.deepEqual(list.items[1].draftNotes, []);
  // As rec7 keeps them from a reading (handover.draftNotes): words, already one to a note.
  const handover = require('../handover');
  const fromReading = handover.draftNotes([{ unknowns: 'Working heights; who supplies the fan coil units' }, { unknowns: 'Roof height, pitch, edge protection' }]);
  // Each ends with a full stop (messy round 11, wording 2).
  assert.deepEqual(fromReading, ['Working heights.', 'Roof height, pitch, edge protection.']);
  await db.query('UPDATE required_swms SET item = $1 WHERE id = $2', [JSON.stringify({ ...row.item, draftNotes: fromReading }), row.id]);
  const again = (await call('GET', `/api/from-builders/${c.subId}`, { session: c.office })).data.list;
  assert.deepEqual(again.items[0].draftNotes.map((note) => note.text), fromReading);
});

// ---- Who can read what ----

test('the main contractor never reads the company\'s work: no lead route returns it and saving logs nothing', async () => {
  const c = await claimed('priv1');
  const { list } = (await call('GET', `/api/from-builders/${c.subId}`, { session: c.office })).data;
  const marker = 'Zephyr-Marker-4417 crew briefing';
  const before = (await db.query('SELECT * FROM project_log WHERE subcontract_id = $1', [c.subId])).length;
  assert.equal((await call('PUT', `/api/from-builders/${c.subId}/progress`, { session: c.office, body: { baseVersion: 0, ...pageWork(list, { worksManager: marker, musterPoint: 'Car park behind the site sheds' }) } })).status, 200);
  assert.equal((await db.query('SELECT * FROM project_log WHERE subcontract_id = $1', [c.subId])).length, before, 'nothing about the drafts goes in the log both sides see');
  for (const route of [`/api/hse/subcontracts/${c.subId}`, `/api/hse/projects/${c.projectId}`, `/api/hse/orgs/${c.orgId}/projects`, `/api/hse/me`]) {
    const seen = await call('GET', route, { reviewer: c.lead });
    assert.equal(seen.status, 200, route);
    const text = JSON.stringify(seen.data);
    assert.ok(!text.includes(marker), `${route} shows the company's work`);
    assert.ok(!text.includes('Car park behind the site sheds'), `${route} shows the company's change before it is submitted`);
  }
  // The lead's sign-in is not a company's: the company's routes are closed to it.
  for (const [method, route] of [['GET', '/api/from-builders'], ['GET', `/api/from-builders/${c.subId}`], ['PUT', `/api/from-builders/${c.subId}/progress`]]) {
    assert.equal((await call(method, route, { reviewer: c.lead, body: method === 'PUT' ? { baseVersion: 1, ...pageWork(list) } : undefined })).status, 401, route);
  }
  // Signed out, nothing.
  assert.equal((await call('GET', `/api/from-builders/${c.subId}`)).status, 401);
});

test('one subcontractor never sees another\'s list, or its work', async () => {
  const c = await claimed('iso1');
  const { list } = (await call('GET', `/api/from-builders/${c.subId}`, { session: c.office })).data;
  assert.equal((await call('PUT', `/api/from-builders/${c.subId}/progress`, { session: c.office, body: { baseVersion: 0, ...pageWork(list, { worksManager: 'Sam Lee' }) } })).status, 200);
  const other = await subbie('admin@iso1-other.example', 'Other Formwork Pty Ltd', nextAbn());
  const lists = await call('GET', '/api/from-builders', { session: other });
  assert.deepEqual(lists.data.lists, []);
  const read = await call('GET', `/api/from-builders/${c.subId}`, { session: other });
  assert.equal(read.status, 404);
  assert.equal(read.data.message, 'That list was not found. It may have been withdrawn, or released from your company.');
  assert.ok(!JSON.stringify(read.data).includes('Northgate'));
  assert.equal((await call('PUT', `/api/from-builders/${c.subId}/progress`, { session: other, body: { baseVersion: 1, ...pageWork(list) } })).status, 404);
  assert.equal((await call('PUT', `/api/from-builders/${c.subId}/progress`, { session: other, body: { baseVersion: 0, ...pageWork(list) } })).status, 404);
  assert.equal((await db.query('SELECT * FROM sub_progress WHERE subcontract_id = $1', [c.subId])).length, 1, 'only the company\'s own work is kept');
  // A second company claiming is refused, as in stage 5.
  const second = await call('POST', `/api/list/${c.token}/claim`, { session: other });
  assert.equal(second.status, 409);
  // A list withdrawn by the builder is gone for the company too.
  assert.equal((await call('DELETE', `/api/hse/subcontracts/${c.subId}`, { reviewer: c.lead })).status, 200);
  assert.equal((await call('GET', `/api/from-builders/${c.subId}`, { session: c.office })).status, 404);
  assert.deepEqual((await call('GET', '/api/from-builders', { session: c.office })).data.lists, []);
});

test('preparing the drafts needs a trial or subscription (D286); seeing the list stays free', async () => {
  const c = await claimed('trial1');
  const { list } = (await call('GET', `/api/from-builders/${c.subId}`, { session: c.office })).data;
  const companyId = (await db.one("SELECT company_id FROM users WHERE email = 'admin@trial1-sub.example'")).company_id;
  await db.query("UPDATE companies SET plan_status = 'trial', trial_ends_at = $1 WHERE id = $2", [new Date(Date.now() - 1000), companyId]);
  const lists = await call('GET', '/api/from-builders', { session: c.office });
  assert.equal(lists.status, 200);
  assert.equal(lists.data.lists.length, 1);
  assert.equal(lists.data.access, false);
  const opened = await call('GET', `/api/from-builders/${c.subId}`, { session: c.office });
  assert.equal(opened.status, 200);
  assert.equal(opened.data.access, false);
  assert.equal(opened.data.progress, null);
  assert.equal(opened.data.list.items.length, 2, 'the list itself shows');
  assert.match(opened.data.message, /^Your free trial has ended\. Subscribe to prepare these SWMS in SiteWrite\./);
  const save = await call('PUT', `/api/from-builders/${c.subId}/progress`, { session: c.office, body: { baseVersion: 0, ...pageWork(list) } });
  assert.equal(save.status, 402);
  await db.query("UPDATE companies SET plan_status = 'active' WHERE id = $1", [companyId]);
  assert.equal((await call('PUT', `/api/from-builders/${c.subId}/progress`, { session: c.office, body: { baseVersion: 0, ...pageWork(list) } })).status, 200);
});

// ---- Release (D311) ----

test('Release works only for the lead of that account; the released company loses the list and cannot take it up again', async () => {
  const c = await claimed('rel1');
  const { list } = (await call('GET', `/api/from-builders/${c.subId}`, { session: c.office })).data;
  assert.equal((await call('PUT', `/api/from-builders/${c.subId}/progress`, { session: c.office, body: { baseVersion: 0, ...pageWork(list, { worksManager: 'Sam Lee' }) } })).status, 200);
  const page = (await call('GET', `/api/hse/subcontracts/${c.subId}`, { reviewer: c.lead })).data;
  assert.equal(page.sending.release.can, true);
  assert.equal(page.sending.release.lead, true);
  const check = page.sending.release.check;
  // A member of the account cannot release it.
  assert.equal((await call('POST', `/api/hse/orgs/${c.orgId}/members`, { reviewer: c.lead, body: { email: 'sam@rel1.example' } })).status, 201);
  const member = await leadSignIn('sam@rel1.example', 'Sam Okafor');
  assert.equal((await call('GET', '/api/hse/me', { reviewer: member })).status, 200);
  const memberPage = (await call('GET', `/api/hse/subcontracts/${c.subId}`, { reviewer: member })).data;
  assert.equal(memberPage.sending.release.lead, false);
  const refused = await call('POST', `/api/hse/subcontracts/${c.subId}/release`, { reviewer: member, body: { check } });
  assert.equal(refused.status, 403);
  assert.equal(refused.data.message, 'Only the lead of your account can release a list. Ask the lead to do it.');
  // The lead of another account cannot even see it.
  const stranger = await leadSignIn('lee@rel1-other.example', 'Lee Grant');
  assert.equal((await call('POST', `/api/hse/subcontracts/${c.subId}/release`, { reviewer: stranger, body: { check } })).status, 404);
  // A company's session is not the lead's.
  assert.equal((await call('POST', `/api/hse/subcontracts/${c.subId}/release`, { session: c.office, body: { check } })).status, 401);
  // The lead releases the company it saw.
  assert.equal((await call('POST', `/api/hse/subcontracts/${c.subId}/release`, { reviewer: c.lead, body: { check: 'an older look' } })).status, 409);
  const done = await call('POST', `/api/hse/subcontracts/${c.subId}/release`, { reviewer: c.lead, body: { check } });
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.equal(done.data.message, 'The list is released. Tallow Formwork Pty Ltd no longer has it in SiteWrite, and cannot take it up again. Add the subcontractor\'s ABN under Change details, so only the right company can take it up.');
  assert.equal(done.data.sending.claimed, null);
  assert.equal(done.data.sending.release.released.length, 1);
  assert.equal(done.data.sending.release.released[0].name, 'Tallow Formwork Pty Ltd');
  const sub = await db.one('SELECT * FROM subcontracts WHERE id = $1', [c.subId]);
  assert.equal(sub.company_id, '');
  assert.equal(sub.status, 'sent', 'back to where it was before it was taken up (its link was not used)');
  const log = await db.query("SELECT summary FROM project_log WHERE subcontract_id = $1 AND kind = 'released'", [c.subId]);
  assert.match(log[0].summary, /^Dana Whitfield released the list for Tallow Formwork Pty Ltd from Tallow Formwork Pty Ltd \(ABN \d\d \d{3} \d{3} \d{3}\)\. Tallow Formwork Pty Ltd no longer has it in SiteWrite\.$/);
  // The released company loses the list, and its work on it cannot be read.
  assert.deepEqual((await call('GET', '/api/from-builders', { session: c.office })).data.lists, []);
  assert.equal((await call('GET', `/api/from-builders/${c.subId}`, { session: c.office })).status, 404);
  assert.equal((await call('PUT', `/api/from-builders/${c.subId}/progress`, { session: c.office, body: { baseVersion: 1, ...pageWork(list) } })).status, 404);
  // It cannot take it up again; the list page says why.
  const view = await call('GET', `/api/list/${c.token}`, { session: c.office });
  assert.equal(view.data.mine, false);
  assert.equal(view.data.listId, '');
  assert.match(view.data.refusal, /^Corbel Build Pty Ltd released this list from Tallow Formwork Pty Ltd, so Tallow Formwork Pty Ltd cannot take it up again\. If the list should be yours, contact Dana Whitfield at Corbel Build Pty Ltd/);
  const again = await call('POST', `/api/list/${c.token}/claim`, { session: c.office });
  assert.equal(again.status, 409);
  assert.match(again.data.message, /released this list from Tallow Formwork Pty Ltd/);
  // Nothing more to release now.
  assert.equal((await call('POST', `/api/hse/subcontracts/${c.subId}/release`, { reviewer: c.lead, body: { check } })).status, 400);
  // The right company takes it up, after the lead adds its ABN.
  const rightAbn = nextAbn();
  assert.equal((await call('PUT', `/api/hse/subcontracts/${c.subId}`, { reviewer: c.lead, body: { name: 'Tallow Formwork Pty Ltd', trade: 'Formwork', email: c.email, abn: rightAbn } })).status, 200);
  const right = await subbie('admin@rel1-right.example', 'Tallow Formwork Pty Ltd', rightAbn);
  assert.equal((await call('POST', `/api/list/${c.token}/claim`, { session: right })).status, 200);
  // With an ABN given, a list taken up by that company cannot be released here.
  const fixed = await call('POST', `/api/hse/subcontracts/${c.subId}/release`, { reviewer: c.lead, body: { check: (await call('GET', `/api/hse/subcontracts/${c.subId}`, { reviewer: c.lead })).data.sending.release.check } });
  assert.equal(fixed.status, 400);
  assert.match(fixed.data.message, /took up the list with the ABN you gave/);
  assert.equal((await call('GET', `/api/hse/subcontracts/${c.subId}`, { reviewer: c.lead })).data.sending.release.can, false);
  // The new company's list shows none of the released company's work.
  const opened = await call('GET', `/api/from-builders/${c.subId}`, { session: right });
  assert.equal(opened.status, 200);
  assert.equal(opened.data.progress.version, 0);
  assert.notEqual(opened.data.progress.page.worksManager, 'Sam Lee');
});

test('a mismatched ABN on claim stays blocked with the plain message', async () => {
  const subAbn = nextAbn();
  const b = await builder('abn1', { abn: subAbn });
  const wrong = await subbie('admin@abn1-other.example', 'Elsewhere Concrete Pty Ltd', nextAbn());
  const refused = await call('POST', `/api/list/${b.token}/claim`, { session: wrong });
  assert.equal(refused.status, 409);
  assert.equal(refused.data.message, 'This list is for a company with a different ABN, so it has not been added to Elsewhere Concrete Pty Ltd. If the list should be yours, contact Dana Whitfield at Corbel Build Pty Ltd (dana@abn1.example).');
  assert.deepEqual((await call('GET', '/api/from-builders', { session: wrong })).data.lists, []);
});

// ---- The builder's first aid location and site rules print ----

test('the first aid location and site rules print in the site details; a SWMS without them keeps its check fingerprint', () => {
  const input = { state: 'qld', task: 'Install ceiling grid and plasterboard to level 2 offices.', fallRisk: 'no', firstAidLocation: 'Site office, ground floor', siteRules: '• Sign in at the site office before starting.\nNo work before 6:30 am.\nNo work before 6:30 am.' };
  const draft = prepareDraft(draftBody(input));
  assert.equal(draft.firstAidLocation, 'Site office, ground floor');
  assert.deepEqual(draft.siteRules, ['Sign in at the site office before starting.', 'No work before 6:30 am.']);
  const parts = partContent(draft);
  assert.equal(parts.emergency.firstAidLocation, 'Site office, ground floor');
  assert.deepEqual(parts.site.siteRules, draft.siteRules);
  const without = partContent(prepareDraft(draftBody({ state: 'qld', task: input.task, fallRisk: 'no' })));
  assert.equal('firstAidLocation' in without.emergency, false, 'no new key, so SWMS checked before keep their ticks');
  assert.equal(draftBody({ state: 'qld', task: 'x' }).firstAidLocation, undefined);
  assert.equal(draftBody({ state: 'qld', task: 'x' }).siteRules, undefined);
  const docx = require('../docx-draft');
  const rows = docx.metaRows ? docx.metaRows(draft) : null;
  if (rows) {
    assert.ok(rows.some(([label, value]) => label === 'First aid location' && value === 'Site office, ground floor'));
    assert.ok(rows.some(([label, value]) => label === 'Site rules' && value === 'Sign in at the site office before starting.\nNo work before 6:30 am.'));
  }
});
