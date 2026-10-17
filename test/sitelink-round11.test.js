// SiteLink fixes from messy round 11 (17 October 2026, staging 839534e). Made-up companies, people and
// sites only. No paid AI reading: the stand-in client answers with a made-up hydraulic reading.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.RATE_LIMIT_HSE_REQUESTS = '5000';
process.env.RATE_LIMIT_AI_SCOPE_REQUESTS = '1000';
process.env.RATE_LIMIT_MAX_REQUESTS = '5000';
process.env.RATE_LIMIT_LIST_REQUESTS = '5000';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { app } = require('../server');
const db = require('../db');
const handover = require('../handover');
const send = require('../sitelink-send');
const aiScope = require('../ai-scope');
const abnRegister = require('../abn');
const { validAbn } = require('../accounts');
const { prepareDraft } = require('../draft');
const { draftBody } = require('../input');
const { setupAccounts, mailbox, ANSWERED, ready } = require('./helpers');

abnRegister.lookupAbn = async () => ({ enabled: false });
let abnSeed = 64566657000;
function nextAbn() {
  for (abnSeed += 89; ; abnSeed += 1) if (validAbn(String(abnSeed))) return String(abnSeed);
}
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// ---- Blocker 1: a site answer given once for every SWMS is never the source of high risk work ----

// The round 11 tester's five answers, given once on the one-go page.
const SITE = {
  liveServices: 'Live water main in the street. Existing sewer at the boundary.',
  publicInterface: 'Public footpath on Grenfell St beside the site fence.',
  otherTrades: 'Electricians and the civil crew working nearby.',
  ground: 'Open trench along the entry road for the water main, about 1.8 m deep, shored.',
  access: 'Stairs and the builders hoist. Scissor lift on the slab for high level pipework.',
};
const base = (task, extra = {}) => ready({ ...ANSWERED, state: 'sa', task, fallRisk: 'no', residential: 'no', crane: 'none', site: SITE, ...extra });
// The round 11 temporary services SWMS, with the step groups its scope reading matched.
const TEMPORARY = ['Install and maintain temporary chilled drinking fountains and water bubblers. Install temporary potable water reticulation and demountable connections. Install temporary stormwater drainage including downpipes. Install temporary building water supply with hose taps.', { kinds: ['plumbingFitOff', 'commercialAppliance', 'hydraulicRisers', 'gutters'] }];
const sources = (out) => Object.values(out.highRiskFrom || {});

test('no change: high risk work a SWMS finds in its own task, steps or plant never says "from your Access answer" (blocker 1)', () => {
  // Work whose own steps use a platform and whose own pump station is dug: both are its own, so they stay,
  // and are said to come from the task or the plant, never from the answers every SWMS shares.
  for (const [task, own] of [
    TEMPORARY,
    ['Install three below ground temporary sewer pump stations. Install temporary sanitary plumbing and drainage.', {}],
    ['Install seismic restraints and clips. Install risers and pipework in the services riser.', {}],
  ]) {
    const shared = prepareDraft(draftBody(base(task, { ...own, siteShared: true })));
    const none = prepareDraft(draftBody(base(task, { ...own, site: {}, siteShared: true })));
    assert.equal(shared.kind, 'draft', task);
    assert.deepEqual(sources(shared).filter((where) => /answer$/.test(where)), [], `${task}: ${JSON.stringify(shared.highRiskFrom)}`);
    // The answers every SWMS shares bring nothing: the same high risk work with them as without them.
    assert.deepEqual(shared.highRisk, none.highRisk, task);
    assert.deepEqual((shared.plant || []).map((item) => item.item), (none.plant || []).map((item) => item.item), task);
  }
  // A pump station's wet well is the task's own dig, said so.
  const pump = prepareDraft(draftBody(base('Install three below ground temporary sewer pump stations.', { siteShared: true })));
  const trench = pump.highRisk.find((label) => /trench/.test(label));
  assert.ok(trench, JSON.stringify(pump.highRisk));
  assert.equal(pump.highRiskFrom[trench], 'the task');
});

test('one SWMS changed one answer: only that answer of its own is named, the shared ones bring nothing (blocker 1)', () => {
  const site = { ...SITE, access: "Roof access by the builder's scaffold stair tower on the north side. Materials lifted by the builder's crane." };
  const roof = prepareDraft(draftBody(base('Make and waterproof roof penetrations. Install over-flashings to pipes and flues.', { kinds: ['roofPenetration'], site, siteShared: ['liveServices', 'publicInterface', 'otherTrades', 'ground'] })));
  assert.equal(roof.kind, 'draft');
  assert.ok(sources(roof).every((where) => !/Ground|Live services|Public|Other trades/.test(where)), JSON.stringify(roof.highRiskFrom));
  assert.ok(sources(roof).includes('your Access answer'), JSON.stringify(roof.highRiskFrom));
  // The other SWMS, still with every answer as the project gave it, take nothing from Roof works' change.
  const other = prepareDraft(draftBody(base(TEMPORARY[0], { ...TEMPORARY[1], siteShared: true })));
  assert.deepEqual(sources(other).filter((where) => /answer$/.test(where)), [], JSON.stringify(other.highRiskFrom));
  // Outside a project every answer is the SWMS's own, as before.
  const single = prepareDraft(draftBody(base(TEMPORARY[0], TEMPORARY[1])));
  assert.ok(sources(single).some((where) => /answer$/.test(where)), JSON.stringify(single.highRiskFrom));
});

// ---- Blocker 2 and wording 2: notes settled only on their own subject, each with a subject and a stop ----

test('a note that says only that something is open is settled by no answer, unless it names the point\'s own work (blocker 2)', () => {
  const answers = [{ activity: 'Install thirty additional sewer manholes', question: 'Whether the extra sewer manholes and deep branches will be instructed is open.', answer: 'Not instructed. Leave the extra manholes and deep branches out of the swms for now.' }];
  const notes = handover.notesOf([
    'Whether they will be instructed is open.',
    'Whether it will be instructed is open',
    'Construct new 400KL potable water storage tank: whether it will be instructed is open.',
    'Install BMS-capable site boundary gas meter: whether it will be instructed is open.',
    'Install thirty additional sewer manholes: whether they will be instructed is open.',
    'Extra sewer manholes and deep branches: whether they will be instructed is open.',
  ]);
  const settled = handover.withSettled({ draftNotes: notes }, answers).draftNotes.map((note) => [note.text, Boolean(note.settled)]);
  assert.deepEqual(settled, [
    ['Whether they will be instructed is open.', false],
    ['Whether it will be instructed is open.', false],
    ['Construct new 400KL potable water storage tank: whether it will be instructed is open.', false],
    ['Install BMS-capable site boundary gas meter: whether it will be instructed is open.', false],
    ['Install thirty additional sewer manholes: whether they will be instructed is open.', true],
    ['Extra sewer manholes and deep branches: whether they will be instructed is open.', true],
  ]);
  // A note with a subject of its own still settles on it (rounds 8 to 10 as before).
  const access = handover.withSettled({ draftNotes: handover.notesOf(['Access panels through ceilings and walls are excluded (Exclusion 1).']) }, [{ activity: 'Cut and form penetrations', question: 'Confirm who supplies and installs the access panels through ceilings and walls.', answer: 'The ceiling contractor supplies and installs them.' }]);
  assert.ok(access.draftNotes[0].settled);
});

test('a note says the work it is about when its subject is "they" or "it", and ends with a full stop (wording 2)', () => {
  const notes = handover.draftNotes([
    { activity: 'Construct new 400KL potable water storage tank (Variation Price Option)', unknowns: 'Whether it will be instructed is open' },
    { activity: 'Core drill penetrations', unknowns: 'Builder approval of the Cutting Drilling and Core Holing Permit is required before drilling after energisation' },
  ]);
  assert.deepEqual(notes, [
    'Construct new 400KL potable water storage tank: whether it will be instructed is open.',
    'Builder approval of the Cutting Drilling and Core Holing Permit is required before drilling after energisation.',
  ]);
  assert.deepEqual(handover.notesOf(['Tank height and access']).map((note) => note.text), ['Tank height and access.']);
});

// ---- Wording 1 and 3: no "Which ..." fragments as points; "C-1.05" kept whole ----

test('a part that goes on from the one before ("which gives ...") is never a point of its own (wording 1)', () => {
  const reading = { activities: [
    { activity: 'Cast in conduits', type: 'Site work', package: 'Trade installation: cast-in items', crew: 'Plumbers', clause: 'C-1.10', quotes: ['Cast in all conduits.'], unknowns: 'Precast conduit supply split between electrical and hydraulic scopes; which gives precast conduits to the Electrical subcontractor' },
    { activity: 'Fire matrix testing', type: 'Site work', package: 'Testing and commissioning', crew: 'Plumbers', clause: 'C-2.01', quotes: ['Fire matrix testing.'], unknowns: 'Who leads fire matrix testing, which makes the Mechanical subcontractor lead for it' },
  ] };
  const asked = handover.listPoints(reading).map((point) => point.question);
  assert.ok(asked.length >= 1, JSON.stringify(asked));
  assert.ok(asked.every((question) => !/^which\b/i.test(question)), JSON.stringify(asked));
  assert.ok(asked.some((question) => /, which gives precast conduits to the Electrical subcontractor/.test(question)), JSON.stringify(asked));
  // A real question that starts with "Which" is still a question.
  assert.deepEqual(handover.splitPoint('Which party supplies the pit lids').asks, ['Which party supplies the pit lids']);
});

test('clause numbers keep their letter: "C-1.05", never "C- 1.05" (wording 3)', () => {
  assert.deepEqual(handover.clauseList(['Appendix C C-1.11', 'Appendix C C-1.34, C-1.37']), ['Appendix C C-1.11, C-1.34, C-1.37']);
  assert.ok(handover.clauseList(['C-1.05, C-1.06, C-1.69']).every((part) => !/C- /.test(part)));
  // Headed numbers are grouped as before (round 10, wording 2).
  assert.deepEqual(handover.clauseList(['Specific Inclusions 2b, 4', 'Specific Inclusions 2c, 2d']), ['Specific Inclusions 2b, 4, 2c, 2d']);
});

// ---- Smaller faults: testing duties, "Response recorded" ----

test('testing and commissioning done on site is not listed among the duties that need no SWMS', () => {
  assert.equal(handover.handsOnTesting('Hydraulic test and commissioning of the water and drainage services'), true);
  assert.equal(handover.handsOnTesting('Pressure test and flush the water mains'), true);
  for (const duty of ['Commissioning management, ITPs, commissioning plan and manufacturer\'s representative supervision', 'Witness testing and FAT, SAT and IST of major plant', 'Prepare as-built survey and as-built documentation', 'Attend power outage, generator and black start tests']) assert.equal(handover.handsOnTesting(duty), false, duty);
  assert.match(read('public/hse.js'), /the scope lists as \$\{testing\.length === 1 \? 'a duty' : 'duties'\}/);
});

test('a response SiteLink did not email reads "Response recorded", not "Review sent"', () => {
  assert.equal(send.contactText({ kind: 'review_sent', ref_ids: { emailed: false }, summary: 'Marnie Tolhurst returned "Approved with conditions" on Fire services (fire.pdf, received outside SiteWrite) for Wren Fire.' }), 'Response recorded');
  assert.equal(send.contactText({ kind: 'review_sent', ref_ids: { emailed: true }, summary: 'x' }), 'Review sent');
  // Kept before this build, with no flag: read from what the log says.
  assert.equal(send.contactText({ kind: 'review_sent', ref_ids: '{}', summary: 'Marnie Tolhurst returned "Approved" on Roof works (revision 1) for Galah. Galah was emailed that its review is back.' }), 'Review sent');
  assert.equal(send.contactText({ kind: 'review_sent', ref_ids: '{}', summary: 'Marnie Tolhurst returned "Approved" on Fire (fire.pdf, received outside SiteWrite) for Wren Fire.' }), 'Response recorded');
});

// ---- The page code: wording 4 to 7 and smaller faults kept in the browser scripts ----

test('page code: the lead is not told "The builder may still ask"; sign-on times read as other dates; list drafts are saved by their title, once', () => {
  assert.match(read('public/hse.js'), /!\/\^the builder may still ask\\b\/i\.test\(line\)/);
  const account = read('public/account.js');
  assert.doesNotMatch(account, /signed_at\)\.toLocaleString\('en-AU'\)/);
  assert.match(account, /const signedWhen = /);
  // Save names a list's SWMS by its title, as Download does; no "Save to a site" on a list's draft.
  assert.match(account, /\.\.\.\(listTitle && !S\.editing \? \{ title: listTitle \} : \{\}\)/);
  assert.match(account, /kind === 'draft' && !local && !fromList \?/);
  // Save, Download and Submit keep one record: the project item takes the saved id.
  assert.equal((account.match(/S\.projectSaved\(/g) || []).length, 2);
  const scope = read('public/scope.js');
  assert.match(scope, /S\.projectSaved = \(input, id\) =>/);
  // A reload keeps the SWMS open to check, not SWMS 1.
  assert.match(scope, /if \(at >= 0\) project\.current = at;/);
  assert.match(scope, /if \(open && open\.body && \$\('result'\) && \$\('result'\)\.classList\.contains\('hidden'\)\) openItem\(project\.current\);/);
  // A detail no one had given, given while a SWMS is open, is for every SWMS.
  assert.match(scope, /if \(blank\(project\.listShared\[field\.key\]\) && !blank\(now\[field\.key\]\) && !\(field\.key in own\)\)/);
});

// ---- Blocker 6 and the lead's table: work titles on every item, never two the same ----

const row = (activity, pack, clause, quote, unknowns = '', extra = {}) => ({ activity, type: 'Site work', package: pack, crew: 'Plumbers', clause, quotes: [quote], where: '', plant: '', conditions: '', unknowns, matrixColumn: '', ...extra });
const READING = {
  activities: [
    row('Install risers and pipework in the services risers', 'Risers and pipework at height: whole project', 'C-1.20', 'Install risers and pipework in the services risers.'),
    row('Install high level pipework from an elevating work platform', 'Risers and pipework at height: whole project', 'C-1.21', 'Install high level pipework.'),
    row('Install sanitary plumbing in the buildings', 'Trade installation: buildings', 'C-1.30', 'Install sanitary plumbing in the buildings.'),
    row('Install sanitaryware and tapware', 'Trade installation: buildings', 'C-1.31', 'Install sanitaryware and tapware.'),
    row('Construct the storage tanks', 'Trade installation: buildings', 'C-1.32', 'Construct the storage tanks.', 'Whether they will be instructed is open'),
    row('Install below ground temporary sewer pump stations', 'Trade installation: whole project', 'C-4.01', 'Install three below ground temporary sewer pump stations.'),
    row('Install temporary sanitary plumbing and drainage', 'Trade installation: whole project', 'C-4.02', 'Install temporary sanitary plumbing and drainage.'),
    row('Install thirty additional sewer manholes', 'In-ground civil', 'C-2.01', 'Install thirty additional sewer manholes.', 'Whether the builder will instruct the extra sewer manholes'),
    row('Lay underground sewer pipework in trenches', 'In-ground civil', 'C-2.02', 'Lay underground sewer pipework in trenches.'),
    row('Install cast-in sleeves into formwork', 'Trade installation: cast-in items', 'C-1.09', 'Install cast-in sleeves into formwork.'),
    { activity: 'Hydraulic test and commissioning of the water and drainage services', type: 'Duty', package: 'Testing and commissioning', crew: 'Plumbers', clause: '5.1', quotes: ['Hydraulic test and commissioning.'], where: '', plant: '', conditions: '', unknowns: '', matrixColumn: '' },
    { activity: 'Prepare as-built drawings', type: 'Duty', package: 'Design and documentation', crew: 'Plumbers', clause: '5.2', quotes: ['As-built drawings.'], where: '', plant: '', conditions: '', unknowns: '', matrixColumn: '' },
  ],
  byOthers: [],
  conflicts: [],
};
const GROUPS = { 'Risers and pipework at height: whole project': ['riserPipework', 'ewp'], 'Trade installation: buildings': ['roughIn', 'fitOff'], 'Trade installation: whole project': ['roughIn'], 'In-ground civil': ['trench'], 'Trade installation: cast-in items': ['castIn'] };
const SCOPE = ['Subcontract scope of works: Hydraulic services', ...READING.activities.map((one, i) => `1.${i + 1} ${one.quotes[0]}`),
  ...Array(4).fill('The Subcontractor shall carry out the works in accordance with the drawings and specifications, keep the work area tidy, and coordinate its work with other trades on the site at all times.')].join('\n');
const standIn = { beta: { messages: { stream(params) {
  const mapping = Boolean(params.output_config.format.schema.properties.packages);
  const content = params.messages[0].content;
  const body = mapping ? { packages: [...content.matchAll(/^Work package: (.*)$/gm)].map((m) => ({ package: m[1], groups: GROUPS[m[1]] || [], unmatched: [], byOthers: [] })) } : READING;
  return { finalMessage: async () => ({ stop_reason: 'end_turn', model: 'claude-opus-5-5', usage: { input_tokens: 1000, output_tokens: 500 }, content: [{ type: 'text', text: JSON.stringify(body) }] }) };
} } } };

let server;
let urlBase;
test.before(async () => {
  await setupAccounts();
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
  aiScope.useClient(standIn);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  urlBase = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => {
  aiScope.useClient(null);
  delete process.env.ANTHROPIC_API_KEY;
  server.close();
});
async function call(method, route, { body, reviewer } = {}) {
  const response = await fetch(`${urlBase}${route}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(reviewer ? { 'X-Reviewer-Token': reviewer } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}
async function readScope(prefix) {
  const email = `lead@${prefix}.example`;
  assert.equal((await call('POST', '/api/hse/email', { body: { email } })).status, 200);
  const token = /\/sitelink\?login=([A-Za-z0-9_-]+)/.exec([...mailbox].reverse().find((item) => item.to === email).text)[1];
  const lead = (await call('POST', '/api/hse/verify', { body: { token } })).data.token;
  await call('PUT', '/api/hse/me', { reviewer: lead, body: { name: 'Marnie Tolhurst', position: 'HSE lead', phone: '0412 555 012' } });
  const org = (await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Quokka Ridge Constructions Pty Ltd', abn: nextAbn() } })).data.org;
  await db.query("UPDATE orgs SET abn_check = 'verified', abn_verified_at = $1 WHERE id = $2", [new Date(), org.id]);
  const projectId = (await call('POST', `/api/hse/orgs/${org.id}/projects`, { reviewer: lead, body: { name: 'Kurrajong Flat Community Pavilion', workplace: '25 Grenfell St, Kent Town SA 5067', state: 'sa' } })).data.project.id;
  const subId = (await call('POST', `/api/hse/projects/${projectId}/subcontracts`, { reviewer: lead, body: { name: 'Galah & Gecko Plumbing Pty Ltd', trade: 'Hydraulic', email: `office@${prefix}-sub.example` } })).data.subcontract.id;
  const sent = await call('POST', `/api/hse/subcontracts/${subId}/scope`, { reviewer: lead, body: { file: { name: 'Hydraulic scope.txt', data: Buffer.from(SCOPE).toString('base64') } } });
  assert.ok([200, 202].includes(sent.status), JSON.stringify(sent.data));
  for (let i = 0; i < 300; i += 1) {
    const page = await call('GET', `/api/hse/subcontracts/${subId}`, { reviewer: lead });
    if (page.data.reading.status !== 'reading') return { lead, projectId, subId, page: page.data };
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
  throw new Error('the reading did not finish');
}

test('every SWMS on the list, removed or not, has a work title; none ends ": whole project"; no two read the same (blocker 6)', async () => {
  const s = await readScope('r11titles');
  const titles = s.page.items.map((item) => `${item.group}: ${item.title}`);
  assert.ok(titles.includes('list: Risers and pipework at height'), titles.join(' | '));
  assert.ok(!titles.some((title) => /: whole project$|Trade installation:/.test(title)), titles.join(' | '));
  // The plain trade title beside the same title with an area: the smaller one takes its own work's words.
  const shown = s.page.items.map((item) => item.title.toLowerCase());
  for (const title of shown) assert.ok(!shown.some((other) => other !== title && other.startsWith(`${title}, `)), titles.join(' | '));
  assert.equal(new Set(shown).size, shown.length, titles.join(' | '));
  // What the subcontractor is sent says the same.
  assert.ok(!s.page.preview.swms.some((item) => /: whole project$|Trade installation:/.test(item.title)), JSON.stringify(s.page.preview.swms.map((item) => item.title)));
  // Work taken out of a SWMS by "Change the work" keeps a work title under Removed.
  const main = s.page.items.find((item) => item.group === 'list' && item.alsoCovers && item.alsoCovers.length);
  if (main) {
    const next = (await call('PUT', `/api/hse/subcontracts/${s.subId}/items/${main.id}`, { reviewer: s.lead, body: { task: 'Install sanitary plumbing in the buildings only.' } })).data;
    assert.ok(!next.items.some((item) => /^Trade installation:/.test(item.title)), next.items.map((item) => `${item.group}: ${item.title}`).join(' | '));
    const rows = await db.query("SELECT title FROM required_swms WHERE subcontract_id = $1 AND removed_why = 'unfolded'", [s.subId]);
    assert.ok(rows.every((one) => !/^Trade installation:/.test(one.title)), JSON.stringify(rows));
  }
  // The testing duty is said apart from the duties that need no SWMS.
  assert.deepEqual(s.page.reading.testing, ['Hydraulic test and commissioning of the water and drainage services']);
  assert.ok(!s.page.reading.duties.includes('Hydraulic test and commissioning of the water and drainage services'));
});

test('the manholes answer settles only the note on the manholes, not the storage tanks (blocker 2, on the lead\'s preview)', async () => {
  const s = await readScope('r11notes');
  const point = s.page.points.find((one) => /manholes/.test(one.question));
  assert.ok(point, JSON.stringify(s.page.points));
  const page = (await call('PUT', `/api/hse/subcontracts/${s.subId}/points/${point.id}`, { reviewer: s.lead, body: { answer: 'not instructed. leave the extra manholes out of the swms for now' } })).data;
  const notes = page.preview.swms.flatMap((item) => (item.notes || []).map((note) => ({ swms: item.title, ...note })));
  const tanks = notes.find((note) => /storage tanks/.test(note.text));
  assert.ok(tanks, JSON.stringify(notes));
  assert.equal(tanks.text, 'Construct the storage tanks: whether they will be instructed is open.');
  assert.equal(tanks.settled, undefined, JSON.stringify(tanks));
});

test('the lead\'s table counts work "in another SWMS" only while that SWMS is on the list', async () => {
  const s = await readScope('r11fold');
  const project = async () => (await call('GET', `/api/hse/projects/${s.projectId}`, { reviewer: s.lead })).data;
  const before = (await project()).subcontracts[0];
  const host = s.page.items.find((item) => item.group === 'list' && item.alsoCovers && item.alsoCovers.length);
  assert.ok(host && before.folded >= 1, JSON.stringify(before));
  await call('PUT', `/api/hse/subcontracts/${s.subId}/items/${host.id}`, { reviewer: s.lead, body: { removed: true } });
  const after = (await project()).subcontracts[0];
  assert.equal(after.folded, 0, JSON.stringify(after));
  assert.equal(after.removed, before.removed + 1 + before.folded, JSON.stringify(after));
});
