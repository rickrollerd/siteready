const { HIERARCHY, SITE_FIELDS, findState, highRiskList } = require('./legislation');
const { jobStepsFor, ppeFor, ACTIVITIES } = require('./activities');
const { tradeIds, allowedKinds, limitToTrades } = require('./trades');
const { registersFor } = require('./register');

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
// Cutting, drilling or fixing into precast already in place ("cut reglet to roof level
// precast") is not precast installation.
function withoutWorkIntoPrecast(text) {
  return String(text || '')
    // An existing tilt-up or precast building is where the work is, not tilt-up work.
    .replace(/\b(?:on|to|of|in|into)\s+(?:an?\s+|the\s+)?(?:existing\s+)?(?:concrete\s+)?(?:tilt-?up|precast)(?:\s+concrete)?\s+(?:warehouses?|buildings?|walls?|factor(?:y|ies)|sheds?|panels?)\b/gi, '')
    .replace(/\b(?:drill\w*|cut\w*|chas\w*|fix\w*|bolt\w*|core\w*)\b[^.]{0,40}?\b(?:to|into|in|through)\s+(?:the\s+)?(?:[\w-]+\s+){0,3}precast\b/gi, '')
    // Handrails, edge protection or brackets fixed to precast already in place.
    .replace(/\b(?:handrails?|guardrails?|edge protection|brackets?)\s+(?:to|on|onto)\s+(?:the\s+)?(?:[\w-]+\s+){0,2}precast(?:\s+[\w-]+)?/gi, '')
    // Conduits and boxes cast into precast units are services work, not precast erection.
    .replace(/\bcast[- ]in(?:to)?\s+(?:the\s+)?precast\s+(?:conduits?|back ?boxes|boxes|services|items|ferrules)\b|\b(?:conduits?|back ?boxes|services)\s+(?:cast\s+)?in(?:to)?\s+(?:the\s+)?precast\b/gi, '')
    // Finishing precast already in place: staining, cleaning, sealing, painting or patching it.
    .replace(/\b(?:stain\w*|clean\w*|seal\w*|paint\w*|patch\w*|coat\w*)\b(?:\s+(?:of|to))?\s+(?:the\s+)?(?:[\w-]+\s+){0,3}precast(?:\s+(?:panels?|units?|walls?|elements?))?/gi, '');
}

function isPanelLift(text) {
  const source = withoutWorkIntoPrecast(text);
  const concrete = /\b(precast|tilt-?up|concrete (?:wall )?panels?)\b/i.test(source);
  // Precast seating tiers sit on rakers: they are not stood up and braced like wall panels.
  if (concrete && !PRECAST_TIER.test(source) && /\b(lift\w*|erect\w*|stand\w*|stood|install\w*|plac\w*|crane\w*)\b/i.test(source)) return true;
  // Crane ties hold a tower crane to the building; they are not a lift.
  return /\bpanels?\b/i.test(source) && /\b(lift\w*|crane\w*)\b/i.test(source.replace(/\bcrane ties?\b/gi, '')) && !FACADE_WORK.test(source) && !/\b(glass balustrades?|balustrades?|shower screens?|glass panels?|membranes?|ptfe|etfe|roof\w*|access panels?|shaft wall|lightweight concrete)\b/i.test(source);
}

// Bulk and detailed excavation of a basement, as opposed to service trenches.
const BULK_EXCAVATION = /\b(bulk excavat\w*|excavat\w* (?:the |a |out the )?basements?|dig\w* (?:out )?(?:a |the )?basements?|detailed excavat\w*|(?:excavat|dig)\w*[^.]{0,30}\b(?:pile caps?|lift pits?))\b/i;

const STEEL_WORK = /\b(structural steel\w*|steelwork|steel[- ]framed (?:carports?|sheds?|buildings?|structures?|balcon(?:y|ies))|(?:hay|machinery|farm|storage|industrial) sheds?|pedestrian bridges?|footbridges?|portal frames?|mezzanine (?:floors?|levels?|decks?)|steel (?:erect\w*|frames?|stairs?|staircases?|mezzanine\w*|purlins?|canop(?:y|ies)|awnings?|platforms?|roof|sheds?|carports?|portal\w*))\b/i;
const MASONRY_WORK = /\b(blockwork|block walls?|block (?:fire |party |retaining )walls?|concrete blocks?|brick up|lintels?|repoint\w*|letterbox\w*|fence piers?|besser blocks?|face bricks?|bricks?(?= (?:walls?|veneer|piers?|for|from|to|barbecues?|bbqs?|fences?|planters?|steps|letterbox\w*))|masonry fences?|block (?:piers?|retaining walls?)|blockwork retaining walls?|blocklay\w*|bricklay\w*|brickwork|brick (?:boundary )?walls?|masonry|core[- ]fill\w*)\b/i;
const PLASTER_WORK = /\b(plasterboard|gyprock|drywall|set(?:ting)? compound\w*|cornices?|suspended (?:grid )?ceilings?|grid ceilings?|ceiling (?:grids?|sheets?|linings?)|plasterers?|sand\w* (?:the )?joints?)\b/i;
const FLOOR_WORK = /\b(carpet\w*|vinyl|rubber floor\w*|floor coverings?|timber floor\w*|engineered timber|floating floors?|levelling compound\w*)\b/i;

const GLAZING_WORK = /\b(glass balustrades?|balustrades?|shower screens?|internal glazing|glass partitions?|mirrors?|mullions?|(?:install|replac|fit|glaz)\w*\b[^.]{0,30}\b(?:windows?|window panes?|glass(?! ?wool| ?fibre)))\b/i;
const STONE_WORK = /\b(benchtops?|stone (?:slabs?|vanit\w*)|splashbacks?)\b/i;

const FIRE_SERVICES = /\b(sprinklers?|hydrants?|fire services?|fire mains?|fire pumps?|fire pipework|fire hose reels?)\b/i;
const LIFT_WORK = /\b(install\w*[^.]{0,30}\blifts?\b(?!\s+pits?)|lift (?:shafts?|wells?|cars?|rails?|motor rooms?|machines?|landing doors?)|car tops?|landing doors?)\b/i;
const PASSIVE_FIRE = /\b(fire stopping|firestopping|fire[- ]stop\w*|passive fire|fire collars?|penetration seal\w*|fire[- ]rated (?:sealants?|mastics?|foams?|batts?)|(?:seal\w*|fill\w*)[^.]{0,30}\b(?:fire ?walls?|fire[- ]rated walls?))\b/i;
const LANDSCAPE = /\b(landscap\w*|planters?|planting|plant\w* (?:\d+ )?(?:new )?trees|green roofs?|roof gardens?|plant (?:a |the )?hedges?|hedges?|mulch|turf|paving|pavers?|irrigation)\b/i;
// Stadium work.
const EARTHWORKS = /\b(cut and fill|bulk earthworks|earthworks|(?:bull)?dozers?|graders?|scrapers?|excavation works? for (?:the )?site|site excavation|backfill\w* and compact\w*|compact\w* (?:the )?subgrades?|grade to level|site cut)\b/i;
const SPORTS_LIGHTING = /\b(sports lighting|floodlights?|light towers?|lighting (?:towers?|frames?|rigs?)|big screens?|video screens?|led screens?(?! on (?:a |the )?(?:building|facade|shop))|scoreboards?)\b/i;
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
// New fibre cement being installed is not asbestos: asbestos products have been banned in Australia since 2003.
const withoutNewMaterial = (text) => String(text || '').replace(/\b(?:install\w*|supply\w*|new|fix\w*|lay\w*)\b[^.]{0,40}?\bfibre[- ]cement\b[^.]*/gi, '');
// Old switchboards often have asbestos backing panels.
// Demolition or strip-out in an existing building needs asbestos identified first (WHS Reg s 450 to s 452).
const asbestosLikely = (text) => (/\b(?:paint\w*|clean\w*|pressure wash\w*|re-?coat\w*)\b[^.]{0,20}\b(?:a |the )?(?:house |existing |old )?roofs?\b/i.test(String(text || '')) && !/\b(colorbond|metal|iron|steel|new|tiled?|tiles)\b/i.test(String(text || '')) && !/\bbuilt (?:in )?(?:200[4-9]|20[1-9]\d)\b/i.test(String(text || ''))) || /\b(replac|remov|chang|upgrad)\w* (?:a |the )?(?:old |existing |residential )?(?:main )?(?:switchboards?|meter (?:box|board|panel)s?)\b/i.test(String(text || '')) || (/\brewir\w*\b/i.test(String(text || '')) && OLDER_BUILDING.test(String(text || ''))) || (/\b(strip[- ]?outs?|demolish\w*|demolition)\b/i.test(String(text || '')) && !/\b(temporary|formwork|falsework|scaffold\w*)\b/i.test(String(text || '')) && !/\bbuilt (?:in )?(?:200[4-9]|20[1-9]\d)\b/i.test(String(text || ''))) || DISTURB.test(String(text || '')) && (ASBESTOS_MATERIAL.test(withoutNewMaterial(text)) || (OLDER_BUILDING.test(String(text || '')) && /\b(walls?|ceilings?|floors?|eaves|roofs?|bathroom|kitchen|laundry|sheets?|linings?)\b/i.test(String(text || ''))));
// Cleaning that is part of another trade's work (cleaning steel free from scale, trade
// cleaning of glazing, cleaning out forms before a pour) is not a cleaning task.
const INCIDENTAL_CLEANING = /\b(?:trade cleaning|cleaning (?:up )?free (?:of|from)|(?:for )?cleaning (?:the )?glass|clean(?:ing)? out\b|cleaning (?:of )?(?:forms|formwork|joints|rebates|surfaces? (?:before|prior))|clean(?:ing)? (?:and|&) prim\w*|initial cleaning)\b[^.,;]*/gi;
const incidentalCleaning = (text) => String(text || '').replace(INCIDENTAL_CLEANING, '');
const CLEANING = /\b(clean\w* (?:the |all )?(?:windows?|glass|glazing|facades?)|builders'? clean|final clean|cleaning|cleaners?|clean (?:a |the )?(?:building )?site|clean\w* [^.]{0,30}practical completion)\b/i;

// Waterproofing membranes.
const WATERPROOFING = /\b(waterproof\w*|(?<!(?:ptfe|etfe|fabric|tensile) )membranes?(?!\s+(?:panels?|roof\w*))|tanking|torch[- ]on)\b/i;

// Floor and wall tiling, not roof tiles.
const TILING_WORK = /\b(re-?til\w*|til(?:e|es|ing|ed)|tilers?|grout\w*|screed\w*)\b/i;
// Structural grouting (post-tensioning ducts, precast bases, anchors) is not tiling.
const isTiling = (text) => TILING_WORK.test(String(text || '').replace(/\broof(?:ing)? tiles?\b/gi, '').replace(/\bgrout\w* (?:the )?(?:\w+ )?(?:ducts?|bases?|base ?plates?|anchors?|tendons?|cores?|bars?|piles?|sleeves?|connections?|dowels?|joints? between panels)\b|\b(?:duct|base|non-shrink|structural|anchor) grout\w*\b/gi, ''));

// Carpentry fit-out: internal framing, doors and joinery, not formwork.
const CARPENTRY_WORK = /\b(steel stud\w*|stud (?:walls?|framing)|wall framing|framing|bulkheads?|door frames?|(?<!landing\s)doors?|architraves?|skirtings?|joinery|(?<!(?:comms|communications|data|server|equipment|electrical|racks,?|racks and)\s)cabinets?|vanities|wardrobes?|cabinetry|(?:new |install\w* (?:a |the )?(?:new )?)kitchens?|timber (?:handrails?|screens?|balustrades?)|carpentry|carpenters?)\b/i;

// Piling and foundation work.
const PILING_WORK = /\b(piling|piles?(?!\s+caps?\b)|pile rigs?|piling rigs?|cfa|bored piles?|secant|contiguous pil\w*|pile heads?|pile cages?)\b/i;

// Facade work: unitised curtain wall, glazing and cladding panels, not precast concrete.
const FACADE_RAW = /\b(fa[cç]ades?|curtain wall\w*|unitised|cladding|glazing|glazed|glass panels?|spandrels?|sunshades?)\b/i;
const FACADE_WORK = { test: (text) => FACADE_RAW.test(String(text || '')) && !/\b(glass balustrades?|balustrades?|shower screens?|internal glazing|glass partitions?|mirrors?)\b/i.test(String(text || '')), source: FACADE_RAW.source };

// Concrete mixed on site from bags and barrowed in: no trucks, pumps or plant.
const SMALL_POUR = /\b(bagged concrete|bags? of concrete|concrete bags|wheelbarrows?|barrow\w*|hand[- ]mix\w*|cement mixer|concrete mixer)\b/i;
const VEHICLE_HOIST = /\b(vehicle|car|auto(?:motive)?|two[- ]post|four[- ]post|workshop) hoists?\b/i;
// Removing or cutting into a load-bearing element, or forming an opening or fitting a
// lintel in existing masonry, needs the structure above held up while it is done.
const LOAD_BEARING_REMOVAL = /\b(remov\w*|cut\w*|knock\w* out|tak\w* out|demolish\w*)\b[^.]{0,40}(?<!non-|non )\bload[- ]bearing\b|(?<!non-|non )\bload[- ]bearing (?:walls?|columns?|beams?|piers?)\b[^.]{0,30}\b(remov\w*|cut\w*|openings?)\b/i;
const MASONRY_OPENING = /\b(?:cut\w*|form\w*|mak\w*|creat\w*|new|widen\w*|enlarg\w*)\b[^.]{0,20}\b(?:doorways?|openings?|window openings?)\b[^.]{0,40}\b(?:brick|block|masonry|stone|concrete)\b|\b(?:install\w*|insert\w*|fit\w*|replac\w*)\b[^.]{0,20}\b(?:rusted |steel |new |old )*lintels?\b[^.]{0,60}\b(?:existing|old|brick|block|masonry|above|over)\b/i;
const SUBFLOOR_REPAIR = /\b(?:replac\w*|repair\w*|sister\w*)\b[^.]{0,30}\b(?:rotten |damaged |old )?(?:timber )?(?:floor )?(?:joists?|bearers?)\b/i;
const DEMOLITION = /\b(demolition|demolish\w*|knock(?:ing)? down|pull(?:ing)? down)\b/i;
const ROAD = /\b((?:live|busy|public|main) (?:roads?|streets?)|(?:in|on|under|across|along|beside) (?:a |the )?(?:live |busy |public |council |main |existing |rural |country |local |sealed |gravel |estate )?(?:roads?|streets?|highways?)(?! (?:reserves?|verges?))|(?:road|street|traffic|signalised|busy) intersections?|at (?:a |an |the )?(?:new |busy |major |signalised )?intersections?|traffic lights|traffic signals|over the footpath|footpath closures?|highways?|road\s?works?|street loading zones?|(?:in|from|on) the street|kerbside|traffic control|traffic management|on the road|(?:adjacent to|next to|beside|alongside) (?:a |the )?(?:road|street|highway)|street frontage|open to traffic|live traffic|carriageway|railway|rail corridor|shipping lane|kerbs? and channel|crossovers?|reinstat\w* (?:the )?asphalt|asphalt reinstat\w*)\b/i;
const WATER = /\b(drown(?:ing)?|in or near water|(?:filled|full) (?:swimming )?pools?|pools? (?:that is |is )?(?:filled|full|holding water)|around (?:a |the )?(?:filled |full )?(?:swimming )?pool|(?:into|in) (?:a |the )?(?:swimming )?pool(?![- ]?(?:lights?|lighting|cleaners?|equipment|plant|services|pumps?|filters?|distribution|switchboards?|controllers?|fence|fencing)\b)|(?:over|into|beside|next to) (?:a |the )?(?:tidal )?(?:river|creek|lake|sea|harbour|dam|canal|water)|jetty|wharf|pontoon|boat ramp|sea ?wall)\b/i;

function isScaffoldErection(text) {
  return /\bscaffold\w*\b/i.test(String(text || '').replace(/\bmobile scaffold\w*/gi, '')) && /\b(erect\w*|dismantl\w*|strik\w* (?:the )?scaffold|alter\w*)\b/i.test(text);
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
    // A contract clause about who supplies, installs or signs off edge protection is scope, not a control.
    if (/\bsubcontract(?:or|s)?\b|\bsign[- ]off\b|\bsupply,? (?:and |& ?)?install/i.test(line)) return false;
    // The scaffold being put up is the work, not the control for a fall during that work.
    const scaffoldIsWork = /\bscaffold\w*\b/i.test(line) && /\b(erect\w*|dismantl\w*|strik\w*|alter\w*)\b/i.test(line);
    const pattern = scaffoldIsWork
      ? /\b(do not place a person|stay(?:s|ing)? on the ground|from the ground|edge protection|guard\s?rails?|harness|elevating work platform|\bewp\b|fall arrest|fall prevention|no one (?:goes|works) at|advance guard\s?rail|platform (?:is )?(?:fully )?decked)\b/i
      : /\b(do not place a person|stay(?:s|ing)? on the ground|from the ground|edge protection|guard\s?rails?|harness|scaffold|elevating work platform|\bewp\b|fall arrest|fall prevention|no one (?:goes|works) at)\b/i;
    return pattern.test(line);
  }).map((line) => {
    // A task sentence that only says where the work is done from gives the control,
    // not the whole task: "Lay blockwork from scaffold" becomes the scaffold line.
    const P = '(?:mobile )?scaffold\\w*|scissor lifts?|boom lifts?|ewps?|elevating work platforms?|trestles?(?: scaffolds?)?|work platforms?';
    const from = new RegExp(`\\bfrom (?:an? |the )?((?:${P})(?:(?:,| and| or) (?:an? |the )?(?:${P}))*)\\b`, 'i').exec(line);
    if (from && !/\b(edge protection|guard\s?rails?|harness|fall arrest|fall prevention|no one (?:goes|works) at|do not place a person|from the ground)\b/i.test(line)) return `Work at height is done from the ${from[1].toLowerCase()}.`;
    // A task sentence ("Install roofing, working from the roof with edge protection") gives only its control clause.
    const clause = /^\s*(?:install|lay|fix|erect|build|replac|paint|clean|repair|strip|remov|tile|apply|construct)\w*\b.*?\b((?:with|using|behind|inside)\b[^,.;]*\b(?:edge protection|guard\s?rails?|harness|travel restraint|fall arrest|safety mesh|scaffold\w*)\b[^,.;]*)/i.exec(line);
    if (clause) return `Work at height is done ${clause[1].replace(/\s+$/, '')}.`;
    return line;
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
  while ((match = pattern.exec(String(text || '')))) {
    // "Trenches 1.5 m deep or more are shored" sets a threshold; it does not give the trench's depth.
    if (/^\s*(?:or|and)\s+(?:more|deeper|over|greater)\b/i.test(String(text || '').slice(pattern.lastIndex))) continue;
    depths.push(Number(match[1] || match[2] || match[3]));
  }
  // Millimetres: "400 mm deep".
  const mm = /\b(\d+)\s*mm\s+deep\b|\bdepth of\s+(\d+)\s*mm\b/gi;
  while ((match = mm.exec(String(text || '')))) {
    if (/^\s*(?:or|and)\s+(?:more|deeper|over|greater)\b/i.test(String(text || '').slice(mm.lastIndex))) continue;
    depths.push(Number(match[1] || match[2]) / 1000);
  }
  return depths;
}

// A trench, shaft or tunnel counts unless every stated depth is 1.5 m or less.
function deepExcavation(text) {
  text = String(text || '').replace(/\b(?:lift|riser|service|ventilation|stair)\s+shafts?\b|\bin the shafts\b|\bshaft ?walls?\b/gi, ' ');
  if (LIFT_WORK.test(text)) text = text.replace(/\bshafts?\b/gi, ' ');
  // Trench drains, and cable trenches in a floor, are not excavations.
  text = text.replace(/\btrench (?:drains?|grates?|covers?)\b|\bcable trenches\b|\btrenches in (?:the )?(?:switch|plant|pump|comms) ?rooms?\b/gi, ' ');
  if (/\btunnel\w*\b/i.test(text)) return true;
  if (!/\b(trench\w*|shaft)\b/i.test(text)) {
    // A dig with a stated depth over 1.5 m is a trench or shaft, whatever it is called.
    // Basements and bulk excavation are not trenches or shafts.
    // A pump station wet well is a shaft.
    if (/\b(?:install\w*|construct\w*|build\w*)\b[^.]{0,60}\b(?:pump station )?wet wells?\b/i.test(text)) return true;
    return /\b(sewer\w*|pipe\w*|lines?|pits?|drains?|stormwater|services?|conduits?|cables?|mains?|manholes?|maintenance holes?)\b/i.test(text) && /\b(excavat\w*|dig\w*|lay\w*|connect\w*|install\w*)\b/i.test(text) && !/\b(basements?|bulk excavat\w*|detailed excavat\w*)\b/i.test(text) && trenchDepths(text).some((depth) => depth > 1.5);
  }
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

function highRiskMatches(raw, answer, state) {
  // "Prior to the energisation of a building" is a point in time, not work near energised parts.
  const text = String(raw || '').replace(BUILDING_ENERGISATION, ' ');
  const checks = {
    fall: fallRiskFor(text, answer),
    tower: mentioned(text, /\btelecommunication tower\b/i),
    // Demolishing a whole building takes down its load-bearing parts.
    demolition: mentioned(text, LOAD_BEARING_REMOVAL) || mentioned(text, DEMOLITION) && (mentioned(String(text || '').replace(/\bnon[- ]load[- ]bearing\b/gi, ''), /\b(load-bearing|load bearing|structur\w*)\b/i) || /\bdemolish\w*\b[^.]{0,30}\b(?:garages?|sheds?|houses?|buildings?|dwellings?|granny flats?)\b/i.test(String(text || ''))),
    asbestos: mentioned(text, /\basbestos\b/i),
    // Structural alterations or repairs to an existing structure that need temporary support.
    // Propping and backpropping new formwork and slabs is not an alteration or repair.
    temporary: mentioned(text, /\bstructural alterations?\b/i) || mentioned(text, LOAD_BEARING_REMOVAL) || mentioned(text, MASONRY_OPENING) || mentioned(text, SUBFLOOR_REPAIR) || (mentioned(text, /\b(temporary (?:support|props?)|props?|propping|propped)\b/i) && mentioned(text, /\b(alter\w*|repair\w*|existing|remov\w*|demoli\w*|load[- ]bearing|openings?|underpin\w*)\b/i)),
    confined: mentioned(text, /\bconfined space\b/i),
    trench: deepExcavation(text),
    // Explosive-powered tools are not the use of explosives (Safe Work Australia SWMS guidance).
    explosives: mentioned(String(text || '').replace(/\bexplosive[- ]?(?:powered |power |actuated )?(?:tools?|nail guns?|fixing tools?)\b/gi, ' '), /\bexplosives?\b/i),
    gas: mentioned(text, /\b(gas mains?|pressuri[sz]ed gas|(?:existing |live |natural |reticulated )?gas (?:lines?|pipe\w*|supply|services?|meters?)|connect\w*[^.]{0,30}\bgas\b)\b/i),
    chemicalLine: mentioned(text, /\b(fuel line|refrigerant line|chemical line)\b/i),
    electrical: mentioned(text, /\b(connect\w*[^.]{0,40}\b(?:to|into) (?:the )?(?:electricity )?supply|solar (?:panels?|pv|photovoltaic|arrays?|systems?)|photovoltaic|inverters?|energised|energized|energis(?:e|ing|ation)|overhead (?:power |electric )?lines?|power lines?|live (?:electrical|parts?|switchboards?|circuits?)|(?:energised|energized|live) electrical (?:installations?|services?))\b/i),
    atmosphere: mentioned(text, /\b(flammable atmosphere|contaminated atmosphere)\b/i),
    // Drilling or fixing to precast units already in place is not precast work.
    precast: mentioned(withoutWorkIntoPrecast(text), /\b(tilt-?up|precast)\b/i),
    // Work in a footpath or verge is next to the road it runs beside.
    road: mentioned(text, ROAD) || /\blight rail\b/i.test(String(text || '')) || /\b(in|on|along|across|under) (?:the |a )?(?:council |public )?(?:footpaths?|verges?|road reserves?|nature strips?)\b/i.test(String(text || '')),
    // Trenches and site excavation are dug by machine unless the task says by hand.
    plant: (/\b(excavat\w*|dig\w*)\s+(?:the\s+|all\s+|new\s+|and\s+\w+\s+(?:a\s+|the\s+)?(?:new\s+)?)?(?:\w+\s+)?(?:trench\w*|site|footings?|pits?|basement|swales?|sewer|line|drains?|stormwater|services?|pipes?)\b|\bbulk excavat\w*/i.test(String(text || '')) && !/\b(?:by hand|hand[- ]dig\w*|hand excavat\w*)\b/i.test(String(text || ''))) || mentioned(text, /\b((?:piling|cfa|bored pil\w*|drill(?:ing)?|hdd) rigs?|directional drill\w*|(?:excavator[- ]mounted )?pile croppers?|elevating work platforms?|ewps?|scissor lifts?|boom lifts?|powered mobile plant|concrete pump(?: truck)?s?|pump trucks?|boom pumps?|telehandlers?|excavators?|forklifts?|trucks?|(?<!tower )cranes?(?!\s+(?:company|companies|crew|operators?)\b)|loaders?|liebherr|skid ?steers?|bobcats?|posi-?tracks?|(?:vibrating|smooth drum|padfoot|ride-on|road|compaction) rollers?)\b/i)
      // Concrete trucks come into the work area for every slab, path or driveway pour.
      || (SLAB_GROUND.test(String(text || '')) && !SMALL_POUR.test(String(text || '')) && (/\bpour\w*\b/i.test(String(text || '')) || /\bconcrete\b/i.test(String(text || '')) && /\b(lay\w*|plac\w*|construct\w*|build\w*|install\w*|form\w*)\b/i.test(String(text || ''))))
      // Pavers, rollers and trucks lay asphalt.
      || /\b(?:lay\w*|plac\w*|pav\w*)\b[^.]{0,30}\b(?:asphalt|hotmix|hot mix)\b|\basphalt (?:laying|paving|resurfac\w*|overlay)\b/i.test(String(text || '')),
    temperature: mentioned(text, /\bartificial extremes of temperature\b/i),
    water: mentioned(text, WATER) && !/\b(before the pool is filled|empty pools?|unfilled pools?|pools? (?:is )?not (?:yet )?filled|drained pools?)\b/i.test(String(text || '')),
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
    || (/\b(reo|reinforc\w*|rebar)\b/i.test(source) && /\b(deck|slab)\b/i.test(source) && !(SLAB_GROUND.test(source) && !SUSPENDED.test(source)))
    || (FACADE_WORK.test(source) && /\b((?:floor|mini|spider|crawler) cranes?|monorails?|stillages?)\b/i.test(source))
    || (/\b(ahus?|air handling units?|chillers?|cooling towers?)\b/i.test(source) && /\b(lift\w*|cranes?|land\w*|deliver\w*)\b/i.test(source));
}

// Entering a pit, sump, tank, manhole or sewer.
const ENTERED_SPACE = /\b(?:enter\w*|entry|inside|work in|working in|repair\w*|re-?lin\w*|coat\w*|clean\w*)\b[\w\s,-]{0,40}\b(pits?|sumps?|tanks?|manholes?|maintenance holes?|sewers?|wet wells?)\b/i;
const HOT_WORK = /\b(braz\w*|solder\w*|hot work|gas torch\w*|oxy[- ]?acetylene|(?<!heat |hot air |plastic |poly |vinyl |seam )weld(?:ing|s|ed)?(?! (?:the )?(?:vinyl|seams?|joins)))\b/i;
const PRESSURE_TEST = /\b(pressure test\w*|hydrostatic|pneumatic test\w*|air test\w*)\b/i;
const CORE_DRILL = /\b(core[- ]?drill\w*|coring|core holes?)\b/i;
const SILICA_WORK = /\b(hammer drill\w*|grind\w*[^.]{0,40}\b(?:concrete|footpaths?|paths?|slabs?|pavers?|trip hazards?)\b|drill\w*[^.]{0,40}\b(?:concrete|masonry|blockwork|brick\w*)\b|(?:fram|fix|batten|anchor)\w*[^.]{0,120}\b(?:over|to|into|onto) (?:the )?(?:existing )?(?:blockwork|masonry|brickwork|block walls?|concrete walls?)|cut\w*[^.]{0,40}\b(?:lightweight|aerated|autoclaved aerated) concrete (?:\w+ ){0,2}panels?|(?:concrete|saw)[- ]?cut\w*|wall saw\w*|floor saw\w*|wire saw\w*|cut\w* (?:the )?(?:\w+ )?(?:blocks?|bricks?|benchtops?)|(?:cut|polish)\w*[^.]{0,30}\bbenchtops?|benchtops?\b[^.]{0,60}\b(?:cut|polish|drill)\w*|grind\w* (?:the )?(?:\w+ )?(?:concrete|slabs?|surfaces?|floors?)|cut\w* (?:the )?(?:\w+ )?(?:tiles?|stone|pavers?)|core[- ]?drill\w*|coring|core holes?|chas(?:e|es|ing)|break\w* (?:down )?(?:the )?pile(?: heads?|s)|pile (?:trimming|cropping)|trim\w* (?:the )?piles?|crop\w* (?:the )?piles?|drill\w* (?:into )?(?:the )?(?:post-tensioned |pt |suspended )?(?:concrete|masonry|blockwork|block walls?|slabs?|tiled walls?|tiles?)|drill\w* (?:into )?(?:the )?(?:precast )?(?:concrete )?(?:seating )?(?:tiers?|treads?))\b/i;

const TEMP_POWER = /\b(construction (?:power|wiring|lighting)|temporary (?:power|lighting|supply|electrical (?:distribution|supply|boards?|installations?))|site (?:switchboards?|power|lighting)|builders'? (?:power|supply))\b/i;

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
const ELECTRICAL_RAW = /\b(electrician|electrical|wiring|rewir\w*|exit signs?|emergency light\w*|downlights?|led (?:strip )?light\w*|(?:led )?high ?bays?(?: lights?)?|(?:install\w*|replac\w*) (?:a |an |the )?(?:new )?(?:[\w-]+ ){0,4}(?:control panels?|sub-?boards?)|(?:install\w*|replac\w*) (?:\w+ ){0,3}lights\b|(?:electric|induction) (?:stoves?|cooktops?|ovens?)|strip lighting|underfloor heating|heating cables?|switchboards?|distribution boards?|consumer mains|cabl\w*|circuits?|conduits?|light fittings?|floodlights?|ceiling fans?|ev chargers?|light switch(?:es)?|hardwired smoke alarms?|install\w* (?:\w+ )?lighting|lights? fittings?|power points?|busduct|construction (?:power|wiring)|temporary (?:power|lighting))\b/i;
// Communications and security cabling is extra low voltage work by registered cablers
// and security installers, so it is electrical work only when power words are used too.
const ICT_WORK = /\b(data cabl\w*|data points?|data networks?|network cabl\w*|comms|communications|telecommunications|ict|structured cabling|optical fibre|fibre optic\w*|fibre(?![- ]?(?:cement|glass|board|reinforced|optic))|cat ?6a?|cctv|access control|intercoms?|security (?:systems?|cameras?|equipment)|card readers?|nbn|wireless access points?|matv|antennas?|nurse call|pabx|ip telephony|(?:tele)?phone systems?|handsets?|phone points?|server racks?|comms racks?)\b/i;
const SECURITY_WORK = /\b(cctv|access control|electronic (?:door )?lock\w*|door locking systems?|intercoms?|security (?:systems?|cameras?|equipment)|card readers?|alarms?|intrusion detect\w*)\b/i;
const POWER_WORDS = /\b(electrician|electrical|switchboards?|distribution boards?|consumer mains|light fittings?|power points?|busduct|construction (?:power|wiring)|temporary (?:power|lighting)|mains power)\b/i;
const ELECTRICAL_CORE = { test: (text) => ELECTRICAL_RAW.test(String(text || '')) && (!ICT_WORK.test(String(text || '')) || POWER_WORDS.test(String(text || ''))) };
const ELECTRICAL_WORK = ELECTRICAL_CORE;
const SWITCHBOARD_WORDS = /\b(main switchboards?|consumer mains|energis\w*|commission\w*|terminat\w*|distribution boards?|(?:replac\w*|upgrad\w*|chang\w*|install\w*) (?:the |a |new )?(?:main )?switchboards?)\b/i;
// "Prior to the energisation of a building" is a point in time, not switchboard work.
const BUILDING_ENERGISATION = /\b(?:prior to|before|after|until) (?:the )?energis\w* of (?:a|the|each) building\b/gi;
const SWITCHBOARD_WORK = { test: (text) => SWITCHBOARD_WORDS.test(String(text || '').replace(BUILDING_ENERGISATION, '')) && ELECTRICAL_CORE.test(String(text || '')) };
// A plumber's work.
// A mechanical (HVAC) contractor's work. Its pipework is not plumbing unless plumbing words are used too.
const MECHANICAL_WORK = /\b(mechanical services|heat recovery ventilat\w*|hrv|erv|ventilation systems?|evaporative coolers?|hvac|ducted (?:gas )?heating|ducted (?:air|systems?)|air[- ]?condition\w*|ductwork|duct(?:ing| runs?| sections?)|refrigerant|refrigeration|split systems?|fan coil units?|fcus?|ahus?|air handling units?|chillers?|cooling towers?|condensers?|condensing units?|jet fans?|exhaust fans?|chilled water|vrf|vrv)\b/i;
const SPLIT_INSTALL = /\binstall\w*\b[^.]{0,40}\bsplit systems?\b/i;
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
    applies: (text) => mentioned(text, /\b(temporary support|propping|propped|structural alteration)\b/i) || mentioned(text, LOAD_BEARING_REMOVAL) || mentioned(text, MASONRY_OPENING) || mentioned(text, SUBFLOOR_REPAIR)
      || (mentioned(text, DEMOLITION) && mentioned(String(text || '').replace(/\bnon[- ]load[- ]bearing\b/gi, ''), /\b(load-bearing|load bearing)\b/i)),
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
    applies: (text) => (MEDICAL_GAS.test(String(text || '')) && /\b(connect\w*|tie[- ]?ins?|live)\b/i.test(String(text || ''))) || /\bshut\s?downs?\b/i.test(String(text || ''))
      // A tie-in or cut-in to a live service, not a painter cutting in or a reo fixer drilling for tie ins.
      || /\b(?:tie|cut)[- ]?ins?\b[^.]{0,40}\b(?:live|existing)\s+(?:\w+\s+)?(?:services?|mains?|supply|supplies|systems?|pipes?|pipework|gas|water|power)\b|\b(?:live|existing)\s+(?:\w+\s+)?(?:services?|mains?|supply|systems?|pipework)\b[^.]{0,40}\b(?:tie|cut)[- ]?ins?\b/i.test(String(text || '')),
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
  return String(task || '').replace(BUILDING_ENERGISATION, ' ').replace(/\b(?:alongside|beside|next to|near|around|with|among|coordinat\w* with)\s+(?:the\s+)?[\w\s,-]{0,60}?\b(?:crews?|trades?|workers|contractors?|subcontractors?|teams?)\b/gi, ' ');
}

// The kinds of work that use each fact in their job steps.
const FACT_KINDS = (() => {
  const map = new Map();
  const walk = (item, when) => {
    if (!item || typeof item !== 'object') return;
    if (item.fact) map.set(item.fact, [...(map.get(item.fact) || []), when]);
    if (item.choice) map.set(item.choice, [...(map.get(item.choice) || []), when]);
    for (const value of Object.values(item.options || {})) (Array.isArray(value) ? value : [value]).forEach((inner) => walk(inner, when));
  };
  for (const activity of ACTIVITIES) for (const step of activity.steps || []) for (const control of step.controls) walk(control, activity.when);
  return map;
})();

// The facts the task needs. With a known trade, a fact used only by other trades'
// kinds of work is not asked ("prepainted steel roof sheeting" does not need a
// steel erection sequence).
function requiredFactsFor(fullTask, answer, state) {
  const facts = [...allRequiredFacts(fullTask, answer, state), ...pickedStepFacts(fullTask, answer, state)];
  const allowed = allowedKinds(state && state.trades);
  if (!allowed) return facts;
  return facts.filter((item) => {
    const kinds = FACT_KINDS.get(item.id);
    return !kinds || kinds.some((when) => allowed.has(when));
  });
}

// Facts a picked job step relies on that the task's words did not call for.
function pickedStepFacts(fullTask, answer, state) {
  if (!state || !state.kinds) return [];
  const added = state.kinds.filter((id) => !suggestedKinds(fullTask, {}, { ...state, kinds: null }).includes(id));
  const asked = new Set(allRequiredFacts(fullTask, answer, state).map((item) => item.id));
  const extra = [];
  if (!asked.has('asbestosArrangement') && pickedDisturbsBuilding(fullTask, state.kinds)) extra.push({ id: 'asbestosArrangement', label: 'Asbestos arrangement', prompt: 'How asbestos was identified before the work (asbestos register or inspection), and what happens if any is found.' });
  if (!added.length) return extra;
  const uses = (id) => (FACT_KINDS.get(id) || []).some((when) => added.includes(when));
  for (const item of CATEGORY_FACTS) {
    if (!asked.has(item.id) && uses(item.id)) extra.push({ id: item.id, label: item.label, prompt: item.prompt, ...(item.choices ? { choices: item.choices } : {}) });
  }
  if (!asked.has('safetyDataSheet') && uses('safetyDataSheet')) extra.push({ id: 'safetyDataSheet', label: 'Safety data sheet', prompt: 'Safety data sheet.' });
  if (!asked.has('trenchSupport') && uses('trenchSupport')) extra.push({ id: 'trenchSupport', label: 'Trench support', prompt: 'How the sides are secured: shoring, benching or battering, and who designed it.' });
  if (!asked.has('fallControl') && uses('fallControl') && fallRiskFor(fullTask, answer)) extra.push({ id: 'fallControl', label: 'Fall control', prompt: 'How a fall is prevented.' });
  return extra;
}

function allRequiredFacts(fullTask, answer, state) {
  const task = ownWork(fullTask);
  const facts = [];
  // Most cranes on site are supplied and run by a crane company. The lifts are its
  // work, under its own lift plan and SWMS, so the subcontractor is asked nothing
  // about them. A subcontractor that runs its own crane gives the crane chart.
  if (isCraneOrLift(task) && state && state.ownCrane) {
    facts.push({
      id: 'craneChart',
      label: 'Crane chart',
      prompt: 'From the crane chart: the rated capacity in tonnes at the working radius in metres.',
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

// The sentences of an answer as rows of the controls table. A sentence that leans on
// the one before ("They are used with good ventilation") stays with it.
function controlRows(text) {
  const rows = [];
  for (const line of sentences(text)) {
    if (rows.length && /^(?:They|Them|It|Its|These|This|Those)\b/.test(line)) rows[rows.length - 1] += ` ${line}`;
    else rows.push(line);
  }
  return rows;
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
      // A steel erector's own riggers sling and direct the steel.
      push('Administrative', STEEL_WORK.test(source) && /\b(erect\w*|portal frames?|columns?|beams?|rafters?|steel frames?|structural steel)\b/i.test(source)
        ? 'The crane company operates the crane under its own lift plan. Our licensed riggers sling and direct the steel.'
        : 'The crane company plans and does the lifts under its own lift plan. Our workers follow the crane crew\'s directions.');
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

  if (/\b(relocat\w*[^.]{0,20}\b(?:houses?|homes?|buildings?|dwellings?|structures?|sheds?|cabins?|demountables?)|house removal|raising (?:a |the )?(?:\w+ )?house|lowering (?:a |the )?(?:\w+ )?house|rais\w* (?:a |the )?queenslander)\b/i.test(source) && !isCraneOrLift(source)) {
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
      for (const line of controlRows(value)) {
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
    for (const line of controlRows(sheet)) {
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
  if (/\b(relocat\w*[^.]{0,20}\b(?:houses?|homes?|buildings?|dwellings?|structures?|sheds?|cabins?|demountables?)|house removal|raising (?:a |the )?(?:\w+ )?house|lowering (?:a |the )?(?:\w+ )?house|rais\w* (?:a |the )?queenslander)\b/i.test(source)) {
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
  for (const id of ['craneChart', 'erectionDesign', 'centreOfGravity', 'braceArrangement', 'safetyDataSheet', 'fallControl', 'asbestosArrangement', 'trenchSupport', ...CATEGORY_FACTS.filter((item) => !item.choices).map((item) => item.id)]) {
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
  // The task's trade, when it is known (from a scope of works), limits its job steps to that trade's work.
  const state = { ...found, ownCrane: craneAnswer(input.crane) === 'own', trades: tradeIds(input.trade), kinds: chosenKinds(input.kinds) };
  if (!state.residentialFallMetres) return state;
  const residential = residentialAnswer(input.residential) === 'yes';
  return { ...state, residential, fallMetres: residential ? state.residentialFallMetres : 2 };
}

function stepPicks(task, facts, state) {
  const suggested = suggestedKinds(task, facts, state);
  const chosen = kindsWithSteps(tradeFlags(task, facts, state));
  return { suggested, chosen, locked: suggested.filter((id) => LOCKED_KINDS.has(id)) };
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
  // Engineered stone: supplying, installing or processing it is prohibited, except
  // removing, repairing, making minor modifications to or disposing of installed stone.
  if (/\bengineered stone\b/i.test(task) && /\b(install\w*|supply\w*|fabricat\w*|manufactur\w*|cut\w*|process\w*|fit\w*|polish\w*)\b/i.test(task) && !/\b(remov\w*|repair\w*|minor modifications?|dispos\w*|existing|already installed|demolish\w*|strip\w*)\b/i.test(task)) {
    return { kind: 'refused', state: state.name, message: 'Supplying, installing or processing engineered stone benchtops, panels or slabs is prohibited under work health and safety law, so SiteReady does not prepare a SWMS for it. Removing, repairing, making minor modifications to or disposing of installed engineered stone is allowed with controls, and the regulator may need to be notified: describe that work instead, or use natural stone or another material.' };
  }
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
    // The job steps found from the task's words, the ones in use, and the ones that cannot be taken off.
    steps: stepPicks(task, input.facts || {}, state),
  };
}

// Details often not known until work starts. They are filled in before the SWMS goes for approval.
const TO_COMPLETE = 'To be completed before submitting for approval';

const NO_STEPS = 'Job steps for this work: SiteReady does not have job steps for this kind of work yet. Pick the job steps that cover the work under Job steps, describe the work in more detail (what is installed, removed or built, and how), or write this SWMS yourself.';

// Main work the library has no steps for yet. Where the task names it and no step
// covers it, the draft is stood down rather than issued with only the access and
// lifting steps around it.
const MAIN_WORK = [
  [/^(?![^]*\bconnect\w*[^.]{0,30}\bto (?:the |an |its )?(?:existing )?solar inverter)[^]*\b(solar (?:panels?|pv|arrays?|systems?)|pv (?:panels?|arrays?|systems?)|inverters?)\b/i, 'solar panel and inverter installation', /\b(solar|inverters?)\b/i],
  [/^(?![^]*\bwith (?:a |an )?(?:heat pump|electric|solar))[^]*\b(gas (?:hot water|appliances?|heaters?|cooktops?|connections?|fitting|lines?)|gasfitt\w*|connect\w*[^.]{0,30}\bgas (?:lines?|supply|mains?))\b/i, 'gas fitting', /\bgas\b/i],
  [/\b(portal frames?|steel (?:frames?|sheds?|structures?)|(?:erect|stand)\w* [^.]{0,20}\b(?:steel|columns|rafters))\b/i, 'steel erection', /\b(Erect and connect steel|Land steel|Erect the pergola, carport or shed frame and roof)\b/],
  [/\bretaining walls?\b/i, 'retaining wall construction', /\bretaining\b/i],
  [/\b(epoxy (?:coat\w*|floor\w*|seal\w*)|(?:apply|applying|seal\w*|coat\w*) [^.]{0,30}\bepoxy|floor coatings?)\b/i, 'floor coating', /\b(epoxy|floor coatings?)\b/i],
  [/\b(grind\w* [^.]{0,20}\bfloors?|floor grind\w*)\b/i, 'floor grinding', /\bgrind floors\b/i],
  [/\bhydro[- ]?demolition\b/i, 'hydro-demolition', /\bhydro/i],
  [/\b(drill\w* and blast\w*|blasting|explosives?|shotfir\w*)\b/i, 'blasting with explosives (licensed shotfirer work)', /\bshotfir/i],
  [/^(?![^]*\b(?:temporary|builder'?s?) (?:power )?poles?\b)[^]*\b(light(?:ing)? poles?|poles?\b[^.]{0,30}\b(?:stand|erect|install)\w*|(?:stand|erect|install)\w* [^.]{0,30}\bpoles?)\b/i, 'pole erection', /\b(poles?|Install security devices)\b/i],
  [/\bcore fill\w*\b/i, 'core filling', /\bcore fill\b/i],
  [/\b(sewer mains?|council mains?|connect\w*[^.]{0,30}\bsewer)\b/i, 'connection to the live sewer', /\bConnect to the live sewer\b/],
  [/\b(?:install|replac|lift|remov)\w*\b[^.]{0,40}\b(?:air ?con\w* units?|rooftop units?|condensers?|package units?)\b/i, 'air conditioning plant installation', /\b(Install plant|Receive plant|Isolate plant|Install ductwork)\b/],
  [/\bdemolish\w*\b[^.]{0,30}\b(?:garages?|sheds?|houses?|buildings?|carports?|decks?|pergolas?|verandahs?|structures?)\b/i, 'demolition of a whole structure', /\bDemolish the structure\b/],
  [/\b(pool shells?|shotcrete|gunite|spray\w* concrete)\b/i, 'pool shell and sprayed concrete work', /\b(shotcrete|sprayed concrete)\b/i],
  [/\b(pressure clean\w*|pressure wash\w*|re-?seal\w*|wash\w* and seal\w*)\b/i, 'pressure cleaning and sealing', /\b(pressure clean|pressure wash|sealer|seal floor joints)/i],
  [/\bpergolas?\b/i, 'pergola work', /\b(pergola|footings?|post holes?|shallow trench|Dig)\b/i],
  [/\bline marking\b/i, 'line marking', /\bline marking\b/i],
  [/\btank stands?\b/i, 'tank stand construction', /\btank stand\b/i],
  [/\b(?:home |house |solar |storage |lithium )batter(?:y|ies)\b|\bbatter(?:y|ies)\b[^.]{0,30}\b(?:solar|garage wall|house wall)\b/i, 'battery storage installation', /\bbattery\b/i],
  [/\bmeter (?:box|board|panel)s?\b/i, 'meter box installation', /\bmeter box\b/i],
  [/\broof battens?\b|\bbattens?\b[^.]{0,20}\broofs?\b/i, 'roof batten installation', /\bbatten/i],
  [/\b(?:carports?|sheds?|awnings?|pergolas?|verandahs?)\b[^.]{0,30}\b(?:frame )?(?:and|with) (?:the |a )?roof\b|\bframe and roof\b/i, 'roof sheeting on the new structure', /\b(Fix new roofing|frame and roof)\b/],
  [/\b(?:excavat|dig)\w*\b[^.]{0,30}\b(?:swimming )?pools?\b/i, 'pool excavation', /\bBulk excavate\b/],
  [/\bgarden taps?\b|\b(?:pipe|tap)s?\b[^.]{0,20}\b(?:in|across|under) (?:a |the )?(?:backyard|yard|garden|lawn)\b/i, 'laying pipe in the ground', /\b(Lay pipes|Excavate|shallow trench)\b/],
  [/\bre-?til\w*\b/i, 'removing the old tiles', /\bStrip out the room\b/],
  [/\b(?:membranes?|waterproof\w*|tanking)\b[^.]{0,60}\b(?:before backfill\w*|outside (?:face )?(?:of )?(?:the )?basement walls?|external face|back of (?:the )?retaining walls?)\b/i, 'membrane work inside an excavation', /\b(Work in the trench|Waterproof walls below ground)\b/],
  [/\b(?:replac|chang|clean)\w* [^.]{0,20}\bfilters?\b/i, 'filter replacement', /\bfilters?\b/i],
  [/\bunderground power\b|\bpower (?:supply )?to (?:a |the )?(?:granny flat|shed|garage|outbuilding|pool|pump)/i, 'connecting the new supply', /\b(Isolate and prove|Test, connect|Rough-in and fit-off)\b/],
  // A grid with plasterboard sheets has its steps; a grid with ceiling tiles does not yet.
  [/^(?![^]*\b(?:plasterboard|gyprock|drywall|sheets?)\b)[^]*\b(?:suspended grid ceilings?|grid ceilings?|ceiling grids?|ceiling tiles?)\b/i, 'suspended grid ceiling installation', /\bgrid\b/i],
  [/\bremov\w*\b[^.]{0,30}\b(?:concrete |old |underground )*(?:water |fuel |septic )?tanks?\b/i, 'tank removal', /\b(Remove the (?:fuel )?tanks?|Cut steel with oxy)/],
  [/\b(sand\w* and (?:polish|coat|seal)\w*|floor sand\w*)\b/i, 'floor sanding and coating', /\b(floor sanding|Sand and coat|Sand and finish timber floors|grind floors)\b/i],
  [/\b(?:install|erect|assembl|build)\w*\s+(?:an? |the )?(?:new )?(?:(?:garden|kit|colorbond|steel|metal)\s+)+sheds?\b/i, 'shed kit assembly', /\b(shed kit|shed frame)\b/i],
  [/\bbollards?\b/i, 'bollard installation', /\bbollards\b/i],
  [/\bexhaust fans?\b[^.]{0,40}\b(?:ceilings?|roof spaces?)\b|\b(?:ceilings?|roof spaces?)\b[^.]{0,40}\bexhaust fans?\b/i, 'exhaust fan work in a ceiling', /\bWork in the roof space\b/],
  [/\bremov\w*\b[^.]{0,30}\b(?:split systems?|air ?condition\w*)/i, 'removing the units', /\b(Receive plant|Install ductwork, pipework and units)\b/],
  [/\b(jackhammer\w*|break\w* (?:out|up)|breakers?)\b/i, 'breaking out concrete', /\b(break|Trim pile heads|Demolish|Saw cut)/i],
  [/^(?![^]*\b(?:repoint\w*|sandstone|brick\w*|masonry|stone walls?|render\w*|concrete|retaining walls?|fire ?walls?)\b)[^]*\b(?:patch\w*|repair\w*)\b[^.]{0,30}\b(?:plasterboard|linings?|walls?|ceilings?)\b/i, 'patching linings', /\bCut, set and sand\b/],
  [/\b(underfloor heating|heating cables?|heating mats?)\b/i, 'underfloor heating installation', /\b(heating|Rough-in and fit-off)\b/i],
  [/^\s*(?:install|fix|replac)\w*\s+(?:[\w-]+\s+){0,3}(?:cladding|weatherboards?)\b/i, 'cladding installation', /\bcladding\b/i],
  [/^\s*install\w*\s+(?:an? |the |new )*(?:passenger |goods )?(?:lifts?|elevators?)\b(?! (?:pits?|shafts?|cores?|the|materials|equipment|it|them|panels?|sheets?|landing doors?|doors?))/i, 'lift installation', /\b(Work on the car top|Lift machines, rails|Install the lift rails)\b/],
  [/\btrees?\b[^.]{0,40}\b(cranes?)\b|\bcranes?\b[^.]{0,40}\btrees?\b/i, 'tree removal', /\bRemove trees\b/],
  [/\b(?:replac|fix|repair|re-?bed|repoint|lay|install)\w*\b[^.]{0,30}\b(?:roof tiles?|tiled roofs?|ridge caps?)\b/i, 'tiled roof work', /\btiled roof\b/i],
  [/\b(ev|electric vehicle|car) chargers?\b/i, 'EV charger installation', /\b(Rough-in and fit-off|Test, connect and commission)\b/],
  [/\b(?:lay|install|run)\w*\b[^.]{0,30}\b(?:drainage|drain|sewer|stormwater) (?:lines?|pipes?|pipework)\b/i, 'laying the drainage line', /\b(Lay pipes|Excavate)\b/],
  [/\b(?:install\w*|replac\w*|fit\w*|fix\w*)\b[^.]{0,30}\b(gutters?(?! guards?)|downpipes?)\b/i, 'gutter and downpipe installation', /\b(gutters?|roofing)\b/i],
  [/\b(?:install\w*|replac\w*|fit\w*|fix\w*)\b[^.]{0,30}\b(skylights?|roof windows?)\b/i, 'skylight installation', /\bskylight\b/i],
];

// Work with a hazard of its own that no library step covers. Picking near steps does
// not cover it, so these stay stood down until the library has steps for them.
const HARD_MAIN_WORK = new Set(['hydro-demolition', 'blasting with explosives (licensed shotfirer work)', 'pool shell and sprayed concrete work', 'membrane work inside an excavation']);

// Steps that get people and materials to the work, rather than doing it.
const SUPPORT_STEPS = new Set(['Before starting', 'Finish and clean up', 'Set up traffic management', 'Plan the work near overhead power lines', 'Get onto the roof and set up fall protection', 'Lift equipment and materials to the roof', 'Work with the crane crew during lifts', 'Set up the crane', 'Rig and lift the load', 'Land and release the load', 'Use an elevating work platform', 'Drill or cut concrete, masonry or stone', 'Use power tools', 'Move materials into place', 'Separate plant and people on site', 'Operate small earthmoving plant', 'Reach high walls and ceilings', 'Operate forklifts', 'Work in the roof space', 'Check for asbestos before starting', 'Operate the hoist', 'Load out floors and use loading platforms']);
const MAIN_VERB = /\b(install\w*|erect\w*|connect\w*|build\w*|construct\w*|replac\w*|fit\w*|lay\w*|grind\w*|coat\w*|repair\w*|fix\w*|assembl\w*|weld\w*|clean\w*|paint\w*|patch\w*|sand\w*|polish\w*|remov\w*|dig\w*|demolish\w*|cut\w*)\b/i;

// With job steps picked by the user, the picks say what the main work is, so only a
// task left with nothing but access and lifting steps is stood down. A work step the
// user added counts as main work; an access or lifting step never does.
function missingMainWork(task, steps, added = null) {
  const names = steps.map((step) => step.step);
  const text = names.join('\n');
  for (const [pattern, label, covered] of MAIN_WORK) {
    if ((!added || HARD_MAIN_WORK.has(label)) && pattern.test(task) && !covered.test(text)) return label;
  }
  const own = new Set();
  // Where drilling into concrete is the job itself (anchors, wheel stops, fixings), the drilling step is the main work.
  if (/\b(drill\w*|grind\w*|anchor bolts?|dynabolts?|chemical anchors?)\b/i.test(task)) own.add('Drill or cut concrete, masonry or stone');
  // Spreading gravel or soil with a bobcat is the small plant step's own work.
  if (/\b(bobcats?|skid ?steers?|posi-?tracks?)\b/i.test(task) && /\b(gravel|soil|fill|driveways?|tracks?|level\w*|spread\w*)\b/i.test(task)) own.add('Operate small earthmoving plant');
  const support = new Set([...SUPPORT_STEPS].filter((name) => !own.has(name)));
  if (MAIN_VERB.test(task) && names.length && names.every((name) => support.has(name))) return 'the main work in this task';
  return null;
}

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
    swmsRef: keptFact(input.swmsRef),
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

  const draft = {
    kind: 'draft',
    ...header,
    ...stepsAndPpe(task, facts, hazards, finalControls, state, input),
    references: referencesFor(facts),
    missing: [],
    statement: '',
    // Testing on or near energised parts is high risk construction work, however the task is worded.
    highRisk: highRiskMatches(`${combinedFacts(task, facts)}${choiceAnswer('energisedWork', facts.energisedWork) === 'testing' ? '\nlive electrical' : ''}${choiceAnswer('spaceAssessment', facts.spaceAssessment) === 'confined' ? '\nconfined space' : ''}${TEMP_POWER.test(task) ? '\nwork on or near energised electrical installations (construction power is live once connected)' : ''}${/\b(refrigerat\w* (?:equipment|units?|cabinets?|display)|cool ?rooms?|freezer rooms?)\b/i.test(task) && /\b(install\w*|connect\w*|commission\w*)\b/i.test(task) && !/\b(?:cool ?room|freezer|freezer room) doors?\b/i.test(task) ? '\nwork on or near a refrigerant line (connecting refrigeration equipment)' : ''}${/\b(operation of (?:the )?generators?|load shed\w*|load bank\w*|generators? (?:testing|test runs?|load tests?)|load test\w* (?:the )?generators?)\b/i.test(task) ? '\nwork on or near energised electrical installations (live switching during generator load tests)' : ''}${ICT_WORK.test(task) && /\b(risers?|ceilings?|comms rooms?|ups|card readers?|intercoms?|power supplies)\b/i.test(task) ? '\nwork near energised electrical installations (shared risers, ceilings and equipment)' : ''}${/\b(spray\w*|airless)\b/i.test(task) && /\b(solvent[- ]based|solvents?|two[- ]pack|2[- ]pack)\b/i.test(task) ? '\nflammable atmosphere (spraying solvent-based paint)' : ''}${/\b(service stations?|petrol stations?|fuel sites?|fuel forecourts?)\b/i.test(task) ? '\nwork on or near a fuel line (underground fuel lines and tanks at a fuel site)' : ''}${/\bmeter (?:box|board|panel)s?\b|\b(?:home |house |solar |storage |lithium )batter(?:y|ies)\b|\bbattery (?:storage|systems?)\b/i.test(task) ? '\nwork on or near energised electrical installations (mains or battery terminals stay live)' : ''}${ELECTRICAL_CORE.test(task) && /\b(?:terminat\w*|connect\w*)\b[^.]{0,60}\b(?:existing|main|live) (?:main )?(?:switchboards?|distribution boards?|boards?)\b|\bfrom the main switchboard\b/i.test(task) ? '\nwork near energised electrical installations (existing switchboard)' : ''}${WATERPROOFING.test(task) && /\b(solvent[- ]based|solvents?|two[- ]part|2[- ]part|two[- ]pack|2[- ]pack)\b/i.test(task) ? '\nflammable atmosphere (solvent-based membrane products)' : ''}${BULK_EXCAVATION.test(task) && /\b(contaminat\w*|unknown fill)\b/i.test(task) ? '\nmay disturb asbestos\ncontaminated atmosphere' : ''}${PILING_WORK.test(task) && /\b(bored piles?|open (?:pile )?(?:bores?|holes?)|pile (?:bores?|holes?))\b/i.test(task) ? '\nshaft excavation (open pile bores)' : ''}${PILING_WORK.test(task) && /\b(slurry|bentonite|support fluid|water[- ]filled|groundwater)\b/i.test(task) ? '\nwork in or near water or other liquid that involves a risk of drowning' : ''}${MECHANICAL_WORK.test(task) && /\b(commission\w*|start[- ]?up)\b/i.test(task) ? '\nwork near energised electrical installations (plant being commissioned)' : ''}${REFRIGERANT.test(task) && /\b(pipe\w*|lines?|braz\w*|charg\w*|recover\w*|evacuat\w*|pressure test\w*)\b/i.test(task) ? '\nrefrigerant line' : ''}${['a2l', 'a3'].includes(choiceAnswer('refrigerantClass', facts.refrigerantClass)) ? '\nflammable atmosphere' : ''}${/\b(live sewer|sewer mains?|manholes?|maintenance holes?)\b/i.test(task) ? '\nwork near a confined space (sewer)\ncontaminated atmosphere (sewer gas)' : ''}${asbestosLikely(task) && !/\bno asbestos|asbestos[- ]free|tested negative\b/i.test(combinedFacts(task, facts)) ? '\nlikely to involve the disturbance of asbestos' : ''}${/\b(?:remov\w*|decommission\w*|excavat\w*|pull\w* out|dig\w* (?:up|out))\b[^.]{0,30}\b(?:(?:in-?ground|underground|old) )?(?:fuel|petrol|diesel) tanks?\b|\bunderground (?:fuel |petrol |diesel )?tanks?\b/i.test(task) ? '\ncontaminated or flammable atmosphere (fuel vapour)\nwork on or near a fuel line\npowered mobile plant (excavator)' : ''}${/\b(crash barriers?|guard ?rails?|safety barriers?|wire rope barriers?|w-?beam)\b/i.test(task) && /\b(highways?|roads?|motorways?|freeways?)\b/i.test(task) ? '\npowered mobile plant (post driver)' : ''}${/\b(spray seal\w*|bitumen seal\w*|chip seal\w*)\b/i.test(task) ? '\npowered mobile plant (bitumen sprayer, aggregate spreader and roller)' : ''}${/\bgas\b/i.test(task) && /\b(boilers?|cooktops?|ovens?|stoves?|appliances?|hot water|heaters?|heating|lines?|pipe\w*|fitting|meters?)\b/i.test(task) && /\b(install\w*|replac\w*|relocat\w*|connect\w*|disconnect\w*|fit\w*)\b/i.test(task) && !/\bwith (?:a |an )?(?:heat pump|electric|solar)\b/i.test(task) ? '\nwork on or near pressurised gas piping (gas appliance connection)' : ''}${MEDICAL_GAS.test(task) && /\b(connect\w*|live|tie[- ]?ins?|commission\w*|pressure test\w*|manifolds?)\b/i.test(task) ? '\nwork on or near pressurised gas distribution mains or piping (medical gases)' : ''}${/\b(generators?|fuel (?:lines?|tanks?|systems?)|diesel tanks?)\b/i.test(task) && /\b(install\w*|connect\w*|commission\w*)\b/i.test(task) ? '\nwork on or near a fuel line' : ''}${/\b(alongside|next to|near) (?:an? |the )?operating boilers?\b/i.test(task) || (BOILER.test(task) && /\bcommission\w*\b/i.test(task)) ? '\nartificial extremes of temperature' : ''}${/\b(opening|break\w* through)\b/i.test(task) && /\bwalls?\b/i.test(task) && /\b(load[- ]bearing|propped|propping)\b/i.test(task) ? '\ndemolition of a load-bearing element of the structure' : ''}${FIRE_SERVICES.test(task) && /\b(commission\w*|pump rooms?)\b/i.test(task) ? '\nwork near energised electrical installations (fire pumps and controllers being commissioned)' : ''}${LIFT_WORK.test(task) && /\b(commission\w*|car tops?)\b/i.test(task) ? '\nwork near energised electrical installations (lift being commissioned)' : ''}${LIFT_WORK.test(task) && /\bpits?\b/i.test(task) && !/\b(reo|reinforc\w*|formwork|concrete)\b/i.test(task) ? '\nwork in or near a confined space (lift pit)' : ''}${/\b(concrete cutt\w*|saw[- ]?cut\w*|wall saw\w*|core drill\w*)\b/i.test(task) && /\bwalls?\b/i.test(task) ? '\nwork near energised electrical installations (live wiring may be hidden in walls)' : ''}${/\b(solvent (?:cement|weld\w*)|primers?|solvent[- ]based)\b/i.test(task) && /\b(risers?|basements?|ducts?|pits?|shafts?|ceilings?|plant rooms?)\b/i.test(task) ? '\nflammable atmosphere' : ''}`, pack.fallAnswer, state)
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
  // No job steps for this kind of work: stood down, not issued with generic text.
  const added = state.kinds ? state.kinds.filter((id) => !suggestedKinds(task, facts, { ...state, kinds: null }).includes(id)) : null;
  const mainMissing = missingMainWork(task, draft.jobSteps || [], added);
  // Picks that leave no step of the user's own (only the required ones) are no picks at all.
  const nothingPicked = Boolean(state.kinds) && !state.kinds.length;
  if ((draft.jobSteps || []).some((step) => step.fallback) || mainMissing || nothingPicked) {
    return {
      kind: 'stand-down',
      ...header,
      missing: [!nothingPicked && mainMissing && !(draft.jobSteps || []).some((step) => step.fallback) ? `Job steps for this work: SiteReady does not have job steps for ${mainMissing} yet, only for the access, lifting or other work around it. Pick the job steps that cover the work under Job steps, describe the work in more detail, or write this SWMS yourself.` : NO_STEPS],
      statement: 'This task is stood down. It does not start.',
      method: [], hazards: [], controls: [], site: [], review: '', signed: false, approved: false,
    };
  }
  // Plant, substances, licences, emergency arrangements, sources and a suggested
  // risk rating for each step, worked out from the finished steps.
  const registers = registersFor(draft, input);
  // Where a state lists silica processing as high risk construction work (the ACT), a
  // job step that processes silica brings it, whatever the task's own words.
  if (registers.jobSteps.some((step) => step.hazards.some((line) => /\bsilica\b/i.test(line)))) {
    for (const item of highRiskMatches('cut concrete with a saw', 'no', state).filter((match) => match.check === 'silica')) {
      if (!draft.highRisk.includes(item.label)) draft.highRisk = [...draft.highRisk, item.label];
    }
  }
  // Powered mobile plant the SWMS lists, even where it may be used, brings the s 291 plant item.
  // A plate compactor on a small barrowed pour is not mobile plant moving around the work.
  if (registers.plant.some((item) => /^(Mobile crane|Tower crane|Forklift|Telehandler|Excavator|Skid steer|Concrete placing boom|Roller|Tipper|Piling rig)/.test(item.item) && !(item.item === 'Roller or plate compactor' && SMALL_POUR.test(draft.task || '')))) {
    const plantItem = highRiskMatches('movement of powered mobile plant', 'no', state).map((item) => item.label);
    for (const label of plantItem) if (!draft.highRisk.includes(label)) draft.highRisk = [...draft.highRisk, label];
  }
  return { ...draft, ...registers, ppe: Array.isArray(input.ppe) && input.ppe.length ? draft.ppe : ppeFromRegisters(draft.ppe, registers) };
}

// Gloves for the substances listed, and hearing protection where a step names noise,
// unless the user chose the PPE list.
function ppeFromRegisters(ppe, registers) {
  const add = new Set();
  if (registers.substances.items.some((item) => /^(Cement|Epoxy|Adhesives|Solvents|Cleaning chemicals|Herbicides|Waterproofing|Curing|PVC primer|Bitumen)/.test(item.product))) add.add('gloveChemical');
  if (registers.jobSteps.some((step) => step.hazards.some((line) => /noise/i.test(line)))) add.add('earMuffs');
  if (!add.size) return ppe;
  const ticked = new Set(ppe.flatMap((group) => group.items.filter((item) => item.ticked || add.has(item.id)).map((item) => item.id)));
  if (ticked.has('gloveChemical') || ticked.has('gloveCut')) ticked.delete('gloveGeneral');
  if (ticked.has('earPlugs') && add.has('earMuffs')) ticked.delete('earMuffs');
  return ppe.map((group) => ({ ...group, items: group.items.map((item) => ({ ...item, ticked: ticked.has(item.id) })) }));
}

// The PPE list, then the job steps, which add fit testing when a respirator is ticked.
// Trades whose work is indoors, unless the task says it is outside.
const INDOOR_TRADES = ['flooring', 'doors', 'carpentry', 'plasterboard', 'kitchens', 'security', 'communications'];

function ppeList(task, facts, state, chosen) {
  // Any outdoor part of the task brings sun protection, even with internal work as well.
  const outdoors = /\b(external\w*|outside|outdoors?|roofs?|balcon\w*|eaves|facade)\b/i.test(task) && !/\b(at night|overnight|night ?shifts?)\b/i.test(task);
  const indoorTrade = (state.trades || []).length > 0 && state.trades.every((id) => INDOOR_TRADES.includes(id));
  return ppeFor(
    tradeFlags(task, facts, state),
    chosen,
    // A harness is ticked only where one is used: with fall arrest or restraint, in a boom lift or on a swing stage.
    harnessInUse(combinedFacts(task, facts)),
    /\b(at night|overnight|night ?shifts?)\b/i.test(task) || !outdoors && (indoorTrade || /\b(interior|inside|indoors?|internal|shop|office|bathrooms?|bedrooms?|lounge rooms?|laundr\w*|kitchens?|ensuites?|toilets?|ceilings?|roof spaces?|car parks?|warehouse|switchboards?|plant rooms?|classrooms?|caf(?:e|é)s?|restaurants?|food courts?|corridors?|hallways?|stairwells?|wards?|hospitals?|surgery|surgeries|theatres?|comms rooms?|data centres?|lift shafts?|stair ?lifts?|underfloor|workshops?|church halls?|halls?|aged care|nursing homes?|science labs?|cupboards?|hotel rooms?|laborator\w*|cooktops?|stoves?|ovens?|toilet blocks?|corridors?)\b/i.test(task)),
  );
}

function stepsAndPpe(task, facts, hazards, controls, state, input) {
  const ppe = ppeList(task, facts, state, input.ppe);
  // Energised testing needs arc-rated PPE and insulated gloves (Model Code s 9.5).
  if (!Array.isArray(input.ppe) && choiceAnswer('energisedWork', facts.energisedWork) === 'testing') {
    for (const group of ppe) for (const item of group.items) if (['arcRated', 'gloveInsulated'].includes(item.id)) item.ticked = true;
  }
  const ticked = (ids) => ppe.some((group) => group.items.some((item) => item.ticked && ids.includes(item.id)));
  const tick = (id) => { for (const group of ppe) for (const item of group.items) if (item.id === id) item.ticked = true; };
  let jobSteps = jobStepsForTask(task, facts, hazards, controls, state, { respirator: ticked(['p2', 'halfFace']) });
  // PPE the job steps call for is ticked, so the PPE section and the steps agree.
  // A list the user chose is left as they chose it.
  if (!Array.isArray(input.ppe)) {
    const said = jobSteps.flatMap((step) => step.controls).join('\n');
    if (/\bknee pads?\b/i.test(said)) tick('kneePads');
    if (/\bsunglasses\b/i.test(said)) tick('glassesTinted');
    if (/\buse travel restraint\b/i.test(said)) tick('harness');
    if (/\bheat resistant gloves\b/i.test(said)) tick('gloveWelding');
    if (/\bgumboots\b/i.test(said)) tick('gumboots');
    if (/\bgloves resistant to the product\b|\bchemical resistant gloves\b|\bgloves and eye protection their safety data sheets list\b/i.test(said)) tick('gloveChemical');
    // Done before the sun line below, since it rebuilds the steps.
    if (/\bP2\b|\brespirators?\b/.test(said) && !ticked(['p2', 'halfFace'])) {
      tick('p2');
      // A respirator brings its fit testing line into the steps.
      jobSteps = jobStepsForTask(task, facts, hazards, controls, state, { respirator: true });
    }
    // Outdoor work: sun and heat are controlled where the steps do not already say how.
    if (ticked(['sunscreen']) && !/\bsun protection\b|\bsunscreen\b/i.test(said)) {
      jobSteps[0] = { ...jobSteps[0], hazards: [...jobSteps[0].hazards, 'Heat illness and sunburn working outdoors.'], controls: [...jobSteps[0].controls, 'Sun and heat: hat or brim, long sleeves, sunglasses and SPF 30 or higher sunscreen. Cool drinking water, shade and rest breaks in hot weather.'] };
      tick('sunHat');
      tick('glassesTinted');
    }
    if (/\bhearing protection\b|\bear (?:muffs|plugs)\b/i.test(said) && !ticked(['earPlugs', 'earMuffs'])) tick('earMuffs');
  }
  return { jobSteps, ppe };
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
  ['safetyDataSheet', 'Safety data sheet'],
];

function referencesFor(facts) {
  return REFERENCE_FACTS
    .map(([id, label]) => ({ label, text: keptFact(facts[id]) }))
    .filter((item) => item.text);
}

// The kinds of work in the task, which choose the job steps and the PPE.
const KIND_IDS = [...new Set(ACTIVITIES.map((activity) => activity.when).filter(Boolean))];

// The kinds of work in the task, limited to the task's trades when they are known.
function tradeFlags(task, facts, state) {
  const flags = suggestedFlags(task, facts, state);
  if (!state.kinds) return flags;
  // The job steps the user picked replace the ones found from the words, except the
  // steps the law or the facts call for, which stay.
  const picked = new Set(state.kinds);
  const out = { ...flags };
  for (const id of KIND_IDS) out[id] = picked.has(id) || (LOCKED_KINDS.has(id) && Boolean(flags[id]));
  if (pickedDisturbsBuilding(task, state.kinds)) out.asbestosCheck = true;
  return out;
}

// Job steps that cannot be taken off a task once its words call for them: asbestos,
// isolation, confined spaces, water, traffic, power lines, propping and trench support.
const LOCKED_KINDS = new Set(['asbestosCheck', 'asbestos', 'isolation', 'confined', 'water', 'road', 'power', 'propping', 'trench']);
const KIND_SET = new Set(ACTIVITIES.map((activity) => activity.when).filter(Boolean));

// Picked steps that strip out, demolish or cut into an existing building need asbestos
// identified first (WHS Reg s 450 to s 452), unless the building is from 2004 or later.
const DISTURBING_KINDS = ['stripOut', 'demolition', 'structuralOpening', 'roofStrip'];
function pickedDisturbsBuilding(task, kinds) {
  return Boolean(kinds) && kinds.some((id) => DISTURBING_KINDS.includes(id))
    && !/\b(new|built (?:in )?(?:200[4-9]|20[1-9]\d))\b/i.test(task) && !/\bno asbestos|asbestos[- ]free\b/i.test(task);
}

// The picked job steps from the form: known kinds of work only, or null when none were sent.
function chosenKinds(kinds) {
  if (!Array.isArray(kinds)) return null;
  return [...new Set(kinds.filter((id) => typeof id === 'string' && KIND_SET.has(id)))];
}

// The kinds of work found from the task's words, for the form to show ticked.
function suggestedKinds(task, facts, state) {
  return kindsWithSteps(suggestedFlags(task, facts || {}, state));
}

// The kinds that give job steps: one kind can stand in for another (slab on ground for a pour).
function kindsWithSteps(flags) {
  const found = ACTIVITIES.filter((activity) => flags[activity.when]);
  const replaced = new Set(found.flatMap((activity) => activity.replaces || []));
  return [...new Set(found.map((activity) => activity.when).filter((id) => !replaced.has(id)))];
}

function suggestedFlags(task, facts, state) {
  const flags = limitToTrades(workFlags(task, facts, state.ownCrane), state.trades, KIND_IDS);
  // A cutting step that is not this trade's work is taken out, so drilling and
  // cutting comes back as the general step.
  // Saw cut control joints are covered in the concrete finishing step.
  const jointsOnly = flags.concrete && /\b(control|contraction|expansion) joints?\b/i.test(task) && !/\b(drill\w*|cor(?:e|ing)|chas\w*)\b/i.test(task);
  if (SILICA_WORK.test(task) && !OWN_CUTTING.some((id) => flags[id]) && !jointsOnly) flags.silicaDrill = true;
  // Bollards, stops and humps are fixed by drilling the slab or pavement.
  if (flags.bollards && !OWN_CUTTING.some((id) => flags[id])) flags.silicaDrill = true;
  // A floor is ground or blasted before it is coated.
  if (flags.floorCoating && !/\b(new|freshly poured)\b/i.test(task)) flags.floorGrind = true;
  return flags;
}

// Kinds of work any trade can strike, found from the task's own words, on top of
// the trade kinds below. Drilling or cutting concrete counts only where no other
// cutting step (tiles, masonry, saw cutting, coring, stone, grinding) covers it.
const OWN_CUTTING = ['paving', 'tileCut', 'masonryCut', 'sawCut', 'coreDrill', 'stoneSilica', 'floorGrind', 'wpPrep', 'pileTrim', 'structuralOpening', 'slabGround', 'slabPour'];

// Concrete slabs on the ground: house and ground floor slabs, driveways, paths, kerbs,
// crossovers and pads. With no suspended slab in the task, the ground steps take the
// place of the deck, trench and demolition saw cutting steps.
const SLAB_GROUND = /\b(concrete (?:pads?|troughs?|ramps?|crossovers?|footpaths?|paths?|driveways?)|(?:access |disabled |wheelchair )ramps?|crossovers?|troughs?|slabs? for (?:an? |the )?(?:new )?(?:garden )?(?:sheds?|garages?|carports?|water tanks?|tanks?)|slabs? on ground|slab-on-ground|on-ground slabs?|ground (?:floor )?slabs?|ground bearing slabs?|house slabs?|raft slabs?|waffle (?:pod )?slabs?|garage slabs?|shed slabs?|driveways?|footpaths?|crossovers?|kerbs?|(?:concrete )?paths?|patios?|plinths?|hardstands?|concrete pads?)\b/i;
// Forming or placing concrete: reo on its own is the reo steps.
const CONCRETE_POUR = /\b(concrete|pour\w*|edge forms?|formwork)\b/i;
const SUSPENDED = /\b(suspended|decks?|podium|transfer slabs?|upper (?:floors?|levels?)|level [1-9]\d*|post[- ]?tension\w*|backprop\w*|falsework|soffits?)\b/i;

// True when the text has slab on ground work and no suspended slab.
function groundSlabOnly(text) {
  return SLAB_GROUND.test(text) && CONCRETE_POUR.test(text) && !SUSPENDED.test(text);
}

function slabGroundFlags(text, flags) {
  // A slab named only as a point in time ("after the ground floor slab has been poured") is not slab work.
  const task = String(text || '').replace(/\b(?:after|once|until|before|when|prior to)\b[^.]{0,50}\bslabs?\b[^.]{0,20}?\b(?:has been |have been |is |are )?(?:poured|placed|cast)\b[^.]*/gi, '');
  if (!(SLAB_GROUND.test(task) && CONCRETE_POUR.test(task))) return {};
  // Pavers, or cleaning and sealing an existing slab, is not forming or placing concrete.
  if (/\b(pavers?|paving|pressure clean\w*|clean\w*|re-?seal\w*|seal\w*|grind\w*|polish\w*|bolt\w*|drill\w*|anchor\w*)\b/i.test(task) && !/\b(pour\w*|plac\w* (?:the )?concrete|edge forms?|formwork|new (?:concrete )?(?:slabs?|driveways?|paths?))\b/i.test(task)) return {};
  const only = !SUSPENDED.test(task);
  // With suspended slabs too, the ground steps are added only for the crew forming or placing the concrete.
  if (!only && !flags.concrete && !flags.formwork) return {};
  return {
    // A pour on its own needs only the placing and finishing steps.
    slabGround: only || Boolean(flags.formwork),
    slabPour: only,
    ...(only ? { reo: false, concrete: false, sawCut: false, silicaDrill: false } : {}),
    // Saw cutting control joints is part of the slab steps, not cutting openings.
    ...(/\b(control|contraction|expansion) joints?\b/i.test(task) && !/\b(openings?|demoli\w*|penetrations?|remov\w*)\b/i.test(task) ? { sawCut: false, silicaDrill: false } : {}),
    ...(only && !/\b(trench\w*|pipes?|pipework|stormwater|sewer\w*|conduits?|drain\w*)\b/i.test(task) ? { trench: false } : {}),
    // Edge forms on the ground are part of the slab steps, not deck formwork.
    ...(only ? { formwork: false, propping: false } : {}),
  };
}

function workFlags(fullTask, facts = {}, ownCrane = false) {
  const flags = baseWorkFlags(fullTask, facts, ownCrane);
  const task = ownWork(fullTask);
  const out = {
    ...flags,
    roofAccess: /\b(on (?:the|a) roofs?|roof discharge points?|roof[- ]mounted|roof ?tops?|solar (?:hot water|panels?|collectors?|systems?)|lightning (?:conductors?|protection)|roof (?:cowls?|penetrations?|plant|vents?)|(?:re)?paint\w* (?:the |a )?(?:house |metal |steel |tiled? |iron |shed )?roofs?|roof paint\w*|bird (?:spikes|proofing)|gutter guards?|whirlybirds?|skylights?|(?:roof|ridge|barge|apron|parapet) (?:flashings?|cappings?)|(?:ridge|hip) caps?|deck ?tites?|box gutters?|valley (?:gutters?|irons?|trays?)|above (?:the )?roof|through (?:the )?roof)\b/i.test(task),
    oxyCutting: /\b(oxy(?:-?acetylene)?(?: cutting)?|gas cutting|flame cutting|thermal cutting)\b/i.test(task),
    silicaDrill: SILICA_WORK.test(task) && !OWN_CUTTING.some((id) => flags[id]),
    smallPlant: /\b(skid ?steers?|bobcats?|posi-?tracks?|mini (?:excavators?|loaders?)|tractors?)\b/i.test(task),
    treeRemoval: /\b(remov\w*|fell\w*|cut\w* down)\b[^.]{0,30}\btrees?\b|\btree (?:removal|felling)\b|\bstump (?:grind\w*|removal)\b|\bgrind\w* (?:the )?stumps?\b|\bremov\w* (?:a |the )?hedges?\b/i.test(task),
    groundChemicals: /\b(poison\w*|herbicides?|weed ?killers?|termite (?:treatment|barriers?)|termiticides?|treat\w* the ground)\b/i.test(task),
    waterConnection: /\b(water meters?|backflow (?:devices?|prevent\w*)|water mains?|town mains?|council (?:water )?mains?|incoming water suppl\w*|connect\w* (?:to |the )?(?:incoming |new )?water suppl\w*|water (?:supply )?connections?|(?:main|new) water services?)\b/i.test(task),
    liftCarWork: /\blift cars?\b/i.test(task) && !LIFT_WORK.test(task.replace(/\blift cars?\b/gi, '')),
    asphalt: /\b(asphalt|bitumen seal|hotmix|hot mix|potholes?|cold mix)\b/i.test(task),
    insulation: /\b(insulation|glasswool|glass wool|rockwool|batts)\b/i.test(task) && !MECHANICAL_WORK.test(task) && !/\b(ductwork|pipework|lagging|roof sheet\w*|roofing|membranes?|waterproof\w*)\b/i.test(task),
    doorHang: /\b(door ?frames?|doorsets?|hang\w* (?:the |all )?(?:\w+ ){0,3}doors|(?:install|fix)\w* (?:the |all )?(?:\w+ ){0,3}doors|(?:install|fit|replac)\w* (?:an? |the )(?:[\w-]+ ){0,3}door(?! hardware| and window| protection| seals?| closers?| furniture| handles?))\b/i.test(task) && !/\b(garage|roller|security|screen|fly|landing|shower|glass sliding|sliding glass) doors?\b/i.test(task),
    ...slabGroundFlags(task, flags),
  };
  return settleFlags(out, task);
}

// Where a specific step covers the work, the general step that its words also
// call up is taken out: a shade sail is not a pergola roof, a box gutter is not
// an eaves gutter.
function settleFlags(flags, task) {
  const out = { ...flags };
  const off = (when, ...ids) => { if (when) for (const id of ids) out[id] = false; };
  off(out.trafficSignals, 'fitOff');
  off(out.footingHoles, 'shallowTrench');
  if (out.deckBuild || out.fenceBuild || out.kitStructure || out.shadeSail) out.footingHoles = false;
  if (out.tileRoofStrip && !/\b(metal|colorbond|corrugated|roof(?:ing)? sheet\w*|sheeting)\b/i.test(task)) { out.roofStrip = false; out.roof = false; out.roofAccess = true; }
  off(out.treeOnRoof, 'treeRemoval');
  off(out.flyScreens && !/\b(?:install|replac|fit)\w*[^.]{0,20}\bwindows\b/i.test(task), 'windowInstall');
  off(out.sprayFoam, 'insulation');
  // The insulation step carries the roof space lines when the insulation goes in the roof.
  off(out.insulation && out.roofSpaceWork, 'roofSpace');
  // A sewer connection is dug down to the junction.
  if (out.sewerConnection && !/\b(manholes?|maintenance holes?|inspection openings?)\b/i.test(task)) out.trench = true;
  off(out.precastStair && !/\b(seat\w*|tiers?|rakers?|stands?)\b/i.test(task), 'precastTier');
  off(out.ceilingPipework, 'waterConnection');
  off(out.deckingStuds && !/\b(erect\w*|portal|columns?|rafters?|purlins?)\b/i.test(task), 'steelErect');
  off(out.shadeSail, 'kitStructure');
  off(out.boxGutter, 'gutters');
  off(out.floodClean, 'insulation', 'plasterHeight', 'plasterSheets');
  off(out.wallpaperStrip, 'stripOut');
  off(out.underfloorHeating, 'fitOff');
  off(out.wallDrainage, 'retainingWall');
  off(out.footpathClosure, 'bollards', 'siteEstablish');
  off(out.bmuClean, 'cleaning', 'cleaningHeight');
  off(out.officeStrip, 'stripOut');
  off(out.repointing, 'masonryLay', 'asbestosCheck');
  off(out.splitSystem, 'ductwork');
  // Bagged concrete barrowed in has no trucks, pumps or earthmoving plant.
  off(out.smallPour, 'sitePlant', 'smallPlant', 'earthworks');
  // A non-load-bearing wall is stripped out, not demolished with propping, and not framed.
  if (/\bnon[- ]load[- ]bearing\b/i.test(task)) { out.propping = false; out.structuralOpening = false; if (!/\b(build\w*|install\w*|frame\w*|new)\b/i.test(task)) out.carpFraming = false; }
  // A battery on an existing inverter, or an inverter alone, is not a panel installation.
  if (!out.solarPanels) out.solarPV = out.solarPV && /\b(inverters?|solar)\b/i.test(task);
  // Landing doors alone are not a lift installation; a coolroom door is not the coolroom.
  if (/\blanding doors?\b/i.test(task) && !/\b(lift cars?|rails|machines?|whole lift|new lift)\b/i.test(task)) out.liftInstall = false;
  if (out.coolroomPanels && /\bdoors?\b/i.test(task) && !/\b(panels?|build\w*|erect\w*|construct\w*)\b/i.test(task)) { out.coolroomPanels = false; out.doorHang = true; }
  // Tiles replaced on a tiled roof are not sheet roofing.
  if (out.tiledRoof && !out.tileRoofStrip && !/\b(metal|colorbond|corrugated|roof(?:ing)? sheet\w*|sheeting)\b/i.test(task)) { out.roof = false; out.roofStrip = false; out.safetyMesh = false; out.roofAccess = true; }
  // Gutters on their own are not a re-roof.
  if (out.gutters && !/\b(re-?roof\w*|roof(?:ing)? sheet\w*|roofing|cappings?|flashings?|sarking|decktites?|ridges?)\b/i.test(task)) { out.roof = false; out.roofStrip = false; out.safetyMesh = false; out.roofAccess = true; }
  // A gas line is leak tested with gas or air, not hydrostatically.
  if (/\bgas\b/i.test(task) && !/\b(water|hydraulic|hot water|plumbing)\b/i.test(task)) out.pressureTest = false;
  // A steel handrail is not timber decking.
  if (out.steelHandrail && !/\b(timber|decking|deck boards?|boards|bearers?|piles?)\b/i.test(task)) out.jettyRepair = false;
  // A stair or handrail to a mezzanine is not the mezzanine floor.
  if (out.mezzanineFloor && /\bstairs?\b/i.test(task) && !/\bfloor\b/i.test(task)) { out.mezzanineFloor = false; out.accessSteel = true; }
  off(out.roadBarrier, 'bollards');
  off(out.sprayRoad, 'asphaltLay', 'asphalt');
  off(out.fireAlarm, 'securityDevices');
  if (out.streetLighting) { out.trench = true; out.fitOff = false; out.trafficSignals = true; }
  // A control panel at a pump station is electrical work, not installing the pump.
  if (/\bcontrol (?:panels?|boards?|cabinets?)\b/i.test(task) && !/\b(?:install\w*|replac\w*) (?:a |the )?(?:new )?(?:\w+ )?pumps?\b(?! stations?)/i.test(task)) out.pumpInstall = false;
  // A lead paint job has its own removal step.
  if (out.leadPaint) out.painting = out.painting && /\b(re-?paint\w*|paint (?:the|it)|and paint)\b/i.test(task);
  if (out.tileReplace) out.tileCut = true;
  if (out.platformLift) { out.liftShaft = false; out.liftInstall = false; out.liftCar = false; out.liftLifting = false; }
  if (out.pitLid && !/\b(pipes?|pipework|drains?)\b/i.test(task)) { out.trench = false; out.plumbingWork = false; }
  if (out.subfloorRepair) { out.timberFloor = false; out.propping = false; }
  if (out.boosterInstall) out.fireAtHeight = false;
  if (out.pumpOutLine) { out.pumpInstall = false; out.tankPlace = false; }
  if (/\b(cracked|broken|smashed)\b[^.]{0,20}\b(?:window )?(?:panes?|glass)\b|\bglass panes?\b|\bwindow panes?\b/i.test(task) && !/\bframes?\b/i.test(task)) out.windowInstall = false;
  if (/\b(?:automatic|auto) (?:sliding )?doors?\b/i.test(task) && !/\bwindows?\b/i.test(task)) out.windowInstall = false;
  if (/\bhandrails?\b/i.test(task) && /\bstairs?\b/i.test(task) && !/\b(mezzanine|staircases?|steel stairs?|new stairs?|install\w* (?:a |the )?stairs?)\b/i.test(task)) out.accessSteel = false;
  if (out.lineMarking && !/\b(walls?|ceilings?|doors?|buildings?|houses?)\b/i.test(task)) out.painting = false;
  if (/\bsealers?\b/i.test(task) && !/\b(epoxy|polyurethane|coatings?)\b/i.test(task)) { out.floorCoating = false; out.floorGrind = false; out.pressureClean = true; out.sealing = true; }
  if (out.swale || /\bswales?\b/i.test(task)) { out.earthworks = true; if (!/\b(plant\w*|trees?|turf|mulch|seed\w*)\b/i.test(task)) out.landscape = false; }
  if (out.smallPlant && out.earthworks && !/\b(excavators?|bulk|cut and fill|earthworks?|haul)\b/i.test(task)) out.earthworks = false;
  if (/\b(conduits?|pits?)\b/i.test(task) && !/\bcabl\w*\b/i.test(task) && /\b(nbn|telstra|comms|communications)\b/i.test(task)) { out.ictCabling = false; out.trench = true; }
  if (out.houseWork && out.roofPlant) out.plantLift = false;
  if (out.roofFittings && !/\b(roof(?:ing)? sheet\w*|re-?roof\w*|roofing)\b/i.test(task)) { out.roofStrip = false; out.roof = false; }
  if (out.doorSpring) out.carpentryWork = false;
  if (/\bconstruct\w*[^.]{0,30}\bconcrete (?:water )?tanks?\b/i.test(task)) out.reo = false;
  if (out.passiveFire && /\bceiling spaces?\b/i.test(task)) out.roofSpace = true;
  if (out.ductwork && out.houseWork) out.roofSpace = true;
  if (/\b(sports? (?:fields?|ovals?|grounds?|courts?)|stadiums?)\b/i.test(task) && /\blight\w*\b/i.test(task)) { out.sportsLighting = true; out.fitOff = false; }
  if (/\b(cooktops?|stoves?|ovens?)\b/i.test(task) && /\b(replac\w*|install\w*)\b/i.test(task) && /\b(electric|induction)\b/i.test(task)) out.isolation = true;
  if (/\brewir\w*\b/i.test(task)) out.isolation = true;
  if (/\bgutters?\b/i.test(task) === false && out.drainClear && /\bdownpipes?\b/i.test(task) && /\b(two|three|\d+)[- ]stor(?:e?y|ies)\b/i.test(task)) out.gutterClean = true;
  if (/\bslabs?\b/i.test(task) && /\b(pools?|ground|garden|yards?|driveways?|paths?|patios?)\b/i.test(task) && !/\bsuspended\b/i.test(task)) { out.groundCut = true; out.cutOpening = false; }
  if (/\bconstruct\w*[^.]{0,30}\bconcrete (?:water )?tanks?\b/i.test(task)) { out.groundSlab = true; out.slabGround = true; out.slabPour = true; }
  if (out.ceilingRepair) { out.plasterCeiling = true; out.plasterHeight = true; out.plasterSanding = true; }
  // A ventilation or heat recovery system is ducted.
  if (/\b(heat recovery ventilat\w*|hrv|erv|ventilation systems?)\b/i.test(task) && /\b(install\w*|replac\w*|supply)\b/i.test(task)) out.ductwork = true;
  // Carrier antennas are radio equipment, not customer cabling under the cabling rules.
  if (out.antennaInstall && !/\b(cabl\w*|data|fibre|structured)\b/i.test(task)) out.ictWork = false;
  if (/\boutdoor kitchens?\b/i.test(task)) out.carpJoinery = true;
  if (/\bon (?:a |the )?(?:\w+ )?roofs?\b/i.test(task)) out.roofAccess = true;
  out.handrailReplace = out.steelHandrail && /\b(replac\w*|repair\w*|remov\w*|cut\w* out)\b/i.test(task);
  if (out.spigots) out.silicaDrill = true;
  if (out.tieDowns) out.roofSpace = true;
  // Kerb or path replacement: the replaced thing is the kerb or path itself.
  if (/\b(?:clean|paint)\w* and (?:re-?)?paint\w*\b/i.test(task) && /\b(tanks?|steel|structures?)\b/i.test(task)) out.pressureClean = true;
  // Replacing a damaged kerb, path or driveway section is cut out, formed and poured.
  if (/\b(?:replac\w*|repair\w*|reconstruct\w*)\b (?:a |the )?(?:damaged |broken |cracked |old )?(?:section(?:s)? of (?:the |a )?)?(?:damaged |broken |cracked |concrete )?(?:kerbs?|kerb and channel|footpaths?|driveways?|crossovers?|concrete paths?)\b/i.test(task) && !/\b(pavers?|asphalt|bitumen)\b/i.test(task)) { out.slabGround = true; out.slabPour = true; out.sawCut = true; out.cutOpening = false; }
  // A water service from the meter is laid in a trench.
  if (out.waterConnection && /\b(?:main|new) water services?\b|\bfrom the meter\b/i.test(task)) out.trench = true;
  // Welding steel is hot work, but not pipe brazing.
  off(out.steelWeld && !/\b(braz\w*|solder\w*|pipe\w*)\b/i.test(task), 'hotWork');
  off(out.ceilingGrid && !/\b(plasterboard|gyprock|drywall|sheets?)\b/i.test(task), 'plasterCeiling');
  // A grease trap or pit inside a building goes through the existing slab.
  if (out.tankPlace && /\b(food courts?|inside|existing (?:slab|floor|building)|kitchens?|restaurants?|shops?|basements?)\b/i.test(task)) out.sawCut = true;
  if (out.flyScreens) out.silicaDrill = false;
  off(out.vehicleHoist, 'hoistInstall', 'hoistOperate');
  off(out.underslabDrainage, 'slabGround', 'slabPour', 'trench');
  off(out.wallpaperStrip && !/\b(tiles?|render)\b/i.test(task), 'stripOut');
  // A doorway or lintel in masonry is cut and propped, not a new wall.
  off(out.beamInstall && !/\b(build\w*|lay\w*|brick\w* up|block\w* up|fill\w* in)\b/i.test(task), 'masonryLay');
  return out;
}

function baseWorkFlags(fullTask, facts = {}, ownCrane = false) {
  const task = ownWork(fullTask);
  const scaffold = isScaffoldErection(task);
  // "Before re-roofing" says when the work is done, not that this crew re-roofs.
  const roofTask = task.replace(/\b(?:before|prior to|ahead of|ready for)\s+(?:the\s+)?re-?roof\w*\b/gi, '');
  const pourTask = task.replace(/\battend\w*\b[^.]*\b(?:during|at)\b[^.]*\b(?:concrete (?:placement|plac\w*|pours?)|pours?)\b[^.]*/gi, '').replace(/\b(?:prior to|before|ahead of)\s+(?:the\s+|all\s+)?(?:concrete\s+)?(?:pours?|pouring|placement)\b/gi, '');
  return {
    road: mentioned(task, ROAD) || /\blight rail\b/i.test(task) || /\b(?:footpath|road|lane) closures?\b/i.test(task) || /\b(in|on|along|across|under) (?:the |a )?(?:council |public )?(?:footpaths?|verges?|road reserves?|nature strips?)\b/i.test(task),
    power: mentioned(task, ENERGISED),
    scaffold,
    // Roofing work, not a roof beam or a job under a roof.
    roof: !SPORTS_LIGHTING.test(task) && (/\b(?:frame|clad)\w*,? (?:and )?roof\b|\broof,? (?:and )?(?:clad|line)\b|\breplac\w* (?:the |a )?(?:section of (?:the )?)?(?:\w+ )?roof\b(?! spaces?| cavit\w*| plant| trusses?| beams?| turbines?| vents?| fans?| ventilators?| gutters?)/i.test(roofTask) || /\b(roof(?:ing)? sheet\w*|roofing|re-?roof\w*|re-?sheet\w*|roof tiles?|slate (?:roof\w*|tiles?)|on (?:the|a) roof|roof work|roof repairs?|repair\w* (?:the |a )?(?:\w+ )?roof|ridge capp\w*|ridge caps?|roof flashings?|roof (?:screws|fixings|fasteners)|(?:install|fix|lay)\w* (?:a |the )?(?:new )?(?:colorbond |metal |steel |corrugated )roofs?)\b/i.test(roofTask) || /\b(cappings?|(?:under|over)?flashings?)\b/i.test(roofTask) && /\b(decktites?|sarking|fascias?|ridges?|roof\w*|gutters?)\b/i.test(roofTask)) && !scaffold && !MECHANICAL_WORK.test(roofTask) && !ICT_WORK.test(roofTask) && !WATERPROOFING.test(roofTask),
    // Piling contractors excavate bores and basements, not trenches, unless a trench is named.
    deepTrench: deepExcavation(task),
    trench: (deepExcavation(task) || /\b(excavat(?!ors?\b)\w*|trench\w*)\b/i.test(task) || /\b(?:install\w*|lay\w*|replac\w*|repair\w*)\b[^.]{0,40}\b(?:underground (?:run )?(?:pipework|pipes?|services)|(?:collapsed |broken |damaged |cracked )(?:stormwater|sewer|drainage|water) pipes?|(?:stormwater|sewer|drainage) pipes? \d|water reticulation|pipes? for (?:a |the )?(?:new )?\w+'?s? (?:water|sewer|stormwater|drainage)|(?:pipework|pipes?|mains?|services|conduits?) underground|in-?ground (?:drainage|pipework)|(?:sewer|house|stormwater)(?:\/house)? drainage (?:systems?|lines?)|(?:stormwater|sewer|drainage) (?:pipes?|lines?|mains?)|(?:precast |concrete )?(?:pits?|manholes?)|(?:detention|underground|storage|onsite detention) tanks?|grease traps?|septic (?:tanks?|systems?)|absorption trench\w*|culverts?|culvert pipes?|cattle grids?)\b/i.test(task) && !/\b(?:directional drill\w*|hdd|under ?bor\w*|bored under)\b/i.test(task)) && !((PILING_WORK.test(task) || BULK_EXCAVATION.test(task) || EARTHWORKS.test(task)) && !/\btrench\w*\b/i.test(task)),
    propping: CATEGORY_FACTS.find((item) => item.id === 'temporarySupport').applies(task),
    // Removing old services (pipework, cabling, ductwork) is not building demolition unless the building fabric is named.
    demolition: mentioned(task, DEMOLITION) && !(/\b(?:plant|pipework|pipes|cabling|cables|cable (?:trays?|ladders?)|ductwork|light fittings|services)\b[^.]{0,60}\bto be (?:demolished|removed)\b|\b(?:demoli\w*|remov\w*|strip\w*)\b[^.]{0,60}\b(?:plant|pipework|pipes|cabling|cables|cable (?:trays?|ladders?)|ductwork|light fittings|services)\b/i.test(task) && !/\b(walls?|slabs?|masonry|brick\w*|concrete|structur\w*|roofs?|floors?|ceilings?|partitions?|blockwork|stairs?)\b/i.test(task)),
    craneInterface: isCraneOrLift(task) && !ownCrane,
    towerCrane: ownCrane && /\btower cranes?\b/i.test(task),
    crane: ownCrane && isCraneOrLift(task) && !/\btower cranes?\b/i.test(task),
    loadOut: /\b(load(?:ing)?[- ]?out|loading platforms?|landing platforms?)\b/i.test(task),
    forklift: /\b(forklifts?|telehandlers?)\b/i.test(task),
    formwork: FORMWORK.test(task.replace(new RegExp(JUMPFORM.source, 'gi'), '')),
    reo: /\b(reo|reinforc\w*|rebar|steel fixing)\b/i.test(task),
    ptTendons: PT.test(task) && /\b(place|placing|install\w*|lay\w*|fix\w*)\b/i.test(task) && /\b(ducts?|tendons?|strand)\b/i.test(task),
    // Attending a pour for another trade (keeping reo cover) is not placing the concrete.
    concrete: /\b(cast[- ]in|in[- ]slab)\b/i.test(pourTask) ? /\b(concrete pump\w*|placing boom|pump(?:ing)? concrete)\b/i.test(pourTask) : /\b(concrete pump\w*|placing boom|pump(?:ing)? concrete|pour\w*|(?:plac\w*|finish\w*) (?:and (?:finish\w*|plac\w*) )?(?:the )?concrete|concrete (?:plac\w*|finish\w*))\b/i.test(pourTask),
    stressing: /\b(stress(?:ing)? (?:the )?tendons?|stressing)\b/i.test(task) && !/\bground anchors?\b/i.test(task),
    jumpform: JUMPFORM.test(task),
    ptSlab: PT.test(task) && !/\b(cast[- ]in|in[- ]slab)\b/i.test(task) && !/\bground anchors?\b/i.test(task),
    // Painting or masking around electrical fittings is not electrical work.
    electricalWork: ELECTRICAL_WORK.test(task.replace(/\b(?:around|mask\w*|protect\w*|cut in|clear of)\b[^.]*/gi, '')),
    plumbingWork: isPlumbing(task),
    sewerConnection: /\b(sewer (?:junctions?|connections?|jump-?ups?)|sewer connection|connect\w*[^.]{0,40}\bsewer\b|connect\w* (?:to )?(?:(?:the|a|new) )*(?:council |existing |live )?sewer\w*|connect\w*[^.]{0,40}\b(?:council|sewer) mains?|live sewer|sewer mains?|manholes?|maintenance holes?)\b/i.test(task),
    castInPlumbing: /\b(cast[- ]in|in[- ]slab)\b/i.test(task) && /\b(sleeves?|puddle flanges?|plumbing|drainage|pipes?)\b/i.test(task) && isPlumbing(task),
    coreDrill: CORE_DRILL.test(task),
    // Installing risers or pipework at height, not other work done in the risers.
    hydraulicRisers: isPlumbing(task) && /\binstall\w*\b/i.test(task) && /\b(risers?|stacks?|(?<!maintenance |inspection |access )shafts?|ceilings?|at height)\b/i.test(task) && !/\b(rough[- ]in|fit[- ]off)\b/i.test(task),
    hotWork: HOT_WORK.test(task),
    // Soil and waste pipes are PVC with solvent cement joints as a rule.
    solventCement: /\b(solvent (?:cement|weld\w*)|pvc (?:glue|cement)|pvc pip\w*|soil and waste)\b/i.test(task) || (/\bprimers?\b/i.test(task) && /\b(pvc|pipe\w*)\b/i.test(task)),
    pressureTest: PRESSURE_TEST.test(task),
    hotWater: PRESSURE_TEST.test(task) && /\b(hot water|heat pumps?|boilers?|water heaters?)\b/i.test(task),
    plumbingFitOff: (/\b(rough[- ]in|fit[- ]off)\b/i.test(task) && isPlumbing(task) || /\b(?:replac|install|fit|chang)\w*\b[^.]{0,30}\b(?:mixer taps?|taps?|toilet suites?|toilets?|cisterns?|basins?|sinks?|sink wastes?|vanit(?:y|ies) basins?|shower (?:heads?|roses?|mixers?)|dishwashers?|coffee machines?|water filters?|ice machines?|tapware|vanities)\b/i.test(task) || /\bconnect\w*\b[^.]{0,40}\b(?:dishwashers?|coffee machines?|ice machines?|water filters?|glass ?washers?)\b/i.test(task)) && !/\b(?:install\w*|run\w*|pull\w*)\b[^.]{0,30}\b(?:cables?|circuits?|wiring)\b/i.test(task) || /\b(?:install\w*|replac\w*|fit\w*)\b[^.]{0,30}\b(?:emergency )?(?:eye ?wash\w*|safety showers?|deluge showers?)\b/i.test(task),
    bulkDig: /\b(bulk excavat\w*|excavat\w* (?:the |out the )?basement|dig\w* (?:out )?(?:the |a )?basement)\b/i.test(task),
    anchorsProps: BULK_EXCAVATION.test(task) && /\b(ground anchors?|anchors?|props?|walers?|de-?stress\w*|shoring|soldier piles?|sheet piles?|shotcrete)\b/i.test(task),
    detailDig: /\b(detailed excavat\w*|(?:excavat|dig)\w*[^.]{0,30}\b(?:pile caps?|lift pits?))\b/i.test(task),
    dewatering: BULK_EXCAVATION.test(task) && /\b(dewater\w*|groundwater|pump\w*)\b/i.test(task),
    contaminatedSpoil: BULK_EXCAVATION.test(task) && /\b(contaminat\w*|acid sulfate|unknown fill|fill material|spoil)\b/i.test(task),
    basementEdge: /\b(bulk excavat\w*|excavat\w* (?:the |out the )?basement|dig\w* (?:out )?(?:the |a )?basement)\b/i.test(task),
    neighbours: BULK_EXCAVATION.test(task) && /\b(neighbour\w*|street|footpath|adjacent|adjoining)\b/i.test(task),
    steelWork: STEEL_WORK.test(task),
    steelLift: STEEL_WORK.test(task) && /\b(cranes?|cranage|lift\w*|land\w*)\b/i.test(task),
    steelErect: STEEL_WORK.test(task) && /\b(erect\w*|install\w*|connect\w*|bolt\w*|rigg\w*)\b/i.test(task),
    steelWeld: STEEL_WORK.test(task) && /\b(weld\w*)\b/i.test(task),
    masonryWork: MASONRY_WORK.test(task),
    masonryCut: MASONRY_WORK.test(task) && /\b(cut\w*|saws?)\b/i.test(task),
    masonryLay: MASONRY_WORK.test(task) && /\b(lay\w*|build\w*|construct\w*|walls?|brick\w* up|lintels?|piers?|fences?|barbecues?|bbqs?)\b/i.test(task),
    masonryMortar: MASONRY_WORK.test(task) && /\bmortar\b/i.test(task) && !/\b(grout\w*|core[- ]fill\w*)\b/i.test(task),
    masonryGrout: MASONRY_WORK.test(task) && /\b(grout\w*|core[- ]fill\w*)\b/i.test(task),
    masonryEdge: MASONRY_WORK.test(task) && /\b(slab edges?|edges?|perimeter)\b/i.test(task),
    plasterWork: PLASTER_WORK.test(task),
    plasterSheets: /\bclad,? and line\b|\band line it\b/i.test(task) || PLASTER_WORK.test(task) && /\b(sheets?|fix\w*|hang\w*|install\w*)\b/i.test(task) && !(/\b(ceiling grids?|grid ceilings?|ceiling tiles?)\b/i.test(task) && !/\b(plasterboard|gyprock|drywall|sheets?)\b/i.test(task)),
    plasterHeight: PLASTER_WORK.test(task),
    plasterCeiling: PLASTER_WORK.test(task) && /\b(ceiling (?:grids?|sheets?|linings?)|suspended ceilings?|ceiling (?:plasterboard|gyprock|drywall)|(?:plasterboard|gyprock|drywall) ceiling\w*|suspended (?:grid )?ceilings?|grid ceilings?)\b/i.test(task),
    plasterSanding: PLASTER_WORK.test(task) && /\b(sand\w*|set\w*|cut\w*|stopping)\b/i.test(task),
    paintSpray: /\b(paint\w*|coating)\b/i.test(task) && /\b(spray\w*|airless)\b/i.test(task),
    paintExternal: /\b(?:re)?paint\w*\b/i.test(task) && /\b(external\w*|exterior|outside|facade|fa[cç]ade|ewps?|elevating work platforms?|boom lifts?|eaves|fascias?|on (?:a |the )?\d+ ?m (?:stand|tower)|water towers?|tank stands?|towers?)\b/i.test(task),
    floorWork: FLOOR_WORK.test(task),
    floorGrind: (FLOOR_WORK.test(task) && /\b(grind\w*|prepar\w*)\b/i.test(task)) || /\b(?:sand\w* and )?polish\w* (?:the )?concrete\b/i.test(task) || /\b(?:grind\w*|polish\w*|shot ?blast\w*)\b[^.]{0,30}\b(?:concrete|slab) floors?\b|\b(?:concrete|slab) floors?\b[^.]{0,20}\b(?:grind\w*|polish\w*)\b/i.test(task),
    floorAdhesive: FLOOR_WORK.test(task) && /\b(adhesives?|glue\w*)\b/i.test(task),
    floorLevel: FLOOR_WORK.test(task) && /\b(levell\w*|primers?|screed\w*|skim\w*|float\w* (?:the )?(?:sub)?floors?)\b/i.test(task),
    timberFloor: /\b(timber floor\w*|engineered timber|floating (?:floors?|floorboards?)|hybrid flooring|laminate flooring)\b/i.test(task),
    floorLay: /\b(carpet\w*|vinyl|floor coverings?|rubber (?:flooring|floors?|tiles?|matting)|linoleum|lino)\b/i.test(task) && /\b(lay\w*|install\w*|fit\w*|replac\w*|supply and)\b/i.test(task) && !/\bstrip\w* out\b/i.test(task),
    waterproofing: WATERPROOFING.test(task),
    wpPrep: WATERPROOFING.test(task) && /\b(grind\w*|prepar\w*|scabbl\w*)\b/i.test(task),
    wpLiquid: WATERPROOFING.test(task) && /\b(primers?|liquid|solvents?|polyurethane|apply\w*|brush\w*|roll(?:ed|ing)? on|spray\w*|waterproof (?:the |a |an )?(?:floors?|walls?|shower\w*|bathroom|wet areas?|planters?(?: box(?:es)?)?|balcon\w*|decks?|podiums?|roofs?)|waterproof\w* and (?:re-?)?til\w*)\b/i.test(task) || /\b(?:replac\w*|new|install\w*)\b[^.]{0,20}\bshower (?:bases?|trays?)\b|\bretil\w* (?:the )?shower\b/i.test(task),
    wpTorch: WATERPROOFING.test(task) && /\b(torch[- ]on|torch\w*|bitumen sheet\w*)\b/i.test(task),
    wpEdge: WATERPROOFING.test(task) && /\b(roofs?|podium|balcon\w*|edges?)\b/i.test(task),
    wpRolls: WATERPROOFING.test(task) && /\b(rolls?|sheet membranes?|torch[- ]on)\b/i.test(task),
    tilingWork: isTiling(task),
    // Laying tiles nearly always means cutting some on site.
    tileCut: isTiling(task) && (/\b(cut\w*|grind\w*|saws?)\b/i.test(task) || (/\b(lay\w*|tile|tiles|tiled|tiling|re-?til\w*)\b/i.test(task) && !/\b(carpet|vinyl|rubber|lino\w*) tiles?\b/i.test(task))),
    tileMix: isTiling(task) && /\b(adhesives?|grout\w*|epox\w*|screed\w*|mix\w*|sealers?)\b/i.test(task) || /\bre-?grout\w*|\b(?:seal\w*|re-?seal\w*) (?:a |the )?leaking (?:shower|bath)\w*|\bwithout removing (?:the )?tiles\b/i.test(task),
    tileLay: isTiling(task) && /\b(lay\w*|til(?:e|ing|ed)\b|re-?til\w*|fix\w*|install\w*|replac\w*)\b/i.test(task) && !/\b(carpet|vinyl|rubber|lino\w*) tiles?\b/i.test(task),
    tileEdge: isTiling(task) && /\b(balcon\w*|terraces?|edges?|podium)\b/i.test(task),
    mobileScaffold: /\bmobile scaffold\w*\b/i.test(task) && /\b(erect\w*|assembl\w*|set up|us(?:e|ing)|from)\b/i.test(task),
    hoistInstall: /\b(install\w*|erect\w*|climb\w*|dismantl\w*|jump\w*)\b[^.]{0,40}\b(?:builders'? |personnel (?:and materials )?|materials )?hoists?\b/i.test(task) && !VEHICLE_HOIST.test(task),
    hoistOperate: /\b(operat\w*|run\w*|driv\w*)\b (?:the )?(?:builders'? |personnel (?:and materials )?|materials )?hoists?\b/i.test(task) && !VEHICLE_HOIST.test(task),
    carpentryWork: CARPENTRY_WORK.test(task) && !FORMWORK.test(task),
    carpLoad: CARPENTRY_WORK.test(task) && !FORMWORK.test(task) && /\b(hoists?|deliver\w*|carr\w*|mov\w*|sheets?|joinery|cabinets?)\b/i.test(task),
    carpFraming: CARPENTRY_WORK.test(task) && /\b(steel stud\w*|stud (?:walls?|framing)|wall framing|framing|bulkheads?)\b/i.test(task) && !FORMWORK.test(task),
    carpJoinery: CARPENTRY_WORK.test(task) && !/\bto (?:a |the )?(?:back|front|side) doors?\b/i.test(task) && /\b(door frames?|doors?|joinery|(?<!(?:comms|communications|data|server|equipment|electrical|racks,?|racks and)\s)cabinets?|vanities|wardrobes?|benchtops?|cabinetry|benches|(?:new|install\w*)[^.]{0,10} kitchens?)\b/i.test(task) && !FORMWORK.test(task) && !LIFT_WORK.test(task),
    carpEdge: CARPENTRY_WORK.test(task) && /\b(balcon\w*|voids?|penetrations?|balustrades?|handrails?|open (?:slab )?edges?)\b/i.test(task) && !FORMWORK.test(task),
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
    fireAtHeight: FIRE_SERVICES.test(task) && /\b(install\w*|ceilings?|risers?|at height)\b/i.test(task) && (!/\b(underground|in-?ground|buried)\b/i.test(task) || /\b(ceilings?|risers?|at height)\b/i.test(task)),
    fireGrooving: FIRE_SERVICES.test(task) && /\b(groov\w*|thread\w*|cut\w*)\b/i.test(task),
    fireLive: FIRE_SERVICES.test(task) && /\b(live|isolat\w*|impair\w*|pump rooms?|connect\w*|commission\w*)\b/i.test(task.replace(/\bconnect\w* (?:it )?to (?:the )?(?:town|council|water|authority'?s?) mains?\b/gi, '')),
    liftWork: LIFT_WORK.test(task) && !BULK_EXCAVATION.test(task),
    liftShaft: LIFT_WORK.test(task) && !BULK_EXCAVATION.test(task) && (/\b(shafts?|wells?|landing doors?)\b/i.test(task) || /\b(?:install\w*|supply and install)\b[^.]{0,30}\b(?:passenger |goods |platform )?lifts?\b/i.test(task)) && !/\bstair ?lifts?\b/i.test(task),
    liftLifting: LIFT_WORK.test(task) && !BULK_EXCAVATION.test(task) && /\b(machines?|rails?|motor rooms?|lift\w* (?:the )?(?:machine|equipment))\b/i.test(task),
    liftCar: LIFT_WORK.test(task) && !BULK_EXCAVATION.test(task) && /\b(car tops?|pits?|commission\w*)\b/i.test(task),
    passiveFire: PASSIVE_FIRE.test(task),
    siteEstablish: /\b(hoardings?|gantr(?:y|ies)|site fenc\w*|site sheds?|site establishment|temporary fenc\w*)\b/i.test(task),
    sitePlant: /\b(traffic controllers?|traffic management|site gate|separat\w* (?:plant|people|pedestrians))\b/i.test(task),
    sawCut: /\b(concrete cutt\w*|saw[- ]?cut\w*|wall saw\w*|floor saw\w*|wire saw\w*|cut\w* (?:and remov\w* )?(?:out )?(?:a |the )?(?:existing |old )?(?:concrete )?slabs?)\b/i.test(task),
    // Sections are cut out (an opening), not only reglets, joints or chases cut.
    cutOpening: /\b(?:saw[- ]?cut\w*|cut\w*|wall saw\w*|floor saw\w*|wire saw\w*)\b[^.]{0,60}\b(?:openings?|penetrations?|doorways?|sections?|holes?)\b|\b(?:openings?|penetrations?|doorways?|cut[- ]?outs?|slab cuts?|wall cuts?)\b[^.]{0,30}\b(?:cut\w*|saw\w*|enlarg\w*|form\w*)\b/i.test(task) || !/\b(reglets?|joints?|chas\w*|asphalt|bitumen|pavement|trench\w*)\b/i.test(task),
    landscape: LANDSCAPE.test(task) && /\b(soil|mulch|plant\w*|planters?|landscap\w*|irrigation)\b/i.test(task) || /\b(swales?|rock (?:lining|beaching|armour\w*)|batters? (?:stabilis|protect)\w*)\b/i.test(task),
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
    structuralOpening: (/\b(opening|break\w* through)\b/i.test(task) && /\bwalls?\b/i.test(task) && /\b(load[- ]bearing|propped|propping)\b/i.test(task)) || /\b(?:remov\w*|demolish\w*|knock\w* out)\b[^.]{0,20}\b(?:a |the )?load[- ]bearing walls?\b/i.test(task),
    timberWork: /\b(timber|mdf|joinery|cabinets?|doors?|skirtings?|architraves?)\b/i.test(task),
    carpet: /\bcarpets?\b(?! tiles?)/i.test(task),
    vinylWeld: /\bvinyl\b/i.test(task) && /\bweld\w*\b/i.test(task),
    helipad: HELIPAD.test(task),
    pneumaticTube: PNEUMATIC_TUBE.test(task),
    // Installing generators and fuel systems, not testing or terminating to ones already in.
    generatorPlant: (/\b(?:install\w*|supply and install|new|place\w*|set)\b[^.]{0,40}\b(?:generators?|day tanks?)\b|\bgenerators?\b[^.]{0,30}\binstall\w*/i.test(task) || /\b(?:day tanks?|fuel (?:lines?|tanks?|systems?))\b/i.test(task) && /\bgenerators?\b/i.test(task)),
    // Boilers being installed, not boilers named only as what a supply connects to.
    boilerPlant: /\b(?:install\w*|commission\w*|set\w*|lift\w*|replac\w*|supply and install)\b[^.]{0,40}\b(?:boilers?|pressure vessels?|calorifiers?|steam plant)\b|\b(?:boilers?|pressure vessels?|calorifiers?)\b[^.]{0,30}\b(?:install\w*|commission\w*)\b/i.test(task),
    cleaningStands: CLEANING.test(task) && /\b(stands?|seats?|tiers?|grandstands?|aisles?)\b/i.test(task),
    landscapeLift: LANDSCAPE.test(task) && /\b(soil|mulch|plant\w*|turf|planters?|landscap\w*)\b/i.test(task) && /\b(podium|roofs?|cranes?|hoists?)\b/i.test(task),
    dualLift: /\b(dual lifts?|tandem lifts?|two (?:crawler |mobile )?cranes)\b/i.test(task),
    precastTier: /\bprecast\b/i.test(task) && PRECAST_TIER.test(task) && /\b(install\w*|plac\w*|lift\w*|erect\w*|land\w*)\b/i.test(task),
    safetyNet: /\bsafety nets?\b/i.test(task),
    sportsLighting: SPORTS_LIGHTING.test(task),
    earthworks: EARTHWORKS.test(task) || /\b(?:lay\w*|build\w*|construct\w*|form\w*)\b[^.]{0,30}\bgravel (?:driveways?|roads?|tracks?|hardstands?|pads?|paths?)\b/i.test(task),
    seating: /\b(seats?|chairs?)\b/i.test(task) && /\b(fix\w*|install\w*|bolt\w*|drill\w*)\b/i.test(task),
    paving: /\b(paving|pavers?)\b/i.test(task),
    podiumEdge: LANDSCAPE.test(task) && /\b(podium edges?|edges?)\b/i.test(task),
    cleaning: CLEANING.test(incidentalCleaning(task).replace(/\b(?:robotic |automatic )?(?:pool|robotic) cleaners?\b[^.]*\.?/gi, '')),
    cleaningHeight: CLEANING.test(incidentalCleaning(task)) && /\b(windows?|balcon\w*|glass)\b/i.test(task),
    glazingWork: GLAZING_WORK.test(task),
    balustradeEdge: /\bbalustrad\w*\b/i.test(task) && /\b(balcon\w*|edges?|terraces?|decks?|stairs?|landings?|verandahs?|voids?|mezzanines?)\b/i.test(task),
    glassWind: GLAZING_WORK.test(task) && /\b(balcon\w*|edges?|external|outside|facades?)\b/i.test(task),
    // Queensland's roof space rule is for class 1, 2 and 10a buildings: houses, units and apartments, and their garages and sheds.
    roofSpaceRule: /\b(houses?|homes?|dwellings?|townhouses?|duplex\w*|home units?|unit blocks?|apartments?|flats?|garages?|carports?|sheds?|residential)\b/i.test(task),
    generatorTest: /\b(operation of (?:the )?generators?|load shed\w*|load bank\w*|generators? (?:testing|test runs?|load tests?)|load test\w* (?:the )?generators?)\b/i.test(task),
    serviceLabels: /\b(marking (?:of )?pipes|pipe markers?|colour bands|(?:label\w*|identification) (?:of )?(?:pipes|pipework|ducts|ductwork|services|valves))\b/i.test(task),
    servicesStrip: /\b(?:demoli\w*|remov\w*|strip\w*)\b[^.]{0,60}\b(?:plant|pipework|pipes|cabling|cables|cable (?:trays?|ladders?)|ductwork|light fittings|services)\b|\b(?:plant|pipework|cabling|ductwork|services)\b[^.]{0,60}\bto be (?:demolished|removed)\b/i.test(task),
    hardwareFit: /\b(?:door|window|architectural) hardware\b|\b(?:install|fit)\w*[^.]{0,30}\b(?:hinges|door closers|locksets?|lever sets|cylinders)\b/i.test(task),
    // Work that may go into a roof or ceiling space.
    roofSpaceWork: /\b(roof ?spaces?|ceiling spaces?|ceilings?|attics?|in the roof|downlights?|light fittings?|lighting|rewir\w*|smoke alarms?|ceiling fans?)\b/i.test(task),
    noRoofSpace: !/\b(roof ?spaces?|ceiling spaces?|ceilings?|attics?|in the roof|downlights?|light fittings?|lighting|rewir\w*|smoke alarms?|ceiling fans?)\b/i.test(task),
    steelGrind: /\b(steel|metal|welds?|rust\w*|iron)\b/i.test(task),
    fibreCement: /\b(fibre cement|fc sheet\w*|villaboard|cement sheet\w*|compressed sheet|hebel|aac)\b/i.test(task),
    regletCut: /\breglets?\b/i.test(task),
    replaceAppliance: /\b(replac\w*|old|existing|remov\w*|swap\w*|upgrad\w*|relocat\w*|mov(?:e|ing) (?:the )?(?:gas )?(?:cooktop|oven|heater|appliance))\b/i.test(task),
    ceilingGrid: /\b(suspended (?:grid )?ceilings?|grid ceilings?|ceiling grids?|ceiling tiles?|acoustic (?:ceiling )?panels?)\b/i.test(task) && /\b(install\w*|fit\w*|supply|replac\w*)\b/i.test(task),
    playground: /\b(playground (?:equipment|structures?)|play equipment|softfall|soft fall)\b/i.test(task),
    hddBore: /\b(directional drill\w*|hdd|under ?bor\w*|bored under|thrust bor\w*)\b/i.test(task),
    structureDemolition: /\bdemolish\w*\b[^.]{0,30}\b(?:garages?|sheds?|houses?|buildings?|carports?|decks?|pergolas?|verandahs?|structures?|dwellings?|granny flats?)\b/i.test(task),
    dampers: /\b(smoke|fire) dampers?\b/i.test(task),
    compaction: /\b(compact\w*|rollers?)\b/i.test(task),
    claddingInstall: /\b(?:roof|frame),? (?:and )?clad\b|\bclad(?:,| and) line\b/i.test(task) || /\b(?:install\w*|fix\w*|replac\w*|supply and)\b[^.]{0,40}\b(?:(?:fibre cement|timber|weatherboard|james hardie|composite|external) )?(?:cladding|weatherboards?|hebel (?:panels?|blocks?)|aac panels?)\b/i.test(task) && !/\b(?:unitised|curtain wall|facade panels?|aluminium composite panels?|acp)\b/i.test(task),
    repointing: /\b(repoint\w*|rak\w* out (?:the )?(?:mortar|joints?)|replac\w* (?:the )?(?:old )?mortar|re-?mortar\w*|sandstone (?:repair|restoration))\b/i.test(task),
    fixtures: /\b(?:install\w*|fit\w*|fix\w*)\b[^.]{0,40}\b(?:acoustic (?:wall )?panels? on (?:the )?walls?|wall panels?|grab rails?|handrails?|stair ?lifts?|tactile (?:indicators?|tiles?)|shelving|signage|whiteboards?|mirrors?|toilet partitions?|lockers?)\b/i.test(task),
    accessSteel: /\b(?:install\w*|fit\w*|fix\w*|erect\w*)\b[^.]{0,30}\b(?:access (?:ladders?|platforms?|stairs?)|walkways?|cage ladders?|fixed ladders?|(?:mezzanine |steel )?stairs?(?: and handrails?)?|staircases?|ladders? (?:and |with (?:a )?)?cages?|plant platforms?)\b/i.test(task),
    garageDoor: /\b(?:install\w*|replac\w*|fit\w*)\b[^.]{0,30}\b(?:garage doors?|roller doors?|sectional doors?|roller shutters?)\b/i.test(task),
    anchorInstall: /\b(?:install\w*|fit\w*|certif\w*)\b[^.]{0,30}\b(?:anchor points?|static lines?|lifelines?|roof anchors?|fall arrest (?:systems?|anchors?|points?)|height safety (?:systems?|anchors?))\b/i.test(task),
    jointSealing: /\b(?:seal\w*|re-?seal\w*|fill\w*|caulk\w*|replac\w*)\b[^.]{0,30}\b(?:joints|control joints|expansion joints)\b|\bjoint seal\w*/i.test(task) && /\b(floors?|slabs?|concrete|pavements?|decks?|car parks?)\b/i.test(task),
    pipeRelining: /\b(relin\w*|pipe lining|cured in place|cipp|pipe burst\w*)\b/i.test(task),
    belowGroundWp: /\b(waterproof\w*|tanking|membranes?)\b[^.]{0,40}\b(basement|retaining|below ground|underground)\b[^.]*|\b(basement|retaining) walls?\b[^.]{0,30}\b(waterproof\w*|tanking|membranes?)\b/i.test(task) && !/\b(podium|over (?:a |the )?basement|decks?|roofs?|balcon\w*)\b/i.test(task),
    deckingWork: /\b(decking|deck boards?|timber decks?|bays?|boards?|bearers?|joists?)\b/i.test(task),
    workBoat: /\b(punts?|barges?|work boats?|pontoons?|boats?)\b/i.test(task),
    concreteRepair: /\b(spall\w*|concrete repairs?|repair\w*[^.]{0,30}\bconcrete|(?:epoxy |crack |resin )inject\w*|inject\w*[^.]{0,20}\bcracks?|seal\w* cracks? in (?:a |the )?concrete|break\w* out (?:the )?(?:damaged )?concrete|concrete cancer)\b/i.test(task),
    gasToElectric: /\b(?:replac\w*|swap\w*|chang\w*)\b[^.]*\bgas\b[^.]*\bwith (?:a |an )?(?:heat pump|electric|solar)/i.test(task),
    heatPump: /\bheat pumps?\b/i.test(task),
    oldFloorCoverings: /\b(?:replac\w*|remov\w*|strip\w*|lift\w*)\b[^.]{0,30}\b(?:old |existing )?(?:carpet\w*|vinyl\w*|lino\w*|floor coverings?)\b/i.test(task),
    sprayApply: /\b(spray\w*|airless)\b/i.test(task),
    bmu: /\b(building maintenance units?|bmus?)\b/i.test(task),
    railCorridor: /\b(rail\w*|train lines?|tracks?)\b/i.test(task) && /\b(overpass\w*|bridges?|corridor|over|near|next to|beside)\b/i.test(task),
    vehicleHoist: VEHICLE_HOIST.test(task),
    beamInstall: (/\b(?:install\w*|fit\w*|insert\w*|put in|replac\w*)\b[^.]{0,30}\b(?:new )?(?:steel |lvl |timber |glulam )?(?:beams?|lintels?)\b/i.test(task) && (LOAD_BEARING_REMOVAL.test(task) || /\b(existing|old|brick\w*|openings?|walls?)\b/i.test(task))) || MASONRY_OPENING.test(task),
    underslabDrainage: /\b(sewer\w*|drainage|drains?|waste|stormwater|plumbing)\b[^.]{0,40}\bunder (?:a |the )?(?:new )?(?:house |building )?slabs?\b|\bunder[- ]?slab (?:drainage|plumbing|sewer\w*|pipes?)\b|\b(sewer\w*|drain\w*|waste|plumbing|pipes?)\b[^.]{0,30}\bunder (?:an? |the )?(?:existing )?(?:house |building )?floors?\b/i.test(task),
    trafficSignals: /\btraffic (?:lights|signals?|signal poles?)\b/i.test(task) && /\b(install\w*|replac\w*|erect\w*|new)\b/i.test(task),
    footingHoles: /\b(dig\w*|excavat\w*|auger\w*)\b[^.]{0,20}\b(?:the |new )?(?:footings?|footing holes?|post holes?|pier holes?|holes)\b/i.test(task) && !/\btrench\w*\b/i.test(task),
    tileRoofStrip: /\b(strip\w*|remov\w*|replac\w*)\b[^.]{0,30}\b(?:the )?(?:old )?tiled? roofs?\b|\bre-?(?:tile|batten)\w* (?:the |a )?roof\b/i.test(task),
    treeOnRoof: /\btrees?\b[^.]{0,40}\b(?:on|onto|through|across) (?:a |the )?(?:house |building |shed |garage )?roofs?\b/i.test(task),
    flyScreens: /\b(fly ?screens?|insect screens?|security (?:doors?|screens?)|screen doors?)\b/i.test(task),
    mobileScaffoldErect: /\b(erect\w*|dismantl\w*|assembl\w*|set\w* up)\b[^.]{0,30}\bmobile scaffold|\bmobile scaffold\w*\b[^.]{0,20}\b(erect\w*|dismantl\w*)/i.test(task),
    mezzanineFloor: /\bmezzanines?\b/i.test(task) && /\b(install\w*|build\w*|erect\w*|construct\w*)\b/i.test(task),
    hydroBlast: /\b(hydro[- ]?blast\w*|water[- ]?blast\w*|high pressure water (?:jet\w*|blast\w*)|water jetting)\b/i.test(task),
    sprayFoam: /\bspray\w* (?:polyurethane |pu )?foam\b|\bspray foam\b|\bpolyurethane foam insulation\b/i.test(task),
    precastStair: /\bprecast (?:concrete )?stair\w*\b/i.test(task),
    ceilingPipework: /\b(?:replac\w*|repair\w*|install\w*|re-?pip\w*|run\w*)\b[^.]{0,40}\b(?:copper |water |hot water |cold water )?(?:pipes?|pipework|(?:water )?mains?)\b[^.]{0,20}\bin (?:a |the )?(?:\w+ )?ceilings?\b/i.test(task),
    deckingStuds: /\b(?:metal|steel|composite|bondek|comform)\b[^.]{0,10}\bdecking\b|\bshear studs?\b|\bstud weld\w*/i.test(task),
    shadeSail: /\bshade sails?\b/i.test(task),
    boxGutter: /\bbox gutters?\b/i.test(task),
    torchOn: /\btorch\w*/i.test(task),
    membraneRepair: /\b(repair\w*|patch\w*|fix\w*|leak\w*)\b[^.]{0,30}\b(?:roof |flat roof )?membranes?\b/i.test(task) && /\b(roofs?|decks?|podiums?|balcon\w*)\b/i.test(task),
    meterInstall: /\b(water meters?|backflow (?:prevention )?(?:devices?|valves?|assembl\w*))\b/i.test(task) && /\b(install\w*|replac\w*|fit\w*|new)\b/i.test(task),
    tankPlace: /\b(?:install\w*|place\w*|lay\w*|lower\w*|set\w*)\b[^.]{0,40}\b(?:detention tanks?|storage tanks?|underground tanks?|septic (?:tanks?|systems?)|precast (?:concrete )?(?:pits?|culverts?|units?|manholes?|tanks?)|manholes?|maintenance holes?|wet wells?|grease traps?|interceptor traps?)\b/i.test(task),
    jettyRepair: /\b(jett(?:y|ies)|wharf|wharves|boardwalks?|pontoons?|(?:foot|pedestrian |timber )bridges?|bridge decks?)\b/i.test(task) && /\b(remov\w*|replac\w*|repair\w*|rebuild\w*)\b/i.test(task),
    floodClean: /\bflood\w*\b/i.test(task) && /\b(clean\w*|strip\w*|remov\w*|gut\w*)\b/i.test(task),
    wallpaperStrip: /\b(strip\w*|remov\w*|steam\w*)\b[^.]{0,20}\bwall ?paper\b/i.test(task),
    underfloorHeating: /\bunderfloor heating\b|\bheating (?:cables?|mats?)\b|\bheated floors?\b/i.test(task),
    wallDrainage: /\b(drainage|ag(?:ricultural)? (?:drains?|pipes?)|backfill\w*)\b[^.]{0,40}\bbehind (?:a |the )?(?:new |existing )?(?:\w+ )?(?:retaining )?walls?\b|\bretaining wall drainage\b/i.test(task),
    footpathClosure: /\b(?:footpath|lane|road) closures?\b/i.test(task) && /\b(barriers?|fenc\w*|hoardings?)\b/i.test(task),
    bmuClean: /\b(building maintenance units?|bmus?)\b/i.test(task) && /\bclean\w*\b/i.test(task),
    officeStrip: /\bstrip\w*[- ]?out\b|\bstrip out\b/i.test(task) && /\b(offices?|fit-?outs?|tenanc\w*|shops?|bank\w*|ceilings?|partitions?|retail)\b/i.test(task) && !/\b(bathrooms?|ensuites?|kitchens?|laundr\w*|toilets?)\b/i.test(task),
    coolroomPanels: /\b(cool ?rooms?|freezer rooms?|walk-in (?:freezers?|cool ?rooms?|fridges?)|cold rooms?)\b/i.test(task) && /\b(install\w*|erect\w*|build\w*|construct\w*)\b/i.test(task),
    roofPenetration: /\bthrough (?:the |a )?roof\b|\broof penetrations?\b|\bpenetrat\w* (?:the |a )?roof\b/i.test(task),
    workAbove: /\b(overpass\w*|traffic below|over (?:the |a )?(?:live )?(?:road|traffic|highway|railway|rail line|motorway|freeway)|above (?:the )?(?:road|traffic|railway|rail line))\b/i.test(task),
    electricHeater: !/\b(gas|heat pumps?|solar)\b/i.test(task),
    boardDelivery: /\b(switchboards?|distribution boards?|switchgear|msbs?|main boards?|switchrooms?)\b/i.test(task) && !/\b(houses?|homes?|units?|dwellings?|granny flats?|garages?)\b/i.test(task),
    indoorDig: /\b(food courts?|inside|indoors?|basements?|existing (?:slab|floor|building)|under (?:the )?(?:floor|slab)|kitchens?|restaurants?|shops?)\b/i.test(task),
    gateWork: /\bgates?\b/i.test(task),
    waterproofTile: /\bwaterproof\w* and (?:re-?)?til\w*|\bshower (?:bases?|recess\w*|trays?)\b/i.test(task),
    splitInstall: /\bsplit[- ]systems?\b|\b(?:wall[- ]hung|ductless) (?:air ?con\w*|units?)\b/i.test(task) && /\b(install\w*|replac\w*|fit\w*|supply)\b/i.test(task),
    gateInstall: /\b(boom gates?|automatic gates?|sliding gates?|swing gates?|motorised gates?|gate motors?)\b/i.test(task) && /\b(install\w*|replac\w*|fit\w*|new)\b/i.test(task),
    poolEquipment: /\bpool (?:pumps?|filters?|chlorinators?|equipment)\b/i.test(task) && /\b(install\w*|replac\w*|fit\w*|connect\w*)\b/i.test(task),
    escalatorInstall: /\b(escalators?|moving walkways?|travelators?)\b/i.test(task) && /\b(install\w*|replac\w*|supply)\b/i.test(task),
    tieDowns: /\b(cyclone (?:tie[- ]?downs?|straps?|rods?)|tie[- ]?downs?)\b/i.test(task),
    palletRacking: /\b(pallet racking|racking|shelving systems?)\b/i.test(task) && /\b(install\w*|erect\w*|assembl\w*|relocat\w*|supply)\b/i.test(task),
    antennaInstall: /\b(weather stations?|antennas?|aerials?|mobile phone (?:towers?|base stations?)|telecommunications? (?:equipment|towers?)|5g (?:equipment|antennas?)|satellite dish\w*)\b/i.test(task) && /\b(install\w*|replac\w*|fit\w*|mount\w*)\b/i.test(task),
    smallPour: SMALL_POUR.test(task),
    hvWork: /\b(high voltage|hv|11 ?kv|22 ?kv|33 ?kv|kiosk substations?|transformers?)\b/i.test(task),
    solarPanels: /\b(solar (?:panels?|pv|arrays?|modules?)|pv (?:panels?|arrays?|modules?)|photovoltaic|panels? on the roof)\b/i.test(task),
    subfloor: /\bunder (?:the |a |an )?(?:existing )?(?:house|home|floor|building)\b|\bsub-?floor\b/i.test(task),
    upperFloor: /\b(?:level \d+|(?:first|second|third|fourth|fifth|\d+(?:st|nd|rd|th)) (?:floor|storey)|upper (?:floor|level)s?|balcon\w*)\b/i.test(task),
    childcare: /\b(child ?care|early (?:childhood|learning)|kindergartens?|kindy|preschools?|schools?|aged care|nursing homes?|hospitals?)\b/i.test(task),
    publicSite: /\b(schools?|classrooms?|child ?care|kindergartens?|hospitals?|aged care|nursing homes?|residents?|shopping (?:centres?|centers?)|train stations?|railway stations?|parks?|playgrounds?|libraries|community halls?|churches?|caf(?:e|é)s?|hotels?|motels?|pubs?)\b/i.test(task),
    leadPaint: /\blead(?:[- ]based)? paint\b/i.test(task) && /\b(remov\w*|strip\w*|abrad\w*|sand\w*|scrap\w*)\b/i.test(task),
    stumpOnly: /\bstumps?\b/i.test(task) && !/\b(fell\w*|cut\w* down|trees? (?:removal|felling)|remov\w* (?:the |a |three |two |\w+ )?(?:large |dead |gum )?trees?)\b/i.test(task),
    windowReplace: /\b(?:replac\w*|remov\w*)\b[^.]{0,40}\b(?:old |existing )?(?:aluminium |timber |steel )?(?:windows?|window frames?|frames)\b|\bnew windows?\b[^.]{0,40}\bremov\w*/i.test(task),
    tileReplace: /\b(?:replac\w*|repair\w*)\b[^.]{0,20}\b(?:broken |cracked |damaged |loose )?(?:floor |wall )?tiles?\b/i.test(task) && !/\broof tiles?\b/i.test(task),
    gasRun: /\b(?:run\w*|install\w*|lay\w*|extend\w*)\b[^.]{0,20}\b(?:a |the )?(?:new )?gas (?:lines?|pipes?|pipework|services?)\b/i.test(task),
    gasTest: /\bgas\b/i.test(task) && /\bpressure test\w*|\bleak test\w*|\btest\w* and commission\w*/i.test(task),
    roofExtension: /\b(skillion (?:roofs?|extensions?)|roof extensions?|lean-to\w*|extend\w* (?:the )?roof)\b/i.test(task),
    kitBuild: /\b(kit|colorbond|garden) (?:sheds?|carports?|garages?)\b|\bkit\b/i.test(task),
    tankStand: /\btank stands?\b|\b(?:on|onto) (?:a |the )?(?:\d+ ?m )?(?:steel |timber )?stands?\b/i.test(task),
    signPosts: /\b(sign ?posts?|signs? on posts|pole[- ]mounted signs?|car parks?|carparks?)\b/i.test(task),
    spigots: /\bglass (?:pool )?fenc\w*|\bspigots?\b/i.test(task),
    sprayRoad: /\b(spray seal\w*|bitumen seal\w*|chip seal\w*|bitumen spray\w*)\b/i.test(task),
    roadBarrier: /\b(crash barriers?|guard ?rails?|safety barriers?|wire rope barriers?|w-?beam)\b/i.test(task) && /\b(highways?|roads?|motorways?|freeways?|bridges?)\b/i.test(task),
    streetLighting: /\b(street ?light\w*|public lighting|road lighting)\b/i.test(task),
    fireAlarm: /\b(fire (?:alarm|detection|indicator) (?:systems?|panels?)|fire alarms?|smoke detectors?|thermal detectors?|ewis|occupant warning)\b/i.test(task) && !/\bsmoke alarms?\b/i.test(task),
    steelHandrail: /\b(steel|stainless|galvanised|aluminium|corroded)\b[^.]{0,20}\b(handrails?|railings?|balustrad\w*)\b/i.test(task),
    leadRisk: /\blead\b/i.test(task),
    heavyTimbers: /\b(piles?|bearers?|stringers?|headstocks?)\b/i.test(task),
    timberWall: /\b(sleepers?|timber)\b/i.test(task),
    timberOnlyWall: /\b(sleepers?|timber)\b/i.test(task) && !/\b(blocks?|masonry|bricks?|stone|concrete)\b/i.test(task),
    masonryDemo: /\b(bricks?|blocks?|masonry|concrete|render|tiles?|stone|fibro|fibre cement)\b/i.test(task),
    groundCut: /\b(footpaths?|kerbs?|driveways?|paths?|pavements?|roads?|ground slabs?|slabs? on ground|garage floors?|car parks?)\b/i.test(task),
    crackInjection: /\binject\w*\b/i.test(task),
    birdDroppings: /\b(bird|pigeon|bat) (?:droppings?|guano|faeces|nests?)\b|\bguano\b/i.test(task),
    roofTarps: /\btarp\w*\b/i.test(task) && /\broofs?\b/i.test(task),
    gutterClean: /\b(?:clean\w*|clear\w*|unblock\w*)\b[^.]{0,20}\bgutters?\b/i.test(task),
    grandstand: /\b(grandstands?|tiered seating|temporary (?:stands?|seating))\b/i.test(task) && /\b(erect\w*|install\w*|build\w*|dismantl\w*|set\w* up)\b/i.test(task),
    laundryEquipment: /\b(commercial laundr\w*|washers and dryers|washing machines|tumble dryers|laundry (?:equipment|machines))\b/i.test(task),
    graffitiRemoval: /\bgraffiti\b/i.test(task) && /\b(remov\w*|clean\w*)\b/i.test(task),
    rfEquipment: /\b(antennas?|aerials?|mobile phone|telecommunications?|5g|transmitters?|radio)\b/i.test(task),
    fireSuppression: /\b(fire suppression|wet chemical (?:system|suppression))\b/i.test(task),
    ceilingRepair: /\b(?:repair\w*|fix\w*|re-?sheet\w*)\b[^.]{0,20}\b(?:sagging |damaged |cracked |water[- ]damaged )?ceilings?\b|\bsagging ceilings?\b/i.test(task),
    poleMount: /\bpoles?\b/i.test(task) && /\b(cctv|cameras?|lights?|signs?)\b/i.test(task),
    poolOnly: /\b(?:swimming )?pools?\b/i.test(task) && !/\b(rivers?|sea|harbou?rs?|jett(?:y|ies)|wharf|wharves|lakes?|creeks?|dams?|marinas?|tidal|canals?|ocean|beach)\b/i.test(task),
    rangeHood: /\b(range ?hoods?|exhaust hoods?|kitchen hoods?|canopy hoods?)\b/i.test(task),
    doorSpring: /\b(door )?springs?\b/i.test(task) && /\b(garage|roller|tilt|sectional) doors?\b/i.test(task),
    ceilingInsulation: !/\bwalls?\b/i.test(task) || /\b(ceilings?|roof)\b/i.test(task),
    wallInsulation: /\bwalls?\b/i.test(task) && /\b(insulation|batts?)\b/i.test(task),
    carpetTiles: /\bcarpet tiles?\b/i.test(task),
    fixtureSwap: /\b(?:replac\w*|swap\w*|chang\w*)\b[^.]{0,30}\b(?:toilet (?:pans?|suites?|seats?)|pans?|taps?|tapware|basins?|vanit(?:y|ies)|shower ?heads?|cisterns?|sinks?)\b/i.test(task) && !/\b(rough[- ]in|chas\w*|relocat\w*|new pipe\w*)\b/i.test(task),
    paverRepair: /\b(?:collapsed|sunken|broken|lifted|damaged)\b[^.]{0,20}\b(?:brick )?pav\w*\b/i.test(task),
    wallTiling: /\b(splashbacks?|wall tiles?|feature walls?)\b/i.test(task) && !/\bfloors?\b/i.test(task),
    masonryFence: /\b(masonry|brick|block|rendered) fences?\b/i.test(task),
    siteToilets: /\b(toilets?|amenities)\b/i.test(task),
    gravelWork: /\bgravel\b/i.test(task),
    rockLining: /\b(rock (?:lining|beaching|armour\w*|walls?)|rip ?rap)\b/i.test(task),
    stormwaterOnly: /\b(downpipes?|stormwater|gutters?|roof water)\b/i.test(task) && !/\b(sewers?|sewage|sanitary|waste|toilets?|septic)\b/i.test(task),
    inverterReplace: /\b(?:replac\w*|swap\w*|upgrad\w*)\b[^.]{0,30}\binverters?\b/i.test(task),
    pumpOutLine: /\bpump[- ]?out (?:lines?|points?|pipes?)\b|\bpump[- ]?out\b[^.]{0,30}\b(?:septic|grease|arrestor|trap)\b|\b(?:septic|grease|arrestor|trap)\b[^.]{0,30}\bpump[- ]?out\b/i.test(task),
    platformLift: /\b(platform lifts?|wheelchair (?:lift|platform)\w*|disabled (?:access )?lifts?|lift platforms?)\b/i.test(task),
    pitLid: /\b(?:replac\w*|fit\w*|install\w*)\b[^.]{0,30}\b(?:pit (?:lids?|covers?|grates?)|(?:grated |access )?(?:lids?|covers?|grates?) (?:on|to|of) (?:a |the )?(?:\w+ )?pits?)\b/i.test(task),
    subfloorRepair: /\b(?:replac\w*|repair\w*|sister\w*)\b[^.]{0,30}\b(?:floor )?(?:joists?|bearers?)\b/i.test(task),
    boosterInstall: /\b(booster (?:assembl\w*|sets?|valves?|cabinets?)|hydrant boosters?|fire boosters?)\b/i.test(task),
    steelRails: /\b(steel|weld\w*)\b/i.test(task) && /\b(rails?|yards?|posts?|fenc\w*)\b/i.test(task),
    grinding: /\bgrind\w*\b/i.test(task),
    deckRefinish: /\b(?:strip\w*|refinish\w*|oil\w*|stain\w*|sand\w*)\b[^.]{0,30}\b(?:timber )?decks?\b/i.test(task),
    poolHeater: /\bpool (?:heaters?|heat pumps?|heating)\b/i.test(task),
    appliancePower: /\b(power|electrical|electric(?:ity)?|booster heaters?)\b/i.test(task) && /\b(dishwashers?|coffee machines?|ice machines?|ovens?|fryers?|appliances?|machines?|equipment)\b/i.test(task) || /\bice machines?\b/i.test(task),
    smallMasonry: /\b(letterbox\w*|piers?|brick\w* up|block\w* up|fill\w* in|openings?|doorways?|repair\w*|patch\w*|barbecues?|bbqs?|steps|planter\w*)\b/i.test(task) && !/\b(storeys?|houses? (?:walls|brickwork)|face brick\w* (?:for|to) (?:a |the )?(?:new )?(?:\w+ )?(?:house|building)|fire walls?|block (?:walls?|fire walls?))\b/i.test(task),
    gantry: /\b(gantr(?:y|ies)|covered ways?)\b/i.test(task),
    hoarding: /\b(gantr(?:y|ies)|covered ways?|hoardings?)\b/i.test(task),
    substation: /\bsubstations?\b/i.test(task),
    nightWork: /\b(at night|night ?(?:work|shifts?)|overnight)\b/i.test(task),
    occupied: /\b(occupied|aged care|nursing homes?|hospitals?|while (?:the )?(?:\w+ )?(?:stay|remain)s? open|residents?|patients?|students? on site|during term)\b/i.test(task),
    houseWork: /\b(houses?|homes?|dwellings?|units?|apartments?|townhouses?|queenslanders?|residential|granny flats?)\b/i.test(task) && !/\b(commercial|strata|apartment (?:building|block)s?|shopping|hospital|school|factory|warehouse)\b/i.test(task),
    oldHouse: /\b(1[89]\d0s|19[0-7]\d|pre-?19[0-7]\d|federation|queenslanders?|old (?:house|home)|weatherboard)\b/i.test(task),
    deckStairs: /\b(stairs?|steps|balustrad\w*|handrails?)\b/i.test(task),
    splitSystem: /\bsplit[- ]systems?\b/i.test(task) && !/\bduct\w*\b/i.test(task),
    siteVehicles: /\b(warehouses?|car ?parks?|factor(?:y|ies)|depots?|loading docks?|supermarkets?|shopping (?:centres?|centers?)|distribution centres?|workshops?|forecourts?|driveways?)\b/i.test(task),
    coolroom: /\b(cool ?rooms?|freezer rooms?|walk-in (?:freezers?|cool ?rooms?|fridges?))\b/i.test(task),
    rendering: /\b(render\w*|bagg\w*|skim coat\w*)\b/i.test(task) && !/\bsurrender\b/i.test(task),
    floorSanding: /\b(sand\w*|polish\w*|finish\w*|refinish\w*|coat\w*|oil\w*|stain\w*|strip\w*)\b[^.]{0,30}\b(floorboards?|timber floors?|timber decks?|decks?)\b|\b(floorboards?|timber floors?)\b[^.]{0,40}\b(sand\w*|finish\w*|coat\w*)/i.test(task),
    liftInstall: /\b(?:install\w*|supply and install)\b[^.]{0,30}\b(?:passenger |goods |platform )?lifts?\b/i.test(task) && !/\bstair ?lifts?\b/i.test(task),
    asphaltLay: /\b(?:lay\w*|place\w*|pav\w*)\b[^.]{0,30}\b(?:asphalt|hotmix|hot mix|bitumen)\b|\basphalt (?:laying|paving|resurfac\w*|overlay)\b/i.test(task),
    sealing: /\b(seal\w*|sealer)\b/i.test(task),
    gateMotor: /\b(gate motors?|automatic gates?|motorised gates?|electric gates?|sliding gates?)\b/i.test(task),
    cabinets: /\b(cabinets?|wardrobes?|cupboards?|joinery)\b/i.test(task),
    groundSlab: /\b(raft|ground slab|slab on ground|footings?|basement slab)\b/i.test(task) && !/\bsuspended\b/i.test(task),
    roofFittings: /\b(?:install\w*|fit\w*|fix\w*|replac\w*)\b[^.]{0,30}\b(?:gutter guards?|bird (?:spikes|proofing|mesh)|whirlybirds?|roof vents?|(?:roof )?turbine vents?|roof turbines?|ventilators?|snow guards?|leaf guards?)\b/i.test(task),
    restump: /\b(re-?stump\w*|stumps?|rais\w* (?:a |the )?(?:\w+ )?house|lift\w* (?:a |the )?house|house rais\w*|underpin\w*)\b/i.test(task),
    flueInstall: /\b(wood (?:heaters?|fires?|burners?)|flues?|chimney liners?|combustion heaters?)\b/i.test(task),
    testTag: /\btest(?:ing)? and tag\w*\b|\btest and tag\b/i.test(task),
    edgeProtectionInstall: /\b(?:erect\w*|install\w*|remov\w*|dismantl\w*)\b[^.]{0,30}\b(?:edge protection|perimeter (?:screens?|guardrails?)|guardrails? around)\b/i.test(task),
    rockBreak: /\b(rock break\w*|hydraulic (?:hammer|breaker)s?|break\w* (?:up )?(?:the )?rock|rock (?:hammer|breaking))\b/i.test(task),
    drainClear: /\b(?:clear\w*|unblock\w*|clean\w*|jet\w*)\b[^.]{0,30}\b(?:blocked )?(?:drains?|sewers?|pipes?|downpipes?|stormwater)\b|\b(?:electric eel|drain machines?|jetters?)\b/i.test(task),
    signageInstall: /\b(?:install\w*|fit\w*|fix\w*|replac\w*|erect\w*)\b[^.]{0,60}\b(?:signs?|signage|led screens?|billboards?|shopfront signs?)\b/i.test(task) && !/\b(?:exit signs?|safety signs? and barriers|block plans)\b/i.test(task),
    fuelTankRemoval: /\b(?:remov\w*|decommission\w*|excavat\w*|pull\w* out|dig\w* (?:up|out))\b[^.]{0,30}\b(?:(?:in-?ground|underground|old) )?(?:fuel|petrol|diesel|underground) tanks?\b/i.test(task),
    fuelSystems: /\b(?:install\w*|replac\w*)\b[^.]{0,40}\b(?:fuel (?:bowsers?|dispensers?|lines?|pumps?)|bowsers?)\b/i.test(task),
    accessFloor: /\b(raised (?:access )?floor\w*|access floor\w*|computer floor\w*)\b/i.test(task),
    pumpInstall: /\b(?:install\w*|replac\w*|lower\w*)\b[^.]{0,30}\b(?:bore pumps?|submersible pumps?|pumps?)\b/i.test(task) && !/\b(?:concrete pump\w*|line pump\w*|boom pump\w*|heat pumps?|pool pumps?)\b/i.test(task),
    lightningProtection: /\blightning (?:protection|conductors?|rods?)\b/i.test(task),
    blasting: /\b(blast\w*|explosives?|shotfir\w*)\b/i.test(task) && !/\b(sand ?blast\w*|abrasive blast\w*|grit blast\w*|water blast\w*|shot ?blast\w*|blast (?:clean|furnace))\b/i.test(task),
    abrasiveBlast: /\b(sand ?blast\w*|abrasive blast\w*|grit blast\w*)\b/i.test(task),
    autoDoors: /\b(auto(?:matic)? (?:sliding )?doors?|door operators?|sliding door operators?)\b/i.test(task),
    windowInstall: /\b(?:install\w*|fit\w*|replac\w*|supply and fix)\b[^.]{0,40}\b(?:(?:aluminium |timber )?windows?(?! hardware| openings?)|window frames?|louv(?:re|er)s?|sliding doors?|fly ?screens?|security (?:doors?|screens?)|screen doors?|(?:cyclone|storm|roller) shutters?)\b/i.test(task) && !/\b(?:clean\w*|wash\w*)\b[^.]{0,20}\bwindows?\b/i.test(task),
    glazingDrill: GLAZING_WORK.test(task) && ((/\bdrill\w*\b/i.test(task) && /\b(tiled|tiles?|masonry|concrete)\b/i.test(task)) || /\bshower screens?\b/i.test(task)),
    // Taping or marking glazing so it can be seen is not glass installation.
    glassHandle: !/^\s*$/.test(task.replace(/\b(?:tap(?:e|ing)|mark\w*)\b[^.]*\bglaz\w*[^.]*\.?/gi, '')) && GLAZING_WORK.test(task.replace(/\b(?:tap(?:e|ing)|mark\w*)\b[^.]*\bglaz\w*[^.]*\.?/gi, '')) && /\b(glass|glazing|mirrors?|screens?|windows?)\b/i.test(task) && !/\b(clean\w*|wash\w*)\b[^.]{0,20}\bwindows?\b/i.test(task) && (!/\bhardware\b/i.test(task) || /\b(?:install|fit|replac|supply)\w*[^.]{0,30}\b(?:glass|glazing|panes?|windows?(?! hardware)|mirrors?|screens?)\b/i.test(task)),
    glazingSeal: GLAZING_WORK.test(task) && /\b(seal\w*|silicon\w*)\b/i.test(task),
    stoneWork: STONE_WORK.test(task),
    siteSheds: /\b(site sheds?|site offices?|temporary (?:site )?offices?|site amenities|amenities (?:sheds?|blocks?)|site toilets?|portable toilets?|crib (?:rooms?|sheds?)|dongas?|demountables?|(?:site|temporary) (?:office|toilets?|crib))\b/i.test(task) && !/\bslabs? for (?:an? |the )?(?:\w+ )?sheds?\b/i.test(task) && /\b(set up|install\w*|erect\w*|lift\w*|place\w*)\b/i.test(task),
    stoneSilica: STONE_WORK.test(task) && /\b(cut\w*|drill\w*|polish\w*|grind\w*)\b/i.test(task),
    stoneHandle: STONE_WORK.test(task) && /\b(install\w*|set\w*|carr\w*|mov\w*|lift\w*|fit\w*|replac\w*)\b/i.test(task) && !/\blaminate\b/i.test(task),
    roofStrip: /\broof\w*\b/i.test(roofTask) && /\b(remov\w*|replac\w*|strip\w*|re-?roof\w*)\b/i.test(roofTask),
    facadeWork: FACADE_WORK.test(task),
    panelLoad: FACADE_WORK.test(task) && /\b(load\w*|deliver\w*|stillages?|racks?|land\w*)\b/i.test(task),
    facadeCrane: FACADE_WORK.test(task) && /\b((?:floor|mini|spider|crawler) cranes?|monorails?)\b/i.test(task),
    panelInstall: (FACADE_WORK.test(task) || /\bcurtain wall\w*/i.test(task)) && /\b(install\w*|plac\w*|hang\w*)\b/i.test(task) && /\b(panels?|curtain wall\w*|glazing|glass)\b/i.test(task) && !/\b(swing stages?|suspended scaffold\w*|mast climb\w*)\b/i.test(task),
    glassHandling: FACADE_WORK.test(task) && /\b(glass|glazing|glazed|panels?|vacuum lifters?)\b/i.test(task) && /\b(install\w*|lift\w*|handl\w*|replac\w*)\b/i.test(task) && !/\b(stillages?|trolleys?)\b/i.test(task),
    swingStage: /\b(swing stages?|suspended scaffold\w*|mast climb\w*|mcwps?)\b/i.test(task),
    edgeBracket: FACADE_WORK.test(task) && /\bbrackets?\b/i.test(task) && /\bslab edges?\b/i.test(task),
    facadeSeal: FACADE_WORK.test(task) && /\b(seal\w*|silicon\w*|caulk\w*)\b/i.test(task),
    mechanicalWork: MECHANICAL_WORK.test(task),
    refrigerantWork: REFRIGERANT.test(task),
    // Heavy plant lifted, delivered or moved into place; not scissor or boom lifts.
    plantLift: MECHANICAL_WORK.test(task) && /\b(ahus?|air handling units?|chillers?|cooling towers?|condens\w* units?|condensers?|(?:air[- ]?condition\w*|rooftop|package\w*|a\/?c) units?|fans?(?!\s+coil)|plant)\b/i.test(task) && (/\b((?<!scissor\s+|boom\s+)lift\w*|cranes?|hoist\w*|deliver\w*|unload\w*|skates?|pallet jacks?|position\w*|mov\w*|rig\w*)\b/i.test(task) || (/\binstall\w*/i.test(task) && /\b(ahus?|air handling units?|chillers?|cooling towers?|condens\w* units?|condensers?|(?:rooftop|package\w*) units?|plant)\b/i.test(task) && !/\b(range ?hoods?|exhaust fans?)\b/i.test(task))),
    ductwork: /\bducted\b/i.test(task) && /\b(install\w*|replac\w*)\b/i.test(task) || MECHANICAL_WORK.test(task) && /\b(install\w*|exhaust systems?|supply and fix|fit(?:s|ted|ting)?)\b/i.test(task.replace(/\b(?:supply and )?install\w* (?:all )?(?:the )?(?:insulation|lagging)\b[^.]*/gi, '')) && !/\bon the roof\b/i.test(task) && (/\b(ductwork|duct(?:ing| runs?| sections?)|ducts)\b/i.test(task) || (/\b(fan coil units?|fcus?)\b/i.test(task) && !REFRIGERANT.test(task)) || /\b(split systems?|indoor units?|outdoor units?|wall[- ]hung units?)\b/i.test(task)),
    refrigerantPipework: REFRIGERANT.test(task) && /\b(braz\w*|silver solder\w*)\b/i.test(task),
    // Installing a split system includes pressure testing, evacuating and releasing or adding the charge.
    refrigerantTest: REFRIGERANT.test(task) && (PRESSURE_TEST.test(task) || SPLIT_INSTALL.test(task)),
    refrigerantCharge: REFRIGERANT.test(task) && (/\b(charg\w*|evacuat\w*|recover\w*|decant\w*)\b/i.test(task) || SPLIT_INSTALL.test(task)),
    // Plant installed on the roof, as opposed to pipework that only runs to it.
    roofPlant: (MECHANICAL_WORK.test(task) || ICT_WORK.test(task)) && /\b(?:install|replac|servic|repair|maint)\w*\b[^.]{0,70}\b(?:on (?:the|a) (?:house |building )?roof|roof plant|rooftop)\b/i.test(task) && !/\b(?:pipework|pipes?|lines?)\s+(?:between|from|to)\b/i.test(task),
    jetFans: /\b(jet fans?|car ?park (?:ventilation|exhaust)\w*)\b/i.test(task),
    mechInsulation: MECHANICAL_WORK.test(task) && /\b(insulat\w*|lagging)\b/i.test(task),
    mechCommissioning: MECHANICAL_WORK.test(task) && /\b(commission\w*|start[- ]?up|balanc\w*|replac\w*)\b/i.test(task),
    tempPower: TEMP_POWER.test(task),
    // Cast-in services named only as something drilling must not damage are not cast-in work.
    // Conduits protected "during pouring of concrete" are cast in.
    // A builder's rule against in-slab conduits is not conduit work.
    castIn: !/^[^.]*\bno conduits?\b[^.]*\b(?:in-?slab|unless)\b[^.]*\.?$/i.test(task.trim()) && (/\bconduits?\b[^.]*\b(?:during (?:the )?pour\w*|before (?:the )?pour|pouring of concrete)\b/i.test(task) || /\b(cast[- ]in|in[- ]slab)\b/i.test(task.replace(/[^.]*\b(?:impact|damag\w*|strik\w*|hit\w*|avoid\w*|integrity)\b[^.]*\bcast[- ]in\b[^.]*|[^.]*\bcast[- ]in\b[^.]*\b(?:impact|damag\w*|strik\w*|hit\w*|avoid\w*)\b[^.]*/gi, ''))) && ELECTRICAL_CORE.test(task),
    containment: /\b(cable trays?|cable ladders?|containment|busduct)\b/i.test(task) && ELECTRICAL_CORE.test(task),
    cablePull: (/\b(cable pull\w*|pull\w* (?:the )?cables?|cable drums?|drums? of cable|submains?|consumer mains)\b/i.test(task) && ELECTRICAL_CORE.test(task)) || /\b(?:run\w*|lay\w*|install\w*)\b[^.]{0,20}\b(?:underground )?(?:power|supply|cable)\b[^.]{0,30}\bto (?:a |the )?(?:shed|garage|granny flat|pump|outbuilding|gate)\b/i.test(task),
    ictWork: ICT_WORK.test(task),
    securityWork: SECURITY_WORK.test(task),
    ictCabling: ICT_WORK.test(task) && !/\bon the roof\b/i.test(task) && (/\b(?:install\w*|pull\w*|run\w*)\b[^.]{0,60}\b(?:cabl\w*|containment|cable trays?|catenary|conduits?|data points?|data outlets?)\b/i.test(task) || /\b(pabx|ip telephony|(?:tele)?phone systems?|handsets?)\b[^.]{0,80}\binstall\w*|\binstall\w*[^.]{0,80}\b(pabx|ip telephony|(?:tele)?phone systems?|handsets?)\b/i.test(task)),
    fibre: /\b(optical fibre|fibre optic\w*|fibre backbone|fibre cabl\w*|splic\w*)\b/i.test(task),
    commsRoom: ICT_WORK.test(task) && /\b(racks?|cabinets?|ups|batter(?:y|ies))\b/i.test(task) && /\b(install\w*|supply|provid\w*|fit\w*|mount\w*|head end|server)\b/i.test(task.replace(/\b(?:daily |regular )?inspections? of [^.]*/gi, '')),
    securityDevices: SECURITY_WORK.test(task) && /\b(install\w*|provid\w*|fit\w*)\b/i.test(task),
    fitOff: (/\b(rough[- ]in|fit[- ]off|rewir\w*|run\w* (?:new )?cables?|underfloor heating|heating cables?|heating mats?|exit signs?|emergency light\w*)\b/i.test(task) || /\b(?:install\w*|replac\w*|add\w*)\b[^.]{0,40}\b(?:led lighting|lighting|light fittings?|lights|downlights?|floodlights?|ceiling fans?|cooktops?|stoves?|ovens?|smoke alarms?|(?:ev |car )?chargers?|power (?:points?|circuits?|outlets?)|gpos?|switch(?:es)?|circuits?|outlets?)\b/i.test(task)) && ELECTRICAL_CORE.test(task),
    // Isolation steps for any work on the installation; commissioning only for the
    // permanent main switchboard and consumer mains, not construction power.
    isolation: SWITCHBOARD_WORK.test(task) || TEMP_POWER.test(task) || /\bunderground power\b|\bpower (?:supply )?to (?:a |the )?(?:granny flat|shed|garage|outbuilding|pool|pump)/i.test(task) || /\b(solar (?:panels?|pv|arrays?)|inverters?|meter (?:box|board|panel)s?|(?:home |house |solar |storage )batter(?:y|ies))\b/i.test(task) || ((/\b(rough[- ]in|fit[- ]off)\b/i.test(task) || /\b(?:install\w*|replac\w*|add\w*)\b[^.]{0,40}\b(?:led lighting|lighting|light fittings?|lights|downlights?|floodlights?|ceiling fans?|smoke alarms?|(?:ev |car )?chargers?|power (?:points?|circuits?|outlets?)|gpos?|switch(?:es)?|circuits?|outlets?)\b/i.test(task)) && ELECTRICAL_CORE.test(task)),
    // The site's main switchboard and consumer mains, not a mechanical or distribution board.
    mainSwitchboard: /\b(consumer mains|(?<!mechanical |mechanical services |mech |to the |to the existing |from the |from the existing |off the |existing )main switchboards?|msbs?|main distribution boards?|connection to (?:the )?(?:mains|supply))\b/i.test(task),
    commissioning: /\b((?:install\w*|replac\w*) (?:a |an |the )?(?:new )?(?:[\w-]+ ){0,4}(?:control panels?|sub-?boards?)|ev chargers?|electric vehicle chargers?|charging (?:stations?|points?)|new (?:dedicated )?circuits?|main switchboards?|consumer mains|commission\w*|install\w* (?:a |the )?(?:new )?switchboards?|new switchboards?|replac\w* (?:the |a )?(?:old )?switchboards?|switchgear|connection to (?:the )?mains|provision of metering)\b/i.test(task) && ELECTRICAL_CORE.test(task) && !TEMP_POWER.test(task),
    deck: deckLaying(task),
    ewp: /\b(elevating work platforms?|ewps?|boom lifts?|scissor lifts?)\b/i.test(combinedFacts(task, facts)),
    precast: isPanelLift(task),
    asbestos: /\basbestos\b/i.test(task),
    asbestosCheck: asbestosLikely(task) && !/\basbestos\b/i.test(task),
    stripOut: /\b(strip\w* out|rip\w* out|strip\w* (?:the )?(?:old )?(?:bathroom|kitchen|laundry|room|ensuite|tiles?)|demolish\w* (?:the )?(?:bathroom|kitchen|laundry|walls?|tiles?)|remov\w* (?:the )?(?:\w+ )?(?:wall and floor tiles|floor tiles|wall tiles|vanit\w*|old cabinets?)|retil\w*|replac\w* (?:a |the )?(?:leaking )?shower bases?|wallpaper)\b/i.test(task) && !BULK_EXCAVATION.test(task) && !FORMWORK.test(task),
    deckBuild: /\b(timber decks?|timber decking|decking|decking boards?|pergolas?|verandahs?|patios?|boardwalks?|(?:timber )?(?:access|disabled|wheelchair) ramps?|(?:back|front|outdoor|house|garden|pool) decks?|decks? (?:at|on|for) (?:the )?(?:back|front) of (?:a|the) (?:house|home))\b/i.test(task) && /\b(build\w*|construct\w*|install\w*|erect\w*|frame\w*|lay\w*)\b/i.test(task),
    // Everyday residential and small works.
    kitchenEquipment: /\b(commercial kitchens?|kitchen equipment|kitchen items|commercial dishwash\w*|(?:commercial )?range ?hoods?|(?:commercial )?ice machines?|exhaust hoods?|cool ?rooms?|freezer rooms?|walk-in (?:freezers?|cool ?rooms?|fridges?)|combi ovens?|stainless steel (?:benches|benching|sinks?|shelving|joinery|custom fabricated items))\b/i.test(task) && /\b(install\w*|certif\w*|supply|provid\w*|fit\w*|deliver\w*)\b/i.test(task),
    safetyMesh: /\b(safety mesh|roof mesh|sarking)\b/i.test(task) && /\b(install\w*|fix\w*|lay\w*|run\w*)\b/i.test(task) && /\b(purlins?|warehouse|industrial|commercial|metal roof|roof sheet\w*)\b/i.test(task),
    waterHeater: /\b(?:install\w*|replac\w*|connect\w*|fit\w*)\b[^.]{0,40}\b(hot water (?:systems?|units?|heaters?|cylinders?|services?|heat pumps?|plant)|water heaters?|heat pumps?|pool heaters?)\b/i.test(task) && !/\b(air ?condition\w*)\b/i.test(task),
    solarPV: /\b(solar (?:panels?|pv|arrays?|power systems?)|pv (?:panels?|arrays?|systems?)|photovoltaic|inverters?)\b/i.test(task.replace(/\b(?:connect\w*|link\w*|integrat\w*)\b[^.]{0,20}\bto (?:the |an |its )?(?:existing )?(?:solar )?inverter\b/gi, '')) && !/\bsolar hot water\b/i.test(task) && !/\bclean\w*\b/i.test(task),
    batteryStorage: /\b(?:home |house |solar |storage |lithium )batter(?:y|ies)\b|\bbattery (?:storage|systems?)\b|\bbatter(?:y|ies)\b[^.]{0,30}\b(?:solar|garage wall|house wall)\b/i.test(task),
    // Work on the meter box itself, not a submain run from it.
    meterBox: /\b(?:replac\w*|upgrad\w*|install\w*|relocat\w*|new|chang\w*|remov\w*)\b[^.]{0,40}\bmeter (?:box|board|panel)s?\b|\bmeter (?:box|board|panel)s? (?:is |are )?(?:replac\w*|upgrad\w*|relocat\w*|chang\w*)/i.test(task),
    gasFitting: /\bgas (?:ducted )?heat\w*|ducted gas\b/i.test(task) || !/\b(?:replac\w*|swap\w*|chang\w*)\b[^.]*\bgas\b[^.]*\bwith (?:a |an )?(?:heat pump|electric|solar)/i.test(task) && /\b(gas (?:hot water|appliances?|heaters?|cooktops?|connections?|fitting|lines?|bayonets?|barbecues?|bbqs?|ovens?|fires?)|gasfitt\w*|connect\w*[^.]{0,30}\bgas (?:lines?|suppl(?:y|ies)|mains?)|gas suppl(?:y|ies) to)\b/i.test(task),
    floorCoating: /\b(epoxy|polyurethane (?:floor|coat\w*)|floor coatings?|(?:anti|non)[- ]?slip (?:coatings?|treatments?|paints?)|(?:apply|seal)\w*[^.]{0,20}\bsealers?|sealer)\b/i.test(task) && /\b(floors?|slabs?|garages?|warehouse|stairs?|treads?|walkways?|ramps?|platforms?)\b/i.test(task),
    roofBattens: /\broof battens?\b|\bbattens?\b[^.]{0,20}\b(?:roofs?|trusses)\b|\bsarking\b[^.]{0,40}\b(?:new|trusses|tiles?)\b/i.test(task) && !/\b(purlins?|warehouse|safety mesh|industrial|commercial)\b/i.test(task),
    gutters: /\b(?:install\w*|replac\w*|fit\w*|fix\w*|repair\w*)\b[^.]{0,30}\b(gutters?(?! guards?)|downpipes?|fascias?|soffits?|eaves linings?)\b/i.test(task),
    skylight: /\b(?:install\w*|replac\w*|repair\w*|fit\w*|cut\w* in)\b[^.]{0,30}\b(skylights?|roof windows?|solar tubes?|sky ?tubes?)\b/i.test(task),
    rainwaterTank: /\b(?:install\w*|replac\w*|connect\w*)\b[^.]{0,40}\b(rainwater tanks?|water tanks?|tank pumps?)\b/i.test(task) && !/\b(remov\w*|septic)\b/i.test(task),
    retainingWall: /\bretaining walls?\b/i.test(task) && /\b(build\w*|construct\w*|install\w*|replac\w*|erect\w*|repair\w*|rebuild\w*)\b/i.test(task),
    kitStructure: /\b(?:build\w*|erect\w*|install\w*|construct\w*|assembl\w*)\b[^.]{0,40}\b(pergolas?|carports?|(?:garden|kit|colorbond|steel|metal) sheds?|patio (?:roofs?|covers?)|verandahs?|awnings?|shade structures?|shade sails?|skillion (?:roofs?|extensions?)|roof extensions?|lean-to\w*)\b/i.test(task) && !/\bsite sheds?\b/i.test(task),
    tiledRoof: /\b(roof tiles?|tiled roofs?|terracotta tiles?|ridge capp\w* on (?:a )?tiled|re-?point\w* (?:the )?ridge|re-?bed\w* (?:the )?ridge)\b/i.test(task) && !/\b(remove the (?:\w+ )?roof tiles and replace)\b/i.test(task),
    pressureClean: /\b(pressure clean\w*|pressure wash\w*|high[- ]pressure (?:clean|wash)\w*|water blast\w*|re-?seal\w* (?:a |the )?(?:concrete|driveway|pavers|deck|floor)|seal\w* (?:a |the )?(?:concrete|driveway|pavers|deck)|wash\w* and seal\w*)\b/i.test(task) && !/\b(epoxy|polyurethane)\b/i.test(task),
    lineMarking: /\b(line marking|line-marking|linemarking|line mark\w*)\b/i.test(task),
    bollards: /\b(bollards?|wheel stops?|speed (?:humps?|bumps?)|car stops?|parking stops?|traffic barriers?|crash barriers?|vehicle barriers?|barrier kerbs?)\b/i.test(task),
    shallowTrench: (/\b(garden taps?|irrigation|garden lights?|landscape lighting)\b/i.test(task) || /\b(?:dig|trench\w*)\b[^.]{0,40}\b(?:by hand|shallow|[1-9]\d{2} mm)\b/i.test(task)) && /\b(trench\w*|dig\w*|pipes?|cables?|lay\w*)\b/i.test(task) && !/\b(excavators?|sewer\w*|stormwater|conduits?|deep trench\w*|[2-9](?:\.\d+)? ?m deep|1\.[5-9]\d* ?m deep)\b/i.test(task),
    // Insulating the ceiling of an existing house is done from the roof space.
    roofSpace: /\b(roof spaces?|roof cavit\w*|attics?)\b/i.test(task) || (/\bceiling spaces?\b/i.test(task) && /\b(house|home|dwelling)\b/i.test(task)) || (/\b(insulation|batts)\b/i.test(task) && /\bceilings?\b/i.test(task) && /\bexisting\b/i.test(task) && /\b(house|home|dwelling)\b/i.test(task)) || (/\b(exhaust fans?|downlights?|ceiling fans?)\b/i.test(task) && /\b(houses?|homes?|dwellings?)\b/i.test(task) && /\b(ducted|roof|ceiling)\b/i.test(task)),
    // Domestic premises: the house refurbishment asbestos rule applies there.
    domesticPremises: /\b(houses?|homes?|dwellings?|townhouses?|duplex\w*|domestic premises|residences?)\b/i.test(task),
    houseFraming: (/\b(wall frames?|roof trusses?|stand\w* (?:the )?frames?|frame\w* (?:a|the) (?:new )?house)\b/i.test(task) && /\b(house|home|timber|dwelling|townhouses?|duplex)\b/i.test(task) || /\b(?:build\w*|construct\w*)\b[^.]{0,30}\b(?:granny flat|cabin|studio|extension|house)\b[^.]*\bframe\w*/i.test(task)) && !STEEL_WORK.test(task),
    fenceBuild: /\b(fenc\w*|cattle yards?|stock ?yards?|post and rail|posts and rails)\b/i.test(task) && /\b(build\w*|post holes?|install\w*|erect\w*|replac\w*|repair\w*|new)\b/i.test(task) && !/\b(site fenc\w*|temporary fenc\w*|hoardings?)\b/i.test(task),
    confined: /\bconfined space\b/i.test(task) || /\b(?:enter\w*|go\w* into|work\w* in(?:side)?|clean\w* out)\b[^.]{0,30}\b(?:pits?|wet wells?|manholes?|tanks?|sewers?|pump stations?|culverts?|silos?|vaults?)\b/i.test(task) || choiceAnswer('spaceAssessment', facts.spaceAssessment) === 'confined',
    water: mentioned(task, WATER),
    painting: (needsSafetyDataSheet(task) || /\b((?:re)?paint\w*|anti-graffiti coat\w*)\b/i.test(task)) && /\b((?:re)?paint\w*|enamel|coating)\b/i.test(task) && !(/\b(spray\w*|airless)\b/i.test(task) && !/\b(brush\w*|roll(?:er|ers|ing))\b/i.test(task)),
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
  // The ACT and NSW keep registers of houses with loose-fill asbestos insulation.
  const looseFill = ['act', 'nsw'].includes(state.id) && /\b(19[0-7]\d|19[0-7]0s|pre-?19[0-7]\d|pre-?1980)\b/i.test(task) && /\b(houses?|homes?|dwellings?)\b/i.test(task);
  const steps = jobStepsFor({ ...tradeFlags(task, facts, state), ...extra, looseFill, cite: state.id }, factText, {
    step: asSentence(first || task),
    hazards: hazards.map((row) => `${row.hazard}: ${row.risk}`),
    controls: controls.map((item) => item.text),
  });
  const answers = Object.values(facts || {}).filter((value) => typeof value === 'string').join('\n');
  return tidySteps(steps, combinedFacts(task, facts), answers);
}

// Harness, restraint and fall arrest lines that only apply when one is used.
const HARNESS_ONLY = /^(?:Where (?:harnesses are used|fall arrest is used|travel restraint is used|a boom-type platform is used|boom EWPs are used)|In a boom EWP|Travel restraint is not used on fragile|A travel restraint system is installed|Travel restraint and fall arrest systems are inspected|Travel restraint is installed|Insert-type anchors|Harness anchors are|A harness user never works alone|No one uses a fall arrest harness)/;
const HARNESS_USED = /\b(harness\w*|fall arrest|travel restraint|restraint systems?|boom(?:[- ]type)? (?:lifts?|ewps?|platforms?)|boom lifts?|swing ?stages?|static lines?|anchor points?)\b/i;

// A harness is in use with fall arrest or restraint, in a boom lift or on a swing stage.
// An elevating work platform of unstated type may be a boom lift, so it counts too.
function harnessInUse(source) {
  const text = String(source || '');
  return HARNESS_USED.test(text) || (/\b(elevating work platforms?|ewps?)\b/i.test(text) && !/\bscissor\b/i.test(text));
}

// Tidies the steps for this task: harness lines go when no harness, restraint or
// boom lift is used (the fall control is guardrails, a scaffold or a scissor lift),
// and a control already given in an earlier step is not repeated.
// Library lines that only make sense when the task names that part of the work.
const TASK_ONLY = [
  [/^A wall cage topples/, /\b(walls?|lift shafts?|cores?|stairwells?)\b/i],
  [/^Ballast and insulation boards are moved/, /\b(ballast|insulation boards?)\b/i],
  [/^Cable jointing resins are used/, /\b(joints?|jointing|terminat\w*|heat[- ]shrink)\b/i],
  [/^Where spoil is carted by truck or loader/, /\b(cart\w*|haul\w*|spoil|surplus)\b/i],
  [/^Use a power stretcher instead of a knee kicker/, /^(?![\s\S]*\bdirect[- ]stick)/i],
  [/^Where the truck or pump stands on the road or footpath/, /\b(road|street|footpaths?|verge|traffic|crossovers?|kerbs?)\b/i],
  [/^On a slab on ground, concrete trucks stand back/, /\b(slabs? on ground|slab-on-ground|ground (?:floor )?slabs?|driveways?|paths?|kerbs?|house slabs?)\b/i],
  [/^Silica dust and noise from saw cutting joints/, /\b(saw\w*|control joints?)\b/i],
  [/^Silica dust from grinding and patching/, /\b(grind\w*|patch\w*)\b/i],
  [/^Where soffits and walls are patched/, /\b(patch\w*|make good)\b/i],
  [/^Where the engineer inspects before the pour/, /\b(engineer\W?s? inspect\w*|inspection)\b/i],
  [/^Struck by a pump hose or a burst line/, /\b(pump\w*|boom)\b/i],
  [/^Back strain and trips handling pods|^Pod bundles and vapour barrier rolls/, /\b(pods?|waffle|vapou?r barrier|membrane|plastic|sheeting)\b/i],
  [/^Slump tests and test cylinders/, /\b(test\w* (?:all |the )?concrete|slump|cylinders?|concrete test\w*)\b/i],
  [/^Where a concrete placing boom is used/, /\b(boom|pump\w*)\b/i],
  [/^Where a line pump or boom pump is used/, /\b(pump\w*|boom)\b/i],
  [/^Footings, thickenings and pits are entered/, /\b(footings?|thickenings?|pits?)\b/i],
  [/^Where walls, lift shafts or stairwells are reinforced/, /\b(walls?|lift shafts?|cores?|stairwells?)\b/i],
  [/^In risers, use cable grips/, /\b(risers?|shafts?)\b/i],
  [/^Where our crew stays on the deck during the pour/, /\b(pour\w*|concrete is placed|placement)\b/i],
  [/^Where concrete or paving is cut to reinstate it/, /\b(reinstat\w*|concrete|paving|pavers?|footpaths?|kerbs?)\b/i],
  [/^Reglets are cut into concrete/, /\breglets?\b/i],
  [/^Top courses of wall tiles/, /\b(walls?|splashbacks?)\b/i],
  [/^Fire rated sealants and mastics/, /\bfire[- ]?(?:rat\w*|stop\w*|seal\w*)\b/i],
  [/^Adhesives, sealants and sealers are used/, /\b(adhesives?|glue\w*|seal\w*|silicone|mastic)\b/i],
  [/^Silica dust from cutting fibre cement/, /\b(fibre cement|fc sheet\w*|villaboard|cement sheet\w*|compressed sheet)\b/i],
  [/^Drop saws have a self-adjusting guard/, /\b(timber|saw\w*|cut\w*|mdf|joinery|fram\w*|skirting|architraves?|decking|cladding)\b/i],
  [/^Nail guns/, /\b(nail\w*|fram\w*|timber|skirting|architraves?|joinery|decking|cladding|battens?|trusses?)\b/i],
];

// Library lines partly said by an answer the user gave: the repeated part is
// reworded so the line adds only what the answer does not say, keeping its source.
const SAID_BY_FACT = [
  [/^A hot work permit is issued before hot work, and/, /\bhot work permit\b/i, 'Hot work is done only under the hot work permit, and'],
];

function tidySteps(steps, source, answers = '') {
  const harness = harnessInUse(source);
  const task = String(source || '');
  const seen = new Set();
  const key = (line) => line.replace(/\s*\([^)]*\)\s*$/, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return steps.map((step) => ({
    ...step,
    hazards: step.hazards.filter((line) => !TASK_ONLY.some(([pattern, needs]) => pattern.test(line) && !needs.test(task))),
    controls: step.controls.map((line) => SAID_BY_FACT.reduce((text, [pattern, said, instead]) => (said.test(answers) ? text.replace(pattern, instead) : text), line)).filter((line) => {
      if (!harness && HARNESS_ONLY.test(line)) return false;
      if (TASK_ONLY.some(([pattern, needs]) => pattern.test(line) && !needs.test(task))) return false;
      const id = key(line);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }),
  }));
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
  suggestedKinds,
  LOCKED_KINDS,
  groundSlabOnly,
  isCraneOrLift,
  workFlags,
  highRiskMatches,
  questionsFor,
  prepareDraft,
  stripLiftBleedText,
  blankName,
  HIERARCHY,
  REVIEW,
};
