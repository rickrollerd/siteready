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
    // Details read from the drawing fill the answer once the user ticks that they match it (D250).
    if (item.read && Array.isArray(item.read.fields) && item.read.fields.length && item.read.checked !== true) return null;
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
    ['signed off by ____ before the pour', 'who checks and signs off the formwork before the pour', 'who signs off'],
    ['installed and checked by ____ before loads are applied', 'who installs and checks the temporary supports before loads are applied', 'who installs and checks'],
    ['checked by ____ before loading starts', 'who checks the loads before loading starts', 'who checks'],
    ['drawing ____ (', 'the drawing number', 'drawing number'],
    ['(____ kPa)', 'the load limit in kPa', 'load limit (kPa)'],
    ['rated for ____ t', 'the landing platform\'s rated load in tonnes', 'rated load (tonnes)'],
    ['load limits on drawing ____', 'the drawing number', 'drawing number'],
    ['and ____ checks the structure is stable', 'who checks the structure is stable before each member is released', 'who checks'],
    ['checked by ____ before the hook is released', 'who checks each unit before the hook is released', 'who checks'],
    ['no steeper than ____,', 'the steepest batter angle', 'batter angle'],
    ['traffic management plan (TMP) ____', 'the traffic management plan (TMP) number', 'TMP number'],
    ['(revision ____)', 'its revision', 'revision'],
    ['design ____', 'the design number', 'design number'],
    ['drawing ____', 'the drawing number', 'drawing number'],
  ].map(([words, what, label]) => { const [before, after] = words.split('____'); return { before, after, what, label }; })
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
  // A short label for each blank in an answer, for its fill-in box (D261): "drawing number",
  // "revision", "who checks". From the words around it, so any standard answer gets one.
  const UNIT_LABELS = [[/^\s?kPa\b/, 'kPa'], [/^\s?Pa\b/, 'Pa'], [/^\s?kN\b/, 'kN'], [/^\s?(?:t|tonnes?)\b/, 'tonnes'], [/^\s?mm\b/, 'mm'], [/^\s?(?:m|metres?)\b/, 'metres'], [/^\s?months?\b/, 'months'], [/^\s?(?:%|per ?cent)/, 'per cent'], [/^\s?degrees?\b/, 'degrees']];
  const NUMBERED = /\b(revision|rev|permit|report|letter|document|drawing|design|certificate|plan(?: \(TMP\))?|TMP|TGS|job|order|reference)\s*$/i;
  const WHO = { checked: 'who checks', approved: 'who approves', installed: 'who installs', tested: 'who tests', trained: 'who trains', serviced: 'who services', designed: 'who designs', inspected: 'who inspects', rated: 'who rates', erected: 'who erects', supervised: 'who supervises', issued: 'who issues', prepared: 'who prepares', signed: 'who signs off', off: 'who signs off', made: 'who makes', done: 'who does', lowered: 'who lowers', given: 'who gives' };
  const PLACE_WORDS = [[/\bbecause\s*$|\bbut\s*$/i, 'reason'], [/\bwindow of\s*$/i, 'time window'], [/\bclassified as\s*$/i, 'classification'], [/\btaken (?:only )?to\s*$/i, 'where it goes'], [/\b(?:kept|stored)(?: only)? at\s*$|\bfixed at\s*$|\bat\s*$/i, 'where'], [/\bcovered with\s*$/i, 'cover'], [/\bmats of\s*$/i, 'mat size'], [/\bno steeper than\s*$/i, 'batter angle'], [/\bunder\s*$/i, 'plan'], [/\bRescue:\s*$/i, 'rescue method'], [/\bproducts used are\s*$/i, 'product names'], [/\bengineer\s*$/i, 'engineer\'s name'], [/\banchors\s*$/i, 'anchor type and location'], [/\bpropping\s*$/i, 'how many levels']];
  function blankLabel(before, after) {
    const named = NAMED.find((item) => item.label && before.endsWith(item.before) && after.startsWith(item.after));
    if (named) return named.label;
    const lead = before.split(/_{3,}/).pop().replace(/[^\w\s'-]/g, ' ').split(/\s+/).filter((word) => word && !/^(?:the|a|an|of|to|is|are|and|or|for|with|on|in|at|least|than)$/i.test(word)).slice(-2).join(' ').toLowerCase();
    for (const [pattern, label] of UNIT_LABELS) {
      if (!pattern.test(after)) continue;
      // A pressure or load: "test pressure (kPa)", "bearing pressure (kPa)".
      if (/^(?:kPa|Pa|kN)$/.test(label)) return /\btest\w*\b/i.test(before) ? `test pressure (${label})` : lead ? `${lead} (${label})` : label;
      return label;
    }
    // "by ____ (licensed electrician)": the words in brackets say who, or what.
    const said = /^\s?\(([^()_]{3,60})\)/.exec(after);
    const brackets = said ? said[1].split(/,| such as /)[0].trim() : '';
    const numbered = NUMBERED.exec(before);
    if (numbered) return /^rev/i.test(numbered[1]) ? 'revision' : `${numbered[1].replace(/^plan \(TMP\)$/i, 'TMP')} number`.replace(/^(\w)/, (letter) => letter.toLowerCase()).replace(/^tmp/, 'TMP').replace(/^tgs/, 'TGS');
    const by = /\b(\w+)(?: off)? by\s*$/i.exec(before);
    if (by) {
      const who = WHO[by[1].toLowerCase()] || (/\boff by\s*$/i.test(before) ? 'who signs off' : 'who');
      return brackets && brackets.length <= 30 ? `${who} (${brackets})` : who;
    }
    if (brackets && brackets.length <= 30) return brackets;
    for (const [pattern, label] of PLACE_WORDS) if (pattern.test(before)) return label;
    // "The ____ system": the word after it.
    if (/\b(?:the|a|an)\s*$/i.test(before)) { const next = /^\s*([A-Za-z][\w-]*)/.exec(after); if (next) return next[1].toLowerCase(); }
    const words = before.replace(/[^\w\s'-]/g, ' ').split(/\s+/).filter((word) => word && !/^(?:the|a|an|of|to|is|are|and|or|for|with|on|in)$/i.test(word));
    return words.slice(-2).join(' ').toLowerCase() || 'fill in';
  }
  function blankLabels(text) {
    const value = String(text || '');
    const out = [];
    const pattern = /_{3,}/g;
    let match;
    while ((match = pattern.exec(value))) out.push(blankLabel(value.slice(0, match.index), value.slice(match.index + match[0].length)));
    return out;
  }

  // The warning under the box, or '' when no blank is left: each blank once, by its label (messy round
  // 4, run 7: the blanks were named by overlapping runs of the words around them), and an answer typed
  // in a blank that is no answer yet ("dont no", "TBC") called out.
  const HELD = /\b(?:(?:i )?(?:dont|don't|don’t|do not) (?:know|no)|dunno|not sure|no idea|tb[acd])\b/i;
  const UNITS = new Set(UNIT_LABELS.map(([, label]) => label));
  // Each blank's name for the warning: the full name from the list above, else its box's label, with
  // the words before it for a bare unit ("exclusion zone (metres)").
  function warningNames(text) {
    const value = String(text || '');
    const out = [];
    const pattern = /_{3,}/g;
    let match;
    while ((match = pattern.exec(value))) {
      const before = value.slice(0, match.index);
      const after = value.slice(match.index + match[0].length);
      const named = NAMED.find((item) => before.endsWith(item.before) && after.startsWith(item.after));
      if (named) { out.push(named.what); continue; }
      const label = blankLabel(before, after);
      const lead = before.split(/_{3,}/).pop().replace(/[^\w\s'-]/g, ' ').split(/\s+/).filter((word) => word && !/^(?:the|a|an|of|to|is|are|and|or|for|with|on|in|at|least|than)$/i.test(word)).slice(-2).join(' ').toLowerCase();
      out.push(UNITS.has(label) && lead ? `${lead} (${label})` : label);
    }
    return out;
  }
  function blankWarning(text) {
    const labels = warningNames(text);
    if (!labels.length) return '';
    const counts = new Map();
    for (const label of labels) counts.set(label, (counts.get(label) || 0) + 1);
    const names = [...counts].map(([label, count]) => (count > 1 ? `${label} (${count} blanks)` : label));
    const held = HELD.exec(String(text || ''));
    return `${labels.length === 1 ? 'Fill in the blank' : 'Fill in the blanks'}: ${names.join('; ')}.${held ? ` "${held[0]}" is not an answer: put in what applies on this job.` : ''}`;
  }

  const api = { QUESTION_DESIGNS, designIds, fillDesign, filledFrom, blankNames, blankLabels, blankWarning, NOT_ISSUED };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteReadyDesignFill = api;
})(typeof window !== 'undefined' ? window : globalThis);
