// SiteLink fixes from messy round 8 (16 October 2026, staging c744142). Made-up companies, people and
// sites only. No paid AI reading: the stand-in client answers with a made-up mechanical reading.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.RATE_LIMIT_HSE_REQUESTS = '5000';
process.env.RATE_LIMIT_AI_SCOPE_REQUESTS = '1000';
process.env.RATE_LIMIT_MAX_REQUESTS = '5000';
process.env.RATE_LIMIT_LIST_REQUESTS = '5000';
process.env.RATE_LIMIT_LIST_SENDS = '1000';
process.env.RATE_LIMIT_WORD_REQUESTS = '30000';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { app } = require('../server');
const db = require('../db');
const send = require('../sitelink-send');
const subbieRoutes = require('../sitelink-subbie');
const handover = require('../handover');
const answers = require('../sitelink-answers');
const aiScope = require('../ai-scope');
const abnRegister = require('../abn');
const { validAbn } = require('../accounts');
const draft = require('../draft');
const scopeTask = require('../public/scope-task');
const { prepareDraft } = require('../draft');
const { draftBody } = require('../input');
const { draftToDocx } = require('../docx-draft');
const { setupAccounts, mailbox, lastLinkToken, ANSWERED, ready, checked } = require('./helpers');

abnRegister.lookupAbn = async () => ({ enabled: false });
let abnSeed = 61829374000;
function nextAbn() {
  for (abnSeed += 89; ; abnSeed += 1) if (validAbn(String(abnSeed))) return String(abnSeed);
}

// A made-up mechanical reading: the main work, plant matched to plant lifting, and the trade's own
// access equipment, which folds into the main SWMS.
const row = (activity, pack, clause, quote, unknowns = '', extra = {}) => ({ activity, type: 'Site work', package: pack, crew: 'Mechanical fitters', clause, quotes: [quote], where: '', plant: '', conditions: '', unknowns, matrixColumn: '', ...extra });
const READING = {
  activities: [
    row('Install ductwork and fan coil units in the ceiling spaces', 'Ductwork and mechanical units: whole project', 'Installation 1', 'Install ductwork and fan coil units in the ceiling spaces on levels 1 to 4.', 'confirm who supplies the fan coil units'),
    row('Install rooftop condensers and connect the refrigerant lines', 'Ductwork and mechanical units: whole project', 'Installation 2', 'Install rooftop condensers and connect the refrigerant lines.'),
    row('Use scissor lifts and mobile scaffolds to reach the ceilings', 'Access equipment', 'Installation 7', 'Use scissor lifts and mobile scaffolds.'),
  ],
  byOthers: [],
  conflicts: [],
};
const GROUPS = { 'Ductwork and mechanical units: whole project': ['ductwork', 'fanCoil', 'refrigerantPipe'], 'Access equipment': ['scaffold', 'ewp'] };
const SCOPE = ['Subcontract scope of works: Mechanical services', ...READING.activities.map((one, i) => `1.${i + 1} ${one.quotes[0]}`),
  ...Array(4).fill('The Subcontractor shall carry out the works in accordance with the drawings and specifications, keep the work area tidy, and coordinate its work with other trades on the site at all times.')].join('\n');
const standIn = {
  beta: {
    messages: {
      stream(params) {
        const mapping = Boolean(params.output_config.format.schema.properties.packages);
        const content = params.messages[0].content;
        const body = mapping ? { packages: [...content.matchAll(/^Work package: (.*)$/gm)].map((m) => ({ package: m[1], groups: GROUPS[m[1]] || [], unmatched: [], byOthers: [] })) } : READING;
        return { finalMessage: async () => ({ stop_reason: 'end_turn', model: 'claude-opus-5-5', usage: { input_tokens: 1000, output_tokens: 500 }, content: [{ type: 'text', text: JSON.stringify(body) }] }) };
      },
    },
  },
};

let server;
let base;
test.before(async () => {
  await setupAccounts();
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
  aiScope.useClient(standIn);
  server = app.listen(0);
  server.keepAliveTimeout = 120000;
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => {
  aiScope.useClient(null);
  delete process.env.ANTHROPIC_API_KEY;
  server.close();
});

async function call(method, route, { body, reviewer, session, raw, headers = {} } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(reviewer ? { 'X-Reviewer-Token': reviewer } : {}), ...(session ? { Authorization: `Bearer ${session}` } : {}), ...headers },
    body: raw || (body ? JSON.stringify(body) : undefined),
  });
  const type = response.headers.get('content-type') || '';
  return { status: response.status, data: type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
}
function inDays(days) {
  const day = new Date(`${send.todayIn('qld')}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}
async function leadSignIn(email, position = 'HSE manager') {
  assert.equal((await call('POST', '/api/hse/email', { body: { email } })).status, 200);
  const text = [...mailbox].reverse().find((item) => item.to === email).text;
  const token = /\/sitelink\?login=([A-Za-z0-9_-]+)/.exec(text)[1];
  const { data } = await call('POST', '/api/hse/verify', { body: { token } });
  const me = await call('PUT', '/api/hse/me', { reviewer: data.token, body: { name: 'Dana Whitfield', position, phone: '0412 555 012' } });
  assert.equal(me.status, 200, JSON.stringify(me.data));
  return data.token;
}
const WORKPLACE = '12 Wattle Road, Hamilton QLD 4007';
const DETAILS = {
  musterPoint: 'Assembly area A at the Wattle Road gate',
  firstAider: 'Priya Nair, site office, 0412 555 019',
  firstAidLocation: 'Site office, ground floor',
  hospital: 'Northside General Hospital, Emergency Department',
  siteManager: 'Ravi Patel, 0412 555 020',
  siteRules: ['Sign in at the site office before starting.'],
};
const ITEMS = [['Boundary fence repairs', 'Replace a 3m length of timber fence along the site boundary.'], ['Ceilings to level 2', 'Install ceiling grid and plasterboard to level 2 offices.']];

// A builder's account with a project, its site details, a subcontract with two SWMS, and the list sent.
async function builder(prefix, { abn = '', subName = 'Tallow Interiors Pty Ltd', position } = {}) {
  const leadEmail = `dana@${prefix}.example`;
  const lead = await leadSignIn(leadEmail, position);
  const org = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Corbel Build Pty Ltd', abn: nextAbn() } });
  assert.equal(org.status, 201, JSON.stringify(org.data));
  await db.query("UPDATE orgs SET abn_check = 'verified', abn_verified_at = $1 WHERE id = $2", [new Date(), org.data.org.id]);
  const project = await call('POST', `/api/hse/orgs/${org.data.org.id}/projects`, { reviewer: lead, body: { name: 'Northgate Health Hub', workplace: WORKPLACE, state: 'qld' } });
  const projectId = project.data.project.id;
  assert.equal((await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 0, details: DETAILS } })).status, 200);
  const email = `office@${prefix}-sub.example`;
  const added = await call('POST', `/api/hse/projects/${projectId}/subcontracts`, { reviewer: lead, body: { name: subName, trade: 'Interiors', email, abn } });
  assert.equal(added.status, 201, JSON.stringify(added.data));
  const subId = added.data.subcontract.id;
  for (const [title, task] of ITEMS) assert.equal((await call('POST', `/api/hse/subcontracts/${subId}/items`, { reviewer: lead, body: { title, task } })).status, 201);
  const due = inDays(14);
  const preview = await call('POST', `/api/hse/subcontracts/${subId}/send/preview`, { reviewer: lead, body: { due } });
  assert.equal((await call('POST', `/api/hse/subcontracts/${subId}/send`, { reviewer: lead, body: { due, check: preview.data.preview.check } })).status, 200);
  const token = /\/list\.html\?t=([A-Za-z0-9_-]+)/.exec(mailbox.filter((item) => item.to === email).pop().text)[1];
  return { lead, orgId: org.data.org.id, projectId, subId, token, email, leadEmail };
}
async function subbie(email, name = '', abn = '') {
  assert.equal((await call('POST', '/api/auth/email', { body: { email } })).status, 200);
  const { data } = await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } });
  if (name) assert.equal((await call('PUT', '/api/company', { session: data.token, body: { name, abn, address: '4 Tallow Lane, Darra QLD 4076', phone: '07 3555 0100', email } })).status, 200);
  return data.token;
}
async function claimed(prefix) {
  const b = await builder(prefix);
  const office = await subbie(`admin@${prefix}-sub.example`, 'Tallow Interiors Pty Ltd', nextAbn());
  assert.equal((await call('POST', `/api/list/${b.token}/claim`, { session: office })).status, 200);
  const { list } = (await call('GET', `/api/from-builders/${b.subId}`, { session: office })).data;
  return { ...b, office, list };
}
function swmsFor(item, extra = {}, who = { name: 'Ben Hollis', role: 'Foreman' }) {
  const input = ready({ ...ANSWERED, state: 'qld', task: item.task, fallRisk: 'no', residential: 'no', workplace: WORKPLACE, principalContractor: 'Corbel Build Pty Ltd', ...DETAILS, ...extra });
  return { ...checked(input, null, who), swmsTitle: item.title };
}
const submitItems = (c, entries) => call('POST', `/api/from-builders/${c.subId}/submit`, { session: c.office, body: { items: entries } });
const one = (item, extra, who) => ({ requiredId: item.requiredId, swms: swmsFor(item, extra, who) });
const logOf = async (c) => (await call('GET', `/api/hse/subcontracts/${c.subId}`, { reviewer: c.lead })).data.sending.log.map((entry) => entry.text);

// ---- Stuck point 1: "Changed since you submitted it", the false "saved on another device" and the 409 ----

test('a save that holds the same work is not a new version, so a reload or a save sent again does not make another device behind', async () => {
  const c = await claimed('r8same');
  const work = { stage: 'review', current: 0, items: c.list.items.map((item) => ({ ...item, body: { task: item.task } })) };
  const page = { state: 'qld', worksManager: 'Sam Lee' };
  const put = (baseVersion, project = work, extra = page) => call('PUT', `/api/from-builders/${c.subId}/progress`, { session: c.office, body: { baseVersion, project, page: extra } });
  let r = await put(0);
  assert.equal(r.status, 200);
  assert.equal(r.data.version, 1);
  // The desktop reloads and saves the same work: still version 1.
  r = await put(1, { ...work, current: 1, stage: 'check' });
  assert.equal(r.data.version, 1, 'which SWMS is open is not work');
  // A save whose answer was lost (a 502) is sent again from version 0: the work is already kept, so it is
  // taken as saved, not refused as "saved on another device".
  r = await put(0);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.version, 1);
  // The phone, which opened at version 1, saves a real change: accepted.
  r = await put(1, work, { ...page, worksManager: 'Kim Tran' });
  assert.equal(r.data.version, 2);
  // A device still at version 1 with other work is refused, as before, with the newer work.
  r = await put(1, work, { ...page, worksManager: 'Jo Park' });
  assert.equal(r.status, 409);
  assert.equal(r.data.progress.version, 2);
  assert.equal(subbieRoutes.sameWork({ project: { a: 1, current: 0 }, page: { b: 2 } }, { page: { b: 2 }, project: { current: 3, a: 1 } }), true);
});

test('a submission keeps what each part printed, so every device tells the same whether the SWMS changed since', async () => {
  const c = await claimed('r8hash');
  const [fence] = c.list.items;
  const entry = one(fence);
  const r = await submitItems(c, [entry]);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const latest = r.data.sent.items[fence.requiredId].latest;
  assert.deepEqual(latest.partHashes, entry.swms.check.partHashes);
  // Another device opening the list reads the same.
  const other = (await call('GET', `/api/from-builders/${c.subId}`, { session: c.office })).data.sent.items[fence.requiredId].latest;
  assert.deepEqual(other.partHashes, entry.swms.check.partHashes);
  // Submit again with nothing changed: kept once, as before.
  const again = await submitItems(c, [one(fence)]);
  assert.equal(again.data.submitted[0].repeated, true);
});

// ---- Stuck point 3: a wrong ABN saved on the company, from the list page ----

test('a company whose ABN does not match is logged for the lead once, and is told how SiteWrite corrects a fixed name and ABN', async () => {
  const b = await builder('r8abn', { abn: nextAbn() });
  const wrong = await subbie('admin@r8abn-sub.example', 'wallaroo electrical', nextAbn());
  // Opening the list signed in: refused on the page, with the refusal kind for the fix, and logged once.
  for (let i = 0; i < 2; i += 1) {
    const page = await call('GET', `/api/list/${b.token}`, { session: wrong });
    assert.equal(page.data.refusalKind, 'abn');
    assert.match(page.data.refusal, /^This list is for a company with a different ABN/);
  }
  const claim = await call('POST', `/api/list/${b.token}/claim`, { session: wrong });
  assert.equal(claim.status, 409);
  const tries = (await logOf(b)).filter((text) => /does not match the ABN you gave/.test(text));
  assert.equal(tries.length, 1, 'logged once for this company and ABN');
  // The company can fix its name and ABN until a SWMS is saved; after that the refusal says how.
  const user = await db.one('SELECT company_id FROM users WHERE email = $1', ['admin@r8abn-sub.example']);
  await db.query("INSERT INTO events (id, company_id, type, created_at) VALUES ($1, $2, 'swms_saved', $3)", ['ev-r8abn', user.company_id, new Date()]);
  const fixed = await call('PUT', '/api/company', { session: wrong, body: { name: 'Wallaroo Bend Electrical Pty Ltd', abn: nextAbn() } });
  assert.equal(fixed.status, 403);
  assert.match(fixed.data.message, /To have SiteWrite correct them, email \S+@\S+ from this account's email address with the right name and ABN\.$/);
  assert.ok(fixed.data.support);
  // The list page offers the fix where the refusal is.
  const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'list.js'), 'utf8');
  assert.match(page, /Change the company name and ABN/);
  assert.match(page, /Save and try again/);
});

// ---- Stuck point 5: a retried response or record is never doubled ----

test('a response, a recorded file and a condition pressed again after a 502 are kept once', async () => {
  const c = await claimed('r8twice');
  const [fence, ceilings] = c.list.items;
  const r = await submitItems(c, [one(fence)]);
  const submissionId = r.data.submitted[0].id;
  const respond = () => call('POST', `/api/hse/submissions/${submissionId}/response`, { reviewer: c.lead, body: { response: 'conditions', text: 'Show the fence panel lifting plan.' } });
  const first = await respond();
  assert.equal(first.status, 201, JSON.stringify(first.data));
  assert.equal(first.data.emailed, true);
  const before = mailbox.length;
  const second = await respond();
  assert.equal(second.status, 200);
  assert.equal(second.data.repeated, true);
  assert.equal(second.data.emailed, true, 'says the first one was emailed');
  assert.equal(mailbox.length, before, 'no second email');
  assert.equal((await db.query('SELECT id FROM swms_reviews WHERE submission_id = $1', [submissionId])).length, 1);
  // The condition marked done twice: done once, no refusal.
  const condition = (await db.one('SELECT id FROM review_conditions WHERE submission_id = $1', [submissionId])).id;
  const done = () => call('POST', `/api/from-builders/${c.subId}/conditions/${condition}/done`, { session: c.office, body: { note: 'Plan on site.' } });
  assert.equal((await done()).status, 200);
  assert.equal((await done()).status, 200);
  assert.equal((await logOf(c)).filter((text) => /marked a condition/.test(text)).length, 1);
  // Marked done by the person, not the company: the name given with the check (wording 6).
  assert.ok((await logOf(c)).some((text) => /^Ben Hollis at Tallow Interiors Pty Ltd marked a condition/.test(text)), (await logOf(c)).join('\n'));
  // Confirmed twice: confirmed once, with its reply both times.
  const confirm = () => call('POST', `/api/hse/conditions/${condition}/confirm`, { reviewer: c.lead });
  assert.equal((await confirm()).data.message, 'Confirmed done.');
  assert.equal((await confirm()).data.message, 'Confirmed done.');
  // A file recorded twice for the same SWMS a moment apart is one submission.
  const file = Buffer.from(await draftToDocx(prepareDraft(draftBody(ready({ ...ANSWERED, state: 'qld', task: ceilings.task, fallRisk: 'no', residential: 'no' }))), {}));
  const record = () => call('POST', `/api/hse/subcontracts/${c.subId}/items/${ceilings.requiredId}/outside`, { reviewer: c.lead, raw: file, headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': 'Ceilings SWMS.docx', 'X-Note': 'emailed by tallow 16 oct' } });
  const one1 = await record();
  assert.equal(one1.status, 201, JSON.stringify(one1.data));
  assert.equal((await record()).status, 201);
  const rows = await db.query("SELECT note FROM submissions WHERE subcontract_id = $1 AND channel = 'outside'", [c.subId]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].note, 'Emailed by Tallow 16 Oct', 'a capital to start (wording 13), and the company and month as written (round 9, wording 9)');
});

test('the 502 message on a SiteLink page names SiteLink', () => {
  const hsePage = fs.readFileSync(path.join(__dirname, '..', 'public', 'hse.js'), 'utf8');
  assert.match(hsePage, /const SERVER_DOWN = 'SiteLink could not reach the server\. Try again\.';/);
  assert.match(hsePage, /\[502, 503, 504\]\.includes\(response\.status\)/);
  const review = fs.readFileSync(path.join(__dirname, '..', 'public', 'review.js'), 'utf8');
  assert.match(review, /const SERVER_DOWN = `\$\{inProject \? 'SiteLink' : 'SiteWrite'\} could not reach the server\. Try again\.`;/);
});

// ---- Blocker 1: the high risk line and "Also covers" after "Change the work" ----

async function readScope(prefix) {
  const lead = await leadSignIn(`dana@${prefix}.example`);
  const org = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Bowerbird Creek Constructions', abn: nextAbn() } });
  const project = await call('POST', `/api/hse/orgs/${org.data.org.id}/projects`, { reviewer: lead, body: { name: 'Noosa Junction aged care', workplace: '22 Sunshine Beach Road, Noosa Heads QLD 4567', state: 'qld' } });
  const projectId = project.data.project.id;
  const added = await call('POST', `/api/hse/projects/${projectId}/subcontracts`, { reviewer: lead, body: { name: 'Coolwater Air Pty Ltd', trade: 'Mechanical' } });
  const subId = added.data.subcontract.id;
  const sent = await call('POST', `/api/hse/subcontracts/${subId}/scope`, { reviewer: lead, body: { file: { name: 'Mechanical scope.txt', data: Buffer.from(SCOPE).toString('base64') } } });
  assert.ok([200, 202].includes(sent.status), JSON.stringify(sent.data));
  for (let i = 0; i < 300; i += 1) {
    const page = await call('GET', `/api/hse/subcontracts/${subId}`, { reviewer: lead });
    if (page.data.reading.status !== 'reading') return { lead, projectId, subId, page: page.data };
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
  throw new Error('the reading did not finish');
}

test('after "Change the work", the high risk line and "Also covers" come from the new words only', async () => {
  const { lead, subId, page } = await readScope('r8work');
  const main = page.items.find((item) => item.title === 'Ductwork and mechanical units');
  assert.deepEqual(main.alsoCovers, ['Access equipment']);
  assert.equal(main.highRisk.status, 'yes');
  assert.match(main.highRisk.lines[0], /Chemical, fuel or refrigerant lines/);
  const next = (await call('PUT', `/api/hse/subcontracts/${subId}/items/${main.id}`, { reviewer: lead, body: { task: 'install the ductwork, dampers and grilles in the ceiling spaces on levels 1 to 4' } })).data;
  assert.equal(next.message, 'The work for Ductwork and mechanical units is saved. Access equipment is no longer part of it: it is under Removed. Put it back if it needs a SWMS of its own.');
  const changed = next.items.find((item) => item.id === main.id);
  assert.equal(changed.task, 'Install the ductwork, dampers and grilles in the ceiling spaces on levels 1 to 4.', 'a capital and a full stop (wording 14)');
  assert.deepEqual(changed.alsoCovers, []);
  assert.ok(!changed.highRisk || !/Chemical, fuel or refrigerant lines/.test(JSON.stringify(changed.highRisk)), JSON.stringify(changed.highRisk));
  const access = next.items.find((item) => item.title === 'Access equipment');
  assert.equal(access.group, 'removed');
  assert.match(access.removedWhy, /^Taken out of the SWMS it was part of, when you changed that SWMS's work\./);
  // The step groups kept are only those the new words name.
  const kept = await db.one('SELECT item FROM required_swms WHERE id = $1', [main.id]);
  assert.deepEqual(kept.item.kinds, ['ductwork']);
  // What the subcontractor would see says the same.
  const sent = next.preview.swms.find((item) => item.title === 'Ductwork and mechanical units');
  assert.deepEqual(sent.alsoCovers || [], []);
});

// ---- Blocker 2: "by law" from the SWMS's own work, not a site answer filled across ----

test('a site answer filled across to every SWMS of a project does not make each one high risk work', () => {
  const site = { ground: 'Open trenches near building 5 during pit work.', liveServices: 'Energised temporary boards.', publicInterface: 'None', otherTrades: 'Plumbers', access: 'Front gate' };
  const testing = { state: 'qld', task: 'Test and commission the electrical installation in buildings 1 to 5, including RCD and insulation resistance tests.', fallRisk: 'no', residential: 'no', crane: 'none', site };
  const ids = (input) => draft.screenHighRisk(input).categories.map((item) => item.id);
  // Its own answers (one SWMS): the trench counts, as before.
  assert.ok(ids(testing).includes('trench'));
  // Filled across from the project's page: the trench is the pit work's, not testing's.
  assert.ok(!ids({ ...testing, siteShared: true }).includes('trench'));
  assert.ok(ids({ ...testing, siteShared: true }).includes('electrical'), 'its own words still bring energised work');
  const project = fs.readFileSync(path.join(__dirname, '..', 'public', 'project-go.js'), 'utf8');
  // Messy round 10: a SWMS with its own answers still sends those it has as the project gave them.
  assert.match(project, /siteShared: project\.items\.length < 2 \? undefined : !item\.siteOwn \? true : sharedIds\(item\.siteOwn\),/);
});

// ---- Blocker 3: scope notes the lead's answers have settled ----

test('a scope note the lead\'s answer settles is marked settled, with the answer; a loose note names its work', () => {
  const item = { draftNotes: [{ text: 'CCTV and Duress are listed as exclusions.', clause: '2.3' }, { text: '4.1.3 says temporary switchboards are supplied by the Contractor while 4.1.1 has the Subcontractor supplying temporary electrical services.', clause: '' }, { text: 'The riser cupboards are not yet sized.', clause: '' }] };
  const said = [{ activity: 'a', question: 'Whether cable management for access control, CCTV and duress is in this scope?', answer: 'Yes, cable management for access control, CCTV and duress is in this scope.' }, { activity: 'b', question: 'Who supplies the temporary boards?', answer: 'Bowerbird supplies the temporary boards. Wallaroo installs, tests and tags them monthly.' }];
  const out = subbieRoutes.withSettled(item, said).draftNotes;
  assert.equal(out[0].settled, said[0].answer);
  assert.equal(out[1].settled, said[1].answer);
  assert.equal(out[2].settled, undefined);
  // "Party not named." and "Locations to be advised by the Contractor." say which work they are about.
  const notes = handover.draftNotes([{ activity: 'Install cable drums on stands', unknowns: 'Party not named' }, { activity: 'Install the pits', unknowns: 'Locations to be advised by the Contractor' }]);
  assert.deepEqual(notes, ['Install cable drums on stands: party not named.', 'Install the pits: locations to be advised by the Contractor.']);
});

// ---- Blocker 5: "No, it is not ours", and the wrong company's open ----

test('"No, it is not ours" is logged, and a link opened by another company is not the named company\'s open', async () => {
  const b = await builder('r8notours', { subName: 'Pademelon Comms Pty Ltd' });
  const other = await subbie('admin@r8notours-wallaroo.example', 'Wallaroo Bend Electrical Pty Ltd', nextAbn());
  const page = await call('GET', `/api/list/${b.token}`, { session: other });
  assert.equal(page.status, 200);
  let project = (await call('GET', `/api/hse/subcontracts/${b.subId}`, { reviewer: b.lead })).data;
  assert.ok(!project.sending.opened, 'not counted as Pademelon opening it');
  let log = await logOf(b);
  assert.ok(log.some((text) => /was opened by someone signed in to SiteWrite for Wallaroo Bend Electrical Pty Ltd, not Pademelon Comms Pty Ltd\./.test(text)), log.join('\n'));
  assert.ok(!log.some((text) => /^The link in the list sent to Pademelon Comms Pty Ltd .* was opened\.$/.test(text)));
  assert.equal((await call('POST', `/api/list/${b.token}/not-ours`, { session: other, body: {} })).status, 200);
  log = await logOf(b);
  assert.ok(log.some((text) => /^Wallaroo Bend Electrical Pty Ltd \(ABN [\d ]+\) was asked in SiteWrite whether the list for Pademelon Comms Pty Ltd is its own, and said no\. It did not take it up\.$/.test(text)), log.join('\n'));
  // Opened signed out: anyone the email reached could have done that, so it is not counted as Pademelon's
  // (messy round 9, blocker 5); opened signed in by Pademelon, it is.
  await call('GET', `/api/list/${b.token}`);
  project = (await call('GET', `/api/hse/subcontracts/${b.subId}`, { reviewer: b.lead })).data;
  assert.ok(!project.sending.opened);
  assert.equal(project.sending.openedUnknown, true);
  const own = await subbie('admin@r8notours-sub.example', 'Pademelon Comms Pty Ltd', nextAbn());
  await call('GET', `/api/list/${b.token}`, { session: own });
  project = (await call('GET', `/api/hse/subcontracts/${b.subId}`, { reviewer: b.lead })).data;
  assert.ok(project.sending.opened);
});

// ---- Blocker 6: bare and area titles ----

test('a bare or area title on the list gets a work title from the reading\'s own words', () => {
  const r = (activity, pack, crew = 'Electricians') => ({ activity, type: 'Site work', package: pack, crew, clause: '1', quotes: [activity], where: '', plant: '', conditions: '', unknowns: '', matrixColumn: '' });
  const reading = {
    activities: [
      r('Install, maintain and later remove temporary electrical services (lighting and power)', 'Electrical'),
      r('Install three phase power to all temporary boards', 'Electrical'),
      r('Carry out power changeovers out of hours', 'Electrical'),
      r('Install the main switchboards and submains', 'Trade installation: Central Facilities'),
      r('Install the lighting and power to every room', 'Trade installation: Central Facilities'),
      r('Install the emergency lighting', 'Trade installation: Central Facilities'),
      r('Install generators and fuel tank', 'Trade installation: generator'),
      r('Test and commission the electrical installation', 'Testing and commissioning'),
    ],
    byOthers: [],
    conflicts: [],
    highRisk: ['Electrical', 'Trade installation: Central Facilities', 'Trade installation: generator', 'Testing and commissioning'].map((name) => ({ package: name, categories: [{ id: 'electrical', short: 'Energised electrical installations or services', likely: false }], dependsOn: [] })),
  };
  const titles = handover.listItems(reading).filter((item) => !item.removedWhy).map((item) => item.title);
  assert.ok(titles.includes('Temporary electrical services'), titles.join(' | '));
  assert.ok(titles.includes('Electrical installation, Central Facilities'), titles.join(' | '));
  assert.ok(titles.includes('Install generators and fuel tank'), titles.join(' | '));
  assert.ok(titles.includes('Testing and commissioning'));
  assert.ok(!titles.some((title) => /^Trade installation:|^Electrical$/.test(title)));
});

// ---- Wording problems ----

test('wording: roles, answers, brackets, n/a, "us", the reused reading, and the review hint', async () => {
  // 1. "hse" prints as HSE.
  assert.equal(answers.tidyRole('hse'), 'HSE');
  assert.equal(answers.tidyRole('hse manager'), 'HSE manager');
  assert.equal(answers.tidyRole('Site Manager'), 'Site Manager');
  const b = await builder('r8role', { position: 'hse' });
  const list = await call('GET', `/api/list/${b.token}`);
  assert.equal(list.data.from.position, 'HSE');
  // 2. Each sentence of an answer starts with a capital; 14. reworded work ends with a full stop.
  assert.equal(answers.capitalSentences('bowerbird supplies the temporary boards. wallaroo installs them'), 'Bowerbird supplies the temporary boards. Wallaroo installs them');
  assert.equal(answers.capitalSentences('test for dead and re-energise', { stop: true }), 'Test for dead and re-energise.');
  // 3. A bracket that carries on the sentence is not a colon.
  assert.equal(scopeTask.plainTask([{ activity: 'Install cable management for access control (and CCTV and duress)' }]), 'Install cable management for access control and CCTV and duress.');
  // 9. "n/a" for the scaffold supervisor says to leave it empty.
  const nA = await call('PUT', `/api/hse/projects/${b.projectId}/site-details`, { reviewer: b.lead, body: { baseRev: 1, details: { ...DETAILS, scaffoldSupervisor: 'n/a' } } });
  assert.equal(nA.status, 400);
  assert.equal(nA.data.message, '"n/a" is not a person. Leave the scaffold supervisor empty if there is no scaffold.');
  // 4. The review page's hint fits the response chosen; 5. it says before sending when the business is
  // not on SiteWrite.
  const review = fs.readFileSync(path.join(__dirname, '..', 'public', 'review.js'), 'utf8');
  assert.match(review, /chosen\(\) === 'changes' \? 'Write each change on its own line, so the business knows what to fix\.'/);
  assert.match(review, /is not on SiteWrite, so SiteLink does not email it: send your response to them yourself\./);
  // 12. No comma straight after the Unverified tag.
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'public', 'list.js'), 'utf8'), /\$\{unverified\}<br>Sent by/);
});

test('wording: "us" on a point, a file read before, and My SWMS after a SiteLink review', async () => {
  const { lead, subId, page } = await readScope('r8us');
  const point = page.points.find((one) => one.inPlay);
  const us = await call('PUT', `/api/hse/subcontracts/${subId}/points/${point.id}`, { reviewer: lead, body: { answer: 'us' } });
  assert.equal(us.status, 400);
  assert.equal(us.data.message, '"us" does not say who. Name the company, for example "The main contractor supplies them" or "The subcontractor supplies them".');
  // 11. The same file for a second subcontract: the log does not say SiteLink read it.
  const projectId = (await db.one('SELECT project_id FROM subcontracts WHERE id = $1', [subId])).project_id;
  const second = await call('POST', `/api/hse/projects/${projectId}/subcontracts`, { reviewer: lead, body: { name: 'Quenda Mechanical Pty Ltd', trade: 'Mechanical' } });
  const again = await call('POST', `/api/hse/subcontracts/${second.data.subcontract.id}/scope`, { reviewer: lead, body: { file: { name: 'Mechanical scope.txt', data: Buffer.from(SCOPE).toString('base64') } } });
  assert.equal(again.status, 200, JSON.stringify(again.data));
  await call('GET', `/api/hse/subcontracts/${second.data.subcontract.id}`, { reviewer: lead });
  const log = (await call('GET', `/api/hse/projects/${projectId}`, { reviewer: lead })).data.log.map((entry) => entry.text);
  assert.ok(log.some((text) => /SiteLink listed \d+ SWMS for Quenda Mechanical Pty Ltd from its earlier reading of Mechanical scope\.txt\./.test(text)), log.join('\n'));
  assert.ok(!log.some((text) => /SiteLink read Mechanical scope\.txt, the scope for Quenda/.test(text)));
  assert.ok(log.some((text) => /SiteLink read Mechanical scope\.txt, the scope for Coolwater Air Pty Ltd, and listed \d+ SWMS\./.test(text)), 'the first reading is said as read');
});

test('My SWMS after a SiteLink review says to submit it again there, each condition on its own line; counts are the company\'s own', async () => {
  const c = await claimed('r8mine');
  const [fence] = c.list.items;
  const r = await submitItems(c, [one(fence)]);
  const submissionId = r.data.submitted[0].id;
  await call('POST', `/api/hse/submissions/${submissionId}/response`, { reviewer: c.lead, body: { response: 'conditions', text: 'Show the lifting plan.\nFence the work area.' } });
  const mine = await call('GET', `/api/swms/${r.data.submitted[0].swmsId}`, { session: c.office });
  const review = mine.data.reviews[0];
  assert.equal(review.sitelink, true);
  assert.deepEqual(review.conditions.map((one) => [one.text, one.status]), [['Show the lifting plan.', 'To do'], ['Fence the work area.', 'To do']]);
  const account = fs.readFileSync(path.join(__dirname, '..', 'public', 'account.js'), 'utf8');
  assert.match(account, /mark it done under From main contractors\. \$\{latest\.company\} confirms each one\. If you change the SWMS, submit it again from there\./);
  // 8. "submitted" counts only what the company submitted, not a file the lead recorded.
  const lists = (await call('GET', '/api/from-builders', { session: c.office })).data.lists;
  assert.equal(lists[0].progress.submitted, 1);
});

test('a list whose builder left SiteLink says it was withdrawn, not to contact its lead', async () => {
  const c = await claimed('r8gone');
  await send.removeForSubcontract(c.subId);
  await db.query('DELETE FROM subcontracts WHERE id = $1', [c.subId]);
  const r = await call('GET', `/api/from-builders/${c.subId}`, { session: c.office });
  assert.equal(r.status, 410);
  assert.equal(r.data.message, 'Corbel Build Pty Ltd has withdrawn this list, and no longer uses SiteLink. Your own copies in My SWMS stay.');
});

// ---- Smaller faults ----

test('a file uploaded on the list page is not counted in until the lead records it, and "Record it" opens that SWMS', async () => {
  const b = await builder('r8upload');
  const item = (await call('GET', `/api/list/${b.token}`)).data.swms[0];
  const file = Buffer.from(await draftToDocx(prepareDraft(draftBody(ready({ ...ANSWERED, state: 'qld', task: ITEMS[0][1], fallRisk: 'no', residential: 'no' }))), {}));
  const up = await call('POST', `/api/list/${b.token}/items/${item.id}/upload`, { raw: file, headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': 'Fence SWMS.docx' } });
  assert.equal(up.status, 201, JSON.stringify(up.data));
  const s7 = (await call('GET', `/api/hse/projects/${b.projectId}`, { reviewer: b.lead })).data.subcontracts[0].stage7;
  assert.equal(s7.in, 0);
  assert.equal(s7.uploaded, 1);
  const lead = fs.readFileSync(path.join(__dirname, '..', 'public', 'hse.js'), 'utf8');
  assert.match(lead, /href="#\/sub\/\$\{esc\(sub\.id\)\}\/item\/\$\{esc\(row\.id\)\}" aria-label="\$\{esc\(`Record the file uploaded for \$\{row\.title\} from \$\{sub\.name\}`\)\}">Record it<\/a>/);
  // "Record a SWMS received outside SiteWrite" shows only once the list has gone.
  assert.match(lead, /if \(!sub\.received \|\| !sub\.received\.outsideOn \|\| !\(sub\.sending && sub\.sending\.sent\)\) return html;/);
});
