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
const { readSlang } = require('./slang');
const { expectedSeconds } = require('./public/read-progress');
const { plantFromWords, packWords } = require('./handover');

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
// Whether a quote is in the document word for word. A quote counts as found when only its closing
// punctuation differs (a list item ending ";" not "."). Also used for written methodologies (method-read.js).
function quoteFinder(text) {
  const documentText = normalise(text).toLowerCase();
  return (quote) => {
    const words = normalise(quote).toLowerCase();
    return documentText.includes(words) || documentText.includes(words.replace(/[.;:,]+$/, ''));
  };
}

function checkReading(reading, text) {
  const allQuotes = [
    ...reading.activities.flatMap((row) => row.quotes.map((quote) => ({ quote, where: `Activity: ${row.activity}` }))),
    ...reading.byOthers.flatMap((row) => row.quotes.map((quote) => ({ quote, where: `By others: ${row.work}` }))),
    ...reading.conflicts.flatMap((row) => [{ quote: row.quoteA, where: `Conflict: ${row.clauseA}` }, { quote: row.quoteB, where: `Conflict: ${row.clauseB}` }]),
  ].filter((item) => normalise(item.quote));
  // An ellipsis is a shortened quote unless the document itself has it ("etc…").
  const found = quoteFinder(text);
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

// One server log line for each failed reading (scope or methodology), so a failure on a server can
// be diagnosed from its log: the error's class, HTTP status, the API's error type and message, the
// request id and the model. Never the key or any header: the key, if it ever appeared in the text, is
// taken out, and the line is cut short.
function failureLine(error) {
  const body = error && error.error && typeof error.error === 'object' ? (error.error.error || error.error) : {};
  const type = typeof body.type === 'string' && body.type !== 'error' ? body.type : '';
  const message = typeof body.message === 'string' ? body.message : String((error && error.message) || error || '');
  let line = ['AI reading failed:', (error && error.constructor && error.constructor.name) || 'Error', error && error.status, type, message,
    error && error.requestID ? `request ${error.requestID}` : '', `(model ${MODEL})`].filter(Boolean).join(' ').replace(/\s+/g, ' ');
  const key = process.env.ANTHROPIC_API_KEY;
  if (key) line = line.split(key).join('[key]');
  return line.replace(/\bsk-ant-[A-Za-z0-9_-]+/g, '[key]').slice(0, 600);
}
let logFailure = (line) => console.error(line);
// Tests read the line here instead of the log.
function useFailureLog(next) {
  logFailure = next || ((line) => console.error(line));
}

// What the user is told when a reading fails, unchanged; the details go to the server log only.
function errorMessage(error) {
  try { logFailure(failureLine(error)); } catch { /* logging never stops the reading being marked failed */ }
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
  const settled = settleGroups(dutiesAsDuties(reading), () => true);
  const merged = namedByWork(finishingWithThePour(ownTradeOutOfFormwork(edgeProtectionByWork(penetrationsByWork(oneForTheProject(oneJumpform(settled)))))));
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
// An activity's conditions ("washout bay only", "night pours") are not its work, so they name no group.
function groupVotes(rows, groups) {
  const votes = new Map();
  for (const row of rows) for (const id of ownGroups(row)) if (groups.includes(id)) votes.set(id, (votes.get(id) || 0) + 1);
  return votes;
}
const ownGroups = (row) => suggestedKinds(readSlang(packageTask([{ ...row, conditions: '' }])), {}, { allWords: true });

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
    // Named for the work where SiteWrite has a name for it ("Formwork and falsework"), as the quick read does.
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

// Holding tickets, licences or a verification of competency, and showing the evidence, is a duty,
// not work in a package's SWMS (owner testing, 13 October 2026: "Hold and evidence tickets and VOC
// for cranes, dogging, rigging and plant operation" sat in the cranage package).
const TICKET_DUTY = /^(?:hold|have|carry|keep|provide|show|submit|maintain|evidence)\b[^.]*\b(?:tickets?|licen[cs]es?|vocs?|verifications? of competenc\w*|qualifications?|certifications?)\b/i;
const TICKET_WORK = /\b(?:install\w*|erect\w*|lift\w*|sling\w*|operat\w* (?:the|a|an)\b|dismantl\w*|pour\w*|fix\w*|cut\w*|drill\w*|dig\w*|excavat\w*)\b/i;

function dutiesAsDuties(reading) {
  const duty = (row) => row.type !== 'Duty' && TICKET_DUTY.test(String(row.activity || '').trim()) && !TICKET_WORK.test(String(row.activity || '').replace(/\bfor\b.*$/i, ''));
  if (!(reading.activities || []).some(duty)) return reading;
  return { ...reading, activities: reading.activities.map((row) => (duty(row) ? { ...row, type: 'Duty' } : row)) };
}

// Penetrations are not all core drilling (owner testing, 13 October 2026: "Incorrect, this is for
// forming up penetrations, not drilling them"). The brief's "Penetrations and core drilling" package
// is for cutting or drilling through built elements. Forming penetrations, openings and recesses
// in the formwork goes with the formwork work, whose steps form them; covering penetrations goes
// with edge protection, whose steps cover them. Cutting, drilling and sealing stay where they are.
const PENETRATION_PACKAGE = /\b(?:penetrations?|core[- ]?drill\w*|coring)\b/i;
// Work through a built element ("openings through the precast walls") is cutting, not forming.
const CUT_OR_DRILL = /\b(?:core[- ]?drill\w*|coring|core holes?|drill\w*|cut\w*|saw\w*|chas\w*|break\w* out|demoli\w*|scabbl\w*|jackhammer\w*|grind\w*|seal\w*|fire[- ]?stop\w*|collars?|through)\b/i;
const FORMED = /\b(?:form(?:s|ed|ing)?(?: up)?|box(?:es|ed|ing)? out|block[- ]?outs?|void formers?|recess formers?)\b/i;
const OPENING = /\b(?:penetrations?|openings?|recess\w*|voids?|block[- ]?outs?|set[- ]?downs?|holes?)\b/i;
const COVERED = /\b(?:cover\w*|barricad\w*|guard\w*|protect\w*|handrails?|mesh)\b/i;
const EDGE_PACKAGE = /\b(?:edge protection|fall (?:prevention|protection)|handrails?|guardrails?)\b/i;
const FORMWORK_PACKAGE = /\b(?:form ?work|falsework)\b/i;
const COVERS_PACKAGE = 'Edge protection and penetration covers';
const FORMING_PACKAGE = 'Forming penetrations, openings and recesses';

function penetrationsByWork(reading) {
  const sources = reading.packages.filter((item) => PENETRATION_PACKAGE.test(item.package) && !FORMWORK_PACKAGE.test(item.package) && !EDGE_PACKAGE.test(item.package));
  const whereTo = new Map();
  for (const source of sources) {
    for (const row of siteRows(reading, source.package)) {
      const words = `${row.activity} ${row.plant || ''}`;
      if (CUT_OR_DRILL.test(words) || !OPENING.test(row.activity)) continue;
      if (FORMED.test(row.activity)) whereTo.set(row, 'form');
      else if (COVERED.test(row.activity)) whereTo.set(row, 'cover');
    }
  }
  if (!whereTo.size) return reading;
  const others = reading.packages.filter((item) => !sources.includes(item) && item.package !== JUMPFORM_PACKAGE && siteRows(reading, item.package).length);
  const formwork = others.find((item) => FORMWORK_PACKAGE.test(item.package)) || others.find((item) => (item.groups || []).includes('formwork') && mainGroup(siteRows(reading, item.package), item.groups).main === 'formwork');
  const edge = others.find((item) => EDGE_PACKAGE.test(item.package)) || others.find((item) => (item.groups || []).includes('edgeProtectionInstall') && !/\bscreens?\b/i.test(item.package));
  const target = { form: formwork ? formwork.package : FORMING_PACKAGE, cover: edge ? edge.package : COVERS_PACKAGE };
  // With no formwork or edge protection package to go to, forming or covering stays with drilling
  // work in the same package (a services trade's penetrations SWMS); only a package with nothing
  // else in it becomes a package of its own.
  for (const source of sources) {
    const rows = siteRows(reading, source.package);
    if (rows.every((row) => whereTo.has(row))) continue;
    for (const row of rows) if ((whereTo.get(row) === 'form' && !formwork) || (whereTo.get(row) === 'cover' && !edge)) whereTo.delete(row);
  }
  if (!whereTo.size) return reading;
  const activities = reading.activities.map((row) => (whereTo.has(row) ? { ...row, package: target[whereTo.get(row)] } : row));
  const movedOut = (item) => [...whereTo.keys()].filter((row) => row.package === item.package);
  const packages = reading.packages.map((item) => {
    if (!sources.includes(item)) return item;
    const moved = movedOut(item);
    if (!moved.length) return item;
    const own = item.groups || [];
    const left = groupVotes(siteRows(reading, item.package).filter((row) => !whereTo.has(row)), own);
    const gone = groupVotes(moved, own);
    // A group only the moved activities named goes with them; the rest stays for the drilling.
    return { ...item, groups: own.filter((id) => !(gone.has(id) && !left.has(id))), unmatched: (item.unmatched || []).filter((text) => !moved.some((row) => row.activity === text)), merged: true };
  });
  let inserted = 0;
  for (const kind of ['form', 'cover']) {
    const rows = [...whereTo].filter(([, to]) => to === kind).map(([row]) => row);
    if (!rows.length) continue;
    // The formwork steps form penetrations and the edge protection steps cover them, so an activity
    // the AI found no steps for in the drilling package is covered once it is there.
    const covering = kind === 'form' ? 'formwork' : 'edgeProtectionInstall';
    const unmatched = sources.flatMap((item) => (item.unmatched || []).filter((text) => rows.some((row) => row.activity === text)));
    const at = packages.findIndex((item) => item.package === target[kind]);
    if (at >= 0) {
      const into = packages[at];
      const carried = (into.groups || []).includes(covering) ? [] : unmatched;
      packages[at] = { ...into, unmatched: [...new Set([...(into.unmatched || []), ...carried])], merged: true };
      continue;
    }
    // No formwork or edge protection package in this scope: the work becomes its own, with the groups its own words name.
    const groups = kind === 'cover' ? ['edgeProtectionInstall'] : [...new Set(sources.flatMap((item) => [...groupVotes(rows.filter((row) => row.package === item.package), item.groups || []).keys()]))];
    const first = packages.findIndex((item) => sources.includes(item));
    packages.splice(first + 1 + inserted, 0, { package: target[kind], groups, byOthers: [], unknown: [], unmatched: groups.includes(covering) ? [] : unmatched, merged: true });
    inserted += 1;
  }
  // A package left with no activities at all goes.
  return { ...reading, activities, packages: packages.filter((item) => activities.some((row) => row.package === item.package)) };
}

// ---- The same work in the same package, under the same name, whichever way the AI read it ----
// (messy-user test, 14 October 2026: one scope read twice came back as 8 packages and as 6; edge
// protection was once "Access equipment", which maps to no task; reinforcement was once read into the
// formwork package and once named "Trade installation: suspended slabs and stairs", with no trade.)

// Moves the activities to the package named into, made with the groups given when there is none, and
// takes from each package they leave a group only they named. A package left with nothing goes.
function moveActivities(reading, moving, into, groups) {
  if (!moving.size) return reading;
  const from = new Set([...moving].map((row) => row.package));
  const packages = reading.packages.map((item) => {
    if (!from.has(item.package) || item.package === into) return item;
    const own = item.groups || [];
    const rows = siteRows(reading, item.package);
    const left = groupVotes(rows.filter((row) => !moving.has(row)), own);
    const gone = groupVotes(rows.filter((row) => moving.has(row)), own);
    // Activities left with no group at all keep the package's groups, so they still get job steps.
    const kept = own.filter((id) => !(gone.has(id) && !left.has(id)));
    return { ...item, groups: kept.length ? kept : own, unmatched: (item.unmatched || []).filter((text) => ![...moving].some((row) => row.activity === text)), merged: true };
  });
  const at = packages.findIndex((item) => item.package === into);
  if (at >= 0) packages[at] = { ...packages[at], groups: [...new Set([...(packages[at].groups || []), ...groups])], merged: true };
  else {
    const first = packages.findIndex((item) => from.has(item.package));
    packages.splice(first + 1, 0, { package: into, groups, byOthers: [], unknown: [], unmatched: [], merged: true });
  }
  const activities = reading.activities.map((row) => (moving.has(row) ? { ...row, package: into } : row));
  return { ...reading, activities, packages: packages.filter((item) => activities.some((row) => row.package === item.package)) };
}

// The package for one kind of work: the one named for it, or the one whose activities name it most.
function packageFor(reading, pattern, group, not = []) {
  const others = reading.packages.filter((item) => !not.includes(item.package) && item.package !== JUMPFORM_PACKAGE && siteRows(reading, item.package).length);
  return others.find((item) => pattern.test(item.package))
    || others.find((item) => (item.groups || []).includes(group) && mainGroup(siteRows(reading, item.package), item.groups).main === group);
}

// Edge protection is not access equipment. Installing, keeping and removing edge protection, guardrails
// and penetration covers, read into the brief's "Access equipment" package, goes to the edge protection
// package (made where there is none), whose steps install it. Ladders, EWPs and scaffolds stay.
const ACCESS_PACKAGE = /^access equipment$/i;
const EDGE_WORK = /\b(?:edge protection|guard ?rails?|handrails?|penetration covers?|void protection|cover\w*\b[^.]{0,40}\b(?:penetrations?|openings?|voids?))\b/i;
const ACCESS_WORK = /\b(?:ewps?|elevat\w* work platforms?|scissor lifts?|boom lifts?|ladders?|a-frames?|trestles?|scaffold\w*|stair towers?|temporary stairs?|stair ?masters?|access (?:platforms?|stairs?)|working platforms?|hoists?|mast climb\w*|swing stages?|harness\w*)\b/i;
const EDGE_NAME = 'Edge protection';

function edgeProtectionByWork(reading) {
  const moving = new Set(reading.packages.filter((item) => ACCESS_PACKAGE.test(item.package))
    .flatMap((item) => siteRows(reading, item.package)).filter((row) => EDGE_WORK.test(row.activity) && !ACCESS_WORK.test(`${row.activity} ${row.plant || ''}`)));
  if (!moving.size) return reading;
  const edge = reading.packages.find((item) => !ACCESS_PACKAGE.test(item.package) && EDGE_PACKAGE.test(item.package) && !/\bscreens?\b/i.test(item.package) && siteRows(reading, item.package).length);
  return moveActivities(reading, moving, edge ? edge.package : EDGE_NAME, ['edgeProtectionInstall']);
}

// Reinforcement and concrete placing are trades of their own (D216; the pick lists have a trade for
// each). An activity that is only reinforcement work, or only placing concrete, read into the formwork
// package goes to the package for that work (made where there is none). An activity that names more
// than one of them ("form, fix reo and pour") stays where the AI put it.
const STRUCTURE_GROUPS = ['formwork', 'propping', 'reo', 'concrete', 'slabPour', 'slabGround', 'jumpform'];
const OWN_TRADES = [
  { group: 'reo', name: 'Reinforcement', pattern: /\breinforc\w*|\breo\b|\bsteel fix\w*/i },
  { group: 'concrete', name: 'Concrete placing and finishing', pattern: /\bconcret\w*|\bpours?\b|\bplace and finish\b/i },
];

function ownTradeOutOfFormwork(reading) {
  let out = reading;
  for (const trade of OWN_TRADES) {
    const formwork = out.packages.filter((item) => item.package !== JUMPFORM_PACKAGE && (item.groups || []).includes('formwork') && siteRows(out, item.package).length
      && mainGroup(siteRows(out, item.package), item.groups).main === 'formwork');
    const moving = new Set(formwork.flatMap((item) => siteRows(out, item.package)).filter((row) => {
      const named = ownGroups(row).filter((id) => STRUCTURE_GROUPS.includes(id));
      return named.length > 0 && named.every((id) => id === trade.group || (trade.group === 'concrete' && id === 'slabPour'));
    }));
    if (!moving.size) continue;
    const target = packageFor(out, trade.pattern, trade.group, formwork.map((item) => item.package));
    out = moveActivities(out, moving, target ? target.package : trade.name, [trade.group]);
  }
  return out;
}

// Finishing the pour (sawing the control joints, grinding slab edges, nibs and surface defects, power
// trowelling, curing) is the concreter's finishing work, which the concrete steps cover. A package that
// is only that work joins the concrete placing package, where the reading has one.
const POUR_FINISHING = /\b(?:saw ?cut\w*|cut\w*)\b[^.]{0,30}\b(?:control|contraction|expansion|construction) joints?\b|\bgrind\w*\b[^.]{0,40}\b(?:slab edges?|edges|nibs?|surface defects?|defects|fins)\b|\bcur(?:e|ing)\b[^.]{0,20}\bconcrete\b|\bcuring compounds?\b|\bpower trowel\w*|\btrowel\w* finish\w*/i;

function finishingWithThePour(reading) {
  const pour = reading.packages.find((item) => siteRows(reading, item.package).length && ['concrete', 'slabPour'].includes(mainGroup(siteRows(reading, item.package), item.groups || []).main) && (item.groups || []).some((id) => ['concrete', 'slabPour'].includes(id)));
  if (!pour) return reading;
  const moving = new Set(reading.packages.filter((item) => item.package !== pour.package && !PACKAGES.includes(item.package) && siteRows(reading, item.package).length && siteRows(reading, item.package).every((row) => POUR_FINISHING.test(row.activity)))
    .flatMap((item) => siteRows(reading, item.package)));
  return moveActivities(reading, moving, pour.package, []);
}

// A package is named for its work where SiteWrite has a name for it, so the same work has the same
// name and the same pick list trade: "Trade installation: suspended slabs and stairs" that is only
// reinforcement work is "Reinforcement". Only a package whose every activity names that work, and one
// the AI named itself (not from the brief's list, and not one made for the whole project), is renamed;
// each activity keeps its area in its where-note. Two packages that come out with the same name are one.
const WORK_NAMES = { reo: 'Reinforcement', formwork: 'Formwork and falsework', concrete: 'Concrete placing and finishing', slabPour: 'Concrete placing and finishing', edgeProtectionInstall: EDGE_NAME, wasteRemoval: 'Rubbish removal and site clean-ups' };
// A brief-list name the AI gave work it does not fit: a daily clean-up read as "Demolition and removal".
const LIST_MISREAD = { 'Demolition and removal': ['wasteRemoval'] };

function namedByWork(reading) {
  const renamed = new Map();
  const mains = new Map();
  for (const item of reading.packages) {
    if (item.package === JUMPFORM_PACKAGE || /:\s*whole project$/i.test(item.package)) continue;
    const rows = siteRows(reading, item.package);
    if (!rows.length || !(item.groups || []).length) continue;
    const { main } = mainGroup(rows, item.groups);
    if (PACKAGES.includes(item.package) && !(LIST_MISREAD[item.package] || []).includes(main)) continue;
    const name = WORK_NAMES[main];
    // A clean-up is renamed only from a misread list name ("Demolition and removal"). A name in the AI's
    // own words ("Housekeeping and waste", "Silica dust control", "protection") says what the clean-up
    // is for, so it is kept.
    if (main === 'wasteRemoval' && !PACKAGES.includes(item.package)) continue;
    // Finishing the pour counts as concrete placing work (finishingWithThePour). An activity that also
    // names another of formwork, reo and concrete ("form, fix reo and pour") keeps the package's own name.
    const same = { formwork: ['formwork', 'propping'], reo: ['reo'], concrete: ['concrete', 'slabPour'], slabPour: ['concrete', 'slabPour'] }[main];
    const named = (row) => (ownGroups(row).includes(main) || (['concrete', 'slabPour'].includes(main) && POUR_FINISHING.test(row.activity)))
      && (!same || ownGroups(row).filter((id) => STRUCTURE_GROUPS.includes(id)).every((id) => same.includes(id)));
    if (!name || name === item.package || !rows.every(named)) continue;
    renamed.set(item.package, name);
    mains.set(item.package, main);
  }
  if (!renamed.size) return reading;
  const activities = reading.activities.map((row) => {
    const name = renamed.get(row.package);
    if (!name) return row;
    // An "area" that only names the work ("Trade installation: concrete") is not kept as a place.
    const named = TRADE_INSTALLATION.test(row.package) ? row.package.replace(TRADE_INSTALLATION, '').trim() : '';
    const area = named && !suggestedKinds(readSlang(named), {}, { allWords: true }).includes(mains.get(row.package)) && !name.toLowerCase().includes(named.toLowerCase()) ? named : '';
    const where = String(row.where || '').trim();
    return { ...row, package: name, where: !area || where.toLowerCase().includes(area.toLowerCase()) ? where : where ? `${area}: ${where}` : area };
  });
  const packages = [];
  for (const item of reading.packages) {
    const name = renamed.get(item.package) || item.package;
    const into = packages.find((other) => other.package === name);
    if (!into) { packages.push(renamed.has(item.package) ? { ...item, package: name, merged: true } : item); continue; }
    into.groups = [...new Set([...(into.groups || []), ...(item.groups || [])])];
    into.unmatched = [...new Set([...(into.unmatched || []), ...(item.unmatched || [])])];
    into.byOthers = [...(into.byOthers || []), ...(item.byOthers || []).filter((entry) => !(into.byOthers || []).some((other) => other.group === entry.group && other.step === entry.step))];
    into.merged = true;
  }
  return { ...reading, activities, packages };
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
    // "Moving powered mobile plant" from the step groups alone is "may", not "is", where the package's
    // own words never move, lift or drive anything (messy round 6, sl6 decision 3, D307): the same rule
    // as SiteLink's list (handover.js), so the subcontractor's scope reading says the same.
    const words = `${name} ${packWords({ rows })}`;
    out.push(plantFromWords({ package: name, ...screenHighRisk(input, rows.flatMap((row) => row.quotes || []).join('\n')) }, words));
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

// Where a reading still running is, for the page's progress bar: which call is running, the seconds
// since it started and since that call started, and the seconds a document this long usually takes.
// The AI does not report its own progress. Also used for written methodologies (method-read.js).
function progressOf(row) {
  if (row.status !== 'reading') return null;
  const seconds = (from) => (from ? Math.max(0, Math.round((Date.now() - new Date(from).getTime()) / 1000)) : 0);
  return {
    stage: row.stage || '',
    elapsedSeconds: seconds(row.created_at),
    stageSeconds: seconds(row.stage_at || row.created_at),
    expectedSeconds: expectedSeconds(row.characters),
  };
}

// Marks the start of the reading's second call (matching the job steps), for the progress bar.
async function markStage(id, stage) {
  await db.query('UPDATE ai_readings SET stage = $2, stage_at = $3 WHERE id = $1', [id, stage, new Date()]).catch(() => {});
}

function rowOut(row) {
  return {
    id: row.id,
    status: row.status,
    progress: progressOf(row),
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
  const content = checkedContent(text);
  const hash = fingerprint(content);
  await markStale();
  // A main contractor's project reading (company_id '') is never one of a company's.
  const kept = await db.one("SELECT * FROM ai_readings WHERE company_id = $1 AND org_id = '' AND doc_hash = $2 AND brief_version = $3 AND status <> 'failed' ORDER BY created_at DESC LIMIT 1",
    [company.id, hash, BRIEF_VERSION]);
  if (kept) return { ...(await withHighRisk(rowOut(kept), stateName)), kept: true };
  const id = crypto.randomUUID();
  const now = new Date();
  await db.query('INSERT INTO ai_readings (id, company_id, doc_hash, brief_version, model, status, characters, created_at, stage, stage_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $8)',
    [id, company.id, hash, BRIEF_VERSION, MODEL, 'reading', content.length, now, 'reading']);
  return { id, status: 'reading', kept: false, progress: progressOf({ status: 'reading', stage: 'reading', created_at: now, characters: content.length }), done: runReading(id, content) };
}

function checkedContent(text) {
  const content = String(text || '');
  if (!content.trim()) throw fail(400, 'There is no text in this file to read.');
  if (content.length > MAX_CHARACTERS) throw fail(413, 'This document is too long for one reading. Split it into parts and read each one.');
  return content;
}

// The two calls of a reading, run after the request returns. The result is kept with its check
// against the brief and what it cost. clean (a project's reading) takes every price out of the
// reading and its checks before it is kept (handover.js); the checks are made on the reading first.
function runReading(id, content, clean = null) {
  return askModel(content)
    .then(async ({ reading: read, usage: readUsage, model }) => {
      await markStage(id, 'steps');
      const steps = await mapSteps(read);
      let reading = { ...read, packages: steps.packages };
      const usage = addUsage(readUsage, steps.usage);
      let checks = {
        ...checkReading(reading, content),
        packagesWithoutSteps: steps.packages.filter((item) => !item.groups.length).map((item) => item.package),
        unknownStepIds: steps.packages.flatMap((item) => item.unknown),
      };
      if (clean) ({ reading, checks } = clean(reading, checks));
      await db.query('UPDATE ai_readings SET status = $2, reading = $3, checks = $4, usage = $5, cost_usd = $6, model = $7, finished_at = $8 WHERE id = $1',
        [id, 'done', JSON.stringify(reading), JSON.stringify(checks), JSON.stringify(usage), costOf(usage), model, new Date()]);
    })
    .catch(async (error) => {
      await db.query('UPDATE ai_readings SET status = $2, error = $3, finished_at = $4 WHERE id = $1', [id, 'failed', errorMessage(error), new Date()]).catch(() => {});
    });
}

// ---- A main contractor's project (Goal 12 stage 4, D302) ----
// The HSE lead uploads each subcontract's scope once, on the project. The reading is kept against the
// main contractor's account (org) and the document's fingerprint, so the same file again, for any
// subcontract or project of that account, costs nothing and does not count. No company, and no other
// account, ever reads it. SiteWrite pays for a project's readings up to PROJECT_FREE_READINGS (50 to
// start); after that no reading runs, and the lead is asked to contact SiteWrite. Every AI reading
// made for the project counts (scopes now; plans and outside SWMS checks later), except one that failed.

function projectFreeReadings() {
  const value = Number(process.env.PROJECT_FREE_READINGS);
  return process.env.PROJECT_FREE_READINGS !== undefined && process.env.PROJECT_FREE_READINGS !== '' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 50;
}
const limitMessage = (limit) => `You have used this project's ${limit} free readings. Contact SiteWrite to add more.`;

async function projectReadingsUsed(projectId, query = db) {
  const row = await query.one("SELECT COUNT(*) AS n FROM ai_readings WHERE project_id = $1 AND status <> 'failed'", [String(projectId || '')]);
  return Number((row && row.n) || 0);
}

// Work on one project's readings, one request at a time in this process.
const queues = new Map();
async function oneAtATime(key, fn) {
  const before = queues.get(key) || Promise.resolve();
  let release;
  const mine = new Promise((resolve) => { release = resolve; });
  const chain = before.then(() => mine);
  queues.set(key, chain);
  await before;
  try {
    return await fn();
  } finally {
    release();
    if (queues.get(key) === chain) queues.delete(key);
  }
}

// Starts a project's reading, or returns the one the account already has for this document (kept: true).
async function startProjectReading({ org, project }, text, stateName, { clean = null } = {}) {
  if (!enabled()) throw fail(503, 'Reading scopes is not switched on just now. Try again later, or add the SWMS this subcontract needs yourself.');
  if (!org || !project) throw fail(404, 'That project was not found.');
  const content = checkedContent(text);
  const hash = fingerprint(content);
  await markStale();
  const keptFor = (query) => query.one("SELECT * FROM ai_readings WHERE org_id = $1 AND company_id = '' AND doc_hash = $2 AND brief_version = $3 AND status <> 'failed' ORDER BY created_at DESC LIMIT 1",
    [org.id, hash, BRIEF_VERSION]);
  const before = await keptFor(db);
  if (before) return { ...(await withHighRisk(rowOut(before), stateName)), kept: true };
  const limit = projectFreeReadings();
  const id = crypto.randomUUID();
  const now = new Date();
  // With the project locked, two uploads at the same moment cannot both take the last free reading,
  // and the same file sent twice at once is read once: in this process by a queue for each project,
  // and across processes by the database's lock on the project's row.
  const kept = await oneAtATime(project.id, () => db.transaction(async (tx) => {
    await tx.query('SELECT id FROM projects WHERE id = $1 FOR UPDATE', [project.id]);
    const again = await keptFor(tx);
    if (again) return again;
    if (await projectReadingsUsed(project.id, tx) >= limit) throw Object.assign(fail(402, limitMessage(limit)), { limit: true });
    await tx.query("INSERT INTO ai_readings (id, company_id, org_id, project_id, doc_hash, brief_version, model, status, characters, created_at, stage, stage_at) VALUES ($1, '', $2, $3, $4, $5, $6, $7, $8, $9, $10, $9)",
      [id, org.id, project.id, hash, BRIEF_VERSION, MODEL, 'reading', content.length, now, 'reading']);
    return null;
  }));
  if (kept) return { ...(await withHighRisk(rowOut(kept), stateName)), kept: true };
  return { id, status: 'reading', kept: false, progress: progressOf({ status: 'reading', stage: 'reading', created_at: now, characters: content.length }), done: runReading(id, content, clean) };
}

// A project reading, for the account that owns it only.
async function getProjectReading(org, id, stateName) {
  await markStale();
  const row = await db.one("SELECT * FROM ai_readings WHERE id = $1 AND org_id = $2 AND org_id <> '' AND company_id = ''", [String(id || ''), String((org && org.id) || '')]);
  if (!row) throw fail(404, 'That reading was not found.');
  return withHighRisk(rowOut(row), stateName);
}

async function markStale() {
  await db.query("UPDATE ai_readings SET status = 'failed', error = $1, finished_at = $2 WHERE status = 'reading' AND created_at < $3",
    ['The reading was interrupted. Try again.', new Date(), new Date(Date.now() - STALE_MINUTES * 60 * 1000)]);
}

async function getReading(company, id, stateName) {
  if (!company) throw fail(401, 'Sign in to see this reading.');
  await markStale();
  const row = await db.one("SELECT * FROM ai_readings WHERE id = $1 AND company_id = $2 AND org_id = ''", [String(id || ''), company.id]);
  if (!row) throw fail(404, 'That reading was not found.');
  return withHighRisk(rowOut(row), stateName);
}

module.exports = { enabled, useClient, startReading, getReading, startProjectReading, getProjectReading, projectReadingsUsed, projectFreeReadings, limitMessage, progressOf, markStage, checkReading, quoteFinder, errorMessage, failureLine, useFailureLog, addUsage, validReading, costOf, fingerprint, normalise, mapSteps, settlePackages, packageHighRisk, stepCatalogue, callModel, MODEL };
