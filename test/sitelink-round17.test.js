// SiteLink fixes from messy round 17 (23 October 2026, staging 4741220). Made-up companies, people and sites only.
// No paid AI reading: the stand-in client answers with a made-up mechanical services reading in the round 17 shapes.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.RATE_LIMIT_HSE_REQUESTS = '5000';
process.env.RATE_LIMIT_AI_SCOPE_REQUESTS = '1000';
process.env.RATE_LIMIT_MAX_REQUESTS = '5000';
process.env.RATE_LIMIT_LIST_REQUESTS = '5000';
process.env.RATE_LIMIT_LIST_SENDS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('../server');
const db = require('../db');
const send = require('../sitelink-send');
const handover = require('../handover');
const answers = require('../sitelink-answers');
const aiScope = require('../ai-scope');
const abnRegister = require('../abn');
const { validAbn } = require('../accounts');
const { prepareDraft } = require('../draft');
const { draftBody } = require('../input');
const { checkSwms, fromDraft } = require('../builder-check');
const gateRules = require('../public/gate-rules');
const scopeTask = require('../public/scope-task');
const substanceRules = require('../public/substance-rules');
const signRead = require('../sign-read');
const { setupAccounts, mailbox, lastLinkToken, ANSWERED, ready } = require('./helpers');
const CASES = require('./sitelink-settle.data');

abnRegister.lookupAbn = async () => ({ enabled: false });
let abnSeed = 64089966000;
function nextAbn() {
  for (abnSeed += 89; ; abnSeed += 1) if (validAbn(String(abnSeed))) return String(abnSeed);
}
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// A made-up mechanical services reading, with the round 17 point, note and title shapes.
const row = (activity, pack, clause, unknowns = '', extra = {}) => ({ activity, type: 'Site work', package: pack, crew: 'Mechanical fitters', clause, quotes: [`${activity}.`], where: '', plant: '', conditions: '', unknowns, matrixColumn: '', ...extra });
const READING = {
  activities: [
    row('Connect new mechanical services to the Combined Services Trench (CST) pipework', 'In-ground civil', 'C-2.04', 'Pits 3, 4 and 5 will be temporarily finished 800mm below ground. When and by whom they will be completed is not stated'),
    row('Vacuum excavation', 'In-ground civil', 'C-2.05', 'Vacuum excavation applies where the builder\'s permits require it'),
    row('Install access platforms and maintenance walkways for chilled water and cooling tower plant', 'Plant delivery and lifting', '4.4(c)', 'C-1.72 gives service walkways and steps to the Subcontractor\'s plant (excluding cooling towers) to the builder. Who provides the chilled water plant platforms must be confirmed'),
    row('Install the central chilled water plant: chillers, cooling towers, pumps and water treatment', 'Plant delivery and lifting', '4.4(a)', 'Columns under the cooling towers are by the builder (C-1.81)'),
    row('Flush CST and underground chilled water pipework using the flushing rigs', 'Testing and commissioning', '3(b)', 'Who energises the chiller building substation, and when, is not stated'),
    row('Start up, test and commission all mechanical systems', 'Testing and commissioning', '5.1.2', 'Water, gas and electricity for commissioning are provided by the builder (C-1.85)'),
    row('Install ductwork, including access panels', 'Ductwork and mechanical units', '4.3(a)', 'Building pre-positioned fittings into the structure is by the builder (C-1.50). Precast conduits are by Electrical'),
    row('Install the gas purge fan in the Gatehouse SER', 'Ductwork and mechanical units', '4.3(g)'),
    row('Clean inside AHUs and replace filters', 'Protection and cleaning', '3(o)'),
    row('Attend concrete pours on site and at the precast yard', 'Site management and coordination', '3 Precast Elements (a)', 'Who supplies the cast-in items at the precast yard is unclear', { type: 'Duty' }),
    row('Remove the temporary power supply in the existing facility', 'Demolition and removal', 'C-1.103', 'The power supply removal in this clause conflicts with the Electrical associated work, so it is not listed as this Subcontractor\'s activity'),
    row('Pressure test the plenums', 'Testing and commissioning', '5.2(j)', 'The Principal decides whether the fault-free period is acceptable, and the period may restart'),
  ],
  byOthers: [],
  conflicts: [],
};
const SCOPE = ['Subcontract scope of works: Mechanical services. The Gatehouse SER room is pressure tested. The CST pits are in the Combined Services Trench.', ...READING.activities.map((one, i) => `1.${i + 1} ${one.quotes[0]}`),
  ...Array(4).fill('The Subcontractor shall carry out the works in accordance with the drawings and specifications, keep the work area tidy, and coordinate its work with other trades on the site at all times.')].join('\n');
const standIn = { beta: { messages: { stream(params) {
  const mapping = Boolean(params.output_config.format.schema.properties.packages);
  const content = params.messages[0].content;
  const body = mapping ? { packages: [...content.matchAll(/^Work package: (.*)$/gm)].map((m) => ({ package: m[1], groups: [], unmatched: [], byOthers: [] })) } : READING;
  return { finalMessage: async () => ({ stop_reason: 'end_turn', model: 'claude-opus-5-5', usage: { input_tokens: 1000, output_tokens: 500 }, content: [{ type: 'text', text: JSON.stringify(body) }] }) };
} } } };

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
  return { status: response.status, data: type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
}
function inDays(days) {
  const day = new Date(`${send.todayIn('vic')}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}
async function leadSignIn(email) {
  assert.equal((await call('POST', '/api/hse/email', { body: { email } })).status, 200);
  const text = [...mailbox].reverse().find((item) => item.to === email).text;
  const token = /\/sitelink\?login=([A-Za-z0-9_-]+)/.exec(text)[1];
  const { data } = await call('POST', '/api/hse/verify', { body: { token } });
  assert.equal((await call('PUT', '/api/hse/me', { reviewer: data.token, body: { name: 'Imogen Kasprzak', position: 'HSE lead', phone: '0412 555 019' } })).status, 200);
  return data.token;
}
const WORKPLACE = '214 Sturt St, Ballarat Central VIC 3350';
// Typed as the round 17 lead typed them: lower case names, "n" and "b4".
const DETAILS = {
  musterPoint: 'Car park north east corner near the Sturt St gate',
  firstAider: 'Anneliese Drummond, 0417 662 093',
  firstAidLocation: 'Site office ground floor n first aid room',
  hospital: 'Bellbird Gully Medical Centre, 12 Mair St Ballarat',
  siteManager: 'callum fitzwilliam, 0409 118 734',
  scaffoldSupervisor: 'Tevita Mahe, 0421 553 870',
  siteRules: ['Sign in at the site office b4 starting', 'Hot work permit from callum b4 any hot work'],
};
async function readScope(prefix) {
  const lead = await leadSignIn(`lead@${prefix}.example`);
  const org = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Pardalote Ridge Constructions Pty Ltd', abn: nextAbn() } });
  await db.query("UPDATE orgs SET abn_check = 'verified', abn_verified_at = $1 WHERE id = $2", [new Date(), org.data.org.id]);
  const project = await call('POST', `/api/hse/orgs/${org.data.org.id}/projects`, { reviewer: lead, body: { name: 'Bellbird Gully Community Library', workplace: WORKPLACE, state: 'vic' } });
  const projectId = project.data.project.id;
  const details = await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 0, details: DETAILS } });
  assert.equal(details.status, 200, JSON.stringify(details.data));
  const email = `office@${prefix}-sub.example`;
  const added = await call('POST', `/api/hse/projects/${projectId}/subcontracts`, { reviewer: lead, body: { name: 'Currawong Air Mechanical', trade: 'Mechanical - HVAC and ductwork', email } });
  assert.equal(added.status, 201, JSON.stringify(added.data));
  const subId = added.data.subcontract.id;
  const sent = await call('POST', `/api/hse/subcontracts/${subId}/scope`, { reviewer: lead, body: { file: { name: 'Mechanical services scope.txt', data: Buffer.from(SCOPE).toString('base64') } } });
  assert.ok([200, 202].includes(sent.status), JSON.stringify(sent.data));
  for (let i = 0; i < 300; i += 1) {
    const page = await call('GET', `/api/hse/subcontracts/${subId}`, { reviewer: lead });
    if (page.data.reading.status !== 'reading') return { lead, projectId, subId, page: page.data, email, details: details.data };
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
  throw new Error('the reading did not finish');
}
async function subbie(email, name) {
  assert.equal((await call('POST', '/api/auth/email', { body: { email } })).status, 200);
  const { data } = await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } });
  assert.equal((await call('PUT', '/api/company', { session: data.token, body: { name, abn: nextAbn(), address: '9 Lydiard St North, Ballarat Central VIC 3350', phone: '03 5331 0100', email } })).status, 200);
  return data.token;
}
const itemWith = (page, words) => page.items.find((one) => String(one.task || '').includes(words));
// The SWMS the reading set aside for having no high risk work, moved to the list as the round 17 lead did.
async function allOnList(s) {
  for (const one of s.page.items.filter((item) => item.removed)) {
    const moved = await call('PUT', `/api/hse/subcontracts/${s.subId}/items/${one.id}`, { reviewer: s.lead, body: { removed: false } });
    assert.equal(moved.status, 200, JSON.stringify(moved.data));
  }
}
const pointWith = (page, words) => page.points.find((one) => one.question.includes(words));

// ---- Blocker 1: an answer settles only notes about the same thing in the same SWMS's work ----

test('the round 15, 16 and 17 answers settle only the notes on their own subject, in their own SWMS (blocker 1)', () => {
  for (const [round, { answers: given, swms }] of Object.entries(CASES)) {
    for (const one of swms) {
      const notes = handover.withSettled({ draftNotes: handover.notesOf(one.notes) }, given, { activities: one.work }).draftNotes;
      const expected = one.settled || {};
      for (const note of notes) {
        const by = expected[note.text];
        if (by === undefined) assert.equal(note.settled, undefined, `${round}, ${one.title}: "${note.text}" was settled by "${note.settled}"`);
        else assert.equal(note.settled, given[by].answer, `${round}, ${one.title}: "${note.text}"`);
      }
      for (const text of Object.keys(expected)) assert.ok(notes.some((note) => note.text === text), `${round}: no note "${text}"`);
    }
  }
  // The round 17 cases one by one: the substation answer is on Testing's work, not Ductwork's; the platforms answer is not
  // about the columns under the cooling towers beside it, nor about the water and power for commissioning.
  const r17 = CASES.r17;
  const ductwork = r17.swms.find((one) => one.title === 'Ductwork and mechanical units');
  assert.equal(handover.withSettled({ draftNotes: handover.notesOf(ductwork.notes) }, r17.answers, { activities: ductwork.work }).draftNotes.filter((note) => note.settled).length, 0);
  const plant = r17.swms.find((one) => one.title === 'Plant delivery and lifting');
  assert.equal(handover.withSettled({ draftNotes: handover.notesOf(plant.notes) }, r17.answers, { activities: plant.work }).draftNotes.filter((note) => note.settled).length, 0);
  // Without the SWMS's work (an older caller), the subject rule alone still keeps the columns note open.
  const columns = handover.withSettled({ draftNotes: handover.notesOf(['Columns under the cooling towers are by the builder (C-1.81).']) }, r17.answers).draftNotes;
  assert.equal(columns[0].settled, undefined);
  // "Provided" says nothing about what a note is about.
  const water = handover.withSettled({ draftNotes: handover.notesOf(['Water, gas and electricity for commissioning are provided by the builder (C-1.85).']) }, r17.answers).draftNotes;
  assert.equal(water[0].settled, undefined);
});

test('through SiteLink: the lead\'s preview and the subcontractor\'s list settle no note on another subject (blocker 1)', async () => {
  const s = await readScope('r17settle');
  await allOnList(s);
  const platforms = pointWith(s.page, 'chilled water plant platforms');
  const substation = pointWith(s.page, 'chiller building substation');
  assert.ok(platforms && substation, JSON.stringify(s.page.points.map((one) => one.question)));
  await call('PUT', `/api/hse/subcontracts/${s.subId}/points/${platforms.id}`, { reviewer: s.lead, body: { answer: 'Currawong provides the chilled water plant platforms n walkways. The builder does the ones for the cooling towers' } });
  const saved = await call('PUT', `/api/hse/subcontracts/${s.subId}/points/${substation.id}`, { reviewer: s.lead, body: { answer: 'Electrical energises the chiller building substation. You flush only after callum fitzwilliam confirms it in writing' } });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const settled = saved.data.preview.swms.flatMap((one) => (one.notes || []).filter((note) => note.settled).map((note) => `${one.title}: ${note.text}`));
  assert.deepEqual(settled, [], 'no note is on the subject of either answer');
  const notes = saved.data.preview.swms.flatMap((one) => (one.notes || []).map((note) => note.text));
  assert.ok(notes.includes('Columns under the cooling towers are by the builder (C-1.81).'), JSON.stringify(notes));
  // The subcontractor's list is the same.
  const due = inDays(14);
  const preview = await call('POST', `/api/hse/subcontracts/${s.subId}/send/preview`, { reviewer: s.lead, body: { due } });
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  assert.equal((await call('POST', `/api/hse/subcontracts/${s.subId}/send`, { reviewer: s.lead, body: { due, check: preview.data.preview.check } })).status, 200);
  const token = /\/list\.html\?t=([A-Za-z0-9_-]+)/.exec(mailbox.filter((item) => item.to === s.email).pop().text)[1];
  const office = await subbie('admin@r17settle-sub.example', 'Currawong Air Mechanical');
  assert.equal((await call('POST', `/api/list/${token}/claim`, { session: office })).status, 200);
  const { list } = (await call('GET', `/api/from-builders/${s.subId}`, { session: office })).data;
  assert.deepEqual(list.items.flatMap((one) => (one.draftNotes || []).filter((note) => note.settled).map((note) => note.text)), []);
  // The answers read as the lead meant them (wording 3).
  assert.ok(list.answers.some((one) => one.answer === 'Electrical energises the chiller building substation. You flush only after Callum Fitzwilliam confirms it in writing.'), JSON.stringify(list.answers));
  assert.ok(list.answers.some((one) => one.answer === 'Currawong provides the chilled water plant platforms and walkways. The builder does the ones for the cooling towers.'), JSON.stringify(list.answers));
});

// ---- Wording 1 and 7: a split sentence, statements and duties that need no SWMS are not points ----

test('a sentence with a list of numbers stays one point; statements and attendance duties are not asked (wordings 1 and 7)', async () => {
  assert.deepEqual(handover.splitPoint('Pits 3, 4 and 5 will be temporarily finished 800mm below ground. When and by whom they will be completed is not stated'),
    { asks: ['Pits 3, 4 and 5 will be temporarily finished 800mm below ground. When and by whom they will be completed is not stated'], notes: [] });
  assert.deepEqual(handover.splitPoint('The Principal decides whether the fault-free period is acceptable, and the period may restart').asks, []);
  assert.deepEqual(handover.splitPoint('The power supply removal in this clause conflicts with the Electrical associated work, so it is not listed as this Subcontractor\'s activity').asks, []);
  // Real questions are still asked.
  assert.deepEqual(handover.splitPoint('Whether the builder provides the scaffold').asks, ['Whether the builder provides the scaffold']);
  assert.deepEqual(handover.splitPoint('Who supplies the pit lids is not stated').asks, ['Who supplies the pit lids is not stated']);
  const s = await readScope('r17points');
  const questions = s.page.points.map((one) => one.question);
  assert.ok(questions.includes('Pits 3, 4 and 5 will be temporarily finished 800mm below ground. When and by whom they will be completed is not stated.'), JSON.stringify(questions));
  assert.ok(!questions.some((one) => /^4 and 5\b|fault-free|not listed as this|cast-in items at the precast yard/.test(one)), JSON.stringify(questions));
  const notes = JSON.stringify(s.page.items.map((one) => one.item && one.item.draftNotes));
  assert.doesNotMatch(notes, /Pits 3\.|so it is not listed as/);
  // A "Pits 3." note left on a list read before is settled by the answer that names the pits.
  const old = handover.withSettled({ draftNotes: handover.notesOf(['Pits 3.', 'Working height.']) }, CASES.r17.answers, { activities: ['Connect new mechanical services to the Combined Services Trench (CST) pipework'] }).draftNotes;
  assert.equal(old[0].settled, CASES.r17.answers[0].answer);
  assert.equal(old[1].settled, undefined);
});

// ---- Wording 2 and 4: short names keep their brackets; the scope's own place names keep their capitals ----

test('a short name in brackets stays in brackets, and "gatehouse" takes the scope\'s capital (wordings 2 and 4)', async () => {
  assert.equal(scopeTask.plainTask([{ activity: 'Connect new mechanical services to the Combined Services Trench (CST) pipework' }, { activity: 'Install mechanical services switchboards (MSSBs)' }, { activity: 'Prepare the Service Impact on Operation (SIO) and connect to the existing facility network' }]),
    'Connect new mechanical services to the Combined Services Trench (CST) pipework. Install mechanical services switchboards (MSSBs). Prepare the Service Impact on Operation (SIO) and connect to the existing facility network.');
  // Brackets of places, plant and lists read as before.
  assert.equal(scopeTask.plainTask([{ activity: 'Install pumps (level 2 plant room)' }, { activity: 'Install cast in items (plates, ferrules, conduits)' }]), 'Install pumps. Install cast in items: plates, ferrules, conduits.');
  const s = await readScope('r17title');
  const inGround = itemWith(s.page, 'Combined Services Trench');
  assert.match(inGround.task, /Combined Services Trench \(CST\) pipework/);
  const fan = itemWith(s.page, 'gas purge fan');
  const renamed = await call('PUT', `/api/hse/subcontracts/${s.subId}/items/${fan.id}`, { reviewer: s.lead, body: { title: 'ductwork n gas purge fan - gatehouse ser' } });
  assert.equal(renamed.status, 200, JSON.stringify(renamed.data));
  assert.ok(renamed.data.items.some((one) => one.title === 'Ductwork and gas purge fan - Gatehouse SER'), JSON.stringify(renamed.data.items.map((one) => one.title)));
  // A word of a title-case name ("Combined Services Trench") is not taken alone, nor are the contract's parties.
  assert.equal(answers.tidyTitle('services trench works for the subcontractor', SCOPE), 'Services trench works for the subcontractor');
});

// ---- Wording 3: the lead's typed words as they print ----

test('the lead\'s point answers, work text, added SWMS and site details read "and", "before", short names and people\'s capitals (wording 3)', async () => {
  const s = await readScope('r17typed');
  await allOnList(s);
  // Site details: the site manager's first name in a rule, and "n" in the first aid location.
  const details = JSON.stringify(s.details);
  assert.match(details, /Hot work permit from Callum before any hot work/);
  assert.match(details, /Site office ground floor and first aid room/);
  assert.match(details, /Callum Fitzwilliam/);
  // A point answer.
  const pits = pointWith(s.page, 'Pits 3, 4 and 5');
  const saved = await call('PUT', `/api/hse/subcontracts/${s.subId}/points/${pits.id}`, { reviewer: s.lead, body: { answer: 'currawong finishes pits 3, 4 and 5 once the haul road n crane pads are gone. callum fitzwilliam will give you the date b4 then' } });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.preview.answers[0].answer, 'Currawong finishes pits 3, 4 and 5 once the haul road and crane pads are gone. Callum Fitzwilliam will give you the date before then.');
  // The lead's changed work text.
  const cleaning = itemWith(s.page, 'Clean inside AHUs');
  const changed = await call('PUT', `/api/hse/subcontracts/${s.subId}/items/${cleaning.id}`, { reviewer: s.lead, body: { task: 'Clean inside AHUs n replace filters b4 practical completion, with the AHU isolated n locked out' } });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  assert.ok(changed.data.items.some((one) => one.task === 'Clean inside AHUs and replace filters before practical completion, with the AHU isolated and locked out.'), JSON.stringify(changed.data.items.map((one) => one.task)));
  // The lead's added SWMS.
  const added = await call('POST', `/api/hse/subcontracts/${s.subId}/items`, { reviewer: s.lead, body: { title: 'hot work - brazing vrf pipe', task: 'Braze copper refrigerant pipe n fittings for the vrf units in the plant rooms. Hot work permit from callum b4 starting' } });
  assert.ok([200, 201].includes(added.status), JSON.stringify(added.data));
  const hot = added.data.items.find((one) => /brazing/i.test(one.title));
  assert.equal(hot.title, 'Hot work - brazing VRF pipe');
  assert.equal(hot.task, 'Braze copper refrigerant pipe and fittings for the VRF units in the plant rooms. Hot work permit from Callum before starting.');
});

// ---- Wording 5 and 6: Prepared by ----

test('the Prepared by example takes no place word into the name (wording 5); a role keeps its first capital, as before (wording 6, a decision)', () => {
  assert.equal(gateRules.fieldWeak('person', 'bethany ngata front office'), '"bethany ngata front office" ends in "front office", which is a place, not a role. Give their name and role, for example "Bethany Ngata, office manager".');
  assert.match(gateRules.fieldWeak('person', 'priya dalgarno office'), /for example "Priya Dalgarno, office manager"/);
  assert.match(gateRules.fieldWeak('person', 'sam lee site office'), /ends in "site office".*for example "Sam Lee, office manager"/);
  // Wording 6 is left for the owner: rounds 10 to 16 print a role after a name with its first capital, as "Checked by"
  // does ("Rafferty Okonkwo, Foreman").
  assert.equal(answers.tidyPersonRole('bethany ngata, office admin'), 'Bethany Ngata, Office admin');
  const draft = prepareDraft(draftBody(ready({ ...ANSWERED, state: 'vic', task: 'Install power outlets and light switches in the offices.', fallRisk: 'no', residential: 'no', preparedBy: 'bethany ngata, office admin' })));
  assert.equal(draft.preparedBy, 'Bethany Ngata, Office admin');
});

// ---- Wording 8: the steel erection answer stays with steel erection ----

test('"Connections are made from boom lifts ... No one climbs the steel." fills only a SWMS that erects steel (wording 8)', () => {
  const boom = 'Connections are made from boom lifts with guardrails, with harnesses attached to the boom lift anchor points. No one climbs the steel.';
  assert.equal(gateRules.workFits(boom, 'Ductwork and mechanical units\nInstall ductwork, including access panels. Install secondary framework, supports and steelwork for plant and pipework.\nBoom lift', 'fallControl'), false);
  assert.equal(gateRules.workFits(boom, 'Structural steel\nErect structural steel columns and beams.\nBoom lift', 'fallControl'), true);
  // Other boom lift answers still fill ductwork.
  assert.equal(gateRules.workFits('Work above 2 m is done from an EWP or a mobile scaffold with guardrails.', 'Install ductwork from a boom lift.', 'fallControl'), true);
  assert.match(read('public/project-go.js'), /rules\.workFits\(value, workWordsOf\(other\), questionId\)/);
});

// ---- Wording 9: Builder check cites Victoria's own regulations ----

test('Builder check on a Victorian SWMS cites the Victorian regulations, never the model WHS Regulations (wording 9)', () => {
  const input = ready({ ...ANSWERED, state: 'vic', workplace: WORKPLACE, task: 'Install ductwork and fans from a scissor lift in the plant room.', fallRisk: 'yes', residential: 'no', facts: { fallControl: 'Scissor lifts with guardrails are used for all work above 2 m, and platform ladders only for work below 2 m.' } });
  const result = checkSwms(fromDraft(prepareDraft(draftBody(input))), { state: 'vic' });
  const sources = result.findings.map((item) => `${item.rule}: ${item.source}`);
  assert.ok(result.findings.length > 10, JSON.stringify(sources));
  assert.ok(sources.every((one) => !/WHS Regulations/.test(one)), sources.filter((one) => /WHS Regulations/.test(one)).join('\n'));
  const of = (rule) => result.findings.find((item) => item.rule === rule);
  assert.match(of('W10').source, /^Occupational Health and Safety Regulations 2017 \(Vic\) r 44 \(hierarchy of control for falls\)/);
  assert.match(of('W13').source, /Occupational Health and Safety Regulations 2017 \(Vic\) r 44 to r 49 \(falls\), r 331 \(excavation\), r 63 \(confined spaces\) and Part 4\.4 \(asbestos\)/);
  // Another state is as before.
  const nsw = checkSwms(fromDraft(prepareDraft(draftBody({ ...input, state: 'nsw' }))), { state: 'nsw' });
  assert.match(nsw.findings.find((item) => item.rule === 'W10').source, /WHS Regulations s 36/);
});

// ---- Blocker 3: a shared crane answer reaches only SWMS whose work lifts ----

test('a crane named in a site answer given once for every SWMS reaches only SWMS whose work lifts (blocker 3)', () => {
  const access = 'Thru the Sturt St gate. Scissor lifts and a boom lift for the high ductwork, plant by crane to the roof';
  const draftOf = (task, siteShared = true, given = access) => prepareDraft(draftBody(ready({ ...ANSWERED, state: 'vic', task, crane: 'company', slinging: 'crane', fallRisk: 'no', residential: 'no', site: { ...ANSWERED.site, access: given }, siteShared, facts: { hotWorkPermit: 'The builder issues the hot work permit; a fire watch stays 30 minutes after; a 4.5 kg extinguisher at the work.' } })));
  const craneLines = (draft) => JSON.stringify(draft).match(/The crane company plans and does the lifts[^"]*|Mobile crane or crane truck/g) || [];
  const hot = draftOf('Braze copper refrigerant pipe and fittings for the VRF units in the plant rooms. Hot work permit from Callum before starting.');
  assert.equal(hot.kind, 'draft', JSON.stringify(hot.missing));
  assert.deepEqual(craneLines(hot), [], 'no crane in the brazing SWMS');
  // The answer still prints as given.
  assert.match(JSON.stringify(hot.site), /plant by crane to the roof/);
  // Work on the roof, and work that lifts, keep it.
  assert.ok(craneLines(draftOf('Install roof cowls and exhaust flues. Make roof penetrations, waterproof them and install over flashing.')).length > 0);
  // The SWMS's own answer (not shared) still counts as before.
  const own = draftOf('Braze copper refrigerant pipe and fittings for the VRF units in the plant rooms. Hot work permit from Callum before starting.', false, 'Thru the Sturt St gate, plant by crane to the plant rooms');
  assert.equal(own.kind, 'draft', JSON.stringify(own.missing));
  assert.ok(craneLines(own).length > 0);
});

// ---- Smaller faults ----

test('products named in the safety data sheet answer are each its own product, "n" and two of a type too (smaller 1)', () => {
  assert.deepEqual(substanceRules.sdsProducts('pipe thread sealant, duct sealant mastic, contact adhesive for the insulation n cold galv zinc spray. kept in the site container, gloves on'), [
    { type: 'Sealants, mastics and silicone', product: 'pipe thread sealant' },
    { type: 'Sealants, mastics and silicone', product: 'duct sealant mastic' },
    { type: 'Adhesives', product: 'contact adhesive for the insulation' },
    { type: 'Paints and coatings', product: 'cold galv zinc spray' },
  ]);
  // The project page gives each its own row, with an id the server keeps (sl15: each its own "sub-" id).
  assert.match(read('public/project-go.js'), /taken\.add\(`sub-\$\{next\}`\)/);
});

test('a wrong check answer naming the grinder and what it sets alight is not offered beside the grinder control (smaller 2)', () => {
  const draft = {
    task: 'Install roof cowls and exhaust flues.',
    jobSteps: [
      { step: 'Cut and fit the roof sheets', hazards: ['Cuts from sheet edges.', 'Burns and fire from grinder sparks.'], controls: ['Where a grinder is used on sheets, swarf is cleaned off the roof and nearby combustibles are protected.', 'Cut-resistant gloves are worn when handling sheet edges.'] },
      { step: 'Install the roof cowls', hazards: ['A fall from the roof edge.'], controls: ['Roof edge guardrail is installed before work starts.', 'Cowls are lifted to the roof in a materials hoist.'] },
    ],
    ppe: [],
  };
  const pool = signRead.questionPool('r17-decoys', draft);
  const decoys = pool.steps.flatMap((item) => item.decoys);
  assert.ok(decoys.length > 0);
  assert.ok(!decoys.some((text) => /grind/i.test(text) && /(?:combustible|flammable|fuel|ignit)/i.test(text)), decoys.filter((text) => /grind/i.test(text)).join('\n'));
});

test('after "Not done after all" is refused (409), the conditions show as they now are; nothing to submit shows no button (smaller 3 and 4)', () => {
  const page = read('public/project-go.js');
  assert.match(page, /if \(error\.status === 409\) \{\s*const fresh = await S\.call\('GET', `\/api\/from-builders\/\$\{encodeURIComponent\(b\.id\)\}`\)/);
  assert.match(page, /if \(fresh && fresh\.sent\) \{ b\.sent = fresh\.sent; save\(\); hooks\.render\(\); \}/);
  assert.doesNotMatch(page, /id="go-submit-all"\$\{can\.length \? '' : ' disabled'\}/);
  assert.match(page, /\$\{can\.length \? `<div class="actions"><button type="button" id="go-submit-all">\$\{label\}<\/button><\/div>` : ''\}/);
});

// ---- Blocker 2: the lead chooses the response; Builder check only marks the one that matches ----

test('Builder check marks the matching response but chooses none, and Send says what it will send (blocker 2)', () => {
  const page = read('public/review.js');
  const html = read('public/review.html');
  // The check no longer ticks a response.
  assert.doesNotMatch(page, /pick\.checked = true/);
  assert.match(page, /suggest\(PICK\[data\.band\] \|\| 'changes'\)/);
  assert.match(page, /<span class="suggests">Builder check suggests this<\/span>/);
  // Send names the response and who gets it; with none chosen it is refused at the choices.
  assert.match(page, /\$\('send'\)\.textContent = `Send "\$\{LABELS\[value\]\}"`/);
  assert.match(page, /This sends "\$\{LABELS\[value\]\}" to \$\{to\}\$\{outside \? '' : ' and emails them that their review is back'\}\./);
  assert.match(page, /if \(!response\) return \['response', 'Choose a response: Approved, Approved with conditions or Not approved\.'\];/);
  assert.match(html, /<p id="send-says" aria-live="polite">Choose a response above\. Nothing is sent until you do\.<\/p>/);
  assert.match(html, /The check marks the matching response below\. You choose the response; nothing is sent until you do\./);
});
