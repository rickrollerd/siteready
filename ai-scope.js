// Reading a scope of works with the AI (Claude Opus 5.5 and brief v3, the owner's choice of
// 4 October 2026). Every word of the document is sent; nothing is trimmed. The reading is kept
// against the company and the document's fingerprint, so the same document read again by the
// same account costs nothing, and no other account ever sees it.
//
// It is switched off until ANTHROPIC_API_KEY is set (AI_SCOPE=off turns it off again), and the
// keyword reader in scope.js stays as the fallback.
//
// Each reading is checked against the brief before it is used (quotes word for word, no "...",
// package names from the list), and the result is kept with it, so the owner can check the
// output against the brief on a regular basis.
const crypto = require('crypto');
const Anthropic = require('@anthropic-ai/sdk');
const db = require('./db');
const { BRIEF, BRIEF_VERSION, SCHEMA, PACKAGES } = require('./ai-brief');

const MODEL = 'claude-opus-5-5';
// US dollars per million tokens for Claude Opus 5.5, to show what each reading cost.
const PRICE = { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 };
// About 1M tokens of context; a document longer than this is refused, never cut short.
const MAX_CHARACTERS = 2500000;

let client = null;

function enabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY) && process.env.AI_SCOPE !== 'off';
}

// Tests pass in a stand-in with the same messages interface.
function useClient(next) {
  client = next;
}

function getClient() {
  if (!client) client = new Anthropic({ maxRetries: 2 });
  return client;
}

function fail(status, message) {
  return Object.assign(new Error(message), { status, publicMessage: true });
}

function fingerprint(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

// Quotes are compared with spacing, quote marks, apostrophes and dashes made the same.
function normalise(value) {
  return String(value || '')
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/[   ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// The reading checked against the brief. A quote that is not in the document, or has "..."
// in it, breaks rule 4; a package name that is neither on the list nor "Trade installation:"
// is allowed by rule 4 but counted, as a sign the packages are drifting.
function checkReading(reading, text) {
  const documentText = normalise(text).toLowerCase();
  const allQuotes = [
    ...reading.activities.flatMap((row) => row.quotes.map((quote) => ({ quote, where: `Activity: ${row.activity}` }))),
    ...reading.byOthers.flatMap((row) => row.quotes.map((quote) => ({ quote, where: `By others: ${row.work}` }))),
    ...reading.conflicts.flatMap((row) => [{ quote: row.quoteA, where: `Conflict: ${row.clauseA}` }, { quote: row.quoteB, where: `Conflict: ${row.clauseB}` }]),
  ].filter((item) => normalise(item.quote));
  const shortened = allQuotes.filter((item) => /\.\.\.|…/.test(item.quote));
  const notFound = allQuotes.filter((item) => !/\.\.\.|…/.test(item.quote) && !documentText.includes(normalise(item.quote).toLowerCase()));
  const packages = [...new Set(reading.activities.map((row) => row.package))];
  const otherPackages = packages.filter((name) => !PACKAGES.includes(name) && !/^Trade installation:/i.test(name));
  const noQuote = reading.activities.filter((row) => !row.quotes.some((quote) => normalise(quote)));
  const noActivity = reading.activities.filter((row) => !normalise(row.activity));
  return {
    activities: reading.activities.length,
    byOthers: reading.byOthers.length,
    conflicts: reading.conflicts.length,
    quotes: allQuotes.length,
    quotesNotFound: notFound.map((item) => ({ where: item.where, quote: item.quote.slice(0, 300) })),
    quotesShortened: shortened.map((item) => ({ where: item.where, quote: item.quote.slice(0, 300) })),
    packages: packages.length,
    otherPackages,
    rowsWithoutQuote: noQuote.map((row) => row.activity),
    rowsWithoutActivity: noActivity.length,
    passed: notFound.length === 0 && shortened.length === 0 && noQuote.length === 0 && noActivity.length === 0,
  };
}

// The JSON the model returns must have the shape the brief asks for.
function validReading(value) {
  const list = (items, keys) => Array.isArray(items) && items.every((item) => item && typeof item === 'object'
    && keys.every((key) => (key === 'quotes' ? Array.isArray(item.quotes) && item.quotes.every((quote) => typeof quote === 'string') : typeof item[key] === 'string')));
  return Boolean(value)
    && list(value.activities, ['activity', 'type', 'package', 'crew', 'clause', 'quotes', 'where', 'plant', 'conditions', 'unknowns', 'matrixColumn'])
    && list(value.byOthers, ['work', 'party', 'clause', 'quotes'])
    && list(value.conflicts, ['clauseA', 'quoteA', 'clauseB', 'quoteB', 'why', 'confidence']);
}

function costOf(usage = {}) {
  const dollars = ((usage.input_tokens || 0) * PRICE.input
    + (usage.output_tokens || 0) * PRICE.output
    + (usage.cache_creation_input_tokens || 0) * PRICE.cacheWrite
    + (usage.cache_read_input_tokens || 0) * PRICE.cacheRead) / 1e6;
  return Math.round(dollars * 10000) / 10000;
}

// One call to the model: the brief as the system prompt (the same for every document, so it
// is cached), the whole document as the message, and the answer in the brief's JSON shape.
async function askModel(text) {
  const stream = getClient().beta.messages.stream({
    model: MODEL,
    max_tokens: 128000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
    // If a safety check declines the request, it is re-run on a fallback model rather than lost.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: BRIEF, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `<document>\n${text}\n</document>` }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') throw fail(422, 'The AI could not read this document. Use the quick read, and check every task.');
  if (message.stop_reason === 'max_tokens') throw fail(422, 'This document has more work in it than the AI can list in one reading. Split it into parts and read each one.');
  const answer = message.content.filter((block) => block.type === 'text').map((block) => block.text).join('');
  let reading;
  try {
    reading = JSON.parse(answer);
  } catch {
    throw fail(502, 'The AI\'s answer could not be read. Try again.');
  }
  if (!validReading(reading)) throw fail(502, 'The AI\'s answer was not in the expected form. Try again.');
  return { reading, usage: message.usage || {}, model: message.model || MODEL };
}

function errorMessage(error) {
  if (error.publicMessage) return error.message;
  if (error instanceof Anthropic.RateLimitError) return 'The AI is busy. Try again in a few minutes.';
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return 'The AI reading is not set up on this server.';
  if (error instanceof Anthropic.APIConnectionError) return 'The AI could not be reached. Try again.';
  return 'The AI reading failed. Try again, or use the quick read.';
}

function rowOut(row) {
  return {
    id: row.id,
    status: row.status,
    reading: row.reading ? JSON.parse(row.reading) : null,
    checks: row.checks ? JSON.parse(row.checks) : null,
    error: row.error || '',
    briefVersion: row.brief_version,
    createdAt: row.created_at,
  };
}

// Starts a reading, or returns the one already kept for this company and document.
// The reading itself runs on after the request returns; the page asks for it by its id.
async function startReading(company, text) {
  if (!enabled()) throw fail(503, 'The AI reading is not switched on. Use the quick read.');
  if (!company) throw fail(401, 'Sign in to have the AI read a scope.');
  const content = String(text || '');
  if (!content.trim()) throw fail(400, 'There is no text in this file to read.');
  if (content.length > MAX_CHARACTERS) throw fail(413, 'This document is too long for one reading. Split it into parts and read each one.');
  const hash = fingerprint(content);
  const kept = await db.one("SELECT * FROM ai_readings WHERE company_id = $1 AND doc_hash = $2 AND brief_version = $3 AND status <> 'failed' ORDER BY created_at DESC LIMIT 1",
    [company.id, hash, BRIEF_VERSION]);
  if (kept) return { ...rowOut(kept), kept: true };
  const id = crypto.randomUUID();
  await db.query('INSERT INTO ai_readings (id, company_id, doc_hash, brief_version, model, status, characters, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [id, company.id, hash, BRIEF_VERSION, MODEL, 'reading', content.length, new Date()]);
  const work = askModel(content)
    .then(async ({ reading, usage, model }) => {
      const checks = checkReading(reading, content);
      await db.query('UPDATE ai_readings SET status = $2, reading = $3, checks = $4, usage = $5, cost_usd = $6, model = $7, finished_at = $8 WHERE id = $1',
        [id, 'done', JSON.stringify(reading), JSON.stringify(checks), JSON.stringify(usage), costOf(usage), model, new Date()]);
    })
    .catch(async (error) => {
      await db.query('UPDATE ai_readings SET status = $2, error = $3, finished_at = $4 WHERE id = $1', [id, 'failed', errorMessage(error), new Date()]).catch(() => {});
    });
  return { id, status: 'reading', kept: false, done: work };
}

async function getReading(company, id) {
  if (!company) throw fail(401, 'Sign in to see this reading.');
  const row = await db.one('SELECT * FROM ai_readings WHERE id = $1 AND company_id = $2', [String(id || ''), company.id]);
  if (!row) throw fail(404, 'That reading was not found.');
  return rowOut(row);
}

module.exports = { enabled, useClient, startReading, getReading, checkReading, validReading, costOf, fingerprint, normalise, MODEL };
