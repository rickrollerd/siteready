// Content21: wrong-context steps, silica breadth, live-supply exclusion, SDS blank with products.
// Round 20 findings (A run 2, B run 5) and HANDOVER-2026-10-31.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, suggestedKinds } = require('../draft');
const { draftBody } = require('../input');
const { downloadGaps } = require('../download-gate');
const rules = require('../public/substance-rules');

const SITE = { residential: 'no', company: 'Test', workplace: '12 Smith Street, Paddington', principalContractor: 'ABC Builders Pty Ltd', hospital: 'Royal Hospital', firstAider: 'Jo Smith', musterPoint: 'Front gate', worksManager: 'Sam Lee', worksManagerPhone: '0400 118 552', complianceResponsible: 'Sam Lee', reviewer: 'Sam Lee', date: '23 October 2026' };
function answered(input, given = {}) {
  const facts = { ...(input.facts || {}) };
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor({ ...input, facts });
    let added = false;
    for (const item of asked.required || []) {
      if (facts[item.id] !== undefined && facts[item.id] !== '') continue;
      facts[item.id] = given[item.id] || (item.id === 'liveElectrical' ? 'no' : item.choices ? item.choices[0].value : 'As set out in the site plan.');
      added = true;
    }
    if (!added) break;
  }
  return { ...input, facts };
}
const bodyOf = (input, given) => draftBody(answered({ ...SITE, ...input }, given));
const draftOf = (input, given, extra = {}) => prepareDraft({ ...bodyOf(input, given), ...extra });
const names = (draft) => (draft.jobSteps || []).map((step) => step.step);

test('portable generator wording beside crane hire does not set generatorPlant', () => {
  const task = 'replace metal roof sheets and guttering on a 2 storey warehouse in richmond, add new insulation and safety mesh, work off mobile scaffold and ladders, cranes by crane hire co, use a generator for power tools';
  assert.ok(!suggestedKinds(task, {}, {}).includes('generatorPlant'));
  assert.ok(!suggestedKinds('use a generator for power tools', {}, {}).includes('generatorPlant'));
  assert.ok(!suggestedKinds('run a site generator for the tools', {}, {}).includes('generatorPlant'));
});

test('portable generator in plant list does not bring generatorPlant steps to a roofing SWMS', () => {
  const task = 'replace metal roof sheets and guttering on a 2 storey warehouse in richmond, add new insulation and safety mesh, work off mobile scaffold and ladders, cranes by crane hire co';
  const withGen = draftOf({ state: 'vic', fallRisk: 'yes', crane: 'company', task, plantChoice: { used: ['Generator'], notUsed: [], added: [] } });
  assert.ok(!names(withGen).includes('Install the generators'));
  assert.ok(!names(withGen).includes('Install the fuel tanks and fuel lines'));
});

test('painting window reveals does not bring glazing steps even when scoped', () => {
  const task = 'Paint all internal plasterboard walls and ceilings. Paint window reveals and doors. Three coat system.';
  const draft = draftOf({ state: 'sa', fallRisk: 'yes', crane: 'none', kinds: ['painting', 'windowInstall', 'glazingSeal'], task, facts: { safetyDataSheet: 'Water-based acrylic paint SDS at the work area.', fallControl: 'Edge protection and mobile scaffolds.' } });
  assert.ok(!names(draft).includes('Handle and install glass panels'));
  assert.ok(!names(draft).includes('Seal glazing'));
});

test('CUTS_CONCRETE covers tile and brick cutting', () => {
  const draft = (step) => ({ jobSteps: [{ step }] });
  assert.ok(rules.cutStep(draft('Cut tiles to fit around edges')));
  assert.ok(rules.cutStep(draft('Drill holes in tiles')));
  assert.ok(rules.cutStep(draft('Cut bricks with a wet saw')));
  assert.ok(rules.cutStep(draft('Grind mortar joints in brickwork')));
});

test('water meets leads and connections is not a live supply hazard', () => {
  const draft = draftOf({ state: 'sa', fallRisk: 'yes', crane: 'none', task: 'Pressure clean surfaces before painting' });
  const { liveSupplyHazard } = require('../download-gate');
  const found = liveSupplyHazard(draft);
  assert.ok(!found || !/water meets leads and connections/i.test(found.hazard));
});

test('products listed clears the SDS blank from blocking download', () => {
  const task = 'Paint all internal plasterboard walls and ceilings.';
  const base = answered({ ...SITE, state: 'sa', fallRisk: 'yes', crane: 'none', task, facts: { safetyDataSheet: 'The products used are ____. They are used with good ventilation and away from ignition sources, with the gloves and eye protection their safety data sheets list.', fallControl: 'Edge protection and mobile scaffolds.' } }, {});
  const withProducts = { ...base, substances: [{ id: 'sub-1', type: 'Paints and coatings', product: 'Resene acrylic paint', controls: ['Wear gloves and safety glasses.'], sdsDate: '2024-01-01', confirmed: true }] };
  const draft = prepareDraft(draftBody(withProducts));
  const gaps = downloadGaps(withProducts, draft);
  assert.ok(!gaps.some((gap) => gap.id === 'fact.safetyDataSheet'));
});
