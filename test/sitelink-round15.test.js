// SiteLink fixes from messy round 15 (19 October 2026, staging df5c614). Made-up companies, people and
// sites only. No paid AI reading: the stand-in client answers with a made-up electrical reading.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.RATE_LIMIT_HSE_REQUESTS = '5000';
process.env.RATE_LIMIT_AI_SCOPE_REQUESTS = '1000';
process.env.RATE_LIMIT_MAX_REQUESTS = '5000';
process.env.RATE_LIMIT_LIST_REQUESTS = '5000';
process.env.RATE_LIMIT_LIST_SENDS = '1000';
process.env.RATE_LIMIT_WORD_REQUESTS = '30000';
const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { app } = require('../server');
const db = require('../db');
const send = require('../sitelink-send');
const handover = require('../handover');
const answers = require('../sitelink-answers');
const aiScope = require('../ai-scope');
const abnRegister = require('../abn');
const { validAbn } = require('../accounts');
const { prepareDraft, statusOf } = require('../draft');
const { draftBody } = require('../input');
const { downloadGaps } = require('../download-gate');
const { withEmergencyAnswers } = require('../emergency');
const { setupAccounts, mailbox, lastLinkToken, ANSWERED, ready, checked } = require('./helpers');

abnRegister.lookupAbn = async () => ({ enabled: false });
let abnSeed = 61829374000;
function nextAbn() {
  for (abnSeed += 83; ; abnSeed += 1) if (validAbn(String(abnSeed))) return String(abnSeed);
}

// A made-up electrical reading: a main SWMS, a temporary services SWMS, and a point whose work is typed in
// lower case.
const row = (activity, pack, clause, quote, unknowns = '', extra = {}) => ({ activity, type: 'Site work', package: pack, crew: 'Electricians', clause, quotes: [quote], where: '', plant: '', conditions: '', unknowns, matrixColumn: '', ...extra });
const READING = {
  activities: [
    row('Install cable tray and run LV submains in the ceiling', 'Electrical', '1.10', 'Install cable tray and run LV submains in the ceiling spaces.'),
    row('remove existing submains', 'Electrical', '1.30 (a)', 'Remove existing submains to the pump room.', 'Who replaces the pumps is not stated.'),
    row('Install temporary lighting and power boards', 'Temporary services', '2.1', 'Install temporary lighting and power boards in the buildings.'),
  ],
  byOthers: [],
  conflicts: [],
};
const GROUPS = { Electrical: ['cablePull', 'containment'], 'Temporary services': ['tempPower'] };
const SCOPE = ['Subcontract scope of works: Electrical services', ...READING.activities.map((one, i) => `1.${i + 1} ${one.quotes[0]}`),
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

async function call(method, route, { body, reviewer, session } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(reviewer ? { 'X-Reviewer-Token': reviewer } : {}), ...(session ? { Authorization: `Bearer ${session}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = response.headers.get('content-type') || '';
  return { status: response.status, headers: response.headers, data: type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
}
function inDays(days) {
  const day = new Date(`${send.todayIn('qld')}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}
async function leadSignIn(email) {
  assert.equal((await call('POST', '/api/hse/email', { body: { email } })).status, 200);
  const text = [...mailbox].reverse().find((item) => item.to === email).text;
  const token = /\/sitelink\?login=([A-Za-z0-9_-]+)/.exec(text)[1];
  const { data } = await call('POST', '/api/hse/verify', { body: { token } });
  assert.equal((await call('PUT', '/api/hse/me', { reviewer: data.token, body: { name: 'Imogen Varga', position: 'HSE lead', phone: '0412 555 019' } })).status, 200);
  return data.token;
}
const WORKPLACE = '41 Boundary St, South Brisbane QLD 4101';
const DETAILS = {
  musterPoint: 'Grassed area by gate 2 off Boundary St',
  firstAider: 'Kaz Brennan, site office, 0433 218 640',
  firstAidLocation: 'Site office, ground floor',
  hospital: 'Northside General Hospital, Emergency Department',
  siteManager: 'Dave Okafor, 0418 552 907',
  siteRules: ['Sign in at the site office before starting.'],
};

// A builder's project with a subcontract whose scope is read by the stand-in.
async function readScope(prefix) {
  const lead = await leadSignIn(`lead@${prefix}.example`);
  const org = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Bilby Range Constructions Pty Ltd', abn: nextAbn() } });
  await db.query("UPDATE orgs SET abn_check = 'verified', abn_verified_at = $1 WHERE id = $2", [new Date(), org.data.org.id]);
  const project = await call('POST', `/api/hse/orgs/${org.data.org.id}/projects`, { reviewer: lead, body: { name: 'Boundary Street Annexe', workplace: WORKPLACE, state: 'qld' } });
  const projectId = project.data.project.id;
  assert.equal((await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 0, details: DETAILS } })).status, 200);
  const email = `office@${prefix}-sub.example`;
  const added = await call('POST', `/api/hse/projects/${projectId}/subcontracts`, { reviewer: lead, body: { name: 'Echidna Spark Electrical Pty Ltd', trade: 'electrical n comms', email } });
  assert.equal(added.status, 201, JSON.stringify(added.data));
  const subId = added.data.subcontract.id;
  const sent = await call('POST', `/api/hse/subcontracts/${subId}/scope`, { reviewer: lead, body: { file: { name: 'Electrical scope.txt', data: Buffer.from(SCOPE).toString('base64') } } });
  assert.ok([200, 202].includes(sent.status), JSON.stringify(sent.data));
  for (let i = 0; i < 300; i += 1) {
    const page = await call('GET', `/api/hse/subcontracts/${subId}`, { reviewer: lead });
    if (page.data.reading.status !== 'reading') return { lead, projectId, subId, page: page.data, email, trade: added.data.subcontract.trade };
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
  throw new Error('the reading did not finish');
}
async function subbie(email, name) {
  assert.equal((await call('POST', '/api/auth/email', { body: { email } })).status, 200);
  const { data } = await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } });
  assert.equal((await call('PUT', '/api/company', { session: data.token, body: { name, abn: nextAbn(), address: '4 Echidna Lane, Darra QLD 4076', phone: '07 3555 0100', email } })).status, 200);
  return data.token;
}
// The list sent and taken up by the subcontractor.
async function claimed(prefix) {
  const s = await readScope(prefix);
  const due = inDays(14);
  const preview = await call('POST', `/api/hse/subcontracts/${s.subId}/send/preview`, { reviewer: s.lead, body: { due } });
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  assert.equal((await call('POST', `/api/hse/subcontracts/${s.subId}/send`, { reviewer: s.lead, body: { due, check: preview.data.preview.check } })).status, 200);
  const token = /\/list\.html\?t=([A-Za-z0-9_-]+)/.exec(mailbox.filter((item) => item.to === s.email).pop().text)[1];
  const office = await subbie(`admin@${prefix}-sub.example`, 'Echidna Spark Electrical Pty Ltd');
  assert.equal((await call('POST', `/api/list/${token}/claim`, { session: office })).status, 200);
  const { list } = (await call('GET', `/api/from-builders/${s.subId}`, { session: office })).data;
  return { ...s, office, list };
}
// A SWMS for a list item as the pages send it: the builder's details filled in, prepared, SiteWrite's check
// passed and each part ticked by the foreman.
// The list's work is not what these tests are about: each SWMS is given a task SiteWrite covers in full.
const TASK = 'Install power outlets and light switches in the offices.';
function swmsFor(item, extra = {}) {
  const input = ready({ ...ANSWERED, state: 'qld', task: TASK, fallRisk: 'no', residential: 'no', workplace: WORKPLACE, principalContractor: 'Bilby Range Constructions Pty Ltd', ...DETAILS, ...extra });
  return { ...checked(input, null, { name: 'Lachie Brennock', role: 'Foreman' }), swmsTitle: item.title };
}
const footerRef = async (buffer) => {
  const zip = await JSZip.loadAsync(buffer);
  const text = (await Promise.all(Object.keys(zip.files).filter((name) => /footer/.test(name)).map((name) => zip.file(name).async('string')))).join(' ').replace(/<[^>]+>/g, '');
  return (text.match(/SW-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}/) || [])[0];
};

// ---- Blocker 1: the submitted record is the revision downloaded ----

test('Submit with no change sends the revision downloaded: an emergency answer the SWMS does not ask is no change (blocker 1)', async () => {
  const c = await claimed('r15sub');
  const item = c.list.items.find((one) => /Electrical/.test(one.title));
  assert.ok(item, JSON.stringify(c.list.items.map((one) => one.title)));
  const swms = swmsFor(item);
  // The SWMS's own page downloaded it with a trench rescue answer filled across from another SWMS of the
  // project, which this SWMS does not ask and does not print.
  const asked = (withEmergencyAnswers(prepareDraft(draftBody(swms)), swms.emergency).emergencyQuestions || []).map((one) => one.id);
  assert.ok(!asked.includes('trenchRescue'), JSON.stringify(asked));
  const word = await call('POST', '/api/draft.docx', { session: c.office, body: { ...swms, emergency: { ...(swms.emergency || {}), trenchRescue: 'Lifted out with the harness and line from the top by the leading hand.' } } });
  assert.equal(word.status, 200, String(word.data).slice(0, 300));
  const swmsId = word.headers.get('x-sitewrite-swms');
  assert.equal(word.headers.get('x-sitewrite-revision'), '1');
  const ref = await footerRef(word.data);
  // The project page submits the answers it keeps, without that answer.
  const done = await call('POST', `/api/from-builders/${c.subId}/submit`, { session: c.office, body: { items: [{ requiredId: item.requiredId, swms: { ...swms, swmsId } }] } });
  assert.equal(done.status, 201, JSON.stringify(done.data));
  assert.equal(done.data.submitted[0].revision, 1, 'revision 1, as downloaded');
  assert.equal(done.data.submitted[0].ref, ref, 'under the reference printed on the download');
  const mine = (await call('GET', '/api/swms', { session: c.office })).data.swms;
  assert.deepEqual(mine.map((one) => `${one.title} r${one.revision}`), [`${item.title} r1`]);
  // A real change is still a new revision.
  const changed = await call('POST', `/api/from-builders/${c.subId}/submit`, { session: c.office, body: { items: [{ requiredId: item.requiredId, swms: { ...swmsFor(item, { task: `${TASK} Label the new circuits at each board.` }), swmsId } }] } });
  assert.equal(changed.data.submitted[0].revision, 2);
});

test('a save whose answer was lost, sent again with more work from the same page, is kept; another device is still refused (blocker 1)', async () => {
  const c = await claimed('r15lost');
  const work = (note) => ({ items: c.list.items.map((one) => ({ requiredId: one.requiredId, title: one.title, task: one.task, note })), current: 0, stage: 'questions' });
  const put = (body) => call('PUT', `/api/from-builders/${c.subId}/progress`, { session: c.office, body });
  const first = await put({ baseVersion: 0, project: work('first'), page: {}, pageId: 'phonepage1' });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  // The phone did not get that answer (a 502), so it still starts from version 0, with the foreman's control added since.
  const again = await put({ baseVersion: 0, project: work('first, then his own control'), page: {}, pageId: 'phonepage1' });
  assert.equal(again.status, 200, JSON.stringify(again.data));
  assert.equal(again.data.version, first.data.version + 1);
  // Another device that started from version 0 is still told the work was saved elsewhere.
  const other = await put({ baseVersion: 0, project: work('desktop'), page: {}, pageId: 'desktoppage' });
  assert.equal(other.status, 409);
  assert.equal(other.data.progress.project.items[0].note, 'first, then his own control');
  // So is a page with no id, as before.
  assert.equal((await put({ baseVersion: 0, project: work('old page'), page: {} })).status, 409);
});

// ---- Weak answers on the builder's side (blocker 4) ----

test('the builder\'s weak answers: "na" is no answer to a point, and a role is no site manager (blocker 4)', async () => {
  const s = await readScope('r15weak');
  const point = s.page.points.find((one) => /pumps/.test(one.question));
  assert.ok(point, JSON.stringify(s.page.points));
  for (const answer of ['na', 'N/A', 'n.a.']) {
    const said = await call('PUT', `/api/hse/subcontracts/${s.subId}/points/${point.id}`, { reviewer: s.lead, body: { answer } });
    assert.equal(said.status, 400, answer);
    assert.match(said.data.message, /does not answer the point\. Write the answer, or leave it empty/);
  }
  assert.equal((await call('PUT', `/api/hse/subcontracts/${s.subId}/points/${point.id}`, { reviewer: s.lead, body: { answer: 'tbc' } })).status, 400);
  assert.equal((await call('PUT', `/api/hse/subcontracts/${s.subId}/points/${point.id}`, { reviewer: s.lead, body: { answer: 'The builder\'s plumber replaces the pumps.' } })).status, 200);
  // The point's work reads with its capital (wording 3); it is matched to its SWMS as read.
  const page = (await call('GET', `/api/hse/subcontracts/${s.subId}`, { reviewer: s.lead })).data;
  const shown = page.points.find((one) => one.id === point.id);
  assert.equal(shown.activity, 'Remove existing submains');
  assert.ok(shown.swms, 'still with its SWMS');
  // A role with no name is refused as the site manager, as it is as the first aider.
  const details = await call('PUT', `/api/hse/projects/${s.projectId}/site-details`, { reviewer: s.lead, body: { baseRev: 1, details: { ...DETAILS, siteManager: 'first aid officer' } } });
  assert.equal(details.status, 400);
  assert.match(details.data.message, /"first aid officer" is a role, not a person/);
  assert.equal(answers.personProblem('Dave Okafor, 0418 552 907'), '');
});

// ---- "Not needed for this work" settles its question (stuck point 1) ----

test('"Not needed for this work" ticked on a design settles its question with no words typed (stuck point 1)', () => {
  const task = 'Install conduits and cast-in boxes in the suspended slab formwork before each pour. Install cable tray and run cables in the ceiling.';
  const base = ready({ ...ANSWERED, state: 'qld', task, fallRisk: 'no', company: 'Co', facts: { systemInstructions: 'The cable tray system is installed to the supplier instructions.' } });
  const without = prepareDraft(draftBody({ ...base, facts: { ...base.facts, formworkDesign: '', loadLimits: '' } }));
  assert.equal(without.kind, 'stand-down');
  assert.deepEqual(without.missing, ['Formwork design', 'Load limits']);
  const designs = [{ id: 'formwork', what: 'Formwork design', status: 'notNeeded' }, { id: 'loadDrawing', what: 'Structural engineer\'s drawing for the load limits', status: 'notNeeded' }];
  const out = prepareDraft(draftBody({ ...base, facts: { ...base.facts, formworkDesign: '', loadLimits: '' }, designs }));
  assert.equal(out.kind, 'draft', JSON.stringify(out.missing));
  const refs = Object.fromEntries((out.references || []).map((one) => [one.label, one.text]));
  assert.equal(refs['Formwork design'], 'Not needed for this work: the formwork design.');
  assert.equal(refs['Load limits'], 'Not needed for this work: the structural engineer\'s drawing for the load limits.');
  // Words of its own are kept as typed.
  const typed = prepareDraft(draftBody({ ...base, facts: { ...base.facts, formworkDesign: 'Not our work. The builder\'s formwork contractor designs and loads the formwork.', loadLimits: '' }, designs }));
  assert.equal(Object.fromEntries(typed.references.map((one) => [one.label, one.text]))['Formwork design'], 'Not our work. The builder\'s formwork contractor designs and loads the formwork.');
});

// ---- Titles, notes and points (wordings 1 to 4) ----

test('titles: the lead\'s short names keep their capitals; no "whole project" or "and other work"; "Controls" is control systems (wordings 1 and 2)', async () => {
  const s = await readScope('r15title');
  const item = s.page.items.find((one) => !one.removedAt && /Electrical/.test(one.title));
  const renamed = await call('PUT', `/api/hse/subcontracts/${s.subId}/items/${item.id}`, { reviewer: s.lead, body: { title: 'hv and lv cabling, terminations and earthing' } });
  assert.equal(renamed.status, 200, JSON.stringify(renamed.data));
  assert.ok(renamed.data.items.some((one) => one.title === 'HV and LV cabling, terminations and earthing'), JSON.stringify(renamed.data.items.map((one) => one.title)));
  assert.equal(s.trade, 'Electrical and comms', 'a lone "n" in the trade reads "and" (wording 6)');
  assert.equal(answers.tidyTitle('install ewps and cctv'), 'Install EWPs and CCTV');
  assert.equal(answers.tidyTitle('Hv cabling'), 'HV cabling');
  assert.equal(answers.tidyTitle('Ups and downs'), 'Ups and downs');
  // SiteWrite's own titles from a reading.
  const rows = [
    { package: 'Electrical', activity: 'Install main switchboards', crew: 'Electricians', type: 'Work', clause: '1' },
    { package: 'Electrical', activity: 'Install submains', crew: 'Electricians', type: 'Work', clause: '2' },
    { package: 'Trade installation: whole project', activity: 'Install HV cabling and cable joints', crew: 'Electricians', type: 'Work', clause: '3' },
    { package: 'Trade installation: whole project', activity: 'Terminate and test all cables', crew: 'Electricians', type: 'Work', clause: '4' },
    { package: 'Trade installation: whole project', activity: 'Install earthing', crew: 'Electricians', type: 'Work', clause: '5' },
    { package: 'Controls', activity: 'Install generator control panel and modify existing master control system and its interfaces', crew: 'Electricians', type: 'Work', clause: '6' },
    { package: 'Controls', activity: 'Install BMS interfaces', crew: 'Electricians', type: 'Work', clause: '7' },
  ];
  const titles = handover.packageTitles({ activities: rows, packages: [{ package: 'Electrical', groups: ['cablePull'] }, { package: 'Trade installation: whole project', groups: ['cablePull'] }, { package: 'Controls', groups: ['controlPanelInstall'] }] });
  assert.equal(titles['Trade installation: whole project'], 'Install HV cabling and cable joints');
  assert.equal(titles.Controls, 'Control systems');
  assert.ok(!Object.values(titles).some((title) => /whole project|and other work/.test(title)), JSON.stringify(titles));
  // Lights, outlets and final connections across the project are the trade's fit-out.
  const fit = [
    rows[0], rows[1],
    { package: 'Trade installation: whole project', activity: 'Apply non-pick caulking and bedding to installed items', crew: 'Electricians', type: 'Work', clause: '8' },
    { package: 'Trade installation: whole project', activity: 'Install internal light fittings and supports', crew: 'Electricians', type: 'Work', clause: '9' },
    { package: 'Trade installation: whole project', activity: 'Install GPOs, switches, floor boxes, isolators and final connections', crew: 'Electricians', type: 'Work', clause: '10' },
  ];
  assert.equal(handover.packageTitles({ activities: fit, packages: [{ package: 'Electrical', groups: ['cablePull'] }, { package: 'Trade installation: whole project', groups: ['fitOff'] }] })['Trade installation: whole project'], 'Electrical fit-out');
});

test('notes with no subject are said with their work (wording 4)', () => {
  const notes = handover.draftNotes([
    { activity: 'Install temporary works', unknowns: 'Only applies if the builder grants an exemption.' },
    { activity: 'Operate temporary infrastructure', unknowns: 'Takes over temporary infrastructure previously completed by others.' },
    { activity: 'Engage the ICT subcontractor', unknowns: 'Access and their role are not defined.' },
    { activity: 'Install cable ladders', unknowns: 'Sequencing with builder trades.' },
    { activity: 'Install cable ladders', unknowns: 'The photo system needs builder approval.' },
  ]);
  assert.deepEqual(notes, [
    'Install temporary works: only applies if the builder grants an exemption.',
    'Operate temporary infrastructure: takes over temporary infrastructure previously completed by others.',
    'Engage the ICT subcontractor: access and their role are not defined.',
    'Install cable ladders: sequencing with builder trades to be confirmed.',
    'The photo system needs builder approval.',
  ]);
});

// ---- Free text printed as typed (wordings 5 and 6) ----

test('free text reads as it prints: conditions, notes, site rules, emergency answers and the worker\'s name (wordings 5 and 6)', async () => {
  assert.equal(answers.tidyLines('add a lift plan for the crane\nshow the ewp tickets b4 starting'), 'Add a lift plan for the crane\nShow the EWP tickets before starting');
  assert.equal(answers.tidyNote('showed callum the ewp ticket'), 'Showed callum the EWP ticket');
  // Site rules: a lone "n" and "b4".
  const s = await readScope('r15rules');
  const saved = await call('PUT', `/api/hse/projects/${s.projectId}/site-details`, { reviewer: s.lead, body: { baseRev: 1, details: { ...DETAILS, siteRules: ['Hi vis n steel caps', 'Sign in at the site office b4 starting'] } } });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.deepEqual(saved.data.siteDetails.details.siteRules, ['Hi vis and steel caps', 'Sign in at the site office before starting']);
  // Emergency answers start with a capital where they print.
  const input = ready({ ...ANSWERED, state: 'qld', task: 'Install high level cable tray from a scissor lift.', fallRisk: 'yes', company: 'Co', facts: { fallControl: 'Work above 2 m is done from a scissor lift with its guardrails closed.' } });
  const draft = prepareDraft(draftBody(input));
  const asked = (draft.emergencyQuestions || []).map((one) => one.id);
  assert.ok(asked.length, 'it asks emergency questions');
  const lower = Object.fromEntries(asked.map((id) => [id, 'spotter on the ground lowers the platform with the ground controls']));
  const printed = prepareDraft(draftBody({ ...input, emergency: lower })).emergency.map((one) => one.detail).join('\n');
  assert.match(printed, /: Spotter on the ground lowers the platform/);
  assert.doesNotMatch(printed, /: spotter on the ground/);
});

test('the worker\'s name and company on the sign-on sheet take their capitals (wording 5)', async () => {
  const c = await claimed('r15sign');
  const item = c.list.items[0];
  const done = await call('POST', `/api/from-builders/${c.subId}/submit`, { session: c.office, body: { items: [{ requiredId: item.requiredId, swms: swmsFor(item) }] } });
  assert.equal(done.status, 201, JSON.stringify(done.data));
  const [swms] = (await call('GET', '/api/swms', { session: c.office })).data.swms;
  const token = /t=([A-Za-z0-9_-]+)/.exec(swms.signonPath)[1];
  const signature = `data:image/png;base64,${Buffer.from('signature').toString('base64')}`;
  const signed = await call('POST', `/api/sign/${token}`, { body: { name: 'anh truong', company: 'echidna spark', signature, confirmed: true, explained: true, supervisor: 'lachie brennock' } });
  assert.equal(signed.status, 201, JSON.stringify(signed.data));
  assert.match(signed.data.message, /Anh Truong/);
  const rows = await db.query('SELECT worker_name, worker_company, explained_by FROM signons WHERE swms_id = $1', [swms.id]);
  assert.deepEqual(rows.map((one) => [one.worker_name, one.worker_company, one.explained_by]), [['Anh Truong', 'Echidna Spark', 'Lachie Brennock']]);
});

// ---- The SWMS's own approval line (wording 7) ----

test('the SWMS\'s own approval line says whose it is, and an old revision reads the same way (wording 7)', () => {
  const draft = prepareDraft(draftBody(ready({ ...ANSWERED, state: 'qld', task: 'Install cable tray in the ceiling.', fallRisk: 'no', company: 'Echidna Spark Electrical Pty Ltd' })));
  assert.equal(draft.status, 'Approval by Echidna Spark Electrical Pty Ltd: not signed yet.');
  assert.equal(statusOf({ status: 'Not approved. Not signed.', subcontractor: 'Echidna Spark Electrical Pty Ltd' }), 'Approval by Echidna Spark Electrical Pty Ltd: not signed yet.');
  assert.equal(statusOf({ status: 'Not approved. Not signed. A test, not a site record.' }), 'Approval by the business: not signed yet. A test, not a site record.');
});

// ---- Smaller faults ----

test('"na" for Ground is refused where a step digs, and accepted where none does (smaller fault)', () => {
  const dig = ready({ ...ANSWERED, state: 'qld', task: 'Excavate a trench and lay conduits for the street lights.', fallRisk: 'no', company: 'Co' });
  const withNa = { ...dig, site: { ...dig.site, ground: 'na' } };
  const gaps = downloadGaps(draftBody(withNa), prepareDraft(draftBody(withNa))).filter((gap) => gap.id === 'site.ground');
  assert.equal(gaps.length, 1);
  assert.match(gaps[0].need, /^The step "Excavate" digs into the ground\. Say what the ground is like where you dig/);
  const ceiling = ready({ ...ANSWERED, state: 'qld', task: 'Install cable tray in the ceiling.', fallRisk: 'no', company: 'Co' });
  const plain = { ...ceiling, site: { ...ceiling.site, ground: 'na' } };
  assert.equal(downloadGaps(draftBody(plain), prepareDraft(draftBody(plain))).filter((gap) => gap.id === 'site.ground').length, 0);
});

test('the team list shows a person invited who has not signed in yet (smaller fault)', async () => {
  const office = await subbie('admin@r15team.example', 'Echidna Team Electrical Pty Ltd');
  const sent = await call('POST', '/api/company/users', { session: office, body: { email: 'lachie@r15team.example' } });
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  const list = (await call('GET', '/api/company/users', { session: office })).data;
  assert.deepEqual(list.invited, ['lachie@r15team.example']);
  // Once signed in, the person is in the team and no longer listed as invited.
  await call('POST', '/api/auth/verify', { body: { token: lastLinkToken('lachie@r15team.example') } });
  const after = (await call('GET', '/api/company/users', { session: office })).data;
  assert.deepEqual(after.invited, []);
  assert.ok(after.users.some((one) => one.email === 'lachie@r15team.example'));
});
