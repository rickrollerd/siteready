// SiteLink: answers the lead types that go to every subcontractor on a project (the site details, the
// lead's own name and phone, and the answers to points to confirm) are judged by the same rules the
// SWMS app uses for its people and place boxes (public/gate-rules.js), so SiteLink is never weaker
// than the app it feeds (messy round 6: "me", "carpark", "dana w", a 9 digit phone and "check with
// dana" all reached the subcontractor's list). Every problem is named at once, not one per save.
const gate = require('./public/gate-rules');

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const quoted = (text) => `"${clean(text).slice(0, 60)}"`;

// An answer that passes the question on instead of answering it: "check with dana", "ask the PM",
// "confirm with site". It names who knows, not what applies.
const PASSED_ON = /^(?:please\s+)?(?:(?:check|confirm|talk|speak|liaise|chat|follow up|sort it out|sort out|organise|organize|discuss|coordinate)\s+(?:it\s+|this\s+)?(?:with|to)|ask|ring|call|email|phone|contact|refer to)\s+\S+(?:\s+\S+){0,3}\.?$/i;

// Phone numbers typed in a box: each run of six or more digits, with spaces, brackets or dashes.
const PHONE_RUN = /\+?\(?\d[\d\s()-]{4,}\d/g;
function phoneProblem(text) {
  for (const run of String(text || '').match(PHONE_RUN) || []) {
    if (run.replace(/\D/g, '').length < 6) continue;
    if (!gate.phoneNumber(run)) return `${quoted(run)} is not a full phone number. A mobile has 10 digits, for example 0412 345 678.`;
  }
  return '';
}

// Why an answer says nothing yet, or ''. The SWMS app's own words for "me", "dont know", a question
// back, "as per site" and the like, then an answer that passes the question on.
function notAnswer(text) {
  const value = clean(text);
  if (!value) return '';
  const said = gate.notAnswer(value);
  if (said) return said;
  if (PASSED_ON.test(value)) return `${quoted(value)} passes the question on instead of answering it. Write the answer here, or leave it empty until you know.`;
  return '';
}

// A person, as contractors will need to find them: a full name, not "me", a role word or a first name
// only, and any phone given in full. firstAider adds the SWMS app's first aider rule ("builder",
// "supervisor"). example is shown in the refusal.
function personProblem(text, { firstAider = false, example = 'Jo Park, 0412 345 678' } = {}) {
  const value = clean(text);
  if (!value) return '';
  const not = notAnswer(value);
  if (not) return not;
  if (firstAider) {
    const weak = gate.fieldWeak('firstAider', value);
    if (weak) return weak;
  }
  const phone = phoneProblem(value);
  if (phone) return phone;
  const name = value.replace(PHONE_RUN, ' ').replace(/[(),;:–-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const words = name.split(' ').filter((word) => /[a-z]/i.test(word));
  if (words.length < 2) return `${quoted(value)} does not say who. Give their full name${example ? `, for example "${example}"` : ''}.`;
  if (words.length === 2 && words[1].replace(/\./g, '').length === 1) return `${quoted(value)} gives a first name only. Give the full name${example ? `, for example "${example}"` : ''}.`;
  return '';
}

// A place a new worker can find: not "carpark", "gate" or "out the front" (the SWMS app's rule).
function placeProblem(text) {
  const value = clean(text);
  if (!value) return '';
  return notAnswer(value) || gate.fieldWeak('place', value);
}

// The hospital or medical centre: its name as signposted, so the crew and the ambulance go to the
// right one (messy round 6: "royal brisbane").
const CARE_WORD = /\b(?:hospitals?|medical|health|clinic|emergency|infirmary|centre|center|ed|urgent care|private)\b/i;
function hospitalProblem(text) {
  const value = clean(text);
  if (!value) return '';
  const not = notAnswer(value);
  if (not) return not;
  if (!CARE_WORD.test(value)) return `${quoted(value)} does not say it is a hospital or medical centre. Give its full name as it is signposted, for example "Northside General Hospital, Emergency Department".`;
  return '';
}

// A phone number that may be left empty, but not left short.
function phoneOnly(text) {
  const value = clean(text);
  if (!value) return '';
  const not = notAnswer(value);
  if (not) return not;
  if (!gate.phoneNumber(value)) return value.replace(/\D/g, '').length < 6 ? `${quoted(value)} is not a phone number. Give a number contractors can ring, for example 0412 345 678.` : `${quoted(value)} is not a full phone number. A mobile has 10 digits, for example 0412 345 678.`;
  return '';
}

// A name typed all in lower case reads as typed in a hurry: "dana whitfield" becomes "Dana Whitfield".
function tidyName(text) {
  const value = clean(text);
  if (!value || /[A-Z]/.test(value)) return value;
  return value.replace(/(^|[\s'’-])([a-z])/g, (whole, before, letter) => `${before}${letter.toUpperCase()}`);
}

// The first letter of a title in capitals: "crane lift rooftop units" reads "Crane lift rooftop units".
const capitalFirst = (text) => {
  const value = clean(text);
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
};

// "muster point, first aider and hospital"
const listed = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || '');

module.exports = { notAnswer, personProblem, placeProblem, hospitalProblem, phoneOnly, phoneProblem, tidyName, capitalFirst, listed, PASSED_ON };
