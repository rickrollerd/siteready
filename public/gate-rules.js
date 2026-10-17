// How the download gate (goal 2) judges an answer: a blank (____) or "To be completed" left in,
// "None" where every SWMS names something, "Not applicable" to an emergency question. The server
// (download-gate.js, blanks.js) and the page use these same rules: the page clears a box's note as
// soon as its answer passes, and the server checks again before any download or save. Used by the
// server and the browser.
(function (root) {
  const BLANK_RUN = /_{3,}/g;
  const hasBlank = (text) => /_{3,}/.test(String(text || ''));
  // A field or line left as a placeholder: "To be completed before submitting for approval", or a
  // label with one ("Muster point: To be completed"). "The permit is to be completed before work
  // starts" is an instruction, not a placeholder.
  const PLACEHOLDER = /^(?:[^:.]{1,60}:\s*)?(?:to be (?:completed|confirmed|advised)\b|tb[acd]\b)/i;
  const isPlaceholder = (text) => PLACEHOLDER.test(String(text || '').trim());
  const leftOpen = (text) => hasBlank(text) || isPlaceholder(text);

  // An answer as it goes into a blank in a line: one line of text, without the full stop the line
  // already has.
  function cleanAnswer(value) {
    const text = String(typeof value === 'string' ? value : '').replace(/\s+/g, ' ').trim().replace(/[.;,]+$/, '').trim();
    return hasBlank(text) ? '' : text.slice(0, 300);
  }

  // Fills each blank in a line, in order, with the user's answers. A blank with no answer stays.
  function fillLine(line, answers) {
    if (!hasBlank(line) || !Array.isArray(answers)) return line;
    let n = 0;
    return String(line).replace(BLANK_RUN, (run) => {
      const answer = cleanAnswer(answers[n]);
      n += 1;
      return answer || run;
    });
  }

  const clean = (value) => String(typeof value === 'string' ? value : '').replace(/\s+/g, ' ').trim();
  // "None", "Nil", "No", "N/A" or "Not applicable", and "No first aider" and the like.
  const NONE = /^(?:none|nil|nobody|no ?one|n\/a|not applicable|not required|not needed)\b|^(?:na|no)\.?$|^no (?:first aiders?|muster points?|principal contractors?|scaffold\w*|reviewers?|supervisors?)\b/i;
  // An emergency answer that is only "None" or "Not applicable". A longer answer that starts so ("No one
  // enters the trench: ...") is an answer.
  const NO_ANSWER = /^(?:none|nil|nobody|no ?one|n\/?a|not applicable|not required|not needed|no|does not apply|not used)\.?$/i;
  // Not an answer yet: unknown, a question mark, a dash, or a placeholder.
  const NOT_YET = /^(?:unknown|not (?:yet )?known|not provided|to be advised|if not known yet\b.*|\?+|-+|\.+|x+)$/i;
  // Not an answer either (messy-user test on staging, 14 October 2026): "dont know", a word that only
  // points at a person ("me", "us"), and "as per site" or "as per the engineer" with nothing else.
  const DONT_KNOW = /^(?:i\s+)?(?:dont|don't|don’t|do not|dunno|not sure|unsure|no idea)(?:\s+know)?\b[\s\w']{0,20}\.?$/i;
  const PRONOUN = /^(?:me|us|them|him|her|we|i|myself|ourselves|you|they|someone|somebody|anyone)\.?$/i;
  const AS_PER = /^as per (?:the )?(?:site|eng|engineer\w*|supplier\w*|builder\w*|pc|principal contractor|plans?|spec\w*|drawings?|manufacturer\w*|maker\w*|instructions?|swms|procedures?|normal|usual|standard)(?:'s)?(?: (?:rules?|requirements?|instructions?|plans?|procedures?|specs?|drawings?))?\.?$/i;
  // A rescue answer that only calls for help: the rescue cannot wait for emergency services.
  // Ringing the power company or the network operator is calling for help too (messy round 4: "ring the
  // power company, nobody touches him" passed while "rings 000" was refused).
  const CALLS = /\b(?:000|triple zero|112|emergency services|ambulance|paramedics|fire brigade|fire service|fire and rescue|qfes|frnsw|ses|(?:power|electricity|energy|network) (?:company|companies|supplier|distributor|authority|operator)|network operators?|energex|ergon|ausgrid|endeavour energy|essential energy|western power|sa power networks|tasnetworks|evoenergy|jemena|citipower|powercor|ausnet|united energy|power and water)\b/i;
  // Helping the person out, or a named role doing it, is a rescue (messy round 9, run 4: "The foreman and
  // a labourer help the person out from the low end" was refused as only calling for help).
  const RESCUES = /\b(?:rescu\w*|lift\w*|lower\w*|bring\w*|brought|pull\w*|retriev\w*|reach\w*|winch\w*|harness\w*|ewps?|ladders?|lines?|poles?|isolat\w*|stand-?by|spotters?|crew|workers?|supervisors?|operators?|first aiders?|trained|observers?|tripods?|descend\w*|get\w* (?:them|the person) out|help\w* (?:them|him|her|the (?:person|worker|injured \w+)) (?:out|up|down|clear)|foreman|foremen|labourers?|leading hands?|riggers?|dogm[ae]n|offsiders?)\b/i;
  const onlyCalls = (text) => CALLS.test(text) && !RESCUES.test(text);
  const RESCUE_KIT = /\b(?:harness\w*|lines?|ropes?|tripods?|winch\w*|ladders?|ewps?|elevating work platforms?|poles?|descenders?|stretchers?|spinal boards?|rescue kits?|lifelines?|davits?|hoists?|retrieval|hooks?|mats?|insulated|lv rescue|low voltage rescue)\b/i;

  // "dont know", "TBC" or "to be confirmed" inside a longer answer, such as a standard answer's blank
  // filled with it ("The products used are dont know.", "document dont no, revision TBC"): messy round 3,
  // 14 October 2026. "Unknown services" is a real hazard, so "unknown" alone is not counted.
  const HELD_OPEN = /\b(?:tb[acd]|to be (?:confirmed|advised|determined|completed|decided)|(?:i )?(?:dont|don't|don’t|do not) (?:know|no)|dunno|not sure|no idea)\b/i;
  // A question back, not an answer ("powerlines?", "harness?"): messy round 4, run 7.
  const ASKED_BACK = /^[^.!]{1,60}\?+$/;
  // Work done or checked "by me" or trained "by me" does not say who (messy round 4, run 9: "trained by me").
  const BY_ME = /\b(?:by|from|with) (?:me|myself|us)\b/i;
  // An amount, not who or what (messy round 9, run 6: "heaps" for the other trades).
  const AMOUNT_ONLY = /^(?:heaps|lots|plenty|loads|tons|many|a few|a couple|some|several|a lot|a heap|a bunch|numerous|all sorts|the usual|usual)(?: of (?:them|trades|people|blokes|guys|stuff))?\.?$/i;

  // Why a typed answer is no answer at all ("dont know", "me", "as per eng"), or '' when it says
  // something. The answers to the questions about the work are judged by the same words (draft.js
  // hasSubstance), so one answer gets one message wherever it is typed.
  // kind: the kind of box, where it is a person's ('person', 'firstAider'). There "me" is asked for a name
  // and role, as a role alone is refused there (messy round 10, run 2: the hint's own example "The site
  // supervisor" was then refused as a role).
  function notAnswer(value, kind) {
    const text = clean(value);
    if (!text) return '';
    const quoted = `"${text}"`;
    if (leftOpen(text) || NOT_YET.test(text) || DONT_KNOW.test(text)) return `${quoted} is not an answer yet.`;
    if (PRONOUN.test(text)) return PERSON_KINDS.has(kind) ? `${quoted} does not say who. Give their name and role, for example "Sam Lee, site supervisor".` : `${quoted} does not say who. Name the role, for example "The site supervisor".`;
    if (AMOUNT_ONLY.test(text)) return `${quoted} gives an amount, not who or what. Name them, or say what applies on this job.`;
    if (ASKED_BACK.test(text)) return `${quoted} is a question, not an answer. Say what applies on this job.`;
    const me = BY_ME.exec(text);
    if (me) return `${quoted} says "${me[0]}", which does not say who. Name the role or the company, for example "by the supplier".`;
    if (AS_PER.test(text)) return `${quoted} does not say what is done. Write it here in a few words.`;
    const open = HELD_OPEN.exec(text);
    if (open) return `${quoted} still has "${open[0]}" in it. Put in what applies on this job.`;
    return '';
  }

  // Answers to the people and place boxes that say too little to act on (messy round 3, 14 October
  // 2026): a muster point of "gate" or "out the front", a first aider of "builder" or "supervisor", a
  // principal contractor of "the builder". Each kind of box says what would do.
  // A vehicle is not a place to meet: it moves (messy round 9, run 5: "the ute" was accepted).
  const VAGUE_PLACE = /^(?:(?:out|outside)(?: (?:the|of the))? (?:front|back|site|gate|office|shed)|out ?front|out ?back|outside|(?:the |at the )?(?:front|back|street|road|gate|footpath|car ?park|entrance|exit)|here|there|on ?site|the site|site|usual(?: place| spot)?|normal (?:place|spot)|assembly area|muster point|emergency assembly area|(?:at |by |near |beside )?(?:the |our |my |his |a |site |work )?(?:site |work )?(?:utes?|trucks?|vans?|cars?|vehicles?|wagons?|trailers?)|(?:at |out )?(?:the )?(?:front|back|rear|side|middle|centre|end)(?: of)?(?: the)? (?:site|job|building|block|property|work area|lot)|(?:the )?site (?:entrance|exit|front))\.?$/i;
  const NOT_A_FIRST_AIDER = /^(?:the |a |our |site )?(?:builder|builders|supervisor|foreman|leading hand|boss|pc|mc|principal contractor|main contractor|head contractor|site manager|manager|crew|anyone|everyone|all|anybody|whoever|staff|site staff|workers?)\.?$/i;
  // A person's box holding a thing, a place or a crowd, not a person (messy round 8, run 5: "gloves").
  const NOT_A_PERSON = /^(?:the |a |our |my )?(?:gloves?|glasses|safety glasses|goggles|boots|helmets?|hard ?hats?|hi-?vis(?: vests?)?|vests?|harness(?:es)?|lanyards?|masks?|p2 masks?|respirators?|ear ?muffs?|ear ?plugs?|ppe|ladders?|scaffold\w*|ute|truck|van|car|site|office|site office|gate|stairs?|crew|workers?|anyone|everyone|everybody|all|all of us|whoever|staff|team|the boys|boys|lads|guys)\.?$/i;
  // A trade or a crew is not a person either (messy round 9, run 1: "the tilers" printed as the person
  // who makes sure the SWMS is followed).
  const A_TRADE = /^(?:the |our |my |all the |all our |a )?(?:tilers?|sparkies|sparkys|sparky|chippies|chippys|chippy|plumbers?|painters?|concreters?|labourers?|carpenters?|electricians?|scaffolders?|riggers?|roofers?|plasterers?|renderers?|fitters?|installers?|subbies|subbys|subcontractors?|contractors?|trades|tradies|tradesmen|apprentices?|operators?|cleaners?|glaziers?|welders?|fixers?|formworkers?|steel ?fixers?|crew members?|team members?|gang|blokes)\.?$/i;
  // A role with no name does not say who (messy round 9, run 6: "leading hand"). First names alone stay
  // accepted (flow8 decision 1).
  const ROLE_ONLY = /^(?:the |our |my |a |site |project )?(?:leading hand|lead hand|charge ?hand|foreman|forewoman|supervisor|site supervisor|boss|manager|site manager|project manager|construction manager|works manager|director|owner|hse(?: advisor| manager| officer| rep)?|whs(?: officer| advisor| manager)?|safety officer|engineer|site engineer|project engineer|team leader|crew leader|leader|pm|cm)\.?$/i;
  const NOT_A_COMPANY = /^(?:the |a |our )?(?:builder|builders|main contractor|head contractor|principal contractor|principal|pc|mc|client|contractor|owner|developer|company)\.?$/i;
  // An Australian phone number a site can ring (messy round 4, run 2: a 9 digit mobile printed): a mobile
  // or landline with its area code (10 digits from 0), a landline without it (8 digits), 13 numbers
  // (6 digits) and 1300 or 1800 numbers (10 digits), with +61 read as 0.
  function phoneNumber(text) {
    let digits = String(text || '').replace(/\D/g, '');
    if (/^\s*\+?61/.test(String(text || '')) && digits.startsWith('61')) digits = `0${digits.slice(2).replace(/^0/, '')}`;
    return (digits.length === 10 && /^(?:0[2-478]|1[38]00)/.test(digits)) || (digits.length === 8 && /^[2-9]/.test(digits)) || (digits.length === 6 && /^13/.test(digits));
  }
  const PERSON_KINDS = new Set(['person', 'firstAider']);
  function fieldWeak(kind, text) {
    const quoted = `"${text}"`;
    // One rule in every person's box: a role with no name is refused, the first aider's box too (messy
    // round 10, run 3: "The site supervisor" was accepted as first aider and refused elsewhere).
    if (PERSON_KINDS.has(kind) && ROLE_ONLY.test(text)) return `${quoted} is a role, not a person. Give their name and role, for example "Sam Lee, ${clean(text).replace(/^(?:the|our|my|a|site|project) /i, (word) => (/^(?:site|project) $/i.test(word) ? word : '')).toLowerCase()}".`;
    if (kind === 'place' && (VAGUE_PLACE.test(text) || !/\s/.test(text))) return `${quoted} does not say where. Name the place so a new worker can find it, for example "Main gate on Smith Street, beside the site office".`;
    if (kind === 'firstAider' && NOT_A_FIRST_AIDER.test(text)) return `${quoted} does not name a first aider. Name the trained first aider, or say whose they are, for example "Main contractor's site first aider".`;
    if (kind === 'person' && (NOT_A_PERSON.test(text) || A_TRADE.test(text))) return `${quoted} does not name a person. Give their name and role, for example "Sam Lee, supervisor".`;
    if (kind === 'company' && NOT_A_COMPANY.test(text)) return `${quoted} does not name the company. Give the principal contractor's name, for example "ABC Builders Pty Ltd".`;
    if (kind === 'phone' && !phoneNumber(text)) return text.replace(/\D/g, '').length < 6 ? `${quoted} is not a phone number. Give a number the site can ring, for example 0412 345 678.` : `${quoted} is not a full phone number. A mobile has 10 digits, for example 0412 345 678.`;
    return '';
  }

  // The licence typed for plant the user added (download-gate.js plantNeed): it names the licence, not
  // only "ticket" (messy round 4, run 7: "crane ticket" was accepted for a 25 t crane). A crane needs its
  // high risk work licence class; "No" says none is needed. '' when it passes.
  const CRANE_ITEM = /\b(?:cranes?|franna|hiab|pick and carry)\b/i;
  const CRANE_CLASS = /\b(?:C[2-9]|C1\d|C[0-6]0|CN|CV|CB|CD|CT|CS|CP|CO|C0|C1|C6|non-slewing|slewing|vehicle loading|bridge (?:and|or) gantry|tower crane|portal boom|derrick|HRW\w*\s+(?:licen[cs]e\s+)?C\w+)\b/i;
  const BARE_LICENCE = /^(?:(?:a|the|has|has a|got|got a|current|valid)\s+)?(?:ticket|tickets|licen[cs]e|licen[cs]es|licen[cs]ed|ticketed|card)\.?$|^(?:yes|yep|has one|licen[cs]ed|ticketed|current|valid)\.?$/i;
  function licenceNeed(item, licence) {
    const text = clean(licence);
    if (!text) return '';
    if (/^(?:no|none|nil|not needed|not required|n\/?a)\.?$/i.test(text)) return '';
    const not = notAnswer(text);
    if (not) return `${not} Give the licence or ticket to operate ${clean(item)}, or write No if none is needed.`;
    if (CRANE_ITEM.test(item) && !CRANE_CLASS.test(text)) return `"${text}" does not say which licence. Give the high risk work licence class for ${clean(item)}, for example "HRW licence C2 (slewing mobile crane up to 20 t)" or "CN (non-slewing mobile crane)".`;
    if (BARE_LICENCE.test(text)) return `"${text}" does not say which licence or ticket. Name it, for example "HRW licence LF (forklift)" or "EWP yellow card".`;
    return '';
  }

  // Why an answer is not enough, or '' when it passes. rule is what the gate asks of it:
  // { ask, name?, none?, optional?, emergency?, involves?, blank?, line? }
  // - ask: what is needed, in plain words; name: the question's name in a refusal.
  // - none: "None" or "Not applicable" is accepted. optional: may be left empty, but not as a placeholder.
  // - emergency: an emergency question, which only asks about work the SWMS involves (involves).
  // - blank: an answer that must have no blank (____) left in it.
  // - line: a control line with blanks; value is the answers typed in its blanks, in order.
  function answerNeed(rule, value) {
    if (rule.line) {
      if (hasBlank(fillLine(rule.line, Array.isArray(value) ? value : []))) return rule.ask;
      // A blank filled with "dont know" or "TBC" is still open.
      const typed = (Array.isArray(value) ? value : []).map(clean).find((answer) => answer && notAnswer(answer));
      return typed ? `${notAnswer(typed)} Fill in the blank with what applies on this job.` : '';
    }
    if (rule.blank) return hasBlank(value) ? rule.ask : '';
    const text = clean(value);
    const quoted = `"${text}"`;
    if (rule.optional) return text && leftOpen(text) ? `${quoted} is not an answer. Fill it in, or leave the box empty.` : '';
    if (!text) return rule.ask;
    const not = notAnswer(text, rule.kind);
    if (not) return `${not} ${rule.ask}`;
    if (rule.emergency) {
      if (NO_ANSWER.test(text)) return `${quoted} is not an answer here: this SWMS involves ${rule.involves}. ${rule.ask}`;
      if (rule.rescue && onlyCalls(text)) return `${quoted} only calls for help. Say who rescues the person and how, before emergency services arrive.`;
      if (rule.kit && /\bfirst aid\b/i.test(text) && !RESCUE_KIT.test(text)) return `${quoted} is first aid, not rescue equipment. Say what is used to get the person out, and where it is kept.`;
      // One word ("builder", "gate", "spotter") does not tell the crew what to do.
      if (!/\s/.test(text)) return `${quoted} is too short to act on. ${rule.ask}`;
      // "pull them out" does not say who does it or with what (messy round 3).
      if (rule.rescue && words(text) < 5) return `${quoted} does not say who rescues the person or how. ${rule.ask}`;
      // Rescue gear left in a vehicle is not at the work: "rope in the ute".
      // A second kit in the ute beside one kept at the work is fine (messy round 9, run 7): only an answer
      // whose every kit is in a vehicle is refused.
      if (rule.kit && IN_VEHICLE.test(text) && !AT_WORK.test(text) && !text.split(/[,;.]/).some((part) => RESCUE_KIT.test(part) && !IN_VEHICLE.test(part) && PLACED.test(part))) return `${quoted} keeps the rescue equipment away from the work. Say what is used to get the person out, and that it is kept at the work area.`;
      // "turn it off" does not say where the stop is or who uses it.
      if (rule.stop && (words(text) < 4 || BARE_COMMAND.test(text))) return `${quoted} does not say where the stop is or who uses it. ${rule.ask}`;
      return '';
    }
    if (NONE.test(text) && !rule.none) return `${rule.name} cannot be ${quoted}: every SWMS names it. ${rule.ask}`;
    // Not applicable is refused where the SWMS itself says the thing is there (a scaffold in the plant).
    if (rule.noneRefused && NONE.test(text)) return `${rule.noneRefused} ${rule.ask}`;
    if (rule.kind) { const weak = fieldWeak(rule.kind, text); if (weak) return `${weak}`; }
    return '';
  }
  const words = (text) => clean(text).split(/\s+/).filter(Boolean).length;
  const IN_VEHICLE = /\b(?:in|on) (?:the |my |our |a |his |their )?(?:site )?(?:ute|truck|van|car|vehicle|wagon|trailer)\b/i;
  const AT_WORK = /\b(?:at|beside|next to|by|near) (?:the |each )?(?:work|trench|entry|edge|box|shield|pit|platform|lift|level|area|access|ladder|ewp|scaffold)\b|\bkept (?:at|on) (?:the )?(?:work|level|deck|site office)\b/i;
  // A kit said to be at a place that is not a vehicle ("on the slung platform").
  const PLACED = /\b(?:on|at|in|inside|beside|next to|by|near)\s+(?:the |each |every |a |our )?(?!(?:site |work |company )?(?:utes?|trucks?|vans?|cars?|vehicles?|wagons?|trailers?)\b)[a-z]/i;
  const BARE_COMMAND = /^(?:just )?(?:turn|switch|shut|press|hit|kill|stop|cut|push|pull)\b[\w\s'-]{0,16}\.?$/i;

  // What a design the SWMS relies on still needs (designs.js), or '' once answered: issued, with who
  // prepared it, its document or drawing number and its date (the revision and the file are
  // optional); "Not issued yet", which prints as a hold point; or "Not needed for this work", which is
  // recorded as the user's choice. row: { what, status, by, number, revision, date }.
  function designNeed(row) {
    const item = row && typeof row === 'object' ? row : {};
    const what = clean(item.what) || 'this design';
    if (item.status === 'notIssued' || item.status === 'notNeeded') return '';
    if (item.status !== 'given') return `Say whether ${what} is issued: give its details, choose Not issued yet, or say it is not needed for this work.`;
    const missing = [['by', 'who prepared it'], ['number', 'its document or drawing number'], ['date', 'its date']]
      .filter(([key]) => { const text = clean(item[key]); return !text || leftOpen(text) || NOT_YET.test(text); }).map(([, words]) => words);
    if (!clean(item.what) || leftOpen(item.what)) missing.unshift('what the design is');
    if (leftOpen(item.revision)) missing.push('its revision (or leave the revision empty)');
    // Details read from the drawing (D249, D250): the user ticks that they match its title block.
    const read = item.read && Array.isArray(item.read.fields) && item.read.fields.length && item.read.checked !== true;
    if (!missing.length) return read ? `For ${what}, check the details read from the drawing against its title block and tick "These match the drawing".` : '';
    if (read) missing.push('tick "These match the drawing" once checked');
    return `For ${what}, give ${missing.length > 1 ? `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}` : missing[0]}.`;
  }

  // A written method or sequence of works the work follows (designs.js, owner, D224, 12 October 2026),
  // which the user may add to any SWMS: kept with the designs as "method-1" and so on.
  const isMethod = (row) => Boolean(row && typeof row.id === 'string' && /^method-\d+$/.test(row.id));
  // What a written method still needs before it prints, or '' once it can: what it is, who prepared
  // it and its date (the document number, the revision and the file are optional). It is optional, so
  // it never holds the download: until then it does not print, and its card says so.
  function methodNeed(row) {
    const item = row && typeof row === 'object' ? row : {};
    // Its document number is optional (owner, D236, 13 October 2026), as its revision is: only one
    // typed and left open ("TBC", "____") is asked for.
    const open = (text) => leftOpen(text) || NOT_YET.test(text);
    const missing = [['what', 'what it is'], ['by', 'who prepared it'], ['number', 'its document number (or leave the number empty)'], ['date', 'its date']]
      .filter(([key]) => { const text = clean(item[key]); return key === 'number' ? Boolean(text) && open(text) : !text || open(text); }).map(([, words]) => words);
    if (leftOpen(item.revision)) missing.push('its revision (or leave the revision empty)');
    if (!missing.length) return '';
    return `Not in the SWMS yet. Give ${missing.length > 1 ? `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}` : missing[0]}.`;
  }

  // Two or more designs on one SWMS, each answered "I have it", that give the same document or drawing
  // number (owner, D223, 12 October 2026). Advice on the page only: one drawing can cover two designs
  // (one temporary works drawing for the shoring and the propping), so it never holds the download,
  // changes the builder check or prints in the SWMS. Numbers are compared without case, spaces,
  // hyphens (or the dashes a copied title block may hold) or dots, so "ABC-S-101" is the same as
  // "abc s 101". A number that is not an answer yet ("TBC") is left to the gate.
  // rows: [{ id, what, status, number, revision }]. Returns each group: { ids, text }, in the order
  // the designs are listed.
  const numberKey = (value) => clean(value).toLowerCase().replace(/[\s.\-\u2010-\u2015\u2212]+/g, '');
  const revisionOf = (value) => clean(value).replace(/^(?:rev(?:ision)?\.?\s*)/i, '');
  const listed = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]);
  function sameDesignNumbers(rows) {
    const groups = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row || row.status !== 'given') continue;
      const number = clean(row.number);
      const key = numberKey(number);
      if (!key || leftOpen(number) || NOT_YET.test(number)) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    return [...groups.values()].filter((list) => list.length > 1).map((list) => ({ ids: list.map((row) => row.id), text: sameNumberText(list) }));
  }
  // "Shoring design and Propping design both give drawing ABC-S-101 rev C. ..." The same revision may
  // be one drawing that covers both; different revisions of one drawing are most likely a mistake.
  // With a written method among them, the number is a document's, not a drawing's (D225 holds alike).
  function sameNumberText(list) {
    const method = list.some(isMethod);
    const thing = method ? 'document' : 'drawing';
    const against = method ? 'its document' : 'the design\'s title block';
    const names = list.map((row) => clean(row.what) || (isMethod(row) ? 'A written methodology' : 'Another design'));
    const revisions = list.map((row) => revisionOf(row.revision));
    const both = list.length === 2 ? 'both' : 'all';
    // The number as a title block shows it: the first given in capitals, else the first given.
    const number = clean((list.find((row) => clean(row.number) === clean(row.number).toUpperCase()) || list[0]).number);
    const keys = new Set(revisions.map(numberKey));
    if (keys.size === 1) {
      const revision = revisions[0] ? ` rev ${revisions[0]}` : '';
      return `${listed(names)} ${both} give ${thing} ${number}${revision}. Check each number against ${against}. If the one ${thing} covers ${list.length === 2 ? 'both' : 'them all'}, nothing needs changing.`;
    }
    const given = new Set(revisions.filter(Boolean).map(numberKey));
    return `${listed(names.map((name, i) => `${name} (${revisions[i] ? `rev ${revisions[i]}` : 'no revision'})`))} ${both} give ${thing} ${number}.${given.size > 1 ? ` Two revisions of one ${thing} is most likely a mistake.` : ''} Check each number and revision against ${against}.`;
  }

  // The people and place boxes every SWMS names, as the download gate judges them (download-gate.js),
  // shared with the page so the project page can say under each box why an answer is refused, as the
  // single SWMS page does (messy round 3). kind: how a short answer is judged (fieldWeak). The works
  // manager and contact phone print in every SWMS and are needed before download (D289).
  const PEOPLE_FIELDS = [
    { id: 'workplace', field: 'workplace', label: 'Job address', need: 'Give the address where the work is done.' },
    { id: 'principalContractor', field: 'principal', label: 'Principal contractor', none: true, kind: 'company', need: 'Name the principal contractor running the site. If no principal contractor is appointed for this work, write Not applicable.' },
    { id: 'complianceResponsible', field: 'compliance-responsible', label: 'Person who makes sure the SWMS is followed', kind: 'person', need: 'Name the person who checks the controls are in place on site, usually your supervisor or leading hand.' },
    { id: 'reviewer', field: 'reviewer', label: 'Person who reviews the controls', kind: 'person', need: 'Name the person who checks the controls are working and updates this SWMS if the job changes.' },
    { id: 'worksManager', field: 'works-manager', label: 'Works manager', kind: 'person', need: 'Name your own person in charge of this work, such as your supervisor or foreman. It prints at the top of the SWMS.' },
    { id: 'worksManagerPhone', field: 'works-manager-phone', label: 'Works manager phone', kind: 'phone', need: 'Give the works manager\'s mobile, so the site can reach them. It prints as the contact phone.' },
    { id: 'scaffoldSupervisor', field: 'scaffold-supervisor', label: 'Scaffold supervisor', none: true, scaffold: true, need: 'This SWMS involves a scaffold. Name the scaffolding company\'s supervisor who hands it over and tags it, or write Not applicable if no scaffold is used for this work.' },
    { id: 'firstAider', field: 'first-aider', label: 'First aider', kind: 'firstAider', need: 'Name a trained first aider on site, yours or the main contractor\'s.' },
    { id: 'musterPoint', field: 'muster-point', label: 'Muster point', kind: 'place', need: 'Say where everyone meets in an emergency. Ask the main contractor.' },
    // Required before download (owner, D292 item 2: in rounds 4 no hospital printed in three runs).
    { id: 'hospital', field: 'hospital', label: 'Hospital or medical centre', need: 'Name the nearest hospital or medical centre with an emergency department. Press "Find nearest from the job address" under the box to look it up.' },
  ];
  // One name in every person's box (messy round 4, run 2: "kev" printed as the first aider, the works
  // manager and both responsible people): a warning, not a refusal, as one person can do it all on a
  // small job. values: { worksManager, complianceResponsible, reviewer, firstAider }. '' when they differ.
  const SAME_ROLES = [['worksManager', 'works manager'], ['complianceResponsible', 'person who makes sure the SWMS is followed'], ['reviewer', 'person who reviews the controls'], ['firstAider', 'first aider']];
  function sameNameWarning(values) {
    const given = SAME_ROLES.map(([id]) => clean((values || {})[id]).toLowerCase());
    if (given.some((name) => !name) || new Set(given).size > 1) return '';
    const name = clean(values[SAME_ROLES[0][0]]);
    return `"${name}" is named for every role: works manager, the person who makes sure the SWMS is followed, the person who reviews the controls and first aider. Check one person really does all of these on this job, and give their full name so the site can find them.`;
  }
  // The rule a person or place box is judged by (answerNeed).
  const fieldRule = (item) => ({ ask: item.need, name: item.label, none: Boolean(item.none), ...(item.kind ? { kind: item.kind } : {}) });
  // The five site questions, and which take "None".
  const SITE_NEED = {
    liveServices: 'Say what power, gas, water, data or other live services are in or near the work, or write None.',
    publicInterface: 'Say where the public, traffic or neighbours are close to the work, or write None.',
    otherTrades: 'Say which other trades work nearby, or above or below you, or write None.',
    ground: 'Say what the ground or deck is like where you work (soft or sloping ground, excavations, slab or deck loads), or write None.',
    access: 'Say how the crew gets to the work area, and how plant and materials get there.',
  };
  const SITE_NONE = ['liveServices', 'publicInterface', 'otherTrades', 'ground'];

  // What the user types that the SWMS prints as given and reads for nothing else: the people and
  // place boxes, the emergency answers and the words typed in a control line's blanks. Changing one
  // of these needs no new draft: the download sends them as they are now. Any other change (a site
  // question, an answer to a question about the work, the state) can change the hazards and job
  // steps, so the draft is prepared again first (test/live-gate.test.js checks this list).
  const AS_GIVEN = ['workplace', 'principalContractor', 'complianceResponsible', 'reviewer', 'scaffoldSupervisor', 'firstAider', 'musterPoint',
    'siteManager', 'worksManager', 'worksManagerPhone', 'hospital', 'reviewDate', 'preparedBy', 'swmsRef', 'emergency', 'fills',
    // The types of hazardous substance ticked "Not required" (D277): read by the gate only.
    'substancesNotUsed', 'substancesNotUsedWhy'];

  // A control line of the user's own step that only points to another step ("as per step 2") prints
  // nothing a worker can follow; a short line that names a real control ("nitrile gloves") does (messy
  // round 6, run 4: the first was taken and the second refused). Said the same on the page and before download.
  const OWN_POINTER = /^\s*(?:as per|see|refer(?:\s+to)?|same as|as for|as in|as above|as below|ditto)\b|\b(?:as per|same as|see|refer to|as in|as for)\s+(?:the\s+)?(?:step|item|line|above|below|previous|other)\b/i;
  const OWN_CONTROL_WORD = /\b(?:gloves?|glasses|goggles|face ?shields?|ear ?muffs?|ear ?plugs?|respirators?|masks?|P2|harness\w*|lanyards?|barri\w+|guards?|guardrails?|handrails?|extraction|vacuums?|shrouds?|spotters?|permits?|signs?|bunting|shoring|props?|scaffold\w*|platforms?|ladders?|lifters?|trolleys?|clamps?|tag ?lines?|isolat\w+|lock ?out|tag ?out|ventilat\w+|fans?|wet|covers?|screens?|boots|helmets?|hard ?hats?|hi-?vis|sunscreen|shade|water|exclusion|fire extinguishers?|spill kits?)\b/i;
  // What is wrong with one line of the user's own step, or '': kind is 'hazard' or 'control'.
  function ownLineProblem(text, kind) {
    const line = clean(text);
    const words = line ? line.split(' ').length : 0;
    if (notAnswer(line)) return notAnswer(line);
    if (kind === 'control' && OWN_POINTER.test(line)) return `"${line}" points to another step. Write the control itself on this line, for example "Wear nitrile gloves while priming". Each step prints on its own.`;
    const least = kind === 'control' ? (OWN_CONTROL_WORD.test(line) ? 2 : 3) : 2;
    return words < least ? `"${line}" is too short to act on.` : '';
  }

  const api = { hasBlank, isPlaceholder, leftOpen, cleanAnswer, fillLine, clean, NONE, NO_ANSWER, NOT_YET, notAnswer, fieldWeak, phoneNumber, licenceNeed, sameNameWarning, answerNeed, PEOPLE_FIELDS, fieldRule, SITE_NEED, SITE_NONE, designNeed, methodNeed, isMethod, sameDesignNumbers, AS_GIVEN, ownLineProblem };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteWriteGate = api;
})(typeof window !== 'undefined' ? window : globalThis);
