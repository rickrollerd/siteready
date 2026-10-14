// Owner D291 item 1: work moved into another SWMS of the project ("covered in", D289) comes off the Task
// line of the SWMS it left and is on the Task line of the SWMS it moved to, on the page, the Word file
// and the PDF. The work is still read from the task as given, so the move can be undone above the draft.
// Outside a project the SWMS named is only recorded, and the Task line is as typed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const JSZip = require('jszip');
const { prepareDraft } = require('../draft');
const { draftBody } = require('../input');
const { draftToDocx } = require('../docx-draft');
const { draftToPdf } = require('../pdf-draft');
const parts = require('../public/check-parts');

const BASE = { state: 'qld', fallRisk: 'no', residential: 'no', date: '6 October 2026', facts: { safetyDataSheet: 'The diesel safety data sheet is kept at the work area.' }, substancesNotUsed: require('../public/substance-rules').TYPES };
const draftOf = (task, extra = {}) => prepareDraft(draftBody({ ...BASE, task, ...extra }));
const moved = (part, to = 'Fuel system') => ({ notCoveredElsewhere: { [part]: to }, notCoveredConfirmed: [part], movedOut: [part] });

test('work moved into another SWMS of the project comes off the Task line it left, with its "and" or comma', () => {
  const task = 'Install the generator, leak test the fuel line and hang the artwork.';
  const before = draftOf(task);
  assert.deepEqual(before.notCovered, ['leak test the fuel line', 'hang the artwork']);
  assert.equal(draftOf(task, moved('hang the artwork')).task, 'Install the generator and leak test the fuel line.');
  assert.equal(draftOf(task, moved('leak test the fuel line')).task, 'Install the generator and hang the artwork.');
  // A sentence of its own goes whole, and the next one starts with a capital.
  assert.equal(draftOf('Hang the artwork in the foyer. Install the generator.', moved('Hang the artwork in the foyer')).task, 'Install the generator.');
  // The work is still listed above the draft, named as covered in the other SWMS, so the move can be undone.
  const after = draftOf(task, moved('hang the artwork'));
  assert.deepEqual(after.notCovered, before.notCovered);
  assert.equal(after.jobSteps.length, before.jobSteps.length);
});

test('outside a project, the SWMS named is only recorded and the Task line is as typed (D289)', () => {
  const task = 'Install the generator and leak test the fuel line.';
  const named = draftOf(task, { notCoveredElsewhere: { 'leak test the fuel line': 'Fuel SWMS' }, notCoveredConfirmed: ['leak test the fuel line'] });
  assert.equal(named.task, task);
  // movedOut for a part not named as covered elsewhere changes nothing.
  assert.equal(draftOf(task, { movedOut: ['leak test the fuel line'] }).task, task);
});

test('work moved here is on the Task line of the SWMS it moved to, once', () => {
  const into = draftOf('Install the generator.', { movedIn: [{ part: 'hang the artwork', from: 'SWMS 1 (Fit-out)' }] });
  assert.equal(into.task, 'Install the generator. Hang the artwork.');
  assert.ok(into.notCoveredMain.includes('hang the artwork'), 'it still needs its own step here');
  assert.equal(draftOf('Install the generator and hang the artwork.', { movedIn: [{ part: 'hang the artwork', from: 'SWMS 1' }] }).task, 'Install the generator and hang the artwork.');
});

test('the move changes the site details a person ticked as checked (D286), and prints on the Word file and the PDF', async () => {
  const task = 'Install the generator, leak test the fuel line and hang the artwork.';
  const left = draftOf(task, moved('hang the artwork'));
  assert.deepEqual(parts.staleParts(parts.partHashes(draftOf(task)), parts.partHashes(left)), ['site']);
  const xml = await (await JSZip.loadAsync(Buffer.from(await draftToDocx(left, {})))).file('word/document.xml').async('string');
  const words = xml.replace(/<[^>]+>/g, '');
  assert.match(words, /TaskInstall the generator and leak test the fuel line\./);
  assert.doesNotMatch(words, /artwork/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moved-'));
  try {
    const file = path.join(dir, 'left.pdf');
    fs.writeFileSync(file, await draftToPdf(left, {}));
    const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' }).replace(/\s+/g, ' ');
    assert.match(text, /Install the generator and leak test the fuel line\./);
    assert.doesNotMatch(text, /artwork/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
