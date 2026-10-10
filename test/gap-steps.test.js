// Gap job steps (10 October 2026, research in GAP-STEPS.md): TBM launch and retrieval shafts, old plant
// lifted out, lift controller upgrades, underpinning, sprayed fire protection, rock sawing and data outlet
// terminations. Each comes in where the task's words name the work, the typed wordings that stood down
// now draft, every new line has a source held (D181), and work with no source held stays out.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, packageKinds } = require('../draft');
const { ACTIVITIES } = require('../activities');
const RECORD = require('../scenarios/control-evidence.json');
const { controlLevel } = require('../control-level');

const SITE = { fallRisk: 'no', residential: 'no', crane: 'company', company: 'Koval Site Services Pty Ltd', principalContractor: 'Principal Builders Pty Ltd' };
const suggested = (task, state = 'qld') => (questionsFor({ ...SITE, state, task, facts: {} }).steps || {}).suggested || [];

// The draft as the page makes it, every question answered with its first choice or a site answer.
function draft(task, state = 'qld') {
  const facts = {};
  for (let round = 0; round < 8; round += 1) {
    const open = (questionsFor({ ...SITE, state, task, facts }).required || []).filter((item) => !facts[item.id]);
    if (!open.length) break;
    for (const item of open) facts[item.id] = item.id === 'liveElectrical' ? 'no' : item.choices ? item.choices[0].value : `As set out in the site plan: ${item.label}.`;
  }
  return prepareDraft({ ...SITE, state, task, facts });
}
const stepNamed = (d, name) => (d.jobSteps || []).find((step) => step.step === name);
const lines = (step) => step.controls.map((line) => String(line.text || line));

const KINDS = ['tbmShaft', 'plantRemoval', 'liftController', 'underpinning', 'fireSpray', 'rockSaw', 'ictTerminate'];

// The typed wordings that stood down before these steps, with the kind and step each now gets.
const FOUND = [
  ['underpin the existing footings', 'underpinning', 'Dig and support the underpinning pits'],
  ['Mass concrete underpinning to the neighbour\'s footings', 'underpinning', 'Dig and support the underpinning pits'],
  ['spray fire protection to the steel beams', 'fireSpray', 'Spray the fire protection coating'],
  ['Intumescent paint to structural steel', 'fireSpray', 'Spray the fire protection coating'],
  ['Spray applied fireproofing', 'fireSpray', 'Spray the fire protection coating'],
  ['sawcut rock with a rocksaw attachment', 'rockSaw', 'Cut rock with a rock saw'],
  ['Rock sawing', 'rockSaw', 'Cut rock with a rock saw'],
  ['TBM launch shaft', 'tbmShaft', 'Work at the TBM launch or retrieval shaft'],
  ['TBM breakthrough at the retrieval shaft', 'tbmShaft', 'Launch or receive the TBM'],
  ['upgrade the lift controller', 'liftController', 'Replace the lift controller'],
  ['Lift controller upgrade', 'liftController', 'Replace the lift controller'],
  ['terminate data outlets', 'ictTerminate', 'Terminate the data outlets and patch panels'],
  ['Terminate cat6 at the patch panels', 'ictTerminate', 'Terminate the data outlets and patch panels'],
  ['remove aircon units', 'plantRemoval', 'Lift and move out the plant being removed'],
  ['Remove the old chiller', 'plantRemoval', 'Lift and move out the plant being removed'],
];

test('typed wordings for the gap work tick its kind and draft its step', () => {
  for (const [task, kind, step] of FOUND) {
    assert.ok(suggested(task).includes(kind), `${task}: ${suggested(task).join(', ')}`);
    const d = draft(task);
    assert.equal(d.kind, 'draft', task);
    assert.ok(stepNamed(d, step), `${task}: ${(d.jobSteps || []).map((item) => item.step).join(' | ')}`);
  }
});

test('wordings for other work do not tick the gap kinds', () => {
  const NOT = [
    ['Install new condensers on the roof', 'plantRemoval'],
    ['Remove the old ductwork', 'plantRemoval'],
    ['Underpin the house', 'underpinning'],
    ['Spray paint the steel', 'fireSpray'],
    ['Install fireproof doors', 'fireSpray'],
    ['Saw cut the concrete slab', 'rockSaw'],
    ['Break rock with a hydraulic hammer', 'rockSaw'],
    ['Install data outlets and patch panels', 'ictTerminate'],
    ['Install tunnel ventilation for the TBM drive', 'tbmShaft'],
    ['Install the lift', 'liftController'],
  ];
  for (const [task, kind] of NOT) assert.ok(!suggested(task).includes(kind), `${task}: ${suggested(task).join(', ')}`);
});

test('rock sawing is not concrete saw cutting', () => {
  const d = draft('sawcut rock with a rocksaw attachment');
  assert.ok(!suggested('sawcut rock with a rocksaw attachment').includes('sawCut'));
  assert.ok(!stepNamed(d, 'Saw cut concrete'));
  assert.ok(lines(stepNamed(d, 'Cut rock with a rock saw')).some((line) => /^Rock is sawn with the saw's water supply running/.test(line)));
});

test('removing air conditioning units brings the lifting line', () => {
  const d = draft('remove aircon units');
  const lift = stepNamed(d, 'Lift and move out the plant being removed');
  assert.ok(lines(lift).some((line) => /^Where the unit is lifted, it is lifted with plant designed and rated to lift its weight\b.*\(Work Health and Safety Regulation 2011 \(Qld\) s 219\)$/.test(line)));
  // The old services step disconnects the units, so the plant's own disconnect step is not repeated,
  // and the forklift lines come only where a forklift is named.
  assert.ok(stepNamed(d, 'Isolate and make safe the old services'));
  assert.ok(!stepNamed(d, 'Disconnect the plant being removed'));
  assert.ok(!lines(lift).some((line) => /forklift/i.test(line)));
  assert.ok(stepNamed(draft('Remove the old chiller'), 'Disconnect the plant being removed'));
});

test('testing and certifying data cabling stays named as not covered', () => {
  assert.deepEqual(draft('terminate data outlets').notCovered, []);
  assert.deepEqual(draft('Terminate, test and certify the data outlets').notCovered, ['test and certify the data outlets']);
  assert.deepEqual(draft('Terminate the data outlets. Test and certify the data cabling.').notCovered, ['Test and certify the data cabling']);
  const step = stepNamed(draft('Terminate, test and certify the data outlets'), 'Terminate the data outlets and patch panels');
  assert.ok(!/\btest/i.test(step.step));
});

test('cementitious fire spray waits for the owner on the concrete pumping lines', () => {
  const step = stepNamed(draft('Apply cementitious fire spray to the steelwork'), 'Spray the fire protection coating');
  assert.ok(!lines(step).some((line) => /\b(?:hoses and couplings|mixer is guarded|airless|injection)\b/i.test(line)), lines(step).join('\n'));
  assert.ok(lines(step).some((line) => /^Bags are opened with eye protection/.test(line)));
  const paint = stepNamed(draft('spray fire protection to the steel beams'), 'Spray the fire protection coating');
  assert.ok(lines(paint).some((line) => /^Airless spray guns have the tip guard fitted/.test(line)));
});

test('the underpinning pit order rests on one training unit, recorded as one source', () => {
  for (const text of ['Pits are dug in the sections and sequence set by the underpinning schedule, and alternate sections are underpinned in turn.', 'Each section is underpinned and backfilled in the sequence the underpinning schedule sets.']) {
    assert.deepEqual(RECORD[text], { kind: 'practice', orgs: 1 });
  }
  const step = stepNamed(draft('underpin the existing footings', 'nsw'), 'Dig and support the underpinning pits');
  assert.ok(lines(step).some((line) => /alternate sections are underpinned in turn\. \(RIICFW301A Construct underpinning \(national unit of competency, 2011\) PC 2\.2, PC 4\.3\)$/.test(line)));
});

test('the TBM shaft lines cite the NSW tunnels code in NSW drafts only', () => {
  const edge = /^Every open shaft edge has edge protection/;
  const nsw = lines(stepNamed(draft('TBM launch shaft', 'nsw'), 'Work at the TBM launch or retrieval shaft')).find((line) => edge.test(line));
  assert.match(nsw, /\(SafeWork NSW Code of practice: Tunnels and shafts in construction \(August 2026\) s 9\.2\)$/);
  const qld = lines(stepNamed(draft('TBM launch shaft'), 'Work at the TBM launch or retrieval shaft')).find((line) => edge.test(line));
  assert.ok(!/\(/.test(qld), qld);
});

test('the lift controller step keeps the existing licensed lift technicians line word for word', () => {
  const step = stepNamed(draft('upgrade the lift controller'), 'Replace the lift controller');
  assert.ok(lines(step).includes('The work is done by licensed lift technicians, and the lift is tested before it is returned to service.'));
  const vic = lines(stepNamed(draft('upgrade the lift controller', 'vic'), 'Replace the lift controller'));
  assert.ok(vic.some((line) => /checked on at agreed times.*\(Lift work on construction projects: a handbook for workplaces \(WorkSafe Victoria, 2019, Victorian guidance\) s 5\.2, s 5\.3\)$/.test(line)));
});

test('every line of the gap steps is in the evidence record, and every new line has a source (D181)', () => {
  const others = new Set();
  for (const activity of ACTIVITIES.filter((item) => !KINDS.includes(item.when))) for (const step of activity.steps) for (const line of step.controls) others.add(typeof line === 'string' ? line : line && line.text);
  for (const activity of ACTIVITIES.filter((item) => KINDS.includes(item.when))) {
    for (const step of activity.steps) {
      for (const line of step.controls) {
        if (line.fact) continue;
        const text = typeof line === 'string' ? line : line.text;
        assert.ok(RECORD[text], `not in the record: ${text}`);
        // A line not already in the library carries its source.
        if (!others.has(text)) assert.ok(line.source, `no source: ${text}`);
      }
    }
  }
});

test('the gap steps print their controls in hierarchy order', () => {
  const RANK = { Eliminate: 0, Substitute: 1, 'Isolate or engineer': 2, Administrative: 3, PPE: 4 };
  for (const [task] of FOUND) {
    for (const step of draft(task).jobSteps) {
      const ranks = lines(step).map((line) => RANK[controlLevel(line)]);
      assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), `${task}: ${step.step}`);
    }
  }
});

test('an AI reading of a package that names the work gets the gap kind, and one that does not loses it', () => {
  assert.ok(packageKinds('Underpin the existing footings of the adjoining building.', ['excavation']).includes('underpinning'));
  assert.ok(packageKinds('Terminate the data outlets.', []).includes('ictTerminate'));
  assert.ok(!packageKinds('Install the cable trays.', ['ictTerminate', 'containment']).includes('ictTerminate'));
});
