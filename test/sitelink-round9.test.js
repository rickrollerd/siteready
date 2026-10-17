// SiteLink fixes from messy round 9 (17 October 2026, staging e1f8314). Made-up companies, people and
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
let abnSeed = 71829374000;
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


// ---- Blocker 1: "by law" from a site answer given once for every SWMS ----

const SHARED_SITE = { liveServices: 'live sewer at the boundary pit, gas main in the street', publicInterface: 'none', otherTrades: 'civil contractor and electricians nearby', ground: 'open trenches during drainage', access: 'through the front gate on hyland st' };
const hrcwOf = (body) => { const out = prepareDraft(draftBody(body)); return { list: out.highRisk || [], text: JSON.stringify(out.jobSteps || []) }; };

test('a site answer given once for every SWMS reaches the server, so it brings no high risk work of its own (blocker 1)', () => {
  const plumbing = { state: 'vic', task: 'Install sanitary plumbing stacks, soil and waste piping, and hot and cold water services inside the buildings, including risers.', fallRisk: 'yes', residential: 'no', crane: 'none', site: SHARED_SITE, facts: { fallControl: 'Risers and shafts are screened at each level.' } };
  // The browser's flag was dropped by the server's input cleaning: every path (draft, check, download,
  // submission) lost it.
  assert.equal(draftBody({ ...plumbing, siteShared: true }).siteShared, true);
  assert.equal(draftBody({ ...plumbing, siteShared: 'yes' }).siteShared, undefined);
  const own = hrcwOf(plumbing);
  assert.ok(own.list.some((label) => /trench or shaft/.test(label)), 'its own site answers count, as before');
  const shared = hrcwOf({ ...plumbing, siteShared: true });
  assert.ok(!shared.list.some((label) => /trench or shaft|pressurised gas/.test(label)), shared.list.join(' | '));
  assert.doesNotMatch(shared.text, /licensed gas fitter/);
  assert.ok(shared.list.some((label) => /falling more than 2 metres/.test(label)), 'its own work still counts');
  // The same for SiteWrite's own project page (tester A, run 4): "water main" brought drowning, and the
  // pool dig an excavation permit into the plant room inside building 3.
  const plant = { state: 'wa', task: 'Install pool filtration plant and chemical dosing equipment in the plant room.', fallRisk: 'no', residential: 'no', crane: 'none', site: { liveServices: 'Resort services in the ground near the pool: a 415 V cable and the water main.', ground: 'Sandy coastal soil. The pool dig goes to 2.1 m at the deep end, with open trenches for the pipework.' }, facts: { safetyDataSheet: 'Liquid pool chlorine; its SDS is kept in the plant room folder.' } };
  const plantOwn = hrcwOf(plant);
  assert.match(plantOwn.text, /excavation permit/);
  const plantShared = hrcwOf({ ...plant, siteShared: true });
  assert.deepEqual(plantShared.list, []);
  assert.doesNotMatch(plantShared.text, /excavation permit/);
  const civil = { state: 'wa', task: 'Excavate the pool, install cast-in and underground pipework, backfill and place imported fill.', fallRisk: 'no', residential: 'no', crane: 'none', site: plant.site };
  assert.ok(hrcwOf(civil).list.some((label) => /drowning/.test(label)));
  const civilShared = hrcwOf({ ...civil, siteShared: true }).list;
  assert.ok(!civilShared.some((label) => /drowning/.test(label)), civilShared.join(' | '));
  assert.ok(civilShared.some((label) => /trench/.test(label)), 'the dig is its own work');
  // The steps offered for the work do not come from a shared answer either.
  const asked = draft.questionsFor(draftBody({ ...plant, task: 'Install pool filtration plant.', siteShared: true, site: { ground: 'Open trenches for the pipework near the pool.' } }));
  assert.ok(!asked.steps.suggested.includes('trench'), JSON.stringify(asked.steps));
});

// ---- Blocker 2: "may need a SWMS by law" shown to the subcontractor as to the lead ----

test('"This work may need a SWMS by law" reaches the preview, the list page and the drafts (blocker 2)', () => {
  const depends = { package: 'Penetrations and core drilling', categories: [], dependsOn: [{ id: 'fall', short: 'Fall of more than 2 m', on: 'the working height' }, { id: 'plant', short: 'Moving powered mobile plant', on: 'whether plant moves where the work is done' }] };
  const summary = require('../public/scope-hrcw').hrcwSummary(depends);
  const lead = handover.riskOf(summary);
  const view = handover.subcontractorView({
    project: { name: 'Fyansford Wetlands Community Hub', workplace: '14 Hyland St, Fyansford VIC 3218', state: 'vic' },
    org: { name: 'Numbat Gully Constructions Pty Ltd' },
    subcontract: { name: 'Quoll Creek Plumbing Pty Ltd', trade: 'Hydraulic' },
    items: [{ id: 'a', title: 'Penetrations and core drilling', task: 'Form non-formed penetrations and core holes.', item: { highRisk: summary, activities: [] } }],
    points: [], siteDetails: null, fields: [],
  });
  const sent = view.swms[0].highRisk;
  assert.ok(sent, 'shown to the subcontractor');
  assert.equal(sent.heading, lead.heading);
  assert.equal(sent.heading, 'This work may need a SWMS by law');
  assert.equal(sent.line, lead.lines.join('. '));
  // "May not need" is still never said to the subcontractor.
  const none = handover.subcontractorView({ ...{ project: { name: 'P', workplace: 'W', state: 'vic' }, org: { name: 'O' }, subcontract: { name: 'S' }, points: [], siteDetails: null, fields: [] }, items: [{ id: 'b', title: 'T', task: 'X.', item: { highRisk: require('../public/scope-hrcw').hrcwSummary({ package: 'T', categories: [], dependsOn: [] }), activities: [] } }] });
  assert.equal(none.swms[0].highRisk, null);
});

// ---- Blocker 4: a note settles only on its own subject ----

test('a scope note is settled only by an answer on its own subject, not by the same work or shared words (blocker 4)', () => {
  const said = [{ activity: 'Install stormwater drainage system', question: 'Who provides the sewer and stormwater connection points for the drainage system?', answer: 'The main contractor provides the sewer connection point at the boundary pit by week 6.' }];
  const item = { draftNotes: [
    { text: 'Install stormwater drainage system: the staging requirements are not defined.', clause: '', activity: 'Install stormwater drainage system' },
    { text: 'Install sewer / house drainage system: the sewer connection point is not located.', clause: '' },
  ] };
  const out = subbieRoutes.withSettled(item, said).draftNotes;
  assert.equal(out[0].settled, undefined, 'staging is not settled by the sewer answer');
  assert.equal(out[1].settled, said[0].answer, 'the sewer note is');
  // Round 8's notes still settle.
  const r8 = subbieRoutes.withSettled({ draftNotes: [{ text: 'CCTV and Duress are listed as exclusions.', clause: '2.3' }] }, [{ activity: 'a', question: 'Whether cable management for access control, CCTV and duress is in this scope?', answer: 'Yes, it is in this scope.' }]);
  assert.equal(r8.draftNotes[0].settled, 'Yes, it is in this scope.');
});

// ---- Blocker 5: a forwarded copy opened signed out ----

test('a list opened signed out is logged as opened by someone not signed in, and shows "Opened" only once who is known (blocker 5)', async () => {
  const b = await builder('r9anon', { subName: 'Dunnart Gas Services' });
  assert.equal((await call('GET', `/api/list/${b.token}`)).status, 200);
  assert.equal((await call('GET', `/api/list/${b.token}`)).status, 200);
  let page = (await call('GET', `/api/hse/subcontracts/${b.subId}`, { reviewer: b.lead })).data;
  assert.equal(page.sending.opened, '', 'not the subcontractor\'s open');
  assert.equal(page.sending.openedUnknown, true);
  const log = page.sending.log.map((entry) => entry.text);
  assert.equal(log.filter((text) => /was opened by someone not signed in to SiteWrite\. It shows as opened once Dunnart Gas Services opens it signed in, or takes up the list\.$/.test(text)).length, 1, log.join('\n'));
  assert.ok(!log.some((text) => /was opened\.$/.test(text)));
  const sub = await db.one('SELECT status, opened_at FROM subcontracts WHERE id = $1', [b.subId]);
  assert.equal(sub.status, 'sent');
  assert.equal(sub.opened_at, null);
  const project = (await call('GET', `/api/hse/projects/${b.projectId}`, { reviewer: b.lead })).data;
  const row = project.subcontracts.find((one) => one.id === b.subId);
  assert.equal(row.opened, false);
  assert.equal(row.openedUnknown, true);
  // Taken up by the company: the table says by whom.
  const office = await subbie(`admin@r9anon-sub.example`, 'Dunnart Gas Services', nextAbn());
  assert.equal((await call('POST', `/api/list/${b.token}/claim`, { session: office })).status, 200);
  page = (await call('GET', `/api/hse/subcontracts/${b.subId}`, { reviewer: b.lead })).data;
  assert.equal(page.sending.openedUnknown, false);
  assert.equal(page.sending.claimed.name, 'Dunnart Gas Services');
  const after = (await call('GET', `/api/hse/projects/${b.projectId}`, { reviewer: b.lead })).data.subcontracts.find((one) => one.id === b.subId);
  assert.equal(after.claimedName, 'Dunnart Gas Services');
  assert.equal(after.openedUnknown, false);
  const hse = fs.readFileSync(path.join(__dirname, '..', 'public', 'hse.js'), 'utf8');
  assert.match(hse, /sub\.openedUnknown \? '\. Link opened by someone not signed in'/);
});

test('a list opened signed in by the subcontractor is its open, as before', async () => {
  const b = await builder('r9mine', { subName: 'Bettong Flat Plumbing Pty Ltd' });
  const office = await subbie('admin@r9mine-sub.example', 'Bettong Flat Plumbing Pty Ltd', nextAbn());
  assert.equal((await call('GET', `/api/list/${b.token}`, { session: office })).status, 200);
  const page = (await call('GET', `/api/hse/subcontracts/${b.subId}`, { reviewer: b.lead })).data;
  assert.notEqual(page.sending.opened, '');
  assert.ok(page.sending.log.some((entry) => /was opened\.$/.test(entry.text)));
});

// ---- Blocker 6: "In-ground civil" and SiteWrite's own package titles ----

test('"In-ground civil" gets a title from its work, and SiteWrite\'s own scope reading titles its packages too (blocker 6)', () => {
  const r = (activity, pack, crew) => ({ activity, type: 'Site work', package: pack, crew, clause: '1', quotes: [activity], where: '', plant: '', conditions: '', unknowns: '', matrixColumn: '' });
  const hydraulic = {
    activities: [
      r('Install stormwater drainage system including pits', 'In-ground civil', 'Plumber / drainer'),
      r('Install sewer / house drainage system', 'In-ground civil', 'Plumber / drainer'),
      r('Install grease interceptor trap', 'In-ground civil', 'Plumber / drainer'),
      r('Roadsawing', 'In-ground civil', 'Concrete cutter'),
      r('Trench excavation and backfilling with compaction', 'In-ground civil', 'Plumber / drainer; excavator operator'),
      r('Install gas services (excluding storage tank)', 'Trade installation: gas services', 'Gas fitter'),
    ],
    byOthers: [], conflicts: [],
    highRisk: [{ package: 'In-ground civil', categories: [{ id: 'trench', short: 'Trench or shaft deeper than 1.5 m', likely: false }], dependsOn: [] }, { package: 'Trade installation: gas services', categories: [{ id: 'gas', short: 'Pressurised gas mains or piping', likely: false }], dependsOn: [] }],
  };
  const titles = handover.listItems(hydraulic).filter((item) => !item.removedWhy).map((item) => item.title);
  assert.ok(titles.includes('In-ground sanitary and stormwater drainage'), titles.join(' | '));
  const electrical = { activities: [r('Excavate trenches, backfill and reinstate surfaces', 'In-ground civil', 'Electricians with excavation crew'), r('Lay underground conduits, pits and cabling', 'In-ground civil', 'Electricians')], byOthers: [], conflicts: [], highRisk: [] };
  assert.equal(handover.packageTitles(electrical)['In-ground civil'], 'In-ground electrical services');
  const civil = { activities: [r('Excavate site', 'In-ground civil', 'Civil crew'), r('Grade and compact subgrade', 'In-ground civil', 'Civil crew'), r('Backfill and compact', 'In-ground civil', 'Civil crew'), r('Install concrete slabs and kerbs', 'Trade installation: concrete works', 'Concreters'), r('Install the pool shell', 'Trade installation: swimming pool', 'Pool builders')], byOthers: [], conflicts: [], highRisk: [] };
  const named = handover.packageTitles(civil);
  assert.equal(named['In-ground civil'], 'Excavation and earthworks');
  assert.equal(named['Trade installation: concrete works'], 'Concrete works');
  assert.equal(named['Trade installation: swimming pool'], 'Swimming pool');
  // SiteWrite's project takes the titles, and keeps the package for the choice.
  const items = require('../public/scope-choice').projectItems({ ...civil, titles: named }, ['Trade installation: concrete works']);
  assert.equal(items[0].title, 'Concrete works');
  assert.equal(items[0].package, 'Trade installation: concrete works');
  // SiteLink's list titles only its own list, as sl8 decided (a reading that carries titles).
  assert.ok(handover.listItems({ ...hydraulic, titles: { 'Trade installation: gas services': 'Wrong' } }).every((item) => item.title !== 'Wrong'));
});

// ---- Wording 1 to 10 ----

test('wording: brackets that leave work out, one word alone, exclusion clauses, bare notes and "needs" (wordings 1, 2, 4, 8)', () => {
  // 1. "Install gas services: excluding storage tank."
  assert.equal(scopeTask.plainTask([{ activity: 'Install gas services (excluding storage tank)' }]), 'Install gas services, excluding storage tank.');
  // 2. "Roadsaw." alone, and the scope's exclusions cited as where the work comes from.
  assert.equal(scopeTask.plainTask([{ activity: 'Roadsaw' }, { activity: 'Dewatering' }]), 'Saw cut existing roads and pavements. Dewatering work.');
  assert.deepEqual(handover.clauseList(['Specific Inclusions 8, Exclusions 3', 'Installation 4']), ['Specific Inclusions 8', 'Installation 4']);
  // 8. "Dewatering" says its work and what is open.
  assert.deepEqual(handover.draftNotes([{ activity: 'Trench excavation and backfilling with compaction', unknowns: 'Dewatering' }]), ['Trench excavation and backfilling with compaction: dewatering to be confirmed.']);
});

test('wording: after "Change the work", the reply names the work it no longer holds, and the clauses follow the new words (wording 3)', async () => {
  const { lead, subId, page } = await readScope('r9work');
  const main = page.items.find((item) => item.title === 'Ductwork and mechanical units');
  assert.deepEqual(main.clauses, ['Installation 1, 2'], 'each heading once (messy round 10, wording 2)');
  const next = (await call('PUT', `/api/hse/subcontracts/${subId}/items/${main.id}`, { reviewer: lead, body: { task: 'install the ductwork, dampers and grilles in the ceiling spaces on levels 1 to 4' } })).data;
  assert.match(next.message, / Access equipment is no longer part of it: it is under Removed\./);
  const changed = next.items.find((item) => item.id === main.id);
  assert.deepEqual(changed.clauses, ['Installation 1'], 'the condensers clause goes with the condensers');
  const sent = next.preview.swms.find((item) => item.title === main.title);
  assert.deepEqual(sent.clauses, ['Installation 1']);
  const names = handover.clausesOf({ task_changed: true, task: 'Install the solar hot water system on the roof.', item: { activities: [{ activity: 'Install downpipes to the stormwater system', clause: 'Specific Inclusions 9' }, { activity: 'Install solar hot water system', clause: 'Specific Inclusions 7' }] } });
  assert.deepEqual(names, ['Specific Inclusions 7']);
  const scopes = fs.readFileSync(path.join(__dirname, '..', 'sitelink-scopes.js'), 'utf8');
  assert.match(scopes, /replace\(\/\^trade installation:\\s\*\/i, ''\)/);
});

test('wording: notes between the two sides read as written, and the builder\'s own names get capitals (wordings 5, 6 and 9)', async () => {
  assert.equal(answers.tidyNote('emailed by dunnart office 17 oct', ['Dunnart Gas Services', 'Numbat Gully Constructions Pty Ltd']), 'Emailed by Dunnart office 17 Oct');
  assert.equal(answers.tidyNote('the permit number is not in step 2 of the SWMS. add it and submit again'), 'The permit number is not in step 2 of the SWMS. Add it and submit again');
  const c = await claimed('r9notes');
  const [fence] = c.list.items;
  const r = await submitItems(c, [one(fence)]);
  const submissionId = r.data.submitted[0].id;
  await call('POST', `/api/hse/submissions/${submissionId}/response`, { reviewer: c.lead, body: { response: 'conditions', text: 'Show the fence panel lifting plan.' } });
  const condition = (await db.one('SELECT id FROM review_conditions WHERE submission_id = $1', [submissionId])).id;
  assert.equal((await call('POST', `/api/from-builders/${c.subId}/conditions/${condition}/done`, { session: c.office, body: { note: 'plan on site from 3 nov' } })).status, 200);
  const back = await call('POST', `/api/hse/conditions/${condition}/back`, { reviewer: c.lead, body: { note: 'the plan is not signed. sign it and mark it again' } });
  assert.equal(back.status, 200, JSON.stringify(back.data));
  const row = await db.one('SELECT back_note FROM review_conditions WHERE id = $1', [condition]);
  assert.equal(row.back_note, 'The plan is not signed. Sign it and mark it again');
  assert.ok((await logOf(c)).some((text) => /Note: "Plan on site from 3 Nov"/.test(text)), (await logOf(c)).join('\n'));
  // 6. The builder's company and project typed in lower case.
  const lead = await leadSignIn('dana@r9case.example');
  const org = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'numbat gully constructions', abn: nextAbn() } });
  assert.equal(org.data.org.name, 'Numbat Gully Constructions');
  const project = await call('POST', `/api/hse/orgs/${org.data.org.id}/projects`, { reviewer: lead, body: { name: 'fyansford wetlands community hub', workplace: '14 Hyland St, Fyansford VIC 3218', state: 'vic' } });
  assert.equal(project.data.project.name, 'Fyansford Wetlands Community Hub');
  // Typed with capitals, a name stays as typed.
  const kept = await call('POST', `/api/hse/orgs/${org.data.org.id}/projects`, { reviewer: lead, body: { name: 'MEL-04 stage 2', workplace: '14 Hyland St, Fyansford VIC 3218', state: 'vic' } });
  assert.equal(kept.data.project.name, 'MEL-04 stage 2');
});

test('wording: Team shows a person\'s name, and a person with none can give it (wording 10); "your answer from before" only after a reload (wording 7)', async () => {
  const office = await subbie('tess@r9team.example', 'Quoll Creek Plumbing Pty Ltd', nextAbn());
  assert.equal((await call('PUT', '/api/me', { session: office, body: { name: 'tess arbuckle' } })).status, 200);
  const users = (await call('GET', '/api/company/users', { session: office })).data.users;
  assert.equal(users[0].name, 'Tess Arbuckle');
  const account = fs.readFileSync(path.join(__dirname, '..', 'public', 'account.js'), 'utf8');
  assert.match(account, /\$\{user\.name \? `\$\{esc\(user\.name\)\} <span class="meta">\$\{esc\(user\.email\)\}<\/span>` : esc\(user\.email\)\}/);
  assert.match(account, /Your name, as your team sees it/);
  const hse = fs.readFileSync(path.join(__dirname, '..', 'public', 'hse.js'), 'utf8');
  assert.match(hse, /typed && value !== point\.answer && !typedHere\.has\(point\.id\)/);
});

// ---- Smaller faults ----

test('smaller faults: an unnamed hospital, the red note that stayed, Back after adding, "Chase" before sending, the set-up form', () => {
  assert.match(answers.hospitalProblem('nearest hospital'), /does not name the hospital or medical centre/);
  assert.equal(answers.hospitalProblem('Hyland Creek Medical Centre'), '');
  assert.equal(answers.hospitalProblem('Geelong University Hospital, Emergency Department'), '');
  const hse = fs.readFileSync(path.join(__dirname, '..', 'public', 'hse.js'), 'utf8');
  // The red note under a box goes once the person types in it.
  assert.match(hse, /if \(!input \|\| !input\.id \|\| !input\.classList \|\| !input\.classList\.contains\('has-error'\)\) return;/);
  // After adding a subcontract (or a project) Back goes to the project, not the empty form.
  assert.match(hse, /is added\. Now upload its scope of works\.`, 'ok', \{ replace: true \}\);/);
  assert.match(hse, /else if \(replace && history\.replaceState\) \{ history\.replaceState\(null, '', hash\); route\(\); \}/);
  // Nothing to chase before the list has gone.
  assert.match(hse, /: !sub\.sentOn\s+\? `<a class="button light small" href="#\/sub\/\$\{esc\(sub\.id\)\}" aria-label="\$\{esc\(`Send the list to \$\{sub\.name\}`\)\}">Send the list<\/a>`/);
  // The set-up form goes as soon as the account is set up.
  assert.match(hse, /\$\('view-setup'\)\.classList\.add\('hidden'\);\n\s+await loadMe\(\);/);
});

test('smaller faults: My SWMS names the project of a SWMS from a builder\'s list, not "No site"', async () => {
  const c = await claimed('r9place');
  const [fence] = c.list.items;
  const r = await submitItems(c, [one(fence)]);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const { swms } = (await call('GET', '/api/swms', { session: c.office })).data;
  const mine = swms.find((item) => item.id === r.data.submitted[0].swmsId);
  assert.equal(mine.place, 'Northgate Health Hub');
  const account = fs.readFileSync(path.join(__dirname, '..', 'public', 'account.js'), 'utf8');
  assert.match(account, /siteName\(item\.siteId\) \|\| item\.place \|\| 'No site'/);
});

test('smaller faults: "Change my answer to Yes" is kept with the project SWMS, and its role with its checker (stuck point 3)', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(app, /fallNoKept = false;\n  \/\/ In a project, the new answer is kept with the SWMS at once \(scope\.js\)\.\n  if \(window\.SiteWrite && window\.SiteWrite\.projectFallChanged\) window\.SiteWrite\.projectFallChanged\('yes'\);/);
  const scope = fs.readFileSync(path.join(__dirname, '..', 'public', 'scope.js'), 'utf8');
  assert.match(scope, /S\.projectFallChanged = \(value\) => \{/);
  assert.match(scope, /if \(item\.body\) item\.body = \{ \.\.\.item\.body, fallRisk: value \};/);
  assert.match(scope, /S\.projectCheckWho = \(input\) => \{/);
  const account = fs.readFileSync(path.join(__dirname, '..', 'public', 'account.js'), 'utf8');
  assert.match(account, /seed: \(S\.projectCheck && S\.projectCheck\(input\)\) \|\| \(S\.projectCheckWho && S\.projectCheckWho\(input\)\) \|\| null,/);
});
