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

// The first aider SiteLink sets for every contractor: a person by full name, with a phone, never a role
// (messy round 7: "the site supervisor" was accepted, as the SWMS app's own refusal of "me" suggested,
// and printed with no name or phone). The box's hint asks for both.
const ROLE_WORDS = new Set('the a an our your their site main head principal contractor contractors builder builders subcontractor any on duty first aid aider aiders officer person staff supervisor supervisors foreman forewoman manager managers leading hand engineer project safety hse whs team member members nurse medic paramedic of for at in and or each every all trained qualified nominated appointed designated senior junior assistant general works construction office'.split(' '));
const FIRST_AIDER_EXAMPLE = 'Jo Park, 0412 345 678';
function firstAiderProblem(text) {
  const value = clean(text);
  if (!value) return '';
  const q = quoted(value);
  const not = notAnswer(value);
  // "me", "him" and the like: the SWMS app's own wording names a role, which SiteLink does not take.
  if (not && /does not say who/.test(not)) return `${q} does not say who. Give the first aider's full name and phone, for example "${FIRST_AIDER_EXAMPLE}".`;
  if (not) return not;
  const phone = phoneProblem(value);
  if (phone) return phone;
  const name = value.replace(PHONE_RUN, ' ').replace(/[(),;:–-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const words = name.split(' ').filter((word) => /[a-z]/i.test(word));
  if (!words.length || words.every((word) => ROLE_WORDS.has(word.toLowerCase().replace(/['’]s$/, '').replace(/[.']/g, '')))) return `${q} is a role, not a person. Give the first aider's full name and phone, for example "${FIRST_AIDER_EXAMPLE}". Contractors print it on their SWMS.`;
  if (words.length < 2) return `${q} gives a first name only. Give the first aider's full name and phone, for example "${FIRST_AIDER_EXAMPLE}".`;
  if (words.length === 2 && words[1].replace(/\./g, '').length === 1) return `${q} gives a first name only. Give the first aider's full name and phone, for example "${FIRST_AIDER_EXAMPLE}".`;
  if (!(value.match(PHONE_RUN) || []).some((run) => gate.phoneNumber(run))) return `${q} has no phone number. Give the first aider's phone too, for example "${tidyName(name)}, 0412 345 678".`;
  return '';
}

// Typed in a hurry, all in lower case, a detail is tidied as it reads, without changing its words
// (messy round 7: "tom keane 0413 222 908", "front gate" and "hi vis at all times" printed so on the
// SWMS). A person or a hospital takes a capital on each word; a place or a rule on its first word.
const tidyPerson = (text) => tidyName(text);
const tidyPlace = (text) => capitalFirst(text);

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

// Each sentence starts with a capital, and a sentence ends with a full stop: "Bowerbird supplies the
// boards. wallaroo installs them" reads "... Wallaroo installs them." (messy round 8, wording 2 and 14).
// Nothing else is changed.
function capitalSentences(text, { stop = false } = {}) {
  const value = capitalFirst(text);
  if (!value) return value;
  const out = value.replace(/([.!?]\s+)([a-z])/g, (whole, gap, letter) => `${gap}${letter.toUpperCase()}`);
  return stop && /[A-Za-z0-9)]$/.test(out) ? `${out}.` : out;
}

// A role typed all in lower case: its first letter, and a short title such as HSE, in capitals
// ("hse" reads "HSE", "hse manager" reads "HSE manager"; messy round 8, wording 1).
const ROLE_SHORT = new Set(['hse', 'whs', 'ohs', 'ohse', 'hseq', 'qhse', 'she', 'sheq', 'ehs', 'pm', 'cm', 'ceo', 'cfo', 'coo', 'md', 'gm', 'hr', 'qa', 'qs', 'it']);
function tidyRole(text) {
  const value = clean(text);
  if (!value || /[A-Z]/.test(value)) return value;
  const words = value.replace(/[a-z]+/g, (word) => (ROLE_SHORT.has(word) ? word.toUpperCase() : word));
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// "muster point, first aider and hospital"
const listed = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || '');

module.exports = { notAnswer, personProblem, firstAiderProblem, placeProblem, hospitalProblem, phoneOnly, phoneProblem, tidyName, tidyPerson, tidyPlace, capitalFirst, capitalSentences, tidyRole, listed, PASSED_ON };
