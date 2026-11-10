const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');

const SITE = { residential: 'no', company: 'Test', workplace: '12 Smith Street, Paddington', principalContractor: 'ABC Builders Pty Ltd', hospital: 'Royal Hospital', firstAider: 'Jo Smith', musterPoint: 'Front gate', worksManager: 'Sam Lee', worksManagerPhone: '0400 118 552', complianceResponsible: 'Sam Lee', reviewer: 'Sam Lee', date: '19 October 2026' };
function answered(input, given = {}) {
  const facts = { ...(input.facts || {}) };
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor({ ...input, facts });
    let added = false;
    for (const item of asked.required || []) {
      if (facts[item.id] !== undefined && facts[item.id] !== '') continue;
      facts[item.id] = given[item.id] || (item.id === 'liveElectrical' ? 'no' : item.choices ? item.choices[0].value : ((answersFor(item.id, asked.task)[0] || {}).text || 'As set out in the site plan.').replace(/_{3,}/g, 'as on the site plan'));
      added = true;
    }
    if (!added) break;
  }
  return { ...input, facts };
}
const bodyOf = (input, given) => draftBody(answered({ ...SITE, ...input }, given));
const draftOf = (input, given) => prepareDraft(bodyOf(input, given));
const names = (draft) => draft.jobSteps.map((step) => step.step);

const ROOF = { state: 'nsw', fallRisk: 'yes', fallMetres: '4', crane: 'none', task: 'Replace the metal roof sheets on the shed', facts: { fallAccess: 'mobileScaffold', harnessSystem: 'none' } };

test('fall access step is included in questions and draft', () => {
  const body = bodyOf(ROOF);
  const asked = questionsFor(body);
  assert.ok(asked.steps.chosen.includes('mobileScaffold'), `chosen: ${asked.steps.chosen.join(', ')}`);
  assert.ok(asked.steps.access && asked.steps.access.includes('mobileScaffold'), `access: ${JSON.stringify(asked.steps.access)}`);
  const draft = prepareDraft(body);
  assert.ok(names(draft).includes('Use mobile scaffolds'), `steps: ${names(draft).join(' | ')}`);
});

test('fall access step is removed when unticked via kindsOff', () => {
  const body = bodyOf({ ...ROOF, kindsOff: ['mobileScaffold'] });
  const asked = questionsFor(body);
  assert.ok(!asked.steps.chosen.includes('mobileScaffold'), `chosen should not include mobileScaffold: ${asked.steps.chosen.join(', ')}`);
  const draft = prepareDraft(body);
  const steps = draft.jobSteps ? draft.jobSteps.map((step) => step.step) : [];
  assert.ok(!steps.includes('Use mobile scaffolds'), `steps should not include Use mobile scaffolds: ${steps.join(' | ')}`);
});

test('task with no fall answer has no steps.access', () => {
  const body = bodyOf({ ...ROOF, fallRisk: 'no' });
  const asked = questionsFor(body);
  assert.ok(!asked.steps.access || asked.steps.access.length === 0, `access should be empty: ${JSON.stringify(asked.steps.access)}`);
});

test('the page does not keep a step the fall answer brought as a pick of its own', () => {
  const { loadPage } = require('./fake-dom');
  const p = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }));
  p.run(`questions = { steps: { suggested: ['roof', 'roofStrip', 'mobileScaffold'], chosen: ['roof', 'roofStrip', 'mobileScaffold'], locked: [], access: ['mobileScaffold'] } }`);
  assert.deepEqual(JSON.parse(p.run(`JSON.stringify(ownPicks(['roof', 'mobileScaffold']))`)), ['roof']);
  p.run(`questions = { steps: { suggested: ['roof'], chosen: ['roof'], locked: [] } }`);
  assert.deepEqual(JSON.parse(p.run(`JSON.stringify(ownPicks(['roof', 'mobileScaffold']))`)), ['roof', 'mobileScaffold']);
});
