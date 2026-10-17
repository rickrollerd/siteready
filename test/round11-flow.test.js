// Messy test round 11 (17 October 2026), flow faults: one reference and revision for one printed file,
// emergency answers filled across only where they fit, another SWMS's own fall answer kept, the fall
// rescue asked beside an EWP, "Other fall controls considered" only for a procedure or a harness, no false
// harness finding, the falls check naming every High fall step, the person rule in every name box (the
// checker's too), scope headings in general, weak answers and over-strict refusals, capitals, own steps
// that name the work, one SWMS saved once, the review notice in view, and a 502 retried quietly. The
// on-screen faults are also run in a browser (scratchpad/flow11).
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const JSZip = require('jszip');
const { app } = require('../server');
const db = require('../db');
const { prepareDraft, taskLine, stepCoveringPart, answerState } = require('../draft');
const { draftBody } = require('../input');
const { downloadGaps } = require('../download-gate');
const gate = require('../public/gate-rules');
const { categoriesFor } = require('../emergency');
const { checkSwms } = require('../builder-check');
const { validAbn } = require('../accounts');
const { setupAccounts, lastLinkToken, ANSWERED, ready, checked } = require('./helpers');
const { loadPage } = require('./fake-dom');

const draftOf = (input) => prepareDraft(draftBody(ready({ fallRisk: 'no', residential: 'no', crane: 'none', ...ANSWERED, ...input })));

let server;
let base;
test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

function call(method, route, { body, token } = {}) {
  return fetch(`${base}${route}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}
let abnSeed = 0;
function nextAbn() {
  for (;;) {
    abnSeed += 1;
    const digits = crypto.createHash('sha256').update(`r11-${abnSeed}`).digest('hex').replace(/\D/g, '').slice(0, 11);
    if (digits.length === 11 && digits[0] !== '0' && validAbn(digits)) return digits;
  }
}
async function signIn(email) {
  await call('POST', '/api/auth/email', { body: { email } });
  const { token } = await (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).json();
  assert.equal((await call('PUT', '/api/company', { token, body: { name: `R11 ${email.split('@')[0]} Pty Ltd`, abn: nextAbn() } })).status, 200);
  return token;
}
const word = async (buffer) => {
  const zip = await JSZip.loadAsync(Buffer.from(buffer));
  const names = Object.keys(zip.files).filter((name) => /^word\/(document|footer\d*)\.xml$/.test(name));
  return (await Promise.all(names.map((name) => zip.file(name).async('string')))).join(' ').replace(/<[^>]+>/g, ' ').replace(/&apos;/g, '\'').replace(/\s+/g, ' ');
};

const FENCE = ready({ ...ANSWERED, state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no', crane: 'none' });

// ---- 1. One reference and revision, one printed file ----

test('a SWMS checked again by another person is its next revision with its own reference; the same person reprints it as it was', async () => {
  // Run 5: SW-8SBQ-8JFR revision 1 was both the "Checked by Me" PDF and the "Dave Rossi" files.
  const token = await signIn('ref@r11.example');
  const first = await call('POST', '/api/draft.docx', { token, body: checked({ ...FENCE }, null, { name: 'Sam Lee', role: 'Foreman' }) });
  assert.equal(first.status, 200);
  const id = first.headers.get('x-sitewrite-swms');
  assert.equal(first.headers.get('x-sitewrite-revision'), '1');
  const second = await call('POST', '/api/draft.docx', { token, body: { ...checked({ ...FENCE }, null, { name: 'Dave Rossi', role: 'Foreman' }), swmsId: id } });
  assert.equal(second.status, 200);
  assert.equal(second.headers.get('x-sitewrite-swms'), id, 'the same SWMS');
  assert.equal(second.headers.get('x-sitewrite-revision'), '2', 'its next revision');
  const kept = await db.query('SELECT revision, ref, confirmation, reason FROM swms_revisions WHERE swms_id = $1 ORDER BY revision', [id]);
  const conf = (row) => (typeof row.confirmation === 'string' ? JSON.parse(row.confirmation) : row.confirmation);
  assert.equal(kept.length, 2);
  assert.notEqual(kept[0].ref, kept[1].ref, 'a reference of its own');
  assert.equal(conf(kept[0]).name, 'Sam Lee', 'revision 1 keeps the check it printed with');
  assert.equal(conf(kept[1]).name, 'Dave Rossi');
  assert.match(kept[1].reason, /^Checked again by Dave Rossi, Foreman\. No other change from revision 1\.$/);
  // Revision 1 still prints as it did; revision 2 prints the new check under its own reference.
  const one = await word(await (await call('GET', `/api/swms/${id}/docx?revision=1`, { token })).arrayBuffer());
  assert.ok(one.includes('Checked by Sam Lee, Foreman,') && one.includes(kept[0].ref) && !one.includes('Dave Rossi'));
  const two = await word(await (await call('GET', `/api/swms/${id}/docx?revision=2`, { token })).arrayBuffer());
  assert.ok(two.includes('Checked by Dave Rossi, Foreman,') && two.includes(kept[1].ref));
  // The same person again: the same revision, printed as it was.
  const again = await call('POST', '/api/draft.docx', { token, body: { ...checked({ ...FENCE }, null, { name: 'dave rossi', role: 'foreman' }), swmsId: id } });
  assert.equal(again.headers.get('x-sitewrite-revision'), '2');
  assert.equal((await db.query('SELECT revision FROM swms_revisions WHERE swms_id = $1', [id])).length, 2);
  // My SWMS's "Mark as checked" by another person is a new revision too.
  const marked = await call('POST', `/api/swms/${id}/reviewed`, { token, body: checked({}, FENCE, { name: 'Jo Park', role: 'Director' }) });
  assert.equal(marked.status, 200);
  assert.equal((await marked.json()).swms.revision, 3);
});

// ---- 2. Emergency answers filled across only where they fit ----

test('an emergency answer naming plant fills only a SWMS with that plant, and each SWMS takes the latest answer that fits it', () => {
  // Run 2: "excavator operator lowers the bucket ..." printed under "Mobile plant: Stopped by" in Roof works
  // and Electrical installation, which have no excavator. Run 1: a pump operator's answer reached cranage.
  const EXCAVATOR = 'excavator operator lowers the bucket and turns the key off when the spotter calls stop';
  assert.equal(gate.answerFits(EXCAVATOR, 'Install conduits in the trench.\nExcavator\nVibrating plate compactor'), true);
  assert.equal(gate.answerFits(EXCAVATOR, 'Make roof penetrations and install containment.\nElevating work platform'), false);
  const GENERAL = 'The operator stops the plant at its emergency stop or turns the key off; the spotter signals the stop and calls for help.';
  const PUMP = 'The pump operator hits the red stop on the pump remote, the hose hand calls it.';
  const history = { plantStop: [GENERAL, PUMP] };
  const latest = { plantStop: PUMP };
  assert.deepEqual(gate.acrossFor(history, latest, 'Crane lifts.\nMobile crane\nForklift'), { plantStop: GENERAL }, 'cranage keeps the earlier answer that fits it');
  assert.deepEqual(gate.acrossFor(history, latest, 'Pump and place concrete.\nConcrete placing boom'), { plantStop: PUMP });
  // A project kept from before (no history) still fills, by the same fit.
  assert.deepEqual(gate.acrossFor({}, { plantStop: EXCAVATOR }, 'Roof works.\nElevating work platform'), {});
  // A scissor lift answer does not go to a boom lift SWMS (run 6 minor).
  assert.equal(gate.answerFits('The trained ground person who stays with the scissor lift while it is raised', 'Facade.\nBoom-type elevating work platform'), false);
});

// ---- 3. Another SWMS's own fall answer ----

const GO = fs.readFileSync(path.join(__dirname, '..', 'public', 'project-go.js'), 'utf8');
function goPage() {
  const els = new Map();
  const listeners = { input: [], change: [], click: [] };
  const element = (id) => {
    if (!els.has(id)) els.set(id, { id, value: '', innerHTML: '', textContent: '', hidden: false, dataset: {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false }, focus() {}, scrollIntoView() {}, closest: () => null, parentElement: null });
    return els.get(id);
  };
  const document = { getElementById: element, querySelector: (selector) => (selector === 'input[name="state"]:checked' ? { value: 'vic' } : null), querySelectorAll: () => [], addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); }, activeElement: null };
  const S = { api: (route) => route, esc: (value) => String(value || ''), payload: () => ({ state: 'vic' }), confirmBlock: () => '', canDownload: () => true, signedIn: () => true, getProfile: () => ({ name: 'Co', abn: '33102417000' }) };
  const window = { SiteWrite: S };
  const fetch = async (route) => ({ ok: true, json: async () => (route === '/api/draft/questions' ? { required: [], weak: [] } : {}) });
  const context = vm.createContext({ window, document, fetch, setTimeout, clearTimeout, requestAnimationFrame: (fn) => setTimeout(fn, 0), console, globalThis: null });
  context.globalThis = context;
  for (const file of ['design-fill.js', 'substance-rules.js', 'gate-rules.js', 'scope-task.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8'), context);
  window.SiteWriteDesignFill = context.SiteWriteDesignFill;
  vm.runInContext(GO, context);
  const hooks = { save() {}, render() {}, statusOf: () => 'needs' };
  const fire = (type, target) => {
    const node = { dataset: {}, tagName: 'INPUT', value: '', ...target };
    node.closest = (selector) => (selector === '#project-panel' ? {} : String(selector).split(',').some((part) => { const m = /\[data-([a-z-]+)\]|#([\w-]+)/.exec(part.trim()); return m && (m[2] ? node.id === m[2] : node.attrs && node.attrs.includes(m[1])); }) ? node : null);
    for (const fn of listeners[type] || []) fn({ target: node });
  };
  return { element, fire, go: window.SiteWriteProjectGo, hooks };
}

test('changing one SWMS\'s falls answer keeps another\'s answer that suits its own work', async () => {
  // Run 2: Electrical's falls went from No to Yes, and In-ground's own No ("Filled from SWMS 3") went blank,
  // with its trench support question.
  const p = goPage();
  const project = { stage: 'questions', shared: { crane: 'none', emergency: {}, designs: {} }, items: [{ title: 'Electrical installation', task: 'Install switchboards.', status: 'todo', body: null }, { title: 'In-ground', task: 'Lay conduits in trenches.', fallHint: 'no', status: 'todo', body: null }] };
  p.go.render(p.element('project-panel'), project, p.hooks);
  p.fire('change', { dataset: { goFall: '0' }, value: 'no', type: 'radio', attrs: ['go-fall'] });
  assert.equal(project.items[1].goFall, 'no');
  assert.equal(project.items[1].fallFrom, 0);
  p.fire('change', { dataset: { goFall: '0' }, value: 'yes', type: 'radio', attrs: ['go-fall'] });
  assert.equal(project.items[1].goFall, 'no', 'kept');
  assert.equal(project.items[1].fallFrom, undefined, 'now its own');
  await new Promise((resolve) => { setTimeout(resolve, 30); });
  assert.match(p.element('go-item-1').innerHTML || p.element('go-body-1').innerHTML || p.element('project-panel').innerHTML, /Kept for this SWMS: its own work suggests no work at height\./);
});

// ---- 4. The fall rescue beside an EWP ----

const ROOF = 'Make roof penetrations, waterproof them and install communications containment and cabling on the roof. Install lightning protection. EWP for access to the roof edge.';
test('with an EWP ticked, work on a roof still asks how a person who falls is rescued', () => {
  // Run 2, Roof works: only the EWP lowering questions were asked once the EWP was ticked.
  const draft = draftOf({ state: 'vic', fallRisk: 'yes', task: ROOF, facts: { fallControl: 'Roof edge guardrail is installed to every open edge before work starts.', harnessSystem: 'No harness is used. The roof has guardrails on every edge.' } });
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  const asked = draft.emergencyQuestions.map((item) => item.id);
  assert.ok(asked.includes('ewpLower') && asked.includes('fallRescue') && asked.includes('fallKit'), asked.join(', '));
  const row = draft.emergency.find((item) => item.type === 'Work at height');
  assert.match(row.detail, /Lowered in an emergency by: /);
  assert.match(row.detail, /Rescue: /);
  // An EWP job with no other fall keeps only the EWP questions.
  const ewpOnly = categoriesFor({ highRisk: ['Involves a risk of a person falling more than 2 metres'], plant: [{ item: 'Elevating work platform' }], jobSteps: [{ step: 'Use an elevating work platform', hazards: ['The platform overturns or falls from an edge.'] }, { step: 'Install ductwork', hazards: ['Strain lifting duct.'] }] });
  assert.deepEqual(ewpOnly, ['ewp']);
});

// ---- 5. Other fall controls considered ----

test('"Other fall controls considered" is needed only for a procedure or a harness, says so plainly, and "na" is not "Not answered yet"', () => {
  // Run 3: required for a scissor lift, "Give only needed if ...", and "na" read as "Not answered yet".
  const scissor = prepareDraft(draftBody({ ...ANSWERED, state: 'qld', fallRisk: 'yes', residential: 'no', crane: 'none', task: 'Install supply air ductwork in the warehouse ceiling.', facts: { fallControl: 'scissor lift' } }));
  assert.equal(scissor.kind, 'draft', (scissor.missing || []).join('; '));
  assert.ok(!(scissor.controls || []).some((item) => /was considered first|____/.test(item.text)));
  // Nor is it asked once the fall control given is a scissor lift; with a harness it is.
  const asked = (facts) => require('../draft').questionsFor({ ...ANSWERED, state: 'qld', fallRisk: 'yes', residential: 'no', crane: 'none', task: 'Install supply air ductwork in the warehouse ceiling.', facts }).required.map((item) => item.id);
  assert.ok(!asked({ fallControl: 'scissor lift' }).includes('controlsConsidered'));
  assert.ok(asked({ fallControl: 'Workers wear a harness on a static line.' }).includes('controlsConsidered'));
  assert.ok(asked({}).includes('controlsConsidered'), 'asked until the fall control is known');
  const harness = prepareDraft(draftBody({ ...ANSWERED, state: 'qld', fallRisk: 'yes', residential: 'no', crane: 'none', task: 'Replace roof sheets on a two storey house.', facts: { fallControl: 'Workers wear a full body harness clipped to a static line.', controlsConsidered: 'na' } }));
  const help = harness.missingHelp.find((item) => item.id === 'controlsConsidered');
  assert.equal(help.state, 'vague');
  assert.equal(help.why, '"na" is not an answer.');
  assert.doesNotMatch(help.help, /Give only needed/);
  assert.match(help.help, /^Your fall control is a procedure or a harness, so list the other fall controls considered/);
  // Run 5: "ladder tied off" beside a scissor lift made a blank control.
  const run5 = prepareDraft(draftBody(ready({ ...ANSWERED, state: 'sa', fallRisk: 'yes', residential: 'no', crane: 'none', task: 'Install hot water pipework in the ceiling space and risers.', facts: { fallControl: 'scissor lift with rails in the corridors, riser openings screened n only one floor open at a time, ladder tied off' } })));
  assert.ok(!(run5.controls || []).some((item) => /____/.test(item.text)), JSON.stringify(run5.controls));
});

// ---- 6. No false harness finding ----

test('SiteWrite\'s check finds no harness worn beside "No harness is used"', () => {
  // Run 2, Roof works: "The steps say a full body harness is worn, but the PPE list leaves it out".
  const steps = [{ step: 'Cut and flash the roof penetration', hazards: ['A fall through the opening.'], controls: ['No harness is used. The roof has permanent guardrails on every edge.', 'Openings are covered as soon as they are cut.'] }];
  const result = checkSwms({ state: 'vic', task: 'Make roof penetrations.', steps, ppe: ['Hard hat', 'Safety glasses, clear', 'Safety boots'], licences: ['General construction induction (white card)'] }, { state: 'vic' });
  const w2 = result.findings.find((item) => item.rule === 'W2');
  assert.doesNotMatch(w2.message, /harness is worn/);
  const worn = checkSwms({ state: 'vic', task: 'Make roof penetrations.', steps: [{ ...steps[0], controls: ['A full body harness is worn and clipped to the roof anchor.'] }], ppe: ['Hard hat'], licences: [] }, { state: 'vic' });
  assert.match(worn.findings.find((item) => item.rule === 'W2').message, /harness is worn/);
});

// ---- 7. The falls check names every High fall step ----

const RISERS = 'Hydraulic pipework at height: install risers in shafts and pipework in ceilings in copper, PVC and polyethylene, joined by brazing, solvent cement and PE fusion welding. L2 plant room copper hot water flow n return brazed to the new HWU. 50mm PE in the cieling space joined with electrofusion couplers, core drill the slab penatrations. PVC stack glued with glue n primer. Scissor lift in the corridors, ladder in the risers. Presure test the lot before the cielings get sheeted, then lag the HW.';
const RISER_FACTS = { safetyDataSheet: 'PVC solvent cement n priming fluid, nitrile gloves n windows open, SDS in the ute', silicaControls: 'wet coring with the water feed on', hotWorkPermit: 'builders hot work permit, fire watch 30 min after', pressureTesting: 'water test 1500kpa with the gauge isolated' };
test('the falls check names every step that rates a person\'s fall High, SiteWrite\'s EWP step too', () => {
  // Run 5: it named only "Install risers and pipework".
  const picked = prepareDraft(draftBody(ready({ ...ANSWERED, state: 'sa', fallRisk: 'no', residential: 'no', crane: 'none', kinds: ['hydraulicRisers', 'hotWork', 'solventCement', 'peFusion'], task: RISERS, facts: RISER_FACTS })));
  assert.deepEqual(picked.fallConflict.steps, ['Use an elevating work platform', 'Install risers and pipework']);
  // Read from the words alone, "pipework at height" says the work is at height: the EWP and the core hole.
  const typed = prepareDraft(draftBody(ready({ ...ANSWERED, state: 'sa', fallRisk: 'no', residential: 'no', crane: 'none', task: `Sanitary stacks, water and hot water pipework at height. ${RISERS.split('. ').slice(1).join('. ')}`, facts: RISER_FACTS })));
  assert.ok(typed.fallConflict.steps.includes('Use an elevating work platform') && typed.fallConflict.steps.includes('Core drill through the slab or wall'), JSON.stringify(typed.fallConflict));
  // Ground floor work with a ladder fall alone still brings no check.
  const low = draftOf({ state: 'nsw', task: 'Replace ceiling tiles in the ground floor office from a platform ladder.' });
  assert.equal(low.fallConflict, undefined);
});

// ---- 8. The person rule in every name box ----

test('"me" is refused as the checker\'s name, on the page and by the server, and in every name box', async () => {
  // Run 5: "Checked by Me, Foreman" printed on all 19 pages.
  assert.match(gate.checkerNameNeed('me'), /^"me" does not say who\. Give your own name, for example "Sam Lee"\./);
  assert.match(gate.checkerNameNeed('foreman'), /is a role, not a name/);
  assert.equal(gate.checkerNameNeed('Dave Rossi'), '');
  assert.equal(gate.checkerNameNeed('Jo'), '');
  const token = await signIn('me@r11.example');
  const refused = await call('POST', '/api/draft.docx', { token, body: checked({ ...FENCE }, null, { name: 'me', role: 'Foreman' }) });
  assert.equal(refused.status, 400);
  assert.match((await refused.json()).message, /"me" does not say who/);
  // The page's check panel uses the same rule, with the reason under the name box.
  const panel = fs.readFileSync(path.join(__dirname, '..', 'public', 'human-check.js'), 'utf8');
  assert.match(panel, /window\.SiteWriteGate\.checkerNameNeed\(name\)/);
  assert.match(panel, /if \(weak\) return \{ ready: false, why: weak \};/);
  // Prepared by and the site manager take the person rule too; empty is still fine.
  const gaps = (input) => downloadGaps(draftBody(input), prepareDraft(draftBody(input))).map((gap) => gap.id);
  assert.ok(gaps({ ...FENCE, preparedBy: 'me' }).includes('preparedBy'));
  assert.ok(gaps({ ...FENCE, siteManager: 'me' }).includes('siteManager'));
  assert.ok(!gaps({ ...FENCE, preparedBy: '' }).includes('preparedBy'));
  assert.ok(!gaps({ ...FENCE, siteManager: 'Dave' }).includes('siteManager'), 'a first name alone is still accepted');
});

// ---- 9. Scope headings ----

test('a scope heading in capitals, or "DESCRIPTION OF ...", "SCOPE OF ..." and "WORK AREA", comes off the task line', () => {
  // Run 3: "DESCRIPTION OF WORK AREA: All mechanical services ..." named the SWMS and its file.
  assert.equal(taskLine('DESCRIPTION OF WORK AREA: All mechanical services to all areas.'), 'All mechanical services to all areas.');
  assert.equal(taskLine('DESCRIPTION OF WORK AREA:\nAll mechanical services to all areas.'), 'All mechanical services to all areas.');
  assert.equal(taskLine('MECHANICAL SERVICES:\nInstall ductwork and fans.'), 'Install ductwork and fans.');
  assert.equal(taskLine('SCOPE OF THE MECHANICAL WORKS - install ductwork'), 'Install ductwork');
  assert.equal(taskLine('Work area: level 3 plant room. Install the AHU.'), 'Level 3 plant room. Install the AHU.');
  // Work that only starts with capitals stays.
  assert.equal(taskLine('HV cables are pulled in.'), 'HV cables are pulled in.');
  // A task typed all in capitals keeps its own first words.
  assert.equal(taskLine('REWIRE A HOUSE: RUN NEW CABLES IN THE CEILING SPACE.'), 'REWIRE A HOUSE: RUN NEW CABLES IN THE CEILING SPACE.');
  assert.equal(taskLine('DESCRIPTION OF WORK AREA: ALL MECHANICAL SERVICES.'), 'ALL MECHANICAL SERVICES.');
  assert.equal(taskLine('Details of the stair: build forms'), 'Details of the stair: build forms');
  assert.equal(require('../accounts').titleFor({}, { task: 'DESCRIPTION OF WORK AREA: All mechanical services to all floors. Kitchen extract ductwork.' }), 'All mechanical services to all floors');
});

// ---- 10. Weak answers ----

test('weak answers are queried: products named alone, "heaps of other trades", the builder\'s scaffolder, a name run into a place, and a medical centre', () => {
  // Run 2.
  assert.equal(answerState('safetyDataSheet', 'pvc conduit glue n cable pulling lube', 'vic'), 'vague');
  assert.equal(answerState('safetyDataSheet', 'pvc conduit glue, gloves on, SDS in the ute', 'vic'), 'supplied');
  assert.match(gate.answerNeed({ ask: 'Say which trades.', name: 'Other trades', none: true }, 'heaps of other trades'), /gives an amount, not who or what/);
  const scaffold = gate.fieldRule(gate.PEOPLE_FIELDS.find((item) => item.id === 'scaffoldSupervisor'));
  assert.match(gate.answerNeed(scaffold, 'the builders scaffolder'), /does not name a person/);
  assert.equal(gate.answerNeed(scaffold, 'Pat Doyle, Doyle Scaffolding'), '');
  assert.equal(gate.answerNeed(scaffold, 'Not applicable'), '');
  assert.match(gate.fieldWeak('person', 'Sarah O\'Brien Office'), /^"Sarah O'Brien Office" ends in "Office", which is a place, not a role\. Give their name and role, for example "Sarah O'Brien, office manager"\.$/);
  assert.equal(gate.fieldWeak('person', 'Sarah O\'Brien, Office manager'), '');
  assert.match(gate.careNote('Lygon Court Medical Clinic, 2 Lygon St, Carlton'), /Check this one has an emergency department/);
  assert.equal(gate.careNote('The Royal Melbourne Hospital, Parkville'), '');
  assert.equal(gate.careNote('Flinders Medical Centre, Bedford Park'), '');
});

// ---- 11. Over-strict refusals ----

test('the builder\'s site manager\'s check of the ground, and a scaffolder getting the person onto the deck, are answers', () => {
  // Run 4: both were refused.
  assert.equal(answerState('groundBearing', 'the builders site manager checked the road for the hiab outriggers, we use 600mm outrigger pads', 'wa'), 'supplied');
  assert.equal(answerState('groundBearing', 'crane op checks the ground', 'wa'), 'vague');
  const rescue = { ask: 'Say who rescues.', emergency: true, rescue: true, involves: 'a fall' };
  assert.equal(gate.answerNeed(rescue, 'the other scaffolder gets them onto the deck and calls 000'), '');
  assert.match(gate.answerNeed(rescue, 'call 000 and wait'), /only calls for help/);
});

// ---- 12. Capitals ----

test('a task typed in lower case prints with capitals at its sentences, and the muster point keeps its capitals in the Emergency table', () => {
  // Run 4.
  const draft = draftOf({ state: 'wa', musterPoint: 'front gate on Smith Street', task: 'install floor tiles in the bathrooms on the ground floor. grout the joints, approx. 40 m2 a day.' });
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  assert.equal(draft.task, 'Install floor tiles in the bathrooms on the ground floor. Grout the joints, approx. 40 m2 a day.');
  assert.equal(draft.musterPoint, 'Front gate on Smith Street');
  assert.equal(draft.emergency.find((row) => row.type === 'Emergency').detail, 'Front gate on Smith Street');
});

// ---- 13. Own steps that name the work ----

test('an own step covers a part only where it names the part\'s main thing', () => {
  // Run 6: "Build in the cavity wall sliders ..." took "Construct nibs and hobs and skim nib walls" off the
  // one-go page's list by the word "walls", so it held no download.
  const own = [{ name: 'Build in the cavity wall sliders as the stud walls are framed', hazards: ['Strain lifting and holding the slider frame in the opening'], controls: ['Two people lift and hold each slider frame into the opening'] }];
  const part = 'Construct nibs and hobs and skim nib walls';
  const input = draftBody(ready({ ...ANSWERED, state: 'tas', fallRisk: 'no', residential: 'no', crane: 'none', task: `Frame walls and bulkheads in steel stud. ${part}.`, ownSteps: own }));
  const draft = prepareDraft(input);
  assert.ok((draft.notCoveredLeft || require('../draft').notCoveredLeft(draft)).some((item) => /nibs and hobs/i.test(item)), JSON.stringify(draft.notCovered));
  // Its own words for the work still cover it.
  assert.equal(stepCoveringPart(part, [{ step: 'Build the nibs and hobs', hazards: ['x'], controls: ['y'] }], { head: true }), 'Build the nibs and hobs');
  assert.equal(stepCoveringPart('Heat weld vinyl joins', [{ step: 'Heat weld the vinyl joins with the hot air welding gun', hazards: ['Burns'], controls: ['Gloves'] }], { head: true }), 'Heat weld the vinyl joins with the hot air welding gun');
});

// ---- 14. One SWMS saved once ----

test('a download pressed while Save is on its way waits for it, so one SWMS is saved', async () => {
  // Run 7: Save SWMS, then Download Word a second later, made two SWMS with the same title, address and date.
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'account.js'), 'utf8');
  assert.match(source, /const next = \(S\.savingNow \|\| Promise\.resolve\(\)\)\.catch\(\(\) => \{\}\)\.then\(async \(\) => \{/);
  // The queue itself: the second runs only once the first is done.
  const S = {};
  const order = [];
  const run = (fn) => { const next = (S.savingNow || Promise.resolve()).catch(() => {}).then(fn); S.savingNow = next; return next; };
  run(() => new Promise((resolve) => { setTimeout(() => { order.push('save'); resolve(); }, 40); }));
  await run(async () => { order.push('download'); });
  assert.deepEqual(order, ['save', 'download']);
});

// ---- 15. The review notice in view ----

test('the review notice stays at the top of the screen until closed', () => {
  // Run 7: a plain reload kept the place at #draft, so the notice was above the screen.
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'account.js'), 'utf8');
  assert.match(source, /note\.classList\.add\('reviews-back-float'\);/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8'), /\.reviews-back-float \{ position: sticky; top: 0;/);
});

// ---- 16. A 502 on the questions ----

test('one 502 on the questions is asked again by itself and the page says nothing', async () => {
  // 17 October, 14:39:17 and 14:54:42 UTC: neither reached the app (no entry in the staging HTTP log); the
  // retry answered within a second, as flow9 built it.
  let asks = 0;
  const p = loadPage(['gate-rules.js', 'app.js'], (method, route) => {
    if (route === '/api/draft/questions') { asks += 1; return asks === 1 ? { status: 502, body: '<html>Bad Gateway</html>', headers: { 'content-type': 'text/html' } } : { body: { required: [], weak: [] } }; }
    return { body: {} };
  });
  const { response, data } = await p.run('postJson("/api/draft/questions", { task: "x" })');
  assert.equal(asks, 2);
  assert.equal(response.status, 200);
  assert.deepEqual(data.required, []);
});
