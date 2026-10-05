// The evidence record covers every library control line, and the evidenced share does not drop
// (evidence pass, 6 October 2026: 3,222 of 4,312 lines, 74.7%).
const test = require('node:test');
const assert = require('node:assert/strict');
const { libraryLines, measure, evidenced } = require('../scripts/control-evidence');
const RECORD = require('../scenarios/control-evidence.json');

const MEASURED = 0.747;

test('every library control line is in the evidence record, and every record entry is a library line', () => {
  const lines = libraryLines();
  const { unlisted } = measure();
  // A new line is "none" until it is classified: add it to scenarios/control-evidence.json.
  assert.deepEqual(unlisted, [], 'library lines missing from scenarios/control-evidence.json');
  const library = new Set(lines);
  assert.deepEqual(Object.keys(RECORD).filter((text) => !library.has(text)), [], 'record entries that are no longer library lines');
});

test('each record entry is code, reg, practice (with its number of organisations) or none', () => {
  for (const [text, entry] of Object.entries(RECORD)) {
    assert.ok(['code', 'reg', 'practice', 'none'].includes(entry.kind), text);
    if (entry.kind === 'practice') assert.ok(Number.isInteger(entry.orgs) && entry.orgs >= 1, text);
    else assert.equal(entry.orgs, undefined, text);
    if (entry.unverifiable) assert.equal(entry.kind, 'none', text);
  }
});

test('the evidenced share does not drop below the measured figure', () => {
  const { share } = measure();
  assert.ok(share >= MEASURED, `evidenced share ${(100 * share).toFixed(1)}% is below ${(100 * MEASURED).toFixed(1)}%`);
});

test('a new, unclassified line counts as not evidenced', () => {
  const lines = [...libraryLines(), 'A line added later.'];
  const before = measure(RECORD, libraryLines());
  const after = measure(RECORD, lines);
  assert.equal(after.evidenced, before.evidenced);
  assert.deepEqual(after.unlisted, ['A line added later.']);
  assert.equal(evidenced({ kind: 'practice', orgs: 1 }), false);
  assert.equal(evidenced({ kind: 'practice', orgs: 2 }), true);
  assert.equal(evidenced({ kind: 'none', unverifiable: true }), false);
});
