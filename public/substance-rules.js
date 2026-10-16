// Hazardous substances product by product (owner, 13 October 2026, feedback item 22: "hazardous
// substances needs to be individualised and the controls for each in the swms"; D256, D257). Shared
// by the page and the server, as gate-rules.js is.
//
// SiteWrite lists the types of substance the work usually uses (cement, curing compounds and so on)
// as prompts. The user adds each product used: they attach its safety data sheet (SiteWrite reads its
// typed words, sds-read.js) or type its details, then tick that the row matches the SDS. Only products
// print: never a type without a product. Each product's controls print in the Controls column of the
// substances table, and the step that uses it gets one line naming it (substances.js). The step is the
// one whose name or lines already name the product's type, or the one the user chooses.
//
// D181: what prints for a product comes from its SDS (the words read from it, each found word for
// word in its text, or typed by the user from it). SiteWrite writes no control of its own here.
(function (root) {
  // The types of substance that commonly come with the work, found in the task, the hazards and the
  // step names (register.js substancesFor). short: the type in a step line ("Curing compound or
  // release agent (Product X): ...").
  const SUBSTANCES = [
    ['Paints and coatings', /(?<!once )\b(paint\w*|coatings?|enamels?)\b/i, 'Paint or coating'],
    // "Solvent cement" is the PVC primer and solvent cement row, not a solvent and a cement (messy round 7).
    ['Solvents and thinners', /\b(solvents?(?! cement| weld\w*)|thinners?|turps)\b/i, 'Solvent or thinner'],
    ['Adhesives', /\b(adhesives?|glues?|vinyl|carpet)\b/i, 'Adhesive'],
    ['Wood dust (MDF and hardwood)', /\b(mdf|particleboard|wood dust|sawdust|(?:cut|saw|sand|rout|machin)\w* [^.\n]{0,30}\b(?:timber|wood|hardwood|mdf|joinery))\b/i, 'Board or timber product'],
    ['Sealants, mastics and silicone', /\b(sealants?|mastics?|silicone)\b/i, 'Sealant'],
    ['Waterproofing membranes and primers', /\b(waterproofing membranes?|liquid membranes?|torch-on|membrane (?:primers?|rolls?)|apply\w* [^.]{0,40}membranes?|waterproof(?:ing)? (?:to|the|wet|balcon))/i, 'Waterproofing product'],
    ['Epoxy, resins and two-part products', /\b(epoxy|resins?|two-part|two part|2-pack)\b/i, 'Epoxy or resin'],
    ['Cement, concrete, grout and mortar', /\b((?<!solvent |pvc )cement|wet concrete|concrete (?:pour|plac|finish|truck)\w*|pour\w*|grout|mortar|render|core fill\w*)\b/i, 'Cement product'],
    // Plasterboard that is painted over, or swept up, is not plaster work: plasterboard brings the type
    // only where it is fixed, set or jointed (messy round 4).
    ['Plaster, jointing and setting compounds', /\b(plaster(?!board)\w*|jointing|setting compounds?|set(?:ting)? and sand\w*|(?:fix|hang|install|set|stop|joint|sheet)\w* [^.\n]{0,30}\bplasterboard|plasterboard (?:fix|hang|install|lining|setting|stopping|jointing)\w*)\b/i, 'Plaster or setting compound'],
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
  // Fuel named in a step's lines, read only for a reason "Not required" needs (stepWords), not to list the type.
  const LINE_ONLY = { 'Fuels (diesel, petrol)': /\b(?:petrol|diesel)(?:[- ](?:driven|powered|engined))?\b/i };
  const TYPES = SUBSTANCES.map(([label]) => label);
  const SHORT = new Map(SUBSTANCES.map(([label, , short]) => [label, short]));

  const clean = (value) => String(typeof value === 'string' ? value : '').replace(/\s+/g, ' ').trim();
  // A list typed one item a line, or kept as a list: each item on its own, without empty ones.
  const linesOf = (value) => (Array.isArray(value) ? value : String(typeof value === 'string' ? value : '').split(/\r?\n/)).map(clean).filter(Boolean);
  // A control line without the source printed after it.
  const withoutSource = (line) => String(line || '').replace(/\s*\((?:[^()]|\([^()]*\))*\)$/, '');
  const GENERAL = new Set(['Before starting', 'Finish and clean up']);

  // Steps that prepare for the work, or clean up or store after it, rather than use the product.
  const PREPARES = /^(?:prepare|sand|clean|mask|protect|remove|strip|wash|cart|store|set up|plan|check|inspect|pressure clean|load|move|deliver)\b/i;
  // The step a type of product is used in, where no step names the type: fuel in the step running plant.
  const PREFER = {
    'Cement, concrete, grout and mortar': /^(?:Pump and place concrete|Place concrete|Pour the\b|Form and pour\b)/i,
    'Fuels (diesel, petrol)': /\b(?:refuel\w*|run (?:the )?(?:earthmoving )?plant|run earthmoving plant|operate (?:the )?(?:\w+ )?(?:plant|machines?)|generators?)\b/i,
  };
  const STEP_HINT = { 'Fuels (diesel, petrol)': /\b(plant|machines?|generators?|trucks?|excavat\w*|earthmoving|refuel\w*|compressors?|rollers?|pavers?|profil\w*|cranes?|chainsaws?|mulchers?)\b/i };
  // The job step that uses a product of this type: the first whose name names the type, else the
  // first whose hazards or controls do. Not the general steps at the start and end, nor the user's own
  // steps. '' when none does: the user chooses the step.
  function matchStep(type, steps) {
    const entry = SUBSTANCES.find(([label]) => label === type);
    if (!entry) return '';
    const [, pattern] = entry;
    const usable = (Array.isArray(steps) ? steps : []).filter((step) => step && !step.own && !GENERAL.has(step.step));
    // The step that does the main work with the product, before one that only names it (messy round 5:
    // concrete matched to "Core fill blockwork" ahead of the pour, and diesel to "Excavate" ahead of the
    // step that runs the earthmoving plant).
    const preferred = PREFER[type] && usable.find((step) => PREFER[type].test(step.step || ''));
    if (preferred) return preferred.step;
    // A step that uses the product before one that prepares for it or cleans up after it (messy round 4:
    // paint matched to "Prepare to paint", not "Paint").
    const named = usable.filter((step) => pattern.test(step.step || ''));
    const byName = named.find((step) => !PREPARES.test(step.step || '')) || named[0];
    if (byName) return byName.step;
    // Fuel goes with the step that runs the fuelled plant (messy round 4: diesel matched to "Paint line marking").
    const hinted = STEP_HINT[type] && usable.find((step) => STEP_HINT[type].test(step.step || ''));
    if (hinted) return hinted.step;
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
  // "dont know" or "not sure" anywhere in a line from the SDS is not an answer either (messy round 4,
  // run 2: "dont know" printed as the insulation's controls once "These match the SDS" was ticked).
  const HELD = /\b(?:(?:i )?(?:dont|don't|don’t|do not) (?:know|no)|dunno|not sure|no idea|tb[acd])\b/i;
  const isOpen = (text) => OPEN.test(clean(text)) || HELD.test(clean(text));

  // Words in the user's own task or answers that name a kind of product (owner, D292 item 3): "Not
  // required" for that type then needs a short reason ("supplied and applied by others"). Only the
  // product's own names count, not the work around it ("pour" or "excavator" name no product).
  const NAMED = {
    'Paints and coatings': /\b(?:paints?|painting|painted|coatings?|enamels?|undercoats?|top ?coats?)\b/i,
    'Solvents and thinners': /\b(?:solvents?(?! cement| weld\w*)|thinners?|turps|acetone|mineral spirits?)\b/i,
    'Adhesives': /\b(?:adhesives?|glues?|glued)\b/i,
    'Wood dust (MDF and hardwood)': /\b(?:mdf|particleboard|hardwood dust|wood dust)\b/i,
    'Sealants, mastics and silicone': /\b(?:sealants?|mastics?|silicone|caulk\w*)\b/i,
    'Waterproofing membranes and primers': /\b(?:membranes?|waterproof\w*)\b/i,
    'Epoxy, resins and two-part products': /\b(?:epoxy|epoxies|resins?|two[- ]part|two[- ]pack|2[- ]pack)\b/i,
    'Cement, concrete, grout and mortar': /\b(?:(?<!solvent |pvc |fibre[- ])cement\w*|grout\w*|mortar|render(?:ing)?|wet concrete|concrete (?:pour|plac|truck|pump)\w*|pour\w* (?:the )?concrete)\b/i,
    'Plaster, jointing and setting compounds': /\b(?:plaster(?!board)\w*|setting compounds?|jointing compounds?|base coat)\b/i,
    'Synthetic mineral fibres (insulation)': /\b(?:insulation|insulaton|glass ?wool|batts|rock ?wool|mineral wool)\b/i,
    'Curing compounds and form release agents': /\b(?:curing compounds?|form oil|release agents?)\b/i,
    'Respirable crystalline silica (concrete, masonry, tile and stone dust)': /\b(?:silica|engineered stone)\b/i,
    'PVC primer and solvent cement': /\b(?:solvent cement|pvc primer|pvc glue|pvc cement)\b/i,
    'Fuels (diesel, petrol)': /\b(?:diesel|petrol|unleaded|fuels?)\b/i,
    'Gases (LPG, acetylene, oxygen)': /\b(?:lpg|propane|acetylene|oxy[- ]?acetylene|gas (?:bottles?|cylinders?|torch\w*)|torch[- ]?on)\b/i,
    'Refrigerants': /\b(?:refrigerants?|r32|r410a|r134a)\b/i,
    'Cleaning chemicals': /\b(?:acid wash\w*|cleaning chemicals?|detergents?|hydrochloric|muriatic|degreasers?)\b/i,
    'Herbicides and termiticides': /\b(?:herbicides?|termiticides?|weed ?killers?|glyphosate|termite treatment)\b/i,
    'Bitumen and asphalt': /\b(?:bitumen|asphalt|hot mix|tack coat|prime coat|emulsion)\b/i,
  };
  // The word that names the type in the user's words, or ''.
  function namedIn(type, text) {
    const pattern = NAMED[type];
    const found = pattern && pattern.exec(String(text || ''));
    return found ? found[0] : '';
  }
  // The user's own words: the task as typed and every answer they gave (facts and site answers).
  function ownWords(input) {
    const item = input && typeof input === 'object' ? input : {};
    const values = (value) => (value && typeof value === 'object' ? Object.values(value).filter((entry) => typeof entry === 'string') : []);
    // The plant the user added is their own words too (messy round 6: fuel "Not required" was taken with
    // no reason beside a petrol saw).
    const choice = item.plantChoice && typeof item.plantChoice === 'object' ? item.plantChoice : {};
    const plant = (Array.isArray(choice.added) ? choice.added.map((entry) => entry && entry.item) : []).filter((name) => typeof name === 'string');
    return [item.task, ...values(item.facts), ...values(item.site), ...plant].filter(Boolean).join('\n');
  }
  // A short reason "Not required" is given for: a few words that say why, not "dont know". '' once given.
  function reasonNeed(reason) {
    const text = clean(reason);
    if (!text) return 'missing';
    return isOpen(text) || text.split(' ').length < 2 ? 'weak' : '';
  }
  const REASON_EXAMPLE = 'for example "supplied and applied by others"';
  // What a type ticked "Not required" still needs (D292 item 3), or '': a reason where the user's own
  // words name that kind of product.
  // The job steps' own words: their names and hazards, not the general steps (messy round 5: "Not
  // required" was taken with no reason for the tile adhesive and grout the steps mix and spread, and for
  // cement in a pour).
  // The cement, sealants and adhesives a step's control lines name by product name count too (messy round
  // 6: cement "Not required" with no reason where the levelling compound step says "Cement-based
  // compounds", and sealant and adhesive where the lines say the step uses them). Only the product words
  // are taken, so a line's other words do not count.
  // Fuel for the petrol-driven plant the lines name, and for a generator or petrol plant in the plant list (messy
  // round 7: fuel "Not required" with no reason beside "Petrol-driven saws, trowels and generators").
  const LINE_PRODUCTS = ['Cement, concrete, grout and mortar', 'Sealants, mastics and silicone', 'Adhesives', 'Fuels (diesel, petrol)'];
  const FUELLED_PLANT = /\b(generators?|petrol|diesel)\b/i;
  function stepWords(draft) {
    const steps = ((draft && draft.jobSteps) || []).filter((step) => step && !step.own && !GENERAL.has(step.step));
    const products = steps.flatMap((step) => (step.controls || []).filter((line) => typeof line === 'string' && !(step.substanceLines || []).includes(line)).map(withoutSource))
      .flatMap((line) => LINE_PRODUCTS.map((type) => ((CONTROL_PRODUCTS[type] || LINE_ONLY[type]).exec(line) || [])[0]).filter(Boolean));
    const plant = [...((draft && draft.plant) || []), ...((draft && draft.plantInferred) || [])].map((item) => String((item && (item.known || item.item)) || '')).filter((name) => FUELLED_PLANT.test(name)).map((name) => `${name} (diesel or petrol)`);
    return [...steps.flatMap((step) => [step.step, ...(step.hazards || []).filter((line) => typeof line === 'string')]), ...products, ...plant].join('\n');
  }
  // A type ticked "Not required" that the user's own safety data sheet answer names as a product used
  // ("The products used are Sikaflex 11FC sealant"): a reason does not settle it (messy round 6).
  // Only a sentence that lists the products used counts ("The products used are ..."), not one that says
  // where an SDS is kept.
  function sdsConflict(type, sds) {
    const used = String(sds || '').split(/(?<=[.;!?])\s+|\n+/).filter((sentence) => /\b(?:products? (?:used|in use)|products? we use|we use|we are using|used on (?:this|the) job)\b/i.test(sentence)).join('\n');
    const named = namedIn(type, used);
    return named ? `${SHORT.get(type)}: your safety data sheet answer names "${named}" as a product used, but it is ticked "Not required". Add the product, or take it out of that answer.` : '';
  }
  // Where "Not required" needs a reason: the word in the user's own task or answers, else in the job steps.
  function reasonAsked(type, words, steps = '') {
    const named = namedIn(type, words);
    if (named) return { word: named, said: `your task or answers name "${named}"`, hint: `Your task or answers name "${named}".` };
    const used = namedIn(type, steps);
    return used ? { word: used, said: `the job steps name "${used}"`, hint: `The job steps name "${used}".` } : null;
  }
  // SiteWrite's own job step that cuts, drills, cores, grinds or breaks out concrete, masonry or stone
  // makes silica dust on this job (D311, round 6 content decision 1: silica was taken as "Not required,
  // supplied and applied by others" beside such a step). The step's name, or ''. Not the user's own
  // steps, nor the general steps at the start and end.
  const SILICA = 'Respirable crystalline silica (concrete, masonry, tile and stone dust)';
  const CUTS_CONCRETE = /\b(?:cut\w*|saw\w*|drill\w*|core[- ]?drill\w*|coring|grind\w*|chas\w*|scabbl\w*|break\w*(?: out)?|jackhammer\w*)\b[^.\n]{0,40}\b(?:concrete|masonry|stone|slabs?|soffits?|blocks?|blockwork|bricks?|brickwork|pavers?|kerbs?|sleepers?)\b|^(?:Core drill|Saw cut)\b|\bgrind\w* (?:the )?(?:concrete )?floors?\b/i;
  // A line that names silica dust and the work that makes it ("Silica dust from drilling hanger anchors").
  const SILICA_WORK = /\bsilica\b[^.\n]*\b(?:cut\w*|saw\w*|drill\w*|cor(?:e|ing)\w*|grind\w*|chas\w*|break\w*|jackhammer\w*|rout\w*|rak\w*|split\w*|polish\w*|crush\w*|mix\w*)\b|\b(?:cut\w*|saw\w*|drill\w*|cor(?:e|ing)\w*|grind\w*|chas\w*|break\w*|rout\w*)\b[^.\n]*\bsilica\b/i;
  // A control line of SiteWrite's counts where it puts a dust control on that work ("Drill anchors with
  // on-tool dust extraction"), not where it only names the work for another reason (a face shield for
  // holes drilled through the formwork, ear muffs for hammer drilling).
  const DRILLS_ANCHORS = /\bdrill\w* (?:\w+ )?(?:anchors?|fixings?)\b|\banchor holes?\b/i;
  const DUST_CONTROL = /\b(?:on-tool (?:dust )?extraction|dust extraction|water suppression|wet (?:cutting|methods?)|done wet|water-fed|respirators?|silica)\b/i;
  // A line that says where or if the work is done is a condition, not this step doing it ("Silica dust
  // where products contain crystalline silica"), and a line that says a tool is not used is not its use.
  const CONDITION = /\b(?:where|if|unless|whether)\b|\bnot (?:be )?used\b|\bnever\b/i;
  const NOT_THIS_JOB = /\(Does not apply to this job\)$/;
  const OWN_STEP = /\(Our own step\)$/;
  const madeHere = (line) => {
    const text = withoutSource(line);
    return !NOT_THIS_JOB.test(String(line)) && !CONDITION.test(text) && (CUTS_CONCRETE.test(text) || SILICA_WORK.test(text));
  };
  const controlHere = (line) => {
    const text = withoutSource(line);
    return !CONDITION.test(text) && (CUTS_CONCRETE.test(text) || DRILLS_ANCHORS.test(text)) && DUST_CONTROL.test(text);
  };
  // The job step that cuts, drills, cores, grinds, chases or breaks out concrete, masonry, stone or slabs,
  // or says it makes silica dust doing so: by its name, its hazards, its controls, or the user's own step
  // (messy round 7: the check read only step names, so "Finish concrete" with its saw cutting and grinding
  // lines, "Fix hangers and supports" and "Install suspended grid ceilings" drilling slab anchors, and an
  // own step saw cutting the kerb were taken as not making silica dust). Not the general steps at the start
  // and end. The step's name, or ''.
  function silicaStep(draft) {
    const steps = ((draft && draft.jobSteps) || []).filter((step) => step && !GENERAL.has(step.step));
    const own = (step) => step.own || OWN_STEP.test(String(step.step || ''));
    const lines = (step) => (step.controls || []).filter((line) => typeof line === 'string' && !(step.substanceLines || []).includes(line));
    const found = steps.find((step) => CUTS_CONCRETE.test(String(step.step || '').replace(OWN_STEP, '')))
      || steps.find((step) => (step.hazards || []).some((line) => typeof line === 'string' && madeHere(line))
        || lines(step).some((line) => (own(step) ? madeHere(line) : controlHere(line))));
    return found ? found.step : '';
  }
  const cutStep = silicaStep;
  // A reason that says another trade or others do it ("painters do it", "by others") does not settle a type
  // the user's own step uses (messy round 7: paint "painters do it" beside the user's own "Paint shadowline
  // packers"). Beside SiteWrite's own steps a short reason still settles it (D292), silica apart.
  const BY_OTHERS = /\b(?:by others|others? (?:do|does|will|supply|supplies|apply|applies|install)\w*|(?:by|done by) (?:the )?(?:builder|principal contractor|client|another trade|other trades|painters?|electricians?|plumbers?|fire stoppers?|sealant contractors?)|(?:painters?|electricians?|plumbers?|the builder|another trade|other trades|fire stoppers?)\b[^.]{0,20}\b(?:do|does|doing|will|supply|supplies|apply|applies|install)\w*|not (?:in )?our (?:work|scope))\b/i;
  function usedByOwnSteps(type, draft) {
    const steps = ((draft && draft.jobSteps) || []).filter((step) => step && !GENERAL.has(step.step));
    for (const step of steps) {
      if (!(step.own || OWN_STEP.test(String(step.step || '')))) continue;
      const lines = (step.controls || []).filter((line) => typeof line === 'string' && !(step.substanceLines || []).includes(line)).map(withoutSource);
      // A fuel or gas line, pipe or tank the step works on is not the product used ("Leak test the fuel line").
      const word = namedIn(type, [step.step, ...(step.hazards || []), ...lines].join('\n').replace(/\b(?:fuel|gas|refrigerant|diesel|petrol)\s+(?:lines?|pipes?|pipework|mains?|systems?|tanks?|meters?)\b/gi, ' '));
      if (word) return { step: String(step.step || '').replace(OWN_STEP, '').trim(), word };
    }
    return null;
  }
  function notUsedNeed(type, reason, words, steps = '', sds = '', cut = '', draft = null) {
    const conflict = sdsConflict(type, sds);
    if (conflict) return conflict;
    const used = draft && BY_OTHERS.test(clean(reason)) ? usedByOwnSteps(type, draft) : null;
    if (used) return `${SHORT.get(type)}: "${clean(reason).slice(0, 60)}" says others do it, but the job step "${used.step}" in this SWMS uses "${used.word.toLowerCase()}". Add the product you use, or take that step or line off.`;
    // While that step is in the SWMS, no reason settles it: the product being cut is asked for.
    if (type === SILICA && cut) return `${SHORT.get(type)}: the job step "${cut}" cuts, drills or grinds concrete, masonry or stone, so this work makes silica dust and it cannot be "Not required". Add what is cut as the product, for example the concrete slab or the blockwork, with its safety data sheet. If this job does not do that, take the step off, or change the lines that say it does.`;
    const asked = reasonAsked(type, words, steps);
    if (!asked) return '';
    const named = asked.word;
    const need = reasonNeed(reason);
    if (need === 'missing') return `${SHORT.get(type)}: ${asked.said}. Add the product you use, or give a short reason it is not required, ${REASON_EXAMPLE}.`;
    if (need === 'weak') return `${SHORT.get(type)}: "${clean(reason).slice(0, 60)}" does not say why it is not required. Give a short reason, ${REASON_EXAMPLE}, or add the product you use.`;
    return '';
  }

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
  // SiteWrite's match for its type. '' while there is none.
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

  const api = { SUBSTANCES, CONTROL_PRODUCTS, TYPES, SHORT, NAMED, clean, linesOf, matchStep, stepOf, dateOf, sdsOld, sdsFuture, OLD_NOTE, isOpen, rowOf, substanceNeed, stepLine, promptName, GENERAL, namedIn, ownWords, reasonNeed, notUsedNeed, stepWords, reasonAsked, sdsConflict, cutStep, silicaStep, SILICA };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteWriteSubstanceRules = api;
})(typeof window !== 'undefined' ? window : globalThis);
