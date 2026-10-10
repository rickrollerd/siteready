// The evidence record covers every library control line, and the evidenced share does not drop
// (evidence pass and its review, 6 October 2026: 3,222 of 4,321 lines, 74.6%; newly held law, refrigerant
// code and piling standard: 3,289 of 4,346, 75.7%; practice upgrades and 152 practice lines, most from one
// organisation so not yet evidenced: 3,341 of 4,498, 74.3%; owner decisions: 3,342 of 4,503, 74.2%;
// a mandatory requirement in a tier 1 builder's own standard counts as evidenced: 3,401 of 4,504, 75.5%;
// second practice pass over newer real SWMS, 58 practice lines added, most from one organisation so not yet
// evidenced: 3,436 of 4,571, 75.1%; regulator investigation findings for blasting, processing plant and
// conveyors, cited to the reports but recorded as regulator guidance so not counted: 3,436 of 4,606, 74.6%;
// practice upgrades from a third batch of real SWMS, 16 existing lines reaching two organisations:
// 3,454 of 4,608, 74.96% (four borderline matches that covered only part of a line, or hedged it, were not
// counted); then 112 lines from the same batch, 25 cited to code or regulation sections read and 14 required
// by two organisations, the other 73 from one organisation so not yet evidenced: 3,493 of 4,720, 74.0%;
// then a second tier 1 builder's formwork standard, where four one-organisation lines are stated as mandatory
// requirements and so count as tier 1: 3,497 of 4,720, 74.09%, which still rounds down to 0.740;
// owner decisions of 6 October 2026: seven work-named steps held earlier and four new ones, most lines from
// one organisation or none since no code, law or second organisation states them, three lines split into the
// part several organisations agree on and the remainder, and the 35°C work at height line removed:
// 3,507 of 4,777, 73.4%; library gaps found by the builder check's minimum controls and hazardous
// chemicals items in SiteReady's own drafts, filled by reusing evidenced lines word for word and two
// new lines cited to code sections read (potholing near located services, the welding rods' safety
// data sheet): 3,509 of 4,779, 73.4%; temporary bracing and slings released only once members are secured,
// ten lines from the Qld steel construction code and Victoria's steel erection industry standard, both read:
// 3,519 of 4,789, 73.5%; gap job steps of 10 October 2026 (TBM shafts, plant removal, lift controllers,
// underpinning, sprayed fire protection, rock sawing, data outlet terminations): 50 new lines, 47 cited to
// code or regulation sections read, the lift worker check-in line from regulator guidance and the two
// underpinning sequence lines from one training unit, so not yet evidenced: 3,573 of 4,846, 73.7%).
const test = require('node:test');
const assert = require('node:assert/strict');
const { libraryLines, measure, evidenced } = require('../scripts/control-evidence');
const RECORD = require('../scenarios/control-evidence.json');

const MEASURED = 0.737;

test('every library control line is in the evidence record, and every record entry is a library line', () => {
  const lines = libraryLines();
  const { unlisted } = measure();
  // A new line is "none" until it is classified: add it to scenarios/control-evidence.json.
  assert.deepEqual(unlisted, [], 'library lines missing from scenarios/control-evidence.json');
  const library = new Set(lines);
  assert.deepEqual(Object.keys(RECORD).filter((text) => !library.has(text)), [], 'record entries that are no longer library lines');
});

test('each record entry is code, reg, tier1, practice (with its number of organisations), guidance or none', () => {
  for (const [text, entry] of Object.entries(RECORD)) {
    assert.ok(['code', 'reg', 'tier1', 'practice', 'guidance', 'none'].includes(entry.kind), text);
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
  assert.equal(evidenced({ kind: 'guidance' }), false);
  assert.equal(evidenced({ kind: 'tier1' }), true);
});
