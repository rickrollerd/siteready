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

// In production, CONTROL_LEARNING_KEY must be set too, or nothing is kept (secret-keys.js).
const enabled = () => String(process.env.CONTROL_LEARNING || '').trim().toLowerCase() === 'on' && Boolean(controlLearningKey());
// Months are counted in Queensland time, which has no daylight saving.
const monthOf = (date) => new Date(date.getTime() + 10 * 3600000).toISOString().slice(0, 7);
const RETENTION_YEARS = 3;
const hash = (text) => crypto.createHash('sha256').update(String(text)).digest('hex');
// The saved SWMS by a keyed fingerprint, so a row cannot be traced back to it without the key.
const swmsKey = (id) => crypto.createHmac('sha256', controlLearningKey()).update(String(id)).digest('hex');

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
    .replace(/\[(name|site)\](?:\s+\[(?:name|site)\])+/g, '[$1]')
    .slice(0, 600);
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
    trade: String((input && input.trade) || '').slice(0, 100),
    kinds: JSON.stringify(Array.isArray(input && input.kinds) ? input.kinds.slice(0, 80) : []),
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
      [crypto.randomBytes(12).toString('hex'), monthOf(now), state ? state.id : '', String((input && input.trade) || '').slice(0, 100), String(language || 'en').slice(0, 20),
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

module.exports = { enabled, recordControlEdits, recordFailedQuestions, summary, removeOld, scrub, accountValues, accountTerms, RETENTION_YEARS };
