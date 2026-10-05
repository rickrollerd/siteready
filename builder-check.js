// The builder SWMS check, v1 (tasks #106, #99 and part of #78). A builder or principal
// contractor checks a subcontractor's SWMS: seven hard fails, then 100 points of weighted
// items, a result band, and a copy-and-paste email to the subcontractor. SiteReady never
// sends the email.
//
// The rules are the owner-approved v1 rules of 5 October 2026 ("SiteReady builder check and
// outreach drafts"). Bands: Accepted 90 to 100; Accepted with changes 60 to 89; Not accepted
// below 60 or any hard fail.
//
// Owner decisions of 5 October 2026 (v1.1). Three criteria were added, seen in the Multiplex SWMS
// for HRCW review checklist rev 9 (used as evidence of what tier 1 builders check; nothing is
// copied from it). They fit in the same 100 points, taken from the items they overlap:
//   W10 Controls in hierarchy order within each step (5): from W2, hierarchy (20 to 15).
//   W11 A responsible position per step (5): 3 from W4, which gave 3 for one responsible person
//       for the whole SWMS (H6 still requires that person), 10 to 7; 2 from W3, checkable (15 to 13).
//   W12 Named permits where the work needs one (5): 3 from W3, which counted any permit as a
//       checkable detail (13 to 10); 2 from W5, licences and authority to do the work (10 to 8).
// Now: W1 15, W2 15, W3 10, W4 7, W5 8, W6 10, W7 10, W8 5, W9 5, W10 5, W11 5, W12 5 = 100.
// A printed risk matrix no longer loses points in W8. "Where reasonably practicable" (the legal
// test in the WHS Act) is not vague wording in H5 or W3.
//
// The SWMS comes in one structured form, whatever its source (an AI reading of an uploaded
// document, or a SiteReady draft):
// { state, task, fallRisk, site: { address, conditions[] }, highRisk[], steps[{ step, hazards[], controls[], responsible }],
//   ppe[], responsiblePerson, consultation, signatures[{ name, date }], revision, date, reviewDate,
//   principalContractor, licences[], plant[], emergency[], review, legislation[], riskMatrix }
const { findState, highRiskList } = require('./legislation');
const { highRiskMatches } = require('./draft');

const BANDS = { accepted: 'Accepted', changes: 'Accepted with changes', rejected: 'Not accepted' };

const SOURCES = {
  H1: 'WHS Regulations s 299 and s 300; tier 1 review checklists check each high risk category',
  H2: 'WHS Regulations s 299(3)',
  H3: 'Hierarchy of control (WHS Regulations s 36 and s 78); SafeWork NSW work at heights findings 2023-24',
  H4: 'SafeWork SA high risk construction work audit 2020; WHSQ construction blitz 2023',
  H5: 'Tier 1 SWMS review checklists; regulator guidance',
  H6: 'Model Code of Practice: Construction Work (how controls are implemented, monitored and reviewed)',
  H7: 'WHS Regulations s 299; WHSQ construction blitz 2023 ("involve workers")',
  W1: 'Model Code of Practice: Construction Work (SWMS content); WHSQ construction blitz 2023 (task specific)',
  W2: 'Hierarchy of control (WHS Regulations s 36); Model Code of Practice: Construction Work',
  W3: 'Tier 1 SWMS review checklists; SafeWork NSW campaign findings',
  W4: 'Model Code of Practice: Construction Work; WHSQ work at heights campaign 2026; Bernie Leen & Sons (Vic, 2016): the SWMS must be revised when the work changes',
  W5: 'WHS Regulations (high risk work licences and plant); SafeWork NSW earthmoving plant findings 2022-23',
  W6: 'Model Code of Practice: Construction Work (emergency arrangements); WHS Regulations s 80 (rescue after a fall)',
  W7: 'SafeWork SA high risk construction work audit 2020; WHSQ construction blitz 2023',
  W8: 'Safe Work Australia SWMS information sheet and SWMS tool; OFSC SWMS fact sheet. A printed risk matrix is not marked down (owner decision, 5 October 2026)',
  W9: 'Tier 1 SWMS review checklists (revision, dates, principal contractor)',
  W10: 'Hierarchy of control (WHS Regulations s 36); Model Code of Practice: Construction Work; Multiplex SWMS for HRCW review checklist rev 9 (evidence that tier 1 builders check the order)',
  W11: 'Model Code of Practice: Construction Work (who implements, monitors and reviews each control); WHS Regulations s 299(3); Multiplex SWMS for HRCW review checklist rev 9 (evidence: a position per step, not one person for the SWMS)',
  W12: 'WHS Regulations s 67 (confined space entry permit), s 166 (overhead and underground electric lines) and s 304 (underground essential services); Model Code of Practice: Construction Work; Multiplex SWMS for HRCW review checklist rev 9 (evidence that tier 1 builders check named permits)',
};

// ---- Reading the structured form ----

const text = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
const list = (value) => (Array.isArray(value) ? value.map((item) => (typeof item === 'string' ? text(item) : item)).filter(Boolean) : []);
// "To be completed", "TBC", blanks and lines of underscores are not an answer.
const PLACEHOLDER = /^(?:to be (?:completed|confirmed|advised)\b.*|tb[cda]|n\/?a|none|nil|-+|_+|\.+|\?+|name:?\s*_*)$/i;
const filled = (value) => Boolean(text(value)) && !PLACEHOLDER.test(text(value)) && !/_{3,}/.test(text(value));

function normaliseSwms(input = {}) {
  const site = input.site && typeof input.site === 'object' ? input.site : {};
  const signatures = (Array.isArray(input.signatures) ? input.signatures : [])
    .map((item) => (typeof item === 'string' ? { name: text(item), date: '' } : { name: text(item && item.name), date: text(item && item.date) }))
    .filter((item) => filled(item.name));
  return {
    state: text(input.state),
    task: text(input.task),
    // "Yes" or "No", or a SiteReady answer such as "No. No work is done where ...".
    fallRisk: (/^(yes|no)\b/i.exec(text(input.fallRisk)) || [''])[0].toLowerCase(),
    site: { address: text(site.address || input.siteAddress), conditions: list(site.conditions || input.siteConditions).filter(filled) },
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
  fall: /\bfall/i,
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
  plant: /\bmobile plant\b|\bplant (?:movement|moving)\b/i,
  temperature: /\bextremes? of temperature\b|\btemperature extremes?\b/i,
  water: /\bdrown|\b(?:in|near|over|adjacent to) water\b/i,
  diving: /\bdiving\b/i,
  silica: /\bsilica\b/i,
};

// Controls that answer a category: without one, the category has no controls (H2).
const ANSWERS = {
  fall: /\b(guard ?rails?|edge protection|scaffold\w*|ewps?|elevating work platforms?|scissor lifts?|boom lifts?|harness\w*|fall arrest|restraint|safety mesh|catch platforms?|handrails?|covers?|covered|barricad\w*|ladders?|anchor\w*|from the ground|void protection|penetration covers?)\b/i,
  tower: /\b(climb\w*|fall arrest|harness|isolat\w*|radio ?frequency|rf|emr|exclusion)\b/i,
  demolition: /\b(engineer\w*|demolition (?:plan|sequence|work plan)|sequence|propp?\w*|exclusion zones?|structural)\b/i,
  asbestos: /\b(asbestos|licensed|removalist|clearance|wet\w*|hepa)\b/i,
  temporary: /\b(propp?\w*|props?|temporary support|engineer\w*|shor\w*|brac\w*)\b/i,
  confined: /\b(permit|gas test\w*|atmospher\w*|standby|stand-by|rescue|ventilat\w*|entry)\b/i,
  trench: /\b(shor\w*|shields?|trench box\w*|batter\w*|bench\w*|engineer\w*|barriers?|exclusion|edge protection|fenc\w*)\b/i,
  tunnel: /\b(engineer\w*|support|ventilat\w*|rescue|exclusion)\b/i,
  explosives: /\b(shot ?firer|blast\w*|exclusion|licen\w*|explosives?)\b/i,
  gas: /\b(isolat\w*|purg\w*|leak test\w*|locat\w*|before you dig|gas fitter|shut ?off)\b/i,
  chemicalLine: /\b(isolat\w*|purg\w*|drain\w*|depressuri\w*|recover\w*|locat\w*|permit)\b/i,
  electrical: /\b(isolat\w*|de-?energi[sz]\w*|lock ?out|lockout|tag ?out|danger tags?|test before (?:you )?touch|test for dead|clearances?|approach distances?|spotters?|safety observers?|observers?|exclusion|rcds?|locat\w*|before you dig|insulated|no go zones?|\d+(?:\.\d+)? ?m (?:from|away|clear))\b/i,
  atmosphere: /\b(ventilat\w*|gas (?:test\w*|detectors?|monitor\w*)|atmospher\w*|ignition|extraction|respirators?)\b/i,
  precast: /\b(erection (?:design|sequence|plan)|brac\w*|cranes?|riggers?|doggers?|exclusion|engineer\w*)\b/i,
  road: /\b(traffic (?:management|control|guidance)\w*|tgs|tmp|barriers?|traffic controllers?|cones|signs?|signage|exclusion|spotters?)\b/i,
  plant: /\b(exclusion|spotters?|traffic|separat\w*|pedestrians?|operators?|licen\w*|reversing|beacons?|plant)\b/i,
  temperature: /\b(heat|cold|hydrat\w*|rest breaks?|breaks?|temperatures?|ventilat\w*|cool\w*)\b/i,
  water: /\b(life ?(?:jackets?|rings?|buoys?)|rescue|drown\w*|barriers?|pfds?|buoyancy)\b/i,
  diving: /\bdiv\w*/i,
  silica: /\b(extraction|wet\w*|water suppression|on-tool|respirators?|vacuum\w*|silica)\b/i,
};

// Where a control sits in the hierarchy: the same ranking draft.js orders each step's controls by.
const { controlLevel, HIGHER } = require('./control-level');

// Wording that leaves the decision to the worker (H5).
const VAGUE = /\b(?:appropriate|suitable|adequate|relevant|proper|necessary|correct|required) (?:ppe|controls?|precautions?|equipment|measures|care|protection|safety (?:gear|equipment))\b|\btake (?:due |extra |all |reasonable )?care\b|\bas (?:required|needed|necessary|appropriate)\b|\b(?:where|when|if) (?:required|necessary|needed|possible|practical|appropriate)\b|\bbe (?:careful|aware|vigilant|mindful|alert)\b|\bcommon sense\b|\bwatch (?:out|your step)\b|\bremain (?:alert|vigilant)\b|\bwhere practicable\b|\b(?:workers?|operators?|crew|staff|everyone|all persons|persons|people) (?:to|should|must|will|are to) (?:be aware|take care|be careful|use caution|watch out|stay alert)\b|\b(?:supervisors?|leading hands?|foreman|foremen|site managers?) (?:to|will|should|must) ensure\b|\buse (?:caution|care)\b|\bbe aware of\b/i;

// Measurable or checkable detail: a distance or rating, a standard, an inspection, a permit or a licence.
const CHECKABLE = /\b\d+(?:\.\d+)?\s?(?:mm|m|metres?|kg|t|tonnes?|kv|v|volts?|kpa|%|°c?|degrees|minutes?|hours?|days?|months?|lux|db\(?a?\)?)\b|\bAS(?:\/NZS)?\s?\d{3,}|\b(inspect\w*|tested|tags?|tagged|permits?|licen[cs]\w*|certificates?|certified|engineer'?s? design|drawings?|pre-?start|log ?books?|checklists?|signed off|verified|rated)\b/i;
// Named equipment counts as checkable too: it is there on site or it is not.
const NAMED_EQUIPMENT = /\b(guard ?rails?|edge protection|scaffold\w*|ewps?|elevating work platforms?|scissor lifts?|boom lifts?|safety mesh|catch platforms?|trench (?:shields?|box\w*)|shoring|props?|hoardings?|para-?webbing|harness\w*|life ?jackets?|gas detectors?|(?:dust )?extraction|h-class vacuum\w*|rcds?|lock ?out|isolation locks?|spotters?|traffic controllers?|safety observers?|tag lines?)\b/i;
// "Where reasonably practicable" and "so far as is reasonably practicable" are the legal test in
// the WHS Act (s 17 and s 18), not vague wording. "As needed", "where necessary" and the like still are.
const REASONABLY_PRACTICABLE = /\b(?:so far as is |as far as is |where |when |if |unless |not )?reasonably practicable\b/gi;
const isVague = (line) => VAGUE.test(String(line).replace(REASONABLY_PRACTICABLE, ' '));

const checkable = (line) => CHECKABLE.test(line) || NAMED_EQUIPMENT.test(line);

// Plant that needs a licence, and the licence wording that answers it (W5).
const LICENSED_PLANT = [
  { plant: /\b(mobile |crawler |tower |franna |slewing )?cranes?\b/i, licence: /\b(c[0-9]|cn|cv|ct|c2|c6|c1|crane|dogg\w*|rigg\w*|d[gs]|r[bia]|hrw|high risk work)\b/i },
  { plant: /\bforklifts?\b/i, licence: /\b(lf|forklift|hrw|high risk work)\b/i },
  { plant: /\b(boom lifts?|boom-type)\b/i, licence: /\b(wp|boom|ewp|hrw|high risk work|yellow card)\b/i },
  { plant: /\bscaffold\w*\b/i, licence: /\b(s[bia]|scaffold\w*|hrw|high risk work)\b/i },
  { plant: /\basbestos\b/i, licence: /\b(asbestos|class [ab]|removalist)\b/i },
  { plant: /\b(electrical (?:work|installations?)|rewir\w*|wiring work|switchboards?)\b/i, licence: /\b(electrical (?:contractor|worker|licen\w*)|electrician|a[- ]grade|licensed electrical)\b/i },
  { plant: /\b(excavators?|skid ?steers?|bobcats?|loaders?|rollers?|dozers?|graders?|telehandlers?)\b/i, licence: /\b(voc|verification of competency|ticket|licen\w*|competen\w*|operator)\b/i },
];
// Work that needs a named permit (W12): what the work looks like, and the permit that answers it.
// Read from the task, the step names and the high risk work listed, not from the hazards, which
// often name what may be there. Isolation is read from the task and step names only: the high risk
// category "energised electrical installations or services" also covers work near lines. Roof
// access needs a permit only where the SWMS says the site runs a permit system.
const SITE_PERMITS = /\b(site permit (?:system|process)|permit (?:to work )?system|permits? (?:issued )?by the principal contractor|principal contractor'?s? permits?)\b/i;
const PERMITS = [
  { label: 'hot work', name: 'a hot work permit',
    work: /\b(hot works?|weld(?:ing|ed|s)?|braz\w*|solder\w*|oxy[- ]?(?:acetylene|propane|cutting)|gas (?:cutting|torch\w*)|thermal cutting|cutting torch\w*|torch[- ]on)\b/i,
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
    permit: /\b(permits? to work|(?:electrical|vicinity|access) permits?|access authori[sz]ations?|(?:network|electricity) (?:operator|entity|distributor)'?s? (?:written )?(?:approval|permission|consent))\b/i },
  { label: 'isolation or lock out of live plant or services', name: 'an isolation permit or permit to work', notFromCategory: true,
    work: /\b(isolat\w* (?:the |of )?(?:\w+ ){0,3}(?:plant|machinery|equipment|power|supply|services?|circuits?|switchboards?)|lock ?out|lockout|live (?:plant|equipment|machinery|electrical|switchboards?)|energi[sz]ed (?:plant|equipment|electrical))\b/i,
    permit: /\b(isolation (?:permits?|certificates?)|permits? to work)\b/i },
  { label: 'roof access', name: 'a roof access permit', onlyWithSitePermits: true,
    work: /\b(roofs?|roofing)\b/i,
    permit: /\broof (?:access )?permits?\b|\bpermits? (?:for|to) (?:access )?(?:the )?roof\b/i },
];

// A position named as responsible for a step's controls (W11). "Workers" alone is not a position.
const POSITION = /\b(supervisors?|leading hands?|foreman|foremen|site managers?|project managers?|works managers?|engineers?|operators?|scaffolders?|riggers?|doggers?|dogm[ae]n|electricians?|removalists?|asbestos assessors?|hygienists?|first aiders?|spotters?|safety observers?|traffic controllers?|competent persons?|stand-?by persons?|permit (?:issuers?|holders?)|gas fitters?|plumbers?|surveyors?|principal contractor|health and safety representatives?|hsrs?|safety (?:officers?|advisers?|managers?)|whs (?:officers?|advisers?|managers?))\b/i;

const PLANT_WORDS = /\b(cranes?|forklifts?|ewps?|elevating work platforms?|scissor lifts?|boom lifts?|excavators?|skid ?steers?|bobcats?|loaders?|rollers?|dozers?|graders?|telehandlers?|trucks?|concrete pumps?|scaffold\w*|power tools?|saws?|grinders?|generators?|compressors?)\b/i;

// ---- The check ----

function categoriesNamed(items, state) {
  return highRiskList(state).filter((item) => items.some((line) => (NAMED[item.id] || NAMED[item.check] || /^$/).test(line)));
}

function stepText(step) {
  return [step.step, ...step.hazards].join('. ');
}

function hardFails(swms, state) {
  const out = [];
  const allControls = swms.steps.flatMap((step) => step.controls);
  const named = categoriesNamed(swms.highRisk, state);
  const namedIds = new Set(named.map((item) => item.id));
  // What the task implies, read from the task and the step names. Hazards often name what
  // may be there ("contact with overhead power lines"), so a category only they imply is
  // named for the builder to check, and is not a hard fail.
  const implied = highRiskMatches([swms.task, ...swms.steps.map((step) => step.step)].join('\n'), swms.fallRisk, state);
  const missing = implied.filter((item) => !namedIds.has(item.id));
  const hazardOnly = highRiskMatches(swms.steps.flatMap((step) => step.hazards).join('\n'), swms.fallRisk, state)
    .filter((item) => !namedIds.has(item.id) && !missing.includes(item));
  const alsoCheck = hazardOnly.length ? ` Also check, as the hazards name it: ${hazardOnly.map((item) => item.label).join('; ')}.` : '';
  const add = (rule, title, pass, message) => out.push({ rule, title, hard: true, pass, points: 0, max: 0, message, source: SOURCES[rule] });

  // Nothing listed and nothing found in the task is not a fail: the work may not be high risk.
  add('H1', 'High risk construction work identified', (Boolean(swms.highRisk.length) || !implied.length) && !missing.length,
    !swms.highRisk.length && !implied.length ? `No high risk construction work is listed, and none was found in the task. Check whether the work needs a SWMS.${alsoCheck}`
      : !swms.highRisk.length
      ? `The SWMS does not say which high risk construction work it covers.${implied.length ? ` The work involves: ${implied.map((item) => item.label).join('; ')}.` : ''}`
      : missing.length ? `The work involves high risk construction work the SWMS does not list: ${missing.map((item) => item.label).join('; ')}.${alsoCheck}` : `The high risk construction work is identified.${alsoCheck}`);

  const uncontrolled = named.filter((item) => !allControls.some((line) => (ANSWERS[item.id] || ANSWERS[item.check]).test(line)));
  add('H2', 'Controls for each high risk category', Boolean(allControls.length) && !uncontrolled.length,
    !allControls.length ? 'The SWMS has no controls.'
      : uncontrolled.length ? `No controls for: ${uncontrolled.map((item) => item.label).join('; ')}.` : 'Each high risk category listed has controls.');

  // Falls: a higher order control (eliminate, edge protection, scaffold, EWP, mesh, covers) must be in place,
  // unless the SWMS says why those are not reasonably practicable.
  const falls = namedIds.has('fall') || implied.some((item) => item.id === 'fall');
  if (falls) {
    const fallSteps = swms.steps.filter((step) => /\b(falls?|falling|height|roofs?|edges?|ladders?|scaffold\w*|voids?|openings?|ewps?|elevat\w*|platforms?|harness\w*)\b/i.test(stepText(step)));
    const fallLines = [...new Set([...fallSteps.flatMap((step) => step.controls), ...allControls.filter((line) => ANSWERS.fall.test(line))])];
    const higher = fallLines.some((line) => HIGHER.has(controlLevel(line)));
    const justified = allControls.some((line) => /\bnot (?:reasonably )?practicable\b/i.test(line) && /\b(edge protection|guard ?rails?|scaffold\w*|ewps?|elevating work platforms?)\b/i.test(line));
    const harness = fallLines.some((line) => /\b(harness|fall arrest|lanyard)\b/i.test(line));
    add('H3', 'Falls controlled by edge protection, scaffold or EWP, not harness alone', higher || justified,
      higher || justified ? 'Falls are controlled by edge protection, a scaffold, an EWP or another higher order control.'
        : harness ? 'Falls are controlled by a harness alone. Use edge protection, a scaffold or an EWP, or say why they are not reasonably practicable.'
          : 'Falls have no edge protection, scaffold, EWP or other physical control.');
  } else {
    add('H3', 'Falls controlled by edge protection, scaffold or EWP, not harness alone', true, 'No fall risk over the height is listed or implied.');
  }

  const noAddress = !filled(swms.site.address);
  const noConditions = !swms.site.conditions.length;
  add('H4', 'Site specific', !noAddress && !noConditions,
    noAddress && noConditions ? 'No site address and no site conditions. The SWMS reads as generic.'
      : noAddress ? 'No site address.' : noConditions ? 'No site conditions (access, services, other trades, the public, ground).' : 'The site address and site conditions are given.');

  // Vague wording in a step with a high risk hazard.
  const riskySteps = swms.steps.filter((step) => highRiskMatches(stepText(step), swms.fallRisk, state).length);
  const vague = riskySteps.flatMap((step) => step.controls.filter(isVague).map((line) => ({ step: step.step, line })));
  add('H5', 'Controls are definite, not left to the worker', !vague.length,
    vague.length ? `Controls for high risk hazards leave the decision to the worker: ${vague.slice(0, 5).map((item) => `"${item.line}" (${item.step || 'step'})`).join('; ')}. Say exactly what is done.` : 'No vague controls for high risk hazards.');

  add('H6', 'Person responsible for checking the controls', filled(swms.responsiblePerson),
    filled(swms.responsiblePerson) ? `${swms.responsiblePerson} checks the controls.` : 'No person is named as responsible for checking the controls.');

  add('H7', 'Workers consulted and signed on', swms.signatures.length > 0,
    swms.signatures.length ? `${swms.signatures.length} worker${swms.signatures.length === 1 ? ' has' : 's have'} signed.`
      : filled(swms.consultation) ? 'Consultation is recorded, but no worker has signed the SWMS.' : 'No record that the workers were consulted or briefed, and no worker signatures.');
  return { out, implied, named };
}

function weighted(swms, state, context) {
  const out = [];
  const add = (rule, title, max, points, fixes, good) => out.push({ rule, title, hard: false, pass: points >= max, points: Math.max(0, Math.min(max, Math.round(points))), max, message: fixes.length ? fixes.join(' ') : good, fixes, source: SOURCES[rule] });
  const steps = swms.steps;
  const allControls = steps.flatMap((step) => step.controls);
  const allText = [swms.task, ...steps.map((step) => [step.step, ...step.hazards, ...step.controls].join('. ')), ...swms.site.conditions, ...swms.plant, ...swms.licences, swms.review].join('\n');

  // W1 Hazards match the job steps (15).
  {
    const fixes = [];
    let points = 0;
    if (!steps.length) fixes.push('Break the work into job steps, each with its own hazards.');
    else {
      const withHazards = steps.filter((step) => step.hazards.length);
      points += 10 * (withHazards.length / steps.length);
      if (withHazards.length < steps.length) fixes.push(`Give every job step its own hazards (${steps.length - withHazards.length} of ${steps.length} have none).`);
      const keys = withHazards.map((step) => step.hazards.map((line) => line.toLowerCase()).sort().join('|'));
      const repeated = keys.length > 1 ? Math.max(...keys.map((key) => keys.filter((other) => other === key).length)) : 1;
      if (keys.length > 1 && repeated / keys.length > 0.5) fixes.push('The same hazards are copied into most steps. List the hazards each step really has.');
      else points += 5;
    }
    add('W1', 'Hazards match the job steps', 15, points, fixes, 'Each step has its own hazards.');
  }

  // W2 Controls follow the hierarchy (15; was 20, 5 went to W10).
  {
    const fixes = [];
    let points = 0;
    const levels = allControls.map(controlLevel);
    const hazardSteps = steps.filter((step) => step.hazards.length && step.controls.length);
    const risky = hazardSteps.filter((step) => highRiskMatches(stepText(step), swms.fallRisk, state).length);
    const judged = risky.length ? risky : hazardSteps;
    const strong = judged.filter((step) => step.controls.some((line) => HIGHER.has(controlLevel(line))));
    if (judged.length) points += 10 * (strong.length / judged.length);
    if (judged.length && strong.length < judged.length) fixes.push(`Add an elimination, substitution, isolation or engineering control to: ${judged.filter((step) => !strong.includes(step)).slice(0, 4).map((step) => step.step).join('; ')}.`);
    const ppeShare = levels.length ? levels.filter((level) => level === 'PPE').length / levels.length : 1;
    if (ppeShare <= 0.2) points += 5;
    else if (ppeShare <= 0.35) { points += 3; fixes.push('Too many controls are PPE. Put higher order controls first.'); } else fixes.push('Most controls are PPE. Put elimination, isolation and engineering controls before PPE.');
    add('W2', 'Controls follow the hierarchy', 15, points, fixes, 'Each high risk step has a higher order control, and few controls are PPE.');
  }

  // W3 Controls are specific and checkable (10; was 15, 2 went to W11 and 3 to W12).
  {
    const fixes = [];
    const share = allControls.length ? allControls.filter(checkable).length / allControls.length : 0;
    let points = 10 * Math.min(1, share / 0.4);
    const vague = allControls.filter(isVague);
    points -= Math.min(4, vague.length * 2);
    if (share < 0.4) fixes.push('Make controls measurable: distances, ratings, standards, inspections, permits and named equipment.');
    if (vague.length) fixes.push(`Replace vague wording such as "${vague[0]}".`);
    add('W3', 'Controls are specific and checkable', 10, points, fixes, 'Controls are measurable and can be checked on site.');
  }

  // W4 Implementation, monitoring and review (7; was 10). The 3 points for one person responsible
  // for the whole SWMS went to W11; H6 still fails a SWMS that names no one.
  {
    const fixes = [];
    let points = 0;
    const review = [swms.review, ...allControls].join(' ');
    if (/\b(before (?:the task|work|each|starting)|each (?:shift|day|morning)|daily|weekly|pre-?start|while (?:the task|work)|during|toolbox)\b/i.test(review)) points += 4; else fixes.push('Say when the controls are checked (for example, before each shift).');
    // Revised when the work changes: a new stage, method or site condition (2 points); and after
    // an incident or a control that is not working (1 point).
    if (/\b(review\w*|revis\w*|updat\w*)\b[^.]{0,100}\b(?:task|work|stage|method|site|conditions?|scope|sequence)\b[^.]{0,30}\bchang\w*|\b(?:task|work|stage|method|site|conditions?|scope|sequence)\b[^.]{0,30}\bchang\w*[^.]{0,100}\b(review\w*|revis\w*|updat\w*)\b|\bnew (?:work )?stages?\b/i.test(review)) points += 2; else fixes.push('Say the SWMS is revised when the work stage, method or site changes.');
    if (/\b(incidents?|near miss\w*|not working|(?:controls?|it) (?:fails?|is not effective)|ineffective)\b/i.test(review)) points += 1; else fixes.push('Say the SWMS is reviewed after an incident or when a control is not working.');
    add('W4', 'Implementation, monitoring and review', 7, points, fixes, 'When the controls are checked, and what triggers a review, are stated.');
  }

  // W5 Licences, competency and plant (8; was 10, 2 went to W12): crew credentials 3, licences
  // matched to the plant 3, plant inspected 2.
  {
    const fixes = [];
    let points = 0;
    const credentials = [...swms.licences, ...swms.plant, ...allControls].join(' ');
    if (swms.licences.length || /\b(white card|general construction induction|competen\w*|tickets?|licen[cs]\w*|trained|verification of competency|voc)\b/i.test(credentials)) points += 3; else fixes.push('List the licences, tickets and training the crew holds.');
    const needed = LICENSED_PLANT.filter((item) => item.plant.test(allText));
    const unmatched = needed.filter((item) => !item.licence.test(credentials));
    points += needed.length ? 3 * ((needed.length - unmatched.length) / needed.length) : 3;
    if (unmatched.length) fixes.push(`Match a licence or ticket to the plant and work: ${unmatched.map((item) => item.plant.exec(allText)[0]).join(', ')}.`);
    if (!PLANT_WORDS.test(allText) || /\b(inspect\w*|pre-?start|log ?books?|serviced|tested and tagged|test and tag|handover certificate)\b/i.test([...swms.plant, ...allControls].join(' '))) points += 2; else fixes.push('Say how plant and equipment are inspected before use.');
    add('W5', 'Licences, competency and plant', 8, points, fixes, 'Licences, tickets and plant inspections are matched to the task.');
  }

  // W6 Emergency and rescue (10).
  {
    const fixes = [];
    let points = 0;
    const emergency = [...swms.emergency, ...allControls].join(' ');
    if (/\bfirst aid\w*\b/i.test(emergency)) points += 3; else fixes.push('Say where first aid is and who the first aider is.');
    if (/\b(000|emergency (?:contacts?|numbers?|services|procedures?|plan)|muster|hospital|evacuat\w*|raise the alarm)\b/i.test(emergency)) points += 3; else fixes.push('Give the emergency contacts and procedure.');
    const ids = new Set([...context.implied, ...context.named].map((item) => item.id));
    const rescueNeeded = ['fall', 'confined', 'trench', 'water', 'tower'].filter((id) => ids.has(id));
    if (!rescueNeeded.length || /\brescue\b/i.test(emergency)) points += 4; else fixes.push(`Add a rescue plan for ${rescueNeeded.map((id) => ({ fall: 'a fall or a person suspended in a harness', confined: 'the confined space', trench: 'the trench', water: 'a person in the water', tower: 'the tower' })[id]).join(', ')}.`);
    add('W6', 'Emergency and rescue', 10, points, fixes, 'First aid, emergency contacts and rescue are covered.');
  }

  // W7 Site specific details (10): 2 points each.
  {
    const fixes = [];
    let points = 0;
    const site = [...swms.site.conditions, ...allControls].join(' ');
    const checks = [
      ['access', /\b(access\w*|egress|entry|stairs?|ladders?|routes?|deliver\w*)\b/i, 'how people, plant and materials get to the work'],
      ['exclusion', /\b(exclusion zones?|barricad\w*|barriers?|no go zones?|drop zones?|fenc\w*)\b/i, 'exclusion zones'],
      ['trades', /\b(other trades|trades?|subcontractors?|working (?:above|below)|work fronts?)\b/i, 'other trades nearby'],
      ['public', /\b(public|pedestrians?|neighbou?rs?|footpaths?|occupants?|residents?|traffic|visitors?)\b/i, 'the public'],
      ['services', /\b(services?|power ?lines?|overhead|underground|gas|water mains?|before you dig|dbyd|cables?)\b/i, 'live services'],
    ];
    for (const [, pattern, label] of checks) if (pattern.test(site)) points += 2; else fixes.push(`Say how the site handles ${label}.`);
    add('W7', 'Site specific details', 10, points, fixes, 'Access, exclusion zones, other trades, the public and services are covered.');
  }

  // W8 Readable and short (5). A printed risk matrix is not marked down (owner decision, 5 October 2026).
  {
    const fixes = [];
    let points = 5;
    if (swms.legislation.length > 5) { points -= 3; fixes.push(`Drop the list of ${swms.legislation.length} pieces of legislation; it is not needed.`); }
    if (allControls.length > 120 || steps.length > 25) { points -= 2; fixes.push('Shorten the SWMS to the high risk hazards and their controls.'); }
    add('W8', 'Readable and short', 5, points, fixes, 'Short and to the point.');
  }

  // W9 Document control (5).
  {
    const fixes = [];
    let points = 0;
    if (filled(swms.revision)) points += 1; else fixes.push('Add a revision number.');
    if (filled(swms.date)) points += 1; else fixes.push('Add the date.');
    if (filled(swms.reviewDate)) points += 1; else fixes.push('Add a review date.');
    if (filled(swms.principalContractor)) points += 2; else fixes.push('Name the principal contractor.');
    add('W9', 'Document control', 5, points, fixes, 'Revision, dates and principal contractor are given.');
  }

  // W10 Controls in hierarchy order within each step (5): elimination, substitution, isolation and
  // engineering controls come before administrative controls and PPE. Judged on steps that have both.
  {
    const fixes = [];
    const judged = steps.filter((step) => step.controls.some((line) => HIGHER.has(controlLevel(line))) && step.controls.some((line) => !HIGHER.has(controlLevel(line))));
    const outOfOrder = judged.filter((step) => {
      const higher = step.controls.map((line) => HIGHER.has(controlLevel(line)));
      return higher.lastIndexOf(true) > higher.indexOf(false);
    });
    const points = judged.length ? 5 * ((judged.length - outOfOrder.length) / judged.length) : 5;
    if (outOfOrder.length) fixes.push(`List the controls in hierarchy order, with elimination, isolation and engineering controls before administrative controls and PPE, in: ${outOfOrder.slice(0, 4).map((step) => step.step || 'step').join('; ')}.`);
    add('W10', 'Controls in hierarchy order within each step', 5, points, fixes, 'Within each step, higher order controls come before administrative controls and PPE.');
  }

  // W11 A responsible position per step (5): named against the step, or in its controls
  // ("the supervisor checks ..."). One person for the whole SWMS is H6, and is not enough here.
  {
    const fixes = [];
    const withControls = steps.filter((step) => step.controls.length);
    const missing = withControls.filter((step) => !filled(step.responsible) && !step.controls.some((line) => POSITION.test(line)));
    const points = withControls.length ? 5 * ((withControls.length - missing.length) / withControls.length) : 0;
    if (!withControls.length) fixes.push('Name the position responsible for the controls in each step.');
    else if (missing.length) fixes.push(`Name the position responsible for the controls in each step (for example, supervisor or leading hand), not only one person for the SWMS. ${missing.length} of ${withControls.length} steps name none: ${missing.slice(0, 4).map((step) => step.step || 'step').join('; ')}.`);
    add('W11', 'A responsible position for each step', 5, points, fixes, 'Each step names the position responsible for its controls.');
  }

  // W12 Named permits where the work needs one (5).
  {
    const fixes = [];
    const ownWork = [swms.task, ...steps.map((step) => step.step)].join('\n');
    const work = [ownWork, ...swms.highRisk].join('\n');
    const permitText = [...allControls, ...swms.site.conditions, ...swms.licences, ...swms.plant, ...swms.emergency, swms.review].join('\n');
    const sitePermits = SITE_PERMITS.test([allText, ...swms.emergency].join('\n'));
    const hazards = steps.flatMap((step) => step.hazards).join('\n');
    const needed = PERMITS.filter((item) => item.work.test((item.notFromCategory ? ownWork : work).replace(item.ignore || /$^/g, ' ')) && (!item.near || item.near.test(`${allText}\n${hazards}`)) && (!item.onlyWithSitePermits || sitePermits));
    const unnamed = needed.filter((item) => !item.permit.test(permitText));
    const points = needed.length ? 5 * ((needed.length - unnamed.length) / needed.length) : 5;
    if (unnamed.length) fixes.push(`Name the permit the work needs: ${unnamed.map((item) => `${item.name} (${item.label})`).join('; ')}.`);
    add('W12', 'Named permits where the work needs one', 5, points, fixes, needed.length ? `The permits are named: ${needed.map((item) => item.label).join('; ')}.` : 'No work needing a permit was found.');
  }
  return out;
}

function bandFor(score, failed) {
  if (failed || score < 60) return BANDS.rejected;
  return score >= 90 ? BANDS.accepted : BANDS.changes;
}

// Checks a SWMS given in the structured form. The state sets the high risk categories.
function checkSwms(input, options = {}) {
  const swms = normaliseSwms(input);
  const state = findState(options.state || swms.state) || findState('qld');
  const { out: hard, implied, named } = hardFails(swms, state);
  const items = weighted(swms, state, { implied, named });
  const score = items.reduce((sum, item) => sum + item.points, 0);
  const failed = hard.filter((item) => !item.pass);
  return {
    kind: 'check',
    state: state.id,
    task: swms.task,
    score,
    band: bandFor(score, failed.length > 0),
    hardFails: failed.map((item) => item.rule),
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
  if (filled(draft.hospital)) emergency.push(`Hospital: ${draft.hospital}`);
  if (filled(draft.firstAider)) emergency.push(`First aider: ${draft.firstAider}`);
  if (filled(draft.musterPoint)) emergency.push(`Muster point: ${draft.musterPoint}`);
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
    principalContractor: draft.principalContractor,
    licences: draft.qualifications || [],
    plant: (draft.plant || []).map((row) => [row.item, row.inspection, row.licence].filter(Boolean).join(': ')),
    emergency,
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
    return { subject: `SWMS approved${title}`, body: `${hello}\n\nGreat SWMS, approved, see attached my approved and signed copy.${sign}` };
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
  const opening = result.band === BANDS.changes
    ? `Thanks for the SWMS${about}. It is accepted with changes (score ${result.score} out of 100). Please make these changes and send me the updated copy.`
    : `Thanks for the SWMS${about}. It is not accepted yet (score ${result.score} out of 100${hard.length ? `, ${hard.length} must-fix item${hard.length === 1 ? '' : 's'}` : ''}). Work under it cannot start until these are fixed. Please send me the updated copy.`;
  return {
    subject: `SWMS ${result.band === BANDS.changes ? 'accepted with changes' : 'not accepted'}${title}`,
    body: `${hello}\n\n${opening}\n\n${lines.join('\n')}${sign}`,
  };
}

module.exports = { checkSwms, bandFor, normaliseSwms, fromDraft, emailDraft, controlLevel, isVague, BANDS, SOURCES, VAGUE };
