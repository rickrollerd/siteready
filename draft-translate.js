// The main app's draft, translated so a contractor can read it in their own language (task #94).
// The contractor writes in English; the SWMS, the Word and PDF files and everything the builder
// sees stay in English. Translated the same way as the worker sign-on page (sign-read.js), and
// kept against a fingerprint of the English and the language, so each is translated once.
const crypto = require('crypto');
const db = require('./db');
const aiScope = require('./ai-scope');
const { LANGUAGES, languageFor, tickedPpe } = require('./sign-read');

function fail(status, message) {
  return Object.assign(new Error(message), { status, publicMessage: true });
}

const hash = (text) => crypto.createHash('sha256').update(String(text)).digest('hex');
const enabled = () => aiScope.enabled() && db.enabled();

const BRIEF = `You translate a draft safe work method statement (SWMS) for a construction contractor on an Australian building site, to help them read it. The English version is the one that applies.

Rules:
1. Translate faithfully. Do not add, drop, explain, soften or summarise anything. Every item in the English becomes exactly one item in the translation, in the same order.
2. Use plain, everyday words a construction worker would use and understand.
3. Keep numbers, units and measurements, Australian Standards (for example AS/NZS 1891), legislation and section references, licence names and class codes (for example "high risk work licence" with its class), product and plant names as they are, or with the English in brackets where a worker would need to recognise it on site.
4. Answer in the JSON shape given, with the same number of items in every list as the English.`;

const strings = { type: 'array', items: { type: 'string' } };
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'highRisk', 'steps', 'ppe'],
  properties: {
    title: { type: 'string' },
    highRisk: strings,
    steps: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['step', 'hazards', 'controls'], properties: { step: { type: 'string' }, hazards: strings, controls: strings } } },
    ppe: strings,
  },
};

// The English to translate: the task, high risk work, each step with its hazards and controls, and the PPE.
function translatable(draft) {
  return {
    title: draft.task || '',
    highRisk: draft.highRisk || [],
    steps: (draft.jobSteps || []).map((step) => ({ step: step.step, hazards: step.hazards, controls: step.controls })),
    ppe: tickedPpe(draft),
  };
}

// The translation must match the English item for item, or it is not used.
function sameShape(english, value) {
  const list = (a, b) => Array.isArray(b) && a.length === b.length && b.every((item) => typeof item === 'string');
  return Boolean(value) && typeof value.title === 'string'
    && list(english.highRisk, value.highRisk) && list(english.ppe, value.ppe)
    && Array.isArray(value.steps) && value.steps.length === english.steps.length
    && english.steps.every((step, i) => value.steps[i] && typeof value.steps[i].step === 'string' && list(step.hazards, value.steps[i].hazards) && list(step.controls, value.steps[i].controls));
}

const working = new Map();

async function translateDraft(draft, code) {
  if (!enabled()) throw fail(503, 'Translation is not available.');
  const language = languageFor(String(code || ''));
  if (!language) throw fail(400, 'That language is not offered.');
  if (!draft || draft.kind !== 'draft') throw fail(400, 'Answer the questions first. Only a finished draft can be translated.');
  const english = translatable(draft);
  const contentKey = hash(JSON.stringify(english));
  const id = hash(`draft:${contentKey}:${language.code}`);
  const out = (value) => ({ language: { code: language.code, name: language.name, rtl: Boolean(language.rtl), lessReliable: Boolean(language.lessReliable) }, english, ...value });
  const kept = await db.one('SELECT translation FROM draft_translations WHERE id = $1', [id]);
  if (kept) return out(JSON.parse(kept.translation));
  // The same draft asked for twice at once shares one call.
  if (!working.has(id)) {
    const job = (async () => {
      let answer;
      try {
        answer = await aiScope.callModel({
          system: BRIEF,
          content: `Translate this SWMS into ${language.name}.\n<swms>\n${JSON.stringify(english)}\n</swms>`,
          schema: SCHEMA,
          effort: 'medium',
        });
      } catch {
        throw fail(502, 'The translation could not be made just now. Try again.');
      }
      if (!sameShape(english, answer.value)) throw fail(502, 'The translation could not be made just now. Try again.');
      await db.query('INSERT INTO draft_translations (id, content_hash, language, translation, model, usage, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING',
        [id, contentKey, language.code, JSON.stringify(answer.value), answer.model || '', JSON.stringify(answer.usage || {}), new Date()]);
      return answer.value;
    })().finally(() => working.delete(id));
    working.set(id, job);
  }
  return out(await working.get(id));
}

// The languages offered, each with its own name, or none when translation is off.
function languages() {
  return enabled() ? LANGUAGES.map(({ code, label, rtl }) => ({ code, label, rtl: Boolean(rtl) })) : [];
}

module.exports = { translateDraft, languages, enabled, SCHEMA, BRIEF };
