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
const { BRIEF, BRIEF_VERSION, SCHEMA, PACKAGES, STEPS_BRIEF, STEPS_SCHEMA } = require('./ai-brief');
const { ACTIVITIES } = require('./activities');
const { packageKinds } = require('./draft');
const { packageTask } = require('./public/scope-task');

const MODEL = 'claude-opus-5-5';
// US dollars per million tokens for Claude Opus 5.5, to show what each reading cost.
const PRICE = { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 };
// About 1M tokens of context; a document longer than this is refused, never cut short.
const MAX_CHARACTERS = 2500000;
// A reading still unfinished after this long was cut off (the server restarted mid-reading),
// so it is marked failed and the document can be read again.
const STALE_MINUTES = 30;

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
  // A quote counts as found when only its closing punctuation differs (a list item ending ";" not ".").
  // An ellipsis is a shortened quote unless the document itself has it ("etc…").
  const found = (quote) => {
    const words = normalise(quote).toLowerCase();
    return documentText.includes(words) || documentText.includes(words.replace(/[.;:,]+$/, ''));
  };
  const shortened = allQuotes.filter((item) => /\.\.\.|…/.test(item.quote) && !found(item.quote));
  const notFound = allQuotes.filter((item) => !/\.\.\.|…/.test(item.quote) && !found(item.quote));
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
// One streamed call with structured output. The system prompt is the same for every document,
// so it is cached; a safety decline is re-run on a fallback model rather than lost.
async function callModel({ system, content, schema, effort }) {
  const stream = getClient().beta.messages.stream({
    model: MODEL,
    max_tokens: 128000,
    thinking: { type: 'adaptive' },
    output_config: { effort, format: { type: 'json_schema', schema } },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') throw fail(422, 'The AI could not read this document. Try again later.');
  if (message.stop_reason === 'max_tokens') throw fail(422, 'This document has more work in it than the AI can list in one reading. Split it into parts and read each one.');
  const answer = message.content.filter((block) => block.type === 'text').map((block) => block.text).join('');
  try {
    return { value: JSON.parse(answer), usage: message.usage || {}, model: message.model || MODEL };
  } catch {
    throw fail(502, 'The AI\'s answer could not be read. Try again.');
  }
}

// One call to read the document with the brief: the whole document, nothing trimmed.
async function askModel(text) {
  const { value: reading, usage, model } = await callModel({ system: BRIEF, content: `<document>\n${text}\n</document>`, schema: SCHEMA, effort: 'high' });
  if (!validReading(reading)) throw fail(502, 'The AI\'s answer was not in the expected form. Try again.');
  return { reading, usage, model };
}

// The step library as the AI sees it: each group's id and the job steps in it.
let catalogue = null;
function stepCatalogue() {
  if (!catalogue) {
    const groups = new Map();
    for (const activity of ACTIVITIES) {
      if (!activity.when) continue;
      groups.set(activity.when, [...(groups.get(activity.when) || []), ...activity.steps.map((step) => step.step)]);
    }
    catalogue = { ids: new Set(groups.keys()), steps: groups, text: [...groups].map(([id, names]) => `${id}: ${[...new Set(names)].join('; ')}`).join('\n') };
  }
  return catalogue;
}

// The second, smaller call: the job step groups that cover each work package with site work.
// Ids not in the library are dropped, so a made-up id can never reach a SWMS.
async function mapSteps(reading) {
  const packages = new Map();
  for (const row of reading.activities) {
    if (row.type === 'Duty') continue;
    if (!packages.has(row.package)) packages.set(row.package, []);
    packages.get(row.package).push(row);
  }
  if (!packages.size) return { packages: [], usage: {} };
  const { ids, steps, text } = stepCatalogue();
  const listed = [...packages].map(([name, rows]) => `Work package: ${name}\n${rows.map((row) => `- ${row.activity}${row.plant ? ` | plant: ${row.plant}` : ''}${row.conditions ? ` | conditions: ${row.conditions}` : ''}${row.where ? ` | where: ${row.where}` : ''}`).join('\n')}`).join('\n\n');
  const { value, usage } = await callModel({ system: `${STEPS_BRIEF}\n\n<library>\n${text}\n</library>`, content: listed, schema: STEPS_SCHEMA, effort: 'medium' });
  const chosen = new Map((Array.isArray(value && value.packages) ? value.packages : []).map((item) => [item.package, item]));
  return {
    packages: [...packages.keys()].map((name) => {
      const item = chosen.get(name) || { groups: [], unmatched: [] };
      const groups = [...new Set((item.groups || []).filter((id) => ids.has(id)))];
      // Steps the scope gives to others are kept only when the step really is in that group.
      const byOthers = (Array.isArray(item.byOthers) ? item.byOthers : []).filter((entry) => entry && ids.has(entry.group) && (steps.get(entry.group) || []).includes(entry.step))
        .map((entry) => ({ group: entry.group, step: entry.step, party: String(entry.party || ''), clause: String(entry.clause || ''), says: String(entry.says || '') }));
      return { package: name, groups, byOthers, unknown: (item.groups || []).filter((id) => !ids.has(id)), unmatched: (item.unmatched || []).map(String) };
    }),
    usage,
  };
}

// The usage of both calls, added together.
function addUsage(a = {}, b = {}) {
  const out = { ...a };
  for (const key of ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']) out[key] = (a[key] || 0) + (b[key] || 0);
  return out;
}

function errorMessage(error) {
  if (error.publicMessage) return error.message;
  if (error instanceof Anthropic.RateLimitError) return 'The AI is busy. Try again in a few minutes.';
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return 'The AI reading is not set up on this server.';
  if (error instanceof Anthropic.APIConnectionError) return 'The AI could not be reached. Try again.';
  return 'The AI reading failed. Try again later.';
}

// The same package wording gets the same steps whichever groups the AI chose (task #97):
// rubbish removal and clean-ups get the waste removal steps, not chemical cleaning, and
// defects liability visits get the defects visit steps. Applied as each reading is read
// back, so readings kept from before the change get it too.
function settlePackages(reading) {
  if (!reading || !Array.isArray(reading.packages)) return reading;
  return {
    ...reading,
    packages: reading.packages.map((item) => {
      const rows = (reading.activities || []).filter((row) => row.package === item.package && row.type !== 'Duty');
      return rows.length ? { ...item, groups: packageKinds(packageTask(rows), item.groups || []) } : item;
    }),
  };
}

function rowOut(row) {
  return {
    id: row.id,
    status: row.status,
    reading: row.reading ? settlePackages(JSON.parse(row.reading)) : null,
    checks: row.checks ? JSON.parse(row.checks) : null,
    error: row.error || '',
    briefVersion: row.brief_version,
    createdAt: row.created_at,
  };
}

// Starts a reading, or returns the one already kept for this company and document.
// The reading itself runs on after the request returns; the page asks for it by its id.
async function startReading(company, text) {
  if (!enabled()) throw fail(503, 'The AI reading is not switched on. Try again later, or write the tasks in the Task box.');
  if (!company) throw fail(401, 'Sign in to have the AI read a scope.');
  const content = String(text || '');
  if (!content.trim()) throw fail(400, 'There is no text in this file to read.');
  if (content.length > MAX_CHARACTERS) throw fail(413, 'This document is too long for one reading. Split it into parts and read each one.');
  const hash = fingerprint(content);
  await markStale();
  const kept = await db.one("SELECT * FROM ai_readings WHERE company_id = $1 AND doc_hash = $2 AND brief_version = $3 AND status <> 'failed' ORDER BY created_at DESC LIMIT 1",
    [company.id, hash, BRIEF_VERSION]);
  if (kept) return { ...rowOut(kept), kept: true };
  const id = crypto.randomUUID();
  await db.query('INSERT INTO ai_readings (id, company_id, doc_hash, brief_version, model, status, characters, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [id, company.id, hash, BRIEF_VERSION, MODEL, 'reading', content.length, new Date()]);
  const work = askModel(content)
    .then(async ({ reading: read, usage: readUsage, model }) => {
      const steps = await mapSteps(read);
      const reading = { ...read, packages: steps.packages };
      const usage = addUsage(readUsage, steps.usage);
      const checks = {
        ...checkReading(reading, content),
        packagesWithoutSteps: steps.packages.filter((item) => !item.groups.length).map((item) => item.package),
        unknownStepIds: steps.packages.flatMap((item) => item.unknown),
      };
      await db.query('UPDATE ai_readings SET status = $2, reading = $3, checks = $4, usage = $5, cost_usd = $6, model = $7, finished_at = $8 WHERE id = $1',
        [id, 'done', JSON.stringify(reading), JSON.stringify(checks), JSON.stringify(usage), costOf(usage), model, new Date()]);
    })
    .catch(async (error) => {
      await db.query('UPDATE ai_readings SET status = $2, error = $3, finished_at = $4 WHERE id = $1', [id, 'failed', errorMessage(error), new Date()]).catch(() => {});
    });
  return { id, status: 'reading', kept: false, done: work };
}

async function markStale() {
  await db.query("UPDATE ai_readings SET status = 'failed', error = $1, finished_at = $2 WHERE status = 'reading' AND created_at < $3",
    ['The reading was interrupted. Try again.', new Date(), new Date(Date.now() - STALE_MINUTES * 60 * 1000)]);
}

async function getReading(company, id) {
  if (!company) throw fail(401, 'Sign in to see this reading.');
  await markStale();
  const row = await db.one('SELECT * FROM ai_readings WHERE id = $1 AND company_id = $2', [String(id || ''), company.id]);
  if (!row) throw fail(404, 'That reading was not found.');
  return rowOut(row);
}

module.exports = { enabled, useClient, startReading, getReading, checkReading, validReading, costOf, fingerprint, normalise, mapSteps, settlePackages, stepCatalogue, callModel, MODEL };
