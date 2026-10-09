// Reading an uploaded SWMS for the builder check (task #106). The AI copies what the
// document says into the checker's structured form: it extracts and does not judge, and
// every line it gives is quoted from the document. The scoring is done by builder-check.js,
// never by the AI.
//
// Nothing is kept: the document and the reading are used for the one check and dropped.
// Switched off with the AI scope reading (aiScope.enabled()). A long SWMS takes minutes to read,
// so the server runs the check as a job held in memory only (check-jobs.js) and the page asks
// for the result; the result is dropped once it is read.
//
// Worker sign-on pages are taken out before anything is sent (owner decision, 6 October 2026):
// see signon-strip.js. The workers are counted here first, so H7 still knows they signed.
const aiScope = require('./ai-scope');
const { checkSwms, fromDraft, emailDraft } = require('./builder-check');
const { prepareDraft } = require('./draft');
const { draftBody } = require('./input');
const { swmsWithoutSignOns } = require('./signon-strip');
const { record } = require('./events');

const CHECK_BRIEF_VERSION = 'check-v3';

const CHECK_BRIEF = `You copy the contents of a safe work method statement (SWMS) from an Australian construction site into a fixed form. A separate program scores it. You do not judge, score, fix or improve the SWMS.

Rules:
1. Extract, do not judge. Copy what the document says. Never add a hazard, control, person, date or licence the document does not state.
2. Quote the document. Every hazard, control, site condition, licence, plant item and emergency line is copied word for word from the document, one line or sentence per item. Do not shorten with "..." and do not reword.
3. Leave it blank when the document does not say. Use "" for a missing text field and [] for a missing list. A blank line, "TBC" or a line of underscores is not an answer: leave it blank.
4. highRisk: the high risk construction work the document itself lists or ticks, in its own words. Do not add work you think it involves.
5. steps: each job step in order, with the hazards and controls the document gives for that step, in the order the document lists them. Where the document lists hazards and controls without steps, use one step named "Whole task". responsible: the person or position the document names as responsible for that step or its controls (for example in a "Responsible" column), as written, or "".
6. signatures: only workers whose name is written against a signature or sign-on. An empty sign-on table gives [].
7. consultation: the document's own words recording that workers were consulted or briefed, or "".
8. responsiblePerson: the person or role the document names as checking or supervising the controls, as written.
9. legislation: each act, regulation, code or standard the document lists in a legislation or references list.
10. riskMatrix: true only if the document prints a risk matrix (a likelihood and consequence chart).
11. fallRisk: "yes" if the document says a person could fall 2 metres or more, "no" if it says no one could, otherwise "".
12. state: the Australian state or territory the work is in, as an abbreviation (qld, nsw, vic, sa, wa, tas, nt, act), or "".
13. For each step, riskBefore and riskAfter: the risk rating the document gives that step (or its hazards) before and after the controls, as written (for example "High", "Medium", "H", "12"), or "". Where hazards in a step are rated separately, give the highest. riskResponse: what the document says is done about a rating still high after the controls (further controls, or who accepts the risk), word for word, or "".
14. riskAcceptance: the document's own words, for the whole SWMS, on who accepts a risk still rated high after the controls, or "".`;

const text = { type: 'string' };
const texts = { type: 'array', items: text };
const object = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const CHECK_SCHEMA = object({
  state: text,
  task: text,
  fallRisk: { type: 'string', enum: ['yes', 'no', ''] },
  siteAddress: text,
  siteConditions: texts,
  highRisk: texts,
  steps: { type: 'array', items: object({ step: text, hazards: texts, controls: texts, responsible: text, riskBefore: text, riskAfter: text, riskResponse: text }) },
  ppe: texts,
  responsiblePerson: text,
  consultation: text,
  signatures: { type: 'array', items: object({ name: text, date: text }) },
  revision: text,
  date: text,
  reviewDate: text,
  principalContractor: text,
  licences: texts,
  plant: texts,
  emergency: texts,
  review: text,
  legislation: texts,
  riskMatrix: { type: 'boolean' },
  riskAcceptance: text,
});

function fail(status, message) {
  return Object.assign(new Error(message), { status, publicMessage: true });
}

const MAX_CHARACTERS = 400000;
const OFF = 'Reading an uploaded SWMS is not switched on. Check a SiteReady draft instead.';

function validSwms(value) {
  const strings = (items) => Array.isArray(items) && items.every((item) => typeof item === 'string');
  return Boolean(value) && typeof value === 'object'
    && ['task', 'siteAddress', 'responsiblePerson', 'consultation', 'revision', 'date', 'reviewDate', 'principalContractor', 'review'].every((key) => typeof value[key] === 'string')
    && ['siteConditions', 'highRisk', 'ppe', 'licences', 'plant', 'emergency', 'legislation'].every((key) => strings(value[key]))
    && Array.isArray(value.steps) && value.steps.every((step) => step && typeof step.step === 'string' && strings(step.hazards) && strings(step.controls) && ['responsible', 'riskBefore', 'riskAfter', 'riskResponse'].every((key) => ['string', 'undefined'].includes(typeof step[key])))
    && Array.isArray(value.signatures) && value.signatures.every((item) => item && typeof item.name === 'string');
}

// Lines the AI gave that are not in the document, so the builder knows to look at them.
function quotesNotFound(swms, documentText) {
  const doc = aiScope.normalise(documentText).toLowerCase();
  const found = (line) => {
    const words = aiScope.normalise(line).toLowerCase();
    return !words || doc.includes(words) || doc.includes(words.replace(/[.;:,]+$/, ''));
  };
  const lines = [
    ...swms.steps.flatMap((step) => [...step.hazards, ...step.controls, ...(step.riskResponse ? [step.riskResponse] : [])]),
    ...swms.siteConditions, ...swms.licences, ...swms.plant, ...swms.emergency,
  ];
  return lines.filter((line) => !found(line)).map((line) => line.slice(0, 300));
}

// The structured form, read from the document text. One call; nothing is stored.
async function readSwms(documentText) {
  if (!aiScope.enabled()) throw fail(503, OFF);
  const content = String(documentText || '');
  if (!content.trim()) throw fail(400, 'There is no text in this file to read.');
  if (content.length > MAX_CHARACTERS) throw fail(413, 'This document is too long to check. Check one SWMS at a time.');
  let answer;
  try {
    answer = await aiScope.callModel({ system: CHECK_BRIEF, content: `<document>\n${content}\n</document>`, schema: CHECK_SCHEMA, effort: 'medium' });
  } catch (error) {
    // The scope reader's own messages talk about a scope, so they are not passed on.
    if (error.status === 422) throw fail(422, 'The AI could not read this SWMS. Check it by hand.');
    throw fail(502, 'The SWMS could not be read just now. Try again.');
  }
  if (!validSwms(answer.value)) throw fail(502, 'The SWMS could not be read in the expected form. Try again.');
  const swms = answer.value;
  return {
    swms: { ...swms, site: { address: swms.siteAddress, conditions: swms.siteConditions } },
    notFound: quotesNotFound(swms, content),
    cost: aiScope.costOf(answer.usage),
  };
}

// Each strip is logged by its counts only: never a name, a line or the document.
const defaultStripLog = (entry) => console.info(`Builder check sign-on strip: ${entry.pagesRemoved} pages and ${entry.sectionsRemoved} sections removed, ${entry.signOns} sign-on rows counted, refused ${entry.refused ? 'yes' : 'no'}`);
let stripLog = defaultStripLog;
function useStripLog(log) {
  stripLog = log || defaultStripLog;
}

// The document's text with every worker sign-on taken out, logged by its counts.
async function strippedText(body, company) {
  const companyId = company ? company.id : null;
  let stripped;
  try {
    stripped = await swmsWithoutSignOns(body);
  } catch (error) {
    if (error.status === 422) {
      stripLog({ pagesRemoved: 0, sectionsRemoved: 0, signOns: 0, refused: true });
      record('check_signon_refused', companyId);
    }
    throw error;
  }
  stripLog({ pagesRemoved: stripped.pagesRemoved, sectionsRemoved: stripped.sectionsRemoved, signOns: stripped.signOns, refused: false });
  if (stripped.pagesRemoved + stripped.sectionsRemoved) record('check_signon_removed', companyId);
  return stripped;
}

// An uploaded or pasted SWMS is read by the AI; a SiteReady draft or a SWMS already in the
// structured form is not, so it is checked at once.
function readsDocument(body) {
  return !(body.draft && typeof body.draft === 'object') && !(body.swms && typeof body.swms === 'object');
}

// Refused before a check by the AI is started, so the page hears at once: nothing attached, or
// the reading switched off.
function readyToRead(body) {
  if (!(typeof body.text === 'string' && body.text.trim()) && !(body.file && body.file.data)) throw fail(400, 'Attach the SWMS or paste it first.');
  if (!aiScope.enabled()) throw fail(503, OFF);
}

// POST /api/check: a SiteReady draft (no AI), a SWMS already in the structured form, or an
// uploaded or pasted document read by the AI. Returns the score, the findings and the email.
async function runCheck(body, company) {
  const line = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 120) : '');
  const email = { to: line(body.to), from: line(body.from) || line(company && company.name) };
  // Review stage unless the builder says the SWMS is in use on site (owner decision on H7).
  const stage = body.stage === 'on-site' ? 'on-site' : 'review';
  let result;
  let source;
  let notFound = [];
  if (body.draft && typeof body.draft === 'object') {
    const input = draftBody(body.draft);
    const draft = prepareDraft(input);
    if (draft.kind !== 'draft') {
      throw fail(400, draft.kind === 'stand-down' ? `This SiteReady draft is stood down. It still needs: ${(draft.missing || []).join('; ')}` : (draft.message || 'This draft could not be prepared.'));
    }
    result = checkSwms(fromDraft(draft, { state: input.state }), { state: input.state, stage });
    source = 'draft';
  } else if (body.swms && typeof body.swms === 'object') {
    result = checkSwms(body.swms, { state: line(body.state), stage });
    source = 'form';
  } else {
    if (!(typeof body.text === 'string' && body.text.trim()) && !(body.file && body.file.data)) throw fail(400, 'Attach the SWMS or paste it first.');
    const stripped = await strippedText(body, company);
    const read = await readSwms(stripped.text);
    // The AI never sees the sign-on, so H7 takes the workers counted before it was removed.
    // Each stands in as "Worker 1", "Worker 2" and so on: no name is used or sent. Whether each row
    // was dated is kept, for the date beside each signature (W9); the date itself is not.
    const undated = stripped.signOnsUndated || 0;
    const swms = stripped.found ? { ...read.swms, signatures: Array.from({ length: stripped.signOns }, (_, i) => ({ name: `Worker ${i + 1}`, date: i < stripped.signOns - undated ? 'Dated on the sign-on sheet' : '' })) } : read.swms;
    result = checkSwms(swms, { state: line(body.state) || swms.state, stage });
    notFound = read.notFound;
    source = 'document';
  }
  return { ...result, source, notFound, email: emailDraft(result, email) };
}

module.exports = { readSwms, runCheck, readsDocument, readyToRead, validSwms, quotesNotFound, useStripLog, CHECK_BRIEF, CHECK_SCHEMA, CHECK_BRIEF_VERSION };
