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
const tidyPerson = (text) => tidyName(text);
// A street named in a place takes its capitals ("meet at henry st gate" reads "Meet at Henry St gate";
// SiteLink round 10, wording 11). Words typed with capitals are left as typed.
const STREET = /(?<!\bthe\s)\b([a-z][a-z'’-]+)\s+(st|street|rd|road|ave|avenue|tce|terrace|pde|parade|dr|drive|ln|lane|hwy|highway|blvd|boulevard|cres|crescent|ct|court|pl|place|cct|circuit|esp|esplanade|cl|close)\b/g;
const NOT_A_STREET_NAME = new Set(['the', 'a', 'an', 'this', 'that', 'our', 'side', 'back', 'front', 'same', 'next', 'each', 'on', 'at', 'of', 'off', 'in', 'to', 'by', 'from', 'near', 'and', 'or', 'site', 'local']);
// A street's name of two or three words takes its capitals too: "on chung wah tce" reads "on Chung Wah Tce", not
// "on chung Wah Tce" (messy round 13, B run 8). The words before it that are not part of a name stay as typed.
const NOT_IN_STREET_NAME = new Set([...NOT_A_STREET_NAME, 'along', 'beside', 'behind', 'outside', 'opposite', 'corner', 'gate', 'gates', 'area', 'point', 'entrance', 'entry', 'exit', 'office', 'shed', 'sheds', 'carpark', 'park', 'end', 'truck', 'ute', 'van', 'car', 'hiab', 'is', 'are', 'meet', 'muster', 'assembly', 'footpath', 'verge', 'kerb', 'fence', 'hoarding', 'compound', 'laydown', 'lot', 'block', 'building', 'level', 'main']);
const STREET_NAMED = /\b((?:[a-z][a-z'’-]+\s+){0,2}[a-z][a-z'’-]+)\s+(st|street|rd|road|ave|avenue|tce|terrace|pde|parade|dr|drive|ln|lane|hwy|highway|blvd|boulevard|cres|crescent|ct|court|pl|place|cct|circuit|esp|esplanade|cl|close)\b/g;
const upFirst = (word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
const tidyPlace = (text) => capitalFirst(clean(text).replace(STREET_NAMED, (whole, names, kind) => {
  const words = names.split(/\s+/);
  let at = words.length;
  while (at > 0 && !NOT_IN_STREET_NAME.has(words[at - 1])) at -= 1;
  if (at === words.length) return whole;
  return [...words.slice(0, at), ...words.slice(at).map(upFirst), upFirst(kind)].join(' ');
}));

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
const SMALL_WORDS = new Set(['and', 'of', 'the', 'for', 'to', 'in', 'on', 'at', 'by']);
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
const COMPANY_SMALL = new Set([...SMALL_WORDS, 'n']);
const tidyCompany = (text) => tidyName(text, COMPANY_SMALL);
// A person with their role, "name, role" ("declan furlong, foreman"): the name takes its capitals and the
// role its first capital, as the checker's do ("Tanya Pirelli, Ops manager"). An answer typed with any
// capital is left as typed ("Sam Lee, supervisor").
// A role typed after the name with no comma ("tara nguyen hse") is split off as the role: "Tara Nguyen, HSE"
// (messy round 12, run 1: it printed "Tara Nguyen Hse"). Only the last word or two, and only where two words of
// the name are left.
const ROLE_TAIL = /\s+((?:(?:hse|whs|ohs|site|project|safety|works|construction|office|operations|ops)\s+)?(?:hse|whs|ohs|qhse|hseq|supervisor|foreman|forewoman|manager|leading hand|lead hand|engineer|director|officer|advisor|adviser|coordinator|admin|administrator|owner|pm|cm))$/;
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
    const name = clean(tidy.split(/,|\s[-–]\s|\s\(/)[0]);
    const words = name.split(/\s+/);
    if (words.length >= 2 && words.length <= 3 && words.every((word) => /^[A-Z][A-Za-z'’-]+$/.test(word)) && !out.includes(name)) out.push(name);
  }
  return out;
}
function withPersonNames(text, names = []) {
  let out = String(text || '');
  for (const name of names) {
    const pattern = new RegExp(`\\b${name.split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')}\\b`, 'gi');
    out = out.replace(pattern, (found) => (found === found.toLowerCase() ? name : found));
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
function tidyNote(text, names = []) {
  let out = capitalSentences(typedWords(text));
  if (!out) return out;
  for (const name of names) {
    for (const word of String(name || '').split(/\s+/)) {
      if (word.length < 3 || !/^[A-Z][a-z'’-]+$/.test(word) || /^(?:Pty|Ltd|The|And|Group|Services|Constructions?)$/.test(word)) continue;
      out = out.replace(new RegExp(`\\b${word.toLowerCase()}\\b`, 'g'), word);
    }
  }
  return out.replace(MONTHS, (whole, day, month, rest) => `${day}${month.charAt(0).toUpperCase()}${month.slice(1).toLowerCase()}${rest || ''}`);
}

// Words typed one item to a line (a reviewer's conditions or changes needed), each line tidied as a note.
const tidyLines = (text, names = []) => String(text || '').split('\n').map((line) => (line.trim() ? tidyNote(line, names) : line)).join('\n');

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
const SHORT_NAMES = new Set('hv lv elv ac dc cctv pvc upvc cpvc hdpe hvac ewp ict msb mdb db mcc plc bms fip ewis nbn rcd gpo ppe lpg frp ups swms hrcw rmu acb mep av ipa itp itps sds ohs whs hse qa rfi'.split(' '));
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
const typedWords = (text) => withShortNames(loneN(String(text || '').replace(/\bb4\b/gi, (word) => (word === 'B4' ? 'Before' : 'before'))));
// A title the lead types: its first capital and its short names (messy round 15, SiteLink wording 1).
const tidyTitle = (text) => capitalFirst(typedWords(text));

// "muster point, first aider and hospital"
const listed = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || '');

module.exports = { personNames, withPersonNames, tidyLines, withShortNames, typedWords, tidyTitle, tidyCompany, notAnswer, personProblem, firstAiderProblem, placeProblem, hospitalProblem, phoneOnly, phoneProblem, tidyName, tidyPerson, tidyPersonRole, tidyPlace, withCompanyNames, capitalFirst, capitalSentences, tidyNote, tidyRole, listed, PASSED_ON };
