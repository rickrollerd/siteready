// Messy test round 10 (17 October 2026), flow faults: the harness answer kept and printed whole once, and a
// "not used" answer takes the harness, its training and its lines off; the falls check counts a person going
// over with the platform and asks the fall control on Yes; no answer spliced into a control; own steps count
// for the work they cover; a street number is not a postcode; one role rule in every person box; scope
// headings off the task line; capitals for names typed in lower case; the ABN said once; the scope review's
// "by others" leaves the crew's own step; weak answers. The on-screen faults are also run in a browser
// (scratchpad/flow10).
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, taskLine, coverCheck, answerState } = require('../draft');
const { draftBody } = require('../input');
const { downloadGaps } = require('../download-gate');
const gate = require('../public/gate-rules');
const address = require('../public/address');
const names = require('../sitelink-answers');
const { packageTitles } = require('../handover');
const scopeChoice = require('../public/scope-choice');
const { loadPage } = require('./fake-dom');
const { ANSWERED, ready } = require('./helpers');

const draftOf = (input) => prepareDraft(draftBody(ready({ fallRisk: 'no', residential: 'no', crane: 'none', ...ANSWERED, ...input })));
const ticked = (draft) => (draft.ppe || []).flatMap((group) => group.items.filter((item) => item.ticked).map((item) => item.id));
const stepLines = (draft) => (draft.jobSteps || []).flatMap((step) => step.controls);

// ---- 1. The harness answer ----

const ROOF = 'Install remote refrigeration: condensing units on the roof plant deck, refrigerant pipework, brazing and pressure testing.';
const ROOF_FACTS = { fallControl: 'Plant deck has permanent guardrails.', hotWorkPermit: 'Hot work permit from the builder, fire watch 30 minutes after.', pressureTesting: 'Nitrogen to 4000 kPa with a regulator, area barricaded.' };
const NO_HARNESS = 'No harness is used. The plant deck has permanent guardrails on all sides.';
// Since messy round 16 (flow17) a "no harness" sentence never prints as a control; what else the answer says prints.
const NO_HARNESS_REST = 'The plant deck has permanent guardrails on all sides.';

test('"No harness is used" takes the harness, its training and its lines off, and prints whole once in the step at height', () => {
  // Run 1: the file printed a full body harness for the roof step, harness training, and the harness, snap
  // hook and suspension lines beside that answer, and the answer printed nowhere.
  const asked = questionsFor(draftBody({ ...ANSWERED, state: 'nsw', fallRisk: 'yes', residential: 'no', crane: 'none', task: ROOF, facts: ROOF_FACTS }));
  assert.ok(asked.required.some((item) => item.id === 'harnessSystem'), 'asked while a harness is ticked');
  const draft = draftOf({ state: 'nsw', fallRisk: 'yes', task: ROOF, facts: { ...ROOF_FACTS, harnessSystem: NO_HARNESS } });
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  assert.ok(!ticked(draft).includes('harness'));
  assert.ok(!(draft.qualifications || []).some((name) => /harness/i.test(name)));
  const lines = stepLines(draft);
  assert.deepEqual(lines.filter((line) => /harness|snap hooks?|lanyards?|fall arrest equipment/i.test(line)), []);
  const holding = draft.jobSteps.filter((step) => step.controls.includes(NO_HARNESS_REST)).map((step) => step.step);
  assert.equal(holding.length, 1);
  assert.match(holding[0], /roof/i);
  // The questions page shows the harness unticked, and still asks the question, so the answer is kept.
  const again = questionsFor(draftBody({ ...ANSWERED, state: 'nsw', fallRisk: 'yes', residential: 'no', crane: 'none', task: ROOF, facts: { ...ROOF_FACTS, harnessSystem: NO_HARNESS } }));
  assert.ok(!ticked(again).includes('harness'));
  assert.ok(again.required.some((item) => item.id === 'harnessSystem'));
  // Without the answer, the harness and its lines are there as before.
  const before = draftOf({ state: 'nsw', fallRisk: 'yes', task: ROOF, facts: { ...ROOF_FACTS, harnessSystem: 'Full body harness on a lanyard to the roof anchors, rated 15 kN, inspected 6 monthly by Height Safety Co; crew trained by the supplier; rescue kit at the roof hatch.' } });
  assert.ok(ticked(before).includes('harness'));
  assert.ok(stepLines(before).some((line) => /snap hooks?/i.test(line)));
});

test('unticking the harness by hand keeps the "no harness" answer, and it does not come back ticked', () => {
  // Run 1: she unticked the step's harness; on the next update the answer had gone and the harness was back.
  const base = draftBody(ready({ ...ANSWERED, state: 'nsw', fallRisk: 'yes', residential: 'no', crane: 'none', task: ROOF, facts: { ...ROOF_FACTS, harnessSystem: NO_HARNESS } }));
  const first = prepareDraft(base);
  const chosen = ticked(first).filter((id) => id !== 'harness');
  const input = { ...base, ppe: chosen, ppeOff: ['harness'] };
  const asked = questionsFor(input);
  assert.ok(asked.required.some((item) => item.id === 'harnessSystem'), 'the question stays, with its answer');
  const draft = prepareDraft(input);
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  assert.ok(!ticked(draft).includes('harness'));
  assert.equal(stepLines(draft).filter((line) => line === NO_HARNESS_REST).length, 1);
  assert.ok(!stepLines(draft).includes(NO_HARNESS));
});

test('a scope rule against harnesses brings no harness and no harness question; "Not used" prints with what it is about', () => {
  // Run 4: "Harnesses are not to be used at any time without prior approval" ticked a harness for all work in
  // a materials SWMS with falls No and asked "Harness and anchors"; the answer "Not used. ..." then printed as
  // a bare control in Before starting.
  const task = 'Accept delivery, unload, check and handle doors and hardware on site, including slinging loads.';
  const full = `${task} Harnesses are not to be used at any time without prior approval from The Contractor.`;
  const body = { ...ANSWERED, state: 'wa', fallRisk: 'no', residential: 'no', crane: 'none', task, scopeTask: { plain: task, full } };
  const asked = questionsFor(draftBody(body));
  assert.ok(!asked.required.some((item) => item.id === 'harnessSystem'));
  assert.ok(!ticked(asked).includes('harness'));
  // Asked anyway (a harness ticked by the user) and answered "Not used. ...": it says what it is about.
  const draft = draftOf({ ...body, facts: { harnessSystem: 'Not used. Unloading is done from the ground beside the truck, nobody stands on the tray.' }, ppe: ['hardHat', 'glassesClear', 'boots', 'hivis', 'harness'] });
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  assert.ok(stepLines(draft).includes('Unloading is done from the ground beside the truck, nobody stands on the tray.'));
  assert.ok(!stepLines(draft).some((line) => /No harness is used/.test(line)));
  assert.ok(!stepLines(draft).some((line) => /^Not used\./.test(line)));
  assert.ok(!ticked(draft).includes('harness'));
});

test('a step that cannot be done without a harness keeps it, whatever the answer', () => {
  const task = 'Install signage to the facade from a boom lift.';
  const draft = draftOf({ state: 'qld', fallRisk: 'yes', task, facts: { fallControl: 'Work from the EWP basket with its guardrails.', harnessSystem: 'No harness is used.' } });
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  const ewp = draft.jobSteps.find((step) => step.step === 'Use an elevating work platform');
  assert.ok(ewp, draft.jobSteps.map((step) => step.step).join('; '));
  assert.ok(ewp.controls.some((line) => /harness/i.test(line) && line !== 'No harness is used.'));
});

// ---- 2. The falls check ----

const FENCE = 'Fencing and gates: set out the fence line, dig the post holes, set the posts in concrete, and build the fence and hang the gates. 2.4m security fence round the substation compound at the back, post holes with a petrol auger, galv posts cut with a petrol cut off saw and cold gal on the cut ends. Barbed wire outriggers fixed on top from a ladder and our sissor lift, chemset anchors for the gate posts in the existing slab. Plus anti climb mesh along the top of the 3m retaning wal from the EWP.';
// The chemset anchors are drilled into the slab (content10), so the silica controls are answered too.
const FENCE_FACTS = { safetyDataSheet: 'Cold gal spray and chemset epoxy: SDS in the ute folder, gloves and glasses.', silicaControls: 'Anchor holes are drilled with on-tool dust extraction, and the driller wears a fit tested P2 respirator.' };

test('SiteWrite\'s own EWP step, High for the platform going over an edge, brings the Keep No check, and every step is named', () => {
  // Run 8: no check came for "Use an elevating work platform", and her own step was the only one named.
  const draft = draftOf({ state: 'nt', task: FENCE, facts: FENCE_FACTS });
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  assert.ok(draft.fallConflict, 'the check is asked');
  assert.ok(draft.fallConflict.steps.includes('Use an elevating work platform'));
  const own = draftOf({ state: 'nt', task: FENCE, facts: FENCE_FACTS, ownSteps: [{ part: '', name: 'Fix the barbed wire outriggers', hazards: ['Fall from the ladder or scissor lift.'], controls: ['Scissor lift used for the outriggers, the ladder only to reach the lift controls.', 'Spotter at the base.'], who: 'Leading hand' }] });
  assert.ok(own.fallConflict.steps.includes('Use an elevating work platform'));
  assert.ok(own.fallConflict.steps.some((name) => /^Fix the barbed wire outriggers/.test(name)));
  assert.ok(downloadGaps(draftBody({ fallRisk: 'no' }), own).find((gap) => gap.kind === 'fall').need.includes('"Use an elevating work platform"'));
});

test('with Yes, a task that only says what the work is done from is asked how a fall is prevented', () => {
  // Run 8: with Yes, no fall control question was asked.
  const yes = questionsFor(draftBody({ ...ANSWERED, state: 'nt', fallRisk: 'yes', residential: 'no', crane: 'none', task: FENCE, facts: FENCE_FACTS }));
  assert.ok(yes.required.some((item) => item.id === 'fallControl'));
  // A task that says how the fall is prevented is not asked again.
  const said = questionsFor(draftBody({ ...ANSWERED, state: 'qld', fallRisk: 'yes', residential: 'no', crane: 'none', task: 'Install roof sheeting, working behind the scaffold edge protection on all sides.' }));
  assert.ok(!said.required.some((item) => item.id === 'fallControl'));
});

// ---- 3. No answer spliced into a control ----

test('an Access answer is never made into a fall control, and a "not needed" answer is not a control in a step', () => {
  // Run 8: "Isolate or engineer: Work at height is done from the ewp. drive in gate, scissor and EWP on a float."
  const draft = draftOf({ state: 'nt', fallRisk: 'yes', task: FENCE, facts: { ...FENCE_FACTS, fallControl: 'EWP and scissor lift with guardrails, harness in the EWP basket clipped to its anchor.', harnessSystem: 'Full body harness on a short lanyard to the EWP basket anchor, inspected 6 monthly; crew trained by the supplier; rescue by lowering the basket from the ground controls.' }, site: { ...ANSWERED.site, access: 'drive in off mcminn st gate, scissor and EWP on a float' } });
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  assert.ok(!draft.controls.some((item) => /drive in|on a float/i.test(item.text)), JSON.stringify(draft.controls));
  // Run 1: the load limits answer "slab on ground only" printed in its row and in the pallet jack step.
  const loads = 'Ground floor slab on ground only, no suspended deck. Pallets on the pallet jack are kept under 1 tonne.';
  const jack = draftOf({ state: 'nsw', task: 'Receive, unload and move kitchen equipment with a pallet jack.', kinds: ['palletJack'], facts: { loadLimits: loads } });
  assert.equal(jack.kind, 'draft', (jack.missing || []).join('; '));
  assert.equal(Object.fromEntries(jack.references.map((row) => [row.label, row.text]))['Load limits'], `Not needed for this work: ${loads}`);
  assert.ok(!stepLines(jack).some((line) => /slab on ground only/i.test(line)));
});

// ---- 4. Own steps and false "no job steps" ----

test('a step of your own counts for the work its words cover, written for it or not', () => {
  // Run 2: "Heat weld the vinyl joins with the hot air welding gun", written for the SWMS as a whole, left
  // "Heat weld vinyl joins" listed as having no job steps.
  // Heat welding vinyl now has the library's laying step (content10), so a pond liner, which has none, stands in for it.
  const task = 'Heat weld the PVC pond liner seams.';
  const own = { part: '', name: 'Heat weld the PVC pond liner seams with the hot air welding gun and trim the weld', hazards: ['Burns from the hot air gun nozzle and hot weld rod.'], controls: ['Gun rested on its stand and switched off when not in hand.', 'Trim with the guarded knife, cutting away from the body.'], who: 'Floor layer' };
  const part = 'Heat weld the PVC pond liner seams';
  const draft = draftOf({ state: 'vic', task, ownSteps: [own] });
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  assert.deepEqual(draft.notCovered, [part]);
  assert.deepEqual(draft.notCoveredWritten, [part]);
  assert.equal(draft.notCoveredOwn[part], own.name);
  assert.deepEqual(coverCheck(draftBody(ready({ ...ANSWERED, state: 'vic', fallRisk: 'no', residential: 'no', crane: 'none', task, ownSteps: [own] }))).left, []);
  // "A step in this SWMS covers it" can name a step of your own too, whatever its words.
  const other = { ...own, name: 'Seam the sheets', hazards: ['Hot air gun burns.'], controls: ['Hot air gun kept on its stand.'] };
  const named = draftOf({ state: 'vic', task, ownSteps: [other], notCoveredInStep: { [part]: 'Seam the sheets (Our own step)' } });
  assert.ok(named.notCoveredWritten.includes(part), JSON.stringify(named.notCoveredWritten));
  // The page offers your own step in that list.
  const p = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }));
  const html = p.run(`coverStep(${JSON.stringify({ jobSteps: [{ step: 'Before starting' }, { step: 'Seam the sheets (Our own step)', own: true }, { step: 'Finish and clean up' }] })}, ${JSON.stringify(part)}, 0)`);
  assert.match(html, /Step 2: Seam the sheets \(Our own step\)/);
});

test('work a ticked step covers is not listed as having no job steps: backfill and reinstate, hang the gates', () => {
  // Run 6: "Backfill, compact and reinstate the footpath to ground level" beside "Backfill the trench" and
  // "Reinstate the surface". Run 8: "hang the gates" beside "Build the fence", whose lines hang gate leaves.
  const main = draftOf({ state: 'tas', task: 'Replace 300m of old water main with 200mm PE along the footpath on Main Rd Moonah. Excavate the trench with a 5t excavator, about 1.2m deep. Electrofusion weld the PE, pressure test and chlorinate. Backfill, compact and reinstate the footpath to ground level.', facts: { safetyDataSheet: 'Diesel and sodium hypochlorite: SDS in the ute, gloves and goggles.', pressureTesting: 'Hydrostatic test to the water authority spec, area kept clear.', serviceShutdown: 'Shutdown booked with TasWater, they isolate and approve.' } });
  assert.equal(main.kind, 'draft', (main.missing || []).join('; '));
  assert.ok(main.jobSteps.some((step) => step.step === 'Reinstate the surface'));
  assert.ok(!(main.notCovered || []).some((part) => /reinstate the footpath/i.test(part)), JSON.stringify(main.notCovered));
  const fence = draftOf({ state: 'nt', task: FENCE, facts: FENCE_FACTS });
  assert.ok(!(fence.notCovered || []).some((part) => /hang the gates/i.test(part)), JSON.stringify(fence.notCovered));
});

test('a step of your own half typed is kept with the work on this device, and no longer once it is closed', () => {
  // Run 8: after a reload its name went back to the task's words, and its hazards and controls were empty.
  const p = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }));
  const values = { '#own-name': 'Fix the barbed wire outriggers', '#own-hazards': 'Fall from the scissor lift', '#own-controls': '', '#own-who': 'Leading hand' };
  const form = { dataset: { ownPart: '', ownWas: '' }, closest: () => null, querySelector: (selector) => (selector in values ? { value: values[selector] } : null), remove() {} };
  const query = p.document.querySelector;
  p.document.querySelector = (selector) => (selector === '.own-step-form:not(.go-own-form)' ? form : query(selector));
  const kept = JSON.parse(JSON.stringify(p.run('ownFormKept()')));
  assert.deepEqual(kept, { where: 'result', part: '', was: '', name: 'Fix the barbed wire outriggers', hazards: 'Fall from the scissor lift', controls: '', who: 'Leading hand' });
  p.document.querySelector = query;
  assert.equal(p.run('ownFormKept()'), null);
});

// ---- 5. A street number is not a postcode ----

test('only a 4-digit number at the end of the address is read as a postcode', () => {
  // Run 3: "2050 moggill rd kenmor" ticked New South Wales while it was typed.
  assert.deepEqual(address.stateFromTyped('2050 moggill rd kenmor'), { state: '', from: '' });
  assert.deepEqual(address.stateFromAddress('2050 moggill rd kenmor'), { state: '', from: '' });
  assert.equal(address.stateFromTyped('2050 moggill rd kenmore 4069').state, 'qld');
  assert.equal(address.stateFromAddress('2050 Moggill Rd, Kenmore QLD 4069').state, 'qld');
  assert.equal(address.stateFromAddress('12 Smith St Paddington 4064, Australia').state, 'qld');
  assert.equal(address.stateFromTyped('2050').state, '');
});

// ---- 6. One role rule in every person box ----

test('"me" asks for a name and role in a person box, and a role alone is refused in every person box', () => {
  // Run 2: the hint's own example "The site supervisor" was then refused; run 3: it was accepted as first aider.
  for (const kind of ['person', 'firstAider']) {
    const rule = gate.fieldRule({ need: 'Name them.', label: 'X', kind });
    assert.match(gate.answerNeed(rule, 'me'), /^"me" does not say who\. Give their name and role, for example "Sam Lee, site supervisor"\./);
    assert.match(gate.answerNeed(rule, 'The site supervisor'), /^"The site supervisor" is a role, not a person\. Give their name and role, for example "Sam Lee, site supervisor"\./);
    assert.equal(gate.answerNeed(rule, 'Sam Lee, site supervisor'), '');
  }
  assert.equal(gate.answerNeed(gate.fieldRule({ need: 'x', label: 'First aider', kind: 'firstAider' }), 'Main contractor\'s site first aider'), '');
  // Elsewhere a role is the answer (D259): the old hint stays.
  assert.match(gate.notAnswer('me'), /Name the role, for example "The site supervisor"/);
  // SiteLink's person boxes ask the same.
  assert.match(names.personProblem('me'), /Give their name and role/);
});

// ---- 7. Scope headings and bullets ----

test('a scope heading comes off the task line and title, and bullets stay apart', () => {
  // Run 7: "DESCRIPTION OF WORK: All builders plus final cleaning ..." and "Café Bars.".
  const pasted = 'DESCRIPTION OF WORK:\nAll builders plus final cleaning ready for the opening of the resort including but not limited to:\n· Kitchen areas\n· Café\n· Bars\n· Glazing';
  const line = taskLine(pasted);
  assert.equal(line, 'All builders plus final cleaning ready for the opening of the resort: Kitchen areas. Café. Bars. Glazing.');
  assert.equal(taskLine('Description of works: install the doors.'), 'Install the doors.');
  const { titleFor } = require('../accounts');
  assert.doesNotMatch(titleFor({}, { task: pasted }), /DESCRIPTION/i);
});

// ---- 8. Capitals ----

test('names typed in lower case print with capitals, small words kept small, and capitals typed are never lowered', () => {
  assert.equal(names.tidyName('swan coast doors and hardware'), 'Swan Coast Doors and Hardware');
  assert.equal(names.tidyName('the trustee for smith family trust'), 'The Trustee for Smith Family Trust');
  assert.equal(names.tidyName('Hilti vac'), 'Hilti vac');
  assert.equal(names.tidyPersonRole('declan furlong, foreman'), 'Declan Furlong, Foreman');
  assert.equal(names.tidyPersonRole('Sam Lee, supervisor'), 'Sam Lee, supervisor');
  assert.equal(names.tidyPlace('meet at henry st gate'), 'Meet at Henry St gate');
  assert.equal(names.tidyPlace('car park off the main rd'), 'Car park off the main rd');
  assert.equal(names.withCompanyNames('Potoroo bend builds the plinths', ['Potoroo Bend Builders Pty Ltd']), 'Potoroo Bend builds the plinths');
  assert.equal(names.withCompanyNames('bend the bars', ['Potoroo Bend Builders Pty Ltd']), 'bend the bars');
  // On the SWMS: the principal contractor, Prepared by, the works manager and the muster point.
  const draft = draftOf({ state: 'wa', task: 'Hang the doors and fit the hardware.', principalContractor: 'batavia coast builders', preparedBy: 'tanya pirelli, ops manager', worksManager: 'declan furlong', musterPoint: 'grass verge on marine tce opposite the site office', company: 'swan coast doors and hardware' });
  assert.equal(draft.principalContractor, 'Batavia Coast Builders');
  assert.equal(draft.preparedBy, 'Tanya Pirelli, Ops manager');
  assert.equal(draft.worksManager, 'Declan Furlong');
  assert.equal(draft.musterPoint, 'Grass verge on Marine Tce opposite the site office');
  assert.equal(draft.subcontractor, 'Swan Coast Doors and Hardware');
  // Plant the user added keeps the capitals typed, in the review clause too (run 5: "hilti hammer drill").
  const base = ready({ fallRisk: 'no', residential: 'no', crane: 'none', ...ANSWERED, state: 'sa', task: 'Drill anchors into the concrete slab and fix the bench brackets.', facts: { silicaControls: 'Drill with on-tool extraction and an H class vacuum; P2 masks where dust remains.' } });
  const drill = prepareDraft(draftBody({ ...base, plantChoice: { ...base.plantChoice, added: [{ item: 'Hilti hammer drill', licence: 'No' }] } }));
  assert.equal(drill.kind, 'draft', (drill.missing || []).join('; '));
  assert.match(drill.review, /Hilti hammer drill/);
  // A product's control keeps a name typed with its capital (run 5: "hilti vac on the drill").
  const rules = require('../public/substance-rules');
  const line = rules.productLine ? rules.productLine({ type: rules.SILICA, product: 'Concrete shaft walls', controls: ['Hilti vac on the drill', 'Wear a P2 mask'] }) : '';
  if (line) { assert.match(line, /Hilti vac on the drill/); assert.match(line, /wear a P2 mask/); }
});

test('SiteLink: a subcontract company and "Last saved by" typed in lower case show with capitals', async () => {
  const scopes = require('../sitelink-scopes');
  assert.ok(scopes);
  // The saved name is tidied once (cleanSubcontract is inside the routes; tidyName is what it uses).
  assert.equal(names.tidyName('echidna ductworks pty ltd'), 'Echidna Ductworks Pty Ltd');
  assert.equal(names.tidyName('kirra pendlebury'), 'Kirra Pendlebury');
});

// ---- 9. The ABN said once ----

test('a wrong ABN is said once, at its box, when the signed-in save is refused', async () => {
  // Runs 2 and 8: "Not saved yet: That ABN is not valid. Check the 11 digits. Fix it ..." under the sentence.
  const p = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }));
  p.window.SiteWrite.signedIn = () => true;
  p.window.SiteWrite.saveCompany = async () => { throw Object.assign(new Error('That ABN is not valid. Check the 11 digits.'), { field: 'abn' }); };
  p.document.getElementById('profile-company').value = 'Brennan Floor Coverings';
  p.document.getElementById('profile-abn').value = '51 824 753 557';
  await p.run('saveProfile({ auto: true })');
  assert.equal(p.document.getElementById('profile-status').textContent, 'Not saved yet: fix the ABN as the note under it says, then press Save profile.');
  assert.equal(p.document.getElementById('abn-error').textContent, 'That ABN is not valid. Check the 11 digits.');
  // A press of Save profile that follows a save already under way waits for it, so "Saved" is the last word.
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  const order = [];
  p.window.SiteWrite.saveCompany = async (next) => { order.push('start'); if (order.length === 1) await slow; order.push('end'); return { name: next.name, abn: next.abn }; };
  p.document.getElementById('profile-abn').value = '51 824 753 556';
  const auto = p.run('saveProfile({ auto: true })');
  const press = p.run('saveProfile()');
  release();
  await auto;
  await press;
  assert.deepEqual(order, ['start', 'end', 'start', 'end']);
  assert.match(p.document.getElementById('profile-summary').textContent, /Saved$/);
});

// ---- 11. The scope review keeps the crew's own step ----

test('"No, leave it out" for work by others does not take off the crew\'s own step for the same work', () => {
  // Run 4: final painting by others, answered No, also took off "Paint", so sealing the door bottoms had no step.
  const rows = [
    { activity: 'Supply, hang and fit doors, frames and hardware', package: 'Doors and hardware', type: 'Site work', quotes: ['Supply and install doors, frames and hardware.', 'Bottoms of doors are to be sealed (painted) prior to being hung.', 'Doors are to be final painted (by others).'] },
  ];
  const reading = { activities: rows, packages: [{ package: 'Doors and hardware', groups: ['doorHang', 'painting'], byOthers: [{ group: 'painting', step: 'Paint', says: 'Doors are to be final painted by others.' }] }] };
  const [item] = scopeChoice.projectItems(reading, ['Doors and hardware'], { answers: { 'Doors and hardware': { Paint: 'no' } } });
  assert.ok(!item.leaveOut.includes('Paint'));
  assert.match(scopeChoice.ownWorkNaming(scopeChoice.packagesOf(reading).work[0].rows, 'Paint'), /sealed \(painted\)/);
  // Work only others do is still left out on No.
  const others = { activities: [{ ...rows[0], quotes: ['Supply and install doors, frames and hardware.', 'Doors are to be final painted (by others).'] }], packages: reading.packages };
  assert.ok(scopeChoice.projectItems(others, ['Doors and hardware'], { answers: { 'Doors and hardware': { Paint: 'no' } } })[0].leaveOut.includes('Paint'));
});

// ---- 12. High risk work in a SWMS prepared by Prepare all ----

test('a SWMS prepared in one go with falls Yes lists its high risk work; one whose only powered plant is not confirmed lists none', () => {
  // Run 1: the empty list on screen was the materials SWMS after its forklift was left unconfirmed (a manual
  // pallet jack is not powered mobile plant); the refrigeration SWMS listed falls and refrigerant lines.
  const fridge = draftOf({ state: 'nsw', fallRisk: 'yes', task: ROOF, facts: { ...ROOF_FACTS, harnessSystem: NO_HARNESS }, siteShared: true, site: { ...ANSWERED.site, liveServices: 'Gas points and power to the kitchen equipment.' } });
  assert.ok(fridge.highRisk.some((label) => /falling more than 2/i.test(label)), JSON.stringify(fridge.highRisk));
  assert.ok(fridge.highRisk.some((label) => /refrigerant lines/i.test(label)), JSON.stringify(fridge.highRisk));
});

// ---- 13. Weak answers ----

test('product names alone are a weak SDS answer, "front of site" is no muster point, and "Hot works" is not a title', () => {
  // Run 2: "glue n primer" taken with no note; run 3: "front of site" accepted; run 2: "Hot works" as the title.
  assert.equal(answerState('safetyDataSheet', 'glue n primer'), 'vague');
  assert.equal(answerState('safetyDataSheet', 'Glue and primer, SDS in the van, nitrile gloves'), 'supplied');
  const weak = questionsFor(draftBody({ ...ANSWERED, state: 'vic', fallRisk: 'no', residential: 'no', crane: 'none', task: 'Lay vinyl with adhesive and primer.', facts: { safetyDataSheet: 'glue n primer' } })).weak;
  const sds = weak.find((item) => item.id === 'safetyDataSheet');
  assert.ok(sds, JSON.stringify(weak));
  assert.match(sds.why, /names the products but not how they are handled/);
  assert.match(gate.fieldWeak('place', 'front of site'), /does not say where/);
  assert.equal(gate.fieldWeak('place', 'Front gate on Smith Street'), '');
  const row = (activity, pack) => ({ activity, type: 'Site work', package: pack, crew: 'Floor layers', clause: '5.2', quotes: [`${activity}.`], where: '', plant: '', conditions: '', unknowns: '', matrixColumn: '' });
  assert.deepEqual(packageTitles({ activities: [row('Heat weld vinyl joins', 'Hot works'), row('Lay vinyl', 'Floor finishes')], byOthers: [], conflicts: [] }), { 'Hot works': 'Heat weld vinyl joins' });
});

test('"Put back" for a step the scope review left out picks its kind of work again, so it holds', async () => {
  // Run 4: "Paint" was put back, then went again at "Prepare the statement": its kind of work was not among
  // the steps picked, which the page reads from the boxes once any is ticked.
  const p = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }));
  p.run(`stepById.set('painting', { id: 'painting', label: 'Prepare to paint', steps: ['Prepare to paint', 'Sand and fill surfaces', 'Paint', 'Clean brushes and rollers'] });
    stepPicks = ['doorHang']; leaveOut = ['Paint']; shownDraft = { kind: 'draft', jobSteps: [{ step: 'Before starting' }, { step: 'Hang the doors' }] };`);
  const button = p.document.createElement('button');
  button.dataset.stepBack = 'Paint';
  button.closest = (selector) => (selector === '[data-step-back]' ? button : null);
  const event = new p.window.Event('click', { bubbles: true });
  event.target = button;
  p.document.getElementById('result').dispatchEvent(event);
  await new Promise((resolve) => { setImmediate(resolve); });
  assert.deepEqual(JSON.parse(JSON.stringify(p.run('stepPicks'))), ['doorHang', 'painting']);
  assert.deepEqual(JSON.parse(JSON.stringify(p.run('leaveOut'))), ['Prepare to paint', 'Sand and fill surfaces', 'Clean brushes and rollers']);
});
