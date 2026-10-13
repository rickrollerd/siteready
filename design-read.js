// Reading a design drawing's title block when its file is attached (owner, D249 and D250, 13 October
// 2026: the design card "should auto populate when you upload a drawing"). Only the PDF's typed words
// (its text layer) are read, never the drawing image (D224): a scan or a photo has none, and the user
// types its details. The reading takes the same path as a scope or a methodology (ai-scope.js): the
// same model and call, switched off without the API key, kept against the company and the text's
// fingerprint so the same drawing costs nothing the second time, and what it cost recorded with it in
// ai_readings (brief version "design m1"), so the owner's AI readings page lists it.
//
// Each value the AI returns must be in the text word for word, or it is left empty. The page fills the
// card with what was read and asks the user to tick that it matches the title block before the SWMS
// downloads (gate-rules.js designNeed).
const crypto = require('crypto');
const { PDFParse } = require('pdf-parse');
const db = require('./db');
const aiScope = require('./ai-scope');
const { DESIGN_BRIEF, DESIGN_BRIEF_VERSION, DESIGN_SCHEMA } = require('./design-brief');

const MAX_CHARACTERS = 2500000;
const NO_WORDS = 'This drawing has no typed words SiteReady can read, so type its details.';
const OFF = 'Reading the drawing is not switched on here. Type its details.';
const fail = (status, message) => Object.assign(new Error(message), { status, publicMessage: true });

// The PDF's typed words, every page, nothing cut short.
async function pdfText(data) {
  const parser = new PDFParse({ data });
  try {
    return (await parser.getText()).pages.map((page) => String(page.text || '').replace(/^-- \d+ of \d+ --$/gm, '')).join('\n\n').trim();
  } catch {
    throw fail(422, NO_WORDS);
  } finally {
    await parser.destroy().catch(() => {});
  }
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n) => String(n).padStart(2, '0');
// A date as written on an Australian drawing ("03.10.2026", "3/10/26", "3 Oct 2026", "2026-10-03") as
// the date box takes it (2026-10-03), or '' when it is not plainly one date.
function isoDate(value) {
  const text = String(value || '').trim();
  let day;
  let month;
  let year;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (match) [, year, month, day] = match.map(Number);
  else if ((match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})$/.exec(text))) {
    [, day, month, year] = match.map(Number);
    if (match[3].length === 2) year += 2000;
  } else if ((match = /^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{4})$/.exec(text))) {
    day = Number(match[1]);
    month = MONTHS.indexOf(match[2].slice(0, 3).toLowerCase()) + 1;
    year = Number(match[3]);
  } else return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  if (!month || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return `${year}-${pad(month)}-${pad(day)}`;
}

// What the AI read, kept only where it is in the text word for word, as whole words: a revision "D"
// is not found in "DRAWING".
function checkedFields(value, text) {
  const words = aiScope.normalise(text).toLowerCase();
  const escape = (part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = (said) => new RegExp(`(?:^|[^a-z0-9])${escape(said.toLowerCase())}(?:$|[^a-z0-9])`).test(words);
  const out = {};
  const notFound = [];
  for (const key of ['title', 'by', 'number', 'revision', 'date']) {
    const said = aiScope.normalise(value && value[key]);
    if (!said) continue;
    if (found(said)) out[key] = said;
    else notFound.push({ where: key, quote: said.slice(0, 300) });
  }
  return { fields: out, notFound };
}

// The card's details from what was read: what it is (the title), who prepared it, the number, the
// revision ("Rev C" read as "C") and the date for the date box. The fields filled are listed.
function cardDetails(fields) {
  const details = {};
  if (fields.title) details.what = fields.title;
  if (fields.by) details.by = fields.by;
  if (fields.number) details.number = fields.number;
  if (fields.revision) details.revision = fields.revision.replace(/^(?:rev(?:ision)?\.?\s*)/i, '');
  const date = isoDate(fields.date);
  if (date) details.date = date;
  return { details, read: Object.keys(details) };
}

// Reads the attached drawing of the business, or returns what was read of the same drawing before.
async function readDesign(company, fileId) {
  if (!aiScope.enabled()) throw fail(503, OFF);
  if (!company) throw fail(401, 'Sign in to have SiteReady read the drawing.');
  const kept = await require('./design-files').fileOfCompany(company.id, String(fileId || ''));
  if (!kept) throw fail(404, 'The attached file was not found. Attach it again.');
  if (kept.row.content_type !== 'application/pdf') throw fail(422, NO_WORDS);
  const text = await pdfText(kept.data);
  if ((text.match(/[A-Za-z]{2,}/g) || []).length < 3) throw fail(422, NO_WORDS);
  if (text.length > MAX_CHARACTERS) throw fail(413, 'This drawing has too many words to read at once. Type its details.');
  const hash = aiScope.fingerprint(text);
  const before = await db.one("SELECT reading FROM ai_readings WHERE company_id = $1 AND doc_hash = $2 AND brief_version = $3 AND status = 'done' ORDER BY created_at DESC LIMIT 1",
    [company.id, hash, DESIGN_BRIEF_VERSION]);
  if (before) return { ...cardDetails(JSON.parse(before.reading).fields), kept: true };
  const id = crypto.randomUUID();
  const started = new Date();
  const save = (status, fields) => db.query('INSERT INTO ai_readings (id, company_id, doc_hash, brief_version, model, status, characters, reading, checks, usage, cost_usd, error, created_at, finished_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)',
    [id, company.id, hash, DESIGN_BRIEF_VERSION, fields.model || aiScope.MODEL, status, text.length, fields.reading || null, fields.checks || null, JSON.stringify(fields.usage || {}), aiScope.costOf(fields.usage || {}), fields.error || '', started, new Date()]);
  let answer;
  try {
    answer = await aiScope.callModel({ system: DESIGN_BRIEF, content: `<document>\n${text}\n</document>`, schema: DESIGN_SCHEMA, effort: 'low' });
  } catch (error) {
    const message = aiScope.errorMessage(error);
    await save('failed', { error: message }).catch(() => {});
    throw fail(502, message);
  }
  const { fields, notFound } = checkedFields(answer.value, text);
  // In the shape the owner's AI readings page shows, with the values not in the text left out.
  const checks = { activities: Object.keys(fields).length, byOthers: 0, conflicts: 0, quotes: Object.keys(fields).length + notFound.length, quotesNotFound: notFound, quotesShortened: [], packages: 0, otherPackages: [], rowsWithoutQuote: [], rowsWithoutActivity: 0, passed: notFound.length === 0 };
  await save('done', { reading: JSON.stringify({ fields }), checks: JSON.stringify(checks), usage: answer.usage, model: answer.model });
  return { ...cardDetails(fields), kept: false };
}

module.exports = { readDesign, checkedFields, cardDetails, isoDate, NO_WORDS, OFF };
