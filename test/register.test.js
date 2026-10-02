// The registers that go with the job steps: plant, substances, licences,
// emergency arrangements, sources and the suggested risk rating.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft } = require('../draft');
const { MATRIX, riskFor, legislationFor } = require('../register');

const slab = () => prepareDraft({
  state: 'qld', fallRisk: 'no', swmsRef: 'SR-001',
  task: 'Excavate, form, reinforce and pour a concrete house slab on ground, using a line pump and power trowel, and saw cut control joints.',
  facts: { silicaControls: 'Saw cutting is done wet.' },
});

test('the matrix matches the Queensland SWMS template', () => {
  assert.deepEqual(MATRIX[5], ['Moderate', 'Moderate', 'High', 'Extreme', 'Extreme']);
  assert.deepEqual(MATRIX[1], ['Low', 'Low', 'Low', 'Low', 'Moderate']);
  assert.equal(MATRIX[3][4], 'High');
});

test('plant, substances, licences, emergency arrangements and the reference number', () => {
  const draft = slab();
  assert.equal(draft.swmsRef, 'SR-001');
  const plant = draft.plant.map((item) => item.item);
  assert.ok(plant.includes('Concrete line pump') && plant.includes('Power trowel') && plant.includes('Concrete saw'));
  // A line pump needs no high risk work licence; a placing boom does.
  assert.match(draft.plant.find((item) => item.item === 'Concrete line pump').licence, /^No/);
  assert.ok(draft.substances.items.some((item) => /Cement/.test(item.product)));
  assert.ok(draft.qualifications.some((item) => /white card/.test(item)));
  assert.ok(draft.emergency.some((item) => item.type === 'Fire'));
  assert.ok(draft.sources.legislation.includes('Work Health and Safety Regulation 2011 (Qld)'));
});

test('each work step is rated before and after its controls, and controls lower the rating', () => {
  const draft = slab();
  assert.equal(draft.jobSteps[0].risk, null);
  const order = ['Low', 'Moderate', 'High', 'Extreme'];
  for (const step of draft.jobSteps.slice(1)) {
    assert.ok(order.indexOf(step.risk.after.level) <= order.indexOf(step.risk.before.level), step.step);
  }
  const fall = riskFor({ hazards: ['A person falls from the edge.'], controls: ['Edge protection is installed at every open edge.'] });
  assert.equal(fall.before.level, 'High');
  assert.equal(fall.after.level, 'Moderate');
});

test('sources are grouped into legislation and codes', () => {
  const sources = legislationFor(['Keep noise down. (Work Health and Safety Regulation 2011 (Qld) s 56; Managing noise and preventing hearing loss at work Code of Practice 2021 (Qld) s 2.2)']);
  assert.deepEqual(sources.legislation, ['Work Health and Safety Regulation 2011 (Qld)']);
  assert.deepEqual(sources.codes, ['Managing noise and preventing hearing loss at work Code of Practice 2021 (Qld)']);
});

test('explosive power tools are not the use of explosives', () => {
  const { highRiskMatches } = require('../draft');
  const { findState } = require('../legislation');
  const checks = (task) => highRiskMatches(task, 'no', findState('qld')).map((item) => item.check);
  assert.ok(!checks('Fix brackets with explosive power tools.').includes('explosives'));
  assert.ok(checks('Blast rock with explosives to form the footing.').includes('explosives'));
});
