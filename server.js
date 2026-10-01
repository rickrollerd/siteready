const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const path = require('path');
const cluster = require('cluster');
const os = require('os');
const { listStates } = require('./legislation');
const { questionsFor, prepareDraft } = require('./draft');
const { draftToDocx, draftedNote } = require('./docx-draft');
const { readLogo } = require('./logo');
const { draftToPdf } = require('./pdf-draft');
const db = require('./db');
const auth = require('./auth');
const accounts = require('./accounts');
const billing = require('./billing');
const admin = require('./admin');
const { record, recordError } = require('./events');
const { TRADES, answersFor } = require('./presets');
const { scopeText } = require('./scope-text');
const { tasksFromScope } = require('./scope');

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
app.use(cors({ origin: allowedOrigins() }));
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
app.use((req, res, next) => (req.path === SCOPE_ROUTE ? scopeJson : LARGE_BODY.has(req.path) ? wordJson : smallJson)(req, res, next));
app.use(express.static(path.join(__dirname, 'public')));
app.use(auth.readSession);

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
app.use('/api', limiter(
  positiveNumber(process.env.RATE_LIMIT_MAX_REQUESTS, 600),
  (req) => req.originalUrl.startsWith(WORD_ROUTE),
));

const { draftBody } = require('./input');

app.get('/api/states', (_req, res) => {
  res.json({ states: listStates() });
});

app.get('/api/presets', (_req, res) => {
  res.json({ trades: TRADES });
});

app.post('/api/draft/questions', (req, res) => {
  const result = questionsFor(draftBody(req.body || {}));
  if (result.kind === 'refused' || result.kind === 'error') return res.status(400).json(result);
  // Standard answers the user can pick, then change.
  result.required = (result.required || []).map((item) => (item.choices ? item : { ...item, suggestions: answersFor(item.id) }));
  res.json(result);
});

// Reading a scope takes more work than a draft, so it has a lower limit.
app.use(SCOPE_ROUTE, limiter(positiveNumber(process.env.RATE_LIMIT_SCOPE_REQUESTS, 60)));
app.post(SCOPE_ROUTE, async (req, res, next) => {
  try {
    const text = await scopeText(req.body || {});
    record('scope', req.company && req.company.id);
    res.json(tasksFromScope(text));
  } catch (error) {
    next(error);
  }
});

app.post('/api/draft', (req, res) => {
  const result = prepareDraft(draftBody(req.body || {}));
  if (result.kind === 'refused' || result.kind === 'error') return res.status(400).json(result);
  record(req.user ? 'preview_signed_in' : 'preview', req.company && req.company.id);
  res.json(result);
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
// details and logo.
function signedInBody(req) {
  const body = req.body || {};
  return req.company ? accounts.withCompany(draftBody(body), req.company) : draftBody(body);
}

app.post('/api/draft.pdf', auth.requireAccess, async (req, res, next) => {
  try {
    const confirmation = reviewConfirmation(req.body || {});
    if (!confirmation) return res.status(400).json({ kind: 'error', message: 'Confirm that your business will review and approve this SWMS, and enter your name, before downloading.' });
    const result = prepareDraft(signedInBody(req));
    if (result.kind === 'refused' || result.kind === 'error') return res.status(400).json(result);
    const buffer = await draftToPdf(result, { logo: readLogo((req.company && req.company.logo) || (req.body && req.body.logo)), note: draftedNote(confirmation) });
    record('download_pdf', req.company && req.company.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.kind === 'stand-down' ? 'SiteReady-stood-down.pdf' : 'SiteReady.pdf'}"`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

app.post('/api/draft.docx', auth.requireAccess, async (req, res) => {
  const confirmation = reviewConfirmation(req.body || {});
  if (!confirmation) {
    return res.status(400).json({ kind: 'error', message: 'Confirm that your business will review and approve this SWMS, and enter your name, before downloading.' });
  }
  const result = prepareDraft(signedInBody(req));
  if (result.kind === 'refused' || result.kind === 'error') return res.status(400).json(result);
  const buffer = await draftToDocx(result, { logo: readLogo((req.company && req.company.logo) || (req.body && req.body.logo)), confirmation });
  record('download_word', req.company && req.company.id);
  const filename = result.kind === 'stand-down' ? 'SiteReady-stood-down.docx' : 'SiteReady.docx';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
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

app.use('/api', (_req, res) => {
  res.status(404).json({ kind: 'error', message: 'Not found.' });
});

// Details go to the log. The client gets a plain message.
app.use((error, req, res, _next) => {
  const status = error.status || error.statusCode || 500;
  if (status >= 500) recordError(`${req.method} ${req.path}`, error);
  const message = error.publicMessage && error.message ? error.message : status < 500 ? 'The request could not be read.' : 'The statement could not be prepared.';
  res.status(status >= 400 && status < 600 ? status : 500).json({ kind: 'error', message });
});

// One worker per processor core. A worker that stops is replaced.
function start() {
  const PORT = process.env.PORT || 3849;
  const workers = Math.floor(positiveNumber(process.env.WEB_CONCURRENCY, os.availableParallelism()));
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
      const remind = () => Promise.all([accounts.sendReviewReminders(), accounts.removeExpired()]).catch((error) => console.error('Review reminders failed:', error.message));
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
