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
    if (rule.emergency) {
      if (NO_ANSWER.test(text)) return `${quoted} is not an answer here: this SWMS involves ${rule.involves}. ${rule.ask}`;
      return leftOpen(text) || NOT_YET.test(text) ? `${quoted} is not an answer yet. ${rule.ask}` : '';
    }
    if (leftOpen(text) || NOT_YET.test(text)) return `${quoted} is not an answer yet. ${rule.ask}`;
    if (NONE.test(text) && !rule.none) return `${rule.name} cannot be ${quoted}: every SWMS names it. ${rule.ask}`;
    return '';
  }

  // What the user types that the SWMS prints as given and reads for nothing else: the people and
  // place boxes, the emergency answers and the words typed in a control line's blanks. Changing one
  // of these needs no new draft: the download sends them as they are now. Any other change (a site
  // question, an answer to a question about the work, the state) can change the hazards and job
  // steps, so the draft is prepared again first (test/live-gate.test.js checks this list).
  const AS_GIVEN = ['workplace', 'principalContractor', 'complianceResponsible', 'reviewer', 'scaffoldSupervisor', 'firstAider', 'musterPoint',
    'siteManager', 'worksManager', 'worksManagerPhone', 'hospital', 'reviewDate', 'preparedBy', 'swmsRef', 'emergency', 'fills'];

  const api = { hasBlank, isPlaceholder, leftOpen, cleanAnswer, fillLine, clean, NONE, NO_ANSWER, NOT_YET, answerNeed, AS_GIVEN };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteReadyGate = api;
})(typeof window !== 'undefined' ? window : globalThis);
