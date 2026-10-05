// SiteReady's own drafts pass SiteReady's own builder check (owner approved, 5 October 2026):
// 90 or more and no hard fails, with controls in hierarchy order, a responsible position for
// each step, and the permits that digging and work near electric lines need.
const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { checkSwms, fromDraft, isVague } = require('../builder-check');
const { controlLevel, inHierarchyOrder } = require('../control-level');
const { prepareDraft } = require('../draft');
const { draftBody } = require('../input');
const { ACTIVITIES } = require('../activities');
const { localControl } = require('../citations');
const { draftToDocx } = require('../docx-draft');
const { HIERARCHY, findState } = require('../legislation');
const scenarios = require('../scenarios/scenarios.json');

// Filled in as a user would before sending the SWMS to the builder.
const SITE = {
  workplace: '12 Smith Street, Paddington QLD 4064', principalContractor: 'ABC Builders Pty Ltd', complianceResponsible: 'Sam Lee, supervisor',
  date: '5 October 2026', reviewDate: '5 November 2026',
  site: { liveServices: 'Overhead power on the street, 6 m from the work.', publicInterface: 'The footpath stays open behind a hoarding.', otherTrades: 'No other trades work under ours.', ground: 'Level, firm ground.', access: 'Side gate on the east boundary; deliveries by the driveway.' },
};
const STATES = ['qld', 'nsw', 'vic', 'wa', 'sa', 'tas', 'act', 'nt'];
// Other trades, typed as a user would type them.
const TYPED = [
  { task: 'Replace an electric hot water system in the laundry of a house.' },
  { task: 'Tile a bathroom floor and walls in a house.' },
  { task: 'Build a timber deck at the back of a house, with post holes dug by hand.' },
  { task: 'Install a pool fence around an inground pool.' },
  { task: 'Dig a trench 600 mm deep across the front yard to lay a new stormwater pipe.' },
  { task: 'Install a split system air conditioner in a house.' },
  { task: 'Plasterboard walls and ceilings in a new office fit-out.' },
  { task: 'Replace a sewer line under a driveway, in a trench 1.8 m deep.', facts: { trenchSupport: 'Trenches 1.5 m deep or more are shored with a trench shield rated for 2.4 m, as designed by the supplier\'s engineer.' } },
];

function drafted(state, item) {
  const draft = prepareDraft(draftBody({ state, fallRisk: 'no', ...item, ...SITE }));
  assert.equal(draft.kind, 'draft', `${state}: ${item.task}`);
  return draft;
}
// Review dates are judged against a fixed day, so the result does not change as time passes.
const checked = (state, draft) => checkSwms(fromDraft(draft, { state, swms: { signatures: [{ name: 'Jo Smith' }] } }), { state, today: '2026-10-05' });
const points = (result, rule) => result.findings.find((item) => item.rule === rule).points;
function scenario(index) {
  const { task, fallRisk, facts, residential, crane } = scenarios[index];
  return { task, fallRisk, facts, residential, crane };
}

test('SiteReady drafts across trades and states score 90 or more with no hard fails', () => {
  const samples = [
    ...STATES.flatMap((state) => scenarios.map((item, index) => [state, scenario(index)])),
    ...TYPED.map((item) => ['qld', item]),
  ];
  for (const [state, item] of samples) {
    const result = checked(state, drafted(state, item));
    const label = `${state}: ${item.task.slice(0, 70)}`;
    assert.deepEqual(result.hardFails, [], label);
    assert.ok(result.score >= 90, `${label} scores ${result.score}`);
    for (const rule of ['W10', 'W11', 'W12']) assert.equal(points(result, rule), 5, `${label} ${rule}`);
  }
});

test('no library control leaves the decision to the worker, in any state', () => {
  for (const activity of ACTIVITIES) {
    for (const step of activity.steps) {
      for (const control of step.controls) {
        if (!control || (typeof control !== 'string' && typeof control.text !== 'string')) continue;
        const text = typeof control === 'string' ? control : control.text;
        for (const state of STATES) {
          const line = localControl(text, typeof control === 'string' ? '' : control.source || '', state);
          assert.ok(!isVague(line), `${state} ${activity.when} / ${step.step}: ${line}`);
        }
      }
    }
  }
});

test('each step lists its controls in hierarchy order, keeping the written order within a level', () => {
  const rank = (line) => HIERARCHY.indexOf(controlLevel(line));
  for (const index of scenarios.keys()) {
    for (const step of drafted('qld', scenario(index)).jobSteps) {
      const ranks = step.controls.map(rank);
      assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), step.step);
    }
  }
  assert.deepEqual(inHierarchyOrder(['Wear gloves.', 'Read the plan.', 'Fit guardrails.', 'Check the plan.', 'Eliminate the task.']),
    ['Eliminate the task.', 'Fit guardrails.', 'Read the plan.', 'Check the plan.', 'Wear gloves.']);
});

test('digging needs an excavation permit after the services are located; work near electric lines needs a permit to work and the network operator\'s written permission', () => {
  const trench = drafted('qld', scenario(1));
  const locate = trench.jobSteps.find((step) => step.step === 'Locate underground services');
  assert.ok(locate.controls.some((line) => /^No digging starts until an excavation permit is issued/.test(line) && /Before You Dig Australia plans are on site and the underground services .* are located and marked/.test(line)));
  const deck = drafted('qld', TYPED[2]);
  assert.ok(deck.jobSteps.find((step) => step.step === 'Dig post holes').controls.some((line) => /excavation permit/.test(line)));
  const carport = drafted('qld', scenario(6));
  const plan = carport.jobSteps.find((step) => step.step === 'Plan the work near overhead power lines');
  assert.ok(plan.controls.some((line) => /a permit to work near the lines is issued/.test(line) && /network operator's written permission or approval/.test(line)));
  // Work with no digging and no lines gets neither.
  const paint = drafted('qld', scenario(7)).jobSteps.flatMap((step) => step.controls).join('\n');
  assert.doesNotMatch(paint, /excavation permit|permit to work near the lines/);
});

test('each step names a responsible position, printed in the Who column', async () => {
  const trench = drafted('qld', scenario(1));
  const who = Object.fromEntries(trench.jobSteps.map((step) => [step.step, step.responsible]));
  assert.equal(who['Before starting'], 'Supervisor');
  assert.equal(who['Locate underground services'], 'Supervisor');
  assert.equal(who.Excavate, 'Plant operator');
  assert.equal(who['Connect to the live sewer'], 'Licensed plumber');
  assert.ok(trench.jobSteps.every((step) => step.responsible));
  assert.equal(drafted('qld', scenario(8)).jobSteps.find((step) => step.step === 'Erect the scaffold').responsible, 'Licensed scaffolder');
  const xml = await (await JSZip.loadAsync(await draftToDocx(trench, {}))).file('word/document.xml').async('string');
  assert.match(xml, />Who</);
  assert.match(xml, />Plant operator</);
  assert.match(xml, />Licensed plumber</);
});

// Wide sample of SiteReady's own drafts (415 SWMS from the saved scope readings, Qld): the high
// risk work a step brings, three false matches, and hot work, isolation and confined space permits.
const { highRiskMatches } = require('../draft');
const ENERGISED = /energised electrical installations/i;
const FIT_OFF = { task: 'Electrical fit-off in a new office: fit off light fittings, power points and switches, then test the new work.', facts: { energisedWork: 'none', isolationProcedure: 'The circuit is isolated at the board, locked and tagged, and proved dead with a tested voltage tester.' } };

test('a "Work on or near energised parts" step brings the energised electrical category; work with no such step does not get it', () => {
  const fitOff = drafted('qld', FIT_OFF);
  assert.ok(fitOff.jobSteps.some((step) => step.step === 'Work on or near energised parts'));
  assert.ok(fitOff.highRisk.some((item) => ENERGISED.test(item)));
  assert.deepEqual(checked('qld', fitOff).hardFails, []);
  // The register follows the list: low voltage rescue and an electric shock emergency row.
  assert.ok(fitOff.qualifications.some((item) => /low voltage rescue/i.test(item.name || item)));
  for (const item of [TYPED[1], TYPED[6], TYPED[4]]) {
    const draft = drafted('qld', item);
    assert.ok(!draft.jobSteps.some((step) => /energised/i.test(step.step)), item.task);
    assert.ok(!draft.highRisk.some((line) => ENERGISED.test(line)), item.task);
  }
});

test('air shaft voids and sewer pump station inspections are not trench work; precast pits are not precast panel work', () => {
  const checks = (text) => highRiskMatches(text, 'no', 'qld').map((item) => item.check);
  assert.ok(!checks('Supply, erect and strip support to large air shaft voids.').includes('trench'));
  for (const text of ['Install precast pits.', 'Lift and place tanks, pits or precast units', 'Lay precast concrete pipes and culverts in the trench.']) assert.ok(!checks(text).includes('precast'), text);
  // Genuine trench, shaft and precast panel work still are.
  assert.ok(checks('Excavate a 2.4 m trench for a sewer main with an excavator.').includes('trench'));
  assert.ok(checks('Excavate a trench for a sewer main with an excavator.').includes('trench'));
  for (const text of ['Erect precast concrete wall panels with a mobile crane.', 'Erect tilt-up panels.', 'Set out and install precast units for the facade.']) assert.ok(checks(text).includes('precast'), text);
  // Inspecting a sewer pump station (in a list that names buildings) is not digging a wet well; installing one is.
  const sds = { safetyDataSheet: 'The products are used with good ventilation, with the gloves and eye protection their safety data sheets list.' };
  const inspect = drafted('qld', { task: 'Maintain site accommodation plumbing including monthly sewer pump station inspections (Site accommodation). Interim maintenance of commissioned systems (Commissioned buildings).', kinds: ['cleaning'], facts: sds });
  assert.ok(!inspect.highRisk.some((item) => /shaft or trench/i.test(item)));
  const install = drafted('qld', { task: 'Install new sewer pump stations with control panels and covers.' });
  assert.ok(install.highRisk.some((item) => /shaft or trench/i.test(item)));
});

test('hot work, isolating plant or services, and confined space work each name their permit', () => {
  const lines = (draft) => draft.jobSteps.flatMap((step) => step.controls).join('\n');
  // Brazing refrigerant pipework is hot work.
  const braze = drafted('qld', { task: 'Install remote refrigeration.', kinds: ['refrigerantPipework', 'refrigerantTest', 'refrigerantCharge'], facts: { refrigerantClass: 'a1', pressureTesting: 'Oxygen-free nitrogen through a regulator with a relief valve, tested to 2,000 kPa, with the area barricaded and signed.' } });
  assert.ok(braze.jobSteps.find((step) => step.step === 'Braze refrigerant pipework').controls.some((line) => /^No hot work \(welding, brazing.*\) starts until a hot work permit is issued/.test(line)));
  // Plant isolated for commissioning.
  const commission = drafted('qld', { task: 'Test and commission mechanical installations.', kinds: ['mechCommissioning', 'isolation'], facts: { isolationProcedure: 'Circuits are isolated, locked with personal locks and danger tagged, and tested de-energised by a licensed electrician before work.', energisedWork: 'none', plantIsolation: 'Each unit is isolated at its local isolator and locked out with personal padlocks, and tested by trying to start it.' } });
  assert.ok(commission.jobSteps.some((step) => /^Isolate/.test(step.step) && step.controls.some((line) => /an isolation permit is issued/.test(line))));
  // Water and power isolated to replace a hot water system: commercial work needs the isolation permit,
  // domestic work does not (owner decision, 5 October 2026).
  assert.match(lines(drafted('qld', { task: 'Replace a hot water system in a commercial kitchen: isolate the water supply and power, remove the old unit and install the new one.' })), /an isolation permit is issued/);
  assert.doesNotMatch(lines(drafted('qld', { task: 'Replace a hot water system in a house: isolate the water supply and power, remove the old unit and install the new one.' })), /isolation permit/);
  // Near a sewer pump well, a confined space.
  const sds = { safetyDataSheet: 'The products are used with good ventilation, with the gloves and eye protection their safety data sheets list.' };
  const pumps = drafted('qld', { task: 'Maintain site accommodation plumbing including monthly sewer pump station inspections (Site accommodation). Interim maintenance of commissioned systems (Commissioned buildings).', kinds: ['cleaning'], facts: sds });
  assert.match(lines(pumps), /No person enters a confined space until a confined space entry permit is issued/);
  for (const draft of [braze, commission, pumps]) {
    const result = checked('qld', draft);
    assert.deepEqual(result.hardFails, [], draft.task);
    assert.equal(points(result, 'W12'), 5, draft.task);
    // "Permit system" would make the check ask for a roof access permit too.
    assert.doesNotMatch(lines(draft), /permit (?:to work )?system/i);
  }
  // Painting welds already made and heat welding vinyl are not hot work; tiling needs none of these permits.
  const roof = drafted('qld', { task: 'Paint the welds on the steel handrails with a brush.', facts: sds });
  assert.doesNotMatch(lines(roof), /No hot work \(welding/);
  const vinyl = drafted('qld', { task: 'Install sheet vinyl with heat-welded joins and coving in the wards.', kinds: ['floorLay', 'floorAdhesive', 'floorLevel'], facts: sds });
  assert.doesNotMatch(lines(vinyl), /No hot work \(welding/);
  assert.doesNotMatch(lines(drafted('qld', TYPED[1])), /hot work permit is issued|isolation permit is issued|confined space entry permit is issued/);
});

test('gas piping listed as high risk work brings gas controls, even where no gas fitting step was picked', () => {
  // The task names gas supply pipework, but the steps picked are for the water heater, pumps and risers.
  const task = 'Install hot water plant. Install hot water circulation pumps. Provide water and gas supplies to mechanical plant terminated with valved branch (Mechanical plant).';
  const facts = { safetyDataSheet: 'The products are used with good ventilation, with the gloves and eye protection their safety data sheets list.' };
  for (const state of ['vic', 'qld', 'act']) {
    const draft = drafted(state, { task, kinds: ['waterHeater', 'pumpInstall', 'hydraulicRisers'], facts });
    assert.ok(draft.highRisk.some((item) => /pressurised gas/i.test(item)), state);
    const step = draft.jobSteps.find((item) => item.controls.some((line) => /^Gas pipework is installed, connected and tested only by a licensed gas fitter\./.test(line)));
    assert.ok(step && step.step !== 'Before starting', state);
    assert.deepEqual(checked(state, draft).hardFails, [], state);
  }
  // A gas fitting step already controls the gas, so the line is not added as well.
  const fitted = drafted('qld', { task: 'Install a gas hot water system in a house and connect it to the gas line.' });
  assert.ok(fitted.jobSteps.some((step) => step.step === 'Connect, leak test and commission the gas appliance'));
  assert.ok(!fitted.jobSteps.some((step) => step.controls.some((line) => /^Gas pipework is installed/.test(line))));
});

test('Victoria: labelling plant to be retained or demolished is not demolition work', () => {
  const label = 'Identify, label and protect existing plant, pipework, cabling and ductwork to be retained or demolished (Visitor Processing building).';
  const vic = (text) => highRiskMatches(text, 'no', findState('vic')).map((item) => item.check);
  assert.ok(!vic(label).includes('demolitionAny'));
  assert.ok(!vic(`Install split system units in the plant room. ${label}`).includes('demolitionAny'));
  // Demolishing it is.
  assert.ok(vic('Demolish the existing plant, pipework and ductwork.').includes('demolitionAny'));
  assert.ok(vic(`${label} Demolish the redundant ductwork.`).includes('demolitionAny'));
  const draft = drafted('vic', { task: `Install two temporary DX fan coil units with drip trays and drains in the operating server room. ${label}`, kinds: ['splitInstall', 'serviceLabels'] });
  assert.ok(!draft.highRisk.includes('Involving demolition'));
  assert.ok(!checked('vic', draft).hardFails.includes('H2'));
});

test('ACT: silica processing needs the material and the power tool in the same sentence or step', () => {
  const act = (text) => highRiskMatches(text, 'no', findState('act')).some((item) => item.check === 'silica');
  // A substrate for a stone top, and a power tools step for the timber joinery, is not processing stone.
  assert.ok(!act('Install business centre joinery including substrate for stone and 40mm dowel (Building 2B, business centre).\nBefore starting\nUse power tools\nInstall joinery and cabinets'));
  assert.ok(act('Cut and grind concrete pavers with an angle grinder.'));
  assert.ok(act('Install joinery.\nDrill or cut concrete, masonry or stone'));
  const draft = drafted('act', { task: 'Install business centre joinery including substrate for stone and 40mm dowel (Building 2B, business centre).', kinds: ['carpJoinery', 'carpentryWork'] });
  assert.ok(!draft.highRisk.some((item) => /silica/i.test(item)));
  assert.deepEqual(checked('act', draft).hardFails, []);
});

test('permit lines carry their code sources for the state; a permit or gas line the user removed stays out', () => {
  const lines = (draft) => draft.jobSteps.flatMap((step) => step.controls);
  const dig = (state) => lines(drafted(state, scenario(1))).find((line) => /^No digging starts until an excavation permit/.test(line));
  assert.match(dig('qld'), /\(Excavation work Code of Practice 2021 \(Qld\) s 3\.6\)$/);
  assert.match(dig('nsw'), /\(SafeWork NSW Code of practice: Excavation work \(January 2020\) s 3\.6\)$/);
  // A model code is not cited in a state whose code has not been checked.
  assert.match(dig('wa'), /marked on the ground\.$/);
  const near = (state) => lines(drafted(state, scenario(6))).find((line) => /a permit to work near the lines is issued/.test(line));
  assert.match(near('qld'), /Working near overhead and underground electric lines \(Qld\) s 2\.3, s 3, s 3\.4\)$/);
  assert.match(near('nsw'), /Work near overhead and underground electric lines \(May 2026\) s 3, s 4\.4, s 5\.2\)$/);
  const braze = { task: 'Install remote refrigeration.', kinds: ['refrigerantPipework', 'refrigerantTest', 'refrigerantCharge'], facts: { refrigerantClass: 'a1', pressureTesting: 'Oxygen-free nitrogen through a regulator with a relief valve, tested to 2,000 kPa, with the area barricaded and signed.' } };
  const hot = (state) => lines(drafted(state, braze)).find((line) => /^No hot work \(welding/.test(line));
  assert.match(hot('qld'), /\(Welding processes Code of Practice 2021 \(Qld\) s 3\.4\)$/);
  assert.match(hot('nsw'), /\(SafeWork NSW Code of practice: Welding processes \(December 2022\) s 3\.4\)$/);
  const commission = { task: 'Test and commission mechanical installations.', kinds: ['mechCommissioning', 'isolation'], facts: { isolationProcedure: 'Circuits are isolated, locked with personal locks and danger tagged, and tested de-energised by a licensed electrician before work.', energisedWork: 'none', plantIsolation: 'Each unit is isolated at its local isolator and locked out with personal padlocks, and tested by trying to start it.' } };
  const iso = (state) => lines(drafted(state, commission)).find((line) => /an isolation permit is issued/.test(line));
  assert.match(iso('qld'), /Managing risks of plant in the workplace Code of Practice 2021 \(Qld\) s 4\.5; Electrical Safety Code of Practice 2021: Managing electrical risks in the workplace \(Qld\) s 4\.1, s 5\.1\)$/);
  assert.match(iso('nsw'), /Managing the risks of plant in the workplace \(December 2022\) s 4\.5; SafeWork NSW Code of practice: Managing electrical risks in the workplace \(August 2019\) s 4\.1, s 5\.1\)$/);
  const sds = { safetyDataSheet: 'The products are used with good ventilation, with the gloves and eye protection their safety data sheets list.' };
  const pumps = { task: 'Maintain site accommodation plumbing including monthly sewer pump station inspections (Site accommodation). Interim maintenance of commissioned systems (Commissioned buildings).', kinds: ['cleaning'], facts: sds };
  const entry = (state) => lines(drafted(state, pumps)).find((line) => /confined space entry permit is issued/.test(line));
  assert.match(entry('qld'), /\(Work Health and Safety Regulation 2011 \(Qld\) s 67, s 69; Confined spaces Code of Practice 2021 \(Qld\) s 4\.3, s 4\.5, s 4\.6\)$/);
  assert.match(entry('nsw'), /\(Work Health and Safety Regulation 2025 \(NSW\) s 67, s 69; SafeWork NSW Code of practice: Confined spaces \(December 2022\) s 4\.3, s 4\.5, s 4\.6\)$/);

  // The user removes the excavation permit: it stays out, and the change is reported.
  const locate = drafted('qld', scenario(1)).jobSteps.find((step) => step.step === 'Locate underground services');
  const permit = locate.controls.find((line) => /excavation permit/.test(line));
  const removed = drafted('qld', { ...scenario(1), controlEdits: { 'Locate underground services': { removed: [permit] } } });
  assert.ok(!lines(removed).some((line) => /excavation permit/.test(line)));
  assert.ok(removed.controlEdits.applied.some((item) => item.kind === 'removed' && item.from === permit));
  // The gas piping line, added after the user's changes, stays out once removed.
  const gasTask = { task: 'Install hot water plant. Install hot water circulation pumps. Provide water and gas supplies to mechanical plant terminated with valved branch (Mechanical plant).', kinds: ['waterHeater', 'pumpInstall', 'hydraulicRisers'], facts: sds };
  const gasStep = drafted('qld', gasTask).jobSteps.find((step) => step.controls.some((line) => /^Gas pipework is installed/.test(line)));
  const gasLine = gasStep.controls.find((line) => /^Gas pipework is installed/.test(line));
  const noGas = drafted('qld', { ...gasTask, controlEdits: { [gasStep.step]: { removed: [gasLine] } } });
  assert.ok(!lines(noGas).some((line) => /^Gas pipework is installed/.test(line)));
  // A confined space entry permit is a legal requirement (s 67): it can be removed (owner decision,
  // 6 October 2026), stays out, and the removal is warned about with the regulation cited.
  const entryLine = entry('qld');
  const gone = drafted('qld', { ...pumps, controlEdits: Object.fromEntries(drafted('qld', pumps).jobSteps.map((step) => [step.step, { removed: [entryLine] }])) });
  assert.ok(!lines(gone).includes(entryLine));
  const warned = gone.controlEdits.warned.find((item) => item.text === entryLine);
  assert.match(warned.warnings[0], /^This line is a legal requirement \(Work Health and Safety Regulation 2011 \(Qld\) s 67, s 69; Confined spaces Code of Practice 2021 \(Qld\) s 4\.3, s 4\.5, s 4\.6\)\..*confined space/);
});

test('the excavation gas monitor line applies where gas or contaminated soil is known or suspected, keeps its sources, and is not vague', () => {
  const found = ACTIVITIES.flatMap((group) => group.steps).flatMap((step) => step.controls).find((item) => item && /a gas monitor is worn by anyone in it/.test(item.text || ''));
  assert.match(found.text, /^Where gas or contaminated soil is known or suspected in the excavation, airborne contaminants are managed: a gas monitor is worn by anyone in it/);
  assert.equal(isVague(found.text), false);
  assert.match(localControl(found.text, found.source, 'qld'), /\(Work Health and Safety Regulation 2011 \(Qld\) s 305; Excavation work Code of Practice 2021 \(Qld\) s 4, s 4\.6\)$/);
  assert.match(localControl(found.text, found.source, 'nsw'), /SafeWork NSW Code of practice: Excavation work \(January 2020\) s 4, s 4\.6\)$/);
});
