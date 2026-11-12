const test = require('node:test');
const assert = require('node:assert/strict');
const { foundKinds, prepareDraft } = require('../draft');
const BYPASS = 'Lay and roll hot asphalt wearing course on the new bypass, with line marking after, under traffic control, using a paver, rollers and a tipper.';
const { ready, ANSWERED } = require('./helpers');

test('plain asphalt laying does not trigger asphalt kind', () => {
  const task = 'Lay and roll hot asphalt wearing course on the new bypass, with line marking after, under traffic control, using a paver, rollers and a tipper.';
  const kinds = foundKinds({ state: 'nt', fallRisk: 'no', residential: 'no', task });
  assert.ok(kinds.includes('asphaltLay'), kinds.join(', '));
  assert.ok(!kinds.includes('asphalt'), kinds.join(', '));
});

test('asphalt cutting and reinstatement still triggers asphalt kind', () => {
  const task = 'Saw cut and reinstate asphalt over the new trench';
  const kinds = foundKinds({ state: 'nt', fallRisk: 'no', residential: 'no', task });
  assert.ok(kinds.includes('asphalt'), kinds.join(', '));
});

test('pothole filling with cold mix still triggers asphalt kind', () => {
  const task = 'Fill potholes with cold mix asphalt';
  const kinds = foundKinds({ state: 'nt', fallRisk: 'no', residential: 'no', task });
  assert.ok(kinds.includes('asphalt'), kinds.join(', '));
});

const rules = require('../public/substance-rules');
const stepsNamed = (names) => names.map((step) => ({ step }));

test('a bitumen product goes in the laying step, not the saw cut', () => {
  const steps = stepsNamed(['Set up traffic management', 'Saw cut asphalt', 'Reinstate asphalt', 'Lay and roll asphalt']);
  assert.equal(rules.stepOf({ type: 'Bitumen and asphalt', product: 'Bitumen' }, steps), 'Reinstate asphalt');
  assert.equal(rules.stepOf({ type: 'Bitumen and asphalt', product: 'Bitumen' }, stepsNamed(['Saw cut asphalt', 'Reinstate asphalt'])), 'Reinstate asphalt');
});

test('a plain lay and roll SWMS matches bitumen to Lay and roll asphalt', () => {
  const out = prepareDraft(ready({ ...ANSWERED, state: 'nt', task: BYPASS, fallRisk: 'no', residential: 'no' }));
  const steps = out.jobSteps;
  assert.ok(!steps.some((step) => /^Saw cut asphalt$|^Reinstate asphalt$/.test(step.step)), steps.map((step) => step.step).join(' | '));
  assert.equal(rules.stepOf({ type: 'Bitumen and asphalt', product: 'Bitumen' }, steps), 'Lay and roll asphalt');
});

test('repairing line marking on a lay-and-roll job is not asphalt cutting or reinstatement', () => {
  const task = 'Lay and roll hot asphalt wearing course on the new bypass, then repair line marking defects, under traffic control, using a paver, rollers and a tipper.';
  const kinds = foundKinds({ state: 'nt', fallRisk: 'no', residential: 'no', task });
  assert.ok(kinds.includes('asphaltLay'), kinds.join(', '));
  assert.ok(!kinds.includes('asphalt'), kinds.join(', '));
});
