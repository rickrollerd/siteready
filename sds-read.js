// Reading a hazardous product's safety data sheet when it is attached (owner, D256, 13 October 2026:
// each product's row is filled from its SDS for the user to check). Only the PDF's typed words (its
// text layer) are read, never an image: a scanned SDS or a photo has none, and the user types the
// product's details from it. The reading takes the same path as a drawing's title block
// (design-read.js): the same model and call (ai-scope.js), switched off without the API key, kept
// against the company and the text's fingerprint so the same SDS costs nothing the second time, and
// what it cost recorded with it in ai_readings (brief version "sds m1"), so the owner's AI readings
// page lists it.
//
// Each value the AI returns must be in the SDS word for word, or it is left out (D181: what prints is
// the SDS's own words). The page fills the product's row with what was read and asks the user to tick
// that it matches the SDS before the SWMS downloads (substance-rules.js substanceNeed).
const crypto = require('crypto');
const db = require('./db');
const aiScope = require('./ai-scope');
const { pdfText, isoDate } = require('./design-read');
const { SDS_BRIEF, SDS_BRIEF_VERSION, SDS_SCHEMA } = require('./sds-brief');

const MAX_CHARACTERS = 2500000;
const NO_WORDS = 'This safety data sheet has no typed words SiteWrite can read (it may be a scan or a photo). Type the product\'s details from it.';
const NOT_SDS = 'This file does not read as a safety data sheet. Attach the product\'s safety data sheet, or type its details.';
const OFF = 'Reading the safety data sheet is not switched on here. Type the product\'s details from it.';
const fail = (status, message) => Object.assign(new Error(message), { status, publicMessage: true });

const LISTS = ['hazards', 'controls', 'firstAid', 'storage'];
const MAX_ITEMS = 8;

// Whether a list item is in the SDS word for word as a whole instruction: not a piece cut from inside a
// sentence. "Induce vomiting" is not found in "Do not induce vomiting.", nor "Wear gloves" in "Wear
// gloves, goggles and an apron.". Its closing punctuation may differ; "..." must be in the SDS itself.
function sentenceFinder(text) {
  const doc = aiScope.normalise(text);
  const lower = doc.toLowerCase();
  // It starts the SDS's text, follows a stop, colon or bullet, or starts with a capital or a number as
  // a new line does ("Hand protection Nitrile gloves."); never after "not", "never" and the like.
  const startOk = (at) => {
    const before = doc.slice(0, at).trimEnd();
    if (!before) return true;
    if (/(?:^|[^a-z'])(?:not|never|no|don't|avoid|without)$/i.test(before)) return false;
    return /[A-Z0-9]/.test(doc[at]) || /[.:;!?)\]•*\u2022-]$/.test(before);
  };
  const endOk = (end, probe) => {
    if (/[.;!?:]$/.test(probe)) return true;
    const after = doc.slice(end);
    return !after.trim() || /^[.;!?:)]/.test(after) || /^\s+[A-Z0-9•*(\u2022-]/.test(after);
  };
  return (item) => {
    const want = aiScope.normalise(item).toLowerCase();
    const probes = /\.\.\.|…/.test(want) ? [want] : [want, want.replace(/[.;:,]+$/, '')];
    for (const probe of probes) {
      if (!probe) continue;
      for (let at = lower.indexOf(probe); at >= 0; at = lower.indexOf(probe, at + 1)) {
        if (startOk(at) && endOk(at + probe.length, probe)) return true;
      }
    }
    return false;
  };
}

// What the AI read, kept only where it is in the SDS word for word: the name, supplier and date as
// whole words, and each list item as a whole instruction of the SDS (sentenceFinder). What is not
// found is listed, and left out.
function checkedSds(value, text) {
  const words = aiScope.normalise(text).toLowerCase();
  const escape = (part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const whole = (said) => new RegExp(`(?:^|[^a-z0-9])${escape(said.toLowerCase())}(?:$|[^a-z0-9])`).test(words);
  const found = sentenceFinder(text);
  const fields = {};
  const notFound = [];
  for (const key of ['product', 'supplier', 'issueDate']) {
    const said = aiScope.normalise(value && value[key]);
    if (!said) continue;
    if (whole(said)) fields[key] = said;
    else notFound.push({ where: key, quote: said.slice(0, 300) });
  }
  for (const key of LISTS) {
    const items = Array.isArray(value && value[key]) ? value[key] : [];
    const kept = [];
    for (const item of items) {
      const said = aiScope.normalise(item);
      if (!said) continue;
      if (found(said)) { if (!kept.includes(said) && kept.length < MAX_ITEMS) kept.push(said); } else notFound.push({ where: key, quote: said.slice(0, 300) });
    }
    if (kept.length) fields[key] = kept;
  }
  return { fields, notFound };
}

// The product's row from what was read: the date for the date box, where it is plainly one date.
function rowDetails(fields) {
  const details = {};
  for (const key of ['product', 'supplier', ...LISTS]) if (fields[key]) details[key] = fields[key];
  const date = isoDate(fields.issueDate);
  if (date) details.sdsDate = date;
  return { details, read: Object.keys(details) };
}

// Reads the attached SDS of the business, or returns what was read of the same SDS before.
async function readSds(company, fileId) {
  if (!aiScope.enabled()) throw fail(503, OFF);
  if (!company) throw fail(401, 'Sign in to have SiteWrite read the safety data sheet.');
  const kept = await require('./design-files').fileOfCompany(company.id, String(fileId || ''));
  if (!kept) throw fail(404, 'The attached file was not found. Attach it again.');
  if (kept.row.content_type !== 'application/pdf') throw fail(422, NO_WORDS);
  let text;
  try {
    text = await pdfText(kept.data);
  } catch {
    throw fail(422, NO_WORDS);
  }
  if ((text.match(/[A-Za-z]{2,}/g) || []).length < 20) throw fail(422, NO_WORDS);
  if (!/\b(?:safety data sheet|SDS|MSDS|hazard identification)\b/i.test(text)) throw fail(422, NOT_SDS);
  if (text.length > MAX_CHARACTERS) throw fail(413, 'This safety data sheet has too many words to read at once. Type the product\'s details from it.');
  const hash = aiScope.fingerprint(text);
  const before = await db.one("SELECT reading FROM ai_readings WHERE company_id = $1 AND doc_hash = $2 AND brief_version = $3 AND status = 'done' ORDER BY created_at DESC LIMIT 1",
    [company.id, hash, SDS_BRIEF_VERSION]);
  if (before) return { ...rowDetails(JSON.parse(before.reading).fields), kept: true };
  const id = crypto.randomUUID();
  const started = new Date();
  const save = (status, fields) => db.query('INSERT INTO ai_readings (id, company_id, doc_hash, brief_version, model, status, characters, reading, checks, usage, cost_usd, error, created_at, finished_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)',
    [id, company.id, hash, SDS_BRIEF_VERSION, fields.model || aiScope.MODEL, status, text.length, fields.reading || null, fields.checks || null, JSON.stringify(fields.usage || {}), aiScope.costOf(fields.usage || {}), fields.error || '', started, new Date()]);
  let answer;
  try {
    answer = await aiScope.callModel({ system: SDS_BRIEF, content: `<document>\n${text}\n</document>`, schema: SDS_SCHEMA, effort: 'low', reader: 'SDS' });
  } catch (error) {
    const message = aiScope.errorMessage(error);
    await save('failed', { error: message }).catch(() => {});
    throw fail(502, message);
  }
  const { fields, notFound } = checkedSds(answer.value, text);
  // In the shape the owner's AI readings page shows, with the values not in the text left out.
  const count = Object.values(fields).reduce((sum, value) => sum + (Array.isArray(value) ? value.length : 1), 0);
  const checks = { activities: count, byOthers: 0, conflicts: 0, quotes: count + notFound.length, quotesNotFound: notFound, quotesShortened: [], packages: 0, otherPackages: [], rowsWithoutQuote: [], rowsWithoutActivity: 0, passed: notFound.length === 0 };
  await save('done', { reading: JSON.stringify({ fields }), checks: JSON.stringify(checks), usage: answer.usage, model: answer.model });
  return { ...rowDetails(fields), kept: false, dropped: notFound.length };
}

module.exports = { readSds, checkedSds, sentenceFinder, rowDetails, NO_WORDS, NOT_SDS, OFF };
