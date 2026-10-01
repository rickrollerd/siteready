const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const path = require('path');
const cluster = require('cluster');
const os = require('os');
const { listStates } = require('./legislation');
const { questionsFor, prepareDraft } = require('./draft');
const { draftToDocx } = require('./docx-draft');
const { readLogo } = require('./logo');

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
// The Word file can carry the company logo, so its route accepts a larger body.
const WORD_ROUTE = '/api/draft.docx';
const smallJson = express.json({ limit: '100kb' });
const wordJson = express.json({ limit: '1mb' });
app.use((req, res, next) => (req.path === WORD_ROUTE ? wordJson : smallJson)(req, res, next));
app.use(express.static(path.join(__dirname, 'public')));

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
app.use('/api', limiter(
  positiveNumber(process.env.RATE_LIMIT_MAX_REQUESTS, 600),
  (req) => req.originalUrl.startsWith(WORD_ROUTE),
));

// Control characters, often pasted in from Word or email, are not allowed in a
// Word file and would make it fail to open.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

function textField(value, max) {
  if (typeof value !== 'string') return '';
  return value.toWellFormed().replace(CONTROL, ' ').trim().substring(0, max);
}

function longDate(date = new Date()) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function draftBody(body) {
  const facts = body.facts && typeof body.facts === 'object' ? body.facts : {};
  const site = body.site && typeof body.site === 'object' ? body.site : {};
  const field = (value, max) => textField(value, max);
  return {
    state: field(body.state, 80),
    task: field(body.task || body.jobDescription, 5000),
    fallRisk: field(body.fallRisk, 10),
    residential: field(body.residential, 10),
    crane: field(body.crane, 20),
    company: field(body.company || body.companyName, 200),
    companyAbn: field(body.companyAbn, 40),
    companyAddress: field(body.companyAddress, 300),
    companyPhone: field(body.companyPhone, 60),
    companyEmail: field(body.companyEmail, 200),
    workplace: field(body.workplace || body.siteAddress, 500),
    principalContractor: field(body.principalContractor, 300),
    siteManager: field(body.siteManager, 300),
    scaffoldSupervisor: field(body.scaffoldSupervisor, 400),
    hospital: field(body.hospital, 500),
    firstAider: field(body.firstAider, 300),
    musterPoint: field(body.musterPoint, 300),
    worksManager: field(body.worksManager, 300),
    worksManagerPhone: field(body.worksManagerPhone, 60),
    complianceResponsible: field(body.complianceResponsible, 300),
    reviewer: field(body.reviewer, 300),
    reviewDate: field(body.reviewDate, 80),
    ppe: Array.isArray(body.ppe) ? body.ppe.filter((id) => typeof id === 'string').slice(0, 40).map((id) => id.slice(0, 40)) : undefined,
    date: field(body.date, 80) || longDate(),
    facts: {
      craneChart: field(facts.craneChart, 2000),
      erectionDesign: field(facts.erectionDesign, 2000),
      centreOfGravity: field(facts.centreOfGravity, 2000),
      braceArrangement: field(facts.braceArrangement, 2000),
      safetyDataSheet: field(facts.safetyDataSheet, 4000),
      fallControl: field(facts.fallControl, 2000),
      asbestosArrangement: field(facts.asbestosArrangement, 2000),
      trenchSupport: field(facts.trenchSupport, 2000),
      controlsConsidered: field(facts.controlsConsidered, 2000),
      regulatorNotified: field(facts.regulatorNotified, 1000),
      craneCompany: field(facts.craneCompany, 1000),
      systemInstructions: field(facts.systemInstructions, 2000),
      deckMethod: field(facts.deckMethod, 100),
      loadLimits: field(facts.loadLimits, 2000),
      isolationProcedure: field(facts.isolationProcedure, 2000),
      energisedWork: field(facts.energisedWork, 100),
      constructionTesting: field(facts.constructionTesting, 2000),
      confinedSpace: field(facts.confinedSpace, 2000),
      temporarySupport: field(facts.temporarySupport, 2000),
      electricalSafety: field(facts.electricalSafety, 2000),
      drowningControls: field(facts.drowningControls, 2000),
      formworkDesign: field(facts.formworkDesign, 2000),
      jumpformProcedure: field(facts.jumpformProcedure, 2000),
      stressingProcedure: field(facts.stressingProcedure, 2000),
    },
    site: {
      liveServices: field(site.liveServices, 1000),
      publicInterface: field(site.publicInterface, 1000),
      otherTrades: field(site.otherTrades, 1000),
      ground: field(site.ground, 1000),
      access: field(site.access, 1000),
    },
  };
}

app.get('/api/states', (_req, res) => {
  res.json({ states: listStates() });
});

app.post('/api/draft/questions', (req, res) => {
  const result = questionsFor(draftBody(req.body || {}));
  if (result.kind === 'refused' || result.kind === 'error') return res.status(400).json(result);
  res.json(result);
});

app.post('/api/draft', (req, res) => {
  const result = prepareDraft(draftBody(req.body || {}));
  if (result.kind === 'refused' || result.kind === 'error') return res.status(400).json(result);
  res.json(result);
});

app.post('/api/draft.docx', async (req, res) => {
  const result = prepareDraft(draftBody(req.body || {}));
  if (result.kind === 'refused' || result.kind === 'error') return res.status(400).json(result);
  // The logo is used for this file only and is not kept.
  const buffer = await draftToDocx(result, { logo: readLogo(req.body && req.body.logo) });
  const filename = result.kind === 'stand-down' ? 'SiteReady-stood-down.docx' : 'SiteReady.docx';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
});

app.use('/api', (_req, res) => {
  res.status(404).json({ kind: 'error', message: 'Not found.' });
});

// Details go to the log. The client gets a plain message.
app.use((error, _req, res, _next) => {
  const status = error.status || error.statusCode || 500;
  if (status >= 500) console.error('Request error:', error);
  const message = status < 500 ? 'The request could not be read.' : 'The statement could not be prepared.';
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

if (require.main === module) start();

module.exports = {
  app,
  prepareDraft,
  questionsFor,
};
