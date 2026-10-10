// Safe Work Australia's 18 worked examples of high risk construction work ("SWMS tool: High risk
// construction work / 18 examples"), each example's own work task wording, word for word. Each one
// is matched to its type of work, and drafted as a user would, in Queensland and New South Wales.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, suggestedKinds, highRiskMatches } = require('../draft');
const { findState, highRiskList } = require('../legislation');
const { answersFor } = require('../presets');

// [type of work, the example's work task, the fall answer a user gives].
const EXAMPLES = [
  ['fall', 'Working on a roof', 'yes'],
  ['tower', 'Telecommunications equipment maintenance', 'yes'],
  ['demolition', 'Removing bracing from a wall using an excavator', 'no'],
  ['asbestos', 'Installing electrical wiring in an asbestos sheet wall', 'no'],
  ['temporary', 'Using props to support a ceiling where a load-bearing wall will be removed', 'no'],
  ['confined', 'Welding in confined space', 'no'],
  ['trench', 'Operating earthmoving equipment near underground trench', 'no'],
  ['explosives', 'Blasting to prepare for construction of a road', 'no'],
  ['gas', 'Excavation above gas lines', 'no'],
  ['chemicalLine', 'Working near fuel or refrigerant lines', 'no'],
  ['electrical', 'Operating a crane near overhead power lines', 'no'],
  ['atmosphere', 'Using an oxy torch to remove pipework that may contain the residue of hazardous chemicals', 'no'],
  ['precast', 'Erecting tilt-up or precast concrete panels on-site', 'no'],
  ['road', 'Building a road adjacent to an existing roadway', 'no'],
  ['plant', 'Working in an area of a construction site not isolated from the movement of skid steer loaders, backhoes, mobile cranes and trucks', 'no'],
  ['temperature', 'Working inside enclosed roof cavity in hot weather', 'no'],
  ['water', 'Installing shade sails over a swimming pool', 'no'],
  ['diving', 'Diver undertaking structural repairs to the jetty of a waterfront home', 'no'],
];
// The telecommunications example's work task does not name the tower: its type of work does.
const TOWER = 'Work on a telecommunications tower. Telecommunications equipment maintenance.';
// Every example names work the library has steps for (the fuel or refrigerant lines example has its own
// step since the owner's decision of 6 October 2026).
const NO_WORK = new Set([]);

// Every question answered as a user would, with the first suggested answer.
function draftAsUser(state, task, fallRisk) {
  const input = { state, fallRisk, residential: 'no', task, kinds: suggestedKinds(task, {}, {}), company: 'Test', workplace: '1 Test Street', principalContractor: 'Test builder' };
  const facts = {};
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor({ ...input, facts });
    let added = false;
    for (const item of asked.required || []) {
      if (facts[item.id]) continue;
      facts[item.id] = item.id === 'liveElectrical' ? 'no' : item.choices ? item.choices[0].value : (answersFor(item.id, asked.task)[0] || {}).text || `As set out in the site plan: ${item.label}.`;
      added = true;
    }
    if (!added) break;
  }
  return prepareDraft({ ...input, facts });
}
const categories = (state, draft) => highRiskList(findState(state)).filter((item) => draft.highRisk.includes(item.label)).map((item) => item.check);

for (const state of ['qld', 'nsw']) {
  test(`${state}: each worked example's task is matched to its type of high risk construction work`, () => {
    for (const [type, task] of EXAMPLES) {
      const wording = type === 'tower' ? TOWER : task;
      assert.ok(highRiskMatches(wording, '', findState(state)).some((item) => item.check === type), `${type}: ${wording}`);
    }
  });

  test(`${state}: each worked example drafts with its type of high risk construction work`, () => {
    for (const [type, task, fall] of EXAMPLES) {
      if (NO_WORK.has(task)) continue;
      const draft = draftAsUser(state, type === 'tower' ? TOWER : task, fall);
      assert.equal(draft.kind, 'draft', `${type}: ${task} ${(draft.missing || []).join('; ')}`);
      assert.ok(categories(state, draft).includes(type), `${type}: ${task} gave ${categories(state, draft).join(', ')}`);
    }
  });
}

test('the telecommunications example drafts a maintenance step, on the tower when the tower is named', () => {
  // Answered Yes to falls, the user also says how the crew works at height (the first way offered, edge
  // protection), and that job step comes before the work at height.
  assert.deepEqual(draftAsUser('qld', 'Telecommunications equipment maintenance', 'yes').jobSteps.map((step) => step.step), ['Before starting', 'Work at edges', 'Maintain rooftop antennas and equipment', 'Finish and clean up']);
  assert.deepEqual(draftAsUser('qld', 'Telecommunications equipment maintenance', 'no').jobSteps.map((step) => step.step), ['Before starting', 'Maintain rooftop antennas and equipment', 'Finish and clean up']);
  assert.ok(draftAsUser('qld', TOWER, 'yes').jobSteps.some((step) => step.step === 'Maintain antennas and equipment on the tower'));
});

test('work among moving plant drafts with the step that keeps plant and people apart', () => {
  const draft = draftAsUser('qld', EXAMPLES.find(([type]) => type === 'plant')[1], 'no');
  assert.ok(draft.jobSteps.some((step) => step.step === 'Separate plant and people on site'));
});

test('the fuel or refrigerant lines example drafts the step for work near live lines', () => {
  const draft = draftAsUser('qld', 'Working near fuel or refrigerant lines', 'no');
  assert.equal(draft.kind, 'draft', (draft.missing || []).join(' '));
  assert.ok(draft.jobSteps.some((step) => step.step === 'Work near live fuel, chemical or refrigerant lines'));
});

test('removing wall bracing is load-bearing demolition, and hot cutting chemical pipework is a flammable atmosphere', () => {
  const qld = findState('qld');
  // Safe Work Australia lists the bracing example under demolition of a load-bearing element.
  assert.ok(highRiskMatches('Removing bracing from a wall using an excavator', 'no', qld).some((item) => item.check === 'demolition'));
  // The oxy torch example is listed under contaminated or flammable atmospheres.
  assert.ok(highRiskMatches('Using an oxy torch to remove pipework that may contain the residue of hazardous chemicals', 'no', qld).some((item) => item.check === 'atmosphere'));
});
