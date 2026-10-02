// The registers a SWMS template carries alongside the job steps: plant and
// equipment, hazardous substances, licences and qualifications, emergency
// arrangements, the legislation and codes the controls rely on, and a suggested
// risk rating for each step. Each is worked out from the task and the finished
// job steps, and left for the supervisor to check and complete for the site.

// Plant and equipment. A licence is shown only where Schedule 3 of the WHS
// Regulation makes the work high risk work; otherwise the operator must be
// competent. Electrical equipment for construction work is inspected and tested
// to AS/NZS 3012 (Electrical Safety Regulation 2026 (Qld) s 140).
const TEST_TAG = 'Inspected, tested and tagged to AS/NZS 3012. Checked for damage before use.';
const PRESTART = 'Pre-start check each shift. Serviced to the manufacturer\'s instructions.';
const PLANT = [
  { item: 'Boom-type elevating work platform', pattern: /\b(boom lifts?|boom ewps?|knuckle booms?|cherry pickers?|articulating booms?)\b/i, inspection: `${PRESTART} Inspected and maintained by a competent person to the manufacturer\'s instructions, including its periodic (usually yearly) inspection.`, licence: 'Yes, where the boom length is 11 m or more, measured as the greater of platform height and horizontal reach (WP)' },
  { item: 'Scissor lift', pattern: /\bscissor lifts?\b/i, inspection: `${PRESTART} Inspected and maintained by a competent person to the manufacturer\'s instructions, including its periodic (usually yearly) inspection.`, licence: 'No. Operator trained in the model used' },
  { item: 'Elevating work platform', pattern: /\b(elevating work platforms?|ewps?)\b/i, skipIf: /\b(scissor|boom)\b/i, inspection: `${PRESTART} Inspected and maintained by a competent person to the manufacturer\'s instructions, including its periodic (usually yearly) inspection.`, licence: 'Only for a boom-type platform with a boom length of 11 m or more (WP). No licence for a scissor lift' },
  { item: 'Tower crane', pattern: /\btower cranes?\b/i, inspection: 'Registered item of plant. Pre-erection and commissioning inspections, daily pre-operational check and log book, routine inspections, a yearly inspection if erected for 12 months or more, and a major inspection (WHS Reg s 235).', licence: 'Yes (CT, or CS for a self-erecting tower crane), with licensed doggers or riggers' },
  { item: 'Mobile crane or crane truck', pattern: /\b(mobile cranes?|crane trucks?|franna|slewing cranes?|the crane|a crane|cranes?)\b/i, skipIf: /\b(tower crane|crane ties?|crane, hoist|crane or (?:a )?hoist|hoist or (?:a )?crane|where a crane|if a crane|crane or forklift|forklift or crane|forklift, crane)\b/i, inspection: 'Crane company\'s log book and pre-start check. Inspected to the manufacturer\'s instructions (WHS Reg s 213). Cranes over 10 t are registered plant and need a major inspection (s 235).', licence: 'Yes, crane class to suit (slewing C2, C6, C1 or C0; non-slewing over 3 t CN; vehicle loading crane of 10 metre-tonnes or more CV), with licensed doggers or riggers. No licence for a vehicle loading crane under 10 metre-tonnes or a non-slewing crane of 3 t or less' },
  { item: 'Forklift', pattern: /\bforklifts?\b/i, inspection: PRESTART, licence: 'Yes (LF)' },
  { item: 'Telehandler', pattern: /\btelehandlers?\b/i, inspection: PRESTART, licence: 'No Schedule 3 class names telehandlers. Operator competent in the model used. Check with the supplier whether a non-slewing crane licence (CN) is needed when it is fitted with a jib or hook to lift suspended loads' },
  { item: 'Personnel or materials hoist', pattern: /\b(hoists?|materials lifts?)\b/i, skipIf: /\b(chain hoists?|leave out|at the hoist|where there is|near the hoist|clear of)\b/i, inspection: 'Inspected, tested and maintained by a competent person to the manufacturer\'s instructions (WHS Reg s 213). Pre-start check each shift. Erected and altered by licensed riggers.', licence: 'Yes (HP or HM)' },
  { item: 'Concrete placing boom', pattern: /\b(placing booms?|boom pumps?|pump trucks?|truck-mounted pumps?)\b/i, inspection: 'Registered item of plant. Daily pre-start check. Pipes, hoses and clamps checked for wear and damage before use. Yearly inspection and six-yearly major inspection (Concrete Pumping Code s 5).', licence: 'Yes (PB)' },
  { item: 'Concrete line pump', pattern: /\b(line pumps?|concrete pumps?|pump(?:,|\s+and)?\s+(?:and\s+)?place\w*)\b/i, inspection: 'Pre-start check. Pipes, hoses and clamps checked for wear and damage before use. Inspected by a competent person at least yearly.', licence: 'No. Operator competent' },
  { item: 'Scaffold', pattern: /\bscaffold(?:s|ing)?\b/i, inspection: 'Handover certificate before first use. Inspected by a competent person before use, after an incident that could affect its stability, after repairs or alterations, and at least every 30 days (WHS Reg s 225, scaffolds over 4 m).', licence: 'Yes, for erecting or altering where a fall of more than 4 m is possible (SB, SI or SA)' },
  { item: 'Mobile scaffold', pattern: /\bmobile scaffolds?\b/i, inspection: 'Erected to the manufacturer\'s instructions. Castors locked, guardrails complete, checked before use. Over 4 m: handover certificate and inspections as for a scaffold (WHS Reg s 225).', licence: 'No, under 4 m. Yes (SB) where a person or object could fall more than 4 m' },
  { item: 'Excavator', pattern: /\b(excavators?|excavat\w* by machine|mini excavators?)\b/i, inspection: PRESTART, licence: 'No. Operator competent (verification of competency)' },
  { item: 'Skid steer or posi-track', pattern: /\b(skid ?steers?|bobcats?|posi-?tracks?)\b/i, inspection: PRESTART, licence: 'No. Operator competent (verification of competency)' },
  { item: 'Roller or plate compactor', pattern: /\b(plate compactors?|compactors?|wacker|compaction|(?:ride-on|vibrating|smooth drum|padfoot|road|trench) rollers?)\b/i, inspection: PRESTART, licence: 'No. Operator competent' },
  { item: 'Piling rig', pattern: /\b(piling rigs?|cfa rigs?|bored pil\w*)\b/i, inspection: 'Daily pre-start check and the rig\'s log book.', licence: 'No. Operator competent' },
  { item: 'Concrete truck', pattern: /\bconcrete trucks?\b/i, inspection: 'The supplier\'s pre-start check.', licence: 'Truck driver\'s licence' },
  { item: 'Power trowel', pattern: /\bpower trowels?\b/i, inspection: `${PRESTART} Guards and stop switch checked.`, licence: 'No' },
  { item: 'Concrete saw', pattern: /\b(concrete saws?|saw cut\w*|saw-cut\w*|floor saws?|wall saws?)\b/i, inspection: `${PRESTART} Blade guard in place. Electric saws: ${TEST_TAG}`, licence: 'No' },
  { item: 'Core drill', pattern: /\bcore[- ]?drill\w*\b/i, inspection: TEST_TAG, licence: 'No' },
  { item: 'Generator', pattern: /\bgenerators?\b/i, inspection: `${PRESTART} Electrical output protected by an RCD. ${TEST_TAG}`, licence: 'No' },
  { item: 'Chainsaw', pattern: /\bchainsaws?\b/i, inspection: `${PRESTART} Chain brake working.`, licence: 'No. Operator competent' },
  { item: 'Oxy-acetylene or gas torch set', pattern: /\b(oxy|acetylene|gas torch\w*|torch-on|torching|brazing|lpg)\b/i, inspection: 'Hoses, regulators and flashback arrestors checked before use.', licence: 'No' },
  { item: 'Welder', pattern: /\bweld\w*\b/i, skipIf: /\b(vinyl|seams?|hot air)\b/i, inspection: TEST_TAG, licence: 'No' },
  { item: 'Nail gun', pattern: /\bnail guns?\b/i, inspection: 'Checked before use. Single shot trigger.', licence: 'No' },
  { item: 'Air compressor', pattern: /\b(compressed air|air compressors?|compressors?)\b/i, skipIf: /\b(fans?|pumps|start\w* without|refrigerat\w*|condens\w*)\b/i, inspection: `${PRESTART} Hoses and couplings checked and restrained.`, licence: 'No' },
  { item: 'Concrete vibrator', pattern: /\bvibrators?\b/i, inspection: TEST_TAG, licence: 'No' },
  { item: 'Trench shield or shoring', pattern: /\b(trench shields?|trench box\w*|shoring|shored)\b/i, inspection: 'Installed to the manufacturer\'s or engineer\'s design, and checked by a competent person frequently, including before each shift and after rain.', licence: 'No. Installed by competent people' },
  { item: 'Dewatering pump', pattern: /\b(dewater\w*|pump out water|pumps? (?:the )?water)\b/i, inspection: `${PRESTART} ${TEST_TAG}`, licence: 'No' },
  { item: 'Vacuum excavation unit', pattern: /\b(vacuum excavat\w*|vacuum system|non-destructive digging|hydro ?vac\w*)\b/i, inspection: PRESTART, licence: 'No. Operator competent' },
  { item: 'Tipper or dump truck', pattern: /\b(tippers?|dump trucks?|haul trucks?|trucks? (?:cart|haul)\w*|carted by truck|cart\w* (?:spoil|topsoil|soil|fill|mulch)\w*)\b/i, inspection: PRESTART, licence: 'Truck driver\'s licence' },
  { item: 'Gas detector', pattern: /\b(gas detectors?|gas monitor\w*|atmospheric? (?:testing|monitor\w*)|test(?:ed)? (?:the )?atmosphere|monitor the atmosphere)\b/i, inspection: 'Calibrated to the manufacturer\'s instructions and bump tested before use.', licence: 'No. User trained' },
  { item: 'Lifting gear (slings, chains, shackles)', pattern: /\b(slings?|slung|shackles?|lifting gear|lifting chains?)\b/i, inspection: 'Tagged with its working load limit, inspected before each use and periodically by a competent person. Damaged gear is withdrawn.', licence: 'No. Slinging loads is dogging or rigging work' },
  { item: 'Stump grinder', pattern: /\bstump(?:s)? (?:grind\w*|removal)|stump grinders?\b/i, inspection: `${PRESTART} Guards in place.`, licence: 'No. Operator competent' },
  { item: 'Post hole auger', pattern: /\b(augers?|post holes?)\b/i, inspection: `${PRESTART} Guards in place.`, licence: 'No' },
  { item: 'Cable winch or puller', pattern: /\b(winch\w*|cable pull\w*|pull cables?)\b/i, inspection: `${PRESTART} Guards and stop control working.`, licence: 'No' },
  { item: 'Floor grinder with H class extraction', pattern: /\b(floor grind\w*|grind\w* (?:and polish\w* )?(?:the |a )?(?:concrete )?floors?|diamond grind\w*)\b/i, inspection: `${PRESTART} Guards and dust shroud in place. ${TEST_TAG}`, licence: 'No. Operator competent' },
  { item: 'Ladders', pattern: /\bladders?\b/i, inspection: 'Industrial rated, at least 120 kg. Checked before each use.', licence: 'No' },
  { item: 'Electric power tools and leads', pattern: /\b(power tools?|grind(?:er|ers|ing)|drill\w*|drop saws?|circular saws?|power saws?|cut-off saws?|reglet saws?|masonry saws?|wet saws?|tile saws?|chas(?:e|ed|er|ers|ing)|leads?|floor scrubbers?|test instruments?)\b/i, skipIf: /\b(core[- ]?drill\w*|stump grind\w*|lead paint|leads? (?:the|to|from|into)|lead(?:s)? hand)\b/i, inspection: TEST_TAG, licence: 'No' },
];

// Hazardous substances that commonly come with the work. The product names and
// quantities are the user's to fill in.
const SUBSTANCES = [
  ['Paints and coatings', /(?<!once )\b(paint\w*|coatings?|enamels?)\b/i],
  ['Solvents and thinners', /\b(solvents?|thinners?|turps)\b/i],
  ['Adhesives', /\b(adhesives?|glues?|vinyl|carpet)\b/i],
  ['Wood dust (MDF and hardwood)', /\b(mdf|particleboard|wood dust|sawdust|(?:cut|saw|sand|rout|machin)\w* [^.\n]{0,30}\b(?:timber|wood|hardwood|mdf|joinery))\b/i],
  ['Sealants, mastics and silicone', /\b(sealants?|mastics?|silicone)\b/i],
  ['Waterproofing membranes and primers', /\b(waterproofing membranes?|liquid membranes?|torch-on|membrane (?:primers?|rolls?)|apply\w* [^.]{0,40}membranes?|waterproof(?:ing)? (?:to|the|wet|balcon))/i],
  ['Epoxy, resins and two-part products', /\b(epoxy|resins?|two-part|two part|2-pack)\b/i],
  ['Cement, concrete, grout and mortar', /\b(cement|wet concrete|concrete (?:pour|plac|finish|truck)\w*|pour\w*|grout|mortar|render|core fill\w*)\b/i],
  ['Plaster, jointing and setting compounds', /\b(plaster\w*|jointing|setting compounds?|set(?:ting)? and sand\w*)\b/i],
  ['Synthetic mineral fibres (insulation)', /\b(insulation(?! boards?)(?!,? where)|glasswool|glass wool|batts|rockwool)\b/i],
  ['Curing compounds and form release agents', /\b(curing compounds?|cur(?:e|ing) (?:the )?concrete|form oil|release agents?)\b/i],
  ['Respirable crystalline silica (concrete, masonry, tile and stone dust)', /\bsilica\b/i],
  ['PVC primer and solvent cement', /\b(solvent cement|pvc primer)\b/i],
  ['Fuels (diesel, petrol)', /\b(diesel|petrol|fuel\w*|refuel\w*|generators?|chainsaws?|excavators?)\b/i],
  ['Gases (LPG, acetylene, oxygen)', /\b(lpg|acetylene|oxy-\w*|oxyacetylene|gas cylinders?|brazing|gas torch\w*|torch-on)\b/i],
  ['Refrigerants', /\brefrigerants?\b/i],
  ['Cleaning chemicals', /\b(cleaning chemicals?|detergents?|acid wash\w*|cleaning products?)\b/i],
  ['Herbicides and termiticides', /\b(herbicides?|termiticides?|termite treatment|weed ?killers?|treat\w* the ground)\b/i],
  ['Bitumen and asphalt', /\b(bitumen|asphalt|hot mix)\b/i],
];

// Licences, tickets and training the work needs.
const QUALIFICATIONS = [
  ['General construction induction (white card)', /./],
  ['Site specific induction', /./],
  ['Electrical work licence (electrical mechanic)', /\b(electrical work|electricians?|electrical installation|switchboards?|distribution boards?|submains?|fit[- ]off|terminat\w*|wiring|cabling|power points?|power circuits?|lighting|(?:light|led) fittings?|(?:ev|electric vehicle|car) chargers?|inverters?|solar(?! hot water)|(?:pull|install|run|lay|terminat)\w* [^.]{0,20}\bcables?)\b/i],
  ['Plumbing and drainage licence', /\b(plumbing|plumber|drainage(?! swales?)|sewer\w*|grease traps?|trade waste|stormwater (?:lines?|pipes?|drains?)|hot water|water supply|gas fitting|gasfitting|gas (?:hot water|line|appliance)s?)\b/i],
  ['Refrigerant handling licence (ARC)', /\b(refrigerants?|split systems?|refrigeration|vrf|vrv|condensing units?)\b/i],
  ['Gas work licence (Petroleum and Gas (Production and Safety) Act 2004 (Qld))', /\b(gas (?:fitting|lines?|pipe\w*|supply|appliances?|hot water|heaters?|meters?)|gasfitt\w*|connect\w*[^.]{0,30}\bgas\b)\b/i],
  ['Licensed asbestos removalist (Class A or B) with workers holding the VET asbestos removal certification, or asbestos training for non-licensed removal (WHS Reg s 445, s 460)', /\basbestos\b/i],
  ['Confined space entry training', /\bconfined spaces?\b/i],
  ['Crystalline silica training (VET accredited or regulator approved), where the processing is high risk', /\bsilica dust\b/i],
  ['Working at heights and harness training', /\b(harness|travel restraint|fall arrest)\b/i],
  ['Traffic controller accreditation', /\btraffic controllers?\b/i],
  ['Rescue and resuscitation (low voltage rescue and CPR), current', /\b(rescue and resuscitation|low voltage rescue)\b/i],
  ['Chainsaw operator competency', /\bchainsaws?\b/i],
  ['Commercial operator licence, where powered ground spraying of herbicide is done in a regulated area', /\b(herbicides?|weed ?(?:spray|kill)\w*)\b/i],
  ['Pest management licence and QBCC termite licence', /\b(termit\w*)\b/i],
  ['Hot work permit trained', /\bhot work\b/i],
];

// The 5 x 5 matrix from the Queensland SWMS template: likelihood 5 (almost
// certain) to 1 (rare) by consequence 1 (negligible) to 5 (catastrophic).
const MATRIX = {
  5: ['Moderate', 'Moderate', 'High', 'Extreme', 'Extreme'],
  4: ['Low', 'Moderate', 'Moderate', 'High', 'Extreme'],
  3: ['Low', 'Moderate', 'Moderate', 'Moderate', 'High'],
  2: ['Low', 'Low', 'Moderate', 'Moderate', 'High'],
  1: ['Low', 'Low', 'Low', 'Low', 'Moderate'],
};
const LIKELIHOOD = { 5: 'Almost certain', 4: 'Likely', 3: 'Possible', 2: 'Unlikely', 1: 'Rare' };
const CONSEQUENCE = { 5: 'Catastrophic', 4: 'Major', 3: 'Moderate', 2: 'Minor', 1: 'Negligible' };

// How bad the worst hazard in a step could be.
const CATASTROPHIC = /\b(energis\w*|live (?:cables?|parts?|electrical)|electric\w* shock|unsafe equipment|start\w* without warning|rotating parts?|entangle\w*|(?:falls?|falling) (?:from|into|through|off|down)|fall of more|from height|collapse\w*|fails? during|failure|strik\w* [^.]{0,40}\b(?:services?|cables?|gas|electrical)|hidden services|fails?|struck|falling objects?|traffic|vehicle strike|objects? fall\w*|buried|engulf\w*|electric shock|electrocut\w*|energised|struck by|strikes? a person|crush\w*|overturn\w*|rolls? over|drown\w*|asphyxi\w*|explosion|explod\w*|oxygen|toxic|tips? or falls|load falls|swings? into)\b/i;
const MAJOR = /\b(moving parts|ducts or plenums|silica|asbestos|amputat\w*|burns?|fire|hearing|isocyanates?|cancer|fumes?|vapour|hose whip|burst|kickback|impalement|chemical)\b/i;
const MODERATE = /\b(cuts?|strain\w*|back|manual|vibration|noise|dust|knee|eyes?|skin|heat|sun|flying)\b/i;
// Controls that change the hazard itself, rather than relying on people.
const ENGINEERING = /\b(edge protection|guardrails?|guards?|barricad\w*|exclusion zones?|shor\w*|bench\w*|batter\w*|extraction|wet (?:cutting|methods?)|water suppression|isolat\w*|de-?energis\w*|locked out|covers?|scaffolds?|working platforms?|elevating work platforms?|scissor lifts?|ventilat\w*|rcds?|interlock\w*|gantr\w*|trench shields?|props?|propped|certified|engineer's design|catch (?:nets?|platforms?)|fixed deck|toe ?boards?|mesh screens?|vacuum excavat\w*|pothol\w*|hand dig\w*|no one (?:is |works |stands )?(?:in|under|below)|tag lines?|platform ladders?|rated lifting points?|barriers?|separat\w* (?:the work )?from (?:passing )?traffic|landing (?:bays?|platforms?))\b/i;

function consequenceOf(hazards) {
  const text = hazards.join(' ');
  if (CATASTROPHIC.test(text)) return 5;
  if (MAJOR.test(text)) return 4;
  if (MODERATE.test(text)) return 3;
  // Unmatched hazards are rated moderate for the supervisor to confirm, not played down.
  return 3;
}

function rating(likelihood, consequence) {
  return { likelihood, consequence, level: MATRIX[likelihood][consequence - 1], label: `${LIKELIHOOD[likelihood]} x ${CONSEQUENCE[consequence]}` };
}

// A suggested rating before and after the step's controls. Controls are taken to
// lower the likelihood, not the consequence: rare where the hazard itself is
// controlled (guarding, isolation, edge protection), unlikely where it relies on
// how people work.
function riskFor(step) {
  const consequence = consequenceOf(step.hazards || []);
  const before = consequence >= 4 ? 3 : 4;
  const engineered = (step.controls || []).some((line) => ENGINEERING.test(line));
  const after = engineered ? 1 : 2;
  return { before: rating(before, consequence), after: rating(Math.min(after, before), consequence) };
}

// Plant operated or erected by others: the licence belongs to them.
function othersLicence(item, allText, task) {
  if (/crane/i.test(item.item) && /\bcrane company\b/i.test(allText)) return { ...item, licence: `Held by the crane company's operator and crew: ${item.licence.replace(/^Yes,?\s*/, '')}` };
  if (item.item === 'Scaffold' && !/\b(erect\w*|dismantl\w*|alter\w*|build\w*)\b[^.]{0,40}\bscaffold|\bscaffold\w*\b[^.]{0,20}\b(erect\w*|dismantl\w*)/i.test(task)) return { ...item, licence: 'Erected and altered only by a licensed scaffolder (SB, SI or SA) where a fall of more than 4 m is possible. Our crew uses it and does not alter it' };
  if (/Personnel or materials hoist/.test(item.item) && !/\b(erect\w*|install\w*|operat\w*|dismantl\w*)\b[^.]{0,30}\bhoists?\b/i.test(task)) return { ...item, licence: `Held by the principal contractor's licensed hoist operator: ${item.licence.replace(/^Yes,?\s*/, '')}` };
  if (item.item === 'Concrete placing boom' && !/\b(we|our crew|our own)\b[^.]{0,30}\b(operat\w*|run\w*)\b[^.]{0,20}\b(pump|boom)/i.test(allText)) return { ...item, licence: `Held by the pumping company's licensed operator: ${item.licence.replace(/^Yes,?\s*/, '')}` };
  return item;
}

// Work the task says others do, such as "connected by a licensed electrician",
// or fittings the crew works around, is not this crew's licence or Act.
function ownWork(text) {
  return text
    .split(/(?<=[.;\n])\s*/)
    .filter((sentence) => !/\b(?:by|from) (?:a |the )?(?:licensed |registered |qualified )?(?:electricians?|plumbers?|gasfitters?|gas fitters?|others|the builder|the principal contractor|the electrical contractor|the plumbing contractor)\b/i.test(sentence))
    .join(' ')
    .replace(/\b(?:around|near|between|up to|clear of|over)\b[^.]{0,40}\b(?:electrical|plumbing|gas) (?:fittings?|fixtures?|outlets?|services?|points?)\b/gi, '');
}

function plantFor(text) {
  const found = [];
  for (const entry of PLANT) {
    if (!entry.pattern.test(text)) continue;
    // A skip applies to the words around the match, such as paint rollers or vinyl seam welding.
    // A skip applies to each match on its own: the item is kept if any match is real use.
    const global = new RegExp(entry.pattern.source, entry.pattern.flags.includes('g') ? entry.pattern.flags : `${entry.pattern.flags}g`);
    if (entry.skipIf && [...text.matchAll(global)].every((match) => entry.skipIf.test(text.slice(Math.max(0, match.index - 20), match.index + match[0].length + 20)))) continue;
    if (entry.item === 'Scaffold' && !/\bscaffold/i.test(text.replace(/\bmobile scaffold\w*/gi, ''))) continue;
    if (entry.item === 'Elevating work platform' && found.some((item) => /elevating work platform|Scissor lift/.test(item.item))) continue;
    found.push({ item: entry.item, inspection: entry.inspection, licence: entry.licence });
  }
  return found;
}

// Products named in control lines. These are matched only on product names, so a
// control that says to keep clear of something does not list it.
const CONTROL_PRODUCTS = {
  'Paints and coatings': /\btouch-up paint\b/i,
  'Adhesives': /\badhesives?\b/i,
  'Sealants, mastics and silicone': /\b(sealants?|mastics?)\b/i,
  'Epoxy, resins and two-part products': /\b(epoxy|jointing resins?|resins?)\b/i,
  'Cement, concrete, grout and mortar': /\b(cement-based|cementitious|grout|mortar|wet concrete)\b/i,
  'Gases (LPG, acetylene, oxygen)': /\b(lpg|gas torch\w*|acetylene)\b/i,
  'Respirable crystalline silica (concrete, masonry, tile and stone dust)': /\b(?:respirable crystalline silica|silica dust)\b/i,
};

function substancesFor(text, safetyDataSheet, controlText = '') {
  const found = SUBSTANCES.filter(([product, pattern]) => pattern.test(text) || (CONTROL_PRODUCTS[product] && CONTROL_PRODUCTS[product].test(controlText))).map(([product]) => ({ product, sds: '', quantity: '' }));
  return { items: found, note: safetyDataSheet || '' };
}

// Trade licences come from the task itself, not from controls that mention other
// trades' work. Training for a hazard comes from the hazards in the steps.
const TASK_LICENCES = /^(Gas work licence|Electrical work licence|Plumbing and drainage licence|Refrigerant handling|Licensed asbestos|Pest management|Traffic controller|Chainsaw|Commercial operator)/;

function qualificationsFor(taskText, hazardText, allText, plant, highRisk = [], silicaText = hazardText) {
  const needed = QUALIFICATIONS.filter(([name, pattern]) => {
    if (/^Confined space/.test(name)) return highRisk.some((item) => /confined space/i.test(item));
    if (/harness/.test(name)) return /\b(use (?:a )?(?:harness|travel restraint)|fall arrest is used|harness is attached|travel restraint is installed)\b/i.test(allText.replace(/\b(?:where|if|when)\b[^.]*/gi, ""));
    return pattern.test(TASK_LICENCES.test(name) ? ownWork(taskText) : /silica/.test(name) ? silicaText : /Hot work/.test(name) ? hazardText : allText);
  }).map(([name]) => name);
  if (highRisk.some((item) => /energised electrical/i.test(item)) && !needed.some((name) => /^Rescue/.test(name))) needed.push('Rescue and resuscitation (low voltage rescue and CPR), current');
  for (const item of plant) {
    if (item.item === 'Mobile scaffold') needed.push('Scaffolding licence (SB), only where a person or object could fall more than 4 m from the mobile scaffold');
    if (/^Yes/.test(item.licence)) needed.push(`High risk work licence: ${item.item.toLowerCase()} (${item.licence.split('. ')[0].replace(/^Yes,?\s*/, '').replace(/^\((.*)\)$/, '$1')})`);
  }
  // Dogging or rigging by this crew; where the crane company's crew slings, it holds the licences.
  if (/\b(our (?:licensed )?(?:riggers?|doggers?|dogman)|we sling|our crew slings|rigging work|dogging)\b/i.test(allText) || /\b(rigg\w*|dogg\w*|sling\w*)\b/i.test(taskText)) needed.push(/\bstructural steel|steel erect\w*|steelwork\b/i.test(allText) ? 'High risk work licence: basic rigging (RB) or higher, for structural steel erection' : 'High risk work licence: dogging or rigging (DG, RB, RI or RA)');
  return [...new Set(needed)];
}

function emergencyFor(text, input, highRisk, plant = [], coreText = text) {
  const ewp = plant.some((item) => /elevating work platform|Scissor lift/.test(item.item));
  const rows = [];
  rows.push({ type: 'Emergency', equipment: 'Call 000. Site emergency procedure and muster point', detail: input.musterPoint || '' });
  rows.push({ type: 'Fire', equipment: /\b(hot work|weld\w*|torch\w*|brazing|grinding|oxy|lpg|electric\w*)\b/i.test(text) ? 'Fire extinguisher suited to the hazard (dry powder or CO2 near electrical equipment)' : 'Fire extinguisher', detail: '' });
  rows.push({ type: 'Injury', equipment: `First aid kit${input.firstAider ? `. First aider: ${input.firstAider}` : '. First aider: ____'}`, detail: input.hospital ? `Nearest hospital: ${input.hospital}` : '' });
  if (highRisk.some((item) => /falling more than/i.test(item)) || /\b(harness|elevating work platforms?|ewps?|boom lifts?)\b/i.test(text)) {
    rows.push({ type: 'Work at height', equipment: ewp ? 'Rescue plan for a person stuck or suspended at height, including the EWP\'s ground controls and rescue equipment' : 'Rescue plan for a person who falls or is injured at height, including from an edge, opening or scaffold, and for a person suspended in a harness where harnesses are used', detail: '' });
  }
  // Power lines named in the task or a hazard, not the general check-for-lines control.
  if (/\b(?:overhead |power |electric )(?:power |electric )?lines?\b/i.test(coreText)) rows.push({ type: 'Contact with power lines', equipment: 'Keep everyone well clear of a person, plant or load in contact with a line. Call 000 and the network operator. The operator stays in the plant unless there is fire', detail: '' });
  if (highRisk.some((item) => /energised electrical/i.test(item)) || /\b(energised parts?|live cables?|energised cables?|live electrical parts?)\b/i.test(text)) rows.push({ type: 'Electric shock or arc flash', equipment: 'Isolate the supply before touching the person. Low voltage rescue kit, CPR and defibrillator (AED), burns first aid', detail: '' });
  if (highRisk.some((item) => /trench|shaft/i.test(item))) rows.push({ type: 'Trench', equipment: 'Rescue plan for a trench collapse (Excavation work Code of Practice s 3.8). No one enters an unsupported trench to rescue', detail: '' });
  if (highRisk.some((item) => /confined space/i.test(item))) rows.push({ type: 'Confined space', equipment: 'Rescue plan and equipment, started from outside the space', detail: '' });
  if (/\bstrik\w* [^.]{0,40}\b(?:underground|buried|hidden)?\s?(?:services?|cables?|gas|electrical)/i.test(text) && !rows.some((row) => /Electric shock/.test(row.type))) rows.push({ type: 'Service strike', equipment: 'Stop work and keep everyone clear. Electrical: do not touch the person or plant until the supply is isolated; CPR and defibrillator (AED). Gas: evacuate upwind, no ignition sources. Call 000 and the asset owner', detail: '' });
  else if (/\bstrik\w* [^.]{0,40}\b(?:services?|gas)/i.test(text)) rows.push({ type: 'Service strike', equipment: 'Stop work and keep everyone clear. Gas: evacuate upwind, no ignition sources. Call 000 and the asset owner', detail: '' });
  if (/\b(gas work|gas fitting|gasfitt\w*|gas appliances?|gas (?:lines?|supply|hot water)|lpg)\b/i.test(text)) rows.push({ type: 'Gas leak', equipment: 'Turn off the gas at the meter or cylinder, no ignition sources, ventilate, keep people away. Call 000 for a major leak', detail: '' });
  if (/\brefrigerants?\b/i.test(text)) rows.push({ type: 'Refrigerant release', equipment: 'Ventilate and leave the area. Frostbite (cold burn): flush with lukewarm water and get medical help', detail: '' });
  if (/\b(chainsaws?|angle grinders?|cut-off saws?)\b/i.test(text)) rows.push({ type: 'Severe bleeding', equipment: 'Trauma first aid kit with pressure bandages, close to the work', detail: '' });
  if (/\b(chemicals?|solvents?|cement|epoxy|acid)\b/i.test(text)) rows.push({ type: 'Chemical splash', equipment: 'Eye wash and running water, and the safety data sheets', detail: '' });
  return rows;
}

// The legislation and codes cited in the steps and controls, grouped.
function legislationFor(lines) {
  const sources = new Set();
  for (const line of lines) {
    const match = /\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*$/.exec(line);
    if (!match) continue;
    for (const part of match[1].split(/;\s*/)) {
      const title = part.replace(/\s+(?:s|ss|schedule|appendix|part|chapter|table|section)\s.*$/i, '').trim();
      if (/\b(Act|Regulation|Regulations|Code|Rules|standard|Council)\b/i.test(title)) sources.add(title);
    }
  }
  const all = [...sources].sort();
  return {
    legislation: all.filter((title) => !/\b(Code|standard|Council)\b/i.test(title)),
    codes: all.filter((title) => /\b(Code|standard|Council)\b/i.test(title)),
  };
}

// Queensland codes and Acts that apply because of the work itself, whether or
// not a step cites them.
const QLD_SOURCES = [
  [(d) => d.highRisk.some((item) => /falling more than/i.test(item)), 'Managing the risk of falls at workplaces Code of Practice 2021 (Qld)'],
  [(d) => d.highRisk.some((item) => /trench|shaft/i.test(item)) || d.plant.some((p) => /Excavator|Trench shield/.test(p.item)), 'Excavation work Code of Practice 2021 (Qld)'],
  [(d) => d.plant.some((p) => /Concrete (?:placing boom|line pump)/.test(p.item)), 'Concrete pumping Code of Practice 2019 (Qld)'],
  [(d) => d.plant.some((p) => !/Ladders|Electric power tools/.test(p.item)), 'Managing risks of plant in the workplace Code of Practice 2021 (Qld)'],
  [(d) => d.hazardText.match(/\b(strain|manual|lifting|carry\w*|kneel\w*|repetit\w*|awkward)\b/i), 'Hazardous manual tasks Code of Practice 2021 (Qld)'],
  [(d) => d.hazardText.match(/\bnoise\b/i), 'Managing noise and preventing hearing loss at work Code of Practice 2021 (Qld)'],
  [(d) => d.substances.items.length, 'Managing risks of hazardous chemicals in the workplace Code of Practice 2021 (Qld)'],
  [(d) => d.hazardText.match(/\bsilica\b/i), 'Managing respirable crystalline silica dust exposure in construction and manufacturing of construction elements Code of Practice 2022 (Qld)'],
  [(d) => d.highRisk.some((item) => /confined space/i.test(item)), 'Confined spaces Code of Practice 2021 (Qld)'],
  [(d) => d.plant.some((p) => /Scaffold/.test(p.item)), 'Scaffolding Code of Practice 2021 (Qld)'],
  [(d) => d.highRisk.some((item) => /energised electrical/i.test(item)) || /\b(electrical work|electricians?|switchboards?|wiring)\b/i.test(ownWork(d.text)), 'Electrical Safety Code of Practice 2021: Managing electrical risks in the workplace (Qld)'],
];

function addQldSources(sources, d) {
  const codes = new Set(sources.codes);
  for (const [applies, title] of QLD_SOURCES) if (applies(d)) codes.add(title);
  const legislation = new Set(['Work Health and Safety Act 2011 (Qld)', ...sources.legislation]);
  if (/\b(electrical work|electricians?|energised|switchboards?|wiring|cabling)\b/i.test(ownWork(d.text))) legislation.add('Electrical Safety Act 2002 (Qld)');
  return { legislation: [...legislation].sort(), codes: [...codes].sort() };
}

function registersFor(draft, input = {}) {
  const steps = draft.jobSteps || [];
  const task = draft.task || '';
  const hazardText = steps.flatMap((step) => step.hazards).join('\n');
  const allText = `${task}\n${steps.flatMap((step) => [step.step, ...step.hazards, ...step.controls]).join('\n')}`;
  // Plant the crew uses: named in the task, the answers and controls table, the
  // step names or the hazards, not every control line that mentions plant to keep
  // clear of.
  const useText = `${task}\n${(draft.controls || []).map((item) => item.text).join('\n')}\n${steps.map((step) => step.step).join('\n')}\n${hazardText}`;
  // Control lines that say the crew uses plant, not the ones about keeping clear of it.
  const usedInControls = steps.flatMap((step) => step.controls).filter((line) => /^(?:Use|Using)\b|\b(?:are|is) (?:run|used|operated) by\b|\bcut with\b/i.test(line) && !/\b(keep|clear of|away from|others|crane company|pumping company)\b/i.test(line));
  const forkliftLines = steps.flatMap((step) => step.controls).filter((line) => /\b(forklifts?|telehandlers?)\b/i.test(line) && !/\b(keep|clear of|away from|exclusion|near)\b/i.test(line));
  // A forklift or telehandler named only in a control line may or may not be used, so its licence is conditional.
  const named = plantFor(`${useText}\n${usedInControls.join('\n')}`).map((item) => item.item);
  const maybe = plantFor(forkliftLines.join('\n')).filter((item) => /^(Forklift|Telehandler)$/.test(item.item) && !named.includes(item.item)).map((item) => ({ ...item, licence: `${item.licence}, where one is used` }));
  const plant = [...plantFor(`${useText}\n${usedInControls.join('\n')}`), ...maybe].map((item) => othersLicence(item, allText, task));
  const substances = substancesFor(`${task}\n${hazardText}\n${steps.map((step) => step.step).join('\n')}`, (input.facts || {}).safetyDataSheet, steps.flatMap((step) => step.controls).join('\n'));
  let sources = legislationFor([...steps.flatMap((step) => step.controls), ...(draft.controls || []).map((item) => item.text)]);
  if (/Queensland/.test(draft.state || '')) sources = addQldSources(sources, { highRisk: draft.highRisk || [], plant, substances, hazardText, text: allText });
  return {
    plant,
    substances,
    // Silica training where a step's hazards are silica dust, or dust its controls treat as crystalline silica.
    qualifications: qualificationsFor(task, hazardText, allText, plant, draft.highRisk || [], steps.filter((step) => step.hazards.some((line) => /\bsilica\b/i.test(line)) || (step.hazards.some((line) => /\bdust\b/i.test(line)) && step.controls.some((line) => /\bcrystalline silica\b/i.test(line)))).map(() => 'silica dust').join(' ')),
    emergency: emergencyFor(allText, input, draft.highRisk || [], plant, `${task}\n${hazardText}`),
    sources,
    // Before starting is checks and briefings, not a work step, so it is not rated.
    jobSteps: steps.map((step) => ({ ...step, risk: step.step === 'Before starting' ? null : riskFor(step) })),
  };
}

module.exports = { registersFor, MATRIX, LIKELIHOOD, CONSEQUENCE, riskFor, legislationFor };
