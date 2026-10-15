// Hazardous substances product by product (owner, 13 October 2026, feedback item 22: "hazardous
// substances needs to be individualised and the controls for each in the swms"; D256, D257). The user
// adds each product used, from its safety data sheet (SDS): attached and read for its typed words with
// a stand-in for the AI (no request is made or billed), or typed from it. Each product prints in the
// substances table with its Controls, and as one line in the step that uses it. The download waits for
// each product to be complete and ticked as matching its SDS. A type with no product never prints.
const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const PDFDocument = require('pdfkit');
const { PDFParse } = require('pdf-parse');
const { setupAccounts, ANSWERED } = require('./helpers');
const db = require('../db');
const aiScope = require('../ai-scope');
const designFiles = require('../design-files');
const sdsRead = require('../sds-read');
const { SDS_BRIEF, SDS_BRIEF_VERSION, SDS_SCHEMA } = require('../sds-brief');
const { prepareDraft, questionsFor } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { downloadGaps, gateMessage } = require('../download-gate');
const { checkSwms, fromDraft } = require('../builder-check');
const { draftToDocx } = require('../docx-draft');
const { draftToPdf } = require('../pdf-draft');
const substances = require('../substances');
const R = require('../public/substance-rules');

const POUR = 'Pour and finish a concrete slab on ground, apply curing compound, form release agent on the edge forms';
const CURE = {
  id: 'sub-1', type: 'Curing compounds and form release agents', product: 'CureCoat 40', supplier: 'Example Chemicals Pty Ltd', sdsDate: '2024-03-12',
  hazards: ['H315 Causes skin irritation.'], controls: ['Wear chemical resistant gloves (nitrile).', 'Wear safety glasses with side shields or goggles.'],
  firstAid: ['Skin: wash with plenty of soap and water.'], storage: ['Store in a cool, well ventilated place.', 'Contain spills with sand or earth.'], confirmed: true,
};
const CURE_LINE = 'Curing compound or release agent (CureCoat 40): wear chemical resistant gloves (nitrile); wear safety glasses with side shields or goggles; see its safety data sheet.';

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

// ---- The types stay prompts; a draft with no product is unchanged ----

test('the types are the same as the register listed, and a draft with no product added has no products and no product lines', () => {
  assert.equal(R.TYPES.length, 19);
  assert.ok(R.TYPES.every((label) => R.SHORT.has(label)));
  const d = draft(POUR);
  assert.deepEqual(d.substances.items.map((item) => item.product), ['Cement, concrete, grout and mortar', 'Curing compounds and form release agents', 'Respirable crystalline silica (concrete, masonry, tile and stone dust)', 'Fuels (diesel, petrol)']);
  assert.equal('products' in d.substances, false);
  assert.ok(d.jobSteps.every((step) => !step.substanceLines));
  // The same with an empty list sent.
  assert.deepEqual(prepareDraft(draftBody({ ...base(POUR), substances: [] })), d);
  assert.equal(draftBody({ substances: [] }).substances, undefined);
});

test('a type with no product never prints: no table of types with blank product names, in Word, PDF or on the page', async () => {
  const d = draft(POUR);
  const word = await wordText(d);
  assert.ok(!word.includes('Hazardous substances'));
  assert.ok(!word.includes('Safety data sheet attached'));
  assert.ok(!word.includes('Cement, concrete, grout and mortar'));
  assert.equal(substances.tableRows(d).length, 0);
  // A product with no name yet is not a row.
  const unnamed = draft(POUR, { substances: [{ id: 'sub-1', type: 'Cement, concrete, grout and mortar', sdsDate: '2024-01-01' }] });
  assert.equal(substances.tableRows(unnamed).length, 0);
  assert.ok(unnamed.jobSteps.every((step) => !step.substanceLines));
  const pdf = await pdfWords(await draftToPdf(d, {}));
  assert.ok(!pdf.includes('Safety data sheet attached'));
});

// ---- Printing: the Controls column and the step's line ----

test('each product prints in the table with its Controls, and its step gets one line naming it, in Word and PDF', async () => {
  const d = draft(POUR, { substances: [CURE] });
  const product = d.substances.products[0];
  assert.equal(product.step, 'Cure the concrete');
  assert.equal(product.matched, 'Cure the concrete');
  assert.equal(product.line, CURE_LINE);
  assert.equal(product.need, '');
  const steps = d.jobSteps.filter((step) => step.controls.includes(CURE_LINE)).map((step) => step.step);
  assert.deepEqual(steps, ['Cure the concrete']);
  assert.deepEqual(d.jobSteps.find((step) => step.step === 'Cure the concrete').substanceLines, [CURE_LINE]);
  // Only the line is added: every other line is as it was, in the same order.
  const before = draft(POUR);
  d.jobSteps.forEach((step, i) => assert.deepEqual(step.controls.filter((line) => line !== CURE_LINE), before.jobSteps[i].controls, step.step));
  assert.deepEqual(substances.TABLE_HEAD, ['Product', 'Hazards', 'Controls', 'First aid', 'Storage and spills', 'Safety data sheet']);
  assert.deepEqual(substances.tableRows(d), [[
    'CureCoat 40\nCuring compounds and form release agents\nSupplier: Example Chemicals Pty Ltd',
    'H315 Causes skin irritation.',
    'Wear chemical resistant gloves (nitrile).\nWear safety glasses with side shields or goggles.',
    'Skin: wash with plenty of soap and water.',
    'Store in a cool, well ventilated place.\nContain spills with sand or earth.',
    'Issued 12 March 2024.',
  ]]);
  const word = await wordText(d);
  for (const text of ['Hazardous substances', 'Controls', 'Storage and spills', 'CureCoat 40', 'Wear safety glasses with side shields or goggles.', 'Issued 12 March 2024.', CURE_LINE]) assert.ok(word.includes(text), text);
  assert.ok(word.indexOf('Each product used, with the controls from its own safety data sheet') > 0);
  const pdf = await pdfWords(await draftToPdf(d, {}));
  for (const text of ['Hazardous substances', 'CureCoat 40', 'Storage and spills']) assert.ok(pdf.includes(text), text);
  assert.ok(pdf.replace(/\s/g, '').includes(CURE_LINE.replace(/\s/g, '')));
});

test('an empty column says which section of the SDS to read; a file attached is named; quantity and supplier print with the product', () => {
  const d = draft(POUR, { substances: [{ id: 'sub-2', type: 'Cement, concrete, grout and mortar', product: 'GP Cement', quantity: '20 bags', sdsDate: '2023-05-01', controls: ['Avoid skin contact with wet cement.'], file: { id: 'df_abcdefghijklmnopqrstu', name: 'GP Cement SDS.pdf', type: 'application/pdf', size: 4096 }, confirmed: true }] });
  assert.deepEqual(substances.tableRows(d)[0], [
    'GP Cement\nCement, concrete, grout and mortar\nQuantity: 20 bags',
    'See its safety data sheet, section 2.',
    'Avoid skin contact with wet cement.',
    'See its safety data sheet, section 4.',
    'See its safety data sheet, sections 6 and 7.',
    'Issued 1 May 2023.\nA copy is attached to this SWMS in SiteReady (GP Cement SDS.pdf).',
  ]);
  // Its line goes in the step whose lines name wet concrete, after the step's lines of its level.
  assert.equal(d.substances.products[0].step, 'Place concrete');
  assert.equal(d.substances.products[0].line, 'Cement product (GP Cement): avoid skin contact with wet cement; see its safety data sheet.');
  // The SDS file is kept with the saved SWMS, as a design's file is.
  assert.deepEqual(substances.fileIds({ substances: [{ id: 'sub-2', file: { id: 'df_abcdefghijklmnopqrstu' } }] }), ['df_abcdefghijklmnopqrstu']);
});

test('the step: SiteReady matches it by the type the step already names; the user may choose another; with none matched the user chooses', () => {
  const steps = draft(POUR).jobSteps;
  assert.equal(R.matchStep('Curing compounds and form release agents', steps), 'Cure the concrete');
  assert.equal(R.matchStep('Cement, concrete, grout and mortar', steps), 'Place concrete');
  // Never the general steps at the start and end.
  assert.ok(!['Before starting', 'Finish and clean up'].includes(R.matchStep('Fuels (diesel, petrol)', steps)));
  // The user's choice of step stands while the step is in the SWMS.
  const chosen = draft(POUR, { substances: [{ ...CURE, step: 'Set edge forms and prepare the base' }] });
  assert.equal(chosen.substances.products[0].step, 'Set edge forms and prepare the base');
  assert.ok(chosen.jobSteps.find((step) => step.step === 'Set edge forms and prepare the base').controls.includes(CURE_LINE));
  assert.ok(!chosen.jobSteps.find((step) => step.step === 'Cure the concrete').controls.includes(CURE_LINE));
  // Another product, matched to no step: no line until the user chooses one, and the gate asks.
  const other = draft(POUR, { substances: [{ ...CURE, id: 'sub-3', type: '', product: 'Brush cleaner X' }] });
  assert.equal(other.substances.products[0].step, '');
  assert.equal(other.substances.products[0].line, '');
  assert.ok(other.jobSteps.every((step) => !step.substanceLines));
  assert.equal(other.substances.products[0].need, 'For Brush cleaner X, give the job step that uses it.');
  const placed = draft(POUR, { substances: [{ ...CURE, id: 'sub-3', type: '', product: 'Brush cleaner X', step: 'Finish and clean up' }] });
  assert.ok(placed.jobSteps.find((step) => step.step === 'Finish and clean up').controls.includes('Brush cleaner X: wear chemical resistant gloves (nitrile); wear safety glasses with side shields or goggles; see its safety data sheet.'));
});

test('a product\'s line is never a sign-on check question: it names the product', () => {
  const { questionPool } = require('../sign-read');
  const d = draft(POUR, { substances: [{ ...CURE, type: '', product: 'Brush cleaner X', step: 'Cure the concrete' }] });
  const pool = questionPool('swms-1', d);
  assert.ok(pool.steps.length > 0);
  for (const item of [...pool.steps, ...pool.ppe]) for (const text of [item.correct, ...item.decoys]) assert.ok(!/^Brush cleaner X/.test(text), text);
});

// ---- The download waits for each product, checked against its SDS ----

test('confirm needed: the download waits until each product is complete and ticked "These match the SDS"; the refusal names it', () => {
  const input = draftBody({ ...base(POUR), substances: [{ ...CURE, confirmed: false }] });
  const d = prepareDraft(input);
  const gaps = downloadGaps(input, d).filter((gap) => gap.kind === 'substance');
  assert.deepEqual(gaps, [{ id: 'substance.sub-1', kind: 'substance', field: 'substance-sub-1', label: 'Hazardous substance: CureCoat 40', substance: 'sub-1', need: 'Check CureCoat 40 against its safety data sheet and tick "These match the SDS".' }]);
  assert.match(gateMessage(downloadGaps(input, d)), /each hazardous product is listed and checked against its safety data sheet and no blank is left in it\..*Hazardous substance: CureCoat 40/);
  const ticked = draftBody({ ...base(POUR), substances: [CURE] });
  assert.deepEqual(downloadGaps(ticked, prepareDraft(ticked)).filter((gap) => gap.kind === 'substance'), []);
  // No product added: no product is asked about (the types are asked about below).
  assert.deepEqual(downloadGaps(draftBody(base(POUR)), draft(POUR)).filter((gap) => gap.kind === 'substance'), []);
});

test('D277: each type SiteReady suggests needs a product or the tick "Not required" before download; a tick prints nothing', () => {
  const plain = draftBody(base(POUR));
  const d = prepareDraft(plain);
  const types = (input) => downloadGaps(input, prepareDraft(input)).filter((gap) => gap.kind === 'substanceType');
  assert.deepEqual(types(plain).map((gap) => [gap.label, gap.need, gap.field]), [
    ['Hazardous substance: cement, concrete, grout and mortar', 'Cement product: add the product you use, or tick "Not required".', 'sub-type-7'],
    ['Hazardous substance: curing compounds and form release agents', 'Curing compound or release agent: add the product you use, or tick "Not required".', 'sub-type-10'],
    ['Hazardous substance: respirable crystalline silica (concrete, masonry, tile and stone dust)', 'Product with crystalline silica: add the product you use, or tick "Not required".', 'sub-type-11'],
    ['Hazardous substance: fuels (diesel, petrol)', 'Fuel: add the product you use, or tick "Not required".', 'sub-type-13'],
  ]);
  assert.match(gateMessage(downloadGaps(plain, d)), /each hazardous product is listed and checked against its safety data sheet/);
  // All ticked: nothing asked, and the draft, the print and the builder check are as before.
  const all = d.substances.items.map((item) => item.product);
  const ticked = draftBody({ ...base(POUR), substancesNotUsed: all });
  // The task names curing compound, so its tick needs a short reason (D292 item 3); with one, nothing is asked.
  assert.deepEqual(types(ticked).map((gap) => gap.need), ['Curing compound or release agent: your task or answers name "curing compound". Add the product you use, or give a short reason it is not required, for example "supplied and applied by others".']);
  assert.deepEqual(types(draftBody({ ...base(POUR), substancesNotUsed: all, substancesNotUsedWhy: { 'Curing compounds and form release agents': 'Supplied and applied by the concreter' } })), []);
  assert.deepEqual(prepareDraft(ticked), d);
  assert.deepEqual(checkSwms(fromDraft(prepareDraft(ticked), { state: 'qld' }), { state: 'qld' }), checkSwms(fromDraft(d, { state: 'qld' }), { state: 'qld' }));
  assert.equal(substances.tableRows(prepareDraft(ticked)).length, 0);
  // A product of a type covers it; an unticked type left over is still asked about.
  const mixed = draftBody({ ...base(POUR), substances: [CURE], substancesNotUsed: ['Respirable crystalline silica (concrete, masonry, tile and stone dust)', 'Fuels (diesel, petrol)'] });
  assert.deepEqual(types(mixed).map((gap) => gap.need), ['Cement product: add the product you use, or tick "Not required".']);
  // Only known types are kept from what the page sends.
  assert.deepEqual(draftBody({ substancesNotUsed: ['Fuels (diesel, petrol)', 'Anything', 5] }).substancesNotUsed, ['Fuels (diesel, petrol)']);
  assert.equal(draftBody({ substancesNotUsed: ['Anything'] }).substancesNotUsed, undefined);
});

test('D277, D282: the "Safety data sheet" question is dropped once a product is listed; its answer stays in a step until a product is placed there', () => {
  const PAINT = 'Paint the plant room walls with acrylic paint and the doors with enamel.';
  const asked = (extra = {}) => questionsFor({ ...base(PAINT), facts: {}, ...extra }).required.map((item) => item.id);
  assert.ok(asked().includes('safetyDataSheet'));
  const paint = { id: 'sub-1', type: 'Paints and coatings', product: 'Wallcoat 2', sdsDate: '2025-02-01', controls: ['Use with good ventilation.'], confirmed: true };
  assert.ok(!asked({ substances: [paint] }).includes('safetyDataSheet'));
  // A card with no product name yet does not drop it.
  assert.ok(asked({ substances: [{ id: 'sub-1', type: 'Paints and coatings' }] }).includes('safetyDataSheet'));
  const answer = 'The products used are acrylic and enamel paint. They are used with good ventilation and away from ignition sources, with the gloves and eye protection their safety data sheets list.';
  const lines = (d) => d.jobSteps.flatMap((step) => step.controls).filter((line) => /acrylic and enamel paint/.test(line));
  assert.ok(lines(draft(PAINT, { facts: { ...base(PAINT).facts, safetyDataSheet: answer } })).length > 0);
  const listed = draft(PAINT, { facts: { ...base(PAINT).facts, safetyDataSheet: answer }, substances: [{ ...paint, step: 'Prepare to paint' }] });
  assert.equal(listed.kind, 'draft');
  // The product is placed in the step the answer printed in: its own SDS controls replace the answer there.
  assert.deepEqual(lines(listed), []);
  assert.ok(listed.jobSteps.find((step) => step.step === 'Prepare to paint').controls.some((line) => /^Paint or coating \(Wallcoat 2\)/.test(line)));
  // Left to SiteReady, paint goes in the step that paints, not the one that prepares for it (messy round 4).
  const matched = draft(PAINT, { facts: { ...base(PAINT).facts, safetyDataSheet: answer }, substances: [paint] });
  assert.ok(matched.jobSteps.find((step) => step.step === 'Paint').controls.some((line) => /^Paint or coating \(Wallcoat 2\)/.test(line)));
  // Placed in another step, the answer stays where it was.
  const elsewhere = draft(PAINT, { facts: { ...base(PAINT).facts, safetyDataSheet: answer }, substances: [{ ...paint, step: 'Finish and clean up' }] });
  assert.deepEqual(elsewhere.jobSteps.filter((step) => step.controls.some((line) => /acrylic and enamel paint/.test(line))).map((step) => step.step), ['Prepare to paint']);
  // Unanswered, it does not hold the draft once a product is listed.
  const { safetyDataSheet: _gone, ...facts } = base(PAINT).facts;
  assert.equal(draft(PAINT, { facts, substances: [paint] }).kind, 'draft');
});

test('what a product still needs, in plain words: name, controls, issue date, step, and no placeholder', () => {
  const need = (row, step = 'Cure the concrete') => R.substanceNeed(row, step);
  assert.equal(need({ type: 'Cement, concrete, grout and mortar' }, ''), 'For this cement product, give its product name, the PPE and controls its safety data sheet sets out, one a line, the issue date on its safety data sheet and the job step that uses it. Then tick "These match the SDS".');
  assert.equal(need({ product: 'TBC', controls: ['Wear gloves.'], sdsDate: '2024-01-01', confirmed: true }), 'For this product, give its product name.');
  assert.equal(need({ product: 'CureCoat 40', controls: ['To be confirmed'], sdsDate: '2024-01-01', confirmed: true }), 'For CureCoat 40, give the PPE and controls its safety data sheet sets out, one a line.');
  assert.equal(need({ product: 'CureCoat 40', controls: ['Wear gloves.'], sdsDate: 'March 2024', confirmed: true }), 'For CureCoat 40, give the issue date on its safety data sheet.');
  assert.equal(need({ product: 'CureCoat 40', controls: ['Wear gloves.'], sdsDate: '2024-03-12', hazards: ['none'], confirmed: true }), 'For CureCoat 40, give a line in hazard statements that is not an answer yet (take it out or fill it in).');
  assert.equal(need({ product: 'CureCoat 40', controls: ['Wear gloves.'], sdsDate: '2024-03-12', supplier: 'unknown', confirmed: true }), 'For CureCoat 40, give its supplier (or leave the supplier empty).');
  assert.equal(need({ ...CURE }), '');
});

test('an SDS more than 5 years old is flagged (WHS Regulations s 330(3)(a)); a date after today is a slip', () => {
  const today = new Date(Date.UTC(2026, 9, 13));
  assert.equal(R.sdsOld('2021-10-14', today), false);
  assert.equal(R.sdsOld('2021-10-12', today), true);
  assert.equal(R.sdsOld('', today), false);
  assert.equal(R.sdsFuture('2027-01-01', today), true);
  assert.match(R.OLD_NOTE, /more than 5 years old\. Its maker must review it at least every 5 years/);
  const d = draft(POUR, { substances: [{ ...CURE, sdsDate: '2015-06-01' }] });
  assert.equal(d.substances.products[0].old, true);
  // Flagged, not refused: the user decides with the supplier.
  assert.equal(d.substances.products[0].need, '');
});

test('the builder check: products listed name the chemicals; one not checked against its SDS loses a point; a draft with none is checked as before', () => {
  const w14 = (d) => checkSwms(fromDraft(d, { state: 'qld' }), { state: 'qld' }).findings.find((item) => item.rule === 'W14');
  const none = draft(POUR);
  assert.equal('substances' in fromDraft(none, { state: 'qld' }), false);
  const listed = w14(draft(POUR, { substances: [CURE] }));
  assert.equal(listed.points, 3);
  const unchecked = w14(draft(POUR, { substances: [{ ...CURE, confirmed: false }] }));
  assert.equal(unchecked.points, 2);
  assert.ok(unchecked.fixes.some((fix) => /Check each product's row against its safety data sheet and confirm it: CureCoat 40\./.test(fix)));
  // The product's line in its step is checkable (it names the product and its SDS), and says what the
  // table lists: adding a product costs nothing in W2, W3 or W8.
  const all = (d) => checkSwms(fromDraft(d, { state: 'qld' }), { state: 'qld' }).findings.filter((item) => ['W2', 'W3', 'W8'].includes(item.rule)).map((item) => item.points);
  assert.deepEqual(all(draft(POUR, { substances: [CURE] })), all(none));
  const bare = w14(draft(POUR, { substances: [{ ...CURE, controls: [] }] }));
  assert.equal(bare.points, 1);
  assert.ok(bare.fixes.some((fix) => /Give the controls from the safety data sheet for: CureCoat 40\./.test(fix)));
});

test('what the page sends is cleaned: known ids only, lists one item a line, at most 20 products, files by their id', () => {
  const body = draftBody({ substances: [
    { id: 'sub-1', type: 'Adhesives', product: '  Grip  Fast ', controls: 'Wear gloves.\n\n Ventilate the area. ', hazards: ['H319 Causes serious eye irritation.', 5], confirmed: 'yes', file: { id: 'bad id' }, read: { fields: ['product', 'other'] } },
    { id: 'design-1', product: 'X' },
    { id: 'sub-1', product: 'Duplicate' },
  ] });
  assert.deepEqual(body.substances, [{ id: 'sub-1', type: 'Adhesives', product: 'Grip Fast', supplier: '', quantity: '', sdsDate: '', hazards: ['H319 Causes serious eye irritation.'], controls: ['Wear gloves.', 'Ventilate the area.'], firstAid: [], storage: [], step: '', read: { fields: ['product'] }, confirmed: false }]);
  assert.equal(draftBody({ substances: Array.from({ length: 30 }, (_, i) => ({ id: `sub-${i + 1}`, product: 'P' })) }).substances.length, 20);
});

// ---- Reading the SDS: typed words only, every value found word for word ----

const company = { id: 'company-sds-read', name: 'Slabform' };
const SDS_LINES = [
  'SAFETY DATA SHEET',
  '1. IDENTIFICATION',
  'Product name: CureCoat 40',
  'Supplier: Example Chemicals Pty Ltd',
  'Issue date: 12/03/2024',
  '2. HAZARD IDENTIFICATION',
  'H315 Causes skin irritation.',
  'H319 Causes serious eye irritation.',
  '4. FIRST AID MEASURES',
  'Skin: wash with plenty of soap and water.',
  'Eyes: rinse cautiously with water for several minutes.',
  '6. ACCIDENTAL RELEASE MEASURES',
  'Contain spills with sand or earth.',
  '7. HANDLING AND STORAGE',
  'Store in a cool, well ventilated place.',
  '8. EXPOSURE CONTROLS AND PERSONAL PROTECTION',
  'Wear chemical resistant gloves (nitrile).',
  'Wear safety glasses with side shields or goggles.',
  'Use in a well ventilated area.',
];
function sdsPdf(lines) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const parts = [];
    doc.on('data', (part) => parts.push(part));
    doc.on('end', () => resolve(Buffer.concat(parts)));
    if (lines) lines.forEach((line) => doc.fontSize(10).text(line));
    else for (let i = 0; i < 40; i += 1) doc.rect(50 + (i % 5) * 100, 60 + Math.floor(i / 5) * 90, 90, 80).fill(i % 2 ? '#777777' : '#bbbbbb');
    doc.end();
  });
}
function standIn(answer) {
  const client = { calls: [], beta: { messages: { stream(params) {
    client.calls.push(params);
    return { finalMessage: async () => ({ stop_reason: 'end_turn', model: 'claude-opus-5-5', usage: { input_tokens: 3000, output_tokens: 900 }, content: [{ type: 'text', text: JSON.stringify(answer) }] }) };
  } } } };
  return client;
}
const upload = async (data, name) => designFiles.saveUpload({ companyId: company.id, userId: 'u1', data, name });
const READ = {
  product: 'CureCoat 40', supplier: 'Example Chemicals Pty Ltd', issueDate: '12/03/2024',
  hazards: ['H315 Causes skin irritation.', 'H319 Causes serious eye irritation.'],
  controls: ['Wear chemical resistant gloves (nitrile).', 'Wear safety glasses with side shields or goggles.', 'Always wear a full face respirator.'],
  firstAid: ['Skin: wash with plenty of soap and water.'],
  storage: ['Store in a cool, well ventilated place.', 'Contain spills with sand...'],
};

test.before(async () => {
  await setupAccounts();
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
});
test.after(() => {
  delete process.env.ANTHROPIC_API_KEY;
  aiScope.useClient(null);
});

test('the brief asks for the SDS\'s own words only, never a guess or advice of its own; its schema is strict', () => {
  assert.equal(SDS_BRIEF_VERSION, 'sds m1');
  assert.match(SDS_BRIEF, /Copy each value exactly as it is written in the text, word for word\./);
  assert.match(SDS_BRIEF, /Never guess, and never add advice of your own\./);
  assert.deepEqual(SDS_SCHEMA.required, ['product', 'supplier', 'issueDate', 'hazards', 'controls', 'firstAid', 'storage']);
  assert.equal(SDS_SCHEMA.additionalProperties, false);
});

test('quote check: a value not in the SDS word for word, or cut short with "...", is left out; the rest is used', () => {
  const text = SDS_LINES.join('\n');
  const { fields, notFound } = sdsRead.checkedSds(READ, text);
  assert.deepEqual(fields.controls, ['Wear chemical resistant gloves (nitrile).', 'Wear safety glasses with side shields or goggles.']);
  assert.deepEqual(fields.storage, ['Store in a cool, well ventilated place.']);
  assert.deepEqual(notFound.map((item) => item.where), ['controls', 'storage']);
  // A name found only inside another word is not found.
  assert.equal(sdsRead.checkedSds({ product: 'Cure' }, text).fields.product, undefined);
  assert.equal(sdsRead.checkedSds({ product: 'CureCoat 40' }, text).fields.product, 'CureCoat 40');
  // Never a piece cut from inside a sentence: not after "not", nor cut off before a comma.
  const found = sdsRead.sentenceFinder('4. FIRST AID Ingestion: Do not induce vomiting. Wear gloves, goggles and an apron. Hand protection Nitrile gloves. Eyes: rinse with water.');
  assert.equal(found('Induce vomiting.'), false);
  assert.equal(found('Do not induce vomiting.'), true);
  assert.equal(found('Wear gloves'), false);
  assert.equal(found('Wear gloves, goggles and an apron.'), true);
  assert.equal(found('Nitrile gloves.'), true);
  assert.equal(found('rinse with water'), true);
  assert.equal(found('with water.'), false);
  assert.deepEqual(sdsRead.rowDetails({ issueDate: '12/03/2024', product: 'CureCoat 40' }), { details: { product: 'CureCoat 40', sdsDate: '2024-03-12' }, read: ['product', 'sdsDate'] });
});

test('a typed SDS fills the row; only its words are sent; the cost is recorded; the same SDS is not read twice', async () => {
  const model = standIn(READ);
  aiScope.useClient(model);
  const file = await upload(await sdsPdf(SDS_LINES), 'CureCoat 40 SDS.pdf');
  const result = await sdsRead.readSds(company, file.id);
  assert.deepEqual(result.details, {
    product: 'CureCoat 40', supplier: 'Example Chemicals Pty Ltd',
    hazards: ['H315 Causes skin irritation.', 'H319 Causes serious eye irritation.'],
    controls: ['Wear chemical resistant gloves (nitrile).', 'Wear safety glasses with side shields or goggles.'],
    firstAid: ['Skin: wash with plenty of soap and water.'], storage: ['Store in a cool, well ventilated place.'], sdsDate: '2024-03-12',
  });
  assert.equal(result.dropped, 2);
  assert.equal(result.kept, false);
  const params = model.calls[0];
  assert.equal(params.model, 'claude-opus-5-5');
  assert.equal(params.system[0].text, SDS_BRIEF);
  assert.equal(params.output_config.effort, 'low');
  assert.equal(typeof params.messages[0].content, 'string');
  for (const line of SDS_LINES) assert.ok(params.messages[0].content.includes(line), line);
  // (3,000 x $4 + 900 x $20) per million = $0.03.
  const row = await db.one('SELECT cost_usd, status, checks FROM ai_readings WHERE company_id = $1 AND brief_version = $2', [company.id, 'sds m1']);
  assert.equal(Number(row.cost_usd), 0.03);
  assert.equal(row.status, 'done');
  assert.equal(JSON.parse(row.checks).passed, false);
  const again = await sdsRead.readSds(company, (await upload(await sdsPdf(SDS_LINES), 'copy.pdf')).id);
  assert.equal(again.kept, true);
  assert.equal(model.calls.length, 1);
  assert.deepEqual(again.details, result.details);
  // The SDS file is kept with a saved SWMS as a design's file is: one the business holds is not missing.
  assert.deepEqual(await designFiles.missingFiles(company.id, { substances: [{ id: 'sub-1', file: { id: file.id } }] }), []);
  assert.deepEqual(await designFiles.missingFiles(company.id, { substances: [{ id: 'sub-1', file: { id: 'df_notthereatallnotthere' } }] }), ['df_notthereatallnotthere']);
});

test('a scanned SDS, a photo or a file that is not an SDS is refused without a call; off without the key', async () => {
  const model = standIn(READ);
  aiScope.useClient(model);
  const scan = await upload(await sdsPdf(null), 'scan.pdf');
  await assert.rejects(sdsRead.readSds(company, scan.id), { status: 422, message: sdsRead.NO_WORDS });
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await assert.rejects(sdsRead.readSds(company, (await upload(PNG, 'photo.png')).id), { status: 422, message: sdsRead.NO_WORDS });
  const drawing = await upload(await sdsPdf(['GENERAL ARRANGEMENT PLAN LEVEL 3', ...Array.from({ length: 30 }, (_, i) => `GRID LINE ${i} SETOUT POINT`)]), 'plan.pdf');
  await assert.rejects(sdsRead.readSds(company, drawing.id), { status: 422, message: sdsRead.NOT_SDS });
  await assert.rejects(sdsRead.readSds(company, 'df_notthereatallnotthere'), { status: 404 });
  assert.equal(model.calls.length, 0);
  delete process.env.ANTHROPIC_API_KEY;
  try {
    await assert.rejects(sdsRead.readSds(company, scan.id), { status: 503, message: sdsRead.OFF });
  } finally {
    process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
  }
  assert.match(sdsRead.OFF, /^Reading the safety data sheet is not switched on here\. Type the product's details from it\.$/);
});

test('D287: the questions route names the types the work usually uses, for the one-go project page\'s ticks', async () => {
  const { app } = require('../server');
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const post = async (body) => (await fetch(`http://127.0.0.1:${server.address().port}/api/draft/questions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
    assert.deepEqual((await post(base(POUR))).substanceTypes, draft(POUR).substances.items.map((item) => item.product));
  } finally {
    server.close();
  }
});

// ---- The page ----

test('the page: the types as a prompt with an Add button each, a card for each product, sent with the draft, judged as typed, the table and step line shown', async () => {
  const { loadPage, settle } = require('./fake-dom');
  const p = loadPage(['gate-rules.js', 'app.js', 'substance-rules.js', 'substances.js'], () => ({ body: {} }));
  await settle();
  const S = p.window.SiteReadySubstances;
  const plain = draft(POUR);
  const sheet = p.window.SiteReady.render(plain, { movable: true });
  assert.match(sheet, /This work usually uses cement, concrete, grout and mortar, curing compounds and form release agents, respirable crystalline silica \(concrete, masonry, tile and stone dust\) and fuels \(diesel, petrol\)\. For each, add the product you use, with its safety data sheet, or tick &quot;Not required&quot;\./);
  assert.match(sheet, /data-sub-add="Curing compounds and form release agents">Add the product<\/button>/);
  assert.match(sheet, /<input type="checkbox" id="sub-type-10" data-sub-notused="Curing compounds and form release agents"><span>Not required<\/span>/);
  assert.match(sheet, /Add another product<\/button>/);
  // Ticked "Not required": the gate item clears at once, and the tick is sent and comes back.
  const typeCheck = { kind: 'substanceType', substanceType: 'Fuels (diesel, petrol)', field: 'sub-type-13', need: 'from the server' };
  assert.equal(p.run(`liveNeed(${JSON.stringify(typeCheck)})`), 'Fuel: add the product you use, or tick "Not required".');
  S.load([], ['Fuels (diesel, petrol)']);
  assert.equal(p.run(`liveNeed(${JSON.stringify(typeCheck)})`), '');
  assert.deepEqual(JSON.parse(p.run('JSON.stringify(payload().substancesNotUsed)')), ['Fuels (diesel, petrol)']);
  assert.match(p.window.SiteReady.render(plain, { movable: true }), /data-sub-notused="Fuels \(diesel, petrol\)" checked>/);
  S.load([], []);
  // No product: no table, nothing sent.
  assert.doesNotMatch(sheet, /sub-table|Type of product|Yes \/ No/);
  assert.equal(p.run('payload().substances'), undefined);
  // A product loaded (a reopened SWMS): its card, sent with the draft.
  S.load([{ ...CURE, confirmed: false, read: { fields: ['product', 'controls'] } }]);
  const withCard = p.window.SiteReady.render(plain, { movable: true });
  assert.match(withCard, /<legend>CureCoat 40<\/legend>/);
  assert.match(withCard, /Read from the safety data sheet: check each line matches it/);
  assert.match(withCard, /These match the SDS/);
  assert.match(withCard, /SiteReady&#39;s match: Cure the concrete/);
  assert.match(withCard, /accept="\.pdf,application\/pdf"/);
  assert.match(withCard, /It does not read a scanned SDS or a photo: type the details from it instead\./);
  const sent = JSON.parse(p.run('JSON.stringify(payload().substances)'));
  assert.equal(sent[0].product, 'CureCoat 40');
  assert.deepEqual(sent[0].controls, CURE.controls);
  // The gate item is judged from the card as it is now.
  const check = { kind: 'substance', substance: 'sub-1', field: 'substance-sub-1', need: 'from the server' };
  assert.equal(p.run(`liveNeed(${JSON.stringify(check)})`), 'Check CureCoat 40 against its safety data sheet and tick "These match the SDS".');
  S.load([{ ...CURE }]);
  assert.equal(p.run(`liveNeed(${JSON.stringify(check)})`), '');
  // In the draft: the table, and the product's line without tools to change it there.
  const d = draft(POUR, { substances: [CURE] });
  const shown = p.window.SiteReady.render(d, { movable: true });
  assert.match(shown, /<th>Controls<\/th>/);
  assert.match(shown, /Wear chemical resistant gloves \(nitrile\)\.<br>Wear safety glasses with side shields or goggles\./);
  assert.ok(shown.includes(`class="substance-line">${CURE_LINE.replace(/\(/g, '(')}<span class="meta"> From the product's safety data sheet. Change it under Hazardous substances.</span></li>`));
  // A saved SWMS shows the table only.
  const saved = p.window.SiteReady.render(d, {});
  assert.match(saved, /<h4>Hazardous substances<\/h4>/);
  assert.doesNotMatch(saved, /substances-panel/);
  p.run('newSwms()');
  assert.equal(p.run('payload().substances'), undefined);
});
