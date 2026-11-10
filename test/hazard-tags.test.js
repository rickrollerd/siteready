// Hazard tags (D321): silica and existing-services tags on steps, search cap removed when all hits are body-only,
// and liveSupplyHazard uses hazardTags instead of regex.
const test = require('node:test');
const assert = require('node:assert/strict');
const { searchSteps } = require('../steps');
const { prepareDraft } = require('../draft');
const { draftBody } = require('../input');
const { downloadGaps, liveSupplyHazard } = require('../download-gate');
const { ready, ANSWERED } = require('./helpers');

const FENCE = { state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no' };

// Build a body and draft for a task.
function draftOf(input) {
  const body = draftBody(ready({ ...ANSWERED, ...input }));
  const draft = prepareDraft(body);
  // Some tests intentionally pass partial data; do not assert draft.kind here.
  return { body, draft };
}

test('searchSteps finds more than 6 silica results and includes a cut or drill kind', () => {
  const found = searchSteps('silica');
  assert.ok(found.length > 6, `found ${found.length}: ${found.join(', ')}`);
  const wanted = ['silicaDrill', 'concreteRepair', 'coreDrill', 'tile'];
  assert.ok(wanted.some((id) => found.includes(id)), `expected one of ${wanted.join(', ')} in ${found.join(', ')}`);
});

test('a fence with liveServices None and no existing-services tags is not refused', () => {
  const { body, draft } = draftOf({ ...FENCE, site: { ...ANSWERED.site, liveServices: 'None' } });
  const gaps = downloadGaps(body, draft);
  assert.ok(!gaps.some((gap) => gap.id === 'site.liveServices'), `liveServices should not be refused, gaps: ${gaps.map((g) => g.id).join(', ')}`);
  assert.equal(liveSupplyHazard(draft), null);
});

test('a draft with an existing-services tagged step refuses liveServices None', () => {
  const { body, draft } = draftOf({ ...FENCE, site: { ...ANSWERED.site, liveServices: 'None' } });
  // Inject a step tagged with existing-services.
  draft.jobSteps = [
    ...(draft.jobSteps || []),
    { step: 'Locate underground services', hazardTags: ['existing-services'], hazards: ['Striking underground services.'], controls: ['x'] },
  ];
  const gaps = downloadGaps(body, draft);
  const found = gaps.find((gap) => gap.id === 'site.liveServices');
  assert.ok(found, 'liveServices should be refused when an existing-services tag is present');
  assert.match(found.need, /existing-services|Locate underground services|live service/i);
  const hazard = liveSupplyHazard(draft);
  assert.ok(hazard);
  assert.equal(hazard.step, 'Locate underground services');
});

test('a silica-tagged step after prepareDraft carries the crystalline silica follow-up control text', () => {
  // Use a task that triggers a silica-tagged library step.
  const { draft } = draftOf({ state: 'qld', fallRisk: 'no', crane: 'none', task: 'Install suspended grid ceilings.', facts: { fallControl: 'Mobile scaffold with guardrails.' } });
  const tagged = (draft.jobSteps || []).filter((step) => Array.isArray(step.hazardTags) && step.hazardTags.includes('silica'));
  assert.ok(tagged.length >= 1, `expected at least one silica-tagged step, found ${tagged.length}`);
  const step = tagged[0];
  assert.ok(step.controls.some((line) => /assessment|high risk crystalline silica|processing is high risk/i.test(line)),
    `step "${step.step}" should carry silica follow-up assessment text: ${step.controls.join(' | ')}`);
});
