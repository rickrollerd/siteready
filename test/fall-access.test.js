// Falls answered Yes where none of the task's own job steps stops a fall (hoist installation, crane
// assembly, PT stressing, bridge barriers, pipework in ceilings, construction use of a lift): the user
// says how the crew works at height, and the library step for that way is added, opening with the fall
// hierarchy. Before this, these SWMS failed SiteReady's own Builder check (H2 or H3).
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor } = require('../draft');
const { ACTIVITIES } = require('../activities');
const { checkSwms, fromDraft } = require('../builder-check');

const HOIST = 'Install, climb and dismantle the builders hoist: base, mast sections, ties to the slab edge and landing gates.';
const STRESS = 'Stress the post-tensioned slab tendons, grout the ducts and cut the tails.';
const PIPEWORK = 'Install chilled water and heating water pipework in the plant room, risers and ceilings: hangers, steel pipe, roll grooving and valves.';
const HIERARCHY = 'Work from the ground, a platform or a scaffold. Where a person could still fall, prevent it with edge protection or work platforms before using fall arrest.';
const SITE = { workplace: '14 Ferndale Street, Herston QLD 4006', principalContractor: 'Corbel Build', complianceResponsible: 'Larry Leadinghand', site: { access: 'Gate 2.' } };
const asked = (task, fallRisk, extra = {}) => questionsFor({ state: 'qld', task, fallRisk, residential: 'no', ...extra }).required.find((item) => item.id === 'fallAccess');
const draft = (task, facts, extra = {}) => prepareDraft({ state: 'qld', task, fallRisk: 'yes', residential: 'no', ...SITE, ...extra, facts: { controlsConsidered: 'An EWP cannot reach the mast ties.', harnessSystem: 'Full body harness on a 15 kN anchor approved by the engineer.', stressingProcedure: 'Stressing procedure SP-04 from the PT designer.', ...facts } });
const hard = (result) => checkSwms(fromDraft(result, { state: 'qld' }), { state: 'qld' }).findings.filter((item) => ['H2', 'H3'].includes(item.rule) && !item.pass).map((item) => item.rule);

test('falls answered Yes with no job step that stops a fall asks how the crew works at height', () => {
  const question = asked(HOIST, 'yes');
  assert.ok(question, 'asked');
  assert.equal(question.label, 'Working at height');
  assert.deepEqual(question.choices.map((choice) => choice.value).sort(), ['edge', 'ewp', 'ladder', 'mobileScaffold', 'restraint', 'scaffold']);
  // Ceilings and pipework put the EWP first; a slab or deck edge puts edge protection first.
  assert.equal(asked(PIPEWORK, 'yes').choices[0].value, 'ewp');
  assert.equal(asked(STRESS, 'yes').choices[0].value, 'edge');
  // Falls answered No: nothing changes.
  assert.equal(asked(HOIST, 'no'), undefined);
  // Steps that already stop a fall are not asked about: roof edge protection, scaffold erection.
  assert.equal(asked('Install new roof sheeting with roof edge guardrail and safety mesh.', 'yes'), undefined);
  assert.equal(asked('Erect and dismantle the perimeter scaffold.', 'yes'), undefined);
  // A tower is climbed on its own fall arrest climbing system: not asked.
  assert.equal(asked('Maintain antennas on the telecommunications tower.', 'yes'), undefined);
  // A task with no job steps at all is stood down for that, not asked.
  assert.equal(asked('Run a jump lift for the builder as construction use of the lift while the building rises.', 'yes'), undefined);
  // Picked steps decide: picking the EWP step takes the question away.
  assert.equal(asked(HOIST, 'yes', { kinds: ['hoistInstall', 'ewp'] }), undefined);
});

test('each way up adds its library step, led by the fall hierarchy, and the draft passes H2 and H3', () => {
  const steps = { edge: 'Work at edges', restraint: 'Work at edges', ewp: 'Use an elevating work platform', scaffold: 'Work from the scaffold', mobileScaffold: 'Use mobile scaffolds', ladder: 'Work from ladders' };
  for (const task of [HOIST, STRESS, PIPEWORK]) {
    for (const [value, name] of Object.entries(steps)) {
      const result = draft(task, { fallControl: 'Workers wear harnesses.', fallAccess: value });
      assert.equal(result.kind, 'draft', `${value}: ${(result.missing || []).join('; ')}`);
      const step = result.jobSteps.find((item) => item.step === name);
      assert.ok(step, `${value}: ${name}`);
      assert.ok(step.controls[0].startsWith(HIERARCHY), `${value}: hierarchy first`);
      assert.deepEqual(hard(result), [], `${task} ${value}`);
      // The step comes before the first step that works at height.
      const names = result.jobSteps.map((item) => item.step);
      const firstHigh = result.jobSteps.findIndex((item) => item.step !== name && item.step !== 'Before starting' && item.hazards.some((line) => /\b(?:a (?:person )?falls?|falls? (?:from|into|through|off)|heights?)\b/i.test(line)));
      if (firstHigh >= 0) assert.ok(names.indexOf(name) < firstHigh, `${value}: ${names.join(' > ')}`);
    }
  }
});

test('travel restraint keeps the anchor and rescue line and ticks the harness', () => {
  const result = draft(HOIST, { fallControl: 'Workers at the edge use travel restraint.', fallAccess: 'restraint' });
  const edge = result.jobSteps.find((step) => step.step === 'Work at edges');
  assert.ok(edge.controls.some((line) => /^Where harnesses are used, anchors are engineer designed/.test(line)));
  assert.ok(result.ppe.flatMap((group) => group.items).find((item) => item.id === 'harness').ticked);
  // Edge protection chosen instead: no harness lines, no harness ticked.
  const plain = draft(HOIST, { fallControl: 'Edge protection is installed around every open edge.', fallAccess: 'edge' });
  assert.ok(!plain.jobSteps.find((step) => step.step === 'Work at edges').controls.some((line) => /^Where harnesses are used/.test(line)));
});

test('left blank, the fall control answer can name the way up; a harness alone cannot', () => {
  // Named in the answer: the step is added without the choice.
  const named = draft(HOIST, { fallControl: 'Mast ties are fixed from a scissor lift with guardrails.' });
  assert.equal(named.kind, 'draft');
  assert.ok(named.jobSteps.some((step) => step.step === 'Use an elevating work platform'));
  assert.deepEqual(hard(named), []);
  // Full height landing gates are edge protection at the landings.
  const gates = draft('Operate the personnel and materials hoist, carrying workers and materials to each floor.', { fallControl: 'Every landing has a full height landing gate that stays closed unless the car is at the landing.' });
  assert.ok(gates.jobSteps.some((step) => step.step === 'Work at edges'));
  assert.deepEqual(hard(gates), []);
  // A harness alone names no way up: stood down until the question is answered.
  const harness = draft(STRESS, { fallControl: 'Workers wear harnesses clipped to anchors.' });
  assert.equal(harness.kind, 'stand-down');
  assert.ok(harness.missing.includes('Working at height'));
  // Where the fall control answer printed in a step already stops a fall, nothing is added.
  const rooftop = draft('Telecommunications equipment maintenance', { fallControl: 'Roof edge guardrail is installed to every open edge before work starts.' });
  assert.equal(rooftop.kind, 'draft');
  assert.ok(!rooftop.jobSteps.some((step) => step.step === 'Work at edges'));
});

test('the scaffold step reuses library lines word for word, each with its source', () => {
  const step = ACTIVITIES.find((item) => item.when === 'scaffoldUse').steps[0];
  assert.equal(step.step, 'Work from the scaffold');
  const elsewhere = new Set(ACTIVITIES.filter((item) => item.when !== 'scaffoldUse').flatMap((item) => item.steps).flatMap((item) => item.controls).map((line) => (typeof line === 'string' ? line : line.text)));
  for (const line of step.controls) {
    assert.ok(elsewhere.has(line.text), line.text);
    assert.ok(line.source, `no source: ${line.text}`);
  }
  // The hierarchy line on the other access steps shows only when the step was added for falls.
  for (const when of ['ewp', 'mobileScaffold', 'ladderUse', 'wpEdge']) {
    const first = ACTIVITIES.find((item) => item.when === when).steps[0].controls[0];
    assert.equal(first.only, 'fallAccess', when);
    assert.equal(first.text, HIERARCHY, when);
  }
  const picked = prepareDraft({ state: 'qld', task: 'Paint the ceilings from a scissor lift.', fallRisk: 'no', facts: { safetyDataSheet: 'Water-based acrylic.' } });
  const ewp = picked.jobSteps.find((item) => item.step === 'Use an elevating work platform');
  assert.ok(ewp && !ewp.controls.some((line) => line.startsWith(HIERARCHY)));
});

test('H3 does not read "fall prevention comes before fall arrest" as a harness', () => {
  const swms = {
    state: 'qld', task: 'Install pipework in ceilings.', fallRisk: 'yes', site: { address: '1 A St', conditions: ['Level slab.'] },
    highRisk: ['Involves a risk of a person falling more than 2m'], ppe: [], plant: [], emergency: [], signatures: [],
    steps: [{ step: 'Install mechanical pipework', hazards: ['A fall from a platform, ladder or open riser.'], controls: ['Work from the floor or a platform. Where these cannot reach the work, fall prevention comes before work positioning or fall arrest.', 'Where harnesses are used, anchors are approved by a competent person.'] }],
  };
  const h3 = (input) => checkSwms(input, { state: 'qld' }).findings.find((item) => item.rule === 'H3');
  assert.equal(h3(swms).pass, false);
  assert.match(h3(swms).message, /^Falls have no edge protection/);
  swms.steps[0].controls.push('Workers wear a harness clipped to the anchor.');
  assert.match(h3(swms).message, /harness alone/);
});
