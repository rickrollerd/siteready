// Hazardous substances product by product (owner, 13 October 2026, feedback item 22: "hazardous
// substances needs to be individualised and the controls for each in the swms"; D256, D257). Shared
// by the page and the server, as gate-rules.js is.
//
// SiteReady lists the types of substance the work usually uses (cement, curing compounds and so on)
// as prompts. The user adds each product used: they attach its safety data sheet (SiteReady reads its
// typed words, sds-read.js) or type its details, then tick that the row matches the SDS. Only products
// print: never a type without a product. Each product's controls print in the Controls column of the
// substances table, and the step that uses it gets one line naming it (substances.js). The step is the
// one whose name or lines already name the product's type, or the one the user chooses.
//
// D181: what prints for a product comes from its SDS (the words read from it, each found word for
// word in its text, or typed by the user from it). SiteReady writes no control of its own here.
(function (root) {
  // The types of substance that commonly come with the work, found in the task, the hazards and the
  // step names (register.js substancesFor). short: the type in a step line ("Curing compound or
  // release agent (Product X): ...").
  const SUBSTANCES = [
    ['Paints and coatings', /(?<!once )\b(paint\w*|coatings?|enamels?)\b/i, 'Paint or coating'],
    ['Solvents and thinners', /\b(solvents?|thinners?|turps)\b/i, 'Solvent or thinner'],
    ['Adhesives', /\b(adhesives?|glues?|vinyl|carpet)\b/i, 'Adhesive'],
    ['Wood dust (MDF and hardwood)', /\b(mdf|particleboard|wood dust|sawdust|(?:cut|saw|sand|rout|machin)\w* [^.\n]{0,30}\b(?:timber|wood|hardwood|mdf|joinery))\b/i, 'Board or timber product'],
    ['Sealants, mastics and silicone', /\b(sealants?|mastics?|silicone)\b/i, 'Sealant'],
    ['Waterproofing membranes and primers', /\b(waterproofing membranes?|liquid membranes?|torch-on|membrane (?:primers?|rolls?)|apply\w* [^.]{0,40}membranes?|waterproof(?:ing)? (?:to|the|wet|balcon))/i, 'Waterproofing product'],
    ['Epoxy, resins and two-part products', /\b(epoxy|resins?|two-part|two part|2-pack)\b/i, 'Epoxy or resin'],
    ['Cement, concrete, grout and mortar', /\b(cement|wet concrete|concrete (?:pour|plac|finish|truck)\w*|pour\w*|grout|mortar|render|core fill\w*)\b/i, 'Cement product'],
    ['Plaster, jointing and setting compounds', /\b(plaster\w*|jointing|setting compounds?|set(?:ting)? and sand\w*)\b/i, 'Plaster or setting compound'],
    ['Synthetic mineral fibres (insulation)', /\b(insulation(?! boards?)(?!,? where)|glasswool|glass wool|batts|rockwool)\b/i, 'Insulation'],
    ['Curing compounds and form release agents', /\b(curing compounds?|cur(?:e|ing) (?:the )?concrete|form oil|release agents?)\b/i, 'Curing compound or release agent'],
    ['Respirable crystalline silica (concrete, masonry, tile and stone dust)', /\bsilica\b/i, 'Product with crystalline silica'],
    ['PVC primer and solvent cement', /\b(solvent cement|pvc primer)\b/i, 'PVC primer or solvent cement'],
    ['Fuels (diesel, petrol)', /\b(diesel|petrol|fuel\w*|refuel\w*|generators?|chainsaws?|excavators?)\b/i, 'Fuel'],
    ['Gases (LPG, acetylene, oxygen)', /\b(lpg|acetylene|oxy-\w*|oxyacetylene|gas cylinders?|brazing|gas torch\w*|torch-on)\b/i, 'Gas'],
    ['Refrigerants', /\brefrigerants?\b/i, 'Refrigerant'],
    ['Cleaning chemicals', /\b(cleaning chemicals?|detergents?|acid wash\w*|cleaning products?)\b/i, 'Cleaning chemical'],
    ['Herbicides and termiticides', /\b(herbicides?|termiticides?|termite treatment|weed ?killers?|treat\w* the ground)\b/i, 'Herbicide or termiticide'],
    ['Bitumen and asphalt', /\b(bitumen|asphalt|hot mix)\b/i, 'Bitumen product'],
  ];
  // Products named in control lines. These are matched only on product names, so a control that says
  // to keep clear of something does not list it.
  const CONTROL_PRODUCTS = {
    'Paints and coatings': /\btouch-up paint\b/i,
    'Adhesives': /\badhesives?\b/i,
    'Sealants, mastics and silicone': /\b(sealants?|mastics?)\b/i,
    'Epoxy, resins and two-part products': /\b(epoxy|jointing resins?|resins?)\b/i,
    'Cement, concrete, grout and mortar': /\b(cement-based|cementitious|grout|mortar|wet concrete)\b/i,
    'Gases (LPG, acetylene, oxygen)': /\b(lpg|gas torch\w*|acetylene)\b/i,
    'Respirable crystalline silica (concrete, masonry, tile and stone dust)': /\b(?:respirable crystalline silica|silica dust)\b/i,
  };
  const TYPES = SUBSTANCES.map(([label]) => label);
  const SHORT = new Map(SUBSTANCES.map(([label, , short]) => [label, short]));

  const clean = (value) => String(typeof value === 'string' ? value : '').replace(/\s+/g, ' ').trim();
  // A list typed one item a line, or kept as a list: each item on its own, without empty ones.
  const linesOf = (value) => (Array.isArray(value) ? value : String(typeof value === 'string' ? value : '').split(/\r?\n/)).map(clean).filter(Boolean);
  // A control line without the source printed after it.
  const withoutSource = (line) => String(line || '').replace(/\s*\((?:[^()]|\([^()]*\))*\)$/, '');
  const GENERAL = new Set(['Before starting', 'Finish and clean up']);

  // The job step that uses a product of this type: the first whose name names the type, else the
  // first whose hazards or controls do. Not the general steps at the start and end, nor the user's own
  // steps. '' when none does: the user chooses the step.
  function matchStep(type, steps) {
    const entry = SUBSTANCES.find(([label]) => label === type);
    if (!entry) return '';
    const [, pattern] = entry;
    const usable = (Array.isArray(steps) ? steps : []).filter((step) => step && !step.own && !GENERAL.has(step.step));
    const byName = usable.find((step) => pattern.test(step.step || ''));
    if (byName) return byName.step;
    const lines = (step) => (step.controls || []).filter((line) => !(step.substanceLines || []).includes(line));
    const byLines = usable.find((step) => pattern.test([...(step.hazards || []), ...lines(step).map(withoutSource)].join('\n'))
      || (CONTROL_PRODUCTS[type] && CONTROL_PRODUCTS[type].test(lines(step).join('\n'))));
    return byLines ? byLines.step : '';
  }

  // The SDS's issue date from the date box ("2026-10-03"), or null.
  function dateOf(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(value));
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return date.getUTCMonth() === Number(match[2]) - 1 ? date : null;
  }
  // An SDS issued more than 5 years before today. The maker or importer must review its SDS at least
  // once every 5 years (WHS Regulations s 330(3)(a); Victoria: OHS Regulations 2017 r 146(1)(b)), so an
  // older one may not be the current SDS the business must hold (WHS Regulations s 344).
  function sdsOld(value, today = new Date()) {
    const date = dateOf(value);
    if (!date) return false;
    const limit = new Date(Date.UTC(today.getUTCFullYear() - 5, today.getUTCMonth(), today.getUTCDate()));
    return date < limit;
  }
  const OLD_NOTE = 'This safety data sheet is more than 5 years old. Its maker must review it at least every 5 years, so ask the supplier for the current one and check this row against it.';
  // An SDS dated after today is a typing slip.
  function sdsFuture(value, today = new Date()) {
    const date = dateOf(value);
    return Boolean(date && date > today);
  }

  // Not an answer: a blank, "To be completed", "TBC", "Unknown", a question mark.
  const OPEN = /_{3,}|^(?:[^:.]{1,60}:\s*)?(?:to be (?:completed|confirmed|advised)\b|tb[acd]\b)|^(?:unknown|not (?:yet )?known|not provided|n\/?a|none|nil|\?+|-+|\.+|x+)$/i;
  const isOpen = (text) => OPEN.test(clean(text));

  // A product's row as kept: the type, the product's details from its SDS, the step chosen, and
  // whether the user ticked that it matches the SDS.
  function rowOf(row) {
    const item = row && typeof row === 'object' ? row : {};
    return {
      id: clean(item.id),
      type: TYPES.includes(item.type) ? item.type : '',
      product: clean(item.product),
      supplier: clean(item.supplier),
      quantity: clean(item.quantity),
      sdsDate: clean(item.sdsDate),
      hazards: linesOf(item.hazards),
      controls: linesOf(item.controls),
      firstAid: linesOf(item.firstAid),
      storage: linesOf(item.storage),
      step: clean(item.step),
      confirmed: item.confirmed === true,
    };
  }

  // The step a product goes in: the one the user chose, while it is still in the SWMS, else
  // SiteReady's match for its type. '' while there is none.
  function stepOf(row, steps) {
    const names = (Array.isArray(steps) ? steps : []).map((step) => step.step);
    const chosen = clean(row && row.step);
    if (chosen && names.includes(chosen)) return chosen;
    return matchStep(row && row.type, steps);
  }

  const joinWords = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0]);
  // What a product still needs before the SWMS downloads, or '' once it can: its name, the PPE and
  // controls from its SDS, the SDS's issue date, the step that uses it, and the tick that the row
  // matches the SDS. step: the step it goes in ('' when none).
  function substanceNeed(row, step) {
    const item = rowOf(row);
    const name = item.product && !isOpen(item.product) ? item.product : item.type ? `this ${(SHORT.get(item.type) || 'product').toLowerCase()}` : 'this product';
    const missing = [];
    if (!item.product || isOpen(item.product)) missing.push('its product name');
    if (!item.controls.length || item.controls.some(isOpen)) missing.push('the PPE and controls its safety data sheet sets out, one a line');
    if (!dateOf(item.sdsDate)) missing.push('the issue date on its safety data sheet');
    if (!step) missing.push('the job step that uses it');
    const lists = [['hazards', 'hazard statements'], ['firstAid', 'first aid'], ['storage', 'storage and spills']].filter(([key]) => item[key].some(isOpen)).map(([, words]) => words);
    if (lists.length) missing.push(`a line in ${joinWords(lists)} that is not an answer yet (take it out or fill it in)`);
    if (item.supplier && isOpen(item.supplier)) missing.push('its supplier (or leave the supplier empty)');
    if (missing.length) return `For ${name}, give ${joinWords(missing)}.${item.confirmed ? '' : ' Then tick "These match the SDS".'}`;
    if (!item.confirmed) return `Check ${name} against its safety data sheet and tick "These match the SDS".`;
    return '';
  }

  // A control from the SDS as it reads inside the step's line: its own words, without the full stop,
  // and with a small first letter unless it starts with an abbreviation (PPE, P2).
  const inLine = (text) => {
    const words = clean(text).replace(/[.;]+$/, '');
    return /^[A-Z][a-z]/.test(words) ? `${words[0].toLowerCase()}${words.slice(1)}` : words;
  };
  // The step's one line for a product (D257): "Curing compound or release agent (Product X): wear
  // chemical resistant gloves; wear goggles; see its safety data sheet." '' until the product has a
  // name and controls.
  function stepLine(row) {
    const item = rowOf(row);
    if (!item.product || isOpen(item.product) || !item.controls.length) return '';
    const head = item.type ? `${SHORT.get(item.type)} (${item.product})` : item.product;
    return `${head}: ${item.controls.map(inLine).join('; ')}; see its safety data sheet.`;
  }

  // The types the work usually uses, as the prompt says them: "cement, concrete, grout and mortar".
  const promptName = (label) => (/^(PVC|LPG)/.test(label) ? label : `${label[0].toLowerCase()}${label.slice(1)}`);

  const api = { SUBSTANCES, CONTROL_PRODUCTS, TYPES, SHORT, clean, linesOf, matchStep, stepOf, dateOf, sdsOld, sdsFuture, OLD_NOTE, isOpen, rowOf, substanceNeed, stepLine, promptName, GENERAL };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteReadySubstanceRules = api;
})(typeof window !== 'undefined' ? window : globalThis);
