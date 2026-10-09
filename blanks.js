// Blanks (____) and "To be completed" placeholders left in a SWMS, and filling a blank with the
// user's answer (goal 2: no download until the site questions are answered). A control line keeps
// its wording: only the blank is replaced by what the user wrote for it.

// The rules for a blank or placeholder, and filling a blank, are shared with the page (public/gate-rules.js).
const { hasBlank, isPlaceholder, leftOpen, cleanAnswer, fillLine } = require('./public/gate-rules');

const BLANK_RUN = /_{3,}/g;

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
