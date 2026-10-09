// Goal 10, step 2 of the change process: when a section of a law or code changes, every control
// line that cites it, as it prints in that state's SWMS, so the change can be mapped to the lines
// it affects. Lines the drafting code adds in draft.js are listed separately to check by hand.
//
//   node scripts/lines-citing.js <state> "<law or code>" <section> [--json]
//
//   node scripts/lines-citing.js nsw "Work Health and Safety Regulation 2025" "s 299"
//   node scripts/lines-citing.js qld "Managing the risk of falls at workplaces" 3.4
//   node scripts/lines-citing.js nsw "SafeWork NSW Code of practice: Excavation work" "s 3"
//   node scripts/lines-citing.js all "Model Code: Excavation work" 3.5
//
// <state> is qld, nsw, vic, sa, wa, tas, act, nt or all. The law or code is matched by any part
// of its name as printed, ignoring case. A section matches itself, its subsections and
// subclauses (s 3 matches s 3.4 and s 3(2)), and any range it falls in (s 291 to s 295).
const fs = require('fs');
const path = require('path');
const { ACTIVITIES } = require('../activities');
const { localSource, localControl, citedStates } = require('../citations');

// "s 299", "r 299", "section 299", "Schedule 5" and "appendix K" all read the same way.
function sectionKey(value) {
  return String(value || '').trim().replace(/^(?:s|r|reg|regulation|section|clause|cl)\.?\s+/i, '').replace(/\s+/g, ' ').toLowerCase();
}

// Whether one printed reference (one of a line's comma-separated references) covers the section.
function covers(reference, wanted) {
  const ref = sectionKey(reference);
  const want = sectionKey(wanted);
  if (!want) return false;
  if (ref === want || ref.startsWith(`${want}.`) || ref.startsWith(`${want}(`)) return true;
  const range = /^(\d+)[a-z]*(?:\([^)]*\))? to (?:s|r|reg|regulation|section|clause) (\d+)/.exec(ref);
  const number = /^(\d+)/.exec(want);
  return Boolean(range && number && Number(number[1]) >= Number(range[1]) && Number(number[1]) <= Number(range[2]));
}

// The references a printed citation gives for a named law or code: the text after its name and any
// bracketed qualifiers, such as "(NSW)" or "(August 2019)", split at the commas.
function referencesFor(citation, law) {
  const out = [];
  const name = String(law || '').trim().toLowerCase();
  for (const part of String(citation || '').split('; ')) {
    const at = part.toLowerCase().indexOf(name);
    if (!name || at < 0) continue;
    const rest = part.slice(at + name.length);
    const start = rest.search(/(?:^|\s)(?:s|r|appendix|schedule|table|part|section|clause)\s+[\dA-Z]/i);
    if (start >= 0) out.push(...rest.slice(start).trim().split(/,\s*/).filter(Boolean));
  }
  return out;
}

// Every library control line in a state citing the section, once each, with the jobs and steps it is in.
function linesCiting(stateId, law, section, activities = ACTIVITIES) {
  const found = new Map();
  for (const activity of activities) {
    for (const step of activity.steps) {
      for (const control of step.controls) {
        if (!control || typeof control === 'string' || !control.source) continue;
        const citation = localSource(control.source, stateId, control.text);
        if (!referencesFor(citation, law).some((reference) => covers(reference, section))) continue;
        const printed = localControl(control.text, control.source, stateId);
        if (printed == null) continue;
        const item = found.get(control.text) || { text: control.text, printed, citation, steps: [] };
        item.steps.push(`${activity.when}: ${step.step}`);
        found.set(control.text, item);
      }
    }
  }
  return [...found.values()];
}

// Lines in draft.js whose source names the section: the drafting code adds these itself, so each
// is listed by line number to check by hand. A state's own section is looked for as the
// Queensland section it maps to, as draft.js cites Queensland and maps it when printing.
// Words too common in law and code titles to tell one from another.
const COMMON = new Set(['safework', 'worksafe', 'model', 'managing', 'workplace', 'workplaces', 'health', 'safety', 'practice', 'regulation', 'regulations', 'risks', 'australia']);

function draftLinesCiting(stateId, section, law = '') {
  const want = sectionKey(section);
  // A regulation is cited in draft.js as CITE.WHS; a code by its title.
  const isRegulation = /\bregulations?\b/i.test(law) && !/code/i.test(law);
  const words = String(law).toLowerCase().split(/[^a-z]+/).filter((word) => word.length >= 5 && !COMMON.has(word));
  const named = (line) => (isRegulation ? /CITE\.WHS|Regulation/.test(line) : !words.length || words.some((word) => line.toLowerCase().includes(word)));
  const numbers = new Set([want]);
  if (stateId !== 'qld' && stateId !== 'all') {
    const state = require('../scenarios/state-citations.json')[stateId];
    for (const [qld, own] of Object.entries((state && state.sections) || {})) if (String(own).toLowerCase() === want) numbers.add(qld.toLowerCase());
  }
  const lines = fs.readFileSync(path.join(__dirname, '..', 'draft.js'), 'utf8').split('\n');
  const out = [];
  lines.forEach((line, index) => {
    if (!/\bsource\s*:|CITE\.\w+\(/.test(line) || !named(line)) return;
    const refs = [...line.matchAll(/\b(?:s|r) (\d+[A-Z]*(?:\.\d+)*(?:\([^)]*\))?)/g)].map((match) => match[1]);
    if (refs.some((ref) => [...numbers].some((number) => covers(ref, number)))) out.push({ line: index + 1, text: line.trim().slice(0, 200) });
  });
  return out;
}

function main(argv) {
  const json = argv.includes('--json');
  const [stateArg, law, section] = argv.filter((arg) => arg !== '--json');
  if (!stateArg || !law || !section) {
    console.error('Usage: node scripts/lines-citing.js <state|all> "<law or code>" <section> [--json]');
    process.exit(2);
  }
  const states = stateArg === 'all' ? citedStates() : [stateArg.toLowerCase()];
  const result = states.map((stateId) => ({ state: stateId, lines: linesCiting(stateId, law, section) }));
  const draftLines = draftLinesCiting(stateArg.toLowerCase(), section, law);
  if (json) {
    console.log(JSON.stringify({ law, section, states: result, draftLines }, null, 2));
    return;
  }
  for (const { state, lines } of result) {
    console.log(`\n${state.toUpperCase()}: ${lines.length} control line${lines.length === 1 ? '' : 's'} citing ${law} ${section}`);
    lines.forEach((item, index) => {
      console.log(`\n${index + 1}. ${item.printed}`);
      console.log(`   In: ${item.steps.slice(0, 6).join(' | ')}${item.steps.length > 6 ? ` and ${item.steps.length - 6} more` : ''}`);
    });
  }
  console.log(`\nLines the drafting code adds (draft.js) naming section ${sectionKey(section)}, to check by hand: ${draftLines.length}`);
  for (const item of draftLines) console.log(`   draft.js:${item.line}  ${item.text}`);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { sectionKey, covers, referencesFor, linesCiting, draftLinesCiting };
