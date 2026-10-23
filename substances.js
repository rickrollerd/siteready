// Hazardous substances product by product (owner, 13 October 2026: "hazardous substances needs to be
// individualised and the controls for each in the swms"; D256, D257). The SWMS used to print each type
// of substance the work uses with the product name left blank and "Yes / No" for the safety data
// sheet. Now the user adds each product used, from its safety data sheet (SDS): attached and read for
// its typed words (sds-read.js), or typed from it. The rules shared with the page are in
// public/substance-rules.js.
//
// What prints, once the user has added a product:
// - The substances table: one row a product, with its hazards, its Controls (the PPE and controls its
//   SDS sets out), first aid, storage and spills, and the SDS's issue date. A type with no product
//   does not print: it stays a prompt on the page.
// - One line in the step that uses it, naming the product and its controls. The step is the one
//   whose name or lines already name the product's type (register.js), or the one the user chose.
// D181: the controls are the SDS's own words (read word for word, or typed by the user from it).
//
// The download waits until each product listed is complete and ticked as matching its SDS, and each
// type SiteWrite suggests has a product or is ticked "Not required" (download-gate.js, D277). A SWMS with no product added prints and checks as before, apart from the old
// table of types, which no longer prints.
const rules = require('./public/substance-rules');
const { controlLevel, withoutCitation } = require('./control-level');
const { dateText } = require('./designs');

const ID = /^sub-\d{1,2}$/;
const FILE_ID = /^df_[A-Za-z0-9_-]{16,64}$/;

// The products the user listed, as sent: [{ id, type, product, ..., file?, read?, confirmed }].
const listed = (input) => (Array.isArray(input && input.substances) ? input.substances.filter((row) => row && typeof row === 'object' && ID.test(String(row.id || ''))) : []);

// A product's file and what was read from its SDS, as kept with the row.
function fileOf(row) {
  const file = row.file && typeof row.file === 'object' && FILE_ID.test(String(row.file.id || '')) ? row.file : null;
  return file ? { id: file.id, name: rules.clean(file.name), type: rules.clean(file.type), size: Number(file.size) || 0 } : null;
}
const READ_FIELDS = ['product', 'supplier', 'hazards', 'controls', 'firstAid', 'storage', 'sdsDate'];
function readOf(row) {
  const fields = row.read && Array.isArray(row.read.fields) ? READ_FIELDS.filter((key) => row.read.fields.includes(key)) : [];
  return fields.length ? { fields } : null;
}

const same = (line) => String(line || '').replace(/\s+/g, ' ').trim().toLowerCase();
// A polyurethane or isocyanate product, by its name, type or SDS words (diisocyanates, H334 sensitisation).
const ISOCYANATE = /\b(polyurethanes?|isocyanates?|diisocyanates?|PU\b|MDI|HDI|TDI|H334|two[- ]pack|2[- ]pack)\b/i;
const RANK = { Eliminate: 0, Substitute: 1, 'Isolate or engineer': 2, Administrative: 3, PPE: 4 };
const rank = (line) => RANK[controlLevel(line)] ?? 3;

// The draft with its products: each product's row in draft.substances.products (with the step it goes
// in and what it still needs), and its line in that step, placed after the step's lines of the same
// level so the controls stay in hierarchy order. The lines are listed in step.substanceLines, so the
// page shows them as coming from the substances table. A draft with no product listed is unchanged.
function withSubstances(draft, input, today = new Date()) {
  if (!draft || draft.kind !== 'draft' || !Array.isArray(draft.jobSteps)) return draft;
  const rows = listed(input);
  if (!rows.length) return withReasons(draft, input);
  const steps = draft.jobSteps;
  const products = rows.map((raw) => {
    const row = rules.rowOf(raw);
    const step = rules.stepOf(row, steps);
    const file = fileOf(raw);
    const read = readOf(raw);
    return {
      ...row,
      matched: rules.matchStep(row.type, steps),
      step,
      line: step ? rules.stepLine(row) : '',
      need: rules.substanceNeed(row, step),
      old: rules.sdsOld(row.sdsDate, today),
      ...(file ? { file } : {}),
      ...(read ? { read } : {}),
    };
  });
  // The lines of an answer to the old "Safety data sheet" question stay in a step until a product is
  // placed in it; then the product's own SDS controls replace them (owner, D282).
  const answered = new Set(require('./draft').sdsAnswerLines(input && input.facts).map(same));
  const jobSteps = steps.map((step) => {
    const lines = [...new Set(products.filter((item) => item.line && item.step === step.step).map((item) => item.line))];
    if (!lines.length) return step;
    const controls = step.controls.filter((line) => !answered.has(same(withoutCitation(line))));
    for (const line of lines) {
      const level = rank(line);
      const after = controls.reduce((last, other, i) => (rank(other) <= level ? i : last), -1);
      controls.splice(after + 1, 0, line);
    }
    return { ...step, controls, substanceLines: lines };
  });
  return withReasons({ ...draft, jobSteps, substances: { ...(draft.substances || { items: [], note: '' }), products } }, input);
}

// The types ticked "Not required" with the reason the user gave (D292 item 3), which print in the
// substances section: [{ type, reason }]. A type ticked with no reason prints nothing, as before.
function withReasons(draft, input) {
  const why = (input && input.substancesNotUsedWhy) || {};
  const notUsed = new Set(Array.isArray(input && input.substancesNotUsed) ? input.substancesNotUsed : []);
  const suggested = ((draft.substances && draft.substances.items) || []).map((item) => item.product);
  const notRequired = suggested.filter((type) => notUsed.has(type) && rules.clean(why[type])).map((type) => ({ type, reason: rules.clean(why[type]) }));
  if (!notRequired.length) return draft;
  return { ...draft, substances: { ...(draft.substances || { items: [], note: '' }), notRequired } };
}
// The printed line for the types not required, with their reasons, or ''.
const NOT_REQUIRED_HEAD = 'Not required on this job';
function notRequiredLine(draft) {
  const list = (draft && draft.substances && draft.substances.notRequired) || [];
  return list.length ? `${NOT_REQUIRED_HEAD}: ${list.map((item) => `${item.type} (${item.reason.replace(/[.;]+$/, '')})`).join('; ')}.` : '';
}

// The steps without the polyurethane (isocyanate) lines where every product the user listed for that step
// is another kind, such as an acrylic or silicone sealant (messy round 4). Run before the step PPE is
// worked out, so no PPE is read from a line that does not print. Steps with no product are unchanged.
function withProductKindLines(steps, input) {
  const rows = listed(input).map(rules.rowOf).filter((row) => row.product && !rules.isOpen(row.product) && row.controls.length);
  if (!rows.length || !Array.isArray(steps)) return steps;
  return steps.map((step) => {
    const named = rows.filter((row) => rules.stepOf(row, steps) === step.step);
    if (!named.length || named.some((row) => ISOCYANATE.test([row.product, row.type, ...row.hazards, ...row.controls].join('\n')))) return step;
    const fits = (line) => !ISOCYANATE.test(typeof line === 'string' ? line : '');
    return { ...step, hazards: (step.hazards || []).filter(fits), controls: (step.controls || []).filter(fits) };
  });
}

// The products that print: those with a name (a type with no product never prints).
const printed = (draft) => ((draft && draft.substances && draft.substances.products) || []).filter((row) => row.product && !rules.isOpen(row.product));

// The printed table: each product with its type, supplier and quantity; its hazards; its Controls;
// first aid; storage and spills; and its SDS. Where its SDS gives nothing for a column, the column
// says which section of the SDS to read. Rows as text, for the Word file, the PDF and the page.
const TABLE_TITLE = 'Hazardous substances';
const TABLE_HEAD = ['Product', 'Hazards', 'Controls', 'First aid', 'Storage and spills', 'Safety data sheet'];
const TABLE_NOTE = 'Each product used, with the controls from its own safety data sheet (SDS). Keep each product\'s current SDS at the work area, and label every container, including anything decanted.';
const orSection = (lines, section) => (lines.length ? lines.map(rules.tableLine).join('\n') : `See its safety data sheet, ${section}.`);
function tableRows(draft) {
  return printed(draft).map((row) => [
    [rules.tableLine(row.product), row.type, row.supplier ? `Supplier: ${row.supplier}` : '', row.quantity ? `Quantity: ${row.quantity}` : ''].filter(Boolean).join('\n'),
    orSection(row.hazards, 'section 2'),
    orSection(row.controls, 'section 8'),
    orSection(row.firstAid, 'section 4'),
    orSection(row.storage, 'sections 6 and 7'),
    [rules.dateOf(row.sdsDate) ? `Issued ${dateText(row.sdsDate)}.` : '', row.file ? `A copy is attached to this SWMS in SiteWrite (${row.file.name || 'file'}).` : ''].filter(Boolean).join('\n'),
  ]);
}

// What each product still needs before download, for download-gate.js: { id, label, need }.
function gateItems(draft) {
  return ((draft && draft.substances && draft.substances.products) || []).map((row) => ({
    id: row.id,
    label: `Hazardous substance: ${row.product && !rules.isOpen(row.product) ? row.product : row.type ? `a ${rules.SHORT.get(row.type).toLowerCase()}` : 'a product'}`,
    need: row.need,
  }));
}

// Each type SiteWrite suggests for the work (register.js) must have a product listed or be ticked "Not
// used on this job" before download (owner, D277: "Must add or tick"): { type, short, need }. A ticked
// type prints nothing. A product of the type, even one still being filled in, covers it: the product
// has its own item.
const TYPE_NEED = (short) => `${short}: add the product you use, or tick "Not required".`;
// "Not required" for a type the user's own task or answers name needs a short reason (owner, D292 item 3).
// The old safety data sheet answer, while no product is listed (D277 item 3).
// It prints whether or not products are listed, so it conflicts either way (messy round 7: sealant "Not
// required" was taken beside an SDS answer naming fire sealant, once another product was listed).
const sdsAnswer = (input) => (input && input.facts && typeof input.facts.safetyDataSheet === 'string' ? input.facts.safetyDataSheet : '');
function typeItems(draft, input) {
  if (!draft || draft.kind !== 'draft' || !draft.substances) return [];
  const notUsed = new Set(Array.isArray(input && input.substancesNotUsed) ? input.substancesNotUsed : []);
  const why = (input && input.substancesNotUsedWhy) || {};
  const words = rules.ownWords(input);
  const covered = new Set(rules.TYPES.filter((type) => listed(input).some((row) => rules.coversType(row, type))));
  return (draft.substances.items || []).map((item) => item.product).filter((type) => rules.TYPES.includes(type))
    .map((type) => ({ type, n: rules.TYPES.indexOf(type), need: covered.has(type) ? '' : notUsed.has(type) ? rules.notUsedNeed(type, why[type], words, rules.stepWords(draft), sdsAnswer(input), rules.cutStep(draft), draft) : TYPE_NEED(rules.SHORT.get(type)) }));
}

// The SDS files a SWMS input refers to, kept with the saved SWMS as design files are (design-files.js).
function fileIds(input) {
  return [...new Set(listed(input).map(fileOf).filter(Boolean).map((file) => file.id))];
}

module.exports = { withProductKindLines, withSubstances, tableRows, gateItems, typeItems, TYPE_NEED, fileIds, printed, notRequiredLine, NOT_REQUIRED_HEAD, TABLE_TITLE, TABLE_HEAD, TABLE_NOTE };
