// Proof that a worker read the SWMS before signing on (task #92): the sections and their
// minimum reading times, the two check questions, the reading record printed on the sign-on
// sheet, and translations of the SWMS to help workers read it. The English version applies.
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
  { code: 'pt', name: 'Portuguese', label: 'Portuguese (Português)' },
  { code: 'el', name: 'Greek', label: 'Greek (Ελληνικά)' },
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

// A repeatable random sequence from the SWMS id, so the questions are the same every time.
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

const EVERYDAY_PPE = /\b(sleeves?|pants|trousers|clothing|shirts?|hi-?vis|glasses|goggles|gloves?|boots?|hard hats?|hats?|helmets?|sunscreen|sun|brim|neck flaps?|chin straps?|ear|hearing|dust masks?|knee)\b/i;

// A ticked PPE item, with 3 unticked items as decoys: from its own group first, then the others.
function ppeQuestion(draft, random) {
  const groups = draft.ppe || [];
  const ticked = new Set(tickedPpe(draft));
  // A wrong answer must be clearly wrong: never everyday PPE a worker could fairly think is needed
  // (sleeves, hi-vis, glasses, gloves and the like), nor a near twin of a ticked item.
  const tickedWords = new Set([...ticked].flatMap(keyWords));
  const fair = (label) => !EVERYDAY_PPE.test(label) && !keyWords(label).some((word) => tickedWords.has(word));
  const unticked = (group) => [...new Set(group.items.filter((item) => !item.ticked && !ticked.has(item.label) && fair(item.label)).map((item) => item.label))];
  const all = [...new Set(groups.flatMap(unticked))];
  if (!ticked.size || all.length < 3) return null;
  const candidates = shuffled(groups.flatMap((group) => group.items.filter((item) => item.ticked).map((item) => ({ label: item.label, group }))), random);
  const pick = candidates.find((item) => unticked(item.group).length >= 3) || candidates[0];
  const near = shuffled(unticked(pick.group), random);
  const far = shuffled(all.filter((label) => !near.includes(label)), random);
  return question('ppe', 'Which of these PPE does this SWMS list?', pick.label, [...near, ...far], 'ppe', random);
}

// Library step names that share no telling word with this SWMS's steps make clear decoys.
const COMMON = new Set(['before', 'starting', 'finish', 'clean', 'install', 'remove', 'check', 'work', 'from', 'with', 'into', 'over', 'under', 'make', 'lift', 'carry', 'fix', 'set', 'use', 'the', 'and', 'for', 'out', 'up']);
const keyWords = (name) => String(name).toLowerCase().split(/[^a-z0-9]+/).map((word) => word.replace(/s$/, '')).filter((word) => word.length > 2 && !COMMON.has(word));
const GENERIC_STEP_WORDS = new Set(['leave', 'close', 'connect', 'commission', 'test', 'prepare', 'plan', 'tidy', 'pack', 'start', 'stop', 'site', 'area', 'job', 'task', 'materials', 'equipment', 'tools', 'load', 'unload', 'deliver', 'store', 'handle', 'move', 'access', 'mark', 'measure', 'inspect', 'secure', 'complete', 'hand', 'over']);
let libraryNames = null;

function stepQuestion(id, draft, correct, random) {
  if (!libraryNames) libraryNames = [...new Set(ACTIVITIES.flatMap((activity) => activity.steps.map((step) => step.step)))].filter((name) => !ROUTINE_STEPS.includes(name));
  const own = (draft.jobSteps || []).map((step) => step.step);
  const lower = new Set(own.map((name) => name.toLowerCase()));
  const used = new Set(own.flatMap(keyWords));
  const outside = libraryNames.filter((name) => !lower.has(name.toLowerCase()));
  // A decoy names real work ("Place and tie reo"), not a step any job could have ("Leave and close up").
  const telling = (name) => keyWords(name).some((word) => !GENERIC_STEP_WORDS.has(word));
  let pool = outside.filter((name) => telling(name) && !keyWords(name).some((word) => used.has(word)));
  if (pool.length < 3) pool = outside;
  if (pool.length < 3) return null;
  return question(id, 'Which of these is a job step in this SWMS?', correct, shuffled(pool, random), 'steps', random);
}

// Up to two questions, made the same way every time for the same SWMS. When there is no PPE
// question, a second job step question takes its place.
function checkQuestions(swmsId, draft) {
  const random = seeded(`questions:${swmsId}`);
  const steps = shuffled((draft.jobSteps || []).map((step) => step.step).filter((name) => !ROUTINE_STEPS.includes(name)), random);
  const out = [];
  const ppe = ppeQuestion(draft, random);
  if (ppe) out.push(ppe);
  if (steps[0]) out.push(stepQuestion('steps', draft, steps[0], random));
  if (!ppe && steps[1]) out.push(stepQuestion('steps2', draft, steps[1], random));
  return out.filter(Boolean);
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

function duration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  return minutes ? `${minutes} min ${total % 60} s` : `${total} s`;
}

function readingNote(item) {
  if (item.explained_by) return `Explained by ${item.explained_by} (supervisor)`;
  if (!item.language) return '';
  const language = languageFor(item.language);
  const read = item.language === 'en' || !language ? 'Read in English' : `Read in ${language.name} (translation)`;
  const total = Number(item.sections_total) || 0;
  const viewed = Number(item.sections_viewed) || 0;
  const parts = [read, duration(item.read_seconds), viewed >= total ? `all ${total} sections viewed` : `${viewed} of ${total} sections viewed`];
  if (item.check_attempts !== null && item.check_attempts !== undefined) {
    const attempts = Number(item.check_attempts);
    parts.push(`check questions passed (${attempts} attempt${attempts === 1 ? '' : 's'})`);
  }
  return parts.join(', ');
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
  required: ['title', 'highRisk', 'steps', 'ppe', 'questions'],
  properties: {
    title: { type: 'string' },
    highRisk: strings,
    steps: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['step', 'hazards', 'controls'], properties: { step: { type: 'string' }, hazards: strings, controls: strings } } },
    ppe: strings,
    questions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['question', 'options'], properties: { question: { type: 'string' }, options: strings } } },
  },
};

// The English the worker sees, in the translation's shape.
function translatable(title, draft, questions) {
  return {
    title,
    highRisk: draft.highRisk || [],
    steps: (draft.jobSteps || []).map((step) => ({ step: step.step, hazards: step.hazards, controls: step.controls })),
    ppe: tickedPpe(draft),
    questions: questions.map((item) => ({ question: item.question, options: item.options })),
  };
}

// The translation must match the English item for item, or it is not used.
function sameShape(english, value) {
  const list = (a, b) => Array.isArray(b) && a.length === b.length && b.every((item) => typeof item === 'string');
  return Boolean(value) && typeof value.title === 'string'
    && list(english.highRisk, value.highRisk) && list(english.ppe, value.ppe)
    && Array.isArray(value.steps) && value.steps.length === english.steps.length
    && english.steps.every((step, i) => value.steps[i] && typeof value.steps[i].step === 'string' && list(step.hazards, value.steps[i].hazards) && list(step.controls, value.steps[i].controls))
    && Array.isArray(value.questions) && value.questions.length === english.questions.length
    && english.questions.every((item, i) => value.questions[i] && typeof value.questions[i].question === 'string' && list(item.options, value.questions[i].options));
}

const working = new Map();

// Each SWMS is translated once per language; the copy is kept until its English changes.
async function translation(row, draft, code) {
  if (!aiScope.enabled()) throw fail(503, 'Translation is not available. Read the SWMS in English, or ask your supervisor to explain it.');
  const language = languageFor(String(code || ''));
  if (!language) throw fail(400, 'That language is not offered.');
  const english = translatable(row.title, draft, checkQuestions(row.id, draft));
  const contentKey = hash(JSON.stringify(english));
  const id = hash(`${row.id}:${contentKey}:${language.code}`);
  const out = (value) => ({ language: { code: language.code, name: language.name, rtl: Boolean(language.rtl), lessReliable: Boolean(language.lessReliable) }, ...value });
  const kept = await db.one('SELECT translation FROM sign_translations WHERE id = $1', [id]);
  if (kept) return out(JSON.parse(kept.translation));
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
  return out(await working.get(id));
}

module.exports = {
  LANGUAGES, languageFor, readSections, checkQuestions, publicQuestions, tickedPpe, startRead, checkRead, markAnswers, wrongMessage, useRead,
  sectionSeconds, readingNote, translation, TRANSLATE_SCHEMA, SERVER_SHARE,
};
