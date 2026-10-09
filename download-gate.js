// The download gate (goal 2, owner, 7 October 2026): "SiteReady will not produce a download until
// the site questions are answered", and every SWMS names the site, the principal contractor and the
// person responsible for monitoring controls. Word, PDF, the project zip and saving all ask this
// module what a SWMS still needs; the preview stays open without it (D186).
//
// The other check before download (D184, the tick for work SiteReady has no job steps for) is
// listed here too, so the page and the server name every outstanding item in one place.
//
// What is asked, and why:
// - The job address, the principal contractor and the person who makes sure the SWMS is followed:
//   the goal names them. "Not applicable" is accepted for the principal contractor only, as a job
//   with no principal contractor appointed (under the WHS Regulations' $250,000 threshold) truly
//   has none.
// - The person who reviews the controls: with the person above, who monitors the controls (WHS
//   Regulations s 299(1)(c): how the controls are implemented, monitored and reviewed). Both print
//   as boxes on every SWMS.
// - The first aider and the muster point: the emergency arrangements the goal asks for; unanswered,
//   they print as "First aider: ____" and "To be completed".
// - The scaffold supervisor, only where the SWMS involves a scaffold. "Not applicable" is accepted,
//   so a scaffold named only in passing never forces a false answer.
// - The five site questions (live services, public interface, other trades, ground, access).
//   "None" is accepted for all but access: there is always a way to the work.
// - Any blank (____) or "To be completed" left in what prints: in the user's own answers, which are
//   filled in their boxes, and in SiteReady's control lines, which are filled where they show.
const { SITE_FIELDS } = require('./legislation');
const { questionsFor, involvesScaffold, notCoveredRefusal } = require('./draft');
const { hasBlank, isPlaceholder, leftOpen, blankKey, blankParts } = require('./blanks');

// Each field: the input key, the page box it is answered in, its label and what is needed.
const FIELDS = [
  { id: 'workplace', field: 'workplace', label: 'Job address', need: 'Give the address where the work is done.' },
  { id: 'principalContractor', field: 'principal', label: 'Principal contractor', none: true, need: 'Name the principal contractor running the site. If no principal contractor is appointed for this work, write Not applicable.' },
  { id: 'complianceResponsible', field: 'compliance-responsible', label: 'Person who makes sure the SWMS is followed', need: 'Name the person who checks the controls are in place on site, usually your supervisor or leading hand.' },
  { id: 'reviewer', field: 'reviewer', label: 'Person who reviews the controls', need: 'Name the person who checks the controls are working and updates this SWMS if the job changes.' },
  { id: 'scaffoldSupervisor', field: 'scaffold-supervisor', label: 'Scaffold supervisor', none: true, when: (draft) => involvesScaffold(draft), need: 'This SWMS involves a scaffold. Name the scaffolding company\'s supervisor who hands it over and tags it, or write Not applicable if no scaffold is used for this work.' },
  { id: 'firstAider', field: 'first-aider', label: 'First aider', need: 'Name a trained first aider on site, yours or the main contractor\'s.' },
  { id: 'musterPoint', field: 'muster-point', label: 'Muster point', need: 'Say where everyone meets in an emergency. Ask the main contractor.' },
];

// Boxes that may be left empty, but not with a placeholder in them: it would print.
const OPTIONAL = [
  { id: 'siteManager', field: 'site-manager', label: 'Site manager' },
  { id: 'worksManager', field: 'works-manager', label: 'Works manager' },
  { id: 'worksManagerPhone', field: 'works-manager-phone', label: 'Works manager phone' },
  { id: 'hospital', field: 'hospital', label: 'Hospital' },
  { id: 'reviewDate', field: 'review-date', label: 'Review date' },
  { id: 'preparedBy', field: 'prepared-by', label: 'Prepared by' },
  { id: 'swmsRef', field: 'swms-ref', label: 'SWMS reference number' },
];

const SITE_NEED = {
  liveServices: 'Say what power, gas, water, data or other live services are in or near the work, or write None.',
  publicInterface: 'Say where the public, traffic or neighbours are close to the work, or write None.',
  otherTrades: 'Say which other trades work nearby, or above or below you, or write None.',
  ground: 'Say what the ground or deck is like where you work (soft or sloping ground, excavations, slab or deck loads), or write None.',
  access: 'Say how the crew gets to the work area, and how plant and materials get there.',
};
const SITE_NONE = new Set(['liveServices', 'publicInterface', 'otherTrades', 'ground']);

const clean = (value) => String(typeof value === 'string' ? value : '').replace(/\s+/g, ' ').trim();
// "None", "Nil", "No", "N/A" or "Not applicable", and "No first aider" and the like.
const NONE = /^(?:none|nil|nobody|no ?one|n\/a|not applicable|not required|not needed)\b|^(?:na|no)\.?$|^no (?:first aiders?|muster points?|principal contractors?|scaffold\w*|reviewers?|supervisors?)\b/i;
// Not an answer yet: unknown, a question mark, a dash, or a placeholder.
const NOT_YET = /^(?:unknown|not (?:yet )?known|not provided|to be advised|if not known yet\b.*|\?+|-+|\.+|x+)$/i;

// Why a field's answer is not enough, or '' when it is answered.
function fieldNeed(item, value) {
  const text = clean(value);
  if (!text) return item.need;
  if (leftOpen(text) || NOT_YET.test(text)) return `"${text.slice(0, 60)}" is not an answer yet. ${item.need}`;
  if (NONE.test(text) && !item.none) return `${item.label} cannot be "${text.slice(0, 60)}": every SWMS names it. ${item.need}`;
  return '';
}

// The question each answer belongs to, for its label.
function factLabels(input) {
  try {
    const asked = questionsFor(input);
    return new Map((asked.required || []).map((item) => [item.id, item.label]));
  } catch (error) {
    return new Map();
  }
}

// A printed line that came from one of the user's answers with a blank in it: the words beside one
// of the answer's blanks are in the line. An answer is split into lines by its sentences.
function fromAnswer(text, answers) {
  const line = clean(text).toLowerCase();
  if (!hasBlank(line)) return false;
  return answers.some((answer) => clean(answer).toLowerCase().split(/_{3,}/).map((part) => part.trim()).filter((part) => part.length >= 12)
    .some((part) => line.includes(part.slice(-30)) || line.includes(part.slice(0, 30))));
}

// Every text the SWMS prints from its steps, controls and registers.
function printedTexts(draft) {
  return [
    ...(draft.jobSteps || []).flatMap((step) => [...(step.hazards || []), ...(step.controls || [])]),
    ...(draft.controls || []).map((item) => item && item.text),
    ...(draft.references || []).map((item) => item && item.text),
    ...(draft.emergency || []).map((row) => [row.equipment, row.detail].filter(Boolean).join('. ')),
    ...(draft.plant || []).flatMap((row) => [row.item, row.inspection, row.licence]),
    ...(draft.qualifications || []),
  ].filter((text) => typeof text === 'string' && text);
}

// What this SWMS still needs before it is downloaded or saved: a list of
// { id, kind: 'field' | 'site' | 'fact' | 'line' | 'other', field, label, need, key?, parts?, step? }.
// Empty when it can be downloaded. A stood-down SWMS has its own list of what is missing.
// options.cover false leaves out the D184 tick, for a SWMS already saved (it was ticked when saved,
// or saved before the tick existed).
function downloadGaps(input = {}, draft = {}, options = {}) {
  if (!draft || draft.kind !== 'draft') return [];
  const gaps = [];
  // Parts of the task with no job steps, not ticked as dealt with above the draft (D184).
  const uncovered = options.cover === false ? '' : notCoveredRefusal(draft, input);
  if (uncovered) gaps.push({ id: 'notCovered', kind: 'cover', field: 'not-covered-confirm', label: 'Tick for work SiteReady has no job steps for', need: `SiteReady has no job steps for: ${draft.notCovered.join('; ')}. Add your own steps and controls, or cover it in a separate SWMS, then tick the box above the draft.`, message: uncovered });
  for (const item of FIELDS) {
    if (item.when && !item.when(draft)) continue;
    const need = fieldNeed(item, input[item.id] || (item.id === 'workplace' ? input.siteAddress : ''));
    if (need) gaps.push({ id: item.id, kind: 'field', field: item.field, label: item.label, need });
  }
  for (const item of OPTIONAL) {
    const text = clean(input[item.id]);
    if (text && leftOpen(text)) gaps.push({ id: item.id, kind: 'field', field: item.field, label: item.label, need: `"${text.slice(0, 60)}" is not an answer. Fill it in, or leave the box empty.` });
  }
  // The user's own answers with a blank still in them where the SWMS prints them, filled in their own
  // boxes. An answer the SWMS does not print leaves no blank in it.
  const facts = input.facts && typeof input.facts === 'object' ? input.facts : {};
  const printed = printedTexts(draft);
  const blankFacts = Object.entries(facts).filter(([, value]) => typeof value === 'string' && hasBlank(value) && printed.some((text) => fromAnswer(text, [value])));
  const labels = blankFacts.length ? factLabels(input) : new Map();
  for (const [id] of blankFacts) {
    gaps.push({ id: `fact.${id}`, kind: 'fact', field: `fact-${id}`, label: labels.get(id) || 'Your answer to a question', need: 'Your answer still has a blank (____). Fill it in, or take out the part that does not apply.' });
  }
  const site = input.site && typeof input.site === 'object' ? input.site : {};
  for (const field of SITE_FIELDS) {
    const item = { label: field.label, need: SITE_NEED[field.id] || `Answer ${field.label}.`, none: SITE_NONE.has(field.id) };
    const need = fieldNeed(item, site[field.id]);
    if (need) gaps.push({ id: `site.${field.id}`, kind: 'site', field: `site-${field.id}`, label: `Site: ${field.label}`, need });
  }
  // SiteReady's own control lines with a blank, each filled in where it shows on the draft.
  const answers = blankFacts.map(([, value]) => String(value));
  const seen = new Set();
  const line = (text, step) => {
    if (typeof text !== 'string' || !hasBlank(text) || fromAnswer(text, answers)) return;
    const key = blankKey(text);
    if (seen.has(key)) return;
    seen.add(key);
    gaps.push({ id: `line.${seen.size}`, kind: 'line', key, parts: blankParts(text), step: step || '', label: step ? `Job step: ${step}` : 'Controls', need: 'This control has a blank (____). Fill it in with what applies on this job.' });
  };
  for (const step of draft.jobSteps || []) for (const text of [...(step.hazards || []), ...(step.controls || [])]) line(text, step.step);
  for (const item of draft.controls || []) line(item && item.text);
  // Anything else left open in what prints, not already asked for above: the emergency rows print
  // the first aider, muster point and hospital as answered.
  const asked = new Set(gaps.map((gap) => gap.id));
  const given = FIELDS.concat(OPTIONAL).filter((item) => asked.has(item.id)).map((item) => clean(input[item.id])).filter(Boolean);
  const other = [];
  for (const row of draft.emergency || []) {
    const text = [row.equipment, row.detail].filter(Boolean).join('. ');
    if (!leftOpen(text) || (/First aider: _{3,}/.test(text) && asked.has('firstAider')) || given.some((value) => text.includes(value))) continue;
    if (!fromAnswer(text, answers)) other.push(['Emergency arrangements', text]);
  }
  for (const row of draft.plant || []) for (const text of [row.item, row.inspection, row.licence]) if (leftOpen(text) && !fromAnswer(text, answers)) other.push(['Plant and equipment', text]);
  for (const text of draft.qualifications || []) if (leftOpen(text) && !fromAnswer(text, answers)) other.push(['Licences, tickets and training', text]);
  for (const row of draft.references || []) if (leftOpen(row.text) && !fromAnswer(row.text, answers)) other.push([row.label || 'Documents', row.text]);
  for (const key of ['date', 'subcontractor']) if (leftOpen(draft[key])) other.push([key === 'date' ? 'Date of the draft' : 'Subcontractor', draft[key]]);
  for (const [label, text] of other) {
    gaps.push({ id: `other.${gaps.length}`, kind: 'other', field: '', label, need: `A blank or "To be completed" is left in: "${clean(text).slice(0, 160)}". Answer the question it comes from, or change the line.` });
  }
  return gaps;
}

// The refusal for the download routes, naming every item still outstanding: the site questions and
// blanks, then the D184 tick in its own words.
function gateMessage(gaps) {
  const names = [...new Set(gaps.filter((gap) => gap.kind !== 'cover').map((gap) => gap.label))];
  const cover = gaps.find((gap) => gap.kind === 'cover');
  return [
    names.length ? `SiteReady does not produce a SWMS until the site questions are answered and no blank is left in it. Still to answer: ${names.join('; ')}.` : '',
    cover ? cover.message : '',
  ].filter(Boolean).join(' ');
}

module.exports = { downloadGaps, gateMessage, FIELDS, isPlaceholder };
