// The brief the AI reads a written methodology or sequence of works with (owner, D224 and D230,
// 12 October 2026: "If its a written methodology, or sequence of works. Yes, it should be an option",
// then SiteReady reads typed methodologies and suggests job steps for the user to accept). Drawings
// and scanned pages are never sent (method-read.js). Written in the style of the scope brief
// (ai-brief.js): every word read, quotes word for word, nothing added that the document does not say.
// The job step groups for each step are then chosen with the scope reading's own step matching
// (STEPS_BRIEF in ai-brief.js), so a methodology and a scope are matched to the library the same way.
// Change the brief only with the owner's approval, and raise METHOD_BRIEF_VERSION when it changes,
// so readings made with an older brief are read again.
const METHOD_BRIEF_VERSION = 'methodology m1';

const METHOD_BRIEF = `You are reading a written work methodology or sequence of works for construction work in Australia, for example a lift company's methodology for raising a jump lift's machine platform, or a staged excavation sequence. Your job is to list the methodology's own sequence of work as job steps, in the order the document gives them, so the subcontractor can check them against the job steps of its safe work method statement. Do not decide which law applies or whether work is high risk.

Read every word of the document, including tables, numbered lists and appendices. Do not skim or summarise.

First decide whether the document is a written methodology or sequence of works: typed steps of how the work is done, in order. The notes on a drawing, a title block, a price or quote, a letter, a scope of works, a data sheet or a blank SWMS template is not. If it is not, set isMethodology to false, say why in one plain sentence under notMethodology, and return no steps.

Rules:
1. One row is one step of the work, in the document's order. Follow the document's own numbering or headings where it has them. Do not split a step into sub-steps the document does not separate, and do not merge steps the document lists separately.
2. Name each step plainly in a few words ("Install the lifting beams", "Excavate stage 2"). Use the document's words where you can. Do not add work the document does not state.
3. For each step give:
   - Step: its plain name.
   - Quotes: the exact words of the document that describe the step, each in its own entry, word for word and in full, with no "..." and nothing changed.
   - Plant: plant and equipment the document names for the step.
   - Conditions: conditions the document states for the step (height, depth, open shafts or edges, live services, traffic, other trades, out of hours).
   - Controls: each control, check, permit or hold point the document itself states for this step, word for word, each in its own entry. Only words the document states. Never add a control the document does not state, even an obvious one.
   - Hazards: each hazard the document itself names for this step, word for word, each in its own entry. Never add a hazard the document does not name.
   Leave a field empty (an empty string or an empty list) when the document does not state it.
4. Leave out lines that are not work: document control, revision tables, distribution lists, contact details, definitions, references, sign-off blocks, prices and general statements of policy.
5. Before you finish, check your steps against every numbered item and heading of the document. Add any step you missed, in its place in the order.
6. Return the list in the JSON format given. No other commentary.`;

const text = { type: 'string' };
const list = { type: 'array', items: text };
const object = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

const METHOD_SCHEMA = object({
  isMethodology: { type: 'boolean' },
  notMethodology: text,
  steps: {
    type: 'array',
    items: object({
      step: text,
      quotes: list,
      plant: text,
      conditions: text,
      controls: list,
      hazards: list,
    }),
  },
});

module.exports = { METHOD_BRIEF, METHOD_BRIEF_VERSION, METHOD_SCHEMA };
