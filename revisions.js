// Each saved revision of a SWMS is kept as it was printed (owner decision, 6 October 2026):
// its input, the finished draft the Word file, PDF and sign-on page are made from, a
// fingerprint of its content, the library version it was drafted with, its SiteReady
// reference, who saved it and why. Downloads and sign-on read the kept draft, so an old
// revision prints the same on any day, whatever has changed in the library or the law since.
// Where today's library words it differently, the saved SWMS says "Updated wording is
// available", and a new revision takes the new wording.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { prepareDraft } = require('./draft');
const { issueRef, placeOf } = require('./refs');

const hash = (text) => crypto.createHash('sha256').update(String(text)).digest('hex');

// The library's version: a fingerprint of the files the SWMS wording comes from.
const LIBRARY_FILES = ['activities.js', 'draft.js', 'citations.js', 'legislation.js', 'steps.js', 'control-level.js', 'presets.js', 'spelling.js', 'slang.js'];
const LIBRARY_VERSION = hash(LIBRARY_FILES.map((name) => {
  try { return fs.readFileSync(path.join(__dirname, name), 'utf8'); } catch { return ''; }
}).join('\n')).slice(0, 12);

// JSON with its keys in order, so the same value always reads the same (Postgres reorders
// the keys of a stored JSON object).
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value === undefined ? null : value);
}

const tickedPpe = (draft) => (draft.ppe || []).flatMap((group) => group.items.filter((item) => item.ticked).map((item) => item.label));

// What the SWMS says, for comparing two prints. The header (dates, revision, company details)
// is left out: it is not library wording.
function printedContent(draft) {
  return {
    highRisk: draft.highRisk || [],
    jobSteps: (draft.jobSteps || []).map((step) => ({ step: step.step, hazards: step.hazards || [], controls: step.controls || [], responsible: step.responsible || '' })),
    ppe: tickedPpe(draft),
    controls: draft.controls || [],
    plant: draft.plant || [],
    substances: draft.substances || null,
    qualifications: draft.qualifications || [],
    emergency: draft.emergency || [],
    sources: draft.sources || null,
    references: draft.references || [],
    review: draft.review || '',
  };
}

const contentHash = (draft) => hash(stable(printedContent(draft)));

// What changed between two prints, step by step, in words a user can check.
function changesBetween(before, after) {
  const out = [];
  const lines = (list) => new Set(list || []);
  const diff = (from, to, kind, step) => {
    const a = lines(from);
    const b = lines(to);
    for (const text of a) if (!b.has(text)) out.push({ kind, change: 'removed', step, text });
    for (const text of b) if (!a.has(text)) out.push({ kind, change: 'added', step, text });
  };
  const oldSteps = new Map((before.jobSteps || []).map((step) => [step.step, step]));
  const newSteps = new Map((after.jobSteps || []).map((step) => [step.step, step]));
  for (const [name] of oldSteps) if (!newSteps.has(name)) out.push({ kind: 'step', change: 'removed', step: name, text: name });
  for (const [name, step] of newSteps) {
    const old = oldSteps.get(name);
    if (!old) { out.push({ kind: 'step', change: 'added', step: name, text: name }); continue; }
    diff(old.hazards, step.hazards, 'hazard', name);
    diff(old.controls, step.controls, 'control', name);
    if ((old.responsible || '') !== (step.responsible || '')) out.push({ kind: 'who', change: 'changed', step: name, text: step.responsible || '', from: old.responsible || '' });
  }
  diff(before.highRisk, after.highRisk, 'highRisk');
  diff(tickedPpe(before), tickedPpe(after), 'ppe');
  diff((before.qualifications || []), (after.qualifications || []), 'qualification');
  return out;
}

const KIND_WORDS = { step: 'Job step', hazard: 'Hazard', control: 'Control', who: 'Who', highRisk: 'High risk construction work', ppe: 'PPE', qualification: 'Licence or training' };
// One line for each change, for the page.
function changeText(item) {
  const where = item.step && item.kind !== 'step' ? `${item.step}: ` : '';
  if (item.change === 'changed') return `${where}${KIND_WORDS[item.kind]} changed from "${item.from}" to "${item.text}"`;
  return `${where}${KIND_WORDS[item.kind]} ${item.change}: ${item.text}`;
}

function longDate(date) {
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Brisbane' }).format(new Date(date));
}

const parse = (value) => (typeof value === 'string' ? JSON.parse(value) : value);

function view(record) {
  if (!record) return null;
  return {
    swmsId: record.swms_id,
    revision: Number(record.revision),
    title: record.title,
    input: parse(record.input),
    draft: parse(record.draft),
    contentHash: record.content_hash,
    libraryVersion: record.library_version,
    ref: record.ref,
    editedBy: record.edited_by,
    editedName: record.edited_name,
    reason: record.reason,
    confirmation: record.confirmation ? parse(record.confirmation) : null,
    createdAt: record.created_at,
  };
}

// Keeps a revision as it prints. row is the saved SWMS as it now stands; draft is the draft
// prepared from its input with the company's details. A reference is issued for the revision.
async function keepRevision({ row, company, input, draft, userId = '', name = '', reason = '', at = new Date() }) {
  const printed = { ...draft, revision: String(row.revision || 1), revisionDate: longDate(at) };
  const fingerprint = contentHash(printed);
  const ref = await issueRef(company, row.title, placeOf(input), { swmsId: row.id, revision: Number(row.revision || 1), contentHash: fingerprint });
  const confirmation = name ? { name, date: longDate(at) } : null;
  await db.query(
    `INSERT INTO swms_revisions (id, swms_id, revision, title, input, draft, content_hash, library_version, ref, edited_by, edited_name, reason, confirmation, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) ON CONFLICT (id) DO NOTHING`,
    [`${row.id}:${row.revision || 1}`, row.id, Number(row.revision || 1), row.title, JSON.stringify(input), JSON.stringify(printed), fingerprint, LIBRARY_VERSION, ref,
      String(userId || ''), String(name || '').slice(0, 120), String(reason || '').slice(0, 300), confirmation ? JSON.stringify(confirmation) : null, at],
  );
  return getRevision(row.id, row.revision || 1);
}

async function getRevision(swmsId, revision) {
  return view(await db.one('SELECT * FROM swms_revisions WHERE swms_id = $1 AND revision = $2', [String(swmsId), Number(revision)]));
}

// The revision of a saved SWMS, as printed. A SWMS saved before revisions were kept has its
// current revision kept now, from today's library, dated when it was last saved; from then on
// it prints the same.
async function revisionOf(row, company, revision = row.revision || 1, withCompany = (input) => input) {
  const kept = await getRevision(row.id, revision);
  if (kept || Number(revision) !== Number(row.revision || 1)) return kept;
  const input = parse(row.input);
  const draft = prepareDraft(withCompany(input, company));
  if (draft.kind !== 'draft') return null;
  return keepRevision({ row, company, input, draft, name: row.reviewed_by, reason: 'Kept as it printed when revisions were first recorded.', at: row.revised_at || row.created_at });
}

async function listRevisions(swmsId) {
  return (await db.query('SELECT * FROM swms_revisions WHERE swms_id = $1 ORDER BY revision', [String(swmsId)])).map(view);
}

module.exports = { LIBRARY_VERSION, stable, printedContent, contentHash, changesBetween, changeText, keepRevision, getRevision, revisionOf, listRevisions };
