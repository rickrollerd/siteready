// The brief the AI reads a design drawing's typed words with (owner, D249 and D250, 13 October 2026:
// the design card fills itself from the drawing's title block). Only the PDF's text layer is sent, never
// the drawing image (design-read.js). Every value must be the drawing's own words; each is checked
// against the text before it is used, and one not found is left empty.
// Change the brief only with the owner's approval, and raise DESIGN_BRIEF_VERSION when it changes.
const DESIGN_BRIEF_VERSION = 'design m1';

const DESIGN_BRIEF = `You are given the typed words of a construction design drawing or design document (the text layer of a PDF, usually its title block and notes). Find these details of the design, as written in the text:
- title: the drawing or document title.
- by: who prepared it: the engineering firm or designer named in the title block (not the client, the builder or the project).
- number: the drawing or document number.
- revision: the current revision (the latest one, where a revision table lists several), without the word "revision" or "rev".
- date: the date of that revision, or the drawing's date if no revision date is shown.

Rules:
1. Copy each value exactly as it is written in the text, character for character. Do not reformat, expand, translate or correct it.
2. If a value is not clearly stated, or you are not sure which of several it is, leave it as an empty string. Never guess.
3. Return the values in the JSON format given. No other commentary.`;

const text = { type: 'string' };
const DESIGN_SCHEMA = {
  type: 'object',
  properties: { title: text, by: text, number: text, revision: text, date: text },
  required: ['title', 'by', 'number', 'revision', 'date'],
  additionalProperties: false,
};

module.exports = { DESIGN_BRIEF, DESIGN_BRIEF_VERSION, DESIGN_SCHEMA };
