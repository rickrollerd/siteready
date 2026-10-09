// Blanks (____) and "To be completed" placeholders left in a SWMS, and filling a blank with the
// user's answer (goal 2: no download until the site questions are answered). A control line keeps
// its wording: only the blank is replaced by what the user wrote for it.

const BLANK_RUN = /_{3,}/g;
const hasBlank = (text) => /_{3,}/.test(String(text || ''));
// A field or line left as a placeholder: "To be completed before submitting for approval", or a
// label with one ("Muster point: To be completed"). "The permit is to be completed before work
// starts" is an instruction, not a placeholder.
const PLACEHOLDER = /^(?:[^:.]{1,60}:\s*)?(?:to be (?:completed|confirmed|advised)\b|tb[acd]\b)/i;
const isPlaceholder = (text) => PLACEHOLDER.test(String(text || '').trim());
const leftOpen = (text) => hasBlank(text) || isPlaceholder(text);

// The line a blank is filled in by: its text without the sources in brackets at the end, or the
// mark on a line of the user's own, so the same line is matched wherever it prints.
function blankKey(line) {
  let text = String(line || '').replace(/\s+/g, ' ').trim();
  for (let round = 0; round < 3 && text.endsWith(')'); round += 1) {
    let depth = 0;
    let at = -1;
    for (let i = text.length - 1; i >= 0; i -= 1) {
      if (text[i] === ')') depth += 1;
      else if (text[i] === '(' && (depth -= 1) === 0) { at = i; break; }
    }
    if (at <= 0 || hasBlank(text.slice(at)) || !hasBlank(text.slice(0, at))) break;
    text = text.slice(0, at).trim();
  }
  return text;
}

// The pieces of a line around its blanks, for the page to show a box in each blank.
const blankParts = (line) => blankKey(line).split(BLANK_RUN);

// An answer as it goes into the line: one line of text, without the full stop the line already has.
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

// The draft with the user's answers in its blanks. fills is { line key: [answer, ...] }. A line part
// filled has a key of its own for the blanks left, as the page shows it.
function withFills(draft, fills) {
  if (!draft || draft.kind !== 'draft' || !fills || typeof fills !== 'object') return draft;
  const fill = (line) => {
    let text = line;
    for (let round = 0; round < 5 && typeof text === 'string' && hasBlank(text) && Array.isArray(fills[blankKey(text)]); round += 1) {
      const next = fillLine(text, fills[blankKey(text)]);
      if (next === text) break;
      text = next;
    }
    return text;
  };
  return {
    ...draft,
    jobSteps: (draft.jobSteps || []).map((step) => ({ ...step, hazards: (step.hazards || []).map(fill), controls: (step.controls || []).map(fill) })),
    controls: (draft.controls || []).map((item) => (item && typeof item.text === 'string' ? { ...item, text: fill(item.text) } : item)),
  };
}

module.exports = { hasBlank, isPlaceholder, leftOpen, blankKey, blankParts, cleanAnswer, fillLine, withFills };
