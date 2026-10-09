const test = require('node:test');
const assert = require('node:assert/strict');
const { questionsFor, prepareDraft, workFlags } = require('../draft');
const { readSlang } = require('../slang');
const { TITLES, LABELS, PROBE } = require('./typed-titles.data');

// Goal 1: a subbie finds the task by typing it. The job step groups ticked for a typed title.
const ticked = new Map();
const ticks = (task) => {
  if (!ticked.has(task)) {
    const asked = questionsFor({ task, state: 'qld', fallRisk: 'no', crane: 'company' });
    ticked.set(task, (asked.steps && asked.steps.chosen) || []);
  }
  return ticked.get(task);
};
const passes = (row) => {
  const got = ticks(row.typed);
  return row.want.every((group) => group.some((id) => got.includes(id))) && !row.not.some((id) => got.includes(id));
};
const share = (rows, type) => {
  const list = type ? rows.filter((row) => row.type === type) : rows;
  return { pass: list.filter(passes).length, total: list.length, failing: list.filter((row) => !passes(row)).map((row) => row.typed) };
};

// The pass shares when this was built (7 October 2026). They may rise, never fall. Before this work:
// titles 224 of 343 (tasks 130 of 247), labels 179 of 285 (tasks 163 of 268), probe 44 of 65.
test('typed real SWMS titles tick the right job step groups (pass share holds)', () => {
  const all = share(TITLES);
  const tasks = share(TITLES, 'task');
  assert.ok(all.total === 343, 'the 343 real titles');
  assert.ok(all.pass >= 342, `real titles: ${all.pass} of ${all.total}; failing: ${all.failing.join(' | ')}`);
  assert.ok(tasks.pass >= 246, `real titles that are tasks: ${tasks.pass} of ${tasks.total}`);
});

test('typed catalogue task labels tick the right job step groups (pass share holds)', () => {
  const all = share(LABELS);
  const tasks = share(LABELS, 'task');
  assert.ok(all.total === 285, 'the 285 catalogue labels');
  assert.ok(all.pass >= 285, `catalogue labels: ${all.pass} of ${all.total}; failing: ${all.failing.join(' | ')}`);
  assert.ok(tasks.pass >= 268, `catalogue labels that are tasks: ${tasks.pass} of ${tasks.total}`);
});

test('the 65 titles typed in the goal 1 review tick the right job step groups', () => {
  const all = share(PROBE);
  assert.ok(all.pass >= 65, `probe titles: ${all.pass} of ${all.total}; failing: ${all.failing.join(' | ')}`);
});

test('title wording is read as the work it names', () => {
  assert.equal(readSlang('Installation of Switchboards'), 'install Switchboards');
  assert.equal(readSlang('INSTALLING DUCT WORK'), 'INSTALLING ductwork');
  assert.equal(readSlang('Storm Water Drainage'), 'stormwater Drainage');
  assert.equal(readSlang('Test & Tag Electrical Equipment'), 'Test and Tag Electrical Equipment');
  assert.equal(readSlang('WORKING ON ENERGIZED LOW VOLTAGE EQUIPMENT'), 'WORKING ON ENERGISED LOW VOLTAGE EQUIPMENT');
  assert.equal(readSlang(readSlang('Installation of Switchboards')), readSlang('Installation of Switchboards'));
  assert.ok(ticks('Cable and Ladder Tray Installation').includes('containment'));
  assert.ok(ticks('Conduit Installation, In Ground').includes('trench'));
  assert.ok(ticks('Conduit Installation, Placed Prior to Pouring Concrete').includes('castIn'));
  assert.ok(ticks('SWMS 03: Installation of Linings to Partition Walls and Ceilings').includes('plasterSheets'));
  assert.ok(ticks('Kerb and channel').includes('kerbInstall'));
  assert.ok(ticks('Sheet piling').includes('drivenPiles') && !ticks('Sheet piling').includes('pilingRig'));
  assert.ok(ticks('Water Truck').includes('earthworks'));
  assert.deepEqual(ticks('A LADDER'), ['ladderUse']);
});

test('work the library has no steps for is not forced onto a near step', () => {
  for (const task of ['Screw piles', 'Pile load and integrity testing', 'Erosion and sediment controls', 'Working in risers']) {
    const got = ticks(task);
    assert.ok(!got.some((id) => ['pilingRig', 'drivenPiles', 'pileComplete', 'earthworks'].includes(id)), `${task}: ${got.join(', ')}`);
  }
  assert.ok(!ticks('Rail welding and stressing (aluminothermic and flash butt)').includes('stressing'));
  assert.ok(!ticks('SWMS 10 / Installation of Insulated Wall Panels').includes('wallPanels'));
});

test('title rules do not fire on written tasks that use the same words another way', () => {
  // Lifting glass with vacuum lifters is not a crane lift; window reveals are not windows;
  // roof abutments are not bridge abutments; a line pump on a driveway pour stays the slab steps.
  assert.ok(!ticks('Install glass balustrades on the balconies at the edge, lifting glass panels with vacuum lifters, and sealing with silicone.').includes('craneInterface'));
  assert.ok(!ticks('Apply membrane to window reveals (Window reveals).').includes('windowInstall'));
  assert.ok(!ticks('Saw cut reglets for flashings (Building 4 roof abutments).').includes('formwork'));
  assert.ok(!ticks('Form and pour a concrete driveway and path at a house, with the concrete truck and a line pump in the street, open to traffic.').includes('concrete'));
  assert.ok(!ticks('Install cable tray and pull structured data cabling in the risers and corridor ceilings.').includes('containment'));
  assert.ok(!ticks('Protect and clean site and external infrastructure, footpaths, gutters and roadways.').includes('road'));
  assert.ok(ticks('Insulate the ductwork and chilled water pipework with glasswool and foam lagging, in the ceilings and risers.').includes('mechPipework'));
});

test('a scissor lift, boom lift or EWP used for access never ticks lift (elevator) installation', () => {
  const LIFT_KINDS = ['liftInstall', 'liftShaft', 'liftLifting', 'liftCar', 'liftCarWork'];
  for (const task of ['Install the signs from the scissor lift', 'Install the signs from a boom lift.', 'Install cable tray from the EWP lift.', 'Install the light fittings working from a knuckle boom lift.']) {
    const got = ticks(task);
    assert.ok(got.includes('ewp'), `${task}: ${got.join(', ')}`);
    assert.ok(!got.some((id) => LIFT_KINDS.includes(id)), `${task}: ${got.join(', ')}`);
  }
  // A lift that is the work keeps its steps, with or without an access lift.
  assert.ok(ticks('Install a new passenger lift in the shaft').includes('liftInstall'));
  assert.ok(ticks('Install new lifts, working from scissor lifts in the lobby').includes('liftInstall'));
  assert.ok(ticks('Install the lift landing doors from a scissor lift').includes('liftShaft'));
});

test('a typed title gets a draft, and the facts its job steps rely on are asked', () => {
  // Removing air conditioners is covered by the old services steps, so the draft is not stood down.
  const removal = prepareDraft({ state: 'qld', task: 'Removals of air conditioners', fallRisk: 'no', crane: 'company' });
  assert.notEqual(removal.kind, 'stand-down', JSON.stringify(removal.missing || removal.message || ''));
  // Kinds read from a title bring their facts like picked steps do.
  assert.ok(workFlags('Piers, columns and headstocks').titleKinds.includes('formwork'));
  const asked = questionsFor({ task: 'Piers, columns and headstocks', state: 'qld', fallRisk: 'no', crane: 'company' });
  assert.ok(asked.steps.chosen.includes('formwork'));
  assert.ok(asked.required.some((item) => item.id === 'formworkDesign'), asked.required.map((item) => item.id).join(', '));
});
