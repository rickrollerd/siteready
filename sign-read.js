// Proof that a worker read the SWMS before signing on (task #92): the sections and their
// minimum reading times, the check questions, the line on the sign-on sheet, and translations
// of the SWMS to help workers read it. The English version applies.
// Each read gets its own two questions from a pool built from the SWMS (task #95).
// How a worker read (language, time, sections viewed, check attempts) is kept for SiteReady's
// own learning only (owner decision, 6 October 2026). It is never shown to the business or
// the builder, never exported, and never put in the industry data: the sign-on sheet shows only
// that the worker read, agreed and signed.
const crypto = require('crypto');
const db = require('./db');
const aiScope = require('./ai-scope');
const { ACTIVITIES } = require('./activities');

// Languages offered on the sign-on page, as the owner chose them. Each shows its own name too.
// rtl marks languages written right to left; lessReliable marks languages machine translation
// handles less well, which get an extra warning under the banner (none at present).
const LANGUAGES = [
  { code: 'zh-Hans', name: 'Simplified Chinese (Mandarin)', label: 'Simplified Chinese, Mandarin (简体中文)' },
  { code: 'zh-Hant', name: 'Traditional Chinese (Cantonese)', label: 'Traditional Chinese, Cantonese (繁體中文)' },
  { code: 'ar', name: 'Arabic', label: 'Arabic (العربية)', rtl: true },
  { code: 'vi', name: 'Vietnamese', label: 'Vietnamese (Tiếng Việt)' },
  { code: 'pa', name: 'Punjabi', label: 'Punjabi (ਪੰਜਾਬੀ)' },
  { code: 'hi', name: 'Hindi', label: 'Hindi (हिन्दी)' },
  { code: 'ko', name: 'Korean', label: 'Korean (한국어)' },
  { code: 'es', name: 'Spanish', label: 'Spanish (Español)' },
  { code: 'tl', name: 'Filipino (Tagalog)', label: 'Filipino (Tagalog)' },
  { code: 'id', name: 'Indonesian', label: 'Indonesian (Bahasa Indonesia)' },
];

// A worker reads about 5 words a second; no section counts as read in under 2 seconds.
const WORDS_PER_SECOND = 5;
const MIN_SECTION_SECONDS = 2;
// The server lets the whole read through at 80% of the total, for fast readers and clock drift.
const SERVER_SHARE = 0.8;
const NO_HIGH_RISK = 'Not identified as high risk construction work.';
const NO_PPE = 'None listed.';
const ROUTINE_STEPS = ['Before starting', 'Finish and clean up'];

function fail(status, message) {
  return Object.assign(new Error(message), { status, publicMessage: true });
}

const hash = (text) => crypto.createHash('sha256').update(String(text)).digest('hex');
const words = (texts) => texts.join(' ').split(/\s+/).filter(Boolean).length;
const languageFor = (code) => LANGUAGES.find((item) => item.code === code) || null;

function tickedPpe(draft) {
  return [...new Set((draft.ppe || []).flatMap((group) => group.items.filter((item) => item.ticked).map((item) => item.label)))];
}

// What the worker reads, in order: high risk work, each job step, then PPE.
function readSections(draft) {
  const risks = (draft.highRisk || []).length ? draft.highRisk : [NO_HIGH_RISK];
  const ppe = tickedPpe(draft);
  const list = [
    { id: 'risks', label: 'High risk work', texts: risks },
    ...(draft.jobSteps || []).map((step, index) => ({ id: `step-${index + 1}`, label: `Step ${index + 1}: ${step.step}`, texts: [step.step, ...step.hazards, ...step.controls] })),
    { id: 'ppe', label: 'PPE to wear', texts: ppe.length ? ppe : [NO_PPE] },
  ];
  return list.map(({ id, label, texts }) => ({ id, label, minSeconds: Math.max(MIN_SECTION_SECONDS, Math.ceil(words(texts) / WORDS_PER_SECOND)) }));
}

// The fingerprint of what the worker is shown, so a SWMS changed mid-read is noticed.
function contentHash(title, draft) {
  return hash(JSON.stringify({ title, highRisk: draft.highRisk || [], jobSteps: draft.jobSteps || [], ppe: tickedPpe(draft) }));
}

// A repeatable random sequence from a seed (the SWMS id or the read id).
function seeded(seed) {
  let state = parseInt(hash(seed).slice(0, 8), 16) >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(items, random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// The correct answer is put among the decoys at a repeatable place.
function question(id, text, correct, decoys, section, random) {
  const options = shuffled([correct, ...decoys.slice(0, 3)], random);
  return { id, question: text, options, answer: options.indexOf(correct), section };
}

// Each question in the pool keeps this many wrong answers; a read shows 3 of them.
const DECOYS_KEPT = 6;
// A control is an answer only when it is short and carries no citation.
const MAX_CONTROL_LENGTH = 120;
const poolItem = (kind, text, correct, decoys) => ({ kind, question: text, correct, decoys: decoys.slice(0, DECOYS_KEPT) });

const EVERYDAY_PPE = /\b(sleeves?|pants|trousers|clothing|shirts?|hi-?vis|glasses|goggles|gloves?|boots?|hard hats?|hats?|helmets?|sunscreen|sun|brim|neck flaps?|chin straps?|ear|hearing|dust masks?|knee)\b/i;

// Each ticked PPE item, with unticked items as decoys: from its own group first, then the others.
function ppePool(draft, random) {
  const groups = draft.ppe || [];
  const ticked = new Set(tickedPpe(draft));
  // A wrong answer must be clearly wrong: never everyday PPE a worker could fairly think is needed
  // (sleeves, hi-vis, glasses, gloves and the like), nor a near twin of a ticked item.
  const tickedWords = new Set([...ticked].flatMap(keyWords));
  const fair = (label) => !EVERYDAY_PPE.test(label) && !keyWords(label).some((word) => tickedWords.has(word));
  const unticked = (group) => [...new Set(group.items.filter((item) => !item.ticked && !ticked.has(item.label) && fair(item.label)).map((item) => item.label))];
  const all = [...new Set(groups.flatMap(unticked))];
  if (!ticked.size || all.length < 3) return [];
  const seen = new Set();
  return groups.flatMap((group) => group.items.filter((item) => item.ticked && !seen.has(item.label) && seen.add(item.label)).map((item) => {
    const near = shuffled(unticked(group), random);
    const far = shuffled(all.filter((label) => !near.includes(label)), random);
    return poolItem('ppe', 'Which of these PPE does this SWMS list?', item.label, [...near, ...far]);
  }));
}

// Library step names that share no telling word with this SWMS's steps make clear decoys.
const COMMON = new Set(['before', 'starting', 'finish', 'clean', 'install', 'remove', 'check', 'work', 'from', 'with', 'into', 'over', 'under', 'make', 'lift', 'carry', 'fix', 'set', 'use', 'the', 'and', 'for', 'out', 'up']);
const keyWords = (name) => String(name).toLowerCase().split(/[^a-z0-9]+/).map((word) => word.replace(/s$/, '')).filter((word) => word.length > 2 && !COMMON.has(word));
const GENERIC_STEP_WORDS = new Set(['leave', 'close', 'connect', 'commission', 'test', 'prepare', 'plan', 'tidy', 'pack', 'start', 'stop', 'site', 'area', 'job', 'task', 'materials', 'equipment', 'tools', 'load', 'unload', 'deliver', 'store', 'handle', 'move', 'access', 'mark', 'measure', 'inspect', 'secure', 'complete', 'hand', 'over']);
let libraryNames = null;
let libraryControls = null;

// Each job step, with library step names as decoys.
function stepPool(draft, steps, random) {
  if (!libraryNames) libraryNames = [...new Set(ACTIVITIES.flatMap((activity) => activity.steps.map((step) => step.step)))].filter((name) => !ROUTINE_STEPS.includes(name));
  const own = (draft.jobSteps || []).map((step) => step.step);
  const lower = new Set(own.map((name) => name.toLowerCase()));
  const used = new Set(own.flatMap(keyWords));
  const outside = libraryNames.filter((name) => !lower.has(name.toLowerCase()));
  // A decoy names real work ("Place and tie reo"), not a step any job could have ("Leave and close up").
  const telling = (name) => keyWords(name).some((word) => !GENERIC_STEP_WORDS.has(word));
  let decoys = outside.filter((name) => telling(name) && !keyWords(name).some((word) => used.has(word)));
  if (decoys.length < 3) decoys = outside;
  if (decoys.length < 3) return [];
  return steps.map((name) => poolItem('step', 'Which of these is a job step in this SWMS?', name, shuffled(decoys, random)));
}

// Up to two short controls from each job step, with controls from other library steps as decoys.
// A decoy shares no telling word with anything in this SWMS's steps, so it is clearly not here.
const controlText = (control) => (typeof control === 'string' ? control : (control && typeof control.text === 'string' && control.text) || '');
const shortControl = (text) => Boolean(text) && text.length <= MAX_CONTROL_LENGTH && !/[()]/.test(text);
function controlPool(draft, random) {
  if (!libraryControls) {
    libraryControls = ACTIVITIES.flatMap((activity) => activity.steps.filter((step) => !ROUTINE_STEPS.includes(step.step))
      .flatMap((step) => step.controls.map((control) => ({ step: step.step.toLowerCase(), text: controlText(control) })))).filter((item) => shortControl(item.text));
  }
  const own = draft.jobSteps || [];
  const names = new Set(own.map((step) => step.step.toLowerCase()));
  const used = new Set(own.flatMap((step) => [step.step, ...step.hazards, ...step.controls]).flatMap(keyWords));
  const telling = (text) => keyWords(text).filter((word) => !GENERIC_STEP_WORDS.has(word)).length >= 2;
  const decoys = [...new Set(libraryControls.filter((item) => !names.has(item.step) && telling(item.text) && !keyWords(item.text).some((word) => used.has(word))).map((item) => item.text))];
  if (decoys.length < 3) return [];
  return own.flatMap((step, index) => (ROUTINE_STEPS.includes(step.step) ? [] : shuffled([...new Set(step.controls.filter(shortControl))], random).slice(0, 2)
    .map((control) => poolItem('control', `Which of these is a control in step ${index + 1} (${step.step})?`, control, shuffled(decoys, random)))));
}

// Every question this SWMS can ask, made the same way every time from the SWMS alone, so it
// can be translated once. PPE questions, and job step and control questions.
function questionPool(swmsId, draft) {
  const random = seeded(`pool:${swmsId}`);
  const steps = (draft.jobSteps || []).map((step) => step.step).filter((name) => !ROUTINE_STEPS.includes(name));
  return { ppe: ppePool(draft, random), steps: [...stepPool(draft, steps, random), ...controlPool(draft, random)] };
}

// The words of the pool to translate: each question and every answer it may show.
function poolPhrases(pool) {
  return [...new Set([...pool.ppe, ...pool.steps].flatMap((item) => [item.question, item.correct, ...item.decoys]))];
}

// Two questions for one read, drawn from the pool by the read id, so each worker gets their own
// and the same read always gets the same ones. When there is no PPE question, a second job step
// question takes its place.
function checkQuestions(swmsId, readId, draft) {
  const pool = questionPool(swmsId, draft);
  const random = seeded(`questions:${readId}`);
  const take = (items) => items.splice(Math.floor(random() * items.length), 1)[0];
  const ask = (id, item) => question(id, item.question, item.correct, shuffled(item.decoys, random), item.kind === 'ppe' ? 'ppe' : 'steps', random);
  const steps = [...pool.steps];
  const out = [];
  if (pool.ppe.length) out.push(ask('ppe', take([...pool.ppe])));
  if (steps.length) out.push(ask('steps', take(steps)));
  if (!pool.ppe.length && steps.length) out.push(ask('steps2', take(steps)));
  return out;
}

// What the browser gets: never the answer.
function publicQuestions(questions) {
  return questions.map(({ id, question: text, options, section }) => ({ id, question: text, options, section }));
}

// ---- Read sessions ----

async function startRead(row, draft) {
  const id = crypto.randomBytes(18).toString('base64url');
  await db.query('INSERT INTO sign_reads (id, swms_id, content_hash, started_at) VALUES ($1, $2, $3, $4)', [id, row.id, contentHash(row.title, draft), new Date()]);
  return id;
}

// Checks the read session for a sign-on, and returns how long the worker had the SWMS open.
async function checkRead(row, draft, readId, now = new Date()) {
  const read = readId ? await db.one('SELECT * FROM sign_reads WHERE id = $1 AND swms_id = $2', [String(readId), row.id]) : null;
  if (!read) throw fail(400, 'Read the SWMS first. Reload this page and read it through before you sign on.');
  if (read.used_at) throw fail(400, 'This reading has already been used to sign on. Reload the page so the next worker can read the SWMS.');
  if (read.content_hash !== contentHash(row.title, draft)) throw fail(409, 'This SWMS has changed since you opened it. Reload the page and read it again.');
  const sections = readSections(draft);
  const needed = SERVER_SHARE * sections.reduce((sum, item) => sum + item.minSeconds, 0);
  const elapsed = (now.getTime() - new Date(read.started_at).getTime()) / 1000;
  if (elapsed < needed) throw fail(400, 'Read the SWMS first. Take the time to read every section, then sign on.');
  return { read, elapsed, sections };
}

// Marks each answer. Returns the wrong questions, and counts the attempt.
async function markAnswers(read, questions, answers) {
  const given = answers && typeof answers === 'object' ? answers : {};
  const rows = await db.query('UPDATE sign_reads SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts', [read.id]);
  const attempts = rows[0] ? Number(rows[0].attempts) : 1;
  const wrong = questions.filter((item) => !Number.isInteger(given[item.id]) || given[item.id] !== item.answer);
  return { attempts, wrong };
}

function wrongMessage(questions, wrong) {
  const parts = wrong.map((item) => `question ${questions.indexOf(item) + 1}`);
  const sections = [...new Set(wrong.map((item) => (item.section === 'ppe' ? 'PPE to wear' : 'Job steps')))];
  const which = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]} are` : `${parts[0]} is`;
  return `The answer to ${which} not right. Read the ${sections.join(' and ')} section${sections.length > 1 ? 's' : ''} again, then try again.`;
}

// Marks the read used, once only, so one reading signs on one worker.
async function useRead(read) {
  const rows = await db.query('UPDATE sign_reads SET used_at = $1 WHERE id = $2 AND used_at IS NULL RETURNING id', [new Date(), read.id]);
  if (!rows.length) throw fail(400, 'This reading has already been used to sign on. Reload the page so the next worker can read the SWMS.');
}

// The worker's own per-section times, kept as the record. Only known sections, in seconds.
function sectionSeconds(sections, reported) {
  const given = reported && typeof reported === 'object' ? reported : {};
  const out = {};
  for (const item of sections) {
    const value = Number(given[item.id]);
    out[item.id] = Number.isFinite(value) ? Math.round(Math.min(Math.max(value, 0), 86400) * 10) / 10 : 0;
  }
  return out;
}

// ---- The line on the sign-on sheet ----

// The only line the sign-on sheet prints under a worker's name: who explained the SWMS, where a
// supervisor did. How the worker read it is never printed.
function signOnNote(item) {
  return item && item.explained_by ? `Explained by ${item.explained_by} (supervisor)` : '';
}

// ---- Translation ----

const TRANSLATE_BRIEF = `You translate a safe work method statement (SWMS) for construction workers on an Australian building site, to help them read it. The English version is the one that applies.

Rules:
1. Translate faithfully. Do not add, drop, explain, soften or summarise anything. Every item in the English becomes exactly one item in the translation, in the same order.
2. Use plain, everyday words a construction worker would use and understand.
3. Keep numbers, units and measurements, Australian Standards (for example AS/NZS 1891), legislation and section references, licence names and class codes (for example "high risk work licence" with its class), product and plant names as they are, or with the English in brackets where a worker would need to recognise it on site.
4. Answer in the JSON shape given, with the same number of items in every list as the English.`;

const strings = { type: 'array', items: { type: 'string' } };
const TRANSLATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'highRisk', 'steps', 'ppe', 'phrases'],
  properties: {
    title: { type: 'string' },
    highRisk: strings,
    steps: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['step', 'hazards', 'controls'], properties: { step: { type: 'string' }, hazards: strings, controls: strings } } },
    ppe: strings,
    phrases: strings,
  },
};

// The English the worker sees, in the translation's shape. The phrases are every check question
// and answer the SWMS can ask, so one translation serves every read.
function translatable(title, draft, phrases) {
  return {
    title,
    highRisk: draft.highRisk || [],
    steps: (draft.jobSteps || []).map((step) => ({ step: step.step, hazards: step.hazards, controls: step.controls })),
    ppe: tickedPpe(draft),
    phrases,
  };
}

// The translation must match the English item for item, or it is not used.
function sameShape(english, value) {
  const list = (a, b) => Array.isArray(b) && a.length === b.length && b.every((item) => typeof item === 'string');
  return Boolean(value) && typeof value.title === 'string'
    && list(english.highRisk, value.highRisk) && list(english.ppe, value.ppe)
    && Array.isArray(value.steps) && value.steps.length === english.steps.length
    && english.steps.every((step, i) => value.steps[i] && typeof value.steps[i].step === 'string' && list(step.hazards, value.steps[i].hazards) && list(step.controls, value.steps[i].controls))
    && list(english.phrases, value.phrases);
}

const working = new Map();

// One read's questions in the translation, put together from the translated phrases.
function readTranslation(english, value, questions) {
  const phrase = new Map(english.phrases.map((text, i) => [text, value.phrases[i]]));
  const { phrases, ...rest } = value;
  return { ...rest, questions: questions.map((item) => ({ question: phrase.get(item.question), options: item.options.map((option) => phrase.get(option)) })) };
}

// Each SWMS is translated once per language; the copy is kept until its English changes.
// The questions sent back are the ones for the worker's read.
async function translation(row, draft, code, readId) {
  if (!aiScope.enabled()) throw fail(503, 'Translation is not available. Read the SWMS in English, or ask your supervisor to explain it.');
  const language = languageFor(String(code || ''));
  if (!language) throw fail(400, 'That language is not offered.');
  const english = translatable(row.title, draft, poolPhrases(questionPool(row.id, draft)));
  const questions = readId ? checkQuestions(row.id, String(readId).slice(0, 64), draft) : [];
  const contentKey = hash(JSON.stringify(english));
  const id = hash(`${row.id}:${contentKey}:${language.code}`);
  const out = (value) => ({ language: { code: language.code, name: language.name, rtl: Boolean(language.rtl), lessReliable: Boolean(language.lessReliable) }, ...value });
  const kept = await db.one('SELECT translation FROM sign_translations WHERE id = $1', [id]);
  if (kept) return out(readTranslation(english, JSON.parse(kept.translation), questions));
  // Two workers asking at once share one call.
  if (!working.has(id)) {
    const job = (async () => {
      let answer;
      try {
        answer = await aiScope.callModel({
          system: TRANSLATE_BRIEF,
          content: `Translate this SWMS into ${language.name}.\n<swms>\n${JSON.stringify(english)}\n</swms>`,
          schema: TRANSLATE_SCHEMA,
          effort: 'medium',
        });
      } catch (error) {
        if (error.publicMessage && error.status < 500) throw fail(502, 'The translation could not be made. Read the SWMS in English, or ask your supervisor to explain it.');
        throw fail(502, 'The translation could not be made just now. Try again, or read the SWMS in English.');
      }
      if (!sameShape(english, answer.value)) throw fail(502, 'The translation could not be made just now. Try again, or read the SWMS in English.');
      await db.query('INSERT INTO sign_translations (id, swms_id, content_hash, language, translation, model, usage, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING',
        [id, row.id, contentKey, language.code, JSON.stringify(answer.value), answer.model || '', JSON.stringify(answer.usage || {}), new Date()]);
      return answer.value;
    })().finally(() => working.delete(id));
    working.set(id, job);
  }
  return out(readTranslation(english, await working.get(id), questions));
}

module.exports = {
  LANGUAGES, languageFor, readSections, questionPool, checkQuestions, publicQuestions, tickedPpe, startRead, checkRead, markAnswers, wrongMessage, useRead,
  sectionSeconds, signOnNote, translation, TRANSLATE_SCHEMA, SERVER_SHARE,
};
