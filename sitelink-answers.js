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
function notAnswer(text, kind) {
  const value = clean(text);
  if (!value) return '';
  const said = gate.notAnswer(value, kind);
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
  // "me" is asked for a name and role here, as in the SWMS app's person boxes (messy round 10).
  const not = notAnswer(value, firstAider ? 'firstAider' : 'person');
  if (not) return not;
  if (firstAider) {
    const weak = gate.fieldWeak('firstAider', value);
    if (weak) return weak;
  }
  const phone = phoneProblem(value);
  if (phone) return phone;
  const name = value.replace(PHONE_RUN, ' ').replace(/[(),;:–-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const words = name.split(' ').filter((word) => /[a-z]/i.test(word));
  // A role with no name ("first aid officer", "the site manager") is not a person, in every person's box, as
  // the SWMS app refuses a role with no name (messy round 15, SiteLink: "first aid officer" was saved as the
  // site manager, with no name or phone).
  if (words.length && words.every(roleWord)) return `${quoted(value)} is a role, not a person. Give their full name${example ? `, for example "${example}"` : ''}. Contractors print it on their SWMS.`;
  if (words.length < 2) return `${quoted(value)} does not say who. Give their full name${example ? `, for example "${example}"` : ''}.`;
  if (words.length === 2 && words[1].replace(/\./g, '').length === 1) return `${quoted(value)} gives a first name only. Give the full name${example ? `, for example "${example}"` : ''}.`;
  return '';
}

// The first aider SiteLink sets for every contractor: a person by full name, with a phone, never a role
// (messy round 7: "the site supervisor" was accepted, as the SWMS app's own refusal of "me" suggested,
// and printed with no name or phone). The box's hint asks for both.
const ROLE_WORDS = new Set('the a an our your their site main head principal contractor contractors builder builders subcontractor any on duty first aid aider aiders officer person staff supervisor supervisors foreman forewoman manager managers leading hand engineer project safety hse whs team member members nurse medic paramedic of for at in and or each every all trained qualified nominated appointed designated senior junior assistant general works construction office'.split(' '));
const FIRST_AIDER_EXAMPLE = 'Jo Park, 0412 345 678';
const roleWord = (word) => ROLE_WORDS.has(String(word).toLowerCase().replace(/['’]s$/, '').replace(/[.']/g, ''));
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
  if (!words.length || words.every(roleWord)) return `${q} is a role, not a person. Give the first aider's full name and phone, for example "${FIRST_AIDER_EXAMPLE}". Contractors print it on their SWMS.`;
  if (words.length < 2) return `${q} gives a first name only. Give the first aider's full name and phone, for example "${FIRST_AIDER_EXAMPLE}".`;
  if (words.length === 2 && words[1].replace(/\./g, '').length === 1) return `${q} gives a first name only. Give the first aider's full name and phone, for example "${FIRST_AIDER_EXAMPLE}".`;
  if (!(value.match(PHONE_RUN) || []).some((run) => gate.phoneNumber(run))) return `${q} has no phone number. Give the first aider's phone too, for example "${tidyName(name)}, 0412 345 678".`;
  return '';
}

// Typed in a hurry, all in lower case, a detail is tidied as it reads, without changing its words
// (messy round 7: "tom keane 0413 222 908", "front gate" and "hi vis at all times" printed so on the
// SWMS). A person or a hospital takes a capital on each word; a place or a rule on its first word.
// The places the SWMS names take their capitals inside typed text too: the job address's street and suburb, the hospital,
// and the capital cities (messy round 17: "emu bank" in the task and the muster point, "temple tce" in the task, "fiona
// stanley hospital" and "University of canberra hospital" in a reviewer's conditions). Only where typed in lower case, or
// with only a sentence's first capital; a single word only where it is not an English word, or is a capital city.
const CAPITAL_CITIES = ['Canberra', 'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Hobart', 'Darwin'];
const STATE_TAIL = /\b(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT|New South Wales|Victoria|Queensland|South Australia|Western Australia|Tasmania|Northern Territory|Australian Capital Territory|Australia)\b.*$/i;
const STREET_SHORT = { Street: 'St', Road: 'Rd', Terrace: 'Tce', Parade: 'Pde', Avenue: 'Ave', Drive: 'Dr', Crescent: 'Cres', Place: 'Pl', Highway: 'Hwy', Lane: 'Ln', Court: 'Ct', Circuit: 'Cct', Esplanade: 'Esp', Close: 'Cl', Boulevard: 'Blvd' };
function placeNames(values) {
  const out = [];
  const add = (name) => {
    const value = clean(name).replace(/^(?:unit|shop|suite|level|lot)\s+\S+\s+/i, '').replace(/^[\d/-]+[a-z]?\s+/i, '').replace(/\s*\([^)]*\)\s*$/, '');
    const words = value.split(/\s+/).filter(Boolean);
    if (!words.length || words.length > 5 || !words.every((word) => /^[A-Z][A-Za-z'’-]*$|^(?:of|the|and|on|by)$/.test(word)) || !/^[A-Z]/.test(words[words.length - 1])) return;
    if (words.length === 1 && (value.length < 4 || englishWord(value.toLowerCase())) && !CAPITAL_CITIES.includes(value)) return;
    if (!out.includes(value)) out.push(value);
    // A hospital listed by its emergency department ("Royal Perth Hospital Emergency Department") is also named alone.
    const hospital = /^(.+\b(?:Hospital|Health Service|Health Centre|Medical Centre))\s+Emergency(?: Department)?$/.exec(value);
    if (hospital && !out.includes(hospital[1])) out.push(hospital[1]);
    // A street's name typed short takes its capitals too: "temple tce" for "Temple Terrace".
    const short = STREET_SHORT[words[words.length - 1]];
    if (short && words.length > 1 && !out.includes([...words.slice(0, -1), short].join(' '))) out.push([...words.slice(0, -1), short].join(' '));
  };
  for (const text of values || []) {
    // "40 Emu Bank, Belconnen ACT 2617" gives "Emu Bank" and "Belconnen"; "Fiona Stanley Hospital, Emergency Department"
    // gives "Fiona Stanley Hospital".
    for (const part of String(text || '').split(/,|\s[-–]\s/)) add(part.replace(STATE_TAIL, ''));
  }
  for (const city of CAPITAL_CITIES) if (!out.includes(city)) out.push(city);
  return out;
}
// The longest name first, so "royal perth hospital" takes "Royal Perth Hospital" before "Perth" alone gives it one capital
// (messy round 18, A run 4: "royal perth hospital ok" printed "royal Perth hospital OK").
const withPlaceNames = (text, names = []) => withPersonNames(text, [...names].sort((a, b) => b.length - a.length));
const tidyPerson = (text) => tidyName(text);
// A street named in a place takes its capitals ("meet at henry st gate" reads "Meet at Henry St gate";
// SiteLink round 10, wording 11). Words typed with capitals are left as typed.
const STREET = /(?<!\bthe\s)\b([a-z][a-z'’-]+)\s+(st|street|rd|road|ave|avenue|tce|terrace|pde|parade|dr|drive|ln|lane|hwy|highway|blvd|boulevard|cres|crescent|ct|court|pl|place|cct|circuit|esp|esplanade|cl|close)\b/g;
const NOT_A_STREET_NAME = new Set(['the', 'a', 'an', 'this', 'that', 'our', 'side', 'back', 'front', 'same', 'next', 'each', 'on', 'at', 'of', 'off', 'in', 'to', 'by', 'from', 'near', 'and', 'or', 'site', 'local']);
// A street's name of two or three words takes its capitals too: "on chung wah tce" reads "on Chung Wah Tce", not
// "on chung Wah Tce" (messy round 13, B run 8). The words before it that are not part of a name stay as typed.
const NOT_IN_STREET_NAME = new Set([...NOT_A_STREET_NAME, 'along', 'beside', 'behind', 'outside', 'opposite', 'corner', 'gate', 'gates', 'area', 'point', 'entrance', 'entry', 'exit', 'office', 'shed', 'sheds', 'carpark', 'park', 'end', 'truck', 'ute', 'van', 'car', 'hiab', 'is', 'are', 'meet', 'muster', 'assembly', 'footpath', 'verge', 'kerb', 'fence', 'hoarding', 'compound', 'laydown', 'lot', 'block', 'building', 'level', 'main']);
// A square, mall or plaza is named the same way: "victoria square" reads "Victoria Square" (messy round 18, B run 5).
const STREET_NAMED = /\b((?:[a-z][a-z'’-]+\s+){0,2}[a-z][a-z'’-]+)\s+(st|street|rd|road|ave|avenue|tce|terrace|pde|parade|dr|drive|ln|lane|hwy|highway|blvd|boulevard|cres|crescent|ct|court|pl|place|cct|circuit|esp|esplanade|cl|close|square|sq|mall|plaza)\b/g;
const upFirst = (word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
// A road or lane named for what it is, not a street's name ("the site haul road", "the open lane", "the Bagot Rd service
// lane"), stays as typed (messy round 16, A run 1 and B run 8: "Haul Road", "Open Lane" and "Service Lane" printed).
// A street abbreviated ("Back St") is a name.
const ROAD_KIND_WORD = /^(?:road|lane|drive|way|track)$/;
const ROAD_WHAT = new Set(['haul', 'service', 'access', 'open', 'back', 'side', 'rear', 'front', 'slip', 'private', 'bus', 'bike', 'cycle', 'turning', 'loading', 'fire', 'emergency', 'internal', 'temporary', 'construction', 'site', 'delivery', 'perimeter', 'ring', 'existing', 'new', 'sealed', 'unsealed', 'gravel', 'dirt', 'farm', 'haulage', 'truck', 'traffic', 'live', 'closed', 'shared', 'work', 'works']);
// "st" before a street's name is Saint: "st georges tce" reads "St Georges Tce", not "st Georges Tce" (messy round 16, A
// run 4). A street's name before "and" another street at a corner takes its capitals too: "corner elizabeth n bathurst
// st" reads "Corner Elizabeth and Bathurst St", not "Corner elizabeth and Bathurst St" (B run 6).
const SAINT = /(?<=(?:^|[,(]\s*|\b(?:on|at|of|in|to|by|near|corner|cnr|crn|and|n|from|off|along|via|the|outside|opposite|beside|behind|into|onto|up|down|past)\s+))st\.?(?=\s+[a-z][a-z'’-]+(?:\s+[a-z][a-z'’-]+)?\s+(?:st|street|rd|road|ave|avenue|tce|terrace|pde|parade|dr|drive|ln|lane|hwy|highway|blvd|boulevard|cres|crescent|ct|court|pl|place|cct|circuit|esp|esplanade|cl|close)\b)/g;
const CORNER_FIRST = /\b((?:corner|cnr|crn)\.?(?:\s+of)?\s+)([a-z][a-z'’-]+)(?=\s+(?:and|&|n)\s+(?:St\s+)?[A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+)?\s+(?:St|Street|Rd|Road|Ave|Avenue|Tce|Terrace|Pde|Parade|Dr|Drive|Ln|Lane|Hwy|Highway|Blvd|Boulevard|Cres|Crescent|Ct|Court|Pl|Place|Cct|Circuit|Esp|Esplanade|Cl|Close)\b)/gi;
const tidyPlace = (text) => capitalFirst(clean(text).replace(SAINT, 'St').replace(STREET_NAMED, (whole, names, kind) => {
  const words = names.split(/\s+/);
  if (ROAD_KIND_WORD.test(kind) && ROAD_WHAT.has(words[words.length - 1])) return whole;
  let at = words.length;
  while (at > 0 && !NOT_IN_STREET_NAME.has(words[at - 1])) at -= 1;
  if (at === words.length) return whole;
  return [...words.slice(0, at), ...words.slice(at).map(upFirst), upFirst(kind)].join(' ');
}).replace(CORNER_FIRST, (whole, corner, name) => (NOT_IN_STREET_NAME.has(name.toLowerCase()) ? whole : `${corner}${upFirst(name)}`)));

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
  // A hospital with no name says none (messy round 9: "nearest hospital" was taken).
  if (value.split(/[^A-Za-z]+/).filter(Boolean).every((word) => NO_NAME_WORDS.has(word.toLowerCase()))) return `${quoted(value)} does not name the hospital or medical centre. Give its full name as it is signposted, for example "Northside General Hospital, Emergency Department".`;
  return '';
}
const NO_NAME_WORDS = new Set(['nearest', 'closest', 'nearby', 'local', 'the', 'a', 'an', 'any', 'public', 'private', 'main', 'general', 'hospital', 'hospitals', 'medical', 'centre', 'center', 'clinic', 'health', 'emergency', 'department', 'ed', 'urgent', 'care', 'gp', 'doctor', 'doctors', 'nearest', 'to', 'site', 'of', 'and', 'or', 'with']);

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
// Small words stay in lower case unless they come first: "swan coast doors and hardware" reads "Swan Coast
// Doors and Hardware" (messy round 10, flow9 decision 4 B, recommended). Capitals the person typed are never
// lowered: a name with any capital is left as typed.
// "from" and "with" too: "brodie kwan from tallgum scaffolding" reads "Brodie Kwan from Tallgum Scaffolding" (messy round 19,
// SiteLink wording 1).
const SMALL_WORDS = new Set(['and', 'of', 'the', 'for', 'to', 'in', 'on', 'at', 'by', 'from', 'with', 'via']);
// A surname's own capitals come back too (messy round 14, B run 7: "sharon mcgrath" printed "Sharon Mcgrath"):
// "Mc" always ("McGrath"), "O'" and each part of a hyphenated name ("O'Brien", "Smith-Jones"), and "Mac" only
// in the Scottish and Irish names where it is nearly always so written, as "Mack", "Macey" and "Machado" are not.
const MAC_NAMES = new Set(['macarthur', 'macaulay', 'macdonald', 'macdougall', 'macfarlane', 'macgregor', 'macinnes', 'macintyre', 'mackenzie', 'mackinnon', 'maclachlan', 'maclean', 'macleod', 'macmillan', 'macnamara', 'macneil', 'macpherson', 'macqueen']);
const surnameCapitals = (word) => (/^Mc[a-z]{2,}$/.test(word) ? `Mc${word.charAt(2).toUpperCase()}${word.slice(3)}`
  : /^Mac[a-z]{3,}$/.test(word) && MAC_NAMES.has(word.toLowerCase()) ? `Mac${word.charAt(3).toUpperCase()}${word.slice(4)}` : word);
function tidyName(text, small = SMALL_WORDS) {
  const value = clean(text);
  if (!value || /[A-Z]/.test(value)) return value;
  // After an apostrophe only in "O'" and "D'" names ("O'Brien", "D'Arcy"), not "Don's".
  return value.replace(/(^|[\s-]|(?<=(?:^|[\s-])[a-z])['’])([a-z])([a-z]*)/g, (whole, before, letter, rest, at) => (at > 0 && /\s/.test(before) && small.has(`${letter}${rest}`) ? whole : `${before}${surnameCapitals(`${letter.toUpperCase()}${rest}`)}`));
}
// A company's name: a lone "n" typed for "and" stays in lower case too, "tamar joinery n fitout" reads "Tamar
// Joinery n Fitout", not "Tamar Joinery N Fitout" (messy round 13, B runs 2 and 6). A person's "n" may be an
// initial, so it is only for companies.
// A lone lower-case "n" between two words of the name then reads "and": "coogee pools n spas" prints "Coogee Pools and Spas",
// and so does a name saved before as "Coogee Pools n Spas" (messy round 17, A run 4 and B run 7: the "n" printed in the header,
// the approval line, every footer and the review email). A name that writes it "N" or "'n'" is kept as typed (decision 1).
const COMPANY_SMALL = new Set([...SMALL_WORDS, 'n']);
const tidyCompany = (text) => tidyName(text, COMPANY_SMALL).replace(/(?<=[A-Za-z0-9][ \t]+)n(?=[ \t]+[A-Za-z0-9])/g, 'and');
// A person with their role, "name, role" ("declan furlong, foreman"): the name takes its capitals and the
// role its first capital, as the checker's do ("Tanya Pirelli, Ops manager"). An answer typed with any
// capital is left as typed ("Sam Lee, supervisor").
// A role typed after the name with no comma ("tara nguyen hse") is split off as the role: "Tara Nguyen, HSE"
// (messy round 12, run 1: it printed "Tara Nguyen Hse"). Only the last word or two, and only where two words of
// the name are left.
// "our" or "the" before the role is part of the role: "tony russo our leading hand" reads "Tony Russo, our leading hand", not
// "Tony Russo Our, Leading hand" (messy round 16, A run 4).
const ROLE_TAIL = /\s+((?:(?:our|the|my|his|her|their)\s+)?(?:(?:hse|whs|ohs|site|project|safety|works|construction|office|operations|ops)\s+)?(?:hse|whs|ohs|qhse|hseq|supervisor|foreman|forewoman|manager|leading hand|lead hand|engineer|director|officer|advisor|adviser|coordinator|admin|administrator|owner|pm|cm))$/;
// An answer that names no one, only whose role it is ("the builders first aider"), reads as a role: "The
// builder's first aider", not "The Builders First Aider" (messy round 12, run 5).
const ROLE_PHRASE_WORDS = new Set([...ROLE_WORDS, 'builder\'s', 'contractor\'s', 'dogman', 'rigger', 'operator', 'spotter', 'labourer', 'apprentice']);
// So is one typed with capitals ("Sione Leading Hand", "Mick Tanner foreman": messy round 13, B run 7), where the
// role is two words or two words of the name are left; the name keeps the capitals typed. "Sam Foreman" stays a name.
const ROLE_TAIL_ANY = new RegExp(ROLE_TAIL.source, 'i');
function splitRole(value) {
  const tail = ROLE_TAIL_ANY.exec(value);
  if (!tail) return null;
  const name = value.slice(0, tail.index).trim();
  const nameWords = name.split(/\s+/).filter(Boolean).length;
  if (!nameWords || /[,]$/.test(name) || (nameWords < 2 && tail[1].trim().split(/\s+/).length < 2)) return null;
  // "Builder's Site Manager" names no one: it is a role, not a name and a role.
  if (name.split(/\s+/).every((word) => ROLE_PHRASE_WORDS.has(word.toLowerCase().replace(/[.]/g, '')) || ROLE_PHRASE_WORDS.has(word.toLowerCase().replace(/[.']/g, '').replace(/s$/, '')))) return null;
  return { name, role: tail[1].trim() };
}
// A name typed in lower case before a dash or a bracket takes its capitals, whatever follows ("jake morrow - holds HRW
// scaffolding intermediate" reads "Jake Morrow - holds HRW scaffolding intermediate": messy round 15, A run 4).
const NAME_THEN_NOTE = /^([a-z][a-z'’-]*(?:\s+[a-z][a-z'’-]*){1,2})(\s+[-–]\s+|\s*\()/;
function tidyPersonRole(text) {
  const value = clean(text);
  if (!value) return value;
  const noted = NAME_THEN_NOTE.exec(value);
  if (noted && !noted[1].split(/\s+/).every((word) => ROLE_PHRASE_WORDS.has(word.replace(/[.']/g, '').replace(/s$/, '')))) return `${tidyName(noted[1])}${noted[2]}${value.slice(noted[0].length)}`;
  if (/[A-Z]/.test(value)) {
    const split = value.includes(',') ? null : splitRole(value);
    return split ? `${split.name}, ${/[A-Z]/.test(split.role) ? split.role : tidyRole(split.role)}` : value;
  }
  const at = value.indexOf(',');
  if (at < 0) {
    const words = value.split(/\s+/);
    if (words.every((word) => ROLE_PHRASE_WORDS.has(word.replace(/[.']/g, '').replace(/s$/, '')) || ROLE_PHRASE_WORDS.has(word.replace(/[.]/g, '')))) {
      return capitalFirst(value.replace(/\b(builder|contractor|client)s\s+(?=(?:site\s+)?(?:first|supervisor|manager|foreman|safety|hse|whs|engineer|crew)\b)/g, "$1's "));
    }
    const split = splitRole(value);
    if (split) return `${tidyName(split.name)}, ${tidyRole(split.role)}`;
    return tidyName(value);
  }
  const rest = value.slice(at + 1).trim();
  return `${tidyName(value.slice(0, at))}${rest ? `, ${tidyRole(rest)}` : ','}`;
}
// A company's name inside an answer takes its capitals, where two or more of its words are typed in a row
// ("potoroo bend builds the plinths" reads "Potoroo Bend builds the plinths"; SiteLink round 10, wording 7).
function withCompanyNames(text, names = []) {
  let out = String(text || '');
  for (const name of names) {
    const words = String(name || '').split(/\s+/).filter(Boolean);
    for (let size = words.length; size >= 2; size -= 1) {
      for (let start = 0; start + size <= words.length; start += 1) {
        const run = words.slice(start, start + size);
        if (!run.every((word) => /^[A-Z0-9][\w'’&.-]*$/.test(word) || SMALL_WORDS.has(word))) continue;
        const pattern = new RegExp(`\\b${run.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')}\\b`, 'gi');
        out = out.replace(pattern, (found) => (/[A-Z]/.test(found.slice(1)) ? found : run.join(' ')));
      }
    }
  }
  return out;
}

// The people the SWMS names, written with their capitals, take them inside other answers too: "jake morrow n the other
// scaffolder get them back onto the deck" reads "Jake Morrow ..." where Jake Morrow is the scaffold supervisor (messy
// round 15, A run 4). Only a name of two or three words, and only where it is typed all in lower case.
function personNames(values) {
  const out = [];
  for (const value of values || []) {
    const tidy = tidyPersonRole(clean(value));
    // A phone typed after the name with no comma ("Hamish Te Rangi 0418 552 907") is not part of it (messy round 16).
    // Nor is the company after "from" ("Joel Tuilagi from Tallgum Scaffolding": messy round 19, SiteLink wording 1).
    const name = clean(clean(tidy.split(/,|\s[-–]\s|\s\(|\s(?:from|of|at|with)\s/i)[0]).replace(PHONE_RUN, ' '));
    const words = name.split(/\s+/);
    if (words.length >= 2 && words.length <= 3 && words.every((word) => /^[A-Z][A-Za-z'’-]+$/.test(word)) && !out.includes(name)) out.push(name);
  }
  return out;
}
function withPersonNames(text, names = []) {
  let out = String(text || '');
  for (const name of names) {
    const pattern = new RegExp(`\\b${name.split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')}\\b`, 'gi');
    // Typed in lower case, or with only the capital a sentence starts with ("Hamish te rangi to sign off ...").
    out = out.replace(pattern, (found) => (found === found.toLowerCase() || found === `${found.charAt(0)}${found.slice(1).toLowerCase()}` ? name : found));
  }
  return out;
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

// A note typed to the other side, tidied as a person would write it: each sentence with its capital, the
// companies' own names as they are written, and a month after a day number with its capital (messy round
// 9, wordings 5 and 9: "Emailed by dunnart office 17 oct", "... step 2 of the SWMS. add it ...").
const MONTHS = /\b(\d{1,2}(?:st|nd|rd|th)?\s+)(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)(uary|ruary|ch|il|e|y|ust|tember|ober|ember)?\b/gi;
// A word that is also an English word ("Fire" in "Spinebill Fire Protection", "Rangi") is not given its capital
// alone: only a whole name typed in a row is (withCompanyNames, withPersonNames).
const englishWord = (word) => { try { return require('./spelling').isWord(word); } catch { return false; } };
// The project's people with their capitals inside a text: each full name, and a first name or surname alone that is no
// English word.
// A first name or surname that is also an English word ("oliver", "mark", "rose") takes its capital only where a person is
// named: after "with", "from", "to", "by", "ask", "tell", "call" or "cc", or after another name and "and" or "or" ("Induction
// with oliver", "emailed to Isla and oliver": messy round 19, SiteLink wording 1, where Oliver Tran is the first aider).
const PERSON_BEFORE = /(?:\b(?:with|from|to|by|ask|tell|call|ring|phone|contact|cc|see|via|for)|\b[A-Z][a-z'’-]+,? (?:and|or|n|&))\s$/;
function withPeople(text, people = []) {
  const full = personNames(people);
  let out = withPersonNames(text, full);
  // Twice, so a name after another one given its capital here is read after a name ("isla n oliver").
  for (const name of [...full, ...full]) {
    for (const word of name.split(/\s+/)) {
      if (word.length < 4 || !/^[A-Z][a-z'’-]+$/.test(word)) continue;
      const english = englishWord(word.toLowerCase());
      out = out.replace(new RegExp(`\\b${word.toLowerCase()}\\b`, 'g'), (found, at, whole) => (!english || PERSON_BEFORE.test(whole.slice(Math.max(0, at - 40), at)) ? word : found));
    }
  }
  return out;
}
// people: the full names of the people the lead set in the site details, and the project's own people. Each takes
// its capitals inside the text, and so does a first name or surname typed alone that is no English word ("dmitri",
// "saoirse"): messy round 16, SiteLink wording 4, "hamish te rangi" in a condition and "dmitri" in a note.
// The person a note says sent or brought something, typed in lower case, takes the capitals of a name: "Emailed by milos
// hartigan to Marlee" reads "Emailed by Milos Hartigan to Marlee" (messy round 18, SiteLink wording 4). Only two or three
// words straight after "by" or "from", ending where the note goes on ("to", "on", a comma): at least one not an English
// word, and none a word of a role or a company ("the builder", "our office", "site manager").
const NOT_SENDER = new Set('the a an our their his her its your my this that builder builders office site manager foreman supervisor lead team crew admin subcontractor subbie contractor client email post courier hand them him us me'.split(' '));
const SENT_BY = /\b((?:emailed|e-mailed|sent|posted|delivered|brought|handed(?: over| in)?|dropped(?: off| in)?|given|forwarded|uploaded)(?: in| over| through| across)? (?:by|from) )((?!(?:on|to|at|via|for|in|and|with|from|by|the)\b)[a-z][a-z'’-]+(?: (?!(?:on|to|at|via|for|in|and|with|from|by|the)\b)[a-z][a-z'’-]+){1,2})(?= (?:to|on|at|via|for|in|and|with)\b|[.,;]|$)/gi;
function withSenderName(text) {
  return String(text || '').replace(SENT_BY, (whole, lead, name) => {
    const words = name.split(' ');
    if (words.some((word) => NOT_SENDER.has(word.toLowerCase())) || words.every((word) => englishWord(word))) return whole;
    return `${lead}${words.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(' ')}`;
  });
}
function tidyNote(text, names = [], people = [], places = []) {
  let out = capitalSentences(withPlaceNames(typedWords(text), places));
  if (!out) return out;
  for (const name of names) {
    // Only the company's own name, its first word, alone: "dunnart" reads "Dunnart", but "fire" stays "fire" though
    // the company is Spinebill Fire Protection (messy round 16, SiteLink wording 5: "Name the Fire watch").
    const word = String(name || '').split(/\s+/)[0] || '';
    if (word.length < 3 || !/^[A-Z][a-z'’-]+$/.test(word) || /^(?:Pty|Ltd|The|And|Group|Services|Constructions?)$/.test(word)) continue;
    out = out.replace(new RegExp(`\\b${word.toLowerCase()}\\b`, 'g'), word);
  }
  out = withPeople(withCompanyNames(withSenderName(out), names), people);
  return out.replace(MONTHS, (whole, day, month, rest) => `${day}${month.charAt(0).toUpperCase()}${month.slice(1).toLowerCase()}${rest || ''}`);
}

// Words typed one item to a line (a reviewer's conditions or changes needed), each line tidied as a note.
const tidyLines = (text, names = [], people = [], places = []) => String(text || '').split('\n').map((line) => (line.trim() ? tidyNote(line, names, people, places) : line)).join('\n');

// A role typed all in lower case: its first letter, and a short title such as HSE, in capitals
// ("hse" reads "HSE", "hse manager" reads "HSE manager"; messy round 8, wording 1).
const ROLE_SHORT = new Set(['hse', 'whs', 'ohs', 'ohse', 'hseq', 'qhse', 'she', 'sheq', 'ehs', 'pm', 'cm', 'ceo', 'cfo', 'coo', 'md', 'gm', 'hr', 'qa', 'qs', 'it']);
// A role that says whose it is ("our supervisor", "the builder's foreman") reads as part of the sentence after the
// name: "Rob, our supervisor", not "Rob, Our supervisor" (messy round 13, B run 8).
function tidyRole(text) {
  const value = clean(text);
  if (!value || /[A-Z]/.test(value)) return value;
  const words = value.replace(/[a-z]+/g, (word) => (ROLE_SHORT.has(word) ? word.toUpperCase() : word));
  if (/^(?:our|the|my|his|her|their|your|a|an)\s/.test(words)) return words;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Short names typed in lower case keep their capitals: "hv and lv cabling" reads "HV and LV cabling", "ewps" reads
// "EWPs" (messy round 15, SiteLink wording 1: the lead's title was saved as "Hv and lv cabling, terminations and
// earthing"). Only names that are never a plain word; a word typed with any capital is left as typed.
// "vrf", "ahu", "fcu" and "mssb" too (messy round 17, SiteLink wording 3: the lead's added SWMS printed "vrf").
const SHORT_NAMES = new Set('hv lv elv ac dc cctv pvc upvc cpvc hdpe hvac ewp ict msb mdb db mcc plc bms fip ewis nbn rcd gpo ppe lpg frp ups swms hrcw rmu acb mep av ipa itp itps sds ohs whs hse qa rfi vrf vrv ahu fcu vav mssb ddc rcp frc byda dbyd'.split(' '));
// "rcp" (reinforced concrete pipe) and "byda" (Before You Dig Australia) too (messy round 19, B run 8: "375 rcp" and "Byda plans").
// One typed with only its first capital ("Hv cabling", as a title's first word was saved before) is put right too,
// except where it could be a word ("Ups").
const NOT_ONLY_A_NAME = new Set(['ups', 'av', 'ipa', 'qa']);
function withShortNames(text) {
  return String(text || '').replace(/\b([A-Za-z][a-z]{1,4})\b/g, (word) => {
    const lower = word.toLowerCase();
    if (word !== lower) return SHORT_NAMES.has(lower) && !NOT_ONLY_A_NAME.has(lower) ? word.toUpperCase() : word;
    if (SHORT_NAMES.has(word)) return word.toUpperCase();
    if (/s$/.test(word) && SHORT_NAMES.has(word.slice(0, -1))) return `${word.slice(0, -1).toUpperCase()}s`;
    return word;
  });
}
// Free text typed in a hurry, as it prints (flow15's rules): a lone "n" for "and" reads "and", "b4" reads
// "before", and short names keep their capitals (messy round 15, SiteLink wording 6: "Hi vis n steel caps",
// "Sign in at the site office b4 starting", "Electrical n comms"). A company's own name keeps its "n".
const loneN = (text) => String(text || '').replace(/(?<=[A-Za-z0-9,][ \t]+)n(?=[ \t]+[A-Za-z0-9])/g, 'and');
// Words typed short or run together, as they print, with the capital they were typed with (messy round 17, A runs 2 and 4,
// B run 7: "b4", "thru", "upto", "undergrnd", "sparky" and "pool db" printed as typed in site answers, own steps and the task;
// "throw line at on the barge" where a place was typed into a blank after "at").
const HURRIED = [
  [/\bb4\b/gi, 'before'],
  [/\bthru\b/gi, 'through'],
  [/\bupto\b/gi, 'up to'],
  [/\bundergr(?:ou)?nd\b/gi, 'underground'],
  [/\bsparkies\b/gi, 'electricians'],
  [/\bsparky\b/gi, 'electrician'],
  [/\bdbs\b/g, 'distribution boards'],
  [/\bdb\b/g, 'distribution board'],
  // Points of the compass typed short (messy round 18, SiteLink wording 4: the muster point "Car park nth east corner").
  [/\bnth\b/gi, 'north'],
  [/\bsth\b/gi, 'south'],
  // "bout" before a number is "about" (messy round 19, B run 8: "trench bout 1.8m deep" printed as typed).
  [/\bbout(?=\s+\d)/gi, 'about'],
  // The service owners typed in lower case take their capitals (B run 8: "telstra pit").
  [/\btelstra\b/g, 'Telstra'],
  [/\boptus\b/g, 'Optus'],
  [/\bausgrid\b/g, 'Ausgrid'],
  [/\benergex\b/g, 'Energex'],
  [/\bjemena\b/g, 'Jemena'],
  // Apostrophes left out (messy round 19, B run 7: a reviewer's "theres no crane" and "the engineers demolition plan").
  [/\btheres\b/gi, "there's"],
  [/\bthats\b/gi, "that's"],
  [/\bdont\b/gi, "don't"],
  [/\bdoesnt\b/gi, "doesn't"],
  [/\bisnt\b/gi, "isn't"],
  [/\bdidnt\b/gi, "didn't"],
  [/\bwasnt\b/gi, "wasn't"],
  [/\barent\b/gi, "aren't"],
  [/\bcouldnt\b/gi, "couldn't"],
  [/\bshouldnt\b/gi, "shouldn't"],
  // Round 19 SiteLink: "hes" in a rescue answer and "there own" in a point answer printed as typed.
  [/\bhes\b/gi, "he's"],
  [/\bshes\b/gi, "she's"],
  [/\bthere own\b/gi, 'their own'],
  [/\bengineers (?=(?:demolition|design|drawings?|plans?|reports?|certificates?|certification|sign[- ]?off|approval|letter|inspection|details?|specification)\b)/gi, "engineer's "],
];
// "r" typed for "are" between two words (messy round 18, SiteLink wording 4: "Yes covers r Quokka's work").
const loneR = (text) => String(text || '').replace(/(?<=[A-Za-z][ \t]+)r(?=[ \t]+[A-Za-z])/g, 'are');
// A day of the week typed in lower case takes its capital (messy round 18, SiteLink wording 4: "get it signed before friday").
const DAYS = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g;
const withDays = (text) => String(text || '').replace(DAYS, (day) => `${day.charAt(0).toUpperCase()}${day.slice(1)}`);
const AT_PLACE = /\bat (?=(?:on|in|inside|beside|under|near|behind|along|over|outside|off|next to) (?:the|a|an|our|their|each|every)\b)/gi;
function hurried(text) {
  let out = String(text || '');
  for (const [pattern, word] of HURRIED) out = out.replace(pattern, (found) => (/^[A-Z]/.test(found) ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : word));
  return withDays(loneR(loneN(out.replace(AT_PLACE, ''))));
}
// "ok" reads "OK" (messy round 16, SiteLink wording 6: "ok to start" printed "Ok to start").
// Words typed without their apostrophe, "there own" for "their own", and the builder's people typed "builders engineer" read
// as written (messy round 19, SiteLink wording 5: "dont", "there own", "isnt" and "hes" in the lead's answers and notes).
// Only words that are never a plain word without the apostrophe ("cant", "wont", "were" and "lets" are).
const APOSTROPHES = [
  [/\b([Dd])ont\b/g, "$1on't"], [/\b([Dd])oesnt\b/g, "$1oesn't"], [/\b([Dd])idnt\b/g, "$1idn't"], [/\b([Ii])snt\b/g, "$1sn't"],
  [/\b([Aa])rent\b/g, "$1ren't"], [/\b([Ww])asnt\b/g, "$1asn't"], [/\b([Ww])erent\b/g, "$1eren't"], [/\b([Hh])asnt\b/g, "$1asn't"],
  [/\b([Hh])avent\b/g, "$1aven't"], [/\b([Cc])ouldnt\b/g, "$1ouldn't"], [/\b([Ww])ouldnt\b/g, "$1ouldn't"], [/\b([Ss])houldnt\b/g, "$1houldn't"],
  [/\b([Hh])es\b/g, "$1e's"], [/\b([Ss])hes\b/g, "$1he's"], [/\b([Tt])heyre\b/g, "$1hey're"], [/\b([Yy])oure\b/g, "$1ou're"], [/\b([Tt])hats\b/g, "$1hat's"],
  [/\b([Tt])heres\b/g, "$1here's"], [/\b([Ww])hats\b/g, "$1hat's"], [/\b[Ii]m\b/g, "I'm"], [/\b[Ii]ve\b/g, "I've"],
  [/\b([Tt])here own\b/g, '$1heir own'],
  [/\b([Bb])uilders(?= (?:engineers?|concreters?|crews?|carpenters?|labourers?|foreman|foremen|supervisors?|site (?:manager|engineer|office|team)|project manager|rep|representatives?|surveyors?|electricians?|scaffolders?|safety (?:officer|advisor|adviser)|hse|whs|people|team|own)\b)/g, "$1uilder's"],
];
const withApostrophes = (text) => APOSTROPHES.reduce((out, [pattern, to]) => out.replace(pattern, to), String(text || ''));
const typedWords = (text) => withShortNames(withApostrophes(hurried(String(text || ''))).replace(/\bok\b/gi, 'OK'));
// A short name the scope itself writes in capitals keeps them in a title the lead types in lower case: "gas
// suppression system - ser room" reads "Gas suppression system - SER room" where the scope writes "SER room" (messy
// round 16, SiteLink wording 3). Only names of two to five letters, never a common short word the scope may write in
// capitals in a heading ("AS", "IT", "OR"), and only where the lead typed it with no capital past its first letter.
const NOT_SCOPE_NAMES = new Set('a an as at be by do go he if in is it me my no of on or so to up us we and the for not all any are can may per see use has its our but out off new one two six ten via etc'.split(' '));
function scopeCapitals(scopeText) {
  const out = new Map();
  for (const word of String(scopeText || '').match(/\b[A-Z]{2,5}\b/g) || []) if (!NOT_SCOPE_NAMES.has(word.toLowerCase())) out.set(word.toLowerCase(), word);
  return out;
}
// A place's own name the scope writes with its capital before a short name, as part of the name of a place or a system
// ("in the Gatehouse SER room", "Trade installation: Gatehouse AVRS"), keeps its capital in the lead's words too:
// "avrs rising step n control cabling - gatehouse" reads "AVRS rising step and control cabling - Gatehouse" (messy round
// 17, SiteLink wording 4). Only inside a sentence, at least twice, and never a word of the contract's own parties or
// headings.
const NOT_PLACE_NAMES = new Set('subcontractor subcontractors contractor contractors principal builder builders client clients works project projects site clause clauses section sections scope schedule appendix part parts item items drawing drawings specification specifications practical completion superintendent consultant consultants authority authorities manager managers install installation supply provide refer include including excluding note notes general requirements interim measures lead coordinator roles interface additional design precast elements excavation trade specific drilling coring cutting concrete exclusions inclusions sequencing table volume figure level stage zone building block test pressure terminate connect'.split(' '));
function scopeNames(scopeText) {
  const text = String(scopeText || '');
  const seen = new Map();
  for (const found of text.matchAll(/(?<=[a-z0-9,;:)][ \t]+)([A-Z][a-z]{3,})(?=[ \t]+[A-Z]{2,5}s?\b)/g)) {
    const key = found[1].toLowerCase();
    if (!NOT_PLACE_NAMES.has(key)) seen.set(key, { word: found[1], times: ((seen.get(key) || {}).times || 0) + 1 });
  }
  return new Map([...seen].filter(([, one]) => one.times >= 2).map(([key, one]) => [key, one.word]));
}
function withScopeCapitals(text, scopeText) {
  const names = scopeCapitals(scopeText);
  const places = scopeNames(scopeText);
  if (!names.size && !places.size) return String(text || '');
  return String(text || '').replace(/\b([A-Za-z][a-z]{1,4})(s?)\b/g, (whole, word, plural) => {
    const found = names.get(word.toLowerCase());
    return found ? `${found}${plural}` : names.get(whole.toLowerCase()) || whole;
  }).replace(/\b[a-z]{4,}\b/g, (word) => places.get(word) || word);
}
// Words the lead types that the subcontractor reads or that print (point answers, changed or added work, site
// rules): "n" reads "and", "b4" reads "before", short names in capitals, the project's people and companies with their
// capitals, and the names the scope writes with capitals (messy round 17, SiteLink wording 3: "Callum fitzwilliam will
// give you the date", "n walkways", "b4 use", "Clean inside AHUs n replace filters b4 practical completion").
function leadWords(text, { names = [], people = [], scopeText = '', stop = false } = {}) {
  const out = withScopeCapitals(tidyNote(text, names, people), scopeText);
  return capitalSentences(out, { stop });
}
// A title the lead types: its first capital and its short names (messy round 15, SiteLink wording 1), and the short
// names the scope writes in capitals (scopeText, messy round 16).
const tidyTitle = (text, scopeText = '') => capitalFirst(withScopeCapitals(typedWords(text), scopeText));

// The lead writing "our crew" or "we" in a SWMS's work: the subcontractor reads it as its own crew, because the SWMS is
// its own (messy round 18, SiteLink wording 6: "A crane company lifts the units up, our crew lands them on the plinths").
// The words are kept as the lead wrote them, which may mean the subcontractor's crew; the lead is told how they read.
const OUR_WORDS = /\b(?:our(?:\s+(?:own\s+)?(?:crew|team|people|workers?|guys|boys|fitters?|riggers?|doggers?|labourers?|electricians?|plumbers?))?|ours|we|us)\b/i;
function ourWordsNote(task, subName) {
  const found = OUR_WORDS.exec(String(task || ''));
  if (!found) return '';
  const who = String(subName || '').trim() || 'The subcontractor';
  return ` Your words say "${found[0].toLowerCase()}": ${who} reads it as its own crew, as the SWMS is its own. If you mean your own people, name them, for example "the builder's crew".`;
}

// "muster point, first aider and hospital"
const listed = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || '');

module.exports = { splitRole, ourWordsNote, withPeople, leadWords, scopeNames, hurried, placeNames, withPlaceNames, withScopeCapitals, personNames, withPersonNames, tidyLines, withShortNames, typedWords, tidyTitle, tidyCompany, notAnswer, personProblem, firstAiderProblem, placeProblem, hospitalProblem, phoneOnly, phoneProblem, tidyName, tidyPerson, tidyPersonRole, tidyPlace, withCompanyNames, capitalFirst, capitalSentences, tidyNote, tidyRole, listed, PASSED_ON };
