// Thirty work tasks drawn from real project documents (the source index, 3 October 2026), each in
// its stated state. Each is drafted as a user would and then read by the builder check: it drafts,
// lists the high risk construction work it involves, and has no hard fails.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, suggestedKinds } = require('../draft');
const { findState, highRiskList } = require('../legislation');
const { answersFor } = require('../presets');
const { checkSwms, fromDraft } = require('../builder-check');

// Goal 2: the reviewer, first aider and muster point (and the scaffold supervisor, for a scaffold) are
// answered before any download, as a user would.
const SITE = {
  workplace: '12 Smith Street, Test Town', principalContractor: 'ABC Builders Pty Ltd', complianceResponsible: 'Sam Lee, supervisor', date: '5 October 2026', reviewDate: '5 November 2026',
  reviewer: 'Sam Lee, supervisor', firstAider: 'Jo Smith', musterPoint: 'Front gate', scaffoldSupervisor: 'Pat Doyle, Doyle Scaffolding',
  site: { liveServices: 'Services are shown on the site services plan.', publicInterface: 'The public stay outside the site fence.', otherTrades: 'Other trades are kept out of the work area.', ground: 'Level, firm ground.', access: 'Through the main site gate.' },
};

// [state, the fall answer a user gives, the task, high risk work it must list, steps it must have].
const TASKS = [
  ['nsw', 'yes', 'stand and brace precast wall panels for the cell blocks with the crane', ['fall', 'precast'], ['Stand and brace the precast elements']],
  ['nsw', 'yes', 'lift volumetric precast cell modules off the truck and set them on the footings', ['fall', 'precast'], ['Lift and set the modules']],
  ['nsw', 'no', 'build and compact crane platforms for the precast lifts', ['plant'], ['Run earthmoving plant']],
  ['nsw', 'no', 'set up and run the on-site concrete batch plant', ['plant'], ['Erect the plant', 'Run the batching plant']],
  ['nsw', 'no', 'dig footings for the perimeter security wall under a permit to excavate, live services in the area', ['plant'], ['Locate underground services', 'Excavate']],
  ['nsw', 'yes', 'erect the tower crane and install the materials hoist for the main buildings', ['fall'], ['Erect or dismantle the tower crane', 'Install and dismantle the hoist']],
  ['nsw', 'no', 'set out traffic control at the site access off the main road for deliveries', ['road'], ['Set up traffic management']],
  ['nsw', 'no', 'install tanks, pumps and pipework for the sewerage treatment plant', [], ['Lift and place tanks, pits or precast units', 'Install the pump and pipework']],
  ['nsw', 'no', 'excavate and line the stormwater retention basin', ['plant'], ['Run earthmoving plant']],
  ['nsw', 'no', 'crane 27 backup generators onto their plinths at the data centre, Gregory Hills', ['plant', 'chemicalLine'], ['Install the generators']],
  ['tas', 'yes', 'erect the tower crane and run the crane lifts for the new build', ['fall'], ['Erect or dismantle the tower crane']],
  ['vic', 'yes', 'fix aluminium cladding to the two-storey accommodation block from an EWP in winter', ['fall'], ['Install the external cladding']],
  ['vic', 'no', 'detailed excavation and pipe bedding for the services', ['trench'], ['Excavate pile caps, lift pits and trenches']],
  ['vic', 'no', 'install the hydrant booster pump and fire water tank', [], ['Install the hydrant booster assembly', 'Lift and place tanks, pits or precast units']],
  ['vic', 'no', 'set the condenser units and connect them up', ['chemicalLine'], ['Receive plant and move it into position', 'Evacuate and charge the system']],
  ['vic', 'no', 'lay screed and epoxy floor coating to the bathrooms', [], ['Lay the screed', 'Apply epoxy or polyurethane floor coatings']],
  ['vic', 'yes', 'install balustrades on the first floor', ['fall'], ['Install balustrades at open edges']],
  ['vic', 'yes', 'install precast retaining walls to the GIS building basement', ['fall', 'precast'], ['Stand and brace the precast elements']],
  ['vic', 'no', 'install 66 kV GIS switchgear using the overhead crane in the GIS room', ['electrical'], ['Isolate and prove de-energised']],
  ['vic', 'no', 'dig the cable trench next to the live Jemena HV yard, no man zone in place', ['trench'], ['Lay conduits']],
  ['vic', 'no', 'lay the grounding mesh and earth tails before the slab pour', [], ['Connect and test the earthing']],
  ['vic', 'yes', 'install Kattsafe roof guard rail and catwalk on the GIS building roof', ['fall'], ['Install or remove edge protection']],
  ['vic', 'yes', 'install Webforge grating platforms', ['fall'], ['Erect and connect steel at height']],
  ['vic', 'no', 'run earthing through the fire-rated ceiling and seal the penetrations', [], ['Seal penetrations and fire stop', 'Connect and test the earthing']],
  ['vic', 'yes', 'pour the davit arm crane pad and fit the davit', ['fall'], ['Pump and place concrete']],
  ['vic', 'no', 'install SF6 exhaust ducting in the GIS room', [], ['Install ductwork']],
  ['qld', 'yes', 'weld shear studs through traydec onto steel beams', ['fall'], ['Weld shear studs']],
  ['qld', 'yes', 'lift and land precast rib floor units onto steel beams', ['fall', 'precast'], ['Land and fix the precast floor units']],
  ['wa', 'no', 'strip out internal walls around live ductwork and core-fill the blockwork walls', ['asbestos'], ['Strip out the room', 'Core fill blockwork']],
  // FRP column wrapping has its own step since the owner's decision of 6 October 2026.
  ['sa', 'no', 'wrap existing columns in FRP for seismic strengthening, with concrete dust from surface prep', [], ['Wrap columns with fibre reinforced polymer']],
];

function draftAsUser(state, fallRisk, task) {
  const input = { state, fallRisk, residential: 'no', task, kinds: suggestedKinds(task, {}, {}), company: 'Test', ...SITE };
  const facts = {};
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor({ ...input, facts });
    let added = false;
    for (const item of asked.required || []) {
      if (facts[item.id]) continue;
      // A standard answer's blanks (____) are filled in, as a user must before downloading (goal 2).
      facts[item.id] = item.id === 'liveElectrical' ? 'no' : item.choices ? item.choices[0].value : ((answersFor(item.id, asked.task)[0] || {}).text || `As set out in the site plan: ${item.label}.`).replace(/_{3,}/g, 'as on the site plan');
      added = true;
    }
    if (!added) break;
  }
  return prepareDraft({ ...input, facts });
}

test('the project document tasks draft with their high risk work and pass the builder check', () => {
  for (const [state, fall, task, types, steps] of TASKS) {
    const draft = draftAsUser(state, fall, task);
    if (!types) continue;
    assert.equal(draft.kind, 'draft', `${state}: ${task} ${(draft.missing || []).join('; ')}`);
    const listed = highRiskList(findState(state)).filter((item) => draft.highRisk.includes(item.label)).map((item) => item.id);
    for (const type of types) assert.ok(listed.includes(type), `${state}: ${task} lists ${listed.join(', ')}, not ${type}`);
    const names = draft.jobSteps.map((step) => step.step);
    for (const name of steps) assert.ok(names.includes(name), `${state}: ${task} has no "${name}" step: ${names.join(' | ')}`);
    const result = checkSwms(fromDraft(draft, { state, swms: { signatures: [{ name: 'Jo Smith' }] } }), { state, today: '2026-10-05' });
    assert.deepEqual(result.hardFails, [], `${state}: ${task}`);
    assert.ok(result.score >= 80, `${state}: ${task} scores ${result.score}`);
  }
});

test('work the library has no steps for yet is stood down, not drafted around', () => {
  // Every project task now has steps (FRP column wrapping since 6 October 2026); work with none is still stood down.
  assert.equal(draftAsUser('sa', 'no', 'install the widget assemblies to the frames').kind, 'stand-down');
});

test('a crane pad, the pour before others, and screed are not mistaken for other work', () => {
  const steps = (state, fall, task) => draftAsUser(state, fall, task).jobSteps.map((step) => step.step);
  // Building a crane platform for the precast lifts is not the precast lifts.
  assert.ok(!steps('nsw', 'no', 'build and compact crane platforms for the precast lifts').some((name) => /precast|crane crew/i.test(name)));
  // A mesh laid before the slab pour does not bring the pour.
  assert.ok(!steps('vic', 'no', 'lay the grounding mesh and earth tails before the slab pour').some((name) => /concrete/i.test(name)));
  // A screed with no tiles named brings no tiling, and an epoxy floor coating no painting.
  assert.ok(!steps('vic', 'no', 'lay screed and epoxy floor coating to the bathrooms').some((name) => /^(Lay tiles|Cut tiles|Paint|Prepare to paint)/.test(name)));
  // Footings for a wall are dug, but no pipe is laid in them.
  assert.ok(!steps('nsw', 'no', 'dig footings for the perimeter security wall under a permit to excavate, live services in the area').includes('Lay pipes'));
  // A fire water tank is not a house rainwater tank.
  assert.ok(!steps('vic', 'no', 'install the hydrant booster pump and fire water tank').includes('Install the rainwater tank'));
});
