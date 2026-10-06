// What users change in their SWMS (task #102, owner decisions of 6 October 2026), kept to improve
// the step library. Off unless CONTROL_LEARNING=on, until the privacy policy covers it.
//
// Each change is recorded once for each saved revision of a SWMS, never again for a download or a
// second save of the same revision. A row holds the job step, the kind of change, the line as
// SiteReady wrote it, the user's own words (with names, phone numbers, email addresses, ABNs and
// street addresses taken out), any warning given, the user's reason, the state, trade, kinds of
// work and high risk work, and the month. Changes that were warned about, refused, or no longer
// matched a line are recorded too. When the next revision is saved, each change of the revision
// before is marked kept or not. The saved SWMS is known only by a keyed fingerprint: no business,
// account, site, task wording or SWMS id is kept. A business that opted out of industry data is
// left out. Rows are deleted after 3 years.
const crypto = require('crypto');
const db = require('./db');
const { findState } = require('./legislation');

const enabled = () => String(process.env.CONTROL_LEARNING || '').trim().toLowerCase() === 'on';
// Months are counted in Queensland time, which has no daylight saving.
const monthOf = (date) => new Date(date.getTime() + 10 * 3600000).toISOString().slice(0, 7);
const RETENTION_YEARS = 3;
const hash = (text) => crypto.createHash('sha256').update(String(text)).digest('hex');
// The saved SWMS by a keyed fingerprint, so a row cannot be traced back to it without the key.
const swmsKey = (id) => crypto.createHmac('sha256', process.env.CONTROL_LEARNING_KEY || 'siteready-control-learning').update(String(id)).digest('hex');

// ---- Taking personal details out of what the user typed ----

const EMAIL = /[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi;
// Australian phone numbers: mobiles, landlines with or without the area code or +61, and 13, 1300 and 1800 numbers.
const PHONE = /(?:\+?61[\s-]?\(?0?[2-478]\)?|\(?0[2-478]\)?)(?:[\s-]?\d){8}\b|\b(?:1[38]00(?:[\s-]?\d){6}|13(?:[\s-]?\d){4})\b|\b\d{4}[\s-]\d{4}\b/g;
const ABN = /\b\d{2}\s?\d{3}\s?\d{3}\s?\d{3}\b/g;
const STREET = /\b\d+[A-Za-z]?(?:[/-]\d+[A-Za-z]?)?\s+(?:[A-Z][\w'-]*\s+){1,3}(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Place|Pl|Lane|Ln|Parade|Pde|Highway|Hwy|Crescent|Cres|Boulevard|Bvd|Terrace|Tce|Way|Close|Cl)\b/g;
const TITLED = /\b(?:Mr|Mrs|Ms|Miss|Dr)\.?\s+[A-Z][\w'-]*/g;

// Everyday words a site note starts with that the library does not use.
const EVERYDAY = 'monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december '
  + 'toolbox prestart pre-start ring call phone email text ask tell notify contact check confirm see refer daily weekly morning afternoon night am pm '
  + 'boss foreman leading hand crew site office gate smoko lunch break yes no ok okay please note';

// Public bodies, places and product or plant brands a site note names that identify no person or
// business on the job, so they are kept. Brands that are also common surnames (Coates, Weber,
// Hardie, Hanson) are left out of this list and are taken out.
const PUBLIC_NAMES = 'telstra optus vodafone ausgrid endeavour energex ergon powerlink jemena ausnet citipower powercor transgrid electranet '
  + 'tasnetworks evoenergy agl atco sydney melbourne brisbane perth adelaide hobart darwin canberra queensland victoria tasmania '
  + 'safework worksafe comcare hilti makita milwaukee dewalt festool ramset paslode kango stihl husqvarna genie haulotte skyjack '
  + 'manitou merlo franna hiab bobcat kubota komatsu caterpillar dulux sika ardex gyprock rondo boral holcim lysaght colorbond '
  + 'kingspan bondor hebel promat tremco fosroc mapei davco bostik kwikstage layher cuplok ringlock acrow peri doka bunnings always dial';

// Words SiteReady's own library uses, so a capitalised word that is not one of them (such as a
// person's or a business's name) can be taken out.
let vocabulary = null;
function libraryWords() {
  if (vocabulary) return vocabulary;
  vocabulary = new Set([...EVERYDAY.split(' '), ...PUBLIC_NAMES.split(' ')]);
  const add = (text) => { for (const word of String(text).toLowerCase().match(/[a-z][a-z'-]*/g) || []) vocabulary.add(word); };
  const walk = (value, depth = 0) => {
    if (depth > 8 || value === null || value === undefined) return;
    if (typeof value === 'string') add(value);
    else if (Array.isArray(value)) value.forEach((item) => walk(item, depth + 1));
    else if (typeof value === 'object') Object.values(value).forEach((item) => walk(item, depth + 1));
  };
  try { walk(require('./activities')); } catch { /* the patterns below still apply */ }
  return vocabulary;
}

// The user's words with personal details taken out. Words in the line SiteReady wrote stay.
function scrub(text, original = '') {
  if (!text) return '';
  const known = new Set(String(original).toLowerCase().match(/[a-z][a-z'-]*/g) || []);
  const words = libraryWords();
  return String(text)
    .replace(EMAIL, '[email]')
    .replace(STREET, '[address]')
    .replace(PHONE, '[phone]')
    .replace(ABN, '[number]')
    .replace(TITLED, '[name]')
    .replace(/\b[A-Z][a-z][\w'-]*\b/g, (word) => (known.has(word.toLowerCase()) || words.has(word.toLowerCase()) ? word : '[name]'))
    .replace(/\[name\](?:\s+\[name\])+/g, '[name]')
    .slice(0, 600);
}

// ---- Recording ----

// The changes in a saved revision's draft, each with how it came out: applied, warned, refused or
// unmatched.
function changesOf(report) {
  const out = [];
  const warned = report.warned || [];
  for (const item of report.applied || []) {
    const warning = warned.find((other) => other.step === item.step && other.kind === item.kind && (other.text || '') === (item.from || '') && (other.to || '') === (item.to || ''));
    out.push({ step: item.step, kind: item.kind, outcome: warning ? 'warned' : 'applied', original: item.from || '', newLine: item.to || '', warning: warning ? warning.warnings.join(' ') : '', legal: warning ? warning.legal || '' : '', reason: item.reason || '', note: item.note || '' });
  }
  for (const item of report.refused || []) out.push({ step: item.step, kind: 'removed', outcome: 'refused', original: item.text || '', newLine: '', warning: item.reason || '', legal: '', reason: '', note: '' });
  for (const item of report.unmatched || []) out.push({ step: item.step, kind: item.kind, outcome: 'unmatched', original: item.text || '', newLine: item.to || '', warning: '', legal: '', reason: '', note: '' });
  return out;
}

// Records the changes in a saved revision, once. options: the company (its industry data choice
// applies), the saved SWMS's id and the revision. Returns how many were recorded.
async function recordControlEdits(draft, input, { company, swmsId, revision = 1, now = new Date() } = {}) {
  if (!enabled() || !db.enabled() || !draft || !draft.controlEdits || !swmsId) return 0;
  if (!company || company.industry_opt_out) return 0;
  const state = findState(input && input.state);
  const key = swmsKey(swmsId);
  const fields = {
    month: monthOf(now),
    state: state ? state.id : '',
    trade: String((input && input.trade) || '').slice(0, 100),
    kinds: JSON.stringify(Array.isArray(input && input.kinds) ? input.kinds.slice(0, 80) : []),
    highRisk: JSON.stringify((draft.highRisk || []).slice(0, 40)),
  };
  const changes = changesOf(draft.controlEdits);
  const keys = new Set();
  let count = 0;
  for (const change of changes) {
    const newLine = scrub(change.newLine, change.original);
    const editKey = hash(JSON.stringify([change.step, change.kind, change.original, newLine]));
    keys.add(editKey);
    const id = hash(`${key}:${revision}:${editKey}:${change.outcome}`);
    const inserted = await db.query(
      `INSERT INTO control_edit_events (id, swms_key, revision, month, state, trade, kinds, high_risk, step, kind, outcome, original, new_line, warning, legal, reason, note, edit_key, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [id, key, Number(revision), fields.month, fields.state, fields.trade, fields.kinds, fields.highRisk, String(change.step).slice(0, 300), change.kind, change.outcome,
        String(change.original).slice(0, 1500), newLine, String(change.warning).slice(0, 2000), String(change.legal).slice(0, 500), change.reason, scrub(change.note).slice(0, 300), editKey, now],
    );
    count += inserted.length;
  }
  // Whether each change of the revision before was kept in this one.
  if (Number(revision) > 1) {
    const earlier = await db.query('SELECT id, edit_key FROM control_edit_events WHERE swms_key = $1 AND revision = $2', [key, Number(revision) - 1]);
    for (const row of earlier) await db.query('UPDATE control_edit_events SET kept = $1 WHERE id = $2', [keys.has(row.edit_key), row.id]);
  }
  return count;
}

// Rows older than 3 years are deleted, as are rows of the first, counted store.
async function removeOld(now = new Date()) {
  if (!db.enabled()) return;
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - RETENTION_YEARS);
  await db.query('DELETE FROM control_edit_events WHERE created_at < $1', [cutoff]);
  await db.query('DELETE FROM control_edits WHERE month < $1', [monthOf(cutoff)]);
}

// Counts for the owner: changes by kind and outcome, the steps changed most, and how many changes
// were kept in the next revision.
async function summary() {
  const rows = await db.query('SELECT kind, outcome, kept, step FROM control_edit_events');
  const byKind = { removed: 0, changed: 0, added: 0, hazardChanged: 0, hazardAdded: 0, hazardNotApplicable: 0, whoChanged: 0 };
  const byOutcome = { applied: 0, warned: 0, refused: 0, unmatched: 0 };
  const steps = new Map();
  const kept = { kept: 0, notKept: 0 };
  for (const row of rows) {
    byKind[row.kind] = (byKind[row.kind] || 0) + 1;
    byOutcome[row.outcome] = (byOutcome[row.outcome] || 0) + 1;
    steps.set(row.step, (steps.get(row.step) || 0) + 1);
    if (row.kept === true) kept.kept += 1;
    if (row.kept === false) kept.notKept += 1;
  }
  return {
    enabled: enabled(),
    total: rows.length,
    byKind,
    byOutcome,
    kept,
    steps: [...steps.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 20).map(([step, changes]) => ({ step, changes })),
  };
}

module.exports = { enabled, recordControlEdits, summary, removeOld, scrub, RETENTION_YEARS };
