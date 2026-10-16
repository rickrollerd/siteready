// Decisions the owner accepted (D307, D311) for the SWMS app and the scope readings, built after the
// builds that proposed them. Library wording unchanged (D181); made-up sites and people only.
const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { prepareDraft, questionsFor, highRiskOptions } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { checkSwms, fromDraft } = require('../builder-check');
const rules = require('../public/substance-rules');
const { typeItems } = require('../substances');
const { draftToDocx } = require('../docx-draft');
const scopeChoice = require('../public/scope-choice');
const handover = require('../handover');
const aiScope = require('../ai-scope');
const { PLANT } = require('../register');

const SITE = { residential: 'no', company: 'Test', workplace: '12 Smith Street, Paddington QLD 4064', principalContractor: 'ABC Builders Pty Ltd', hospital: 'Royal Brisbane', firstAider: 'Jo Smith', musterPoint: 'Front gate', worksManager: 'Sam Lee', worksManagerPhone: '0400 118 552', complianceResponsible: 'Sam Lee', reviewer: 'Sam Lee', date: '16 October 2026' };
function answered(input) {
  const facts = { ...(input.facts || {}) };
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor({ ...input, facts });
    let added = false;
    for (const item of asked.required || []) {
      if (facts[item.id]) continue;
      facts[item.id] = item.id === 'liveElectrical' ? 'no' : item.choices ? item.choices[0].value : ((answersFor(item.id, asked.task)[0] || {}).text || 'As set out in the site plan.').replace(/_{3,}/g, 'as on the site plan');
      added = true;
    }
    if (!added) break;
  }
  return { ...input, facts };
}
const inputOf = (input) => draftBody(answered({ ...SITE, ...input }));
const draftOf = (input) => prepareDraft(inputOf(input));
const lines = (draft) => draft.jobSteps.flatMap((step) => step.controls);

// ---- Silica "Not required" beside SiteWrite's own cutting step (D311, round 6 content decision 1) ----

test('silica cannot be "Not required" while SiteWrite\'s own step cuts or drills concrete, and the product being cut is asked for', () => {
  const why = { [rules.SILICA]: 'Supplied and applied by others' };
  for (const [trade, task, step] of [
    ['concrete-cutting', 'Saw cut the ground floor slab for a new drainage trench and break out the concrete', 'Saw cut concrete'],
    ['plumbing', 'Core drill through the slab for the new waste pipes on level 2', 'Core drill through the slab or wall'],
  ]) {
    const input = inputOf({ state: 'qld', trade, fallRisk: 'no', task, substancesNotUsed: [rules.SILICA], substancesNotUsedWhy: why });
    const draft = prepareDraft(input);
    assert.equal(rules.cutStep(draft), step);
    const silica = typeItems(draft, input).find((item) => item.type === rules.SILICA);
    assert.ok(silica, task);
    assert.equal(silica.need, `Product with crystalline silica: the job step "${step}" cuts or drills concrete, masonry or stone, so this work makes silica dust and it cannot be "Not required". Add what is cut as the product, for example the concrete slab or the blockwork, with its safety data sheet. If this job does not do that step, take the step off.`);
  }
  // Without such a step a short reason still settles it (D292 item 3), and other types are as before.
  assert.equal(rules.notUsedNeed(rules.SILICA, 'Supplied and applied by others', 'grind the silica tiles', '', '', ''), '');
  assert.equal(rules.notUsedNeed('Fuels (diesel, petrol)', 'Supplied and applied by others', 'petrol saw', '', '', 'Saw cut concrete'), '');
  // Only SiteWrite's own steps that cut, drill, core, grind or break out concrete, masonry or stone count.
  const cut = (name, extra = {}) => rules.cutStep({ jobSteps: [{ step: name, ...extra }] });
  for (const name of ['Drill or cut concrete, masonry or stone', 'Prepare and grind floors', 'Drill fixing holes in the slab edge', 'Break out damaged concrete', 'Cut blocks and bricks']) assert.equal(cut(name), name);
  for (const name of ['Core fill blockwork', 'Plan core holes', 'Cut timber flooring to size', 'Cut and fix plasterboard', 'Cut and flash the roof penetration', 'Before starting']) assert.equal(cut(name), '', name);
  assert.equal(cut('Saw cut concrete', { own: true }), '', 'the user\'s own step');
});

// ---- "Does not apply" for wrongly found high risk work (D311, round 6 content decision 2) ----

const TRENCH = { state: 'qld', trade: 'civil', fallRisk: 'no', task: 'Excavate a trench for a new water main with an excavator under the overhead power lines' };
const ELECTRICAL = 'Is carried out on or near energised electrical installations or services';

test('"Does not apply" with a short reason takes the item off, prints it as the user\'s call, and its permit goes with it', async () => {
  const before = draftOf(TRENCH);
  assert.ok(before.highRisk.includes(ELECTRICAL));
  assert.ok(lines(before).some((line) => /permit to work near the lines/.test(line)), 'the lines permit is added for the category');
  const options = highRiskOptions(inputOf(TRENCH), before);
  assert.ok(options.highRiskFound.some((item) => item.id === 'electrical' && item.label === ELECTRICAL), 'the page can mark a found item');
  const reason = 'The lines are 25 m away across the road, outside the work area.';
  const input = { ...TRENCH, highRiskOff: [{ id: 'electrical', reason }] };
  const after = draftOf(input);
  assert.ok(!after.highRisk.includes(ELECTRICAL));
  assert.deepEqual(after.highRiskNotApply, [{ id: 'electrical', label: ELECTRICAL, reason }]);
  assert.ok(!lines(after).some((line) => /permit to work near the lines/.test(line)), 'its permit goes');
  // The rest of the list stays, and the item is not offered to add again.
  assert.deepEqual(after.highRisk, before.highRisk.filter((label) => label !== ELECTRICAL));
  const offered = highRiskOptions(inputOf(input), after);
  assert.ok(!offered.highRiskChoices.some((item) => item.id === 'electrical'));
  assert.ok(!offered.highRiskFound.some((item) => item.id === 'electrical'));
  // Builder check: the user's call, printed with its reason, is not marked as missing work.
  const check = checkSwms(fromDraft(after, { state: 'qld' }), { state: 'qld' });
  const h1 = check.findings.find((item) => item.rule === 'H1');
  assert.equal(h1.pass, true, h1.message);
  // It prints as the user's call, with the reason.
  const zip = await JSZip.loadAsync(await draftToDocx(after));
  const xml = await zip.file('word/document.xml').async('string');
  assert.match(xml, /Does not apply \(our call\): Is carried out on or near energised electrical installations or services\. Reason: The lines are 25 m away across the road, outside the work area\./);
});

test('"Does not apply" needs a reason that says why, and takes the rescue row and category lines with it', () => {
  // No reason, or one that says nothing: the item stays listed.
  for (const reason of ['', 'tbc', 'na', 'dont know']) {
    const draft = draftOf({ ...TRENCH, highRiskOff: [{ id: 'electrical', reason }] });
    assert.ok(draft.highRisk.includes(ELECTRICAL), JSON.stringify(reason));
    assert.deepEqual(draft.highRiskNotApply, []);
  }
  // Work that was not found is not printed as "does not apply".
  assert.deepEqual(draftOf({ ...TRENCH, highRiskOff: [{ id: 'diving', reason: 'No diving on this job at all' }] }).highRiskNotApply, []);
  // A confined space wrongly found: its rescue row goes.
  const pit = { state: 'qld', trade: 'plumbing', fallRisk: 'no', task: 'Clean out the stormwater pits and the sewer pump well at the shopping centre carpark' };
  const found = draftOf(pit);
  assert.ok(found.emergency.some((row) => row.type === 'Confined space'));
  const off = draftOf({ ...pit, highRiskOff: [{ id: 'confined', reason: 'The pump well is cleaned from the surface, no one goes in' }] });
  assert.ok(!off.highRisk.some((label) => /confined space/i.test(label)));
  assert.ok(!off.emergency.some((row) => row.type === 'Confined space'));
  // Moving plant wrongly found: its warning line and rescue row go.
  const clean = { state: 'qld', trade: 'cleaning', fallRisk: 'no', task: 'Builders clean of the ground floor shops; a forklift unloads deliveries nearby' };
  const plant = draftOf({ ...clean, highRiskOff: [{ id: 'plant', reason: 'The forklift stays in the loading dock, away from the shops' }] });
  assert.deepEqual(plant.highRiskNotApply.map((item) => item.id), ['plant']);
  assert.ok(!plant.highRisk.some((label) => /powered mobile plant/i.test(label)));
  assert.ok(!lines(plant).some((line) => /warning device and reversing alarm/.test(line)));
  assert.ok(!plant.emergency.some((row) => row.type === 'Mobile plant'));
});

test('"Does not apply" is kept for learning without names, as the user\'s reason', async () => {
  const learning = require('../control-learning');
  const db = require('../db');
  const draft = draftOf({ ...TRENCH, highRiskOff: [{ id: 'electrical', reason: 'Jo Bloggs says the lines are 25 m away at 12 Smith Street' }] });
  // The rows the store would keep: the category as listed, and the reason with names taken out.
  const seen = [];
  const before = { query: db.query, enabled: db.enabled, env: process.env.CONTROL_LEARNING, key: process.env.CONTROL_LEARNING_KEY };
  process.env.CONTROL_LEARNING = 'on';
  process.env.CONTROL_LEARNING_KEY = 'k'.repeat(40);
  db.enabled = () => true;
  db.query = async (sql, params) => { if (/INSERT INTO control_edit_events/.test(sql)) { seen.push(params); return [{ id: params[0] }]; } return []; };
  try {
    const count = await learning.recordControlEdits(draft, inputOf(TRENCH), { company: { id: 'c1', name: 'Test' }, swmsId: 's1', revision: 1, account: { users: [{ name: 'Jo Bloggs' }] } });
    assert.equal(count, 1);
    const row = seen[0];
    assert.equal(row[9], 'hrcwNotApply');
    assert.equal(row[11], ELECTRICAL);
    assert.doesNotMatch(row[16], /Jo Bloggs|Smith Street/);
    assert.match(row[16], /lines are 25 m away/);
  } finally {
    db.query = before.query;
    db.enabled = before.enabled;
    if (before.env === undefined) delete process.env.CONTROL_LEARNING; else process.env.CONTROL_LEARNING = before.env;
    if (before.key === undefined) delete process.env.CONTROL_LEARNING_KEY; else process.env.CONTROL_LEARNING_KEY = before.key;
  }
});

// ---- The heat-shrink gas torch is a possible item (content5 decision 7) ----

test('a gas torch named only with heat shrink is offered as a possible item, not as plant the crew uses', () => {
  const draft = draftOf({ state: 'qld', trade: 'electrical', fallRisk: 'no', task: 'Electrical commissioning of the new office level: test and tag, test the new work, energise circuits' });
  const torch = draft.plantInferred.find((item) => item.item === 'Oxy-acetylene or gas torch set');
  assert.ok(torch);
  assert.equal(torch.maybe, true);
  assert.match(draft.plant.find((item) => item.item === 'Oxy-acetylene or gas torch set').licence, /, where one is used$/);
  // A torch the work itself uses is still plant the crew uses.
  const brazing = draftOf({ state: 'qld', trade: 'plumbing', fallRisk: 'no', task: 'Braze the new copper water lines in the plant room with an oxy-acetylene torch' });
  const set = brazing.plantInferred.find((item) => /torch/i.test(item.item));
  assert.ok(set);
  assert.equal(set.maybe, false);
});

// ---- The hoist licence, from Schedule 3 we hold (g10-oct15 decision 3) ----

test('the hoist licence names HP for a personnel and materials hoist, and HM or HP for a materials hoist', () => {
  // WHS Regulations Schedule 3 items 19 and 20 (ACT and the other WHS states we hold); Victoria's OHS
  // Regulations 2017 Schedule 3 items 21 and 22.
  const hoist = PLANT.find((item) => item.item === 'Personnel or materials hoist');
  assert.equal(hoist.licence, 'Yes: HP for a personnel and materials hoist, and HM or HP for a materials hoist that carries no people');
  for (const state of ['qld', 'nsw', 'vic', 'wa']) {
    const draft = draftOf({ state, trade: 'formwork', fallRisk: 'yes', task: 'Erect and dismantle the builder\'s personnel and materials hoist on the tower' });
    const row = draft.plant.find((item) => item.item === 'Personnel or materials hoist');
    assert.ok(row, state);
    assert.match(row.licence, /HP for a personnel and materials hoist, and HM or HP for a materials hoist/, state);
    assert.doesNotMatch(row.licence, /HP or HM/);
  }
});

// ---- The Who column for sprinkler pipework (rename decision 7) ----

test('sprinkler steps name a fire services fitter in the Who column', () => {
  const draft = draftOf({ state: 'qld', trade: 'fire-services', fallRisk: 'yes', task: 'Install sprinkler pipework in the ceiling space of the new office floors from scissor lifts' });
  const step = draft.jobSteps.find((item) => item.step === 'Install sprinkler pipework');
  assert.ok(step, draft.jobSteps.map((item) => item.step).join(', '));
  assert.equal(step.responsible, 'Fire services fitter');
});

// ---- Cranage the scope gives the subcontractor in other words (g12s4 decision 4) ----

const row = (activity, pack, quote, extra = {}) => ({ activity, type: 'Site work', package: pack, crew: 'Mechanical fitters', clause: '3.1', quotes: [quote], where: '', plant: '', conditions: '', unknowns: '', matrixColumn: '', ...extra });

test('"a crane supplied by the Subcontractor" gives the subcontractor the cranage, on SiteLink and on the subcontractor\'s page', () => {
  for (const quote of ['A mobile crane supplied by the Subcontractor lifts the rooftop units.', 'The Subcontractor\'s own crane lifts the rooftop units.', 'The Subcontractor shall supply a 20 t mobile crane for the AHU lifts.']) {
    const reading = { activities: [row('Install the rooftop units', 'Trade installation: rooftop units', 'Install the rooftop units on the plinths.'), row('Lift the rooftop units with a mobile crane', 'Plant lifting and cranage', quote)] };
    const clause = scopeChoice.craneClause(reading);
    assert.ok(clause, quote);
    assert.equal(clause.quote, quote);
    assert.equal(scopeChoice.cranageOffer('', clause).ticked, true, 'the subcontractor\'s page ticks it');
    const cranage = handover.listItems(reading).find((item) => item.package === 'Plant lifting and cranage');
    assert.equal(cranage.removedWhy, '', 'SiteLink keeps it on the list');
  }
  // Cranes someone else runs, or slinging for them, are not the subcontractor's cranage.
  for (const quote of ['Crane lifts for the rooftop units are by the builder.', 'The Subcontractor provides dogging for the builder\'s crane.', 'The Subcontractor shall provide slinging for a crane supplied by the builder.', 'Tower crane provided by the builder for lifts by the subcontractor.']) {
    assert.equal(scopeChoice.suppliesCranage(quote), false, quote);
    const reading = { activities: [row('Install the rooftop units', 'Trade installation: rooftop units', 'Install the rooftop units.'), row('Lift the rooftop units with a crane', 'Plant lifting and cranage', quote)] };
    assert.equal(handover.listItems(reading).find((item) => item.package === 'Plant lifting and cranage').removedWhy, 'cranage', quote);
  }
});

// ---- Points to confirm: only who does or supplies what (sl6 decision 6) ----

test('only points about who does or supplies what are asked of the lead; other notes go with the SWMS for its draft', () => {
  assert.deepEqual(handover.splitPoint('Who provides the hoist for stripping; working heights'), { asks: ['Who provides the hoist for stripping'], notes: ['working heights'] });
  assert.deepEqual(handover.splitPoint('Gate weights, motor type, whether this subcontractor does any electrical connection, energised supply'), { asks: ['whether this subcontractor does any electrical connection'], notes: ['Gate weights', 'motor type', 'energised supply'] });
  assert.deepEqual(handover.splitPoint('Lifting method (cranage excluded)'), { asks: [], notes: ['Lifting method (cranage excluded)'] });
  assert.deepEqual(handover.splitPoint('Whether supplies are energised'), { asks: [], notes: ['Whether supplies are energised'] });
  assert.deepEqual(handover.splitPoint('Whether the builder\'s tower crane is available for formwork lifts').asks.length, 1);
  assert.deepEqual(handover.splitPoint('Connection to drainage and by whom').asks.length, 1);
  const reading = { activities: [
    row('Install ductwork in the ceiling spaces', 'Ductwork', 'Install ductwork in the ceiling spaces.', { unknowns: 'Working heights; who supplies the fan coil units' }),
    row('Install the condensers on the roof', 'Ductwork', 'Install the condensers on the roof.', { unknowns: 'Roof height, pitch, edge protection' }),
  ] };
  assert.deepEqual(handover.listPoints(reading).map((point) => point.question), ['Who supplies the fan coil units']);
  assert.deepEqual(handover.listItems(reading)[0].draftNotes, ['Working heights', 'Roof height, pitch, edge protection']);
  // The notes are not shown to the subcontractor on the list.
  const view = handover.subcontractorView({ project: { name: 'P', workplace: 'W', state: 'qld' }, org: { name: 'O' }, subcontract: { name: 'S' }, items: [{ title: 'Ductwork', task: 'Ductwork', item: handover.listItems(reading)[0] }], points: [], siteDetails: null, fields: [] });
  assert.doesNotMatch(JSON.stringify(view), /Working heights|Roof height/);
});

// ---- Moving plant needs moving words, in the subcontractor's scope reading too (sl6 decision 3) ----

test('the subcontractor\'s scope reading says "may" for moving plant where the package\'s own words move nothing', async () => {
  const reading = {
    activities: [row('Install acoustic and vibration separation between major plant and building structure', 'Trade installation: plant', 'Install acoustic and vibration separation.'), row('Lift the rooftop units onto the plinths with a mobile crane', 'Plant lifting', 'Lift the rooftop units with a mobile crane.')],
    packages: [{ package: 'Trade installation: plant', groups: ['plantLift'], byOthers: [] }, { package: 'Plant lifting', groups: ['plantLift'], byOthers: [] }],
  };
  const flags = await aiScope.packageHighRisk(reading, 'qld');
  const acoustic = flags.find((flag) => flag.package === 'Trade installation: plant');
  assert.ok(!acoustic.categories.some((item) => item.id === 'plant'));
  assert.ok(acoustic.dependsOn.some((item) => item.id === 'plant'));
  const lifting = flags.find((flag) => flag.package === 'Plant lifting');
  assert.ok(lifting.categories.some((item) => item.id === 'plant' && !item.likely));
});
