// Two designs on one SWMS with the same document or drawing number (owner, D223, 12 October 2026).
// Where two or more designs answered "I have it" give the same number, each of their cards says so
// as the user types, and so does a saved SWMS when it is opened again. Numbers are compared without
// case, spaces, hyphens or dots. It is advice only: one drawing can cover two designs (one temporary
// works drawing for the shoring and the propping), so the download, the builder check and the Word
// and PDF files are the same as with different numbers.
const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { prepareDraft, questionsFor } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { downloadGaps } = require('../download-gate');
const { checkSwms, fromDraft } = require('../builder-check');
const { draftToDocx } = require('../docx-draft');
const { draftToPdf } = require('../pdf-draft');
const { sameDesignNumbers } = require('../public/gate-rules');
const { loadPage, settle, FakeEvent } = require('./fake-dom');
const { ANSWERED } = require('./helpers');

// A staged excavation with shoring and props, and propping to the building next door: two designs.
const TASK = 'Staged basement excavation with ground anchors, shoring wall and temporary props, excavated by 20 t excavator. Install temporary propping to the neighbouring building.';
const given = (id, what, number, revision = 'C') => ({ id, what, status: 'given', by: 'Smith Engineering', number, revision, date: '2026-10-03' });
const SAME = 'Shoring design and Propping design both give drawing ABC-S-101 rev C. Check each number against the design\'s title block. If the one drawing covers both, nothing needs changing.';

// ---- The comparison ----

test('the same number is found without case, spaces, hyphens or dots, only between designs the user has', () => {
  const pair = (a, b, extra = {}) => sameDesignNumbers([given('shoring', 'Shoring design', a), { ...given('propping', 'Propping design', b), ...extra }]);
  for (const [a, b] of [['ABC-S-101', 'abc s 101'], ['ABC-S-101', ' ABC.S.101 '], ['ABC-S-101', 'ABCS101'], ['ABC-S-101', 'abc - s - 101'], ['ABC-S-101', 'ABC–S–101']]) {
    assert.deepEqual(pair(a, b).map((group) => group.ids), [['shoring', 'propping']], `${a} and ${b}`);
  }
  // Different numbers, or a number not given yet, are not the same.
  for (const [a, b] of [['ABC-S-101', 'ABC-S-102'], ['ABC-S-101', 'ABC/S/101'], ['ABC-S-101', ''], ['', ''], ['TBC', 'tbc'], ['____', '____']]) assert.deepEqual(pair(a, b), [], `${a} and ${b}`);
  // Only designs answered "I have it": not issued yet, not needed or unanswered are not compared.
  for (const status of ['notIssued', 'notNeeded', '']) assert.deepEqual(pair('ABC-S-101', 'ABC-S-101', { status }), [], status);
  assert.deepEqual(sameDesignNumbers(undefined), []);
  assert.deepEqual(sameDesignNumbers([null, {}, given('a', 'A', 'X1')]), []);
});

test('the warning says which designs give the number and what to check: the same revision, or two revisions of one drawing', () => {
  const pair = (revA, revB) => sameDesignNumbers([given('shoring', 'Shoring design', 'ABC-S-101', revA), given('propping', 'Propping design', 'abc s 101', revB)])[0].text;
  // The same revision: one drawing may cover both.
  assert.equal(pair('C', 'rev c'), SAME);
  assert.equal(pair('', ''), 'Shoring design and Propping design both give drawing ABC-S-101. Check each number against the design\'s title block. If the one drawing covers both, nothing needs changing.');
  // Different revisions: most likely a mistake.
  assert.equal(pair('C', 'B'), 'Shoring design (rev C) and Propping design (rev B) both give drawing ABC-S-101. Two revisions of one drawing is most likely a mistake. Check each number and revision against the design\'s title block.');
  // A revision on one and not the other: check both.
  assert.equal(pair('C', ''), 'Shoring design (rev C) and Propping design (no revision) both give drawing ABC-S-101. Check each number and revision against the design\'s title block.');
  // Three designs, and two separate pairs.
  const rows = [given('a', 'Shoring design', 'X-1'), given('b', 'Propping design', 'Y-2'), given('c', 'Crane base design', 'x 1'), given('d', '', 'Y.2'), given('e', 'Formwork design', 'X1')];
  assert.deepEqual(sameDesignNumbers(rows), [
    { ids: ['a', 'c', 'e'], text: 'Shoring design, Crane base design and Formwork design all give drawing X-1 rev C. Check each number against the design\'s title block. If the one drawing covers them all, nothing needs changing.' },
    { ids: ['b', 'd'], text: 'Propping design and Another design both give drawing Y-2 rev C. Check each number against the design\'s title block. If the one drawing covers both, nothing needs changing.' },
  ]);
});

// ---- Advice only: the download, the builder check and the printed SWMS ----

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
const body = (designs) => answered({ ...ANSWERED, state: 'qld', fallRisk: 'no', residential: 'no', task: TASK, date: '12 October 2026', designs });
const designsFor = (numbers) => prepareDraft(draftBody(body())).designs.map((row, i) => given(row.id, row.what, numbers[i] || `SE-${i}`));

test('the same number never holds the download, changes the builder check or prints in Word or PDF', async () => {
  const shown = prepareDraft(draftBody(body())).designs.map((row) => row.id);
  assert.deepEqual(shown.slice(0, 2), ['propping', 'shoring'], 'the excavation relies on the propping and the shoring designs');
  const same = designsFor(['ABC-S-101', 'abc s 101', 'PP-7']);
  const apart = designsFor(['ABC-S-101', 'ABC-S-102', 'PP-7']);
  assert.equal(sameDesignNumbers(same).length, 1);
  assert.equal(sameDesignNumbers(apart).length, 0);
  const run = (designs) => {
    const input = body(designs);
    const d = prepareDraft(draftBody(input));
    return { d, gaps: downloadGaps({ ...input, notCoveredConfirmed: d.notCovered }, d), check: checkSwms(fromDraft(d, { state: 'qld', swms: { signatures: [{ name: 'Jo Smith', date: '12 October 2026' }] } }), { state: 'qld' }) };
  };
  const a = run(same);
  const b = run(apart);
  assert.deepEqual(a.gaps.filter((gap) => gap.kind === 'design'), []);
  assert.deepEqual(a.gaps.map((gap) => gap.id), b.gaps.map((gap) => gap.id), 'the gate asks the same with the same number');
  assert.equal(a.check.score, b.check.score, 'the builder check scores the same');
  assert.deepEqual(a.check.findings.map((item) => [item.rule, item.points]), b.check.findings.map((item) => [item.rule, item.points]));
  // Each design prints as given, and no warning prints.
  const word = (await (await JSZip.loadAsync(Buffer.from(await draftToDocx(a.d, {})))).file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.ok(word.includes('Work to the shoring design abc s 101 rev C') && word.includes('Work to the temporary works design (propping) ABC-S-101 rev C'));
  assert.ok(!/title block|both give drawing|same number/i.test(word));
  const pdf = await draftToPdf(a.d, {});
  assert.ok(!pdf.toString('latin1').includes('title block'));
  // The draft itself carries no note: the page works it out from the answers.
  assert.ok(!JSON.stringify(a.d).includes('title block'));
});

// ---- The page ----

const FOUND = [
  { id: 'shoring', what: 'Shoring design', label: 'Shoring design', steps: ['Install the shoring wall'], needed: true },
  { id: 'propping', what: 'Temporary works design (propping)', label: 'Temporary works design (propping)', steps: ['Install temporary support'], needed: true },
];
const note = (p, id) => p.document.getElementById(`design-${id}-same`);
// The user types in a card's box: the input event the cards listen for.
function type(p, id, field, value) {
  const event = new FakeEvent('input', { bubbles: true });
  event.target = { value, checked: true, dataset: { designField: field }, closest: () => ({ dataset: { design: id }, querySelector: () => ({}) }) };
  p.document.getElementById('designs-block').dispatchEvent(event);
}

test('the page: each card with the same number says so as the user types, and the note clears when one changes', async () => {
  const p = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }));
  await settle();
  p.run(`drawDesigns(${JSON.stringify(FOUND)})`);
  const html = p.document.getElementById('designs-block').innerHTML;
  assert.match(html, /<p class="warning design-same" id="design-shoring-same" hidden><\/p>/);
  assert.match(html, /<p class="warning design-same" id="design-propping-same" hidden><\/p>/);
  for (const [id, what] of [['shoring', 'Shoring design'], ['propping', 'Propping design']]) {
    type(p, id, 'status', 'given');
    type(p, id, 'what', what);
    type(p, id, 'revision', 'C');
  }
  type(p, 'shoring', 'number', 'ABC-S-101');
  assert.equal(note(p, 'shoring').hidden, true, 'one number alone says nothing');
  type(p, 'propping', 'number', 'abc s 101');
  for (const id of ['shoring', 'propping']) {
    assert.equal(note(p, id).hidden, false, id);
    assert.equal(note(p, id).textContent, SAME);
    assert.equal(p.document.getElementById(`design-${id}-number`).getAttribute('aria-describedby'), `design-${id}-same`);
  }
  // A different revision says so.
  type(p, 'propping', 'revision', 'B');
  assert.match(note(p, 'shoring').textContent, /^Shoring design \(rev C\) and Propping design \(rev B\) both give drawing ABC-S-101\. Two revisions of one drawing is most likely a mistake\./);
  // Changing one number clears both.
  type(p, 'propping', 'number', 'ABC-S-102');
  for (const id of ['shoring', 'propping']) {
    assert.equal(note(p, id).hidden, true, id);
    assert.equal(note(p, id).textContent, '');
    assert.equal(p.document.getElementById(`design-${id}-number`).getAttribute('aria-describedby'), null);
  }
  // Not issued yet is not compared.
  type(p, 'propping', 'number', 'ABC-S-101');
  assert.equal(note(p, 'shoring').hidden, false);
  type(p, 'propping', 'status', 'notIssued');
  assert.equal(note(p, 'shoring').hidden, true);
  // The download is judged as before: the warning is not on the gate list.
  type(p, 'propping', 'status', 'given');
  p.run("Object.assign(designRow('propping'), { by: 'Smith Engineering', date: '2026-10-03' }); Object.assign(designRow('shoring'), { by: 'Smith Engineering', date: '2026-10-03' })");
  for (const id of ['shoring', 'propping']) assert.equal(p.run(`liveNeed(${JSON.stringify({ kind: 'design', design: id, field: `design-${id}`, need: 'x' })})`), '');
  assert.equal(note(p, 'shoring').hidden, false);
  // What is sent with the draft is the user's answers only.
  assert.ok(!p.run('JSON.stringify(payload().designs)').includes('title block'));
});

test('a saved SWMS opened again says so above the SWMS, and on the cards once Change is chosen', async () => {
  const input = { ...body(designsFor(['ABC-S-101', 'abc.s.101', 'PP-7'])), ppe: [] };
  const draft = prepareDraft(draftBody(input));
  const saved = { swms: { id: 'saved-3', title: 'Basement', revision: 1, revisedAt: '2026-10-12', lastReviewedAt: '2026-10-12', reviewDueAt: '2027-01-12', reviewedBy: 'Sam', signonPath: '/sign.html?t=x' },
    input, draft, signons: [], revisions: [], update: { available: false, changes: [] } };
  let asked = 0;
  const respond = (method, route, sent) => {
    if (route === '/api/config') return { body: { accounts: true, trialDays: 14 } };
    if (route === '/api/me') return { body: { user: { email: 'a@b.example', name: 'Sam' }, company: { name: 'Co', abn: '1', hasAccess: true, planStatus: 'active' } } };
    if (route === '/api/sites') return { body: { sites: [] } };
    if (route === '/api/steps') return { body: { groups: [] } };
    if (route === '/api/swms/saved-3') return { body: saved };
    if (route === '/api/swms/saved-3/qr.svg') return { body: '<svg></svg>', headers: { 'content-type': 'image/svg+xml' } };
    // Change asks first with the form's answers not yet filled in, when no step relying on a design is
    // listed yet, then again with them. The designs come back with the answers the page sent.
    if (route === '/api/draft/questions') {
      asked += 1;
      const answers = new Map(((sent && sent.designs) || []).map((row) => [row.id, row]));
      const designs = asked === 1 ? [] : draft.designs.map((row) => ({ id: row.id, label: row.label, steps: row.steps, needed: row.needed, ...(answers.get(row.id) || { what: row.label }) }));
      return { body: { required: [], steps: { suggested: [], chosen: [], locked: [] }, designs } };
    }
    if (route === '/api/draft') return { body: { ...prepareDraft(draftBody(sent)), controlLegal: [] } };
    return { body: {} };
  };
  const p = loadPage(['gate-rules.js', 'app.js', 'account.js'], respond, { stored: { 'siteready.session': 'token' } });
  await settle();
  const open = new FakeEvent('click', { bubbles: true });
  open.target = { closest: (selector) => (selector === '[data-swms]' ? { dataset: { swms: 'saved-3' } } : null) };
  p.document.getElementById('swms-list').dispatchEvent(open);
  await settle();
  const view = p.document.getElementById('result').innerHTML;
  const text = 'Temporary works design (propping) and Shoring design both give drawing ABC-S-101 rev C. Check each number against the design&#39;s title block. If the one drawing covers both, nothing needs changing.';
  assert.ok(view.includes(`<div class="warning" id="saved-design-same"><p>${text}</p><p>To correct a number, choose Change, fix it under "Designs this work relies on" and save a new revision.</p></div>`), view.slice(0, 3000));
  assert.ok(view.indexOf('saved-design-same') < view.indexOf('class="sheet"'), 'above the SWMS, not in it');
  // Change: the cards come back with the same answers, and both say so.
  p.document.getElementById('saved-edit').click();
  await settle();
  assert.ok(asked >= 2, p.document.getElementById('saved-status').textContent);
  assert.deepEqual(JSON.parse(p.run('JSON.stringify(payload().designs)')), input.designs, 'the answers are kept, not asked again');
  for (const id of ['propping', 'shoring']) {
    assert.equal(note(p, id).hidden, false, id);
    assert.match(note(p, id).textContent, /^Temporary works design \(propping\) and Shoring design both give drawing ABC-S-101 rev C\./);
  }
  assert.equal(note(p, 'platform').hidden, true);
});
