// Faults found by the testing agent in the 12-hour run (backlog #38 to #43).
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft } = require('../draft');

const draft = (state, task, facts = {}) => prepareDraft({ state, task, fallRisk: 'no', facts });
const names = (d) => (d.hazards || []).map((row) => row.hazard);
const steps = (d) => (d.jobSteps || []).map((step) => step.step);

test('#38 contaminated fill is recognised in any excavation', () => {
  const d = draft('wa', 'Excavate contaminated fill near the school fence with a 5t excavator');
  assert.equal(d.kind, 'draft');
  assert.ok(names(d).includes('Contaminated ground'));
  assert.ok(d.highRisk.some((label) => /contaminated or flammable atmosphere/i.test(label)));
  assert.ok(steps(d).includes('Handle contaminated or unknown material in the spoil'));
  assert.ok(names(d).includes('Public near the work'), 'a school next to the work');
});

test('#39 conveyor idler replacement gets isolation steps, not earthmoving', () => {
  for (const [state, task] of [['qld', 'Replace conveyor idlers on the coal loader'], ['nsw', 'Replace worn idlers and the return belt scraper on the conveyor at the water treatment plant']]) {
    const d = draft(state, task);
    assert.equal(d.kind, 'draft', task);
    assert.ok(steps(d).includes('Isolate the conveyor and replace parts'), task);
    assert.ok(!steps(d).includes('Run earthmoving plant'), task);
  }
});

test('#40 drill and blast has a shotfirer step and the explosives category', () => {
  const d = draft('tas', 'Drill and blast the hydro headrace tunnel heading, licensed shotfirer, 3 m advances');
  assert.equal(d.kind, 'draft');
  assert.ok(steps(d).includes('Charge and fire the blast'));
  assert.ok(names(d).includes('Explosives'));
  assert.ok(!steps(draft('nsw', 'Abrasive blast the steel girders')).includes('Charge and fire the blast'));
});

test('#41 the hazard summary carries the main hazards of the job steps', () => {
  const d = draft('vic', 'Replace the stormwater main along the road near the school');
  for (const name of ['Traffic', 'Underground services', 'Trench or excavation collapse', 'Moving plant', 'Public near the work']) assert.ok(names(d).includes(name), name);
});

test('#43 river below is work near water; welding and cutting bring a hot work hazard', () => {
  const facts = { harnessSystem: 'Full body harness anchored to the EWP basket point.', lifeJacketDetails: 'Level 150 inflatable life jackets.', drowningControls: 'Rescue boat on standby.', hotWorkPermit: 'Hot work permit and a 30 minute fire watch.' };
  assert.ok(names(draft('nsw', 'Replace bridge deck handrails with the river below, EWP on the deck', facts)).includes('Water or other liquid'));
  const weld = draft('nsw', 'Grind and weld new brackets to the existing steel frame in the plant room, hot works permit', facts);
  assert.equal(weld.kind, 'draft', 'welding to existing steel is not steel erection');
  assert.ok(names(weld).includes('Hot work'));
  assert.ok(!names(draft('nsw', 'Replace the hot water heater near the water tanks', facts)).includes('Water or other liquid'));
});

test('Safe Work Australia\'s 18 worked examples each raise their own high risk category', () => {
  const examples = [
    ['Telecommunications equipment maintenance on a telecommunications tower', /telecommunication/i],
    ['Removing bracing from a wall using an excavator', /demolition/i],
    ['Blasting to prepare for construction of a road', /explosives/i],
    ['Working near fuel or refrigerant lines', /fuel|refrigerant|chemical/i],
    ['Using an oxy torch to remove pipework that may contain the residue of hazardous chemicals', /contaminated or flammable atmosphere/i],
    ['Building a road adjacent to an existing roadway', /road/i],
    ['Working inside enclosed roof cavity in hot weather', /temperature/i],
    ['Installing shade sails over a swimming pool', /drowning|water/i],
    ['Diver undertaking structural repairs to the jetty of a waterfront home', /diving/i],
  ];
  const { highRiskMatches } = require('../draft');
  for (const [task, label] of examples) {
    const found = prepareDraft({ state: 'nsw', task, fallRisk: 'no' });
    const labels = found.highRisk && found.highRisk.length ? found.highRisk : (highRiskMatches ? highRiskMatches(task, 'no', require('../legislation').findState('nsw')).map((item) => item.label) : []);
    assert.ok(labels.some((text) => label.test(text)), `${task}: ${labels.join(' / ')}`);
  }
  // Abrasive blasting and a pool deck are not explosives or work over water.
  assert.equal(prepareDraft({ state: 'nsw', task: 'Abrasive blasting of the bridge girders before repainting', fallRisk: 'no' }).kind, 'draft');
  assert.ok(!prepareDraft({ state: 'nsw', task: 'Install the pool fence over the pool deck', fallRisk: 'no' }).highRisk.length);
});

test('F-011 cutting a concrete floor slab with a power saw gets the cutting step and silica controls', () => {
  const d = draft('nsw', 'Cut the concrete floor slab with a power saw, silica dust');
  assert.equal(d.kind, 'draft');
  assert.ok(steps(d).includes('Saw cut concrete'));
  assert.ok(names(d).includes('Respirable crystalline silica'));
  assert.ok(d.jobSteps.flatMap((step) => step.controls).some((line) => /s 529CA/.test(line)), 'written silica assessment');
  assert.ok(!steps(draft('nsw', 'Cut the timber floor with a power saw')).includes('Saw cut concrete'));
});

test('F-012 Wi-Fi access points are recognised without the word cabling', () => {
  for (const task of ['Install Wi-Fi access points in the school classrooms', 'Install the Wi-Fi access points and cabling in the office ceiling']) {
    const d = draft('nsw', task, { liveElectrical: 'no' });
    assert.equal(d.kind, 'draft', task);
    assert.ok(steps(d).includes('Mount the Wi-Fi access points'), task);
  }
});

test('#48 directional bore wording gets the directional drill step; its entry and exit pits are not spaces entered', () => {
  const d = draft('act', 'Directional bore the comms duct under the roundabout, entry and exit pits, traffic control and services');
  assert.equal(d.kind, 'draft');
  assert.ok(steps(d).some((step) => /directional drill/.test(step)));
  assert.ok(!(d.missing || []).includes('Confined space entry'));
  assert.ok(draft('qld', 'Enter the sewer pit to replace the pump').missing.includes('Confined space entry'), 'a pit that is entered still asks');
});

test('F-013 core drilling and chasing put respirable crystalline silica in the hazard summary', () => {
  const facts = { silicaControls: 'Wet coring and on-tool extraction with an H class vacuum, P2 respirators fit tested.' };
  for (const task of ['Core drill and chase the office walls for the new services, concrete dust and silica, water and RPE', 'Chase the brick walls for conduits']) {
    const d = draft('nsw', task, facts);
    assert.equal(d.kind, 'draft', task);
    assert.ok(names(d).includes('Respirable crystalline silica'), task);
  }
});

test('F-014 a scope\'s exclusions do not name its trade or add tasks for excluded trades', () => {
  const { tasksFromScope } = require('../scope');
  const steel = tasksFromScope(`PROJECT: Northgate Logistics Hub - Warehouse B
ADDRESS: 120 Export Pkwy, Pinkenba QLD 4008
PACKAGE: Structural steel & metalwork subcontract (Tier 1 PC: Meridian Build)
INCLUSIONS: supply and erect structural steel frame incl columns, rafters, bracing; mobile crane lifts; bolt-up and plumb at height on EWP; install mezzanine steel; roof and wall purlins; safety mesh.
EXCLUSIONS: concrete, cladding, electrical, fire services.
REFS: dwgs S-200 to S-260 rev D; spec ST-02; ITP per QA plan. Staging: columns wk1, rafters wk2-3, purlins wk4.
SITE RULES: SWMS before start, crane exclusion zones, spotter, high-vis, no lone work at height.`);
  assert.deepEqual(steel.tasks.map((task) => task.id).sort(), ['steelErect', 'steelLift']);
  assert.ok(!steel.trades.includes('electrical') && !steel.trades.includes('fire'));
  const civil = tasksFromScope(`PROJECT: Test Civil
ADDRESS: 1 Test Rd, Penrith NSW 2750
PACKAGE: Civil and stormwater
INCLUSIONS: bulk earthworks; lay 450mm RCP stormwater in shored trenches; precast pits set by crane; road pavement.
EXCLUSIONS: electrical, demolition, landscaping.`);
  assert.ok(!civil.tasks.some((task) => task.id === 'electrical'));
  assert.ok(civil.tasks.some((task) => task.id === 'trench'));
});
