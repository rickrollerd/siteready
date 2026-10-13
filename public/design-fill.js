// Designs given at the question that asks for them, and blanks in answers made plain (owner, 13 October
// 2026). Shared by the page and the server, as gate-rules.js is.
//
// D243: "I thought we could upload the drawings here so the rev numbers can be referenced and the
// sentence is populated." At each question whose standard answer refers to an engineer's design or
// drawing, the page shows that design's card (the same design row the designs table and the step lines
// use, designs.js: entered once). Its number and revision, typed once, fill the design blanks in the
// answer, and follow the design when it changes. SiteReady never reads the drawing. "Not issued yet"
// says so in the answer, as the hold point does in the steps. The blanks for people are left to fill.
//
// D241 and D245: "Needs to be in Bold RED ... the blank section with a warning so the user can see it
// easily and fill in the blanks." Each blank (____) left in an answer is named in a bold red warning
// under the box, for example "Fill in the blank: who checks and signs off the formwork before the pour."
(function (root) {
  // The question, and the design its answer refers to (designs.js KINDS).
  const QUESTION_DESIGNS = {
    formworkDesign: { id: 'formwork', label: 'Formwork design' },
    temporarySupport: { id: 'propping', label: 'Temporary works design (propping)' },
    loadLimits: { id: 'loadDrawing', label: 'Structural engineer\'s drawing for the load limits' },
    erectionSequence: { id: 'steelErection', label: 'Steel erection sequence and bracing design' },
    tierErection: { id: 'precast', label: 'Precast erection and bracing design' },
    excavationPlan: { id: 'excavation', label: 'Geotechnical design for the excavation' },
  };
  const designIds = () => Object.values(QUESTION_DESIGNS).map((item) => item.id);

  const clean = (value) => String(typeof value === 'string' ? value : '').replace(/\s+/g, ' ').trim();
  const revisionOf = (value) => clean(value).replace(/^(?:rev(?:ision)?\.?\s*)/i, '');
  // A design blank in a standard answer: "design ____ (revision ____)", "drawing ____".
  const DESIGN_BLANK = /\b(design|drawing) ____( \(revision ____\))?/g;
  const NOT_ISSUED = 'not issued yet: the work does not start until it is issued and this SWMS is updated';

  // What a design blank reads once the design is given, or null while there is nothing to fill it with.
  function phrase(word, withRevision, row) {
    const item = row || {};
    if (item.status === 'notIssued') return `${word} (${NOT_ISSUED})`;
    const number = clean(item.number);
    if (item.status !== 'given' || !number || /_{3,}/.test(number)) return null;
    const revision = revisionOf(item.revision);
    if (/_{3,}/.test(revision)) return null;
    if (withRevision) return `${word} ${number}${revision ? ` (revision ${revision})` : ''}`;
    return `${word} ${number}${revision ? ` rev ${revision}` : ''}`;
  }
  const blankOf = (word, withRevision) => `${word} ____${withRevision ? ' (revision ____)' : ''}`;

  // The answer with its design blanks filled from the design, and what was filled in, so the next
  // change of the design (a new revision, or "Not issued yet") replaces it. What was filled before goes
  // back to blanks first; words the user changed are left alone.
  function fillDesign(text, row, applied = []) {
    let out = String(text || '');
    for (const item of applied) {
      if (item && item.phrase && out.includes(item.phrase)) out = out.split(item.phrase).join(blankOf(item.word, item.withRevision));
    }
    const filled = [];
    out = out.replace(DESIGN_BLANK, (whole, word, revision) => {
      const withRevision = Boolean(revision);
      const said = phrase(word, withRevision, row);
      if (!said) return whole;
      if (!filled.some((item) => item.phrase === said)) filled.push({ word, withRevision, phrase: said });
      return said;
    });
    return { text: out, applied: filled };
  }
  // What an answer kept from before (a reopened SWMS) already has filled from the design.
  function filledFrom(text, row) {
    const out = [];
    for (const word of ['design', 'drawing']) {
      for (const withRevision of [true, false]) {
        const said = phrase(word, withRevision, row);
        if (said && String(text || '').includes(said) && !out.some((item) => item.phrase === said)) out.push({ word, withRevision, phrase: said });
      }
    }
    return out;
  }

  // What each blank in the standard answers is for: the words before and after it, and what to fill.
  const NAMED = [
    ['signed off by ____ before the pour', 'who checks and signs off the formwork before the pour'],
    ['installed and checked by ____ before loads are applied', 'who installs and checks the temporary supports before loads are applied'],
    ['checked by ____ before loading starts', 'who checks the loads before loading starts'],
    ['drawing ____ (', 'the drawing number'],
    ['(____ kPa)', 'the load limit in kPa'],
    ['rated for ____ t', 'the landing platform\'s rated load in tonnes'],
    ['load limits on drawing ____', 'the drawing number'],
    ['and ____ checks the structure is stable', 'who checks the structure is stable before each member is released'],
    ['checked by ____ before the hook is released', 'who checks each unit before the hook is released'],
    ['no steeper than ____,', 'the steepest batter angle'],
    ['traffic management plan (TMP) ____', 'the traffic management plan (TMP) number'],
    ['(revision ____)', 'its revision'],
    ['design ____', 'the design number'],
    ['drawing ____', 'the drawing number'],
  ].map(([words, what]) => { const [before, after] = words.split('____'); return { before, after, what }; })
    .sort((a, b) => (b.before.length + b.after.length) - (a.before.length + a.after.length));

  // Each blank left in an answer, named: from the list above, or by the words around it.
  function blankNames(text) {
    const value = String(text || '');
    const names = [];
    const pattern = /_{3,}/g;
    let match;
    while ((match = pattern.exec(value))) {
      const before = value.slice(0, match.index);
      const after = value.slice(match.index + match[0].length);
      const named = NAMED.find((item) => before.endsWith(item.before) && after.startsWith(item.after));
      if (named) { names.push(named.what); continue; }
      const lead = before.split(/\s+/).filter(Boolean).slice(-4).join(' ');
      const tail = after.split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
      names.push(`the blank in "${[lead, '____', tail].filter(Boolean).join(' ')}"`);
    }
    return names;
  }
  // The warning under the box, or '' when no blank is left.
  function blankWarning(text) {
    const names = blankNames(text);
    if (!names.length) return '';
    return `${names.length === 1 ? 'Fill in the blank' : 'Fill in the blanks'}: ${names.join('; ')}.`;
  }

  const api = { QUESTION_DESIGNS, designIds, fillDesign, filledFrom, blankNames, blankWarning, NOT_ISSUED };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteReadyDesignFill = api;
})(typeof window !== 'undefined' ? window : globalThis);
