// The user's own hazards and Who (owner decision, 6 October 2026, item 8): hazards can be
// reworded and added; SiteReady's own hazards cannot be deleted, only marked as not applying,
// with an optional reason; the Who column can be changed. Word, PDF and the sign-on page print them.
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const JSZip = require('jszip');
const { prepareDraft, HAZARD_MARK, NOT_APPLICABLE } = require('../draft');
const { draftBody } = require('../input');
const { draftToDocx } = require('../docx-draft');
const { draftToPdf } = require('../pdf-draft');
const { loadPage, settle, FakeEvent } = require('./fake-dom');

const INPUT = { state: 'qld', task: 'Dig a trench 1 m deep with an excavator.', fallRisk: 'no', trade: 'civil' };
const plain = prepareDraft(draftBody(INPUT));
const excavate = plain.jobSteps.find((step) => step.step === 'Excavate');
const [FIRST, SECOND] = excavate.hazards;
const EDITS = {
  hazardEdits: { Excavate: { changed: [{ from: FIRST, to: 'The excavator bucket strikes a worker in the trench.' }], added: ['Wasps nest in the spoil heap.'], notApplicable: [SECOND], reasons: [{ line: SECOND, reason: 'anotherWay', note: 'Trench shield used.' }] } },
  whoEdits: { Excavate: 'Jo Smith, leading hand' },
};

test('hazards are reworded, added and marked as not applying, never deleted, and Who is changed', () => {
  const draft = prepareDraft(draftBody({ ...INPUT, ...EDITS }));
  const step = draft.jobSteps.find((item) => item.step === 'Excavate');
  assert.deepEqual(step.hazards, [
    `The excavator bucket strikes a worker in the trench. ${HAZARD_MARK}`,
    `${SECOND} ${NOT_APPLICABLE}`,
    ...excavate.hazards.slice(2),
    `Wasps nest in the spoil heap. ${HAZARD_MARK}`,
  ]);
  assert.equal(step.responsible, 'Jo Smith, leading hand');
  const kinds = draft.controlEdits.applied.map((item) => item.kind);
  assert.deepEqual(kinds, ['hazardChanged', 'hazardNotApplicable', 'hazardAdded', 'whoChanged']);
  const na = draft.controlEdits.applied.find((item) => item.kind === 'hazardNotApplicable');
  assert.deepEqual([na.from, na.reason, na.note], [SECOND, 'anotherWay', 'Trench shield used.']);
  // The risk rating is worked out from SiteReady's hazards, so a reworded hazard does not lower it.
  assert.deepEqual(step.risk, excavate.risk);
  // Other steps are as they were.
  assert.deepEqual(draft.jobSteps[0], plain.jobSteps[0]);
});

test('a hazard change that no longer matches is reported, and a reworded hazard is followed', () => {
  const draft = prepareDraft(draftBody({ ...INPUT, hazardEdits: { Excavate: { notApplicable: ['Lightning strikes the excavator.', FIRST.replace(/\.$/, ' or plant.')] } }, whoEdits: { 'Pour the slab': 'Concreter' } }));
  assert.deepEqual(draft.controlEdits.unmatched.map((item) => [item.step, item.kind, item.reason]), [['Pour the slab', 'whoChanged', 'step'], ['Excavate', 'hazardNotApplicable', 'line']]);
  assert.equal(draft.controlEdits.remapped[0].line, FIRST);
  assert.ok(draft.jobSteps.find((item) => item.step === 'Excavate').hazards.includes(`${FIRST} ${NOT_APPLICABLE}`));
});

test('hazard and Who changes are cleaned and size-limited when read from a request', () => {
  const long = 'x'.repeat(3000);
  const body = draftBody({ ...INPUT, hazardEdits: { Excavate: { changed: [{ from: long, to: long }, { from: 'a', to: '' }], added: Array(30).fill('y'), notApplicable: [1, 'z'], reasons: [{ line: 'z', reason: 'bad', note: 'n' }] }, Bad: 'x' }, whoEdits: { Excavate: long, Empty: '  ', Bad: 3 } });
  const edit = body.hazardEdits.Excavate;
  assert.equal(edit.changed.length, 1);
  assert.equal(edit.changed[0].to.length, 400);
  assert.equal(edit.added.length, 20);
  assert.deepEqual(edit.notApplicable, ['z']);
  assert.deepEqual(edit.reasons, [{ line: 'z', reason: '', note: 'n' }]);
  assert.deepEqual(Object.keys(body.hazardEdits), ['Excavate']);
  assert.deepEqual(Object.keys(body.whoEdits), ['Excavate']);
  assert.equal(body.whoEdits.Excavate.length, 120);
  assert.equal(draftBody(INPUT).hazardEdits, undefined);
});

test('the Word file and PDF print the user\'s hazards and Who', async () => {
  const draft = prepareDraft(draftBody({ ...INPUT, ...EDITS }));
  const xml = (await (await JSZip.loadAsync(await draftToDocx(draft))).file('word/document.xml').async('string')).replace(/<[^>]+>/g, '');
  assert.match(xml, /The excavator bucket strikes a worker in the trench\. \(Our own hazard\)/);
  assert.match(xml, /\(Does not apply to this job\)/);
  assert.match(xml, /Jo Smith, leading hand/);
  const raw = (await draftToPdf(draft)).toString('latin1');
  const text = [];
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let body;
    try { body = zlib.inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1'); } catch { continue; }
    for (const array of body.match(/\[[^\]]*\]\s*TJ/g) || []) text.push((array.match(/<([0-9a-fA-F]*)>/g) || []).map((hex) => Buffer.from(hex.slice(1, -1), 'hex').toString('latin1')).join(''));
  }
  assert.match(text.join(' '), /Jo Smith,\s+leading hand/);
  assert.match(text.join(' '), /Wasps nest in the spoil heap/);
});

test('in the preview, a hazard is marked as not applying, a hazard added and Who changed, and they go with the SWMS', async () => {
  const DRAFT = { kind: 'draft', state: 'Queensland', task: 'Dig.', highRisk: [], controls: [], site: [], ppe: [], references: [], sources: { legislation: [], codes: [] },
    jobSteps: [{ step: 'Excavate', hazards: ['The ground collapses.'], controls: ['Spoil is kept back.'], responsible: 'Plant operator' }] };
  const p = loadPage(['app.js', 'account.js', 'scope.js'], (method, route) => {
    if (route === '/api/draft') return { body: { ...DRAFT, controlLegal: [[]] } };
    if (route === '/api/steps') return { body: { groups: [] } };
    if (route === '/api/draft/questions') return { body: { required: [] } };
    return { body: {} };
  });
  await settle();
  p.document.getElementById('task').value = 'Dig.';
  p.document.getElementById('facts').dispatchEvent(new FakeEvent('submit'));
  await settle();
  p.run("applyHazardEdit(shownDraft.jobSteps[0], 'The ground collapses.', 'na')");
  await settle();
  p.run("hazardEditFor('Excavate').added.push('Wasps.')");
  p.run("setReason('Excavate', 'The ground collapses.', { reason: 'notNeeded' }, 'hazard')");
  p.run("setWho(shownDraft.jobSteps[0], 'Jo Smith')");
  await settle();
  const sent = p.calls.filter((call) => call.route === '/api/draft').pop().body;
  assert.deepEqual(sent.hazardEdits, { Excavate: { changed: [], added: ['Wasps.'], notApplicable: ['The ground collapses.'], reasons: [{ line: 'The ground collapses.', reason: 'notNeeded', note: '' }] } });
  assert.deepEqual(sent.whoEdits, { Excavate: 'Jo Smith' });
  // It applies after all: the mark and its reason go.
  p.run(`applyHazardEdit(shownDraft.jobSteps[0], 'The ground collapses. ${NOT_APPLICABLE}', 'applies')`);
  await settle();
  assert.deepEqual(JSON.parse(p.run('JSON.stringify(hazardEdits)')), { Excavate: { changed: [], added: ['Wasps.'], notApplicable: [] } });
  // A new SWMS starts without them.
  p.window.SiteReady.newSwms();
  assert.equal(p.run('hazardEdits'), null);
  assert.equal(p.run('whoEdits'), null);
});
