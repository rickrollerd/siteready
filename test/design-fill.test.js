// Designs given at the question that asks for them, filling the answer's design blanks (owner, D243),
// and blanks left in answers named in a bold red warning (D241, D245). public/design-fill.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { prepareDraft, questionsFor } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { downloadGaps } = require('../download-gate');
const { draftToDocx } = require('../docx-draft');
const { checkSwms, fromDraft } = require('../builder-check');
const { ANSWERED } = require('./helpers');
const fill = require('../public/design-fill');
const { loadPage, settle } = require('./fake-dom');

const SLAB = 'Supply and install formwork and propping to suspended slabs, then strip and backprop';
const FORMWORK = { id: 'formwork', what: 'Formwork design', status: 'given', by: 'Smith Engineering', number: 'ABC-S-101', revision: 'C', date: '2026-10-03' };
const standard = (id, label) => answersFor(id, '').find((item) => item.label === label).text;

test('the questions whose answers refer to a design each name the design row that fills them', () => {
  const asked = (task) => questionsFor(draftBody({ ...ANSWERED, state: 'qld', fallRisk: 'yes', residential: 'no', task })).required.map((item) => item.id);
  assert.deepEqual(asked(SLAB).filter((id) => fill.QUESTION_DESIGNS[id]), ['temporarySupport', 'formworkDesign', 'loadLimits']);
  assert.deepEqual(fill.QUESTION_DESIGNS.formworkDesign, { id: 'formwork', label: 'Formwork design' });
  const { KIND_BY_ID } = require('../designs');
  for (const item of Object.values(fill.QUESTION_DESIGNS)) assert.ok(KIND_BY_ID.has(item.id), item.id);
  // Every standard answer of these questions with a design or drawing blank is filled from the design.
  for (const id of Object.keys(fill.QUESTION_DESIGNS)) {
    const blanks = answersFor(id, '').filter((item) => /\b(?:design|drawing) ____/.test(item.text));
    assert.ok(blanks.length, id);
    for (const item of blanks) assert.doesNotMatch(fill.fillDesign(item.text, FORMWORK).text, /\b(?:design|drawing) ____/, `${id}: ${item.label}`);
  }
});

test('the design fills the number and revision; a new revision or "Not issued yet" replaces them; the person blank stays', () => {
  const text = standard('formworkDesign', 'Engineer\'s design');
  const first = fill.fillDesign(text, FORMWORK);
  assert.equal(first.text, 'Formwork and falsework are to the engineer\'s design ABC-S-101 (revision C), checked and signed off by ____ before the pour.');
  const revised = fill.fillDesign(first.text, { ...FORMWORK, revision: 'D' }, first.applied);
  assert.equal(revised.text, 'Formwork and falsework are to the engineer\'s design ABC-S-101 (revision D), checked and signed off by ____ before the pour.');
  // The person blank, filled by the user, stays as typed when the design changes again.
  const typed = revised.text.replace('____', 'Pat Lee, formwork supervisor');
  const notIssued = fill.fillDesign(typed, { ...FORMWORK, status: 'notIssued' }, revised.applied);
  assert.equal(notIssued.text, 'Formwork and falsework are to the engineer\'s design (not issued yet: the work does not start until it is issued and this SWMS is updated), checked and signed off by Pat Lee, formwork supervisor before the pour.');
  // Not answered: the blanks come back. No revision: the revision is left out.
  assert.equal(fill.fillDesign(notIssued.text, { ...FORMWORK, status: '' }, notIssued.applied).text, typed.replace('ABC-S-101 (revision D)', '____ (revision ____)'));
  assert.equal(fill.fillDesign(text, { ...FORMWORK, revision: '' }).text.startsWith('Formwork and falsework are to the engineer\'s design ABC-S-101, checked'), true);
  // A sentence with only a number blank takes "rev C" after the number; a load in kPa is not a design blank.
  assert.equal(fill.fillDesign(standard('temporarySupport', 'Engineer\'s design'), FORMWORK).text, 'Temporary supports are to the engineer\'s design ABC-S-101 rev C, installed and checked by ____ before loads are applied.');
  assert.equal(fill.fillDesign(standard('loadLimits', 'Engineer\'s drawing'), FORMWORK).text, 'Loads are placed only in the areas marked on the structural engineer\'s drawing ABC-S-101 rev C (____ kPa), checked by ____ before loading starts.');
  // Words the user changed are left alone; a design with no number fills nothing.
  assert.equal(fill.fillDesign('Formwork to drawing set FW-1 as issued.', FORMWORK).text, 'Formwork to drawing set FW-1 as issued.');
  assert.equal(fill.fillDesign(text, { ...FORMWORK, number: '' }).text, text);
  // Details read from the drawing fill the answer only once ticked as matching it (D250).
  assert.equal(fill.fillDesign(text, { ...FORMWORK, read: { fields: ['number'], checked: false } }).text, text);
  assert.equal(fill.fillDesign(text, { ...FORMWORK, read: { fields: ['number'], checked: true } }).text, first.text);
  // A reopened SWMS: what was filled before is found again, so the next change replaces it.
  const kept = fill.filledFrom(first.text, FORMWORK);
  assert.equal(fill.fillDesign(first.text, { ...FORMWORK, number: 'ABC-S-102' }, kept).text, first.text.replace('ABC-S-101', 'ABC-S-102'));
});

test('each blank left is named in the warning (D245); none left, no warning', () => {
  const text = standard('formworkDesign', 'Engineer\'s design');
  assert.equal(fill.blankWarning(fill.fillDesign(text, FORMWORK).text), 'Fill in the blank: who checks and signs off the formwork before the pour.');
  assert.equal(fill.blankWarning(text), 'Fill in the blanks: the design number; its revision; who checks and signs off the formwork before the pour.');
  assert.equal(fill.blankWarning(standard('loadLimits', 'Engineer\'s drawing')), 'Fill in the blanks: the drawing number; the load limit in kPa; who checks the loads before loading starts.');
  assert.equal(fill.blankWarning(standard('excavationPlan', 'Geotechnical design')), 'Fill in the blanks: the design number; its revision; the steepest batter angle; the traffic management plan (TMP) number.');
  // A blank in words SiteReady does not know is named by the words around it.
  assert.equal(fill.blankWarning('The exclusion zone is ____ m around the rig.'), 'Fill in the blank: exclusion zone (metres).');
  assert.equal(fill.blankWarning('Checked and signed off by Pat Lee before the pour.'), '');
});

const answered = (task, extra = {}) => {
  const facts = {};
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor(draftBody({ ...ANSWERED, state: 'qld', fallRisk: 'yes', residential: 'no', task, facts, ...extra }));
    let added = false;
    for (const item of asked.required || []) {
      if (facts[item.id]) continue;
      facts[item.id] = item.choices ? item.choices[0].value : `As set out in the site plan: ${item.label}.`;
      added = true;
    }
    if (!added) break;
  }
  return { ...ANSWERED, state: 'qld', fallRisk: 'yes', residential: 'no', task, facts, ...extra };
};
const draft = (input) => prepareDraft(draftBody(input));

test('one design row: given at the question it fills the answer, prints in the table and in the steps; untouched, nothing changes', async () => {
  const plain = answered(SLAB);
  const before = draft(plain);
  assert.equal(before.kind, 'draft');
  // The formwork design the steps rely on, given at the question: the same row as the table's.
  const facts = { ...plain.facts, formworkDesign: fill.fillDesign(standard('formworkDesign', 'Engineer\'s design'), FORMWORK).text.replace('____', 'Pat Lee, formwork supervisor') };
  const withDesign = draft({ ...plain, facts, designs: [FORMWORK] });
  assert.deepEqual(withDesign.designs.map((row) => [row.id, row.reference]), [['formwork', 'ABC-S-101 rev C (Smith Engineering, 3 October 2026)']]);
  const lines = withDesign.jobSteps.flatMap((step) => step.controls);
  assert.ok(lines.includes('Work to the formwork design ABC-S-101 rev C (Smith Engineering, 3 October 2026).'));
  assert.ok(lines.some((line) => line.includes('Formwork and falsework are to the engineer\'s design ABC-S-101 (revision C), checked and signed off by Pat Lee, formwork supervisor before the pour.')));
  const text = (await (await JSZip.loadAsync(Buffer.from(await draftToDocx(withDesign, {})))).file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ').replace(/&apos;/g, '\'').replace(/\s+/g, ' ');
  assert.ok(text.includes('Designs this SWMS relies on') && text.includes('ABC-S-101 rev C') && text.includes('engineer\'s design ABC-S-101 (revision C), checked and signed off by Pat Lee'));
  // A design no step relies on, given at its question (the load limits drawing): it prints in the
  // table once given in full, and nowhere else.
  const drawing = { id: 'loadDrawing', what: 'Structural engineer\'s drawing for the load limits', status: 'given', by: 'Smith Engineering', number: 'ABC-S-201', revision: 'A', date: '2026-10-01' };
  const both = draft({ ...plain, facts, designs: [FORMWORK, drawing] });
  assert.deepEqual(both.designs.map((row) => [row.id, row.needed, row.reference]), [['formwork', true, 'ABC-S-101 rev C (Smith Engineering, 3 October 2026)'], ['loadDrawing', false, 'ABC-S-201 rev A (Smith Engineering, 1 October 2026)']]);
  assert.deepEqual(both.jobSteps, withDesign.jobSteps);
  assert.deepEqual(draft({ ...plain, facts, designs: [FORMWORK, { ...drawing, date: '' }] }).designs.map((row) => row.id), ['formwork']);
  // The gate asks for the formwork design as before; the load limits drawing is not a gate item.
  const gaps = (input, d) => downloadGaps({ ...input, notCoveredConfirmed: d.notCovered }, d).filter((gap) => gap.kind === 'design').map((gap) => gap.id);
  assert.deepEqual(gaps({ ...plain, facts, designs: [FORMWORK, drawing] }, both), []);
  assert.deepEqual(gaps({ ...plain, facts, designs: [{ ...FORMWORK, number: '' }, drawing] }, draft({ ...plain, facts, designs: [{ ...FORMWORK, number: '' }, drawing] })), ['design.formwork']);
  // A blank left in an answer still holds the download, as before.
  const blank = { ...plain, facts: { ...facts, formworkDesign: standard('formworkDesign', 'Engineer\'s design') }, designs: [FORMWORK] };
  assert.ok(downloadGaps({ ...blank, notCoveredConfirmed: draft(blank).notCovered }, draft(blank)).some((gap) => /formwork/i.test(`${gap.label} ${gap.need || ''}`) && /blank|fill/i.test(`${gap.need || ''} ${gap.kind}`)));
  // Untouched, or an unanswered row sent for a question's design: the draft and the check are unchanged.
  const untouched = draft({ ...plain, designs: [{ id: 'loadDrawing', what: 'x', status: '' }, { id: 'excavation', status: '' }] });
  assert.deepEqual(untouched, before);
  const check = (d) => checkSwms(fromDraft(d, { state: 'qld', swms: { signatures: [{ name: 'Jo Smith', date: '12 October 2026' }] } }), { state: 'qld' });
  assert.deepEqual(check(untouched), check(before));
});

// The page's own drawing is driven in the browser test (tools/e2e.js); here, what it draws.
test('the page: the question holds its design card, which says what it does there; untouched, nothing is sent', async () => {
  const p = loadPage(['gate-rules.js', 'design-fill.js', 'app.js'], () => ({ body: {} }));
  await settle();
  const item = { id: 'formworkDesign', label: 'Formwork design', prompt: 'The formwork design.', suggestions: [{ label: 'Engineer\'s design', text: standard('formworkDesign', 'Engineer\'s design') }] };
  const html = p.run(`factHtml(${JSON.stringify(item)})`);
  assert.match(html, /<textarea id="fact-formworkDesign"[^>]*><\/textarea>\s*<div class="question-design" data-question-design="formworkDesign"><\/div>/);
  assert.doesNotMatch(p.run(`factHtml(${JSON.stringify({ ...item, id: 'fallControl' })})`), /question-design/);
  const card = p.run(`designCard({ id: 'formwork', what: 'Formwork design', status: '' }, null, { question: true })`);
  assert.match(card, /Give the design once here\. Its number and revision fill the answer above, and it prints in the designs table near the top of the SWMS\.<\/p>/);
  assert.match(card, /SiteReady reads the typed words of a PDF's title block to fill in the details above for you to check\. It does not read the drawing itself, a scan or a photo\./);
  assert.match(card, /I have it[^]*Not issued yet[^]*Not needed for this work/);
  assert.doesNotMatch(card, /Prints in the designs table near the top of the SWMS\.<\/p>/);
  // A question's design not answered is not sent; answered, it is.
  p.run(`designAnswers = [{ id: 'formwork', what: 'Formwork design', status: '', by: '', number: '', revision: '', date: '' }]`);
  assert.equal(p.run('payload().designs'), undefined);
  p.run(`designAnswers[0].status = 'given'; designAnswers[0].number = 'ABC-S-101'`);
  assert.equal(JSON.stringify(p.run('payload().designs').map((row) => [row.id, row.number])), JSON.stringify([['formwork', 'ABC-S-101']]));
});
