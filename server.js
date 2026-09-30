const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const path = require('path');
const { listStates } = require('./legislation');
const { questionsFor, prepareDraft, FALL_EXPLANATION } = require('./draft');
const { draftToDocx } = require('./docx-draft');

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
// Railway and similar hosts sit behind one proxy. The rate limit needs the client address.
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: allowedOrigins() }));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', rateLimit({
  windowMs: positiveNumber(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  limit: positiveNumber(process.env.RATE_LIMIT_MAX_REQUESTS, 100),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { kind: 'error', message: 'Too many requests. Try again later.' },
}));

function textField(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().substring(0, max);
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
    company: field(body.company || body.companyName, 200),
    workplace: field(body.workplace || body.siteAddress, 500),
    principalContractor: field(body.principalContractor, 300),
    siteManager: field(body.siteManager, 300),
    scaffoldSupervisor: field(body.scaffoldSupervisor, 400),
    hospital: field(body.hospital, 500),
    firstAider: field(body.firstAider, 300),
    musterPoint: field(body.musterPoint, 300),
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
  res.json({ states: listStates(), fallExplanation: FALL_EXPLANATION });
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
  const buffer = await draftToDocx(result);
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

if (require.main === module) {
  const PORT = process.env.PORT || 3849;
  app.listen(PORT, () => {
    console.log(`SiteReady server running on http://localhost:${PORT}`);
  });
}

module.exports = {
  app,
  prepareDraft,
  questionsFor,
};
