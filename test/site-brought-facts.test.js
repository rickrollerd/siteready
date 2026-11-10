const test = require('node:test');
const assert = require('node:assert/strict');
const { questionsFor, prepareDraft } = require('../draft');
const { ready, ANSWERED } = require('./helpers');

const TASK = 'Lay and roll hot asphalt wearing course on the new bypass, with line marking after, under traffic control, using a paver, rollers and a tipper.';
const LINE = { liveServices: 'Overhead power line at the bypass tie-in' };
const input = (extra = {}) => ready({ ...ANSWERED, state: 'nt', task: TASK, fallRisk: 'no', residential: 'no', ...extra });
const ids = (list) => (list || []).map((item) => item.id);

test('an overhead power line in Live services asks Electrical safety arrangement on the questions page', () => {
  assert.ok(ids(questionsFor(input({ site: LINE })).required).includes('electricalSafety'));
  assert.ok(!ids(questionsFor(input()).required).includes('electricalSafety'));
});

test('the first Prepare has the power-line step, and the answer prints with it', () => {
  const body = input({ site: LINE });
  const first = prepareDraft(body);
  assert.equal(first.kind, 'draft', JSON.stringify(first.missing));
  assert.ok(first.jobSteps.some((step) => step.step === 'Plan the work near overhead power lines'), first.jobSteps.map((step) => step.step).join(' | '));
  const answered = prepareDraft({ ...body, facts: { ...(body.facts || {}), electricalSafety: 'The network operator isolates the line and issues an access permit before work starts.' } });
  assert.equal(answered.kind, 'draft');
  assert.ok(answered.jobSteps.some((step) => step.step === 'Plan the work near overhead power lines'));
});

test('a power-line step unticked by hand does not ask its question', () => {
  const body = input({ site: LINE });
  const kinds = require('../draft').foundKinds(body).filter((id) => id !== 'power');
  assert.ok(!ids(questionsFor({ ...body, kinds }).required).includes('electricalSafety'));
});
