// Reading a written methodology or sequence of works with the AI, and suggesting job steps from it
// (owner, D224 and D230, 12 October 2026). SiteWrite reads typed words only: a drawing, a photo or a
// scanned page is never guessed from, and the user is told it was not read. The reading takes the
// same path as reading a scope (ai-scope.js): the same model and call, every word sent and never cut
// short, kept against the company and the document's fingerprint so the same document costs nothing
// the second time, what it cost recorded with it, and switched off without the API key.
//
// Two calls: the methodology brief (method-brief.js) lists the methodology's own steps in order, each
// with its words quoted; then the scope reading's step matching (STEPS_BRIEF) chooses the library's
// job step groups for each step. Every quote is checked word for word against the text before the
// reading is used: a step whose own words are not in the text is left out, and so is a control or
// hazard line that is not, and the user is told how many (owner, D234). Only when every step is left
// out is the reading not used. Ids not in the library are dropped, as for a scope.
//
// The suggestions change nothing on their own. The user accepts, changes or skips each one on the
// page: an accepted library match adds those job steps, with the library's own sourced lines (D181:
// no new library lines); an accepted "Your step" goes in as the user's own step (draft.js
// withOwnSteps), with only the hazards and controls the methodology itself states. Reading adds no
// download gate item and changes no builder check.
//
// The readings are kept in ai_readings beside the scope readings, under their own brief version, so
// the owner's AI readings page lists them with their check and cost, and they go when the business
// is deleted.
const crypto = require('crypto');
const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');
const db = require('./db');
const aiScope = require('./ai-scope');
const { METHOD_BRIEF, METHOD_BRIEF_VERSION, METHOD_SCHEMA } = require('./method-brief');
const { stepLibrary } = require('./steps');

const MAX_CHARACTERS = 2500000;
const STALE_MINUTES = 30;

const fail = (status, message) => Object.assign(new Error(message), { status, publicMessage: true });

// What the user is told when a file has no typed words to read (owner, D224: "You cannot read
// drawings, only words").
const NOT_TYPED_ATTACHED = 'SiteWrite can only read typed methodologies. This file looks like a drawing or a scan, so it is attached but not read.';
const NOT_TYPED = 'SiteWrite can only read typed methodologies. This file looks like a drawing or a scan, so it was not read.';
const OFF = 'Reading a methodology is not switched on here. The methodology can still be attached. Make the job steps match it yourself.';

// ---- The typed words of the methodology ----

const words = (line) => (String(line).match(/[A-Za-z][A-Za-z'’-]+/g) || []).length;

// A typed page is written in sentences: at least half of its words are in lines with four or more
// words in small letters. A scan or a photo has no words; a drawing's text layer is mostly labels,
// grid lines, levels and notes in capitals. A page of a few words (a title page, a short last page)
// counts as typed.
const smallWords = (line) => (String(line).match(/\b[a-z][a-z'’-]+/g) || []).length;
function typedPage(pageText) {
  const lines = String(pageText || '').split('\n');
  const total = lines.reduce((sum, line) => sum + words(line), 0);
  if (!total) return false;
  if (total < 15) return true;
  const inSentences = lines.reduce((sum, line) => sum + (smallWords(line) >= 4 ? words(line) : 0), 0);
  return inSentences >= total / 2;
}

// Each PDF page's text. A PDF that cannot be read is refused with the plain message.
async function pdfPages(data) {
  const parser = new PDFParse({ data });
  try {
    const pages = (await parser.getText()).pages;
    return pages.map((page) => String(page.text || '').replace(/^-- \d+ of \d+ --$/gm, ''));
  } catch {
    throw fail(400, 'The PDF could not be read. Paste the methodology\'s text instead.');
  } finally {
    await parser.destroy().catch(() => {});
  }
}

// The text to read, from typed pages, and the pages that are not typed: { text, pagesNotRead }.
// Refused when most of it is not typed, or there are fewer than 60 words. Every page's words are
// sent, so nothing is cut out; the pages listed as not read are those whose pictures the AI does not
// see. A Word file's text is all typed (its pictures have none), so only its length counts.
function fromPages(pages, attached, word = false) {
  const typed = word ? pages.map(() => true) : pages.map(typedPage);
  const count = typed.filter(Boolean).length;
  const text = pages.join('\n\n').trim();
  if (!count || count < pages.length / 2 || words(text) < 60) throw fail(422, attached ? NOT_TYPED_ATTACHED : NOT_TYPED);
  return { text, pagesNotRead: typed.map((ok, index) => (ok ? 0 : index + 1)).filter(Boolean) };
}

const isPdf = (data) => data.subarray(0, 5).toString('latin1') === '%PDF-';
const isImage = (data) => (data[0] === 0x89 && data[1] === 0x50) || (data[0] === 0xff && data[1] === 0xd8);

// The methodology's text from what the page sends: pasted text, a Word file or PDF chosen to read
// ({ file: { name, data } } in base64), or the file attached to the methodology ({ fileId }).
async function methodText(body, company) {
  if (typeof body.text === 'string' && body.text.trim()) {
    const text = body.text.trim();
    if (words(text) < 30) throw fail(400, 'There is too little text to read. Paste the whole methodology or sequence of works.');
    return { text, pagesNotRead: [] };
  }
  let data;
  let name = '';
  let attached = false;
  if (typeof body.fileId === 'string' && body.fileId) {
    const kept = company ? await require('./design-files').fileOfCompany(company.id, body.fileId) : null;
    if (!kept) throw fail(404, 'The attached file was not found. Attach it again.');
    data = kept.data;
    name = kept.row.name || '';
    attached = true;
  } else if (body.file && typeof body.file === 'object' && typeof body.file.data === 'string' && body.file.data) {
    data = Buffer.from(body.file.data, 'base64');
    name = String(body.file.name || '').toLowerCase();
  } else {
    throw fail(400, 'Choose the methodology\'s file or paste its text first.');
  }
  if (isPdf(data)) return fromPages(await pdfPages(data), attached);
  if (isImage(data) || /\.(png|jpe?g|gif|heic|tiff?|bmp|dwg|dxf)$/i.test(name)) throw fail(422, attached ? NOT_TYPED_ATTACHED : NOT_TYPED);
  if (/\.docx$/i.test(name)) {
    const result = await mammoth.extractRawText({ buffer: data }).catch(() => { throw fail(400, 'The Word file could not be read. Save it again as .docx, or paste the text.'); });
    return fromPages([result.value], attached, true);
  }
  if (/\.doc$/i.test(name)) throw fail(400, 'Older Word files (.doc) cannot be read. Save it as .docx, or paste the text.');
  throw fail(400, 'Choose a Word file (.docx) or a PDF, or paste the methodology\'s text.');
}

// ---- The reading checked against the brief ----

// Whether a quote is word for word in the text. A word broken over two lines of a PDF ("pre-" then
// "raise") counts as written either way.
function quoteFound(text) {
  const finders = [text, text.replace(/-\n\s*/g, '-'), text.replace(/(\w)-\n\s*(\w)/g, '$1$2')].map(aiScope.quoteFinder);
  return (quote) => finders.some((finder) => finder(quote));
}

// Every quote word for word in the text (steps, controls and hazards), none shortened with "...",
// and every step with a quote. The counts are in the shape the owner's AI readings page shows.
function checkMethodReading(reading, text) {
  const found = quoteFound(text);
  const steps = Array.isArray(reading && reading.steps) ? reading.steps : [];
  const all = steps.flatMap((row) => [
    ...row.quotes.map((quote) => ({ quote, where: `Step: ${row.step}` })),
    ...row.controls.map((quote) => ({ quote, where: `Control: ${row.step}` })),
    ...row.hazards.map((quote) => ({ quote, where: `Hazard: ${row.step}` })),
  ]).filter((item) => aiScope.normalise(item.quote));
  const shortened = all.filter((item) => /\.\.\.|…/.test(item.quote) && !found(item.quote));
  const notFound = all.filter((item) => !/\.\.\.|…/.test(item.quote) && !found(item.quote));
  const noQuote = steps.filter((row) => !row.quotes.some((quote) => aiScope.normalise(quote)));
  const noName = steps.filter((row) => !aiScope.normalise(row.step));
  return {
    activities: steps.length,
    byOthers: 0,
    conflicts: 0,
    quotes: all.length,
    quotesNotFound: notFound.map((item) => ({ where: item.where, quote: item.quote.slice(0, 300) })),
    quotesShortened: shortened.map((item) => ({ where: item.where, quote: item.quote.slice(0, 300) })),
    packages: 0,
    otherPackages: [],
    rowsWithoutQuote: noQuote.map((row) => row.step),
    rowsWithoutActivity: noName.length,
    passed: notFound.length === 0 && shortened.length === 0 && noQuote.length === 0 && noName.length === 0,
  };
}

// What is used of a reading (owner, D234, 13 October 2026: a misquoted suggestion is dropped on its
// own, and the rest of the reading is used). A step goes when any of its own quotes is not word for word
// in the methodology (or it has no quote, or no name); a control or hazard line not word for word goes
// on its own, and its step stays. Returns the steps kept and what was left out.
function keptSteps(reading, text) {
  const found = quoteFound(text);
  const words = (list) => list.filter((quote) => aiScope.normalise(quote));
  const dropped = { steps: [], lines: [] };
  const steps = [];
  for (const row of Array.isArray(reading && reading.steps) ? reading.steps : []) {
    const quotes = words(row.quotes);
    if (!aiScope.normalise(row.step) || !quotes.length || !quotes.every(found)) {
      dropped.steps.push({ step: row.step, quotes: quotes.filter((quote) => !found(quote)).map((quote) => quote.slice(0, 300)) });
      continue;
    }
    const lines = (kind, list) => words(list).filter((quote) => {
      if (found(quote)) return true;
      dropped.lines.push({ step: row.step, kind, quote: quote.slice(0, 300) });
      return false;
    });
    steps.push({ ...row, quotes, controls: lines('control', row.controls), hazards: lines('hazard', row.hazards) });
  }
  return { steps, dropped };
}

// The answer must have the brief's shape.
function validMethodReading(value) {
  const strings = (items) => Array.isArray(items) && items.every((item) => typeof item === 'string');
  return Boolean(value) && typeof value.isMethodology === 'boolean' && typeof value.notMethodology === 'string' && Array.isArray(value.steps)
    && value.steps.every((row) => row && typeof row === 'object' && typeof row.step === 'string' && typeof row.plant === 'string' && typeof row.conditions === 'string'
      && strings(row.quotes) && strings(row.controls) && strings(row.hazards));
}

// ---- The two calls ----

// The methodology's steps, each as its own work package for the scope reading's step matching: the
// step's name, then its words as written.
const stepPackage = (row, index) => `Step ${index + 1}: ${row.step}`;
function asPackages(steps) {
  return {
    activities: steps.flatMap((row, index) => [row.step, ...row.quotes].map((activity, at) => ({
      activity, type: 'Site work', package: stepPackage(row, index), plant: at ? '' : row.plant, conditions: at ? '' : row.conditions, where: '',
    }))),
  };
}

// The steps left out are not matched to the library. Returns the reading as used, the AI's answer as
// given (for the check against the brief) and what was left out.
async function readMethod(text, id) {
  const { value, usage, model } = await aiScope.callModel({ system: METHOD_BRIEF, content: `<document>\n${text}\n</document>`, schema: METHOD_SCHEMA, effort: 'high' });
  if (!validMethodReading(value)) throw fail(502, 'The AI\'s answer was not in the expected form. Try again.');
  const given = value.isMethodology ? value.steps : [];
  const { steps, dropped } = keptSteps({ steps: given }, text);
  const counts = { steps: dropped.steps.length, lines: dropped.lines.length };
  const out = { answer: value, dropped, given: given.length, model };
  if (!steps.length) return { ...out, reading: { ...value, steps, groups: [], dropped: counts }, usage };
  // The first call's cost is kept with the error when the second fails.
  if (id) await aiScope.markStage(id, 'steps');
  const mapped = await aiScope.mapSteps(asPackages(steps)).catch((error) => { throw Object.assign(error, { usage }); });
  const byName = new Map(mapped.packages.map((item) => [item.package, item]));
  const groups = steps.map((row, index) => (byName.get(stepPackage(row, index)) || { groups: [] }).groups);
  const unknown = mapped.packages.flatMap((item) => item.unknown);
  return { ...out, reading: { ...value, steps, groups, unknownStepIds: unknown, dropped: counts }, usage: aiScope.addUsage(usage, mapped.usage) };
}

// ---- Kept readings ----

let labels = null;
function groupInfo(id) {
  if (!labels) labels = new Map(stepLibrary().groups.flatMap((group) => group.kinds.map((kind) => [kind.id, kind])));
  const kind = labels.get(id);
  return kind ? { id, label: kind.label, steps: kind.steps } : null;
}

// The suggestions as the page shows them: each step in order, matched to library job steps (named)
// or the user's own step, with the methodology's words.
function suggestionsOf(reading) {
  if (!reading || !reading.isMethodology) return [];
  return reading.steps.map((row, index) => {
    const groups = ((reading.groups || [])[index] || []).map(groupInfo).filter(Boolean);
    return {
      n: index + 1,
      step: row.step,
      quotes: row.quotes.filter((quote) => aiScope.normalise(quote)),
      plant: row.plant,
      conditions: row.conditions,
      controls: row.controls.filter((quote) => aiScope.normalise(quote)),
      hazards: row.hazards.filter((quote) => aiScope.normalise(quote)),
      kind: groups.length ? 'library' : 'own',
      groups,
    };
  });
}

function rowOut(row) {
  const reading = row.reading ? JSON.parse(row.reading) : null;
  const checks = row.checks ? JSON.parse(row.checks) : null;
  return {
    id: row.id,
    status: row.status,
    progress: aiScope.progressOf(row),
    error: row.error || '',
    isMethodology: reading ? reading.isMethodology : null,
    notMethodology: reading ? reading.notMethodology : '',
    // A reading not used (no step quoted word for word) suggests nothing.
    suggestions: row.status === 'done' ? suggestionsOf(reading) : [],
    // The steps, and the control or hazard lines, left out for not being word for word (D234).
    dropped: row.status === 'done' && reading && reading.dropped ? reading.dropped : { steps: 0, lines: 0 },
    pagesNotRead: (checks && checks.pagesNotRead) || [],
    checks,
    briefVersion: row.brief_version,
  };
}

async function markStale() {
  await db.query("UPDATE ai_readings SET status = 'failed', error = $1, finished_at = $2 WHERE status = 'reading' AND brief_version = $3 AND created_at < $4",
    ['The reading was interrupted. Try again.', new Date(), METHOD_BRIEF_VERSION, new Date(Date.now() - STALE_MINUTES * 60 * 1000)]);
}

// Starts a reading, or returns the one already kept for this company and text. The reading runs on
// after the request returns; the page asks for it by its id.
async function startReading(company, { text, pagesNotRead = [] }) {
  if (!aiScope.enabled()) throw fail(503, OFF);
  if (!company) throw fail(401, 'Sign in to have SiteWrite read a methodology.');
  const content = String(text || '');
  if (!content.trim()) throw fail(400, 'There is no text in this file to read.');
  if (content.length > MAX_CHARACTERS) throw fail(413, 'This methodology is too long for one reading. Split it into parts and read each one.');
  const hash = aiScope.fingerprint(content);
  await markStale();
  const kept = await db.one("SELECT * FROM ai_readings WHERE company_id = $1 AND doc_hash = $2 AND brief_version = $3 AND status <> 'failed' ORDER BY created_at DESC LIMIT 1",
    [company.id, hash, METHOD_BRIEF_VERSION]);
  if (kept) return { ...rowOut(kept), kept: true };
  const id = crypto.randomUUID();
  const now = new Date();
  await db.query('INSERT INTO ai_readings (id, company_id, doc_hash, brief_version, model, status, characters, created_at, stage, stage_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $8)',
    [id, company.id, hash, METHOD_BRIEF_VERSION, aiScope.MODEL, 'reading', content.length, now, 'reading']);
  const work = readMethod(content, id)
    .then(async ({ reading, answer, dropped, given, usage, model }) => {
      // The check is of the AI's answer as given, with what was left out of it, for the owner's AI
      // readings page. Only when every step it gave was left out is the reading not used.
      const checks = { ...checkMethodReading(answer, content), dropped, pagesNotRead, unknownStepIds: reading.unknownStepIds || [] };
      const used = !given || reading.steps.length > 0;
      await db.query('UPDATE ai_readings SET status = $2, reading = $3, checks = $4, usage = $5, cost_usd = $6, model = $7, error = $8, finished_at = $9 WHERE id = $1',
        [id, used ? 'done' : 'failed', JSON.stringify(reading), JSON.stringify(checks), JSON.stringify(usage), aiScope.costOf(usage), model,
          used ? '' : 'The AI quoted words that are not in the methodology, so its reading was not used. Try again, or make the job steps match the methodology yourself.', new Date()]);
    })
    .catch(async (error) => {
      const spent = error.usage || {};
      await db.query('UPDATE ai_readings SET status = $2, error = $3, usage = $4, cost_usd = $5, finished_at = $6 WHERE id = $1',
        [id, 'failed', aiScope.errorMessage(error), JSON.stringify(spent), aiScope.costOf(spent), new Date()]).catch(() => {});
    });
  return { id, status: 'reading', kept: false, pagesNotRead, progress: aiScope.progressOf({ status: 'reading', stage: 'reading', created_at: now, characters: content.length }), done: work };
}

async function getReading(company, id) {
  if (!company) throw fail(401, 'Sign in to see this reading.');
  await markStale();
  const row = await db.one('SELECT * FROM ai_readings WHERE id = $1 AND company_id = $2 AND brief_version = $3', [String(id || ''), company.id, METHOD_BRIEF_VERSION]);
  if (!row) throw fail(404, 'That reading was not found.');
  return rowOut(row);
}

module.exports = { methodText, typedPage, checkMethodReading, keptSteps, validMethodReading, startReading, getReading, suggestionsOf, NOT_TYPED, NOT_TYPED_ATTACHED, OFF };
