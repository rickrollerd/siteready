const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor } = require('../draft');

// Most tests answer No so the task wording check is what is being tested.
const draft = (task, extra = {}) => prepareDraft({ state: 'qld', task, fallRisk: 'no', ...extra });
const FALL = 'Risk of a person falling more than 2 metres';

test('scaffold erection to 6 m stands down until a fall control is given', () => {
  const task = 'Erect a modular scaffold 4 bays by 2, top working platform at 6 m, ties to the slab edge at every lift.';
  const stood = draft(task);
  assert.equal(stood.kind, 'stand-down');
  assert.deepEqual(stood.missing, ['Fall control']);

  const done = draft(task, { facts: { fallControl: 'Erect from a fully decked platform with advance guardrails at each lift.' } });
  assert.equal(done.kind, 'draft');
  assert.ok(done.highRisk.includes(FALL));
  assert.ok(done.hazards.some((row) => row.hazard === 'Fall from height'));
  assert.ok(done.method.some((step) => /advance guardrails/.test(step)));
});

test('roof work on a two storey house is a fall risk', () => {
  assert.deepEqual(draft('Replace roof sheets on a two storey house.').missing, ['Fall control']);
  const done = draft('Replace roof sheets on a two storey house.', {
    facts: { fallControl: 'Edge protection is installed around the roof perimeter first.' },
  });
  assert.ok(done.highRisk.includes(FALL));
});

test('a length or a shallow depth is not a fall height', () => {
  const fence = draft('Replace a 3m length of fence.');
  assert.equal(fence.kind, 'draft');
  assert.deepEqual(fence.highRisk, []);
  assert.ok(!draft('Dig a trench 1 m deep with an excavator.').highRisk.includes(FALL));
});

test('a trench deeper than 1.5 m needs its support and gets a collapse hazard', () => {
  const task = 'Dig a trench 2 m deep for a stormwater pipe using an excavator.';
  assert.deepEqual(draft(task).missing, ['Trench support']);
  const done = draft(task, { facts: { trenchSupport: 'Trench box to 2.4 m, supplied by the hire company.' } });
  assert.ok(done.hazards.some((row) => row.hazard === 'Trench or excavation collapse'));
  assert.ok(done.controls.some((item) => /Trench box/.test(item.text)));
});

test('a trench of 1 m is not high risk trench work', () => {
  const done = draft('Dig a trench 1 m deep with an excavator.');
  assert.ok(!done.highRisk.some((item) => /trench/i.test(item)));
});

test('a fact that only says it was supplied does not count', () => {
  const vague = draft('Lift steel beams with a crane.', { facts: { craneChart: 'Chart supplied.' } });
  assert.equal(vague.kind, 'stand-down');
  assert.deepEqual(vague.missing, ['Crane chart (the text given does not state it)']);
  assert.equal(draft('Lift steel beams with a crane, chart supplied.').kind, 'stand-down');
  assert.equal(draft('Paint the office walls.', { facts: { safetyDataSheet: 'Attached.' } }).kind, 'stand-down');

  const stated = draft('Lift steel beams with a crane.', { facts: { craneChart: 'Rated capacity 6.2 t at 14 m radius.' } });
  assert.equal(stated.kind, 'draft');
});

test('each high risk category found has a hazard row', () => {
  const done = draft('Install a pump in a confined space.');
  assert.ok(done.highRisk.some((item) => /confined space/i.test(item)));
  assert.ok(done.hazards.some((row) => row.hazard === 'Confined space'));
});

test('overhead lines use the Queensland distance', () => {
  const done = draft('Relocate the switchboard near the overhead power lines.');
  const line = done.controls.find((item) => /overhead|line voltage/i.test(item.text));
  assert.ok(line);
  assert.match(line.text, /3\.0 m/);
  assert.doesNotMatch(line.text, /4\.0 m/);
});

test('the fall question must be answered', () => {
  const asked = questionsFor({ state: 'qld', task: 'Replace a 3m length of fence.' });
  assert.equal(asked.kind, 'error');
  assert.match(asked.explanation, /more than 2 metres/);
  assert.equal(prepareDraft({ state: 'qld', task: 'Replace a 3m length of fence.' }).kind, 'error');
});

test('Yes requires a fall control even when the wording does not show height', () => {
  const task = 'Replace a 3m length of fence.';
  assert.deepEqual(draft(task, { fallRisk: 'yes' }).missing, ['Fall control']);
  const done = draft(task, { fallRisk: 'yes', facts: { fallControl: 'The work is done from the ground.' } });
  assert.equal(done.kind, 'draft');
  assert.ok(done.highRisk.includes(FALL));
  assert.ok(done.hazards.some((row) => row.hazard === 'Fall from height'));
  assert.ok(done.controls.some((item) => item.level === 'Eliminate'));
  assert.equal(done.fallRisk, 'Yes');
});

test('No with work at height warns and still requires a fall control', () => {
  const task = 'Replace roof sheets on a two storey house.';
  const asked = questionsFor({ state: 'qld', task, fallRisk: 'no' });
  assert.match(asked.fall.warning, /still required/);
  assert.ok(asked.required.some((item) => item.id === 'fallControl'));
  const done = draft(task, { facts: { fallControl: 'Edge protection is installed around the roof perimeter first.' } });
  assert.match(done.fallRisk, /Treated as Yes/);
});

test('No on a task at ground level is recorded as No with no warning', () => {
  const asked = questionsFor({ state: 'qld', task: 'Replace a 3m length of fence.', fallRisk: 'no' });
  assert.equal(asked.fall.warning, '');
  assert.equal(draft('Replace a 3m length of fence.').fallRisk, 'No');
});
