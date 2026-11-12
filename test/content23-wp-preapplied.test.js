// Pre-applied / pre-pour sheet membrane on the blinding or formwork: SDS path only, not torch-on
// and not post-applied wall tanking.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, suggestedKinds } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { ACTIVITIES } = require('../activities');
const { inStageOrder, firmFaults } = require('../step-stages');

const SITE = {
  residential: 'no',
  company: 'Test',
  workplace: '12 Smith Street, Paddington',
  principalContractor: 'ABC Builders Pty Ltd',
  firstAider: 'Jo Smith',
  musterPoint: 'Front gate',
  worksManager: 'Sam Lee',
  worksManagerPhone: '0400 118 552',
  complianceResponsible: 'Sam Lee',
  reviewer: 'Sam Lee',
  date: '18 October 2026',
};

function answered(input, given = {}) {
  const facts = { ...(input.facts || {}) };
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor({ ...input, facts });
    let added = false;
    for (const item of asked.required || []) {
      if (facts[item.id]) continue;
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
const lines = (draft) => draft.jobSteps.flatMap((step) => [...step.hazards, ...step.controls]).join('\n');

const PREPARE = 'Prepare the blinding or formwork for the sheet membrane';
const LAY = 'Lay the pre-applied sheet membrane';
const PROTECT = 'Protect the membrane until the pour';
const PRE_APPLIED_STEPS = [PREPARE, LAY, PROTECT];

const PREPOUR = {
  state: 'nsw',
  fallRisk: 'no',
  crane: 'none',
  task: 'Lay a pre-applied sheet membrane on the blinding before the basement slab pour. Primer and adhesive as the current safety data sheet sets out.',
  site: { liveServices: 'none', publicInterface: 'none', otherTrades: 'concreters follow after the pour', ground: 'blinding slab', access: 'site gate' },
};

const GIVEN = {
  safetyDataSheet: 'The current safety data sheet for each primer, adhesive and membrane product is on site and is followed: chemical resistant gloves, eye protection, and the area is ventilated as the SDS sets out.',
};

test('pre-pour sheet membrane drafts the three new steps, uses the SDS path, and is not torch-on or wall tanking', () => {
  const draft = draftOf(PREPOUR, GIVEN);
  assert.equal(draft.kind, 'draft', (draft.missing || []).join(' ') || draft.kind);
  const list = names(draft);
  for (const step of PRE_APPLIED_STEPS) assert.ok(list.includes(step), `missing ${step}: ${list.join(' | ')}`);
  assert.ok(!list.includes('Lay torch-on membranes'), list.join(' | '));
  assert.ok(!list.includes('Waterproof walls below ground'), list.join(' | '));
  assert.ok(!list.includes('Prepare surfaces by grinding'), list.join(' | '));
  assert.ok(!list.includes('Apply primers and liquid membranes'), list.join(' | '));
  const text = lines(draft);
  assert.match(text, /safety data sheet/i);
  assert.match(text, /product instructions/i);
  assert.doesNotMatch(text, /\b(?:mapeproof|mapei|sika|bituminous torch|gas torch)\b/i);
  assert.ok(list.indexOf(PREPARE) < list.indexOf(LAY) && list.indexOf(LAY) < list.indexOf(PROTECT), list.join(' | '));
  const only = draft.jobSteps.filter((step) => PRE_APPLIED_STEPS.includes(step.step));
  assert.deepEqual(firmFaults(only), []);
  assert.deepEqual(inStageOrder(only).map((step) => step.step), PRE_APPLIED_STEPS);
});

test('pre-pour wording is suggested as wpPreApplied, and torch-on is not added unless a torch is named', () => {
  const kinds = suggestedKinds(PREPOUR.task, {}, {});
  assert.ok(kinds.includes('wpPreApplied'), kinds.join(','));
  assert.ok(!kinds.includes('wpTorch'), kinds.join(','));
  assert.ok(!kinds.includes('belowGroundWp'), kinds.join(','));
  const torch = suggestedKinds('Waterproof the plant room roof with a torch-on bitumen sheet membrane using a gas torch.', {}, {});
  assert.ok(torch.includes('wpTorch'), torch.join(','));
  assert.ok(!torch.includes('wpPreApplied'), torch.join(','));
});

test('basement wall tanking still uses the existing below-ground steps, not the pre-pour sheet method', () => {
  const draft = draftOf({
    state: 'qld',
    fallRisk: 'no',
    crane: 'none',
    task: 'Basement tanking: prepare and prime the substrate, apply sheet and liquid membranes to below ground walls and floors, and lift pits and sumps.',
    site: { liveServices: 'none', publicInterface: 'none', otherTrades: 'none', ground: 'excavated basement', access: 'ramp' },
  });
  assert.equal(draft.kind, 'draft', (draft.missing || []).join(' ') || draft.kind);
  const list = names(draft);
  assert.ok(list.includes('Waterproof walls below ground'), list.join(' | '));
  for (const step of PRE_APPLIED_STEPS) assert.ok(!list.includes(step), `unexpected ${step}`);
});

test('the pre-applied activity cites hazardous chemicals and does not invent a product method', () => {
  const activity = ACTIVITIES.find((item) => item.when === 'wpPreApplied');
  assert.ok(activity);
  const text = activity.steps.flatMap((step) => [...step.hazards, ...step.controls]).map((line) => {
    if (!line || typeof line === 'string') return line || '';
    return [line.text, line.source].filter(Boolean).join(' ');
  }).join('\n');
  assert.match(text, /safety data sheet/i);
  assert.match(text, /Managing risks of hazardous chemicals/);
  assert.match(text, /No method is invented where the instructions are silent/);
  assert.doesNotMatch(text, /\b(?:mapeproof|mapei|fully bonded around piles as the brochure)\b/i);
  assert.ok(activity.steps.some((step) => step.controls.some((line) => line && line.fact === 'safetyDataSheet')));
});
