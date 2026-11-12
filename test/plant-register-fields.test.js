// Optional plant register fields (make/model, rego/ID, last inspection, named operator)
// on the confirmed plant, the printed SWMS, and the download gate. Additive only:
// existing plant rows stay unchanged when the fields are blank, and the download
// still waits only for the plant to be confirmed, not for these fields. Made-up
// companies, people and sites only.
const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { prepareDraft } = require('../draft');
const { draftBody } = require('../input');
const { downloadGaps } = require('../download-gate');
const { draftToDocx } = require('../docx-draft');
const { draftToPdf } = require('../pdf-draft');
const { PDFParse } = require('pdf-parse');
const { plantRowLabel } = require('../register');
const { ANSWERED, LIVE_SERVICES } = require('./helpers');
const { TYPES, SILICA } = require('../public/substance-rules');

const SLAB = { id: 'sub-1', type: SILICA, product: 'Concrete slab', controls: ['Drill with on-tool extraction', 'Fit tested P2 respirator'], sdsDate: '2026-02-01', step: 'Install cable tray and containment', confirmed: true };
const EWP = {
  ...ANSWERED,
  site: { ...ANSWERED.site, liveServices: LIVE_SERVICES },
  state: 'qld',
  task: 'Install cable trays and pull cables through the ward ceilings and risers from scissor lifts.',
  fallRisk: 'yes',
  residential: 'no',
  facts: { fallControl: 'Scissor lifts with guardrails for all work above 2 m.', controlsConsidered: 'A scaffold is not practicable in the ward ceilings.' },
  substancesNotUsed: TYPES.filter((type) => type !== SILICA),
  substances: [SLAB],
  emergency: {
    ewpLower: 'Larry Leadinghand, leading hand, trained on the ground controls',
    ewpControls: 'Ground control panel at the rear of the base, key in the ignition',
    plantStop: 'The operator presses the red emergency stop on the platform',
    fallRescue: 'Two trained crew bring the person up from the riser with the rescue kit kept at the riser door',
    fallKit: 'Rescue tripod and harness kit at the level 2 riser door',
  },
};

const used = { used: ['Scissor lift', 'Cable winch or puller'], notUsed: ['Ladders', 'Forklift'], added: [] };

const build = (input) => {
  const body = draftBody(input);
  const draft = prepareDraft(body);
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  return { body, draft, gaps: downloadGaps(body, draft) };
};

const wordText = async (buffer) => (await (await JSZip.loadAsync(buffer)).file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

async function pdfText(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    return (await parser.getText()).pages.map((page) => page.text).join(' ').replace(/\s+/g, ' ');
  } finally {
    if (parser.destroy) await parser.destroy();
  }
}

test('optional register fields are added to confirmed plant and left off when blank', () => {
  const without = build({ ...EWP, plantChoice: used });
  assert.deepEqual(without.gaps, []);
  const scissor = without.draft.plant.find((row) => row.item === 'Scissor lift');
  assert.equal(scissor.makeModel, undefined);
  assert.equal(scissor.rego, undefined);
  assert.equal(scissor.lastInspection, undefined);
  assert.equal(scissor.operator, undefined);
  assert.equal(scissor.shownLabel, undefined);
  assert.equal(plantRowLabel(scissor), 'Scissor lift');

  const withFields = build({
    ...EWP,
    plantChoice: {
      ...used,
      details: {
        'Scissor lift': { makeModel: 'Genie GS-4047', rego: 'EWP-12', lastInspection: '1 November 2026', operator: 'Alex Chen' },
      },
      added: [{ item: 'Battery cable drum trailer', licence: 'No. Operator trained in its use', makeModel: 'Acme Drum 2 t', operator: 'Sam Lee' }],
    },
  });
  assert.deepEqual(withFields.gaps, []);
  const lift = withFields.draft.plant.find((row) => row.item === 'Scissor lift');
  assert.equal(lift.makeModel, 'Genie GS-4047');
  assert.equal(lift.rego, 'EWP-12');
  assert.equal(lift.lastInspection, '1 November 2026');
  assert.equal(lift.operator, 'Alex Chen');
  assert.match(lift.shownLabel, /Make\/model: Genie GS-4047/);
  assert.match(lift.shownLabel, /Rego\/ID: EWP-12/);
  assert.match(lift.shownLabel, /Last inspection: 1 November 2026/);
  assert.match(lift.shownLabel, /Named operator: Alex Chen/);
  const trailer = withFields.draft.plant.find((row) => row.item === 'Battery cable drum trailer');
  assert.equal(trailer.makeModel, 'Acme Drum 2 t');
  assert.equal(trailer.operator, 'Sam Lee');
  assert.equal(trailer.rego, undefined);
  assert.match(trailer.shownLabel, /Make\/model: Acme Drum 2 t/);
  assert.doesNotMatch(trailer.shownLabel, /Rego\/ID:/);
});

test('the download gate does not require the register fields, but refuses a placeholder left in one', () => {
  const open = build({ ...EWP, plantChoice: used });
  assert.deepEqual(open.gaps, []);
  const blank = build({
    ...EWP,
    plantChoice: { ...used, details: { 'Scissor lift': { rego: 'TBC' } } },
  });
  assert.ok(blank.gaps.some((gap) => /TBC/.test(gap.need) && /Plant and equipment|placeholder/i.test(`${gap.label} ${gap.need}`)), JSON.stringify(blank.gaps, null, 2));
  const underscores = build({
    ...EWP,
    plantChoice: { ...used, details: { 'Scissor lift': { makeModel: '____' } } },
  });
  assert.ok(underscores.gaps.some((gap) => /_{3,}|blank/i.test(gap.need)), JSON.stringify(underscores.gaps, null, 2));
});

test('draftBody keeps only the register fields, so the schema change is additive', () => {
  const body = draftBody({
    ...EWP,
    plantChoice: {
      used: ['Scissor lift'],
      notUsed: ['Ladders'],
      added: [{ item: 'Cable drum jacks', licence: 'No', makeModel: 'Acme 1 t', extra: 'ignore me' }],
      details: { 'Scissor lift': { makeModel: 'Genie GS-4047', typo: 'no' } },
      typo: 'no',
    },
  });
  assert.deepEqual(Object.keys(body.plantChoice).sort(), ['added', 'details', 'notUsed', 'used']);
  assert.deepEqual(body.plantChoice.details, { 'Scissor lift': { makeModel: 'Genie GS-4047' } });
  assert.deepEqual(body.plantChoice.added, [{ item: 'Cable drum jacks', licence: 'No', makeModel: 'Acme 1 t' }]);
});

test('the printed SWMS (Word and PDF) shows the register fields under the item name, and omits them when they are blank', async () => {
  const filled = build({
    ...EWP,
    plantChoice: {
      ...used,
      details: { 'Scissor lift': { makeModel: 'Genie GS-4047', rego: 'EWP-12', lastInspection: '1 November 2026', operator: 'Alex Chen' } },
    },
  });
  const text = await wordText(await draftToDocx(filled.draft));
  const register = text.slice(text.indexOf('Plant and equipment'), text.indexOf('Licences, tickets and training'));
  assert.match(register, /Scissor lift/);
  assert.match(register, /Make\/model: Genie GS-4047/);
  assert.match(register, /Rego\/ID: EWP-12/);
  assert.match(register, /Last inspection: 1 November 2026/);
  assert.match(register, /Named operator: Alex Chen/);
  const plain = await wordText(await draftToDocx(build({ ...EWP, plantChoice: used }).draft));
  const plainRegister = plain.slice(plain.indexOf('Plant and equipment'), plain.indexOf('Licences, tickets and training'));
  assert.match(plainRegister, /Scissor lift/);
  assert.doesNotMatch(plainRegister, /Make\/model:/);
  assert.doesNotMatch(plainRegister, /Rego\/ID:/);
  assert.doesNotMatch(plainRegister, /Named operator:/);
  const pdf = await pdfText(await draftToPdf(filled.draft));
  const pdfRegister = pdf.slice(pdf.indexOf('Plant and equipment'), pdf.indexOf('Licences, tickets and training'));
  assert.match(pdfRegister, /Scissor lift/);
  assert.match(pdfRegister, /Make\/model: Genie GS-4047/);
  assert.match(pdfRegister, /Rego\/ID: EWP-12/);
  assert.match(pdfRegister, /Last inspection: 1 November 2026/);
  assert.match(pdfRegister, /Named operator: Alex Chen/);
  const plainPdf = await pdfText(await draftToPdf(build({ ...EWP, plantChoice: used }).draft));
  const plainPdfRegister = plainPdf.slice(plainPdf.indexOf('Plant and equipment'), plainPdf.indexOf('Licences, tickets and training'));
  assert.match(plainPdfRegister, /Scissor lift/);
  assert.doesNotMatch(plainPdfRegister, /Make\/model:/);
  assert.doesNotMatch(plainPdfRegister, /Rego\/ID:/);
  assert.doesNotMatch(plainPdfRegister, /Named operator:/);
});
