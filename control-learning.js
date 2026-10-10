// What users change in their SWMS (task #102, owner decisions of 6 October 2026), kept to improve
// the step library. Off unless CONTROL_LEARNING=on, until the privacy policy covers it.
//
// Each change is recorded once for each saved revision of a SWMS, never again for a download or a
// second save of the same revision. A row holds the job step, the kind of change, the line as
// SiteReady wrote it, the user's own words (with names, phone numbers, email addresses, ABNs and
// street addresses taken out, and every name the account itself holds: its business, sites,
// principal contractors and people), any warning given, the user's reason, the state, trade, kinds of
// work and high risk work, and the month. Changes that were warned about, refused, or no longer
// matched a line are recorded too. When the next revision is saved, each change of the revision
// before is marked kept or not. The saved SWMS is known only by a keyed fingerprint: no business,
// account, site, task wording or SWMS id is kept. A business that opted out of industry data is
// left out. Rows are deleted after 3 years.
//
// Failed check questions at worker sign-on are kept here too, under the same switch: for each wrong
// answer, the kind of question, the step or PPE item it tested, the wrong option chosen, the
// language, state, trade and month. No worker, business, site or SWMS is linked to them, and a
// business that opted out of industry data is left out here too.
const crypto = require('crypto');
const db = require('./db');
const { findState } = require('./legislation');
const { controlLearningKey } = require('./secret-keys');
const { tradeIds } = require('./trades');
const { ACTIVITIES } = require('./activities');

// In production, CONTROL_LEARNING_KEY must be set too, or nothing is kept (secret-keys.js).
const enabled = () => String(process.env.CONTROL_LEARNING || '').trim().toLowerCase() === 'on' && Boolean(controlLearningKey());
// Months are counted in Queensland time, which has no daylight saving.
const monthOf = (date) => new Date(date.getTime() + 10 * 3600000).toISOString().slice(0, 7);
const RETENTION_YEARS = 3;
const hash = (text) => crypto.createHash('sha256').update(String(text)).digest('hex');
// The saved SWMS by a keyed fingerprint, so a row cannot be traced back to it without the key.
const swmsKey = (id) => crypto.createHmac('sha256', controlLearningKey()).update(String(id)).digest('hex');
// The trade and kinds of work as fixed ids only, as in the industry data: anything else sent in
// their place (a name or phone number typed into a request) is free text and is dropped.
const KINDS = new Set(ACTIVITIES.map((activity) => activity.when).filter(Boolean));
const knownTrade = (input) => tradeIds(input && input.trade).join(',').slice(0, 100);
const knownKinds = (input) => (Array.isArray(input && input.kinds) ? [...new Set(input.kinds.filter((id) => KINDS.has(id)))].slice(0, 80) : []);

// ---- Taking personal details out of what the user typed ----

const EMAIL = /[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi;
// Australian phone numbers: mobiles, landlines with or without the area code or +61, and 13, 1300 and 1800 numbers.
const PHONE = /(?:\+?61[\s-]?\(?0?[2-478]\)?|\(?0[2-478]\)?)(?:[\s-]?\d){8}\b|\b(?:1[38]00(?:[\s-]?\d){6}|13(?:[\s-]?\d){4})\b|\b\d{4}[\s-]\d{4}\b/g;
const ABN = /\b\d{2}\s?\d{3}\s?\d{3}\s?\d{3}\b/g;
const STREET = /\b\d+[A-Za-z]?(?:[/-]\d+[A-Za-z]?)?\s+(?:[A-Z][\w'-]*\s+){1,3}(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Place|Pl|Lane|Ln|Parade|Pde|Highway|Hwy|Crescent|Cres|Boulevard|Bvd|Terrace|Tce|Way|Close|Cl)\b/g;
const TITLED = /\b(?:Mr|Mrs|Ms|Miss|Dr)\.?\s+[A-Z][\w'-]*/g;

// Everyday words a site note starts with that the library does not use.
const EVERYDAY = 'monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december '
  + 'toolbox prestart pre-start ring call phone email text ask tell notify contact check confirm see refer daily weekly morning afternoon night am pm '
  + 'boss foreman leading hand crew site office gate smoko lunch break yes no ok okay please note';

// Short forms used on site that the library does not spell out. Any other word in capitals that is
// not a library word, such as a builder's initials, is taken out.
const ABBREVIATIONS = 'loto tmp tgs jsa jsea jha swp sop ptw hrw hrwl hrcw dbyd byda pc hse ohs qa qc itp rfi tbt msb db gpo uhf cb cpr aed epa '
  + 'msds voc wwc mewp rpe papr hv lv ac dc ss gi lpg co nz au';

// Public bodies, places and product or plant brands a site note names that identify no person or
// business on the job, so they are kept. Brands that are also common surnames (Coates, Weber,
// Hardie, Hanson) are left out of this list and are taken out.
const PUBLIC_NAMES = 'telstra optus vodafone ausgrid endeavour energex ergon powerlink jemena ausnet citipower powercor transgrid electranet '
  + 'tasnetworks evoenergy agl atco sydney melbourne brisbane perth adelaide hobart darwin canberra queensland victoria tasmania '
  + 'safework worksafe comcare hilti makita milwaukee dewalt festool ramset paslode kango stihl husqvarna genie haulotte skyjack '
  + 'manitou merlo franna hiab bobcat kubota komatsu caterpillar dulux sika ardex gyprock rondo boral holcim lysaght colorbond '
  + 'kingspan bondor hebel promat tremco fosroc mapei davco bostik kwikstage layher cuplok ringlock acrow peri doka bunnings always dial '
  + 'nsw qld vic tas wa sa nt act australia';

// Given names often typed in lower case on site ("ask dave first"). One that is also a library or
// everyday word (jack, mark, will) is left alone.
const GIVEN_NAMES = 'aaron adam ahmed alan alex ali alistair amit amy andrew andy angus anthony ash ashley barry ben benjamin billy blake brad bradley '
  + 'brendan brett bruce cameron chloe chris christopher colin connor corey craig damien dan daniel danny darren darryl dave davo david dean des '
  + 'dylan eddie emily emma gary gav gavin gaz geoff glen glenn greg hamish hannah harry hayden ian jake james jamie jarrod jason jeff jeremy jess '
  + 'jessica jim jimmy jo joanne jodie joe joey john johnny jon jordan josh joshua julie justin karen karl kate katie keith ken kenny kev kevin '
  + 'kim kylie kyle lachie lachlan laura lee leanne liam lisa luke marco mario matt matthew mel megan michael michelle mick mike mitch mitchell '
  + 'mohammed muhammad nathan nick nicholas nicole noel olivia omar owen paul pete peter phil phillip rachel raj ravi rebecca robbie robert rod '
  + 'rodney ross russell ryan sam samuel sanjay sarah scott sean shane shaun simon sophie steve steven stephen stu stuart susan terry tim timothy '
  + 'todd tom tommy tony tracey trent troy wayne warren wendy zoe';

// Words that follow a business's name ("abc plumbing", "smith and sons"). The word before them is
// taken out unless it is a library word.
const BUSINESS_AFTER = /(?<![[\w'-])([A-Za-z][\w'-]*)(\s+(?:(?:and|&)\s+sons|bros|brothers|pty|ltd|plumbing|plumbers|electrical|electrics|electricians|sparkies|constructions?|builders|building|scaffolding|cranes|hire|group|civil|concreting|contracting|contractors|services|engineering|roofing|painting|carpentry|demolition|excavations|earthmoving|landscaping|glazing|fencing|formwork|drilling|interiors|projects)\b)/gi;

// A named place: words before a kind of place ("Royal Brisbane Hospital", "the kestrel point
// apartments"). The words that name it are taken out when one of them is not a library word.
const PLACES = 'hospitals?|schools?|college|university|station|centre|center|stadium|arena|park|plaza|mall|towers?|hotel|airport|campus|precinct|estate|village|square|wharf|quay|apartments|residences|library|church|terminal';
const PLACE = new RegExp(`(?<![\\w'&-])((?:[A-Za-z][\\w'&-]*\\s+){1,5})(${PLACES})\\b`, 'gi');
const AFTER_SITE = new RegExp(`\\[site\\](?:\\s+(?:${PLACES})\\b)+`, 'gi');
const PLACE_JOINS = new Set(['and', 'of', '&']);
const PLACE_KIND = new RegExp(`^(?:${PLACES})$`, 'i');

// Words SiteReady's own library uses, so a capitalised word that is not one of them (such as a
// person's or a business's name) can be taken out. libraryWords includes the public names;
// plainWords does not, so "Brisbane Airport" still counts as the name of a place.
let vocabulary = null;
let plain = null;
function libraryWords() {
  if (vocabulary) return vocabulary;
  plain = new Set([...EVERYDAY.split(' '), ...ABBREVIATIONS.split(' ')]);
  const add = (text) => { for (const word of String(text).toLowerCase().match(/[a-z][a-z'-]*/g) || []) plain.add(word); };
  const walk = (value, depth = 0) => {
    if (depth > 8 || value === null || value === undefined) return;
    if (typeof value === 'string') add(value);
    else if (Array.isArray(value)) value.forEach((item) => walk(item, depth + 1));
    else if (typeof value === 'object') Object.values(value).forEach((item) => walk(item, depth + 1));
  };
  try { walk(require('./activities')); } catch { /* the patterns below still apply */ }
  vocabulary = new Set([...plain, ...PUBLIC_NAMES.split(' ')]);
  return vocabulary;
}
function plainWords() {
  libraryWords();
  return plain;
}

let givenNames = null;
function givenPattern() {
  if (!givenNames) {
    const words = libraryWords();
    givenNames = new RegExp(`(?<![[\\w'-])(?:${GIVEN_NAMES.split(' ').filter((name) => !words.has(name)).join('|')})\\b`, 'gi');
  }
  return givenNames;
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---- The account's own names ----

// What the account holds when the SWMS is saved: its business, sites, principal contractors and
// people. The user can type any of them in any case, so each is taken out wherever it appears:
// the whole name, each word of it that is not a library word, and a business's or site's
// initials (BBG for Brookvale Building Group).
const NAME_PARTS = /[,;:()[\]|/\n]+|\s+-\s+|\s+(?:and|&)\s+/i;
const NOT_INITIAL = new Set(['pty', 'ltd', 'limited', 'the', 'of', 'and']);
const BUSINESS_TAIL = new Set(['group', 'constructions', 'construction', 'building', 'builders', 'services', 'contracting', 'contractors', 'projects', 'australia', 'plumbing', 'electrical', 'civil', 'engineering', 'scaffolding', 'hire', 'industries', 'developments', 'holdings', 'co', 'company']);
const MAIL_HOSTS = new Set(['gmail', 'googlemail', 'outlook', 'hotmail', 'live', 'yahoo', 'icloud', 'me', 'bigpond', 'optusnet', 'iinet', 'tpg', 'protonmail', 'proton']);
const PEOPLE_FIELDS = ['siteManager', 'scaffoldSupervisor', 'firstAider', 'worksManager', 'complianceResponsible', 'reviewer', 'preparedBy'];
const PLACE_FIELDS = ['workplace', 'hospital', 'musterPoint'];

// The account's names in three groups, from the company, the SWMS's own fields, and the users,
// sites and sign-ons read for it (accounts.js). Email addresses give the person and the business.
function accountValues(company = {}, input = {}, { users = [], sites = [], workers = [], reviewedBy = '' } = {}) {
  const out = { businesses: [], people: [], places: [] };
  const fields = (from) => {
    if (!from || typeof from !== 'object') return;
    out.businesses.push(from.principalContractor);
    for (const key of PEOPLE_FIELDS) out.people.push(from[key]);
    for (const key of PLACE_FIELDS) out.places.push(from[key]);
  };
  const email = (address) => {
    const [local, host] = String(address || '').toLowerCase().split('@');
    if (!host) return;
    out.people.push(local.replace(/[._+-]+/g, ' '));
    const label = host.split('.')[0];
    if (!MAIL_HOSTS.has(label)) out.businesses.push(label);
  };
  out.businesses.push(company.name, input.company);
  out.places.push(company.address);
  email(company.email);
  fields(input);
  for (const site of sites) {
    out.places.push(site.name);
    fields(typeof site.details === 'string' ? JSON.parse(site.details) : site.details);
  }
  for (const user of users) { out.people.push(user.name); email(user.email); }
  for (const worker of workers) { out.people.push(worker.worker_name, worker.explained_by); out.businesses.push(worker.worker_company); }
  out.people.push(reviewedBy);
  for (const key of Object.keys(out)) out[key] = [...new Set(out[key].map((value) => String(value || '').trim()).filter(Boolean))];
  return out;
}

// The phrases and words to take out, each with what it is replaced by.
function accountTerms(values) {
  if (!values) return null;
  const words = libraryWords();
  const plainOnly = plainWords();
  const phrases = new Map();
  const single = new Map();
  const groups = [[values.businesses, '[name]', true], [values.people, '[name]', false], [values.places, '[site]', true]];
  for (const [list, mark, initials] of groups) {
    for (const value of list || []) {
      const parts = String(value).split(NAME_PARTS);
      for (const part of parts.length > 1 ? [value, ...parts] : parts) {
        const tokens = (String(part).match(/[A-Za-z][A-Za-z'-]*|\d+/g) || []).map((token) => token.replace(/['-]+$/, ''));
        const letters = tokens.filter((token) => /[A-Za-z]/.test(token)).map((token) => token.toLowerCase());
        // A name made only of library words ("leading hand", "Gate 2") names no one.
        if (!letters.some((word) => word.length > 1 && !plainOnly.has(word))) continue;
        // The whole name, and the name without its last words of kind ("Kestrel Point" for
        // Kestrel Point Apartments, "Brookvale Building" for Brookvale Building Group Pty Ltd).
        const bare = [...tokens];
        while (bare.length > 1 && (BUSINESS_TAIL.has(bare[bare.length - 1].toLowerCase()) || NOT_INITIAL.has(bare[bare.length - 1].toLowerCase()) || PLACE_KIND.test(bare[bare.length - 1]))) bare.pop();
        for (const phrase of [tokens, bare]) {
          const key = phrase.map((token) => token.toLowerCase()).join(' ');
          if (phrase.length > 1 && !phrases.has(key)) phrases.set(key, { pattern: phrase.map(escape).join('[^A-Za-z0-9\\[\\]]+'), mark });
        }
        for (const word of letters) if (word.length > 1 && !words.has(word) && !single.has(word)) single.set(word, mark);
        if (!initials) continue;
        const named = letters.filter((word) => !NOT_INITIAL.has(word));
        const short = [...named];
        while (short.length && BUSINESS_TAIL.has(short[short.length - 1])) short.pop();
        for (const kept of [named, short]) {
          const first = kept.map((word) => word[0]).join('');
          if (first.length > 1 && first.length <= 6 && !words.has(first) && !single.has(first)) single.set(first, mark);
        }
      }
    }
  }
  const byLength = (a, b) => b.length - a.length;
  return {
    phrases: [...phrases.entries()].sort((a, b) => b[0].length - a[0].length).map(([, item]) => ({ pattern: new RegExp(`\\b${item.pattern}\\b`, 'gi'), mark: item.mark })),
    words: ['[name]', '[site]'].map((mark) => {
      const list = [...single.entries()].filter(([, which]) => which === mark).map(([word]) => word).sort(byLength);
      return list.length ? { pattern: new RegExp(`(?<![[\\w'-])(?:${list.map(escape).join('|')})\\b`, 'gi'), mark } : null;
    }).filter(Boolean),
  };
}

function takeOutAccount(text, terms, known) {
  let out = text;
  for (const { pattern, mark } of terms.phrases) out = out.replace(pattern, mark);
  for (const { pattern, mark } of terms.words) out = out.replace(pattern, (word) => (known.has(word.toLowerCase()) ? word : mark));
  return out;
}

// The words before a kind of place that name it: capitalised words when the place is
// capitalised, or words that are not library words, with "and" or "of" between them.
function placeName(match, before, kind, known) {
  const plainOnly = plainWords();
  const capital = /^[A-Z]/.test(kind);
  const tokens = before.match(/\S+\s+/g);
  const word = (token) => token.trim().toLowerCase().replace(/'s$/, '');
  const joins = (token) => (capital && /^[A-Z]/.test(token)) || (!plainOnly.has(word(token)) && !known.has(word(token)));
  let start = tokens.length;
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    if (joins(tokens[i])) start = i;
    else if (!(PLACE_JOINS.has(word(tokens[i])) && i > 0 && joins(tokens[i - 1]))) break;
  }
  const naming = tokens.slice(start);
  if (!naming.some((token) => !plainOnly.has(word(token)) && !known.has(word(token)))) return match;
  return `${tokens.slice(0, start).join('')}[site]`;
}

// The user's words with personal details taken out. Words in the line SiteReady wrote stay.
// terms: the account's own names (accountTerms), when the account is known.
function scrub(text, original = '', terms = null) {
  return takeOut(text, original, terms).slice(0, 600);
}

function takeOut(text, original = '', terms = null) {
  if (!text) return '';
  const known = new Set(String(original).toLowerCase().match(/[a-z][a-z'-]*/g) || []);
  const words = libraryWords();
  const keep = (word) => known.has(word.toLowerCase()) || words.has(word.toLowerCase());
  let out = String(text)
    .replace(EMAIL, '[email]')
    .replace(STREET, '[address]')
    .replace(PHONE, '[phone]')
    .replace(ABN, '[number]');
  if (terms) out = takeOutAccount(out, terms, known);
  return out
    .replace(TITLED, '[name]')
    .replace(PLACE, (match, before, kind) => placeName(match, before, kind, known))
    .replace(AFTER_SITE, '[site]')
    .replace(/\b[A-Z][a-z][\w'-]*\b/g, (word) => (keep(word) ? word : '[name]'))
    // A word in capitals, such as a business's initials.
    .replace(/(?<![[\w'-])[A-Z][A-Z'&-]*[A-Z]\b/g, (word) => (keep(word) ? word : '[name]'))
    .replace(givenPattern(), (word) => (known.has(word.toLowerCase()) ? word : '[name]'))
    .replace(BUSINESS_AFTER, (match, word, rest) => (keep(word) ? match : `[name]${rest}`))
    .replace(/\[(name|site)\](?:\s+\[(?:name|site)\])+/g, '[$1]');
}

// ---- Recording ----

// The changes in a saved revision's draft, each with how it came out: applied, warned, refused or
// unmatched.
function changesOf(report) {
  const out = [];
  const warned = report.warned || [];
  for (const item of report.applied || []) {
    const warning = warned.find((other) => other.step === item.step && other.kind === item.kind && (other.text || '') === (item.from || '') && (other.to || '') === (item.to || ''));
    out.push({ step: item.step, kind: item.kind, outcome: warning ? 'warned' : 'applied', original: item.from || '', newLine: item.to || '', warning: warning ? warning.warnings.join(' ') : '', legal: warning ? warning.legal || '' : '', reason: item.reason || '', note: item.note || '' });
  }
  for (const item of report.refused || []) out.push({ step: item.step, kind: 'removed', outcome: 'refused', original: item.text || '', newLine: '', warning: item.reason || '', legal: '', reason: '', note: '' });
  for (const item of report.unmatched || []) out.push({ step: item.step, kind: item.kind, outcome: 'unmatched', original: item.text || '', newLine: item.to || '', warning: '', legal: '', reason: '', note: '' });
  return out;
}

// Records the changes in a saved revision, once. options: the company (its industry data choice
// applies), the saved SWMS's id and the revision, and account: the users, sites, sign-ons and
// reviewer's name read for it, whose names are taken out too. Returns how many were recorded.
async function recordControlEdits(draft, input, { company, swmsId, revision = 1, now = new Date(), account = {} } = {}) {
  if (!enabled() || !db.enabled() || !draft || !draft.controlEdits || !swmsId) return 0;
  if (!company || company.industry_opt_out) return 0;
  const state = findState(input && input.state);
  const key = swmsKey(swmsId);
  const fields = {
    month: monthOf(now),
    state: state ? state.id : '',
    trade: knownTrade(input),
    kinds: JSON.stringify(knownKinds(input)),
    highRisk: JSON.stringify((draft.highRisk || []).slice(0, 40)),
  };
  const changes = changesOf(draft.controlEdits);
  const terms = accountTerms(accountValues(company, input || {}, account || {}));
  const keys = new Set();
  let count = 0;
  for (const change of changes) {
    const newLine = scrub(change.newLine, change.original, terms);
    const editKey = hash(JSON.stringify([change.step, change.kind, change.original, newLine]));
    keys.add(editKey);
    const id = hash(`${key}:${revision}:${editKey}:${change.outcome}`);
    const inserted = await db.query(
      `INSERT INTO control_edit_events (id, swms_key, revision, month, state, trade, kinds, high_risk, step, kind, outcome, original, new_line, warning, legal, reason, note, edit_key, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [id, key, Number(revision), fields.month, fields.state, fields.trade, fields.kinds, fields.highRisk, String(change.step).slice(0, 300), change.kind, change.outcome,
        String(change.original).slice(0, 1500), newLine, String(change.warning).slice(0, 2000), String(change.legal).slice(0, 500), change.reason, scrub(change.note, '', terms).slice(0, 300), editKey, now],
    );
    count += inserted.length;
  }
  // Whether each change of the revision before was kept in this one.
  if (Number(revision) > 1) {
    const earlier = await db.query('SELECT id, edit_key FROM control_edit_events WHERE swms_key = $1 AND revision = $2', [key, Number(revision) - 1]);
    for (const row of earlier) await db.query('UPDATE control_edit_events SET kept = $1 WHERE id = $2', [keys.has(row.edit_key), row.id]);
  }
  return count;
}

// ---- Failed check questions at worker sign-on ----

// The step or PPE item a question tested, and the option the worker chose, are SiteReady's own
// words: step names, short library controls and PPE labels. A step made from the task's own
// words is not kept by name.
const OWN_STEP = '(a step made from the task)';

// Records each wrong answer of one sign-on attempt: the kind of question (ppe, step or control),
// the step and item it tested, the wrong option chosen, the language, state, trade and month.
// No worker, business, site, SWMS or read is linked, and there is no time finer than the month.
// questions: the read's questions with their answers (sign-read.js); answers: what the worker
// chose. A question left unanswered is not kept. Returns how many were recorded.
async function recordFailedQuestions(questions, answers, { draft, input, company, language = 'en', now = new Date() } = {}) {
  if (!enabled() || !db.enabled() || !company || company.industry_opt_out || !Array.isArray(questions)) return 0;
  const given = answers && typeof answers === 'object' ? answers : {};
  const own = new Set(((draft && draft.jobSteps) || []).filter((step) => step.fallback).map((step) => step.step));
  const state = findState(input && input.state);
  let count = 0;
  for (const item of questions) {
    const chosen = given[item.id];
    if (!Number.isInteger(chosen) || chosen === item.answer || chosen < 0 || chosen >= item.options.length) continue;
    const step = item.kind === 'ppe' ? '' : own.has(item.step) ? OWN_STEP : String(item.step || '');
    const tested = item.kind === 'step' && own.has(item.step) ? OWN_STEP : String(item.options[item.answer] || '');
    const wrong = item.kind === 'step' && own.has(item.options[chosen]) ? OWN_STEP : String(item.options[chosen]);
    await db.query(
      'INSERT INTO check_question_misses (id, month, state, trade, language, kind, step, item, chosen) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [crypto.randomBytes(12).toString('hex'), monthOf(now), state ? state.id : '', knownTrade(input), String(language || 'en').slice(0, 20),
        String(item.kind || ''), step.slice(0, 300), tested.slice(0, 600), wrong.slice(0, 600)],
    );
    count += 1;
  }
  return count;
}

// Rows older than 3 years are deleted, as are rows of the first, counted store.
async function removeOld(now = new Date()) {
  if (!db.enabled()) return;
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - RETENTION_YEARS);
  await db.query('DELETE FROM control_edit_events WHERE created_at < $1', [cutoff]);
  await db.query('DELETE FROM control_edits WHERE month < $1', [monthOf(cutoff)]);
  await db.query('DELETE FROM check_question_misses WHERE month < $1', [monthOf(cutoff)]);
}

// Counts for the owner: changes by kind and outcome, the steps changed most, and how many changes
// were kept in the next revision.
async function summary() {
  const rows = await db.query('SELECT kind, outcome, kept, step FROM control_edit_events');
  const byKind = { removed: 0, changed: 0, added: 0, hazardChanged: 0, hazardAdded: 0, hazardNotApplicable: 0, whoChanged: 0 };
  const byOutcome = { applied: 0, warned: 0, refused: 0, unmatched: 0 };
  const steps = new Map();
  const kept = { kept: 0, notKept: 0 };
  for (const row of rows) {
    byKind[row.kind] = (byKind[row.kind] || 0) + 1;
    byOutcome[row.outcome] = (byOutcome[row.outcome] || 0) + 1;
    steps.set(row.step, (steps.get(row.step) || 0) + 1);
    if (row.kept === true) kept.kept += 1;
    if (row.kept === false) kept.notKept += 1;
  }
  // Failed check questions: how many by kind, and the items workers get wrong most.
  const misses = await db.query('SELECT kind, item FROM check_question_misses');
  const missedKinds = { ppe: 0, step: 0, control: 0 };
  const missed = new Map();
  for (const row of misses) {
    missedKinds[row.kind] = (missedKinds[row.kind] || 0) + 1;
    const key = `${row.kind}\n${row.item}`;
    missed.set(key, (missed.get(key) || 0) + 1);
  }
  return {
    enabled: enabled(),
    total: rows.length,
    byKind,
    byOutcome,
    kept,
    steps: [...steps.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 20).map(([step, changes]) => ({ step, changes })),
    failedQuestions: {
      total: misses.length,
      byKind: missedKinds,
      items: [...missed.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 20).map(([key, wrong]) => ({ kind: key.split('\n')[0], item: key.split('\n')[1], wrong })),
    },
  };
}

// ---- The monthly learning report (goal 11) ----

// How many different saved SWMS must show the same pattern before it is listed as a candidate
// library change. 5 is a placeholder: the number is the owner's decision and has not been made.
const CANDIDATE_THRESHOLD = 5;
const THRESHOLD_DECIDED = false;
const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const QLD_OFFSET = 10 * 3600000;
const MONTHS_SHOWN = 12;
// Changes that went into the SWMS. A refused change is not in it, and an unmatched one was made on
// a line SiteReady no longer prints, so neither is a pattern in the library as it is.
const MADE = new Set(['applied', 'warned']);
const CANDIDATE_GROUPS = ['removed', 'added', 'notApplicable', 'reverted'];
const LEARNING_OFF = 'Control learning is off: nothing is being recorded. It records only when CONTROL_LEARNING=on and CONTROL_LEARNING_KEY is set, and is held off until the privacy policy covers it and account administrators have had 30 days\' notice.';
const ACCEPTANCE_NOTE = 'First-time acceptance (goal 3) is not captured yet: no reviewer\'s decision is recorded, so it cannot be computed or trended.';

const isMonth = (month) => MONTH.test(String(month || ''));
const shiftMonth = (month, by) => {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1 + by, 1)).toISOString().slice(0, 7);
};
// The moment a month starts in Queensland time, as the months in the learning tables are counted.
const monthStarts = (month) => {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1, 1) - QLD_OFFSET);
};
// The last whole month, the one a monthly report is normally run for.
const lastWholeMonth = (now = new Date()) => shiftMonth(monthOf(now), -1);
const rate = (top, bottom) => Math.round((top / bottom) * 100) / 100;
// Same words in the same order, whatever the case, punctuation or spacing.
const sameWording = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9[\]]+/g, ' ').trim();

// What the report shows of a step or a line. Every step and line is SiteReady's, or the user's
// words already scrubbed, but a SiteReady line can carry what the user typed for a site fact, and a
// step can be made from the task's own words. So each line is scrubbed again, and a step whose
// words are not all library words is not shown by name.
function stepShown(step) {
  const words = String(step || '').toLowerCase().match(/[a-z][a-z'-]*/g) || [];
  const plainOnly = plainWords();
  return words.length && words.every((word) => plainOnly.has(word)) ? String(step) : OWN_STEP;
}
const lineShown = (text) => takeOut(text);

// Each pattern of one group, counted by the different saved SWMS it was seen in, not by rows: one
// SWMS saved many times, or with the same change on many revisions, counts once.
function patternsOf(rows, keyOf, month, threshold) {
  const patterns = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const entry = patterns.get(key) || { row, swms: new Set(), thisMonth: new Set(), rows: 0, legal: '', wordings: new Map() };
    entry.swms.add(row.swms_key);
    if (row.month === month) entry.thisMonth.add(row.swms_key);
    entry.rows += 1;
    entry.legal = entry.legal || row.legal || '';
    entry.wordings.set(row.new_line, (entry.wordings.get(row.new_line) || 0) + 1);
    patterns.set(key, entry);
  }
  const all = [...patterns.values()];
  const shown = all.filter((entry) => entry.swms.size >= threshold)
    .sort((a, b) => b.swms.size - a.swms.size || b.rows - a.rows || String(a.row.step).localeCompare(String(b.row.step)))
    .map((entry) => {
      // The wording most often used, for a group made of several wordings of one line.
      const wording = [...entry.wordings.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0][0];
      return {
        step: stepShown(entry.row.step),
        kind: entry.row.kind,
        line: lineShown(entry.row.original),
        newLine: lineShown(wording),
        swms: entry.swms.size,
        swmsThisMonth: entry.thisMonth.size,
        rows: entry.rows,
        legalRequirement: entry.legal,
        // A candidate becomes a library line only with a source we hold (D181), the goal 5 evidence
        // test and a person's sign-off. The report never changes the library.
        goal5CheckNeeded: true,
      };
    });
  return { shown, below: all.length - shown.length };
}

// Whether a rate fell each month over the last three months (lower is better for both).
function trendOf(months, field, why) {
  const last = months.slice(-3);
  const values = last.map((item) => ({ month: item.month, value: item[field] }));
  const missing = last.find((item) => item[field] === null);
  if (missing) return { values, fell: null, says: `Cannot say: ${missing.month} has no figure (${missing[why]}).` };
  const fell = last[1][field] < last[0][field] && last[2][field] < last[1][field];
  return { values, fell, says: fell ? 'Fell each month: the right way.' : 'Did not fall each month: not yet the right way.' };
}

// The month's report, for the owner (goal 11). month: YYYY-MM, in Queensland time like the
// tables; the last whole month if not given. It covers that month and up to 11 before it, reads
// only counts and what the learning tables already hold, and changes nothing.
async function monthlyReport({ month, threshold = CANDIDATE_THRESHOLD, now = new Date() } = {}) {
  const chosen = isMonth(month) ? month : lastWholeMonth(now);
  const edits = await db.query('SELECT swms_key, revision, month, step, kind, outcome, original, new_line, legal, edit_key, kept FROM control_edit_events WHERE month <= $1', [chosen]);
  const misses = await db.query('SELECT month, kind, step, item FROM check_question_misses WHERE month <= $1', [chosen]);
  const firstRecorded = [...edits, ...misses].map((row) => row.month).sort()[0] || null;
  // From the first month anything was recorded (at most 11 months back), and always the last three.
  let first = shiftMonth(chosen, -2);
  if (firstRecorded && firstRecorded < first) first = firstRecorded > shiftMonth(chosen, 1 - MONTHS_SHOWN) ? firstRecorded : shiftMonth(chosen, 1 - MONTHS_SHOWN);
  const list = [];
  for (let item = first; item <= chosen; item = shiftMonth(item, 1)) list.push(item);

  // Counts of saves and sign-ons, by Queensland month, leaving out businesses that opted out of
  // industry data, as the learning tables do.
  const range = [monthStarts(first), monthStarts(shiftMonth(chosen, 1))];
  const optedOut = new Set((await db.query('SELECT id FROM companies WHERE industry_opt_out = TRUE')).map((row) => row.id));
  const counted = (rows) => rows.filter((row) => !optedOut.has(row.company_id));
  const events = counted(await db.query("SELECT company_id, type, created_at FROM events WHERE type IN ('swms_saved', 'worker_signon') AND created_at >= $1 AND created_at < $2", range));
  const revisions = counted(await db.query('SELECT s.company_id, r.created_at FROM swms_revisions r LEFT JOIN swms s ON s.id = r.swms_id WHERE r.created_at >= $1 AND r.created_at < $2', range));
  const countBy = (rows, test = () => true) => {
    const out = new Map();
    for (const row of rows) if (test(row)) out.set(monthOf(new Date(row.created_at)), (out.get(monthOf(new Date(row.created_at))) || 0) + 1);
    return out;
  };
  const saved = countBy(events, (row) => row.type === 'swms_saved');
  const signons = countBy(events, (row) => row.type === 'worker_signon');
  const revisionsSaved = countBy(revisions);

  // A change is new in a revision when the revision before of the same SWMS did not have it.
  const editKeys = new Map();
  for (const row of edits) {
    const key = `${row.swms_key}:${row.revision}`;
    if (!editKeys.has(key)) editKeys.set(key, new Set());
    editKeys.get(key).add(row.edit_key);
  }
  const isNew = (row) => !(editKeys.get(`${row.swms_key}:${Number(row.revision) - 1}`) || new Set()).has(row.edit_key);

  const months = list.map((item) => {
    const rows = edits.filter((row) => row.month === item);
    const firsts = rows.filter((row) => Number(row.revision) === 1);
    const wrong = misses.filter((row) => row.month === item);
    const recorded = Boolean(firstRecorded) && item >= firstRecorded;
    const out = {
      month: item,
      recorded,
      swmsSaved: saved.get(item) || 0,
      newSwmsChanged: new Set(firsts.map((row) => row.swms_key)).size,
      newSwmsChanges: firsts.length,
      revisionsSaved: revisionsSaved.get(item) || 0,
      revisionsChanged: new Set(rows.map((row) => `${row.swms_key}:${row.revision}`)).size,
      changes: rows.length,
      newChanges: rows.filter(isNew).length,
      signons: signons.get(item) || 0,
      wrongAnswers: wrong.length,
      wrongByKind: { ppe: 0, step: 0, control: 0 },
    };
    for (const row of wrong) out.wrongByKind[row.kind] = (out.wrongByKind[row.kind] || 0) + 1;
    const notRecorded = 'nothing recorded yet';
    out.editRate = recorded && out.swmsSaved ? rate(out.newSwmsChanges, out.swmsSaved) : null;
    out.editRateWhy = !recorded ? notRecorded : out.swmsSaved ? '' : 'no SWMS saved';
    out.shareChanged = recorded && out.swmsSaved ? rate(out.newSwmsChanged, out.swmsSaved) : null;
    out.revisionRate = recorded && out.revisionsSaved ? rate(out.newChanges, out.revisionsSaved) : null;
    out.wrongRate = recorded && out.signons ? rate(out.wrongAnswers, out.signons) : null;
    out.wrongRateWhy = !recorded ? notRecorded : out.signons ? '' : 'no worker sign-ons';
    return out;
  });

  // Failed check questions this month: the items workers got wrong most.
  const missed = new Map();
  for (const row of misses.filter((item) => item.month === chosen)) {
    const key = `${row.kind}\n${row.step}\n${row.item}`;
    missed.set(key, (missed.get(key) || 0) + 1);
  }
  const items = [...missed.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 15).map(([key, wrong]) => {
    const [kind, step, item] = key.split('\n');
    return { kind, step: step ? stepShown(step) : '', item: lineShown(item), wrong };
  });

  // Candidate library changes, from every change up to the end of the month.
  const made = edits.filter((row) => MADE.has(row.outcome));
  const at = (row) => `${row.step}\n`;
  const candidates = {
    removed: patternsOf(made.filter((row) => row.kind === 'removed'), (row) => at(row) + row.original, chosen, threshold),
    added: patternsOf(made.filter((row) => row.kind === 'added'), (row) => sameWording(row.new_line) && at(row) + sameWording(row.new_line), chosen, threshold),
    notApplicable: patternsOf(made.filter((row) => row.kind === 'hazardNotApplicable'), (row) => at(row) + row.original, chosen, threshold),
    reverted: patternsOf(made.filter((row) => row.kept === false), (row) => `${at(row)}${row.kind}\n${row.original}\n${sameWording(row.new_line)}`, chosen, threshold),
  };

  const recording = enabled();
  const shown = months.find((item) => item.month === chosen);
  return {
    month: chosen,
    whole: chosen < monthOf(now),
    recording,
    recordingNote: recording ? 'Control learning is on: changes and failed check questions are being recorded.' : LEARNING_OFF,
    firstRecorded,
    method: [
      'Months are calendar months in Queensland time (no daylight saving), as the learning tables count them. Saves and sign-ons are counted from their recorded time on the same basis.',
      'The edit rate is the changes recorded on new SWMS (their first revision) divided by the SWMS saved events of the same month. SWMS saved is counted once when a new SWMS is saved, a copy included, and not when a revision is saved, so first revisions are its like for like.',
      'Changes per saved revision covers every revision: changes new in a revision (not in the revision before of the same SWMS) divided by the revisions saved that month (the revision history). A change kept from the revision before is recorded again on each revision, so all changes recorded would count it twice.',
      'A change is any change the user made: a line removed, changed or added, a hazard changed, added or marked "does not apply", or the Who column changed, whatever came of it (applied, warned, refused, or no longer matching a line).',
      'Wrong answers per sign-on is the wrong check answers recorded divided by the worker sign-on events. A worker who gives up still leaves wrong answers but no sign-on, and a sign-on where a supervisor explained the SWMS has no questions.',
      'Businesses that opted out of industry data are left out of every count, by their choice today. Learning rows from before an opt out stay until deleted; saves and sign-ons from them do not count.',
      'Months before the first recorded row show no rate. The report cannot tell when learning was switched off: a month while it was off reads as no changes.',
      'SWMS deleted from the archive take their revision history with them, so revisions saved in older months can fall.',
      `Candidate library changes count each pattern by the different saved SWMS it was seen in (by their fingerprint), not by rows, from every change up to the end of ${chosen}. The store holds no business, so one business with many SWMS counts once per SWMS. Only changes that went into the SWMS (applied or warned) count. Lines users add are grouped within a step by wording: the same words in the same order, whatever the case, punctuation or spacing.`,
      'Steps not wholly in SiteReady\'s own words are shown as "(a step made from the task)", and every line is passed through the name scrubber again before it is shown.',
    ],
    months,
    failedQuestions: { total: shown.wrongAnswers, byKind: shown.wrongByKind, items },
    candidates: {
      threshold,
      thresholdDecided: THRESHOLD_DECIDED,
      thresholdNote: `Shown when seen in at least ${threshold} different saved SWMS. The number awaits the owner's decision.`,
      rule: 'A candidate becomes a library line only with a source we hold (D181), the goal 5 evidence test, the line check and a person\'s sign-off. This report never changes the library.',
      ...candidates,
    },
    trend: {
      editRate: trendOf(months, 'editRate', 'editRateWhy'),
      wrongRate: trendOf(months, 'wrongRate', 'wrongRateWhy'),
      acceptance: { captured: false, says: ACCEPTANCE_NOTE },
    },
  };
}

// ---- The report as text, for the owner to keep each month ----

const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const figure = (value, why) => (value === null ? `none (${why || 'not computed'})` : String(value));
const GROUP_TITLES = {
  removed: 'SiteReady lines most often removed',
  added: 'Lines users keep adding',
  notApplicable: 'Hazards marked "does not apply"',
  reverted: 'Changes undone in the next revision',
};
const KIND_WORDS = { removed: 'removed', changed: 'changed', added: 'added', hazardChanged: 'hazard changed', hazardAdded: 'hazard added', hazardNotApplicable: 'hazard does not apply', whoChanged: 'Who changed' };

function table(head, rows, empty) {
  if (!rows.length) return `${empty}\n`;
  return [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`)].join('\n') + '\n';
}

function reportMarkdown(report) {
  const out = [];
  out.push(`# SiteReady learning report: ${report.month}`, '');
  out.push(`Goal 11. ${report.whole ? 'A whole month.' : 'This month so far: the month is not over.'} Counts only: no names, businesses or sites.`, '');
  out.push(`**${report.recordingNote}**`, '');
  out.push('## Edit rate by month', '');
  out.push(table(['Month', 'SWMS saved', 'New SWMS changed', 'Changes on new SWMS', 'Edit rate', 'Revisions saved', 'Changes new in a revision', 'Changes per saved revision'],
    report.months.map((item) => [item.month, item.swmsSaved, item.newSwmsChanged, item.newSwmsChanges, figure(item.editRate, item.editRateWhy), item.revisionsSaved, item.newChanges, figure(item.revisionRate, item.recorded ? 'no revisions saved' : 'nothing recorded yet')]), 'No months.'));
  out.push('## Failed check questions by month', '');
  out.push(table(['Month', 'Worker sign-ons', 'Wrong answers', 'PPE', 'Step', 'Control', 'Wrong answers per sign-on'],
    report.months.map((item) => [item.month, item.signons, item.wrongAnswers, item.wrongByKind.ppe, item.wrongByKind.step, item.wrongByKind.control, figure(item.wrongRate, item.wrongRateWhy)]), 'No months.'));
  out.push(`### Most often wrong in ${report.month}`, '');
  out.push(table(['Kind', 'Step', 'Right answer', 'Wrong answers'], report.failedQuestions.items.map((item) => [item.kind, item.step, item.item, item.wrong]), 'No wrong answers recorded this month.'));
  out.push('## The last three months', '');
  for (const [name, trend] of [['Edit rate', report.trend.editRate], ['Wrong answers per sign-on', report.trend.wrongRate]]) {
    out.push(`- ${name}: ${trend.values.map((item) => `${item.month} ${item.value === null ? 'none' : item.value}`).join(', ')}. ${trend.says}`);
  }
  out.push(`- ${report.trend.acceptance.says}`, '');
  out.push('## Candidate library changes', '');
  out.push(`${report.candidates.thresholdNote} ${report.candidates.rule}`, '');
  for (const group of CANDIDATE_GROUPS) {
    const { shown, below } = report.candidates[group];
    out.push(`### ${GROUP_TITLES[group]}`, '');
    const head = group === 'added' ? ['Step', 'Line added', 'SWMS', 'This month', 'Goal 5 check needed']
      : group === 'reverted' ? ['Step', 'Change', 'SiteReady line', 'User line', 'SWMS', 'This month', 'Goal 5 check needed']
        : ['Step', group === 'notApplicable' ? 'Hazard' : 'Line', 'SWMS', 'This month', 'Legal requirement', 'Goal 5 check needed'];
    const rows = shown.map((item) => {
      if (group === 'added') return [item.step, item.newLine, item.swms, item.swmsThisMonth, 'Yes'];
      if (group === 'reverted') return [item.step, KIND_WORDS[item.kind] || item.kind, item.line, item.newLine, item.swms, item.swmsThisMonth, 'Yes'];
      return [item.step, item.line, item.swms, item.swmsThisMonth, item.legalRequirement || 'No', 'Yes'];
    });
    out.push(table(head, rows, 'None at or above the threshold.'));
    out.push(`Below the threshold: ${below} pattern${below === 1 ? '' : 's'}.`, '');
  }
  out.push('## Method', '');
  for (const line of report.method) out.push(`- ${line}`);
  out.push('');
  return out.join('\n');
}

module.exports = { enabled, recordControlEdits, recordFailedQuestions, summary, monthlyReport, reportMarkdown, lastWholeMonth, isMonth, removeOld, scrub, accountValues, accountTerms, RETENTION_YEARS, CANDIDATE_THRESHOLD };
