const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const path = require('path');
const cluster = require('cluster');
const os = require('os');
const crypto = require('crypto');
const { listStates, findState } = require('./legislation');
const designFiles = require('./design-files');
const { questionsFor, prepareDraft, legalSource, keepWarning, notCoveredLeft, coverCheck } = require('./draft');
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
const { TRADES, GROUPS, answersFor } = require('./presets');
// The pick lists as the page needs them: each task's words, job steps and parts with no job steps.
const PICK_TRADES = TRADES.map((trade) => ({
  id: trade.id,
  name: trade.name,
  group: trade.group,
  tasks: trade.tasks.map((item) => ({ id: item.id, title: item.title, task: item.task, fallRisk: item.fallRisk, crane: item.crane, kinds: item.kinds, leaveOut: item.leaveOut, gaps: item.gaps, coverage: item.coverage })),
}));
const { localText } = require('./citations');
const { scopeText } = require('./scope-text');
const { tasksFromScope } = require('./scope');
const aiScope = require('./ai-scope');
const checkJobs = require('./check-jobs');
const { reportToDocx } = require('./scope-report');
const places = require('./places');
const { recordIndustry } = require('./industry');
const draftTranslate = require('./draft-translate');
const { keyProblems } = require('./secret-keys');
const { downloadGaps, gateChecks, gateMessage } = require('./download-gate');
const { hasBlank, blankKey } = require('./blanks');
const delivery = require('./delivery');
const { SharedStore, servePrimary } = require('./rate-store');
const reviews = require('./reviews');
const humanCheck = require('./human-check');
const { partHashes } = require('./public/check-parts');

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
// The same headers under the app's old name, for a page opened before the change of name (D299) and
// still open. Taken out after 28 October 2026, as the other allowances for old pages are.
const OLD_HEADERS = ['X-SiteReady-Swms', 'X-SiteReady-Revision', 'X-SiteReady-Title', 'X-SiteReady-Saved'];
app.use(cors({ origin: allowedOrigins(), exposedHeaders: ['Content-Disposition', 'X-SiteWrite-Swms', 'X-SiteWrite-Revision', 'X-SiteWrite-Title', 'X-SiteWrite-Saved', ...OLD_HEADERS] }));
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
app.use((req, res, next) => ([SCOPE_ROUTE, '/api/scope/ai', '/api/check', '/api/methodology/read'].includes(req.path) ? scopeJson : req.path === '/api/project.zip' ? projectJson : LARGE_BODY.has(req.path) ? wordJson : smallJson)(req, res, next));
// The page's text files are sent compressed and kept by the phone until they change (goal 7).
app.use(delivery.staticFiles(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public'), delivery.staticOptions));

// Limits are per client address. Phones on mobile data and a site office on one
// connection often share an address, so the limits are set for a busy site, not
// one person. Every worker process shares one count for each client, kept in the
// primary process's memory (rate-store.js).
const windowMs = positiveNumber(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
const limiter = (name, limit, { skip, keyGenerator, failClosed } = {}) => rateLimit({
  windowMs,
  limit,
  skip,
  keyGenerator,
  identifier: name,
  store: new SharedStore(name, { failClosed }),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { kind: 'error', message: `Too many requests. Try again in ${Math.ceil(windowMs / 60000)} minutes.` },
});
// The Word file takes most of the work, so it has its own, lower limit.
app.use(WORD_ROUTE, limiter('word-file', positiveNumber(process.env.RATE_LIMIT_WORD_REQUESTS, 300)));
// Sign-in emails, team invitations and reviewers' sign-in links (goal 3): each inbox gets at most 10 links in the window, and each
// client address can send links to three times as many inboxes, so a site office or a mobile
// network sharing one address can still sign several people up. Only sending counts; opening the
// team list does not. If the shared count cannot be read, no email is sent (rate-store.js).
const EMAIL_ROUTES = ['/api/auth/email', '/api/company/users', '/api/review/email'];
const emailLimit = positiveNumber(process.env.RATE_LIMIT_EMAIL_REQUESTS, 10);
const notSending = (req) => req.method !== 'POST';
app.use(EMAIL_ROUTES, limiter('sign-in-email-inbox', emailLimit, {
  skip: notSending,
  keyGenerator: (req) => {
    const email = auth.cleanEmail(req.body && req.body.email);
    // The inbox is counted by a fingerprint, so the count holds no email address.
    return email ? `inbox:${crypto.createHash('sha256').update(email).digest('hex').slice(0, 32)}` : ipKeyGenerator(req.ip);
  },
  failClosed: true,
}));
app.use(EMAIL_ROUTES, limiter('sign-in-email-ip', positiveNumber(process.env.RATE_LIMIT_EMAIL_IP_REQUESTS, emailLimit * 3), { skip: notSending, failClosed: true }));
// The principal contractor's review pages (goal 3): opening a SWMS, the builder check, its files and the response.
app.use('/api/review', limiter('review', positiveNumber(process.env.RATE_LIMIT_REVIEW_REQUESTS, 60)));
app.use('/api/sign', limiter('sign-on', positiveNumber(process.env.RATE_LIMIT_SIGN_REQUESTS, 200)));
// Each SWMS is translated once per language and then kept, so few requests reach the AI;
// this lower limit stops one phone asking for every language over and over.
app.use(/^\/api\/sign\/[^/]+\/translation/, limiter('sign-on-translation', positiveNumber(process.env.RATE_LIMIT_TRANSLATE_REQUESTS, 30)));
app.use('/api/draft/translation', limiter('draft-translation', positiveNumber(process.env.RATE_LIMIT_TRANSLATE_REQUESTS, 30)));
app.use('/api', limiter('api', positiveNumber(process.env.RATE_LIMIT_MAX_REQUESTS, 600), {
  skip: (req) => req.originalUrl.startsWith(WORD_ROUTE),
}));
// Sessions are read after the limits, so a refused request goes no further.
app.use(auth.readSession);

const { draftBody } = require('./input');

// Job address suggestions. Each one is a paid Google request, so it has its own limit.
app.use('/api/address', limiter('address', positiveNumber(process.env.RATE_LIMIT_ADDRESS_REQUESTS, 300)));
app.use('/api/nearby-care', limiter('nearby-care', positiveNumber(process.env.RATE_LIMIT_ADDRESS_REQUESTS, 300) / 10));
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
    res.json(await places.suggest(req.query.q, { near: typeof req.query.near === 'string' ? req.query.near : '' }));
  } catch (error) {
    next(error);
  }
});

// Anyone holding a SWMS can check its SiteWrite reference: whether it is genuine, the business
// it was prepared for, its title and revision, and whether that revision is still the current one
// (owner decision, 6 October 2026). Nothing else is shown: no controls, no ABN, no dates, apart
// from the principal contractor's response on the revision and its date (goal 3, D286).
app.use('/api/verify', limiter('verify', positiveNumber(process.env.RATE_LIMIT_ADDRESS_REQUESTS, 300) / 10));
app.get('/api/verify/:ref', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    const ref = String(req.params.ref || '').trim().toUpperCase();
    if (!require('./refs').REF_PATTERN.test(ref)) return res.status(400).json({ found: false, message: 'A SiteWrite reference looks like SW-ABCD-2345 (or SR-ABCD-2345 on older SWMS). Check the footer of the SWMS.' });
    const found = await require('./refs').findRef(ref).catch(() => null);
    record('verify_ref', null);
    if (!found) return res.json({ found: false, message: 'This reference is not in SiteWrite\'s records. The SWMS was not prepared with SiteWrite under this reference, or the reference was changed.' });
    // A reference printed on a saved SWMS names its revision; one from before revisions were
    // recorded, or on a stood-down draft, has none.
    let revision = null;
    let current = null;
    let review = null;
    if (found.swms_id) {
      const swms = await db.one('SELECT revision, archived FROM swms WHERE id = $1', [found.swms_id]).catch(() => null);
      revision = Number(found.revision) || null;
      current = Boolean(swms && !swms.archived && Number(swms.revision || 1) === revision);
      // The principal contractor's latest response on this revision and its date only (D286): no
      // names and no conditions.
      const latest = swms && !swms.archived && revision ? await reviews.latestReview(found.swms_id, revision).catch(() => null) : null;
      if (latest) review = { label: latest.label, response: latest.response, date: latest.date };
    }
    // A saved revision that is still current can be reviewed by the principal contractor.
    res.json({ found: true, ref: found.ref, business: found.company_name, title: found.title, revision, current, reviewable: Boolean(revision && current), review });
  } catch (error) {
    next(error);
  }
});

app.use('/api/abn', limiter('abn', positiveNumber(process.env.RATE_LIMIT_ADDRESS_REQUESTS, 300) / 10));
app.get('/api/abn', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await require('./abn').lookupAbn(req.query.abn));
  } catch (error) {
    next(error);
  }
});

// The states, the pick lists and the job step library change only when SiteWrite is updated,
// so a phone keeps them for an hour instead of asking again on every visit.
app.get('/api/states', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ states: listStates() });
});

app.get('/api/presets', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ groups: GROUPS, trades: PICK_TRADES });
});

// Job steps whose name, hazards or controls match the words searched.
app.get('/api/steps/search', (req, res) => {
  res.json({ ids: searchSteps(String(req.query.q || '').slice(0, 80), String(req.query.trade || '').slice(0, 80)) });
});

// The job step library for the step picker.
app.get('/api/steps', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(stepLibrary());
});

// The designs a draft of this input relies on, for the page: { designs } with each design's id,
// what it is, the steps that rely on it and the user's answers so far. Empty when there are none.
function designsAsked(input) {
  try {
    const draft = prepareDraft(input);
    // The work with no job steps, named on the one-go project page before Prepare all (messy round 3).
    const cover = coverCheck(input);
    const said = cover.notCovered.length ? { notCovered: cover.notCovered, notCoveredMain: cover.notCoveredMain, notCoveredLeft: cover.left } : {};
    if (draft.kind !== 'draft') return said;
    // The types of hazardous substance the work usually uses (substances.js, D277), for the one-go
    // project page's "Not required" ticks (owner, D287).
    const types = ((draft.substances && draft.substances.items) || []).map((item) => item.product);
    return { ...said, ...((draft.designs || []).length ? { designs: draft.designs } : {}), ...(types.length ? { substanceTypes: types } : {}) };
  } catch (error) {
    return {};
  }
}

// Attaching design files has its own limit: each is up to 10 MB.
const designFileLimit = limiter('design-files', positiveNumber(process.env.RATE_LIMIT_DESIGN_FILE_REQUESTS, 60));
app.use('/api/designs/files', (req, res, next) => (req.method === 'POST' ? designFileLimit(req, res, next) : next()));

app.post('/api/draft/questions', (req, res) => {
  const result = questionsFor(draftBody(req.body || {}));
  if (result.kind === 'refused' || result.kind === 'error') return res.status(400).json(result);
  // Standard answers the user can pick, then change.
  // Outside Queensland the answers use the state's wording.
  const local = (list) => list.map((answer) => ({ ...answer, text: localText(answer.text, result.state.id) })).filter((answer) => answer.text);
  // The pressure test answers follow the task: the gas line test only where gas is named.
  result.required = (result.required || []).map((item) => (item.choices ? item : { ...item, suggestions: local(answersFor(item.id, result.task)) }));
  // The designs the job steps rely on, asked under the site questions (designs.js), as the draft
  // would print them now. Nothing is said while the draft would be stood down.
  res.json({ ...result, ...designsAsked(draftBody(req.body || {})) });
});

// Reading a scope takes more work than a draft, so it has a lower limit.
app.use('/api/project.zip', limiter('project-zip', positiveNumber(process.env.RATE_LIMIT_WORD_REQUESTS, 300) / 10));
const scopeLimit = limiter('scope', positiveNumber(process.env.RATE_LIMIT_SCOPE_REQUESTS, 60));
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
const aiScopeLimit = limiter('ai-scope', positiveNumber(process.env.RATE_LIMIT_AI_SCOPE_REQUESTS, 20));
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

// Reading a written methodology or sequence of works and suggesting job steps (method-read.js;
// owner, D230). Typed words only: drawings and scans are refused with a plain message. Signed-in
// accounts only, with its own limit; only starting a reading counts against it.
const methodRead = require('./method-read');
const methodReadLimit = limiter('methodology-read', positiveNumber(process.env.RATE_LIMIT_METHOD_READ_REQUESTS, 20));
app.use('/api/methodology/read', (req, res, next) => (req.method === 'POST' ? methodReadLimit(req, res, next) : next()));
app.get('/api/methodology/read', (req, res) => res.json({ enabled: aiScope.enabled() }));
app.post('/api/methodology/read', auth.requireAccess, async (req, res, next) => {
  try {
    const text = await methodRead.methodText(req.body || {}, req.company);
    const started = await methodRead.startReading(req.company, text);
    record(started.kept ? 'method_read_kept' : 'method_read', req.company && req.company.id);
    const { done, ...out } = started;
    res.status(started.status === 'reading' ? 202 : 200).json(out);
  } catch (error) {
    next(error);
  }
});
app.get('/api/methodology/read/:id', auth.requireUser, async (req, res, next) => {
  try {
    res.json(await methodRead.getReading(req.company, req.params.id));
  } catch (error) {
    next(error);
  }
});

// Reading an attached design drawing's title block to fill its card (design-read.js; owner, D249):
// typed words only, never the drawing image. Signed-in accounts only, with its own limit.
const designRead = require('./design-read');
const designReadLimit = limiter('design-read', positiveNumber(process.env.RATE_LIMIT_DESIGN_READ_REQUESTS, 60));
app.post('/api/designs/read', designReadLimit, auth.requireAccess, async (req, res, next) => {
  try {
    const result = await designRead.readDesign(req.company, req.body && req.body.fileId);
    record(result.kept ? 'design_read_kept' : 'design_read', req.company && req.company.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Reading a hazardous product's safety data sheet to fill its row (sds-read.js; owner, D256): typed
// words only, never an image. Signed-in accounts only, with its own limit.
const sdsRead = require('./sds-read');
const sdsReadLimit = limiter('sds-read', positiveNumber(process.env.RATE_LIMIT_SDS_READ_REQUESTS, 60));
app.post('/api/substances/read', sdsReadLimit, auth.requireAccess, async (req, res, next) => {
  try {
    const result = await sdsRead.readSds(req.company, req.body && req.body.fileId);
    record(result.kept ? 'sds_read_kept' : 'sds_read', req.company && req.company.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// The builder SWMS check (task #106): score a subcontractor's SWMS and draft the email back.
// Signed-in accounts only, with its own limit, as an uploaded SWMS is read by the AI.
// Reading a long SWMS takes minutes, longer than a proxy waits for one answer, so an uploaded or
// pasted SWMS is started as a check (check-jobs.js) and the page asks for it by its id. A SiteWrite
// draft needs no AI and is checked at once. Only starting a check counts against this limit; the
// page asking whether it is ready does not.
const checkLimit = limiter('check', positiveNumber(process.env.RATE_LIMIT_CHECK_REQUESTS, 30));
app.use('/api/check', (req, res, next) => (req.method === 'POST' ? checkLimit(req, res, next) : next()));
app.post('/api/check', auth.requireUser, async (req, res, next) => {
  try {
    const checkRead = require('./check-read');
    const body = req.body || {};
    const { company, user } = req;
    if (checkRead.readsDocument(body)) {
      checkRead.readyToRead(body);
      const started = checkJobs.startJob(user.id, async () => {
        const result = await checkRead.runCheck(body, company, { user });
        record('builder_check', company && company.id);
        return result;
      }, (error) => recordError('POST /api/check (reading)', error));
      return res.status(202).json(started);
    }
    const result = await checkRead.runCheck(body, company);
    record('builder_check', company && company.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});
// Whether an uploaded SWMS is kept (KEEP_CHECKED_SWMS), and the notice the check page shows at
// upload while it is. Before /api/check/:id, which would otherwise take "keeping" for a check's id.
app.get('/api/check/keeping', (req, res) => {
  res.json(require('./checked-swms').uploadNotice());
});
// The check's result once ready, for the account that started it. It is dropped as it is read.
app.get('/api/check/:id', auth.requireUser, async (req, res, next) => {
  try {
    const job = await checkJobs.takeJob(req.user.id, req.params.id);
    if (!job) return res.status(404).json({ kind: 'error', message: 'This check is not kept any more. Results are dropped once shown, or 10 minutes after the check, and a server restart drops them too. Check the SWMS again.' });
    res.json(job);
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
  // What must still be answered before it can be downloaded (goal 2), shown beside each item, and
  // every check with how its answer is judged, so the page can clear an item as it is answered.
  const checks = result.kind === 'draft' ? gateChecks(draftBody(req.body || {}), result) : [];
  const legal = result.kind === 'draft' ? {
    controlLegal: (result.jobSteps || []).map((step) => step.controls.map(legalSource)),
    controlWarn: (result.jobSteps || []).map((step) => step.controls.map(keepWarning)),
    gate: checks.filter((check) => check.need).map(({ rule: _rule, ...gap }) => gap),
    gateChecks: checks,
    // The line each blank (____) is filled in by, for the boxes on the page.
    blankKeys: {
      steps: (result.jobSteps || []).map((step) => step.controls.map((line) => (hasBlank(line) ? blankKey(line) : ''))),
      controls: (result.controls || []).map((item) => (hasBlank(item.text) ? blankKey(item.text) : '')),
    },
  } : {};
  // Each part's fingerprint (public/check-parts.js), so a page holding a check can tell which ticks a
  // change has cleared (D286).
  const checkParts = result.kind === 'draft' ? { checkParts: partHashes(result) } : {};
  res.json({ ...result, ...legal, ...checkParts });
});

// SiteWrite's own check before the person's (D286): the download gate, then Builder check on the
// draft as it prints, with no AI, and each part's fingerprint for the ticks. The page asks again as
// the user changes the draft, so a tick always matches what will print.
app.post('/api/draft/check', (req, res) => {
  const input = signedInBody(req);
  const result = prepareDraft(input);
  if (result.kind !== 'draft') return res.status(400).json({ kind: 'error', message: result.kind === 'stand-down' ? 'This SWMS is stood down until the missing facts are added.' : (result.message || 'The statement could not be prepared.') });
  const gate = downloadGaps(input, result).map(({ rule: _rule, ...gap }) => gap);
  res.json({ kind: 'self-check', gate, ...(gate.length ? { partHashes: partHashes(result) } : humanCheck.selfCheck(result, input.state)) });
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

// A Word file or PDF is only prepared once SiteWrite's own check has no must-fix item and a named
// person has ticked each part as checked, with their role (human-check.js, D286). The date is the
// server's.

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
// With no reference number of the business's own, the SWMS prints its SiteWrite reference (D289).
function withRef(draft, ref) {
  if (draft && ref && !String(draft.swmsRef || '').trim()) draft.swmsRef = ref;
  return draft;
}

function needsCompanyDetails(req) {
  return req.company && (!String(req.company.name || '').trim() || !String(req.company.abn || '').trim());
}
const COMPANY_DETAILS_MESSAGE = 'Add your company name and ABN under Company profile before downloading. They are printed on every SWMS.';

app.post('/api/draft.pdf', auth.requireAccess, async (req, res, next) => {
  if (needsCompanyDetails(req)) return res.status(400).json({ kind: 'error', message: COMPANY_DETAILS_MESSAGE });
  try {
    const result = prepareDraft(signedInBody(req));
    if (result.kind === 'refused' || result.kind === 'error') return res.status(400).json(result);
    // The site answers (goal 2) and the tick for parts with no job steps (D184), named together.
    const refusal = gateRefusal(signedInBody(req), result);
    if (refusal) return res.status(400).json(refusal);
    // Then SiteWrite's check and the person's check of each part (D286).
    const confirmation = result.kind === 'draft' ? humanCheck.confirm(req.body || {}, result, { state: signedInBody(req).state }) : null;
    const saved = req.company ? await accounts.saveForDownload(req, req.body || {}, { confirmation }) : null;
    if (saved) {
      await recordIndustry(saved.kept.draft, saved.kept.input, req.company).catch(() => {});
      return await accounts.sendDocument(req, res, saved.row, 'pdf');
    }
    const ref = await issueRef(req.company, result.task, placeOf(signedInBody(req)));
    withRef(result, ref);
    const buffer = await draftToPdf(result, { logo: readLogo(req.company ? req.company.logo : (req.body && req.body.logo)), note: draftedNote(confirmation), prepared: preparedFor(req.company, ref), confirmation });
    record('download_pdf', req.company && req.company.id);
    await recordIndustry(result, signedInBody(req), req.company).catch(() => {});
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.kind === 'stand-down' ? 'SiteWrite-stood-down.pdf' : 'SiteWrite.pdf'}"`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

app.post('/api/draft.docx', auth.requireAccess, async (req, res) => {
  if (needsCompanyDetails(req)) return res.status(400).json({ kind: 'error', message: COMPANY_DETAILS_MESSAGE });
  const result = prepareDraft(signedInBody(req));
  if (result.kind === 'refused' || result.kind === 'error') return res.status(400).json(result);
  // The site answers (goal 2) and the tick for parts with no job steps (D184), named together.
  const refusal = gateRefusal(signedInBody(req), result);
  if (refusal) return res.status(400).json(refusal);
  // Then SiteWrite's check and the person's check of each part (D286).
  const confirmation = result.kind === 'draft' ? humanCheck.confirm(req.body || {}, result, { state: signedInBody(req).state }) : null;
  const saved = req.company ? await accounts.saveForDownload(req, req.body || {}, { confirmation }) : null;
  if (saved) {
    await recordIndustry(saved.kept.draft, saved.kept.input, req.company).catch(() => {});
    return accounts.sendDocument(req, res, saved.row, 'docx');
  }
  // A stood-down draft cannot be saved; without accounts nothing is saved.
  const ref = await issueRef(req.company, result.task, placeOf(signedInBody(req)));
  withRef(result, ref);
  const buffer = await draftToDocx(result, { logo: readLogo(req.company ? req.company.logo : (req.body && req.body.logo)), confirmation, ref, company: req.company });
  record('download_word', req.company && req.company.id);
  await recordIndustry(result, signedInBody(req), req.company).catch(() => {});
  const filename = result.kind === 'stand-down' ? 'SiteWrite-stood-down.docx' : 'SiteWrite.docx';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
});

// Every SWMS for a project in one zip of Word files. Each SWMS carries its own check (D240 "Review
// each, download all", D286): a SWMS not checked, or changed since it was ticked, is left out and named.
// With accounts on, each SWMS is saved as a record when the project is downloaded (owner
// decision, 6 October 2026): an item already saved (its swmsId) is saved as its next revision
// when it has changed. The X-SiteWrite-Saved header lists each item's saved SWMS and revision.
const JSZip = require('jszip');
const PROJECT_LIMIT = 40;
app.post('/api/project.zip', auth.requireAccess, async (req, res) => {
  if (needsCompanyDetails(req)) return res.status(400).json({ kind: 'error', message: COMPANY_DETAILS_MESSAGE });
  const body = req.body || {};
  const items = Array.isArray(body.swms) ? body.swms.slice(0, PROJECT_LIMIT) : [];
  if (!items.length) return res.status(400).json({ kind: 'error', message: 'There are no SWMS in this project yet.' });
  // A page from before the check sends one tick for the whole set: it cannot stand for each SWMS.
  if (humanCheck.isOldShape(body) && !items.some((item) => item && item.check)) return res.status(400).json({ kind: 'error', message: humanCheck.REFRESH, field: 'refresh' });
  const zip = new JSZip();
  const used = new Set();
  const skipped = [];
  // A SWMS with parts SiteWrite has no job steps for, not ticked as dealt with, is left out (D184).
  const unticked = [];
  const logo = readLogo(req.company ? req.company.logo : body.logo);
  const savedItems = [];
  // SWMS with site questions unanswered or blanks left are not in the zip (goal 2).
  const gated = [];
  // SWMS not checked part by part, changed since, or with a must-fix item left (D286).
  const unchecked = [];
  for (const [index, item] of items.entries()) {
    // Numbered as in the project's list, so a SWMS has the same number in every zip of the project.
    const number = item && Number.isInteger(item.swmsNumber) && item.swmsNumber > 0 && item.swmsNumber < 1000 ? item.swmsNumber : index + 1;
    const result = prepareDraft(signedInBody({ ...req, body: item || {} }));
    if (result.kind !== 'draft') { skipped.push(`${number}. ${String((item && item.task) || '').slice(0, 80)}`); continue; }
    // The site answers and blanks (goal 2) and the D184 tick: a SWMS missing site answers is listed
    // with all it needs; one missing only the tick is listed with its parts with no job steps.
    const gaps = downloadGaps(signedInBody({ ...req, body: item || {} }), result);
    const named = String((item && (item.swmsTitle || item.task)) || result.task || '').slice(0, 80);
    if (gaps.some((gap) => gap.kind !== 'cover')) { gated.push(`${number}. ${named}: still to answer: ${[...new Set(gaps.map((gap) => gap.label))].join('; ')}`); continue; }
    if (gaps.length) { unticked.push(`${number}. ${named}: ${notCoveredLeft(result).join('; ')}`); continue; }
    let confirmation;
    try {
      confirmation = humanCheck.confirm({ check: item && item.check }, result, { state: signedInBody({ ...req, body: item || {} }).state });
    } catch (error) {
      if (!error.publicMessage) throw error;
      unchecked.push(`${number}. ${named}: ${error.message}`);
      continue;
    }
    let buffer;
    // With pdf set (the project page, D240), each SWMS goes in the zip as Word and as PDF.
    let pdf = null;
    const saved = req.company ? await accounts.saveForDownload(req, { ...item, siteId: body.siteId }, { title: item && typeof item.swmsTitle === 'string' ? item.swmsTitle : '', confirmation }) : null;
    if (saved) {
      savedItems.push({ index, id: saved.row.id, revision: saved.row.revision || 1 });
      const parts = await accounts.documentParts(req.company, saved.row, saved.row.revision || 1, auth.appUrl(req));
      buffer = await draftToDocx(parts.draft, parts);
      if (body.pdf === true) pdf = await draftToPdf(parts.draft, { ...parts, note: draftedNote(parts.confirmation), prepared: preparedFor(req.company, parts.ref, parts.revision) });
    } else {
      const ref = await issueRef(req.company, (item && item.swmsTitle) || result.task, placeOf(signedInBody({ ...req, body: item || {} })));
      withRef(result, ref);
      buffer = await draftToDocx(result, { logo, confirmation, ref, company: req.company });
      if (body.pdf === true) pdf = await draftToPdf(result, { logo, note: draftedNote(confirmation), prepared: preparedFor(req.company, ref), confirmation });
    }
    // Named by the task's title from the scope where there is one.
    const title = typeof item.swmsTitle === 'string' && item.swmsTitle.trim() ? item.swmsTitle : result.task;
    // A point between numbers stays ("deeper than 1.5 m", messy round 3).
    const base = `${String(number).padStart(2, '0')} ${String(title || 'SWMS').replace(/(?<!\d)\.|\.(?!\d)/g, ' ').replace(/[^A-Za-z0-9 .,()-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)}`;
    let stem = base;
    for (let n = 2; used.has(`${stem}.docx`); n += 1) stem = `${base} ${n}`;
    used.add(`${stem}.docx`);
    zip.file(`${stem}.docx`, Buffer.from(buffer));
    record('download_word', req.company && req.company.id);
    if (pdf) {
      zip.file(`${stem}.pdf`, Buffer.from(pdf));
      record('download_pdf', req.company && req.company.id);
    }
    await recordIndustry(result, signedInBody({ ...req, body: item || {} }), req.company).catch(() => {});
  }
  if (!used.size) return res.status(400).json({ kind: 'error', message: `None of the SWMS is ready to download. ${gated.length ? `SiteWrite does not produce a SWMS until the site questions are answered, the plant is confirmed, the emergency response is given and no blank is left in it. ${gated.join(' ')}${unticked.length || unchecked.length ? ' ' : ''}` : ''}${unticked.length ? `Above each draft, write your own step for the work SiteWrite has no job steps for, or say which SWMS covers it: ${unticked.join(' ')}${unchecked.length ? ' ' : ''}` : ''}${unchecked.length ? `Open each SWMS and tick each part as checked, with your name and role: ${unchecked.join(' ')}` : ''}${!gated.length && !unticked.length && !unchecked.length ? 'Answer the questions for each one first.' : ''}` });
  const notes = [
    skipped.length ? `These tasks still have questions to answer, so their SWMS are not in this download:\n${skipped.join('\n')}\n` : '',
    gated.length ? `These SWMS still have site questions or blanks to answer, so they are not in this download:\n${gated.join('\n')}\n` : '',
    unticked.length ? `SiteWrite has no job steps for part of these SWMS, and it was not dealt with above the draft, so they are not in this download:\n${unticked.join('\n')}\n` : '',
    unchecked.length ? `These SWMS have not been checked part by part since they last changed, so they are not in this download:\n${unchecked.join('\n')}\n` : '',
  ].filter(Boolean);
  if (notes.length) zip.file('Not included.txt', notes.join('\n'));
  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  if (savedItems.length) {
    res.setHeader('X-SiteWrite-Saved', encodeURIComponent(JSON.stringify(savedItems)));
    res.setHeader('X-SiteReady-Saved', encodeURIComponent(JSON.stringify(savedItems)));
  }
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="SiteWrite-project-SWMS.zip"');
  res.send(out);
});

app.get('/api/config', (_req, res) => {
  // Whether a design's file can be attached (design-files.js: the storage bucket, or a local run).
  res.json({ accounts: db.enabled(), trialDays: auth.TRIAL_DAYS, billing: billing.enabled(), price: process.env.PRICE_LABEL || 'A$49 a month incl. GST', designFiles: { enabled: db.enabled() && designFiles.enabled(), maxMb: designFiles.MAX_MB } });
});

app.get('/api/health', async (_req, res) => {
  let database = 'off';
  if (db.enabled()) database = await db.query('SELECT 1').then(() => 'ok').catch(() => 'failing');
  res.status(database === 'failing' ? 503 : 200).json({ ok: database !== 'failing', database });
});

app.use('/api', accounts.router);
app.use('/api', billing.router);
app.use('/api', admin.router);
app.use('/api', reviews.router);
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
  // The box a refusal is about, for the page to mark (the review response's boxes).
  const field = error.publicMessage && typeof error.field === 'string' ? { field: error.field } : {};
  // The parts of the check a change has cleared, for the page to untick (D286).
  const stale = error.publicMessage && Array.isArray(error.stale) ? { stale: error.stale } : {};
  res.status(status >= 400 && status < 600 ? status : 500).json({ kind: 'error', message, ...gate, ...field, ...stale });
});

// One worker per processor core. A worker that stops is replaced.
function start() {
  const PORT = process.env.PORT || 3849;
  const workers = Math.floor(positiveNumber(process.env.WEB_CONCURRENCY, os.availableParallelism()));
  // In production, a feature whose secret key is missing stays off, and the log names the variable.
  if (cluster.isPrimary) for (const line of keyProblems()) console.error(line);
  // Keeping checked SWMS in production without its storage bucket keeps no originals, and says so.
  const storage = require('./checked-swms').enabled() ? require('./file-store').storageProblem() : null;
  if (cluster.isPrimary && storage) console.error(storage);
  if (cluster.isPrimary && designFiles.storageProblem()) console.error(designFiles.storageProblem());
  if (workers > 1 && cluster.isPrimary) {
    // The primary keeps the rate limit counts for every worker.
    servePrimary();
    for (let i = 0; i < workers; i += 1) cluster.fork();
    // A builder check runs in one worker; another worker asked for it asks through here.
    checkJobs.relayChecks(cluster);
    cluster.on('exit', (worker, code, signal) => {
      console.error(`Worker ${worker.process.pid} stopped (${signal || code}). Starting another.`);
      cluster.fork();
    });
    console.log(`SiteWrite server running on http://localhost:${PORT} with ${workers} workers`);
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
    if (workers <= 1) console.log(`SiteWrite server running on http://localhost:${PORT}`);
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
  start,
  prepareDraft,
  questionsFor,
};
