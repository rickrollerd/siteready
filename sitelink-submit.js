// SiteLink, Goal 12 stage 7: submit, review from the one screen, conditions (plan section I, stage 7,
// with sections B, E and H).
//
// Submitting. A company that took up a builder's list submits each SWMS on it to the main contractor
// from the one-go page, only once the SWMS has passed SiteWrite's check and been ticked part by part
// (stage 2). Submitting saves the SWMS as its revision in My SWMS, as a download does, and that revision
// is frozen: the main contractor reads that revision and nothing else, never a draft and never a later
// revision until it too is submitted. The builder's details the SWMS changed ("Set by", stage 6) are
// worked out again on submission from the SWMS itself, so a change made inside an open SWMS counts
// too, and the main contractor sees them. The person who sent the list is emailed, briefly.
//
// Reviewing. The HSE lead reviews a submission from the project screen with the stage 1 review page
// (review.html?submission=), in the project's context: Approved, Approved with conditions, or Not
// approved with the changes needed. The response prints on that revision (D290) and the business is
// emailed only that its review is back, and by whom ("{person} via SiteWrite"). A later revision
// starts unreviewed.
//
// Conditions (K10 "C"). Each condition of an approval with conditions is its own line: the
// subcontractor marks each done, and the lead confirms it, or sends it back as not done yet.
//
// Outside SiteWrite. The lead records a SWMS received another way (a PDF or Word file) against the list
// item, or records a file the subcontractor uploaded on the list page. Builder check on it reads the
// file with the AI, so it is optional, and counts toward the project's free readings (D302).
//
// Everything is in the project log, which both sides see: submissions, reviews, conditions and the
// emails that went.
const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const auth = require('./auth');
const accounts = require('./accounts');
const reviews = require('./reviews');
const revisions = require('./revisions');
const humanCheck = require('./human-check');
const handover = require('./handover');
const mailer = require('./mailer');
const listMail = require('./list-mail');
const designFiles = require('./design-files');
const aiScope = require('./ai-scope');
const builderSet = require('./public/builder-set');
const { prepareDraft } = require('./draft');
const { draftBody, textField } = require('./input');
const { downloadGaps, gateMessage } = require('./download-gate');
const { recordReviewResponse, enabled: learningEnabled } = require('./control-learning');
const { record } = require('./events');
const send = require('./sitelink-send');
const subbie = require('./sitelink-subbie');

const { fail } = auth;
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const oneLine = (value, max) => textField(value, max).replace(/\s+/g, ' ').trim();
// The most SWMS one press submits: a list's page holds up to 60 of the builder's.
const SUBMIT_LIMIT = 60;
const CONDITIONS_LIMIT = 20;
const NOTE_LIMIT = 500;

// The helpers hse.js shares when it installs the lead's routes.
let shared = null;
const when = (date, state) => (shared ? shared.dateTime(date, state) : new Date(date).toISOString());
const titleOf = (row) => handover.nameWithoutPrices((row && row.title) || 'SWMS');
const json = (value, fallback) => {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || ''); } catch { return fallback; }
};
const formatAbn = (abn) => { const d = String(abn || '').replace(/\D/g, ''); return d.length === 11 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : d; };
// The subcontract's name as the lead typed it, and the company's own, are the same company when they read the same.
const sameName = (a, b) => String(a || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === String(b || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const listed = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const lower = (text) => String(text || '').toLowerCase();

// ---- What has come in, for each SWMS on a list ----

const submissionsOf = (subId) => db.query('SELECT * FROM submissions WHERE subcontract_id = $1 ORDER BY submitted_at', [subId]);
const reviewsOf = (subId) => db.query("SELECT * FROM swms_reviews WHERE submission_id <> '' AND submission_id IN (SELECT id FROM submissions WHERE subcontract_id = $1) ORDER BY created_at", [subId]);
const conditionsOf = (subId) => db.query('SELECT * FROM review_conditions WHERE subcontract_id = $1 ORDER BY position', [subId]);

function conditionView(row, state) {
  return {
    id: row.id, reviewId: row.review_id, submissionId: row.submission_id, text: row.text, status: row.status,
    doneNote: row.done_note, doneBy: row.done_by_name, doneOn: row.done_at ? when(row.done_at, state) : '',
    closedBy: row.closed_by_name, closedOn: row.closed_at ? when(row.closed_at, state) : '',
    backNote: row.back_note, backBy: row.back_by_name, backOn: row.back_at ? when(row.back_at, state) : '',
  };
}

function reviewOut(row, state, conditions) {
  const label = (reviews.RESPONSES[row.response] || {}).label || row.response;
  return {
    id: row.id, submissionId: row.submission_id, response: row.response, label, text: row.text, name: row.reviewer_name, company: row.reviewer_company,
    on: when(row.created_at, state), date: reviews.reviewView(row).date, revision: Number(row.revision),
    conditions: conditions.filter((item) => item.review_id === row.id).map((item) => conditionView(item, state)),
  };
}

// The builder's details as the main contractor set them, with any detail that matches an earlier
// version of the site details said so: the SWMS was prepared before the builder changed it.
function overridesFor(list, input, versions) {
  const found = builderSet.overridesOf(list.builderSet, input || {});
  return found.map((item) => {
    const older = [...versions].reverse().find((row) => {
      const field = builderSet.fieldOf(item.key);
      return Number(row.rev) !== Number((list.siteDetails || {}).rev) && builderSet.same(field, (row.details || {})[item.key], item.now) && builderSet.asText(field, item.now);
    });
    return older ? { ...item, olderRev: Number(older.rev) } : item;
  });
}
const overrideText = (item) => (item.olderRev ? `${lower(item.label)} (as in site details version ${item.olderRev})` : lower(item.label));

function submissionOut(row, state, { forLead = false } = {}) {
  const check = json(row.check_info, null);
  const builder = json(row.builder_check, null);
  return {
    id: row.id, channel: row.channel, requiredId: row.required_swms_id, title: row.title, revision: Number(row.revision || 0), ref: row.ref,
    on: when(row.submitted_at, state), by: row.submitted_by_name, company: row.company_name,
    checkedBy: check && check.name ? { name: check.name, role: check.role || '', date: check.date || '' } : null,
    // What each part printed as submitted, worked out on the server: the company's page compares its own
    // check with it, so "Changed since you submitted it" is the same on every device and after a reload
    // (messy round 8, stuck point 1).
    partHashes: check && check.partHashes && typeof check.partHashes === 'object' ? check.partHashes : null,
    builderCheck: builder && builder.score !== undefined ? { score: builder.score, band: builder.band, mustFix: Number(builder.mustFix || 0) } : null,
    overrides: json(row.overrides, []),
    file: row.file_name ? { name: row.file_name, type: row.file_type === send.TYPES.pdf ? 'PDF' : 'Word', size: Number(row.file_size || 0) } : null,
    checkStatus: row.check_status || '',
    ...(forLead ? { note: row.note, checkError: row.check_error } : {}),
  };
}

// For each SWMS on the list now: its latest submission, the review that stands on it, every condition
// on the SWMS still open, and the earlier submissions. A later submission starts unreviewed.
async function itemStates(sub, project, { forLead = false } = {}) {
  const items = await db.query('SELECT * FROM required_swms WHERE subcontract_id = $1 AND removed_at IS NULL ORDER BY position, created_at', [sub.id]);
  const all = await submissionsOf(sub.id);
  const reviewRows = await reviewsOf(sub.id);
  const conditionRows = await conditionsOf(sub.id);
  const state = project.state;
  return items.map((item) => {
    const mine = all.filter((row) => row.required_swms_id === item.id);
    const latest = mine[mine.length - 1] || null;
    const reviewOf = (row) => {
      const found = reviewRows.filter((one) => one.submission_id === row.id);
      return found.length ? reviewOut(found[found.length - 1], state, conditionRows) : null;
    };
    const conditions = conditionRows.filter((row) => row.required_swms_id === item.id);
    return {
      id: item.id,
      title: titleOf(item),
      latest: latest ? { ...submissionOut(latest, state, { forLead }), review: reviewOf(latest) } : null,
      earlier: mine.slice(0, -1).reverse().map((row) => ({ ...submissionOut(row, state, { forLead }), review: reviewOf(row) })),
      conditions: conditions.map((row) => ({ ...conditionView(row, state), revision: Number((all.find((one) => one.id === row.submission_id) || {}).revision || 0) })),
    };
  });
}

// ---- The company's side ----

// What the company's one-go page shows of each SWMS it submitted: when, which revision, the response
// and each condition, and the log entries both sides see.
const SUBBIE_LOG = new Set(['submitted_mail', 'list_sent', 'list_resent', 'reminder', 'list_opened', 'uploaded', 'upload_removed', 'claimed', 'submitted', 'review_sent', 'condition_done', 'condition_undone', 'condition_confirmed', 'condition_back', 'outside_recorded', 'stopped', 'restarted']);
async function forCompany(found) {
  const { sub, project } = found;
  const items = await itemStates(sub, project);
  const log = (await send.logOf(project.id, sub.id)).filter((row) => SUBBIE_LOG.has(row.kind)).slice(0, 100);
  return {
    items: Object.fromEntries(items.map((item) => [item.id, item])),
    log: log.map((row) => ({ when: when(row.created_at, project.state), text: row.summary })),
  };
}

// For the company's list of lists: how many are submitted and how many conditions it has to do.
async function companySummary(sub) {
  // Only what the company submitted in SiteWrite: a file the lead recorded is the lead's (messy round 8,
  // wording 8: "3 submitted" when the company had submitted 2).
  const rows = await db.query("SELECT DISTINCT required_swms_id FROM submissions WHERE subcontract_id = $1 AND channel = 'sitewrite' AND required_swms_id IN (SELECT id FROM required_swms WHERE subcontract_id = $1 AND removed_at IS NULL)", [sub.id]);
  const open = await db.query("SELECT id FROM review_conditions WHERE subcontract_id = $1 AND status = 'outstanding'", [sub.id]);
  return { submitted: rows.length, conditionsToDo: open.length };
}

// Who to tell when a SWMS is submitted: the person who sent the list, or the account's lead.
async function leadFor(sub, org) {
  const link = (await db.query("SELECT sent_by FROM list_links WHERE subcontract_id = $1 AND kind <> 'reminder' ORDER BY created_at DESC LIMIT 1", [sub.id]))[0];
  const sender = link && link.sent_by ? await db.one('SELECT name, email FROM reviewers WHERE id = $1', [link.sent_by]) : null;
  if (sender && sender.email) return sender;
  return db.one("SELECT reviewers.name, reviewers.email FROM org_members JOIN reviewers ON reviewers.id = org_members.reviewer_id WHERE org_members.org_id = $1 AND org_members.role = 'lead'", [org.id]);
}

async function keepMail({ projectId, subId, template, to, fromName, replyTo, subject, text, result }) {
  await db.query('INSERT INTO mail_messages (id, project_id, subcontract_id, link_id, template, template_version, recipient, from_name, reply_to, subject, body, provider, provider_id, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)',
    [auth.newId(), projectId, subId, '', template, 1, to, fromName, replyTo, subject, text, result ? result.provider || '' : '', result ? result.id || '' : '', result ? 'sent' : 'kept', new Date()]);
}

// The short email to the lead (template "submitted", version 1).
function submittedMail({ person, company, project, items, link }) {
  const one = items.length === 1;
  const lines = items.map((item) => `• ${item.title}, revision ${item.revision}.${item.overrides.length ? ` It changes details you set: ${listed(item.overrides.map(overrideText))}.` : ''}`);
  return {
    subject: `SWMS submitted for ${project}`,
    text: `${person} from ${company} has submitted ${one ? 'a SWMS' : `${items.length} SWMS`} for ${project}:\n\n${lines.join('\n')}\n\nReview ${one ? 'it' : 'them'} in SiteLink:\n${link}`,
  };
}

async function tellLead(req, found, done) {
  const { sub, project, org } = found;
  const lead = await leadFor(sub, org);
  if (!lead || !lead.email) return '';
  const person = oneLine(req.user.name, 120) || done[0].checkedBy.name || req.company.name;
  const mail = submittedMail({ person, company: req.company.name, project: project.name, items: done, link: `${auth.appUrl(req)}/sitelink#/project/${project.id}` });
  const fromName = listMail.fromName(person);
  let result = null;
  try {
    result = await mailer.sendMail({ to: lead.email, subject: mail.subject, text: mail.text, from: { name: fromName, address: String(process.env.PROJECT_MAIL_FROM_ADDRESS || '').trim() }, replyTo: req.user.email });
  } catch (error) {
    // The submission stands whether or not the email goes.
    console.error('Submission email could not be sent:', error.message);
    return '';
  }
  await keepMail({ projectId: project.id, subId: sub.id, template: 'submitted', to: lead.email, fromName, replyTo: req.user.email, subject: mail.subject, text: mail.text, result });
  return lead.name || lead.email;
}

// One SWMS submitted: SiteWrite's check and the person's ticks again on the server, saved as its
// revision (frozen from now on), and the builder's details it changed worked out from the SWMS itself.
async function submitOne(req, found, list, entry, versions) {
  const requiredId = String((entry && entry.requiredId) || '');
  const item = list.items.find((one) => one.requiredId === requiredId);
  if (!item) throw fail(404, 'That SWMS is no longer on the main contractor\'s list. Reload the page to see the list as it is now.');
  const body = entry.swms && typeof entry.swms === 'object' && !Array.isArray(entry.swms) ? entry.swms : null;
  if (!body) throw fail(400, 'Prepare this SWMS and check it before submitting it.');
  const input = accounts.withCompany(draftBody(body), req.company);
  const draft = prepareDraft(input);
  if (draft.kind !== 'draft') throw fail(400, 'This SWMS is not prepared yet. Answer its questions and check it before submitting it.');
  const gaps = downloadGaps(input, draft);
  if (gaps.length) throw Object.assign(fail(400, gateMessage(gaps)), { gate: gaps });
  const confirmation = humanCheck.confirm({ check: body.check }, draft, { state: input.state, doing: 'submitting' });
  // A page that lost which saved SWMS this is (another device, a cleared phone) submits to the SWMS
  // submitted for this item before, so the company does not get a second copy of it.
  const prior = typeof body.swmsId === 'string' && body.swmsId ? null : await db.one("SELECT swms_id FROM submissions WHERE subcontract_id = $1 AND required_swms_id = $2 AND channel = 'sitewrite' AND company_id = $3 AND swms_id <> '' ORDER BY submitted_at DESC LIMIT 1", [found.sub.id, requiredId, req.company.id]);
  const saved = await accounts.saveForDownload(req, { ...body, requestKey: undefined, ...(prior ? { swmsId: prior.swms_id } : {}) }, { title: item.title, confirmation });
  if (!saved) throw fail(400, 'This SWMS is not prepared yet. Answer its questions and check it before submitting it.');
  const { row, kept } = saved;
  const revision = Number(kept.revision || row.revision || 1);
  const { sub, project } = found;
  // The same revision submitted again (a double press, or Back and submit again) is kept once.
  const again = await db.one("SELECT * FROM submissions WHERE subcontract_id = $1 AND required_swms_id = $2 AND channel = 'sitewrite' AND swms_id = $3 AND revision = $4", [sub.id, requiredId, row.id, revision]);
  if (again) return { ...submissionOut(again, project.state), repeated: true, swmsId: row.id };
  const overrides = overridesFor(list, kept.input, versions);
  const check = kept.confirmation && kept.confirmation.parts ? kept.confirmation : confirmation;
  const builder = { ...(check.builderCheck || {}), mustFix: 0 };
  const id = auth.newId();
  const now = new Date();
  const who = oneLine(req.user.name, 200) || check.name;
  // The name given with the check names this person from now on, when the account has none.
  if (!oneLine(req.user.name, 200) && check.name) await db.query("UPDATE users SET name = $1 WHERE id = $2 AND (name IS NULL OR name = '')", [oneLine(check.name, 120), req.user.id]).catch(() => {});
  await db.query(`INSERT INTO submissions (id, project_id, subcontract_id, required_swms_id, company_id, company_name, channel, swms_id, revision, ref, title, content_hash, check_info, builder_check, overrides, submitted_by, submitted_by_name, submitted_at)
    VALUES ($1, $2, $3, $4, $5, $6, 'sitewrite', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
  [id, project.id, sub.id, requiredId, req.company.id, req.company.name, row.id, revision, kept.ref || '', handover.nameWithoutPrices(item.title), revisions.contentHash(kept.draft),
    JSON.stringify({ name: check.name, role: check.role, date: check.date, parts: check.parts || null, partHashes: confirmation.partHashes || null }), JSON.stringify(builder), JSON.stringify(overrides), req.user.id, who, now]);
  const earlier = await db.one("SELECT revision FROM submissions WHERE subcontract_id = $1 AND required_swms_id = $2 AND id <> $3 ORDER BY submitted_at DESC LIMIT 1", [sub.id, requiredId, id]);
  const changed = overrides.length ? ` It changes details ${found.org.name} set: ${listed(overrides.map(overrideText))}.` : '';
  await send.logEntry({
    projectId: project.id, subId: sub.id, itemId: requiredId, kind: 'submitted', actorKind: 'sub', actorName: who,
    summary: `${req.company.name} submitted ${handover.nameWithoutPrices(item.title)} (revision ${revision}${earlier ? `, after revision ${earlier.revision}` : ''})${sameName(sub.name, req.company.name) ? '' : ` for ${sub.name}`}. Checked by ${check.name}, ${check.role}.${changed}`,
    refs: { submission: id },
  });
  record('swms_submitted', req.company.id);
  return { ...submissionOut(await db.one('SELECT * FROM submissions WHERE id = $1', [id]), project.state), swmsId: row.id, title: handover.nameWithoutPrices(item.title), overrides };
}

const router = express.Router();
router.use('/from-builders', auth.requireUser);

// Submits one or more SWMS on the list: { items: [{ requiredId, swms }] }, swms being the SWMS's input
// with its check, as the project zip takes it. Each is checked on its own; the ones that pass are
// submitted, and the lead gets one short email for them all.
router.post('/from-builders/:id/submit', route(async (req, res) => {
  const found = await subbie.listFor(req.company, req.params.id);
  if (!auth.hasAccess(req.company)) throw fail(402, 'Your free trial has ended. Subscribe to submit these SWMS in SiteWrite.');
  if (!String(req.company.name || '').trim() || !String(req.company.abn || '').trim()) throw fail(400, 'Add your company name and ABN under Company profile before submitting. They are printed on every SWMS.');
  const list = await subbie.listView(found);
  const entries = Array.isArray(req.body && req.body.items) ? req.body.items.slice(0, SUBMIT_LIMIT) : [];
  if (!entries.length) throw fail(400, 'Choose a SWMS to submit.');
  const versions = await db.query('SELECT * FROM project_site_details WHERE project_id = $1 ORDER BY rev', [found.project.id]);
  const done = [];
  const refused = [];
  for (const entry of entries) {
    try {
      done.push(await submitOne(req, found, list, entry, versions));
    } catch (error) {
      if (!error.publicMessage) throw error;
      const item = list.items.find((one) => one.requiredId === String((entry && entry.requiredId) || ''));
      refused.push({ requiredId: String((entry && entry.requiredId) || ''), title: item ? item.title : '', message: error.message, field: error.field || '', stale: error.stale || null });
    }
  }
  const fresh = done.filter((item) => !item.repeated);
  const told = fresh.length ? await tellLead(req, found, fresh) : '';
  if (told) {
    await send.logEntry({ projectId: found.project.id, subId: found.sub.id, kind: 'submitted_mail', actorKind: 'system', summary: `SiteLink emailed ${told} that ${fresh.length === 1 ? `${fresh[0].title} was` : `${fresh.length} SWMS were`} submitted.` });
  }
  const builder = found.org.name;
  const message = fresh.length
    ? `${fresh.length === 1 ? `${fresh[0].title} is submitted` : `${fresh.length} SWMS are submitted`} to ${builder}${told ? `, and ${told} has been emailed` : ''}. ${fresh.length === 1 ? 'That revision is what' : 'Those revisions are what'} ${builder} reviews. If you change ${fresh.length === 1 ? 'it' : 'one'} now, submit it again.`
    : done.length ? `${done.length === 1 ? 'That revision was' : 'Those revisions were'} already submitted to ${builder}. Nothing has changed since.` : '';
  const status = done.length ? (fresh.length ? 201 : 200) : 400;
  res.status(status).json({ message: message || (refused[0] ? refused[0].message : ''), submitted: done, refused, sent: await forCompany(found) });
}));

// A condition marked done by the company, with a short note if it wants; or no longer done, before the
// main contractor has confirmed it.
// Who did it at the company: the person's name, else the company itself.
// A person with no name on their account is named as they named themselves when they submitted a SWMS on
// this list ("Checked by"), not as the company (messy round 8, wording 6: "Marked done by Wallaroo Bend
// Electrical Pty Ltd" when Ben Hollis did it).
async function personOf(req, subId = '') {
  const own = oneLine(req.user.name, 200);
  if (own) return own;
  const row = subId ? await db.one('SELECT submitted_by_name FROM submissions WHERE subcontract_id = $1 AND submitted_by = $2 ORDER BY submitted_at DESC LIMIT 1', [subId, req.user.id]) : null;
  return (row && oneLine(row.submitted_by_name, 200)) || req.company.name;
}
const byCompany = (req, who) => (who === req.company.name ? who : `${who} at ${req.company.name}`);
// Words quoted in a log line, without their own last full stop: the line ends with one.
const quoted = (text) => String(text || '').replace(/[.\s]+$/, '');

async function conditionForCompany(req) {
  const found = await subbie.listFor(req.company, req.params.id);
  const row = await db.one('SELECT * FROM review_conditions WHERE id = $1 AND subcontract_id = $2', [String(req.params.conditionId || ''), found.sub.id]);
  if (!row) throw fail(404, 'That condition was not found. Reload the page.');
  const item = await db.one('SELECT title FROM required_swms WHERE id = $1', [row.required_swms_id]);
  return { found, row, title: titleOf(item) };
}

router.post('/from-builders/:id/conditions/:conditionId/done', route(async (req, res) => {
  const { found, row, title } = await conditionForCompany(req);
  if (row.status === 'closed') throw fail(409, `${found.org.name} has already confirmed this condition is done.`);
  const note = oneLine(req.body && req.body.note, NOTE_LIMIT);
  // Pressed again with the same note (after a 502): it is marked done once.
  if (row.status === 'done' && (row.done_note || '') === note) { res.json({ message: `Marked done. ${found.org.name} confirms it.`, sent: await forCompany(found) }); return; }
  if (row.status === 'done') throw fail(409, 'This condition is already marked done. Reload the page.');
  const who = await personOf(req, found.sub.id);
  await db.query("UPDATE review_conditions SET status = 'done', done_note = $1, done_by_name = $2, done_at = $3 WHERE id = $4 AND status = 'outstanding'", [note, who, new Date(), row.id]);
  await send.logEntry({ projectId: found.project.id, subId: found.sub.id, itemId: row.required_swms_id, kind: 'condition_done', actorKind: 'sub', actorName: who, summary: `${byCompany(req, who)} marked a condition on ${title} as done: "${quoted(row.text)}".${note ? ` Note: "${quoted(note)}".` : ''}`, refs: { condition: row.id } });
  res.json({ message: `Marked done. ${found.org.name} confirms it.`, sent: await forCompany(found) });
}));

router.post('/from-builders/:id/conditions/:conditionId/undo', route(async (req, res) => {
  const { found, row, title } = await conditionForCompany(req);
  if (row.status === 'closed') throw fail(409, `${found.org.name} has already confirmed this condition is done, so it cannot be changed here.`);
  if (row.status !== 'done') throw fail(409, 'This condition is not marked done. Reload the page.');
  const who = await personOf(req, found.sub.id);
  await db.query("UPDATE review_conditions SET status = 'outstanding', done_note = '', done_by_name = '', done_at = NULL WHERE id = $1 AND status = 'done'", [row.id]);
  await send.logEntry({ projectId: found.project.id, subId: found.sub.id, itemId: row.required_swms_id, kind: 'condition_undone', actorKind: 'sub', actorName: who, summary: `${byCompany(req, who)} said a condition on ${title} is not done after all: "${quoted(row.text)}".`, refs: { condition: row.id } });
  res.json({ message: 'It is no longer marked done.', sent: await forCompany(found) });
}));

// ---- The main contractor's side ----

// What the project screen shows for each subcontract (the one screen): each SWMS on the list, whether
// it is in and how, its review, its conditions, the builder's details it changed, whether the company
// took it off its list, the sign-ons on the submitted revision, and counts for the row.
async function summaryFor(sub, project) {
  const items = await itemStates(sub, project, { forLead: true });
  const uploads = await db.query('SELECT DISTINCT required_swms_id FROM list_uploads WHERE subcontract_id = $1 AND removed_at IS NULL', [sub.id]);
  const uploaded = new Set(uploads.map((row) => row.required_swms_id));
  const off = new Set(await subbie.offListOf(sub));
  const rows = [];
  for (const item of items) {
    const latest = item.latest;
    let signOns = null;
    if (latest && latest.channel === 'sitewrite') {
      const row = await db.one('SELECT swms_id FROM submissions WHERE id = $1', [latest.id]);
      const n = row && row.swms_id ? await db.one('SELECT COUNT(*) AS n FROM signons WHERE swms_id = $1 AND revision = $2', [row.swms_id, latest.revision]) : null;
      signOns = n ? Number(n.n) : 0;
    }
    const open = item.conditions.filter((one) => one.status === 'outstanding').length;
    const toConfirm = item.conditions.filter((one) => one.status === 'done').length;
    const review = latest && latest.review;
    rows.push({
      id: item.id,
      title: item.title,
      // in: submitted in SiteWrite, received outside it, or a file uploaded on the list page not yet
      // recorded; off: taken off the company's list (not submitted); none: not in yet.
      state: latest ? latest.channel : uploaded.has(item.id) ? 'uploaded' : off.has(item.id) ? 'off' : 'none',
      submissionId: latest ? latest.id : '',
      revision: latest ? latest.revision : 0,
      on: latest ? latest.on : '',
      by: latest ? latest.by : '',
      review: review ? { response: review.response, label: review.label, by: review.name, on: review.on } : null,
      // A later revision submitted after one was reviewed starts unreviewed.
      reviewedBefore: !review && item.earlier.some((one) => one.review) ? item.earlier.find((one) => one.review).review.label : '',
      conditionsOpen: open,
      toConfirm,
      conditionsMet: item.conditions.length > 0 && item.conditions.every((one) => one.status === 'closed'),
      overrides: latest ? latest.overrides.map((one) => ({ label: one.label, set: one.set, now: one.now, olderRev: one.olderRev || 0 })) : [],
      signOns,
      checkStatus: latest ? latest.checkStatus : '',
    });
  }
  const count = (fn) => rows.filter(fn).length;
  return {
    stage7: {
      items: rows,
      // A file uploaded on the list page is in once the lead records it (messy round 8: "3 of 5 in" beside
      // its tag "File uploaded: record it").
      in: count((row) => ['sitewrite', 'outside'].includes(row.state)),
      uploaded: count((row) => row.state === 'uploaded'),
      toReview: count((row) => row.submissionId && !row.review),
      approved: count((row) => row.review && row.review.response !== 'changes'),
      notApproved: count((row) => row.review && row.review.response === 'changes'),
      conditionsOpen: rows.reduce((n, row) => n + row.conditionsOpen, 0),
      toConfirm: rows.reduce((n, row) => n + row.toConfirm, 0),
      overrides: count((row) => row.overrides.length),
      off: count((row) => row.state === 'off'),
    },
  };
}

// What the subcontract page shows of each SWMS on the list: its submissions, for the lead.
async function forSubcontractPage(ctx) {
  const { sub, project } = ctx;
  const items = await itemStates(sub, project, { forLead: true });
  return { items: Object.fromEntries(items.map((item) => [item.id, item])), outsideOn: designFiles.enabled() };
}

// A submission, for someone in the subcontract's account. Anything else reads as not found.
async function submissionFor(req, id) {
  const row = await db.one('SELECT * FROM submissions WHERE id = $1', [String(id || '')]);
  if (!row) throw fail(404, 'That SWMS was not found.');
  let ctx;
  try {
    ctx = await shared.subcontractFor(req, row.subcontract_id);
  } catch {
    throw fail(404, 'That SWMS was not found.');
  }
  return { row, ...ctx };
}

// The revision submitted, as kept. Gone when the business deleted it.
async function keptOf(row) {
  if (row.channel !== 'sitewrite' || !row.swms_id) return null;
  const swms = await db.one('SELECT * FROM swms WHERE id = $1', [row.swms_id]);
  if (!swms || swms.archived) return null;
  const kept = await revisions.getRevision(row.swms_id, row.revision);
  return kept ? { swms, kept } : null;
}

async function laterOf(row) {
  return db.one('SELECT * FROM submissions WHERE subcontract_id = $1 AND required_swms_id = $2 AND submitted_at > $3 ORDER BY submitted_at DESC LIMIT 1', [row.subcontract_id, row.required_swms_id, row.submitted_at]);
}

async function readingsLeft(project) {
  const limit = aiScope.projectFreeReadings();
  const used = await aiScope.projectReadingsUsed(project.id);
  return { used, limit, left: Math.max(0, limit - used), on: aiScope.enabled() };
}

// The review page in the project's context: the project, the subcontractor, what was submitted and
// how, the revision as it prints (read only, without worker rows), the responses and conditions.
async function submissionPage(found) {
  const { row, sub, project, org, role } = found;
  const state = project.state;
  const later = await laterOf(row);
  const reviewRows = await db.query('SELECT * FROM swms_reviews WHERE submission_id = $1 ORDER BY created_at DESC', [row.id]);
  const conditionRows = await db.query('SELECT * FROM review_conditions WHERE submission_id = $1 ORDER BY position', [row.id]);
  const earlier = await db.query('SELECT * FROM submissions WHERE subcontract_id = $1 AND required_swms_id = $2 AND submitted_at < $3 ORDER BY submitted_at DESC', [row.subcontract_id, row.required_swms_id, row.submitted_at]);
  const openBefore = await db.query("SELECT * FROM review_conditions WHERE required_swms_id = $1 AND submission_id <> $2 AND status <> 'closed' ORDER BY position", [row.required_swms_id, row.id]);
  const out = {
    submission: submissionOut(row, state, { forLead: true }),
    project: { id: project.id, name: project.name, workplace: project.workplace, state },
    subcontract: { id: sub.id, name: sub.name, trade: sub.trade, claimed: Boolean(sub.company_id) },
    // Whether the business is on SiteWrite, so is emailed that its review is back (messy round 8, wording 5).
    onSiteWrite: Boolean(row.company_id || sub.company_id),
    org: { name: org.name, role },
    later: later ? { id: later.id, revision: Number(later.revision || 0), on: when(later.submitted_at, state), channel: later.channel } : null,
    earlier: earlier.map((one) => ({ id: one.id, revision: Number(one.revision || 0), on: when(one.submitted_at, state), channel: one.channel })),
    responses: reviewRows.map((one) => reviewOut(one, state, conditionRows)),
    // Conditions from an earlier submission of this SWMS still open: they stand until confirmed.
    openBefore: openBefore.map((one) => conditionView(one, state)),
    current: !later,
    signOns: null,
  };
  if (row.channel === 'sitewrite') {
    const found2 = await keptOf(row);
    if (!found2) return { ...out, gone: true, current: false };
    const { swms, kept } = found2;
    const held = await reviews.revisionFiles(swms, kept);
    const tables = reviews.printedTables(kept.draft);
    for (const table of [tables.designs, tables.substances].filter(Boolean)) table.files = table.files.map((file) => (file && held.has(file.id) ? file : null));
    const signed = await db.one('SELECT COUNT(*) AS n FROM signons WHERE swms_id = $1 AND revision = $2', [row.swms_id, row.revision]);
    return {
      ...out,
      title: row.title,
      draft: reviews.forReviewer(kept.draft),
      tables,
      checked: humanCheck.checkedRows(kept.confirmation),
      prepared: humanCheck.preparedFromCheck(kept.draft, kept.confirmation),
      signOns: Number((signed && signed.n) || 0),
    };
  }
  return { ...out, title: row.title, readings: await readingsLeft(project), outsideCheck: row.check_status === 'done' ? json(row.builder_check, null) : null };
}

// ---- Files of a SWMS received outside SiteWrite ----

const objectKey = (id) => `outside-swms/${id}`;
async function putFile(id, data, type) {
  if (designFiles.bucketConfigured()) {
    await designFiles.bucketRequest('PUT', objectKey(id), data, type);
    return 'bucket';
  }
  await db.query('INSERT INTO submission_file_data (submission_id, data) VALUES ($1, $2)', [id, data.toString('base64')]);
  return 'database';
}
async function getFile(row) {
  if (row.file_storage === 'bucket') return designFiles.bucketRequest('GET', objectKey(row.id));
  const kept = await db.one('SELECT data FROM submission_file_data WHERE submission_id = $1', [row.id]);
  return kept ? Buffer.from(kept.data, 'base64') : null;
}
function sendFile(res, row, data) {
  res.setHeader('Content-Type', row.file_type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `${row.file_type === send.TYPES.pdf ? 'inline' : 'attachment'}; filename="${row.file_name.replace(/[^A-Za-z0-9 ._-]+/g, '_')}"; filename*=UTF-8''${encodeURIComponent(row.file_name)}`);
  res.send(data);
}

// Records a SWMS received outside SiteWrite against a SWMS on the list.
async function recordOutside(req, ctx, item, { data, type, name, note, from = '' }) {
  const { sub, project } = ctx;
  // The same file recorded again for this SWMS a moment later (Record it pressed again after a 502) is
  // kept once (messy round 8, stuck point 5).
  const sha = crypto.createHash('sha256').update(data).digest('hex');
  const again = await db.one("SELECT id, submitted_at FROM submissions WHERE subcontract_id = $1 AND required_swms_id = $2 AND channel = 'outside' AND file_sha256 = $3 ORDER BY submitted_at DESC LIMIT 1", [sub.id, item.id, sha]);
  if (again && Date.now() - new Date(again.submitted_at).getTime() < reviews.REPEAT_MINUTES * 60 * 1000) return again.id;
  const id = auth.newId();
  const storage = await putFile(id, data, type);
  const who = shared.personName(req.reviewer);
  const now = new Date();
  await db.query(`INSERT INTO submissions (id, project_id, subcontract_id, required_swms_id, company_id, company_name, channel, title, overrides, file_name, file_type, file_size, file_sha256, file_storage, note, submitted_by, submitted_by_name, submitted_at)
    VALUES ($1, $2, $3, $4, $5, $6, 'outside', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
  [id, project.id, sub.id, item.id, sub.company_id || '', sub.claimed_name || sub.name, titleOf(item), '[]', name, type, data.length, sha, storage, note, req.reviewer.id, who, now]);
  await send.logEntry({ projectId: project.id, subId: sub.id, itemId: item.id, kind: 'outside_recorded', actorKind: 'org', actorName: who, summary: `${who} recorded a SWMS received outside SiteWrite for ${titleOf(item)} from ${sub.name}: ${name}${from ? `, ${from}` : ''}.${note ? ` Note: "${note}".` : ''}`, refs: { submission: id } });
  record('swms_outside_recorded', null);
  return id;
}

// Builder check on a SWMS received outside SiteWrite: the AI copies the file into the checker's form
// (check-read.js), so it is optional, and it counts toward the project's free readings (D302). It runs
// after the answer; the page asks how it is going.
async function startOutsideCheck(found) {
  const { row, project, org } = found;
  if (!aiScope.enabled()) throw fail(503, 'Builder check on a file is not switched on just now. Read the SWMS yourself, or try again later.');
  if (row.check_status === 'reading') return { done: Promise.resolve() };
  const data = await getFile(row);
  if (!data) throw fail(404, 'That file was not found.');
  const checkRead = require('./check-read');
  const limit = aiScope.projectFreeReadings();
  const readingId = crypto.randomUUID();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.query('SELECT id FROM projects WHERE id = $1 FOR UPDATE', [project.id]);
    const fresh = await tx.one('SELECT check_status FROM submissions WHERE id = $1', [row.id]);
    if (fresh && fresh.check_status === 'reading') throw fail(409, 'Builder check is already running on this file. It shows here when it is done.');
    if (await aiScope.projectReadingsUsed(project.id, tx) >= limit) throw Object.assign(fail(402, aiScope.limitMessage(limit)), { limit: true });
    await tx.query("INSERT INTO ai_readings (id, company_id, org_id, project_id, doc_hash, brief_version, model, status, characters, created_at, stage, stage_at) VALUES ($1, '', $2, $3, $4, $5, $6, 'reading', $7, $8, 'reading', $8)",
      [readingId, org.id, project.id, row.file_sha256, checkRead.CHECK_BRIEF_VERSION, aiScope.MODEL, data.length, now]);
    await tx.query("UPDATE submissions SET check_status = 'reading', check_error = '', check_reading_id = $1 WHERE id = $2", [readingId, row.id]);
  });
  const body = { file: { name: row.file_name, type: row.file_type, data: data.toString('base64') }, state: project.state };
  const done = checkRead.runCheck(body, null).then(async (result) => {
    const kept = { score: result.score, band: result.band, mustFix: result.findings.filter((item) => item.hard && !item.pass).length, findings: result.findings, preStart: result.preStart || [], notFound: (result.notFound || []).length };
    await db.query("UPDATE submissions SET check_status = 'done', builder_check = $1 WHERE id = $2", [JSON.stringify(kept), row.id]);
    await db.query("UPDATE ai_readings SET status = 'done', finished_at = $1 WHERE id = $2", [new Date(), readingId]);
    await send.logEntry({ projectId: project.id, subId: row.subcontract_id, itemId: row.required_swms_id, kind: 'outside_checked', actorKind: 'system', summary: `Builder check on ${row.file_name} for ${row.title}: ${result.score} out of 100, ${lower(result.band)}.`, refs: { submission: row.id } });
  }, async (error) => {
    // A failed reading does not count toward the free readings.
    await db.query("UPDATE submissions SET check_status = 'failed', check_error = $1 WHERE id = $2", [String(error && error.publicMessage ? error.message : 'The file could not be read just now. Try again.').slice(0, 300), row.id]);
    await db.query("UPDATE ai_readings SET status = 'failed', error = $1, finished_at = $2 WHERE id = $3", ['Builder check could not read the file.', new Date(), readingId]);
  }).catch(() => {});
  return { done };
}

// The response, for a submission: the stage 1 rules, with the name from the person's own details
// and the company from the account. Each condition is its own line.
function conditionLines(text) {
  return String(text || '').split(/\r?\n/).map((line) => line.replace(/^\s*(?:[-*•·]|\d{1,2}[.)])\s+/, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

async function tellCompany(req, found, review) {
  const { row, sub, project } = found;
  const companyId = row.company_id || sub.company_id;
  if (!companyId) return 0;
  const users = await db.query('SELECT email FROM users WHERE company_id = $1', [companyId]);
  const mail = reviews.reviewBackMail(review);
  const fromName = listMail.fromName(review.name);
  let sent = 0;
  for (const user of users) {
    try {
      const result = await mailer.sendMail({ to: user.email, subject: mail.subject, text: mail.text, from: { name: fromName, address: String(process.env.PROJECT_MAIL_FROM_ADDRESS || '').trim() }, replyTo: req.reviewer.email });
      await keepMail({ projectId: project.id, subId: sub.id, template: 'review_back', to: user.email, fromName, replyTo: req.reviewer.email, subject: mail.subject, text: mail.text, result });
      sent += 1;
    } catch (error) {
      console.error('Review response email could not be sent:', error.message);
    }
  }
  return sent;
}

async function conditionForLead(req) {
  const row = await db.one('SELECT * FROM review_conditions WHERE id = $1', [String(req.params.conditionId || '')]);
  if (!row) throw fail(404, 'That condition was not found.');
  let ctx;
  try {
    ctx = await shared.subcontractFor(req, row.subcontract_id);
  } catch {
    throw fail(404, 'That condition was not found.');
  }
  const item = await db.one('SELECT title FROM required_swms WHERE id = $1', [row.required_swms_id]);
  return { row, ctx, title: titleOf(item) };
}

function install(hseRouter, deps) {
  shared = deps;
  const { subcontractFor, personName, needName } = deps;

  hseRouter.get('/hse/submissions/:id', route(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const found = await submissionFor(req, req.params.id);
    record('review_view', null);
    res.json({ ...(await submissionPage(found)), me: { name: req.reviewer.name || '', email: req.reviewer.email } });
  }));

  // A design or safety data sheet file the submitted revision names.
  hseRouter.get('/hse/submissions/:id/files/:fileId', route(async (req, res) => {
    const found = await submissionFor(req, req.params.id);
    const kept = await keptOf(found.row);
    const fileId = String(req.params.fileId || '');
    if (!kept || !(await reviews.revisionFiles(kept.swms, kept.kept)).has(fileId)) throw fail(404, 'That file was not found.');
    const file = await designFiles.fileForSwms(kept.swms.company_id, kept.swms.id, fileId);
    if (!file) throw fail(404, 'That file was not found.');
    designFiles.sendFile(res, file);
  }));

  // The file of a SWMS received outside SiteWrite.
  hseRouter.get('/hse/submissions/:id/file', route(async (req, res) => {
    const found = await submissionFor(req, req.params.id);
    const data = found.row.channel === 'outside' ? await getFile(found.row) : null;
    if (!data) throw fail(404, 'That file was not found.');
    sendFile(res, found.row, data);
  }));

  // Builder check: on a submitted revision at once, with no AI; on a file received outside SiteWrite,
  // started here and read by the AI (optional, one of the project's free readings).
  hseRouter.post('/hse/submissions/:id/check', route(async (req, res) => {
    const found = await submissionFor(req, req.params.id);
    if (found.row.channel === 'sitewrite') {
      const kept = await keptOf(found.row);
      if (!kept) throw fail(404, `${found.row.company_name || 'The business'} has deleted this SWMS, so it cannot be checked here.`);
      res.json({ ...reviews.checkRevision(kept.kept), source: 'saved revision' });
      return;
    }
    // Refused at once when it cannot start (switched off, or no free readings left); then it runs on.
    await startOutsideCheck(found);
    res.status(202).json({ status: 'reading', message: 'Builder check is reading the file. It takes a minute or two, and shows here when it is done.' });
  }));

  hseRouter.post('/hse/submissions/:id/response', route(async (req, res) => {
    const body = req.body || {};
    const response = Object.hasOwn(reviews.RESPONSES, body.response) ? body.response : '';
    if (!response) throw Object.assign(fail(400, 'Choose a response: Approved, Approved with conditions or Not approved.'), { field: 'response' });
    const text = textField(body.text, reviews.TEXT_LIMIT).trim();
    const needs = reviews.RESPONSES[response].needs;
    if (needs && !text) throw Object.assign(fail(400, needs), { field: 'text' });
    if (needs && reviews.EMPTY_WORDS.test(text.replace(/[.!]+$/, '').trim())) throw Object.assign(fail(400, reviews.SAYS_NOTHING[response]), { field: 'text' });
    const lines = response === 'conditions' ? conditionLines(text) : [];
    if (lines.length > CONDITIONS_LIMIT) throw Object.assign(fail(400, `Write up to ${CONDITIONS_LIMIT} conditions, one to a line.`), { field: 'text' });
    const weak = lines.find((line) => reviews.EMPTY_WORDS.test(line.replace(/[.!]+$/, '').trim()));
    if (weak) throw Object.assign(fail(400, `"${weak}" is not a condition. Write each condition in full, one to a line, or take it out.`), { field: 'text' });
    needName(req);
    const found = await submissionFor(req, req.params.id);
    const { row, sub, project, org } = found;
    const later = await laterOf(row);
    if (later) throw fail(409, `${row.company_name || sub.name} has submitted ${later.channel === 'sitewrite' ? `revision ${later.revision}` : 'another SWMS for this'} since, so this one cannot be given a response. Open the latest from the project screen.`);
    let kept = null;
    if (row.channel === 'sitewrite') {
      kept = await keptOf(row);
      if (!kept) throw fail(404, `${row.company_name || 'The business'} has deleted this SWMS, so it cannot be given a response.`);
    }
    // A business cannot approve its own SWMS: someone signed in to it cannot review it.
    const companyId = row.company_id || sub.company_id;
    if (companyId && await db.one('SELECT id FROM users WHERE email = $1 AND company_id = $2', [req.reviewer.email, companyId])) {
      throw fail(403, 'This email belongs to the business that prepared the SWMS, so it cannot review it. The main contractor reviews it.');
    }
    // The same response sent again (a double press, or Back and send again) is kept once and emailed once.
    const recent = await db.one('SELECT * FROM swms_reviews WHERE submission_id = $1 AND reviewer_id = $2 ORDER BY created_at DESC LIMIT 1', [row.id, req.reviewer.id]);
    if (recent && recent.response === response && recent.text === text && Date.now() - new Date(recent.created_at).getTime() < reviews.REPEAT_MINUTES * 60 * 1000) {
      // Whether the business was emailed the first time, so the page says so again (messy round 8: a 502,
      // then Send pressed again).
      const mailed = await db.one("SELECT COUNT(*) AS n FROM mail_messages WHERE subcontract_id = $1 AND template = 'review_back' AND created_at >= $2", [sub.id, recent.created_at]);
      res.json({ review: reviewOut(recent, project.state, await db.query('SELECT * FROM review_conditions WHERE review_id = $1 ORDER BY position', [recent.id])), repeated: true, emailed: Number((mailed && mailed.n) || 0) > 0, company: row.company_name || sub.name });
      return;
    }
    const check = kept ? reviews.checkRevision(kept.kept) : json(row.builder_check, null);
    const now = new Date();
    const id = auth.newId();
    const name = personName(req.reviewer);
    await db.query(
      `INSERT INTO swms_reviews (id, swms_id, revision, ref, reviewer_id, reviewer_email, reviewer_name, reviewer_company, response, text, check_score, check_band, created_at, project_id, submission_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [id, row.swms_id || '', Number(row.revision || 0), row.ref || '', req.reviewer.id, req.reviewer.email, name, org.name, response, text, check && Number.isFinite(Number(check.score)) ? Number(check.score) : null, (check && check.band) || '', now, project.id, row.id],
    );
    let position = 0;
    for (const line of lines) {
      await db.query("INSERT INTO review_conditions (id, review_id, submission_id, subcontract_id, required_swms_id, position, text, status) VALUES ($1, $2, $3, $4, $5, $6, $7, 'outstanding')",
        [auth.newId(), id, row.id, sub.id, row.required_swms_id, position, line.slice(0, 600)]);
      position += 1;
    }
    record('review_response', null);
    const saved = await db.one('SELECT * FROM swms_reviews WHERE id = $1', [id]);
    const review = reviewOut(saved, project.state, await db.query('SELECT * FROM review_conditions WHERE review_id = $1 ORDER BY position', [id]));
    if (kept && learningEnabled()) {
      const company = await db.one('SELECT * FROM companies WHERE id = $1', [kept.swms.company_id]);
      const users = await db.query('SELECT name, email FROM users WHERE company_id = $1', [kept.swms.company_id]).catch(() => []);
      await recordReviewResponse({ id, response, text, checkScore: check.score, checkBand: check.band, checkFailed: check.hardFails },
        { draft: kept.kept.draft, input: kept.kept.input, company, swmsId: kept.swms.id, revision: row.revision, now, account: { users, reviewerName: name, reviewerCompany: org.name, reviewerEmail: req.reviewer.email } }).catch(() => {});
    }
    const emailed = await tellCompany(req, found, { name, company: org.name });
    const what = row.channel === 'sitewrite' ? `${row.title} (revision ${row.revision})` : `${row.title} (${row.file_name}, received outside SiteWrite)`;
    const company = row.company_name || sub.name;
    await send.logEntry({
      projectId: project.id, subId: sub.id, itemId: row.required_swms_id, kind: 'review_sent', actorKind: 'org', actorName: name,
      summary: `${name} returned "${review.label}" on ${what} for ${sub.name}${lines.length ? `, with ${lines.length === 1 ? 'one condition' : `${lines.length} conditions`}` : ''}.${emailed ? ` ${company} was emailed that its review is back.` : ''}`,
      refs: { submission: row.id, review: id },
    });
    res.status(201).json({ review, emailed: emailed > 0, company });
  }));

  // The lead confirms a condition the company marked done. Where the company is not on SiteWrite (a SWMS
  // received outside it), the lead closes it directly.
  hseRouter.post('/hse/conditions/:conditionId/confirm', route(async (req, res) => {
    const { row, ctx, title } = await conditionForLead(req);
    needName(req);
    // Pressed again (after a 502): it is confirmed once.
    if (row.status === 'closed') { res.json({ message: 'Confirmed done.', condition: conditionView(row, ctx.project.state) }); return; }
    if (row.status === 'outstanding' && ctx.sub.company_id) throw fail(409, `${ctx.sub.claimed_name || ctx.sub.name} has not marked this condition done yet. Confirm it once they have.`);
    const who = personName(req.reviewer);
    await db.query("UPDATE review_conditions SET status = 'closed', closed_by_name = $1, closed_at = $2 WHERE id = $3 AND status <> 'closed'", [who, new Date(), row.id]);
    await send.logEntry({ projectId: ctx.project.id, subId: ctx.sub.id, itemId: row.required_swms_id, kind: 'condition_confirmed', actorKind: 'org', actorName: who, summary: `${who} confirmed a condition on ${title} for ${ctx.sub.name} is done: "${quoted(row.text)}".`, refs: { condition: row.id } });
    res.json({ message: 'Confirmed done.', condition: conditionView(await db.one('SELECT * FROM review_conditions WHERE id = $1', [row.id]), ctx.project.state) });
  }));

  // The lead sends a condition marked done back: it is not done yet, and why.
  hseRouter.post('/hse/conditions/:conditionId/back', route(async (req, res) => {
    const { row, ctx, title } = await conditionForLead(req);
    needName(req);
    if (row.status !== 'done') throw fail(409, row.status === 'closed' ? 'This condition is already confirmed. Reload the page.' : 'This condition is not marked done, so there is nothing to send back.');
    const note = oneLine(req.body && req.body.note, NOTE_LIMIT);
    if (!note || reviews.EMPTY_WORDS.test(note.replace(/[.!]+$/, ''))) throw Object.assign(fail(400, 'Say what is still needed, so the subcontractor knows what to do.'), { field: 'note' });
    const who = personName(req.reviewer);
    await db.query("UPDATE review_conditions SET status = 'outstanding', back_note = $1, back_by_name = $2, back_at = $3 WHERE id = $4 AND status = 'done'", [note, who, new Date(), row.id]);
    await send.logEntry({ projectId: ctx.project.id, subId: ctx.sub.id, itemId: row.required_swms_id, kind: 'condition_back', actorKind: 'org', actorName: who, summary: `${who} said a condition on ${title} for ${ctx.sub.name} is not done yet: "${quoted(row.text)}". Still needed: "${quoted(note)}".`, refs: { condition: row.id } });
    res.json({ message: 'Sent back as not done yet.', condition: conditionView(await db.one('SELECT * FROM review_conditions WHERE id = $1', [row.id]), ctx.project.state) });
  }));

  // "Record a SWMS received outside SiteWrite": a PDF or Word file for a SWMS on the list. The note says
  // how it came, for the record (optional).
  hseRouter.post('/hse/subcontracts/:subId/items/:itemId/outside', send.readUpload, route(async (req, res) => {
    const ctx = await subcontractFor(req, req.params.subId);
    needName(req);
    if (!designFiles.enabled()) throw fail(503, 'Recording a file is not switched on yet.');
    const item = await db.one('SELECT * FROM required_swms WHERE id = $1 AND subcontract_id = $2 AND removed_at IS NULL', [String(req.params.itemId || ''), ctx.sub.id]);
    if (!item) throw fail(404, 'That SWMS is no longer on the list. Reload the page.');
    const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const type = send.checkUpload(data);
    const header = (name) => { try { return decodeURIComponent(String(req.get(name) || '')); } catch { return ''; } };
    const name = send.uploadName(header('X-File-Name'), type);
    // As typed, with each sentence's capital (messy round 8, wording 13: "emailed by pademelon 16 oct").
    const note = require('./sitelink-answers').capitalSentences(oneLine(header('X-Note'), NOTE_LIMIT));
    const id = await recordOutside(req, ctx, item, { data, type, name, note });
    res.status(201).json({ id, message: `${name} is recorded as received for ${titleOf(item)}. Review it from the project screen or below.`, page: await deps.subcontractPage(ctx) });
  }));

  // A file the subcontractor uploaded on the list page (stage 5), recorded as received.
  hseRouter.post('/hse/subcontracts/:subId/uploads/:uploadId/record', route(async (req, res) => {
    const ctx = await subcontractFor(req, req.params.subId);
    needName(req);
    const upload = await db.one('SELECT * FROM list_uploads WHERE id = $1 AND subcontract_id = $2 AND removed_at IS NULL', [String(req.params.uploadId || ''), ctx.sub.id]);
    if (!upload) throw fail(404, 'That file was not found. Reload the page.');
    const item = await db.one('SELECT * FROM required_swms WHERE id = $1 AND subcontract_id = $2 AND removed_at IS NULL', [upload.required_swms_id, ctx.sub.id]);
    if (!item) throw fail(404, 'That SWMS is no longer on the list. Reload the page.');
    if (await db.one("SELECT id FROM submissions WHERE subcontract_id = $1 AND channel = 'outside' AND file_sha256 = $2 AND required_swms_id = $3", [ctx.sub.id, upload.sha256, item.id])) {
      throw fail(409, `${upload.name} is already recorded for ${titleOf(item)}.`);
    }
    const data = await send.getUploadData(upload);
    if (!data) throw fail(404, 'That file was not found.');
    const id = await recordOutside(req, ctx, item, { data, type: upload.content_type, name: upload.name, note: '', from: 'uploaded on the list page' });
    res.status(201).json({ id, message: `${upload.name} is recorded as received for ${titleOf(item)}.`, page: await deps.subcontractPage(ctx) });
  }));
}

// Everything stage 7 keeps for a subcontract, for the staging hook that removes a test account.
async function removeForSubcontract(subId) {
  for (const row of await submissionsOf(subId)) {
    if (row.file_storage === 'bucket') await designFiles.bucketRequest('DELETE', objectKey(row.id)).catch(() => {});
    await db.query('DELETE FROM submission_file_data WHERE submission_id = $1', [row.id]);
    await db.query('DELETE FROM swms_reviews WHERE submission_id = $1', [row.id]);
  }
  await db.query('DELETE FROM review_conditions WHERE subcontract_id = $1', [subId]);
  await db.query('DELETE FROM submissions WHERE subcontract_id = $1', [subId]);
}

module.exports = { router, install, summaryFor, forSubcontractPage, forCompany, companySummary, removeForSubcontract, submittedMail, overridesFor, conditionLines };
