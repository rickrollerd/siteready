// flow22 option (b): a hazardous product with no SDS attached must be honest about it.
// Owner decision 10 Nov 2026.
const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { PDFParse } = require('pdf-parse');
const { setupAccounts, ANSWERED } = require('./helpers');
const { prepareDraft, questionsFor } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { downloadGaps } = require('../download-gate');
const { draftToDocx } = require('../docx-draft');
const { draftToPdf } = require('../pdf-draft');
const substances = require('../substances');
const R = require('../public/substance-rules');

const POUR = 'Pour and finish a concrete slab on ground, apply curing compound, form release agent on the edge forms';
const NO_FILE_PRODUCT = {
  id: 'sub-1', type: 'Curing compounds and form release agents', product: 'CureCoat 40', supplier: 'Example Chemicals Pty Ltd', sdsDate: '2024-03-12',
  hazards: ['H315 Causes skin irritation.'], controls: ['Wear chemical resistant gloves (nitrile).', 'Wear safety glasses with side shields or goggles.'],
  firstAid: ['Skin: wash with plenty of soap and water.'], storage: ['Store in a cool, well ventilated place.', 'Contain spills with sand or earth.'], confirmed: true,
};
const FILE_PRODUCT = {
  id: 'sub-2', type: 'Cement, concrete, grout and mortar', product: 'FlexSeal 200', quantity: '20 bags', sdsDate: '2023-05-01',
  controls: ['Avoid skin contact with wet cement.'], file: { id: 'df_abcdefghijklmnopqrstu', name: 'FlexSeal 200 SDS.pdf', type: 'application/pdf', size: 4096 }, confirmed: true,
};

function answered(input) {
  const facts = { ...(input.facts || {}) };
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor({ ...input, facts });
    let added = false;
    for (const item of asked.required || []) {
      if (facts[item.id]) continue;
      facts[item.id] = item.id === 'liveElectrical' ? 'no' : item.choices ? item.choices[0].value : ((answersFor(item.id, asked.task)[0] || {}).text || `As set out in the site plan: ${item.label}.`).replace(/_{3,}/g, 'as on the plan');
      added = true;
    }
    if (!added) break;
  }
  return { ...input, facts };
}
const base = (task, extra = {}) => answered({ ...ANSWERED, state: 'qld', fallRisk: 'no', residential: 'no', task, date: '13 October 2026', ...extra });
const draft = (task, extra = {}) => prepareDraft(draftBody({ ...base(task), ...extra }));
const wordText = async (d) => (await (await JSZip.loadAsync(Buffer.from(await draftToDocx(d, {})))).file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
async function pdfWords(data) {
  const parser = new PDFParse({ data });
  try { return (await parser.getText()).text.replace(/\s+/g, ' '); } finally { await parser.destroy().catch(() => {}); }
}

test.before(async () => { await setupAccounts(); });

// ---- Card label ----

test('card label: no file attached shows "I have the current SDS for this product on site"', async () => {
  const { loadPage, settle } = require('./fake-dom');
  const p = loadPage(['gate-rules.js', 'app.js', 'substance-rules.js', 'substances.js'], () => ({ body: {} }));
  await settle();
  const S = p.window.SiteWriteSubstances;
  const plain = draft(POUR);
  S.load([{ ...NO_FILE_PRODUCT, confirmed: false }]);
  const html = p.window.SiteWrite.render(plain, { movable: true });
  assert.match(html, /I have the current SDS for this product on site/);
  assert.doesNotMatch(html, /These match the SDS/);
});

test('card label: with a file attached shows "These match the SDS"', async () => {
  const { loadPage, settle } = require('./fake-dom');
  const p = loadPage(['gate-rules.js', 'app.js', 'substance-rules.js', 'substances.js'], () => ({ body: {} }));
  await settle();
  const S = p.window.SiteWriteSubstances;
  const plain = draft(POUR);
  S.load([{ ...FILE_PRODUCT, confirmed: false }]);
  const html = p.window.SiteWrite.render(plain, { movable: true });
  assert.match(html, /These match the SDS/);
  assert.doesNotMatch(html, /I have the current SDS for this product on site/);
});

// ---- Gate need text ----

test('gate need text: no file says tick "I have the current SDS for this product on site"', () => {
  const input = draftBody({ ...base(POUR), substances: [{ ...NO_FILE_PRODUCT, confirmed: false }] });
  const d = prepareDraft(input);
  const gaps = downloadGaps(input, d).filter((gap) => gap.kind === 'substance');
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].need, 'Check CureCoat 40 against its safety data sheet and tick "I have the current SDS for this product on site".');
});

test('gate need text: with a file says tick "These match the SDS"', () => {
  const input = draftBody({ ...base(POUR), substances: [{ ...FILE_PRODUCT, confirmed: false }] });
  const d = prepareDraft(input);
  const gaps = downloadGaps(input, d).filter((gap) => gap.kind === 'substance');
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].need, 'Check FlexSeal 200 against its safety data sheet and tick "These match the SDS".');
});

// ---- tableRows last cell ----

test('tableRows last cell: no file prints "SDS held on site, not attached."', () => {
  const d = draft(POUR, { substances: [NO_FILE_PRODUCT] });
  const rows = substances.tableRows(d);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][5], 'Issued 12 March 2024.\nSDS held on site, not attached.');
});

test('tableRows last cell: with a file prints the attachment sentence', () => {
  const d = draft(POUR, { substances: [FILE_PRODUCT] });
  const rows = substances.tableRows(d);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][5], 'Issued 1 May 2023.\nA copy is attached to this SWMS in SiteWrite (FlexSeal 200 SDS.pdf).');
});

// ---- Word / PDF include the no-file notice ----

test('Word output includes "SDS held on site, not attached." for a product with no file', async () => {
  const d = draft(POUR, { substances: [NO_FILE_PRODUCT] });
  const word = await wordText(d);
  assert.ok(word.includes('SDS held on site, not attached.'));
});

test('PDF output includes "SDS held on site, not attached." for a product with no file', async () => {
  const d = draft(POUR, { substances: [NO_FILE_PRODUCT] });
  const pdf = await pdfWords(await draftToPdf(d, {}));
  assert.ok(pdf.includes('SDS held on site, not attached.'));
});

// ---- A paint product and a membrane or sealant product, as the brief asks ----

test('a paint and a membrane product with no file: the tick wording, and ticked they clear', () => {
  const paint = R.TYPES.find((label) => /paint/i.test(label));
  const membrane = R.TYPES.find((label) => /membrane|sealant|waterproof/i.test(label));
  assert.ok(paint && membrane, R.TYPES.join(' | '));
  for (const [type, product] of [[paint, 'Tidemark Acrylic Low Sheen'], [membrane, 'FlexSeal 200']]) {
    const row = { type, product, sdsDate: '2024-06-01', controls: ['Wear nitrile gloves.'], step: 'Apply the product' };
    assert.equal(R.substanceNeed(row, 'Apply the product'), `Check ${product} against its safety data sheet and tick "I have the current SDS for this product on site".`);
    assert.equal(R.substanceNeed({ ...row, confirmed: true }, 'Apply the product'), '');
  }
});
