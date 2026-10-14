// The check every SWMS gets before it is downloaded or saved (Goal 12, D286):
//   1. SiteReady's own check: the download gate (download-gate.js), then Builder check on the draft,
//      with no AI. Only must-fix items block; the score and the other findings show for the person
//      to judge.
//   2. A named person ticks each part as checked (public/check-parts.js), gives their name and role,
//      and ticks today's acknowledgement as the last line. The date is set here, by the server.
// The ticks carry each part's fingerprint as the person read it. A save whose fingerprints do not
// match the draft it prints is refused, so a tick cannot outlive a change to its part.
//
// Pages from before the check (a phone or the app holding an old copy) send { reviewConfirmed,
// reviewedBy }. That is accepted for a short changeover where it is safe (one SWMS, until
// OLD_CHECK_UNTIL); otherwise the page is asked to be refreshed.
const { checkSwms, fromDraft } = require('./builder-check');
const { textField } = require('./input');
const parts = require('./public/check-parts');

// The last day a page from before the check is accepted (owner to confirm, D286 follow-up).
const OLD_CHECK_UNTIL = '2026-10-28';
const REFRESH = 'SiteReady now asks you to tick each part of the SWMS as checked, with your name and role. Refresh the page to see it, then try again.';

const fail = (status, message, extra = {}) => Object.assign(new Error(message), { status, publicMessage: true, ...extra });

function longDate(date) {
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Brisbane' }).format(new Date(date));
}

const oneLine = (value, limit) => textField(value, limit).replace(/\s+/g, ' ').trim();

// Builder check on a SiteReady draft, as a builder reads the printed SWMS: no upload and no AI. The
// must-fix items (the hard fails) block; the others are for the person to judge.
function builderCheck(draft, state) {
  const result = checkSwms(fromDraft(draft, { state }), { state, stage: 'review' });
  const failed = result.findings.filter((item) => !item.pass);
  // Before sign-on, a SiteReady draft records consultation by naming who checks the controls, so H7
  // fails only with H6: one fix, said once.
  const hard = failed.filter((item) => item.hard && !(item.rule === 'H7' && failed.some((other) => other.rule === 'H6')));
  return {
    score: result.score,
    band: result.band,
    mustFix: hard.map((item) => ({ rule: item.rule, title: item.title, message: item.message })),
    findings: failed.filter((item) => !item.hard).map((item) => ({ rule: item.rule, title: item.title, message: item.message, points: item.points, max: item.max })),
  };
}

// What the page's check panel shows: SiteReady's check and each part's fingerprint.
function selfCheck(draft, state) {
  return { builder: builderCheck(draft, state), partHashes: parts.partHashes(draft) };
}

function mustFixMessage(builder, doing = 'downloading') {
  const items = builder.mustFix;
  return `SiteReady's check found ${items.length === 1 ? 'a must-fix item' : `${items.length} must-fix items`}. Fix ${items.length === 1 ? 'it' : 'them'} before ${doing}: ${items.map((item) => item.message.replace(/\.$/, '')).join('. ')}.`;
}

// Whether a page from before the check may still send its one tick: until OLD_CHECK_UNTIL (end of
// that day, Brisbane time). OLD_CHECK_UNTIL in the environment moves the date.
function oldShapeAllowed(now = new Date()) {
  const until = String(process.env.OLD_CHECK_UNTIL || OLD_CHECK_UNTIL);
  const end = new Date(`${until}T23:59:59+10:00`);
  return Number.isFinite(end.getTime()) && now <= end;
}

const isOldShape = (body) => Boolean(body) && !body.check && body.reviewConfirmed !== undefined;

// The confirmation kept with the revision and printed as "Checked by". body.check is
// { parts: { steps: true, ... }, partHashes: { steps: '...', ... }, name, role, ack: true }.
// draft is the draft as it prints (with the business's details). options.oldShape 'allow' accepts a
// page from before the check during the changeover; 'refuse' asks for a refresh.
// Throws a plain refusal with field (the box it is about) and stale (the parts to tick again).
function confirm(body, draft, { state, at = new Date(), doing = 'downloading', oldShape = 'allow' } = {}) {
  const given = body || {};
  if (isOldShape(given)) {
    if (oldShape !== 'allow' || !oldShapeAllowed(at)) throw fail(400, REFRESH, { field: 'refresh' });
    const name = oneLine(given.reviewedBy, 120);
    if (given.reviewConfirmed !== true || !name) throw fail(400, 'Confirm that your business will review and approve this SWMS, and enter your name.');
    // SiteReady's own check still applies to an old page.
    const builder = draft ? builderCheck(draft, state) : null;
    if (builder && builder.mustFix.length) throw fail(400, mustFixMessage(builder, doing), { field: 'mustFix' });
    return { name, date: longDate(at) };
  }
  const check = given.check && typeof given.check === 'object' ? given.check : null;
  if (!check) throw fail(400, `Tick each part as checked, and give your name and role, before ${doing}.`, { field: 'parts' });
  const builder = builderCheck(draft, state);
  if (builder.mustFix.length) throw fail(400, mustFixMessage(builder, doing), { field: 'mustFix' });
  const ticked = check.parts && typeof check.parts === 'object' ? check.parts : {};
  const missing = parts.IDS.filter((id) => ticked[id] !== true);
  if (missing.length) throw fail(400, `Tick each part as checked first: ${parts.labels(missing).join('; ')}.`, { field: 'parts' });
  const now = parts.partHashes(draft);
  const sent = check.partHashes && typeof check.partHashes === 'object' ? check.partHashes : {};
  const stale = parts.IDS.filter((id) => sent[id] !== now[id]);
  if (stale.length) throw fail(409, parts.staleMessage(stale), { field: 'parts', stale });
  const name = oneLine(check.name, 120);
  const role = oneLine(check.role, 120);
  if (!name) throw fail(400, 'Enter your name.', { field: 'name' });
  if (!role) throw fail(400, 'Enter your role, for example Supervisor or Director.', { field: 'role' });
  if (check.ack !== true) throw fail(400, 'Tick the last box: this is a draft your business checks and approves before it is used.', { field: 'ack' });
  return {
    name, role, date: longDate(at),
    parts: Object.fromEntries(parts.IDS.map((id) => [id, true])),
    partHashes: now,
    builderCheck: { score: builder.score, band: builder.band },
  };
}

// A confirmation from the per-part check (not an old one-tick confirmation).
const isPartCheck = (confirmation) => Boolean(confirmation && confirmation.parts && confirmation.role);

// Printed under "Prepared by": who checked it, their role, the date and the parts ticked.
function checkedRows(confirmation) {
  if (!isPartCheck(confirmation)) return [];
  return [
    ['Name', confirmation.name],
    ['Role', confirmation.role],
    ['Date', confirmation.date],
    ['Parts checked', parts.labels(parts.IDS.filter((id) => confirmation.parts[id])).join('; ')],
  ];
}

// "Prepared by" left empty prints the name and role given at download (messy round 4: it printed empty
// while the name was only in the footer): { name, date }, or null.
function preparedFromCheck(draft, confirmation) {
  if (draft && String(draft.preparedBy || '').trim()) return { name: draft.preparedBy, date: draft.date };
  if (!isPartCheck(confirmation)) return null;
  return { name: [confirmation.name, confirmation.role].filter(Boolean).join(', '), date: confirmation.date || (draft && draft.date) || '' };
}

// The footer line: "Checked by {name}, {role}, {date}".
const checkedLine = (confirmation) => (isPartCheck(confirmation) ? `Checked by ${confirmation.name}, ${confirmation.role}, ${confirmation.date}` : '');

// The error's extra fields the page reads: the box it is about and the parts to tick again.
function errorFields(error) {
  return {
    ...(typeof error.field === 'string' ? { field: error.field } : {}),
    ...(Array.isArray(error.stale) ? { stale: error.stale } : {}),
  };
}

module.exports = { OLD_CHECK_UNTIL, REFRESH, builderCheck, selfCheck, confirm, isOldShape, oldShapeAllowed, isPartCheck, checkedRows, checkedLine, errorFields, mustFixMessage, longDate, preparedFromCheck };
