// Signed-in features: the company profile and team, sites, saved SWMS with
// Word and PDF downloads, worker sign-on by QR code, and review reminders.
const express = require('express');
const QRCode = require('qrcode');
const db = require('./db');
const JSZip = require('jszip');
const { recordIndustry } = require('./industry');
const auth = require('./auth');
const { sendMail } = require('./mailer');
const { draftBody, textField } = require('./input');
const { prepareDraft } = require('./draft');
const { draftToDocx, draftedNote } = require('./docx-draft');
const { draftToPdf } = require('./pdf-draft');
const { readLogo } = require('./logo');
const { record } = require('./events');
const signRead = require('./sign-read');
const aiScope = require('./ai-scope');

const REVIEW_MONTHS = 3;
const REMIND_DAYS_BEFORE = 7;
const MAX_SIGNATURE = 80 * 1024;

const router = express.Router();
const { fail, requireUser, requireAccess } = auth;

// Express 5 passes a rejected promise on to the error handler.
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function longDate(date) {
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Brisbane' }).format(new Date(date));
}

function reviewer(body) {
  const name = textField(body.reviewedBy, 120).replace(/\s+/g, ' ');
  if (body.reviewConfirmed !== true || !name) throw fail(400, 'Confirm that your business will review and approve this SWMS, and enter your name.');
  return name;
}

function companyView(company) {
  return {
    name: company.name, abn: company.abn, address: company.address, phone: company.phone, email: company.email, logo: company.logo,
    planStatus: company.plan_status, trialEndsAt: company.trial_ends_at, hasAccess: auth.hasAccess(company),
  };
}

// The company's saved details always go on its SWMS.
// A signed-in company's SWMS always carry its own saved details, so an account
// cannot be used to make SWMS for another business.
function withCompany(input, company) {
  return {
    ...input,
    company: company.name || '',
    companyAbn: company.abn || '',
    companyAddress: company.address || '',
    companyPhone: company.phone || '',
    companyEmail: company.email || '',
  };
}

// ---- Signing in ----

router.post('/auth/email', route(async (req, res) => {
  const email = auth.cleanEmail(req.body && req.body.email);
  if (!email) throw fail(400, 'Enter a valid email address.');
  await auth.sendLoginLink(req, email);
  res.json({ ok: true, message: `A sign-in link has been sent to ${email}. It expires in 20 minutes.` });
}));

router.post('/auth/verify', route(async (req, res) => {
  const token = await auth.finishLogin(String((req.body && req.body.token) || ''), req);
  res.json({ token });
}));

router.post('/auth/logout', route(async (req, res) => {
  if (req.sessionHash) await db.query('DELETE FROM sessions WHERE token_hash = $1', [req.sessionHash]);
  res.json({ ok: true });
}));

router.post('/auth/passkey/register/options', requireUser, route(async (req, res) => res.json(await auth.passkeyRegistrationOptions(req))));
router.post('/auth/passkey/register', requireUser, route(async (req, res) => {
  await auth.passkeyRegister(req);
  res.json({ ok: true });
}));
router.post('/auth/passkey/login/options', route(async (req, res) => res.json(await auth.passkeyLoginOptions(req))));
router.post('/auth/passkey/login', route(async (req, res) => res.json({ token: await auth.passkeyLogin(req) })));

router.get('/me', requireUser, route(async (req, res) => {
  await db.query('UPDATE users SET last_seen_at = $1 WHERE id = $2', [new Date(), req.user.id]);
  const keys = await db.query('SELECT id FROM passkeys WHERE user_id = $1', [req.user.id]);
  res.json({ user: { email: req.user.email, name: req.user.name, hasPasskey: keys.length > 0, isAdmin: Boolean(req.user.is_admin) }, company: companyView(req.company) });
}));

router.put('/me', requireUser, route(async (req, res) => {
  await db.query('UPDATE users SET name = $1 WHERE id = $2', [textField(req.body && req.body.name, 120), req.user.id]);
  res.json({ ok: true });
}));

// ---- Company and team ----

router.get('/company', requireUser, (req, res) => res.json({ company: companyView(req.company) }));

// An ABN is valid when its check digits work: take 1 from the first digit, weight the
// digits 10, 1, 3, 5 ... 19, and the total divides by 89 (Australian Business Register).
function validAbn(value) {
  const digits = String(value || '').replace(/\s/g, '');
  if (!/^\d{11}$/.test(digits)) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const total = [...digits].reduce((sum, digit, index) => sum + (Number(digit) - (index === 0 ? 1 : 0)) * weights[index], 0);
  return total % 89 === 0;
}

router.put('/company', requireUser, route(async (req, res) => {
  const body = req.body || {};
  // Once a SWMS has been saved or downloaded, the company name and ABN are fixed.
  const name = textField(body.name, 200);
  const abn = textField(body.abn, 40);
  if (!name) throw fail(400, 'Enter your business name.');
  if (!validAbn(abn)) throw fail(400, 'Enter your business\'s 11 digit ABN. The one entered is not a valid ABN.');
  const changed = (req.company.name && name !== req.company.name) || (req.company.abn && abn.replace(/\s/g, '') !== req.company.abn.replace(/\s/g, ''));
  if (changed) {
    const used = await db.one("SELECT COUNT(*) AS n FROM events WHERE company_id = $1 AND type IN ('download_pdf', 'download_word', 'swms_saved')", [req.company.id]);
    if (used && Number(used.n) > 0) throw fail(403, 'Your company name and ABN are fixed once a SWMS has been saved or downloaded, because they are printed on every SWMS. Contact support to change them.');
  }
  // A logo that is not a readable PNG or JPEG is refused with a plain message, not kept.
  if (body.logo && !readLogo(body.logo)) throw fail(400, 'The logo could not be read. Use a PNG or JPEG image under 400 KB.');
  const logo = body.logo === '' ? '' : (readLogo(body.logo) ? body.logo : req.company.logo);
  await db.query('UPDATE companies SET name = $1, abn = $2, address = $3, phone = $4, email = $5, logo = $6 WHERE id = $7', [
    textField(body.name, 200), textField(body.abn, 40), textField(body.address, 300), textField(body.phone, 60), textField(body.email, 200), logo, req.company.id,
  ]);
  // One free trial per ABN: a business whose ABN has already had a trial goes straight to subscribing.
  const digits = abn.replace(/\s/g, '');
  // The insert decides who holds the ABN, so two accounts saving the same ABN at the same
  // moment cannot both keep a trial.
  await db.query('INSERT INTO trial_abns (abn, company_id, created_at) VALUES ($1, $2, $3) ON CONFLICT (abn) DO NOTHING', [digits, req.company.id, new Date()]);
  const holder = await db.one('SELECT company_id FROM trial_abns WHERE abn = $1', [digits]);
  let notice = '';
  if (holder && holder.company_id !== req.company.id && req.company.plan_status === 'trial' && new Date(req.company.trial_ends_at) > new Date()) {
    await db.query('UPDATE companies SET trial_ends_at = $1 WHERE id = $2', [new Date(), req.company.id]);
    notice = 'This ABN has already had its free trial, so this account has no trial. Subscribe to download, save and share SWMS.';
  }
  const company = await db.one('SELECT * FROM companies WHERE id = $1', [req.company.id]);
  res.json({ company: companyView(company), ...(notice ? { notice } : {}) });
}));

// Only the company's administrator adds and removes people.
function requireAdmin(req, res, next) {
  if (!req.user.is_admin) return next(fail(403, 'Only your company\'s administrator can add or remove people.'));
  return next();
}

router.get('/company/users', requireUser, route(async (req, res) => {
  const users = await db.query('SELECT email, name, is_admin, created_at, last_seen_at FROM users WHERE company_id = $1 ORDER BY created_at', [req.company.id]);
  res.json({ users });
}));

router.delete('/company/users/:email', requireUser, requireAdmin, route(async (req, res) => {
  const email = auth.cleanEmail(req.params.email);
  const user = email && await db.one('SELECT id, is_admin FROM users WHERE email = $1 AND company_id = $2', [email, req.company.id]);
  if (!user) throw fail(404, 'That person is not in your company.');
  if (user.is_admin) throw fail(400, 'The administrator cannot be removed.');
  await db.query('DELETE FROM sessions WHERE user_id = $1', [user.id]);
  await db.query('DELETE FROM passkeys WHERE user_id = $1', [user.id]);
  await db.query('DELETE FROM users WHERE id = $1', [user.id]);
  await db.query('DELETE FROM login_tokens WHERE email = $1', [email]);
  res.json({ ok: true, message: `${email} has been removed from your company.` });
}));

router.post('/company/users', requireUser, requireAdmin, route(async (req, res) => {
  const email = auth.cleanEmail(req.body && req.body.email);
  if (!email) throw fail(400, 'Enter a valid email address.');
  const existing = await db.one('SELECT company_id FROM users WHERE email = $1', [email]);
  if (existing && existing.company_id !== req.company.id) throw fail(409, 'That email already belongs to another company on SiteReady.');
  await auth.sendLoginLink(req, email, req.company.id, req.company.name || req.user.email);
  res.json({ ok: true, message: `An invitation has been sent to ${email}.` });
}));

// ---- Sites ----

const SITE_FIELDS = ['workplace', 'principalContractor', 'siteManager', 'scaffoldSupervisor', 'hospital', 'firstAider', 'musterPoint', 'worksManager', 'worksManagerPhone', 'complianceResponsible', 'reviewer'];

function siteDetails(body) {
  const details = {};
  for (const key of SITE_FIELDS) details[key] = textField(body && body[key], 500);
  return details;
}

function siteView(row) {
  return { id: row.id, name: row.name, ...row.details, createdAt: row.created_at, updatedAt: row.updated_at };
}

async function ownSite(req, id) {
  const site = id ? await db.one('SELECT * FROM sites WHERE id = $1 AND company_id = $2 AND archived = FALSE', [String(id), req.company.id]) : null;
  if (id && !site) throw fail(404, 'That site was not found.');
  return site;
}

router.get('/sites', requireUser, route(async (req, res) => {
  const rows = await db.query('SELECT * FROM sites WHERE company_id = $1 AND archived = FALSE ORDER BY name', [req.company.id]);
  res.json({ sites: rows.map(siteView) });
}));

router.post('/sites', requireUser, route(async (req, res) => {
  const name = textField(req.body && req.body.name, 200);
  if (!name) throw fail(400, 'Give the site a name.');
  const id = auth.newId();
  const now = new Date();
  await db.query('INSERT INTO sites (id, company_id, name, details, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)', [id, req.company.id, name, JSON.stringify(siteDetails(req.body)), now]);
  res.status(201).json({ site: siteView(await db.one('SELECT * FROM sites WHERE id = $1', [id])) });
}));

router.put('/sites/:id', requireUser, route(async (req, res) => {
  const site = await ownSite(req, req.params.id);
  const name = textField(req.body && req.body.name, 200) || site.name;
  await db.query('UPDATE sites SET name = $1, details = $2, updated_at = $3 WHERE id = $4', [name, JSON.stringify(siteDetails(req.body)), new Date(), site.id]);
  res.json({ site: siteView(await db.one('SELECT * FROM sites WHERE id = $1', [site.id])) });
}));

router.delete('/sites/:id', requireUser, route(async (req, res) => {
  const site = await ownSite(req, req.params.id);
  await db.query('UPDATE sites SET archived = TRUE, updated_at = $1 WHERE id = $2', [new Date(), site.id]);
  res.json({ ok: true });
}));

// ---- Saved SWMS ----

function cleanInput(input) {
  const body = draftBody(input && typeof input === 'object' ? input : {});
  delete body.logo;
  return body;
}

function swmsView(row, extra = {}) {
  const now = new Date();
  return {
    id: row.id, title: row.title, siteId: row.site_id, reviewedBy: row.reviewed_by,
    createdAt: row.created_at, updatedAt: row.updated_at, lastReviewedAt: row.last_reviewed_at, reviewDueAt: row.review_due_at,
    reviewDue: new Date(row.review_due_at) <= now,
    signonPath: `/sign.html?t=${row.signon_token}`,
    ...extra,
  };
}

async function ownSwms(req, id) {
  const row = await db.one('SELECT * FROM swms WHERE id = $1 AND company_id = $2 AND archived = FALSE', [String(id), req.company.id]);
  if (!row) throw fail(404, 'That SWMS was not found.');
  return row;
}

// A title from the task: its first sentence, cut at a word if it is long.
function titleFor(body, input) {
  const given = textField(body.title, 200);
  if (given) return given;
  const sentence = textField(input.task, 5000).split(/(?<=[.!?])\s/)[0].replace(/[.,;:]+$/, '');
  if (sentence.length <= 100) return sentence || 'Untitled SWMS';
  return `${sentence.slice(0, 100).replace(/[\s,;:]+\S*$/, '')}…`;
}

// Every saved SWMS in one zip of Word files, with their sign-ons: the business's export.
// Open to any signed-in user, so data can be taken out even after a subscription ends.
router.get('/swms/export.zip', requireUser, route(async (req, res) => {
  const rows = await db.query('SELECT * FROM swms WHERE company_id = $1 AND archived = FALSE ORDER BY created_at', [req.company.id]);
  if (!rows.length) throw fail(404, 'There are no saved SWMS to export.');
  const zip = new JSZip();
  const used = new Set();
  for (const row of rows) {
    const parts = await documentParts(req, row);
    const buffer = await draftToDocx(parts.draft, parts);
    let name = fileName(row, 'docx');
    for (let n = 2; used.has(name); n += 1) name = fileName(row, 'docx').replace(/\.docx$/, ` ${n}.docx`);
    used.add(name);
    zip.file(name, Buffer.from(buffer));
  }
  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="SiteReady-saved-SWMS.zip"');
  res.send(out);
}));

router.get('/swms', requireUser, route(async (req, res) => {
  const rows = await db.query('SELECT * FROM swms WHERE company_id = $1 AND archived = FALSE ORDER BY updated_at DESC', [req.company.id]);
  const counts = await db.query('SELECT swms_id, COUNT(*) AS n FROM signons WHERE swms_id IN (SELECT id FROM swms WHERE company_id = $1) GROUP BY swms_id', [req.company.id]);
  const signed = Object.fromEntries(counts.map((item) => [item.swms_id, Number(item.n)]));
  res.json({ swms: rows.map((row) => swmsView(row, { task: row.input.task, signons: signed[row.id] || 0 })) });
}));

router.post('/swms', requireAccess, route(async (req, res) => {
  // Saving, like downloading, needs the business name and ABN, which are printed on every SWMS.
  if (!String(req.company.name || '').trim() || !String(req.company.abn || '').trim()) throw fail(400, 'Add your business name and ABN under Company details before saving. They are printed on every SWMS.');
  const body = req.body || {};
  const name = reviewer(body);
  const input = cleanInput(body.input);
  const draft = prepareDraft(withCompany(input, req.company));
  if (draft.kind !== 'draft') throw fail(400, draft.kind === 'stand-down' ? 'This SWMS is stood down until the missing facts are added, so it cannot be saved yet.' : (draft.message || 'This SWMS could not be prepared.'));
  const site = await ownSite(req, body.siteId);
  const id = auth.newId();
  const now = new Date();
  await db.query(
    `INSERT INTO swms (id, company_id, site_id, title, input, reviewed_by, created_by, signon_token, created_at, updated_at, last_reviewed_at, review_due_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $9, $10)`,
    [id, req.company.id, site ? site.id : null, titleFor(body, input), JSON.stringify(input), name, req.user.id, auth.newToken(), now, addMonths(now, REVIEW_MONTHS)],
  );
  record('swms_saved', req.company.id);
  await recordIndustry(draft, input, req.company).catch(() => {});
  res.status(201).json({ swms: swmsView(await db.one('SELECT * FROM swms WHERE id = $1', [id])) });
}));

router.get('/swms/:id', requireUser, route(async (req, res) => {
  const row = await ownSwms(req, req.params.id);
  const signons = (await db.query('SELECT worker_name, worker_company, signed_at, language, read_seconds, sections_viewed, sections_total, check_attempts, explained_by FROM signons WHERE swms_id = $1 ORDER BY signed_at', [row.id]))
    .map(({ worker_name, worker_company, signed_at, ...item }) => ({ worker_name, worker_company, signed_at, reading: signRead.readingNote(item) }));
  res.json({ swms: swmsView(row), input: row.input, draft: prepareDraft(withCompany(row.input, req.company)), signons });
}));

// Saving changes is a review: it restarts the review period.
router.put('/swms/:id', requireAccess, route(async (req, res) => {
  const row = await ownSwms(req, req.params.id);
  const body = req.body || {};
  const name = reviewer(body);
  const input = body.input ? cleanInput(body.input) : row.input;
  const draft = prepareDraft(withCompany(input, req.company));
  if (draft.kind !== 'draft') throw fail(400, 'This SWMS is stood down until the missing facts are added, so the changes cannot be saved yet.');
  const site = body.siteId === undefined ? { id: row.site_id } : await ownSite(req, body.siteId);
  const now = new Date();
  await db.query('UPDATE swms SET title = $1, input = $2, site_id = $3, reviewed_by = $4, updated_at = $5, last_reviewed_at = $5, review_due_at = $6, reminder_sent_at = NULL WHERE id = $7',
    [titleFor({ title: body.title || row.title }, input), JSON.stringify(input), site ? site.id : null, name, now, addMonths(now, REVIEW_MONTHS), row.id]);
  res.json({ swms: swmsView(await db.one('SELECT * FROM swms WHERE id = $1', [row.id])) });
}));

router.post('/swms/:id/reviewed', requireAccess, route(async (req, res) => {
  const row = await ownSwms(req, req.params.id);
  const name = reviewer(req.body || {});
  const now = new Date();
  await db.query('UPDATE swms SET reviewed_by = $1, last_reviewed_at = $2, review_due_at = $3, reminder_sent_at = NULL, updated_at = $2 WHERE id = $4', [name, now, addMonths(now, REVIEW_MONTHS), row.id]);
  res.json({ swms: swmsView(await db.one('SELECT * FROM swms WHERE id = $1', [row.id])) });
}));

// A copy is a new SWMS for the next job, with its own sign-on sheet.
router.post('/swms/:id/copy', requireAccess, route(async (req, res) => {
  const row = await ownSwms(req, req.params.id);
  const body = req.body || {};
  const name = reviewer(body);
  const site = body.siteId === undefined ? { id: row.site_id } : await ownSite(req, body.siteId);
  const id = auth.newId();
  const now = new Date();
  await db.query(
    `INSERT INTO swms (id, company_id, site_id, title, input, reviewed_by, created_by, signon_token, created_at, updated_at, last_reviewed_at, review_due_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $9, $10)`,
    [id, req.company.id, site ? site.id : null, textField(body.title, 200) || `Copy of ${row.title}`.slice(0, 200), JSON.stringify(row.input), name, req.user.id, auth.newToken(), now, addMonths(now, REVIEW_MONTHS)],
  );
  res.status(201).json({ swms: swmsView(await db.one('SELECT * FROM swms WHERE id = $1', [id])) });
}));

router.delete('/swms/:id', requireUser, route(async (req, res) => {
  const row = await ownSwms(req, req.params.id);
  await db.query('UPDATE swms SET archived = TRUE, updated_at = $1 WHERE id = $2', [new Date(), row.id]);
  res.json({ ok: true });
}));

async function documentParts(req, row) {
  const draft = prepareDraft(withCompany(row.input, req.company));
  const signons = (await db.query('SELECT * FROM signons WHERE swms_id = $1 ORDER BY signed_at', [row.id]))
    .map((item) => ({ ...item, signedDate: longDate(item.signed_at), readingNote: signRead.readingNote(item) }));
  const confirmation = { name: row.reviewed_by, date: longDate(row.last_reviewed_at) };
  return { draft, signons, confirmation, logo: readLogo(req.company.logo) };
}

function fileName(row, extension) {
  const base = row.title.replace(/[^A-Za-z0-9 -]+/g, '').trim().replace(/\s+/g, ' ').slice(0, 60) || 'SWMS';
  return `${base}.${extension}`;
}

router.get('/swms/:id/docx', requireAccess, route(async (req, res) => {
  const row = await ownSwms(req, req.params.id);
  const parts = await documentParts(req, row);
  const buffer = await draftToDocx(parts.draft, parts);
  record('download_word', req.company.id);
  await recordIndustry(parts.draft, typeof row.input === 'string' ? JSON.parse(row.input) : row.input, req.company).catch(() => {});
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName(row, 'docx')}"`);
  res.send(Buffer.from(buffer));
}));

router.get('/swms/:id/pdf', requireAccess, route(async (req, res) => {
  const row = await ownSwms(req, req.params.id);
  const parts = await documentParts(req, row);
  const buffer = await draftToPdf(parts.draft, { ...parts, note: draftedNote(parts.confirmation) });
  record('download_pdf', req.company.id);
  await recordIndustry(parts.draft, typeof row.input === 'string' ? JSON.parse(row.input) : row.input, req.company).catch(() => {});
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName(row, 'pdf')}"`);
  res.send(buffer);
}));

router.get('/swms/:id/qr.svg', requireUser, route(async (req, res) => {
  const row = await ownSwms(req, req.params.id);
  const svg = await QRCode.toString(`${auth.appUrl(req)}/sign.html?t=${row.signon_token}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(svg);
}));

// ---- Worker sign-on (no account needed: the QR code carries the key) ----

// Sign-ons one SWMS can take. A large crew over a long job stays well under it.
const SIGNON_LIMIT = 500;

async function swmsForToken(token) {
  const row = await db.one('SELECT * FROM swms WHERE signon_token = $1 AND archived = FALSE', [String(token || '')]);
  if (!row) throw fail(404, 'This sign-on link is not valid any more. Ask your supervisor for the current QR code.');
  const company = await db.one('SELECT * FROM companies WHERE id = $1', [row.company_id]);
  return { row, company };
}

// The worker reads every section open, in order. The page gets a read id whose start time is
// kept here, the sections with their minimum reading times, and the check questions without
// their answers. Only ticked PPE is sent, so the decoys are not marked as unticked.
router.get('/sign/:token', route(async (req, res) => {
  const { row, company } = await swmsForToken(req.params.token);
  const draft = prepareDraft(withCompany(row.input, company));
  const readId = await signRead.startRead(row, draft);
  res.json({
    title: row.title, company: company.name, task: draft.task, workplace: draft.workplace,
    highRisk: draft.highRisk || [], jobSteps: draft.jobSteps || [], ppe: signRead.tickedPpe(draft),
    readId, sections: signRead.readSections(draft), questions: signRead.publicQuestions(signRead.checkQuestions(row.id, readId, draft)),
    languages: aiScope.enabled() ? signRead.LANGUAGES.map(({ code, label, rtl }) => ({ code, label, rtl: Boolean(rtl) })) : [],
  });
}));

router.get('/sign/:token/translation', route(async (req, res) => {
  const { row, company } = await swmsForToken(req.params.token);
  const draft = prepareDraft(withCompany(row.input, company));
  res.json(await signRead.translation(row, draft, req.query.lang, req.query.read));
}));

router.post('/sign/:token', route(async (req, res) => {
  const { row, company } = await swmsForToken(req.params.token);
  const body = req.body || {};
  const name = textField(body.name, 120).replace(/\s+/g, ' ');
  const signature = String(body.signature || '');
  if (!name) throw fail(400, 'Enter your name.');
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature) || signature.length > MAX_SIGNATURE) throw fail(400, 'Sign in the box before submitting.');
  if (body.confirmed !== true) throw fail(400, 'Tick the box to confirm the SWMS has been explained to you.');
  const draft = prepareDraft(withCompany(row.input, company));
  // A worker who cannot read the SWMS has it explained by their supervisor: no reading time or questions.
  const explainedBy = body.explained === true ? textField(body.supervisor, 120).replace(/\s+/g, ' ') : '';
  if (body.explained === true && !explainedBy) throw fail(400, 'Enter the name of the supervisor who explained the SWMS to you.');
  let reading = null;
  if (!explainedBy) {
    const { read, elapsed, sections } = await signRead.checkRead(row, draft, body.readId);
    const questions = signRead.checkQuestions(row.id, read.id, draft);
    let attempts = null;
    if (questions.length) {
      const marked = await signRead.markAnswers(read, questions, body.answers);
      if (marked.wrong.length) {
        res.status(400).json({ kind: 'error', message: signRead.wrongMessage(questions, marked.wrong), wrong: marked.wrong.map((item) => item.id), sections: [...new Set(marked.wrong.map((item) => item.section))] });
        return;
      }
      ({ attempts } = marked);
    }
    const seconds = signRead.sectionSeconds(sections, body.reading && body.reading.sections);
    const language = signRead.languageFor(body.language) ? body.language : 'en';
    reading = {
      read, language, readSeconds: Math.round(elapsed), sectionSeconds: seconds, attempts,
      viewed: sections.filter((item) => seconds[item.id] >= item.minSeconds).length, total: sections.length,
    };
  }
  // A cap on sign-ons per SWMS stops a leaked QR code being used to flood it.
  const limit = Number(process.env.SIGNON_LIMIT) > 0 ? Number(process.env.SIGNON_LIMIT) : SIGNON_LIMIT;
  const signed = await db.one('SELECT COUNT(*) AS n FROM signons WHERE swms_id = $1', [row.id]);
  if (Number(signed.n) >= limit) throw fail(409, `This SWMS has reached its limit of ${limit} sign-ons. Ask your supervisor to save a new copy of the SWMS and share its QR code.`);
  if (reading) await signRead.useRead(reading.read);
  await db.query(
    `INSERT INTO signons (id, swms_id, worker_name, worker_company, signature, signed_at, language, read_seconds, sections_viewed, sections_total, section_seconds, check_attempts, explained_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [auth.newId(), row.id, name, textField(body.company, 200), signature, new Date(),
      reading ? reading.language : '', reading ? reading.readSeconds : null, reading ? reading.viewed : null, reading ? reading.total : null,
      reading ? JSON.stringify(reading.sectionSeconds) : null, reading ? reading.attempts : null, explainedBy],
  );
  record('worker_signon', row.company_id);
  res.status(201).json({ ok: true, message: `Thanks ${name}. You are signed on to ${row.title}.` });
}));

// ---- Review reminders ----

// Sends each company one email listing its SWMS due for review within a week.
// A SWMS is not listed again until its next review period.
async function sendReviewReminders(now = new Date()) {
  if (!db.enabled()) return 0;
  const soon = new Date(now.getTime() + REMIND_DAYS_BEFORE * 24 * 60 * 60 * 1000);
  const due = await db.query('SELECT * FROM swms WHERE archived = FALSE AND review_due_at <= $1 AND reminder_sent_at IS NULL ORDER BY review_due_at', [soon]);
  const byCompany = new Map();
  for (const row of due) byCompany.set(row.company_id, [...(byCompany.get(row.company_id) || []), row]);
  for (const [companyId, rows] of byCompany) {
    const users = await db.query('SELECT email FROM users WHERE company_id = $1', [companyId]);
    const lines = rows.map((row) => `- ${row.title}: review ${new Date(row.review_due_at) <= now ? 'overdue since' : 'due'} ${longDate(row.review_due_at)}`);
    for (const user of users) {
      await sendMail({
        to: user.email,
        subject: `SiteReady: ${rows.length} SWMS due for review`,
        text: `These SWMS are due for their ${REVIEW_MONTHS} monthly review:\n\n${lines.join('\n')}\n\nOpen SiteReady, check each one against the site, and mark it reviewed.`,
      });
    }
    for (const row of rows) await db.query('UPDATE swms SET reminder_sent_at = $1 WHERE id = $2', [now, row.id]);
  }
  return due.length;
}

// Expired sign-in links, sessions and Face ID challenges are removed.
async function removeExpired(now = new Date()) {
  if (!db.enabled()) return;
  await db.query('DELETE FROM login_tokens WHERE expires_at < $1', [now]);
  await db.query('DELETE FROM sessions WHERE expires_at < $1', [now]);
  await db.query('DELETE FROM challenges WHERE expires_at < $1', [now]);
  // A deleted SWMS is hidden at once and removed, with its sign-ons, after 30 days.
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  await db.query('DELETE FROM signons WHERE swms_id IN (SELECT id FROM swms WHERE archived = TRUE AND updated_at < $1)', [cutoff]);
  await db.query('DELETE FROM sign_translations WHERE swms_id IN (SELECT id FROM swms WHERE archived = TRUE AND updated_at < $1)', [cutoff]);
  await db.query('DELETE FROM swms WHERE archived = TRUE AND updated_at < $1', [cutoff]);
  // A read session is only needed while the worker is signing on.
  await db.query('DELETE FROM sign_reads WHERE started_at < $1', [new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)]);
  await db.query('DELETE FROM signins WHERE created_at < $1', [new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)]);
}

module.exports = { validAbn, router, sendReviewReminders, removeExpired, withCompany, REVIEW_MONTHS };
