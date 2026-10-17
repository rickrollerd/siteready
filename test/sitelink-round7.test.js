// SiteLink fixes from messy round 7 (16 October 2026). Made-up companies, people and sites only.
// The staging test hooks are on here (TEST_HOOKS_SECRET), as on staging.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.RATE_LIMIT_HSE_REQUESTS = '5000';
process.env.RATE_LIMIT_AI_SCOPE_REQUESTS = '1000';
process.env.RATE_LIMIT_MAX_REQUESTS = '5000';
process.env.RATE_LIMIT_LIST_REQUESTS = '5000';
process.env.RATE_LIMIT_LIST_UPLOADS = '1000';
process.env.RATE_LIMIT_LIST_SENDS = '1000';
process.env.TEST_HOOKS_SECRET = 'r'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const db = require('../db');
const aiScope = require('../ai-scope');
const handover = require('../handover');
const answers = require('../sitelink-answers');
const listMail = require('../list-mail');
const send = require('../sitelink-send');
const builderSet = require('../public/builder-set');
const abnRegister = require('../abn');
const { validAbn } = require('../accounts');
const { setupAccounts, mailbox, lastLinkToken, ANSWERED, ready, checked } = require('./helpers');

abnRegister.lookupAbn = async () => ({ enabled: false });
let abnSeed = 33611902000;
function nextAbn() {
  for (abnSeed += 89; ; abnSeed += 1) if (validAbn(String(abnSeed))) return String(abnSeed);
}

// ---- A reading shaped like the round 7 mechanical scope: 17 SWMS on the list ----

const row = (activity, pack, clause, unknowns = '', extra = {}) => ({ activity, type: 'Site work', package: pack, crew: 'Mechanical fitters', clause, quotes: [`${activity}.`], where: '', plant: '', conditions: '', unknowns, matrixColumn: '', ...extra });
const MAIN = 'Plant delivery and lifting: whole project';
// Its title on the list: ": whole project" is not part of it (messy round 11, blocker 6).
const MAIN_TITLE = 'Plant delivery and lifting';
const ROUND7 = {
  activities: [
    row('Install cast-in sleeves, holding bolts and conduits in formwork before the pour', 'Trade installation: cast-in items', 'C-1.08'),
    row('Core drill penetrations 50 mm and under with concrete scanning and permits', 'Penetrations and core drilling', 'C-1.11'),
    row('Make roof penetrations and waterproof them', 'Roof works', 'C-1.10'),
    row('Install air handling units, pre-conditioners and fan coil units', MAIN, 'C-1.14', 'Unit weights; who supplies the AHUs'),
    row('Install ductwork, dampers, grilles and diffusers', MAIN, 'C-1.15', 'Shop drawings need builder approval before fabrication.'),
    row('Install chilled water pipework, valves and insulation', MAIN, 'C-1.16', 'The precast suppliers are yet to be determined.'),
    row('Install central chillers and cooling towers', MAIN, 'C-1.17', 'It is not stated who dismantles the mechanical plant marked for demolition (the builder removes items from site under C-1.109).'),
    row('Install access platforms and walkways to the chilled water plant', MAIN, 'C-1.18', 'The photo system needs builder approval.'),
    row('Erect and use fixed or mobile scaffold', 'Access equipment', 'C-1.97'),
    row('Provide two scissor lifts for any trade during completion testing', 'Access equipment', 'C-1.97', 'The document does not say who controls, inspects and checks operator competency when other trades use the lifts.'),
    row('Install steps and protective covers over mechanical items in services walkways', 'Trade installation: services walkways', 'C-1.76'),
    row('Install medical oxygen, dental suction and compressed air systems', 'Trade installation: medical gas systems', 'Specialised Plant (b)'),
    row('Install BMS controllers, panels, cabling and sensors', 'Controls', 'C-5.05', 'Working heights'),
    row('Install and later remove temporary DX fan coil units in the live SER', 'Work in an existing or live facility', '4.9.2'),
    row('Terminate submains at the mechanical services switchboards', 'Electrical', 'C-3.04', 'Whether submains are energised at the time of termination'),
    row('Install mechanical services switchboards', 'Electrical', 'C-3.05'),
    row('Install the gas purge fan, kitchen cooking hoods and domestic rangehoods', 'Ductwork and mechanical units: whole project', 'C-9.11'),
    row('Start up, test, commission and adjust all mechanical systems', 'Testing and commissioning', 'C-7.13'),
    row('Install and test motorised louvres', 'Trade installation: louvres', 'C-1.63'),
    row('Blank off unused sections of fixed louvres', 'Trade installation: louvres', 'C-1.65'),
    row('Excavate, bed and backfill trenches for in-ground mechanical services', 'In-ground civil', 'C-2.04'),
    row('Routine HVAC maintenance of the site accommodation, including filter changes and re-gassing', 'Maintenance', 'General (ah)'),
    row('Maintain plant and systems between commissioning and Practical Completion', 'Maintenance', 'Interim Measures (b)'),
    row('Carry out preventative and statutory maintenance during the Defects Liability Period', 'Maintenance', 'DLP (j)', 'Who gives access to the plant in the defects period'),
    row('Make final connections of mechanical services to the installed cell risers', 'Trade installation: cells', 'Appendix A'),
    row('Remove sections of existing duct and recover refrigerant from plant to be demolished', 'Demolition and removal', 'C-1.105'),
    row('Fit out the plant room', 'Trade installation: plant room', 'C-1.40'),
  ],
  byOthers: [],
  conflicts: [],
};
const fall = (likely = false) => ({ id: 'fall', short: 'Fall of more than 2 m', likely, ...(likely ? { dependsOn: 'the working height' } : {}) });
const cat = (id, short) => ({ id, short, likely: false });
const FLAGS = {
  'Trade installation: cast-in items': { categories: [], dependsOn: [{ id: 'fall', short: 'Fall of more than 2 m', on: 'the working height' }] },
  'Penetrations and core drilling': { categories: [cat('electrical', 'Energised electrical installations or services'), fall(true)], dependsOn: [] },
  'Roof works': { categories: [fall(true)], dependsOn: [] },
  [MAIN]: { categories: [cat('gas', 'Pressurised gas mains or piping'), fall(true)], dependsOn: [] },
  'Access equipment': { categories: [fall(), cat('plant', 'Moving powered mobile plant')], dependsOn: [] },
  'Trade installation: services walkways': { categories: [], dependsOn: [{ id: 'fall', short: 'Fall of more than 2 m', on: 'the working height' }] },
  'Trade installation: medical gas systems': { categories: [cat('gas', 'Pressurised gas mains or piping')], dependsOn: [] },
  Controls: { categories: [], dependsOn: [{ id: 'electrical', short: 'Energised electrical installations or services', on: 'whether any testing is done near energised parts' }] },
  'Work in an existing or live facility': { categories: [cat('chemicalLine', 'Chemical, fuel or refrigerant lines'), fall(true)], dependsOn: [] },
  Electrical: { categories: [cat('electrical', 'Energised electrical installations or services'), fall(true)], dependsOn: [] },
  'Ductwork and mechanical units: whole project': { categories: [fall(true)], dependsOn: [] },
  'Testing and commissioning': { categories: [cat('electrical', 'Energised electrical installations or services')], dependsOn: [] },
  'Trade installation: louvres': { categories: [], dependsOn: [{ id: 'fall', short: 'Fall of more than 2 m', on: 'the working height' }] },
  'In-ground civil': { categories: [cat('trench', 'Trench or shaft deeper than 1.5 m, or a tunnel')], dependsOn: [] },
  Maintenance: { categories: [cat('chemicalLine', 'Chemical, fuel or refrigerant lines')], dependsOn: [] },
  'Trade installation: cells': { categories: [fall(true)], dependsOn: [] },
  'Demolition and removal': { categories: [cat('chemicalLine', 'Chemical, fuel or refrigerant lines')], dependsOn: [] },
  'Trade installation: plant room': { categories: [], dependsOn: [] },
};
const GROUPS = {
  'Trade installation: cast-in items': ['castIn'], 'Penetrations and core drilling': ['coreDrill'], 'Roof works': ['roofPenetration'], [MAIN]: ['ductwork', 'mechPipework', 'plantLift'],
  'Access equipment': ['scaffold', 'ewp'], 'Trade installation: services walkways': ['fixtures'], 'Trade installation: medical gas systems': ['medicalGasBraze'], Controls: ['controlPanelInstall'],
  'Work in an existing or live facility': ['splitInstall'], Electrical: ['isolation', 'cablePull'], 'Ductwork and mechanical units: whole project': ['kitchenEquipment'], 'Testing and commissioning': ['mechCommissioning'],
  'Trade installation: louvres': ['windowInstall'], 'In-ground civil': ['trench'], Maintenance: ['refrigerantCharge', 'defectsVisit'], 'Trade installation: cells': [], 'Demolition and removal': ['servicesStrip'], 'Trade installation: plant room': [],
};
function round7Reading() {
  const reading = JSON.parse(JSON.stringify(ROUND7));
  reading.packages = Object.entries(GROUPS).map(([pack, groups]) => ({ package: pack, groups, unmatched: [], byOthers: [] }));
  reading.highRisk = Object.entries(FLAGS).map(([pack, flag]) => ({ package: pack, ...flag }));
  return reading;
}

// ---- 1. Too many SWMS from one scope ----

test('the round 7 scope: 17 SWMS on the list become 10, each naming a job, with defects-period maintenance off', () => {
  const list = handover.listItems(round7Reading());
  const why = Object.fromEntries(list.map((item) => [item.title, item.removedWhy ? `${item.removedWhy}${item.foldedInto ? `:${item.foldedInto}` : ''}` : 'list']));
  assert.deepEqual(why, {
    'Trade installation: cast-in items': `folded:${MAIN}`,
    'Penetrations and core drilling': 'list',
    'Roof works': 'list',
    [MAIN_TITLE]: 'list',
    'Access equipment': `folded:${MAIN}`,
    'Trade installation: services walkways': `folded:${MAIN}`,
    // Messy round 8: a bare or area title on the list gets a work title from the reading's own words.
    'Medical gas systems': 'list',
    Controls: 'folded:Electrical',
    'Work in an existing or live facility': 'list',
    'Electrical installation': 'list',
    'Ductwork and mechanical units': 'list',
    'Testing and commissioning': 'list',
    'Trade installation: louvres': `folded:${MAIN}`,
    // Messy round 9, blocker 6: "In-ground civil" is titled by its work.
    'In-ground mechanical services': 'list',
    Maintenance: 'folded:Testing and commissioning',
    'Trade installation: cells': `folded:${MAIN}`,
    'Demolition and removal': 'list',
    // Messy round 10, blocker 7: work set aside is titled by its work too.
    'Fit out the plant room': 'noLaw',
    'Maintenance in the defects period': 'defects',
  });
  assert.equal(list.filter((item) => !item.removedWhy).length, 10);
  // The defects-period row is split out of the maintenance done before handover, which stays in.
  const maintenance = list.find((item) => item.title === 'Maintenance');
  assert.doesNotMatch(maintenance.task, /Defects Liability/);
  assert.match(list.find((item) => item.title === handover.DEFECTS_PACKAGE).task, /Defects Liability Period/);
  // The point about the defects period goes with its SWMS, off the list.
  const points = handover.listPoints(round7Reading());
  const rows = list.map((item) => ({ ...item, item, removed_at: item.removedWhy ? new Date() : null, removed_why: item.removedWhy }));
  const access = points.find((point) => /defects period/.test(point.question));
  assert.equal(handover.pointInPlay(access, rows), false);
});

test('the main SWMS takes in the high risk work, step groups and words of the work folded into it', () => {
  const list = handover.listItems(round7Reading());
  const rows = list.map((item, i) => ({ id: `r${i}`, title: item.title, task: item.task, package: item.package, source: 'reading', item, removed_at: item.removedWhy ? new Date() : null, removed_why: item.removedWhy }));
  const main = rows.find((one) => one.title === MAIN_TITLE);
  const joined = handover.withFolded(main, rows);
  // Access equipment's certain fall and plant make the main SWMS's fall certain too.
  assert.equal(joined.highRisk.status, 'yes');
  assert.equal(joined.highRisk.heading, 'This work needs a SWMS by law');
  assert.equal(joined.highRisk.lines[0], 'It is high risk construction work (Pressurised gas mains or piping; Fall of more than 2 m; Moving powered mobile plant)');
  assert.equal(joined.highRisk.lines.length, 1, 'nothing left only likely');
  for (const kind of ['scaffold', 'ewp', 'fixtures', 'castIn', 'windowInstall']) assert.ok(joined.kinds.includes(kind), kind);
  assert.match(joined.extraTask, /scissor lifts/);
  assert.match(joined.extraTask, /cell risers/);
  // The preview names it, in the same words, and says what else it covers.
  const view = handover.subcontractorView({ project: { name: 'P', workplace: 'W', state: 'nsw' }, org: { name: 'O' }, subcontract: { name: 'S' }, items: rows, points: [], siteDetails: null, fields: [] });
  const sent = view.swms.find((one) => one.title === MAIN_TITLE);
  assert.equal(sent.highRisk.line, 'It is high risk construction work (Pressurised gas mains or piping; Fall of more than 2 m; Moving powered mobile plant)');
  assert.deepEqual(sent.alsoCovers.sort(), ['Access equipment', 'Trade installation: cast-in items', 'Trade installation: cells', 'Trade installation: louvres', 'Trade installation: services walkways']);
});

test('a package matched to no step group is drafted from its words, and one SiteWrite has no steps for is found', () => {
  assert.equal(handover.draftKinds([]), null);
  assert.deepEqual(handover.draftKinds(['ductwork']), ['ductwork']);
  assert.equal(handover.noJobSteps({ task: 'Install ductwork, dampers, grilles and diffusers.', kinds: ['ductwork'] }, 'nsw'), false);
  assert.equal(handover.noJobSteps({ task: 'Install chillers, pumps and pipework in the plant room.', kinds: [] }, 'nsw'), false);
  assert.equal(handover.noJobSteps({ task: 'Fit out the plant room.', kinds: [] }, 'nsw'), true);
  assert.equal(handover.noJobSteps({ task: 'unloading ute', kinds: null }, 'nsw'), true);
});

// ---- 8. "Needs a SWMS by law" only when certain ----

test('"needs a SWMS by law" only when certain; what may also apply says what it depends on', () => {
  const yes = handover.riskOf({ status: 'yes', heading: 'This work needs a SWMS by law', lines: ['It is high risk construction work (Energised electrical installations or services; Fall of more than 2 m, depending on the working height)'] });
  assert.deepEqual(yes, { status: 'yes', tag: 'High risk', heading: 'This work needs a SWMS by law', lines: ['It is high risk construction work (Energised electrical installations or services)', 'It may also be fall of more than 2 m, depending on the working height. The SWMS questions will confirm it'], siteLink: true });
  // Said again in SiteLink's words, it is the same (the preview, the list page and the drafts read it again).
  assert.deepEqual(handover.riskOf(yes), yes);
  assert.equal(handover.subcontractorView({ project: { name: 'P', workplace: 'W', state: 'nsw' }, org: { name: 'O' }, subcontract: { name: 'S' }, items: [{ title: 'T', task: 'W', item: { highRisk: yes } }], points: [], siteDetails: null, fields: [] }).swms[0].highRisk.line, 'It is high risk construction work (Energised electrical installations or services). It may also be fall of more than 2 m, depending on the working height. The SWMS questions will confirm it');
  const likely = handover.riskOf({ status: 'likely', heading: 'This work probably needs a SWMS by law', lines: ['It is likely to be high risk construction work (Fall of more than 2 m, depending on the working height)', 'The SWMS questions will confirm it'] });
  assert.equal(likely.heading, 'This work likely needs a SWMS by law');
  assert.equal(likely.lines.join('. '), 'It is likely to be high risk construction work (Fall of more than 2 m, depending on the working height). The SWMS questions will confirm it');
  // A reason that holds brackets of its own is read whole.
  const gas = handover.riskOf({ status: 'yes', heading: 'x', lines: ['It is high risk construction work (Chemical, fuel or refrigerant lines; Contaminated or flammable atmosphere, depending on the refrigerant used (A2L, A2 and A3 refrigerants are flammable))'] });
  assert.equal(gas.lines[1], 'It may also be contaminated or flammable atmosphere, depending on the refrigerant used (A2L, A2 and A3 refrigerants are flammable). The SWMS questions will confirm it');
  // Nothing in brackets ("may not need", off site) is kept as it was.
  const none = { status: 'none', heading: 'This work may not need a SWMS by law', lines: ['No high risk construction work was found in it'] };
  assert.deepEqual(handover.riskOf(none), none);
});

// ---- 2. Only questions about who does or supplies what are asked ----

test('points to confirm: statements go to the draft notes; only who does or supplies what is asked', () => {
  const asked = handover.listPoints(round7Reading()).map((point) => point.question);
  assert.deepEqual(asked, [
    'Who supplies the AHUs',
    'It is not stated who dismantles the mechanical plant marked for demolition (the builder removes items from site under C-1.109).',
    'The document does not say who controls, inspects and checks operator competency when other trades use the lifts.',
    'Who gives access to the plant in the defects period',
  ]);
  const notes = handover.listItems(round7Reading()).find((item) => item.title === MAIN_TITLE).draftNotes;
  assert.ok(notes.includes('Shop drawings need builder approval before fabrication.'));
  assert.ok(notes.includes('The photo system needs builder approval.'));
  assert.ok(notes.includes('The precast suppliers are yet to be determined.'));
  // A follow-on part goes with the question it follows; alone, it is left out.
  assert.deepEqual(handover.splitPoint('Who installs the shrouds; this depends on whether an exemption is granted for exposed pipework'), { asks: ['Who installs the shrouds. This depends on whether an exemption is granted for exposed pipework'], notes: [] });
  assert.deepEqual(handover.splitPoint('Whether welding is done on site; if it does, the On-site Steel Welding Procedure (General (i)) applies'), { asks: [], notes: ['Whether welding is done on site. If it does, the On-site Steel Welding Procedure (General (i)) applies'] });
  assert.deepEqual(handover.splitPoint('If it does, the welding procedure applies'), { asks: [], notes: [] });
});

// ---- 9. Site details: a first aider by name and phone; typed case tidied ----

test('the first aider is a person with a phone, never a role, and lower-case details are tidied without changing a word', () => {
  assert.match(answers.firstAiderProblem('the site supervisor'), /is a role, not a person\. Give the first aider's full name and phone/);
  assert.match(answers.firstAiderProblem('me'), /^"me" does not say who\. Give the first aider's full name and phone, for example "Jo Park, 0412 345 678"\.$/);
  assert.match(answers.firstAiderProblem('tom keane'), /has no phone number\. Give the first aider's phone too, for example "Tom Keane, 0412 345 678"\./);
  assert.equal(answers.firstAiderProblem('tom keane 0413 222 908'), '');
  assert.equal(answers.tidyPerson('tom keane 0413 222 908'), 'Tom Keane 0413 222 908');
  assert.equal(answers.tidyPlace('front gate'), 'Front gate');
  assert.equal(answers.tidyPlace('Assembly area A'), 'Assembly area A');
});

// ---- 12. Possessives ----

test('a name ending in s takes an apostrophe only', () => {
  assert.equal(builderSet.possessive('Ironbark Hill Builders'), 'Ironbark Hill Builders\'');
  assert.equal(builderSet.possessive('Corbel Build'), 'Corbel Build\'s');
});

// ---- The server ----

const standIn = {
  beta: {
    messages: {
      stream(params) {
        const mapping = Boolean(params.output_config.format.schema.properties.packages);
        const content = params.messages[0].content;
        const body = mapping
          ? { packages: [...content.matchAll(/^Work package: (.*)$/gm)].map((m) => ({ package: m[1], groups: GROUPS[m[1]] || [], unmatched: [], byOthers: [] })) }
          : ROUND7;
        return { finalMessage: async () => ({ stop_reason: 'end_turn', model: 'claude-opus-5-5', usage: { input_tokens: 1000, output_tokens: 500 }, content: [{ type: 'text', text: JSON.stringify(body) }] }) };
      },
    },
  },
};
const FILLER = 'The Subcontractor shall carry out the works in accordance with the drawings and specifications, keep the work area tidy, and coordinate its work with other trades on the site at all times.';
const SCOPE = ['Subcontract scope of works: Mechanical services', ...ROUND7.activities.map((one, i) => `${i + 1}.1 ${one.activity}.`), FILLER, FILLER, FILLER].join('\n');

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
  server.close();
  delete process.env.ANTHROPIC_API_KEY;
  aiScope.useClient(null);
});

async function call(method, route, { body, reviewer, session, headers, raw } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(reviewer ? { 'X-Reviewer-Token': reviewer } : {}), ...(session ? { Authorization: `Bearer ${session}` } : {}), ...headers },
    body: raw !== undefined ? raw : body ? JSON.stringify(body) : undefined,
  });
  const type = response.headers.get('content-type') || '';
  return { status: response.status, headers: response.headers, data: type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
}
const SECRET = { 'X-Test-Secret': 'r'.repeat(40) };
const inbox = async (email) => (await call('GET', `/api/test/inbox?to=${encodeURIComponent(email)}`, { headers: SECRET })).data.messages || [];

async function leadSignIn(email, name = 'Priya Nandakumar') {
  assert.equal((await call('POST', '/api/hse/email', { body: { email } })).status, 200);
  const text = email.endsWith('@siteready.test') ? (await inbox(email))[0].text : [...mailbox].reverse().find((item) => item.to === email).text;
  const token = /\/sitelink\?login=([A-Za-z0-9_-]+)/.exec(text)[1];
  const { data } = await call('POST', '/api/hse/verify', { body: { token } });
  if (name) assert.equal((await call('PUT', '/api/hse/me', { reviewer: data.token, body: { name, position: 'HSE manager', phone: '0412 555 012' } })).status, 200);
  return data.token;
}
async function setUp(prefix, { verified = true } = {}) {
  const lead = await leadSignIn(`priya@${prefix}.example`);
  const org = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Ironbark Hill Builders', abn: nextAbn() } });
  assert.equal(org.status, 201, JSON.stringify(org.data));
  if (verified) await db.query("UPDATE orgs SET abn_check = 'verified', abn_verified_at = $1 WHERE id = $2", [new Date(), org.data.org.id]);
  const project = await call('POST', `/api/hse/orgs/${org.data.org.id}/projects`, { reviewer: lead, body: { name: 'Pademelon Rd medical centre fitout', workplace: '48 Pademelon Road, Camperdown NSW 2050', state: 'nsw' } });
  const projectId = project.data.project.id;
  const details = await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 0, details: { musterPoint: 'Main gate on Pademelon Road', hospital: 'Camperdown General Hospital, Emergency Department' } } });
  assert.equal(details.status, 200, JSON.stringify(details.data));
  return { lead, orgId: org.data.org.id, projectId };
}
async function readScope(b, { name = 'Quoll Mechanical', email = `office@${Math.random().toString(36).slice(2, 8)}-quoll.example`, abn = '' } = {}) {
  const added = await call('POST', `/api/hse/projects/${b.projectId}/subcontracts`, { reviewer: b.lead, body: { name, trade: 'mechanical', email, abn } });
  assert.equal(added.status, 201, JSON.stringify(added.data));
  const subId = added.data.subcontract.id;
  const sent = await call('POST', `/api/hse/subcontracts/${subId}/scope`, { reviewer: b.lead, body: { file: { name: 'Quoll scope.txt', data: Buffer.from(SCOPE).toString('base64') } } });
  assert.ok([200, 202].includes(sent.status), JSON.stringify(sent.data));
  for (let i = 0; i < 600; i += 1) {
    const page = await call('GET', `/api/hse/subcontracts/${subId}`, { reviewer: b.lead });
    if (page.data.reading.status !== 'reading') return { subId, email, page: page.data };
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
  throw new Error('the reading did not finish');
}
async function sendList(b, subId, due) {
  const preview = await call('POST', `/api/hse/subcontracts/${subId}/send/preview`, { reviewer: b.lead, body: { due } });
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  const sent = await call('POST', `/api/hse/subcontracts/${subId}/send`, { reviewer: b.lead, body: { due, check: preview.data.preview.check } });
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  return sent.data;
}
function inDays(days) {
  const day = new Date(`${send.todayIn('nsw')}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}
async function subbie(email, name = '', abn = '') {
  assert.equal((await call('POST', '/api/auth/email', { body: { email } })).status, 200);
  const { data } = await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } });
  if (name) assert.equal((await call('PUT', '/api/company', { session: data.token, body: { name, abn } })).status, 200, `company for ${email}`);
  return data.token;
}
const linkOf = (email) => /\/list\.html\?t=([A-Za-z0-9_-]+)/.exec([...mailbox].reverse().find((item) => item.to === email).text)[1];
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');

test('on the lead\'s page: 10 SWMS, the log says SiteLink read the scope only once it has, and only who-questions are counted', async () => {
  const b = await setUp('r7list');
  const { subId, page } = await readScope(b);
  // The high risk work here is read from the words, so a few come out differently from the made-up flags
  // above; the packages that name no job are off the list either way.
  const onList = page.items.filter((item) => item.group === 'list').map((item) => item.title);
  assert.ok(onList.length <= 10, JSON.stringify(onList));
  for (const title of ['Access equipment', 'Controls', 'Maintenance', 'Maintenance in the defects period', 'Trade installation: cells', 'Trade installation: services walkways']) assert.ok(!onList.includes(title), title);
  assert.equal(page.subcontract.trade, 'Mechanical', 'typed case tidied');
  const main = page.items.find((item) => item.title === MAIN_TITLE);
  assert.equal(main.highRisk.heading, 'This work needs a SWMS by law');
  assert.doesNotMatch(main.highRisk.lines[0], /depending on/);
  // Every point shown asks who does or supplies what.
  assert.ok(page.points.length >= 3);
  for (const point of page.points) assert.ok(handover.asksWho(point.question), point.question);
  assert.ok(!page.points.some((point) => /builder approval|yet to be determined/.test(point.question)));
  const project = (await call('GET', `/api/hse/projects/${b.projectId}`, { reviewer: b.lead })).data;
  const live = page.points.filter((point) => point.inPlay !== false && !point.answer).length;
  assert.equal(project.subcontracts[0].pointsOpen, live);
  const log = project.log.map((entry) => entry.text);
  assert.ok(log.includes('Priya Nandakumar uploaded Quoll scope.txt as the scope for Quoll Mechanical. SiteLink is reading it.'), JSON.stringify(log));
  assert.ok(log.includes(`SiteLink read Quoll scope.txt, the scope for Quoll Mechanical, and listed ${onList.length} SWMS.`), JSON.stringify(log));
  // Sent: the points left unanswered are no longer counted as to answer.
  await sendList(b, subId, inDays(14));
  assert.equal((await call('GET', `/api/hse/projects/${b.projectId}`, { reviewer: b.lead })).data.subcontracts[0].pointsOpen, 0);
});

test('a SWMS with no job steps is marked, and the list cannot be sent until its work names the job', async () => {
  const b = await setUp('r7steps');
  const { subId, page } = await readScope(b);
  const room = page.items.find((item) => item.title === 'Fit out the plant room');
  assert.equal(room.group, 'aside');
  // Folded work with no steps of its own is drafted with its main SWMS: nothing on the list is empty yet.
  assert.ok(!page.items.some((item) => item.group === 'list' && item.noSteps));
  let next = (await call('PUT', `/api/hse/subcontracts/${subId}/items/${room.id}`, { reviewer: b.lead, body: { removed: false } })).data;
  assert.equal(next.items.find((item) => item.id === room.id).noSteps, true);
  const refused = await call('POST', `/api/hse/subcontracts/${subId}/send/preview`, { reviewer: b.lead, body: { due: inDays(14) } });
  assert.equal(refused.status, 400);
  assert.equal(refused.data.message, 'SiteWrite has no job steps yet for Fit out the plant room, so the subcontractor would get that SWMS with none. Change the work so it says what is done, or remove it. Each is marked on the list.');
  assert.deepEqual(refused.data.noSteps, ['Fit out the plant room']);
  // Reworded to name the job, in lower case: it gets a capital, its steps, and the list can go.
  next = (await call('PUT', `/api/hse/subcontracts/${subId}/items/${room.id}`, { reviewer: b.lead, body: { task: 'install chillers, pumps and pipework in the plant room.' } })).data;
  const reworded = next.items.find((item) => item.id === room.id);
  assert.equal(reworded.task, 'Install chillers, pumps and pipework in the plant room.');
  assert.equal(reworded.noSteps, false);
  assert.equal((await call('POST', `/api/hse/subcontracts/${subId}/send/preview`, { reviewer: b.lead, body: { due: inDays(14) } })).status, 200);
  // A SWMS the lead adds with no job steps is marked too.
  next = (await call('POST', `/api/hse/subcontracts/${subId}/items`, { reviewer: b.lead, body: { title: 'unloading ute', task: 'unloading ute' } })).data;
  const added = next.items.find((item) => item.source === 'added');
  assert.equal(added.title, 'Unloading ute');
  assert.equal(added.noSteps, true);
});

test('the lead renames a SWMS: a capital first letter, no price, no second SWMS of that title, logged and in the email', async () => {
  const b = await setUp('r7title');
  const { subId, email, page } = await readScope(b);
  const main = page.items.find((item) => item.title === MAIN_TITLE);
  const priced = await call('PUT', `/api/hse/subcontracts/${subId}/items/${main.id}`, { reviewer: b.lead, body: { title: 'Mechanical installation $45,000' } });
  assert.equal(priced.status, 400);
  assert.equal(priced.data.field, 'title');
  assert.equal((await call('PUT', `/api/hse/subcontracts/${subId}/items/${main.id}`, { reviewer: b.lead, body: { title: 'roof works' } })).data.field, 'title', 'another SWMS has that title');
  assert.equal((await call('PUT', `/api/hse/subcontracts/${subId}/items/${main.id}`, { reviewer: b.lead, body: { title: 'TBC' } })).status, 400);
  const renamed = await call('PUT', `/api/hse/subcontracts/${subId}/items/${main.id}`, { reviewer: b.lead, body: { title: 'mechanical installation: whole project' } });
  assert.equal(renamed.status, 200, JSON.stringify(renamed.data));
  assert.equal(renamed.data.message, 'The title is saved: Mechanical installation: whole project.');
  const item = renamed.data.items.find((one) => one.id === main.id);
  assert.equal(item.title, 'Mechanical installation: whole project');
  assert.equal(item.highRisk.status, 'yes', 'the reading\'s high risk work stays with a new title');
  assert.ok(renamed.data.preview.swms.some((one) => one.title === 'Mechanical installation: whole project'));
  const log = (await call('GET', `/api/hse/projects/${b.projectId}`, { reviewer: b.lead })).data.log.map((entry) => entry.text);
  assert.ok(log.includes(`Priya Nandakumar changed the title of ${MAIN_TITLE} to Mechanical installation: whole project on the SWMS list for Quoll Mechanical.`));
  await sendList(b, subId, inDays(14));
  assert.match([...mailbox].reverse().find((one) => one.to === email).text, /• Mechanical installation: whole project\n/);
  // Only someone in the account can rename it.
  const other = await setUp('r7title-other');
  assert.equal((await call('PUT', `/api/hse/subcontracts/${subId}/items/${main.id}`, { reviewer: other.lead, body: { title: 'Taken over' } })).status, 404);
});

test('after sending, the same list is refused with when the next reminder can go, not "Use Remind"', async () => {
  const b = await setUp('r7remind');
  const { subId } = await readScope(b);
  const due = inDays(14);
  const page = await sendList(b, subId, due);
  assert.equal(page.sending.remind.can, false);
  assert.match(page.sending.remind.why, /^The next reminder can go from .+\.$/);
  const again = await call('POST', `/api/hse/subcontracts/${subId}/send/preview`, { reviewer: b.lead, body: { due } });
  assert.match(again.data.message, /^The list has not changed since it was sent to .+ on .+\. The next reminder can go from .+\.$/);
  // A new due date can go.
  assert.equal((await call('POST', `/api/hse/subcontracts/${subId}/send/preview`, { reviewer: b.lead, body: { due: inDays(21) } })).status, 200);
});

test('a no-ABN list: a company whose name is not the subcontract\'s is asked first, and the lead sees the flag', async () => {
  const b = await setUp('r7claim');
  const { subId, email } = await readScope(b, { name: 'Bandicoot Ductwork' });
  await sendList(b, subId, inDays(14));
  const token = linkOf(email);
  const wrong = await subbie('admin@wombat-sheet.example', 'Wombat Sheetmetal Pty Ltd', nextAbn());
  const asked = await call('POST', `/api/list/${token}/claim`, { session: wrong });
  assert.equal(asked.status, 409);
  assert.equal(asked.data.confirm, true);
  assert.match(asked.data.message, /^This list is for Bandicoot Ductwork\. Is that your company\? Taking it up links it to Wombat Sheetmetal Pty Ltd \(ABN \d\d \d\d\d \d\d\d \d\d\d\)\.$/);
  assert.equal((await db.one('SELECT company_id FROM subcontracts WHERE id = $1', [subId])).company_id, '', 'not taken up');
  const taken = await call('POST', `/api/list/${token}/claim`, { session: wrong, body: { confirm: true } });
  assert.equal(taken.status, 200, JSON.stringify(taken.data));
  const page = (await call('GET', `/api/hse/subcontracts/${subId}`, { reviewer: b.lead })).data;
  assert.equal(page.sending.claimed.mismatch, true);
  assert.ok(page.sending.log.some((entry) => /Its name is not Bandicoot Ductwork: check it is the right company\./.test(entry.text)));
  assert.equal((await call('GET', `/api/hse/projects/${b.projectId}`, { reviewer: b.lead })).data.subcontracts[0].claimedMismatch, true);
  // A company with the subcontract's name, "Pty Ltd" or not, is not asked.
  const right = await setUp('r7claim2');
  const second = await readScope(right, { name: 'Numbat Air' });
  await sendList(right, second.subId, inDays(14));
  const numbat = await subbie('admin@numbat-air.example', 'Numbat Air Pty Ltd', nextAbn());
  assert.equal((await call('POST', `/api/list/${linkOf(second.email)}/claim`, { session: numbat })).status, 200);
  assert.equal((await call('GET', `/api/hse/subcontracts/${second.subId}`, { reviewer: right.lead })).data.sending.claimed.mismatch, false);
});

test('once a list is taken up, only that company sees and takes off its files; a file that is the scope is flagged to the lead', async () => {
  const b = await setUp('r7files');
  const { subId, email, page } = await readScope(b, { name: 'Bettong Mechanical' });
  await sendList(b, subId, inDays(14));
  const token = linkOf(email);
  const item = page.items.find((one) => one.group === 'list');
  // Before take-up anyone with the link sees and takes off a file.
  const first = await call('POST', `/api/list/${token}/items/${item.id}/upload`, { raw: PDF, headers: { 'Content-Type': 'application/pdf', 'X-File-Name': 'wrong.pdf' } });
  assert.equal(first.status, 201, JSON.stringify(first.data));
  const off = await call('DELETE', `/api/list/${token}/uploads/${first.data.list.swms.find((one) => one.id === item.id).uploads[0].id}`);
  assert.equal(off.status, 200);
  // The builder's own scope, uploaded as a SWMS, is taken and flagged for the lead only.
  const scopeDocx = await call('POST', `/api/list/${token}/items/${item.id}/upload`, { raw: Buffer.from(SCOPE), headers: { 'Content-Type': 'text/plain', 'X-File-Name': 'scope.txt' } });
  assert.equal(scopeDocx.status, 415, 'a text file is not taken');
  const kept = await call('POST', `/api/list/${token}/items/${item.id}/upload`, { raw: PDF, headers: { 'Content-Type': 'application/pdf', 'X-File-Name': 'Bettong SWMS.pdf' } });
  assert.equal(kept.status, 201);
  assert.equal(kept.data.list.swms.find((one) => one.id === item.id).uploads[0].flag, undefined, 'the flag is for the lead');
  const owner = await subbie('admin@bettong.example', 'Bettong Mechanical Pty Ltd', nextAbn());
  assert.equal((await call('POST', `/api/list/${token}/claim`, { session: owner })).status, 200);
  // A refused company sees the list, but not the files, and cannot take one off.
  const other = await subbie('admin@dingo-air.example', 'Dingo Flat Air Pty Ltd', nextAbn());
  const seen = await call('GET', `/api/list/${token}`, { session: other });
  const card = seen.data.swms.find((one) => one.id === item.id);
  assert.deepEqual(card.uploads, []);
  assert.equal(card.uploadsHidden, 1);
  assert.equal(seen.data.filesFor, 'Bettong Mechanical Pty Ltd');
  const fileId = (await db.one('SELECT id FROM list_uploads WHERE subcontract_id = $1 AND removed_at IS NULL', [subId])).id;
  const refused = await call('DELETE', `/api/list/${token}/uploads/${fileId}`, { session: other });
  assert.equal(refused.status, 403);
  assert.match(refused.data.message, /^Bettong Mechanical Pty Ltd has taken up this list in SiteWrite, so only people signed in for Bettong Mechanical Pty Ltd can take files off it\./);
  assert.equal((await call('DELETE', `/api/list/${token}/uploads/${fileId}`)).status, 403, 'signed out too');
  // The company that took it up sees its file and takes it off.
  const mine = await call('GET', `/api/list/${token}`, { session: owner });
  assert.equal(mine.data.swms.find((one) => one.id === item.id).uploads.length, 1);
  assert.equal((await call('DELETE', `/api/list/${token}/uploads/${fileId}`, { session: owner })).status, 200);
});

test('a scope uploaded as a SWMS is flagged to the lead', async () => {
  const b = await setUp('r7flag');
  const { subId, email, page } = await readScope(b, { name: 'Potoroo Mechanical' });
  await sendList(b, subId, inDays(14));
  // The same scope, as a Word file, read the same way the lead's was.
  const JSZip = require('jszip');
  const zip = new JSZip();
  const paras = SCOPE.split('\n').map((line) => `<w:p><w:r><w:t xml:space="preserve">${line.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</w:t></w:r></w:p>`).join('');
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}</w:body></w:document>`);
  const docx = await zip.generateAsync({ type: 'nodebuffer' });
  const item = page.items.find((one) => one.group === 'list');
  const up = await call('POST', `/api/list/${linkOf(email)}/items/${item.id}/upload`, { raw: docx, headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': 'Roof works SWMS.docx' } });
  assert.equal(up.status, 201, JSON.stringify(up.data));
  const lead = (await call('GET', `/api/hse/subcontracts/${subId}`, { reviewer: b.lead })).data;
  const flag = lead.sending.uploads[0].flag;
  assert.ok(flag === 'This file reads as the scope of works for this subcontract, not a SWMS.' || flag === 'This file may not be a SWMS: it does not say it is one, and names few hazards or controls.', flag);
});

test('the subcontractor\'s draft of the main SWMS takes in the folded work\'s steps and high risk work', async () => {
  const b = await setUp('r7draft');
  const { subId, email } = await readScope(b, { name: 'Quokka Mechanical' });
  await sendList(b, subId, inDays(14));
  const office = await subbie('admin@quokka.example', 'Quokka Mechanical Pty Ltd', nextAbn());
  assert.equal((await call('POST', `/api/list/${linkOf(email)}/claim`, { session: office })).status, 200);
  const { list } = (await call('GET', `/api/from-builders/${subId}`, { session: office })).data;
  const main = list.items.find((one) => one.title === MAIN_TITLE);
  for (const kind of ['ductwork', 'scaffold', 'ewp']) assert.ok(main.kinds.includes(kind), kind);
  assert.match(main.task, /scissor lifts/);
  assert.equal(main.highRisk.heading, 'This work needs a SWMS by law');
  assert.match(main.alsoCovers.join(', '), /Access equipment/);
  // No SWMS on the list goes with an empty set of step groups.
  for (const one of list.items) assert.ok(one.kinds === null || one.kinds.length, one.title);
});

test('site details: the first aider by name and phone, the details tidied, and a test address set-up says "not checked"', async () => {
  const b = await setUp('r7site');
  const weak = await call('PUT', `/api/hse/projects/${b.projectId}/site-details`, { reviewer: b.lead, body: { baseRev: 1, details: { musterPoint: 'Main gate on Pademelon Road', hospital: 'Camperdown General Hospital, Emergency Department', firstAider: 'the site supervisor' } } });
  assert.equal(weak.status, 400);
  assert.equal(weak.data.field, 'firstAider');
  assert.match(weak.data.message, /is a role, not a person/);
  const saved = await call('PUT', `/api/hse/projects/${b.projectId}/site-details`, { reviewer: b.lead, body: { baseRev: 1, details: { musterPoint: 'front gate on pademelon road', hospital: 'camperdown general hospital, emergency department', firstAider: 'tom keane 0413 222 908', firstAidLocation: 'site office, ground floor', siteRules: ['hi vis at all times'] } } });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const now = (await call('GET', `/api/hse/projects/${b.projectId}`, { reviewer: b.lead })).data.siteDetails.details;
  assert.equal(now.firstAider, 'Tom Keane 0413 222 908');
  // The street named takes its capitals too (SiteLink round 10, wording 11: "henry st").
  assert.equal(now.musterPoint, 'Front gate on Pademelon Road');
  assert.equal(now.hospital, 'Camperdown General Hospital, Emergency Department');
  assert.equal(now.firstAidLocation, 'Site office, ground floor');
  assert.deepEqual(now.siteRules, ['Hi vis at all times']);
  // A test address on staging: the register is not checked at all, and it says so.
  const tester = await leadSignIn('lead-r7@siteready.test');
  const made = await call('POST', '/api/hse/orgs', { reviewer: tester, body: { name: 'Tealwood Constructions Pty Ltd', abn: nextAbn() } });
  assert.equal(made.status, 201);
  assert.match(made.data.message, /The ABN register was not checked, because this is a test address\. The account shows Unverified\./);
  assert.equal(made.data.org.abnNote, 'The ABN register is not checked for a test address. The account shows Unverified.');
});

test('a list whose builder\'s account was removed says it was withdrawn', async () => {
  const lead = await leadSignIn('lead-r7w@siteready.test');
  const org = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Gone Builders Pty Ltd', abn: nextAbn() } });
  const project = await call('POST', `/api/hse/orgs/${org.data.org.id}/projects`, { reviewer: lead, body: { name: 'Pademelon Rd fitout', workplace: '48 Pademelon Road, Camperdown NSW 2050', state: 'nsw' } });
  const b = { lead, projectId: project.data.project.id };
  await call('PUT', `/api/hse/projects/${b.projectId}/site-details`, { reviewer: lead, body: { baseRev: 0, details: { musterPoint: 'Main gate on Pademelon Road' } } });
  const { subId } = await readScope(b, { name: 'Bilby Air', email: 'office-r7w@siteready.test' });
  await sendList(b, subId, inDays(14));
  const token = /\/list\.html\?t=([A-Za-z0-9_-]+)/.exec((await inbox('office-r7w@siteready.test')).find((one) => /SWMS required/.test(one.subject)).text)[1];
  assert.equal((await call('GET', `/api/list/${token}`)).status, 200);
  assert.equal((await call('POST', '/api/test/sitelink/remove', { headers: SECRET, body: { email: 'lead-r7w@siteready.test' } })).data.removed, 1);
  const gone = await call('GET', `/api/list/${token}`);
  assert.equal(gone.status, 410);
  assert.equal(gone.data.message, 'Gone Builders Pty Ltd has withdrawn this list, and no longer uses SiteLink. If you think this is wrong, contact the person who sent you the email.');
  assert.equal((await call('GET', '/api/list/AAAAAAAAAAAAAAAAAAAAAAAAAAAA')).status, 404, 'a link never sent is still "not right"');
});

test('emails and wording: SiteWrite is optional in the list email, the invitation reads as one, the ABN refusal matches', async () => {
  const email = listMail.compose({ kind: 'list_sent', person: 'Priya Nandakumar', builder: 'Ironbark Hill Builders', project: 'Pademelon Rd', items: ['Roof works'], due: '2026-10-30', link: 'LINK', stopLink: 'STOP' });
  assert.match(email.text, /\nLINK\n\nYou do not need SiteWrite: you can reply to this email, or upload your SWMS on the same page, with no account\.\n\n--\n/);
  assert.equal(email.version, 2);
  for (const kind of ['list_changed', 'reminder']) assert.match(listMail.compose({ kind, person: 'P', builder: 'B', project: 'J', items: ['A'], due: '2026-10-30', changes: { added: [], removed: [], changed: [] }, dueWas: '2026-10-29', link: 'L', stopLink: 'S' }).text, /You do not need SiteWrite/);
  // The company's team invitation.
  const office = await subbie('admin@invite-r7.example', 'Quandong Air Pty Ltd', nextAbn());
  assert.equal((await call('POST', '/api/company/users', { session: office, body: { email: 'foreman@invite-r7.example' } })).status, 200);
  const invite = [...mailbox].reverse().find((one) => one.to === 'foreman@invite-r7.example');
  assert.equal(invite.subject, 'Quandong Air Pty Ltd has added you on SiteWrite');
  assert.doesNotMatch(invite.text, /did not ask for it/);
  assert.match(invite.text, /If you did not expect this email, you can ignore it\.$/);
  // The subcontractor's ABN refusal says what SiteLink's says.
  const bad = await call('PUT', '/api/company', { session: office, body: { name: 'Quandong Air Pty Ltd', abn: '12 345 678 901' } });
  assert.equal(bad.data.message, 'That ABN is not valid. Check the 11 digits.');
});

test('a SWMS from a builder\'s list downloads under its title on that list', async () => {
  const office = await subbie('admin@title-r7.example', 'Quandong Fitout Pty Ltd', nextAbn());
  const input = ready({ ...ANSWERED, state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no' });
  const docx = await call('POST', '/api/draft.docx', { session: office, body: checked({ ...input, swmsTitle: 'Trade installation: medical gas systems' }) });
  assert.equal(docx.status, 200);
  assert.match(docx.headers.get('content-disposition'), /filename="Trade installation medical gas systems\.docx"/);
});
