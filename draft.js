const { HIERARCHY, SITE_FIELDS, findState, highRiskList } = require('./legislation');
const { jobStepsFor, ppeFor } = require('./activities');

const HIERARCHY_RANK = Object.fromEntries(HIERARCHY.map((level, index) => [level, index]));

const LIFT_BLEED = /\b(signallers?|slings?|exclusion zone|lift crew|under the panel|no free-fall|free-fall with a load|crane class, not the chart|dogm[ae]n|banksman|liebherr)\b/i;

function cleanLine(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function blankName(value) {
  const text = cleanLine(value);
  if (!text) return '';
  if (/^(not provided|n\/a|na|unknown|tbc|none)$/i.test(text)) return '';
  if (/\b(was not provided|not provided)\b/i.test(text)) return '';
  return text;
}

function supplied(value) {
  const text = cleanLine(value);
  if (!text) return '';
  if (/^(not provided|n\/a|na|unknown|tbc|none)$/i.test(text)) return '';
  return text;
}

function sentences(text) {
  return cleanLine(text)
    .split(/(?<=[.])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (/[.!?]$/.test(part) ? part : `${part}.`));
}

function dedupe(lines) {
  const seen = new Set();
  const kept = [];
  for (const line of lines) {
    const text = cleanLine(line).replace(/[.]+$/, '.');
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    kept.push(text);
  }
  return kept;
}

function isCraneOrLift(text) {
  const source = String(text || '');
  if (/\b(cranes?|liebherr)\b/i.test(source)) return true;
  if (/\b(panel|precast|tilt-?up)\b/i.test(source) && /\blift(?!ers?\b)/i.test(source)) return true;
  if (/\b(dogm[ae]n|dogger|banksman|signaller)\b/i.test(source) && /\b(crane|lift|load|panel)\b/i.test(source)) return true;
  if (/\b(crane lift|load lift)\b/i.test(source)) return true;
  if (/\blifting the (panel|load|beam|house|structure)\b/i.test(source)) return true;
  return false;
}

// Precast and tilt-up panels are lifted, erected, stood up or placed under any of these
// words. Other panels (solar, wall linings) count only when a crane or a lift is named.
function isPanelLift(text) {
  const source = String(text || '');
  const concrete = /\b(precast|tilt-?up|concrete (?:wall )?panels?)\b/i.test(source);
  // Precast seating tiers sit on rakers: they are not stood up and braced like wall panels.
  if (concrete && !PRECAST_TIER.test(source) && /\b(lift\w*|erect\w*|stand\w*|stood|install\w*|plac\w*|crane\w*)\b/i.test(source)) return true;
  return /\bpanels?\b/i.test(source) && /\b(lift\w*|crane\w*)\b/i.test(source) && !FACADE_WORK.test(source) && !/\b(glass balustrades?|balustrades?|shower screens?|glass panels?|membranes?|ptfe|etfe|roof\w*)\b/i.test(source);
}

// Bulk and detailed excavation of a basement, as opposed to service trenches.
const BULK_EXCAVATION = /\b(bulk excavat\w*|excavat\w* (?:the |out the )?basement|dig\w* (?:out )?(?:the )?basement|detailed excavat\w*|(?:excavat|dig)\w*[^.]{0,30}\b(?:pile caps?|lift pits?))\b/i;

const STEEL_WORK = /\b(structural steel\w*|steelwork|steel (?:erect\w*|frames?|stairs?|canop(?:y|ies)|awnings?|platforms?|roof))\b/i;
const MASONRY_WORK = /\b(blockwork|block walls?|blocklay\w*|bricklay\w*|brickwork|masonry|core[- ]fill\w*)\b/i;
const PLASTER_WORK = /\b(plasterboard|gyprock|drywall|set(?:ting)? compound\w*|cornices?|suspended ceilings?|ceiling (?:grids?|sheets?|linings?)|plasterers?|sand\w* (?:the )?joints?)\b/i;
const FLOOR_WORK = /\b(carpet\w*|vinyl|floor coverings?|timber floor\w*|engineered timber|floating floors?|levelling compound\w*)\b/i;

const GLAZING_WORK = /\b(glass balustrades?|balustrades?|shower screens?|internal glazing|glass partitions?|mirrors?)\b/i;
const STONE_WORK = /\b(benchtops?|stone (?:slabs?|vanit\w*)|splashbacks?)\b/i;

const FIRE_SERVICES = /\b(sprinklers?|hydrants?|fire services?|fire mains?|fire pumps?|fire pipework|fire hose reels?)\b/i;
const LIFT_WORK = /\b(install\w*[^.]{0,30}\blifts?\b(?!\s+pits?)|lift (?:shafts?|wells?|cars?|rails?|motor rooms?|machines?|landing doors?)|car tops?|landing doors?)\b/i;
const PASSIVE_FIRE = /\b(fire stopping|firestopping|fire[- ]stop\w*|passive fire|fire collars?|penetration seal\w*)\b/i;
const LANDSCAPE = /\b(landscap\w*|planters?|planting|mulch|turf|paving|pavers?|irrigation)\b/i;
// Stadium work.
const EARTHWORKS = /\b(cut and fill|bulk earthworks|earthworks|(?:bull)?dozers?|graders?|scrapers?)\b/i;
const SPORTS_LIGHTING = /\b(sports lighting|floodlights?|light towers?|lighting (?:towers?|frames?|rigs?)|big screens?|video screens?|led screens?|scoreboards?)\b/i;
const PRECAST_TIER = /\b(seating tiers?|tiers?|rakers?|seating units?|stadia units?|precast planks?|stair units?)\b/i;
// Hospital work.
const MEDICAL_GAS = /\b(medical gas\w*|medical air|oxygen (?:pipe\w*|lines?|outlets?|mains?)|nitrous oxide|medical suction|medical vacuum|gas manifolds?)\b/i;
const LEAD_SHIELDING = /\b(lead[- ]lined|lead sheet\w*|lead shielding|lead lining|radiation shielding)\b/i;
const LIVE_HOSPITAL = /\b((?:live|existing|occupied|operating) hospital\w*|(?:live|existing|occupied) (?:wards?|hospital buildings?)|next to the hospital)\b/i;
const HELIPAD = /\b(helipads?|helidecks?|heliports?|helicopter landing (?:sites?|pads?))\b/i;
const PNEUMATIC_TUBE = /\bpneumatic tubes?\b/i;
const BOILER = /\b(boilers?|steam (?:plant|pipe\w*|mains?)|pressure vessels?|calorifiers?)\b/i;
// Older buildings: materials that may contain asbestos (fibro, AC sheet and
// similar, common before 1990) and work that would disturb them.
const ASBESTOS_MATERIAL = /\b(fibro|fibre[- ]cement|ac sheets?|asbestos cement|super ?six|vinyl floor tiles|lino(?:leum)?|eaves linings?|zelemite)\b/i;
const OLDER_BUILDING = /\b(19[0-8]\d'?s|built in 19[0-8]\d|pre[- ]?19(?:8\d|90)|older (?:house|home|building|school)s?|old (?:house|home|building)s?|heritage)\b/i;
const DISTURB = /\b(strip\w*|remov\w*|demolish\w*|demolition|cut\w*|drill\w*|sand\w*|break\w*|renovat\w*|replac\w*|rip\w* out|knock\w*)\b/i;
const asbestosLikely = (text) => DISTURB.test(String(text || '')) && (ASBESTOS_MATERIAL.test(String(text || '')) || (OLDER_BUILDING.test(String(text || '')) && /\b(walls?|ceilings?|floors?|eaves|roofs?|bathroom|kitchen|laundry|sheets?|linings?)\b/i.test(String(text || ''))));
const CLEANING = /\b(builders'? clean|final clean|cleaning|cleaners?)\b/i;

// Waterproofing membranes.
const WATERPROOFING = /\b(waterproof\w*|(?<!(?:ptfe|etfe|fabric|tensile) )membranes?(?!\s+(?:panels?|roof\w*))|tanking|torch[- ]on)\b/i;

// Floor and wall tiling, not roof tiles.
const TILING_WORK = /\b(til(?:e|es|ing)|tilers?|grout\w*|screed\w*)\b/i;
// Structural grouting (post-tensioning ducts, precast bases, anchors) is not tiling.
const isTiling = (text) => TILING_WORK.test(String(text || '').replace(/\broof(?:ing)? tiles?\b/gi, '').replace(/\bgrout\w* (?:the )?(?:\w+ )?(?:ducts?|bases?|base ?plates?|anchors?|tendons?|cores?|bars?|piles?|sleeves?|connections?|dowels?|joints? between panels)\b|\b(?:duct|base|non-shrink|structural|anchor) grout\w*\b/gi, ''));

// Carpentry fit-out: internal framing, doors and joinery, not formwork.
const CARPENTRY_WORK = /\b(steel stud\w*|stud (?:walls?|framing)|wall framing|framing|bulkheads?|door frames?|(?<!landing\s)doors?|architraves?|skirtings?|joinery|(?<!(?:comms|communications|data|server|equipment|electrical|racks,?|racks and)\s)cabinets?|vanities|wardrobes?|timber (?:handrails?|screens?|balustrades?)|carpentry|carpenters?)\b/i;

// Piling and foundation work.
const PILING_WORK = /\b(piling|piles?(?!\s+caps?\b)|pile rigs?|piling rigs?|cfa|bored piles?|secant|contiguous pil\w*|pile heads?|pile cages?)\b/i;

// Facade work: unitised curtain wall, glazing and cladding panels, not precast concrete.
const FACADE_RAW = /\b(fa[cç]ades?|curtain wall\w*|unitised|cladding|glazing|glazed|glass panels?|spandrels?|sunshades?)\b/i;
const FACADE_WORK = { test: (text) => FACADE_RAW.test(String(text || '')) && !/\b(glass balustrades?|balustrades?|shower screens?|internal glazing|glass partitions?|mirrors?)\b/i.test(String(text || '')), source: FACADE_RAW.source };

const DEMOLITION = /\b(demolition|demolish\w*|knock(?:ing)? down|pull(?:ing)? down)\b/i;
const ROAD = /\b(road\s?works?|street loading zones?|(?:in|from|on) the street|kerbside|traffic control|traffic management|on the road|(?:adjacent to|next to|beside|alongside) (?:a |the )?(?:road|street|highway)|street frontage|open to traffic|live traffic|carriageway|railway|rail corridor|shipping lane)\b/i;
const WATER = /\b(drown(?:ing)?|in or near water|(?:over|into|beside|next to) (?:a |the )?(?:tidal )?(?:river|creek|lake|sea|harbour|dam|canal|water)|jetty|wharf|pontoon|boat ramp|sea ?wall)\b/i;

function isScaffoldErection(text) {
  return /\bscaffold\w*\b/i.test(String(text || '').replace(/\bmobile scaffold\w*/gi, '')) && /\berect\w*\b/i.test(text);
}

// A sentence that says an item is missing does not supply that item.
function isDenialLine(line) {
  return /\b(not supplied|not provided|is missing|are missing|was missing|were missing|not held|not marked|not given|do not have|don't have|none was|none were|was not stated|were not stated|not the chart)\b/i.test(line);
}

function acceptedText(text) {
  return sentences(text).filter((line) => !isDenialLine(line)).join(' ');
}

// The subcontractor's saved details, as one line for the page header.
function companyDetails(input) {
  return [
    input.companyAbn && `ABN ${blankName(input.companyAbn).replace(/^ABN\s*/i, '')}`,
    blankName(input.companyAddress),
    blankName(input.companyPhone),
    blankName(input.companyEmail),
  ].filter((item) => item && item !== 'ABN ').join(' · ');
}

function keptFact(value) {
  const text = blankName(value);
  if (!text) return '';
  if (sentences(text).every(isDenialLine)) return '';
  return text;
}

function packIsTest(input) {
  const blob = [
    input.principalContractor,
    input.company,
    input.subcontractor,
    input.scaffoldSupervisor,
    input.task,
    input.jobDescription,
  ].map(cleanLine).join('\n');
  return /\btest only\b/i.test(blob) || /\btest number\b/i.test(blob);
}

function scaffoldBrief(task, site, pack) {
  const text = acceptedText([
    task,
    site && site.publicInterface,
    site && site.otherTrades,
    site && site.ground,
    pack && pack.scaffoldSupervisor,
  ].filter(Boolean).join('\n'));
  const bays = text.match(/\b(\d+)\s*bays?\s*by\s*(\d+)\b/i);
  const height = text.match(/\btop working platform at\s*(\d+(?:\.\d+)?)\s*m(?:etre|eter)?s?\b/i);
  const supervisor = keptFact(pack && pack.scaffoldSupervisor);
  return {
    bays: bays ? [bays[1], bays[2]] : null,
    height: height ? height[1] : '',
    modular: /\bmodular scaffold\b/i.test(text),
    ties: /\bties to the slab edge at every lift\b/i.test(text),
    slab: /\bexisting concrete slab\b/i.test(text),
    hoarded: /\bpublic footpath below is hoarded\b/i.test(text),
    clearElevation: /\bno other trade on the elevation\b/i.test(text),
    supervisor,
  };
}

function scaffoldMethod(brief) {
  const steps = [];
  if (brief.supervisor) {
    steps.push(`The scaffold supervisor erects the scaffold: ${brief.supervisor.replace(/[.]+$/, '')}.`);
  }
  if (brief.bays) {
    const kind = brief.modular ? 'modular scaffold' : 'scaffold';
    const ground = brief.slab ? ' on the existing concrete slab' : '';
    steps.push(`Set out the ${kind}${ground}, ${brief.bays[0]} bays by ${brief.bays[1]}.`);
  }
  if (brief.height) {
    steps.push(`Erect the scaffold to the top working platform at ${brief.height} m.`);
  }
  if (brief.ties) {
    steps.push('Tie the scaffold to the slab edge at every lift.');
  }
  if (brief.hoarded) {
    steps.push('The public footpath below stays hoarded.');
  }
  if (brief.clearElevation) {
    steps.push('No other trade is on the elevation while the scaffold is going up.');
  }
  return steps;
}

function scaffoldControls(brief) {
  const items = [];
  if (brief.ties) items.push(control('Isolate or engineer', 'Ties to the slab edge at every lift.'));
  if (brief.hoarded) items.push(control('Isolate or engineer', 'Public footpath below is hoarded.'));
  if (brief.supervisor) {
    items.push(control('Administrative', `Scaffold supervisor: ${brief.supervisor.replace(/[.]+$/, '')}.`));
  }
  if (brief.clearElevation) {
    items.push(control('Administrative', 'No other trade is on the elevation.'));
  }
  return items;
}

function statedSite(task) {
  const text = acceptedText(task);
  const stated = {};
  if (/\bpublic footpath below is hoarded\b/i.test(text)) stated.publicInterface = 'Public footpath below is hoarded.';
  if (/\bno other trade on the elevation\b/i.test(text)) stated.otherTrades = 'No other trade on the elevation.';
  if (/\bground is the existing concrete slab\b/i.test(text) || /\bexisting concrete slab\b/i.test(text)) {
    stated.ground = 'Ground is the existing concrete slab.';
  }
  return stated;
}

function siteFromPack(task, site) {
  const stated = statedSite(task);
  const merged = { ...(site || {}) };
  for (const id of Object.keys(stated)) {
    if (!supplied(merged[id])) merged[id] = stated[id];
  }
  return merged;
}

function needsSafetyDataSheet(text) {
  return /\b(paints?|solvents?|adhesives?|resins?|acids?(?! sulfate)|thinners?|fuels?|petrol|diesel|chemicals?|sealants?|primers?|polyurethane|silicones?|epox(?:y|ies)|hazardous substances?)\b/i.test(text);
}

const HEIGHT_CONTEXT = /\b(height|high|fall|falls|falling|roof|roofs|roofing|above|up to|platform|scaffold\w*|storey|stories|storeys|level|deck|edge|ladder|mezzanine|ewp|elevat\w*|parapet|gutter|eaves)\b/i;

// A stated height only counts when the sentence is about working at that height.
function statedHeights(text) {
  const heights = [];
  for (const line of sentences(text)) {
    if (!HEIGHT_CONTEXT.test(line)) continue;
    const pattern = /\b(\d+(?:\.\d+)?)\s*m(?:etre|eter)?s?\b/gi;
    let match;
    while ((match = pattern.exec(line))) {
      const after = line.slice(match.index + match[0].length, match.index + match[0].length + 12);
      if (/^\s*(deep|long|wide|length|width|away|from|clear)\b/i.test(after)) continue;
      heights.push(Number(match[1]));
    }
  }
  return heights;
}

function fallRisk(text, metres = 2) {
  const source = String(text || '');
  if (/\bfall(?:ing)? (?:of )?(?:more than )?(?:2|two|3|three)\b/i.test(source)) return true;
  if (/\b(working at height|work at height)\b/i.test(source)) return true;
  const heights = statedHeights(source);
  if (heights.some((height) => height > metres)) return true;
  if (heights.length) return false;
  // No height was stated. Roof work, work above ground floor and scaffold
  // erection are treated as a fall of more than 2 metres until a height says otherwise.
  if (/\b(roofs?|roofing|rooftop)\b/i.test(source)) return true;
  if (/\b(two|three|four|five|2|3|4|5|multi)[- ]?(?:storey|story|level)\b/i.test(source)) return true;
  if (/\b(upper floor|upper level|second storey|second floor|first floor)\b/i.test(source)) return true;
  if (isScaffoldErection(source) || /\b(dismantl\w*|strik\w*)\b[^.]{0,40}\bscaffold/i.test(source)) return true;
  return false;
}

const FALL_ANSWERS = ['yes', 'no'];

function fallAnswer(value) {
  const text = cleanLine(value).toLowerCase();
  return FALL_ANSWERS.includes(text) ? text : '';
}

// The user's answer decides. A No is accepted even when the wording mentions height,
// because a scaffold, parapet or edge protection may already remove the risk.
// The wording is only used when there is no answer.
function fallRiskFor(text, answer) {
  if (answer === 'yes') return true;
  if (answer === 'no') return false;
  return fallRisk(text);
}

// The fall height that makes work high risk. The Northern Territory uses 3 metres for
// residential construction work and 2 metres otherwise; every other state uses 2 metres.
function fallMetres(state) {
  return (state && state.fallMetres) || 2;
}

function fallControlText(text) {
  const lines = sentences(text).filter((line) => {
    // The scaffold being put up is the work, not the control for a fall during that work.
    const scaffoldIsWork = /\bscaffold\w*\b/i.test(line) && /\b(erect\w*|dismantl\w*|strik\w*|alter\w*)\b/i.test(line);
    const pattern = scaffoldIsWork
      ? /\b(do not place a person|stay(?:s|ing)? on the ground|from the ground|edge protection|guard\s?rails?|harness|elevating work platform|\bewp\b|fall arrest|fall prevention|no one (?:goes|works) at|advance guard\s?rail|platform (?:is )?(?:fully )?decked)\b/i
      : /\b(do not place a person|stay(?:s|ing)? on the ground|from the ground|edge protection|guard\s?rails?|harness|scaffold|elevating work platform|\bewp\b|fall arrest|fall prevention|no one (?:goes|works) at)\b/i;
    return pattern.test(line);
  });
  return lines.join(' ');
}

function asbestosArrangement(text) {
  const lines = sentences(text).filter((line) => /\basbestos\b/i.test(line) && /\b(licen[cs]ed removal|removalist|left in place|exemption|removed before)\b/i.test(line));
  return lines.join(' ');
}

function trenchDepths(text) {
  const depths = [];
  const pattern = /\b(\d+(?:\.\d+)?)\s*m(?:etre|eter)?s?\s+deep\b|\bdepth of\s+(\d+(?:\.\d+)?)\s*m\b|\bdeep(?:er)? than\s+(\d+(?:\.\d+)?)\s*m\b/gi;
  let match;
  while ((match = pattern.exec(String(text || '')))) depths.push(Number(match[1] || match[2] || match[3]));
  return depths;
}

// A trench, shaft or tunnel counts unless every stated depth is 1.5 m or less.
function deepExcavation(text) {
  text = String(text || '').replace(/\b(?:lift|riser|service|ventilation|stair)\s+shafts?\b|\bin the shafts\b/gi, ' ');
  if (LIFT_WORK.test(text)) text = text.replace(/\bshafts?\b/gi, ' ');
  if (/\btunnel\w*\b/i.test(text)) return true;
  if (!/\b(trench\w*|shaft)\b/i.test(text)) return false;
  const depths = trenchDepths(text);
  return !depths.length || depths.some((depth) => depth > 1.5);
}

function trenchSupportText(text) {
  const lines = sentences(text).filter((line) => /\b(shor(?:e|ed|ing)|bench(?:ed|ing)|batter(?:ed|ing)?|trench (?:box|shield)|shields?|engineer\w*)\b/i.test(line));
  return lines.join(' ');
}

function mentioned(text, pattern) {
  return pattern.test(String(text || ''));
}

const SILICA_MATERIAL = /\b(engineered stone|natural stone|stone|concrete|cement|bricks?|pavers?|blocks?|blockwork|masonry|tiles?|tiling|grout|mortar|render|plasterboard|porcelain|sintered stone|silica)\b/i;
const SILICA_POWER = /\b(grind\w*|grinder|drill\w*|polish\w*|sand(?:s|ing|er)\b|saw\w*|chas(?:e|es|ing)|cor(?:e|ing)|core drill|scabbl\w*|jackhammer\w*|demolition hammer|router|power tool|angle grinder|crush\w*|tile cutter|wet saw)/i;

function silicaProcessing(text) {
  const source = String(text || '');
  return SILICA_MATERIAL.test(source) && SILICA_POWER.test(source);
}

function highRiskMatches(text, answer, state) {
  const checks = {
    fall: fallRiskFor(text, answer),
    tower: mentioned(text, /\btelecommunication tower\b/i),
    demolition: mentioned(text, DEMOLITION) && mentioned(text, /\b(load-bearing|load bearing|structur\w*)\b/i),
    asbestos: mentioned(text, /\basbestos\b/i),
    temporary: mentioned(text, /\b(temporary support|propping|propped|structural alteration)\b/i),
    confined: mentioned(text, /\bconfined space\b/i),
    trench: deepExcavation(text),
    explosives: mentioned(text, /\bexplosives?\b/i),
    gas: mentioned(text, /\b(gas main|pressuri[sz]ed gas)\b/i),
    chemicalLine: mentioned(text, /\b(fuel line|refrigerant line|chemical line)\b/i),
    electrical: mentioned(text, /\b(energised|energized|energis(?:e|ing|ation)|overhead (?:power |electric )?lines?|power lines?|live (?:electrical|parts?|switchboards?|circuits?)|(?:energised|energized|live) electrical (?:installations?|services?))\b/i),
    atmosphere: mentioned(text, /\b(flammable atmosphere|contaminated atmosphere)\b/i),
    // Drilling or fixing to precast units already in place is not precast work.
    precast: mentioned(String(text || '').replace(/\b(?:drill\w*|fix\w* (?:to|into)|bolt\w* (?:to|into))\s+(?:the\s+)?precast\b/gi, ''), /\b(tilt-?up|precast)\b/i),
    road: mentioned(text, ROAD) || /\blight rail\b/i.test(String(text || '')),
    plant: mentioned(text, /\b((?:piling|cfa|bored pil\w*) rigs?|(?:excavator[- ]mounted )?pile croppers?|elevating work platforms?|ewps?|scissor lifts?|boom lifts?|powered mobile plant|concrete pump(?: truck)?s?|pump trucks?|boom pumps?|telehandlers?|excavators?|forklifts?|trucks?|(?<!tower )cranes?(?!\s+(?:company|companies|crew|operators?)\b)|loaders?|liebherr)\b/i),
    temperature: mentioned(text, /\bartificial extremes of temperature\b/i),
    water: mentioned(text, WATER),
    diving: mentioned(text, /\bdiving\b/i),
    // Victoria, regulation 322: any demolition, trenches and shafts apart from tunnels,
    // and roads or railways without shipping lanes.
    demolitionAny: mentioned(text, DEMOLITION),
    trenchOrShaft: /\b(trench\w*|shaft)\b/i.test(text) && deepExcavation(text.replace(/\btunnel\w*\b/gi, '')),
    tunnel: mentioned(text, /\btunnel\w*\b/i),
    roadOrRail: mentioned(String(text || '').replace(/\bshipping lanes?\b/gi, ''), ROAD),
    // ACT, section 291(s): processing crystalline silica material with a power tool or
    // another mechanical method (section 418A). Hand tools alone do not count.
    silica: silicaProcessing(text),
  };
  return highRiskList(state).filter((item) => checks[item.check]);
}

function fallLineFor(source, facts) {
  return keptFact(facts.fallControl) || fallControlText(acceptedText(source));
}

// Where a fall control sits in the hierarchy.
function fallControlLevel(line) {
  if (/\b(do not place a person|from the ground|stay(?:s|ing)? on the ground)\b/i.test(line)) return 'Eliminate';
  if (/\b(edge protection|guard\s?rails?|handrails?|scaffold|elevating work platform|\bewp\b|safety mesh|catch platform|perimeter screens?|edge screens?|screens|full height gates?|landing gates?|fenc\w*|barriers?|barricad\w*|hoarding|covers?|covered)\b/i.test(line)) return 'Isolate or engineer';
  // A travel restraint system prevents a fall (s 306D(3)(a)), so it ranks above fall arrest.
  if (/\btravel restraint\b/i.test(line) && !/\bfall arrest\b/i.test(line)) return 'Isolate or engineer';
  if (/\b(harness|fall arrest|lanyard|restraint)\b/i.test(line)) return 'PPE';
  return 'Administrative';
}

const FORMWORK = /\b(formwork|falsework|formply|deck forms?|table forms?|backprop\w*)\b/i;
const JUMPFORM = /\b(jump ?forms?|self[- ]climbing (?:form\w*|system)|climbing form\w*)\b/i;
const PT = /\b(post[- ]?tension\w*|pt slabs?|pt tendons?|stressing)\b/i;
// Work that puts materials or plant on a formwork deck or a suspended slab.
function loadsOnDeckOrSlab(text) {
  const source = String(text || '').replace(new RegExp(JUMPFORM.source, 'gi'), '');
  return FORMWORK.test(source)
    || /\b(load(?:ing)?[- ]?out|loading platforms?|landing platforms?|forklifts?|telehandlers?)\b/i.test(source)
    || (/\b(reo|reinforc\w*|rebar)\b/i.test(source) && /\b(deck|slab)\b/i.test(source))
    || (FACADE_WORK.test(source) && /\b((?:floor|mini|spider|crawler) cranes?|monorails?|stillages?)\b/i.test(source))
    || (/\b(ahus?|air handling units?|chillers?|cooling towers?)\b/i.test(source) && /\b(lift\w*|cranes?|land\w*|deliver\w*)\b/i.test(source));
}

// Entering a pit, sump, tank, manhole or sewer.
const ENTERED_SPACE = /\b(?:enter\w*|entry|inside|work in|working in)\b[\w\s,-]{0,40}\b(pits?|sumps?|tanks?|manholes?|maintenance holes?|sewers?|wet wells?)\b/i;
const HOT_WORK = /\b(braz\w*|solder\w*|hot work|gas torch\w*|oxy[- ]?acetylene|welding)\b/i;
const PRESSURE_TEST = /\b(pressure test\w*|hydrostatic|pneumatic test\w*|air test\w*)\b/i;
const CORE_DRILL = /\b(core[- ]?drill\w*|coring|core holes?)\b/i;
const SILICA_WORK = /\b((?:concrete|saw)[- ]?cut\w*|wall saw\w*|floor saw\w*|wire saw\w*|cut\w* (?:the )?(?:\w+ )?(?:blocks?|bricks?|benchtops?)|(?:cut|polish)\w*[^.]{0,30}\bbenchtops?|benchtops?\b[^.]{0,60}\b(?:cut|polish|drill)\w*|grind\w* (?:the )?(?:\w+ )?(?:concrete|slabs?|surfaces?|floors?)|cut\w* (?:the )?(?:\w+ )?(?:tiles?|stone|pavers?)|core[- ]?drill\w*|coring|core holes?|chas(?:e|es|ing)|break\w* (?:down )?(?:the )?pile(?: heads?|s)|pile (?:trimming|cropping)|trim\w* (?:the )?piles?|crop\w* (?:the )?piles?|drill\w* (?:into )?(?:the )?(?:post-tensioned |pt |suspended )?(?:concrete|masonry|blockwork|block walls?|slabs?|tiled walls?|tiles?)|drill\w* (?:into )?(?:the )?(?:precast )?(?:concrete )?(?:seating )?(?:tiers?|treads?))\b/i;

const TEMP_POWER = /\b(construction (?:power|wiring|lighting)|temporary (?:power|lighting|supply)|site (?:switchboards?|power|lighting)|builders'? (?:power|supply))\b/i;

// Answers for a choice fact, read from the stored value.
function choiceAnswer(id, value) {
  if (id === 'deckMethod') return deckMethodAnswer(value);
  const text = String(value || '').toLowerCase();
  if (id === 'spaceAssessment') {
    if (/\bnot ?confined|not a confined\b/.test(text)) return 'notConfined';
    if (/\bconfined\b/.test(text)) return 'confined';
  }
  if (id === 'refrigerantClass') {
    if (/\b(a3|highly flammable|r290|r600a|propane|isobutane)\b/.test(text)) return 'a3';
    if (/\b(a2l?|mildly flammable|r32|r454b|r1234\w*)\b/.test(text)) return 'a2l';
    if (/\b(a1|non-?flammable|r410a|r134a|r407c|co2|r744)\b/.test(text)) return 'a1';
  }
  if (id === 'energisedWork') {
    if (/\b(testing|commissioning|energised parts|within 3 ?m)\b/.test(text)) return 'testing';
    if (/\b(none|no|de-energised)\b/.test(text)) return 'none';
  }
  return '';
}

function deckLaying(text) {
  const source = String(text || '').replace(new RegExp(JUMPFORM.source, 'gi'), '');
  return FORMWORK.test(source) && /\b(deck\w*|ply|plywood|formply|soffit)\b/i.test(source);
}

// A deck method answer, read from the choice or from words like "from below".
function deckMethodAnswer(value) {
  const text = String(value || '').toLowerCase();
  if (/\b(below|underneath|through the joists)\b/.test(text)) return 'below';
  if (/\b(top|on top|away from the edge)\b/.test(text)) return 'top';
  return '';
}

// Overhead and other power lines near the work, as opposed to electrical work itself.
const ENERGISED = /\b(overhead (?:power |electric )?lines?|power lines?)\b/i;
// An electrician's work on an installation.
// Words that only an electrician's work uses. General words such as commissioning,
// testing or rough-in count as electrical only alongside one of these.
const ELECTRICAL_RAW = /\b(electrician|electrical|wiring|rewir\w*|switchboards?|distribution boards?|consumer mains|cabl\w*|circuits?|conduits?|light fittings?|power points?|busduct|construction (?:power|wiring)|temporary (?:power|lighting))\b/i;
// Communications and security cabling is extra low voltage work by registered cablers
// and security installers, so it is electrical work only when power words are used too.
const ICT_WORK = /\b(data cabl\w*|data points?|comms|communications|telecommunications|ict|structured cabling|optical fibre|fibre optic\w*|fibre|cat ?6a?|cctv|access control|intercoms?|security (?:systems?|cameras?|equipment)|card readers?|nbn|wireless access points?|matv|antennas?|nurse call)\b/i;
const SECURITY_WORK = /\b(cctv|access control|intercoms?|security (?:systems?|cameras?|equipment)|card readers?|alarms?|intrusion detect\w*)\b/i;
const POWER_WORDS = /\b(electrician|electrical|switchboards?|distribution boards?|consumer mains|light fittings?|power points?|busduct|construction (?:power|wiring)|temporary (?:power|lighting)|mains power)\b/i;
const ELECTRICAL_CORE = { test: (text) => ELECTRICAL_RAW.test(String(text || '')) && (!ICT_WORK.test(String(text || '')) || POWER_WORDS.test(String(text || ''))) };
const ELECTRICAL_WORK = ELECTRICAL_CORE;
const SWITCHBOARD_WORDS = /\b(main switchboards?|consumer mains|energis\w*|commission\w*|terminat\w*|distribution boards?|(?:replac\w*|upgrad\w*|chang\w*|install\w*) (?:the |a |new )?(?:main )?switchboards?)\b/i;
const SWITCHBOARD_WORK = { test: (text) => SWITCHBOARD_WORDS.test(String(text || '')) && ELECTRICAL_CORE.test(String(text || '')) };
// A plumber's work.
// A mechanical (HVAC) contractor's work. Its pipework is not plumbing unless plumbing words are used too.
const MECHANICAL_WORK = /\b(mechanical services|hvac|air[- ]?condition\w*|ductwork|duct(?:ing| runs?| sections?)|refrigerant|refrigeration|split systems?|fan coil units?|fcus?|ahus?|air handling units?|chillers?|cooling towers?|condensers?|condensing units?|jet fans?|exhaust fans?|chilled water|vrf|vrv)\b/i;
const REFRIGERANT = /\b(refrigerant|refrigeration|split systems?|condensing units?|vrf|vrv)\b/i;
const PLUMBING_ONLY_WORDS = /\b(plumb\w*|sanitary|sewer\w*|drain\w*|hot water|cold water|tapware|toilets?|basins?)\b/i;
function isPlumbing(text) {
  // Subsoil drains on a sports field carry groundwater, not sewage, so they are not drainage under the plumbing law.
  let sub = false;
  const source = String(text || '').replace(/\b(?:subsoil|agricultural|ag) drain\w*\b/gi, (m) => { sub = true; return ''; }).replace(/\bdrainage pipes?\b/gi, (m) => (sub ? '' : m));
  return PLUMBING_WORK.test(source) && (!(MECHANICAL_WORK.test(source) || WATERPROOFING.test(source) || FIRE_SERVICES.test(source) || MEDICAL_GAS.test(source) || PNEUMATIC_TUBE.test(source)) || PLUMBING_ONLY_WORDS.test(source));
}
const PLUMBING_WORK = /\b(plumb\w*|hydraulic (?:services|risers?|pipework|pipes?|stacks?)|drain\w*|sewer\w*|sanitary|pipes?|pipework|sleeves?|puddle flanges?|hot water|cold water|tapware|toilets?|basins?|pump rooms?|sumps?|ejection pits?|water tanks?)\b/i;

const CATEGORY_FACTS = [
  {
    // Pits, sumps, tanks and manholes are confined spaces only if they meet the
    // definition in the WHS Regulation, schedule 19, so a competent person decides.
    id: 'spaceAssessment',
    label: 'Pits, tanks, sumps or manholes entered',
    prompt: 'Has a competent person assessed the space against the confined space definition?',
    choices: [
      { value: 'confined', label: 'Yes: it is a confined space' },
      { value: 'notConfined', label: 'Yes: it is not a confined space' },
    ],
    level: 'Administrative',
    applies: (text) => ENTERED_SPACE.test(String(text || '')) && !/\bconfined space\b/i.test(String(text || '')),
  },
  {
    id: 'confinedSpace',
    label: 'Confined space entry',
    prompt: 'The entry permit, atmosphere testing, the standby person outside, and how a person is rescued.',
    level: 'Administrative',
    applies: (text) => mentioned(text, /\bconfined space\b/i) || ENTERED_SPACE.test(String(text || '')),
  },
  {
    id: 'temporarySupport',
    label: 'Temporary support design',
    prompt: 'The engineer\'s design for the propping or temporary support, and who checks it is in place before any load-bearing part is removed.',
    level: 'Isolate or engineer',
    applies: (text) => mentioned(text, /\b(temporary support|propping|propped|structural alteration)\b/i)
      || (mentioned(text, DEMOLITION) && mentioned(text, /\b(load-bearing|load bearing)\b/i)),
  },
  {
    id: 'electricalSafety',
    label: 'Electrical safety arrangement',
    prompt: 'How far the work and plant stay from the lines, the network operator\'s requirements or permit, and the safety observer.',
    level: 'Isolate or engineer',
    applies: (text) => mentioned(text, ENERGISED),
  },
  {
    id: 'formworkDesign',
    label: 'Formwork design',
    prompt: 'The formwork, falsework and backpropping design, who designed it, and who inspects the formwork before the pour.',
    level: 'Isolate or engineer',
    // A jumpform is not slab formwork: it has its own climbing procedure.
    applies: (text) => FORMWORK.test(String(text || '').replace(new RegExp(JUMPFORM.source, 'gi'), '')),
  },
  {
    id: 'isolationProcedure',
    label: 'Isolation and testing procedure',
    prompt: 'How circuits are isolated, locked and tagged, and tested de-energised by a competent person before work, and who holds the locks.',
    level: 'Administrative',
    applies: (text) => SWITCHBOARD_WORK.test(text) || TEMP_POWER.test(String(text || '')) || (/\b(rough[- ]in|fit[- ]off|rewir\w*)\b/i.test(String(text || '')) && ELECTRICAL_CORE.test(String(text || ''))),
  },
  {
    // Electrical work on or near energised parts is prohibited except as the
    // Electrical Safety Regulation 2026 (Qld) s 195 allows, so the user says which.
    id: 'energisedWork',
    label: 'Work on or near energised parts',
    prompt: 'Choose one.',
    choices: [
      { value: 'none', label: 'None: everything is isolated and proved de-energised first' },
      { value: 'testing', label: 'Testing or commissioning on or near energised parts (within 3 m)' },
    ],
    level: 'Administrative',
    applies: (text) => ELECTRICAL_CORE.test(String(text || '')) && (mentioned(text, /\b(energis\w*|commission\w*|testing|test the|test,)\b/i) || TEMP_POWER.test(String(text || '')) || /\b(rough[- ]in|fit[- ]off|rewir\w*)\b/i.test(String(text || '')) || SWITCHBOARD_WORK.test(String(text || ''))),
  },
  {
    id: 'constructionTesting',
    label: 'Inspection and testing of construction wiring',
    prompt: 'Who inspects and tests the construction wiring, switchboards, RCDs and leads, and how often, as AS/NZS 3012 requires.',
    level: 'Administrative',
    applies: (text) => TEMP_POWER.test(String(text || '')),
  },
  {
    // Stacked materials, reo bundles and plant on a deck or a green slab are a known
    // cause of collapse, so the allowable loads are stated before work starts.
    id: 'loadLimits',
    label: 'Load limits',
    prompt: 'The allowable loads on the formwork deck and on each slab (for example in kPa, or the size and weight of packs and plant allowed in each area), where they are shown on site, and who checks them.',
    level: 'Administrative',
    applies: (text) => loadsOnDeckOrSlab(text),
  },
  {
    // Both ways of laying a deck are used. The user says which, and the controls follow it.
    id: 'deckMethod',
    label: 'How the deck is laid',
    prompt: 'Choose how the ply is laid.',
    choices: [
      { value: 'below', label: 'From below, through the joists, from a working platform' },
      { value: 'top', label: 'On top, working away from the edge on laid sheets' },
    ],
    level: 'Isolate or engineer',
    applies: (text) => deckLaying(text),
  },
  {
    id: 'silicaControls',
    label: 'Silica dust controls',
    prompt: 'How silica dust is controlled (wet cutting, on-tool extraction or local exhaust), the respirator and its fit testing, and the written assessment of whether the work is high risk.',
    level: 'Isolate or engineer',
    applies: (text) => SILICA_WORK.test(String(text || '')),
  },
  {
    id: 'hotWorkPermit',
    label: 'Hot work permit and fire watch',
    prompt: 'Who issues the hot work permit, the fire watch during and after the work, and the extinguishers at the work area.',
    level: 'Administrative',
    applies: (text) => HOT_WORK.test(String(text || '')),
  },
  {
    // Flammable refrigerants (A2L, A2 and A3) need a flammable zone and rated tools.
    id: 'refrigerantClass',
    label: 'Refrigerant safety class',
    prompt: 'Choose the refrigerant\'s safety class, from the compliance plate or the safety data sheet.',
    choices: [
      { value: 'a1', label: 'Non-flammable (A1), such as R410A or R134a' },
      { value: 'a2l', label: 'Mildly flammable or flammable (A2L or A2), such as R32 or R454B' },
      { value: 'a3', label: 'Highly flammable (A3), such as R290' },
    ],
    level: 'Administrative',
    applies: (text) => REFRIGERANT.test(String(text || '')) && /\b(charg\w*|evacuat\w*|recover\w*|decant\w*)\b/i.test(String(text || '')),
  },
  {
    id: 'plantIsolation',
    label: 'Plant isolation procedure',
    prompt: 'How plant is isolated and locked out (each energy source, personal locks), how it is tested before work, and how plant on automatic or building management control is stopped from starting.',
    level: 'Isolate or engineer',
    applies: (text) => MECHANICAL_WORK.test(String(text || '')) && /\b(commission\w*|start[- ]?up|balanc\w*)\b/i.test(String(text || '')),
  },
  {
    id: 'rigExclusionZone',
    label: 'Rig exclusion zone',
    prompt: 'The exclusion zone around each rig (radius or area), how it is marked, and who controls entry.',
    level: 'Isolate or engineer',
    applies: (text) => PILING_WORK.test(String(text || '')) && /\b(drill\w*|auger\w*|install\w*)\b/i.test(String(text || '')),
  },
  {
    id: 'erectionSequence',
    label: 'Erection sequence and temporary bracing',
    prompt: 'The designer\'s erection sequence and temporary bracing for the steel (drawing and revision), and who checks the structure is stable before connections are released.',
    level: 'Isolate or engineer',
    applies: (text) => STEEL_WORK.test(String(text || '')) && /\b(erect\w*|install\w*|connect\w*)\b/i.test(String(text || '')),
  },
  {
    id: 'serviceShutdown',
    label: 'Live service shutdown',
    prompt: 'How each live service (medical gases, power, water or fire systems) is shut down or isolated for the connection: who approves it for the hospital, the permit, the time window, and how patients are kept supplied.',
    level: 'Administrative',
    applies: (text) => (MEDICAL_GAS.test(String(text || '')) && /\b(connect\w*|tie[- ]?ins?|live)\b/i.test(String(text || ''))) || /\b(shut\s?downs?|tie[- ]?ins?|cut[- ]?ins?)\b/i.test(String(text || '')),
  },
  {
    id: 'tierErection',
    label: 'Precast erection design',
    prompt: 'The engineer\'s erection design for the precast units (drawing and revision): the bearing and fixing details, the placing sequence, and any temporary propping.',
    level: 'Isolate or engineer',
    applies: (text) => /\bprecast\b/i.test(String(text || '')) && PRECAST_TIER.test(String(text || '')) && /\b(install\w*|plac\w*|lift\w*|erect\w*|land\w*)\b/i.test(String(text || '')),
  },
  {
    id: 'excavationPlan',
    label: 'Excavation and traffic plan',
    prompt: 'The excavation sequence and stage levels, the geotechnical design it follows (document and revision), the batter angles, and the site traffic management plan for plant and trucks.',
    level: 'Administrative',
    applies: (text) => /\b(bulk excavat\w*|excavat\w* (?:the |out the )?basement|dig\w* (?:out )?(?:the )?basement)\b/i.test(String(text || '')) || EARTHWORKS.test(String(text || '')),
  },
  {
    // Piling rigs overturn on platforms that cannot carry them, so the platform design is stated.
    id: 'pilingPlatform',
    label: 'Working platform design and certificate',
    prompt: 'Who designed the piling working platform, the rig it is designed for, its maximum plant loading, and the certificate given to the rig operator before the rig goes on it.',
    level: 'Isolate or engineer',
    applies: (text) => PILING_WORK.test(String(text || '')) && /\b(rigs?|working platforms?|drill\w*|auger\w*|cfa|bor(?:e|ed|ing))\b/i.test(String(text || '')),
  },
  {
    id: 'pressureTesting',
    label: 'Pressure testing method',
    prompt: 'The test medium (water, air or oxygen-free nitrogen), the test pressure, how the area is kept clear during the test, and how pressure is released.',
    level: 'Administrative',
    applies: (text) => PRESSURE_TEST.test(String(text || '')),
  },
  {
    // Proprietary formwork, scaffold and platform systems are erected to their
    // supplier's instructions, which the SWMS names rather than rewrites.
    id: 'systemInstructions',
    label: 'System and supplier instructions',
    prompt: 'The formwork, scaffold or platform system used, its supplier, the supplier\'s instructions it is erected to (document and revision), and who trained the crew.',
    level: 'Administrative',
    applies: (text) => FORMWORK.test(String(text || '').replace(new RegExp(JUMPFORM.source, 'gi'), ''))
      || isScaffoldErection(text)
      || /\b(loading platforms?|landing platforms?)\b/i.test(String(text || '')),
  },
  {
    id: 'jumpformProcedure',
    label: 'Jumpform climbing procedure',
    prompt: 'The supplier\'s climbing procedure, its wind limits, and who is trained to climb the jumpform.',
    level: 'Administrative',
    applies: (text) => JUMPFORM.test(text),
  },
  {
    id: 'stressingProcedure',
    label: 'Stressing procedure',
    prompt: 'The engineer\'s stressing sequence and the concrete strength needed, who does the stressing, and the exclusion zone at the jacks.',
    level: 'Administrative',
    applies: (text) => /\b(stress(?:ing)? (?:the )?tendons?|stressing)\b/i.test(text) && !/\bground anchors?\b/i.test(String(text || '')),
  },
  {
    id: 'drowningControls',
    label: 'Drowning controls',
    prompt: 'How a person is kept from falling into the water, and the rescue plan: life jackets, rescue equipment and who does the rescue.',
    level: 'Administrative',
    applies: (text) => mentioned(text, WATER),
  },
];

// Other trades named only as company ("alongside the formwork and reo crews") are
// not this SWMS's work, so they do not choose its steps or required facts.
function ownWork(task) {
  return String(task || '').replace(/\b(?:alongside|beside|next to|near|around|with|among|coordinat\w* with)\s+(?:the\s+)?[\w\s,-]{0,60}?\b(?:crews?|trades?|workers|contractors?|subcontractors?|teams?)\b/gi, ' ');
}

function requiredFactsFor(fullTask, answer, state) {
  const task = ownWork(fullTask);
  const facts = [];
  // Most cranes on site are supplied and run by a crane company. Its operator and
  // dogmen work to its own lift plan, so the subcontractor states who that is.
  if (isCraneOrLift(task) && state && state.ownCrane) {
    facts.push({
      id: 'craneChart',
      label: 'Crane chart',
      prompt: 'From the crane chart: the rated capacity in tonnes at the working radius in metres.',
    });
  } else if (isCraneOrLift(task)) {
    facts.push({
      id: 'craneCompany',
      label: 'Crane company and lift plan',
      prompt: 'Name the company that supplies and operates the crane, and confirm its lift plan or SWMS covers these lifts.',
    });
  }
  if (isPanelLift(task)) {
    facts.push(
      { id: 'erectionDesign', label: 'Erection design', prompt: 'Erection design.' },
      { id: 'centreOfGravity', label: 'Centre of gravity', prompt: 'Centre of gravity.' },
      { id: 'braceArrangement', label: 'Brace arrangement', prompt: 'Brace arrangement.' },
    );
  }
  if (needsSafetyDataSheet(task)) {
    facts.push({
      id: 'safetyDataSheet',
      label: 'Safety data sheet',
      prompt: 'Safety data sheet.',
    });
  }
  if (fallRiskFor(task, answer) && !fallControlText(task)) {
    facts.push({
      id: 'fallControl',
      label: 'Fall control',
      prompt: `How a fall of more than ${fallMetres(state)} metres is prevented.`,
    });
  }
  // State facts for precast and tilt-up panels, such as Western Australia's regulator notice.
  if (state && Array.isArray(state.panelFacts) && isPanelLift(task)) {
    for (const item of state.panelFacts) facts.push({ ...item });
  }
  // Queensland, section 299(4): when the only fall controls are administrative or PPE,
  // the statement describes every control considered.
  if (state && state.fallControlsConsidered && fallRiskFor(task, answer)) {
    facts.push({
      id: 'controlsConsidered',
      label: 'Other fall controls considered',
      prompt: state.fallControlsConsidered,
    });
  }
  if (deepExcavation(task) && !trenchSupportText(task)) {
    facts.push({
      id: 'trenchSupport',
      label: 'Trench support',
      prompt: 'How the sides are secured: shoring, benching or battering, and who designed it.',
    });
  }
  // Facts the high risk categories below cannot be done safely without.
  for (const item of CATEGORY_FACTS) {
    if (item.applies(task)) facts.push({ id: item.id, label: item.label, prompt: item.prompt, ...(item.choices ? { choices: item.choices } : {}) });
  }
  if ((/\basbestos\b/i.test(task) || asbestosLikely(task)) && !asbestosArrangement(task)) {
    facts.push({
      id: 'asbestosArrangement',
      label: 'Asbestos arrangement',
      prompt: 'What happens with the asbestos.',
    });
  }
  return facts;
}

function combinedFacts(task, facts) {
  return [
    task,
    facts.craneChart,
    facts.craneCompany,
    facts.erectionDesign,
    facts.centreOfGravity,
    facts.braceArrangement,
    facts.safetyDataSheet,
    facts.fallControl,
    facts.asbestosArrangement,
    facts.trenchSupport,
  ].map(supplied).filter(Boolean).join('\n');
}

// Words that say a fact exists without stating it.
const FILLER = new Set(('supplied provided attached given included available received done ok okay yes see as per '
  + 'the a an is are was were has have been be in on at of to and it its this that with for by from our we will '
  + 'pack file files document documents doc drawing drawings sheet sheets chart charts design centre center gravity '
  + 'brace braces arrangement crane erection safety data sds checked confirmed approved fine all good sorted '
  + 'tbc na n/a copy copies here there on-site onsite site kept held office folder email emailed').split(' '));

function meaningfulWords(text) {
  return cleanLine(text)
    .toLowerCase()
    .split(/[^a-z0-9./-]+/)
    .map((word) => word.replace(/^[./-]+|[./-]+$/g, ''))
    .filter((word) => word && (word.length > 1 || /\d/.test(word)) && !FILLER.has(word));
}

// A crane chart fact states the rated capacity and the working radius.
function statesChartValues(text) {
  const source = String(text || '');
  const load = /\b\d+(?:\.\d+)?\s*(?:t|tonnes?|kg)\b/i.test(source);
  const radius = /\b\d+(?:\.\d+)?\s*m(?:etre|eter)?s?\b/i.test(source) && /\bradius\b/i.test(source);
  return load && radius;
}

function hasSubstance(id, text) {
  const value = acceptedText(text);
  if (!value) return false;
  if (id === 'craneChart') return statesChartValues(value);
  return meaningfulWords(value).length >= 2;
}

// The clause of the task that names the topic, so a bare "design supplied" does not count.
function topicClauses(task, pattern) {
  return String(task || '')
    .split(/(?<=[.;])\s+|\n+|,\s+/)
    .map(cleanLine)
    .filter((clause) => clause && pattern.test(clause) && !isDenialLine(clause));
}

function topicState(id, task, fieldValue, pattern) {
  const field = keptFact(fieldValue);
  if (field) return hasSubstance(id, field) ? 'supplied' : 'vague';
  const clauses = topicClauses(task, pattern);
  if (!clauses.length) return 'missing';
  return clauses.some((clause) => hasSubstance(id, clause)) ? 'supplied' : 'vague';
}

const TOPIC_PATTERNS = {
  craneChart: /\bcharts?\b/i,
  erectionDesign: /\berection design\b/i,
  centreOfGravity: /\b(?:centre|center) of gravity\b/i,
  braceArrangement: /\bbrace arrangement\b/i,
  safetyDataSheet: /\b(safety data sheet|sds)\b/i,
};

function factState(item, task, facts) {
  if (item.choices) return choiceAnswer(item.id, facts[item.id]) ? 'supplied' : 'missing';
  if (item.id === 'confinedSpace' && !/\bconfined space\b/i.test(task) && choiceAnswer('spaceAssessment', facts.spaceAssessment) === 'notConfined') return 'supplied';
  // Only needed when the fall control is administrative or PPE.
  if (item.id === 'controlsConsidered') {
    const fallLine = fallLineFor(combinedFacts(task, facts), facts);
    if (!fallLine || ['Eliminate', 'Isolate or engineer'].includes(fallControlLevel(fallLine))) return 'supplied';
  }
  if (item.id === 'fallControl' && fallControlText(acceptedText(combinedFacts(task, facts)))) return 'supplied';
  if (item.id === 'asbestosArrangement' && asbestosArrangement(acceptedText(combinedFacts(task, facts)))) return 'supplied';
  if (item.id === 'trenchSupport' && trenchSupportText(acceptedText(combinedFacts(task, facts)))) return 'supplied';
  if (TOPIC_PATTERNS[item.id]) return topicState(item.id, task, facts[item.id], TOPIC_PATTERNS[item.id]);
  const field = keptFact(facts[item.id]);
  if (!field) return 'missing';
  return hasSubstance(item.id, field) ? 'supplied' : 'vague';
}

function missingFacts(task, facts, answer, state) {
  return requiredFactsFor(task, answer, state)
    .map((item) => ({ ...item, state: factState(item, task, facts) }))
    .filter((item) => item.state !== 'supplied');
}

function missingLabel(item) {
  return item.state === 'vague' ? `${item.label} (the text given does not state it)` : item.label;
}

function contradicts(line, others) {
  const exit = /\b(keep clear of the exclusion zone|stay out of the exclusion zone|remain outside the exclusion zone|no person enters the exclusion zone)\b/i;
  const inside = /\b(people doing the lift are inside|only the people doing the lift|inside the exclusion zone)\b/i;
  if (exit.test(line) && others.some((item) => inside.test(item))) return true;
  if (inside.test(line) && others.some((item) => exit.test(item) && item !== line)) return false;
  return false;
}

function withoutOpposites(lines) {
  const unique = dedupe(lines);
  return unique.filter((line, index, all) => !contradicts(line, all.filter((_, item) => item !== index)));
}

function control(level, text) {
  return { level, text: cleanLine(text).replace(/[.]+$/, '.') };
}

function controlsFor(task, facts, pack) {
  const source = combinedFacts(task, facts);
  const items = [];
  const push = (level, text) => {
    const line = cleanLine(text);
    if (!line || isDenialLine(line)) return;
    items.push(control(level, line));
  };

  if (isScaffoldErection(task)) {
    for (const item of scaffoldControls(scaffoldBrief(task, pack && pack.site, pack))) {
      push(item.level, item.text);
    }
  } else if (isCraneOrLift(source)) {
    const under = isPanelLift(source) ? 'No one goes under the panel.' : 'No one goes under the load.';
    if (!(pack && pack.state && pack.state.ownCrane)) {
      const company = keptFact(facts.craneCompany);
      if (company) push('Administrative', company);
      push('Administrative', 'The crane company operates the crane under its lift plan. Only licensed dogmen or riggers sling, direct and release loads, with the split of duties agreed with the crane company.');
    }
    push('Administrative', `Only the people doing the lift are inside the exclusion zone. Stop the lift if anyone else enters. Do not pass a load over a person. ${under}`);
    // Free-fall lowering is a mobile crane feature, and the operator's business.
    if (pack && pack.state && pack.state.ownCrane && !/\btower cranes?\b/i.test(source)) push('Administrative', 'No free-fall with a load.');
  } else if (mentioned(source, /\b(powered mobile plant|concrete pump(?: truck)?s?|pump trucks?|telehandlers?|excavators?|forklifts?|trucks?|loaders?)\b/i)) {
    push('Administrative', 'People stay clear of moving plant.');
  }

  if (mentioned(source, ROAD)) {
    push('Isolate or engineer', 'Separate the work from passing traffic before the task starts.');
  }

  if (/\b(relocat\w*|house removal|raising (?:a |the )?house|lowering (?:a |the )?house)\b/i.test(source) && !isCraneOrLift(source)) {
    push('Isolate or engineer', 'People stay clear of the structure while it is being moved.');
  }

  if (mentioned(source, ENERGISED)) {
    push('Isolate or engineer', pack.state.overheadLineControl);
  }

  const fallLine = fallLineFor(source, facts);
  if (fallRiskFor(source, pack && pack.fallAnswer) && fallLine) {
    const level = fallControlLevel(fallLine);
    const considered = keptFact(facts.controlsConsidered);
    if (level === 'PPE' || level === 'Administrative') {
      if (considered) push('Administrative', `Other fall controls considered: ${considered.replace(/[.]+$/, '')}.`);
      else push('Administrative', `For a fall of more than ${fallMetres(pack && pack.state)} metres, elimination, substitution, and isolation or engineering must be considered before administrative controls or personal protective equipment.`);
    }
    push(level, fallLine);
  }

  const state = pack && pack.state;
  if (state && isPanelLift(source)) {
    for (const item of state.panelFacts || []) {
      const value = keptFact(facts[item.id]);
      if (value) push('Administrative', `${item.label}: ${value.replace(/[.]+$/, '')}.`);
    }
    for (const [level, text] of state.panelControls || []) push(level, text);
  }

  for (const item of CATEGORY_FACTS) {
    const value = keptFact(facts[item.id]);
    if (item.choices) {
      const chosen = item.choices.find((choice) => choice.value === choiceAnswer(item.id, value));
      if (chosen && item.applies(source) && item.id === 'deckMethod') push(item.level, `Deck laid ${chosen.label.charAt(0).toLowerCase()}${chosen.label.slice(1)}.`);
      continue;
    }
    if (value && item.applies(source)) {
      for (const line of sentences(value)) {
        push(/\brespirators?\b/i.test(line) && !/\b(extraction|wet|water)\b/i.test(line) ? 'PPE' : /\b(inspect\w*|check\w*|signs?|signed|supervis\w*|trained|procedure|permits?|follows?|assess\w*)\b/i.test(line) ? 'Administrative' : item.level, line);
      }
    }
  }

  const asbestos = keptFact(facts.asbestosArrangement) || asbestosArrangement(source);
  if (asbestos && !isDenialLine(asbestos)) push('Administrative', asbestos);

  const trench = trenchSupportText(acceptedText(source)) || keptFact(facts.trenchSupport);
  if (deepExcavation(source) && trench) push('Isolate or engineer', trench);

  const sheet = keptFact(facts.safetyDataSheet);
  if (sheet) {
    for (const line of sentences(sheet)) {
      // 'kept at the work area: avoid skin contact, wear gloves' is two controls: the PPE part goes under PPE.
      const at = line.search(/[,;:]\s*(?:and\s+)?wear\b/i);
      if (at > 0) {
        push('Administrative', `${line.slice(0, at).trim()}.`);
        const ppe = line.slice(at).replace(/^[,;:]\s*(?:and\s+)?/, '').replace(/[.]*$/, '.');
        push('PPE', ppe.charAt(0).toUpperCase() + ppe.slice(1));
      } else push('Administrative', line);
    }
  }

  const ppeNamed = source.match(/\b(hard hats?|helmets?|safety glasses|eye protection|gloves?|safety boots|hearing protection|hi-?vis(?:ibility)?(?: clothing)?|high visibility clothing|respirators?|dust masks?)\b/gi) || [];
  // The PPE section lists each item with its type, so one pointer is clearer than vague 'Wear gloves' lines.
  if (ppeNamed.length) push('PPE', 'Wear the PPE ticked in the PPE section, as listed for each job step.');

  if (!items.length) {
    push('Administrative', 'The controls for this task are set out in each job step below.');
  }

  const sorted = items
    .slice()
    .sort((a, b) => HIERARCHY_RANK[a.level] - HIERARCHY_RANK[b.level]);
  const seen = new Set();
  return sorted.filter((item) => {
    const key = `${item.level}|${item.text.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const HRCW_HAZARDS = {
  fall: ['Fall from height', 'A person falls more than 2 metres.'],
  tower: ['Telecommunication tower', 'A person falls from the tower.'],
  demolition: ['Demolition', 'A person is struck or crushed by a collapse or falling material.'],
  asbestos: ['Asbestos', 'A person is exposed to asbestos.'],
  temporary: ['Temporary support', 'A structure collapses onto a person.'],
  confined: ['Confined space', 'A person is overcome by the atmosphere or trapped.'],
  trench: ['Trench or excavation collapse', 'A person is buried or crushed.'],
  tunnel: ['Tunnel', 'A person is trapped or crushed by a collapse.'],
  explosives: ['Explosives', 'A person is injured by a blast.'],
  gas: ['Pressurised gas main or piping', 'A gas release, fire or explosion injures a person.'],
  chemicalLine: ['Chemical, fuel or refrigerant line', 'A person is exposed to a release.'],
  electrical: ['Energised electrical service', 'A person contacts live electricity.'],
  atmosphere: ['Contaminated or flammable atmosphere', 'A person is overcome or burned.'],
  precast: ['Tilt-up or precast concrete', 'A panel falls or topples onto a person.'],
  road: ['Traffic', 'A person or a vehicle is struck.'],
  plant: ['Moving plant', 'A person is struck by plant.'],
  temperature: ['Artificial extremes of temperature', 'A person suffers heat or cold illness.'],
  water: ['Water or other liquid', 'A person drowns.'],
  diving: ['Diving work', 'A person drowns or is injured under water.'],
  silica: ['Respirable crystalline silica', 'A person breathes in silica dust.'],
};

function hazardsFor(task, facts, pack) {
  const source = combinedFacts(task, facts);
  const rows = [];
  const add = (hazard, risk) => rows.push({ hazard, risk });
  if (isCraneOrLift(source)) add('Dropped load', 'A person is struck by the load.');
  if (/\b(relocat\w*|house removal|raising (?:a |the )?house|lowering (?:a |the )?house)\b/i.test(source)) {
    add('Structure moving', 'A person is struck or crushed.');
  }
  if (mentioned(source, ROAD)) {
    add('Traffic', 'A person or a vehicle is struck.');
  }
  if (fallRiskFor(source, pack && pack.fallAnswer)) add('Fall from height', `A person falls more than ${fallMetres(pack && pack.state)} metres.`);
  if (isScaffoldErection(task) && scaffoldBrief(task, pack && pack.site, pack).hoarded) {
    add('Public footpath below', 'A person on the footpath is below the scaffold.');
  }
  if (mentioned(source, /\basbestos\b/i)) add('Asbestos', 'A person is exposed to asbestos.');
  if (mentioned(source, /\b(energised|energized|energis(?:e|ing|ation)|overhead (?:power |electric )?lines?|power lines?|live electrical)\b/i)) {
    add('Energised electrical service', 'A person contacts live electricity.');
  }
  if (needsSafetyDataSheet(source)) add('Hazardous substance', 'A person is exposed to the substance.');
  if (mentioned(source, /\b(powered mobile plant|concrete pump(?: truck)?s?|pump trucks?|telehandlers?|excavators?|forklifts?|trucks?|loaders?|cranes?)\b/i) && !isCraneOrLift(source)) {
    add('Moving plant', 'A person is struck by plant.');
  }
  // Every high risk construction work category found in the task has a hazard row.
  const named = rows.map((row) => row.hazard);
  for (const item of highRiskMatches(source, pack && pack.fallAnswer, pack && pack.state)) {
    const row = item.id === 'fall'
      ? ['Fall from height', `A person falls more than ${fallMetres(pack && pack.state)} metres.`]
      : HRCW_HAZARDS[item.id];
    if (row && !named.includes(row[0])) {
      add(row[0], row[1]);
      named.push(row[0]);
    }
  }
  return dedupe(rows.map((row) => `${row.hazard}|${row.risk}`)).map((key) => {
    const [hazard, risk] = key.split('|');
    return { hazard, risk };
  });
}

function siteLines(site) {
  return SITE_FIELDS.map((field) => {
    const text = supplied(site[field.id]);
    return { id: field.id, label: field.label, text };
  });
}

function methodSteps(task, facts, site, pack) {
  if (isScaffoldErection(task)) {
    const fall = keptFact(facts.fallControl);
    const fallSteps = fall ? sentences(fall).filter((part) => !isDenialLine(part)) : [];
    return dedupe([...scaffoldMethod(scaffoldBrief(task, site, pack)), ...fallSteps]);
  }
  const fromTask = sentences(task).filter((line) => !isDenialLine(line) && (!LIFT_BLEED.test(line) || isCraneOrLift(task)));
  const fromFacts = [];
  for (const id of ['craneChart', 'craneCompany', 'erectionDesign', 'centreOfGravity', 'braceArrangement', 'safetyDataSheet', 'fallControl', 'asbestosArrangement', 'trenchSupport', ...CATEGORY_FACTS.filter((item) => !item.choices).map((item) => item.id)]) {
    const line = keptFact(facts[id]);
    if (!line) continue;
    if (sentences(task).some((item) => item.toLowerCase() === sentences(line).join(' ').toLowerCase())) continue;
    fromFacts.push(...sentences(line).filter((part) => !isDenialLine(part)));
  }
  const fromSite = siteLines(site)
    .filter((field) => field.text)
    .map((field) => `${field.label}: ${field.text.replace(/[.]+$/, '')}.`);
  return withoutOpposites(dedupe([...fromTask, ...fromFacts, ...fromSite]));
}

const REVIEW = 'The controls are put in place before the task starts. They are checked while the task is underway. They are reviewed before the task starts again, and if the task changes.';

function fallWarning(metres) {
  return `You answered No, but the task mentions work at height, such as a roof, a scaffold, an upper storey, or a height above ${metres} metres. Check that no one can fall more than ${metres} metres, for example because a scaffold, parapet or edge protection is already in place. If someone can, go back and answer Yes.`;
}

function fallCheck(task, answer, state) {
  const metres = fallMetres(state);
  const detected = fallRisk(task, metres);
  return {
    answer,
    detected,
    metres,
    treatedAsYes: answer === 'yes',
    warning: answer === 'no' && detected ? fallWarning(metres) : '',
    explanation: state.fallExplanation,
  };
}

function fallRecord(check) {
  if (check.answer === 'yes') return 'Yes';
  if (check.detected) return `No. No work is done where a person could fall ${check.metres} metres or more.`;
  return 'No';
}

// Northern Territory: residential construction work (a Class 1 building, or a Class 10
// building attached or adjacent to one) has a 3 metre fall height.
function residentialAnswer(value) {
  const text = cleanLine(value).toLowerCase();
  return ['yes', 'no'].includes(text) ? text : '';
}

// The state, with the fall height that applies to this task.
// Who runs the crane: a crane company unless the subcontractor says it runs its own.
function craneAnswer(value) {
  return /^(own|ours?|us|we|our company|yes)$/i.test(String(value || '').trim()) ? 'own' : 'company';
}

function stateFor(input) {
  const found = findState(input.state);
  if (!found) return found;
  const state = { ...found, ownCrane: craneAnswer(input.crane) === 'own' };
  if (!state.residentialFallMetres) return state;
  const residential = residentialAnswer(input.residential) === 'yes';
  return { ...state, residential, fallMetres: residential ? state.residentialFallMetres : 2 };
}

function questionsFor(input) {
  const state = stateFor(input);
  if (!state) {
    return { kind: 'refused', message: 'Choose a state.' };
  }
  if (!state.loaded) {
    return {
      kind: 'refused',
      state: state.name,
      message: `${state.name} is not available. Its legislation is not loaded, so a statement is not prepared for that state.`,
    };
  }
  const task = cleanLine(input.task || input.jobDescription);
  if (!task) return { kind: 'error', message: 'Write the task.' };
  if (state.residentialFallMetres && !residentialAnswer(input.residential)) {
    return { kind: 'error', message: 'Answer whether this is residential construction work.' };
  }
  const answer = fallAnswer(input.fallRisk);
  if (!answer) {
    return { kind: 'error', message: 'Answer the fall from height question.', explanation: state.fallExplanation };
  }
  return {
    kind: 'questions',
    state: {
      id: state.id,
      name: state.name,
      instrument: state.instrument,
      compilation: state.compilation,
      section: state.section,
    },
    task,
    fall: fallCheck(task, answer, state),
    required: requiredFactsFor(task, answer, state),
    site: SITE_FIELDS.map((field) => ({ id: field.id, label: field.label })),
    // The PPE suggested for this task, for the user to change before the draft is prepared.
    ppe: ppeList(task, input.facts || {}, state),
  };
}

// Details often not known until work starts. They are filled in before the SWMS goes for approval.
const TO_COMPLETE = 'To be completed before submitting for approval';

function prepareDraft(input) {
  const asked = questionsFor(input);
  if (asked.kind === 'refused' || asked.kind === 'error') return asked;
  const state = stateFor(input);
  const task = cleanLine(input.task || input.jobDescription);
  const facts = input.facts || {};
  const site = siteFromPack(task, input.site || {});
  const pack = {
    site,
    scaffoldSupervisor: input.scaffoldSupervisor,
    principalContractor: input.principalContractor,
    company: input.company,
    subcontractor: input.subcontractor,
    task,
    fallAnswer: fallAnswer(input.fallRisk),
    state,
  };
  const missing = missingFacts(task, facts, pack.fallAnswer, state);
  const status = packIsTest(input)
    ? 'Not approved. Not signed. A test, not a site record.'
    : 'Not approved. Not signed.';
  const header = {
    state: state.name,
    instrument: state.instrument,
    compilation: state.compilation,
    section: state.section,
    sectionRef: state.sectionRef,
    versionLabel: state.versionLabel,
    reviewHeading: state.reviewHeading,
    sectionTitle: state.sectionTitle,
    contents: state.contents,
    principalContractor: keptFact(input.principalContractor),
    subcontractor: blankName(input.company || input.subcontractor),
    companyDetails: companyDetails(input),
    workplace: blankName(input.workplace || input.siteAddress),
    siteManager: keptFact(input.siteManager),
    scaffoldSupervisor: keptFact(input.scaffoldSupervisor) || TO_COMPLETE,
    hospital: keptFact(input.hospital),
    firstAider: keptFact(input.firstAider),
    musterPoint: keptFact(input.musterPoint) || TO_COMPLETE,
    craneOperator: isCraneOrLift(task) ? (state.ownCrane ? 'Our company' : 'Crane company') : '',
    worksManager: keptFact(input.worksManager),
    worksManagerPhone: keptFact(input.worksManagerPhone),
    complianceResponsible: keptFact(input.complianceResponsible),
    reviewer: keptFact(input.reviewer),
    reviewDate: keptFact(input.reviewDate),
    preparedBy: keptFact(input.preparedBy),
    task,
    fallRisk: fallRecord(fallCheck(task, pack.fallAnswer, state)),
    fallMetres: fallMetres(state),
    residential: state.residentialFallMetres ? (state.residential ? 'Yes' : 'No') : '',
    date: cleanLine(input.date),
    status,
    test: packIsTest(input),
  };

  if (missing.length) {
    return {
      kind: 'stand-down',
      ...header,
      missing: missing.map(missingLabel),
      statement: 'This task is stood down. It does not start.',
      method: [],
      hazards: [],
      controls: [],
      site: [],
      review: '',
      signed: false,
      approved: false,
    };
  }

  let steps = methodSteps(task, facts, site, pack);
  const built = controlsFor(task, facts, pack);
  const controlText = built.map((item) => item.text);
  if (controlText.some((line) => /\b(people doing the lift are inside|inside the exclusion zone)\b/i.test(line))) {
    steps = steps.filter((line) => !/\b(keep clear of the exclusion zone|stay out of the exclusion zone|remain outside the exclusion zone|no person enters the exclusion zone)\b/i.test(line));
  }
  const ordered = built
    .filter((item) => (isCraneOrLift(task) || !LIFT_BLEED.test(item.text)) && !contradicts(item.text, controlText))
    .sort((a, b) => HIERARCHY_RANK[a.level] - HIERARCHY_RANK[b.level]);

  const finalControls = dedupe(ordered.map((item) => `${item.level}|${item.text}`)).map((key) => {
    const splitAt = key.indexOf('|');
    return { level: key.slice(0, splitAt), text: key.slice(splitAt + 1) };
  });
  const hazards = hazardsFor(task, facts, pack);

  return {
    kind: 'draft',
    ...header,
    ...stepsAndPpe(task, facts, hazards, finalControls, state, input),
    references: referencesFor(facts),
    missing: [],
    statement: '',
    // Testing on or near energised parts is high risk construction work, however the task is worded.
    highRisk: highRiskMatches(`${combinedFacts(task, facts)}${choiceAnswer('energisedWork', facts.energisedWork) === 'testing' ? '\nlive electrical' : ''}${choiceAnswer('spaceAssessment', facts.spaceAssessment) === 'confined' ? '\nconfined space' : ''}${ICT_WORK.test(task) && /\b(risers?|ceilings?|comms rooms?|ups|card readers?|intercoms?|power supplies)\b/i.test(task) ? '\nwork near energised electrical installations (shared risers, ceilings and equipment)' : ''}${/\b(spray\w*|airless)\b/i.test(task) && /\b(solvent[- ]based|solvents?|two[- ]pack|2[- ]pack)\b/i.test(task) ? '\nflammable atmosphere (spraying solvent-based paint)' : ''}${BULK_EXCAVATION.test(task) && /\b(contaminat\w*|unknown fill)\b/i.test(task) ? '\nmay disturb asbestos\ncontaminated atmosphere' : ''}${PILING_WORK.test(task) && /\b(bored piles?|open (?:pile )?(?:bores?|holes?)|pile (?:bores?|holes?))\b/i.test(task) ? '\nshaft excavation (open pile bores)' : ''}${PILING_WORK.test(task) && /\b(slurry|bentonite|support fluid|water[- ]filled|groundwater)\b/i.test(task) ? '\nwork in or near water or other liquid that involves a risk of drowning' : ''}${MECHANICAL_WORK.test(task) && /\b(commission\w*|start[- ]?up)\b/i.test(task) ? '\nwork near energised electrical installations (plant being commissioned)' : ''}${REFRIGERANT.test(task) && /\b(pipe\w*|lines?|braz\w*|charg\w*|recover\w*|evacuat\w*|pressure test\w*)\b/i.test(task) ? '\nrefrigerant line' : ''}${['a2l', 'a3'].includes(choiceAnswer('refrigerantClass', facts.refrigerantClass)) ? '\nflammable atmosphere' : ''}${/\b(live sewer|sewer mains?|manholes?|maintenance holes?)\b/i.test(task) ? '\nwork near a confined space (sewer)\ncontaminated atmosphere (sewer gas)' : ''}${/\b(roof spaces?|roof cavit\w*)\b/i.test(task) ? '\nartificial extremes of temperature (roof space)' : ''}${asbestosLikely(task) && !/\bno asbestos|asbestos[- ]free|tested negative\b/i.test(combinedFacts(task, facts)) ? '\nlikely to involve the disturbance of asbestos' : ''}${MEDICAL_GAS.test(task) && /\b(connect\w*|live|tie[- ]?ins?|commission\w*|pressure test\w*|manifolds?)\b/i.test(task) ? '\nwork on or near pressurised gas distribution mains or piping (medical gases)' : ''}${/\b(generators?|fuel (?:lines?|tanks?|systems?)|diesel tanks?)\b/i.test(task) && /\b(install\w*|connect\w*|commission\w*)\b/i.test(task) ? '\nwork on or near a fuel line' : ''}${/\b(alongside|next to|near) (?:an? |the )?operating boilers?\b/i.test(task) || (BOILER.test(task) && /\bcommission\w*\b/i.test(task)) ? '\nartificial extremes of temperature' : ''}${/\b(opening|break\w* through)\b/i.test(task) && /\bwalls?\b/i.test(task) && /\b(load[- ]bearing|propped|propping)\b/i.test(task) ? '\ndemolition of a load-bearing element of the structure' : ''}${FIRE_SERVICES.test(task) && /\b(commission\w*|pump rooms?)\b/i.test(task) ? '\nwork near energised electrical installations (fire pumps and controllers being commissioned)' : ''}${LIFT_WORK.test(task) && /\b(commission\w*|car tops?)\b/i.test(task) ? '\nwork near energised electrical installations (lift being commissioned)' : ''}${LIFT_WORK.test(task) && /\bpits?\b/i.test(task) ? '\nwork in or near a confined space (lift pit)' : ''}${/\b(concrete cutt\w*|saw[- ]?cut\w*|wall saw\w*|core drill\w*)\b/i.test(task) && /\bwalls?\b/i.test(task) ? '\nwork near energised electrical installations (live wiring may be hidden in walls)' : ''}${/\b(solvent (?:cement|weld\w*)|primers?|solvent[- ]based)\b/i.test(task) && /\b(risers?|basements?|ducts?|pits?|shafts?|ceilings?|plant rooms?)\b/i.test(task) ? '\nflammable atmosphere' : ''}`, pack.fallAnswer, state)
      .map((item) => (item.id === 'fall' && state.residential && state.residentialFallLabel ? state.residentialFallLabel : item.label)),
    hazards,
    controls: finalControls,
    review: REVIEW,
    site: siteLines(site),
    method: steps,
    workers: [{ name: '', signature: '', date: '' }],
    signed: false,
    approved: false,
  };
}

// The PPE list, then the job steps, which add fit testing when a respirator is ticked.
function ppeList(task, facts, state, chosen) {
  return ppeFor(
    workFlags(task, facts, state.ownCrane),
    chosen,
    /\b(harness|fall arrest|elevating work platform|ewp|boom lift)\b/i.test(combinedFacts(task, facts)),
    /\b(interior|inside|indoors?|internal|shop|office)\b/i.test(task),
  );
}

function stepsAndPpe(task, facts, hazards, controls, state, input) {
  const ppe = ppeList(task, facts, state, input.ppe);
  // Energised testing needs arc-rated PPE and insulated gloves (Model Code s 9.5).
  if (!Array.isArray(input.ppe) && choiceAnswer('energisedWork', facts.energisedWork) === 'testing') {
    for (const group of ppe) for (const item of group.items) if (['arcRated', 'gloveInsulated'].includes(item.id)) item.ticked = true;
  }
  const respirator = ppe.some((group) => group.items.some((item) => item.ticked && ['p2', 'halfFace'].includes(item.id)));
  return { jobSteps: jobStepsForTask(task, facts, hazards, controls, state, { respirator }), ppe };
}

// Documents the SWMS relies on, to be kept on site with it.
const REFERENCE_FACTS = [
  ['loadLimits', 'Load limits'],
  ['pilingPlatform', 'Piling working platform certificate'],
  ['excavationPlan', 'Excavation and traffic plan'],
  ['erectionSequence', 'Steel erection sequence and bracing'],
  ['tierErection', 'Precast erection design'],
  ['serviceShutdown', 'Live service shutdown permit'],
  ['silicaControls', 'Silica assessment and controls'],
  ['systemInstructions', 'System and supplier instructions'],
  ['formworkDesign', 'Formwork design'],
  ['jumpformProcedure', 'Jumpform climbing procedure'],
  ['stressingProcedure', 'Stressing procedure'],
  ['erectionDesign', 'Erection design'],
  ['temporarySupport', 'Temporary support design'],
  ['craneCompany', 'Crane company and lift plan'],
  ['safetyDataSheet', 'Safety data sheet'],
];

function referencesFor(facts) {
  return REFERENCE_FACTS
    .map(([id, label]) => ({ label, text: keptFact(facts[id]) }))
    .filter((item) => item.text);
}

// The kinds of work in the task, which choose the job steps and the PPE.
function workFlags(fullTask, facts = {}, ownCrane = false) {
  const task = ownWork(fullTask);
  const scaffold = isScaffoldErection(task);
  return {
    road: mentioned(task, ROAD),
    power: mentioned(task, ENERGISED),
    scaffold,
    // Roofing work, not a roof beam or a job under a roof.
    roof: !SPORTS_LIGHTING.test(task) && /\b(roof(?:ing)? sheet\w*|roofing|re-?roof\w*|roof tiles?|on (?:the|a) roof|roof work|roof repairs?)\b/i.test(task) && !scaffold && !MECHANICAL_WORK.test(task) && !ICT_WORK.test(task) && !WATERPROOFING.test(task),
    // Piling contractors excavate bores and basements, not trenches, unless a trench is named.
    deepTrench: deepExcavation(task),
    trench: (deepExcavation(task) || /\b(excavat\w*|trench\w*)\b/i.test(task)) && !((PILING_WORK.test(task) || BULK_EXCAVATION.test(task) || EARTHWORKS.test(task)) && !/\btrench\w*\b/i.test(task)),
    propping: CATEGORY_FACTS.find((item) => item.id === 'temporarySupport').applies(task),
    demolition: mentioned(task, DEMOLITION),
    craneInterface: isCraneOrLift(task) && !ownCrane,
    towerCrane: ownCrane && /\btower cranes?\b/i.test(task),
    crane: ownCrane && isCraneOrLift(task) && !/\btower cranes?\b/i.test(task),
    loadOut: /\b(load(?:ing)?[- ]?out|loading platforms?|landing platforms?)\b/i.test(task),
    forklift: /\b(forklifts?|telehandlers?)\b/i.test(task),
    formwork: FORMWORK.test(task.replace(new RegExp(JUMPFORM.source, 'gi'), '')),
    reo: /\b(reo|reinforc\w*|rebar|steel fixing)\b/i.test(task),
    ptTendons: PT.test(task) && /\b(place|placing|install\w*|lay\w*|fix\w*)\b/i.test(task) && /\b(ducts?|tendons?|strand)\b/i.test(task),
    concrete: /\b(cast[- ]in|in[- ]slab)\b/i.test(task) ? /\b(concrete pump\w*|placing boom|pump(?:ing)? concrete)\b/i.test(task) : /\b(concrete pump\w*|placing boom|pump(?:ing)? concrete|pour\w*|(?:plac\w*|finish\w*) (?:and (?:finish\w*|plac\w*) )?(?:the )?concrete|concrete (?:plac\w*|finish\w*))\b/i.test(task),
    stressing: /\b(stress(?:ing)? (?:the )?tendons?|stressing)\b/i.test(task) && !/\bground anchors?\b/i.test(task),
    jumpform: JUMPFORM.test(task),
    ptSlab: PT.test(task) && !/\b(cast[- ]in|in[- ]slab)\b/i.test(task) && !/\bground anchors?\b/i.test(task),
    electricalWork: ELECTRICAL_WORK.test(task),
    plumbingWork: isPlumbing(task),
    sewerConnection: /\b(sewer connection|connect\w* (?:to )?(?:the )?(?:council |existing |live )?sewer\w*|live sewer|sewer mains?|manholes?|maintenance holes?)\b/i.test(task),
    castInPlumbing: /\b(cast[- ]in|in[- ]slab)\b/i.test(task) && /\b(sleeves?|puddle flanges?|plumbing|drainage|pipes?)\b/i.test(task) && isPlumbing(task),
    coreDrill: CORE_DRILL.test(task),
    // Installing risers or pipework at height, not other work done in the risers.
    hydraulicRisers: isPlumbing(task) && /\binstall\w*\b/i.test(task) && /\b(risers?|stacks?|shafts?|ceilings?|at height)\b/i.test(task) && !/\b(rough[- ]in|fit[- ]off)\b/i.test(task),
    hotWork: HOT_WORK.test(task),
    solventCement: /\b(solvent (?:cement|weld\w*)|pvc (?:glue|cement))\b/i.test(task) || (/\bprimers?\b/i.test(task) && /\b(pvc|pipe\w*)\b/i.test(task)),
    pressureTest: PRESSURE_TEST.test(task),
    hotWater: PRESSURE_TEST.test(task) && /\b(hot water|heat pumps?|boilers?|water heaters?)\b/i.test(task),
    plumbingFitOff: /\b(rough[- ]in|fit[- ]off)\b/i.test(task) && isPlumbing(task) && !ELECTRICAL_CORE.test(task),
    bulkDig: /\b(bulk excavat\w*|excavat\w* (?:the |out the )?basement|dig\w* (?:out )?(?:the )?basement)\b/i.test(task),
    anchorsProps: BULK_EXCAVATION.test(task) && /\b(ground anchors?|anchors?|props?|walers?|de-?stress\w*)\b/i.test(task),
    detailDig: /\b(detailed excavat\w*|(?:excavat|dig)\w*[^.]{0,30}\b(?:pile caps?|lift pits?))\b/i.test(task),
    dewatering: BULK_EXCAVATION.test(task) && /\b(dewater\w*|groundwater|pump\w*)\b/i.test(task),
    contaminatedSpoil: BULK_EXCAVATION.test(task) && /\b(contaminat\w*|acid sulfate|unknown fill|fill material|spoil)\b/i.test(task),
    basementEdge: /\b(bulk excavat\w*|excavat\w* (?:the |out the )?basement|dig\w* (?:out )?(?:the )?basement)\b/i.test(task),
    neighbours: BULK_EXCAVATION.test(task) && /\b(neighbour\w*|street|footpath|adjacent|adjoining)\b/i.test(task),
    steelWork: STEEL_WORK.test(task),
    steelLift: STEEL_WORK.test(task) && /\b(cranes?|lift\w*|land\w*)\b/i.test(task),
    steelErect: STEEL_WORK.test(task) && /\b(erect\w*|install\w*|connect\w*|bolt\w*)\b/i.test(task),
    steelWeld: STEEL_WORK.test(task) && /\b(weld\w*)\b/i.test(task),
    masonryWork: MASONRY_WORK.test(task),
    masonryCut: MASONRY_WORK.test(task) && /\b(cut\w*|saws?)\b/i.test(task),
    masonryLay: MASONRY_WORK.test(task) && /\b(lay\w*|build\w*|walls?)\b/i.test(task),
    masonryMortar: MASONRY_WORK.test(task) && /\bmortar\b/i.test(task) && !/\b(grout\w*|core[- ]fill\w*)\b/i.test(task),
    masonryGrout: MASONRY_WORK.test(task) && /\b(grout\w*|core[- ]fill\w*)\b/i.test(task),
    masonryEdge: MASONRY_WORK.test(task) && /\b(slab edges?|edges?|perimeter)\b/i.test(task),
    plasterWork: PLASTER_WORK.test(task),
    plasterSheets: PLASTER_WORK.test(task) && /\b(sheets?|fix\w*|hang\w*)\b/i.test(task),
    plasterHeight: PLASTER_WORK.test(task),
    plasterCeiling: PLASTER_WORK.test(task) && /\b(ceiling (?:grids?|sheets?|linings?)|suspended ceilings?|ceiling (?:plasterboard|gyprock|drywall)|(?:plasterboard|gyprock|drywall) ceiling\w*)\b/i.test(task),
    plasterSanding: PLASTER_WORK.test(task) && /\b(sand\w*|set\w*|cut\w*|stopping)\b/i.test(task),
    paintSpray: /\b(paint\w*|coating)\b/i.test(task) && /\b(spray\w*|airless)\b/i.test(task),
    paintExternal: /\bpaint\w*\b/i.test(task) && /\b(external\w*|outside|facade|fa[cç]ade|ewps?|elevating work platforms?|boom lifts?)\b/i.test(task),
    floorWork: FLOOR_WORK.test(task),
    floorGrind: FLOOR_WORK.test(task) && /\b(grind\w*|prepar\w*)\b/i.test(task),
    floorAdhesive: FLOOR_WORK.test(task) && /\b(adhesives?|glue\w*)\b/i.test(task),
    floorLevel: FLOOR_WORK.test(task) && /\b(levelling|primers?|screed\w*)\b/i.test(task),
    timberFloor: /\b(timber floor\w*|engineered timber|floating floors?)\b/i.test(task),
    floorLay: /\b(carpet\w*|vinyl|floor coverings?)\b/i.test(task) && /\b(lay\w*|install\w*|fit\w*)\b/i.test(task),
    waterproofing: WATERPROOFING.test(task),
    wpPrep: WATERPROOFING.test(task) && /\b(grind\w*|prepar\w*|scabbl\w*)\b/i.test(task),
    wpLiquid: WATERPROOFING.test(task) && /\b(primers?|liquid|solvents?|polyurethane|apply\w*|brush\w*|roll(?:ed|ing)? on|spray\w*|waterproof (?:the )?(?:floors?|walls?|shower|bathroom|wet areas?))\b/i.test(task),
    wpTorch: WATERPROOFING.test(task) && /\b(torch[- ]on|torch\w*|bitumen sheet\w*)\b/i.test(task),
    wpEdge: WATERPROOFING.test(task) && /\b(roofs?|podium|balcon\w*|planters?|edges?)\b/i.test(task),
    wpRolls: WATERPROOFING.test(task) && /\b(rolls?|sheet membranes?|torch[- ]on)\b/i.test(task),
    tilingWork: isTiling(task),
    tileCut: isTiling(task) && /\b(cut\w*|grind\w*|saws?)\b/i.test(task),
    tileMix: isTiling(task) && /\b(adhesives?|grout\w*|epox\w*|screed\w*|mix\w*|sealers?)\b/i.test(task),
    tileLay: isTiling(task) && /\b(lay\w*|til(?:e|ing)\b|fix\w*)\b/i.test(task),
    tileEdge: isTiling(task) && /\b(balcon\w*|terraces?|edges?|podium)\b/i.test(task),
    mobileScaffold: /\bmobile scaffold\w*\b/i.test(task) && /\b(erect\w*|assembl\w*|set up|us(?:e|ing))\b/i.test(task),
    hoistInstall: /\b(install\w*|erect\w*|climb\w*|dismantl\w*|jump\w*)\b[^.]{0,40}\b(?:builders'? |personnel (?:and materials )?|materials )?hoists?\b/i.test(task),
    hoistOperate: /\b(operat\w*|run\w*|driv\w*)\b (?:the )?(?:builders'? |personnel (?:and materials )?|materials )?hoists?\b/i.test(task),
    carpentryWork: CARPENTRY_WORK.test(task) && !FORMWORK.test(task),
    carpLoad: CARPENTRY_WORK.test(task) && !FORMWORK.test(task) && /\b(hoists?|deliver\w*|carr\w*|mov\w*|sheets?|joinery|cabinets?)\b/i.test(task),
    carpFraming: CARPENTRY_WORK.test(task) && /\b(steel stud\w*|stud (?:walls?|framing)|wall framing|framing|bulkheads?)\b/i.test(task) && !FORMWORK.test(task),
    carpJoinery: CARPENTRY_WORK.test(task) && /\b(door frames?|doors?|joinery|(?<!(?:comms|communications|data|server|equipment|electrical|racks,?|racks and)\s)cabinets?|vanities|wardrobes?|benchtops?)\b/i.test(task) && !FORMWORK.test(task),
    carpEdge: CARPENTRY_WORK.test(task) && /\b(balcon\w*|voids?|penetrations?|balustrades?|handrails?)\b/i.test(task) && !FORMWORK.test(task),
    pilingWork: PILING_WORK.test(task),
    pilingPlatform: PILING_WORK.test(task) && /\b(working platforms?|piling platforms?|deliver\w*|assembl\w*|disassembl\w*|mobilis\w*|set up the rigs?)\b/i.test(task),
    pilingRig: PILING_WORK.test(task) && /\b(drill\w*|auger\w*|install\w*)\b/i.test(task),
    pileCage: PILING_WORK.test(task) && /\b(cages?)\b/i.test(task) && /\b(bored piles?|open (?:pile )?(?:bores?|holes?))\b/i.test(task),
    cfaCage: PILING_WORK.test(task) && /\b(cages?)\b/i.test(task) && /\b(cfa|continuous flight auger)\b/i.test(task) && !/\b(bored piles?|open (?:pile )?(?:bores?|holes?))\b/i.test(task),
    openBore: PILING_WORK.test(task) && /\b(bored piles?|open (?:pile )?(?:bores?|holes?)|pile (?:bores?|holes?))\b/i.test(task),
    pileConcrete: PILING_WORK.test(task) && /\b(concrete|tremie|grout\w*)\b/i.test(task) && /\b(plac\w*|pour\w*|pump\w*|tremie)\b/i.test(task),
    pileTrim: PILING_WORK.test(task) && /\b(trim\w*|crop\w*|break\w* (?:down )?(?:the )?pile(?: heads?|s))\b/i.test(task),
    retentionWall: PILING_WORK.test(task) && /\b(excavat\w*|dig\w*)\b/i.test(task) && /\b(secant|contiguous|retention walls?|sheet pil\w*|shoring walls?|bulk excavat\w*)\b/i.test(task),
    fireWork: FIRE_SERVICES.test(task),
    fireAtHeight: FIRE_SERVICES.test(task) && /\b(install\w*|ceilings?|risers?|at height)\b/i.test(task),
    fireGrooving: FIRE_SERVICES.test(task) && /\b(groov\w*|thread\w*|cut\w*)\b/i.test(task),
    fireLive: FIRE_SERVICES.test(task) && /\b(live|isolat\w*|impair\w*|pump rooms?|connect\w*|commission\w*)\b/i.test(task),
    liftWork: LIFT_WORK.test(task) && !BULK_EXCAVATION.test(task),
    liftShaft: LIFT_WORK.test(task) && !BULK_EXCAVATION.test(task) && /\b(shafts?|wells?|landing doors?)\b/i.test(task),
    liftLifting: LIFT_WORK.test(task) && !BULK_EXCAVATION.test(task) && /\b(machines?|rails?|motor rooms?|lift\w* (?:the )?(?:machine|equipment))\b/i.test(task),
    liftCar: LIFT_WORK.test(task) && !BULK_EXCAVATION.test(task) && /\b(car tops?|pits?|commission\w*)\b/i.test(task),
    passiveFire: PASSIVE_FIRE.test(task),
    siteEstablish: /\b(hoardings?|gantr(?:y|ies)|site fenc\w*|site sheds?|site establishment|temporary fenc\w*)\b/i.test(task),
    sitePlant: /\b(traffic controllers?|traffic management|site gate|separat\w* (?:plant|people|pedestrians))\b/i.test(task),
    sawCut: /\b(concrete cutt\w*|saw[- ]?cut\w*|wall saw\w*|floor saw\w*|wire saw\w*)\b/i.test(task),
    landscape: LANDSCAPE.test(task) && /\b(soil|mulch|plant\w*|planters?|landscap\w*)\b/i.test(task),
    turf: /\bturf\b/i.test(task),
    carPark: SECURITY_WORK.test(task) && /\binstall\w*\b/i.test(task) && /\bcar ?parks?\b/i.test(task),
    temporaryTowers: STEEL_WORK.test(task) && /\b(temporary (?:support )?towers?|support towers?)\b/i.test(task),
    medicalGas: MEDICAL_GAS.test(task),
    medicalGasBraze: MEDICAL_GAS.test(task) && /\b(braz\w*|install\w*)\b/i.test(task),
    medicalGasLive: MEDICAL_GAS.test(task) && /\b(connect\w*|live|tie[- ]?ins?|commission\w*)\b/i.test(task),
    gasCylinders: /\b(gas cylinders?|cylinders?|gas manifolds?)\b/i.test(task) && (MEDICAL_GAS.test(task) || /\bmanifolds?\b/i.test(task)),
    leadShielding: LEAD_SHIELDING.test(task),
    liveHospital: LIVE_HOSPITAL.test(task),
    hospitalCut: LIVE_HOSPITAL.test(task) && !PILING_WORK.test(task) && /\b(drill\w*|cut\w*|cor(?:e|ing)\b|penetrat\w*|break\w* through|chas\w*)/i.test(task),
    ambulance: /\bambulances?\b/i.test(task),
    structuralOpening: /\b(opening|break\w* through)\b/i.test(task) && /\bwalls?\b/i.test(task) && /\b(load[- ]bearing|propped|propping)\b/i.test(task),
    timberWork: /\b(timber|mdf|joinery|cabinets?|doors?|skirtings?|architraves?)\b/i.test(task),
    carpet: /\bcarpets?\b/i.test(task),
    vinylWeld: /\bvinyl\b/i.test(task) && /\bweld\w*\b/i.test(task),
    helipad: HELIPAD.test(task),
    pneumaticTube: PNEUMATIC_TUBE.test(task),
    generatorPlant: /\b(generators?|day tanks?|fuel (?:lines?|tanks?|systems?))\b/i.test(task) && /\b(install\w*|connect\w*|commission\w*)\b/i.test(task),
    boilerPlant: BOILER.test(task) && /\b(install\w*|commission\w*|connect\w*|set\w*|lift\w*)\b/i.test(task),
    cleaningStands: CLEANING.test(task) && /\b(stands?|seats?|tiers?|grandstands?|aisles?)\b/i.test(task),
    landscapeLift: LANDSCAPE.test(task) && /\b(soil|mulch|plant\w*|turf|planters?|landscap\w*)\b/i.test(task) && /\b(podium|roofs?|cranes?|hoists?)\b/i.test(task),
    dualLift: /\b(dual lifts?|tandem lifts?|two (?:crawler |mobile )?cranes)\b/i.test(task),
    precastTier: /\bprecast\b/i.test(task) && PRECAST_TIER.test(task) && /\b(install\w*|plac\w*|lift\w*|erect\w*|land\w*)\b/i.test(task),
    safetyNet: /\bsafety nets?\b/i.test(task),
    sportsLighting: SPORTS_LIGHTING.test(task),
    earthworks: EARTHWORKS.test(task),
    seating: /\b(seats?|chairs?)\b/i.test(task) && /\b(fix\w*|install\w*|bolt\w*|drill\w*)\b/i.test(task),
    paving: /\b(paving|pavers?)\b/i.test(task),
    podiumEdge: LANDSCAPE.test(task) && /\b(podium edges?|edges?)\b/i.test(task),
    cleaning: CLEANING.test(task),
    cleaningHeight: CLEANING.test(task) && /\b(windows?|balcon\w*|glass)\b/i.test(task),
    glazingWork: GLAZING_WORK.test(task),
    balustradeEdge: /\bbalustrades?\b/i.test(task) && /\b(balcon\w*|edges?|terraces?)\b/i.test(task),
    glassWind: GLAZING_WORK.test(task) && /\b(balcon\w*|edges?|external|outside|facades?)\b/i.test(task),
    glazingDrill: GLAZING_WORK.test(task) && /\bdrill\w*\b/i.test(task) && /\b(tiled|tiles?|masonry|concrete)\b/i.test(task),
    glassHandle: GLAZING_WORK.test(task) && /\b(glass|glazing|mirrors?|screens?)\b/i.test(task),
    glazingSeal: GLAZING_WORK.test(task) && /\b(seal\w*|silicon\w*)\b/i.test(task),
    stoneWork: STONE_WORK.test(task),
    siteSheds: /\b(site sheds?|sheds?|site offices?|amenities)\b/i.test(task) && /\b(set up|install\w*|erect\w*|lift\w*|place\w*)\b/i.test(task),
    stoneSilica: STONE_WORK.test(task) && /\b(cut\w*|drill\w*|polish\w*|grind\w*)\b/i.test(task),
    stoneHandle: STONE_WORK.test(task) && /\b(install\w*|set\w*|carr\w*|mov\w*|lift\w*)\b/i.test(task),
    roofStrip: /\broof\w*\b/i.test(task) && /\b(remov\w*|replac\w*|strip\w*|re-?roof\w*)\b/i.test(task),
    facadeWork: FACADE_WORK.test(task),
    panelLoad: FACADE_WORK.test(task) && /\b(load\w*|deliver\w*|stillages?|racks?|land\w*)\b/i.test(task),
    facadeCrane: FACADE_WORK.test(task) && /\b((?:floor|mini|spider|crawler) cranes?|monorails?)\b/i.test(task),
    panelInstall: FACADE_WORK.test(task) && /\b(install\w*|plac\w*|hang\w*)\b/i.test(task) && /\b(panels?|curtain wall\w*|glazing|glass)\b/i.test(task) && !/\b(swing stages?|suspended scaffold\w*|mast climb\w*)\b/i.test(task),
    glassHandling: FACADE_WORK.test(task) && /\b(glass|glazing|glazed|panels?|vacuum lifters?)\b/i.test(task) && /\b(install\w*|lift\w*|handl\w*|replac\w*)\b/i.test(task) && !/\b(stillages?|trolleys?)\b/i.test(task),
    swingStage: /\b(swing stages?|suspended scaffold\w*|mast climb\w*|mcwps?)\b/i.test(task),
    edgeBracket: FACADE_WORK.test(task) && /\bbrackets?\b/i.test(task) && /\bslab edges?\b/i.test(task),
    facadeSeal: FACADE_WORK.test(task) && /\b(seal\w*|silicon\w*|caulk\w*)\b/i.test(task),
    mechanicalWork: MECHANICAL_WORK.test(task),
    refrigerantWork: REFRIGERANT.test(task),
    // Heavy plant lifted, delivered or moved into place; not scissor or boom lifts.
    plantLift: MECHANICAL_WORK.test(task) && /\b(ahus?|air handling units?|chillers?|cooling towers?|condens\w* units?|condensers?|fans?(?!\s+coil)|plant)\b/i.test(task) && /\b((?<!scissor\s+|boom\s+)lift\w*|cranes?|hoist\w*|deliver\w*|unload\w*|skates?|pallet jacks?|position\w*|mov\w*|rig\w*)\b/i.test(task),
    ductwork: MECHANICAL_WORK.test(task) && /\binstall\w*\b/i.test(task) && !/\bon the roof\b/i.test(task) && (/\b(ductwork|duct(?:ing| runs?| sections?)|ducts)\b/i.test(task) || (/\b(fan coil units?|fcus?)\b/i.test(task) && !REFRIGERANT.test(task))),
    refrigerantPipework: REFRIGERANT.test(task) && /\b(braz\w*|silver solder\w*)\b/i.test(task),
    refrigerantTest: REFRIGERANT.test(task) && PRESSURE_TEST.test(task),
    refrigerantCharge: REFRIGERANT.test(task) && /\b(charg\w*|evacuat\w*|recover\w*|decant\w*)\b/i.test(task),
    // Plant installed on the roof, as opposed to pipework that only runs to it.
    roofPlant: (MECHANICAL_WORK.test(task) || ICT_WORK.test(task)) && /\binstall\w*\b[^.]{0,70}\b(?:on the roof|roof plant)\b/i.test(task) && !/\b(?:pipework|pipes?|lines?)\s+(?:between|from|to)\b/i.test(task),
    jetFans: /\b(jet fans?|car ?park (?:ventilation|exhaust)\w*)\b/i.test(task),
    mechInsulation: MECHANICAL_WORK.test(task) && /\b(insulat\w*|lagging)\b/i.test(task),
    mechCommissioning: MECHANICAL_WORK.test(task) && /\b(commission\w*|start[- ]?up|balanc\w*)\b/i.test(task),
    tempPower: TEMP_POWER.test(task),
    castIn: /\b(cast[- ]in|in[- ]slab)\b/i.test(task) && ELECTRICAL_CORE.test(task),
    containment: /\b(cable trays?|cable ladders?|containment|busduct)\b/i.test(task) && ELECTRICAL_CORE.test(task),
    cablePull: /\b(cable pull\w*|pull\w* (?:the )?cables?|cable drums?|drums? of cable)\b/i.test(task) && ELECTRICAL_CORE.test(task),
    ictWork: ICT_WORK.test(task),
    securityWork: SECURITY_WORK.test(task),
    ictCabling: ICT_WORK.test(task) && !/\bon the roof\b/i.test(task) && /\b(?:install\w*|pull\w*|run\w*)\b[^.]{0,60}\b(?:cabl\w*|containment|cable trays?|catenary|conduits?)\b/i.test(task),
    fibre: /\b(optical fibre|fibre optic\w*|fibre backbone|fibre cabl\w*|splic\w*)\b/i.test(task),
    commsRoom: ICT_WORK.test(task) && /\b(racks?|cabinets?|ups|batter(?:y|ies))\b/i.test(task),
    securityDevices: SECURITY_WORK.test(task) && /\binstall\w*\b/i.test(task),
    fitOff: /\b(rough[- ]in|fit[- ]off|rewir\w*|run\w* (?:new )?cables?)\b/i.test(task) && ELECTRICAL_CORE.test(task),
    // Isolation steps for any work on the installation; commissioning only for the
    // permanent main switchboard and consumer mains, not construction power.
    isolation: SWITCHBOARD_WORK.test(task) || TEMP_POWER.test(task) || (/\b(rough[- ]in|fit[- ]off)\b/i.test(task) && ELECTRICAL_CORE.test(task)),
    commissioning: /\b(main switchboards?|consumer mains|commission\w*)\b/i.test(task) && ELECTRICAL_CORE.test(task) && !TEMP_POWER.test(task),
    deck: deckLaying(task),
    ewp: /\b(elevating work platforms?|ewps?|boom lifts?|scissor lifts?)\b/i.test(combinedFacts(task, facts)),
    precast: isPanelLift(task),
    asbestos: /\basbestos\b/i.test(task),
    asbestosCheck: asbestosLikely(task) && !/\basbestos\b/i.test(task),
    stripOut: /\b(strip\w* out|rip\w* out|strip\w* (?:the )?(?:old )?(?:bathroom|kitchen|laundry|room|ensuite|tiles?)|demolish\w* (?:the )?(?:bathroom|kitchen|laundry|walls?|tiles?)|remov\w* (?:the )?(?:\w+ )?(?:wall and floor tiles|floor tiles|wall tiles|vanit\w*|old cabinets?))\b/i.test(task) && !BULK_EXCAVATION.test(task) && !FORMWORK.test(task),
    deckBuild: /\b(timber decks?|decking boards?|pergolas?|verandahs?|patios?|(?:back|front|outdoor|house|garden|pool) decks?|decks? (?:at|on|for) (?:the )?(?:back|front) of (?:a|the) (?:house|home))\b/i.test(task) && /\b(build\w*|construct\w*|install\w*|erect\w*|frame\w*)\b/i.test(task),
    roofSpace: /\b(roof spaces?|roof cavit\w*|attics?)\b/i.test(task) || (/\bceiling spaces?\b/i.test(task) && /\b(house|home|dwelling)\b/i.test(task)),
    houseFraming: /\b(wall frames?|roof trusses?|stand\w* (?:the )?frames?|frame\w* (?:a|the) (?:new )?house)\b/i.test(task) && /\b(house|home|timber|dwelling|townhouses?|duplex)\b/i.test(task) && !STEEL_WORK.test(task),
    fenceBuild: /\b(fenc\w*)\b/i.test(task) && /\b(build\w*|post holes?|install\w*|erect\w*)\b/i.test(task) && !/\b(site fenc\w*|temporary fenc\w*|hoardings?)\b/i.test(task),
    confined: /\bconfined space\b/i.test(task) || choiceAnswer('spaceAssessment', facts.spaceAssessment) === 'confined',
    water: mentioned(task, WATER),
    painting: (needsSafetyDataSheet(task) || /\bpaint\w*\b/i.test(task)) && /\b(paint\w*|enamel|coating)\b/i.test(task) && !(/\b(spray\w*|airless)\b/i.test(task) && !/\b(brush\w*|roll(?:er|ers|ing))\b/i.test(task)),
    paintAccess: /\bpaint\w*\b/i.test(task) && /\b(walls?|ceilings?|interior|internal)\b/i.test(task) && !/\b(external\w*|outside|ewps?|elevating work platforms?|boom lifts?|swing stages?)\b/i.test(task),
    paintSolvent: /\b(paint\w*|enamel|coating)\b/i.test(task) && /\b(solvent[- ]based|solvents?|enamel|oil[- ]based|two[- ]pack|2[- ]pack)\b/i.test(task),
    paintSwing: /\bpaint\w*\b/i.test(task) && /\bswing stages?\b/i.test(task),
  };
}

function asSentence(text) {
  const line = cleanLine(text);
  return line && !/[.!?]$/.test(line) ? `${line}.` : line;
}

// Job steps, each with its hazards and controls. Work the library does not know
// gets one middle step built from the task, its hazards and its controls.
function jobStepsForTask(task, facts, hazards, controls, state, extra = {}) {
  const source = acceptedText(combinedFacts(task, facts));
  const factText = (id) => {
    if (['deckMethod', 'energisedWork', 'spaceAssessment', 'refrigerantClass'].includes(id)) return choiceAnswer(id, facts[id]);
    const given = keptFact(facts[id]);
    if (given) return asSentence(given);
    if (id === 'fallControl') return asSentence(fallControlText(source));
    if (id === 'trenchSupport') return asSentence(trenchSupportText(source));
    if (id === 'asbestosArrangement') return asSentence(asbestosArrangement(source));
    return '';
  };
  const [first] = sentences(task);
  return jobStepsFor({ ...workFlags(task, facts, state.ownCrane), ...extra, cite: state.id }, factText, {
    step: asSentence(first || task),
    hazards: hazards.map((row) => `${row.hazard}: ${row.risk}`),
    controls: controls.map((item) => item.text),
  });
}

function stripLiftBleedText(text) {
  const kept = String(text || '')
    .split(/\n+/)
    .map((line) => sentences(line).filter((part) => !LIFT_BLEED.test(part)).join(' '))
    .map((line) => line.trim())
    .filter(Boolean);
  return kept.join('\n');
}

module.exports = {
  isCraneOrLift,
  questionsFor,
  prepareDraft,
  stripLiftBleedText,
  blankName,
  HIERARCHY,
  REVIEW,
};
