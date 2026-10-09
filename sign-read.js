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
// step: the job step a step or control question tests, kept with a failed answer (control-learning.js).
const poolItem = (kind, text, correct, decoys, step = '') => ({ kind, question: text, correct, decoys: decoys.slice(0, DECOYS_KEPT), step });

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
  // The wrong answers are never everyday PPE, so an everyday item as the right answer would stand
  // out. The question asks only about PPE particular to this work; a SWMS with none gets a second
  // job step question instead.
  const seen = new Set();
  return groups.flatMap((group) => group.items.filter((item) => item.ticked && !EVERYDAY_PPE.test(item.label) && !seen.has(item.label) && seen.add(item.label)).map((item) => {
    const near = shuffled(unticked(group), random);
    const far = shuffled(all.filter((label) => !near.includes(label)), random);
    return poolItem('ppe', 'Which of these PPE does this SWMS list?', item.label, [...near, ...far]);
  }));
}

// Library step names and controls are the decoys. Words any job could use are left out of the
// comparison, and words are stemmed lightly, so "roofing" and "roof" count as one.
const COMMON = new Set(['before', 'starting', 'finish', 'clean', 'install', 'remove', 'check', 'work', 'from', 'with', 'into', 'over', 'under', 'make', 'lift', 'carry', 'fix', 'set', 'use', 'the', 'and', 'for', 'out', 'up']);
const keyWords = (name) => String(name).toLowerCase().split(/[^a-z0-9]+/).map((word) => word.replace(/s$/, '')).filter((word) => word.length > 2 && !COMMON.has(word));
const GENERIC_STEP_WORDS = new Set(['leave', 'close', 'connect', 'commission', 'test', 'prepare', 'plan', 'tidy', 'pack', 'start', 'stop', 'site', 'area', 'job', 'task', 'materials', 'equipment', 'tools', 'load', 'unload', 'deliver', 'store', 'handle', 'move', 'access', 'mark', 'measure', 'inspect', 'secure', 'complete', 'hand', 'over']);
const PLAIN_WORDS = new Set(['are', 'all', 'any', 'each', 'every', 'when', 'where', 'while', 'not', 'than', 'then', 'been', 'being', 'have', 'has', 'had', 'must', 'should', 'will', 'can', 'this', 'that', 'these', 'those', 'its', 'their', 'there', 'only', 'after', 'who', 'what', 'which', 'per', 'such', 'also', 'more', 'used', 'kept', 'made', 'done', 'given', 'person', 'people', 'worker', 'new', 'old', 'way', 'place', 'one', 'two']);
const stem = (word) => word.replace(/(?<=\w{3})(ing|ed)$/, '');
const terms = (text) => new Set(keyWords(text).filter((word) => !GENERIC_STEP_WORDS.has(word) && !PLAIN_WORDS.has(word)).map(stem));
const shared = (a, b) => [...a].filter((word) => b.has(word)).length;
// Two lines are near twins when they share half their words, or one's words are all in the other.
const twins = (a, b) => {
  const n = shared(a, b);
  return n > 0 && (2 * n / (a.size + b.size) >= 0.5 || n === Math.min(a.size, b.size));
};
// Doing words say little about the work: "Replace the flashing" is not close to "Replace the pump".
const ACTION_WORDS = new Set(['replace', 'repair', 'erect', 'build', 'lay', 'fit', 'run', 'place', 'strip', 'dismantle', 'apply', 'form', 'stand', 'break', 'dig', 'drive', 'operate', 'maintain', 'service', 'cut', 'drill', 'clear', 'keep', 'stay', 'wear', 'worn', 'used', 'kept']);
// The closest lines kept as decoys: enough that each answer finds close ones both shorter and
// longer than itself.
const CLOSE_KEPT = 400;
// A word in more library lines than this says little about the work ("gloves", "edge", "load").
const SPECIFIC_LINES = 100;
// Lines any job could have are never wrong answers: a worker could fairly think they are in this
// SWMS. Everyday PPE (as for the PPE question), heat and rest, and manual handling.
const ANY_JOB = /\b(rest breaks?|shade|drink|fatigue|manual handling|team lift|first aid)\b/i;
let libraryNames = null;
let libraryControls = null;
let libraryWords = null;

// How many library lines (step names and controls) use each word: rarer words tell more.
function wordLines() {
  if (!libraryWords) {
    libraryWords = new Map();
    const lines = new Set(ACTIVITIES.flatMap((activity) => activity.steps.flatMap((step) => [step.step, ...step.controls.map(controlText)])).filter(Boolean));
    for (const line of lines) for (const word of terms(line)) libraryWords.set(word, (libraryWords.get(word) || 0) + 1);
  }
  return libraryWords;
}

const libraryTerms = new Map();
// A library line's words, worked out once. null: a line any job could have, never a decoy.
function lineTerms(text) {
  if (!libraryTerms.has(text)) libraryTerms.set(text, EVERYDAY_PPE.test(text) || ANY_JOB.test(text) ? null : terms(text));
  return libraryTerms.get(text);
}

// Wrong answers close to the work, so guessing does not pass: each shares a telling word with this
// SWMS, so it reads as something this job could have. To stay fair to a worker reading in a
// second language, who looks back at the SWMS to answer, none is in this SWMS, a near twin of any
// line in it, or a line any job could have. Closest first, by how telling the shared words are.
// Where too few are close, any clearly different line fills in.
function closeDecoys(candidates, own, { work, task }) {
  const counts = wordLines();
  const weight = (word) => Math.log(4 * SPECIFIC_LINES / Math.min(counts.get(word) || 1, 4 * SPECIFIC_LINES));
  const ownTerms = own.map(terms);
  const lines = [...new Set(candidates)].map((text) => ({ text, words: lineTerms(text) })).filter(({ words }) => words && words.size > 0);
  const fair = ({ words }) => !ownTerms.some((other) => twins(words, other));
  const ranked = lines.map((item) => {
    // Words of the task itself count twice: a guess from the task's words alone should not pass.
    const common = [...item.words].filter((word) => work.has(word) && !ACTION_WORDS.has(word));
    return { ...item, specific: common.some((word) => (counts.get(word) || 0) <= SPECIFIC_LINES), score: common.reduce((sum, word) => sum + weight(word) * (task.has(word) ? 2 : 1), 0) };
  }).filter((item) => item.specific).sort((a, b) => b.score - a.score || a.text.localeCompare(b.text));
  const close = [];
  for (const item of ranked) {
    if (close.length >= CLOSE_KEPT) break;
    if (fair(item)) close.push(item.text);
  }
  if (close.length >= DECOYS_KEPT) return close;
  return [...close, ...lines.filter((item) => !close.includes(item.text) && fair(item)).map((item) => item.text).sort()];
}

// Every word in this SWMS's job steps, hazards and controls: what makes a decoy close to the work.
const workTermsOf = (draft) => ({ work: terms([draft.task || '', ...(draft.jobSteps || []).flatMap((step) => [step.step, ...step.hazards, ...step.controls])].join(' ')), task: terms(draft.task || '') });

// The decoys kept for one answer: the closest to the work, half shorter than it and half longer
// where the list allows, so a read can put the right answer anywhere from shortest to longest.
const LENGTH_SIDE = 12;
function bothLengths(correct, decoys, random) {
  const shorter = shuffled(decoys.filter((text) => text.length <= correct.length).slice(0, LENGTH_SIDE), random);
  const longer = shuffled(decoys.filter((text) => text.length > correct.length).slice(0, LENGTH_SIDE), random);
  const half = DECOYS_KEPT / 2;
  const kept = [...shorter.slice(0, Math.max(half, DECOYS_KEPT - longer.length)), ...longer.slice(0, Math.max(half, DECOYS_KEPT - shorter.length))].slice(0, DECOYS_KEPT);
  return [...kept, ...decoys.filter((text) => !kept.includes(text))];
}

// Each job step, with library step names close to the work as decoys.
function stepPool(draft, steps, random) {
  if (!libraryNames) libraryNames = [...new Set(ACTIVITIES.flatMap((activity) => activity.steps.map((step) => step.step)))].filter((name) => !ROUTINE_STEPS.includes(name));
  const own = (draft.jobSteps || []).map((step) => step.step);
  const lower = new Set(own.map((name) => name.toLowerCase()));
  // A decoy names real work ("Place and tie reo"), not a step any job could have ("Leave and close up").
  const telling = (name) => keyWords(name).some((word) => !GENERIC_STEP_WORDS.has(word));
  const decoys = closeDecoys(libraryNames.filter((name) => !lower.has(name.toLowerCase()) && telling(name)), own, workTermsOf(draft));
  if (decoys.length < 3) return [];
  return steps.map((name) => poolItem('step', 'Which of these is a job step in this SWMS?', name, bothLengths(name, decoys, random), name));
}

// Up to two short controls from each job step, with library controls close to the work as decoys.
const controlText = (control) => (typeof control === 'string' ? control : (control && typeof control.text === 'string' && control.text) || '');
const shortControl = (text) => Boolean(text) && text.length <= MAX_CONTROL_LENGTH && !/[()]/.test(text);
function controlPool(draft, random) {
  if (!libraryControls) {
    libraryControls = ACTIVITIES.flatMap((activity) => activity.steps.filter((step) => !ROUTINE_STEPS.includes(step.step))
      .flatMap((step) => step.controls.map((control) => ({ step: step.step.toLowerCase(), text: controlText(control) })))).filter((item) => shortControl(item.text));
  }
  const own = draft.jobSteps || [];
  const names = new Set(own.map((step) => step.step.toLowerCase()));
  const lines = own.flatMap((step) => [step.step, ...step.hazards, ...step.controls]);
  const telling = (text) => keyWords(text).filter((word) => !GENERIC_STEP_WORDS.has(word)).length >= 2;
  const candidates = libraryControls.filter((item) => !names.has(item.step) && telling(item.text) && !lines.includes(item.text)).map((item) => item.text);
  // A decoy is not a near twin of any control, hazard or PPE item in this SWMS.
  const decoys = closeDecoys(candidates, [...lines, ...tickedPpe(draft)], workTermsOf(draft));
  if (decoys.length < 3) return [];
  return own.flatMap((step, index) => (ROUTINE_STEPS.includes(step.step) ? [] : shuffled([...new Set(step.controls.filter(shortControl))], random).slice(0, 2)
    .map((control) => poolItem('control', `Which of these is a control in step ${index + 1} (${step.step})?`, control, bothLengths(control, decoys, random), step.step))));
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

// Three wrong answers for one question: from none to all three shorter than the right answer, at
// random, so neither the longest nor the shortest answer is more often right.
function threeDecoys(item, random) {
  const decoys = shuffled(item.decoys, random);
  const shorter = decoys.filter((text) => text.length <= item.correct.length);
  const longer = decoys.filter((text) => text.length > item.correct.length);
  const wanted = Math.floor(random() * 4);
  const picked = [...shorter.slice(0, wanted), ...longer.slice(0, 3 - Math.min(wanted, shorter.length))];
  return [...picked, ...decoys.filter((text) => !picked.includes(text))];
}

// Two questions for one read, drawn from the pool by the read id, so each worker gets their own
// and the same read always gets the same ones. When there is no PPE question, a second job step
// question takes its place. After each wrong attempt (round) the worker gets fresh questions,
// not asked before in this read while the pool has others, so trying every answer in turn
// does not work.
function checkQuestions(swmsId, readId, draft, round = 0) {
  const pool = questionPool(swmsId, draft);
  const asked = new Set();
  const key = (item) => `${item.question}\n${item.correct}`;
  let out = [];
  for (let n = 0; n <= Math.max(0, Math.floor(Number(round) || 0)); n += 1) {
    const random = seeded(n ? `questions:${readId}:${n}` : `questions:${readId}`);
    const fresh = (items) => (items.some((item) => !asked.has(key(item))) ? items.filter((item) => !asked.has(key(item))) : [...items]);
    const take = (items) => items.splice(Math.floor(random() * items.length), 1)[0];
    const ask = (id, item) => ({ ...question(id, item.question, item.correct, threeDecoys(item, random), item.kind === 'ppe' ? 'ppe' : 'steps', random), kind: item.kind, step: item.step, key: key(item) });
    const steps = fresh(pool.steps);
    // Once every PPE question has been asked in this read, a second job step question is asked
    // instead, while there are fresh ones.
    const ppe = pool.ppe.length > 0 && (n === 0 || pool.ppe.some((item) => !asked.has(key(item))) || steps.length < 2);
    out = [];
    if (ppe) out.push(ask('ppe', take(fresh(pool.ppe))));
    if (steps.length) out.push(ask('steps', take(steps)));
    if (!ppe && steps.length) out.push(ask('steps2', take(steps.length ? steps : fresh(pool.steps))));
    out.forEach((item) => asked.add(item.key));
  }
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

// Two wrong attempts are free. After that the worker waits before trying again, longer each
// time up to 2 minutes, and is asked to read the sections again: a worker who read the SWMS
// answers well inside that, and guessing becomes slower than reading.
const FREE_ATTEMPTS = 2;
const WAIT_STEP_SECONDS = 30;
const MAX_WAIT_SECONDS = 120;
const waitAfter = (wrongAttempts) => (wrongAttempts < FREE_ATTEMPTS ? 0 : Math.min(MAX_WAIT_SECONDS, WAIT_STEP_SECONDS * (wrongAttempts - FREE_ATTEMPTS + 1)));

// Seconds before this read may be answered again (0 when it may be answered now).
function waitLeft(read, now = new Date()) {
  const wait = waitAfter(Number(read.attempts) || 0);
  if (!wait || !read.wrong_at) return 0;
  return Math.max(0, Math.ceil(wait - (now.getTime() - new Date(read.wrong_at).getTime()) / 1000));
}

function waitMessage(seconds) {
  return `Read the sections again before you answer. You can answer again in ${seconds} seconds.`;
}

// Marks each answer. Returns the wrong questions, and counts the attempt. A wrong attempt's time
// is kept, for the wait before the next.
async function markAnswers(read, questions, answers, now = new Date()) {
  const given = answers && typeof answers === 'object' ? answers : {};
  const wrong = questions.filter((item) => !Number.isInteger(given[item.id]) || given[item.id] !== item.answer);
  const rows = wrong.length
    ? await db.query('UPDATE sign_reads SET attempts = attempts + 1, wrong_at = $2 WHERE id = $1 RETURNING attempts', [read.id, now])
    : await db.query('UPDATE sign_reads SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts', [read.id]);
  const attempts = rows[0] ? Number(rows[0].attempts) : 1;
  return { attempts, wrong, wait: wrong.length ? waitAfter(attempts) : 0 };
}

// wait: the seconds before the next try, after two wrong attempts.
function wrongMessage(questions, wrong, wait = 0) {
  const parts = wrong.map((item) => `question ${questions.indexOf(item) + 1}`);
  const sections = [...new Set(wrong.map((item) => (item.section === 'ppe' ? 'PPE to wear' : 'Job steps')))];
  const which = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]} are` : `${parts[0]} is`;
  return `The answer to ${which} not right. Read the ${sections.join(' and ')} section${sections.length > 1 ? 's' : ''} again, then answer the new questions.${wait ? ` You can answer again in ${wait} seconds.` : ''}`;
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
  // The questions the worker has now: fresh ones after each wrong attempt.
  const read = readId ? await db.one('SELECT attempts FROM sign_reads WHERE id = $1 AND swms_id = $2', [String(readId).slice(0, 64), row.id]) : null;
  const questions = readId ? checkQuestions(row.id, String(readId).slice(0, 64), draft, read ? Number(read.attempts) : 0) : [];
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
  waitLeft, waitMessage,
  sectionSeconds, signOnNote, translation, TRANSLATE_SCHEMA, SERVER_SHARE,
};
