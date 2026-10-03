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
  assert.ok(steps(d).includes('Drill, charge and fire the blast'));
  assert.ok(names(d).includes('Explosives'));
  assert.ok(!steps(draft('nsw', 'Abrasive blast the steel girders')).includes('Drill, charge and fire the blast'));
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
