// The brief the AI reads a safety data sheet's typed words with (owner, D256, 13 October 2026: each
// hazardous product's row filled from its SDS for the user to check). Only the PDF's text layer is
// sent, never an image (sds-read.js). Every value must be the SDS's own words; each is checked against
// the text before it is used, and one not found is left out.
// Change the brief only with the owner's approval, and raise SDS_BRIEF_VERSION when it changes.
const SDS_BRIEF_VERSION = 'sds m1';

const SDS_BRIEF = `You are given the typed words of a safety data sheet (SDS) for a product used in construction work (the text layer of a PDF). Copy these details from it, as written in the text:
- product: the product name (section 1).
- supplier: the company that makes or supplies the product, as named in section 1.
- issueDate: the SDS's issue or revision date, as written.
- hazards: each hazard statement (section 2), for example "H315 Causes skin irritation.". If the SDS says the product is not classified as hazardous, give that sentence as the only item.
- controls: each sentence in sections 7 and 8 on handling the product safely and the personal protective equipment to wear (eye, hand, skin and respiratory protection, ventilation).
- firstAid: each first aid instruction (section 4).
- storage: each instruction on storage (section 7) and on spills or accidental release (section 6).

Rules:
1. Copy each value exactly as it is written in the text, word for word. Do not reword, shorten, join, translate or correct it. Give a sentence in full; never cut it short or add "...".
2. Only words in the text. If something is not stated, leave it empty (an empty string or an empty list). Never guess, and never add advice of your own.
3. At most 8 items in each list: the ones that matter most to the person using the product on site.
4. Return the values in the JSON format given. No other commentary.`;

const text = { type: 'string' };
const list = { type: 'array', items: { type: 'string' } };
const SDS_SCHEMA = {
  type: 'object',
  properties: { product: text, supplier: text, issueDate: text, hazards: list, controls: list, firstAid: list, storage: list },
  required: ['product', 'supplier', 'issueDate', 'hazards', 'controls', 'firstAid', 'storage'],
  additionalProperties: false,
};

module.exports = { SDS_BRIEF, SDS_BRIEF_VERSION, SDS_SCHEMA };
