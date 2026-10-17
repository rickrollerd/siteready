// SiteLink fixes from messy round 6 (15 October 2026). Made-up companies, people and sites only.
// The staging test hooks are on here (TEST_HOOKS_SECRET), as on staging: an account set up by a test
// address does not depend on the live ABN register, and a hook removes a test SiteLink account.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.RATE_LIMIT_HSE_REQUESTS = '5000';
process.env.RATE_LIMIT_AI_SCOPE_REQUESTS = '1000';
process.env.RATE_LIMIT_MAX_REQUESTS = '5000';
process.env.TEST_HOOKS_SECRET = 'r'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { app } = require('../server');
const db = require('../db');
const aiScope = require('../ai-scope');
const handover = require('../handover');
const hse = require('../hse');
const answers = require('../sitelink-answers');
const { tradeMismatch } = require('../sitelink-scopes');
const { setupAccounts } = require('./helpers');
const abnRegister = require('../abn');
const { validAbn } = require('../accounts');

// The live register, as staging has it: every made-up ABN is "not on the register". It counts the
// times it is asked.
const register = { asked: 0, answer: { enabled: true, found: false, error: 'The ABN was not found on the Australian Business Register.' } };
abnRegister.lookupAbn = async () => { register.asked += 1; return register.answer; };
let abnSeed = 27666903000;
function nextAbn() {
  for (abnSeed += 101; ; abnSeed += 1) if (validAbn(String(abnSeed))) return String(abnSeed);
}

// A made-up mechanical scope and the stand-in AI's reading of it, shaped like the round 6 reading:
// the main work, the trade's own housekeeping, materials handling and access equipment, maintenance in
// the defects period, controls with no high risk work, and acoustic separation matched to plant lifting.
const FILLER = 'The Subcontractor shall carry out the works in accordance with the drawings and specifications, keep the work area tidy, and coordinate its work with other trades on the site at all times.';
const MECHANICAL = [
  'Subcontract scope of works: Mechanical services',
  '1.1 Install ductwork and fan coil units in the ceiling spaces on levels 1 to 4.',
  '1.2 Lift the rooftop condensers onto the roof with a mobile crane supplied by the builder.',
  '1.3 Install acoustic and vibration separation between major plant and building structure.',
  '1.4 Install the central controller for the VRF systems in the plant room.',
  '1.5 Receive, check and handle materials on site.',
  '1.6 Remove rubbish daily to the builder\'s bins.',
  '1.7 Use task-specific access equipment.',
  '1.8 Carry out preventative maintenance during the defects liability period.',
  '2.1 The mechanical services include air conditioning, mechanical ventilation and mechanical exhaust to every level.',
  '2.2 Mechanical work is coordinated with the air conditioning controls contractor.',
  FILLER, FILLER, FILLER,
].join('\n');
const row = (activity, pack, clause, quote, unknowns = '', extra = {}) => ({ activity, type: 'Site work', package: pack, crew: 'Mechanical fitters', clause, quotes: [quote], where: '', plant: '', conditions: '', unknowns, matrixColumn: '', ...extra });
const MECHANICAL_READING = {
  activities: [
    row('Install ductwork and fan coil units in the ceiling spaces', 'Ductwork and mechanical units: whole project', 'Installation 1', 'Install ductwork and fan coil units in the ceiling spaces on levels 1 to 4.', 'confirm who supplies the fan coil units', { where: 'Levels 1 to 4' }),
    row('Install rooftop condensers', 'Ductwork and mechanical units: whole project', 'Installation 2, Installation 1', 'Lift the rooftop condensers onto the roof with a mobile crane supplied by the builder.', '', { where: 'Roof' }),
    row('Install acoustic and vibration separation between major plant and building structure', 'Trade installation: plant', 'Installation 3', 'Install acoustic and vibration separation between major plant and building structure.'),
    row('Install the central controller for the VRF systems', 'Controls', 'Installation 4', 'Install the central controller for the VRF systems in the plant room.', 'Who supplies the controller; where it is mounted'),
    row('Receive, check and handle materials on site', 'Materials handling', 'Installation 5', 'Receive, check and handle materials on site.'),
    row('Remove rubbish daily to the builder\'s bins', 'Housekeeping and waste', 'Installation 6', 'Remove rubbish daily to the builder\'s bins.'),
    row('Use task-specific access equipment', 'Access equipment', 'Installation 7', 'Use task-specific access equipment.'),
    row('Carry out preventative maintenance during the defects liability period', 'Maintenance', 'Installation 8', 'Carry out preventative maintenance during the defects liability period.', 'Who gives access to the roof in the defects period'),
  ],
  byOthers: [],
  conflicts: [],
};
const GROUPS = { 'Ductwork and mechanical units: whole project': ['ductwork', 'fanCoil'], 'Trade installation: plant': ['plantLift'], Controls: ['controlPanelInstall'], 'Materials handling': ['carpLoad'], 'Housekeeping and waste': ['cleaning'], 'Access equipment': ['scaffold'], Maintenance: ['acService'] };
const standIn = {
  beta: {
    messages: {
      stream(params) {
        const mapping = Boolean(params.output_config.format.schema.properties.packages);
        const content = params.messages[0].content;
        const body = mapping
          ? { packages: [...content.matchAll(/^Work package: (.*)$/gm)].map((m) => ({ package: m[1], groups: GROUPS[m[1]] || [], unmatched: [], byOthers: [] })) }
          : MECHANICAL_READING;
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
  server.close();
  delete process.env.ANTHROPIC_API_KEY;
  aiScope.useClient(null);
});

async function call(method, route, { body, reviewer, headers } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(reviewer ? { 'X-Reviewer-Token': reviewer } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}
const SECRET = { 'X-Test-Secret': 'r'.repeat(40) };

// Sign-in links to a test address go to the test inbox (testhooks.js).
async function signIn(email, name = 'Dana Whitfield') {
  assert.equal((await call('POST', '/api/hse/email', { body: { email } })).status, 200);
  let token = '';
  if (email.endsWith('@siteready.test')) {
    const inbox = await call('GET', `/api/test/inbox?to=${encodeURIComponent(email)}`, { headers: SECRET });
    token = /\/sitelink\?login=([A-Za-z0-9_-]+)/.exec(inbox.data.messages[0].text)[1];
  } else {
    const { mailbox } = require('./helpers');
    token = /\/sitelink\?login=([A-Za-z0-9_-]+)/.exec([...mailbox].reverse().find((item) => item.to === email).text)[1];
  }
  const { data } = await call('POST', '/api/hse/verify', { body: { token } });
  if (name) assert.equal((await call('PUT', '/api/hse/me', { reviewer: data.token, body: { name, position: 'HSE manager', phone: '0412 555 012' } })).status, 200);
  return data.token;
}
async function setUp(email, orgName) {
  const lead = await signIn(email);
  const org = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: orgName, abn: nextAbn() } });
  assert.equal(org.status, 201, JSON.stringify(org.data));
  const project = await call('POST', `/api/hse/orgs/${org.data.org.id}/projects`, { reviewer: lead, body: { name: 'Northgate Health Hub', workplace: '12 Wattle Road, Hamilton QLD 4007', state: 'qld' } });
  assert.equal(project.status, 201, JSON.stringify(project.data));
  return { lead, orgId: org.data.org.id, projectId: project.data.project.id };
}
async function readScope(lead, projectId, trade = 'Mechanical', name = 'Coolwater Air Pty Ltd') {
  const added = await call('POST', `/api/hse/projects/${projectId}/subcontracts`, { reviewer: lead, body: { name, trade } });
  assert.equal(added.status, 201, JSON.stringify(added.data));
  const subId = added.data.subcontract.id;
  const sent = await call('POST', `/api/hse/subcontracts/${subId}/scope`, { reviewer: lead, body: { file: { name: 'Mechanical scope.txt', data: Buffer.from(MECHANICAL).toString('base64') } } });
  assert.ok([200, 202].includes(sent.status), JSON.stringify(sent.data));
  for (let i = 0; i < 300; i += 1) {
    const page = await call('GET', `/api/hse/subcontracts/${subId}`, { reviewer: lead });
    if (page.data.reading.status !== 'reading') return { subId, page: page.data };
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
  throw new Error('the reading did not finish');
}

// ---- 1. Staging testers can set up an account ----

test('with the test hooks on, a test address sets up a made-up ABN as Unverified, without asking the live register', async () => {
  const tester = await signIn('lead-r6a@siteready.test');
  const before = register.asked;
  // A wrong check digit is still refused.
  const wrong = await call('POST', '/api/hse/orgs', { reviewer: tester, body: { name: 'Tealwood Constructions Pty Ltd', abn: '12 345 678 901' } });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.data.message, 'That ABN is not valid. Check the 11 digits.');
  const made = await call('POST', '/api/hse/orgs', { reviewer: tester, body: { name: 'Tealwood Constructions Pty Ltd', abn: nextAbn() } });
  assert.equal(made.status, 201, JSON.stringify(made.data));
  assert.equal(made.data.org.verified, false);
  assert.match(made.data.message, /shows Unverified/);
  assert.equal(register.asked, before, 'the live register was not asked');
  // "Check the ABN register again" does not ask it either.
  assert.equal((await call('POST', `/api/hse/orgs/${made.data.org.id}/abn-check`, { reviewer: tester })).status, 200);
  assert.equal(register.asked, before);
  // Anyone else is answered by the register, as in production: an ABN it does not list is refused,
  // with what to do, not "check the 11 digits".
  const real = await signIn('hse@tealwood.example');
  const abn = nextAbn();
  const refused = await call('POST', '/api/hse/orgs', { reviewer: real, body: { name: 'Tealwood Two Pty Ltd', abn } });
  assert.equal(refused.status, 400);
  assert.equal(register.asked, before + 1);
  assert.match(refused.data.message, /^The ABN register does not list ABN \d\d \d\d\d \d\d\d \d\d\d\. Check it against the company's records\. A company registered in the last few days may not be listed yet: try again in a few days, or contact SiteWrite at sitereadyaus@gmail\.com\.$/);
});

test('the test hook removes a test SiteLink account with everything in it, and nothing else', async () => {
  const { lead, orgId, projectId } = await setUp('lead-r6b@siteready.test', 'Remove Me Builders Pty Ltd');
  await call('POST', `/api/hse/orgs/${orgId}/members`, { reviewer: lead, body: { email: 'mate-r6b@siteready.test' } });
  await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 0, details: { musterPoint: 'Assembly area A at the Wattle Road gate' } } });
  const { subId } = await readScope(lead, projectId);
  const keep = await setUp('lead-r6c@siteready.test', 'Keep Me Builders Pty Ltd');
  // An account with a real address in its team is never removed by the hook.
  await call('POST', `/api/hse/orgs/${keep.orgId}/members`, { reviewer: keep.lead, body: { email: 'site@keepme.example' } });
  // Only with the secret, and only for test addresses.
  assert.equal((await call('POST', '/api/test/sitelink/remove', { body: { email: 'lead-r6b@siteready.test' } })).status, 404);
  assert.equal((await call('POST', '/api/test/sitelink/remove', { headers: SECRET, body: { email: 'site@keepme.example' } })).status, 400);
  const kept = await call('POST', '/api/test/sitelink/remove', { headers: SECRET, body: { email: 'lead-r6c@siteready.test' } });
  assert.deepEqual(kept.data, { ok: true, removed: 0, notTestAccounts: 1 });
  const gone = await call('POST', '/api/test/sitelink/remove', { headers: SECRET, body: { email: 'lead-r6b@siteready.test' } });
  assert.deepEqual(gone.data, { ok: true, removed: 1, notTestAccounts: 0 });
  for (const [table, column, id] of [['orgs', 'id', orgId], ['org_members', 'org_id', orgId], ['projects', 'org_id', orgId], ['project_site_details', 'project_id', projectId], ['project_events', 'org_id', orgId], ['subcontracts', 'project_id', projectId], ['required_swms', 'subcontract_id', subId], ['subcontract_points', 'subcontract_id', subId], ['ai_readings', 'org_id', orgId]]) {
    assert.equal(Number((await db.one(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = $1`, [id])).n), 0, table);
  }
  assert.ok(await db.one('SELECT id FROM orgs WHERE id = $1', [keep.orgId]), 'the other account is untouched');
  // The tester can set up again, with the same email.
  const again = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Remove Me Builders Pty Ltd', abn: nextAbn() } });
  assert.equal(again.status, 201);
  // By ABN too.
  assert.equal((await call('POST', '/api/test/sitelink/remove', { headers: SECRET, body: { abn: again.data.org.abn } })).data.removed, 1);
});

// ---- 3, 4, 6, 7. The list: no second guessing, fewer SWMS, high risk from the lead's words ----

test('the list holds only what is needed: support work folds into the main SWMS, defects maintenance and work with no high risk work start off the list', async () => {
  const { lead, projectId } = await setUp('lead-r6d@siteready.test', 'List Builders Pty Ltd');
  const { subId, page } = await readScope(lead, projectId);
  const by = Object.fromEntries(page.items.map((item) => [item.title, item]));
  // Messy round 11, blocker 6: ": whole project" is not part of the title.
  const main = by['Ductwork and mechanical units'];
  assert.equal(main.group, 'list');
  // Housekeeping, materials handling and access equipment are part of the main SWMS.
  for (const title of ['Materials handling', 'Housekeeping and waste', 'Access equipment']) {
    assert.equal(by[title].group, 'removed', title);
    assert.equal(by[title].removedWhy, 'Part of Ductwork and mechanical units to start with: the subcontractor\'s own work of this kind goes in that SWMS. Put it back to ask for a SWMS of its own.');
  }
  // Messy round 7: a one-line "Trade installation:" package with no certain high risk work goes in too.
  assert.deepEqual(main.alsoCovers, ['Trade installation: plant', 'Materials handling', 'Housekeeping and waste', 'Access equipment']);
  assert.equal(by.Maintenance.group, 'removed');
  assert.match(by.Maintenance.removedWhy, /maintenance in the defects period/);
  // Controls: no high risk construction work, so set aside in its own group, titled by its one activity
  // (messy round 10, blocker 7), and said once (wording 4).
  const controlsItem = by['Install the central controller for the VRF systems'];
  assert.equal(controlsItem.group, 'aside');
  assert.equal(controlsItem.removedWhy, 'No high risk construction work was found in it. Move it to the list if you want a SWMS for it.');
  // Acoustic separation is not "moving powered mobile plant" from its own words.
  // Shown by its work title (messy round 11, blocker 6).
  const plant = by['Plant installation'];
  assert.ok(!plant.highRisk || plant.highRisk.status !== 'yes', JSON.stringify(plant.highRisk));
  // Clause references once each, each heading once (messy round 10, wording 2).
  assert.deepEqual(main.clauses, ['Installation 1, 2']);
  // The subcontractor sees only the list, and never "may not need a SWMS".
  const preview = JSON.stringify(page.preview);
  assert.doesNotMatch(preview, /may not need/);
  assert.deepEqual(page.preview.swms.map((item) => item.title), page.items.filter((item) => item.group === 'list').map((item) => item.title));
  assert.deepEqual(page.preview.swms[0].alsoCovers, ['Trade installation: plant', 'Materials handling', 'Housekeeping and waste', 'Access equipment']);
  // The defects-period point is not asked while its SWMS is off the list; the main SWMS's point is,
  // and it starts with a capital letter.
  const point = (text) => page.points.find((one) => one.question.startsWith(text));
  assert.equal(point('Who gives access').inPlay, false);
  assert.equal(point('Who supplies the controller').inPlay, false);
  assert.equal(point('Confirm who supplies').inPlay, true);
  const project = (await call('GET', `/api/hse/projects/${projectId}`, { reviewer: lead })).data;
  assert.equal(project.subcontracts[0].pointsOpen, 1);
  // Answered points about a SWMS off the list are not sent either.
  await call('PUT', `/api/hse/subcontracts/${subId}/points/${point('Who gives access').id}`, { reviewer: lead, body: { answer: 'The site manager opens the roof hatch.' } });
  let next = (await call('PUT', `/api/hse/subcontracts/${subId}/points/${point('Confirm who supplies').id}`, { reviewer: lead, body: { answer: 'We supply the units. You install them.' } })).data;
  assert.deepEqual(next.preview.answers.map((one) => one.answer), ['We supply the units. You install them.']);
  // Moving Controls to the list brings its point back; removing the main SWMS takes its point away.
  next = (await call('PUT', `/api/hse/subcontracts/${subId}/items/${controlsItem.id}`, { reviewer: lead, body: { removed: false } })).data;
  assert.equal(next.message, 'Install the central controller for the VRF systems is moved to the list.');
  assert.equal(next.points.find((one) => one.question.startsWith('Who supplies the controller')).inPlay, true);
  next = (await call('PUT', `/api/hse/subcontracts/${subId}/items/${main.id}`, { reviewer: lead, body: { removed: true } })).data;
  assert.equal(next.points.find((one) => one.question.startsWith('Confirm who supplies')).inPlay, false);
  assert.deepEqual(next.preview.answers, []);
  assert.equal((await call('GET', `/api/hse/projects/${projectId}`, { reviewer: lead })).data.subcontracts[0].pointsOpen, 1);
});

test('the high risk work follows the lead\'s own words when a SWMS is reworded or added', async () => {
  const { lead, projectId } = await setUp('lead-r6e@siteready.test', 'Words Builders Pty Ltd');
  const { subId, page } = await readScope(lead, projectId);
  const controls = page.items.find((item) => item.title === 'Install the central controller for the VRF systems');
  assert.equal(controls.highRisk.status, 'none');
  let next = (await call('PUT', `/api/hse/subcontracts/${subId}/items/${controls.id}`, { reviewer: lead, body: { task: 'Install leak detection and VRF controllers in the ceiling spaces on levels 1 and 2, working from mobile scaffolds.' } })).data;
  const reworded = next.items.find((item) => item.id === controls.id);
  assert.notEqual(reworded.highRisk.status, 'none', 'the mobile scaffolds bring a fall');
  assert.match(reworded.highRisk.lines[0], /Fall of more than 2 m/);
  // A typed title gets a capital letter, and a crane lift shows its high risk work, on the list and
  // in what the subcontractor sees.
  next = (await call('POST', `/api/hse/subcontracts/${subId}/items`, { reviewer: lead, body: { title: 'crane lift rooftop units', task: 'Lift the rooftop condensers onto the roof with a 60 t mobile crane supplied by the subcontractor.' } })).data;
  const added = next.items.find((item) => item.source === 'added');
  assert.equal(added.title, 'Crane lift rooftop units');
  assert.equal(added.highRisk.status, 'yes');
  assert.match(added.highRisk.lines[0], /Moving powered mobile plant/);
  const sent = next.preview.swms.find((item) => item.title === 'Crane lift rooftop units');
  assert.equal(sent.highRisk.status, 'yes');
  // Acoustic separation in the lead's words is not moving plant.
  assert.equal(handover.highRiskOf('Install acoustic and vibration separation between major plant and building structure.', 'qld', { kinds: ['plantLift'] }).status !== 'yes', true);
});

test('the list rules on a made-up reading: folding, defects and set aside, with the plant rule', () => {
  const reading = JSON.parse(JSON.stringify(MECHANICAL_READING));
  reading.highRisk = [
    { package: 'Ductwork and mechanical units: whole project', categories: [{ id: 'fall', short: 'Fall of more than 2 m', likely: true, dependsOn: 'the working height' }], dependsOn: [] },
    { package: 'Trade installation: plant', categories: [{ id: 'plant', short: 'Moving powered mobile plant', likely: false }], dependsOn: [] },
    { package: 'Controls', categories: [], dependsOn: [] },
    { package: 'Materials handling', categories: [], dependsOn: [] },
    { package: 'Housekeeping and waste', categories: [], dependsOn: [] },
    // Access equipment with high risk work of its own folds into the main SWMS too, which then names it
    // (messy round 7).
    { package: 'Access equipment', categories: [{ id: 'fall', short: 'Fall of more than 2 m', likely: false }], dependsOn: [] },
    { package: 'Maintenance', categories: [], dependsOn: [] },
  ];
  const list = handover.listItems(reading);
  const why = Object.fromEntries(list.map((item) => [item.title, item.removedWhy]));
  assert.deepEqual(why, {
    'Ductwork and mechanical units': '',
    'Trade installation: plant': 'folded',
    'Install the central controller for the VRF systems': 'noLaw',
    'Materials handling': 'folded',
    'Housekeeping and waste': 'folded',
    'Access equipment': 'folded',
    Maintenance: 'defects',
  });
  assert.equal(list.find((item) => item.title === 'Trade installation: plant').highRisk.status, 'depends');
  // Clause references are listed once.
  assert.deepEqual(handover.clauseList(['Description of Work Area, Description of Work Area', 'Installation 6, 10', 'Installation 6']), ['Description of Work Area', 'Installation 6, 10']);
});

// ---- 5. Weak answers do not reach subcontractors, and every problem is named at once ----

test('site details, the lead\'s details and point answers are judged as the SWMS app judges them, every problem at once', async () => {
  const { lead, projectId, orgId } = await setUp('lead-r6f@siteready.test', 'Answers Builders Pty Ltd');
  const weak = await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 0, details: { musterPoint: 'carpark', firstAider: 'tbc', hospital: 'royal brisbane', siteManager: 'me', scaffoldSupervisor: 'Sam 0412 555 01', siteRules: 'Sign in at the site office\nTBC' } } });
  assert.equal(weak.status, 400);
  assert.deepEqual(Object.keys(weak.data.fields).sort(), ['firstAider', 'hospital', 'musterPoint', 'scaffoldSupervisor', 'siteManager', 'siteRules']);
  assert.equal(weak.data.message, '6 details need changing before they can be saved: muster point, first aider, hospital or medical centre, scaffold supervisor, site manager and site rules. Each box says why.');
  assert.match(weak.data.fields.musterPoint, /"carpark" does not say where/);
  assert.match(weak.data.fields.firstAider, /Leave first aider empty until you know it/);
  assert.match(weak.data.fields.siteManager, /"me" does not say who/);
  assert.match(weak.data.fields.scaffoldSupervisor, /"0412 555 01" is not a full phone number/);
  assert.match(weak.data.fields.hospital, /does not say it is a hospital or medical centre/);
  assert.equal(Number((await db.one('SELECT COUNT(*) AS n FROM project_site_details WHERE project_id = $1', [projectId])).n), 0, 'nothing saved');
  const firstOnly = await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 0, details: { firstAider: 'dana w' } } });
  assert.match(firstOnly.data.message, /"dana w" gives a first name only/);
  const good = await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 0, details: { musterPoint: 'Assembly area A at the Wattle Road gate', firstAider: 'Priya Lal, 0411 222 333', hospital: 'Northside General Hospital, Emergency Department', siteManager: 'Sam Okafor, 0412 555 012', siteRules: 'Sign in at the site office' } } });
  assert.equal(good.status, 200, JSON.stringify(good.data));
  // The lead's own name and phone: a first name only and a 9 digit phone, both at once.
  const me = await call('PUT', '/api/hse/me', { reviewer: lead, body: { name: 'dana w', position: 'HSE manager', phone: '0412 555 01' } });
  assert.equal(me.status, 400);
  assert.deepEqual(Object.keys(me.data.fields).sort(), ['name', 'phone']);
  assert.match(me.data.fields.name, /gives a first name only\. Give your full name/);
  const tidy = await call('PUT', '/api/hse/me', { reviewer: lead, body: { name: 'dana whitfield', position: 'HSE manager', phone: '0412 555 012' } });
  assert.equal(tidy.data.me.name, 'Dana Whitfield');
  // A point answer that passes the question on.
  const { subId, page } = await readScope(lead, projectId);
  const point = page.points.find((one) => one.inPlay);
  const passed = await call('PUT', `/api/hse/subcontracts/${subId}/points/${point.id}`, { reviewer: lead, body: { answer: 'check with dana' } });
  assert.equal(passed.status, 400);
  assert.equal(passed.data.message, '"check with dana" passes the question on instead of answering it. Write the answer here, or leave it empty until you know.');
  assert.match((await call('PUT', `/api/hse/subcontracts/${subId}/points/${point.id}`, { reviewer: lead, body: { answer: 'me' } })).data.message, /does not say who/);
  void orgId;
});

// ---- 8. Trades that do not match ----

test('a scope for another trade is asked about before it is read, and the lead can carry on', async () => {
  const { lead, projectId } = await setUp('lead-r6g@siteready.test', 'Trades Builders Pty Ltd');
  const added = await call('POST', `/api/hse/projects/${projectId}/subcontracts`, { reviewer: lead, body: { name: 'Bluegum Plumbing', trade: 'Hydraulics' } });
  const subId = added.data.subcontract.id;
  const file = { name: 'Mechanical scope.txt', data: Buffer.from(MECHANICAL).toString('base64') };
  const asked = await call('POST', `/api/hse/subcontracts/${subId}/scope`, { reviewer: lead, body: { file } });
  assert.equal(asked.status, 409);
  assert.equal(asked.data.tradeMismatch, true);
  assert.equal(asked.data.message, 'This scope reads as mechanical work, but the subcontract\'s trade is hydraulics. Check it is the right scope for this subcontract.');
  assert.equal(Number((await db.one('SELECT COUNT(*) AS n FROM ai_readings WHERE project_id = $1', [projectId])).n), 0, 'nothing was read');
  const carried = await call('POST', `/api/hse/subcontracts/${subId}/scope`, { reviewer: lead, body: { file, tradeChecked: true } });
  assert.ok([200, 202].includes(carried.status));
  assert.match(carried.data.subcontract.tradeWarning, /reads as mechanical work/);
  // The held scopes all match their own trade.
  const dir = path.join(__dirname, '..', 'scenarios', 'scopes');
  const own = { 'a-carpet': 'Floor coverings', 'a-ceilings': 'Ceilings and partitions', 'a-cleaning': 'Cleaning', 'a-commercial': 'Commercial kitchens', 'a-doors': 'Doors and hardware', 'a-electrical': 'Electrical', 'a-fence': 'Fencing', 'a-floor': 'Tiling', 'a-glazing': 'Glazing', 'a-hydraulic': 'Hydraulics', 'a-joinery': 'Joinery', 'a-landscaping': 'Landscaping', 'b-aluminium': 'Windows and doors', 'b-civil': 'Civil and concrete', 'b-mechanical': 'Mechanical', 'b-painting': 'Painting', 'b-reo': 'Reinforcement', 'b-roofing': 'Roofing', 'b-security': 'Security', 'b-steel': 'Structural steel', 'b-swimming': 'Swimming pool', 'b-tiling': 'Tiling', 'b-waterproof': 'Waterproofing', 'c-ceilings': 'Ceilings', 'c-electrical': 'Electrical and comms', 'c-fire': 'Fire services', 'c-hydraulics': 'Plumbing', 'c-mechanical': 'Mechanical services', 'c-waterproofing': 'Waterproofing' };
  for (const name of fs.readdirSync(dir)) {
    const key = Object.keys(own).find((prefix) => name.startsWith(prefix));
    if (key) assert.equal(tradeMismatch(fs.readFileSync(path.join(dir, name), 'utf8'), own[key]), '', name);
  }
  assert.notEqual(tradeMismatch(fs.readFileSync(path.join(dir, 'b-mechanical-1.txt'), 'utf8'), 'Electrical'), '');
});

// ---- 11, 12, 13, 14 ----

test('the state is read from a typed address without a postcode, and a lower case address is tidied', async () => {
  const { lead, orgId } = await setUp('lead-r6h@siteready.test', 'Address Builders Pty Ltd');
  const made = await call('POST', `/api/hse/orgs/${orgId}/projects`, { reviewer: lead, body: { name: 'Hamilton wharf', workplace: '120 wattle road hamilton qld', state: '' } });
  assert.equal(made.status, 201, JSON.stringify(made.data));
  assert.equal(made.data.project.state, 'qld');
  assert.equal(made.data.project.workplace, '120 Wattle Road Hamilton QLD');
  assert.equal(hse.tidyAddress('Level 2, 40 Harbour St'), 'Level 2, 40 Harbour St', 'an address with capitals is kept as typed');
  const { stateFromTyped } = require('../public/address');
  assert.equal(stateFromTyped('qld').state, 'qld');
  assert.equal(stateFromTyped('120 wattle road hamilton qld').state, 'qld');
});

test('an Unverified account shows Unverified to the subcontractor, and its settings do not offer the register\'s name', async () => {
  const { lead, projectId, orgId } = await setUp('lead-r6i@siteready.test', 'Unverified Builders Pty Ltd');
  const { page } = await readScope(lead, projectId);
  assert.equal(page.preview.fromVerified, false);
  const settings = (await call('GET', `/api/hse/orgs/${orgId}`, { reviewer: lead })).data.org;
  assert.equal(settings.support, 'sitereadyaus@gmail.com');
  // A name mismatch says to contact SiteWrite, with the address, and offers no rename.
  await db.query("UPDATE orgs SET abn_check = 'name', abn_names = $1 WHERE id = $2", [JSON.stringify(['MARLIN CONSTRUCTIONS PTY LTD']), orgId]);
  const named = (await call('GET', `/api/hse/orgs/${orgId}`, { reviewer: lead })).data.org;
  assert.equal(named.abnNote, 'The ABN register lists this ABN under Marlin Constructions Pty Ltd. The account shows Unverified. If this account is for Marlin Constructions Pty Ltd, contact SiteWrite at sitereadyaus@gmail.com to have it checked.');
  const page2 = fs.readFileSync(path.join(__dirname, '..', 'public', 'hse.js'), 'utf8');
  assert.doesNotMatch(page2, /as the account name<\/button>/, 'no one-click rename to the register\'s name');
});

test('the project log records subcontracts, scopes, list changes and invitations; the lead is told when a teammate replaced her detail; a member can leave', async () => {
  const { lead, projectId, orgId } = await setUp('lead-r6j@siteready.test', 'Log Builders Pty Ltd');
  await call('POST', `/api/hse/orgs/${orgId}/members`, { reviewer: lead, body: { email: 'mate-r6j@siteready.test' } });
  const mate = await signIn('mate-r6j@siteready.test', 'Sam Okafor');
  await call('GET', '/api/hse/me', { reviewer: mate });
  const { subId, page } = await readScope(lead, projectId);
  const controls = page.items.find((item) => item.title === 'Install the central controller for the VRF systems');
  await call('PUT', `/api/hse/subcontracts/${subId}/items/${controls.id}`, { reviewer: lead, body: { removed: false } });
  await call('POST', `/api/hse/subcontracts/${subId}/items`, { reviewer: lead, body: { title: 'Crane lift', task: 'Lift the condensers with a 60 t mobile crane.' } });
  // The lead sets the muster point; Sam's later version changes it.
  await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 0, details: { musterPoint: 'Assembly area A at the Wattle Road gate' } } });
  await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: mate, body: { baseRev: 1, details: { musterPoint: 'Assembly area B by the site office' } } });
  const project = (await call('GET', `/api/hse/projects/${projectId}`, { reviewer: lead })).data;
  const log = project.log.map((entry) => entry.text);
  for (const text of ['Dana Whitfield invited mate-r6j@siteready.test to the team.', 'Dana Whitfield added the subcontract Coolwater Air Pty Ltd (Mechanical).', 'Dana Whitfield uploaded Mechanical scope.txt as the scope for Coolwater Air Pty Ltd. SiteLink is reading it.', 'SiteLink read Mechanical scope.txt, the scope for Coolwater Air Pty Ltd, and listed 1 SWMS.', 'Dana Whitfield put Install the central controller for the VRF systems on the SWMS list for Coolwater Air Pty Ltd.', 'Dana Whitfield added Crane lift to the SWMS list for Coolwater Air Pty Ltd.']) {
    assert.ok(log.includes(text), `${text} in ${JSON.stringify(log)}`);
  }
  assert.deepEqual(project.replaced, { by: 'Sam Okafor', rev: 2, details: ['muster point'] });
  assert.equal((await call('GET', `/api/hse/projects/${projectId}`, { reviewer: mate })).data.replaced, null);
  // A member leaves; the lead cannot.
  assert.equal((await call('POST', `/api/hse/orgs/${orgId}/leave`, { reviewer: lead })).status, 403);
  const left = await call('POST', `/api/hse/orgs/${orgId}/leave`, { reviewer: mate });
  assert.equal(left.status, 200);
  assert.equal(left.data.message, 'You have left Log Builders Pty Ltd. You no longer see its projects.');
  assert.equal((await call('GET', `/api/hse/projects/${projectId}`, { reviewer: mate })).status, 404);
  assert.ok((await call('GET', `/api/hse/projects/${projectId}`, { reviewer: lead })).data.log.some((entry) => entry.text === 'Sam Okafor left the team.'));
});

test('the read time of a file read before is the reading\'s own time', async () => {
  const { lead, projectId } = await setUp('lead-r6k@siteready.test', 'Time Builders Pty Ltd');
  const first = await readScope(lead, projectId);
  await db.query('UPDATE ai_readings SET created_at = $1, finished_at = $1 WHERE id = (SELECT reading_id FROM subcontracts WHERE id = $2)', [new Date(Date.now() - 3 * 60 * 1000), first.subId]);
  const second = await readScope(lead, projectId, 'Mechanical', 'Second Air Pty Ltd');
  assert.equal(second.page.subcontract.readBefore, true);
  assert.notEqual(second.page.subcontract.readOn, second.page.subcontract.scopeOn);
  assert.equal(second.page.subcontract.readOn, (await call('GET', `/api/hse/subcontracts/${first.subId}`, { reviewer: lead })).data.subcontract.readOn);
});

test('the answer checks', () => {
  assert.equal(answers.personProblem('Jo Park, 0412 345 678'), '');
  assert.match(answers.personProblem('builder', { firstAider: true }), /does not name a first aider/);
  assert.equal(answers.placeProblem('Car park on Kent Street, by the site office'), '');
  assert.match(answers.placeProblem('carpark'), /does not say where/);
  assert.equal(answers.hospitalProblem('Northside General Hospital'), '');
  assert.equal(answers.notAnswer('The A/V subcontractor supplies the room controls.'), '');
  for (const text of ['check with dana', 'Confirm with the site manager', 'ask Sam']) assert.match(answers.notAnswer(text), /passes the question on/);
  assert.equal(answers.phoneOnly('+61 412 555 012'), '');
  assert.equal(answers.tidyName('dana whitfield'), 'Dana Whitfield');
  assert.equal(answers.capitalFirst('crane lift rooftop units'), 'Crane lift rooftop units');
});
