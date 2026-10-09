const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const path = require('path');
const cluster = require('cluster');
const os = require('os');
const { listStates, findState } = require('./legislation');
const { questionsFor, prepareDraft, legalSource, keepWarning } = require('./draft');
const { stepLibrary, searchSteps } = require('./steps');
const { draftToDocx, draftedNote, preparedFor } = require('./docx-draft');
const { issueRef, placeOf } = require('./refs');
const { readLogo } = require('./logo');
const { draftToPdf } = require('./pdf-draft');
const db = require('./db');
const auth = require('./auth');
const accounts = require('./accounts');
const libraryNotices = require('./library-notices');
const billing = require('./billing');
const admin = require('./admin');
const { record, recordError } = require('./events');
const { TRADES, answersFor } = require('./presets');
const { localText } = require('./citations');
const { scopeText } = require('./scope-text');
const { tasksFromScope } = require('./scope');
const aiScope = require('./ai-scope');
const { reportToDocx } = require('./scope-report');
const places = require('./places');
const { recordIndustry } = require('./industry');
const draftTranslate = require('./draft-translate');
const { keyProblems } = require('./secret-keys');
const { downloadGaps, gateMessage } = require('./download-gate');
const { hasBlank, blankKey } = require('./blanks');
const delivery = require('./delivery');

require('dotenv').config();

// The native app loads the page from its own origin and calls this server.
const NATIVE_ORIGINS = ['capacitor://localhost', 'https://localhost'];

function allowedOrigins() {
  const extra = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return [...NATIVE_ORIGINS, ...extra];
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

const app = express();
// Railway and similar hosts sit behind one proxy, which adds the client address.
// Set TRUST_PROXY to the number of proxies in front of the server (0 for none),
// or a client could fake its address and get round the rate limit.
const trustProxy = Number(process.env.TRUST_PROXY ?? 1);
app.set('trust proxy', Number.isInteger(trustProxy) && trustProxy >= 0 ? trustProxy : 1);
app.use(helmet());
// The native app reads the file name, and the saved SWMS and revision a download was saved as.
app.use(cors({ origin: allowedOrigins(), exposedHeaders: ['Content-Disposition', 'X-SiteReady-Swms', 'X-SiteReady-Revision', 'X-SiteReady-Title', 'X-SiteReady-Saved'] }));
// Answers are compressed, and not kept by the browser unless a route says so (delivery.js).
app.use('/api', delivery.apiResponses);
// Stripe's webhook is checked against the raw body, so it comes before the JSON reader.
app.post('/api/billing/webhook', ...billing.webhook);

// The Word file and the company profile can carry the logo, so those routes accept a larger body.
const WORD_ROUTE = '/api/draft.docx';
const LARGE_BODY = new Set([WORD_ROUTE, '/api/draft.pdf', '/api/company']);
// A scope of works can be a Word file or PDF with drawings in it.
const SCOPE_ROUTE = '/api/scope';
const smallJson = express.json({ limit: '100kb' });
const wordJson = express.json({ limit: '1mb' });
const scopeJson = express.json({ limit: '15mb' });
const projectJson = express.json({ limit: '5mb' });
app.use((req, res, next) => ([SCOPE_ROUTE, '/api/scope/ai', '/api/check'].includes(req.path) ? scopeJson : req.path === '/api/project.zip' ? projectJson : LARGE_BODY.has(req.path) ? wordJson : smallJson)(req, res, next));
// The page's text files are sent compressed and kept by the phone until they change (goal 7).
app.use(delivery.staticFiles(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public'), delivery.staticOptions));

// Limits are per client address. Phones on mobile data and a site office on one
// connection often share an address, so the limits are set for a busy site, not
// one person. Each server process keeps its own count.
const windowMs = positiveNumber(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
const limiter = (limit, skip) => rateLimit({
  windowMs,
  limit,
  skip,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { kind: 'error', message: 'Too many requests. Try again in a few minutes.' },
});
// The Word file takes most of the work, so it has its own, lower limit.
app.use(WORD_ROUTE, limiter(positiveNumber(process.env.RATE_LIMIT_WORD_REQUESTS, 300)));
// Sign-in emails and worker sign-ons have tighter limits.
app.use(['/api/auth/email', '/api/company/users'], limiter(positiveNumber(process.env.RATE_LIMIT_EMAIL_REQUESTS, 10)));
app.use('/api/sign', limiter(positiveNumber(process.env.RATE_LIMIT_SIGN_REQUESTS, 200)));
// Each SWMS is translated once per language and then kept, so few requests reach the AI;
// this lower limit stops one phone asking for every language over and over.
app.use(/^\/api\/sign\/[^/]+\/translation/, limiter(positiveNumber(process.env.RATE_LIMIT_TRANSLATE_REQUESTS, 30)));
app.use('/api/draft/translation', limiter(positiveNumber(process.env.RATE_LIMIT_TRANSLATE_REQUESTS, 30)));
app.use('/api', limiter(
  positiveNumber(process.env.RATE_LIMIT_MAX_REQUESTS, 600),
  (req) => req.originalUrl.startsWith(WORD_ROUTE),
));
// Sessions are read after the limits, so a refused request never reaches the database.
app.use(auth.readSession);

const { draftBody } = require('./input');

// Job address suggestions. Each one is a paid Google request, so it has its own limit.
app.use('/api/address', limiter(positiveNumber(process.env.RATE_LIMIT_ADDRESS_REQUESTS, 300)));
app.use('/api/nearby-care', limiter(positiveNumber(process.env.RATE_LIMIT_ADDRESS_REQUESTS, 300) / 10));
app.get('/api/nearby-care', async (req, res, next) => {
  try {
    res.json(await places.nearbyCare(req.query.address));
  } catch (error) {
    next(error);
  }
});
app.get('/api/address', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await places.suggest(req.query.q));
  } catch (error) {
    next(error);
  }
});

// Anyone holding a SWMS can check its SiteReady reference: whether it is genuine, the business
// it was prepared for, its title and revision, and whether that revision is still the current one
// (owner decision, 6 October 2026). Nothing else is shown: no controls, no ABN, no dates.
app.use('/api/verify', limiter(positiveNumber(process.env.RATE_LIMIT_ADDRESS_REQUESTS, 300) / 10));
app.get('/api/verify/:ref', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    const ref = String(req.params.ref || '').trim().toUpperCase();
    if (!/^SR-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(ref)) return res.status(400).json({ found: false, message: 'A SiteReady reference looks like SR-ABCD-2345. Check the footer of the SWMS.' });
    const found = await require('./refs').findRef(ref).catch(() => null);
    record('verify_ref', null);
    if (!found) return res.json({ found: false, message: 'This reference is not in SiteReady\'s records. The SWMS was not prepared with SiteReady under this reference, or the reference was changed.' });
    // A reference printed on a saved SWMS names its revision; one from before revisions were
    // recorded, or on a stood-down draft, has none.
    let revision = null;
    let current = null;
    if (found.swms_id) {
      const swms = await db.one('SELECT revision, archived FROM swms WHERE id = $1', [found.swms_id]).catch(() => null);
      revision = Number(found.revision) || null;
      current = Boolean(swms && !swms.archived && Number(swms.revision || 1) === revision);
    }
    res.json({ found: true, ref: found.ref, business: found.company_name, title: found.title, revision, current });
  } catch (error) {
    next(error);
  }
});

app.use('/api/abn', limiter(positiveNumber(process.env.RATE_LIMIT_ADDRESS_REQUESTS, 300) / 10));
app.get('/api/abn', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await require('./abn').lookupAbn(req.query.abn));
  } catch (error) {
    next(error);
  }
});

// The states, the pick lists and the job step library change only when SiteReady is updated,
// so a phone keeps them for an hour instead of asking again on every visit.
app.get('/api/states', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ states: listStates() });
});

app.get('/api/presets', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ trades: TRADES });
});

// Job steps whose name, hazards or controls match the words searched.
app.get('/api/steps/search', (req, res) => {
  res.json({ ids: searchSteps(String(req.query.q || '').slice(0, 80)) });
});

// The job step library for the step picker.
app.get('/api/steps', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(stepLibrary());
});

app.post('/api/draft/questions', (req, res) => {
  const result = questionsFor(draftBody(req.body || {}));
  if (result.kind === 'refused' || result.kind === 'error') return res.status(400).json(result);
  // Standard answers the user can pick, then change.
  // Outside Queensland the answers use the state's wording.
  const local = (list) => list.map((answer) => ({ ...answer, text: localText(answer.text, result.state.id) })).filter((answer) => answer.text);
  // The pressure test answers follow the task: the gas line test only where gas is named.
  result.required = (result.required || []).map((item) => (item.choices ? item : { ...item, suggestions: local(answersFor(item.id, result.task)) }));
  res.json(result);
});

// Reading a scope takes more work than a draft, so it has a lower limit.
app.use('/api/project.zip', limiter(positiveNumber(process.env.RATE_LIMIT_WORD_REQUESTS, 300) / 10));
const scopeLimit = limiter(positiveNumber(process.env.RATE_LIMIT_SCOPE_REQUESTS, 60));
// The quick read has its own limit; the AI reading's routes (under /api/scope/ai) have theirs.
app.use(SCOPE_ROUTE, (req, res, next) => (req.path.startsWith('/ai') ? next() : scopeLimit(req, res, next)));
app.post(SCOPE_ROUTE, async (req, res, next) => {
  try {
    const text = await scopeText(req.body || {});
    record('scope', req.company && req.company.id);
    // The state picked on the form sets which work is high risk and how it is named.
    const state = req.body && findState(req.body.state);
    res.json(tasksFromScope(text, state ? state.id : 'qld'));
  } catch (error) {
    next(error);
  }
});

// The AI reading of a scope. It takes a few minutes, so it is started here and the page
// asks for it by its id. Signed-in accounts only; the quick read above stays for everyone.
// Only starting a reading counts against this limit; the page asking whether it is ready does not.
const aiScopeLimit = limiter(positiveNumber(process.env.RATE_LIMIT_AI_SCOPE_REQUESTS, 20));
app.use('/api/scope/ai', (req, res, next) => (req.method === 'POST' ? aiScopeLimit(req, res, next) : next()));
app.get('/api/scope/ai', (req, res) => res.json({ enabled: aiScope.enabled() }));
app.post('/api/scope/ai', auth.requireAccess, async (req, res, next) => {
  try {
    const text = await scopeText(req.body || {});
    const started = await aiScope.startReading(req.company, text, req.body && req.body.state);
    record(started.kept ? 'ai_scope_kept' : 'ai_scope', req.company && req.company.id);
    const { done, ...out } = started;
    res.status(started.status === 'reading' ? 202 : 200).json(out);
  } catch (error) {
    next(error);
  }
});
app.get('/api/scope/ai/:id', auth.requireUser, async (req, res, next) => {
  try {
    // The state picked on the form names the high risk construction work in each package.
    res.json(await aiScope.getReading(req.company, req.params.id, req.query.state));
  } catch (error) {
    next(error);
  }
});
// The scope review report (Word) of a finished reading: the company's own readings only.
app.get('/api/scope/ai/:id/report.docx', auth.requireUser, async (req, res, next) => {
  try {
    const reading = await aiScope.getReading(req.company, req.params.id, req.query.state);
    if (reading.status !== 'done' || !reading.reading) return res.status(409).json({ kind: 'error', message: 'The AI reading is not finished yet. Try again when it is.' });
    const buffer = await reportToDocx(reading.reading, { company: req.company, checks: reading.checks, state: findState(reading.state) });
    record('scope_report', req.company && req.company.id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="Scope-review-report.docx"');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

// The builder SWMS check (task #106): score a subcontractor's SWMS and draft the email back.
// Signed-in accounts only, with its own limit, as an uploaded SWMS is read by the AI.
app.use('/api/check', limiter(positiveNumber(process.env.RATE_LIMIT_CHECK_REQUESTS, 30)));
app.post('/api/check', auth.requireUser, async (req, res, next) => {
  try {
    const result = await require('./check-read').runCheck(req.body || {}, req.company);
    record('builder_check', req.company && req.company.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post('/api/draft', (req, res) => {
  const result = prepareDraft(draftBody(req.body || {}));
  if (result.kind === 'refused' || result.kind === 'error') return res.status(400).json(result);
  record(req.user ? 'preview_signed_in' : 'preview', req.company && req.company.id);
  // For the preview only: the source of each control line that is a legal requirement, and why
  // removing or weakening a line is not recommended, so the page can warn before the user goes
  // ahead. Empty for other lines.
  // What must still be answered before it can be downloaded (goal 2), shown beside each item.
  const legal = result.kind === 'draft' ? {
    controlLegal: (result.jobSteps || []).map((step) => step.controls.map(legalSource)),
    controlWarn: (result.jobSteps || []).map((step) => step.controls.map(keepWarning)),
    gate: downloadGaps(draftBody(req.body || {}), result),
    // The line each blank (____) is filled in by, for the boxes on the page.
    blankKeys: {
      steps: (result.jobSteps || []).map((step) => step.controls.map((line) => (hasBlank(line) ? blankKey(line) : ''))),
      controls: (result.controls || []).map((item) => (hasBlank(item.text) ? blankKey(item.text) : '')),
    },
  } : {};
  res.json({ ...result, ...legal });
});

// The draft translated for the contractor to read (task #94). Signed-in users only. The
// English applies; nothing translated goes into the SWMS or its files.
app.get('/api/draft/translation', (_req, res) => {
  res.json({ enabled: draftTranslate.enabled(), languages: draftTranslate.languages() });
});
app.post('/api/draft/translation', auth.requireUser, async (req, res, next) => {
  try {
    const body = req.body || {};
    const result = prepareDraft(draftBody(body.input && typeof body.input === 'object' ? body.input : {}));
    res.json(await draftTranslate.translateDraft(result, body.language));
    record('draft_translation', req.company && req.company.id);
  } catch (error) {
    next(error);
  }
});

// A Word file is only prepared once the user confirms the business will review
// and approve it, and gives the name that goes on it.
function reviewConfirmation(body) {
  const name = typeof body.reviewedBy === 'string' ? body.reviewedBy.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  if (body.reviewConfirmed !== true || !name) return null;
  const date = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Brisbane' }).format(new Date());
  return { name, date };
}

// Without an account a SWMS can be previewed on screen. Downloads need an
// account with an active trial or subscription, and use the company's saved
// details and logo. With accounts on, a download saves the SWMS first (owner decision,
// 6 October 2026), so every print has a record, a revision and a reference tied to them.
function signedInBody(req) {
  const body = req.body || {};
  return req.company ? accounts.withCompany(draftBody(body), req.company) : draftBody(body);
}

// Goal 2: no download until the site questions are answered and no blank is left (download-gate.js).
// The refusal lists what is still needed, for the page to show beside each item.
function gateRefusal(input, result) {
  const gaps = result.kind === 'draft' ? downloadGaps(input, result) : [];
  return gaps.length ? { kind: 'error', message: gateMessage(gaps), gate: gaps } : null;
}

// Downloads print the company's own name and ABN, so they must be saved first.
function needsCompanyDetails(req) {
  return req.company && (!String(req.company.name || '').trim() || !String(req.company.abn || '').trim());
}
const COMPANY_DETAILS_MESSAGE = 'Add your company name and ABN under Company profile before downloading. They are printed on every SWMS.';

app.post('/api/draft.pdf', auth.requireAccess, async (req, res, next) => {
  if (needsCompanyDetails(req)) return res.status(400).json({ kind: 'error', message: COMPANY_DETAILS_MESSAGE });
  try {
    const confirmation = reviewConfirmation(req.body || {});
    if (!confirmation) return res.status(400).json({ kind: 'error', message: 'Confirm that your business will review and approve this SWMS, and enter your name, before downloading.' });
    const result = prepareDraft(signedInBody(req));
    if (result.kind === 'refused' || result.kind === 'error') return res.status(400).json(result);
    // The site answers (goal 2) and the tick for parts with no job steps (D184), named together.
    const refusal = gateRefusal(signedInBody(req), result);
    if (refusal) return res.status(400).json(refusal);
    const saved = req.company ? await accounts.saveForDownload(req, req.body || {}) : null;
    if (saved) {
      await recordIndustry(saved.kept.draft, saved.kept.input, req.company).catch(() => {});
      return await accounts.sendDocument(req, res, saved.row, 'pdf');
    }
    const ref = await issueRef(req.company, result.task, placeOf(signedInBody(req)));
    const buffer = await draftToPdf(result, { logo: readLogo(req.company ? req.company.logo : (req.body && req.body.logo)), note: draftedNote(confirmation), prepared: preparedFor(req.company, ref) });
    record('download_pdf', req.company && req.company.id);
    await recordIndustry(result, signedInBody(req), req.company).catch(() => {});
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.kind === 'stand-down' ? 'SiteReady-stood-down.pdf' : 'SiteReady.pdf'}"`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

app.post('/api/draft.docx', auth.requireAccess, async (req, res) => {
  if (needsCompanyDetails(req)) return res.status(400).json({ kind: 'error', message: COMPANY_DETAILS_MESSAGE });
  const confirmation = reviewConfirmation(req.body || {});
  if (!confirmation) {
    return res.status(400).json({ kind: 'error', message: 'Confirm that your business will review and approve this SWMS, and enter your name, before downloading.' });
  }
  const result = prepareDraft(signedInBody(req));
  if (result.kind === 'refused' || result.kind === 'error') return res.status(400).json(result);
  // The site answers (goal 2) and the tick for parts with no job steps (D184), named together.
  const refusal = gateRefusal(signedInBody(req), result);
  if (refusal) return res.status(400).json(refusal);
  const saved = req.company ? await accounts.saveForDownload(req, req.body || {}) : null;
  if (saved) {
    await recordIndustry(saved.kept.draft, saved.kept.input, req.company).catch(() => {});
    return accounts.sendDocument(req, res, saved.row, 'docx');
  }
  // A stood-down draft cannot be saved; without accounts nothing is saved.
  const ref = await issueRef(req.company, result.task, placeOf(signedInBody(req)));
  const buffer = await draftToDocx(result, { logo: readLogo(req.company ? req.company.logo : (req.body && req.body.logo)), confirmation, ref, company: req.company });
  record('download_word', req.company && req.company.id);
  await recordIndustry(result, signedInBody(req), req.company).catch(() => {});
  const filename = result.kind === 'stand-down' ? 'SiteReady-stood-down.docx' : 'SiteReady.docx';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
});

// Every SWMS for a project in one zip of Word files. One review confirmation covers the set.
// With accounts on, each SWMS is saved as a record when the project is downloaded (owner
// decision, 6 October 2026): an item already saved (its swmsId) is saved as its next revision
// when it has changed. The X-SiteReady-Saved header lists each item's saved SWMS and revision.
const JSZip = require('jszip');
const PROJECT_LIMIT = 40;
app.post('/api/project.zip', auth.requireAccess, async (req, res) => {
  if (needsCompanyDetails(req)) return res.status(400).json({ kind: 'error', message: COMPANY_DETAILS_MESSAGE });
  const body = req.body || {};
  const confirmation = reviewConfirmation(body);
  if (!confirmation) return res.status(400).json({ kind: 'error', message: 'Confirm that your business will review and approve these SWMS, and enter your name, before downloading.' });
  const items = Array.isArray(body.swms) ? body.swms.slice(0, PROJECT_LIMIT) : [];
  if (!items.length) return res.status(400).json({ kind: 'error', message: 'There are no SWMS in this project yet.' });
  const zip = new JSZip();
  const used = new Set();
  const skipped = [];
  // A SWMS with parts SiteReady has no job steps for, not ticked as dealt with, is left out (D184).
  const unticked = [];
  const logo = readLogo(req.company ? req.company.logo : body.logo);
  const savedItems = [];
  // SWMS with site questions unanswered or blanks left are not in the zip (goal 2).
  const gated = [];
  for (const [index, item] of items.entries()) {
    const result = prepareDraft(signedInBody({ ...req, body: item || {} }));
    if (result.kind !== 'draft') { skipped.push(`${index + 1}. ${String((item && item.task) || '').slice(0, 80)}`); continue; }
    // The site answers and blanks (goal 2) and the D184 tick: a SWMS missing site answers is listed
    // with all it needs; one missing only the tick is listed with its parts with no job steps.
    const gaps = downloadGaps(signedInBody({ ...req, body: item || {} }), result);
    const named = String((item && (item.swmsTitle || item.task)) || result.task || '').slice(0, 80);
    if (gaps.some((gap) => gap.kind !== 'cover')) { gated.push(`${index + 1}. ${named}: still to answer: ${[...new Set(gaps.map((gap) => gap.label))].join('; ')}`); continue; }
    if (gaps.length) { unticked.push(`${index + 1}. ${named}: ${result.notCovered.join('; ')}`); continue; }
    let buffer;
    const saved = req.company ? await accounts.saveForDownload(req, { ...item, siteId: body.siteId, reviewConfirmed: true, reviewedBy: confirmation.name }, { title: item && typeof item.swmsTitle === 'string' ? item.swmsTitle : '' }) : null;
    if (saved) {
      savedItems.push({ index, id: saved.row.id, revision: saved.row.revision || 1 });
      const parts = await accounts.documentParts(req.company, saved.row);
      buffer = await draftToDocx(parts.draft, parts);
    } else {
      const ref = await issueRef(req.company, (item && item.swmsTitle) || result.task, placeOf(signedInBody({ ...req, body: item || {} })));
      buffer = await draftToDocx(result, { logo, confirmation, ref, company: req.company });
    }
    // Named by the task's title from the scope where there is one.
    const title = typeof item.swmsTitle === 'string' && item.swmsTitle.trim() ? item.swmsTitle : result.task;
    const base = `${String(index + 1).padStart(2, '0')} ${String(title || 'SWMS').replace(/[^A-Za-z0-9 ,()-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)}`;
    let name = `${base}.docx`;
    for (let n = 2; used.has(name); n += 1) name = `${base} ${n}.docx`;
    used.add(name);
    zip.file(name, Buffer.from(buffer));
    record('download_word', req.company && req.company.id);
    await recordIndustry(result, signedInBody({ ...req, body: item || {} }), req.company).catch(() => {});
  }
  if (!used.size) return res.status(400).json({ kind: 'error', message: `None of the SWMS is ready to download. ${gated.length ? `SiteReady does not produce a SWMS until the site questions are answered and no blank is left in it. ${gated.join(' ')}${unticked.length ? ' ' : ''}` : ''}${unticked.length ? `Tick the box above the draft that lists work SiteReady has no job steps for: ${unticked.join(' ')}` : ''}${!gated.length && !unticked.length ? 'Answer the questions for each one first.' : ''}` });
  const notes = [
    skipped.length ? `These tasks still have questions to answer, so their SWMS are not in this download:\n${skipped.join('\n')}\n` : '',
    gated.length ? `These SWMS still have site questions or blanks to answer, so they are not in this download:\n${gated.join('\n')}\n` : '',
    unticked.length ? `SiteReady has no job steps for part of these SWMS, and the box above the draft was not ticked, so they are not in this download:\n${unticked.join('\n')}\n` : '',
  ].filter(Boolean);
  if (notes.length) zip.file('Not included.txt', notes.join('\n'));
  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  if (savedItems.length) res.setHeader('X-SiteReady-Saved', encodeURIComponent(JSON.stringify(savedItems)));
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="SiteReady-project-SWMS.zip"');
  res.send(out);
});

app.get('/api/config', (_req, res) => {
  res.json({ accounts: db.enabled(), trialDays: auth.TRIAL_DAYS, billing: billing.enabled(), price: process.env.PRICE_LABEL || 'A$49 a month incl. GST' });
});

app.get('/api/health', async (_req, res) => {
  let database = 'off';
  if (db.enabled()) database = await db.query('SELECT 1').then(() => 'ok').catch(() => 'failing');
  res.status(database === 'failing' ? 503 : 200).json({ ok: database !== 'failing', database });
});

app.use('/api', accounts.router);
app.use('/api', billing.router);
app.use('/api', admin.router);
require('./testhooks').install(app, accounts);

app.use('/api', (_req, res) => {
  res.status(404).json({ kind: 'error', message: 'Not found.' });
});

// Details go to the log. The client gets a plain message.
app.use((error, req, res, _next) => {
  const status = error.status || error.statusCode || 500;
  // A worker sign-on key is never written to the error log.
  if (status >= 500) recordError(`${req.method} ${req.path.replace(/^\/api\/sign\/[^/]+/, '/api/sign/:token')}`, error);
  const message = error.publicMessage && error.message ? error.message : status < 500 ? 'The request could not be read.' : 'The statement could not be prepared.';
  // What a SWMS still needs before it is saved or downloaded (goal 2), for the page to show.
  const gate = error.publicMessage && Array.isArray(error.gate) ? { gate: error.gate } : {};
  res.status(status >= 400 && status < 600 ? status : 500).json({ kind: 'error', message, ...gate });
});

// One worker per processor core. A worker that stops is replaced.
function start() {
  const PORT = process.env.PORT || 3849;
  const workers = Math.floor(positiveNumber(process.env.WEB_CONCURRENCY, os.availableParallelism()));
  // In production, a feature whose secret key is missing stays off, and the log names the variable.
  if (cluster.isPrimary) for (const line of keyProblems()) console.error(line);
  if (workers > 1 && cluster.isPrimary) {
    for (let i = 0; i < workers; i += 1) cluster.fork();
    cluster.on('exit', (worker, code, signal) => {
      console.error(`Worker ${worker.process.pid} stopped (${signal || code}). Starting another.`);
      cluster.fork();
    });
    console.log(`SiteReady server running on http://localhost:${PORT} with ${workers} workers`);
    return;
  }
  if (db.enabled()) {
    db.migrate().catch((error) => console.error('Database setup failed:', error.message));
    // One process sends review reminders, every 6 hours.
    if (!cluster.worker || cluster.worker.id === 1) {
      const remind = () => {
        Promise.all([accounts.sendReviewReminders(), accounts.removeExpired()]).catch((error) => console.error('Review reminders failed:', error.message));
        // A change to the law or the library released with this version is run once (library-notices.json).
        libraryNotices.runLibraryNotices().catch((error) => console.error('Library notices failed:', error.message));
      };
      setTimeout(remind, 60 * 1000);
      setInterval(remind, 6 * 60 * 60 * 1000).unref();
    }
  }
  const server = app.listen(PORT, () => {
    if (workers <= 1) console.log(`SiteReady server running on http://localhost:${PORT}`);
  });
  // Idle connections are kept longer than a proxy keeps its own, so the server
  // never closes a connection the proxy is about to reuse (a source of 502 errors).
  // A client that sends a request slowly is still cut off.
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  server.requestTimeout = 70000;
}

process.on('unhandledRejection', (error) => recordError('unhandledRejection', error));

if (require.main === module) start();

module.exports = {
  app,
  prepareDraft,
  questionsFor,
};
