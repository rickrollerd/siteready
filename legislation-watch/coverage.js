// Goal 10: every law and code of practice SiteWrite can print, in each state, and how the daily
// watch covers it. The list is taken from the code, not kept by hand:
//   the library's control lines as each state prints them (citations.js), read the way the SWMS
//   lists its legislation and codes (register.js legislationFor);
//   the laws and codes named in activities.js, draft.js, register.js, legislation.js and
//   citations.js with their state, and each state's own codes and laws in
//   scenarios/state-codes.json, vic-lines.json and state-lines.json;
//   the laws legislation.js names in a state's own wording (such as the overhead line rule).
// Each source in sources.json and codes.json says what SiteWrite cites it as ("cites"), so a change
// it finds maps to the lines citing it (scripts/lines-citing.js).
//
//   node legislation-watch/coverage.js          list each state's laws and codes and how each is watched
//   node legislation-watch/coverage.js --gaps   list only those not watched, and fail if there are any
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STATES = ['qld', 'nsw', 'vic', 'sa', 'wa', 'tas', 'act', 'nt'];
const TAG = { Qld: 'qld', NSW: 'nsw', Vic: 'vic', SA: 'sa', WA: 'wa', Tas: 'tas', ACT: 'act', NT: 'nt', Cth: 'all' };
const WORD = String.raw`(?:[A-Z][A-Za-z'&-]*|and|of|for|the|in|on|\((?:[A-Z][^()]*)\))`;
const LAW = String.raw`${WORD}(?:,? +${WORD})* +(?:Act|Regulations?|Rules|Notice) +\d{4}`;
// A law named with its state, such as "Plumbing and Drainage Act 2018 (Qld)".
const TAGGED = new RegExp(String.raw`(${LAW})\s+\((Qld|NSW|Vic|SA|WA|Tas|ACT|NT|Cth)\)`, 'g');
// A law named in a state's own wording, with or without its state.
const NAMED = new RegExp(String.raw`(${LAW})(?:\s+\((?:Qld|NSW|Vic|SA|WA|Tas|ACT|NT|Cth)\))?`, 'g');
// Reports and guidance that are cited but are neither a law nor a code of practice.
const NOT_LAW = /^NSW Resources Regulator, investigation report |industry standard|a handbook/i;

const withoutLeadingWords = (name) => name.replace(/^(?:(?:The|the|and|of|in|on|for|under|Under)\s+)+/, '');
// The key two names of one law share: its name without the state, in lower case.
const key = (name) => withoutLeadingWords(String(name)).replace(/\s+\((?:Qld|NSW|Vic|SA|WA|Tas|ACT|NT|Cth)\)$/, '').toLowerCase();

function add(out, stateId, name, kind, from) {
  for (const id of stateId === 'all' ? STATES : [stateId]) {
    const list = out[id];
    if (!list.some((item) => key(item.name) === key(name))) list.push({ name, kind, from });
  }
}

const kindOf = (name) => (/\b(?:Act|Regulations?|Rules|Notice)\s+\d{4}\b/.test(name) && !/\bCode\b/i.test(name) ? 'law' : 'code');

// Every law and code each state's SWMS can print: { qld: [{ name, kind, from }], ... }.
function printedSources() {
  const { ACTIVITIES } = require('../activities');
  const { localControl } = require('../citations');
  const { legislationFor } = require('../register');
  const { STATES: LAWS } = require('../legislation');
  const out = Object.fromEntries(STATES.map((id) => [id, []]));

  // The library's lines as each state prints them, listed the way the SWMS lists its sources.
  for (const stateId of STATES) {
    const lines = [];
    for (const activity of ACTIVITIES) {
      for (const step of activity.steps) {
        for (const control of step.controls) {
          if (!control) continue;
          const printed = typeof control === 'string' ? localControl(control, '', stateId) : localControl(control.text, control.source, stateId);
          if (printed) lines.push(printed);
        }
      }
    }
    const { legislation, codes } = legislationFor(lines);
    for (const name of legislation) add(out, stateId, name, 'law', 'library');
    for (const name of codes) if (!NOT_LAW.test(name)) add(out, stateId, name, 'code', 'library');
  }

  // Laws named with their state anywhere in the drafting code (the state's Act on every SWMS, the
  // laws behind licences, national laws). Comment lines are left out.
  for (const file of ['activities.js', 'draft.js', 'register.js', 'legislation.js', 'citations.js']) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n').filter((line) => !/^\s*\/\//.test(line)).join('\n');
    for (const match of text.matchAll(TAGGED)) add(out, TAG[match[2]], `${withoutLeadingWords(match[1])} (${match[2]})`, 'law', file);
  }

  // Each state's own codes and laws from the line tables.
  const stateCodes = require('../scenarios/state-codes.json');
  for (const stateId of STATES) {
    for (const name of Object.values((stateCodes[stateId] || {}).codes || {})) add(out, stateId, name, 'code', 'scenarios/state-codes.json');
  }
  const vic = require('../scenarios/vic-lines.json');
  add(out, 'vic', vic.act, 'law', 'scenarios/vic-lines.json');
  for (const name of Object.values(vic.codes)) add(out, 'vic', name, 'code', 'scenarios/vic-lines.json');
  const lines = require('../scenarios/state-lines.json');
  for (const [stateId, docs] of Object.entries(lines.docs)) for (const name of Object.values(docs)) add(out, stateId, name, kindOf(name), 'scenarios/state-lines.json');

  // Each state's regulation, and the laws its own wording names (such as the overhead line rule).
  for (const state of LAWS) {
    if (!out[state.id]) continue;
    if (state.instrument) add(out, state.id, state.instrument, 'law', 'legislation.js');
    const wording = Object.entries(state).filter(([field]) => !['highRisk', 'highRiskLabels', 'contents'].includes(field)).map(([, value]) => (typeof value === 'string' ? value : '')).join('\n');
    for (const match of wording.matchAll(NAMED)) add(out, state.id, withoutLeadingWords(match[0]), 'law', 'legislation.js');
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  return out;
}

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));

// What the watch says it cites: { state: [{ name, key, how, url }] }, from each source's "cites".
function watched() {
  const out = Object.fromEntries(STATES.map((id) => [id, []]));
  const how = (source, kind) => {
    if (source.handCheck) return 'hand check monthly';
    if (source.feed) return 'feed daily, version by hand monthly';
    if (source.read === 'browser') return 'read in a browser daily, hand check when not read for a week';
    if (source.read === 'sitemap') return 'sitemap daily';
    return kind === 'law' ? 'version daily' : 'list daily';
  };
  for (const [file, kind, prefix] of [['sources.json', 'law', ''], ['codes.json', 'code', 'code:']]) {
    for (const source of readJson(file)) {
      for (const cite of source.cites || []) {
        for (const id of cite.state === 'all' ? STATES : [cite.state]) {
          out[id].push({ name: cite.name, key: `${prefix}${source.id}`, how: how(source, kind), url: source.url });
        }
      }
    }
  }
  return out;
}

// Each printed law and code with the watch entries that cover it, and the ones none covers.
function coverage(printed = printedSources(), watching = watched()) {
  const rows = [];
  for (const stateId of STATES) {
    for (const item of printed[stateId]) {
      const by = watching[stateId].filter((entry) => key(entry.name) === key(item.name));
      rows.push({ state: stateId, ...item, watchedBy: by });
    }
  }
  return { rows, gaps: rows.filter((row) => !row.watchedBy.length) };
}

function main(argv) {
  const { rows, gaps } = coverage();
  const shown = argv.includes('--gaps') ? gaps : rows;
  for (const row of shown) {
    const by = row.watchedBy.map((entry) => `${entry.key} (${entry.how})`).join('; ') || 'NOT WATCHED';
    console.log(`${row.state.toUpperCase()}\t${row.kind}\t${row.name}\t${by}`);
  }
  console.log(`\n${rows.length} laws and codes across the states, ${gaps.length} not watched.`);
  if (gaps.length) process.exitCode = 1;
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { printedSources, watched, coverage, key, STATES };
