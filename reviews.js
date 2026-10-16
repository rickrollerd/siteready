// The principal contractor's review (goal 3). The reviewer opens a saved SWMS from the SiteWrite
// reference printed on it, proves an email address with a sign-in link, sees the revision exactly
// as it was saved (read only), runs the builder check on it, and returns one of three set
// responses. The response is recorded against that revision with the reviewer's name, company and
// the date; the business sees it under My SWMS and is emailed that its review is back (D283). A
// later revision starts unreviewed.
//
// The reviewer never sees who signed on or how anyone read the SWMS: sign-on and reading records
// are never read here, and the draft's worker rows are taken out of what is sent.
const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const auth = require('./auth');
const revisions = require('./revisions');
const { findRef, REF_PATTERN } = require('./refs');
const { checkSwms, fromDraft } = require('./builder-check');
const { sendMail } = require('./mailer');
const { record } = require('./events');
const { textField } = require('./input');
const { recordReviewResponse, enabled: learningEnabled } = require('./control-learning');
const designs = require('./designs');
const substances = require('./substances');
const { stepPpeRows } = require('./step-ppe');
const designFiles = require('./design-files');
const { checkedRows, preparedFromCheck } = require('./human-check');

const router = express.Router();
const { fail } = auth;
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// The responses a reviewer can return. Conditions, or the changes needed, are required where asked for.
const RESPONSES = {
  approved: { label: 'Approved', needs: '' },
  conditions: { label: 'Approved with conditions', needs: 'Write the conditions of the approval.' },
  changes: { label: 'Not approved', needs: 'Write the changes needed.' },
};
// Words that say nothing, typed in a hurry: "none", "TBC", "n/a", a dash.
const EMPTY_WORDS = /^(?:none|nil|nothing|no|n\/?a|na|tbc|tba|tbd|ok|okay|yes|see above|as discussed|-+|\.+|x+)$/i;
const SAYS_NOTHING = {
  conditions: 'Write the conditions of the approval. If there are none, choose Approved.',
  changes: 'Write the changes needed, so the business knows what to fix.',
};
const TEXT_LIMIT = 2000;
// The same response sent twice in this time (a double press, or Back and send again) is kept once.
const REPEAT_MINUTES = 10;

function longDate(date) {
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Brisbane' }).format(new Date(date));
}

// A reference as typed or pasted: "sw abcd 2345", "SWABCD2345" or "SiteWrite reference SW-ABCD-2345,
// revision 2" all read as SW-ABCD-2345. An old SR- reference (SiteReady, before D295) reads the same way.
function cleanRef(value) {
  const text = String(value || '').toUpperCase();
  const found = /S([RW])[\s-]*([2-9A-HJ-NP-Z]{4})[\s-]*([2-9A-HJ-NP-Z]{4})(?![A-Z0-9])/.exec(text);
  return found ? `S${found[1]}-${found[2]}-${found[3]}` : text.trim();
}

// The review page for a reference, printed on the SWMS and shown to the business to send on.
const reviewLink = (base, ref) => (base && ref ? `${base}/review.html?ref=${encodeURIComponent(ref)}` : '');

// Kept before anything is shown, so a look that cannot be logged is not shown.
async function logReview(req, action, ref) {
  await db.query('INSERT INTO review_access_log (id, reviewer_email, action, ref, created_at) VALUES ($1, $2, $3, $4, $5)',
    [crypto.randomUUID(), req.reviewer.email, action, String(ref || '').slice(0, 40), new Date()]);
}

// The saved revision a reference was printed on, with its SWMS and business. Throws when the
// reference is not one a reviewer can open.
async function revisionForRef(value) {
  const ref = cleanRef(value);
  if (!REF_PATTERN.test(ref)) throw fail(400, 'A SiteWrite reference looks like SW-ABCD-2345 (or SR-ABCD-2345 on older SWMS). Check the footer of the SWMS.');
  const found = await findRef(ref);
  if (!found) throw fail(404, 'This reference is not in SiteWrite\'s records. Check each letter and number against the footer of the SWMS.');
  if (!found.swms_id || !found.revision) throw fail(404, 'This SWMS was not saved in SiteWrite, so it cannot be reviewed here. Ask the business for a saved copy.');
  const swms = await db.one('SELECT * FROM swms WHERE id = $1', [found.swms_id]);
  const kept = swms && await revisions.getRevision(swms.id, found.revision);
  if (!swms || swms.archived || !kept) throw fail(404, 'The business that prepared this SWMS has deleted it.');
  const company = await db.one('SELECT * FROM companies WHERE id = $1', [swms.company_id]);
  const current = Number(swms.revision || 1) === Number(found.revision);
  return { ref, swms, company, kept, current };
}

// What the reviewer sees: the revision as printed, without the worker rows, the business's own
// notes on what it changed from SiteWrite's wording, or the page's working lists (the choices offered
// for its own hazards, the emergency questions and the plant SiteWrite guessed), none of which print.
function forReviewer(draft) {
  const { controlEdits, controlLegal, controlWarn, workers, ownHazards, emergencyQuestions, plantInferred, ...rest } = draft || {};
  return { ...rest, workers: [] };
}

// The tables the Word file and the PDF print from the draft, made by the same code, so the page
// reads as the printed SWMS: the designs and methodologies, each hazardous product from its safety
// data sheet, and the extra PPE for particular steps. Each row that has a file attached names it.
function printedTables(draft) {
  const fileOf = (file) => (file && file.id ? { id: file.id, name: file.name || 'file' } : null);
  const designRows = draft.designs || [];
  const products = substances.printed(draft);
  return {
    designs: designRows.length ? {
      title: designs.tableTitle(draft), note: designs.tableNote(draft), head: designs.tableHead(draft), rows: designs.tableRows(draft), files: designRows.map((row) => fileOf(row.file)),
    } : null,
    substances: products.length ? {
      title: substances.TABLE_TITLE, note: substances.TABLE_NOTE, head: substances.TABLE_HEAD, rows: substances.tableRows(draft), files: products.map((row) => fileOf(row.file)),
    } : null,
    stepPpe: stepPpeRows(draft.ppe).map((item) => ({ label: item.label, steps: item.steps })),
  };
}

// The files a revision names that the business still holds and kept with that revision.
async function revisionFiles(swms, kept) {
  const ids = [...new Set([...designs.fileIds(kept.input || {}), ...substances.fileIds(kept.input || {})])];
  if (!ids.length) return new Set();
  const uses = await db.query('SELECT file_id FROM design_file_uses WHERE swms_id = $1 AND revision = $2', [swms.id, kept.revision]);
  const used = new Set(uses.map((row) => row.file_id));
  return new Set(ids.filter((id) => used.has(id)));
}

// The builder check on the kept revision, read as a builder reads the printed SWMS. No upload and
// no AI: the kept draft is already in the checker's form.
function checkRevision(kept) {
  const state = kept.input && kept.input.state;
  return checkSwms(fromDraft(kept.draft, { state }), { state, stage: 'review' });
}

function reviewView(row, { withEmail = false } = {}) {
  return {
    revision: Number(row.revision),
    ref: row.ref,
    response: row.response,
    label: (RESPONSES[row.response] || {}).label || row.response,
    text: row.text,
    name: row.reviewer_name,
    company: row.reviewer_company,
    ...(withEmail ? { email: row.reviewer_email } : {}),
    date: longDate(row.created_at),
    at: row.created_at,
  };
}

// Every response returned on a SWMS, newest first. The business sees each reviewer's email.
// A response from a SiteLink project (a submitted SWMS) says so, with each condition and how far it has
// got, so My SWMS says to submit it again there, not to send a new reference (messy round 8, wording 7).
const CONDITION_STATUS = { outstanding: 'To do', done: 'Marked done', closed: 'Confirmed done' };
async function reviewsFor(swmsId, { withEmail = false } = {}) {
  const rows = await db.query('SELECT * FROM swms_reviews WHERE swms_id = $1 ORDER BY created_at DESC', [String(swmsId)]);
  const out = [];
  for (const row of rows) {
    const view = reviewView(row, { withEmail });
    if (row.submission_id) {
      const conditions = await db.query('SELECT text, status FROM review_conditions WHERE review_id = $1 ORDER BY position', [row.id]).catch(() => []);
      Object.assign(view, { sitelink: true, conditions: conditions.map((one) => ({ text: one.text, status: CONDITION_STATUS[one.status] || one.status, done: one.status === 'closed' })) });
    }
    out.push(view);
  }
  return out;
}

// The response that stands on one revision: the latest returned.
async function latestReview(swmsId, revision) {
  const rows = await db.query('SELECT * FROM swms_reviews WHERE swms_id = $1 AND revision = $2 ORDER BY created_at DESC LIMIT 1', [String(swmsId), Number(revision)]);
  return rows[0] ? reviewView(rows[0]) : null;
}

// The latest response on each SWMS's current revision, for the business's list, in one query.
async function currentReviews(companyId, rows) {
  const out = {};
  if (!rows.length) return out;
  const revisionOf = new Map(rows.map((row) => [row.id, Number(row.revision || 1)]));
  const all = await db.query('SELECT * FROM swms_reviews WHERE swms_id IN (SELECT id FROM swms WHERE company_id = $1 AND archived = FALSE) ORDER BY created_at DESC', [companyId]);
  for (const row of all) {
    if (out[row.swms_id] || revisionOf.get(row.swms_id) !== Number(row.revision)) continue;
    const view = reviewView(row);
    out[row.swms_id] = { response: view.response, label: view.label, date: view.date, revision: view.revision };
  }
  return out;
}

// The business's people are told the review is back, and by whom (D283, D290 item 1). Nothing else is
// in the email: the response, any conditions and "Fix this in SiteWrite" are on the SWMS in SiteWrite.
// A failed email never loses the response.
const REVIEW_BACK = 'Your SWMS review is back';
function reviewBackMail(review) {
  return { subject: REVIEW_BACK, text: `${REVIEW_BACK}.\n\nFrom ${review.name}, ${review.company}.` };
}

async function tellBusiness(swms, review) {
  const users = await db.query('SELECT email FROM users WHERE company_id = $1', [swms.company_id]);
  const mail = reviewBackMail(review);
  for (const user of users) {
    try {
      await sendMail({ to: user.email, ...mail });
    } catch (error) {
      console.error('Review response email could not be sent:', error.message);
    }
  }
}

// ---- Signing in as a reviewer ----

router.post('/review/email', route(async (req, res) => {
  const body = req.body || {};
  const email = auth.cleanEmail(body.email);
  if (!email) throw fail(400, 'Enter a valid email address.');
  const { ref } = await revisionForRef(body.ref);
  await auth.sendReviewerLink(req, email, ref);
  res.json({ ok: true, message: `A sign-in link has been sent to ${email}. It expires in 20 minutes.` });
}));

router.post('/review/verify', route(async (req, res) => {
  const token = await auth.finishReviewerLogin(String((req.body && req.body.token) || ''));
  res.json({ token });
}));

router.use('/review', auth.readReviewer);

router.post('/review/logout', route(async (req, res) => {
  if (req.reviewerSessionHash) await db.query('DELETE FROM reviewer_sessions WHERE token_hash = $1', [req.reviewerSessionHash]);
  res.json({ ok: true });
}));

router.get('/review/me', auth.requireReviewer, route(async (req, res) => {
  await db.query('UPDATE reviewers SET last_seen_at = $1 WHERE id = $2', [new Date(), req.reviewer.id]);
  res.json({ reviewer: { email: req.reviewer.email, name: req.reviewer.name, company: req.reviewer.company } });
}));

// ---- Reviewing a SWMS ----

// The revision a reference was printed on, as it was saved, read only.
router.get('/review/swms/:ref', auth.requireReviewer, route(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { ref, swms, company, kept, current } = await revisionForRef(req.params.ref);
  await logReview(req, 'view', ref);
  record('review_view', swms.company_id);
  const responses = (await reviewsFor(swms.id)).filter((item) => item.revision === kept.revision);
  const held = await revisionFiles(swms, kept);
  const tables = printedTables(kept.draft);
  // A file the business no longer holds is not offered.
  for (const table of [tables.designs, tables.substances].filter(Boolean)) table.files = table.files.map((file) => (file && held.has(file.id) ? file : null));
  res.json({
    ref, business: company ? company.name : '', title: swms.title, revision: kept.revision, savedAt: longDate(kept.createdAt),
    current, latestRevision: Number(swms.revision || 1), draft: forReviewer(kept.draft), tables, responses,
    // Who checked the revision part by part before it was saved (D286), as it prints.
    checked: checkedRows(kept.confirmation),
    // "Prepared by" as the Word file and the PDF print it: the name given, or the checker's name and role
    // (messy round 5: the page said "Left blank" while the file printed a name).
    prepared: preparedFromCheck(kept.draft, kept.confirmation),
  });
}));

// A design or safety data sheet file the revision names, for the reviewer to open.
router.get('/review/swms/:ref/files/:fileId', auth.requireReviewer, route(async (req, res) => {
  const { ref, swms, kept } = await revisionForRef(req.params.ref);
  const id = String(req.params.fileId || '');
  if (!(await revisionFiles(swms, kept)).has(id)) throw fail(404, 'That file was not found.');
  const file = await designFiles.fileForSwms(swms.company_id, swms.id, id);
  if (!file) throw fail(404, 'That file was not found.');
  await logReview(req, 'file', ref);
  designFiles.sendFile(res, file);
}));

router.post('/review/swms/:ref/check', auth.requireReviewer, route(async (req, res) => {
  const { ref, swms, kept } = await revisionForRef(req.params.ref);
  await logReview(req, 'check', ref);
  record('review_check', swms.company_id);
  res.json({ ...checkRevision(kept), source: 'saved revision' });
}));

router.post('/review/swms/:ref/response', auth.requireReviewer, route(async (req, res) => {
  const body = req.body || {};
  const response = Object.hasOwn(RESPONSES, body.response) ? body.response : '';
  if (!response) throw fail(400, 'Choose a response: Approved, Approved with conditions or Not approved.');
  const text = textField(body.text, TEXT_LIMIT).trim();
  if (RESPONSES[response].needs && !text) throw Object.assign(fail(400, RESPONSES[response].needs), { field: 'text' });
  if (RESPONSES[response].needs && EMPTY_WORDS.test(text.replace(/[.!]+$/, '').trim())) throw Object.assign(fail(400, SAYS_NOTHING[response]), { field: 'text' });
  const name = textField(body.name, 120).replace(/\s+/g, ' ').trim();
  const reviewerCompany = textField(body.company, 200).replace(/\s+/g, ' ').trim();
  if (!name || !reviewerCompany) throw Object.assign(fail(400, !name && !reviewerCompany ? 'Enter your name and your company.' : !name ? 'Enter your name.' : 'Enter your company.'), { field: !name ? 'name' : 'company' });
  const { ref, swms, company, kept, current } = await revisionForRef(req.params.ref);
  if (!current) throw fail(409, `This is revision ${kept.revision}. The business has saved revision ${swms.revision} since, so this one cannot be given a response. Ask the business for the current revision and its reference.`);
  // A business cannot approve its own SWMS: someone signed in to it cannot review it.
  const own = await db.one('SELECT id FROM users WHERE email = $1 AND company_id = $2', [req.reviewer.email, swms.company_id]);
  if (own) throw fail(403, 'This email belongs to the business that prepared the SWMS, so it cannot review it. The principal contractor reviews it.');
  // The same response sent again (a double press, or Back and send again) is kept once and emailed once.
  const recent = await db.one('SELECT * FROM swms_reviews WHERE swms_id = $1 AND revision = $2 AND reviewer_id = $3 ORDER BY created_at DESC LIMIT 1', [swms.id, kept.revision, req.reviewer.id]);
  if (recent && recent.response === response && recent.text === text && Date.now() - new Date(recent.created_at).getTime() < REPEAT_MINUTES * 60 * 1000) {
    res.json({ review: reviewView(recent), repeated: true });
    return;
  }
  await logReview(req, 'response', ref);
  const check = checkRevision(kept);
  const now = new Date();
  const id = auth.newId();
  await db.query(
    `INSERT INTO swms_reviews (id, swms_id, revision, ref, reviewer_id, reviewer_email, reviewer_name, reviewer_company, response, text, check_score, check_band, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [id, swms.id, kept.revision, ref, req.reviewer.id, req.reviewer.email, name, reviewerCompany, response, text, check.score, check.band, now],
  );
  // Kept so the form is filled in next time.
  await db.query('UPDATE reviewers SET name = $1, company = $2, last_seen_at = $3 WHERE id = $4', [name, reviewerCompany, now, req.reviewer.id]);
  record('review_response', swms.company_id);
  const row = await db.one('SELECT * FROM swms_reviews WHERE id = $1', [id]);
  const review = reviewView(row);
  if (learningEnabled()) {
    const users = await db.query('SELECT name, email FROM users WHERE company_id = $1', [swms.company_id]).catch(() => []);
    await recordReviewResponse({ id, response, text, checkScore: check.score, checkBand: check.band, checkFailed: check.hardFails },
      { draft: kept.draft, input: kept.input, company, swmsId: swms.id, revision: kept.revision, now, account: { users, reviewerName: name, reviewerCompany, reviewerEmail: req.reviewer.email } }).catch(() => {});
  }
  await tellBusiness(swms, review);
  res.status(201).json({ review });
}));

module.exports = {
  router, RESPONSES, REVIEW_BACK, EMPTY_WORDS, SAYS_NOTHING, TEXT_LIMIT, REPEAT_MINUTES, cleanRef, revisionForRef, forReviewer, printedTables, revisionFiles, checkRevision, reviewsFor, latestReview, currentReviews, reviewLink, reviewBackMail, reviewView,
};
