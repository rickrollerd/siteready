// How much of the control library is backed by evidence (owner goal, 6 October 2026: at least 95%).
// scenarios/control-evidence.json records each control line, keyed by its exact text, as:
//   code      cited to a code of practice section that was read and supports it
//   reg       cited to a regulation section that was read and supports it
//   practice  required by practice documents; "orgs" is how many independent organisations require it
//   tier1     stated as a mandatory requirement in a tier 1 builder's own safety standard (owner decision,
//             6 October 2026: that alone counts as evidenced)
//   guidance  supported only by regulator guidance (not a code of practice or the law); not counted
//   none      not yet evidenced ("unverifiable" where its only source is one not held, such as a model code number)
// A line counts as evidenced when it is code, reg, tier1, or practice with 2 or more organisations.
// A library line the record does not list counts as none until it is classified.
// Usage: node scripts/control-evidence.js
const { ACTIVITIES } = require('../activities');
const RECORD = require('../scenarios/control-evidence.json');

// Each control line in the library, once.
function libraryLines(activities = ACTIVITIES) {
  const lines = new Set();
  for (const activity of activities) {
    for (const step of activity.steps) {
      for (const control of step.controls) {
        const text = typeof control === 'string' ? control : control && control.text;
        if (typeof text === 'string') lines.add(text);
      }
    }
  }
  return [...lines];
}

const evidenced = (entry) => Boolean(entry) && (entry.kind === 'code' || entry.kind === 'reg' || entry.kind === 'tier1' || (entry.kind === 'practice' && entry.orgs >= 2));

function measure(record = RECORD, lines = libraryLines()) {
  const counts = { code: 0, reg: 0, tier1: 0, practice2: 0, practice1: 0, guidance: 0, none: 0, unverifiable: 0 };
  const unlisted = [];
  for (const text of lines) {
    const entry = record[text];
    if (!entry) unlisted.push(text);
    if (!entry || entry.kind === 'none') counts[entry && entry.unverifiable ? 'unverifiable' : 'none'] += 1;
    else if (entry.kind === 'practice') counts[entry.orgs >= 2 ? 'practice2' : 'practice1'] += 1;
    else counts[entry.kind] += 1;
  }
  const total = lines.length;
  const backed = lines.filter((text) => evidenced(record[text])).length;
  return { total, evidenced: backed, share: total ? backed / total : 0, counts, unlisted };
}

if (require.main === module) {
  const { total, evidenced: backed, share, counts, unlisted } = measure();
  const pct = (n) => `${((100 * n) / total).toFixed(1)}%`;
  console.log(`Control lines: ${total}`);
  console.log(`Evidenced: ${backed} (${pct(backed)})`);
  console.log(`  cited to a code of practice: ${counts.code} (${pct(counts.code)})`);
  console.log(`  cited to a regulation: ${counts.reg} (${pct(counts.reg)})`);
  console.log(`  mandatory in a tier 1 builder's standard: ${counts.tier1} (${pct(counts.tier1)})`);
  console.log(`  practice, 2 or more organisations: ${counts.practice2} (${pct(counts.practice2)})`);
  console.log(`Not yet evidenced: ${total - backed} (${pct(total - backed)})`);
  console.log(`  practice, 1 organisation: ${counts.practice1} (${pct(counts.practice1)})`);
  console.log(`  regulator guidance only: ${counts.guidance} (${pct(counts.guidance)})`);
  console.log(`  source not held (unverifiable): ${counts.unverifiable} (${pct(counts.unverifiable)})`);
  console.log(`  no evidence found: ${counts.none} (${pct(counts.none)})`);
  if (unlisted.length) console.log(`Lines not yet in scenarios/control-evidence.json (counted as none): ${unlisted.length}`);
}

module.exports = { libraryLines, measure, evidenced };
