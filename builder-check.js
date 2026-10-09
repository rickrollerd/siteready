// The builder SWMS check, v1 (tasks #106, #99 and part of #78). A builder or principal
// contractor checks a subcontractor's SWMS: seven hard fails, then 100 points of weighted
// items, a result band, and a copy-and-paste email to the subcontractor. SiteReady never
// sends the email.
//
// The rules are the owner-approved v1 rules of 5 October 2026 ("SiteReady builder check and
// outreach drafts"). Bands: Accepted 90 to 100; Accepted with changes 60 to 89; Not accepted
// below 60 or any hard fail.
//
// Owner decisions of 5 October 2026 (v1.1). Three criteria were added, seen in a tier 1 builder's
// published SWMS review checklist (used as evidence of what tier 1 builders check; nothing is
// copied from it). They fit in the same 100 points, taken from the items they overlap:
//   W10 Controls in hierarchy order within each step (5): from W2, hierarchy (20 to 15).
//   W11 A responsible position per step (5): 3 from W4, which gave 3 for one responsible person
//       for the whole SWMS (H6 still requires that person), 10 to 7; 2 from W3, checkable (15 to 13).
//   W12 Named permits where the work needs one (5): 3 from W3, which counted any permit as a
//       checkable detail (13 to 10); 2 from W5, licences and authority to do the work (10 to 8).
// Then: W1 15, W2 15, W3 10, W4 7, W5 8, W6 10, W7 10, W8 5, W9 5, W10 5, W11 5, W12 5 = 100.
// A printed risk matrix no longer loses points in W8. "Where reasonably practicable" (the legal
// test in the WHS Act) is not vague wording in H5 or W3.
//
// Owner decisions of 6 October 2026 (v1.2):
//   Q8 (H5) A vague line fails outright only where it is the only control for a high risk hazard
//       in its step. Otherwise it costs points in W3, at least 1 point a line.
//   Q9 (H4) No change: a delivery-only supplier's SWMS gets no exception from being site specific.
//   Q10 (W8) A long legislation list is no longer marked down. W8 judges length by steps and controls.
//   Q11 (W14) Where the SWMS shows chemicals are used, it names the products or product types and
//       carries safety data sheet controls.
//   Q12 (W13) A minimum control set for each high risk category, from the WHS Regulations and the
//       codes of practice SiteReady cites: points lost for each must-have missing. A crane named for
//       a lift needs a lift plan. Extras: dated worker signatures (W9) and operator competency for
//       the plant named (W5). A reason for using a ladder is not asked for.
//   Kept: vague lines in steps that name no high risk work cost points in W3 but do not fail H5.
// The 100 points were rebalanced to fit W13 and W14. W8 gave up the 3 points of its legislation
// list (5 to 2). W1 (15 to 12), W2 (15 to 12), W6 (10 to 8), W7 (10 to 8), W4 (7 to 6), W10 and
// W11 (5 to 4) each gave a share, and W9 took 1 for dated signatures (5 to 6).
// Now: W1 12, W2 12, W3 10, W4 6, W5 8, W6 8, W7 8, W8 2, W9 6, W10 4, W11 4, W12 5, W13 12, W14 3 = 100.
//
// Goal 2 (owner, 7 October 2026): H8, a blank (____) or a "To be completed" placeholder left anywhere
// the SWMS prints (a control, a hazard, the plant, the emergency arrangements or a field) is a
// must-fix item, as a reviewer would fail it. Such a line no longer reads as a pass.
//
// The SWMS comes in one structured form, whatever its source (an AI reading of an uploaded
// document, or a SiteReady draft):
// { state, task, fallRisk, site: { address, conditions[] }, highRisk[], steps[{ step, hazards[], controls[], responsible }],
//   ppe[], responsiblePerson, consultation, signatures[{ name, date }], revision, date, reviewDate,
//   principalContractor, licences[], plant[], emergency[], review, legislation[], riskMatrix }
const { findState, highRiskList } = require('./legislation');
const { highRiskMatches, domesticWork } = require('./draft');
const { leftOpen } = require('./blanks');

const BANDS = { accepted: 'Accepted', changes: 'Accepted with changes', rejected: 'Not accepted' };

const SOURCES = {
  H1: 'WHS Regulations s 299 and s 300; tier 1 review checklists check each high risk category',
  H2: 'WHS Regulations s 299(3)',
  H3: 'Hierarchy of control (WHS Regulations s 36 and s 78); SafeWork NSW work at heights findings 2023-24',
  H4: 'SafeWork SA high risk construction work audit 2020; WHSQ construction blitz 2023. No exception for a delivery-only supplier (owner decision, 6 October 2026)',
  H5: 'Tier 1 SWMS review checklists; regulator guidance. Fails only where a vague line is the only control for a high risk hazard in its step (owner decision, 6 October 2026)',
  H6: 'Model Code of Practice: Construction Work (how controls are implemented, monitored and reviewed)',
  H7: 'WHS Regulations s 299; WHSQ construction blitz 2023 ("involve workers")',
  H8: 'Tier 1 SWMS review checklists (no blanks, placeholders or leftover template text); goal 2 (owner, 7 October 2026): no SWMS is produced with blanks left in it',
  W1: 'Model Code of Practice: Construction Work (SWMS content); WHSQ construction blitz 2023 (task specific)',
  W2: 'Hierarchy of control (WHS Regulations s 36); Model Code of Practice: Construction Work',
  W3: 'Tier 1 SWMS review checklists; SafeWork NSW campaign findings. Each vague line costs at least 1 point (owner decision, 6 October 2026)',
  W4: 'Model Code of Practice: Construction Work; WHSQ work at heights campaign 2026; Bernie Leen & Sons (Vic, 2016): the SWMS must be revised when the work changes',
  W5: 'WHS Regulations (high risk work licences and plant); SafeWork NSW earthmoving plant findings 2022-23; operator competency (a VOC, licence or ticket) for each plant item named (owner decision, 6 October 2026)',
  W6: 'Model Code of Practice: Construction Work (emergency arrangements); WHS Regulations s 80 (rescue after a fall)',
  W7: 'SafeWork SA high risk construction work audit 2020; WHSQ construction blitz 2023',
  W8: 'Safe Work Australia SWMS information sheet and SWMS tool; OFSC SWMS fact sheet. A printed risk matrix is not marked down (owner decision, 5 October 2026), nor is a list of legislation (owner decision, 6 October 2026)',
  W9: 'Tier 1 SWMS review checklists (revision, dates, principal contractor); WHS Regulations s 299 (workers sign on); a date beside each worker signature (owner decision, 6 October 2026)',
  W10: 'Hierarchy of control (WHS Regulations s 36); Model Code of Practice: Construction Work; a tier 1 builder\'s published SWMS review checklist (evidence that tier 1 builders check the order)',
  W11: 'Model Code of Practice: Construction Work (who implements, monitors and reviews each control); WHS Regulations s 299(3); a tier 1 builder\'s published SWMS review checklist (evidence: a position per step, not one person for the SWMS)',
  W12: 'WHS Regulations s 67 (confined space entry permit), s 166 (overhead and underground electric lines) and s 304 (underground essential services); Model Code of Practice: Construction Work; a tier 1 builder\'s published SWMS review checklist (evidence that tier 1 builders check named permits)',
  W13: 'WHS Regulations part 6.4 (s 304 underground essential services, s 305 managing excavation risks, s 306 trenches 1.5 m or deeper), s 78 to s 80 (falls), s 166 (electric lines), s 69 and s 74 (confined spaces) and chapter 8 (asbestos); the codes of practice SiteReady cites for falls, excavation, electric lines, electrical risks, confined spaces, asbestos, demolition, moving plant, tilt-up and precast, traffic management, silica, cranes and telecommunication towers. A lift plan for each crane lift (owner decision, 6 October 2026)',
  W14: 'WHS Regulations s 344 and s 346 (safety data sheets at hand, the hazardous chemicals register); Managing risks of hazardous chemicals code of practice (labelling, following the safety data sheet) (owner decision, 6 October 2026)',
};

// ---- Reading the structured form ----

const text = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
const list = (value) => (Array.isArray(value) ? value.map((item) => (typeof item === 'string' ? text(item) : item)).filter(Boolean) : []);
// "To be completed", "TBC", blanks and lines of underscores are not an answer. Nor is a template's
// stand-in ("Various sites", "All sites") or a sample's ("Mr Example", "Level 7 Example St").
const PLACEHOLDER = /^(?:to be (?:completed|confirmed|advised)\b.*|tb[cda]|n\/?a|none|nil|-+|_+|\.+|\?+|name:?\s*_*|various\b.*|(?:multiple|all|any|numerous|different)\b[\s–-]*(?:various\s+)?(?:sites?|locations?|projects?|jobs?|workplaces?|addresses)\b.*)$/i;
// A template's "[insert responsible person]" is a stand-in too.
const SAMPLE = /\b(?:example|sample|x{3,}|lorem ipsum|placeholder|insert (?:name|address|here)|insert (?:the )?(?:responsible |competent )?(?:person|position|role)|your (?:name|company|address))\b|\[\s*insert\b[^\]]*\]/i;
const filled = (value) => Boolean(text(value)) && !PLACEHOLDER.test(text(value)) && !SAMPLE.test(text(value)) && !/_{3,}/.test(text(value));
// "All workers who sign on to this SWMS" names the signatories, not a person or position who
// checks the controls (H6, W11).
const ONLY_WORKERS = /^\s*(?:all|each|every|the)?\s*(?:workers?|employees?|persons?|people|personnel|staff|crew(?: members)?|work ?team|team(?: members)?|everyone|operatives?)\b/i;
// "All PCBUs/Employers" names businesses, not a person or position (H6, W11).
const ONLY_BUSINESSES = /^\s*(?:all|each|every|the|relevant)?\s*(?:pcbu(?:['’]?s)?|employers?|persons? conducting a business)\b/i;
// "Person Responsible for SWMS Compliance (site foreman)" is the form's label and its answer:
// the answer is read, so the label's "Person" does not read as the workers.
const RESPONSIBLE_LABEL = /^\s*(?:the\s+)?persons?\s+responsible\b(?:\s+for\b[^:(,–-]*)?\s*[:(,–-]?\s*/i;

function normaliseSwms(input = {}) {
  const site = input.site && typeof input.site === 'object' ? input.site : {};
  const signatures = (Array.isArray(input.signatures) ? input.signatures : [])
    .map((item) => (typeof item === 'string' ? { name: text(item), date: '' } : { name: text(item && item.name), date: text(item && item.date) }))
    .filter((item) => filled(item.name))
    // A role printed in the sign-off table with no date (a supervisor or director) is not a sign-on.
    .filter((item) => item.date || !/\b(supervisors?|managers?|directors?|foreman|leading hands?|sign-?off table|printed)\b/i.test(item.name));
  return {
    state: text(input.state),
    task: text(input.task),
    // "Yes" or "No", or a SiteReady answer such as "No. No work is done where ...".
    fallRisk: (/^(yes|no)\b/i.exec(text(input.fallRisk)) || [''])[0].toLowerCase(),
    site: { address: text(site.address || input.siteAddress), conditions: list(site.conditions || input.siteConditions).filter(filled) },
    // Every site condition as written, for blanks and placeholders (H8).
    siteWritten: list(site.conditions || input.siteConditions),
    // Other printed fields the check does not judge, read only for blanks and placeholders (H8).
    otherFields: list(input.otherFields),
    highRisk: list(input.highRisk),
    steps: (Array.isArray(input.steps) ? input.steps : []).filter((item) => item && typeof item === 'object')
      .map((item) => ({ step: text(item.step), hazards: list(item.hazards), controls: list(item.controls), responsible: text(item.responsible) })),
    ppe: list(input.ppe),
    responsiblePerson: text(input.responsiblePerson),
    consultation: text(input.consultation),
    signatures,
    // A revision may be given as a number (0, 1, 2).
    revision: typeof input.revision === 'number' && Number.isFinite(input.revision) ? String(input.revision) : text(input.revision),
    date: text(input.date),
    reviewDate: text(input.reviewDate),
    // "Yes" or "No" where the state asks whether the work is residential construction work.
    residential: text(input.residential),
    principalContractor: text(input.principalContractor),
    licences: list(input.licences),
    plant: list(input.plant),
    emergency: list(input.emergency),
    review: text(input.review),
    legislation: list(input.legislation),
    riskMatrix: input.riskMatrix === true,
  };
}

// ---- What each high risk category looks like ----

// A category the SWMS lists, recognised from its own wording.
const NAMED = {
  // "Work at Heights >2m" is how many forms tick the falls category.
  fall: /\bfall|\bwork(?:ing)? (?:at|from) heights?\b/i,
  tower: /\btelecommunications? towers?\b/i,
  demolition: /\bdemoli/i,
  asbestos: /\basbestos\b/i,
  temporary: /\b(temporary support|structural alterations?|propping)\b/i,
  confined: /\bconfined spaces?\b/i,
  trench: /\b(trench|shaft|excavat\w*|tunnel)/i,
  tunnel: /\btunnel/i,
  explosives: /\bexplosive/i,
  gas: /\bgas (?:distribution )?(?:mains|piping|pipes?|lines?)\b|\bpressuri[sz]ed gas\b/i,
  chemicalLine: /\b(chemical|fuel|refrigerant)\b[\w ,]{0,30}\blines?\b/i,
  electrical: /\b(energi[sz]ed|electrical (?:installations?|services?)|live electrical|power ?lines?)\b/i,
  atmosphere: /\batmosphere\b/i,
  precast: /\b(tilt[- ]?up|precast)\b/i,
  road: /\b(roads?|roadways?|railways?|rail|traffic corridor|shipping lane)\b/i,
  // "Mobile equipment" is the same category, and so is "any movement of powered plant" (the
  // regulation's wording without "mobile"); a SWMS that lists concrete boom pumping lists the pump.
  plant: /\bmobile (?:plant|equipment|machinery)\b|\bmov\w* (?:of )?(?:any )?powered plant\b|\bplant (?:movement|moving)\b|\bwork\w* (?:with |around |near |beside )+(?:powered )?(?:mobile )?plant\b|\bconcrete (?:boom )?pump\w*|\bboom pump\w*/i,
  temperature: /\bextremes? of temperature\b|\btemperature extremes?\b/i,
  water: /\bdrown|\b(?:in|near|over|adjacent to) water\b|\b(?:waterways?|creeks?|rivers?|river ?banks?|creek ?banks?|lakes?|dams?|canals?|foreshores?)\b/i,
  diving: /\bdiving\b/i,
  silica: /\bsilica\b/i,
};

// Controls that answer a category: without one, the category has no controls (H2).
const ANSWERS = {
  fall: /\b(guard ?rails?|edge protection|scaffold\w*|ewps?|elevating work platforms?|scissor lifts?|boom lifts?|harness\w*|fall arrest|restraint|safety mesh|catch platforms?|handrails?|covers?|covered|barricad\w*|ladders?|anchor\w*|from the ground|void protection|penetration covers?)\b/i,
  tower: /\b(climb\w*|fall arrest|harness|isolat\w*|radio ?frequency|rf|emr|exclusion)\b/i,
  demolition: /\b(engineer\w*|demolition (?:plan|sequence|work plan)|sequence|propp(?:ed|ing)|exclusion zones?|structural)\b/i,
  asbestos: /\b(asbestos|licensed|removalist|clearance|wet\w*|hepa)\b/i,
  temporary: /\b(propp(?:ed|ing)|props?|temporary support|engineer\w*|shor(?:e|es|ed|ing)|brac\w*)\b/i,
  confined: /\b(permit|gas test\w*|atmospher\w*|standby|stand-by|rescue|ventilat\w*|entry)\b/i,
  trench: /\b(shor\w*|shields?|trench box\w*|batter\w*|bench\w*|engineer\w*|barriers?|barricad\w*|exclusion|edge protection|fenc\w*)\b/i,
  tunnel: /\b(engineer\w*|support|ventilat\w*|rescue|exclusion)\b/i,
  explosives: /\b(shot ?firer|blast\w*|exclusion|licen\w*|explosives?)\b/i,
  gas: /\b(isolat\w*|purg\w*|leak test\w*|locat\w*|before you dig|gas fitter|shut ?off)\b/i,
  chemicalLine: /\b(isolat\w*|purg\w*|drain\w*|depressuri\w*|recover\w*|locat\w*|permit)\b/i,
  electrical: /\b(isolat\w*|de-?energi[sz]\w*|lock ?out|lockout|tag ?out|danger tags?|test before (?:you )?touch|test for dead|clearances?|approach distances?|spotters?|safety observers?|observers?|exclusion|rcds?|locat\w*|before you dig|insulated|no go zones?|\d+(?:\.\d+)? ?m (?:from|away|clear))\b/i,
  atmosphere: /\b(ventilat\w*|gas (?:test\w*|detectors?|monitor\w*)|atmospher\w*|ignition|extraction|respirators?)\b/i,
  precast: /\b(erection (?:design|sequence|plan)|brac\w*|cranes?|riggers?|doggers?|exclusion|engineer\w*)\b/i,
  road: /\b(traffic (?:management|control|guidance)\w*|tgs|tmp|barriers?|barricad\w*|traffic controllers?|cones|signs?|signage|exclusion|spotters?)\b/i,
  plant: /\b(exclusion|spotters?|traffic|separat\w*|pedestrians?|operators?|licen\w*|reversing|beacons?|plant|barricad\w*)\b/i,
  temperature: /\b(heat|cold|hydrat\w*|rest breaks?|breaks?|temperatures?|ventilat\w*|cool\w*)\b/i,
  water: /\b(life ?(?:jackets?|rings?|buoys?)|rescue|drown\w*|barriers?|barricad\w*|pfds?|buoyancy)\b/i,
  diving: /\bdiv\w*/i,
  silica: /\b(extraction|wet\w*|water suppression|on-tool|respirators?|vacuum\w*|silica)\b/i,
};

// A physical fall control (H3): what stops the fall, not a harness, a ladder, a barricade under
// the work or an isolation elsewhere in the step. Working from the ground removes the fall, and a
// barricade or fence at a trench, hole or edge stops a fall into it.
const PHYSICAL_FALL = /\b(guard ?rails?|edge protection|scaffold\w*|ewps?|elevat\w* work platforms?|scissor ?lifts?|boom lifts?|cherry pickers?|(?:mobile |temporary )?work(?:ing)? platforms?|safety (?:mesh|nets?)|catch (?:platforms?|scaffold\w*|decks?)|handrails?|roof rails?|perimeter (?:screens?|protection)|edge screens?|void protection|(?:void|penetration|hole|opening)s? covers?|cover\w* (?:all |the |any )?(?:voids?|penetrations?|openings?|holes?|skylights?)|(?:skylight|fragile roof) (?:covers?|mesh|guards?)|from the ground|stay\w* on the ground|(?:assembl|fabricat|buil)\w* (?:\w+ )?(?:on|at) (?:the )?ground(?: level)?|do not place a person)\b|\b(?:barricad\w*|fenc\w*|barriers?)\b[^.]{0,30}\b(?:trench\w*|excavat\w*|holes?|openings?|voids?|pits?|edges?|penetrations?|shafts?)\b|\b(?:trench\w*|excavat\w*|holes?|openings?|voids?|pits?|edges?|penetrations?|shafts?)\b[^.]{0,30}\b(?:barricad\w*|fenc\w*|barriers?)|\b(?:holes?|openings?|hatch\w*|voids?|penetrations?)\b[^.]{0,30}\b(?:protected|guarded)\b/i;
// "No edge protection" or "without a scaffold" says it is not there.
const NO_FALL_CONTROL = /\b(?:no|without|absence of|lack of|not (?:installed|provided|available))\b[^.,;]{0,20}\b(?:guard ?rails?|edge protection|scaffold\w*|ewps?|handrails?|safety mesh)\b/i;
// A step whose name or hazards point to work at height (H5). "Slips, trips and falls" are on one level.
const FALL_STEP = /\b(falls?|falling|heights?|roofs?|edges?|ladders?|scaffold\w*|voids?|openings?|ewps?|elevat\w*|platforms?|harness\w*)\b/i;
const SAME_LEVEL = /\bslips?,?\s*(?:trips?,?\s*)?(?:and|&|or)\s*falls?\b/gi;

// Where a control sits in the hierarchy: the same ranking draft.js orders each step's controls by.
const { controlLevel, HIGHER } = require('./control-level');

// Wording that leaves the decision to the worker (H5).
const VAGUE = /\b(?:appropriate|suitable|adequate|relevant|proper|necessary|correct|required) (?:ppe|controls?|precautions?|equipment|measures|care|protection|safety (?:gear|equipment))\b|\btake (?:due |extra |all |reasonable )?care\b|\bas (?:required|needed|necessary|appropriate)\b|\b(?:where|when|if) (?:required|necessary|needed|possible|practical|appropriate)\b|\bbe (?:careful|aware|vigilant|mindful|alert)\b|\bcommon sense\b|\bwatch (?:out|your step)\b|\bremain (?:alert|vigilant)\b|\bwhere practicable\b|\b(?:workers?|operators?|crew|staff|everyone|all persons|persons|people) (?:to|should|must|will|are to) (?:be aware|take care|be careful|use caution|watch out|stay alert)\b|\b(?:supervisors?|leading hands?|foreman|foremen|site managers?) (?:to|will|should|must) ensure\b|\buse (?:caution|care)\b|\bbe aware of\b|\bcorrect (?:lifting )?techniques?\b|\blift(?:ing)? correctly\b|\bproper lifting(?: techniques?)?\b|\blook out for\b|\bkeep an eye (?:on|out)\b|\bin the event of an? (?:unexpected|unforeseen|unplanned) (?:risk|hazard|event|occurrence|situation)\b|\b(?:where|when|if|as) deemed (?:necessary|appropriate|required|needed)\b|\b(?:using|exercis\w*|with) (?:extreme |due |great )?caution\b/i;

// Measurable or checkable detail: a distance or rating, a standard, an inspection, a permit or a licence.
const CHECKABLE = /\b\d+(?:\.\d+)?\s?(?:mm|m|metres?|kg|t|tonnes?|kv|v|volts?|kpa|%|°c?|degrees|minutes?|hours?|days?|months?|lux|db\(?a?\)?|µm|um|microns?)\b|\b(?:hepa|h[- ]class|p[123]|type [56]|air monitoring|(?:occupational )?hygienists?|clearance (?:certificates?|inspections?))\b|\bAS(?:\/NZS)?\s?\d{3,}|\b(inspect\w*|tested|tags?|tagged|permits?|licen[cs]\w*|certificates?|certified|engineer'?s? design|drawings?|pre-?start|log ?books?|checklists?|signed off|verified|rated)\b/i;
// Named equipment counts as checkable too: it is there on site or it is not. So does a crane's
// set-up (outriggers extended on pads, the hopper grille closed) and no one under the load.
const NAMED_EQUIPMENT = /\b(guard ?rails?|edge protection|scaffold\w*|ewps?|elevating work platforms?|scissor lifts?|boom lifts?|safety mesh|catch platforms?|trench (?:shields?|box\w*)|shoring|props?|hoardings?|para-?webbing|harness\w*|life ?jackets?|gas detectors?|(?:dust )?extraction|h-class vacuum\w*|rcds?|lock ?out|isolation locks?|spotters?|traffic controllers?|safety observers?|tag lines?|outriggers?|stabilisers?|(?:outrigger|crane|packing) (?:pads?|mats?|plates?)|(?:hopper )?grilles?|wheel chocks?)\b|\b(?:no(?: one| person| persons| people| personnel| workers?)|nobody|never)\b[^.]{0,30}\bunder (?:the |a |any )?(?:suspended )?(?:loads?|booms?|hooks?)\b/i;
// "Where reasonably practicable" and "so far as is reasonably practicable" are the legal test in
// the WHS Act (s 17 and s 18), not vague wording. "As needed", "where necessary" and the like still are.
const REASONABLY_PRACTICABLE = /\b(?:so far as is |as far as is |where |when |if |unless |not )?reasonably practicable\b/gi;
// "Appropriate PPE (long sleeve shirt, long pants, safety footwear)" names the PPE, and so does
// "Appropriate PPE to be worn e.g. gloves, safety glasses, safety boots".
const PPE_LISTED = /\b(?:appropriate|suitable|adequate|relevant|proper|necessary|correct|required) (?:ppe|personal protective equipment|protective (?:equipment|clothing)|safety (?:gear|equipment))\b(?=[^.]*?(?:\(|:|\bincluding\b|\bi\.?e\.?|\be\.?g\.?(?![a-z])|\bnamely\b|\s[-–]\s)[^.]*?\b(?:gloves?|glasses|goggles|boots|footwear|hard ?hats?|helmets?|respirators?|p[123]\b|masks?|ear ?(?:plugs|muffs)|hearing protection|hi-?vis\w*|high visibility|long[- ]sleeved?|shirts?|pants|trousers|face shields?|aprons?|overalls|coveralls|harness\w*)\b)/gi;
// "Be aware of overhead lines; keep the boom 6 m clear" is followed by the control itself.
const AWARE = /\b(?:(?:workers?|operators?|crew|staff|everyone|all persons|persons|people) (?:to|should|must|will|are to) )?be (?:aware|mindful) of\b/i;
const ACTION = /^\s*(?:then |also )?(?:avoid|keep|maintain|stay|use|install|erect|fit|place|put|barricade|isolate|stop|wear|do not|don't|never|no one|position|secure|lock|tie|cover|test|follow|establish|set up|switch off|turn off|de-?energi[sz]e|shut|lower|park|chock|delineate|fence|close|clear|stand|work from)\b/i;
function withoutAwarenessBeforeAction(line) {
  const match = AWARE.exec(line);
  if (!match) return line;
  const rest = line.slice(match.index + match[0].length).split(/[,;:]|\s[-–]\s|\band\b|\bthen\b|\.\s/i).slice(1);
  return rest.some((part) => ACTION.test(part)) ? `${line.slice(0, match.index)} ${line.slice(match.index + match[0].length)}` : line;
}
// "Where possible asbestos materials remain" means where they may remain; "licensed and VOC'd as
// required" keeps the licence firm; "as required (weekly)" gives how often; a step that plans an
// assessment ("Assess the exposure to noise and determine the controls required") is not a
// control left to the worker.
const NOT_VAGUE = /\bwhere possible\s+(?:\w+\s+){0,3}(?:remain|exist|(?:is|are|may be) present)\w*\b|\b(?:licen[cs]ed|ticketed|trained|competent|voc'?d|voc’d|accredited)\b[^.]{0,30}\bas required\b|\bas required\s*[(,–-]?\s*(?:daily|weekly|fortnightly|monthly|each (?:day|shift|week|month)|every \d+ (?:days?|weeks?|months?))\b\)?/gi;
const ASSESSMENT = /^\s*(?:assess|conduct|carry out|complete|undertake)\b[^.]*\b(?:assessments?|surveys?|monitoring|exposure)\b/i;
const isVague = (line) => !ASSESSMENT.test(String(line)) && VAGUE.test(withoutAwarenessBeforeAction(String(line).replace(REASONABLY_PRACTICABLE, ' ').replace(PPE_LISTED, ' ').replace(NOT_VAGUE, ' ')));

const checkable = (line) => CHECKABLE.test(line) || NAMED_EQUIPMENT.test(line);

// Plant that needs a licence, and the licence wording that answers it (W5).
const OPERATOR_COMPETENT = /\b(voc'?s?|voc'?d|voc’d|verification of competen\w*|licen[cs]\w*|tickets?|ticketed|competen\w*|assessed as competent|trained and assessed|operator (?:cards?|tickets?)|yellow card|hrw|high risk work|accredit\w*|qualified)\b/i;
// A plant item named in a line, singular or plural ("Excavator" in "Excavator VOC", "excavators"),
// or by its first words ("skid steer loaders" in "Skid steer or posi-track: VOC").
const namesPlant = (name, line) => [name, name.split(' ').slice(0, -1).join(' ')].filter(Boolean)
  .some((words) => new RegExp(`\\b${words.replace(/s$/i, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(line));
const ALL_OPERATORS = /\b(?:all |each |every )?(?:plant|machinery|machine|equipment|mobile plant) (?:operators?|is operated|are operated)\b|\boperators? of (?:all |any )?(?:plant|machinery|equipment)\b/i;
const LICENSED_PLANT = [
  { plant: /\b(mobile |crawler |tower |franna |slewing )?cranes?\b/i, licence: /\b(c[0-9]|cn|cv|ct|c2|c6|c1|crane|dogg\w*|rigg\w*|d[gs]|r[bia]|hrw|high risk work)\b/i },
  { plant: /\bforklifts?\b/i, licence: /\b(lf|forklift|hrw|high risk work)\b/i },
  { plant: /\b(boom lifts?|boom-type)\b/i, licence: /\b(wp|boom|ewp|hrw|high risk work|yellow card)\b/i },
  // No licence for a scissor lift: the operator is trained and competent for it (an EWP operator card or a verification of competency),
  // shown beside the scissor lift (owner decision, 6 October 2026).
  { beside: true, plant: /\bscissor lifts?\b/i, licence: /\b(competen\w*|trained|ewp operator|operator (?:card|ticket)|yellow card|verification of competency|voc)\b/i },
  { plant: /\bscaffold\w*\b/i, licence: /\b(s[bia]|scaffold\w*|hrw|high risk work)\b/i },
  // Removal needs a removal licence; sampling and surveys are an assessor's or competent person's work.
  { plant: /\b(?:remov\w*|strip\w*|demoli\w*|disturb\w*)\b[^.\n]{0,40}\basbestos\b|\basbestos\b[^.\n]{0,40}\b(?:remov\w*|strip\w*)/i, licence: /\b(asbestos remov\w*|class [ab]|removalist|(?:aswa|ar[ab])\d*|removal licen\w*)\b/i },
  { plant: /\basbestos\b[^.\n]{0,40}\b(?:sampl\w*|survey\w*|assess\w*|inspect\w*|clearance\w*|air monitoring)\b|\b(?:sampl\w*|survey\w*|assess\w*)\b[^.\n]{0,40}\basbestos\b/i, licence: /\b(asbestos assessors?|licensed assessors?|laa\s?\d*|occupational hygienists?|competent persons?|asbestos (?:sampling|awareness|identification) (?:training|course|competenc\w*))\b/i },
  // Electrical work, not work near an installation; extra-low voltage cabling is not it either.
  { plant: /\b((?<!non[- ])electrical (?:work|installation work)|rewir\w*|wiring work|switchboard (?:work|upgrades?|replacements?)|(?:install|connect|terminat|replac|upgrad|modif|wir)\w*\b[^.\n]{0,30}\b(?:switchboards?|distribution boards?|circuits?|power points?|gpos?))\b/i, licence: /\b(electrical (?:contractor|worker|licen\w*)|electrician|a[- ]grade|licensed electrical|(?:ec|el)\s?\d{4,}|electrical licen[cs]e (?:no|number)|cec[- ]accredit\w*|clean energy council|saa accredit\w*|solar accredit\w*)\b/i },
  // Owner decision (6 October 2026, Q12): the operator of each plant item named holds a VOC, licence
  // or ticket for it, shown beside the plant (W5). A bare "operator" is not one. A roller here is a
  // compaction roller: not a roller door, a paint roller or a cable roller.
  { beside: true, plant: /\b(excavators?|skid ?steer(?:s| loaders?)?|bobcats?|(?:front[- ]end |wheel |track )?loaders?|backhoes?|posi-?tracks?|(?:vibrating|smooth drum|padfoot|ride-on|road|compaction|drum|steel drum|multi-tyred|pneumatic) rollers?|dozers?|graders?|telehandlers?|trenchers?|tractors?|dump ?trucks?|dumpers?|water (?:carts?|trucks?)|tip(?:per)? trucks?|tippers?|agitators?|concrete (?:boom |line )?pumps?|boom pumps?|line pumps?|(?:piling|drill(?:ing)?|bored pil\w*|cfa) rigs?|(?:materials?|personnel|builders?) hoists?|vacuum (?:excavators?|trucks?)|hydro-?vac\w*|(?:road |street )?sweepers?|crane trucks?|hiabs?|vehicle loading cranes?|ewps?|elevat\w* work platforms?)\b/i, licence: OPERATOR_COMPETENT },
];
// Work that needs a named permit (W12): what the work looks like, and the permit that answers it.
// Read from the task, the step names and the high risk work listed, not from the hazards, which
// often name what may be there. Isolation is read from the task and step names only: the high risk
// category "energised electrical installations or services" also covers work near lines. Roof
// access needs a permit only where the SWMS says the site runs a permit system. Cutting or grinding
// metal throws sparks, so it is hot work wherever the SWMS says it is done, controls included; so is
// oxy-fuel or gas cutting named in a control ("vests off before using oxy acetylene"). Welding is not
// read from controls: they name it in passing ("inspect components for welding defects").
const SITE_PERMITS = /\b(site permit (?:system|process)|(?:work )?permit (?:to work )?system|permits? (?:issued )?by the principal contractor|principal contractor'?s? permits?)\b/i;
const PERMITS = [
  { label: 'hot work', name: 'a hot work permit',
    work: /\b(hot works?|weld(?:ing|ed|s)?|braz\w*|solder\w*|oxy[- ]?(?:acetylene|propane|cutting)|gas (?:cutting|torch\w*)|thermal cutting|cutting torch\w*|torch[- ]on)\b/i,
    process: /\b(oxy[- ]?(?:acetylene|propane|cutting|fuel)|gas cutting|thermal cutting|cutting torch\w*)\b/i,
    sparks: /\b(?:(?:using|use|with|by) (?:an? |the )?angle grinders?|angle grinding|(?:cut\w*|grind\w*)\b[^.]{0,30}\b(?:metal|steel|bolts?|rebar|reo(?:bar)?)\b[^.]{0,30}\b(?:grinders?|cut-?off (?:saws?|wheels?)|discs?)|(?:cut\w*|grind\w*)\b[^.]{0,40}\bsparks?|sparks?\b[^.]{0,40}\b(?:cut\w*|grind\w*))\b/i,
    // Not hot work: heat or solvent welded vinyl and plastic seams, and painting or coating welds.
    ignore: /\b(?:(?:heat|hot air|solvent|plastic|poly|vinyl|seam)[- ]?weld\w*|weld\w* (?:the )?(?:vinyl|seams?|joins)|(?:heat|hot air|solvent)[- ]welded \w+(?: \w+)?|(?:paint\w*|touch\w* up|coat\w*|seal\w*|prime\w*|blend\w*) (?:the |all |any )?(?:\w+ )?welds?)\b/gi,
    permit: /\bhot works? permits?\b/i },
  { label: 'confined space entry', name: 'a confined space entry permit',
    work: /\bconfined spaces?\b/i,
    permit: /\b(?:confined space (?:entry )?|entry )permits?\b/i },
  { label: 'excavation or digging near services', name: 'an excavation or dig permit',
    work: /\b(excavat\w*|trench\w*|dig(?:s|ging)?|pot[- ]?hol\w*|post holes?|auger\w*|directional drill\w*|bor(?:e|ing) under)\b/i,
    near: /\b(services?|cables?|pipes?|gas|mains|power|electric\w*|before you dig|dbyd|byda)\b/i,
    permit: /\b(?:excavation|dig(?:ging)?|ground (?:disturbance|penetration)|penetration) permits?\b|\bpermits? to (?:dig|excavate)\b/i },
  { label: 'work near overhead or underground electric lines', name: 'a permit to work near the lines, or the network operator\'s written permission',
    work: /\b(overhead (?:power|electric\w*|service)? ?(?:lines?|cables?|wires?|mains)|power ?lines?|electric lines?|underground (?:power|electric\w*) (?:cables?|lines?|mains))\b/i,
    // Kept outside the approach distance (no go zone), the work needs no permit near the lines.
    outside: /\b(?:keep\w*|maintain\w*|observ\w*|stay\w*|remain\w*|work\w*|compl\w* with|outside|beyond|clear of)\b[^.]{0,40}\b(?:approach distances?|no[- ]go zones?|safe (?:working|approach) distances?|exclusion zones? (?:for|around|from) (?:the )?(?:overhead |power |electric\w* )*lines?)\b/i,
    permit: /\b(permits? to work|work permits?|(?:electrical|vicinity|access|clearance|no[- ]go zone) (?:permits?|authori[sz]ations?)|access authori[sz]ations?|(?:network|electricity|power|line) (?:operator|owner|entity|distributor|authority|company)'?s? (?:written )?(?:approval|permission|consent|permit|authori[sz]ation)|(?:written )?(?:approval|permission|consent|permit|authori[sz]ation) (?:from|of|by) (?:the )?(?:local )?(?:network|electricity|power|line|asset) (?:operator|owner|entity|distributor|authority|company|provider))\b/i },
  // Domestic work, such as replacing a house's hot water system, needs no isolation permit (owner decision, 5 October 2026).
  { label: 'isolation or lock out of live plant or services', name: 'an isolation permit or permit to work', notFromCategory: true, notDomestic: true,
    work: /\b(isolat\w* (?:the |of )?(?:\w+ ){0,3}(?:plant|machinery|equipment|power|supply|services?|circuits?|switchboards?)|lock ?out|lockout|live (?:plant|machinery)|energi[sz]ed plant)\b/i,
    permit: /\b(isolation (?:permits?|certificates?)|permits? to work|work permits?)\b/i },
  // Work on live electrical parts is not isolated, so the paper for it is a written authorisation
  // for the energised work, backed by a risk assessment, not an isolation permit.
  { label: 'energised electrical work', name: 'a written authorisation for the energised work, with its risk assessment', notFromCategory: true, notDomestic: true,
    work: /\b((?:energi[sz]ed|live) (?:low voltage |lv |electrical )?(?:work|testing|equipment|apparatus|conductors?|parts?|switchboards?|boards?)|work\w* (?:on|near) (?:exposed )?(?:energi[sz]ed|live) (?:electrical|lv|low voltage|parts?|conductors?|equipment|apparatus|circuits?|switchboards?|boards?|installations?)\b)/i,
    // A SWMS that says no work is done on or near energised parts needs no authorisation for it.
    exempt: /\bno (?:electrical )?work is (?:done|carried out) on or near (?:exposed )?(?:energi[sz]ed|live) parts\b|\bno (?:energi[sz]ed|live) (?:electrical )?work\b/i,
    permit: /\b(?:energi[sz]ed|live) (?:electrical )?work (?:permits?|authori[sz]ations?|approvals?)\b|\b(?:authori[sz]ation|approval|permits?)\b[^.]{0,40}\b(?:energi[sz]ed|live) (?:electrical )?work\b|\bwork permits?\b[^.]{0,20}\b(?:energi[sz]ed|live)\b|\brisk assessment\b[^.]*\bauthori[sz]ation\b|\bauthori[sz]ation\b[^.]*\brisk assessment\b/i },
  { label: 'roof access', name: 'a roof access permit', onlyWithSitePermits: true,
    work: /\b(roofs?|roofing)\b/i,
    permit: /\broof (?:access )?permits?\b|\bpermits? (?:for|to) (?:access )?(?:the )?roof\b/i },
];

// "Cut with snips, not a grinder, to avoid sparks" is not hot work, and nor is "no oxy cutting
// from a ladder".
const NO_SPARKS = /\b(?:not|no|never|avoid\w*|without|instead of)\b[^.]{0,20}\b(?:(?:angle )?grind\w*|sparks?)\b/i;
const NO_HOT_WORK = /\b(?:not|no|never|avoid\w*|without|instead of|prohibit\w*)\b[^.]{0,40}\b(?:oxy\w*|(?:gas|thermal) cutting|cutting torch\w*|hot works?)\b/i;
const sentencesOf = (lines) => lines.join('\n').split(/(?<=[.;!?])\s+|\n/);

// What a builder looks for beside the hot work permit (W12).
const HOT_WORK_FIRE = [
  { name: 'a fire watch during and after the work', pattern: /\bfire ?watch\w*\b|\bmonitor\w* (?:the )?(?:work )?area\b[^.]{0,40}\b(?:after|following)\b/i },
  { name: 'a fire extinguisher at the work', pattern: /\b(?:fire )?extinguishers?\b|\bfire[- ]fighting equipment\b|\bfire suppression\b[^.]{0,40}\b(?:charged|tagged|available|at hand|on hand|in date)\b/i },
];

// A position named as responsible for a step's controls (W11). "Workers" alone is not a position.
const POSITION = /\b(supervisors?|leading hands?|foreman|foremen|site managers?|project managers?|works managers?|engineers?|operators?|scaffolders?|riggers?|doggers?|dogm[ae]n|electricians?|removalists?|asbestos assessors?|hygienists?|first aiders?|spotters?|safety observers?|traffic controllers?|competent persons?|stand-?by persons?|permit (?:issuers?|holders?)|gas fitters?|plumbers?|surveyors?|principal contractor|health and safety representatives?|hsrs?|safety (?:officers?|advisers?|managers?)|whs (?:officers?|advisers?|managers?))\b/i;

// A position given the checking in a control (W11).
const CHECKED_BY = new RegExp(`${POSITION.source}\\s+(?:\\w+\\s+){0,2}(?:checks?|inspects?|confirms?|verif\\w*|supervis\\w*|signs? off|approves?|monitors?|is responsible|ensures?)\\b|\\b(?:checked|inspected|supervised|signed off|approved|monitored|verified|confirmed|issued)\\b[^.]{0,20}\\bby (?:the |a |an )?${POSITION.source}`, 'i');
function responsibleNamed(value) {
  const answer = text(value).replace(RESPONSIBLE_LABEL, '').replace(/[\s)\].:]+$/, '');
  return filled(answer) && !((ONLY_WORKERS.test(answer) || ONLY_BUSINESSES.test(answer)) && !POSITION.test(answer));
}

const PLANT_WORDS = /\b(cranes?|forklifts?|ewps?|elevating work platforms?|scissor lifts?|boom lifts?|excavators?|skid ?steers?|bobcats?|loaders?|rollers?|dozers?|graders?|telehandlers?|trucks?|concrete pumps?|scaffold\w*|power tools?|saws?|grinders?|generators?|compressors?)\b/i;

// Library step names that mention a road without saying the work is beside one (H1).
const GENERAL_ROAD_STEP = /\b(?:haul\w*|deliver\w*|driv\w*|transport\w*|cart\w*)\b[^.]{0,40}\bpublic roads?\b|\broad or (?:the )?ground\b|^reinstate (?:the )?asphalt$/i;

const SHALLOW_TRENCH = /\b(?:trench\w*|excavations?)\b[^.]{0,40}\b(?:kept|stays?|remains?)\s+(?:shallower|less)\s+than\s+1\.5\s?m\b/i;

// A step name that only checks, inspects, locates or warns ("Check walls for gas lines", "be aware
// of overhead power lines") names what may be there, not the work (H1, W12). It still counts for a fall.
const CHECK_ONLY_SENTENCE = /^\s*(?:\d+(?:\.\d+)*\.?\s*)?(?:check\w*|inspect\w*|survey\w*|assess\w*|identify\w*|locat\w*|confirm\w*|verify\w*|review\w*|look\w*|observ\w*|monitor\w*|walk\w*|plan\w*|be (?:aware|mindful))\b/i;
function checkOnly(name) {
  const sentences = String(name).replace(/^[^:]{0,60}:\s*/, '').split(/(?<=[.;])\s+/).filter((part) => /\w/.test(part));
  return sentences.length > 0 && sentences.every((part) => CHECK_ONLY_SENTENCE.test(part));
}
// Live boards named as a hazard are there, not a maybe (H1). "Energised parts nearby" is a maybe.
const LIVE_PARTS = /\b(?:live|energi[sz]ed)\s+(?:(?:switch|distribution|electrical|main|sub)[- ]?)?(?:boards?|switchboards?)\b/i;
// Plant in the plant list that puts people at height, or that moves about the site (H1). The plant
// is what a line names before its first colon: "Vacuum lifter: lifting gear when used under a crane"
// is a vacuum lifter.
const PLANT_AT_HEIGHT = /\b(ewps?|elevat\w* work platforms?|scissor ?lifts?|boom (?:type )?lifts?|cherry pickers?|scaffold\w*)\b/i;
const MOBILE_PLANT = /\b(ewps?|elevat\w* work platforms?|scissor ?lifts?|boom (?:type )?lifts?|cherry pickers?|excavators?|skid ?steers?|bobcats?|loaders?|forklifts?|telehandlers?|(?:mobile |crawler |franna |slewing )?cranes?|crane trucks?|concrete (?:boom )?pumps?|boom pumps?|agitators?|dozers?|graders?|posi-?tracks?)\b/i;

// A step named for a hazard rather than an action (W1).
const HAZARD_HEADING = /^[\s\d.]*(?:[\w&/-]+\s+){0,3}(?:hazards?|risks?|handling|tasks|noise|dust|fumes|heights?|electrical|electricity|traffic|fatigue|weather|elements|chemicals?|substances|security|safety|slips?|trips?|falls?|lighting|illumination|sun|heat|ppe|training|inductions?)\s*$/i;
// Writing a plan later is not having one (W6).
const PLAN_PROMISE = /\b(?:develop|prepare|establish|create|write|draft)\w*\b[^.]{0,30}\b(?:emergency|rescue|evacuation)\b[^.]{0,30}\b(?:plans?|procedures?)\b/i;
// A template's question or prompt with no answer (W6).
const TEMPLATE_QUESTION = /\?\s*$|^\s*(?:list|describe|detail|outline)\s+(?:the|all|any)\b/i;
// Unfilled template text (W9).
const TEMPLATE_PROMPT = /\b(?:enter (?:the )?(?:job|task|site|project|name|description|details)\w*|insert (?:photo|name|here|details)|example:|click (?:or tap )?here)|[-(]\s?specify\b/i;
// Known unsafe controls (W3): a water jet or pressure gun trigger locked or tied on.
const UNSAFE = /\btriggers?\b[^.]{0,30}\b(?:lock(?:ed|ing)?|tied|taped|wedged|cable[- ]tied)\s+(?:on|open|down|back)\b|\b(?:lock|tie|tape|wedge)\w*\s+(?:the\s+)?triggers?\s+(?:on|open|down|back)\b/i;
// Cutting, drilling or grinding concrete or masonry makes silica dust (W3), whichever way round
// it is written ("concrete drilling", "drilling into concrete").
const SILICA_WORK = /\b(?:concrete|masonry|brick|block\w*|pavers?|stone)\s+(?:cutt\w*|saw\w*|grind\w*|cor(?:e|ing)\b|drill\w*)|\b(?:saw[- ]?cut\w*|core drill\w*|cut\w*|grind\w*|chas\w*|drill\w*)\b[^.\n]{0,20}\b(?:concrete|masonry|bricks?|blocks?|pavers?|stone)\b/i;
// Wetting down the materials or the area beforehand is not water at the cut (W3).
const WET_DOWN = /\b(?:pre-?wet\w*|wet\w* down|wet\w* (?:the |all )?(?:materials?|bricks?|blocks?|surfaces?|(?:work )?areas?|ground|soil))\b/gi;

// What triggers a review (W4): a change to the work or the workplace, and an incident or a control
// that is not working ("if controls are inadequate, stop work, review the SWMS").
const REVIEW_WORD = /\b(review\w*|revis\w*|updat\w*|amend\w*|re-?assess\w*)\b/i;
const CHANGE_TRIGGER = /\b(?:task|work\w*|stage|method|site|conditions?|scope|sequence|process\w*|activit\w*)\b[^.]{0,30}\bchang\w*|\bchang\w*\s+(?:to|in|of|at)\s+(?:the\s+)?(?:work\w*|task|site|scope|conditions?|methods?|process\w*|sequence|stages?|plant|equipment)\b/i;
const FAILURE_TRIGGER = /\b(incidents?|near miss\w*|not working|(?:controls?|measures?|it|they)\b[^.]{0,20}\b(?:fail\w*|(?:is|are) not effective|(?:is|are|found) (?:inadequate|insufficient|ineffective))|ineffective|not effective|does not control)\b/i;

// A date as a SWMS writes it: 09/08/2020, 18.06.21, 2026-11-05, 5 November 2026, 20th November 2025,
// February 2020. A month alone is its first day, or its last for a review date. Null when unreadable.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const TWO_YEARS = 2 * 365.25 * 24 * 60 * 60 * 1000;
function dateOf(value, endOfMonth = false) {
  const line = text(value);
  const year = (y) => (y.length === 2 ? 2000 + Number(y) : Number(y));
  let match = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(line);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  match = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/.exec(line);
  if (match && Number(match[2]) <= 12) return new Date(year(match[3]), Number(match[2]) - 1, Number(match[1]));
  match = /\b(?:(\d{1,2})(?:st|nd|rd|th)?\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b/i.exec(line);
  if (match) {
    const month = MONTHS.indexOf(match[2].toLowerCase());
    if (match[1]) return new Date(Number(match[3]), month, Number(match[1]));
    return endOfMonth ? new Date(Number(match[3]), month + 1, 0) : new Date(Number(match[3]), month, 1);
  }
  return null;
}

// ---- The minimum control set for each high risk category (W13) ----

// Owner decision (6 October 2026, Q12, built first): each high risk category has a short set of
// must-have controls, drawn from the WHS Regulations and the codes of practice SiteReady cites, and
// each one missing costs points. Each must-have is a pattern of the wordings that say it: generous
// with synonyms, so an honest SWMS is not marked down for its wording, and strict about meaning, so
// a barricade under the work is not shoring and a dust mask is not a respirator. A line that says the
// control is not there ("no shoring is used") does not count, and nor does a vague line.
//   context: the line, or the step it is in, must be about this work ("barricade" counts for a
//            trench only in a line or step about the trench). lineOnly: the line itself must be.
//   when:    the must-have applies only where the SWMS's work matches; whenControls, where its
//            controls do (a harness anchor only where a harness is used). unless: not where this matches.
//   firm:    named as an option ("unless superseded by a lift plan"), it does not count.
const SERVICES = /\b(services?|cables?|pipes?|pipelines?|utilit\w*|mains|conduits?|underground|dbyd|byda|before you dig)\b/i;
const POWER_LINE = /\b(?<!underground )(?:overhead (?:(?:hv|lv|high voltage|low voltage|\d+(?:\.\d+)? ?kv) )?(?:power |electric\w* |service |supply )?(?:lines?|cables?|wires?|mains|conductors?)|power ?lines?|aerial (?:lines?|cables?|conductors?)|(?:hv|high voltage|transmission|distribution) lines?|electric lines? overhead)\b/i;
const ELECTRICAL_WORK = /\b((?<!non[- ])electrical (?:work|installation work|fit[- ]?off|rough[- ]?in)|electricians?|rewir\w*|wiring|switchboards?|distribution boards?|circuits?|power points?|gpos?|light fittings?|solar|photovoltaic|pv (?:panels?|arrays?|systems?)|inverters?|connect\w*[^.\n]{0,40}\b(?:to|into) (?:the )?(?:electricity )?supply|(?:energi[sz]ed|live) (?:low voltage |lv |electrical )?(?:work|testing|equipment|apparatus|conductors?|parts?|switchboards?|boards?|circuits?))\b/i;
const LIVE_WORK = /\b((?:energi[sz]ed|live) (?:low voltage |lv |electrical )?(?:work|testing|equipment|apparatus|conductors?|parts?|switchboards?|boards?|circuits?)|work\w* (?:on|near) (?:exposed )?(?:energi[sz]ed|live)|fault[- ]?find\w*|live test\w*)\b/i;
const NOT_LIVE = /\bno (?:electrical )?work is (?:done|carried out) on or near (?:exposed )?(?:energi[sz]ed|live) parts\b|\bno (?:energi[sz]ed|live) (?:electrical )?work\b/i;
const ROAD_WORDS = /\b(roads?|roadways?|streets?|highways?|motorways?|freeways?|traffic|footpaths?|verges?|carriageways?|kerbs?|intersections?)\b/i;
const RAIL = /\b(railways?|railroads?|rail (?:corridors?|lines?|tracks?|network|traffic|infrastructure|bridges?|crossings?|reserves?|safety|access)|light rail|trams?|tramways?|trains?|track (?:work|side|possessions?|protection)|trackside|live track|danger zone)\b/i;
// A crane named for a lift: in the task, a step name or the plant list, and not a lifting accessory
// used under someone else's crane.
const CRANE = /\b(?:(?:mobile|crawler|tower|franna|slewing|pick and carry|all terrain|truck[- ]mounted|vehicle loading) )?cranes?\b(?!\s+(?:company|companies|crew|operators?|pads?|mats?|hire|platforms?)\b)|\bcrane trucks?\b|\bhiabs?\b/i;
const SILICA_CONTEXT = /\b(dust|silica|slurry|concrete|masonry|bricks?|blocks?|stone|pavers?|tiles?|cut\w*|drill\w*|grind\w*|saw\w*|cor(?:e|ing)|chas\w*|clean\w*)\b/i;
const LIFT_WORDS = /\b(lift\w*|hoist\w*|loads?|slung|sling\w*|rigg\w*|dogg\w*|pick\w*|lower\w*|install\w*|erect\w*|plac\w*)\b/i;

const MINIMUM = [
  { id: 'fall', label: 'falls over 2 m', musts: [
    // As for H3, a stated reason that edge protection, a scaffold or an EWP is not reasonably practicable answers it.
    { name: 'edge protection, a scaffold, an EWP, safety mesh or covers, or working from the ground', not: NO_FALL_CONTROL,
      pattern: new RegExp(`${PHYSICAL_FALL.source}|^(?=.*\\bnot (?:reasonably )?practicable\\b)(?=.*\\b(?:edge protection|guard ?rails?|scaffold\\w*|ewps?|elevating work platforms?)\\b)`, 'i') },
    { name: 'the fall protection inspected before use (the scaffold tag, the EWP pre-start, the harness and anchors)',
      pattern: /\b(scaffold\w*|guard ?rails?|edge protection|ewps?|elevat\w* work platforms?|scissor ?lifts?|boom lifts?|harness\w*|lanyards?|anchor\w*|static lines?|lifelines?|safety mesh|(?:work(?:ing)? )?platforms?|fall (?:arrest|protection|restraint)\w*|ladders?|roof rails?|covers?)\b[^.]{0,80}\b(inspect\w*|tag(?:s|ged)?|check\w*|handover|hand-?over|certif\w*|pre-?start|pre-?use|tested|log ?books?)\b|\b(inspect\w*|tag(?:s|ged)?|check\w*|handover|hand-?over|certif\w*|pre-?start|pre-?use|tested)\b[^.]{0,80}\b(scaffold\w*|guard ?rails?|edge protection|ewps?|elevat\w* work platforms?|scissor ?lifts?|boom lifts?|harness\w*|lanyards?|anchor\w*|static lines?|lifelines?|safety mesh|(?:work(?:ing)? )?platforms?|fall (?:arrest|protection|restraint)\w*|ladders?|roof rails?|covers?)\b|\bscaff ?tags?\b/i },
    { name: 'a rated or certified anchor point for each harness', whenControls: /\b(harness\w*|fall arrest|lanyards?|static lines?)\b/i,
      pattern: /\b(anchor\w*|static lines?|lifelines?|tie[- ]off points?)\b[^.]{0,80}\b(rated|certif\w*|tested|inspected|engineer\w*|\d+(?:\.\d+)?\s?kn|as\/?nzs\s?(?:1891|5532)|load[- ]rated|manufacturer\w*|basket|platform|ewp|boom lift)\b|\b(rated|certif\w*|engineer\w*|\d+(?:\.\d+)?\s?kn|as\/?nzs\s?(?:1891|5532)|basket|platform|ewp)\b[^.]{0,80}\b(anchor\w*|static lines?|lifelines?|tie[- ]off points?)\b/i } ] },
  { id: 'trench', label: 'trenches', musts: [
    { name: 'shoring, benching or battering for a trench 1.5 m or deeper (s 306)',
      pattern: /\b(shor(?:e|es|ed|ing)|(?:trench|ground|shoring|drag) (?:shields?|box\w*|support\w*|sheets?|jacks?)|shield(?:ed|ing)|batter(?:s|ed|ing)?|bench(?:es|ed|ing)|sheet pil\w*|soldier piles?|step(?:ped|ping)? (?:back|the (?:sides|walls))|laid back|slop\w* (?:the |back )?(?:sides|walls)|ground support|engineered support|(?:shallower|less) than 1\.5\s?m|under 1\.5\s?m deep|no (?:deeper|more) than 1\.5\s?m|(?:not|never) (?:exceed\w*|deeper than) 1\.5\s?m)\b/i },
    { name: 'the open trench barricaded, fenced or covered', context: /\b(trench\w*|excavat\w*|holes?|pits?|shafts?|dig\w*)\b/i,
      pattern: /\b(barricad\w*|fenc\w*|barriers?|edge protection|guard ?rails?|hand ?rails?|covers?|covered|plated|road plates?|steel plates?|bunting|para-?webbing|mesh)\b/i },
    { name: 'spoil, materials and plant kept back from the edge',
      pattern: /\b(spoil|stockpil\w*|surcharg\w*|excavated (?:material|soil)|soil|materials?|plant|machines?|machinery|vehicles?|trucks?|excavators?|loads?)\b[^.]{0,80}\b(?:back|away|clear) (?:from|of) (?:the )?(?:\w+ )?(?:edges?|trench\w*|excavat\w*|batters?|sides?)\b|\b(spoil|stockpil\w*|surcharg\w*|materials?|plant|machines?|vehicles?|trucks?|loads?)\b[^.]{0,60}\b\d+(?:\.\d+)?\s?m(?:etres?)?\b[^.]{0,30}\b(?:from|back from|of|clear of) (?:the )?(?:\w+ )?(?:edges?|trench\w*|excavat\w*)|\b(?:no|never)\b[^.]{0,30}\b(?:spoil|plant|vehicles?|trucks?|loads?|materials?)\b[^.]{0,40}\b(?:near|at|within|on) (?:the )?(?:\w+ )?(?:edges?|trench\w*)|\bzone of influence\b|\b(?:wheel|stop) (?:stops?|blocks?)\b|\bspoil\b[^.]{0,40}\b(?:placed|kept|stockpiled|stored)\b/i },
    { name: 'a safe way into and out of the trench (a ladder, ramp or stairs)', context: /\b(trench\w*|excavat\w*|pits?|shafts?)\b/i,
      pattern: /\b(ladders?|ramps?|stairs?|stairways?|step ?ladders?|egress|means of (?:access|exit|escape)|safe (?:access|entry|exit)|exit points?|escape|get(?:ting)? (?:in|out)|enter\w* and (?:exit|leav)\w*)\b/i } ] },
  { id: 'services', label: 'digging near underground services', musts: [
    { name: 'underground services located before digging (Before You Dig plans, a locator or potholing; s 304)', lineOnly: true, context: SERVICES,
      pattern: /\b(dbyd|byda|before you dig|dial before|locat\w*|scann?\w*|plans?|drawings?|as[- ]?built|gpr|ground penetrating radar|pot-?hol\w*|identif\w*|marked|mark(?:ed|ing)? out|traced|tracing|prov(?:en|ed|ing)|search\w*|survey\w*)\b/i },
    { name: 'digging by hand or vacuum excavation near located services', context: /\b(services?|cables?|pipes?|utilit\w*|mains|dig\w*|excavat\w*|trench\w*|pot-?hol\w*)\b/i,
      pattern: /\b(hand[- ]?dig\w*|dig\w* by hand|by hand|hand excavat\w*|hand tools?|hand[- ]held (?:tools?|shovels?)|shovels?|spades?|vacuum excavat\w*|non[- ]destructive|hydro-?vac\w*|vac(?:uum)? trucks?|sucker trucks?|pot-?hol\w*|expos\w*\b[^.]{0,30}\b(?:services?|cables?|pipes?|mains)|(?:services?|cables?|pipes?|mains)\b[^.]{0,30}\bexpos\w*)\b/i } ] },
  { id: 'lines', label: 'work near overhead power lines', musts: [
    { name: 'an exclusion zone kept from the lines (the approach distance)', context: /\b(lines?|wires?|conductors?|overhead|power|electric\w*|approach|no[- ]go|tiger)\b/i,
      pattern: /\b(approach distances?|no[- ]go zones?|safe (?:working |approach )?distances?|exclusion zones?|clearances?|clear of (?:the )?(?:\w+ )?(?:lines?|wires?|conductors?)|(?:away|clear) from (?:the )?(?:\w+ )?(?:lines?|wires?|conductors?)|\d+(?:\.\d+)?\s?m(?:etres?)?\b[^.]{0,40}\b(?:from|of|clear|away|clearance|distance)|tiger tails?|(?:lines?|conductors?)\b[^.]{0,30}\b(?:de-?energi[sz]\w*|isolated|shrouded|covered|insulated|switched off)|(?:de-?energi[sz]\w*|isolat\w*|shroud\w*|insulat\w*)\b[^.]{0,30}\b(?:\w+ )?lines?|spotter zones?|observer zones?)\b/i },
    { name: 'a safety observer while people or plant work near the lines', context: /\b(lines?|wires?|conductors?|overhead|power|electric\w*|approach|no[- ]go|booms?|cranes?|plant)\b/i,
      pattern: /\b(safety observers?|observers?|spotters?|safety watch\w*|watchers?|sentr(?:y|ies)|lookouts?|dedicated (?:person|watcher))\b/i } ] },
  { id: 'energised', label: 'energised electrical installations', musts: [
    { name: 'the supply isolated, locked out and tagged before work',
      pattern: /\b(isolat\w*|de-?energi[sz]\w*|lock(?:ed)? ?out|lockout|loto|tag(?:ged)? ?out|personal (?:danger )?(?:locks?|tags?|padlocks?)|danger tags?|out of service tags?|switch\w* off|turn\w* off|power (?:is |was )?(?:off|disconnected)|disconnect\w*|circuit breakers? (?:off|open))\b/i },
    { name: 'tested dead before touching (test before you touch)', when: ELECTRICAL_WORK,
      pattern: /\b(test before (?:you )?touch|test\w* (?:for|it is|is|as) (?:dead|de-?energi[sz]\w*)|tested dead|prov(?:e|ed|ing|en) (?:\w+ ){0,3}(?:dead|de-?energi[sz]\w*|isolat\w*)|voltage test\w*|(?:test|check)\w* (?:\w+ ){0,4}(?:de-?energi[sz]\w*|isolat\w*|dead)|multimeters?|(?:non[- ]contact |proximity )?(?:voltage )?testers?|volt sticks?|absence of voltage)\b/i },
    { name: 'a safety observer for the energised work', when: LIVE_WORK, unless: NOT_LIVE,
      pattern: /\b(safety observers?|observers?|standby persons?|second (?:competent )?persons?|rescue[- ]trained)\b/i } ] },
  { id: 'confined', label: 'confined spaces', musts: [
    { name: 'the atmosphere tested before and during entry',
      pattern: /\b(gas test\w*|gas (?:detectors?|monitors?|meters?)|atmospher\w*\b[^.]{0,30}\b(?:test\w*|monitor\w*|check\w*)|(?:test|monitor|check)\w*\b[^.]{0,30}\b(?:atmospher\w*|air (?:quality)?|oxygen|o2|gases)|(?:4|four|multi)[- ]gas|oxygen (?:levels?|content))\b/i },
    { name: 'a standby person outside the space (s 69)',
      pattern: /\b(stand-?by (?:persons?|attendants?|m[ae]n)|standby|attendants?|safety (?:watch\w*|observers?)|top ?m[ae]n|sentr(?:y|ies)|persons? (?:\w+ ){0,2}outside (?:the )?(?:space|entry|tank|pit))\b/i },
    { name: 'rescue arrangements and equipment for the space (s 74)',
      pattern: /\b(rescue\w*|tripods?|winch\w*|retrieval (?:lines?|systems?|equipment)|davits?)\b/i } ] },
  { id: 'asbestos', label: 'asbestos', musts: [
    { name: 'wet methods and no power tools, dry sweeping or high pressure water', byRemovalist: true, context: /\b(asbestos|acm|fibro|fibres?|sheets?|materials?|dust|remov\w*|sampl\w*|surfaces?)\b/i,
      pattern: /\b(wet\w*|water (?:spray|mist)\w*|mist\w*|pva|suppress\w*|no (?:power tools|dry sweep\w*|high[- ]pressure (?:water|cleaners?)|compressed air|abrasive)|(?:hand|non[- ]powered) tools only|without (?:power tools|breaking)|shadow vacuum\w*|h-?class vacuum\w*|hepa)\b/i },
    { name: 'a respirator (P1, P2 or better)', byRemovalist: true, pattern: /\b(p[123]\b|class p[123]|respirators?|rpe|half[- ]face|full[- ]face|papr|powered air)\b/i },
    { name: 'the asbestos waste sealed in heavy duty plastic, labelled and taken to a licensed facility', byRemovalist: true,
      pattern: /\b(bagg\w*|bags?|double[- ]bag\w*|wrap\w*|200 ?(?:µm|um|micron)|heavy[- ]duty (?:plastic|polyethylene)|polythene|polyethylene|sealed (?:bins?|containers?|skips?|drums?)|lined (?:bins?|skips?)|licensed (?:landfill|facility|tip|disposal|waste)|landfill|approved (?:waste )?(?:facility|tip|disposal))\b|\basbestos waste\b|\b(?:dispos\w*|waste)\b[^.]{0,40}\b(?:asbestos|acm|contaminated|labelled|epa)\b|\b(?:asbestos|acm)\b[^.]{0,40}\b(?:dispos\w*|waste)\b/i },
    { name: 'a clearance inspection after the removal', when: /\b(?:remov\w*|strip\w*)\b[^.\n]{0,40}\basbestos\b|\basbestos\b[^.\n]{0,40}\b(?:remov\w*|strip\w*)/i,
      pattern: /\b(clearance (?:inspections?|certificates?|certification)|clearances?|air monitoring|visual (?:clearance|inspection)s?)\b/i } ] },
  { id: 'demolition', label: 'demolition', musts: [
    { name: 'a demolition plan or engineer\'s sequence', pattern: /\b(demolition (?:plans?|sequence|work plans?|methodolog\w*|procedures?)|engineer\w*|sequenc\w*|top[- ]down|structural (?:assessment|engineer\w*|report|survey)|method statement)\b/i },
    { name: 'an exclusion zone around and below the demolition',
      pattern: /\b(exclusion zones?|no[- ]go zones?|drop zones?|barricad\w*|fenc\w*|hoardings?|barriers?|catch (?:fans?|platforms?)|perimeter (?:screens?|protection))\b|\bno (?:one|person|persons|workers?|people)\b[^.]{0,40}\b(?:below|under|beneath|within|near)\b/i },
    { name: 'services disconnected or made safe first',
      pattern: /\b(services?|power|gas|water|electric\w*|supply|supplies|sewer)\b[^.]{0,50}\b(disconnect\w*|isolat\w*|terminat\w*|cut off|capped|made safe|switched off|abolish\w*|de-?energi[sz]\w*)\b|\b(disconnect\w*|isolat\w*|terminat\w*|cap\w*|made safe|abolish\w*|de-?energi[sz]\w*)\b[^.]{0,50}\b(services?|power|gas|water|electric\w*|suppl(?:y|ies)|sewer)\b/i } ] },
  { id: 'plant', label: 'powered mobile plant', musts: [
    { name: 'people kept apart from the plant (an exclusion zone, barriers or a traffic management plan)',
      pattern: /\b(exclusion zones?|no[- ]go zones?|separat\w*|barricad\w*|barriers?|bollards?|pedestrian (?:walkways?|routes?|paths?|exclusion|access)|traffic management|tmps?|tgs|keep\w* (?:\w+ ){0,3}clear|clear of (?:the )?(?:plant|machine\w*|swing|operating|work)|swing radius|delineat\w*|para-?webbing|cones|fenc\w*|stand clear|exclusion)\b/i },
    { name: 'a spotter, warning devices (beacons or alarms) or agreed signals between the operator and people on foot',
      pattern: /\b(spotters?|traffic controllers?|plant controllers?|traffic marshal\w*|banksm[ae]n|signall?ers?|two[- ]way radios?|radios?|eye contact|no see,? no move|hand signals?|dogm[ae]n|doggers?|guided by|ground (?:person|persons|crew|controls?)|(?:reversing|motion|travel|tilt|warning) (?:alarms?|cameras?|beepers?|devices?)|proximity (?:warning|detection|alarms?|sensors?)|beacons?|flashing lights?|horns?|signals?)\b/i } ] },
  { id: 'precast', label: 'tilt-up and precast', musts: [
    { name: 'an erection design and sequence from the engineer', pattern: /\b(erection (?:design|sequence|plans?|documentation|drawings?|methodolog\w*)|engineer\w*|shop drawings?|panel (?:layout|schedule)|lift (?:plans?|study|studies)|sequenc\w*|installation (?:plans?|drawings?))\b/i },
    { name: 'temporary bracing fixed to the design before the crane lets go', pattern: /\b(brac\w*|props?|propp\w*)\b/i },
    { name: 'no one under the load or inside the exclusion zone during the lift',
      pattern: /\b(exclusion zones?|drop zones?|no[- ]go zones?|barricad\w*|clear of (?:the )?(?:load|panel|lift|fall zone)|fall zones?)\b|\b(?:no(?: one| person| persons| people| personnel| workers?)|nobody|never)\b[^.]{0,40}\bunder\b/i } ] },
  { id: 'temporary', label: 'temporary support', musts: [
    { name: 'temporary support designed or checked by an engineer', pattern: /\b(engineer\w*|temporary works (?:design\w*|engineer\w*)|designed|certif\w*|propping (?:plans?|designs?|layouts?)|structural (?:assessment|advice))\b/i },
    { name: 'props, shoring or bracing in place before the load is taken off', pattern: /\b(props?|propp\w*|shor(?:e|es|ed|ing)|needles?|strongbacks?|temporary (?:supports?|beams?|works)|acrows?|brac\w*)\b/i } ] },
  { id: 'road', label: 'work beside a road', musts: [
    { name: 'a traffic management plan or traffic guidance scheme',
      pattern: /\b(traffic (?:management|guidance|control) (?:plans?|schemes?|designs?|diagrams?)|tmps?|tgs|tcps?|traffic management|as\s?1742(?:\.3)?|traffic control (?:devices|plans?)|road occupancy|traffic guidance)\b/i },
    { name: 'the work zone separated from traffic (barriers, cones, signs or traffic controllers)',
      pattern: /\b(barriers?|barricad\w*|cones|bollards?|delineat\w*|water[- ]filled|exclusion zones?|signs?|signage|traffic controllers?|stop[- ]slow|lane closures?|tmas?|truck[- ]mounted attenuators?|arrow boards?|speed (?:reductions?|limits?|zones?)|work ?zones?|buffer zones?|safety zones?)\b/i } ] },
  { id: 'rail', label: 'work in a rail corridor', musts: [
    { name: 'rail protection (a protection officer, lookout or track possession)',
      pattern: /\b(protection officers?|track (?:protection|safety|possession|occupancy)|lookouts?|look-?outs?|worksite protection|possessions?|rail safety workers?|controllers? of site safety|coss|network control\w*|train controll?\w*|absolute signal block\w*)\b/i },
    { name: 'the rail operator\'s authority to work in the corridor (an access permit or authority)',
      pattern: /\b(access (?:authorit\w*|permits?|authori[sz]ations?)|rail (?:access|corridor) (?:permits?|authorit\w*|inductions?)|work on track authorit\w*|track work authorit\w*|twa|local possession authorit\w*|lpa|rail (?:industry )?(?:safety )?inductions?|rissi|possessions?|(?:network|rail|track) (?:operator|owner|manager)'?s? (?:approval|permission|authori[sz]ation|permit))\b/i } ] },
  { id: 'water', label: 'water', musts: [
    { name: 'a life jacket or personal flotation device', pattern: /\b(life ?(?:jackets?|vests?)|pfds?|personal flotation|buoyancy (?:vests?|aids?)|inflatable vests?)\b/i },
    { name: 'rescue equipment at hand (a life ring, throw line or rescue boat)', pattern: /\b(life ?(?:rings?|buoys?|lines?)|throw (?:lines?|bags?|ropes?)|rescue\w*|boats?|reaching poles?)\b/i } ] },
  { id: 'explosives', label: 'explosives', musts: [
    { name: 'a licensed shotfirer', pattern: /\b(shot ?firers?|blasters?|blast(?:ing)? (?:supervisors?|engineers?)|licen\w*)\b/i },
    { name: 'a blast plan', pattern: /\b(blast(?:ing)? (?:plans?|designs?|management plans?|patterns?|procedures?)|shot (?:plans?|designs?))\b/i },
    { name: 'a misfire procedure', pattern: /\b(mis-?fires?|hang-?fires?|unfired|undetonated)\b/i } ] },
  { id: 'gas', label: 'pressurised gas mains or piping', musts: [
    { name: 'the gas isolated before work on it, or the main located before work near it',
      pattern: /\b(isolat\w*|shut ?off|turn\w* off|purg\w*|depressuri[sz]\w*|valves? (?:closed|off)|meters? (?:off|turned off)|gas (?:is )?off|locat\w*|dbyd|byda|before you dig|pot-?hol\w*|marked|expos\w*)\b/i },
    { name: 'leak testing or gas detection, and no ignition sources',
      pattern: /\b(leak (?:test\w*|detect\w*|check\w*)|gas (?:detect\w*|monitor\w*|test\w*|sniff\w*)|soapy water|pressure test\w*|test\w* for (?:gas )?leaks?|ignition sources?|naked flames?|no smoking)\b/i } ] },
  { id: 'chemicalLine', label: 'chemical, fuel or refrigerant lines', musts: [
    { name: 'the line isolated and drained, depressurised or the refrigerant recovered before it is opened',
      pattern: /\b(isolat\w*|drain\w*|depressuri[sz]\w*|recover\w*|purg\w*|pump(?:ed)? down|evacuat\w* (?:the )?(?:lines?|system)|valves? (?:closed|off|locked))\b/i },
    { name: 'leak or pressure testing after the work', pattern: /\b(leak (?:test\w*|detect\w*|check\w*)|pressure test\w*|nitrogen|vacuum test\w*|soapy water|gas detect\w*)\b/i } ] },
  { id: 'silica', label: 'silica dust', musts: [
    { name: 'water suppression or on-tool extraction at the cut', context: SILICA_CONTEXT,
      pattern: /\b(extract\w*|on-?tool|wet (?:cut\w*|methods?|saw\w*|drill\w*|grind\w*|core\w*)|water (?:suppress\w*|feed|fed|attachments?|sprays?|cooled)|dust (?:extract\w*|collect\w*|shrouds?|suppress\w*)|shrouds?|lev\b|local exhaust|vacuum (?:attachments?|shrouds?)|h-?class|m-?class)\b/i },
    { name: 'a respirator (P2 or better)', pattern: /\b(p[23]\b|class p[23]|respirators?|rpe|half[- ]face|full[- ]face|papr|powered air)\b/i },
    { name: 'clean-up by vacuum or wet methods, not dry sweeping or compressed air', context: SILICA_CONTEXT,
      pattern: /\b(vacuum\w*|h-?class|m-?class|wet (?:clean\w*|wip\w*|sweep\w*|mop\w*)|damp (?:wip\w*|mop\w*|clean\w*)|no (?:dry )?sweep\w*|not (?:dry )?swept|(?:no|never|without) (?:\w+ ){0,2}compressed air|hos\w* down)\b/i } ] },
  { id: 'tower', label: 'telecommunication towers', musts: [
    { name: 'radio frequency (EME) exposure controlled (transmitters off, an RF monitor or survey)',
      pattern: /\b(rf\b|radio ?frequency|eme\b|emr\b|electromagnetic|transmitters?|rf (?:monitors?|meters?|surveys?)|personal monitors?)\b/i },
    { name: 'fall protection while climbing (a fall arrest climbing system or twin lanyards)',
      pattern: /\b(fall arrest|climb\w* (?:systems?|lines?|rails?)|fixed (?:lines?|ladder systems?)|harness\w*|lanyards?|twin[- ]tail|tie[- ]off|rope access|rail systems?)\b/i },
    { name: 'a plan and kit to rescue a person from the tower', pattern: /\b(tower rescue|rescue\w*)\b/i } ] },
  { id: 'crane', label: 'crane lifts', musts: [
    // A lift plan named only as an option ("unless superseded by a lift plan") is not one.
    { name: 'a lift plan', firm: true, pattern: /\b(lift(?:ing)? (?:plans?|study|studies|procedures?|methodolog\w*|designs?|charts?)|crane (?:lift )?plans?|rigging plans?|crane set-?up plans?|lifts? (?:is|are) planned|planned lifts?|critical lift)\b/i } ] },
];
// "No shoring is used" or "a scaffold is not required" says the control is not there.
const NOT_THERE_BEFORE = /\b(?:no|without|absence of|lack of)\s+(?:\w+\s+){0,2}$/i;
const NOT_THERE_AFTER = /^[^.;]{0,25}\b(?:is|are|was|were) not (?:required|needed|used|provided|installed|available|in place)\b/i;
function saysControl(must, line) {
  const pattern = new RegExp(must.pattern.source, must.pattern.flags.replace('g', '') + 'g');
  for (const match of line.matchAll(pattern)) {
    if (/^no\b/i.test(match[0])) return true;
    if (NOT_THERE_BEFORE.test(line.slice(Math.max(0, match.index - 30), match.index))) continue;
    if (NOT_THERE_AFTER.test(line.slice(match.index + match[0].length))) continue;
    if (must.not && must.not.test(line)) continue;
    if (must.firm && /\b(?:unless|if|where|when|or|either)\b[^.,;:]*$/i.test(line.slice(0, match.index))) continue;
    return true;
  }
  return false;
}

// Railway detonators are track signals, not the use of explosives (H2, W13).
const railSignalsOnly = (swms) => /\bdetonators?\b/i.test([...swms.plant, ...swms.steps.flatMap((step) => step.controls), swms.task].join(' '))
  && /\b(rail\w*|track|signall?\w*|protection officers?)\b/i.test([swms.task, ...swms.plant].join(' '));

// The categories the minimum control set applies to, each with the steps it is in.
function minimumSets(swms, state, context) {
  const ids = new Set([...context.implied, ...context.named].map((item) => item.id));
  const steps = swms.steps;
  const workNames = steps.map((step) => step.step).filter((name) => !checkOnly(name));
  const ownWork = [swms.task, ...workNames].join('\n');
  const said = [swms.task, ...swms.highRisk, ...steps.flatMap((step) => [step.step, ...step.hazards])].join('\n');
  const allText = [said, ...steps.flatMap((step) => step.controls), ...swms.site.conditions, ...swms.plant].join('\n');
  const stepsWhere = (test) => steps.filter((step) => test(stepText(step, swms.task))).map((step) => step.step || 'step');
  const byCategory = (id) => (words) => highRiskMatches(words, swms.fallRisk === 'yes' ? '' : swms.fallRisk, state).some((item) => item.id === id) || (id === 'fall' && swms.fallRisk === 'yes' && FALL_STEP.test(words.replace(SAME_LEVEL, ' ')));
  const out = [];
  const use = (id, test) => out.push({ set: MINIMUM.find((item) => item.id === id), steps: stepsWhere(test) });
  for (const id of ['fall', 'trench', 'confined', 'asbestos', 'demolition', 'plant', 'precast', 'temporary', 'water', 'gas', 'chemicalLine', 'tower']) {
    if (ids.has(id)) use(id, byCategory(id));
  }
  if (ids.has('explosives') && !railSignalsOnly(swms)) use('explosives', byCategory('explosives'));
  // Digging near services: the work digs, and the SWMS names services anywhere (s 304).
  const DIG = PERMITS.find((item) => item.label.startsWith('excavation'));
  if (DIG.work.test(ownWork) && DIG.near.test(allText)) use('services', (words) => DIG.work.test(words));
  // Electrical: work near overhead lines, and work on or near energised installations. A SWMS that
  // lists the category with neither wording is taken as near an installation.
  const lines = POWER_LINE.test(said);
  if (lines) use('lines', (words) => POWER_LINE.test(words));
  if (ids.has('electrical') && (!lines || ELECTRICAL_WORK.test([ownWork, ...swms.highRisk].join('\n')))) use('energised', (words) => ELECTRICAL_WORK.test(words) || byCategory('electrical')(words));
  // Road and rail, by the SWMS's own wording: the category's label names both.
  if (ids.has('road')) {
    const own = [swms.task, ...swms.highRisk.filter((line) => !(ROAD_WORDS.test(line) && RAIL.test(line))), ...steps.flatMap((step) => [step.step, ...step.hazards]), ...swms.plant].join('\n');
    const rail = RAIL.test(own);
    if (rail) use('rail', (words) => RAIL.test(words));
    if (!rail || ROAD_WORDS.test(own)) use('road', byCategory('road'));
  }
  // Silica: listed, or concrete or masonry cut, drilled or ground.
  if (swms.highRisk.some((line) => NAMED.silica.test(line)) || SILICA_WORK.test([swms.task, ...steps.flatMap((step) => [step.step, ...step.hazards])].join('\n'))) use('silica', (words) => SILICA_WORK.test(words) || NAMED.silica.test(words));
  // A crane named for a lift, in the task, a step name or the plant list (before its first colon).
  const craneText = [swms.task, ...workNames, ...swms.plant.map((line) => line.split(':')[0])].join('\n');
  if (CRANE.test(craneText) && LIFT_WORDS.test([swms.task, ...workNames].join('\n'))) use('crane', (words) => CRANE.test(words));
  return out;
}

// ---- Hazardous chemicals (W14) ----

// Owner decision (6 October 2026, Q11): where the SWMS shows chemicals are used, it names the
// products or product types and carries safety data sheet controls. Read from the task, the steps,
// hazards and controls, and the plant list. Not chemicals in use: a pressure or water cleaner,
// chemical or fuel lines (a high risk category), acid sulfate soils, chemical resistant gloves,
// chemical anchors, marking paint, or the title of the hazardous chemicals code in a citation.
const CHEMICAL_USE = /\b(sealants?|silicones?|caulk\w*|mastics?|solvents?|thinners?|turps|turpentine|acetone|adhesives?|glues?|epox(?:y|ies)|resins?|primers?|membranes?|fuels?|refuel\w*|petrol|diesel|unleaded|lpg|propane|butane|acetylene|oxy[- ]?(?:acetylene|propane|fuel)|(?:gas|oxygen|lpg) (?:bottles?|cylinders?)|compressed gas(?:es)?|acids?|acid[- ]wash\w*|hydrochloric|muriatic|caustic|cleaning (?:chemicals?|agents?|products?)|chemical cleaners?|degreasers?|detergents?|paints?|painting|spray painting|coatings?|varnish\w*|lacquers?|enamels?|stains?|aerosols?|form oil|release agents?|curing compounds?|bitumen|bituminous|tar|isocyanates?|polyurethanes?|expanding foam|herbicides?|pesticides?|insecticides?|termiticides?|fungicides?|chlorine|pool chemicals|(?:hazardous|dangerous) (?:chemicals?|substances|goods)|chemicals?)\b/i;
const NOT_CHEMICAL = /\([^()]*\b(?:Code of Practice|Regulations?|Act)\b[^()]*\)|\bManaging (?:the )?risks of hazardous chemicals\b[^.;]*|\b(?:(?:pressure|water|steam|vacuum|high pressure) cleaners?|(?:chemical|fuel|refrigerant)(?:,? (?:or|and) (?:chemical|fuel|refrigerant))* lines?|acid sulf\w* soils?|chemical[- ]resistant|chemical (?:anchors?|anchoring)|anchors? (?:are |is )?chemical|fuel[- ](?:powered|driven)|stains? (?:on|from)|line ?marking paint|paint(?:ed)? (?:marks?|lines?)|(?:marking|marker) paint)\b/gi;
// A product type is more than the class: "silicone sealant", "two-pack epoxy", "diesel", "LPG", not
// "sealant" or "fuel" alone. A product's trade name, or a chemical register, names it too.
const PRODUCT_TYPE = /\b(silicone|intumescent|fire[- ]rated (?:sealants?|mastics?|foams?|pillows?|wraps?)|polyurethane|pu|acrylic|epoxy|epoxies|two[- ]pack|2[- ]pack|bituminous|bitumen|solvent[- ]based|water[- ]based|oil[- ]based|cementitious|mek|methyl ethyl ketone|acetone|xylene|toluene|turps|mineral turpentine|white spirits?|methylated spirits?|isopropyl\w*|diesel|petrol|unleaded|lpg|propane|butane|acetylene|oxygen|argon|hydrochloric|muriatic|sulph?uric|phosphoric|caustic soda|sodium hydroxide|sodium hypochlorite|chlorine|ammonia|isocyanates?|polyester|pva|contact adhesive|construction adhesive|liquid nails|enamel|lacquer|shellac|form oil|torch[- ]on|r\d{2,3}a?|glyphosate|bifenthrin|hydrogen peroxide)\b|\b(?:chemicals?|products?|substances) (?:register|list|schedule)\b|\b(?:hazardous )?chemicals? (?:are |is )?(?:listed|named|recorded)\b|\bproducts? used\s*:/i;
const BRAND = /(?<=[a-z,;:(]\s+|\s[a-z]+\s+)(?!(?:The|All|Any|Approved|Suitable|Appropriate|Hazardous|Chemical|Chemicals|Safety|Data|Sheets?|SDS|PPE|Use|Using|Apply|Applying|Of|And|Or|To|With|For|In|On|At|By|From|Other|Similar|New|Existing|Wet|Dry|Two|Water|Oil)\b)[A-Z][A-Za-z]+(?:[- ](?:[A-Z0-9][\w-]*))*\s+(?:sealants?|primers?|adhesives?|membranes?|epoxy|resins?|paints?|solvents?|cleaners?|coatings?|glues?|compounds?)\b|\b[A-Za-z]{3,}[- ]?\d+[A-Za-z]*\b(?=[^.]{0,20}\b(?:sealants?|primers?|adhesives?|membranes?|epoxy|resins?|paints?|coatings?)\b)/;
const SDS = /\b(sds|msds|safety data sheets?|material safety data sheets?|hazardous (?:chemicals?|substances) register|chemicals? register)\b|\b(?:containers?|chemicals?|products?|decanted|bottles?|cylinders?)\b[^.]{0,40}\blabell?ed\b|\blabell?(?:ed|ing)\b[^.]{0,40}\b(?:containers?|chemicals?|products?|decanted|bottles?)\b/i;
// "Where chemicals are used from the platform" or "before dangerous goods are lifted" is a rule for
// if they are, not a statement that they are; nor is "no chemicals are used".
function chemicalsUsed(line) {
  if (/\bno (?:hazardous )?(?:chemicals?|substances)\b/i.test(line)) return false;
  const pattern = new RegExp(CHEMICAL_USE.source, 'gi');
  return [...line.matchAll(pattern)].some((match) => !/\b(?:where|if|when|whenever|before|should|in case|any)\b[^.,;:]*$/i.test(line.slice(0, match.index)));
}
const MAKER_DIRECTIONS = /\b(manufacturer'?s?|maker'?s?|label) (?:instructions|directions|recommendations|requirements)\b|\bproduct labels?\b/i;

// ---- The check ----

function categoriesNamed(items, state) {
  return highRiskList(state).filter((item) => items.some((line) => (NAMED[item.id] || NAMED[item.check] || /^$/).test(line)));
}

// A single "Whole task" step is the task itself, so the task is read with it.
function stepText(step, task = '') {
  const whole = /^(?:whole task|all steps|general|task)$/i.test(step.step);
  return [whole ? task : '', step.step, ...step.hazards].filter(Boolean).join('. ');
}

// Plant that runs: a step that clears, cleans or works at a conveyor, feeder, chute or crusher
// isolates and locks it out in that step (H2).
const MOVING_PLANT = /\b(conveyors?|feeders?|chutes?|crushers?|pulleys?|tail drums?)\b/i;
const LOCKED_OUT = /\b(isolat\w*|lock(?:ed)? ?out|lockout|personal locks?)\b/i;
const PLANT_WORK = /\b(clear\w*|clean\w*|dig\w*|unblock\w*|maintain\w*|maintenance|repair\w*|servic\w*|hos(?:e|ing)\w*|wash\w*|shovel\w*|reach\w*)\b/i;

// "All workers are required to be consulted" states the duty, not that it was done (H7).
const CONSULT_DUTY = /\b(?:(?:is|are) required to|must|shall|should|needs? to) be consulted\b/i;
const consultationRecorded = (value) => filled(value) && text(value).split(/(?<=[.;!?])\s+/).some((line) => filled(line) && !CONSULT_DUTY.test(line));

function hardFails(swms, state, stage = 'review') {
  const out = [];
  const allControls = swms.steps.flatMap((step) => step.controls);
  const named = categoriesNamed(swms.highRisk, state);
  const namedIds = new Set(named.map((item) => item.id));
  // What the task implies, read from the task and the step names. Hazards often name what
  // may be there ("contact with overhead power lines"), so a category only they imply is
  // named for the builder to check, and is not a hard fail. Live boards named as a hazard are
  // there, and plant listed that works at height or moves about the site is used.
  const list = highRiskList(state);
  const workNames = swms.steps.map((step) => step.step).filter((name) => !checkOnly(name));
  const impliedIds = new Set(highRiskMatches([swms.task, ...workNames].join('\n'), swms.fallRisk, state).map((item) => item.id));
  // Road work is where the work is. It comes from the task, or from a step name that names the road on
  // its own, not from the task and a step read together ("on the footpath" with "Set up traffic
  // barriers"), nor from general step names: hauling loads on public roads is driving, not work beside
  // a road, and "under the road or ground" or "Reinstate asphalt" do not say a road is there.
  const isRoad = (text) => highRiskMatches(text, swms.fallRisk, state).some((item) => item.id === 'road');
  if (impliedIds.has('road') && !isRoad(swms.task) && !workNames.some((name) => !GENERAL_ROAD_STEP.test(name) && isRoad(name))) impliedIds.delete('road');
  for (const item of highRiskMatches(swms.steps.filter((step) => checkOnly(step.step)).map((step) => step.step).join('\n'), swms.fallRisk, state)) if (item.id === 'fall') impliedIds.add('fall');
  if (swms.steps.some((step) => step.hazards.some((line) => LIVE_PARTS.test(line)))) impliedIds.add('electrical');
  const plantNames = swms.plant.map((line) => line.split(':')[0]);
  if (swms.fallRisk !== 'no' && plantNames.some((line) => PLANT_AT_HEIGHT.test(line))) impliedIds.add('fall');
  if (plantNames.some((line) => MOBILE_PLANT.test(line))) impliedIds.add('plant');
  const implied = list.filter((item) => impliedIds.has(item.id));
  // A SWMS that commits to keeping the trench under 1.5 m, with a stop if it must go deeper,
  // is not trench high risk work (s 291), so a trench step name alone does not imply it.
  const statedDepths = [...`${swms.task}`.matchAll(/\b(\d+(?:\.\d+)?)\s?m(?:etres?)?\s+deep\b/gi)].map((match) => Number(match[1]));
  const keptShallow = SHALLOW_TRENCH.test(allControls.join('\n')) && !statedDepths.some((depth) => depth > 1.5);
  const missing = implied.filter((item) => !namedIds.has(item.id) && !(keptShallow && item.id === 'trench'));
  const hazardOnly = highRiskMatches(swms.steps.flatMap((step) => step.hazards).join('\n'), swms.fallRisk, state)
    .filter((item) => !namedIds.has(item.id) && !missing.some((other) => other.id === item.id));
  const alsoCheck = hazardOnly.length ? ` Also check, as the hazards name it: ${hazardOnly.map((item) => item.label).join('; ')}.` : '';
  const add = (rule, title, pass, message) => out.push({ rule, title, hard: true, pass, points: 0, max: 0, message, source: SOURCES[rule] });
  const noState = state ? '' : ' No state was given, so the national model WHS Regulations categories were used.';

  // Nothing listed and nothing found in the task is not a fail: the work may not be high risk.
  // Steps marked "HRCW" say the work is high risk construction work, even where no category is listed.
  const marked = !swms.highRisk.length && swms.steps.some((step) => /\b(hrcw|high risk construction work)\b/i.test(step.step));
  add('H1', 'High risk construction work identified', (Boolean(swms.highRisk.length) || (!implied.length && !marked)) && !missing.length,
    (marked && !implied.length ? 'Steps are marked as high risk construction work, but the SWMS does not say which categories. List them.'
      : !swms.highRisk.length && !implied.length ? `No high risk construction work is listed, and none was found in the task. Check whether the work needs a SWMS.${alsoCheck}`
      : !swms.highRisk.length
      ? `The SWMS does not say which high risk construction work it covers.${implied.length ? ` The work involves: ${implied.map((item) => item.label).join('; ')}.` : ''}`
      : missing.length ? `The work involves high risk construction work the SWMS does not list: ${missing.map((item) => item.label).join('; ')}.${alsoCheck}` : `The high risk construction work is identified.${alsoCheck}`) + noState);

  // Railway detonators are track signals, so a rail SWMS that ticks explosives for them is not
  // using explosives.
  const railSignals = railSignalsOnly(swms);
  const uncontrolled = named.filter((item) => !(item.id === 'explosives' && railSignals) && !allControls.some((line) => (ANSWERS[item.id] || ANSWERS[item.check]).test(line)));
  const plantSteps = swms.steps.filter((step) => MOVING_PLANT.test(step.step) && PLANT_WORK.test(step.step) && !step.controls.some((line) => LOCKED_OUT.test(line) && !/^\s*if\b/i.test(line)));
  // Explosives: the word "blast" is not a control. The exclusion zone has a distance (in metres) or is
  // measured, and a sentry or blast guard is posted at each access point (regulator findings on a
  // dangerous blasting incident: no zone was measured and no sentries were posted).
  const blastGaps = [];
  if (!railSignals && [...named, ...implied].some((item) => item.id === 'explosives')) {
    if (!allControls.some((line) => /\bexclusion zones?\b/i.test(line) && /\b\d+(?:\.\d+)?\s?(?:m|metres?)\b|\bmeasur\w*\b/i.test(line))) blastGaps.push('a measured exclusion zone distance from the blast');
    if (!allControls.some((line) => /\b(?:sentr(?:y|ies)|blast guards?)\b/i.test(line) && /\b(?:each|every|all)\b/i.test(line))) blastGaps.push('a sentry or blast guard at each access point to the exclusion zone');
  }
  const h2gaps = [...(uncontrolled.length ? [`No controls for: ${uncontrolled.map((item) => item.label).join('; ')}. Add the controls, or delete any category that does not apply to this work.`] : []),
    ...(blastGaps.length ? [`For the explosives work, add ${blastGaps.join(' and ')}.`] : []),
    ...(plantSteps.length ? [`Isolate and lock out the plant before anyone clears, cleans or reaches in: ${plantSteps.slice(0, 4).map((step) => step.step || 'step').join('; ')}.`] : [])];
  add('H2', 'Controls for each high risk category', Boolean(allControls.length) && !h2gaps.length,
    !allControls.length ? 'The SWMS has no controls.' : h2gaps.length ? h2gaps.join(' ') : 'Each high risk category listed has controls.');

  // Falls: a higher order control (eliminate, edge protection, scaffold, EWP, mesh, covers) must be in place,
  // unless the SWMS says why those are not reasonably practicable.
  const falls = namedIds.has('fall') || implied.some((item) => item.id === 'fall');
  if (falls) {
    const fallSteps = swms.steps.filter((step) => /\b(falls?|falling|height|roofs?|edges?|ladders?|scaffold\w*|voids?|openings?|ewps?|elevat\w*|platforms?|harness\w*)\b/i.test(stepText(step, swms.task)));
    const fallLines = [...new Set([...fallSteps.flatMap((step) => step.controls), ...allControls.filter((line) => ANSWERS.fall.test(line))])];
    // Only a physical fall control, anywhere in the SWMS, counts: an isolation, a barricade under the
    // work or a ladder does not stop a fall. An EWP or scaffold in the plant list is the platform the
    // work is done from.
    // An option left open ("where required", "etc.") is not a chosen control, and a way
    // of lowering material to the ground is not a fall control for people.
    const higher = [...allControls.filter((line) => !isVague(line) && !/\betc\b/i.test(line) && !/\b(?:lower|drop)\w*\b[^.]{0,40}\bto (?:the )?ground\b/i.test(line)), ...swms.plant.map((line) => line.split(':')[0]).filter((line) => PLANT_AT_HEIGHT.test(line))].some((line) => PHYSICAL_FALL.test(line) && !NO_FALL_CONTROL.test(line));
    const justified = allControls.some((line) => /\bnot (?:reasonably )?practicable\b/i.test(line) && /\b(edge protection|guard ?rails?|scaffold\w*|ewps?|elevating work platforms?)\b/i.test(line));
    const harness = fallLines.some((line) => /\b(harness|fall arrest|lanyard)\b/i.test(line));
    add('H3', 'Falls controlled by edge protection, scaffold or EWP, not harness alone', higher || justified,
      higher || justified ? 'Falls are controlled by edge protection, a scaffold, an EWP or another higher order control.'
        : harness ? 'Falls are controlled by a harness alone. Use edge protection, a scaffold or an EWP, or say why they are not reasonably practicable.'
          : 'Falls have no edge protection, scaffold, EWP or other physical control.');
  } else {
    add('H3', 'Falls controlled by edge protection, scaffold or EWP, not harness alone', true, 'No fall risk over the height is listed or implied.');
  }

  // Owner decision (6 October 2026, Q9): no change. A supplier's SWMS for delivery only (a concrete
  // or materials delivery) gets no exception: it still names the site and its conditions.
  const noAddress = !filled(swms.site.address);
  const noConditions = !swms.site.conditions.length;
  add('H4', 'Site specific', !noAddress && !noConditions,
    noAddress && noConditions ? 'No site address and no site conditions. The SWMS reads as generic.'
      : noAddress ? 'No site address.' : noConditions ? 'No site conditions (access, services, other trades, the public, ground).' : 'The site address and site conditions are given.');

  // Vague wording in a step with a high risk hazard. A "yes" to falls says some of the work is at
  // height, not every step: a planning or manual handling step is a fall step only where its name or
  // hazards say so, as when falls are not answered.
  const riskySteps = swms.steps.filter((step) => {
    const words = stepText(step, swms.task);
    return highRiskMatches(words, swms.fallRisk === 'yes' ? '' : swms.fallRisk, state).length || (swms.fallRisk === 'yes' && FALL_STEP.test(words.replace(SAME_LEVEL, ' ')));
  });
  // Owner decision (6 October 2026, Q8): a vague line fails outright only where it is the only
  // control for a high risk hazard in its step, that is, where no definite line in the step answers
  // that category. Otherwise the vague line costs points in W3.
  const vague = riskySteps.flatMap((step) => {
    const lines = step.controls.filter(isVague);
    if (!lines.length) return [];
    const words = stepText(step, swms.task);
    const ids = new Set(highRiskMatches(words, swms.fallRisk === 'yes' ? '' : swms.fallRisk, state).map((item) => item.id));
    if (swms.fallRisk === 'yes' && FALL_STEP.test(words.replace(SAME_LEVEL, ' '))) ids.add('fall');
    const definite = step.controls.filter((line) => !isVague(line));
    const bare = [...ids].filter((id) => !definite.some((line) => (ANSWERS[id] || /$^/).test(line)));
    return bare.length ? lines.map((line) => ({ step: step.step, line })) : [];
  });
  add('H5', 'Controls are definite, not left to the worker', !vague.length,
    vague.length ? `Controls for high risk hazards leave the decision to the worker, with no definite control for the hazard in that step: ${vague.slice(0, 5).map((item) => `"${item.line}" (${item.step || 'step'})`).join('; ')}. Say exactly what is done.`
      : 'No high risk hazard is left with only vague controls.');

  add('H6', 'Person responsible for checking the controls', responsibleNamed(swms.responsiblePerson),
    responsibleNamed(swms.responsiblePerson) ? `${swms.responsiblePerson} checks the controls.`
      : ONLY_BUSINESSES.test(swms.responsiblePerson) ? `No person is named as responsible for checking the controls: "${swms.responsiblePerson}" names businesses, not a person or position who checks.`
      : filled(swms.responsiblePerson) && !RESPONSIBLE_LABEL.test(swms.responsiblePerson) ? `No person is named as responsible for checking the controls: "${swms.responsiblePerson}" names the workers who sign on, not who checks.`
      : 'No person is named as responsible for checking the controls.');

  // Owner decision (October 2026): a SWMS sent for review is not signed yet, so at review stage
  // the sign-on is a condition before work starts, not a hard fail. Consultation (s 299) is still
  // required: a consultation statement, or a named supervisor or responsible person. On site, the
  // sign-on is required.
  const signed = swms.signatures.length > 0;
  const consulted = consultationRecorded(swms.consultation) || responsibleNamed(swms.responsiblePerson);
  const onSite = stage === 'on-site';
  add('H7', 'Workers consulted and signed on', signed || (!onSite && consulted),
    signed ? `${swms.signatures.length} worker${swms.signatures.length === 1 ? ' has' : 's have'} signed.`
      : !onSite && consulted ? 'Consultation is recorded. Workers must sign on before work starts.'
        : consultationRecorded(swms.consultation) ? 'Consultation is recorded, but no worker has signed the SWMS.' : 'No record that the workers were consulted or briefed, and no worker signatures.');
  // Goal 2: a blank (____) or "To be completed" left in what prints is a must-fix item.
  const open = [
    ...[['Task', swms.task], ['Site address', swms.site.address], ['Principal contractor', swms.principalContractor], ['Responsible person', swms.responsiblePerson], ['Review date', swms.reviewDate], ['Date', swms.date]]
      .filter(([, value]) => leftOpen(value)).map(([where, line]) => ({ where, line })),
    ...swms.steps.flatMap((step) => [step.step, ...step.hazards, ...step.controls, step.responsible].filter(leftOpen).map((line) => ({ where: step.step || 'step', line }))),
    ...[['plant', swms.plant], ['emergency', swms.emergency], ['licences', swms.licences], ['PPE', swms.ppe], ['site conditions', swms.siteWritten], ['fields', swms.otherFields]]
      .flatMap(([where, lines]) => lines.filter((line) => typeof line === 'string' && leftOpen(line)).map((line) => ({ where, line }))),
  ];
  add('H8', 'No blanks or placeholders left', !open.length,
    open.length ? `Blanks or placeholders are left in the SWMS: ${open.slice(0, 5).map((item) => `"${item.line.slice(0, 160)}" (${item.where})`).join('; ')}${open.length > 5 ? `; and ${open.length - 5} more` : ''}. Fill each one in with what applies on this job.`
      : 'No blanks or placeholders are left.');
  return { out, implied, named, preStart: signed ? [] : ['Workers must sign on before work starts.'] };
}

function weighted(swms, state, context) {
  const out = [];
  // Pass is judged on the points shown, so 4.86 shows and passes as 5 of 5.
  const add = (rule, title, max, points, fixes, good) => {
    const shown = Math.max(0, Math.min(max, Math.round(points)));
    out.push({ rule, title, hard: false, pass: shown >= max, points: shown, max, message: fixes.length ? fixes.join(' ') : good, fixes, source: SOURCES[rule] });
  };
  const steps = swms.steps;
  const allControls = steps.flatMap((step) => step.controls);
  const allText = [swms.task, ...steps.map((step) => [step.step, ...step.hazards, ...step.controls].join('. ')), ...swms.site.conditions, ...swms.plant, ...swms.licences, swms.review].join('\n');

  // W1 Hazards match the job steps (12; was 15): 8 for every step having hazards, 4 for hazards
  // that are the step's own.
  {
    const fixes = [];
    let points = 0;
    if (!steps.length) fixes.push('Break the work into job steps, each with its own hazards.');
    else {
      const withHazards = steps.filter((step) => step.hazards.length);
      points += 8 * (withHazards.length / steps.length);
      if (withHazards.length < steps.length) fixes.push(`Give every job step its own hazards (${steps.length - withHazards.length} of ${steps.length} have none).`);
      // Copied lists are found by similarity, not only an exact match: the same generic list with
      // one or two items swapped is still copied. One "Whole task" step, or steps that are only
      // hazard headings ("Manual handling", "Noise"), are not job steps.
      const sets = withHazards.map((step) => new Set(step.hazards.flatMap((line) => line.toLowerCase().match(/[a-z]{4,}/g) || [])));
      const similar = (a, b) => { const shared = [...a].filter((word) => b.has(word)).length; return shared / Math.max(1, new Set([...a, ...b]).size) >= 0.7; };
      const repeated = sets.length > 1 ? Math.max(...sets.map((set) => sets.filter((other) => similar(set, other)).length)) : 1;
      const headings = steps.filter((step) => HAZARD_HEADING.test(step.step));
      if (sets.length > 1 && repeated / sets.length > 0.5) fixes.push('The same hazards are copied into most steps. List the hazards each step really has.');
      else if (steps.length === 1) fixes.push('The SWMS has one step for the whole task. Break the work into job steps, each with its own hazards.');
      else if (headings.length > steps.length / 2) fixes.push('The steps are hazard headings, not job steps. List the steps of the work in order, each with its own hazards.');
      else points += 4;
      if (steps.length === 1) points = Math.min(points, 4);
    }
    add('W1', 'Hazards match the job steps', 12, points, fixes, 'Each step has its own hazards.');
  }

  // W2 Controls follow the hierarchy (12; was 20, then 15): 8 for a higher order control in each
  // high risk step, 4 for few PPE controls.
  {
    const fixes = [];
    let points = 0;
    const levels = allControls.map(controlLevel);
    // Judged across every step, so a step with no controls counts against the score: a SWMS
    // that controls 2 of its 21 steps does not get full marks for those 2.
    const risky = steps.filter((step) => highRiskMatches(stepText(step, swms.task), swms.fallRisk, state).length);
    const judged = risky.length ? risky : steps;
    const strong = judged.filter((step) => step.controls.some((line) => HIGHER.has(controlLevel(line))));
    if (judged.length) points += 8 * (strong.length / judged.length);
    if (judged.length && strong.length < judged.length) fixes.push(`Add an elimination, substitution, isolation or engineering control to: ${judged.filter((step) => !strong.includes(step)).slice(0, 4).map((step) => step.step).join('; ')}.`);
    const ppeShare = levels.length ? levels.filter((level) => level === 'PPE').length / levels.length : 1;
    if (ppeShare <= 0.2) points += 4;
    else if (ppeShare <= 0.35) { points += 2; fixes.push('Too many controls are PPE. Put higher order controls first.'); } else fixes.push('Most controls are PPE. Put elimination, isolation and engineering controls before PPE.');
    add('W2', 'Controls follow the hierarchy', 12, points, fixes, 'Each high risk step has a higher order control, and few controls are PPE.');
  }

  // W3 Controls are specific and checkable (10; was 15, 2 went to W11 and 3 to W12).
  {
    const fixes = [];
    const share = allControls.length ? allControls.filter(checkable).length / allControls.length : 0;
    let points = 10 * Math.min(1, share / 0.4);
    // Vague wording costs in proportion to how much of the SWMS it is, so one phrase does not zero it,
    // but each vague line costs at least 1 point (owner decision, 6 October 2026: a vague line that
    // is not the only control for a high risk hazard costs points here instead of failing H5).
    const vague = allControls.filter(isVague);
    points -= Math.min(4, Math.max(vague.length, allControls.length ? 10 * (vague.length / allControls.length) : 0));
    if (share < 0.4) fixes.push('Make controls measurable: distances, ratings, standards, inspections, permits and named equipment.');
    if (vague.length) fixes.push(`Replace vague wording such as "${vague[0]}"${vague.length > 1 ? ` (${vague.length} lines)` : ''}. Say what is done, by whom, or to what standard.`);
    // Known unsafe controls. Concrete cutting with nothing for the silica dust is now judged in W13,
    // with the rest of silica's minimum control set (owner decision, 6 October 2026).
    const unsafe = allControls.filter((line) => UNSAFE.test(line));
    if (unsafe.length) { points -= 3; fixes.push(`Remove an unsafe control: "${unsafe[0]}". A trigger locked on defeats the dead-man control (AS/NZS 4233.1).`); }
    add('W3', 'Controls are specific and checkable', 10, points, fixes, 'Controls are measurable and can be checked on site.');
  }

  // W4 Implementation, monitoring and review (6; was 10, then 7). The 3 points for one person
  // responsible for the whole SWMS went to W11; H6 still fails a SWMS that names no one.
  {
    const fixes = [];
    let points = 0;
    const review = [swms.review, ...allControls].join(' ');
    if (/\b(before (?:the task|work|each|starting)|each (?:shift|day|morning)|daily|weekly|pre-?start|while (?:the task|work)|during|toolbox)\b/i.test(review)) points += 3; else fixes.push('Say when the controls are checked (for example, before each shift).');
    // Revised when the work changes: a new stage, method or site condition (2 points); and after
    // an incident or a control that is not working (1 point). Each trigger is read in a sentence
    // that says the SWMS is reviewed (or the next one), so "activate the site incident response
    // procedure" is an emergency step, not a review trigger.
    const sentences = [swms.review, ...allControls].filter(Boolean).join(' ').split(/(?<=[.!?])\s+/);
    const reviewed = (pattern) => sentences.some((line, n) => pattern.test(line) && REVIEW_WORD.test(`${line} ${sentences[n + 1] || ''}`));
    if (/\bnew (?:work )?stages?\b/i.test(review) || reviewed(CHANGE_TRIGGER)) points += 2; else fixes.push('Say the SWMS is revised when the work stage, method or site changes.');
    if (reviewed(FAILURE_TRIGGER)) points += 1; else fixes.push('Say the SWMS is reviewed after an incident or when a control is not working.');
    add('W4', 'Implementation, monitoring and review', 6, points, fixes, 'When the controls are checked, and what triggers a review, are stated.');
  }

  // W5 Licences, competency and plant (8; was 10, 2 went to W12): crew credentials 3, licences
  // matched to the plant 3, plant inspected 2.
  {
    const fixes = [];
    let points = 0;
    // The plant named in the plant list says what is used, not who may use it: "Tray truck with
    // crane" is no crane licence. A licence given against it ("Forklift: ...: LF") still counts.
    const credentials = [...swms.licences, ...allControls, ...swms.plant.map((line) => line.split(':').slice(1).join(':'))].join(' ');
    if (swms.licences.length || /\b(white card|general construction induction|competen\w*|tickets?|licen[cs]\w*|trained|verification of competency|voc)\b/i.test(credentials)) points += 3; else fixes.push('List the licences, tickets and training the crew holds.');
    // The plant and work are read from the task, the step names and the plant list. Hazards and
    // controls mention a switchboard or a crane in passing ("RCD on the switchboard").
    const work = [swms.task, ...steps.map((step) => step.step), ...swms.plant].join('\n');
    // Each plant item read beside its competency is its own need: an excavator and a tipper are two.
    const needed = LICENSED_PLANT.filter((item) => item.plant.test(work)).flatMap((item) => (item.beside
      ? [...new Map([...work.matchAll(new RegExp(item.plant.source, 'gi'))].map((match) => [match[0].toLowerCase().replace(/s$/, ''), { ...item, name: match[0] }])).values()]
      : [{ ...item, name: item.plant.exec(work)[0] }]));
    // Operator competency for other plant is read beside the plant: a licence line, a plant list row
    // or a control that names both, or one that covers all plant operators.
    const credentialLines = [...swms.licences, ...allControls, ...swms.plant];
    const unmatched = needed.filter((item) => (item.beside
      ? !credentialLines.some((line) => (namesPlant(item.name, line) || ALL_OPERATORS.test(line)) && item.licence.test(line))
      : !item.licence.test(credentials)));
    points += needed.length ? 3 * ((needed.length - unmatched.length) / needed.length) : 3;
    if (unmatched.length) fixes.push(`Match a licence or ticket to the plant and work: ${unmatched.map((item) => item.name).join(', ')}.`);
    if (!PLANT_WORDS.test(allText) || /\b(inspect\w*|pre-?start|log ?books?|serviced|tested and tagged|test and tag|handover certificate)\b/i.test([...swms.plant, ...allControls].join(' '))) points += 2; else fixes.push('Say how plant and equipment are inspected before use.');
    add('W5', 'Licences, competency and plant', 8, points, fixes, 'Licences, tickets and plant inspections are matched to the task.');
  }

  // W6 Emergency and rescue (8; was 10): first aid 2, emergency contacts and procedure 3, rescue 3.
  {
    const fixes = [];
    let points = 0;
    // A promise to write a plan ("develop an emergency plan") is not the plan, and nor is a
    // template's question left unanswered ("List the equipment that will be used in the rescue").
    const emergency = [...swms.emergency, ...allControls].filter((line) => !PLAN_PROMISE.test(line) && !TEMPLATE_QUESTION.test(line)).join(' ');
    if (/\bfirst aid\w*\b/i.test(emergency)) points += 2; else fixes.push('Say where first aid is and who the first aider is.');
    const contacts = /\b(000|emergency (?:contacts?|numbers?|services|procedures?|plan)|muster|hospital|evacuat\w*|raise the alarm)\b/i.test(emergency);
    if (contacts) points += 3; else fixes.push('Give the emergency contacts and procedure.');
    const ids = new Set([...context.implied, ...context.named].map((item) => item.id));
    const rescueNeeded = ['fall', 'confined', 'trench', 'water', 'tower'].filter((id) => ids.has(id));
    // With no rescue needed, the rescue share goes with having an emergency procedure at all.
    if (rescueNeeded.length ? /\brescue\b/i.test(emergency) : contacts) points += 3; else if (!rescueNeeded.length) fixes.push('Add an emergency section: contacts, the procedure and the nearest hospital.'); else fixes.push(`Add a rescue plan for ${rescueNeeded.map((id) => ({ fall: 'a fall or a person suspended in a harness', confined: 'the confined space', trench: 'the trench', water: 'a person in the water', tower: 'the tower' })[id]).join(', ')}.`);
    add('W6', 'Emergency and rescue', 8, points, fixes, 'First aid, emergency contacts and rescue are covered.');
  }

  // W7 Site specific details (8; was 10): a fifth each, from the site conditions. Generic control
  // wording ("barricade the area", "dial before you dig") gives half that, and only where the SWMS names
  // the site: a template with no site has no site details. Exclusion zones are controls, so
  // they count in full from either.
  {
    const fixes = [];
    let points = 0;
    const conditions = swms.site.conditions.join(' ');
    const controls = allControls.join(' ');
    const sited = filled(swms.site.address);
    const checks = [
      ['access', /\b(access\w*|egress|entry|stairs?|ladders?|routes?|deliver\w*)\b/i, 'how people, plant and materials get to the work'],
      ['exclusion', /\b(exclusion zones?|barricad\w*|barriers?|no go zones?|drop zones?|fenc\w*)\b/i, 'exclusion zones'],
      ['trades', /\b(other trades|trades?|subcontractors?|working (?:above|below)|work fronts?)\b/i, 'other trades nearby'],
      ['public', /\b(public|pedestrians?|neighbou?rs?|footpaths?|occupants?|residents?|traffic|visitors?)\b/i, 'the public'],
      ['services', /\b(services?|power ?lines?|overhead|underground|gas|water mains?|before you dig|dbyd|cables?)\b/i, 'live services'],
    ];
    for (const [id, pattern, label] of checks) {
      if (pattern.test(conditions) || (id === 'exclusion' && pattern.test(controls))) points += 8 / checks.length;
      else if (sited && pattern.test(controls)) { points += 4 / checks.length; fixes.push(`Say in the site conditions how this site handles ${label}.`); } else fixes.push(`Say how the site handles ${label}.`);
    }
    add('W7', 'Site specific details', 8, points, fixes, 'Access, exclusion zones, other trades, the public and services are covered.');
  }

  // W8 Readable and short (2; was 5). A printed risk matrix is not marked down (owner decision,
  // 5 October 2026), nor is a long list of legislation (owner decision, 6 October 2026, Q10): its 3
  // points went to W13 and W14. Length is judged by the steps and controls.
  {
    const fixes = [];
    let points = 2;
    if (allControls.length > 120 || steps.length > 25) { points -= 2; fixes.push('Shorten the SWMS to the high risk hazards and their controls.'); }
    add('W8', 'Readable and short', 2, points, fixes, 'Short and to the point.');
  }

  // W9 Document control (6; was 5): revision 1, date 1, review date 1, principal contractor 2, and a
  // date beside each worker signature 1 (owner decision, 6 October 2026, Q12). A SWMS not yet signed
  // has no signature to date, so it keeps that point; H7 deals with the sign-on.
  {
    const fixes = [];
    let points = 0;
    if (filled(swms.revision)) points += 1; else fixes.push('Add a revision number.');
    // A review date that has passed is not a review date. A SWMS dated more than two years ago
    // with no review date still to come has not been reviewed.
    const dated = dateOf(swms.date);
    const due = dateOf(swms.reviewDate, true);
    const expired = due && due < context.today;
    const stale = dated && !(due && due >= context.today) && context.today - dated > TWO_YEARS;
    if (!filled(swms.date)) fixes.push('Add the date.');
    else if (stale) fixes.push(`The SWMS is dated ${swms.date}, more than two years ago, with no review since. Review it and date the new revision.`);
    else points += 1;
    if (!filled(swms.reviewDate)) fixes.push('Add a review date.');
    else if (expired) fixes.push(`The review date (${swms.reviewDate}) has passed. Review the SWMS and set a new review date.`);
    else points += 1;
    if (filled(swms.principalContractor)) points += 2; else fixes.push('Name the principal contractor.');
    const undated = swms.signatures.filter((item) => !filled(item.date));
    if (!undated.length) points += 1; else fixes.push(`Put the date beside each worker's signature (${undated.length} of ${swms.signatures.length} ${swms.signatures.length === 1 ? 'has' : 'have'} none).`);
    const prompts = [swms.task, ...steps.flatMap((step) => [step.step, ...step.hazards, ...step.controls]), ...swms.plant].filter((line) => TEMPLATE_PROMPT.test(line));
    if (prompts.length) { points -= 1; fixes.push(`Fill in or remove the template prompts left in the SWMS, such as "${prompts[0].slice(0, 80)}".`); }
    add('W9', 'Document control', 6, points, fixes, 'Revision, dates, principal contractor and dated signatures are given.');
  }

  // W10 Controls in hierarchy order within each step (4; was 5): elimination, substitution, isolation and
  // engineering controls come before administrative controls and PPE. Judged on steps that have both.
  {
    const fixes = [];
    const judged = steps.filter((step) => step.controls.some((line) => HIGHER.has(controlLevel(line))) && step.controls.some((line) => !HIGHER.has(controlLevel(line))));
    const outOfOrder = judged.filter((step) => {
      const higher = step.controls.map((line) => HIGHER.has(controlLevel(line)));
      return higher.lastIndexOf(true) > higher.indexOf(false);
    });
    const points = judged.length ? 4 * ((judged.length - outOfOrder.length) / judged.length) : 4;
    if (outOfOrder.length) fixes.push(`List the controls in hierarchy order, with elimination, isolation and engineering controls before administrative controls and PPE, in: ${outOfOrder.slice(0, 4).map((step) => step.step || 'step').join('; ')}.`);
    add('W10', 'Controls in hierarchy order within each step', 4, points, fixes, 'Within each step, higher order controls come before administrative controls and PPE.');
  }

  // W11 A responsible position per step (4; was 5): named against the step, or in its controls
  // ("the supervisor checks ..."). One person for the whole SWMS is H6, and is not enough here.
  {
    const fixes = [];
    const withControls = steps.filter((step) => step.controls.length);
    // A control counts only where it gives the position the checking ("the supervisor checks the
    // tag", "inspected by the scaffolder"), not a position named in passing.
    const missing = withControls.filter((step) => !responsibleNamed(step.responsible) && !step.controls.some((line) => CHECKED_BY.test(line)));
    const points = withControls.length ? 4 * ((withControls.length - missing.length) / withControls.length) : 0;
    if (!withControls.length) fixes.push('Name the position responsible for the controls in each step.');
    else if (missing.length) fixes.push(`Name the position responsible for the controls in each step (for example, supervisor or leading hand), not only one person for the SWMS. ${missing.length} of ${withControls.length} steps name none: ${missing.slice(0, 4).map((step) => step.step || 'step').join('; ')}.`);
    add('W11', 'A responsible position for each step', 4, points, fixes, 'Each step names the position responsible for its controls.');
  }

  // W12 Named permits where the work needs one (5).
  {
    const fixes = [];
    // A step that only checks or inspects ("be aware of overhead power lines") is not the work.
    const ownWork = [swms.task, ...steps.map((step) => step.step).filter((name) => !checkOnly(name))].join('\n');
    const work = [ownWork, ...swms.highRisk].join('\n');
    // A step named for its permit ("Work permit system") names it too.
    const permitText = [...allControls, ...steps.map((step) => step.step), ...swms.site.conditions, ...swms.licences, ...swms.plant, ...swms.emergency, swms.review].join('\n');
    const sitePermits = SITE_PERMITS.test([allText, ...swms.emergency].join('\n'));
    const hazards = steps.flatMap((step) => step.hazards).join('\n');
    const controls = [...allControls, ...swms.site.conditions].join('\n');
    const domestic = domesticWork(swms.task, /^yes$/i.test(swms.residential) ? true : /^no$/i.test(swms.residential) ? false : undefined)
      || (!/^no$/i.test(swms.residential) && /\b(domestic dwellings?|householders?|home ?owners?)\b/i.test(allText));
    const needed = PERMITS.filter((item) => !(item.notDomestic && domestic)
      && (item.work.test((item.notFromCategory ? ownWork : work).replace(item.ignore || /$^/g, ' ')) || (item.sparks && sentencesOf([ownWork, ...allControls]).some((line) => item.sparks.test(line) && !NO_SPARKS.test(line)))
        || (item.process && sentencesOf(allControls).some((line) => item.process.test(line) && !NO_HOT_WORK.test(line))))
      && (!item.near || item.near.test(`${allText}\n${hazards}`)) && (!item.outside || !item.outside.test(controls)) && (!item.exempt || !item.exempt.test(controls)) && (!item.onlyWithSitePermits || sitePermits));
    // Hand digging or a hand auger, or a rural greenfield site, with the services located first
    // needs no dig permit beyond that.
    const located = /\b(?:locat\w*|identif\w*|scan\w*|dbyd|byda|before you dig)\b[^.]{0,60}\bservices?\b|\bservices?\b[^.]{0,40}\b(?:located|identified|marked|scanned)\b/i.test(controls);
    const lowRiskDig = /\b(?:hand[- ]?(?:held )?(?:auger|dig)\w*|by hand|hand excavat\w*|rural|greenfield|paddocks?|farm ?land)\b/i.test(`${work}\n${swms.site.conditions.join('\n')}\n${swms.plant.join('\n')}`);
    const unnamed = needed.filter((item) => !item.permit.test(permitText) && !(item.label.startsWith('excavation') && located && lowRiskDig));
    // Hot work also needs a fire watch and an extinguisher at the work. With the permit named, each
    // missing one costs a quarter of the hot work share; without it, the share is already lost.
    const hotWork = needed.find((item) => item.label === 'hot work');
    const fireGaps = hotWork ? HOT_WORK_FIRE.filter((item) => !item.pattern.test(permitText)) : [];
    const fireLost = hotWork && !unnamed.includes(hotWork) ? fireGaps.length / 4 : 0;
    const points = needed.length ? 5 * ((needed.length - unnamed.length - fireLost) / needed.length) : 5;
    if (unnamed.length) fixes.push(`Name the permit the work needs: ${unnamed.map((item) => `${item.name} (${item.label})`).join('; ')}.`);
    if (fireGaps.length) fixes.push(`For the hot work, add ${fireGaps.map((item) => item.name).join(' and ')}.`);
    add('W12', 'Named permits where the work needs one', 5, points, fixes, needed.length ? `The permits are named: ${needed.map((item) => item.label).join('; ')}.` : 'No work needing a permit was found.');
  }

  // W13 The minimum control set for each high risk category (12): 2 points for each must-have
  // missing (owner decision, 6 October 2026, Q12). A vague line does not count as the control.
  {
    const fixes = [];
    const evidence = [
      ...steps.flatMap((step) => [step.step, ...step.controls].filter((line) => line && !isVague(line)).map((line) => ({ line, where: stepText(step, swms.task) }))),
      ...[...swms.plant, ...swms.licences, ...swms.site.conditions, ...swms.emergency, swms.review].filter(Boolean).map((line) => ({ line, where: '' })),
    ];
    const said = [swms.task, ...swms.highRisk, ...steps.flatMap((step) => [step.step, ...step.hazards]), ...swms.plant].join('\n');
    const controlText = allControls.join('\n');
    const sets = minimumSets(swms, state, context);
    // A crew that does not remove asbestos itself, and says a licensed asbestos removalist does, is not
    // asked for the removal controls; the removalist's own SWMS carries them (owner decision, 6 October 2026).
    const byRemovalist = /\blicensed asbestos removalists?\b/i.test(controlText)
      && !/\b(?:remov\w*|strip\w*|encapsulat\w*)\b[^.\n]{0,40}\basbestos\b|\basbestos\b[^.\n]{0,40}\b(?:remov\w*|strip\w*)/i.test(swms.task);
    const gaps = [];
    for (const { set, steps: where } of sets) {
      const musts = set.musts.filter((must) => (!must.when || must.when.test(said)) && (!must.whenControls || must.whenControls.test(controlText))
        && (!must.unless || !must.unless.test(`${said}\n${controlText}`)) && !(must.byRemovalist && byRemovalist));
      const missing = musts.filter((must) => !evidence.some(({ line, where: words }) => (!must.context || must.context.test(line) || (!must.lineOnly && must.context.test(words))) && saysControl(must, line)));
      if (missing.length) gaps.push({ set, where, missing });
    }
    const lost = gaps.reduce((sum, gap) => sum + gap.missing.length, 0);
    for (const gap of gaps) fixes.push(`For ${gap.set.label}${gap.where.length ? ` (${gap.where.slice(0, 3).join('; ')})` : ''}, add ${gap.missing.map((must) => must.name).join('; ')}.`);
    add('W13', 'Minimum controls for each high risk category', 12, 12 - 2 * lost, fixes,
      sets.length ? `Each category has its minimum controls: ${sets.map(({ set }) => set.label).join('; ')}.` : 'No high risk category needing a minimum control set was found.');
  }

  // W14 Hazardous chemicals (3): where the SWMS shows chemicals are used, the products or product
  // types are named (1) and the safety data sheet controls are given (2) (owner decision, 6 October 2026, Q11).
  {
    const fixes = [];
    let points = 3;
    const used = [swms.task, ...steps.flatMap((step) => [step.step, ...step.hazards, ...step.controls]), ...swms.plant]
      .map((line) => line.replace(NOT_CHEMICAL, ' ')).filter(chemicalsUsed);
    if (used.length) {
      const where = [...allControls, ...steps.map((step) => step.step), ...swms.plant, ...swms.licences, ...swms.site.conditions, ...swms.emergency, swms.review].filter(Boolean);
      const named = [swms.task, ...steps.flatMap((step) => [step.step, ...step.hazards, ...step.controls]), ...swms.plant, ...swms.licences].some((line) => PRODUCT_TYPE.test(line) || BRAND.test(line));
      const sds = where.some((line) => SDS.test(line) || (MAKER_DIRECTIONS.test(line) && CHEMICAL_USE.test(line)));
      const word = CHEMICAL_USE.exec(used[0])[0].toLowerCase();
      if (!named) { points -= 1; fixes.push(`The SWMS uses chemicals (such as "${word}"): name the products or product types used.`); }
      if (!sds) { points -= 2; fixes.push('Add the safety data sheet controls for the chemicals: the SDS at the work area and followed, and containers labelled.'); }
    }
    add('W14', 'Hazardous chemicals named, with safety data sheets', 3, points, fixes, used.length ? 'The chemicals used are named and their safety data sheets are at hand.' : 'No hazardous chemicals are used.');
  }
  return out;
}

function bandFor(score, failed) {
  if (failed || score < 60) return BANDS.rejected;
  return score >= 90 ? BANDS.accepted : BANDS.changes;
}

// Checks a SWMS given in the structured form. The state sets the high risk categories. With no
// state given, the result says so and the national model WHS Regulations categories are used
// (not Queensland's). options.today sets the date review dates are judged against. options.stage
// is 'review' (the default: a SWMS sent to the builder before work) or 'on-site' (a SWMS in use).
function checkSwms(input, options = {}) {
  const swms = normaliseSwms(input);
  const state = findState(options.state || swms.state);
  const today = options.today ? new Date(options.today) : new Date();
  const stage = options.stage === 'on-site' ? 'on-site' : 'review';
  const { out: hard, implied, named, preStart } = hardFails(swms, state, stage);
  const items = weighted(swms, state, { implied, named, today });
  const score = items.reduce((sum, item) => sum + item.points, 0);
  const failed = hard.filter((item) => !item.pass);
  return {
    kind: 'check',
    state: state ? state.id : 'unknown',
    stage,
    task: swms.task,
    score,
    band: bandFor(score, failed.length > 0),
    hardFails: failed.map((item) => item.rule),
    // Conditions before work starts: at review stage, the workers' sign-on.
    preStart,
    findings: [...hard, ...items],
  };
}

// ---- A SiteReady draft in the structured form ----

// The checker reads a SiteReady draft as a builder would read the printed SWMS. Nothing
// is added that the draft does not print. The Word file prints a risk matrix whenever the
// steps carry ratings, and each step's responsible position in its Who column.
function fromDraft(draft, extra = {}) {
  const conditions = (draft.site || []).filter((row) => filled(row.text)).map((row) => `${row.label}: ${row.text}`);
  const emergency = (draft.emergency || []).map((row) => [row.type, row.equipment, row.detail].filter(Boolean).join(': '));
  // As printed, placeholders included ("Muster point: To be completed"), so H8 sees what the reviewer sees.
  if (text(draft.hospital)) emergency.push(`Hospital: ${draft.hospital}`);
  if (text(draft.firstAider)) emergency.push(`First aider: ${draft.firstAider}`);
  if (text(draft.musterPoint)) emergency.push(`Muster point: ${draft.musterPoint}`);
  const otherFields = [
    ...(draft.site || []).filter((row) => leftOpen(row.text)).map((row) => `${row.label}: ${row.text}`),
    ...[['Scaffold supervisor', draft.scaffoldSupervisor], ['Site manager', draft.siteManager], ['Works manager', draft.worksManager], ['Person responsible for reviewing the control measures', draft.reviewer]]
      .filter(([, value]) => text(value)).map(([label, value]) => `${label}: ${value}`),
    ...(draft.controls || []).map((item) => item && item.text).filter(leftOpen),
    ...(draft.references || []).map((item) => item && item.text).filter(leftOpen),
  ];
  const steps = (draft.jobSteps || []).map((step) => ({ step: step.step, hazards: step.hazards || [], controls: step.controls || [], responsible: step.responsible || '' }));
  return {
    state: extra.state || '',
    task: draft.task,
    fallRisk: draft.fallRisk,
    site: { address: draft.workplace, conditions },
    highRisk: draft.highRisk || [],
    steps,
    ppe: (draft.ppe || []).flatMap((group) => group.items.filter((item) => item.ticked).map((item) => item.label)),
    responsiblePerson: draft.complianceResponsible || draft.siteManager || draft.worksManager || '',
    consultation: '',
    signatures: (draft.workers || []).filter((row) => filled(row.name)),
    revision: draft.revision ?? '',
    date: draft.date,
    reviewDate: draft.reviewDate,
    residential: draft.residential || '',
    principalContractor: draft.principalContractor,
    licences: draft.qualifications || [],
    plant: (draft.plant || []).map((row) => [row.item, row.inspection, row.licence].filter(Boolean).join(': ')),
    emergency,
    otherFields,
    review: draft.review || '',
    legislation: (draft.sources && draft.sources.legislation) || [],
    riskMatrix: steps.length > 0 && (draft.jobSteps || []).some((step) => step.risk),
    ...extra.swms,
  };
}

// ---- The email to the subcontractor (#99) ----

// Copy and paste only: SiteReady never sends it. Hard fails come first, then the weighted
// items that lost the most points.
function emailDraft(result, options = {}) {
  const hello = options.to ? `Hi ${options.to},` : 'Hi,';
  const sign = options.from ? `\n\nRegards,\n${options.from}` : '\n\nRegards,';
  const task = result.task ? result.task.replace(/\.$/, '').slice(0, 200) : '';
  const about = task ? ` for "${task}"` : '';
  const title = task ? `: ${task}` : '';
  if (result.band === BANDS.accepted) {
    const before = result.preStart && result.preStart.length ? `\n\nBefore work starts: ${result.preStart.join(' ')}` : '';
    return { subject: `SWMS approved${title}`, body: `${hello}\n\nGreat SWMS, approved, see attached my approved and signed copy.${before}${sign}` };
  }
  const hard = result.findings.filter((item) => item.hard && !item.pass);
  const soft = result.findings.filter((item) => !item.hard && item.points < item.max)
    .sort((a, b) => (b.max - b.points) - (a.max - a.points));
  const lines = [];
  let n = 0;
  if (hard.length) {
    lines.push('Must fix before work starts:');
    for (const item of hard) lines.push(`${n += 1}. ${item.message}`);
  }
  if (soft.length) {
    if (lines.length) lines.push('');
    lines.push(hard.length ? 'Also fix:' : 'Changes needed:');
    for (const item of soft) for (const fix of item.fixes) lines.push(`${n += 1}. ${fix}`);
  }
  if (result.preStart && result.preStart.length) {
    if (lines.length) lines.push('');
    lines.push('Before work starts:');
    for (const line of result.preStart) lines.push(`${n += 1}. ${line}`);
  }
  const opening = result.band === BANDS.changes
    ? `Thanks for the SWMS${about}. It is accepted with changes (score ${result.score} out of 100). Please make these changes and send me the updated copy.`
    : `Thanks for the SWMS${about}. It is not accepted yet (score ${result.score} out of 100${hard.length ? `, ${hard.length} must-fix item${hard.length === 1 ? '' : 's'}` : ''}). Work under it cannot start until these are fixed. Please send me the updated copy.`;
  return {
    subject: `SWMS ${result.band === BANDS.changes ? 'accepted with changes' : 'not accepted'}${title}`,
    body: `${hello}\n\n${opening}\n\n${lines.join('\n')}${sign}`,
  };
}

module.exports = { checkSwms, bandFor, normaliseSwms, fromDraft, emailDraft, controlLevel, isVague, BANDS, SOURCES, VAGUE };
