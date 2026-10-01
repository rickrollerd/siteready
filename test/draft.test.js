const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor } = require('../draft');

// Most tests answer No so the task wording check is what is being tested.
const draft = (task, extra = {}) => prepareDraft({ state: 'qld', task, fallRisk: 'no', ...extra });
const FALL = 'Involves a risk of a person falling more than 2m';

test('scaffold erection to 6 m stands down until a fall control is given', () => {
  const task = 'Erect a modular scaffold 4 bays by 2, top working platform at 6 m, ties to the slab edge at every lift.';
  assert.match(questionsFor({ state: 'qld', task, fallRisk: 'no' }).fall.warning, /mentions work at height/);
  const stood = draft(task, { fallRisk: 'yes' });
  assert.equal(stood.kind, 'stand-down');
  assert.deepEqual(stood.missing, ['Fall control']);

  const done = draft(task, { fallRisk: 'yes', facts: { fallControl: 'Erect from a fully decked platform with advance guardrails at each lift.' } });
  assert.equal(done.kind, 'draft');
  assert.ok(done.highRisk.includes(FALL));
  assert.ok(done.hazards.some((row) => row.hazard === 'Fall from height'));
  assert.ok(done.method.some((step) => /advance guardrails/.test(step)));
});

test('roof work on a two storey house is recognised as work at height', () => {
  assert.ok(questionsFor({ state: 'qld', task: 'Replace roof sheets on a two storey house.', fallRisk: 'no' }).fall.detected);
  assert.deepEqual(draft('Replace roof sheets on a two storey house.', { fallRisk: 'yes' }).missing, ['Fall control']);
  const done = draft('Replace roof sheets on a two storey house.', {
    fallRisk: 'yes',
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

test('No with work at height warns, and the No stands', () => {
  const task = 'Replace roof sheets on a two storey house.';
  const asked = questionsFor({ state: 'qld', task, fallRisk: 'no' });
  assert.match(asked.fall.warning, /go back and answer Yes/);
  assert.ok(!asked.required.some((item) => item.id === 'fallControl'));
  const done = draft(task);
  assert.equal(done.kind, 'draft');
  assert.ok(!done.highRisk.includes(FALL));
  assert.match(done.fallRisk, /user confirmed no one can fall more than 2 metres/);
});

test('No on a task at ground level is recorded as No with no warning', () => {
  const asked = questionsFor({ state: 'qld', task: 'Replace a 3m length of fence.', fallRisk: 'no' });
  assert.equal(asked.fall.warning, '');
  assert.equal(draft('Replace a 3m length of fence.').fallRisk, 'No');
});

test('New South Wales uses its own regulation, wording and power line rule', () => {
  const done = prepareDraft({
    state: 'nsw',
    task: 'Relocate the switchboard near the overhead power lines.',
    fallRisk: 'no',
  });
  assert.equal(done.kind, 'draft');
  assert.equal(done.instrument, 'Work Health and Safety Regulation 2025 (NSW)');
  assert.equal(done.section, '299');
  assert.ok(done.highRisk.includes('Is carried out on or near energised electrical installations or services'));
  const line = done.controls.find((item) => /electric line/.test(item.text));
  assert.match(line.text, /Section 166/);
  assert.match(line.text, /3\.0 m up to 132 kV, 6\.0 m above 132 kV up to 330 kV, and 8\.0 m above 330 kV/);
  assert.doesNotMatch(line.text, /Qld/);
  const asked = questionsFor({ state: 'nsw', task: 'Replace a 3m length of fence.', fallRisk: 'no' });
  assert.match(asked.fall.explanation, /Regulation 2025 \(NSW\), section 291/);
});

test('Victoria uses regulation 322 and 327 and its own SWMS contents', () => {
  const shed = (state) => prepareDraft({ state, task: 'Demolish a timber garden shed with hand tools.', fallRisk: 'no' });
  const vic = shed('vic');
  assert.equal(vic.instrument, 'Occupational Health and Safety Regulations 2017 (Vic)');
  assert.equal(vic.sectionRef, 'regulation 327');
  assert.equal(vic.reviewHeading, 'How the risk control measures are to be implemented');
  // Any demolition is high risk in Victoria. Section 291 needs a load-bearing element.
  assert.deepEqual(vic.highRisk, ['Involving demolition']);
  assert.deepEqual(shed('qld').highRisk, []);
  assert.deepEqual(shed('nsw').highRisk, []);

  const tunnel = prepareDraft({
    state: 'vic',
    task: 'Line a stormwater tunnel with shotcrete.',
    fallRisk: 'no',
    facts: { trenchSupport: 'Ground support to the engineer\'s tunnel design, installed before entry.' },
  });
  assert.ok(tunnel.highRisk.includes('Involving a tunnel'));
  assert.ok(!tunnel.highRisk.some((item) => /trench or shaft/.test(item)));

  const lines = prepareDraft({ state: 'vic', task: 'Relocate the switchboard near the overhead power lines.', fallRisk: 'no' });
  const line = lines.controls.find((item) => /overhead electric lines/.test(item.text));
  assert.match(line.text, /set no distance/);
  assert.match(questionsFor({ state: 'vic', task: 'Replace a 3m length of fence.', fallRisk: 'no' }).fall.explanation, /regulation 322/);
});

test('South Australia uses its regulations and gives no power line distance', () => {
  const done = prepareDraft({ state: 'sa', task: 'Relocate the switchboard near the overhead power lines.', fallRisk: 'no' });
  assert.equal(done.instrument, 'Work Health and Safety Regulations 2012 (SA)');
  assert.equal(done.sectionRef, 'regulation 299');
  assert.ok(done.highRisk.includes('Is carried out on or near energised electrical installations or services'));
  const line = done.controls.find((item) => /electric line/.test(item.text));
  assert.match(line.text, /regulation 166/);
  assert.doesNotMatch(line.text, /\d\.\d m/);
});

test('Queensland section 299(4): a harness alone needs the other controls considered', () => {
  const task = 'Replace roof sheets on a two storey house.';
  const harness = 'Workers wear a full body harness clipped to a static line.';
  const asked = questionsFor({ state: 'qld', task, fallRisk: 'yes' });
  assert.ok(asked.required.some((item) => item.id === 'controlsConsidered'));

  const bare = draft(task, { fallRisk: 'yes', facts: { fallControl: harness } });
  assert.equal(bare.kind, 'stand-down');
  assert.deepEqual(bare.missing, ['Other fall controls considered']);

  const done = draft(task, {
    fallRisk: 'yes',
    facts: { fallControl: harness, controlsConsidered: 'Edge protection was considered but the roof edge has no fixing points; a scaffold cannot be placed on the neighbouring boundary.' },
  });
  assert.equal(done.kind, 'draft');
  assert.ok(done.controls.some((item) => /^Other fall controls considered: Edge protection/.test(item.text)));
  assert.ok(done.controls.some((item) => item.level === 'PPE'));

  // Edge protection is an engineering control, so nothing more is needed.
  const edge = draft(task, { fallRisk: 'yes', facts: { fallControl: 'Edge protection is installed around the roof perimeter first.' } });
  assert.equal(edge.kind, 'draft');

  // The rule is Queensland's. NSW does not ask.
  const nsw = prepareDraft({ state: 'nsw', task, fallRisk: 'yes', facts: { fallControl: harness } });
  assert.equal(nsw.kind, 'draft');
  assert.ok(nsw.controls.some((item) => /must be considered before administrative controls/.test(item.text)));
});
