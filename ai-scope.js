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
const { packageKinds, suggestedKinds, screenHighRisk } = require('./draft');
const { findState } = require('./legislation');
const { TITLES } = require('./scope');
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
// After that, packages that are one SWMS are made one (owner decisions of 7 October 2026, below).
function settlePackages(reading) {
  if (!reading || !Array.isArray(reading.packages)) return reading;
  const settled = settleGroups(reading, () => true);
  const merged = oneForTheProject(oneJumpform(settled));
  if (merged === settled) return settled;
  const out = settleGroups(merged, (item) => item.merged);
  return { ...out, packages: out.packages.map(({ merged: _merged, ...item }) => item) };
}

function settleGroups(reading, which) {
  return {
    ...reading,
    packages: reading.packages.map((item) => {
      const rows = siteRows(reading, item.package);
      return rows.length && which(item) ? { ...item, groups: packageKinds(packageTask(rows), item.groups || []) } : item;
    }),
  };
}

const siteRows = (reading, name) => (reading.activities || []).filter((row) => row.package === name && row.type !== 'Duty');

// The groups each activity's own words name, among the groups the package has, counted. Every word
// counts here, as when packages were first grouped; the job steps leave out words for others' work.
function groupVotes(rows, groups) {
  const votes = new Map();
  for (const row of rows) for (const id of suggestedKinds(packageTask([row]), {}, { allWords: true })) if (groups.includes(id)) votes.set(id, (votes.get(id) || 0) + 1);
  return votes;
}

// A package's main work: the group most of its activities name, with the AI's order breaking a tie,
// and whether its own words name it at all (named) or only the AI chose it.
function mainGroup(rows, groups) {
  const votes = groupVotes(rows, groups);
  const main = groups.reduce((best, id) => ((votes.get(id) || 0) > (votes.get(best) || 0) ? id : best), groups[0] || null);
  return { main, named: votes.has(main) };
}

// A jumpform or self-climbing formwork system is one SWMS covering install, climbing, maintenance
// and dismantling (owner, 7 October 2026: "Are they installing a jumpform, then 1 SWMS covers the
// whole lot"). The owner's formwork subcontract put its climbing platform under Access equipment
// and its self-climbing formwork hoists under Plant lifting and cranage. Every activity that names
// the system (its platform, screens or hoists) comes into one package with the jumpform steps, and
// brings the groups its own words name from the package it was in. A mast climbing work platform
// and a self-climbing builder's hoist are not formwork, so they stay where they are.
const CLIMBING = /\b(?:jump ?forms?|self[- ]climbing (?:form\w*|systems?|platforms?)|(?<!mast[- ])climbing (?:form\w*|platforms?)|climb ?trac\w*)\b/i;
const JUMPFORM_PACKAGE = 'Jumpform: install, climb, maintain and dismantle';

function oneJumpform(reading) {
  const climbing = (reading.activities || []).filter((row) => row.type !== 'Duty' && CLIMBING.test(`${row.activity} ${row.plant || ''}`));
  const from = [...new Set(climbing.map((row) => row.package))];
  if (!climbing.length || (from.length === 1 && siteRows(reading, from[0]).every((row) => climbing.includes(row)))) return reading;
  const groups = ['jumpform'];
  const packages = reading.packages.map((item) => {
    if (!from.includes(item.package)) return item;
    const own = item.groups || [];
    const moved = groupVotes(climbing.filter((row) => row.package === item.package), own);
    const kept = groupVotes(siteRows(reading, item.package).filter((row) => !climbing.includes(row)), own);
    for (const id of moved.keys()) if (!groups.includes(id)) groups.push(id);
    // A group only the moved activities named goes with them.
    return { ...item, groups: own.filter((id) => id !== 'jumpform' && !(moved.has(id) && !kept.has(id))), merged: true };
  });
  const activities = reading.activities.map((row) => (climbing.includes(row) ? { ...row, package: JUMPFORM_PACKAGE } : row));
  const first = packages.findIndex((item) => from.includes(item.package));
  const jumpform = { package: JUMPFORM_PACKAGE, groups, byOthers: [], unknown: [], unmatched: [], merged: true };
  packages.splice(first < 0 ? packages.length : first, 0, jumpform);
  // A package left with no activities at all goes.
  return { ...reading, activities, packages: packages.filter((item) => activities.some((row) => row.package === item.package)) };
}

// One SWMS for the same work wherever it is done (owner, 7 October 2026: "One SWMS that covers all
// of the project for this task is sufficient"). The owner's formwork subcontract came back as eight
// formwork packages by area (basement, each tower, columns, stairs, all buildings) and one for
// falsework and propping. Packages read as "Trade installation: [area]" with the same main group
// become one package for the whole project, and each activity keeps its area in its where-note.
// An area the AI found no job step groups for joins them when its activities' own words name that
// main group (the fixings and sundries to complete the fences, in a fencing scope).
// Areas are merged only around at least one whose activities' own words name the main group, so two
// areas the AI gave the same general group (fixings for cell shrouds and for LPG cages) stay apart.
// A package with a name of its own joins them only when its main group is the same and it brings
// no other groups (falsework and propping in a formwork scope; perimeter screens and edge protection
// have other main work, so they stay their own). Materials handling, waste, cleaning, protection and
// site set-up stay their own whatever their groups. The packages on the brief's list (cranage, access
// equipment, penetrations, hot works and the rest) are each one kind of work already, so they are
// never merged into another.
const TRADE_INSTALLATION = /^Trade installation:\s*/i;
const SITE_SUPPORT = /\b(?:materials?|handling|storage|deliver\w*|waste|rubbish|clean\w*|housekeeping|protect\w*|establishment|set[- ]?up|traffic|exclusion|barricad\w*)\b/i;

function oneForTheProject(reading) {
  const listed = new Set(PACKAGES);
  const read = reading.packages
    .filter((item) => !listed.has(item.package) && item.package !== JUMPFORM_PACKAGE && (item.groups || []).length && siteRows(reading, item.package).length)
    .map((item) => ({ item, ...mainGroup(siteRows(reading, item.package), item.groups) }))
    .filter((entry) => entry.main !== 'jumpform');
  const byMain = new Map();
  for (const entry of read) if (TRADE_INSTALLATION.test(entry.item.package)) byMain.set(entry.main, [...(byMain.get(entry.main) || []), entry]);
  const renamed = new Map();
  const names = new Set(reading.packages.map((item) => item.package));
  for (const [main, located] of byMain) {
    const groups = [...new Set(located.flatMap((entry) => entry.item.groups))];
    if (!located.some((entry) => entry.named)) continue;
    const joining = read.filter((entry) => !TRADE_INSTALLATION.test(entry.item.package) && !SITE_SUPPORT.test(entry.item.package)
      && entry.main === main && entry.item.groups.every((id) => groups.includes(id)));
    // An area the AI found no groups for joins when its activities' own words name the main group.
    const ungrouped = reading.packages.filter((item) => TRADE_INSTALLATION.test(item.package) && !(item.groups || []).length && siteRows(reading, item.package).length
      && siteRows(reading, item.package).some((row) => suggestedKinds(packageTask([row]), {}, { allWords: true }).includes(main))).map((item) => ({ item }));
    const members = [...located, ...joining, ...ungrouped];
    if (members.length < 2) continue;
    // Named for the work where SiteReady has a name for it ("Formwork and falsework"), as the quick read does.
    let name = `${TITLES[main] || 'Trade installation'}: whole project`;
    if (names.has(name)) name = `Trade installation: ${located.map((entry) => entry.item.package.replace(TRADE_INSTALLATION, '')).join(', ')}`;
    names.add(name);
    for (const entry of members) renamed.set(entry.item.package, name);
  }
  if (!renamed.size) return reading;
  // Each activity keeps the area its package was read for, unless its where-note already says it.
  const activities = reading.activities.map((row) => {
    const name = renamed.get(row.package);
    if (!name) return row;
    const area = TRADE_INSTALLATION.test(row.package) ? row.package.replace(TRADE_INSTALLATION, '').trim() : '';
    const where = String(row.where || '').trim();
    const kept = !area || where.toLowerCase().includes(area.toLowerCase()) ? where : where ? `${area}: ${where}` : area;
    return { ...row, package: name, where: kept };
  });
  const packages = [];
  for (const item of reading.packages) {
    const name = renamed.get(item.package);
    if (!name) { packages.push(item); continue; }
    const into = packages.find((other) => other.package === name);
    if (!into) { packages.push({ ...item, package: name, groups: [...(item.groups || [])], byOthers: [...(item.byOthers || [])], unmatched: [...(item.unmatched || [])], from: [item], merged: true }); continue; }
    for (const id of item.groups || []) if (!into.groups.includes(id)) into.groups.push(id);
    for (const text of item.unmatched || []) if (!into.unmatched.includes(text)) into.unmatched.push(text);
    for (const entry of item.byOthers || []) if (!into.byOthers.some((other) => other.group === entry.group && other.step === entry.step)) into.byOthers.push(entry);
    into.from.push(item);
  }
  // A step one area gives to others stays out only where every area doing that group's work
  // says so: Contractor-supplied high propping in two voids does not take falsework out of the
  // formwork SWMS when this subcontractor erects falsework everywhere else.
  return {
    ...reading,
    activities,
    packages: packages.map(({ from, ...item }) => (from ? {
      ...item,
      byOthers: item.byOthers.filter((entry) => from.every((part) => !(part.groups || []).includes(entry.group) || (part.byOthers || []).some((other) => other.group === entry.group && other.step === entry.step))),
    } : item)),
  };
}

// Goal 4: each work package with site work is flagged with the high risk construction work its
// SWMS would list before any question is answered, by the SWMS's own rules (draft.js). The task is
// the one its task card sends, with the package's job step groups, and with the steps the scope
// gives to others left out, as the card leaves them out unless the user says otherwise. The AI's
// quotes are read only to settle a "likely" (a height, a depth or traffic the activities leave
// out): on their own they also name general clauses and other trades' work, so they add nothing.
// Worked out each time a reading is read back, so a rule change reaches kept readings too, and
// kept for the last readings asked for. Each package waits its turn, so a long scope does not hold
// up other requests.
const FLAGS_KEPT = 100;
const flagsKept = new Map();
async function packageHighRisk(reading, state) {
  const out = [];
  const steps = new Map((reading.packages || []).map((item) => [item.package, item]));
  const names = [...new Set((reading.activities || []).map((row) => row.package || 'Other work'))];
  for (const name of names) {
    const rows = (reading.activities || []).filter((row) => (row.package || 'Other work') === name && row.type !== 'Duty');
    if (!rows.length) continue;
    // Work the AI read as done off site (a workshop, a factory) is not construction work on site.
    if (rows.every((row) => row.type === 'Off-site work')) {
      out.push({ package: name, categories: [], dependsOn: [], offSite: true });
      continue;
    }
    const chosen = steps.get(name);
    const input = { state, task: packageTask(rows), kinds: chosen ? chosen.groups : null, leaveOut: chosen ? (chosen.byOthers || []).map((entry) => entry.step) : [] };
    out.push({ package: name, ...screenHighRisk(input, rows.flatMap((row) => row.quotes || []).join('\n')) });
    await new Promise((resolve) => { setImmediate(resolve); });
  }
  return out;
}

// The state picked on the form names the categories; Queensland when none is given, as the quick read does.
async function withHighRisk(out, stateName) {
  if (!out.reading) return out;
  const state = (findState(stateName) || findState('qld')).id;
  const key = `${out.id}:${out.briefVersion}:${state}`;
  if (!flagsKept.has(key)) {
    flagsKept.set(key, await packageHighRisk(out.reading, state));
    if (flagsKept.size > FLAGS_KEPT) flagsKept.delete(flagsKept.keys().next().value);
  }
  return { ...out, reading: { ...out.reading, highRisk: flagsKept.get(key) }, state };
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
async function startReading(company, text, stateName) {
  if (!enabled()) throw fail(503, 'The AI reading is not switched on. Try again later, or write the tasks in the Task box.');
  if (!company) throw fail(401, 'Sign in to have the AI read a scope.');
  const content = String(text || '');
  if (!content.trim()) throw fail(400, 'There is no text in this file to read.');
  if (content.length > MAX_CHARACTERS) throw fail(413, 'This document is too long for one reading. Split it into parts and read each one.');
  const hash = fingerprint(content);
  await markStale();
  const kept = await db.one("SELECT * FROM ai_readings WHERE company_id = $1 AND doc_hash = $2 AND brief_version = $3 AND status <> 'failed' ORDER BY created_at DESC LIMIT 1",
    [company.id, hash, BRIEF_VERSION]);
  if (kept) return { ...(await withHighRisk(rowOut(kept), stateName)), kept: true };
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

async function getReading(company, id, stateName) {
  if (!company) throw fail(401, 'Sign in to see this reading.');
  await markStale();
  const row = await db.one('SELECT * FROM ai_readings WHERE id = $1 AND company_id = $2', [String(id || ''), company.id]);
  if (!row) throw fail(404, 'That reading was not found.');
  return withHighRisk(rowOut(row), stateName);
}

module.exports = { enabled, useClient, startReading, getReading, checkReading, validReading, costOf, fingerprint, normalise, mapSteps, settlePackages, packageHighRisk, stepCatalogue, callModel, MODEL };
