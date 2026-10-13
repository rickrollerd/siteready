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
  const CALLS = /\b(?:000|triple zero|112|emergency services|ambulance|paramedics|fire brigade|fire service|fire and rescue|qfes|frnsw|ses)\b/i;
  const RESCUES = /\b(?:rescu\w*|lift\w*|lower\w*|bring\w*|brought|pull\w*|retriev\w*|reach\w*|winch\w*|harness\w*|ewps?|ladders?|lines?|poles?|isolat\w*|stand-?by|spotters?|crew|workers?|supervisors?|operators?|first aiders?|trained|observers?|tripods?|descend\w*|get\w* (?:them|the person) out)\b/i;
  const onlyCalls = (text) => CALLS.test(text) && !RESCUES.test(text);
  const RESCUE_KIT = /\b(?:harness\w*|lines?|ropes?|tripods?|winch\w*|ladders?|ewps?|elevating work platforms?|poles?|descenders?|stretchers?|spinal boards?|rescue kits?|lifelines?|davits?|hoists?|retrieval|hooks?|mats?|insulated|lv rescue|low voltage rescue)\b/i;

  // Why an answer is not enough, or '' when it passes. rule is what the gate asks of it:
  // { ask, name?, none?, optional?, emergency?, involves?, blank?, line? }
  // - ask: what is needed, in plain words; name: the question's name in a refusal.
  // - none: "None" or "Not applicable" is accepted. optional: may be left empty, but not as a placeholder.
  // - emergency: an emergency question, which only asks about work the SWMS involves (involves).
  // - blank: an answer that must have no blank (____) left in it.
  // - line: a control line with blanks; value is the answers typed in its blanks, in order.
  function answerNeed(rule, value) {
    if (rule.line) return hasBlank(fillLine(rule.line, Array.isArray(value) ? value : [])) ? rule.ask : '';
    if (rule.blank) return hasBlank(value) ? rule.ask : '';
    const text = clean(value);
    const quoted = `"${text.slice(0, 60)}"`;
    if (rule.optional) return text && leftOpen(text) ? `${quoted} is not an answer. Fill it in, or leave the box empty.` : '';
    if (!text) return rule.ask;
    if (leftOpen(text) || NOT_YET.test(text) || DONT_KNOW.test(text)) return `${quoted} is not an answer yet. ${rule.ask}`;
    if (PRONOUN.test(text)) return `${quoted} does not say who. Name the role, for example "The site supervisor". ${rule.ask}`;
    if (AS_PER.test(text)) return `${quoted} does not say what is done. Write it here in a few words. ${rule.ask}`;
    if (rule.emergency) {
      if (NO_ANSWER.test(text)) return `${quoted} is not an answer here: this SWMS involves ${rule.involves}. ${rule.ask}`;
      if (rule.rescue && onlyCalls(text)) return `${quoted} only calls for help. Say who rescues the person and how, before emergency services arrive.`;
      if (rule.kit && /\bfirst aid\b/i.test(text) && !RESCUE_KIT.test(text)) return `${quoted} is first aid, not rescue equipment. Say what is used to get the person out, and where it is kept.`;
      // One word ("builder", "gate", "spotter") does not tell the crew what to do.
      if (!/\s/.test(text)) return `${quoted} is too short to act on. ${rule.ask}`;
      return '';
    }
    if (NONE.test(text) && !rule.none) return `${rule.name} cannot be ${quoted}: every SWMS names it. ${rule.ask}`;
    return '';
  }

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

  // What the user types that the SWMS prints as given and reads for nothing else: the people and
  // place boxes, the emergency answers and the words typed in a control line's blanks. Changing one
  // of these needs no new draft: the download sends them as they are now. Any other change (a site
  // question, an answer to a question about the work, the state) can change the hazards and job
  // steps, so the draft is prepared again first (test/live-gate.test.js checks this list).
  const AS_GIVEN = ['workplace', 'principalContractor', 'complianceResponsible', 'reviewer', 'scaffoldSupervisor', 'firstAider', 'musterPoint',
    'siteManager', 'worksManager', 'worksManagerPhone', 'hospital', 'reviewDate', 'preparedBy', 'swmsRef', 'emergency', 'fills'];

  const api = { hasBlank, isPlaceholder, leftOpen, cleanAnswer, fillLine, clean, NONE, NO_ANSWER, NOT_YET, answerNeed, designNeed, methodNeed, isMethod, sameDesignNumbers, AS_GIVEN };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteReadyGate = api;
})(typeof window !== 'undefined' ? window : globalThis);
