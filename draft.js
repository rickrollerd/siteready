const { HIERARCHY, SITE_FIELDS, findState, highRiskList } = require('./legislation');
const { jobStepsFor, ppeFor, ACTIVITIES } = require('./activities');
const { tradeIds, allowedKinds, limitToTrades } = require('./trades');
const { readSlang } = require('./slang');
const { fixSpelling } = require('./spelling');
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
  if (/\b(panel|precast|tilt-?up)\b/i.test(source) && /\blift(?!ers?\b)/i.test(source.replace(/\b(?:boom|scissor) lifts?\b/gi, ''))) return true;
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
    // Finishing precast already in place: staining, cleaning, sealing, painting, patching, grinding or repairing it.
    .replace(/\b(?:stain\w*|clean\w*|seal\w*|paint\w*|patch\w*|coat\w*|grind\w*|repair\w*|rub\w* (?:up|down)|polish\w*)\b(?:\s+(?:of|to))?\s+(?:the\s+)?(?:[\w-]+\s+){0,3}precast(?:\s+concrete)?(?:\s+(?:wall\s+)?(?:panels?|units?|walls?|elements?))?/gi, '');
}

function isPanelLift(text) {
  const source = withoutWorkIntoPrecast(text);
  // Sealing the joints between panels already standing is not a panel lift.
  if (/\b(?:seal\w*|caulk\w*|re-?seal\w*)\b[^.]{0,40}\bjoints?\b/i.test(source) && !/\b(lift\w*|cranes?|erect\w*|stand\w*|install\w* (?:the )?(?:\w+ )?panels)\b/i.test(source)) return false;
  // Precast culverts, pits, tanks and pipes are lifted as units, not stood up like panels.
  const concrete = /\b(precast|tilt-?up|concrete (?:wall )?panels?)\b/i.test(source) && !/\bprecast (?:concrete )?(?:box )?(?:culverts?|pits?|tanks?|pipes?|manholes?|units?|stairs?)\b/i.test(source);
  // Precast seating tiers sit on rakers: they are not stood up and braced like wall panels.
  if (concrete && !PRECAST_TIER.test(source) && /\b(lift\w*|erect\w*|stand\w*|stood|install\w*|plac\w*|crane\w*)\b/i.test(source)) return true;
  // Crane ties hold a tower crane to the building; they are not a lift.
  return /\bpanels?\b/i.test(source) && /\b(lift\w*|crane\w*)\b/i.test(source.replace(/\bcrane ties?\b|\b(?:boom|scissor|cherry picker) lifts?\b/gi, '')) && !FACADE_WORK.test(source) && !/\b(glass balustrades?|balustrades?|shower screens?|glass panels?|membranes?|ptfe|etfe|roof\w*|access panels?|shaft wall|lightweight concrete)\b/i.test(source);
}

// Western Australia's tilt-up rules (r 306A to r 306I) apply to a "concrete panel": one made
// as a separate movable panel to be part of a wall or retaining wall, not a column, beam,
// paving slab or decorative panel. Floor planks and insulated panels are not concrete wall panels.
function isConcreteWallPanel(text) {
  const source = withoutWorkIntoPrecast(text);
  // Removing the temporary bracing of a concrete panel is tilt-up work too (r 306A(c)).
  if (/\bremov\w*[^.]{0,30}\b(?:temporary )?brac(?:es|ing)\b[^.]{0,30}\b(?:tilt[- ]?up|precast|concrete)\s+(?:concrete\s+)?(?:wall\s+)?panels?\b/i.test(source) && !/\b(sandwich|insulated|decorative)\b/i.test(source)) return true;
  if (!isPanelLift(source)) return false;
  if (!/\b(tilt[- ]?up|tilt (?:panels?|slabs?|walls?)|precast|concrete)\b/i.test(source)) return false;
  if (/\b(sandwich|insulated|decorative)\b/i.test(source)) return false;
  return /\b(tilt[- ]?up|tilt (?:panels?|slabs?|walls?)|panels?)\b/i.test(source.replace(/\b(?:floor|roof|ceiling|access|solar|glass) panels?\b/gi, ''));
}

// Bulk and detailed excavation of a basement, as opposed to service trenches.
const BULK_EXCAVATION = /\b(bulk excavat\w*|excavat\w* (?:the |a |out the )?basements?|dig\w* (?:out )?(?:a |the )?basements?|detailed excavat\w*|(?:excavat|dig)\w*[^.]{0,30}\b(?:pile caps?|lift pits?))\b/i;
// Ground known or suspected to be contaminated, in any kind of digging.
const CONTAMINATED_GROUND = /\b(remediat\w*|contaminat\w* (?:soil|ground|land|fill|spoil|material|sediments?)|(?:soil|fill|ground|spoil)\b[^.]{0,20}\bcontaminat\w*|acid sulfate|pfas|hydrocarbon[- ]impacted|asbestos[- ](?:contaminated|impacted) (?:soil|fill)|former (?:service station|gasworks|fuel depot|landfill|tip) sites?)\b/i;

const STEEL_WORK = /\b(structural steel\w*|steelwork|steel[- ]framed (?:carports?|sheds?|buildings?|structures?|balcon(?:y|ies))|(?:hay|machinery|farm|storage|industrial) sheds?|pedestrian bridges?|footbridges?|portal frames?|mezzanine (?:floors?|levels?|decks?)|steel (?:columns?(?: and beams?)?|erect\w*|frames?|stairs?|staircases?|mezzanine\w*|purlins?|canop(?:y|ies)|awnings?|platforms?|roof|sheds?|carports?|portal\w*))\b/i;
const MASONRY_WORK = /\b(blockwork|block walls?|block (?:fire |party |retaining )walls?|concrete blocks?|brick up|lintels?|repoint\w*|letterbox\w*|fence piers?|besser blocks?|face bricks?|bricks?(?= (?:walls?|veneer|piers?|for|from|to|barbecues?|bbqs?|fences?|planters?|steps|letterbox\w*))|masonry fences?|block (?:piers?|retaining walls?)|blockwork retaining walls?|blocklay\w*|bricklay\w*|brickwork|brick (?:boundary )?walls?|masonry|core[- ]fill\w*)\b/i;
const PLASTER_WORK = /\b(plasterboard|gyprock|drywall|set(?:ting)? compound\w*|cornices?|suspended (?:grid )?ceilings?|grid ceilings?|ceiling (?:grids?|sheets?|linings?)|plasterers?|sand\w* (?:the )?joints?)\b/i;
const FLOOR_WORK = /\b(carpet\w*|vinyl|rubber floor\w*|floor coverings?|timber floor\w*|engineered timber|floating floors?|levelling compound\w*)\b/i;

const GLAZING_WORK = /\b(glass balustrades?|balustrades?|shower screens?|internal glazing|glass partitions?|mirrors?|mullions?|(?:install|replac|fit|glaz)\w*\b[^.]{0,30}\b(?:windows?|window panes?|glass(?! ?wool| ?fibre)))\b/i;
// Work on engineered stone already installed: removing, repairing, modifying or disposing of it.
const ENG_STONE_INSTALLED = /\b(remov\w*|repair\w*|modif\w*|dispos\w*|existing|already installed|installed engineered stone|demolish\w*|strip\w*)\b/i;
const STONE_WORK = /\b(benchtops?|stone (?:slabs?|vanit\w*)|splashbacks?)\b/i;

const FIRE_SERVICES = /\b(sprinklers?|hydrants?|fire services?|fire mains?|fire pumps?|fire pipework|fire hose reels?)\b/i;
const LIFT_WORK = /\b(install\w*[^.]{0,30}\blifts?\b(?!\s+pits?)|lift (?:shafts?|wells?|cars?|rails?|motor rooms?|machines?|landing doors?)|car tops?|landing doors?)\b/i;
const PASSIVE_FIRE = /\b(fire stopping|firestopping|fire[- ]stop\w*|passive fire|fire collars?|penetration seal\w*|fire[- ]rated (?:sealants?|mastics?|foams?|batts?)|(?:seal\w*|fill\w*)[^.]{0,30}\b(?:fire ?walls?|fire[- ]rated walls?))\b/i;
const LANDSCAPE = /\b(landscap\w*|planters?|planting|plant\w* (?:\d+ )?(?:new )?trees|green roofs?|roof gardens?|plant (?:a |the )?hedges?|hedges?|mulch|turf|paving|pavers?|irrigation)\b/i;
// Stadium work.
const EARTHWORKS = /\b(cut and fill|bulk earthworks|earthworks|(?:bull)?dozers?|graders?|(?<!belt )(?<!conveyor )scrapers?|excavation works? for (?:the )?site|site excavation|backfill\w* and compact\w*|compact\w* (?:the )?subgrades?|grade to level|site cut)\b/i;
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
const asbestosLikely = (text) => (/\b(?:paint\w*|clean\w*|pressure wash\w*|re-?coat\w*)\b[^.]{0,20}\b(?:a |the )?(?:house |existing |old )?roofs?\b/i.test(String(text || '')) && !/\b(colorbond|metal|iron|steel|new|tiled?|tiles)\b/i.test(String(text || '')) && !/\bbuilt (?:in )?(?:200[4-9]|20[1-9]\d)\b/i.test(String(text || ''))) || /\b(replac|remov|chang|upgrad)\w* (?:a |the )?(?:old |existing |residential )?(?:main )?(?:switchboards?|meter (?:box|board|panel)s?)\b/i.test(String(text || '')) || (/\brewir\w*\b/i.test(String(text || '')) && OLDER_BUILDING.test(String(text || ''))) || (/\b(strip[- ]?outs?|demolish\w*|demolition)\b/i.test(String(text || '')) && !/\b(temporary|formwork|falsework|scaffold\w*)\b/i.test(String(text || '')) && !/\bbuilt (?:in )?(?:200[4-9]|20[1-9]\d)\b/i.test(String(text || ''))) || DISTURB.test(String(text || '')) && (ASBESTOS_MATERIAL.test(withoutNewMaterial(text)) || (OLDER_BUILDING.test(String(text || '')) && /\b(walls?|ceilings?|floors?|eaves|roofs?|bathroom|kitchen|laundry|sheets?|linings?)\b/i.test(String(text || '')) && !(/\b(sandstone|stone|bricks?|brickwork|masonry|blockwork|bluestone|granite)\b/i.test(String(text || '')) && /\b(re-?point\w*|rak\w* out|mortar|clean\w*|repair\w*)\b/i.test(String(text || '')) && !/\b(ceilings?|eaves|sheets?|linings?|fibro|vinyl)\b/i.test(String(text || '')))));
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
const isTiling = (text) => TILING_WORK.test(String(text || '').replace(/\broof(?:ing)? tiles?\b/gi, '').replace(/\b(?:carpet|vinyl|rubber|lino\w*|ceiling|acoustic|tactile) (?:\w+ )?tiles?\b/gi, '').replace(/\bgrout\w* (?:the )?(?:\w+ )?(?:ducts?|bases?|base ?plates?|anchors?|tendons?|cores?|bars?|piles?|sleeves?|connections?|dowels?|joints? between panels)\b|\b(?:duct|base|non-shrink|structural|anchor) grout\w*\b/gi, ''));

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
const HOUSE_JACKING = /\b(re-?stump\w*|(?:replac|chang)\w* (?:the )?(?:old |rotten |timber )*stumps|jack\w* (?:up )?(?:the |a )?(?:\w+ )?houses?|rais\w* (?:the |a )?(?:\w+ )?houses?|lift\w* (?:the |a )?(?:\w+ )?houses?|underpin\w*)\b/i;
const SUBFLOOR_REPAIR = /\b(?:replac\w*|repair\w*|sister\w*)\b[^.]{0,30}\b(?:rotten |damaged |old )?(?:timber )?(?:floor )?(?:joists?|bearers?)\b/i;
const DEMOLITION = /\b(demolition|demolish\w*|implod\w*|knock(?:ing)? down|pull(?:ing)? down)\b/i;
const ROAD = /\b((?:live|busy|public|main) (?:roads?|streets?)|(?:in|on|under|across|along|beside) (?:a |the )?(?:live |busy |public |council |main |existing |rural |country |local |sealed |gravel |estate |suburban |residential )?(?:roads?|streets?|highways?)(?! (?:reserves?|verges?))|(?:road|street|traffic|signalised|busy) intersections?|at (?:a |an |the )?(?:new |busy |major |signalised )?intersections?|traffic lights|traffic signals|over the footpath|footpath protection|hoardings? (?:on|along|over|to) (?:the |a )?footpaths?|footpath closures?|highways?|road\s?works?|street loading zones?|(?:in|from|on) the street|kerbside|traffic control|traffic management|on the road|(?:adjacent to|next to|beside|alongside) (?:a |the )?(?:road|street|highway)|street frontage|open to traffic|live traffic|carriageway|railway|rail corridor|shipping lane|motorways?|freeways?|next to (?:live )?traffic|rural roads?|road pavements?|road upgrades?|on-?ramps?|roundabouts?|live buses|bypass(?:es)?|overpass(?:es)?|bridges? over (?:a |the )?(?:busy |live )?(?:roads?|motorways?|highways?)|(?:resurfac\w*|reseal\w*) (?:a |the )?(?:roads?|streets?|lanes?)|kerbs? and channel|crossovers?|reinstat\w* (?:the )?asphalt|asphalt reinstat\w*)\b/i;
// "Any traffic control required" is a general clause: it names no road the work is on.
const CONDITIONAL_TRAFFIC = /\b(?:any|such)\s+(?:required\s+|necessary\s+)?traffic\s+(?:control|management)(?:\s*\/\s*(?:control|management))?|\btraffic\s+(?:control|management)\s+(?:if|where|when|as)\s+(?:required|necessary|needed)\b/gi;
// Work in a road reserve is beside the road. A footpath, verge or nature strip carries
// only pedestrians, so work on one is beside a road in use only where the text also
// names the road, its traffic or kerb, or the council's road reserve.
function besideRoad(raw) {
  const text = String(raw || '');
  if (/\b(in|on|along|across|under) (?:the |a )?(?:council |public )?road reserves?\b/i.test(text)) return true;
  return /\b(in|on|along|across|under) (?:the |a )?(?:council |public )?(?:footpaths?|verges?|nature strips?)\b/i.test(text)
    && /\b(roads?|roadways?|streets?|traffic|kerbs?|carriageways?|highways?|crossovers?|vehicles?|council)\b/i.test(text.replace(/\broad reserves?\b/gi, ' '));
}
// Track work and work beside running lines are in or next to a railway in use.
// Ballast is track ballast only beside track words: roofs and planters have gravel ballast too.
const RAIL_RAW = /\b(rail (?:lines?|tracks?)|live track|track possessions?|during (?:a|the) possession|road rail vehicles?|rail overhead wiring|overhead wiring with|track laying|track maintenance machines?)\b/i;
const RAIL_IN_USE = { test: (text) => RAIL_RAW.test(String(text || '')) || /\bballast\b/i.test(String(text || '')) && /\b(rail\w*|tracks?|sleepers?|trains?|tamp\w*)\b/i.test(String(text || '')) };
const WATER = /\b(drown(?:ing)?|in or near water|pool waterlines?|(?:through|in|over|across) (?:a |the )?wetlands?|(?:filled|full) (?:swimming )?pools?|pools? (?:that is |is )?(?:filled|full|holding water)|around (?:a |the )?(?:filled |full )?(?:swimming )?pool|diving (?:towers?|platforms?)|mov(?:e)?able pool floors?|(?:into|in) (?:a |the )?(?:swimming |competition |lap |\d+ ?m )?pool(?![- ]?(?:lights?|lighting|cleaners?|equipment|plant|services|pumps?|filters?|distribution|switchboards?|controllers?|fence|fencing)\b)|(?:over|into|beside|next to|along) (?:a |the )?(?:tidal )?(?:river|creek|lake|sea|harbour|dam|canal|water)|(?:river|creek|lake|harbour|canal|sea|ocean|dam|water(?:way)?)s? (?:is )?(?:directly )?(?:below|beneath|underneath)|(?:near|above|adjacent to|alongside|beside|by|over) (?:a |the )?(?:tidal |fast[- ]flowing |open )?(?:river|creek|lake|harbour|canal|ocean|dam wall|waterways?|open water|water(?! (?:meters?|tanks?|heaters?|pipes?|pipework|mains?|services?|lines?|supply|supplies|connections?|filters?|treatment|proofing|based|jets?|blast\w*|carts?|trucks?|bottles?|coolers?))(?=\b))|(?:over|above) (?:a |the )?(?:swimming |lap |public )?pools?(?! (?:fences?|fencing|equipment|plant|rooms?|decks?|surrounds?|areas?|copings?|edges?|tiles?|houses?|pumps?|filters?))|jetty|wharf|pontoon|boat ramp|sea ?wall|breakwaters?|(?:from|on) (?:a |the )?(?:jack-?up )?barges?|jack-?up barges?|dredg\w*)\b/i;

function isScaffoldErection(text) {
  return /\bscaffold\w*\b/i.test(String(text || '').replace(/\bmobile scaffold\w*/gi, '')) && (/\b(erect\w*|dismantl\w*|strik\w* (?:the )?scaffold|alter\w*)\b/i.test(text) || /\b(?:install\w*|build\w*) (?:a |the )?(?:temporary |new )?scaffold\w*/i.test(text));
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
  // Building a house or granny flat means work on the top plate, trusses and roof; a
  // dumbwaiter or lift shaft opens a drop between floors.
  if (/\b(roof trusses|granny flat kits?|kit homes?|(?:build\w*|construct\w*|erect\w*) (?:a |the )?(?:new )?(?:house|home|granny flat)s?|dumbwaiters?|lift shafts?|lift wells?)\b/i.test(source)) return true;
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
    // Fall protection being installed is the work, not the control for a fall during it.
    if (/^\s*(?:install|erect|fit|put up|remov|dismantl|strip)\w*\b[^,.;]{0,40}\b(?:edge protection|guard ?rails?|fall arrest anchors?|anchor points?|static lines?|safety (?:mesh|nets?)|travel restraint)/i.test(line) && !/\b(?:from|with|using|behind|inside|working)\b/i.test(line)) return false;
    // The scaffold being put up is the work, not the control for a fall during that work.
    const scaffoldIsWork = /\bscaffold\w*\b/i.test(line) && (/\b(erect\w*|dismantl\w*|strik\w*|alter\w*)\b/i.test(line) || /\b(?:install\w*|build\w*|put up)\s+(?:an? |the )?(?:temporary |new |mobile )*scaffold/i.test(line));
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
  // "A 1.2 m trench" and "excavate to 1.2 m": a figure of 6 m or less before the word trench,
  // or after "to" following a dig, is the depth (a longer figure is the trench's length).
  const before = /\b(\d+(?:\.\d+)?)\s*m(?:etre|eter)?s?\s+(?:deep\s+)?(?:trench(?:es)?|excavations?|shafts?|pits?)\b|\b(?:excavat\w*|dig\w*|trench\w*)\b[^.]{0,25}?\bto\s+(?:a depth of\s+)?(\d+(?:\.\d+)?)\s*m\b(?!\s*(?:long|wide|from|away))/gi;
  while ((match = before.exec(String(text || '')))) {
    const value = Number(match[1] || match[2]);
    if (value > 0 && value <= 6) depths.push(value);
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
// Trench drains, cable trenches in a floor, and the sides and bottoms of trenches others
// dug (to treat or line them) are not an excavation this crew digs.
const NOT_DUG = /\btrench (?:drains?|grates?|covers?)\b|\bcable trenches\b|\btrenches in (?:the )?(?:switch|plant|pump|comms) ?rooms?\b|\b(?:sides?|bottoms?|bases?|floors?|walls?)(?:\s+and\s+(?:sides?|bottoms?|bases?|floors?|walls?))?\s+of\s+(?:the\s+|all\s+)?trench\w*/gi;

function deepExcavation(text) {
  text = String(text || '').replace(/\b(?:lift|riser|service|ventilation|stair)\s+shafts?\b|\bin the shafts\b|\bshaft ?walls?\b/gi, ' ');
  if (LIFT_WORK.test(text)) text = text.replace(/\bshafts?\b/gi, ' ');
  text = text.replace(NOT_DUG, ' ');
  if (/\btunnel\w*\b/i.test(text)) return true;
  if (!/\b(trench\w*|shaft)\b/i.test(text)) {
    // A dig with a stated depth over 1.5 m is a trench or shaft, whatever it is called.
    // Basements and bulk excavation are not trenches or shafts.
    // A pump station wet well is a shaft.
    if (/\b(?:install\w*|construct\w*|build\w*)\b[^.]{0,60}\b(?:pump station )?wet wells?\b/i.test(text)) return true;
    if (/\b(diaphragm walls?|secant (?:pile )?walls?)\b/i.test(text)) return true;
    // A main or pipe of 900 mm or more sits in a trench well over 1.5 m deep.
    const bore = text.match(/\b(\d{3,4}) ?mm\b[^.]{0,30}\b(?:mains?|pipes?|pipelines?|culverts?)\b/i);
    if (bore && Number(bore[1]) >= 900 && /\b(lay\w*|install\w*)\b/i.test(text)) return true;
    // Detention and other underground tanks, and digging down beside a basement wall, go well past 1.5 m.
    if (/\b(?:install\w*|construct\w*|build\w*)\b[^.]{0,40}\b(?:detention|retention|underground|in-ground|below-ground)\s+(?:\w+\s+)?tanks?\b/i.test(text) && !trenchDepths(text).some((depth) => depth <= 1.5)) return true;
    if (/\bbasement walls?\b[^.]{0,40}\b(?:from )?(?:the )?outside\b|\boutside of (?:a |the )?basement walls?\b/i.test(text)) return true;
    return /\b(sewer\w*|pipe\w*|lines?|pits?|drains?|stormwater|services?|conduits?|cables?|mains?|manholes?|maintenance holes?)\b/i.test(text) && /\b(excavat\w*|dig\w*|lay\w*|connect\w*|install\w*)\b/i.test(text) && !/\b(basements?|bulk excavat\w*|detailed excavat\w*)\b/i.test(text) && trenchDepths(text).some((depth) => depth > 1.5);
  }
  const depths = trenchDepths(text);
  // A cable, conduit or irrigation trench of unstated depth on a house or garden job is not taken as deep.
  if (!depths.length && /\b(cables?|conduits?|irrigation|garden|sheds?|garages?|downpipes?|ag(?:ricultural)? drains?)\b/i.test(text) && !/\b(sewer\w*|mains?|manholes?|maintenance holes?|roads?|subdivisions?|highways?|deep|hv|high voltage|substations?)\b/i.test(text)) return false;
  return !depths.length || depths.some((depth) => depth > 1.5);
}

function trenchDig(text) {
  // Diaphragm wall panels are dug under support fluid and no one enters them.
  return deepExcavation(String(text || '').replace(/\btunnel\w*\b/gi, ' ')) && !/\bdiaphragm walls?\b/i.test(String(text || ''));
}

function trenchSupportText(text) {
  const lines = sentences(text).filter((line) => /\b(shor(?:e|ed|ing)|bench(?:ed|ing)|batter(?:ed|ing)?|trench (?:box|shield)|shields?|engineer\w*)\b/i.test(line))
    .map((line) => (/^(?:excavat\w*|dig\w*|lay\w*|install\w*)\b/i.test(line) && /\b(?:trench (?:box\w*|shields?)|shields?)\b/i.test(line) && !/\b(shor(?:e|ed|ing)|bench(?:ed|ing)|batter(?:ed|ing)?|engineer\w*)\b/i.test(line) ? 'The trench is supported with trench shields.' : line));
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

// Demolishing a whole building or structure, as opposed to strip-out of linings, partitions or
// fit-outs. A longer description, such as "a three storey concrete commercial building", or a
// warehouse or car park, is a whole structure too.
// Bringing a chimney, stack, silo or other structure down with explosives is demolishing it.
const DEMOLISH_STRUCTURE = /\b(?:(?:demolish|implod)\w*|(?:knock|pull)(?:s|ed|ing)? down)\b(?:(?!\b(?:non[- ]load[- ]bearing|partitions?|internal|interior|fit-?outs?|linings?|ceilings?|kitchens?|bathrooms?|inside|within|in the)\b)[^.]){0,60}\b(?:buildings?|warehouses?|car ?parks?|factor(?:y|ies)|towers?|structures?|grandstands?|chimneys?|(?:chimney )?stacks?|silos?|offices?|office blocks?|schools?|hospitals?|hotels?)\b/i;
const WHOLE_DEMOLITION = new RegExp(`\\bdemolish\\w*\\b[^.]{0,30}\\b(?:garages?|sheds?|houses?|buildings?|dwellings?|granny flats?|bridges?)\\b|${DEMOLISH_STRUCTURE.source}`, 'i');

function valveWiringOnly(text) {
  return String(text || '').replace(/[^.]+\.?/g, (sentence) => (/\b(wir\w*|cabl\w*|signals?|interfac\w*|interlock\w*|fire (?:alarm |indicator )?panels?|fips?)\b/i.test(sentence) && !/\b(pipe\w*|gas ?fitt\w*|gas lines?|regulators?|meters?)\b/i.test(sentence) ? sentence.replace(/\bgas (?=(?:safety )?(?:shut[- ]?off|isolation|isolating|solenoid) valves?\b)/gi, '') : sentence));
}

function highRiskMatches(raw, answer, state) {
  // "Prior to the energisation of a building" is a point in time, not work near energised parts.
  const text = String(raw || '').replace(BUILDING_ENERGISATION, ' ');
  const checks = {
    fall: fallRiskFor(text, answer),
    tower: mentioned(text, /\b(telecommunications? towers?|(?:mobile (?:phone )?|phone|radio|comms|communications) towers?)\b/i),
    // Demolishing a whole building takes down its load-bearing parts.
    // Removing a wall's bracing takes out a load-bearing element (Safe Work Australia's example).
    // Temporary bracing, props, formwork and falsework are left out of demolition work (schedule 19).
    demolition: mentioned(text, LOAD_BEARING_REMOVAL) || sentences(text).some((line) => /\bremov\w*[^.]{0,20}\b(?:the |a )?(?:wall |roof |structural )?bracing\b/i.test(line) && !/\b(temporary|temp|props?|falsework|formwork|tilt[- ]?up|precast)\b/i.test(line)) || mentioned(text, DEMOLITION) && (mentioned(String(text || '').replace(/\bnon[- ]load[- ]bearing\b/gi, ''), /\b(load-bearing|load bearing|structur\w*)\b/i) || WHOLE_DEMOLITION.test(String(text || ''))) || /\b(?:remov\w*|demolish\w*|lift\w* out)\b[^.]{0,30}\bbridge (?:decks?|spans?|beams?|girders?)\b/i.test(String(text || '')),
    asbestos: mentioned(text, /\basbestos\b/i),
    // Structural alterations or repairs to an existing structure that need temporary support.
    // Propping and backpropping new formwork and slabs is not an alteration or repair.
    // Stripping formwork or removing back props takes away temporary works; it alters or repairs nothing.
    temporary: mentioned(text, /\bstructural alterations?\b/i) || mentioned(text, LOAD_BEARING_REMOVAL) || mentioned(text, MASONRY_OPENING) || mentioned(text, SUBFLOOR_REPAIR) || mentioned(text, HOUSE_JACKING) || (mentioned(text, /\b(temporary (?:support|props?)|props?|propping|propped)\b/i) && mentioned(String(text || '').replace(/\b(?:strip\w*|remov\w*|dismantl\w*)\b[^.]{0,30}?\b(?:back[- ]?)?(?:props?|propping|shores?|formwork|falsework)\b/gi, ' '), /\b(alter\w*|repair\w*|existing|remov\w*|demoli\w*|load[- ]bearing|openings?|underpin\w*)\b/i)),
    confined: mentioned(text, /\bconfined space\b/i),
    trench: deepExcavation(text),
    // Explosive-powered tools are not the use of explosives (Safe Work Australia SWMS guidance).
    explosives: mentioned(String(text || '').replace(/\bexplosive[- ]?(?:powered |power |actuated )?(?:tools?|nail guns?|fixing tools?)\b/gi, ' ').replace(/\b(?:abrasive|sand|grit|garnet|water|soda|bead|shot|dry ice|hydro|ice|media|pressure)[- ]?blast\w*|\bblast\w* (?:and (?:paint|coat)\w*|clean\w*)/gi, ' '), /\b(explosives?|blasting|drill\w* and blast\w*|blast (?:holes?|patterns?)|shot ?fir\w*|charg\w* (?:the )?(?:blast )?holes?)\b/i),
    // Wiring a fire panel or interlock to a gas shut off valve is electrical work on the valve's
    // controls, not work on the gas piping.
    gas: mentioned(valveWiringOnly(text), /\b(gas mains?|pressuri[sz]ed gas|(?:existing |live |natural |reticulated )?gas (?:lines?|pipe\w*|supply|services?|meters?)|connect\w*[^.]{0,30}\bgas\b)\b/i),
    chemicalLine: mentioned(text, /\b((?:fuel|refrigerant|chemical)(?: or (?:fuel|refrigerant|chemical))? lines?)\b/i),
    electrical: mentioned(text, /\b(connect\w*[^.]{0,40}\b(?:to|into) (?:the )?(?:electricity )?supply|solar (?:panels?|pv|photovoltaic|arrays?|systems?)|photovoltaic|inverters?|energised|energized|energis(?:e|ing|ation)|overhead (?:power |electric )?lines?|power lines?|live (?:electrical|parts?|switchboards?|circuits?)|(?:energised|energized|live) electrical (?:installations?|services?))\b/i)
      // Live or existing underground power cables are energised electrical services.
      || /\b(?:live|energised|energized)\s+(?:(?:underground|buried|electrical|electric|power|hv|high voltage|\d+(?:\.\d+)? ?kv)\s+){0,2}cables?\b|(?<!\bnew\s)\b(?:underground|buried)\s+(?:(?:live|energised|energized|electrical|electric|power|hv|high voltage|\d+(?:\.\d+)? ?kv)\s+){1,2}(?:cables?|lines?|services?|mains)\b|\b\d+(?:\.\d+)? ?kv\s+(?:underground\s+)?cables?\b/i.test(String(text || '')),
    // Hot cutting into pipework or tanks that may hold chemical or fuel residue (Safe Work Australia's example).
    atmosphere: mentioned(text, /\b(flammable atmosphere|contaminated atmosphere)\b/i) || /\b(residues?|traces?)\b[^.]{0,30}\b(?:hazardous )?(chemicals?|fuels?|flammable|hydrocarbons?|solvents?)\b|\b(?:pipework|pipes?|tanks?|drums?|vessels?)\b[^.]{0,30}\b(?:may |that |which )?(?:contain|held|hold)\w*\b[^.]{0,30}\b(chemicals?|fuels?|flammable|hydrocarbons?|solvents?)\b/i.test(String(text || '')),
    // Drilling or fixing to precast units already in place is not precast work.
    // "Tilt up", "tilt panels" and "tilt slabs" are tilt-up work as much as "tilt-up".
    precast: mentioned(withoutWorkIntoPrecast(text), /\b(tilt[- ]?up|tilt (?:panels?|slabs?|walls?)|precast)\b/i),
    // Work in a footpath or verge is next to the road it runs beside.
    road: mentioned(String(text || '').replace(CONDITIONAL_TRAFFIC, ' '), ROAD) || /\b(?:adjacent to|next to|alongside) (?:an? |the )?(?:existing |live |busy |public |operating )?(?:roads?|roadways?|streets?|highways?|motorways?|freeways?)\b/i.test(String(text || '')) || mentioned(text, RAIL_IN_USE) || /\blight rail\b/i.test(String(text || '')) || besideRoad(text),
    // Trenches and site excavation are dug by machine unless the task says by hand.
    plant: (/\b(excavat\w*|dig\w*)\s+(?:the\s+|all\s+|new\s+|and\s+\w+\s+(?:a\s+|the\s+)?(?:new\s+)?)?(?:\w+\s+)?(?:trench\w*|site|footings?|pits?|basement|swales?|sewer|line|drains?|stormwater|services?|pipes?)\b|\bbulk excavat\w*/i.test(String(text || '')) && !/\b(?:by hand|hand[- ]dig\w*|hand excavat\w*)\b/i.test(String(text || ''))) || mentioned(text, /\b((?:piling|cfa|bored pil\w*|drill(?:ing)?|hdd) rigs?|directional(?:ly)? (?:drill|bor)\w*|(?:excavator[- ]mounted )?pile croppers?|rock break(?:ers?|ing)|hydraulic hammers?|elevating work platforms?|ewps?|scissor lifts?|boom lifts?|powered mobile plant|concrete pump(?: truck)?s?|pump trucks?|boom pumps?|telehandlers?|excavators?|forklifts?|trucks?|(?<!tower )cranes?(?!\s+(?:company|companies|crew|operators?)\b)|loaders?|liebherr|skid ?steers?|bobcats?|posi-?tracks?|(?:vibrating|smooth drum|padfoot|ride-on|road|compaction) rollers?)\b/i)
      // Concrete trucks come into the work area for every slab, path or driveway pour.
      || (SLAB_GROUND.test(String(text || '')) && !SMALL_POUR.test(String(text || '')) && !/\bbefore (?:the )?(?:slab )?(?:is )?pour\w*\b/i.test(String(text || '')) && (/\bpour\w*\b/i.test(String(text || '')) || /\bconcrete\b/i.test(String(text || '')) && /\b(lay\w*|plac\w*|construct\w*|build\w*|install\w*|form\w*)\b/i.test(String(text || ''))))
      // Pavers, rollers and trucks lay asphalt.
      || /\b(?:lay\w*|plac\w*|pav\w*)\b[^.]{0,30}\b(?:asphalt|hotmix|hot mix)\b|\basphalt (?:laying|paving|resurfac\w*|overlay)\b/i.test(String(text || '')),
    // An enclosed roof cavity in hot weather is Safe Work Australia's example.
    // So is work inside a freezer room or cold store that is running, or a kiln, furnace or oven that is hot.
    temperature: mentioned(text, /\bartificial extremes of temperature\b/i) || /\b(?:operating|in[- ]service|running|live|working)\s+(?:\w+\s+)?(?:freezer rooms?|freezers?|cold (?:stores?|rooms?)|cool ?rooms?|kilns?|furnaces?|ovens?)\b|\b(?:in|inside|within)\s+(?:an?\s+|the\s+)?(?:\w+\s+)?(?:freezer rooms?|freezers?|cold (?:stores?|rooms?)|cool ?rooms?)\b[^.]{0,40}(?:\bminus\s?\d+|-\d+\s?(?:°\s?C|degrees|C\b))|\b(?:hot|fired|lit)\s+(?:kilns?|furnaces?|ovens?)\b/i.test(String(text || '')) || /\broof (?:cavit(?:y|ies)|spaces?)\b[^.]{0,40}\bhot (?:weather|days?|conditions)\b|\bhot (?:weather|days?|conditions)\b[^.]{0,40}\broof (?:cavit(?:y|ies)|spaces?)\b/i.test(String(text || '')),
    water: mentioned(text, WATER) && !/\b(before the pool is filled|empty pools?|unfilled pools?|pools? (?:is )?not (?:yet )?filled|drained pools?)\b/i.test(String(text || '')),
    diving: mentioned(String(text || '').replace(/\bdiving (?:towers?|platforms?|boards?|blocks?|pools?|wells?)\b/gi, ' '), /\b(diving|divers?)\b/i),
    // Victoria, regulation 322: any demolition, trenches and shafts apart from tunnels,
    // and roads or railways without shipping lanes.
    demolitionAny: mentioned(text, DEMOLITION) || /\b(?:remov\w*|lift\w* out)\b[^.]{0,30}\bbridge (?:decks?|spans?|beams?|girders?)\b/i.test(String(text || '')),
    trenchOrShaft: /\b(trench\w*|shaft)\b/i.test(text) && deepExcavation(text.replace(/\btunnel\w*\b/gi, '')),
    tunnel: mentioned(text, /\btunnel\w*\b/i),
    roadOrRail: mentioned(String(text || '').replace(/\bshipping lanes?\b/gi, '').replace(CONDITIONAL_TRAFFIC, ' '), ROAD) || mentioned(text, RAIL_IN_USE),
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
// A directional drill's 'entry and exit pits' are where the bore starts and ends, not spaces entered.
const ENTERED_SPACE = /\b(?:(?:enter\w*|entry(?!(?: and exit| or exit|\/exit)? pits?\b)|inside|work in|working in)\b[\w\s,-]{0,40}\b(?:pits?|sumps?|tanks?|manholes?|maintenance holes?|sewers?|wet wells?)|(?:repair\w*|re-?lin\w*|coat\w*|clean\w*)\b[\w\s,-]{0,40}\b(?:inside of|inside|interior of|internal\w*)?\b[\w\s,-]{0,20}\b(?:water |rain\w* |concrete |fuel |storage )?tanks?)\b/i;
// Welds that are only painted over, touched up or sealed are not welding.
const HOT_WORK = /\b(braz\w*|solder\w*|hot work|gas torch\w*|oxy[- ]?acetylene|(?<!heat |hot air |plastic |poly |vinyl |seam )(?<!\b(?:paint\w*|touch\w* up|blend\w*|coat\w*|seal\w*)(?: (?!(?:and|then|or|weld\w*)\b)[\w']+){0,3} )weld(?:ing|s|ed)?(?! (?:the )?(?:vinyl|seams?|joins)))\b/i;
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
  if (id === 'scaffoldType') return scaffoldTypeAnswer(text);
  if (id === 'energisedWork') {
    if (/\b(testing|commissioning|energised parts|within 3 ?m)\b/.test(text)) return 'testing';
    if (/\b(none|no|de-energised)\b/.test(text)) return 'none';
  }
  return '';
}

// The kind of scaffold, from the choice or from words in the task. It sets the licence class.
function scaffoldTypeAnswer(text) {
  const value = String(text || '').toLowerCase();
  if (['modular', 'tubecoupler', 'hung', 'mobile'].includes(value.replace(/[^a-z]/g, ''))) return value.replace(/[^a-z]/g, '') === 'tubecoupler' ? 'tubeCoupler' : value.replace(/[^a-z]/g, '');
  // Schedule 3: hung and suspended scaffolds are advanced; cantilevered, spur and tube and coupler intermediate.
  if (/\b(hung|suspended) scaffold\w*|\bhung\b/.test(value)) return 'hung';
  if (/\btube[- ]and[- ](?:coupler|fittings?)\b|\bcantilever\w* scaffold\w*|\bspur scaffold\w*/.test(value)) return 'tubeCoupler';
  if (/\b(mobile|aluminium tower|alloy tower|tower scaffold)\b/.test(value)) return 'mobile';
  if (/\b(modular|system scaffold\w*|kwik-?stage|ringlock|cuplock|layher|frame scaffold\w*)\b/.test(value)) return 'modular';
  return '';
}
// The crew erects, alters or dismantles a scaffold (not one only used by them).
const SCAFFOLD_ERECTED = /\b(erect\w*|dismantl\w*|alter\w*|build(?!ing\b)\w*|install\w*|put up|strip\w*)\b(?:(?!\b(?:from|off|using|with|on)\b)[^.]){0,40}\bscaffold|\bscaffold\w*\b[^.]{0,20}\b(erect\w*|dismantl\w*)/i;

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
const ICT_WORK = /\b(wi-?fi|wireless (?:access points?|aps?|networks?)|waps?|data cabl\w*|data points?|data networks?|network cabl\w*|comms|communications|telecommunications|ict|structured cabling|optical fibre|fibre optic\w*|fibre(?![- ]?(?:cement|glass|board|reinforced|optic))|cat ?6a?|cctv|access control|intercoms?|security (?:systems?|cameras?|equipment)|card readers?|nbn|wireless access points?|matv|antennas?|nurse call|pabx|ip telephony|(?:tele)?phone systems?|handsets?|phone points?|server racks?|comms racks?)\b/i;
const SECURITY_WORK = /\b(cctv|access control|electronic (?:door )?lock\w*|door locking systems?|intercoms?|security (?:systems?|cameras?|equipment)|card readers?|alarms?|intrusion detect\w*)\b/i;
const POWER_WORDS = /\b(electrician|electrical|switchboards?|distribution boards?|consumer mains|light fittings?|power points?|busduct|construction (?:power|wiring)|temporary (?:power|lighting)|mains power)\b/i;
// Electronic door locking and intrusion detection cabling is extra low voltage security work too.
const ELV_SECURITY = /\b(electronic (?:door )?lock\w*|door locking (?:systems?|cabling)|intrusion detect\w*|security alarms?|duress alarms?)\b/i;
const ELECTRICAL_CORE = { test: (text) => ELECTRICAL_RAW.test(String(text || '')) && (!(ICT_WORK.test(String(text || '')) || ELV_SECURITY.test(String(text || ''))) || POWER_WORDS.test(String(text || ''))) };
const ELECTRICAL_WORK = ELECTRICAL_CORE;
const SWITCHBOARD_WORDS = /\b(main switchboards?|consumer mains|energis\w*|commission\w*|terminat\w*|distribution boards?|(?:replac\w*|upgrad\w*|chang\w*|install\w*) (?:the |a |new )?(?:main )?switchboards?)\b/i;
// "Prior to the energisation of a building" is a point in time, not switchboard work.
const BUILDING_ENERGISATION = /\b(?:prior to|before|after|until) (?:the )?energis\w* of (?:a|the|each) building\b/gi;
const SWITCHBOARD_WORK = { test: (text) => SWITCHBOARD_WORDS.test(String(text || '').replace(BUILDING_ENERGISATION, '')) && ELECTRICAL_CORE.test(String(text || '')) };
// A plumber's work.
// A mechanical (HVAC) contractor's work. Its pipework is not plumbing unless plumbing words are used too.
const MECHANICAL_WORK = /\b(mechanical services|heat recovery ventilat\w*|hrv|erv|ventilation systems?|evaporative coolers?|hvac|ducted (?:gas )?heating|ducted (?:air|systems?)|air[- ]?condition\w*|ductwork|duct(?:ing| runs?| sections?)|refrigerant|refrigeration|split systems?|fan coil units?|fcus?|ahus?|air handling units?|chillers?|cooling towers?|condensers?|condensing units?|jet fans?|exhaust fans?|chilled water|vrf|vrv)\b/i;
const SPLIT_INSTALL = /\binstall\w*\b[^.]{0,40}\b(?:split systems?|(?:wall[- ]mounted |wall )?air ?conditioning units?(?! on (?:the|a) roof)|air ?conditioners?(?! on (?:the|a) roof))\b/i;
const REFRIGERANT = /\b(refrigerant|refrigeration|split systems?|condensing units?|vrf|vrv|reverse cycle|ducted air ?condition\w*)\b/i;
const PLUMBING_ONLY_WORDS = /\b(plumb\w*|sanitary|sewer\w*|drain\w*|hot water|cold water|tapware|toilets?|basins?)\b/i;
function isPlumbing(text) {
  // Subsoil drains on a sports field carry groundwater, not sewage, so they are not drainage under the plumbing law.
  let sub = false;
  const source = String(text || '').replace(/\b(?:subsoil|agricultural|ag) drain\w*\b/gi, (m) => { sub = true; return ''; }).replace(/\bdrainage pipes?\b/gi, (m) => (sub ? '' : m));
  return PLUMBING_WORK.test(source) && (!(MECHANICAL_WORK.test(source) || WATERPROOFING.test(source) || FIRE_SERVICES.test(source) || MEDICAL_GAS.test(source) || PNEUMATIC_TUBE.test(source)) || PLUMBING_ONLY_WORDS.test(source));
}
const PLUMBING_WORK = /\b(plumb\w*|hydraulic (?:services|risers?|pipework|pipes?|stacks?)|drain\w*|sewer\w*|sanitary|pipes?|pipework|sleeves?|puddle flanges?|hot water|cold water|tapware|toilets?|basins?|pump rooms?|sumps?|ejection pits?|water tanks?)\b/i;

// A fall control that relies on a harness.
const HARNESS_WORDS = /\b(harness\w*|travel restraint|fall arrest|restraint lanyards?|static lines?|lifelines?)\b/i;

// A fall control answer that relies on a harness brings the harness question.
// A harness or life jacket in use brings questions on the equipment, its checks and the
// user's training: from a harness named in the fall control, or either one in the PPE.
function withHarness(list, facts, ppeIds = []) {
  const out = [...list];
  const add = (id) => {
    if (out.some((item) => item.id === id)) return;
    const item = CATEGORY_FACTS.find((entry) => entry.id === id);
    out.push({ id: item.id, label: item.label, prompt: item.prompt });
  };
  if (HARNESS_WORDS.test(String((facts && facts.fallControl) || '')) || ppeIds.includes('harness')) add('harnessSystem');
  if (ppeIds.includes('lifeJacket')) add('lifeJacketDetails');
  return out;
}

// The PPE in use: the list the user chose, or the one SiteReady ticks for the task.
function ppeInUse(task, facts, state, chosen) {
  if (Array.isArray(chosen)) return chosen;
  return ppeList(task, facts, state).flatMap((group) => group.items.filter((item) => item.ticked).map((item) => item.id));
}

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
    // The kind of scaffold sets the licence class: basic, intermediate or advanced.
    id: 'scaffoldType',
    label: 'Scaffold type',
    prompt: 'Which scaffold the crew erects, alters or dismantles. It sets the scaffolding licence class.',
    choices: [
      { value: 'modular', label: 'Modular (system) scaffold, such as Kwikstage, Ringlock or Cuplock' },
      { value: 'tubeCoupler', label: 'Tube and coupler, cantilevered or spur scaffold' },
      { value: 'hung', label: 'Hung or suspended scaffold' },
      { value: 'mobile', label: 'Mobile scaffold tower' },
    ],
    level: 'Administrative',
    applies: (text) => SCAFFOLD_ERECTED.test(String(text || '').replace(/\bmobile scaffold\w*/gi, 'scaffold')) && !scaffoldTypeAnswer(text),
  },
  {
    id: 'silicaControls',
    label: 'Silica dust controls',
    prompt: 'How silica dust is controlled (wet cutting, on-tool extraction or local exhaust), the respirator and its fit testing, and the written assessment of whether the work is high risk.',
    // The ACT has no written high risk assessment; it sets the controls (s 418B, s 418C, s 418CAA)
    // and an awareness course for high risk crystalline silica work (s 418D).
    statePrompts: { act: 'How silica dust is controlled: the continuous water feed and the other crystalline silica control used (for porcelain, sintered stone and engineered stone, water is always used), any step down section 418CAA allows and why, the respirators and their fit testing, and who carries out high risk crystalline silica work and has done the declared awareness course.' },
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
    // A harness is only as good as its anchors, its inspection and the user's training.
    id: 'harnessSystem',
    label: 'Harness and anchors',
    prompt: 'The harness and lanyard or line used, the anchor points and who rated or installed them, when the harness was last inspected, who trained the users, and the rescue plan.',
    level: 'Administrative',
    applies: (text) => HARNESS_WORDS.test(String(text || '')),
  },
  {
    // Life jackets: the type, their checks and servicing, and rescue from the water. Asked
    // when a life jacket is in the PPE.
    id: 'lifeJacketDetails',
    label: 'Life jackets',
    prompt: 'The type of life jacket (for example level 150 or level 100 to AS 4758), who checks them before use and services inflatable ones as the maker requires, when they must be worn, and how anyone in the water is rescued.',
    level: 'PPE',
    // Asked from the PPE list, not the task's words, so an answer always goes in the SWMS.
    applies: () => false,
    fromPpe: true,
  },
  {
    // Where spoil goes, and whether it is contaminated, decides how it is stockpiled and carted.
    id: 'spoilPlan',
    label: 'Spoil plan',
    prompt: 'Where the spoil goes, whether it is tested or known to be contaminated, and where stockpiles may be kept.',
    level: 'Administrative',
    applies: (text) => /\b(spoil|stockpil\w*|cart\w* (?:the )?(?:spoil |soil |fill )?(?:away|off ?site)|muck\w* (?:away|out)|tip\w* off ?site)\b/i.test(String(text || '')),
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

// A generator load test or load shed checks that the site's plant keeps running or
// restarts. Plant named in such a sentence (pump stations, wet wells, tanks) is only
// checked: it is not built, dug in, entered or pumped, unless the sentence says so.
const POWER_TEST = /\b(load shed\w*|load banks?|load bank test\w*|power (?:disruptions?|failures?|outages?|interruptions?)|black ?start\w*|(?:load )?test\w* (?:the |all |each )?(?:\w+ ){0,2}generators?|generators? (?:testing|test runs?|load tests?)|operation of (?:the )?generators?)\b/i;
const PLANT_WORK = /\b(install\w*|replac\w*|excavat\w*|dig\w*|lay\w*|lower\w*|construct\w*|build\w*|enter\w*|clean\w* out|desludg\w*|remov\w*|plac\w*|connect\w*)\b/i;
const CHECKED_PLANT = /\b(?:(?:sewer(?:age)?|sewage|waste ?water|stormwater|fire|sump|fuel)\s+)?(?:pump(?:ing)? stations?|wet wells?|pumps?|pits?|tanks?|lift stations?)\b/gi;
// Cables fixed to insulators in overhead lines, or hung from catenaries, are the
// cabler's own aerial runs, not live power lines the work is near.
const CABLE_FIXING = /\b(catenar\w*|insulators?|isolators?|saddles?|cable ties?|fixed to|suspended from)\b/i;
// The sentences of a text that match a pattern.
function sentencesWith(text, pattern) {
  return (String(text || '').match(/[^.]+\.?/g) || []).filter((sentence) => pattern.test(sentence));
}

function namedInPassing(text) {
  return String(text || '').replace(/[^.]+\.?/g, (sentence) => {
    let out = POWER_TEST.test(sentence) && !PLANT_WORK.test(sentence) ? sentence.replace(CHECKED_PLANT, 'plant') : sentence;
    if (CABLE_FIXING.test(out) && /\b(cables?|cabling|conduits?|wiring)\b/i.test(out) && !/\b(power lines?|overhead (?:power|electric)|live|energised|existing|near|under|clearances?)\b/i.test(out)) out = out.replace(/\boverhead lines?\b/gi, 'cable runs');
    return out;
  });
}

// Other trades named only as company ("alongside the formwork and reo crews") are
// not this SWMS's work, so they do not choose its steps or required facts.
function ownWork(task) {
  return namedInPassing(task).replace(BUILDING_ENERGISATION, ' ').replace(/\b(?:alongside|beside|next to|near|around|with|among|coordinat\w* with)\s+(?:the\s+)?[\w\s,-]{0,60}?\b(?:crews?|trades?|workers|contractors?|subcontractors?|teams?)\b/gi, ' ');
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
// A fact's question as the state's law puts it.
function factPrompt(item, state) {
  return (item.statePrompts && state && item.statePrompts[state.id]) || item.prompt;
}

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
    if (!asked.has(item.id) && uses(item.id)) extra.push({ id: item.id, label: item.label, prompt: factPrompt(item, state), ...(item.choices ? { choices: item.choices } : {}) });
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
    // The crane's outrigger or track loads need ground confirmed by a competent person.
    // On a piling job the working platform certificate covers it.
    if (!PILING_WORK.test(task)) facts.push({
      id: 'groundBearing',
      label: 'Ground conditions for the crane',
      prompt: 'Who confirmed the ground, slab or platform can carry the crane\'s outrigger or track loads (for example a geotechnical engineer\'s report, or a structural engineer for a slab or deck), the report or certificate, and the mats or pads used.',
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
  if (state && Array.isArray(state.panelFacts) && isConcreteWallPanel(task)) {
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
  if (trenchDig(task) && !trenchSupportText(task)) {
    facts.push({
      id: 'trenchSupport',
      label: 'Trench support',
      prompt: 'How the sides are secured: shoring, benching or battering, and who designed it.',
    });
  }
  // Facts the high risk categories below cannot be done safely without.
  for (const item of CATEGORY_FACTS) {
    if (item.applies(task)) facts.push({ id: item.id, label: item.label, prompt: factPrompt(item, state), ...(item.choices ? { choices: item.choices } : {}) });
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

// The site answers (live services, access and so on) as one piece of text, slang read.
function siteConditions(site) {
  return readSlang(Object.values(site || {}).map(supplied).filter(Boolean).join('\n'));
}

function combinedFacts(task, facts) {
  return [
    task,
    facts.siteConditions,
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

function missingFacts(task, facts, answer, state, ppeIds = []) {
  return withHarness(requiredFactsFor(task, answer, state), facts, ppeIds)
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
    if (!(pack && pack.state && pack.state.ownCrane) && !/\b(?:operat\w*|run\w*)\b[^.]{0,20}\b(?:a |the )?tower cranes?\b/i.test(source)) {
      // A steel erector's own riggers sling and direct the steel.
      push('Administrative', (STEEL_WORK.test(source) || /\bbridge spans?\b/i.test(source)) && /\b(erect\w*|spans?|girders?|portal frames?|columns?|beams?|rafters?|steel frames?|structural steel)\b/i.test(source)
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
      else push('Administrative', `Edge protection, a working platform or an EWP was considered first for any fall of more than ${fallMetres(pack && pack.state)} metres, and is not reasonably practicable for this work because ____.`);
    }
    push(level, fallLine);
  }

  const state = pack && pack.state;
  if (state && isConcreteWallPanel(source)) {
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
    if (value && (item.applies(source) || item.fromPpe)) {
      for (const line of controlRows(value)) {
        push(/\brespirators?\b/i.test(line) && !/\b(extraction|wet|water)\b/i.test(line) ? 'PPE' : /\b(inspect\w*|check\w*|signs?|signed|supervis\w*|trained|procedure|permits?|follows?|assess\w*)\b/i.test(line) ? 'Administrative' : item.level, line);
      }
    }
  }

  const asbestos = keptFact(facts.asbestosArrangement) || asbestosArrangement(source);
  if (asbestos && !isDenialLine(asbestos)) push('Administrative', asbestos);

  const trench = trenchSupportText(acceptedText(source)) || keptFact(facts.trenchSupport);
  if (trenchDig(source) && trench) push('Isolate or engineer', trench);

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

// The summary also names the main hazards of the job steps, so a job with no high risk
// category still lists what it is exposed to: a trench, buried services, the public.
const STEP_HAZARDS = [
  [/^(Excavate|Work in the trench|Dig the trench)/, 'Trench or excavation collapse', 'A person is buried or crushed.'],
  [/^Locate underground services/, 'Underground services', 'A person strikes a live electrical, gas or water service.'],
  [/^Set up traffic management/, 'Traffic', 'A person or a vehicle is struck.'],
  [/^(Excavate|Backfill and restore)/, 'Moving plant', 'A person is struck by plant.'],
  [/^Lay pipes, pits and conduits/, 'Suspended load', 'A person is struck or crushed by a pipe or pit being lowered.'],
  [/^(Saw cut concrete|Drill or cut concrete, masonry or stone|Break out)/, 'Respirable crystalline silica', 'A person breathes in silica dust.'],
];
const PUBLIC_NEARBY = /\b(schools?|footpaths?|pedestrians?|members? of the public|public (?:areas?|access)|shopping (?:centres?|centers?)|playgrounds?|hospitals?|occupied (?:buildings?|premises|sites?)|live (?:roads?|streets?))\b/i;

function withStepHazards(hazards, jobSteps, task) {
  const rows = hazards.slice();
  const named = new Set(rows.map((row) => row.hazard.replace(/ or excavation/, '')));
  const add = (hazard, risk) => {
    const key = hazard.replace(/ or excavation/, '');
    if (named.has(key)) return;
    named.add(key);
    rows.push({ hazard, risk });
  };
  for (const step of jobSteps) {
    for (const [pattern, hazard, risk] of STEP_HAZARDS) if (pattern.test(step.step || '')) add(hazard, risk);
  }
  // Any step with silica controls (cutting, coring, chasing, grinding) puts silica in the summary.
  // Only Queensland cites a code with "crystalline silica" in its title, so the wording every state shares is matched too.
  if (jobSteps.some((step) => (step.controls || []).some((line) => /\b(?:crystalline silica|silica (?:assessment|dust|controls?))\b/i.test(line)))) add('Respirable crystalline silica', 'A person breathes in silica dust.');
  if (PUBLIC_NEARBY.test(task)) add('Public near the work', 'A member of the public enters the work area or is struck.');
  return rows;
}

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
  // Grinding concrete, masonry, tile or stone surfaces is dust work, not hot work, unless metal is ground too.
  const metalGrind = /\b(?:angle )?grind\w*/i.test(source) && (!/\b(concrete|slabs?|floors?|masonry|brick\w*|block\w*|stone|tiles?|pools?|screeds?|render\w*|surfaces?|substrates?|plaster\w*|timber|stumps?)\b/i.test(source) || /\b(steel|metal|welds?|bolts?|angle grind\w*|rebar|reo|pipes?|brackets?)\b/i.test(source));
  if (HOT_WORK.test(source) || metalGrind || /\b(hot works?|oxy(?:-?acetylene)?|gas cutting|flame cutting|thermal cutting|cut\w* (?:out )?(?:the |existing )?steel)\b/i.test(source)) add('Hot work', 'Sparks, slag or hot metal start a fire or burn a person.');
  if (CONTAMINATED_GROUND.test(source)) add('Contaminated ground', 'A person breathes in, swallows or touches contaminants in the soil.');
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
  const answer = String(value || '').trim();
  if (/^(none|no|no crane|not used)$/i.test(answer)) return 'none';
  return /^(own|ours?|us|we|our company|yes)$/i.test(answer) ? 'own' : 'company';
}

function stateFor(input) {
  const found = findState(input.state);
  if (!found) return found;
  // The task's trade, when it is known (from a scope of works), limits its job steps to that trade's work.
  const state = { ...found, ownCrane: craneAnswer(input.crane) === 'own', noCrane: craneAnswer(input.crane) === 'none', trades: tradeIds(input.trade), kinds: chosenKinds(input.kinds) };
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
  // Typos are fixed, then site slang and shorthand are read the way they are meant ("demo", "rd", "AC pipe").
  const spelling = fixSpelling(cleanLine(input.task || input.jobDescription));
  const task = readSlang(spelling.text);
  if (!task) return { kind: 'error', message: 'Write the task.' };
  // Engineered stone: supplying, installing or processing it is prohibited, except
  // removing, repairing, making minor modifications to or disposing of installed stone.
  if (/\bengineered stone\b/i.test(task) && /\b(install\w*|supply\w*|fabricat\w*|manufactur\w*|cut\w*|process\w*|fit\w*|polish\w*)\b/i.test(task) && !ENG_STONE_INSTALLED.test(task)) {
    // Victoria: regulations 319Y and 319ZB, with no notice to the regulator. Elsewhere written notice
    // is given before the work (s 529G; ACT s 418I).
    const message = state.id === 'vic'
      ? 'Supplying, installing or processing engineered stone benchtops, panels or slabs is prohibited under the Occupational Health and Safety Regulations 2017 (Vic) (regulation 319Y), so SiteReady does not prepare a SWMS for it. Removing, repairing, modifying or disposing of installed engineered stone is allowed with the engineered stone controls: describe that work instead, or use natural stone or another material.'
      : 'Supplying, installing or processing engineered stone benchtops, panels or slabs is prohibited under work health and safety law, so SiteReady does not prepare a SWMS for it. Removing, repairing, making minor modifications to or disposing of installed engineered stone is allowed if the processing is controlled, and the regulator must be given written notice before the work starts: describe that work instead, or use natural stone or another material.';
    return { kind: 'refused', state: state.name, message };
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
    // Spelling fixed in the task, so the user sees each change.
    spellingFixes: spelling.fixes,
    fall: fallCheck(task, answer, state),
    required: withHarness(requiredFactsFor(task, answer, state), input.facts, ppeInUse(task, { ...(input.facts || {}), siteConditions: siteConditions(input.site) }, state, input.ppe)),
    // (Site answers are read with the facts below.)
    site: SITE_FIELDS.map((field) => ({ id: field.id, label: field.label, hint: field.hint })),
    // The PPE suggested for this task, for the user to change before the draft is prepared.
    ppe: ppeList(task, { ...(input.facts || {}), siteConditions: siteConditions(input.site) }, state),
    // The job steps found from the task's words, the ones in use, and the ones that cannot be taken off.
    steps: stepPicks(task, { ...(input.facts || {}), siteConditions: siteConditions(input.site) }, state),
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
  [/\b(portal frames?|(?<!existing )steel (?:frames?|sheds?|structures?)|(?:erect|stand)\w* [^.]{0,20}\b(?:steel|columns|rafters))\b/i, 'steel erection', /\b(Erect and connect steel|Land steel|Erect the frame and roof of the structure)\b/],
  [/\bretaining walls?\b/i, 'retaining wall construction', /\b(retaining|ground anchors|Install and later remove props)\b/i],
  [/\b(epoxy (?:coat\w*|floor\w*|seal\w*)|(?:apply|applying|seal\w*|coat\w*) [^.]{0,30}\bepoxy|floor coatings?)\b/i, 'floor coating', /\b(epoxy|floor coatings?)\b/i],
  [/\b(grind\w* [^.]{0,20}\bfloors?|floor grind\w*)\b/i, 'floor grinding', /\bgrind floors\b/i],
  [/\bhydro[- ]?demoli\w*\b/i, 'hydro-demolition', /\bhydro/i],
  [/\b(drill\w* and blast\w*|(?<!(?:abrasive|sand|grit|garnet|water|soda|bead|shot|dry ice|hydro|ice|media|pressure)[- ]?)blasting|explosives?|shotfir\w*)\b/i, 'blasting with explosives (licensed shotfirer work)', /\b(shotfir\w*|Charge and fire the blast)\b/i],
  [/^(?![^]*\b(?:temporary|builder'?s?) (?:power )?poles?\b)[^]*\b(light(?:ing)? poles?|poles?\b[^.]{0,30}\b(?:stand|erect|install)\w*|(?:stand|erect|install)\w* [^.]{0,30}\bpoles?)\b/i, 'pole erection', /\b(poles?|Install security devices)\b/i],
  [/\bcore fill\w*\b/i, 'core filling', /\bcore fill\b/i],
  [/\b(sewer mains?|council mains?|connect\w*[^.]{0,30}\bsewer)\b/i, 'connection to the live sewer', /\bConnect to the live sewer\b/],
  [/\b(?:install|replac|lift|remov)\w*\b[^.]{0,40}\b(?:air ?con\w* units?|rooftop units?|condensers?|package units?)\b/i, 'air conditioning plant installation', /\b(Install split system|Install plant|Receive plant|Isolate plant|Install ductwork)\b/],
  [/^(?![^]*\bhydro[- ]?demoli)[^]*\bdemolish\w*\b[^.]{0,30}\b(?:garages?|sheds?|houses?|buildings?|carports?|decks?|pergolas?|verandahs?|structures?)\b/i, 'demolition of a whole structure', /\b(Demolish the structure|Take down the shed frame)\b/],
  [/\b(pool shells?|shotcrete|gunite|spray\w* concrete)\b/i, 'pool shell and sprayed concrete work', /\b(shotcrete|sprayed concrete|Spray the pool shell)\b/i],
  [/\b(pressure clean\w*|pressure wash\w*|re-?seal\w*|wash\w* and seal\w*)\b/i, 'pressure cleaning and sealing', /\b(pressure clean|pressure wash|sealer|seal floor joints)/i],
  [/\bpergolas?\b/i, 'pergola work', /\b(pergola|footings?|post holes?|shallow trench|Dig|frame and roof of the structure|Prop and repair)\b/i],
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
  [/\bunderground power\b|\bpower (?:supply )?to (?:a |the )?(?:granny flat|shed|garage|outbuilding|pool|pump)/i, 'connecting the new supply', /\b(Isolate and prove|Test the new work|Connect and commission|Rough-in|Fit off)\b/],
  // A grid with plasterboard sheets has its steps; a grid with ceiling tiles does not yet.
  [/^(?![^]*\b(?:plasterboard|gyprock|drywall|sheets?)\b)[^]*\b(?:suspended grid ceilings?|grid ceilings?|ceiling grids?|ceiling tiles?)\b/i, 'suspended grid ceiling installation', /\b(grid|Replace the ceiling tiles)\b/i],
  [/\bremov\w*\b[^.]{0,30}\b(?:concrete |old |underground )*(?:water |fuel |septic )?tanks?\b/i, 'tank removal', /\b(Remove the (?:old )?(?:fuel |septic )?tanks?|Cut steel with oxy)/],
  [/\b(sand\w* and (?:polish|coat|seal)\w*|floor sand\w*)\b/i, 'floor sanding and coating', /\b(floor sanding|Sand and coat|Sand and finish timber floors|grind floors)\b/i],
  [/\b(?:install|erect|assembl|build)\w*\s+(?:an? |the )?(?:new )?(?:(?:garden|kit|colorbond|steel|metal)\s+)+sheds?\b/i, 'shed kit assembly', /\b(shed kit|shed frame)\b/i],
  [/\bbollards?\b/i, 'bollard installation', /\bbollards\b/i],
  [/\bexhaust fans?\b[^.]{0,40}\b(?:ceilings?|roof spaces?)\b|\b(?:ceilings?|roof spaces?)\b[^.]{0,40}\bexhaust fans?\b/i, 'exhaust fan work in a ceiling', /\bWork in the roof space\b/],
  [/\bremov\w*\b[^.]{0,30}\b(?:split systems?|air ?condition\w*)/i, 'removing the units', /\b(Receive plant|Fix the units in place|Install ductwork)\b/],
  // A circuit breaker is electrical work, not concrete breaking.
  [/\b(jackhammer\w*|break\w* (?:out|up)|(?<!circuit[- ])breakers?)\b/i, 'breaking out concrete', /\b(break|Trim pile heads|Demolish|Saw cut)/i],
  [/^(?![^]*\b(?:repoint\w*|sandstone|brick\w*|masonry|stone walls?|render\w*|concrete|retaining walls?|fire ?walls?|fibro|asbestos)\b)[^]*\b(?:patch\w*|repair\w*)\b[^.]{0,30}\b(?:plasterboard|linings?|walls?(?! frames?| framing)|ceilings?)\b/i, 'patching linings', /\bCut, set and sand\b/],
  [/\b(underfloor heating|heating cables?|heating mats?)\b/i, 'underfloor heating installation', /\b(heating|Rough-in|Fit off)\b/i],
  [/^\s*(?:install|fix|replac)\w*\s+(?:[\w-]+\s+){0,3}(?:cladding|weatherboards?)\b/i, 'cladding installation', /\bcladding\b/i],
  [/^\s*install\w*\s+(?:an? |the |new )*(?:passenger |goods )?(?:lifts?|elevators?)\b(?! (?:pits?|shafts?|cores?|the|materials|equipment|it|them|panels?|sheets?|landing doors?|doors?))/i, 'lift installation', /\b(Work on the car top|Lift machines, rails|Install the lift rails|Replace the lift motor|Erect and connect steel)\b/],
  [/\btrees?\b[^.]{0,40}\b(cranes?)\b|\bcranes?\b[^.]{0,40}\btrees?\b/i, 'tree removal', /\bRemove trees\b/],
  [/\b(?:replac|fix|repair|re-?bed|repoint|lay|install)\w*\b[^.]{0,30}\b(?:roof tiles?|tiled roofs?|ridge caps?)\b/i, 'tiled roof work', /\b(?:tiled|slate) roof\b|\bStrip the (?:slates|roof tiles)\b/i],
  [/\b(ev|electric vehicle|car) chargers?\b/i, 'EV charger installation', /\b(Rough-in|Fit off|Test the new work|Connect and commission)\b/],
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
  // The SWMS shows the task as typed; the work is read from it with site slang expanded.
  // The SWMS keeps the task as typed, with typos fixed but slang left as written.
  const typed = fixSpelling(cleanLine(input.task || input.jobDescription)).text;
  const task = readSlang(typed);
  // A space the user has assessed as not a confined space drops any confined space arrangement.
  const facts = { ...(input.facts || {}), siteConditions: siteConditions(input.site) };
  if (choiceAnswer('spaceAssessment', facts.spaceAssessment) === 'notConfined' && !/\bconfined space\b/i.test(task)) delete facts.confinedSpace;
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
  const missing = missingFacts(task, facts, pack.fallAnswer, state, ppeInUse(task, facts, state, input.ppe));
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
  // Plant named only as checked in a generator test is not worked on, so it raises no category.
  const riskTask = namedInPassing(task);

  const draft = {
    kind: 'draft',
    ...header,
    ...stepsAndPpe(task, facts, hazards, finalControls, state, input),
    references: referencesFor(facts, state.id),
    missing: [],
    statement: '',
    // Testing on or near energised parts is high risk construction work, however the task is worded.
    highRisk: highRiskMatches(`${combinedFacts(riskTask, facts)}${choiceAnswer('energisedWork', facts.energisedWork) === 'testing' ? '\nlive electrical' : ''}${choiceAnswer('spaceAssessment', facts.spaceAssessment) === 'confined' ? '\nconfined space' : ''}${TEMP_POWER.test(riskTask) ? '\nwork on or near energised electrical installations (construction power is live once connected)' : ''}${/\b(refrigerat\w* (?:equipment|units?|cabinets?|display)|cool ?rooms?|freezer rooms?)\b/i.test(riskTask) && /\b(install\w*|connect\w*|commission\w*)\b/i.test(riskTask) && !/\b(?:cool ?room|freezer|freezer room) doors?\b/i.test(riskTask) ? '\nwork on or near a refrigerant line (connecting refrigeration equipment)' : ''}${/\b(operation of (?:the )?generators?|load shed\w*|load bank\w*|generators? (?:testing|test runs?|load tests?)|load test\w* (?:the )?generators?)\b/i.test(riskTask) ? '\nwork on or near energised electrical installations (live switching during generator load tests)' : ''}${ICT_WORK.test(riskTask) && /\b(risers?|ceilings?|comms rooms?|ups|card readers?|intercoms?|power supplies)\b/i.test(riskTask) ? '\nwork near energised electrical installations (shared risers, ceilings and equipment)' : ''}${/\b(spray\w*|airless)\b/i.test(riskTask) && /\b(solvent[- ]based|solvents?|two[- ]pack|2[- ]pack)\b/i.test(riskTask) ? '\nflammable atmosphere (spraying solvent-based paint)' : ''}${/\b(service stations?|petrol stations?|fuel sites?|fuel forecourts?|fuel bowsers?|fuel dispensers?|bowsers?)\b/i.test(riskTask) ? '\nwork on or near a fuel line (underground fuel lines and tanks at a fuel site)\ncontaminated or flammable atmosphere (fuel vapour)' : ''}${/\bmeter (?:box|board|panel)s?\b|\b(?:home |house |solar |storage |lithium )batter(?:y|ies)\b|\bbattery (?:storage|systems?)\b/i.test(riskTask) ? '\nwork on or near energised electrical installations (mains or battery terminals stay live)' : ''}${ELECTRICAL_CORE.test(riskTask) && /\b(?:terminat\w*|connect\w*)\b[^.]{0,60}\b(?:existing|main|live) (?:main )?(?:switchboards?|distribution boards?|boards?)\b|\bfrom the main switchboard\b/i.test(riskTask) ? '\nwork near energised electrical installations (existing switchboard)' : ''}${WATERPROOFING.test(riskTask) && /\b(solvent[- ]based|solvents?|two[- ]part|2[- ]part|two[- ]pack|2[- ]pack)\b/i.test(riskTask) ? '\nflammable atmosphere (solvent-based membrane products)' : ''}${BULK_EXCAVATION.test(riskTask) && /\b(contaminat\w*|unknown fill)\b/i.test(riskTask) ? '\nmay disturb asbestos\ncontaminated atmosphere' : ''}${!BULK_EXCAVATION.test(riskTask) && CONTAMINATED_GROUND.test(riskTask) ? '\ncontaminated atmosphere (contaminated ground)' : ''}${PILING_WORK.test(riskTask) && /\b(bored piles?|open (?:pile )?(?:bores?|holes?)|pile (?:bores?|holes?))\b/i.test(riskTask) ? '\nshaft excavation (open pile bores)' : ''}${PILING_WORK.test(riskTask) && /\b(slurry|bentonite|support fluid|water[- ]filled|groundwater)\b/i.test(riskTask) ? '\nwork in or near water or other liquid that involves a risk of drowning' : ''}${MECHANICAL_WORK.test(riskTask) && /\b(commission\w*|start[- ]?up)\b/i.test(riskTask) ? '\nwork near energised electrical installations (plant being commissioned)' : ''}${REFRIGERANT.test(riskTask) && /\b(pipe\w*|lines?|braz\w*|charg\w*|recover\w*|evacuat\w*|pressure test\w*)\b/i.test(riskTask) ? '\nrefrigerant line' : ''}${['a2l', 'a3'].includes(choiceAnswer('refrigerantClass', facts.refrigerantClass)) ? '\nflammable atmosphere' : ''}${/\b(live sewer|sewer mains?|manholes?|maintenance holes?)\b/i.test(riskTask) ? '\nwork near a confined space (sewer)\ncontaminated atmosphere (sewer gas)' : ''}${choiceAnswer('spaceAssessment', facts.spaceAssessment) !== 'notConfined' && /\b(?:enter\w*|go\w* into|work\w* in(?:side)?|clean\w* out)\b[^.]{0,30}\b(?:pits?|wet wells?|tanks?|pump stations?|silos?|vaults?|culverts?)\b/i.test(riskTask) ? '\nwork in a confined space' : ''}${asbestosLikely(riskTask) && !/\bno asbestos|asbestos[- ]free|tested negative\b/i.test(combinedFacts(riskTask, facts)) ? '\nlikely to involve the disturbance of asbestos' : ''}${/\b(?:remov\w*|decommission\w*|excavat\w*|pull\w* out|dig\w* (?:up|out))\b[^.]{0,30}\b(?:(?:in-?ground|underground|old|buried) )?(?:fuel|petrol|diesel|oil|heating oil) tanks?\b|\b(?:underground|buried) (?:fuel |petrol |diesel |oil )?tanks?\b/i.test(riskTask) ? '\ncontaminated or flammable atmosphere (fuel vapour)\nwork on or near a fuel line\npowered mobile plant (excavator)' : ''}${/\b(crash barriers?|guard ?rails?|safety barriers?|wire rope barriers?|w-?beam)\b/i.test(riskTask) && /\b(highways?|roads?|motorways?|freeways?)\b/i.test(riskTask) ? '\npowered mobile plant (post driver)' : ''}${/\b(spray seal\w*|bitumen seal\w*|chip seal\w*)\b/i.test(riskTask) ? '\npowered mobile plant (bitumen sprayer, aggregate spreader and roller)' : ''}${/\bgas\b/i.test(riskTask) && /\b(barbecues?|bbqs?|pizza ovens?|boilers?|cooktops?|ovens?|stoves?|appliances?|hot water|heaters?|heating|lines?|pipe\w*|fitting|meters?)\b/i.test(riskTask) && /\b(install\w*|replac\w*|relocat\w*|connect\w*|disconnect\w*|fit\w*)\b/i.test(riskTask) && !/\bwith (?:a |an )?(?:heat pump|electric|solar)\b/i.test(riskTask) ? '\nwork on or near pressurised gas piping (gas appliance connection)' : ''}${/\b(commercial (?:ranges?(?! hoods?)|cooktops?)|wok (?:burners?|stations?|ranges?))\b/i.test(riskTask) && !/\bgas\b/i.test(riskTask) ? '\nwork on or near pressurised gas piping (gas appliance connection)' : ''}${/\b(?:sewer|sewage|waste ?water)\b[^.]{0,30}\bpumps?\b[^.]{0,40}\b(?:wells?|pits?|stations?)\b|\bpump wells?\b[^.]{0,30}\bsew/i.test(riskTask) ? '\nwork near a confined space (sewer pump well)\ncontaminated atmosphere (sewer gas)' : ''}${/\b(termite|rotten|damaged|white ?ant)\w*\b[^.]{0,30}\b(?:wall )?(frames?|framing|studs?|top plates?|bottom plates?)\b/i.test(riskTask) && /\b(repair\w*|replac\w*)\b/i.test(riskTask) ? '\nstructural repair that needs temporary support (propping)' : ''}${/\b(?:replac\w*|restump\w*|re-stump\w*)\b[^.]{0,30}\bstumps?\b|\brestump\w*/i.test(riskTask) ? '\nstructural repair that needs temporary support (house jacked and propped)' : ''}${/\bpump (?:stations?|wells?)\b/i.test(riskTask) && /\b(install\w*|new|build\w*)\b/i.test(riskTask) ? '\nshaft excavation deeper than 1.5 m (pump station wet well)' : ''}${/\bsubstations?\b/i.test(riskTask) && /\bfenc\w*\b/i.test(riskTask) ? '\nwork near energised electrical installations (substation)' : ''}${/\b(?:remov\w*|fill\w* in|demolish\w*)\b[^.]{0,20}\b(?:a |the )?(?:swimming )?pools?\b/i.test(riskTask) ? '\npowered mobile plant (excavator)' : ''}${/\b(site (?:offices?|sheds?)|toilet blocks?|site amenities)\b/i.test(riskTask) && /\b(install\w*|deliver\w*|set up|plac\w*)\b/i.test(riskTask) ? '\npowered mobile plant (delivery truck and crane)' : ''}${MEDICAL_GAS.test(riskTask) && /\b(connect\w*|live|tie[- ]?ins?|commission\w*|pressure test\w*|manifolds?)\b/i.test(riskTask) ? '\nwork on or near pressurised gas distribution mains or piping (medical gases)' : ''}${sentencesWith(riskTask, /\b(generators?|fuel (?:lines?|tanks?|systems?)|diesel tanks?)\b/i).some((sentence) => /\b(install\w*|connect\w*|commission\w*)\b/i.test(sentence) && !/^[^.]*\b(load test\w*|load banks?|load shed\w*|testing and commissioning|test and commission)\b/i.test(sentence) || /\b(fuel (?:lines?|tanks?|systems?)|diesel tanks?|day tanks?)\b/i.test(sentence) && /\b(install\w*|connect\w*|commission\w*)\b/i.test(sentence)) ? '\nwork on or near a fuel line' : ''}${/\b(alongside|next to|near) (?:an? |the )?operating boilers?\b/i.test(riskTask) || (BOILER.test(riskTask) && /\bcommission\w*\b/i.test(riskTask)) ? '\nartificial extremes of temperature' : ''}${(/\b(opening|break\w* through)\b/i.test(riskTask) && /\bwalls?\b/i.test(riskTask) && /\b(load[- ]bearing|propped|propping)\b/i.test(riskTask)) || (/\b(?:cut\w*|form\w*|mak\w*|creat\w*|new)\b[^.]{0,30}\b(?:doorways?|openings?|archways?|window openings?)\b/i.test(riskTask) && /\b(brick|block|masonry|load[- ]bearing|double brick)\b/i.test(riskTask) && !/\bnon[- ]load[- ]bearing\b/i.test(riskTask)) ? '\ndemolition of a load-bearing element of the structure' : ''}${FIRE_SERVICES.test(riskTask) && /\b(commission\w*|pump rooms?)\b/i.test(riskTask) ? '\nwork near energised electrical installations (fire pumps and controllers being commissioned)' : ''}${LIFT_WORK.test(riskTask) && /\b(commission\w*|car tops?)\b/i.test(riskTask) ? '\nwork near energised electrical installations (lift being commissioned)' : ''}${LIFT_WORK.test(riskTask) && /\bpits?\b/i.test(riskTask) && !/\b(reo|reinforc\w*|formwork|concrete)\b/i.test(riskTask) ? '\nwork in or near a confined space (lift pit)' : ''}${/\b(concrete cutt\w*|saw[- ]?cut\w*|wall saw\w*|core drill\w*)\b/i.test(riskTask) && /\bwalls?\b/i.test(riskTask) ? '\nwork near energised electrical installations (live wiring may be hidden in walls)' : ''}${/\b(solvent (?:cement|weld\w*)|primers?|solvent[- ]based)\b/i.test(riskTask) && /\b(risers?|basements?|ducts?|pits?|shafts?|ceilings?|plant rooms?)\b/i.test(riskTask) ? '\nflammable atmosphere' : ''}`, pack.fallAnswer, state)
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
  draft.hazards = withStepHazards(draft.hazards, draft.jobSteps || [], task);
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
  if (registers.plant.some((item) => /^(Mobile crane|Crawler crane|Non-slewing mobile crane|Vehicle loading crane|Tower crane|Forklift|Telehandler|Excavator|Skid steer|Concrete placing boom|Roller|Tipper|Piling rig|Turf laying machine|Trencher|Vacuum truck|Elevating work platform|Scissor lift|Boom-type elevating|Dozer|Grader|Loader|Scraper|Articulated dump truck|Water cart|Road profiler|Stabiliser|Asphalt paver|Bitumen sprayer|Aggregate spreader|Truck mounted attenuator|Self-propelled modular transporter|Pile driving hammer|Ground improvement rig|Rolling impact compactor|Shotcrete rig|Roadheader|Low loader|Mulcher|Fuel truck|Road rail vehicle|Track laying machine|Track maintenance machine|Hydro demolition robot|Directional drilling rig|Drill rig|Post driver|Vacuum excavation unit|Truck and dog)/.test(item.item) && !(item.item === 'Roller or plate compactor' && !/\brollers?\b/i.test(draft.task || '') && !registers.jobSteps.some((step) => step.controls.some((line) => /\b(?:any|a|the|small|ride-on) rollers?\b(?! doors?)/i.test(line) && !/\bpaint\b/i.test(line)))) && !(item.item === 'Roller or plate compactor' && SMALL_POUR.test(draft.task || '')))) {
    const plantItem = highRiskMatches('movement of powered mobile plant', 'no', state).map((item) => item.label);
    for (const label of plantItem) if (!draft.highRisk.includes(label)) draft.highRisk = [...draft.highRisk, label];
  }
  return { ...draft, ...registers, task: typed, ppe: Array.isArray(input.ppe) && input.ppe.length ? draft.ppe : ppeFromRegisters(draft.ppe, registers) };
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

const INDOOR_WORK = /\b(garages?|coffee machines?|cold stores?|cool ?rooms?|gyms?|gymnasiums?|showers?|hotels?|factor(?:y|ies)|workshops?|dishwash\w*|commercial kitchens?|pubs?|escalators?|shopping centres?|malls?|interior|inside|indoors?|internal|shop|office|bathrooms?|bedrooms?|lounge rooms?|laundr\w*|kitchens?|ensuites?|toilets?|ceilings?|roof spaces?|car parks?|warehouse|switchboards?|plant rooms?|classrooms?|caf(?:e|é)s?|restaurants?|food courts?|corridors?|hallways?|stairwells?|wards?|hospitals?|surgery|surgeries|theatres?|comms rooms?|data centres?|lift shafts?|stair ?lifts?|underfloor|workshops?|church halls?|halls?|aged care|nursing homes?|science labs?|cupboards?|hotel rooms?|laborator\w*|cooktops?|stoves?|ovens?|toilet blocks?|corridors?|warehouses|distribution centres?|wallpaper|smoke alarms?|ducted (?:heating|air\w*|systems?)|fit[- ]?off|power points?|light switch(?:es)?|pallet racking)\b/i;

function ppeList(task, facts, state, chosen) {
  // Any outdoor part of the task brings sun protection, even with internal work as well.
  const outdoors = /\b(external\w*|outside|outdoors?|roofs?(?! spaces?| cavit)|balcon\w*|eaves|facade)\b/i.test(task) && !/\b(at night|overnight|night ?shifts?)\b/i.test(task);
  const indoorTrade = (state.trades || []).length > 0 && state.trades.every((id) => INDOOR_TRADES.includes(id));
  return ppeFor(
    tradeFlags(task, facts, state),
    chosen,
    // A harness is ticked only where one is used: with fall arrest or restraint, in a boom lift or on a swing stage.
    harnessInUse(combinedFacts(task, facts)),
    /\b(at night|overnight|night ?shifts?)\b/i.test(task) || !outdoors && (indoorTrade || INDOOR_WORK.test(task)),
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
  // The respirator fit testing line goes with steps that use a respirator, or a list the user chose with one.
  let jobSteps = jobStepsForTask(task, facts, hazards, controls, state, { respirator: Array.isArray(input.ppe) && ticked(['p2', 'halfFace']) });
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
    if (/\bP2\b|\b[Rr]espirators?\b|\bdust masks?\b/i.test(said)) {
      if (!ticked(['p2', 'halfFace'])) tick('p2');
      // A respirator brings its fit testing line into the steps.
      jobSteps = jobStepsForTask(task, facts, hazards, controls, state, { respirator: true });
    }
    // Night work has no sun exposure.
    if ((/\b(at night|overnight|night ?shifts?|night works?)\b/i.test(task) && !/\b(day|daytime|days)\b/i.test(task)) || (INDOOR_WORK.test(task) && !/\b(external\w*|outside|outdoors?|roofs?(?! spaces?| cavit| truss)|balcon\w*|eaves|facade|yards?|car ?parks?|footpaths?|gardens?)\b/i.test(task))) for (const group of ppe) for (const item of group.items) if (['sunscreen', 'sunHat', 'glassesTinted'].includes(item.id)) item.ticked = false;
    // Outdoor work: sun and heat are controlled where the steps do not already say how.
    if (ticked(['sunscreen']) && !/\bsun protection\b|\bsunscreen\b/i.test(said)) {
      jobSteps[0] = { ...jobSteps[0], hazards: [...jobSteps[0].hazards, 'Heat illness and sunburn working outdoors.'], controls: [...jobSteps[0].controls, 'Sun and heat: hat or brim, long sleeves, sunglasses and SPF 30 or higher sunscreen. Cool drinking water, shade and rest breaks in hot weather.'] };
      // The water, shade and rest line is now said once, here.
      jobSteps = jobSteps.map((step, index) => (index === 0 ? step : { ...step, controls: step.controls.filter((line) => !/^Cool drinking water, shade and rest breaks in hot weather\.(?: \(.*\))?$/.test(line)) })).filter((step) => step.controls.length);
      tick('sunHat');
      tick('glassesTinted');
    }
    if (/\bhearing protection\b|\bear (?:muffs|plugs)\b/i.test(said) && !ticked(['earPlugs', 'earMuffs'])) tick('earMuffs');
  }
  return { jobSteps: inOrder(jobSteps, input.stepOrder), ppe };
}

// The job steps in the order the user chose. A step not in that order, such as one added
// since, stays just after the step it followed.
function inOrder(jobSteps, order) {
  if (!Array.isArray(order) || !order.length) return jobSteps;
  const at = new Map(order.map((name, index) => [name, index]));
  let last = -1;
  const keyed = jobSteps.map((step, index) => {
    const key = at.has(step.step) ? at.get(step.step) : last + 0.5;
    if (at.has(step.step)) last = at.get(step.step);
    return { step, key, index };
  });
  return keyed.sort((a, b) => a.key - b.key || a.index - b.index).map((item) => item.step);
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

// The ACT sets no written silica assessment, so its reference is the silica controls.
const STATE_REFERENCE_LABELS = { act: { silicaControls: 'Silica controls' } };

function referencesFor(facts, stateId) {
  return REFERENCE_FACTS
    .map(([id, label]) => ({ label: (STATE_REFERENCE_LABELS[stateId] || {})[id] || label, text: keptFact(facts[id]) }))
    .filter((item) => item.text);
}

// The kinds of work in the task, which choose the job steps and the PPE.
const KIND_IDS = [...new Set(ACTIVITIES.map((activity) => activity.when).filter(Boolean))];

// The kinds of work in the task, limited to the task's trades when they are known.
function tradeFlags(task, facts, state) {
  const flags = suggestedFlags(task, facts, state);
  if (!state.kinds) return flags;
  // The job steps the user picked replace the ones found from the words. The user can
  // take off any step, including the ones the task's words call for (they are warned).
  const picked = new Set(state.kinds);
  const out = { ...flags };
  for (const id of KIND_IDS) out[id] = picked.has(id);
  if (pickedDisturbsBuilding(task, state.kinds)) out.asbestosCheck = true;
  return out;
}

// Job steps the task's words call for that are flagged when taken off: asbestos,
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
  // A conveyor's loader or treatment plant is not earthmoving plant.
  if (flags.conveyorMaintain && !/\b(excavat\w*|dig\w*|trench\w*|earthworks?|bulldoz\w*|front[- ]end loaders?|wheel loaders?)\b/i.test(task)) { flags.earthworks = false; flags.sitePlant = false; }
  // What the site answers say about power lines and access brings their steps.
  const site = String((facts && facts.siteConditions) || '');
  if (site) {
    if (mentioned(site, ENERGISED) || /\b(hv|high voltage|\d+ ?kv)\b[^.\n]{0,20}\blines?\b/i.test(site)) flags.power = true;
    if (/\b(elevating work platforms?|ewps?|boom lifts?|scissor lifts?)\b/i.test(site)) flags.ewp = true;
    if (/\bladders?\b/i.test(site)) flags.ladderUse = true;
  }
  // No crane on this job: crane steps come only from a crane the task itself names.
  if (state.noCrane && !/\b(cranes?|hiabs?|frannas?|vehicle loading cranes?)\b/i.test(task)) {
    for (const id of ['craneInterface', 'crane', 'heavyLift', 'dualLift', 'craneAssembly']) flags[id] = false;
  }
  // A cutting step that is not this trade's work is taken out, so drilling and
  // cutting comes back as the general step.
  // Saw cut control joints are covered in the concrete finishing step.
  const jointsOnly = flags.concrete && /\b(control|contraction|expansion) joints?\b/i.test(task) && !/\b(drill\w*|cor(?:e|ing)|chas\w*)\b/i.test(task);
  if (SILICA_WORK.test(task) && !OWN_CUTTING.some((id) => flags[id]) && !jointsOnly && !(flags.floorCoating && /\bgrind\w*\b/i.test(task) && !/\b(drill\w*|cut\w*|cor(?:e|ing)|chas\w*|saw\w*)\b/i.test(task))) flags.silicaDrill = true;
  // Bollards, stops and humps are fixed by drilling the slab or pavement.
  if (flags.bollards && !OWN_CUTTING.some((id) => flags[id])) flags.silicaDrill = true;
  // A floor is ground or blasted before it is coated.
  // Stair treads are prepared by hand, not with a floor grinder.
  if (flags.floorCoating && !/\b(new|freshly poured)\b/i.test(task) && !(/\b(stairs?|treads?)\b/i.test(task) && !/\bgrind\w*\b/i.test(task))) flags.floorGrind = true;
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
  if (out.deckBuild || out.fenceBuild || out.kitStructure) out.footingHoles = false;
  if (out.shadeSail && !/\b(existing posts?|re-?tension\w*|replac\w* (?:the )?sails?)\b/i.test(task)) out.footingHoles = true;
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
  // A saw cut for a reglet or flashing is a chase cut in a wall or upstand, not slab saw
  // cutting: it is the general concrete, masonry and stone cutting step, or the waterproofer's
  // reglet cutting in surface preparation.
  if (out.sawCut && !sentencesWith(task, /\b(saw[- ]?cut\w*|concrete cutt\w*|saws?)\b/i).some((sentence) => !/\b(reglets?|flashings?|chases?)\b/i.test(sentence) || /\b(slabs?|floors?|pavements?|kerbs?|roads?|driveways?|openings?)\b/i.test(sentence))) {
    out.sawCut = false;
    if (!out.wpPrep) out.silicaDrill = true;
  }
  // Automatic doors are hung and their operators fitted and commissioned.
  if (out.autoDoors && /\b(install\w*|supply|fit\w*|replac\w*|commission\w*)\b/i.test(task)) out.doorHang = true;
  // A specification section named by its number and title ("Section 0820 Doors and Door Frames") is a reference, not work.
  out.autoDoorsOnly = Boolean(out.autoDoors && !/\b(door ?frames?|doorsets?|hang\w*|timber doors?|solid core|fire doors?|hinged doors?)\b/i.test(task.replace(/\bsection\s+\d[\d.]*\s[^.]*/gi, ' ')));
  // Windows, louvres and doors are not facade panels landed at an open slab edge.
  off(out.windowInstall && !/\b(fa[cç]ades?|curtain wall\w*|unitised|cladding|spandrels?|panels?)\b/i.test(task), 'panelInstall');
  // Pipework cast into an in-ground pool or a slab on ground is not set out on a deck.
  off(out.castInPlumbing && /\b(pools?|in-?ground|slabs? on ground|ground slabs?)\b/i.test(task) && !SUSPENDED.test(task), 'castInPlumbing');
  off(out.glazingDrill, 'fixtures');
  out.grindOnly = Boolean(out.grinding && !/\b(drill\w*|cut\w*|cor(?:e|ing)|chas\w*|saw\w*)\b/i.test(task));
  // Grinding a floor for a coating is covered by the floor step, not the drilling step.
  off((out.floorGrind || out.floorCoating) && out.grindOnly, 'silicaDrill');
  // Repairing cracks or trip hazards in an existing slab, path or driveway is a patch:
  // no new slab is dug out, formed for edge beams or poured from trucks.
  out.slabRepair = Boolean(/\b(repair\w*|patch\w*|crack\w*|trip hazards?|make good|spall\w*)\b/i.test(task) && !/\b(new (?:concrete )?(?:slabs?|driveways?|paths?|footpaths?|crossovers?)|pour\w* (?:a |the )?(?:new )?(?:slabs?|driveways?)|lay\w* (?:a |the )?(?:new )?(?:concrete )?(?:slabs?|driveways?|paths?))\b/i.test(task));
  if (out.slabRepair && out.slabGround && !/\b(concrete trucks?|agitators?|pumps?|ready[- ]?mix\w*|pre-?mix\w*)\b/i.test(task)) out.smallPour = true;
  out.repairNoReo = Boolean(out.slabRepair && !/\b(reo|reinforc\w*|mesh|dowel\w*|bars?)\b/i.test(task));
  out.smallPourOrKerb = Boolean(out.smallPour || out.kerbWork);
  // Sealing without removing tiles does not cut tiles.
  off(/\bwithout (?:removing|lifting|replacing) (?:the )?tiles\b/i.test(task), 'tileCut', 'tileLay');
  // A small shed taken down by hand is not a building demolition.
  if (out.shedTakeDown) { out.structureDemolition = false; out.demolition = false; }
  // A control panel is mounted, not delivered on skates like a main switchboard.
  off(out.controlPanelInstall && !/\bswitch ?boards?\b/i.test(task), 'boardDelivery');
  off(out.subBoardInstall && !/\b(?:install\w*|new|deliver\w*) (?:the |a )?(?:new )?(?:main switchboards?|msbs?)\b|\bswitchrooms?\b/i.test(task), 'boardDelivery');
  off(out.rampBuild, 'deckBuild', 'fixtures');
  off(out.lintelReplace, 'masonryMortar', 'openingBrickUp');
  off(out.rockLining && !/\bswales?\b/i.test(task), 'earthworks');
  off(out.outdoorKitchen, 'kitchenEquipment', 'carpJoinery');
  // Fascia, eaves or barge boards alone are worked from the eaves, not the roof.
  if (/\b(fascias?|eaves|bargeboards?|barge boards?|soffits?)\b/i.test(task) && !/\b(gutters?|roof(?:ing)? sheets?|re-?roof\w*|ridge)\b/i.test(task)) out.roofAccess = false;
  // A camera on an existing pole does not stand a pole.
  if (/\bon (?:a|an|the) (?:existing )?(?:\w+ )?poles?\b/i.test(task) && !/\bnew poles?\b|\b(?:install|erect|stand)\w* (?:a |the )?(?:new )?poles?\b/i.test(task)) out.newPole = false;
  // The roof space of a house is where its ducts and ventilation units go.
  if (out.ductwork && /\b(houses?|homes?|dwellings?)\b/i.test(task) && !/\b(apartments?|units?|storeys?)\b/i.test(task)) { out.roofSpace = true; out.houseRoofDucts = true; }
  // A masonry fence replacing an old fence has its own take-down and footing steps.
  if (out.masonryFence && out.masonryLay) out.footingHoles = true;
  // A working platform for a piling rig is built before any pile is drilled.
  if (out.pilingPlatform && !/\b(drill\w*|bor(?:e|ed|ing)|auger\w*|install\w* (?:the )?piles?|piles? (?:are|is) (?:drilled|installed))\b/i.test(task)) { out.pilingRig = false; out.platformOnly = !/\b(deliver\w*|assembl\w*|disassembl\w*|mobilis\w*|set up the rigs?)\b/i.test(task); }
  if (/\birrigation\b/i.test(task) && /\binstall\w*\b/i.test(task) && !/\b(drip lines? on|above ground)\b/i.test(task)) out.shallowTrench = true;
  off(/\birrigation\b/i.test(task) && !/\b(soil|mulch|plants?|planting|trees?|turf|garden beds?|shrubs?)\b/i.test(task.replace(/\bplant\w* rooms?\b/gi, '')), 'landscape');
  // A burst or leaking main in the ground is dug up to repair it.
  if (/\b(burst|broken|leaking)\b[^.]{0,20}\b(?:water )?mains?\b/i.test(task) && /\b(footpaths?|roads?|verges?|ground|nature strips?|park)\b/i.test(task)) out.trench = true;
  // A refit puts new partitions, doors and joinery back in.
  if (/\brefit\w*\b/i.test(task) && (out.stripOut || out.officeStrip)) { out.carpJoinery = true; out.cabinetWork = true; }
  off(out.cycloneShutters, 'windowInstall');
  off(out.acService, 'roofPlant');
  off(out.rampBuild, 'fixtures');
  if (out.acService) out.roofAccess = true;
  out.hebel = /\b(hebel|aac|autoclaved aerated)\b/i.test(task);
  if (out.hebel) out.panelCladding = true;
  out.scaffoldDismantleOnly = /\b(?:dismantl|strik|tak\w* down|remov)\w*\b[^.]{0,20}\bscaffold/i.test(task) && !/\b(?:erect|install|put up|build|alter)\w*\b[^.]{0,30}\bscaffold/i.test(task);
  // Welding steel brackets or plates is steel welding; brazing and soldering are for pipe joints.
  if (/\bweld\w*\b/i.test(task) && /\b(steel|beams?|brackets?|columns?|plates?|cleats?|purlins?)\b/i.test(task) && !/\b(pipes?|pipework|copper)\b/i.test(task)) out.steelWeld = true;
  off((out.steelWeld || out.oxyCutting) && !/\b(braz\w*|solder\w*|pipes?|pipework|copper)\b/i.test(task), 'hotWork');
  out.cabinetWork = /\b(refit\w*|fit-?outs?|cabinet\w*|joinery|kitchens?|vanit\w*|wardrobes?|cupboards?|benches|benchtops?|shelving)\b/i.test(task);
  out.trimWork = /\b(skirting\w*|architraves?|mouldings?|trims?)\b/i.test(task);
  out.openingBrickUp = /\bbrick\w* up\b[^.]{0,30}\b(?:window |door )?openings?\b|\blintels?\b[^.]{0,40}\bwindow openings?\b/i.test(task);
  if (/\b(?:new|replac\w*)\b[^.]{0,20}\bkitchens?\b/i.test(task) && /\b(relocat\w*|existing|old|renovat\w*|replac\w*)\b/i.test(task) && /\b(houses?|homes?|units?|apartments?|dwellings?)\b/i.test(task)) out.stripOut = true;
  out.asbestosRoof = Boolean(out.roofStrip && /\b(asbestos|fibro|super ?six)\b/i.test(task) && /\b(roof\w*|sheets?|sheeting)\b/i.test(task));
  off(out.tactileInstall, 'fixtures');
  // CT secondary circuits are a hazard only where existing control cables are cut.
  out.noCTCheck = Boolean(out.smallElectrical || out.batteryStorage || out.solarPV || (/\bnew\b/i.test(task) && !/\b(existing|replac\w*|upgrad\w*|alter\w*|modif\w*|extend\w*|old)\b/i.test(task)));
  // New brick and block walls involve cutting units.
  if (out.masonryLay && !out.repointing && !out.retainingWall && /\b(lay\w*|build\w*|construct\w*|brick\w* up|new)\b/i.test(task) && /\b(walls?|bricks?|blocks?|brickwork|blockwork)\b/i.test(task)) out.masonryCut = true;
  if (out.masonryLay && out.masonryFooting && !out.masonryFence && /\b(build\w*|construct\w*|new)\b/i.test(task)) out.footingHoles = true;
  out.upsWork = /\b(ups|uninterruptible|batter(?:y|ies))\b/i.test(task);
  if (/\b(floor joists?|bearers and joists|floor framing|upper floor (?:deck|frame|framing|joists?)|(?:lay|fix|install)\w* (?:the )?(?:sheet |particleboard )?flooring)\b/i.test(task) && /\b(new|build\w*|frame\w*|construct\w*|extension|storey)\b/i.test(task) && !out.subfloorRepair) out.floorFrame = true;
  // A connected battery is tested and commissioned.
  if (out.batteryStorage && /\bconnect\w*\b/i.test(task)) out.commissioning = true;
  off(out.commercialAppliance && !/\b(rough[- ]in|new (?:pipes?|pipework|waste|drain))\b/i.test(task), 'plumbingFitOff', 'kitchenEquipment');
  // A hood, exhaust fan or coolroom on its own is not a kitchen equipment fit-out.
  const kitchenItems = /\b((?:kitchen|cooking|refrigeration|preparation|serving|mobile kitchen) equipment|kitchen items|glass-?wash\w*|custom fabricated|kitchen fit-?outs?|dishwash\w*|ice machines?|ovens?|cooktops?|fryers?|benches|benching|shelving|stainless steel (?:sinks?|joinery)|bain[- ]maries?|refrigerated display)\b/i.test(task);
  out.hoodOnly = Boolean(out.kitchenEquipment && out.rangeHood && !kitchenItems);
  off(!kitchenItems && !out.rangeHood && (out.coolroomPanels || /\bexhaust fans?\b/i.test(task)), 'kitchenEquipment');
  if (/\bducts?\b[^.]{0,30}\b(?:through|in|into|above) (?:the )?ceilings?\b/i.test(task)) out.ductwork = true;
  // Installing a coolroom or refrigeration plant includes testing and charging the system.
  if (/\binstall\w*\b[^.]{0,40}\b(refrigeration (?:plant|systems?|units?)|condensing units?|reverse cycle|ducted air ?condition\w*)\b/i.test(task)) { out.refrigerantTest = true; out.refrigerantCharge = true; }
  // Bagged concrete barrowed in has no trucks, pumps or earthmoving plant.
  off(out.smallPour, 'sitePlant', 'smallPlant', 'earthworks');
  // A non-load-bearing wall is stripped out, not demolished with propping, and not framed.
  if (/\bnon[- ]load[- ]bearing\b/i.test(task)) { out.propping = false; out.structuralOpening = false; if (!/\b(build\w*|install\w*|frame\w*|new)\b/i.test(task)) out.carpFraming = false; }
  // A battery on an existing inverter, or an inverter alone, is not a panel installation.
  if (!out.solarPanels) out.solarPV = out.solarPV && /\b(inverters?|solar)\b/i.test(task);
  // A solar system is connected to the switchboard: it is electrical work, done with the circuit isolated.
  if (out.solarPV && out.solarArray && /\bsolar (?:systems?|power systems?|pv)\b/i.test(task)) { out.electricalWork = true; out.isolation = true; }
  // Landing doors alone are not a lift installation; a coolroom door is not the coolroom.
  if (/\blanding doors?\b|\b(?:lift )?shaft door frames?\b|\blift door frames?\b/i.test(task) && !/\b(lift cars?|rails|machines?|whole lift|new lift)\b/i.test(task)) out.liftInstall = false;
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
  if (out.doorSpringJob && out.doorSpring) { out.garageDoor = false; out.carpentryWork = false; }
  if (out.highBays) out.fitOff = false;
  if (/\b(conduits?|pits?)\b/i.test(task) && !/\bcabl\w*\b/i.test(task)) out.ictWork = false;
  if (out.skylight && out.houseWork) out.roofSpace = true;
  if (out.applianceSwap) out.fitOff = false;
  // Installed engineered stone has its own step; it is not cut, finished or set like new stone.
  if (out.engStoneWork) {
    out.stoneSilica = false;
    if (!/\b(replac\w*|new)\b/i.test(task)) out.stoneHandle = false;
    // An appliance swap prints the engineered stone lines in its own step.
    if (out.applianceSwap) out.engStoneWork = false;
  }
  if (out.crackInjection && !/\b(spall\w*|break\w* out|concrete cancer)\b/i.test(task)) out.concreteRepair = false;
  if (out.tankWalls) out.confined = out.confined || false;
  if (out.slabRemoval && out.groundCut) out.cutOpening = false;
  if (out.masonryLay) out.masonryMortar = true;
  if (/\b(?:remov\w*|demolish\w*|take down|pull down)\b[^.]{0,30}\b(?:fibro |garden |old |timber |metal )?(?:sheds?|garages?|carports?|cubby houses?)\b/i.test(task)) out.structureDemolition = true;
  if (/\bbenchtops?\b/i.test(task) && !/\b(cabinets?|joinery|cupboards?|doors?|kitchens? (?:fit|install))\b/i.test(task)) out.carpJoinery = false;
  if (/\b(?:fix\w*|hang\w*|install\w*)\b[^.]{0,20}\bplasterboard\b[^.]{0,30}\bbulkheads?\b/i.test(task) && !/\b(fram\w*|studs?)\b/i.test(task)) out.carpFraming = false;
  if (out.streetLighting) out.cablePull = true;
  if (/\b(?:install\w*|replac\w*) (?:a |an |the )?(?:new )?(?:[\w-]+ ){0,4}(?:control panels?|sub-?boards?)\b/i.test(task)) { out.isolation = true; out.boardDelivery = true; }
  if (out.platformLift) { out.liftShaft = false; out.liftInstall = false; out.liftCar = false; out.liftLifting = false; }
  if (out.pitLid && !/\b(pipes?|pipework|drains?)\b/i.test(task)) { out.trench = false; out.plumbingWork = false; }
  if (out.subfloorRepair) { out.timberFloor = false; out.propping = false; }
  if (out.boosterInstall) out.fireAtHeight = false;
  if (out.pumpOutLine) { out.pumpInstall = false; out.tankPlace = false; }
  if (/\b(cracked|broken|smashed|storm[- ]damaged)\b[^.]{0,20}\b(?:window )?(?:panes?|glass|windows?)\b|\bglass panes?\b|\bwindow panes?\b/i.test(task) && !/\bframes?\b/i.test(task)) out.windowInstall = false;
  if (/\b(?:automatic|auto) (?:sliding )?doors?\b/i.test(task) && !/\bwindows?\b/i.test(task)) out.windowInstall = false;
  if (/\bhandrails?\b/i.test(task) && /\bstairs?\b/i.test(task) && !/\b(mezzanine|staircases?|steel stairs?|new stairs?|install\w* (?:a |the )?stairs?)\b/i.test(task)) out.accessSteel = false;
  if (out.lineMarking && !/\b(walls?|ceilings?|doors?|buildings?|houses?)\b/i.test(task)) out.painting = false;
  if (/\bsealers?\b/i.test(task) && !/\b(epoxy|polyurethane|coatings?)\b/i.test(task)) { out.floorCoating = false; out.sealing = true; if (!/\b(grind\w*|polish\w*)\b/i.test(task)) { out.floorGrind = false; out.pressureClean = true; } else { out.pressureClean = true; out.grindSeal = true; } }
  if (out.swale || /\bswales?\b/i.test(task)) { out.earthworks = true; if (!/\b(plant\w*|trees?|turf|mulch|seed\w*)\b/i.test(task)) out.landscape = false; }
  if (out.smallPlant && out.earthworks && !/\b(excavators?|bulk|cut and fill|earthworks?|haul)\b/i.test(task)) out.earthworks = false;
  if (/\b(conduits?|pits?)\b/i.test(task) && !/\bcabl\w*\b/i.test(task) && /\b(nbn|telstra|comms|communications)\b/i.test(task)) { out.ictCabling = false; out.trench = true; }
  if (out.houseWork && out.roofPlant) out.plantLift = false;
  if (out.roofFittings && !/\b(roof(?:ing)? sheet\w*|re-?roof\w*|roofing)\b/i.test(task)) { out.roofStrip = false; out.roof = false; }
  if (out.doorSpring) out.carpentryWork = false;
  if (/\bconstruct\w*[^.]{0,30}\bconcrete (?:water )?tanks?\b/i.test(task)) out.reo = false;
  if (out.passiveFire && /\bceiling spaces?\b/i.test(task)) out.roofSpace = true;
  if (out.ductwork && out.houseWork && !/\b(apartments?|storeys?|towers?|levels?)\b/i.test(task)) out.roofSpace = true;
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
  // Late rules: these follow every rule above.
  out.asbestosNamed = /\basbestos\b/i.test(task);
  if (/\b(?:lay\w*|install\w*|run\w*)\b[^.]{0,30}\bunderground\b[^.]{0,30}\b(?:electrical )?(?:conduits?|cables?|services?)\b/i.test(task)) out.trench = true;
  if (/\b(?:replac\w*|build\w*|rebuild\w*)\b[^.]{0,20}\b(?:a |the )?(?:timber )?decks?\b/i.test(task)) out.deckBuild = true;
  if (out.birdNetting) out.birdDroppings = false;
  // Late rules from the new task bank.
  off(out.kitStructure && !/\bdecks?|decking\b/i.test(task), 'deckBuild');
  if (/\bgrease (?:arrestors?|traps?)\b/i.test(task) && !/\b(kitchen equipment|benches|ovens?|cooktops?|fryers?)\b/i.test(task)) { out.kitchenEquipment = false; out.tankPlace = true; }
  if (out.escalatorInstall && /\b(handrails?|steps?|comb plates?|chains?)\b/i.test(task) && !/\b(new|install\w*) escalators?\b/i.test(task)) { out.escalatorInstall = false; out.escalatorParts = true; }
  if (/\b(inside|interior|indoors?|internal)\b/i.test(task) && !/\b(external\w*|exterior|outside|outdoors?|facades?|eaves|fascias?|roofs? sheets?)\b/i.test(task)) { out.paintExternal = false; if (!/\b(on (?:the|a) roofs?|roof ?tops?)\b/i.test(task)) out.roofAccess = false; }
  if (out.cleaningHeight && !/\b(floors?|toilets?|kitchens?|fixtures?|plant rooms?|builders'? clean|final clean)\b/i.test(task)) out.cleaning = false;
  off(out.rainwaterTank, 'pumpInstall');
  if (/\b(?:re-?seal\w*|seal\w*)\b[^.]{0,40}\b(pavers?|paving|concrete|driveways?|surrounds?|paths?)\b/i.test(task) && !out.regrout) { out.sealing = true; out.pressureClean = true; }
  if (/\b(?:seal\w*|caulk\w*)\b[^.]{0,40}\b(?:joints?)\b/i.test(task) && /\b(precast|tilt-?up|wall|concrete) panels?\b|\bpanel joints?\b/i.test(task)) out.facadeSeal = true;
  off(/\b(roof spaces?|ceiling spaces?|insulation)\b/i.test(task) && !/\b(roof(?:ing)? sheets?|re-?roof\w*|tiles?)\b/i.test(task), 'roofStrip');
  if (/\bstair ?lifts?\b/i.test(task)) { out.platformLift = false; out.fixtures = false; }
  out.riserWork = Boolean(out.multiLevel || /\b(risers?|shafts?)\b/i.test(task));
  out.slateRoof = /\bslates?\b/i.test(task) && /\broof\w*\b/i.test(task);
  out.pergolaWork = /\bpergolas?\b/i.test(task);
  out.sprinkler = /\bsprinkler\w*\b/i.test(task);
  out.doorWork = /\bdoors?\b/i.test(task);
  out.groundFloor = /\b(ground floor|single storey|ground level)\b/i.test(task);
  out.boomGate = /\b(boom gates?|booms?|ticket machines?|car park entry)\b/i.test(task);
  out.jointSealOnly = Boolean(out.facadeSeal && /\bjoints?\b/i.test(task) && !/\b(install\w*|fix\w*) (?:the )?(?:\w+ )?(?:panels?|cladding|glazing)\b/i.test(task));
  out.towerWork = /\b(towers?|masts?|monopoles?)\b/i.test(task) && !/\b(tower cranes?|water towers?|cooling towers?)\b/i.test(task);
  out.insulationReplace = /\b(?:replac\w*|remov\w*|strip\w*)\b[^.]{0,20}\b(?:old |ceiling |roof )?insulation\b/i.test(task);
  out.barrierReplace = Boolean(out.roadBarrier && /\b(?:replac\w*|remov\w*|repair\w*)\b/i.test(task));
  out.deckReplace = Boolean(out.deckBuild && /\b(?:replac\w*|remov\w*|rebuild\w*)\b/i.test(task));
  out.renderRepair = /\b(cracked|damaged|drummy|loose|failed)\b[^.]{0,20}\brender\b|\b(?:repair\w*|patch\w*)\b[^.]{0,20}\brender\b/i.test(task);
  out.handDigOff = Boolean(out.smallPlant || out.masonryLay);
  out.footingPour = /\bpour\w*\b/i.test(task) && Boolean(out.footingHoles);
  out.carParkWork = /\b(car ?parks?|basement car ?parks?|parking (?:areas?|garages?))\b/i.test(task);
  off(out.birdNetting, 'kitStructure');
  if (/\bgrease (?:arrestors?|traps?)\b/i.test(task)) out.plumbingFitOff = true;
  if (/\bslate\b/i.test(task) && /\broof\w*\b/i.test(task)) { out.tiledRoof = true; out.tileRoofStrip = /\b(re-?roof\w*|strip\w*)\b|\breplac\w* (?:the )?(?:slate )?roof\b(?! (?:tiles?|slates?))/i.test(task); out.roofStrip = false; out.roof = false; out.safetyMesh = false; out.roofAccess = true; }
  off(out.tactileInstall && /\bhandrails?\b/i.test(task), 'tactileInstallOnly');
  if (out.tactileInstall && /\bhandrails?\b/i.test(task)) out.fixtures = true;
  if (out.masonryLay && /\b(boundary|fence|freestanding|garden|street)\b[^.]{0,20}\bwalls?\b|\bwalls?\b[^.]{0,30}\b(boundary|along (?:a |the )?street)\b/i.test(task) && /\b(build\w*|construct\w*|new)\b/i.test(task)) out.footingHoles = true;
  if (/\b(car ?parks?|pavement|asphalt|driveways?)\b/i.test(task) && out.trench && /\b(under|beneath|below)\b/i.test(task)) out.sawCut = true;
  if (out.fitOff && /\b(chargers?)\b/i.test(task) && out.carParkWork) out.chasing = true;
  if (out.securityWork && /\b(?:in|inside) (?:a |the )?(?:\w+ ){0,2}ceilings?\b/i.test(task)) out.roofSpace = true;
  if (out.mezzanineFloor && /\bbalustrad\w*\b/i.test(task) && !/\b(floor|deck\w*|install\w* (?:a |the )?mezzanine|build\w*)\b/i.test(task.replace(/\bon (?:a |the )?mezzanine\b/gi, ''))) out.mezzanineFloor = false;
  if (/\breplac\w*\b[^.]{0,10}\bthe glass\b|\bbroken (?:shop ?front )?glass\b|\bglass\b[^.]{0,30}\bbroken\b/i.test(task) && !/\bframes?\b/i.test(task)) { out.paneReplace = true; out.windowInstall = false; }
  off(out.purlinInstall && !/\b(portal|frames?|columns?|rafters?|steel erect\w*|erect\w* (?:the )?steel)\b/i.test(task), 'steelErect');
  off(out.purlinInstall && out.steelErect, 'purlinInstall');
  if (out.artificialTurf) out.turf = false;
  off(out.stairLiftInstall, 'platformLift', 'fixtures');
  // "Cooking equipment" may be electric: it is gas fitting only where gas is named.
  if (/\bkitchen\w*|restaurant|caf[eé]\b/i.test(task) && /\b(commercial (?:ranges?(?! ?hoods?)|cooktops?)|wok (?:burners?|stations?|ranges?)|cooking equipment)\b/i.test(task)) { out.kitchenEquipment = true; out.gasFitting = /\b(commercial (?:ranges?(?! ?hoods?)|cooktops?)|wok (?:burners?|stations?|ranges?)|gas)\b/i.test(task); }
  if (/\bclean\w*\b[^.]{0,20}\band seal\w*\b|\bseal\w*\b[^.]{0,30}\b(sandstone|stone|brick)\b/i.test(task) && /\b(sandstone|stone|brick\w*|masonry|walls?)\b/i.test(task)) { out.pressureClean = true; out.sealing = true; }
  if (/\bcubby (?:house)?s?\b/i.test(task)) out.kitStructure = true;
  // A roof over an existing deck or patio stands on its own posts, beams and rafters.
  out.roofOverDeck = /\b(?:roofs?|roofing|covers?|awnings?)\b[^.]{0,30}\bover (?:an? |the )?(?:existing )?(?:timber |back |rear |front )?(?:decks?|patios?|courtyards?|alfresco\w*|outdoor areas?|terraces?)\b/i.test(task) && !/\b(re-?roof\w*|re-?sheet\w*|replac\w*|repair\w*)\b/i.test(task);
  if (out.roofOverDeck) out.kitStructure = true;
  out.wifiAp = /\b(?:wi-?fi|wireless)\b[^.]{0,20}\baccess points?\b|\bwireless access points?\b|\bwi-?fi (?:units?|points?|aps?)\b|\bwaps\b/i.test(task);
  out.securityScreens = /\bsecurity (?:screens?|mesh|grilles?)\b/i.test(task);
  out.bathTiling = /\b(bath\w*|ensuites?|showers?|wet areas?|laundr\w*|homes?|houses?|units?|apartments?)\b/i.test(task) || !/\b(commercial|kitchens?|cafe|caf\u00e9|restaurants?|shops?|offices?|schools?|hospitals?|splashbacks?)\b/i.test(task);
  out.outdoorSeal = /\b(driveways?|paths?|footpaths?|pavers?|paving|decks?|patios?|courtyards?|pool surrounds?|external\w*|exterior|outside|facades?|(?:sandstone|stone|brick|bluestone|limestone) walls?)\b/i.test(task) && !/\b(inside|interior|indoors?|internal|rooms?|garages?|basements?|bathrooms?|showers?|kitchens?)\b/i.test(task);
  out.screenWork = /\b(screens?|displays?|led panels?)\b/i.test(task);
  out.signNoScreen = !out.screenWork;
  // A warehouse, factory or shed roof has no ceiling below it to stand on.
  out.openRoofSpace = /\b(warehouses?|factor(?:y|ies)|sheds?|workshops?|industrial|hangars?|distribution centres?)\b/i.test(task);
  out.skylightsPlural = /\bskylights\b/i.test(task);
  out.inverterMount = /\binverters?\b/i.test(task) && /\b(install\w*|new|fit\w*|mount\w*)\b/i.test(task);
  // Forklifts are part of a warehouse, factory, depot or dock, not a school or shopping centre car park.
  out.forkliftSite = /\b(warehouses?|factor(?:y|ies)|depots?|loading docks?|distribution centres?|workshops?|forklifts?)\b/i.test(task);
  // A new main switchboard has its consumer mains and submains pulled in and terminated.
  out.newMainBoard = /\b(?:install\w*|new|replac\w*|upgrad\w*)\b[^.]{0,20}\bmain switch ?boards?\b|\bnew msbs?\b/i.test(task) && !/\b(?:house|home|residential|unit|flat)\b/i.test(task);
  if (out.newMainBoard && ELECTRICAL_CORE.test(task)) out.cablePull = true;
  out.stairTower = /\bstair (?:towers?|access towers?)\b|\bscaffold stairs?\b/i.test(task);
  // A septic tank, treatment plant or in-ground tank sits in its own pit.
  out.tankPit = /\b(septic tanks?|sewage treatment|wastewater treatment|treatment (?:plants?|systems?)|aerated wastewater|(?:underground|in-?ground|buried) (?:water |rainwater |storage )?tanks?|grease traps?|holding tanks?)\b/i.test(task) && /\b(install\w*|replac\w*|new|put in|place\w*)\b/i.test(task);
  out.treatmentPlant = /\b(sewage treatment|wastewater treatment|treatment (?:plants?|systems?)|aerated wastewater)\b/i.test(task);
  out.conduitWork = /\b(conduits?|cables?|cabling|electrical|power|comms|communications|nbn|data|telecom\w*|fibre|lighting|signals?)\b/i.test(task);
  out.bollardFooting = /\bbollards?\b/i.test(task) && !/\b(bolt\w*|surface[- ]mount\w*|removable|retractable|anchor\w*)\b/i.test(task);
  // Doors hung as part of the work, not cabinet or cupboard doors.
  out.doorHangWork = /\b(doors?|doorsets?|door frames?)\b/i.test(task.replace(/\b(?:cabinet|cupboard|wardrobe|pantry|vanity|kitchen) doors?\b/gi, ''));
  out.noDoorHang = !out.doorHangWork;
  out.noWardrobes = !/\bwardrobes?\b/i.test(task);
  out.cabinetsNoWardrobes = Boolean(out.cabinets && out.noWardrobes);
  // A new building is not yet an operating warehouse with forklifts working in it.
  out.newBuildingSite = /\bnew (?:\w+ )?(?:distribution centres?|warehouses?|buildings?|factor(?:y|ies)|stores?)\b/i.test(task) && !/\b(operating|working|live|existing|occupied|in use)\b/i.test(task);
  out.doorStrikes = /\b(door strikes?|electric strikes?|strikes|maglocks?|magnetic locks?|electric (?:door )?locks?)\b/i.test(task);
  out.sewerRepair = /\b(?:broken|cracked|damaged|collapsed|leaking|failed)\b[^.]{0,20}\b(?:sewer|sewage|drain(?:age)?|waste) (?:pipes?|lines?|drains?)\b|\b(?:replac|repair)\w*\b[^.]{0,30}\b(?:sewer|sewage) (?:pipes?|lines?|drains?)\b/i.test(task);
  out.pavedReinstate = /\b(?:under|through|beneath|across) (?:a |the )?(?:concrete )?(?:driveways?|paths?|footpaths?|crossovers?|slabs?|patios?)\b/i.test(task);
  // A penetration cut and flashed through roof sheets is a metal roof, with no slab to drill.
  out.sheetRoof = /\b(metal|colorbond|iron|steel|tin|sheet\w*|corrugated) roof\w*|\broof sheet\w*/i.test(task) || (/\b(through (?:the |a )?roof|roof penetrations?|exhaust fans?|ventilators?|whirlybirds?|roof vents?)\b/i.test(task) && /\b(restaurants?|caf(?:e|é)s?|shops?|sheds?|factor(?:y|ies)|warehouses?|houses?|homes?)\b/i.test(task) && !/\b(slabs?|concrete|podium|membrane|apartments?|towers?|storey|level \d+|car ?parks?)\b/i.test(task));
  out.outdoorFixture = /\b(outdoor|outside|external|beach|garden) (?:showers?|taps?|basins?|sinks?|foot ?wash\w*)\b|\bfoot ?wash\w*|\bbeach showers?\b/i.test(task);
  if (out.outdoorFixture && /\b(install\w*|new|put in)\b/i.test(task)) out.shallowTrench = true;
  // Painting structural or industrial steel: no filler, and lead paint is managed under AS/NZS 4361.1.
  out.steelPaint = /\b(?:re)?paint\w*\b/i.test(task) && /\b(steel (?:beams?|columns?|structures?|frames?|trusses|girders?|stairs?|tanks?)|steelwork|structural steel|bridges?|silos?|towers?|portal frames?)\b/i.test(task);
  out.singleWindow = /\b(?:replac|remov|repair)\w*\b[^.]{0,20}\b(?:a|one|the) (?:[\w-]+ ){0,2}window(?: frame)?\b/i.test(task) && !/\bwindows\b|\bdoors?\b/i.test(task);
  out.groundFloorFront = /\b(shop ?fronts?|ground floor|ground level|shopping strips?)\b/i.test(task);
  out.boardsOnly = /\b(deck ?boards?|decking|boards)\b/i.test(task) && !/\b(piles?|bearers?|joists?|headstocks?|stringers?|frames?|structure)\b/i.test(task);
  out.pavementDrill = /\b(speed humps?|wheel stops?|car ?parks?|roads?|streets?|pavements?|footpaths?|forecourts?|driveways?)\b/i.test(task) && !/\b(walls?|buildings?|ceilings?|columns?)\b/i.test(task);
  out.oldVinylOnly = Boolean(out.oldFloorCoverings && /\b(vinyl|lino\w*)\b/i.test(task) && !/\bcarpet\w*\b/i.test(task));
  out.oldCarpetOnly = Boolean(out.oldFloorCoverings && /\bcarpet\w*\b/i.test(task) && !/\b(vinyl|lino\w*)\b/i.test(task));
  out.sheetFloor = /\b(vinyl|lino\w*|rubber floor\w*|sheet flooring)\b/i.test(task);
  out.smallTiling = /\b(showers?|bathrooms?|ensuites?|laundr\w*|toilets?|splashbacks?|powder rooms?)\b/i.test(task) && !/\b(commercial|apartments|levels|storeys|hotels?|towers?|large format|stone|slabs?|panels?)\b/i.test(task);
  out.eyewash = /\b(eye ?wash\w*|safety showers?|emergency showers?)\b/i.test(task);
  // With toilets, basins or tapware too, the eyewash is one fixture of a general fit-off.
  out.eyewashOnly = out.eyewash && !/\b(sanitary\w*|tapware|taps?|toilets?|wcs?|pans?|basins?|troughs?|urinals?|cisterns?|vanit(?:y|ies)|fixtures)\b/i.test(task);
  out.cubbyHouse = /\b(cubby (?:house)?s?|cubbies|play ?houses?|cubbyhouses?)\b/i.test(task);
  // A cubby house, or posts and rafters for a roof the roofing steps sheet, has no kit roof sheet lines.
  // An open pergola has no roof sheets unless the task gives it a roof.
  out.openPergola = /\bpergolas?\b/i.test(task) && !/\b(roof\w*|sheets?|sheeting|polycarbonate|colorbond|cover\w*|louvres?|panels?)\b/i.test(task);
  // A shade structure is covered with fabric, not roof sheets.
  out.shadeFabric = /\bshade (?:structures?|covers?|cloth|canop(?:y|ies))\b/i.test(task) && !/\b(roof sheets?|sheeting|colorbond|metal roof\w*|polycarbonate)\b/i.test(task);
  out.noRoofSheets = Boolean(out.cubbyHouse || out.roofOverDeck || out.openPergola || out.shadeFabric);
  out.timberFrame = /\btimber\b/i.test(task) && !/\b(kits?|steel|aluminium)\b/i.test(task);
  // A free-standing structure at a school or park is not fixed to a house.
  out.standaloneStructure = /\b(free[- ]?standing|schools?|kindergartens?|kindys?|childcare|parks?|playgrounds?|reserves?|ovals?)\b/i.test(task);
  if (/\b(?:repair\w*)\b[^.]{0,50}\bceilings?\b/i.test(task)) { out.ceilingRepair = true; out.plasterCeiling = true; }
  if (/\b(?:lay\w*|pour\w*)\b[^.]{0,20}\bpolished concrete\b/i.test(task)) { out.slabGround = true; out.slabPour = true; out.floorGrind = true; }
  if (/\b(fans?|flues?|ducts?|vents?)\b/i.test(task) && /\bthrough (?:a |the )?(?:house |the )?roof\b/i.test(task)) { out.roofPenetration = true; out.roofSpace = true; }
  if (/\b(?:sewage|wastewater) treatment (?:plants?|systems?)\b|\baerated wastewater\b/i.test(task)) { out.tankPlace = true; out.trench = true; }
  if (/\b(?:replac\w*|chang\w*)\b[^.]{0,20}\b(?:the )?(?:baths?|bathtubs?|shower(?: bases?)?)\b/i.test(task) && !/\bretil\w*|\btiles?\b/i.test(task)) { out.toiletReplace = true; out.plumbingFitOff = false; }
  if (/\b(?:raised )?garden beds?|planter boxes?\b/i.test(task) && /\b(install\w*|build\w*|construct\w*)\b/i.test(task)) out.landscape = true;
  if (/\b(?:remov\w*|dig\w* (?:up|out))\b[^.]{0,30}\b(?:buried |underground |old )?oil tanks?\b/i.test(task)) out.fuelTankRemoval = true;
  if (/\b(?:repair\w*|fix\w*)\b[^.]{0,30}\b(?:sagging |rotten |damaged )?pergolas?\b/i.test(task)) { out.verandahRepair = true; out.kitStructure = false; }
  if (out.treePruning) out.treeRemoval = false;
  if (out.chimneyRemoval) { out.roofStrip = false; out.roofAccess = true; }
  if (out.windowSill) { out.windowInstall = false; out.glassHandle = false; }
  out.balconyDeck = Boolean(out.deckBuild && /\b(balcon\w*|first floor|upper (?:floor|level)|level \d)\b/i.test(task));
  out.poolWiring = /\bpool\b/i.test(task) && /\b(wir\w*|power points?|circuits?)\b/i.test(task);
  out.eavesWork = /\b(eaves|soffits?)\b/i.test(task);
  out.poolFence = /\bpool\b/i.test(task) && /\b(fenc\w*|barriers?|gates?)\b/i.test(task);
  out.weldWork = /\bweld\w*\b/i.test(task);
  out.signalWork = /\btraffic (?:lights|signals?|signal poles?)\b/i.test(task);
  out.screens = /\bscreens?\b/i.test(task);
  out.fromMeter = /\bfrom the meter\b|\bmeter to (?:the |a )?(?:house|home|building)\b/i.test(task);
  out.regrout = /\b(re-?grout\w*|re-?seal\w* (?:the )?(?:shower|bath\w*|tiles?|tiled|grout|joints)|seal\w* (?:a |the )?leaking (?:shower|bath)\w*|without removing (?:the )?tiles)\b/i.test(task);
  out.toiletReplace = /\b(?:replac\w*|chang\w*|swap\w*)\b (?:a |an |the )?(?:broken |cracked |old |leaking )?(?:toilet(?: pans?| suites?)?|pans?|basins?|cisterns?|baths?|bathtubs?|shower bases?)\b/i.test(task) && !/\b(rough[- ]in|new (?:pipes?|drains?)|retil\w*)\b/i.test(task);
  if (/\bsewer (?:junctions?|connections?)\b/i.test(task) && /\b(footpaths?|driveways?|roads?|slabs?|paving)\b/i.test(task)) out.sawCut = true;
  if (out.batteryStorage || out.signalWork || (/\bstreet ?light\w*\b/i.test(task) && /\b(?:pull\w*|install\w*|run\w*)\b[^.]{0,30}\bcables?\b|\bconduit and cable\b/i.test(task))) out.commissioning = true;
  if (out.regrout) { out.tileMix = false; out.regroutStep = true; }
  if (out.smallPour) out.smallPourMix = true;
  off(out.toiletReplace, 'plumbingFitOff');
  off(out.pileConcrete || out.pileCage || out.cfaCage, 'pileComplete');
  if (/\basbestos\b/i.test(task) && /\bwall sheets?\b/i.test(task) && /\btil\w*\b/i.test(task)) { out.wetAreaSheets = true; out.wpLiquid = true; }
  out.vanityReplace = /\b(?:replac\w*|remov\w*|swap\w*)\b[^.]{0,30}\bvanit/i.test(task);
  out.jointSaw = /\b(saw\w*|control joints?)\b/i.test(task);
  out.cutRemove = /\b(?:cut\w*|dismantl\w*)\b[^.]{0,20}\b(?:and )?remov\w*\b|\bremov\w*\b[^.]{0,30}\b(?:tanks?|steel)\b/i.test(task);
  out.cladReplace = /\b(?:replac\w*|remov\w*|repair\w*)\b[^.]{0,20}\b(?:old |rotten |damaged )?(?:weatherboards?|cladding|boards)\b/i.test(task);
  out.brittleRoof = /\b(fibro|fibre cement|asbestos|super ?six|brittle|fragile)\b/i.test(task);
  out.fitOffOnly = Boolean(out.fitOff && !out.chasing && /\b(fit[- ]?off|replac\w*|swap\w*|chang\w*)\b/i.test(task) && !/\b(rough[- ]in|rewir\w*|new circuits?|run\w* (?:new )?cables?|chargers?)\b/i.test(task));
  out.ceilingFans = /\bceiling fans?\b/i.test(task);
  out.hvWork = /\b(high voltage|hv|\d+(?:\.\d+)? ?kv|substations?)\b/i.test(task);
  out.steelWeldOnly = Boolean(out.steelWeld && !out.oxyCutting && !/\b(oxy|gas cutting|flame cutting)\b/i.test(task));
  out.irrigationWork = /\birrigation\b/i.test(task);
  out.floorReplace = /\b(?:remov\w*|replac\w*|repair\w*)\b[^.]{0,30}\b(?:damaged |rotten |section of (?:a |the )?)?(?:timber )?floor(?:boards?|ing)?\b/i.test(task);
  off(out.mainRepair, 'waterConnection');
  off(out.stairOnly, 'steelErect');
  off(out.deckBuild && !out.multiLevel, 'balustradeEdge');
  if (/\b(?:switch ?boards?)\b/i.test(task) && /\b(rewir\w*|new switch ?boards?)\b/i.test(task) && /\b(houses?|homes?|units?|dwellings?)\b/i.test(task)) out.switchboardReplace = true;
  if (/\b(condensers?|condensing units?|package units?|air ?condition\w*|plant)\b/i.test(task) && /\b(?:on(?:to)?|to) (?:a |the )?(?:\w+ )?roofs?\b/i.test(task)) out.roofAccess = true;
  if (/\b(?:run\w*|install\w*)\b[^.]{0,20}\b(?:underground )?(?:power|(?:new )?(?:power )?circuits?) to\b/i.test(task) || /\b(?:replac\w*|swap\w*|chang\w*)\b[^.]{0,30}\b(?:ceiling fans?|light switches|switches|power points?|light fittings?|lights)\b/i.test(task) || /\binstall\w*\b[^.]{0,20}\b(?:new )?(?:lighting|lights|light fittings?|led (?:lights?|fittings?))\b/i.test(task)) { if (/\b(electric\w*|power|fans?|switches|lights?|lighting|power points?)\b/i.test(task)) out.commissioning = true; }
  if (/\b(?:cut\w*|form\w*|mak\w*|creat\w*|new)\b[^.]{0,30}\b(?:doorways?|openings?|archways?)\b/i.test(task) && /\b(brick\w*|block\w*|masonry|double brick)\b/i.test(task) && !/\bnon[- ]load[- ]bearing\b/i.test(task)) { out.structuralOpening = true; if (!/\b(lay\w*|build\w*|brick\w* up|infill\w*)\b/i.test(task)) { out.masonryLay = false; out.masonryMortar = false; } if (/\bprop\w*\b/i.test(task)) out.propping = true; }
  out.stairOnly = Boolean(out.accessSteel && /\bstair\w*\b/i.test(task) && !/\b(stair ?lifts?|ladders?|platforms?|walkways?|mezzanine (?:floors?|platforms?|decks?))\b/i.test(task));
  off(out.stairOnly, 'fixtures');
  out.fixturePower = /\b(power|electric\w*|motor\w*|lights?|lighting|heaters?|hand dryers?|fans?|dryers?|powered|automatic)\b/i.test(task);
  if (/\b(automatic|sliding glass|aluminium|glass) (?:sliding )?doors?\b/i.test(task) && !/\b(timber|mdf|joinery|cabinets?|skirtings?|architraves?)\b/i.test(task)) out.timberWork = false;
  out.stairWork = /\b(stairs?|treads?|stairwells?)\b/i.test(task);
  if (/\b(fascias?|eaves|bargeboards?|barge boards?|soffits?)\b/i.test(task) && !/\b(gutters?|roof(?:ing)? sheets?|re-?roof\w*|ridge)\b/i.test(task)) out.roofAccess = false;
  if (out.shedTakeDown) { out.structureDemolition = false; out.demolition = false; }
  off(out.controlPanelInstall && !/\bswitch ?boards?\b/i.test(task), 'boardDelivery');
  off(out.subBoardInstall && !/\b(?:install\w*|new|deliver\w*) (?:the |a )?(?:new )?(?:main switchboards?|msbs?)\b|\bswitchrooms?\b/i.test(task), 'boardDelivery');
  off((out.floorGrind || out.floorCoating) && out.grindOnly, 'silicaDrill');
  off(out.floorCoating && /\b(stairs?|treads?)\b/i.test(task) && !/\bgrind\w*\b/i.test(task), 'floorGrind');
  if (out.ductwork && /\b(houses?|homes?|dwellings?)\b/i.test(task) && !/\b(apartments?|units?|storeys?)\b/i.test(task)) { out.roofSpace = true; out.houseRoofDucts = true; }
  // Bank 7 review rules.
  out.bathReplace = /\b(?:replac\w*|chang\w*|swap\w*|remov\w*)\b[^.]{0,20}\b(?:the |a |an |old )?(?:baths?|bathtubs?|showers?|shower bases?)\b/i.test(task) && !/\b(rough[- ]in|retil\w*|shower (?:heads?|roses?|screens?|taps?|mixers?)|bath (?:taps?|mixers?))\b/i.test(task);
  out.bathOnly = out.bathReplace && !/\bshowers?\b/i.test(task);
  out.showerOnly = out.bathReplace && !/\b(baths?|bathtubs?)\b/i.test(task);
  if (out.bathReplace) { out.toiletReplace = /\b(toilets?|pans?|cisterns?|basins?)\b/i.test(task); out.plumbingFitOff = false; }
  out.sewerPumpSwap = /\b(sewer\w*|sewage|waste ?water)\b/i.test(task) && /\bpumps?\b/i.test(task) && /\b(replac\w*|remov\w*|failed|swap\w*|change\w*)\b/i.test(task);
  if (out.sewerPumpSwap) out.pumpInstall = true;
  out.hydronicPipes = /\b(hydronic|in-?slab heating|underfloor heating) (?:heating )?(?:pipes?|pipework|loops?|slabs?)\b|\bin-?slab heating\b/i.test(task) && /\b(lay\w*|install\w*|fix\w*|run\w*)\b/i.test(task) && !/\bboilers?\b/i.test(task);
  if (out.hydronicPipes && !/\b(?:and|then) (?:pour|place)\w*\b|\bpour (?:the|a) slab\b/i.test(task)) { out.slabGround = false; out.slabPour = false; out.plumbingWork = false; }
  // Mouldings are trims, and wet areas are rooms: neither is water damage.
  out.wetLiningStrip = /\b(water[- ]damaged?|storm ?water damage|storm[- ]damage\w*|flood\w*|wet(?! areas?\b)|leak\w*|mould(?!ings?\b|ed\b)\w*)\b/i.test(task) && /\b(plasterboard|gyprock|ceilings?|linings?|walls?)\b/i.test(task) && /\b(replac\w*|repair\w*|remov\w*|strip\w*)\b/i.test(task) && !/\b(roofs?|showers?|tiles?|membranes?|waterproof\w*|basements?|car ?parks?|concrete|retaining|brick\w*|block\w*|masonry)\b/i.test(task);
  if (/\b(basement|car ?park|retaining|concrete)\b[^.]{0,30}\bwalls?\b/i.test(task) && /\b(water|leak\w*|seep\w*|damp)\b/i.test(task)) out.belowGroundWp = true;
  if (out.wetLiningStrip && /\bwalls?\b/i.test(task)) { out.plasterSheets = true; out.plasterSanding = true; }
  out.solarLights = /\bsolar\b[^.]{0,20}\b(?:street ?lights?|lights?|lighting|light poles?)\b/i.test(task);
  if (out.solarLights) { out.trench = false; out.trafficSignals = false; out.cablePull = false; out.isolation = false; out.commissioning = false; out.footingHoles = true; }
  out.railCorridor = out.railCorridor || /\b(railways?|rail (?:lines?|corridors?|tracks?|reserves?)|train lines?|railway lines?)\b/i.test(task) && !/\blight rail\b/i.test(task);
  if (out.railCorridor && !/\b(roads?|streets?|highways?|footpaths?|level crossings?)\b/i.test(task)) out.road = false;
  out.notFibroFence = /\b(chain ?wire|chain ?mesh|cyclone|mesh|pool|steel|colorbond|timber|paling) fenc/i.test(task);
  out.boardwalk = /\bboardwalks?\b/i.test(task);
  out.louvreReplace = /\b(replac\w*|broken|cracked|smashed)\b[^.]{0,30}\blouv(?:re|er)s?\b/i.test(task) && !/\bframes?\b/i.test(task);
  if (out.louvreReplace) { out.windowInstall = false; out.glassHandle = false; }
  if (out.flyScreens && /\bscreens? (?:on|to|for|across) (?:the |all |\w+ ){0,3}windows\b/i.test(task) && !/\b(?:new|replacement) windows\b|\bwindows (?:and|with)\b/i.test(task)) { out.windowInstall = false; out.glassHandle = false; }
  if (out.floorSanding && out.timberFloor && !/\b(?:lay\w*|install\w*|new|replac\w*|fit\w*|repair\w*)\b[^.]{0,30}\b(?:floors?|boards|floorboards|flooring)\b/i.test(task)) out.timberFloor = false;
  out.membraneStrip = /\b(strip\w*|remov\w*)\b[^.]{0,30}\b(roofs?|membranes?)\b/i.test(task) && (out.wpTorch || /\bmembranes?\b/i.test(task)) && /\b(roofs?|membranes?|re-?cover\w*)\b/i.test(task);
  if (out.membraneStrip) out.roofStrip = false;
  out.valleyRepair = /\bvalleys?\b/i.test(task) && /\b(roofs?|tiles?|tiled|iron|gutters?)\b/i.test(task);
  if (out.valleyRepair && out.tiledRoof) { out.tileCut = false; out.tileLay = false; }
  out.tileStackElsewhere = Boolean(out.tiledRoof && (out.valleyRepair || out.skylight));
  out.tileDrill = Boolean(!out.tileRoofStrip && /\b(drill\w*|brackets?|solar|antennas?|aerials?|anchors?|mounts?|conduits?|vents?|flues?|cowls?|fix\w* (?:to|into) (?:the )?(?:roof|rafters?|battens?))\b/i.test(task));
  out.rollerDoorRemove = Boolean(out.garageDoor && !out.doorSpring && /\b(remov\w*|replac\w*|take down|taking down)\b/i.test(task) && /\b(roller|garage|panel lift|sectional|shutter) doors?\b/i.test(task));
  if (out.garageDoor && !/\b(timber|frames?|jambs?|lintels?|joinery|architraves?)\b/i.test(task)) out.carpentryWork = false;
  // A roller door or shutter on a warehouse or factory is too big to lift by hand, and its motor is wired in.
  out.largeDoor = Boolean(/\b(warehouses?|factor(?:y|ies)|commercial|industrial|loading (?:docks?|bays?)|distribution centres?|depots?|workshops?)\b/i.test(task) && !/\bgarage doors?\b/i.test(task));
  out.rollerDoorOnly = Boolean(out.garageDoor && !/\b(garage|sectional|panel lift|tilt) doors?\b/i.test(task));
  out.stairwellAccess = Boolean(out.painting && /\bstair ?wells?\b|\bstairs?\b/i.test(task));
  out.stoneSurface = /\b(sandstone|bluestone|limestone|natural stone|stone (?:walls?|facades?|walling|cladding))\b/i.test(task);
  out.sandstone = /\bsandstone\b/i.test(task);
  out.hoseReels = /\b(hose reels?|fire extinguishers?|extinguishers?)\b/i.test(task) && /\b(install\w*|mount\w*|fit\w*|replac\w*|new)\b/i.test(task) && !/\b(sprinklers?|hydrants?)\b/i.test(task);
  if (out.hoseReels) out.fireAtHeight = false;
  out.letterboxBank = /\bletter ?box(?:es)?\b/i.test(task) && /\b(install\w*|new|replac\w*|set\b|fix\w*)\b/i.test(task);
  if (out.letterboxBank && !/\b(brick|block|masonry)\b/i.test(task)) { out.masonryLay = false; out.masonryMortar = false; }
  out.gardenBeds = /\b(?:raised )?garden beds?|planter boxes?\b/i.test(task) && /\b(install\w*|build\w*|construct\w*)\b/i.test(task);
  out.streetPits = /\b(fibre|optic\w*|cables?|nbn|telstra|comms|communications)\b/i.test(task) && /\b(streets?|roads?|footpaths?|nature strips?|verges?)\b/i.test(task) && /\b(conduits?|pits?)\b/i.test(task) && !/\b(risers?|ceilings?|buildings?|comms rooms?)\b/i.test(task);
  if (out.streetPits) { out.ictCabling = false; out.networkCable = true; }
  out.gasHeater = Boolean(out.flueInstall && /\bgas\b/i.test(task));
  out.pontoonPlace = /\bpontoons?\b/i.test(task) && /\b(install\w*|plac\w*|build\w*|replac\w*|new)\b/i.test(task);
  // "Fire dampeners" is a common way of writing fire dampers.
  out.fireDampers = /\b(fire|smoke|fire and smoke) damp(?:en)?ers?\b/i.test(task);
  if (out.fireDampers && !/\b(?:new|install\w*|run\w*|connect\w*) (?:the )?(?:ductwork|ducting|ducts?)\b/i.test(task)) out.ductwork = false;
  out.tileRemove = Boolean((out.tileLay || out.tileCut) && /\b(cracked|broken|drummy|loose|damaged|chipped)\b[^.]{0,20}\btiles?\b/i.test(task) && /\b(fix\w*|repair\w*|replac\w*)\b/i.test(task));
  out.timberHouse = Boolean(out.windowInstall && /\b(timber|weatherboard|queenslander|fibro|cottage)\b/i.test(task) && !/\b(brick|masonry|concrete|block\w*)\b/i.test(task));
  out.windowsOnly = Boolean(out.windowInstall && !/\bdoors?\b/i.test(task) && !out.louvres);
  out.pylonSign = /\bpylons?\b/i.test(task);
  out.potholeRepair = /\bpot ?holes?\b/i.test(task);
  // Bank 8 rules.
  out.wallRemoval = /\b(?:remov\w*|knock\w* (?:out|down)|tak\w* out|demolish\w*)\b[^.]{0,20}\b(?:an? |the )?(?:old )?(?:internal |interior |non[- ]load[- ]bearing |stud |timber |plasterboard )?walls?\b/i.test(task) && !/(?<!non[- ])\bload[- ]bearing\b|\b(retaining|brick|block|masonry|fence|wallpaper|tiles?|render|sheets?|cladding|linings?|graffiti|paint)\b/i.test(task);
  out.noiseWall = /\b(sound|noise|acoustic) (?:walls?|barriers?|fences?)\b/i.test(task) && /\b(highways?|roads?|motorways?|freeways?|rail\w*)\b/i.test(task);
  out.dumbwaiter = /\bdumb ?waiters?\b/i.test(task);
  out.frameRepair = /\b(termite|rotten|damaged|white ?ant)\w*\b[^.]{0,30}\b(?:wall )?(frames?|framing|studs?|top plates?|bottom plates?)\b/i.test(task) && /\b(repair\w*|replac\w*|fix\w*)\b/i.test(task);
  out.smokeAlarms = /\bsmoke alarms?\b/i.test(task) && /\b(install\w*|fit\w*|replac\w*|new|upgrad\w*)\b/i.test(task);
  if (out.smokeAlarms && !/\b(cctv|access control|intercoms?|security|card readers?|intrusion)\b/i.test(task)) out.securityDevices = false;
  out.crackStitch = /\bhelical (?:ties?|bars?)\b|\bcrack stitch\w*/i.test(task);
  if (out.crackStitch) { out.masonryLay = false; out.masonryMortar = false; }
  out.septicRemove = /\bseptic\b/i.test(task) && /\b(replac\w*|remov\w*|old|decommission\w*)\b/i.test(task);
  if (out.septicRemove && /\b(replac\w*|new|install\w*)\b/i.test(task)) out.tankPlace = true;
  out.flashingReplace = /\bflashings?\b/i.test(task) && /\b(replac\w*|repair\w*|leak\w*|re-?flash\w*)\b/i.test(task) && !/\b(re-?roof\w*|roof sheet\w*|new roof|roofing|sheeting|standing seam|cappings?)\b/i.test(task);
  if (out.flashingReplace) { out.roof = false; out.roofStrip = false; out.roofAccess = true; }
  if (/\b(cyclone|storm|hail|wind)[- ]damaged? (?:metal |tin |iron )?roofs?\b/i.test(task) && /\b(repair\w*|fix\w*|replac\w*)\b/i.test(task) && !/\btiles?|tiled\b/i.test(task)) { out.roof = true; out.roofStrip = true; out.roofAccess = true; }
  out.benchtopReplace = /\bbench ?tops?\b/i.test(task) && /\b(replac\w*|old)\b/i.test(task) && !/\b(new (?:apartments?|houses?|homes?|kitchens?|builds?)|stone|engineered)\b/i.test(task);
  if (out.benchtopReplace && !/\bstrip\w*\b/i.test(task)) out.stripOut = false;
  out.crossover = /\b(?:vehicle |driveway )?crossovers?\b|\bdriveway crossings?\b/i.test(task);
  if (out.crossover) { out.slabGround = true; out.slabPour = true; out.sawCut = true; out.footpathWork = true; out.groundCut = true; }
  out.bikeRacks = /\b(bike|bicycle|cycle) (?:racks?|hoops?|rails?|parking)\b/i.test(task);
  out.crackSeal = /\bseal\w*\b[^.]{0,20}\bcracks?\b|\bcracks?\b[^.]{0,20}\bseal\w*/i.test(task) && !/\binject\w*/i.test(task);
  if (out.crackSeal && !/\b(break\w*|patch\w*|spall\w*|repair\w*)\b/i.test(task)) { out.concreteRepair = false; out.pressureClean = false; }
  if ((out.tileLay || out.tileCut) && /\b(remov\w*|lift\w*|strip\w*)\b[^.]{0,20}\btiles?\b|\breplac\w*\b[^.]{0,30}\b(?:floor |wall )?tiles\b|\bre-?lay\w*\b[^.]{0,20}\btiles\b/i.test(task)) { out.tileRemove = true; out.tileLay = true; }
  if (out.tileRemove && /\bre-?lay\w*\b/i.test(task)) out.tileLay = true;
  if (out.tileRemove && /\b(leak\w*)\b/i.test(task) && /\bshowers?\b/i.test(task)) out.wpLiquid = true;
  if (/\b(?:run\w*|install\w*)\b[^.]{0,20}\b(?:new )?(?:power )?(?:circuits?|power|cables?) to (?:an? |the )?(?:\w+ )?(?:sheds?|garages?|granny flats?|studios?|outbuildings?|workshops?|pool (?:pumps?|houses?)|gates?)\b/i.test(task) && !out.trench) { out.shallowTrench = true; out.fitOff = true; out.isolation = true; }
  if (out.frameRepair) out.houseFraming = false;
  out.ceilingTileReplace = /\breplac\w*\b[^.]{0,20}\bceiling tiles\b/i.test(task) && !/\bgrid\b/i.test(task);
  if (out.ceilingTileReplace) out.ceilingGrid = false;
  out.oldTiles = Boolean(out.tileRemove && !/\b(cracked|broken|drummy|loose|damaged|chipped)\b/i.test(task));
  if (/\bgranny flat kits?\b|\bkit homes?\b/i.test(task)) out.kitStructure = true;
  if (out.paintExternal && !/\b(external\w*|exterior|outside|facade|fa[cç]ade|eaves|fascias?|towers?|tank stands?)\b/i.test(task) && /\b(warehouses?|factor(?:y|ies)|inside|interior|internal|halls?|gyms?|sheds?)\b/i.test(task)) out.paintExternal = false;
  if (/\b(?:install\w*|new|add\w*)\b[^.]{0,10}\b(?:an? |the )?(?:home )?batter(?:y|ies)\b/i.test(task) && !/\b(smoke alarms?|remotes?|torch\w*)\b/i.test(task)) out.batteryStorage = true;
  out.facadeSign = !out.signPostsOnly && !out.pylonSign;
  // Bank 9 rules.
  out.stoneWall = /\b(?:build\w*|construct\w*|lay\w*)\b[^.]{0,20}\b(?:dry )?stone walls?\b/i.test(task) && !/\b(clean\w*|seal\w*|repoint\w*|cladding)\b/i.test(task);
  if (out.stoneWall) out.retainingWall = /\bretaining\b/i.test(task);
  out.gasRegulator = /\bgas\b[^.]{0,20}\bregulators?\b|\bregulators?\b[^.]{0,20}\bgas\b/i.test(task);
  out.exhaustDuctClean = /\bclean\w*\b[^.]{0,40}\b(?:kitchen )?exhaust (?:ducts?|hoods?|fans?|systems?)\b/i.test(task);
  if (out.exhaustDuctClean) { out.ductwork = false; out.kitchenEquipment = false; }
  out.stairInstall = /\b(?:install\w*|build\w*|new)\b[^.]{0,20}\b(?:timber |internal |new )*stair(?:case|s|way)?\b/i.test(task) && /\b(houses?|homes?|dwellings?|timber|townhouses?)\b/i.test(task) && !/\b(steel|concrete|stair ?lifts?|treads? only|carpet)\b/i.test(task);
  if (out.stairInstall) { out.accessSteel = false; out.timberStairs = false; }
  out.portableBuilding = /\b(portable|relocatable|modular|demountable|transportable) (?:classrooms?|buildings?|offices?|homes?|cabins?)\b/i.test(task) && /\b(install\w*|deliver\w*|plac\w*|set\w*|lift\w*|relocat\w*)\b/i.test(task);
  if (out.portableBuilding) out.craneInterface = true;
  out.stoneCladding = /\bstone (?:cladding|veneer|panels?|feature walls?)\b/i.test(task) && /\b(install\w*|fix\w*|lay\w*)\b/i.test(task) && !/\b(external|facade|outside)\b/i.test(task);
  if (out.stoneCladding) out.claddingInstall = false;
  out.awningReplace = !/\b(bird|netting|spikes?|signs?|signage|lights?|lighting|under|beneath)\b/i.test(task) && /\b(?:replac\w*|remov\w*|install\w*|new)\b[^.]{0,20}\b(?:an? |the )?(?:shop ?front |street |footpath )?awnings?\b/i.test(task) && /\b(shop\w*|street|footpath|front)\b/i.test(task);
  if (out.awningReplace) out.kitStructure = false;
  out.polySheets = /\b(polycarbonate|laserlite|fibreglass) (?:roof\w*|sheets?)\b/i.test(task) && /\b(repair\w*|replac\w*|fix\w*)\b/i.test(task);
  if (out.polySheets && /\bpergolas?\b/i.test(task)) { out.roof = false; out.roofStrip = false; out.verandahRepair = false; }
  out.slabLift = /\b(sinking|sunken|settled|uneven) (?:concrete )?slabs?\b|\bslab (?:lifting|jacking|raising)\b|\bpolyurethane (?:injection|foam)\b[^.]{0,30}\bslab|\bslab\b[^.]{0,40}\bpolyurethane (?:injection|foam)\b/i.test(task);
  if (out.slabLift) out.crackInjection = false;
  if (/\b(walkways?|boardwalks?)\b/i.test(task) && /\b(build\w*|construct\w*|install\w*)\b/i.test(task) && /\btimber\b/i.test(task)) out.deckBuild = true;
  if (/\b(decking|deck boards?)\b/i.test(task) && /\b(replac\w*|remov\w*)\b/i.test(task)) { out.deckBuild = true; out.deckReplace = true; }
  if (/\b(hardwood|parquet|bamboo|spotted gum|blackbutt|tallowwood) (?:timber )?(?:floor\w*|boards?)\b/i.test(task)) out.timberFloor = true;
  if (/\b(?:install\w*|replac\w*|fit\w*)\b[^.]{0,20}\b(?:bathroom |toilet |laundry |ceiling )?exhaust fans?\b/i.test(task) && /\b(bathrooms?|toilets?|laundr\w*|ensuites?|ceilings?)\b/i.test(task)) { out.fitOff = true; out.isolation = true; out.roofSpace = true; }
  if (/\bfibro\b|\basbestos\b/i.test(task) && /\b(remov\w*|strip\w*)\b[^.]{0,30}\b(?:\w+ ){0,2}(?:wall |ceiling )?(?:linings?|sheets?|walls?|sheeting)\b/i.test(task)) out.asbestos = true;
  if (/\bsewer\w* pump (?:stations?|wells?)\b|\bpump stations?\b/i.test(task) && /\b(install\w*|new|build\w*)\b/i.test(task) && !out.sewerPumpSwap) { out.trench = true; out.tankPlace = true; out.pumpInstall = true; }
  if (/\b(verandah|deck|balcony) floor\w*\b/i.test(task) && !/\b(roof|posts?|beams?|rafters?)\b/i.test(task)) { out.verandahRepair = false; out.deckBuild = true; out.deckReplace = /\b(replac\w*|remov\w*)\b/i.test(task); }
  if (/\b(planter|planter boxes?|podium)\b/i.test(task) && /\bmembranes?\b/i.test(task) && /\b(replac\w*|remov\w*|strip\w*|re-?do\w*)\b/i.test(task)) { out.membraneStrip = true; out.wpLiquid = true; }
  if (/\b(?:install\w*|new|add\w*)\b[^.]{0,30}\bfloor (?:wastes?|drains?)\b/i.test(task) && !/\b(tiles?|tiling|bedding|grout|charged|gullies|align\w*)\b/i.test(task)) { out.kitchenEquipment = false; out.sawCut = true; out.plumbingFitOff = true; }
  // Bank 8 review rules.
  if (/\bgranny flat kits?\b|\bkit homes?\b/i.test(task)) { out.kitStructure = false; out.houseFraming = true; out.roof = true; out.claddingInstall = true; }
  if (/\b(?:install\w*|replac\w*) (?:a |the )?(?:new )?switch ?boards?\b/i.test(task) && !/\b(main switch ?boards?|msbs?|consumer mains|existing switch ?boards?|meter (?:box|board|panel)s?|houses?|homes?|units?)\b/i.test(task) && !out.switchboardReplace && !out.subBoardInstall) { out.isolation = true; out.subBoardInstall = true; if (/\b(sheds?|garages?|workshops?|farm\w*|granny flats?|barns?|pump (?:sheds?|houses?))\b/i.test(task)) out.boardDelivery = false; }
  if (/\b(roof (?:ventilators?|vents?|turbines?|exhaust fans?)|whirlybirds?|turbine vents?|rooftop exhaust fans?|exhaust fans? on (?:a |the )?(?:\w+ )?roof)\b/i.test(task) && /\b(install\w*|new|fit\w*)\b/i.test(task)) out.roofPenetration = true;
  if (out.smokeAlarms && /\b(houses?|homes?|dwellings?|units?|rental)\b/i.test(task)) out.roofSpace = true;
  out.bollardChains = Boolean(out.bollards && /\bchains?\b/i.test(task));
  if (/\b(?:replac\w*|damaged|broken|collapsed)\b[^.]{0,30}\b(?:stormwater |drainage |sewer )?pits?\b(?! (?:lids?|grates?|covers?))/i.test(task)) { out.pitReplace = true; out.sawCut = out.sawCut || /\b(roads?|streets?|car ?parks?|driveways?)\b/i.test(task); }
  if (/\bducted (?:gas )?heating\b|\bgas ducted heat\w*\b/i.test(task) && !/\b(electric|reverse cycle|heat pump|refrigerat\w*)\b/i.test(task)) { out.flueInstall = true; out.gasHeater = true; out.gasFitting = true; }
  out.gravelLay = /\b(?:lay\w*|build\w*|construct\w*|form\w*|spread\w*)\b[^.]{0,30}\bgravel\b/i.test(task);
  if (out.gravelLay) out.earthworks = false;
  if (out.kitStructure && /\b(carports?|sheds?|pergolas?|patio\w*|verandahs?|awnings?|shade)\b/i.test(task) && !/\b(columns?|portal|universal beams?|steel erect\w*)\b/i.test(task)) { out.steelErect = false; out.steelLift = false; }
  if (out.jettyRepair && !/\b(frames?|bearers?|joists?|piles?|posts?)\b/i.test(task)) out.deckBuild = false;
  if (/\bshop ?fronts?\b/i.test(task) && /\b(install\w*|new|replac\w*)\b/i.test(task) && !out.paneReplace) out.windowInstall = true;
  out.unitsOnly = Boolean(out.cabinetWork && !/\b(sheets?|studs?|fram\w*|plasterboard|hoists?|cladding|linings?)\b/i.test(task));
  if (out.windowInstall && /\b(?:a|one|single)\b[^.]{0,20}\bwindows?(?: frames?)?\b/i.test(task) && /\b(houses?|homes?|townhouses?|units?|cottages?)\b/i.test(task)) out.glassHandle = false;
  if (/\bre-?sheet\w*\b/i.test(task) && /\broofs?\b/i.test(task)) out.roofStrip = true;
  if (out.sawCut && /\b(driveways?|footpaths?|paths?|kerbs?|roads?|car ?parks?|crossovers?|paving)\b/i.test(task) && !/\b(walls?|suspended|floor openings?|penetrations?|core)\b/i.test(task)) out.cutOpening = false;
  out.notMeter = !out.meterInstall;
  out.cableOnlyTrench = Boolean(out.shallowTrench && /\b(power|circuits?|cables?|electric\w*|lights?|lighting)\b/i.test(task) && !/\b(water|pipes?|irrigation|plumbing|gas|drain\w*)\b/i.test(task));
  // Bank 10 rules.
  out.birdSpikes = /\bbird (?:spikes?|deterrents?)\b/i.test(task) && !/\bnet\w*\b/i.test(task);
  if (out.birdSpikes) out.kitStructure = false;
  out.solarClean = /\bclean\w*\b[^.]{0,20}\bsolar (?:panels?|arrays?)\b/i.test(task);
  if (out.solarClean) { out.solarPV = false; out.solarPanels = false; out.roofAccess = true; out.cleaning = false; out.pressureClean = false; }
  out.gateRepair = /\b(?:repair\w*|fix\w*|rehang\w*|adjust\w*)\b[^.]{0,20}\b(?:a |the )?(?:sagging |broken |damaged )?gates?\b/i.test(task);
  out.dockLeveller = /\bdock (?:levell?ers?|plates?)\b/i.test(task);
  out.filmApply = /\b(window|security|tint\w*|privacy|safety|frosted) films?\b|\bwindow tint\w*/i.test(task);
  if (out.filmApply) { out.windowInstall = false; out.glassHandle = false; }
  out.poolRemoval = /\b(?:remov\w*|fill\w* in|demolish\w*|break\w* out)\b[^.]{0,20}\b(?:a |the |an old )?(?:swimming )?pools?\b/i.test(task) && !/\b(pool (?:fences?|pumps?|filters?|heaters?|lights?|tiles?|covers?))\b/i.test(task);
  out.groundSolar = /\bground[- ]?mount\w*\b|\bground (?:frames?|arrays?)\b|\bsolar farms?\b/i.test(task) && /\bsolar|panels?\b/i.test(task);
  if (out.groundSolar) { out.solarPanels = false; out.roofAccess = false; out.solarArray = true; }
  out.heaterRemoval = /\b(?:remov\w*|decommission\w*|disconnect\w*)\b[^.]{0,30}\b(?:oil |gas |wood |old )*(?:heaters?|space heaters?|fireplaces?)\b/i.test(task);
  if (out.heaterRemoval) out.flueInstall = false;
  if (/\btempering valves?\b|\b(?:pressure|thermostatic) (?:reducing |mixing )?valves?\b/i.test(task) && /\b(replac\w*|install\w*|fit\w*|leak\w*)\b/i.test(task)) out.plumbingFitOff = true;
  if (/\b(grey ?water|rainwater harvesting)\b/i.test(task) && /\b(install\w*|new)\b/i.test(task)) { out.rainwaterTank = true; out.trench = true; }
  if (out.jointSealing) { out.pressureClean = false; out.sealing = false; }
  if (/\bbefore (?:the )?til\w*\b|\bready for til\w*\b/i.test(task)) { out.tileLay = false; out.tileCut = false; }
  if (/\b(gate (?:openers?|motors?|automation)|automatic gates?|barrier arms?|boom arms?)\b/i.test(task)) { out.gateInstall = true; if (!/\b(bollards?|wheel stops?|speed humps?)\b/i.test(task)) out.bollards = false; }
  if (out.rangeHood && /\bcanop(?:y|ies)\b/i.test(task)) { out.carpJoinery = false; out.carpentryWork = false; }
  if (out.timberStairs && /\bdeck\b/i.test(task) && !/\b(decking|deck boards?|deck frame)\b/i.test(task)) out.deckBuild = false;
  if (/\bpot ?holes?\b/i.test(task) && /\b(gravel|dirt|unsealed)\b/i.test(task)) { out.asphalt = false; out.gravelLay = true; }
  if (/\b(?:timber |batten )screen\w*\b|\btimber battens? on\b/i.test(task) && /\b(facades?|walls?|houses?)\b/i.test(task)) out.claddingInstall = true;
  if (/\bfibro\b|\basbestos\b/i.test(task) && /\beaves?\b/i.test(task) && /\b(repair\w*|replac\w*|remov\w*)\b/i.test(task)) { out.asbestos = true; out.eavesWork = true; }
  if (/\bfibro roofs?\b/i.test(task)) out.asbestosCheck = true;
  if (/\b(?:air ?condition\w*|ac) (?:sleeves?|units?)\b[^.]{0,30}\bthrough (?:a |the )?walls?\b|\bthrough[- ]wall\b/i.test(task)) { out.coreDrill = true; out.wallPenetration = true; }
  if (out.paverRepair && /\bdriveways?\b/i.test(task)) out.paving = true;
  // Bank 9 review rules.
  out.liftMotor = /\b(?:replac\w*|install\w*|new)\b[^.]{0,20}\blift (?:motors?|machines?|drives?|brakes?)\b/i.test(task) && /\bexisting\b|\breplac\w*/i.test(task);
  if (out.liftMotor) { out.liftInstall = false; out.liftShaft = false; }
  out.boilerInstall = Boolean(out.boilerPlant && /\b(install\w*|new)\b/i.test(task) && !/\breplac\w*|\bold\b/i.test(task));
  if (/\bcool ?room\b[^.]{0,20}\b(refrigeration units?|condensers?|compressors?)\b|\brefrigeration units?\b/i.test(task) && !/\bpanels?\b/i.test(task)) out.coolroomPanels = false;
  if (/\b(grease (?:traps?|arrestors?)|floor (?:wastes?|drains?))\b/i.test(task)) out.cutOpening = false;
  if (/\bpressure (?:reducing|limiting) valves?\b|\bprv\b/i.test(task)) { out.meterInstall = false; out.waterConnection = false; out.plumbingFitOff = true; }
  if (out.gateInstall && /\b(conduits?|cables?)\b/i.test(task)) { out.shallowTrench = true; out.cableOnlyTrench = true; if (/\bcar ?parks?|driveways?|roads?\b/i.test(task)) { out.sawCut = true; out.cutOpening = false; } }
  out.planterMembrane = Boolean(out.membraneStrip && /\b(planters?|podium)\b/i.test(task));
  out.noDigging = Boolean(out.landscapeLift || out.planterMembrane);
  if (out.belowGroundWp && /\b(repair\w*|damage\w*|leak\w*)\b/i.test(task)) out.crackInjection = true;
  out.splashback = /\bsplashbacks?\b/i.test(task);
  out.oldWallTiles = Boolean(out.oldTiles && (out.splashback || out.wallTiling || /\bwall tiles?\b/i.test(task)));
  out.oldFloorTiles = Boolean(out.oldTiles && !out.oldWallTiles);
  out.flatTactile = Boolean(out.tactileInstall && /\b(platforms?|footpaths?|kerbs?|crossings?|paths?|forecourts?|interchanges?|bus stops?|bus stations?)\b/i.test(task) && !/\bstairs?\b/i.test(task));
  if (out.exhaustDuctClean) out.roofAccess = true;
  if (out.hardwareFit && !/\b(timber|frames?|doors? (?:hung|hanging)|hang\w*)\b/i.test(task)) out.carpentryWork = false;
  if (out.steelErect && /\btrusses\b/i.test(task)) out.steelLift = true;
  if (out.ceilingFans && /\b(houses?|homes?|bedrooms?|units?|dwellings?)\b/i.test(task)) out.roofSpace = true;
  out.motorOnly = Boolean(out.garageDoor && /\b(motors?|openers?|remotes?)\b/i.test(task) && !/\b(new (?:(?:garage|roller|panel lift|sectional) )*doors?(?! (?:motors?|openers?|remotes?))|replac\w* (?:the |a )?(?:(?:garage|roller|panel lift|sectional) )*doors?(?! (?:motors?|openers?|remotes?))|install\w* (?:a |the )?(?:new )?(?:(?:garage|roller|panel lift|sectional) )+doors?(?! (?:motors?|openers?|remotes?)))\b/i.test(task));
  out.noDoorLift = Boolean(out.doorSpring || out.motorOnly);
  out.outsideLights = Boolean(out.fitOff && /\b(outside|external\w*|outdoor|exterior|security lighting)\b/i.test(task));
  out.sinkTap = /\b(?:install\w*|replac\w*|fit\w*|new)\b[^.]{0,20}\b(?:kitchen |laundry )?(?:sinks?|tubs?)\b/i.test(task);
  if (out.outsideLights && !/\b(ceilings?|roof spaces?|inside)\b/i.test(task)) out.noRoofSpace = true;
  if (out.sinkTap && !/\b(new (?:kitchen|laundry|bathroom)s?|rough[- ]in|renovat\w*)\b/i.test(task)) out.fixtureSwap = true;
  out.pumpStationNew = Boolean(/\bpump (?:stations?|wells?)\b/i.test(task) && out.tankPlace && !out.sewerPumpSwap && !out.confined && !/\b(enter\w*|inside|confined)\b/i.test(task));
  if (out.stripOut && /\b(?:19[0-9]\d|200[0-3])s?\b|\bold (?:house|home|unit|building)s?\b/i.test(task)) out.asbestosCheck = true;
  if (out.wetAreaSheets || (out.asbestos && /\bwall sheets?\b/i.test(task))) out.tileRemove = false;
  // Banks 3 and 4 review rules.
  out.pumpOpening = /\b(bores?|wells?|pits?|sumps?|tanks?)\b/i.test(task);
  out.shopfront = Boolean(out.windowInstall && /\bshop ?fronts?\b/i.test(task));
  out.louvresOnly = Boolean(out.windowInstall && out.louvres && !/\b(windows? frames?|doors?)\b/i.test(task));
  if (out.louvresOnly && /\b(from inside|internal|inside)\b/i.test(task)) out.glassHandle = false;
  out.greenRoof = /\b(green roofs?|roof gardens?|roof(?:top)? planters?)\b/i.test(task) || (out.landscapeLift && /\broofs?\b/i.test(task) && !/\bpodium\b/i.test(task));
  if (out.greenRoof) out.roofAccess = true;
  out.backflowOnly = Boolean(out.meterInstall && !/\bwater meters?\b|\bmeters?\b/i.test(task) && !/\b(water (?:services?|supply|supplies)|connections?|mains?|incoming)\b/i.test(task));
  if (out.backflowOnly) out.waterConnection = false;
  if (/\bfuel (?:lines?|pipes?|pipework)\b/i.test(task) && /\b(install\w*|new|lay\w*)\b/i.test(task)) out.trench = true;
  if (!/\btarp\w*/i.test(task)) if (/\b(cyclone|storm|hail|wind)\b/i.test(task) && /\broofs?\b/i.test(task) && /\b(repair\w*|fix\w*|replac\w*|damaged)\b/i.test(task) && !/\btiles?|tiled|skylights?|membranes?|gutters?\b/i.test(task)) { out.roofStrip = true; out.roof = true; }
  if (/\bseptic\b/i.test(task) && /\b(upgrad\w*|replac\w*)\b/i.test(task)) { out.septicRemove = true; out.tankPlace = true; }
  if (out.stoneWall && out.retainingWall) out.timberOnlyWall = true;
  if (/\b(vinyl|hybrid|laminate) (?:planks?|tiles?)\b|\blvt\b/i.test(task)) out.carpetTiles = true;
  out.sprinklerOnly = Boolean(out.fireAtHeight && /\bsprinklers?\b/i.test(task) && !/\bhydrants?\b/i.test(task));
  out.houseRaise = /\b(rais\w*|lift\w*)\b[^.]{0,20}\b(?:the |a )?(?:\w+ )?(?:house|home|queenslander)\b/i.test(task);
  if (out.paintExternal && /\b(fascias?|eaves|gutters?)\b/i.test(task) && /\b(?:re)?paint\w*\b/i.test(task) && !/\b(replac\w*|install\w*|new)\b[^.]{0,20}\b(?:\w+ )?(gutters?|downpipes?|linings?|fascias?|fascia boards?)\b/i.test(task)) out.gutters = false;
  if (out.garageDoor === false && /\bcool ?room doors?\b/i.test(task)) out.timberWork = false;
  if (/\bcool ?room doors?\b/i.test(task)) out.timberWork = false;
  if (out.floorCoating) out.sealing = false;
  // Commercial bank 12 rules.
  const T = (re) => re.test(task);
  // Plant and infrastructure rules.
  const EARTH_PLANT = /\b(dozers?|bulldozers?|graders?|scrapers?|articulated dump trucks?|adts?|front end loaders?|wheel loaders?|(?<!low )loaders?|water carts?|padfoot rollers?|rolling impact compactors?|haul trucks?|haul roads?|bulk earthworks|cut and fill|subgrade|mulchers?)\b/i;
  if (T(EARTH_PLANT) && !T(/\b(skid ?steers?|bobcats?)\b/i)) { out.earthworks = true; out.sitePlant = true; }
  out.roadPlant = T(/\b(road profilers?|profiling|cold planers?|asphalt pavers?|resurfac\w* (?:a |the )?(?:road|lanes?|carriageway|street|highway|motorway)|asphalt resurfac\w*|resheet\w*|stabilis\w*|lime spreaders?|line marking trucks?|truck mounted attenuators?|tmas?)\b/i);
  if (out.roadPlant) { out.road = true; if (T(/\b(profil\w*|resurfac\w*|asphalt)\b/i)) out.asphalt = false; }
  out.heavyLift = T(/\b(\d{3,} ?t|\d{3,} tonnes?)\b[^.]{0,30}\bcranes?\b|\bcranes?\b[^.]{0,40}\b\d{3,} ?(?:t|tonnes?)\b|\b(crawler cranes?|tandem lifts?|two cranes|dual lift|heavy lift)\b/i) && !T(/\b(assembl\w*|dismantl\w*) (?:a |the )?crawler crane\b/i);
  if (out.heavyLift) out.craneInterface = true;
  if (out.dualLift) out.heavyLift = false;
  out.craneAssembly = T(/\b(assembl\w*|dismantl\w*|rig\w* up)\b[^.]{0,20}\b(?:a |the )?crawler cranes?\b/i);
  out.transportMove = T(/\b(self-?propelled modular transporters?|spmts?|launching gantr(?:y|ies)|launch\w* (?:bridge )?girders?|skidding systems?|incremental launch\w*)\b/i);
  out.drivenPiles = T(/\b(impact hammers?|vibratory hammers?|vibro hammers?|driv\w* (?:steel |h |sheet |timber |concrete )?piles?|pile driv\w*|sheet piles?)\b/i);
  if (out.drivenPiles) { out.pilingRig = false; out.openBore = false; }
  out.groundImprove = T(/\b(wick drains?|stone columns?|vibro (?:rigs?|compaction|replacement)|rolling impact compact\w*|dynamic compaction|deep soil mixing|ground improvement)\b/i);
  out.drillRig = T(/\b(rock anchors?|rock bolts?|soil nails?|drill rigs?)\b/i) && !T(/\bdirectional\b/i);
  out.groutPump = T(/\bgrout\w* (?:the )?(?:ground )?anchors?\b|\bgrout pumps?\b/i);
  out.tunnelWork = T(/\b(tunnel\w*|roadheaders?|tbms?|tunnel boring)\b/i) && !T(/\btunnel (?:forms?|formwork)\b/i);
  if (out.tunnelWork) { out.trench = false; }
  out.marinePlant = T(/\b(barges?|jack-?up|dredg\w*|work boats?|tugs?)\b/i) && !T(/\bfrom (?:a |the )?pontoon\b/i);
  out.heavyHaulage = T(/\b(low ?loaders?|oversize|over-?mass|escorts?|truck and dog|haul\w* (?:spoil|material|fill)\w* on (?:public )?roads?|public roads?)\b/i);
  out.processPlant = T(/\b(crushing|screening plant|(?<!concrete )crushers?|batching plants?|batch plants?|quarr(?:y|ies))\b/i);
  out.refuelPlant = T(/\b(refuel\w*|fuel trucks?|fuel trailers?)\b/i);
  out.plantService = T(/\b(servic(?:e|ing)|maintain\w*|repair\w*)\b[^.]{0,30}\b(plant|excavators?|machines?|trucks?|equipment)\b|\bfield workshops?\b/i) && !T(/\b(air ?condition\w*|lifts?|escalators?|rooftop units?|hvac)\b/i);
  out.vegClearing = T(/\b(clear\w* vegetation|vegetation clearing|mulchers?|grubbing|clear and grub)\b/i);
  out.towerLift = T(/\b(transmission towers?|wind turbines?|turbine towers?|lattice towers?)\b/i) && T(/\b(install\w*|erect\w*|lift\w*)\b/i);
  if (out.towerLift) { out.craneInterface = true; out.heavyLift = true; }
  out.hydroDemo = T(/\bhydro[- ]?demoli\w*\b/i);
  if (out.hydroDemo) { out.structureDemolition = false; out.demolition = false; out.masonryDemo = false; }
  out.vacExcavation = T(/\b(hydro ?excavat\w*|vacuum excavat\w*|non-destructive dig\w*|vacuum trucks?)\b/i) && T(/\b(locate|expos\w*|pothol\w*|excavat\w*)\b/i);
  if (out.vacExcavation) { out.trench = false; }
  if (T(/\b(?:operat\w*|run\w*|use)\b[^.]{0,20}\b(?:a |the )?tower cranes?\b/i)) out.towerCrane = true;
  if (T(/\b(under-?bridge (?:inspection )?units?|ubius?|bridge inspection units?)\b/i)) { out.ewp = true; out.workAbove = true; }
  if (T(/\b(?:remov\w*|demolish\w*|lift\w* out)\b[^.]{0,30}\bbridge decks?\b|\bbridge\b[^.]{0,20}\b(?:demolition|demolish\w*)\b|\bdemolish\w*\b[^.]{0,20}\bbridges?\b/i)) { out.jettyRepair = false; out.structureDemolition = true; out.demolition = true; out.workAbove = T(/\b(over|above|motorway|highway|rail\w*|roads?)\b/i); }
  if (T(/\brock armou?r\b|\bbreakwaters?\b|\brevetments?\b/i)) { out.landscape = false; out.rockLining = true; out.water = true; }
  if (T(/\b(?:pump|work\w*)\b[^.]{0,30}\bfrom (?:a |the )?pontoon\b/i)) { out.pontoonPlace = false; out.jettyRepair = false; }
  if (T(/\b(noise|sound) wall panels?\b/i)) { out.wallPanels = false; out.noiseWall = true; }
  if (T(/\b(?:lay\w*|install\w*|relocat\w*|divert\w*)\b[^.]{0,30}\b(?:\d+ ?mm )?(?:water|sewer|trunk|gas) mains?\b/i) && !out.mainRepair) { out.trench = true; }
  if (T(/\b(?:operat\w*|run\w*)\b[^.]{0,20}\bdewatering\b/i)) { out.dewatering = true; out.trench = false; }
  if (T(/\b(temporary|haul) bridges?\b/i)) { out.steelErect = true; out.craneInterface = true; }
  if (T(/\bsolar farm\b/i) && T(/\bpiles?\b/i)) out.groundSolar = T(/\b(panels?|modules?|frames?|trackers?)\b/i);
  if (T(/\b(road rail vehicles?|rrvs?|hi-?rail)\b/i)) { out.railCorridor = true; out.sitePlant = true; }
  if (T(/\b(track laying|tamp\w*|track machines?|ballast regulators?)\b/i)) { out.trackWork = true; out.railCorridor = true; }
  if (T(/\b(mass concrete|dam spillways?|diaphragm walls?|tremie)\b/i)) out.concrete = true;
  if (T(/\b(traffic switch|lane closures?|long term traffic|variable message (?:boards|signs))\b/i)) out.road = true;
  if (T(/\b(cable (?:winch|drum trailers?)|pull\w* (?:high voltage |hv )?cables?)\b/i)) out.cablePull = true;
  if (T(/\bmine (?:sites?)?\b|\bmining\b|\bon a mine\b/i)) out.mineSite = true;
  // Venue and government project rules.
  out.spoilManage = T(/\b(spoil|stockpil\w*|cart\w* (?:the )?(?:spoil |soil |fill )?(?:away|off ?site)|muck\w* (?:away|out)|tip\w* off ?site|dispos\w* of (?:the )?(?:soil|fill|spoil))\b/i) && !T(/\b(spoil(?:s|ed)? the|unspoil\w*)\b/i);
  out.loaderCrane = T(/\b(vehicle loading cranes?|loader cranes?|truck[- ]mounted cranes?|knuckle boom cranes?|crane trucks?)\b/i);
  if (out.loaderCrane && !T(/\b(mobile|crawler|tower|franna|all terrain|slewing) cranes?\b/i)) out.craneInterface = false;
  out.poolShell = T(/\b(pool shells?|(?:construct\w*|build\w*)\b[^.]{0,30}\b(?:swimming |competition |lap |\d+ ?m )?pools?)\b/i) && T(/\b(shotcrete|gunite|sprayed concrete|spray\w* concrete)\b/i);
  if (out.poolShell) out.shotcrete = false;
  if (T(/\b(athletics|track|field|venues?|arenas?|ovals?)\b[^.]{0,30}\blight\w*|\b(field|flood) light\w*/i) && T(/\b(install\w*|new|erect\w*)\b/i) && !out.stageRig) { out.sportsLighting = true; out.fitOff = false; }
  out.tensileRoof = T(/\b(ptfe|etfe|fabric roofs?|tensile (?:fabric|membrane)s?|(?:fabric|membrane) roof (?:membranes?|panels?)|roof membrane panels?)\b/i) && T(/\b(install\w*|fix\w*|erect\w*|tension\w*|replac\w*)\b/i) && !T(/\bwaterproof\w*\b/i);
  if (out.tensileRoof) { out.wpEdge = false; out.wpLiquid = false; out.wpTorch = false; out.wpPrep = false; }
  out.sportsSurface = T(/\b(synthetic (?:athletics )?tracks?|athletics track surfac\w*|track surfac\w*|polyurethane (?:sports )?surfac\w*|rubberi[sz]ed (?:sports )?surfac\w*|synthetic sports surfac\w*|(?:sports|athletics) surfac\w*)\b/i) && !T(/\b(sweep\w*|clean\w*|inspect\w*)\b/i);
  out.poolFloor = T(/\b(mov(?:e)?able (?:pool )?floors?|pool bulkheads?|bulkheads?\b[^.]{0,20}\bpools?)\b/i);
  if (out.poolFloor) { out.carpentryWork = false; out.carpLoad = false; out.carpFraming = false; }
  out.seatingInstall = T(/\b(retractable seating|telescopic seating|raked (?:theatre )?seating|tiered seating|theatre seat\w*|auditorium seat\w*|stadium seats?|grandstand seats?|seating systems?)\b/i) && T(/\b(install\w*|replac\w*|fit\w*)\b/i) && !T(/\bprecast\b/i);
  out.marquee = T(/\b(marquees?|hospitality structures?|temporary (?:event )?structures?|event overlay|pavilion tents?)\b/i) && T(/\b(erect\w*|install\w*|build\w*|put up|set\w* up)\b/i);
  out.stageRig = T(/\b(temporary stages?|stage and lighting|lighting rigs?|rig\w* the lighting|staging|concert stages?|ceremony stages?)\b/i) || (T(/\bstages?\b/i) && T(/\b(lighting|ceremony|concert|event)\b/i) && T(/\b(install\w*|build\w*|erect\w*)\b/i));
  if (out.stageRig) { out.sportsLighting = false; out.screens = false; }
  out.platformWiden = T(/\bplatforms?\b/i) && T(/\b(widen\w*|extend\w*|rais\w*|lengthen\w*)\b/i) && T(/\b(stations?|rail\w*|train)\b/i);
  if (out.platformWiden) out.railCorridor = true;
  out.poleErect = T(/\b(?:overhead wiring|ohw|catenary|light rail|tram|its|cctv|camera|flag|traffic signal|signal|sign|lighting|light) poles?\b|\bpoles?\b[^.]{0,30}\b(?:in|along) (?:a |the )?(?:road reserves?|road|motorway|highway)\b/i) && T(/\b(install\w*|erect\w*|stand\w*|new)\b/i) && !out.streetLighting && !T(/\b(temporary|builder'?s?) (?:power )?poles?\b|\bsolar\b/i);
  if (out.poleErect) { out.footingHoles = true; out.craneInterface = true; out.ohwInstall = false; }
  out.greenRoofLayers = Boolean(out.greenRoof) && T(/\b(install\w*|new|build\w*|construct\w*)\b/i);
  if (out.greenRoofLayers) out.landscapeLift = false;
  if (T(/\b(diving (?:towers?|platforms?|boards?)|catwalks?|rigging (?:points?|grids?)|long span (?:steel )?(?:roof )?trusses|roof trusses)\b/i) && T(/\b(install\w*|erect\w*|construct\w*|build\w*)\b/i)) { out.steelErect = true; out.steelLift = true; }
  if (T(/\b(broadcast|media|audio ?visual|av)\b[^.]{0,20}\bcabl\w*/i)) out.ictCabling = true;
  if (T(/\bfit\w*[- ]?out\b/i) && T(/\b(corporate boxes|suites?|offices?|kitchens?|bars?|kiosks?|boxes)\b/i) && !T(/\b(strip\w*|remov\w*|demoli\w*)\b/i)) { out.carpJoinery = true; if (T(/\bkitchens?\b/i)) out.kitchenEquipment = true; }
  if (T(/\b(emergency warning|ewis|intercommunication|fire detection|fire alarms?)\b/i) && T(/\b(commission\w*|test\w*)\b/i)) { out.commissioning = true; out.isolation = true; }
  if (!out.concrete && !out.formwork && T(/\b(?:build|pour|construct)\w*\b[^.]{0,40}\bslabs?\b/i) && T(/\b(tower cranes?|apartments?|towers?|storeys?|levels?|suspended|transfer)\b/i) && !T(/\b(on ground|ground slabs?|raft|basement|footings?|footpaths?|driveways?|house|shed|garage)\b/i)) { out.formwork = true; out.reo = true; out.concrete = true; if (T(/\btower cranes?\b/i)) out.towerCrane = true; }
  if (T(/\bstations?\b[^.]{0,30}\bcanop(?:y|ies)\b/i)) { out.steelErect = true; out.steelLift = true; }
  if (T(/\bgantr(?:y|ies)\b/i) && T(/\b(motorways?|highways?|roads?|its|intelligent transport|signs?)\b/i) && !T(/\b(hoarding|protection|gantry cranes?)\b/i)) { out.steelLift = true; out.steelErect = true; out.workAbove = true; if (T(/\bcabl\w*/i)) out.cablePull = true; }
  if (T(/\b(high voltage|hv|\d+ ?kv)\b/i) && T(/\bcables?\b/i) && T(/\b(relocat\w*|divert\w*|lay\w*|pull\w*)\b/i) && !T(/\b(joint\w*|terminat\w*)\b/i)) { out.cablePull = true; if (T(/\b(relocat\w*|divert\w*|energised|live|existing)\b/i)) { out.hvWork = true; out.isolation = true; } if (T(/\b(relocat\w*|divert\w*|lay\w*|trench\w*|buri\w*|underground)\b/i)) out.trench = true; }
  if (T(/\b(?:install\w*|build\w*|construct\w*)\s+(?:a |an |the )?(?:new )?(?:\w+ )?(?:kv )?substations?\b(?! (?:transformers?|switchgear|switchboards?))/i) && !T(/\bfenc\w*/i)) { out.substationEquip = true; out.craneInterface = true; out.cablePull = true; out.hvWork = true; out.commissioning = true; out.isolation = true; }
  if (T(/\b(double tees?|hollow ?core planks?|precast (?:floor|deck) (?:units?|planks?))\b/i)) { out.precastFloor = true; out.precast = false; out.craneInterface = true; }
  if (T(/\b(mechanical plant|chillers?|cooling towers?|ahus?|air handling units?|rooftop units?|condensers?)\b/i) && T(/\broofs?\b/i) && T(/\bcranes?\b/i)) { out.plantLift = true; out.craneInterface = true; }
  if (T(/\b(modular (?:buildings?|classrooms?)|relocatable (?:buildings?|classrooms?)|transportable (?:buildings?|classrooms?))\b/i)) out.moduleInstall = true;
  if (T(/\b(covered outdoor learning areas?|colas?|shade structures?|covered (?:walkways?|areas?))\b/i) && T(/\b(install\w*|erect\w*|build\w*|construct\w*)\b/i)) out.kitStructure = true;
  if (T(/\b(refurbish\w*|renovat\w*|upgrad\w*)\b/i) && T(/\b(toilets?|bathrooms?|amenities|change ?rooms?|wet areas?|wards?|classrooms?|offices?)\b/i)) out.stripOut = true;
  if (T(/\b(refurbish\w*|renovat\w*|upgrad\w*)\b/i) && T(/\b(toilets?|bathrooms?|amenities|change ?rooms?|wet areas?)\b/i)) out.plumbingFitOff = true;
  if (T(/\b(pedestrian bridges?|footbridges?|foot bridges?)\b/i) && T(/\b(install\w*|lift\w*|erect\w*|place\w*)\b/i)) { out.steelLift = true; out.craneInterface = true; if (T(/\b(over|above|across)\b[^.]{0,20}\b(roads?|motorways?|highways?|rail\w*|tracks?)\b/i)) { out.workAbove = true; } }
  if (T(/\b(track slabs?|slab track|embedded rails?)\b/i)) { out.trackWork = false; out.concrete = true; out.slabGround = true; out.groundSlab = true; }
  if (T(/\b(?:construct\w*|build\w*|upgrad\w*|widen\w*)\b[^.]{0,30}\b(?:on-?ramps?|off-?ramps?|interchanges?|roundabouts?|roads?|motorways?|highways?|freeways?)\b|\bnew (?:on-?ramps?|off-?ramps?|roundabouts?|interchanges?)\b|\broad widening\b/i) && !T(/\b(cables?|mains?|pipes?|services?|poles?|cut and fill|scrapers?|dozers?|bulk earthworks)\b/i)) { out.earthworks = true; out.sitePlant = true; out.roadPlant = true; out.road = true; }
  if (T(/\bgantr(?:y|ies)\b/i) && T(/\b(motorways?|highways?|its|intelligent transport)\b/i)) out.craneInterface = true;
  out.eventPower = T(/\b(events?|overlay|festivals?|ceremon\w*|venues?)\b/i) && T(/\b(power|generators?)\b/i) && T(/\b(temporary|overlay|event)\b/i);
  if (out.eventPower) { out.tempPower = false; out.generatorPlant = false; }
  if (T(/\bsub-?surface drain\w*|\bsubsoil drain\w*/i) && T(/\bturf\b/i)) out.shallowTrench = true;
  if ((T(/\b(refurbish\w*|renovat\w*|strip\w*)\b/i) || (T(/\binstall\w*\b/i) && T(/\b(?:in|to) (?:the |existing )?(?:school )?(?:classrooms?|wards?)\b/i))) && T(/\b(schools?|hospitals?|wards?|classrooms?|public buildings?)\b/i) && !T(/\bnew (?:school|classroom|building|block|hospital|tower)\b/i)) out.asbestosCheck = true;
  out.turnstiles = T(/\b(turnstiles?|speed gates?|entry gates?|access gates?)\b/i);
  out.podOnly = T(/\bbathroom pods?\b/i) && !T(/\bmodul\w*/i);
  out.expansionJoints = T(/\bexpansion joints?\b/i) && T(/\b(bridges?|overpass\w*|decks?)\b/i);
  out.roadBuild = T(/\b(?:construct\w*|build\w*|upgrad\w*|widen\w*)\b[^.]{0,30}\b(?:on-?ramps?|off-?ramps?|interchanges?|roundabouts?|roads?|motorways?|highways?|freeways?)\b|\bnew (?:on-?ramps?|off-?ramps?|roundabouts?|interchanges?)\b|\broad widening\b/i);
  if (T(/\b(construct\w*|erect\w*|build\w*|stand\w*|lift\w*|install\w*)\b[^.]{0,40}\btilt-?up (?:panels?|walls?)\b|\bwith tilt-?up panels\b/i)) out.craneInterface = true;
  if (out.helipad && !T(/\bhoists?\b/i)) out.craneInterface = true;
  if (T(/\b(sprung (?:timber )?(?:sports )?floor\w*|timber sports floor\w*)\b/i)) { out.timberFloor = true; out.floorLay = false; }
  if (T(/\b(warm-?up tracks?|athletics tracks?|running tracks?)\b/i) && T(/\b(install\w*|construct\w*|lay\w*|build\w*|new)\b/i)) out.sportsSurface = true;
  // A whole building or structure, however it is described, is demolished with the notice and licence lines.
  if ((T(/\bdemolish\w*\s+(?:an? |the )?(?:[\w-]+ ){0,4}(?:grandstands?|stands?|stadiums?|buildings?|blocks?|car ?parks?)\b/i) || T(DEMOLISH_STRUCTURE)) && !T(/\b(sheds?|garages?|carports?|cubby|associated)\b/i)) { out.structureDemolition = true; out.demolition = false; }
  // Stripping and cycling forms is not building and pouring a new deck.
  out.timberFramingOnly = T(/\btimber (?:fram\w*|studs?|wall frames?)\b/i) && !T(/\bsteel (?:fram\w*|studs?)\b/i);
  out.formStripOnly = Boolean(out.formwork) && T(/\b(strip\w*|cycl\w*|fly\w*|flown)\b/i) && !T(/\b(erect\w*|set\w* up|install\w* (?:the )?formwork|pour\w*|build\w*)\b/i);
  out.tableForms = T(/\btable forms?\b|\bflying forms?\b/i);
  // Pipes laid under a road or in the ground are laid in a trench.
  if (T(/\b(install\w*|lay\w*|replac\w*)\b/i) && T(/\b(pipes?|pipelines?|culverts?)\b/i) && T(/\b(stormwater|sewer|water main|drains?|under (?:the |a )?road|in the ground|underground)\b/i) && !T(/\b(relin\w*|ceilings?|risers?|plant rooms?)\b|\bunder (?:an? |the )?(?:existing )?(?:house|home|floor|slab|building)/i)) out.trench = true;
  if (T(/\basbestos cement (?:pipes?|mains?)\b/i) && T(/\b(replac\w*|remov\w*|relay\w*)\b/i)) { out.trench = true; }
  if (out.dewatering && !T(/\btrench\w*\b/i)) { out.trench = false; out.deepTrench = false; }
  out.speakerHang = T(/\b(speakers?|loudspeakers?|line arrays?|pa systems?)\b/i) && T(/\b(roofs?|ceilings?|trusses?|catwalks?)\b/i) && T(/\b(install\w*|hang\w*|fix\w*)\b/i);
  out.screensOnly = T(/\b(big screens?|video screens?|led screens?|scoreboards?)\b/i) && !T(/\blight\w*/i);
  out.lightTowers = T(/\b(light(?:ing)? towers?|floodlight towers?|light masts?)\b/i);
  out.standDismantle = T(/\bdismantl\w*/i) && !T(/\b(erect\w*|install\w*)\b/i);
  out.retractSeating = T(/\b(retractable|telescopic)\b/i);
  if (T(/\bair ?condition\w*\b/i) && T(/\b(classrooms?|offices?|rooms?|wards?)\b/i) && T(/\b(install\w*|new|replac\w*)\b/i) && !T(/\b(ducted|chillers?|vrf|vrv)\b/i)) out.splitInstall = true;
  if (T(/\b(?:install\w*|commission\w*)\s+(?:a |an |the |new )*(?:building management systems?|bms|building automation)\b/i)) { out.ictCabling = true; out.commissioning = true; }
  // Plant review rules.
  out.civilSite = T(/\b(bridges?|motorways?|highways?|freeways?|railways?|rail (?:lines?|corridors?|tracks?)|track possessions?|tunnel\w*|mines?|mining|quarr(?:y|ies)|solar farms?|wind (?:farms?|turbines?)|dams?|spillways?|wharf|breakwaters?|haul roads?|interchanges?|culverts?|transmission|road corridors?)\b/i);
  out.noDigWork = Boolean(out.earthworks && T(/\b(water carts?|load\w* trucks?|stockpiles?|dust control|haul spoil|muck\w* out)\b/i) && !T(/\b(excavat\w*|dig\w*|cut and fill|trench\w*|bulk earthworks|construct\w*|build\w*)\b/i));
  if (out.tunnelWork) out.earthworks = false;
  out.noSpoilGate = Boolean(out.noDigWork || out.mineSite || out.tunnelWork);
  out.haulRoad = T(/\bhaul roads?\b/i) && T(/\b(construct\w*|build\w*|form\w*|maintain\w*)\b/i);
  out.waterCart = T(/\bwater carts?\b/i);
  out.limeWork = T(/\b(lime|cement|stabilis\w*)\b/i);
  out.asphaltHot = T(/\b(asphalt|hot ?mix|pavers?|resurfac\w*)\b/i);
  out.truckFeed = T(/\b(pavers?|profil\w*|asphalt|resurfac\w*|cold planers?)\b/i);
  out.lineMarkOnly = Boolean(out.roadPlant && T(/\bline mark\w*/i) && !out.truckFeed && !out.limeWork);
  out.trackLaying = T(/\b(track laying|lay\w* (?:the )?(?:new )?(?:rail )?track|install\w* (?:the )?(?:new )?rail track)\b/i);
  out.tamping = Boolean(out.trackWork) && T(/\b(tamp\w*|regulat\w* (?:the )?ballast|ballast regulators?)\b/i);
  out.ohwInstall = T(/\b(overhead wiring|ohw|catenary|contact wires?)\b(?! (?:masts?|structures?|footings?|foundations?|poles?|portals?))/i) && T(/\b(install\w*|string\w*|erect\w*|replac\w*)\b/i) && T(/\b(rail\w*|track|road rail|rrvs?|tram\w*)\b/i);
  if (out.ohwInstall) { out.railCorridor = true; out.sitePlant = false; }
  out.noDeck = Boolean((out.concrete || out.reo) && (out.groundSlab || out.slabGround) && !out.formwork) || Boolean((out.concrete || out.reo) && T(/\b(piers?|columns?|spillways?|diaphragm walls?|mass concrete|tremie|pile caps?|headwalls?|abutments?)\b/i) && !T(/\b(slabs?|decks?|floors?|suspended)\b/i));
  out.tremiePour = Boolean(out.concrete && T(/\b(tremie|diaphragm walls?|secant|contiguous piles?)\b/i));
  // Diaphragm wall panels are dug under support fluid: no one works in them.
  if (out.tremiePour && T(/\bdiaphragm walls?\b/i)) { out.trench = false; out.deepTrench = false; }
  out.noFormWatch = Boolean(out.formwork || out.tremiePour || ((out.groundSlab || out.slabGround) && !out.formwork));
  out.noUnderDeck = Boolean(out.formwork || out.noDeck);
  out.reoNoDeck = Boolean(out.groundSlab || out.noDeck);
  out.concreteConveyor = Boolean(out.concrete && T(/\bconveyors?\b/i));
  out.telehandlerOnly = Boolean(out.forklift && T(/\btelehandlers?\b/i) && !T(/\bforklifts?\b/i));
  out.noSlab = Boolean(out.civilSite || T(/\b(trailers?|laydown|yards?|farms?|paddocks?|hardstands?)\b/i));
  out.trailerUnload = T(/\bunload\w*\b/i) && T(/\b(trailers?|semis?|trucks?)\b/i);
  out.bridgeDemo = T(/\b(bridges?|overpass\w*|culverts?)\b/i) && Boolean(out.structureDemolition || out.hydroDemo || out.asbestosCheck);
  out.noBuildingLine = Boolean(out.attachedStructure || out.bridgeDemo);
  // A structure brought down with explosives is not taken down from the roof.
  out.noRoofDown = Boolean(out.lightStructure || out.bridgeDemo || (out.structureDemolition && T(/\b(explosives?|implod\w*)\b/i)));
  out.wireSaw = T(/\bwire saw\w*/i);
  out.anchorWork = T(/\b(rock anchors?|ground anchors?|soil nails?|rock bolts?)\b/i);
  if (out.anchorWork && T(/\bon (?:a |the )?(?:\w+ )?retaining walls?\b/i)) out.retainingWall = false;
  out.impactRoller = T(/\brolling impact compact\w*/i);
  if (out.impactRoller) { out.groundImprove = false; out.earthworks = false; out.sitePlant = true; }
  out.trafficSwitch = T(/\b(traffic switch\w*|contraflow)\b/i);
  out.pumpReplace = T(/\b(replac\w*|remov\w*|chang\w*)\b[^.]{0,20}\b(?:a |the )?(?:\w+ )?pumps?\b/i);
  out.tempBridge = T(/\b(temporary|haul) bridges?\b/i) && T(/\b(construct\w*|build\w*|install\w*|erect\w*)\b/i);
  if (out.tempBridge) { out.steelErect = false; out.earthworks = false; out.craneInterface = false; }
  out.dredgeWork = T(/\bdredg\w*/i);
  out.bargeCrane = Boolean(out.marinePlant) && T(/\bcranes?\b/i);
  out.roadheader = T(/\b(roadheaders?|tbms?|tunnel boring)\b/i);
  out.tunnelFans = Boolean(out.tunnelWork) && T(/\b(fans?|ventilation)\b/i) && T(/\b(install\w*|replac\w*)\b/i);
  out.plantErect = Boolean(out.processPlant) && T(/\b(install\w*|erect\w*|set\w* up|relocat\w*)\b/i);
  if (out.plantErect) { out.craneInterface = true; out.road = false; }
  out.batchOnly = T(/\bbatch(?:ing)? plants?\b/i) && !T(/\b(crush\w*|screen\w*|quarr\w*)\b/i);
  out.skidMove = T(/\b(skid\w*|jack\w* and skid\w*)\b/i);
  out.launchOnly = T(/\blaunch\w*\b/i) && !out.skidMove && !T(/\b(spmts?|self-?propelled)\b/i);
  out.spmtMove = T(/\b(spmts?|self-?propelled modular transporters?)\b/i);
  out.pullback = Boolean(out.hddBore) && T(/\b(pull\w* back|pullback|pipe strings?)\b/i);
  out.waterCrossing = Boolean(out.hddBore) && T(/\b(rivers?|creeks?|waterways?|harbours?|estuar\w*)\b/i);
  out.rockArmour = T(/\b(rock armou?r|breakwaters?|revetments?|armour (?:rock|stone))\b/i);
  out.heavyUnload = Boolean(out.heavyHaulage) && T(/\b(deliver\w*|unload\w*)\b/i) && T(/\b(transformers?|oversize|over-?mass|heavy|plant items?|switch ?rooms?)\b/i);
  out.noWaterTools = Boolean(out.drivenPiles || out.marinePlant || out.rockArmour || out.tempBridge || out.dredgeWork);
  out.ubiu = T(/\b(under-?bridge (?:inspection )?units?|ubius?|bridge inspection units?)\b/i);
  if (T(/\b(culvert units?|box culverts?|precast (?:culverts?|headwalls?|units?))\b/i) && T(/\b(lift\w*|install\w*|plac\w*|lay\w*)\b/i)) out.tankPlace = true;
  if (T(/\b(?:operat\w*|run\w*)\b[^.]{0,20}\b(?:a |the )?tower cranes?\b/i)) out.craneInterface = false;
  if (T(/\bcuttings?\b/i) && !T(/\btrench\w*\b/i) && T(/\b(excavat\w*|rock break\w*)\b/i)) { out.trench = false; out.deepTrench = false; out.earthworks = true; out.sitePlant = true; }
  // Breaking rock in a trench, or setting manholes, lays no pipe of its own.
  if (out.trench && T(/\b(rock break\w*|break\w* (?:the )?rock)\b/i) && !T(/\b(pipes?|conduits?|pits?|sewers?|mains?|drains?|cables?|services?|culverts?|manholes?|tanks?)\b/i)) { out.trenchNoPipes = true; out.noBackfillStep = !T(/\bbackfill\w*\b/i); }
  if (T(/\bmanholes?\b/i) && !T(/\b(pipes?|sewer (?:mains?|lines?)|connect\w*)\b/i)) out.trenchNoPipes = true;
  out.bridgeBearings = T(/\bbearings?\b/i) && T(/\b(bridges?|decks?|girders?)\b/i);
  if (T(/\b(conveyors?|silos?|pipe racks?|crane beams?|automated storage|asrs|stacker cranes?)\b/i) && T(/\b(steel|install\w*|erect\w*)\b/i) && !T(/\bbaggage\b/i)) { out.steelErect = true; out.steelLift = true; }
  out.blasting = T(/\b(drill\w* and blast\w*|(?<!(?:abrasive|sand|grit|garnet|water|soda|bead|shot|dry ice|hydro|ice|media|pressure)[- ]?)blasting(?! (?:and (?:paint|coat)\w*|clean\w*|media|pots?|hoses?))|blast(?:ing)? (?:holes?|faces?|patterns?)|shot ?fir\w*|charg\w* (?:the )?(?:blast )?holes?|explosives?)\b/i);
  out.conveyorMaintain = T(/\bconveyors?\b/i) && T(/\b(idlers?|rollers?|pulleys?|belts?|splic\w*|scrapers?|skirt\w*|maintain\w*|maintenance|repair\w*|replac\w*|chang\w*)\b/i) && !T(/\b(install\w*|new)\b/i) && !out.concreteConveyor;
  out.conveyorInstall = T(/\b(baggage handling|conveyors?)\b/i) && T(/\b(install\w*|new)\b/i) && !T(/\bsteel\b/i);
  if (T(/\b(?:install\w*|deliver\w*|lift\w*|set\w*)\b[^.]{0,30}\b(?:electrical )?(?:switch ?rooms?|e-?houses?|substation (?:modules?|buildings?))\b/i) && !T(/\bto (?:the )?switch ?rooms?\b/i)) { out.plantLift = true; out.craneInterface = true; }
  if (T(/\b(bunded|tank farms?|reservoirs?|concrete tanks?)\b/i) && T(/\b(build\w*|construct\w*|pour\w*)\b/i)) { out.formwork = true; out.reo = true; out.concrete = true; }
  if (T(/\b(process pipework|pipe racks?|pipework on (?:a |the )?(?:pipe )?racks?)\b/i)) { out.hydraulicRisers = true; out.pressureTest = true; }
  if (T(/\bprecast (?:planks?|hollow ?core|floor units?|beams?)\b|\bhollow ?core\b/i)) { out.precast = true; out.craneInterface = true; }
  if (T(/\b(band beams?|post-?tensioned (?:slabs?|beams?|band))\b/i) && T(/\b(install\w*|pour\w*|construct\w*)\b/i)) { out.ptTendons = true; out.stressing = true; out.formwork = true; out.reo = true; out.concrete = true; }
  if (T(/\b(facade|building) louv(?:re|er)s?\b|\blouv(?:re|er)s? on (?:a |the )?(?:\w+ )?(?:facade|building)\b/i)) { out.claddingInstall = true; out.windowInstall = false; }
  out.greenWall = T(/\bgreen walls?\b|\bvertical gardens?\b/i);
  out.pendants = T(/\b(?:theatre|ceiling|medical|surgical) pendants?\b/i);
  out.mriShield = T(/\b(mri|rf) (?:shield\w*|room)\b|\bfaraday cage\b/i);
  if (T(/\b(?:install\w*|new|provide|cabl\w*)\b[^.]{0,30}\b(nurse call|duress|pa systems?|public address)\b/i) && !T(/\btrolley\b/i)) out.ictCabling = true;
  out.fumeCupboard = T(/\bfume (?:cupboards?|hoods?)\b/i);
  // Demolishing a tilt-up building is not standing and bracing panels.
  if (T(/\btilt-?up\b/i) && !T(/\b(seal\w*|inject\w*|repair\w*|paint\w*|clad\w*|cracks?|clean\w*|drill\w*|fix\w* to|on (?:a |the )?tilt-?up|demoli\w*|implod\w*)\b/i)) out.precast = true;
  if (T(/\b(sports? (?:hall )?floor\w*|gym(?:nasium)? floor\w*|sprung floor\w*)\b/i) && !T(/\btimber\b/i)) out.floorLay = true;
  out.poolPlant = T(/\bpool (?:plant|filtration|chemical dosing)\b|\b(aquatic|swimming) centre (?:pool )?plant\b/i);
  if (T(/\bbusways?\b|\bbus ?ducts?\b/i)) out.containment = true;
  out.gasSuppression = T(/\b(gas suppression|suppression gas|gaseous (?:fire )?suppression|fm-?200|inergen|clean agent)\b/i);
  if (T(/\binsulated panels?\b|\bsandwich panels?\b/i) && T(/\b(freezer|cool|cold) (?:rooms?|stores?|storage|warehouses?)\b|\bfreezer warehouses?\b/i)) out.coolroomPanels = true;
  out.airside = T(/\b(airports?|aprons?|taxiways?|runways?|aerobridges?|airside)\b/i);
  if (T(/\b(aprons?|taxiways?|runways?|hardstands?)\b/i) && T(/\b(construct\w*|pav\w*|pour\w*|build\w*)\b/i)) { out.slabGround = true; out.slabPour = true; out.earthworks = true; }
  if (T(/\baerobridge foundations?\b/i)) out.pilingRig = true;
  out.moduleInstall = T(/\b(bathroom pods?|modular (?:buildings?|classrooms?)|relocatable (?:buildings?|classrooms?)|transportable (?:buildings?|classrooms?)|modular (?:apartment |building |hotel )?(?:units?|modules?)|volumetric modules?|prefabricated modules?)\b/i);
  out.timberStructure = T(/\b(cross laminated timber|clt|glulam|mass timber|lvl beams?)\b/i);
  if (out.timberStructure) out.timberFloor = false;
  if (T(/\b(void|atrium) (?:protection )?nets?\b|\bsafety nets?\b/i)) out.safetyNet = true;
  if (T(/\b(temporary works platforms?|protection deck|gantry)\b/i) && T(/\b(over|above) (?:an? |the )?(?:occupied |live )?(?:road|street|footpath|rail\w*)\b/i)) { out.scaffold = true; out.workAbove = true; out.road = true; }
  if (T(CONTAMINATED_GROUND)) { out.contaminatedSpoil = true; if (!T(/\b(excavat\w*|dig\w*|trench\w*|earthworks?|bulk)\b/i)) out.earthworks = true; }
  if (T(/\bdewatering bores?\b|\bspear points?\b/i)) out.dewatering = true;
  out.shotcrete = T(/\b(shotcrete|sprayed concrete|gunite)\b/i) && !T(/\bpools?\b/i);
  if (T(/\b(crane beams?|lifting (?:beams?|points?))\b/i) && T(/\b(motor rooms?|machine rooms?|plant rooms?)\b/i)) { out.liftShaft = false; out.liftLifting = false; out.liftInstall = false; }
  if (T(/\b(high voltage|hv|\d+ ?kv)\b/i) && T(/\b(commission\w*|switchgear)\b/i)) { out.commissioning = true; out.isolation = true; if (!T(/\b(deliver\w*|install\w*|plac\w*)\b/i)) out.boardDelivery = false; }
  if (T(/\b(sound|noise|acoustic) barriers?\b/i) && T(/\bbridges?\b/i)) { out.noiseWall = true; out.workAbove = true; }
  if (T(/\b(?:build\w*|construct\w*|install\w*|lay\w*)\b[^.]{0,30}\b(?:\w+ )?culverts?\b/i) && !T(/\bculverts? (?:&|and) covers?\b/i)) { out.tankPlace = true; out.trench = true; out.craneInterface = true; }
  out.kerbInstall = T(/\bkerb(?:s| and channel| and gutter)?\b(?! ramps?)/i) && T(/\b(construct\w*|build\w*|new|install\w*|form\w*|pour\w*|extrud\w*|lay\w*)\b/i) && !T(/\b(remov\w*|replac\w*|repair\w*|section of)\b/i);
  if (T(/\bbus shelters?\b/i)) { out.kitStructure = true; out.footingHoles = true; }
  if (T(/\b(?:install\w*|build\w*|construct\w*|new)\b[^.]{0,30}\b(?<!drinking )(fountains?|water features?)\b/i)) { out.pumpInstall = true; out.trench = true; }
  out.trackWork = T(/\b(sleepers?|ballast|rail track|track renewal|resleeper\w*)\b/i) && T(/\b(rail|track|possession)\b/i) && !T(/\b(track slabs?|slab track|embedded rails?)\b/i);
  if (T(/\b(overhead wiring|ohw|catenary) masts?\b/i)) { out.footingHoles = true; out.craneInterface = true; }
  if (T(/\bplatform canop(?:y|ies)\b|\bcanop(?:y|ies)\b[^.]{0,20}\b(stations?|platforms?)\b/i)) { out.steelErect = true; out.steelLift = true; }
  if (T(/\b(piles?|piling)\b/i) && T(/\b(barges?|punts?|jack-?up|from the water)\b/i)) { if (T(/\b(driv\w*|hammer\w*|steel piles?|sheet piles?)\b/i)) out.drivenPiles = true; else out.pilingRig = true; out.workBoat = true; }
  if (T(/\b(wharf|jetty) decks?\b/i) && T(/\b(install\w*|construct\w*|pour\w*|build\w*)\b/i)) { out.precast = true; out.formwork = true; out.craneInterface = true; }
  // Bank 11 review rules.
  out.hvTermination = T(/\b(high voltage|hv|\d+ ?kv)\b/i) && T(/\b(terminat\w*|joint\w*)\b/i) && T(/\bcables?\b/i);
  if (out.hvTermination) out.hvWork = true;
  out.craneDismantle = Boolean(out.towerCraneErect && T(/\bdismantl\w*\b/i) && !T(/\berect\w*\b/i));
  if (out.grandstand && !T(/\b(temporary|tiered seating|seating|stands? for)\b/i) && T(/\b(roof|truss\w*|steel)\b/i)) out.grandstand = false;
  if (out.paintExternal && T(/\b(\d+ storey|office|residential|apartment) towers?\b/i) && !T(/\b(external\w*|exterior|outside|facade|fa[cç]ade|swing stages?|bmus?)\b/i)) out.paintExternal = false;
  if (out.precast && !T(/\b(glass|glazing|glazed)\b/i)) { out.glassHandling = false; out.glassHandle = false; }
  if (out.tempPower) { out.fitOff = false; out.noRoofSpace = true; }
  out.hydrantOnly = Boolean(out.fireAtHeight && T(/\bhydrants?\b/i) && !T(/\bsprinklers?\b/i));
  if (T(/\b(sub-?mains?|consumer mains)\b/i) && T(/\b(install\w*|run\w*|pull\w*)\b/i)) out.cablePull = true;
  if (T(/\b(detention|retention|storage) tanks?\b/i) && T(/\b(construct\w*|install\w*|build\w*)\b/i)) out.tankPlace = true;
  if (T(/\bpodium\b/i) && out.shallowTrench) out.shallowTrench = false;
  out.concreteWall = Boolean(out.retainingWall && T(/\b(concrete|reinforced|in-?situ)\b[^.]{0,20}\bretaining walls?\b/i));
  if (out.concreteWall) { out.timberOnlyWall = true; out.formwork = false; }
  out.noWallBackfill = Boolean(out.masonryLay || out.concreteWall);
  // Commercial bank rules.
  if (/\bground anchors?\b/i.test(task) && /\b(shoring|basements?|retention|piles?|walls?)\b/i.test(task)) out.anchorsProps = true;
  out.towerCraneErect = /\b(erect\w*|dismantl\w*|climb\w*|install\w*|jump\w*)\b[^.]{0,20}\b(?:a |the )?tower cranes?\b/i.test(task) && !/\b(?:with|using|from|by) (?:a |the )?tower crane\b/i.test(task);
  out.bmuInstall = Boolean(out.bmu && /\b(install\w*|erect\w*|new)\b/i.test(task) && !out.bmuClean);
  if (out.bmuInstall) out.roof = false;
  out.cleanRoom = /\bclean ?rooms?\b/i.test(task);
  if (/\b(rooftop plant|plant on (?:the |a )?roof|roof ?top (?:units?|plant))\b/i.test(task) && /\b(install\w*|replac\w*|lift\w*)\b/i.test(task)) out.roofPlant = true;
  // Banks 5 and 6 review rules.
  if (out.membraneStrip === false && /\bplanters?\b/i.test(task) && /\b(waterproof\w*|membranes?)\b/i.test(task)) { out.landscape = false; out.landscapeLift = false; }
  if (out.wallPanels) out.fixtures = false;
  if (out.splashback) out.wallTiling = true;
  out.wetAreaTiles = /\b(bathrooms?|showers?|ensuites?|laundr\w*|wet areas?|balcon\w*|terraces?|pools?|toilets?)\b/i.test(task);
  // Bank 10 review rules.
  if (/\bslab soffits?\b/i.test(task)) out.gutters = false;
  out.eaveLining = /\b(eaves?|eave linings?|(?<!slab )soffits?)\b/i.test(task) && !/\bslab soffits?\b/i.test(task) && /\b(repair\w*|replac\w*|new|reline\w*)\b/i.test(task) && /\b(linings?|sheets?|fibro|soffits?)\b/i.test(task);
  out.roofRemoveOnly = /\b(?:remov\w*|strip\w*)\b[^.]{0,30}\broof(?:ing)? sheets?\b|\bremov\w*\b[^.]{0,20}\b(?:the )?(?:old )?roof\b/i.test(task) && !/\b(replac\w*|re-?roof\w*|re-?sheet\w*|new (?:roof|sheets?))\b/i.test(task);
  if (/\btempering valves?\b|\bthermostatic mixing valves?\b|\btmvs?\b/i.test(task)) { out.fixtureSwap = true; out.valveSwap = true; }
  out.poolLight = /\bpool (?:lights?|lighting|luminaires?)\b/i.test(task);
  if (out.poolLight) out.noRoofSpace = true;
  if (out.birdSpikes || (out.birdNetting && /\b(awnings?|ewps?|boom lifts?)\b/i.test(task))) { out.roofAccess = false; }
  if (out.stairOnly) out.mezzanineFloor = false;
  out.solarGate = Boolean(out.gateInstall && /\bsolar\b/i.test(task));
  out.barrierArm = Boolean(out.gateInstall && /\b(barrier arms?|boom arms?)\b/i.test(task));
  out.noFloorBelow = Boolean(out.groundCut || out.wallPenetration);
  // Installing "a playground" is installing its equipment, whatever surface goes under it.
  out.softfallOnly = Boolean(out.playground && /\b(soft ?fall|rubber)\b/i.test(task) && !/\b(equipment|structures?|swings?|slides?|play units?)\b/i.test(task) && !/\b(?:install|build|construct)\w*\b[^.]{0,20}\bplaygrounds?\b(?! (?:soft ?fall|rubber|surface))/i.test(task));
  out.softfallWork = /\b(soft ?fall|rubber (?:surface|granule|crumb)\w*|wet[- ]pour)\b/i.test(task);
  out.noPipeLaying = Boolean(out.mainRepair && !/\b(new (?:pipes?|mains?)|pits?|conduits?)\b/i.test(task));
  if (out.trenchNoPipes) out.noPipeLaying = true;
  out.roofLeak = /\b(?:repair\w*|fix\w*|find\w*)\b[^.]{0,30}\bleak\w*\b[^.]{0,20}\broofs?\b|\bleak\w* roofs?\b|\broof leaks?\b/i.test(task) && !/\b(valleys?|flashings?|membranes?|re-?roof\w*|replac\w* the roof|skylights?|gutters?)\b/i.test(task);
  if (out.roofLeak) { out.roof = false; out.roofStrip = false; out.roofAccess = true; }
  // A painted roof is reached from the roof; the walls are painted from their own access only where the task names them.
  out.roofPaint = /\broofs?\b(?! spaces?)/i.test(task) && /\b(?:re)?paint\w*\b/i.test(task);
  if (out.roofPaint) out.paintExternal = /\b(walls?|exterior|external\w*|outside|eaves|fascias?|cladding|weatherboards?|gutters?|downpipes?|whole (?:house|building|shed))\b|\bfrom (?:a |an |the )?(?:scissor lifts?|ewps?|elevating work platforms?|boom lifts?|cherry pickers?|scaffold\w*)\b/i.test(task);
  out.roofOnlyPaint = Boolean(out.roofPaint && !out.paintExternal);
  out.noSandFill = Boolean(out.abrasiveBlast || out.roofOnlyPaint);
  out.gutterMesh = /\b(gutter guards?|gutter mesh|leaf guards?|ember guards?|bird (?:mesh|proofing))\b/i.test(task);
  // Paint, gutter guard, a flashing or a valley iron goes up by hand line, not by crane.
  out.lightRoofLoad = Boolean(out.roofAccess && /\b(paint\w*|gutter guards?|flashings?|valleys?|bird (?:spikes|proofing)|ridge caps?|cappings?|leak\w*|whirlybirds?|cowls?|gutters?|deck ?tites?|sealants?|silicone|antennas?|aerials?)\b/i.test(task) && !/\b(solar|hot water|tanks?|air ?condition\w*|plant|units?|condensers?|heat pumps?|sheets?|sheeting|re-?roof\w*|roofing|steel|beams?|skylights?|ventilators?|exhaust fans?|cranes?|ballast|batteries|inverters?)\b/i.test(task));
  out.pileJacket = /\bpile (?:jackets?|wraps?|encapsulat\w*)\b/i.test(task);
  if (out.pileJacket) { out.jettyRepair = false; out.workBoat = true; }
  out.ceilingHatch = /\b(access|ceiling|manhole) hatch(?:es)?\b/i.test(task) && /\b(install\w*|fit\w*|cut\w*|new)\b/i.test(task);
  if (out.ceilingHatch) out.fixtures = false;
  if (/\b(under|beneath) (?:a |the )?(?:timber |raised )?(?:house|floor|home)\b|\bsub-?floor\b|\bfloor insulation\b/i.test(task) && out.insulation) { out.ceilingInsulation = false; out.subfloorInsul = true; }
  if (/\bapartments?\b|\bunits\b/i.test(task) && out.insulation && !/\b(roof|top floor)\b/i.test(task)) out.ceilingInsulation = false;
  out.greyWater = /\bgrey ?water\b/i.test(task);
  if (out.greyWater) out.rainwaterTank = false;
  out.downpipesOnly = Boolean(out.gutters && /\bdownpipes?\b/i.test(task) && !/\bgutters?\b/i.test(task));
  if (out.downpipesOnly) out.roofAccess = false;
  if (/\bpumps?\b/i.test(task) && /\btanks?\b/i.test(task) && /\b(install\w*|new)\b/i.test(task) && !/\b(septic|sewage|fuel|hot water|bores?|pressure tanks?)\b/i.test(task)) out.rainwaterTank = true;
  if (/\bconcrete sleepers?\b/i.test(task)) { out.timberWall = false; out.timberOnlyWall = true; out.concreteSleeper = true; }
  if (/\bpot ?holes?\b/i.test(task) && /\broads?\b/i.test(task)) out.road = true;
  if (out.sinkTap && !/\b(kitchen|bench\w*)\b/i.test(task)) out.sinkTap = false;
  out.shaftWall = /\bshaft walls?\b/i.test(task);
  out.fanCoil = /\bfan coil (?:units?)?\b|\bfcus?\b/i.test(task);
  // Replacing a unit lowers the old one out first; a new install only lifts one in.
  out.fanCoilReplace = out.fanCoil && /\b(replac\w*|swap\w*|change[sd]? (?:out|over)|remov\w*|existing|old)\b[^.]{0,60}\b(?:fan coil|fcus?)\b|\b(?:fan coil|fcus?)\b[^.]{0,40}\b(?:replac\w*|swap\w*|removed?)\b/i.test(task);
  // A retaining wall of natural stone or boulders is placed stone by stone, not built from blocks.
  // (A dry stone wall has its own step, which says how its stones are handled.)
  out.stoneRetaining = Boolean(/\b(stone|rock|sandstone|bluestone|boulders?|granite|basalt)\b[^.]{0,20}\b(?:retaining )?walls?\b|\bboulder walls?\b/i.test(task) && !out.stoneWall && !out.timberOnlyWall);
  out.blockWall = Boolean(!out.timberOnlyWall && !out.stoneRetaining);
  out.sheetFenceOld = !/\bchain ?wire\b|\bchainmesh\b|\bcyclone (?:wire|fenc\w*)\b/i.test(task) && !/\b(?:replac\w*|remov\w*)\b[^.]{0,20}\b(?:an? |the |old )?(?:timber|paling) fenc/i.test(task);
  out.timberFenceOld = /\b(?:replac\w*|remov\w*)\b[^.]{0,20}\b(?:an? |the |old )?(?:timber|paling) fenc/i.test(task);
  if (out.rampBuild && /\bhandrails?\b/i.test(task) && !/\b(build\w*|construct\w*|new ramps?|concrete)\b/i.test(task) && !/\b(?:install\w*|build\w*)\b[^.]{0,20}\bramps?\b/i.test(task)) { out.rampBuild = false; out.fixtures = true; }
  out.deckBoardsOnly = Boolean(out.deckReplace && /\b(decking|deck boards?|floor\w*|boards)\b/i.test(task) && !/\b(posts?|frames?|bearers?|joists?|stumps?|footings?|piles?)\b/i.test(task));
  out.noPostHoles = Boolean(out.balconyDeck || out.deckBoardsOnly);
  if (out.siteEstablish && /\btemporary (?:fence )?panels?\b|\btemporary fenc/i.test(task)) out.fenceBuild = false;
  if (/\bbin enclosures?\b/i.test(task) && /\b(install\w*|build\w*|construct\w*|new)\b/i.test(task)) out.kitStructure = true;
  if (/\bsplashbacks?\b/i.test(task) && !/\bstrip\w*[- ]?out\b/i.test(task)) out.stripOut = false;
  if (/\b(bushfire|fire[- ]damaged|burnt)\b/i.test(task) && /\bfenc\w*\b/i.test(task)) out.fenceRemove = true;
  out.waterNoBoat = !out.poolOnly && !out.workBoat;
  out.bollardFuel = Boolean(out.bollards && out.fuelSite);
  if (out.hydroDemo) { out.structureDemolition = false; out.demolition = false; out.masonryDemo = false; }
  // Dewatering a basement or bulk dig is not trench work.
  if (out.dewatering && !/\btrench\w*\b/i.test(task)) { out.trench = false; out.deepTrench = false; }
  // A scheduled item that names mechanical pipework or ductwork ("Chilled water pipework
  // including valves") is supplied and installed, so it has the install step. It is set last, so it
  // brings no other step with it.
  if (MECHANICAL_WORK.test(task) && sentencesWith(task, /^\s*(?:(?:chilled|condenser|heating|heated|hot) water |refrigerant |condensate )?(?:pipework|piping|ductwork)\b(?! insulation| lagging)/i).some((sentence) => !/\b(shall|must|will|to be|is|are|be)\b/i.test(sentence))) out.ductwork = true;
  // The mechanical install is split into one step per activity: ductwork, pipework and units
  // each come only when the task names them, and ductwork when it names none of them.
  out.mechPipework = /\b(?:(?:chilled|condenser|heating|heated|hot) water|hydronic|mechanical|condensate) (?:pipework|piping|pipes)\b|(?<!refrigerant |refrigeration |copper )\b(?:pipework|piping)\b/i.test(task) && MECHANICAL_WORK.test(task);
  if (out.mechPipework && !/\b(replac\w*|repair\w*|re-?pip\w*)\b/i.test(task)) out.ceilingPipework = false;
  out.mechUnits = /\b(air handling units?|ahus?|(?:exhaust|supply|in-?line|toilet exhaust|kitchen exhaust) fans?|heat recovery (?:ventilat\w*|units?)|hrvs?|ervs?|package units?|evaporative coolers?)\b/i.test(task);
  out.ductNamed = /\b(ductwork|duct(?:ing|s)?|ducted)\b/i.test(task) || (!out.mechPipework && !out.mechUnits);
  // Refrigerant is recovered only when a system is emptied, repaired or taken out.
  out.refrigerantRecover = REFRIGERANT.test(task) && /\b(recover\w*|decant\w*|decommission\w*|de-?gas\w*|remov\w*|replac\w*|repair\w*|leaks?)\b/i.test(task);
  out.refrigerantRecoverOnly = out.refrigerantRecover && !/\b(charg\w*|evacuat\w*|install\w*|commission\w*|re-?gas\w*|top(?:ping)? up)\b/i.test(task);
  // Asphalt is saw cut in its own step, unless the saw cut concrete step makes the cut or a pothole is patched without one.
  out.asphaltCut = Boolean(out.asphalt && !out.sawCut && (!out.potholeRepair || /\bcut\w*\b/i.test(task)));
  // Pipes, pits and conduits laid in a trench are each their own step, named by the task.
  // Pits lifted in by the tank and pit step are not set again here; pipes come when nothing is named.
  const trenchPipesNamed = /\b(pipes?|pipework|pipelines?|piping|(?<!consumer |electrical |power )mains?|(?:drains?|drainage|sewers?|sewerage|stormwater)(?! (?:pits?|manholes?|maintenance holes?|grates?))|culverts?|water (?:lines?|services?)|gas lines?|irrigation|ag lines?|subsoil)\b/i.test(task) || Boolean(out.sewerRepair);
  out.trenchPits = Boolean(out.pitReplace) || (/\b(?<!lift |tank |test |borrow |sump )pits?\b(?! lids?| covers?| grates?)|\b(manholes?|maintenance holes?|access chambers?)\b/i.test(task) && !out.tankPlace);
  out.trenchConduits = /\b(conduits?|cables?|cabling|comms|communications|nbn|telecom\w*|fibre|data)\b/i.test(task) || Boolean(out.conduitWork && !trenchPipesNamed);
  out.trenchPipes = trenchPipesNamed || (!out.trenchPits && !out.trenchConduits);
  // Ground anchors and excavation props are each their own step; both when the task names neither.
  const anchorsNamed = /\b(anchors?|tie-?backs?|de-?stress\w*)\b/i.test(task);
  const propsNamed = /\b(props?|propping|walers?|struts?|strutting|kingposts?)\b/i.test(task);
  out.groundAnchors = anchorsNamed || !propsNamed;
  out.excavationProps = propsNamed || !anchorsNamed;
  // Mortar is mixed in the core fill kind only where the task names mortar.
  out.groutMortar = Boolean(out.masonryGrout && /\bmortar\b/i.test(task));
  // Bollards, barriers, wheel stops and speed humps are each their own step; bollards when none is named.
  out.barrierNamed = /\b(?:traffic|crash|vehicle|safety|w-beam|thrie-beam|wire rope|concrete|jersey|steel|car ?park) barriers?\b|\bbarrier kerbs?\b|\b(?:install\w*|fix\w*|supply)\b[^.]{0,30}\bbarriers?\b/i.test(task);
  out.wheelStopNamed = /\b(wheel stops?|car stops?|parking stops?)\b/i.test(task);
  out.humpNamed = /\bspeed (?:humps?|bumps?|cushions?)\b/i.test(task);
  out.bollardNamed = /\bbollards?\b/i.test(task) || (!out.barrierNamed && !out.wheelStopNamed && !out.humpNamed);
  // Electrical and communications work is split into one step per activity in the same way.
  // Cable tray and containment are one step, and the cabling laid on them another, only when
  // the task names cabling.
  const noTray = task.replace(/\bcable (?:trays?|ladders?|baskets?|supports?|containment)\b|\bfor (?:the )?(?:new )?(?:[\w-]+ )?cabl\w*/gi, ' ');
  out.trayCabling = /\b(cabl(?:e|es|ing)|wiring|wires?)\b/i.test(noTray);
  // Rough-in and fit-off are separate stages; a task that names only the rough-in has no fit-off.
  out.roughInOnly = /\brough[- ]?in\b/i.test(task) && !/\b(fit\w*|install\w*|replac\w*|connect\w*|terminat\w*|commission\w*|light fittings|power points?|gpos?|switches|outlets?|chargers?|ceiling fans?|smoke alarms?|downlights?)\b/i.test(task);
  out.plumbRoughInOnly = /\brough[- ]?in\b/i.test(task) && !/\b(fit\w*|install\w*|replac\w*|connect\w*|fixtures?|toilets?|pans?|basins?|taps?|tapware|sinks?|showers?|baths?|vanit\w*|appliances?|dishwashers?|eye ?wash\w*|tubs?|troughs?|urinals?)\b/i.test(task);
  out.plumbFitOffOnly = /\bfit[- ]?off\b/i.test(task) && !/\b(rough[- ]?in|chas\w*|new pipe\w*|pipework|run\w* (?:new )?pipes?)\b/i.test(task);
  // A fixture swap, an outdoor fixture or a fit-off alone has no rough-in step, so the laboratory controls go in the fit-off.
  out.eyewashNoRoughIn = Boolean(out.eyewash && (out.fixtureSwap || out.outdoorFixture || out.plumbFitOffOnly));
  // Communications containment comes only when the task names new containment; the cable
  // pull comes when it names cabling, or names no containment.
  const ictNoExisting = task.replace(/\b(?:existing|through (?:the )?)(?:[\w-]+ ){0,2}?(?:containment|cable (?:trays?|ladders?|baskets?)|catenary|conduits?)\b/gi, ' ');
  out.ictContainment = /\b(containment|cable (?:trays?|ladders?|baskets?|supports?)|catenary|conduits?|wire baskets?|j-?hooks?)\b/i.test(ictNoExisting);
  out.ictCablePull = /\b(cabl\w*|data points?|data outlets?|cat ?\d\w*|fibre|copper|patch\w*|wi-?fi|access points?|waps?|pabx|handsets?|(?:tele)?phones?|telephon\w*)\b/i.test(noTray) || !out.ictContainment;
  // Optical fibre is hauled in its own step only where no communications cabling or pit
  // haul step does it, and spliced and tested unless the task only hauls it.
  out.fibreHaul = /\b(install\w*|haul\w*|pull\w*|run\w*|lay\w*|new)\b/i.test(task);
  out.fibreHaulOnly = out.fibreHaul && !/\b(splic\w*|terminat\w*|test\w*|joint\w*|connect\w*|commission\w*)\b/i.test(task);
  // Signal and lighting poles: a replaced pole has no pits or conduits, and pits laid in the
  // trench steps are not repeated.
  out.poleOnly = Boolean(out.polesNamed) && /\b(replac\w*|repair\w*|straighten\w*|re-?stand\w*|realign\w*)\b/i.test(task) && !/\b(pits?|conduits?|trench\w*|bor\w*|new (?:traffic )?(?:signals?|lights?|lighting|poles?))\b/i.test(task);
  out.pitsByTrench = Boolean(out.trench && out.polesNamed);
  // Sports lighting and screens are separate items.
  out.sportsScreens = Boolean(out.screens || out.screensOnly);
  // Re-roofing a tiled roof is split into stripping, sarking, battens and re-laying. Sarking and
  // battens come when the task names them, and both when it names neither; a change to a
  // metal roof re-lays no tiles, and its battens and sarking go with the new roof.
  const metalReroof = /\b(metal|colorbond|corrugated|roof(?:ing)? sheet\w*|sheeting)\b/i.test(task);
  const sarkingNamed = /\b(sarking|anticon|reflective foil|roof membrane)\b/i.test(task);
  const battensNamed = /\b(re-?batten\w*|battens?)\b/i.test(task);
  out.roofSarking = sarkingNamed || (!battensNamed && !metalReroof);
  out.roofBattenFix = !out.roofBattens && (battensNamed || (!sarkingNamed && !metalReroof));
  out.roofRelay = !metalReroof && !/\bstrip\w* (?:off )?(?:the )?(?:old )?(?:roof )?(?:tiles|slates) only\b/i.test(task);
  // Floor and wall tiles are not broken out when the work is a tiled roof.
  if ((out.tileRoofStrip || /\b(?:re-?)?roof\w*\b/i.test(task)) && !/\b(floors?|walls?|bathrooms?|showers?|kitchens?|splashbacks?|ensuites?|laundr\w*)\b/i.test(task)) out.tileRemove = false;
  // Tiling products are one step each: adhesive, screed, grout and sealer come when the task
  // names them. With none named, tiles are laid in adhesive and grouted, or a leaking shower
  // fixed without lifting tiles is regrouted and sealed.
  out.tileScreed = /\b(screed\w*|(?:sand and cement|mortar) bed\w*|bedding mortar)\b/i.test(task);
  out.tileAdhesive = /\b(adhesives?|glue\w*|thin-?set)\b/i.test(task);
  out.tileGrout = /\b(?:re-?)?grout\w*\b/i.test(task) || (/\bepox\w*\b/i.test(task) && !/\bepoxy (?:adhesive|floor\w*|coat\w*|paint)\b/i.test(task));
  out.tileSealer = /\b(sealers?|(?:re-?)?seal\w* (?:the |all )?(?:\w+ )?(?:tiles?|grout|stone|pavers?|showers?|baths?)|re-?seal\w*|impregnat\w*)\b/i.test(task);
  if (!out.tileScreed && !out.tileAdhesive && !out.tileGrout && !out.tileSealer) {
    if (/\bwithout (?:removing|lifting) (?:the )?tiles\b/i.test(task)) { out.tileGrout = true; out.tileSealer = true; } else { out.tileAdhesive = true; out.tileGrout = true; }
  }
  // Facade fixing, joinery and doors: one step per activity. Resealing joints alone drills
  // nothing; brackets, anchors or fixings named are drilled for.
  out.facadeDrill = !out.jointSealOnly || /\b(drill\w*|brackets?|anchors?|fixings?)\b/i.test(task);
  out.joineryDoors = Boolean(out.doorHangWork || !out.cabinetWork);
  const framesNamed = /\b(door ?frames?|doorsets?|frames?|jambs?)\b/i.test(task);
  const leavesNamed = /\bdoors?\b(?! ?frames?| ?sets?)/i.test(task.replace(/\b(?:install|stand|fix)\w* (?:the |all )?(?:\w+ )?door ?frames?\b/gi, ''));
  out.doorFrames = framesNamed || !/\bhang\w*\b/i.test(task);
  out.doorLeaves = leavesNamed || !framesNamed;
  // A fence repair that sets no new posts digs no post holes.
  out.fencePostHoles = /\b(posts?|post holes?|holes?|footings?|augers?)\b/i.test(task) || !/\b(?:repair\w*|replac\w*|fix\w*)\b[^.]{0,40}\b(?:panels?|palings?|sheets?|pickets?|rails?|gates?|wire|boards?)\b/i.test(task);
  // Gutters and downpipes, fascia, and eaves linings are separate steps.
  const fasciaNamed = /\bfascias?\b/i.test(task);
  out.eavesLiningWork = /\b(eaves? linings?|(?<!slab )soffits?|eaves sheets?|(?:re-?)?lin\w* (?:the )?eaves)\b/i.test(task) || Boolean(out.eavesWork && /\b(linings?|sheets?|fibro|asbestos)\b/i.test(task));
  out.gutterWork = /\b(gutters?(?! guards?)|downpipes?|rainheads?|spouting)\b/i.test(task) || (!fasciaNamed && !out.eavesLiningWork);
  out.fasciaWork = fasciaNamed;
  out.fasciaReplace = fasciaNamed && /\b(replac\w*|repair\w*|rotten|damaged|old|existing|remov\w*)\b/i.test(task) && !/\bnew fascias?\b/i.test(task);
  // Metal decking and stud welding are separate crews.
  const studsNamed = /\b(shear studs?|stud weld\w*|studs?)\b/i.test(task);
  out.studWeld = studsNamed;
  out.deckLay = /\b(?:lay\w*|install\w*|fix\w*|plac\w*)\b[^.]{0,30}\bdecking\b|\bdecking (?:sheets?|bundles?)\b/i.test(task) || !studsNamed;
  if (out.deckingStuds && !/\b(braz\w*|solder\w*|pipes?|pipework|copper)\b/i.test(task)) out.hotWork = false;
  // Playground softfall is its own step when it is named.
  out.softfallStep = Boolean(out.softfallWork || out.softfallOnly);
  // Replacing the sails on existing posts stands no posts.
  out.sailsOnly = /\b(?:replac\w*|re-?hang\w*|re-?tension\w*|re-?fit\w*|remov\w*|take down|repair\w*)\b[^.]{0,30}\b(?:shade )?sails?\b/i.test(task) && !/\b(?:new|install\w*|stand\w*|erect\w*)\b[^.]{0,30}\b(?:posts?|columns?)\b|\breplac\w* (?:the )?(?:\w+ )?(?:posts?|columns?)\b|\bfootings?\b/i.test(task);
  // The tank is lifted onto its stand when the task names a tank going on it.
  out.tankLiftOn = /\btanks?\b/i.test(task.replace(/\btank stands?\b/gi, ''));
  // Stage building and lighting rigging are separate crews.
  const stageNamed = /\b(stages?|staging)\b/i.test(task);
  const rigNamed = /\b(lighting|lights|trusses|truss|rig\w*|fixtures?|speakers?|line arrays?)\b/i.test(task);
  out.stageBuild = stageNamed || !rigNamed;
  out.lightRig = rigNamed || !stageNamed;
  // Site fencing, hoardings and gantries are separate steps.
  out.hoardingNamed = /\b(hoardings?|barricades?|covered ways?)\b/i.test(task);
  out.siteFencing = /\b(fenc\w*|site establishment)\b/i.test(task) || (!out.hoardingNamed && !out.gantry && !/\bsite sheds?\b/i.test(task));
  // Services work is split into one step per activity (round 2).
  // Temporary lighting alone installs no construction power.
  out.tempLightOnly = /\b(lighting|lights?)\b/i.test(task) && !/\b(power|wiring|supply|switchboards?|distribution|boards?|rcds?|installations?)\b/i.test(task);
  // Chemical dosing alone installs no pool plant.
  out.poolDosingOnly = /\b(dosing|chlorinators?|chemicals?|salt cells?)\b/i.test(task) && !/\b(pumps?|filters?|plant|heaters?|heat pumps?|vessels?|pipework)\b/i.test(task);
  // Work in a fire pump room is its own step when the pump room or pumps are named; alone, it touches no live fire system outside it.
  const pumpless = task.replace(/\b(?:(?:sprinkler|hydrant|fire|diesel|electric|jockey|booster) )*pump(?: ?sets?| ?rooms?|s)?\b/gi, ' ');
  out.pumpRoomNamed = /\b(pump ?rooms?|pump ?sets?|(?:fire|diesel|electric|jockey|booster|sprinkler|hydrant) pumps?)\b/i.test(task);
  out.pumpRoomOnly = out.pumpRoomNamed && !/\b(live|impair\w*|sprinkler\w*|hydrants?|hose reels?|systems?|pipework|mains?|risers?|valves?)\b/i.test(pumpless);
  // A door spring job connects no motor unless the task names one.
  out.noDoorMotor = Boolean(out.doorSpring && !/\b(motors?|openers?|automat\w*)\b/i.test(task));
  // A rainwater tank pump is its own step, only when a pump is named; a pump alone sets no tank.
  out.tankPump = /\bpumps?\b/i.test(task);
  out.tankPumpOnly = out.tankPump && !/\btanks?\b(?! pumps?)/i.test(task);
  // Fuel lines and dispensers are each their own step, both when the task names neither.
  const fuelLinesNamed = /\b(?:fuel )?(?:lines?|pipework|pipes?|piping)\b/i.test(task);
  const dispensersNamed = /\b(dispensers?|bowsers?|fuel pumps?)\b/i.test(task);
  out.fuelLines = fuelLinesNamed || !dispensersNamed;
  out.fuelDispensers = dispensersNamed || !fuelLinesNamed;
  // Clean room panels and flooring are each their own step, both when the task names neither.
  const cleanFloorNamed = /\b(floors?|flooring|vinyl|epoxy)\b/i.test(task);
  const cleanPanelsNamed = /\b(walls?|ceilings?|panels?|partitions?)\b/i.test(task);
  out.cleanRoomPanels = cleanPanelsNamed || !cleanFloorNamed;
  out.cleanRoomFloor = cleanFloorNamed || !cleanPanelsNamed;
  return out;
}

function baseWorkFlags(fullTask, facts = {}, ownCrane = false) {
  const task = ownWork(fullTask);
  const scaffold = isScaffoldErection(task);
  // "Before re-roofing" says when the work is done, not that this crew re-roofs.
  const roofTask = task.replace(/\b(?:before|prior to|ahead of|ready for)\s+(?:the\s+)?re-?roof\w*\b/gi, '');
  const pourTask = task.replace(/\battend\w*\b[^.]*\b(?:during|at)\b[^.]*\b(?:concrete (?:placement|plac\w*|pours?)|pours?)\b[^.]*/gi, '').replace(/\b(?:prior to|before|ahead of)\s+(?:the\s+|all\s+)?(?:concrete\s+)?(?:pours?|pouring|placement)\b/gi, '');
  return {
    road: mentioned(task.replace(CONDITIONAL_TRAFFIC, ' '), ROAD) || /\blight rail\b/i.test(task) || /\b(?:footpath|road|lane) closures?\b/i.test(task) || besideRoad(task),
    power: mentioned(task, ENERGISED),
    scaffold,
    // Roofing work, not a roof beam or a job under a roof.
    roof: !SPORTS_LIGHTING.test(task) && (/\b(?:frame|clad)\w*,? (?:and )?roof\b|\broof,? (?:and )?(?:clad|line)\b|\breplac\w* (?:the |a )?(?:section of (?:the )?)?(?:\w+ )?roof\b(?! spaces?| cavit\w*| plant| trusses?| beams?| turbines?| vents?| fans?| ventilators?| gutters?)/i.test(roofTask) || /\b(roof(?:ing)? sheet\w*|roofing|re-?roof\w*|re-?sheet\w*|roof tiles?|slate (?:roof\w*|tiles?)|on (?:the|a) roof|roof work|roof repairs?|repair\w* (?:the |a )?(?:\w+ )?roof|ridge capp\w*|ridge caps?|roof flashings?|roof (?:screws|fixings|fasteners)|(?:install|fix|lay)\w* (?:a |the )?(?:new )?(?:colorbond |metal |steel |corrugated )roofs?)\b/i.test(roofTask) || /\b(cappings?|(?:under|over)?flashings?)\b/i.test(roofTask) && /\b(decktites?|sarking|fascias?|ridges?|roof\w*|gutters?)\b/i.test(roofTask)) && !scaffold && !MECHANICAL_WORK.test(roofTask) && !ICT_WORK.test(roofTask) && !WATERPROOFING.test(roofTask),
    // Piling contractors excavate bores and basements, not trenches, unless a trench is named.
    deepTrench: trenchDig(task),
    trench: (trenchDig(task) || /\b(excavat(?!ors?\b)\w*|trench\w*)\b/i.test(task.replace(NOT_DUG, ' ')) || /\b(?:install\w*|lay\w*|replac\w*|repair\w*)\b[^.]{0,40}\b(?:underground (?:run )?(?:pipework|pipes?|services)|(?:collapsed |broken |damaged |cracked )(?:stormwater|sewer|drainage|water) pipes?|(?:stormwater|sewer|drainage) pipes? \d|water reticulation|pipes? for (?:a |the )?(?:new )?\w+'?s? (?:water|sewer|stormwater|drainage)|(?:pipework|pipes?|mains?|services|conduits?) underground|in-?ground (?:drainage|pipework)|(?:sewer|house|stormwater)(?:\/house)? drainage (?:systems?|lines?)|(?:stormwater|sewer|drainage) (?:pipes?|lines?|mains?)|(?:precast |concrete )?(?:pits?|manholes?)|(?:detention|underground|storage|onsite detention) tanks?|grease traps?|septic (?:tanks?|systems?)|absorption trench\w*|culverts?|culvert pipes?|cattle grids?)\b/i.test(task) && !/\b(?:directional(?:ly)? (?:drill|bor)\w*|hdd|under ?bor\w*|bored under)\b/i.test(task)) && !((PILING_WORK.test(task) || BULK_EXCAVATION.test(task) || EARTHWORKS.test(task)) && !/\btrench\w*\b/i.test(task)),
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
    stressing: /\b(stress(?:ing)? (?:the )?tendons?|stressing|stress\w*\b[^.]{0,30}\btendons?)\b/i.test(task) && !/\bground anchors?\b/i.test(task),
    jumpform: JUMPFORM.test(task),
    ptSlab: PT.test(task) && !/\b(cast[- ]in|in[- ]slab)\b/i.test(task) && !/\bground anchors?\b/i.test(task),
    // Painting or masking around electrical fittings is not electrical work.
    electricalWork: ELECTRICAL_WORK.test(task.replace(/\b(?:around|mask\w*|protect\w*|cut in|clear of)\b[^.]*/gi, '')),
    plumbingWork: isPlumbing(task),
    sewerConnection: /\b(sewer (?:junctions?|connections?|jump-?ups?)|sewer connection|connect\w*[^.]{0,40}\bsewer\b|connect\w* (?:to )?(?:(?:the|a|new) )*(?:council |existing |live )?sewer\w*|connect\w*[^.]{0,40}\b(?:council|sewer) mains?|live sewer|sewer mains?|manholes?|maintenance holes?)\b/i.test(task),
    castInPlumbing: /\b(cast[- ]in|in[- ]slab)\b/i.test(task) && /\b(sleeves?|puddle flanges?|plumbing|drainage|pipes?)\b/i.test(task) && isPlumbing(task),
    coreDrill: CORE_DRILL.test(task),
    // Installing risers or pipework at height, not other work done in the risers.
    // The riser, stack or ceiling is where something is installed, in the same sentence.
    // Stacks a drain collects are the stack plumber's work, not this drain's.
    hydraulicRisers: isPlumbing(task) && /\binstall\w*\b[^.]*\b(risers?|stacks?|(?<!maintenance |inspection |access )shafts?|ceilings?|at height)\b|\b(risers?|stacks?|(?<!maintenance |inspection |access )shafts?|ceilings?|at height)\b[^.]*\binstall\w*/i.test(task.replace(/\b(?:collect\w*|serv\w*)\b[^.]{0,30}?\bstacks?\b/gi, ' ')) && !/\b(rough[- ]in|fit[- ]off)\b/i.test(task),
    hotWork: HOT_WORK.test(task),
    // Soil and waste pipes are PVC with solvent cement joints as a rule.
    solventCement: /\b(solvent (?:cement|weld\w*)|pvc (?:glue|cement)|pvc pip\w*|soil and waste)\b/i.test(task) || (/\bprimers?\b/i.test(task) && /\b(pvc|pipe\w*)\b/i.test(task)),
    pressureTest: PRESSURE_TEST.test(task),
    hotWater: PRESSURE_TEST.test(task) && /\b(hot water|heat pumps?|boilers?|water heaters?)\b/i.test(task),
    plumbingFitOff: (/\b(rough[- ]in|fit[- ]off)\b/i.test(task) && isPlumbing(task) || /\b(?:replac|install|fit|chang)\w*\b[^.]{0,30}\b(?:outdoor showers?|mixer taps?|taps?|toilet suites?|toilets?|cisterns?|basins?|sinks?|sink wastes?|vanit(?:y|ies) basins?|shower (?:heads?|roses?|mixers?)|dishwashers?|coffee machines?|water filters?|ice machines?|tapware|vanities)\b/i.test(task) || /\bconnect\w*\b[^.]{0,40}\b(?:dishwashers?|coffee machines?|ice machines?|water filters?|glass ?washers?)\b/i.test(task)) && !/\b(?:install\w*|run\w*|pull\w*)\b[^.]{0,30}\b(?:cables?|circuits?|wiring)\b/i.test(task) || /\b(?:install\w*|replac\w*|fit\w*)\b[^.]{0,30}\b(?:emergency )?(?:eye ?wash\w*|safety showers?|deluge showers?)\b/i.test(task),
    bulkDig: /\b(bulk excavat\w*|excavat\w* (?:the |out the )?basement|dig\w* (?:out )?(?:the |a )?basement)\b/i.test(task),
    anchorsProps: BULK_EXCAVATION.test(task) && /\b(ground anchors?|anchors?|props?|walers?|de-?stress\w*|shoring|soldier piles?|sheet piles?|shotcrete)\b/i.test(task),
    detailDig: /\b(detailed excavat\w*|(?:excavat|dig)\w*[^.]{0,30}\b(?:pile caps?|lift pits?))\b/i.test(task),
    dewatering: BULK_EXCAVATION.test(task) && /\b(dewater\w*|groundwater|pump\w*)\b/i.test(task),
    contaminatedSpoil: BULK_EXCAVATION.test(task) && /\b(contaminat\w*|acid sulfate|unknown fill|fill material|spoil)\b/i.test(task),
    basementEdge: /\b(bulk excavat\w*|excavat\w* (?:the |out the )?basement|dig\w* (?:out )?(?:the |a )?basement)\b/i.test(task),
    neighbours: BULK_EXCAVATION.test(task) && /\b(neighbour\w*|street|footpath|adjacent|adjoining)\b/i.test(task),
    steelWork: STEEL_WORK.test(task),
    steelLift: STEEL_WORK.test(task) && /\b(cranes?|cranage|lift\w*|land\w*|erect\w*)\b/i.test(task),
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
    // Preparing a floor for a skim or levelling coat is the levelling step, not grinding.
    floorGrind: (FLOOR_WORK.test(task) && /\b(grind\w*|prepar\w*)\b/i.test(task.replace(/[^.]+\.?/g, (sentence) => (/\b(skim\w*|level\w*)\b/i.test(sentence) && !/\b(grind\w*|sand\w*|scrap\w*|strip\w*|shot ?blast\w*|remov\w*)\b/i.test(sentence) ? sentence.replace(/\bprepar\w*/gi, ' ') : sentence)))) || /\b(?:sand\w* and )?polish\w* (?:the )?concrete\b/i.test(task) || /\b(?:grind\w*|polish\w*|shot ?blast\w*)\b[^.]{0,30}\b(?:concrete|slab) floors?\b|\b(?:concrete|slab) floors?\b[^.]{0,20}\b(?:grind\w*|polish\w*)\b/i.test(task),
    floorAdhesive: FLOOR_WORK.test(task) && /\b(adhesives?|glue\w*)\b/i.test(task),
    floorLevel: FLOOR_WORK.test(task) && /\b(levell\w*|primers?|screed\w*|skim\w*|float\w* (?:the )?(?:sub)?floors?)\b/i.test(task),
    timberFloor: /\b(timber floor\w*|engineered timber|floating (?:floors?|floorboards?)|hybrid flooring|laminate flooring)\b/i.test(task),
    floorLay: /\b(carpet\w*|vinyl|floor coverings?|rubber (?:flooring|floors?|tiles?|matting)|linoleum|lino)\b/i.test(task) && /\b(lay\w*|install\w*|fit\w*|replac\w*|supply and)\b/i.test(task) && !/\bstrip\w* out\b/i.test(task),
    waterproofing: WATERPROOFING.test(task),
    wpPrep: WATERPROOFING.test(task) && /\b(grind\w*|prepar\w*|scabbl\w*)\b/i.test(task),
    wpLiquid: WATERPROOFING.test(task) && /\b(install\w* (?:a |the )?(?:new )?(?:\w+ )?(?:waterproofing )?membranes?(?! sheets?)|primers?|liquid|solvents?|polyurethane|apply\w*|brush\w*|roll(?:ed|ing)? on|spray\w*|waterproof (?:the |a |an )?(?:floors?|walls?|shower\w*|bathroom|wet areas?|planters?(?: box(?:es)?)?|balcon\w*|decks?|podiums?|roofs?)|waterproof\w* and (?:re-?)?til\w*)\b/i.test(task) || /\b(?:replac\w*|new|install\w*)\b[^.]{0,20}\bshower (?:bases?|trays?)\b|\bretil\w* (?:the )?shower\b/i.test(task),
    wpTorch: WATERPROOFING.test(task) && /\b(torch[- ]on|torch\w*|bitumen sheet\w*)\b/i.test(task),
    wpEdge: WATERPROOFING.test(task) && /\b(roofs?|podium|balcon\w*|edges?)\b/i.test(task),
    wpRolls: WATERPROOFING.test(task) && /\b(rolls?|sheet membranes?|torch[- ]on)\b/i.test(task),
    tilingWork: isTiling(task),
    // Laying tiles nearly always means cutting some on site.
    tileCut: isTiling(task) && (/\b(cut\w*|grind\w*|saws?)\b/i.test(task) || (/\b(lay\w*|tile|tiles|tiled|tiling|re-?til\w*)\b/i.test(task) && !/\b(carpet|vinyl|rubber|lino\w*) tiles?\b/i.test(task))),
    tileMix: isTiling(task) && /\b(adhesives?|grout\w*|epox\w*|screed\w*|mix\w*|sealers?)\b/i.test(task) || /\bre-?grout\w*|\b(?:seal\w*|re-?seal\w*) (?:a |the )?leaking (?:shower|bath)\w*|\bwithout removing (?:the )?tiles\b/i.test(task),
    tileLay: isTiling(task) && /\b(lay\w*|til(?:e|ing|ed)\b|re-?til\w*|fix\w*|install\w*|replac\w*)\b/i.test(task) && !/\b(carpet|vinyl|rubber|lino\w*) tiles?\b/i.test(task),
    // Edge strips, trims and angles finish a tile edge; they are not an open edge.
    tileEdge: isTiling(task) && /\b(balcon\w*|terraces?|edges?(?![- ](?:strips?|trims?|profiles?|angles?|beads?|tiles?|bands?|grips?|finish\w*))|podium)\b/i.test(task),
    mobileScaffold: /\bmobile scaffold\w*\b/i.test(task) && /\b(erect\w*|assembl\w*|set up|us(?:e|ing)|from)\b/i.test(task),
    hoistInstall: /\b(install\w*|erect\w*|climb\w*|dismantl\w*|jump\w*)\b[^.]{0,40}\b(?:builders'? |personnel (?:and materials )?|materials )?hoists?\b/i.test(task) && !VEHICLE_HOIST.test(task),
    hoistOperate: /\b(operat\w*|run\w*|driv\w*)\b (?:the )?(?:builders'? |personnel (?:and materials )?|materials )?hoists?\b/i.test(task) && !VEHICLE_HOIST.test(task),
    carpentryWork: CARPENTRY_WORK.test(task) && !FORMWORK.test(task),
    carpLoad: CARPENTRY_WORK.test(task) && !FORMWORK.test(task) && /\b(hoists?|deliver\w*|carr\w*|mov\w*|sheets?|joinery|cabinets?)\b/i.test(task),
    carpFraming: CARPENTRY_WORK.test(task) && /\b(steel stud\w*|stud (?:walls?|framing)|wall framing|framing|bulkheads?)\b/i.test(task) && !FORMWORK.test(task),
    carpJoinery: CARPENTRY_WORK.test(task) && !/\bto (?:a |the )?(?:back|front|side) doors?\b/i.test(task) && /\b(door frames?|doors?|joinery|(?<!(?:comms|communications|data|server|equipment|electrical|racks,?|racks and)\s)cabinets?|vanities|wardrobes?|benchtops?|cabinetry|benches|(?:new|install\w*)[^.]{0,10} kitchens?)\b/i.test(task) && !FORMWORK.test(task) && !LIFT_WORK.test(task),
    carpEdge: CARPENTRY_WORK.test(task) && /\b(balcon\w*|voids?|penetrations?|balustrades?|handrails?|open (?:slab )?edges?)\b/i.test(task) && !FORMWORK.test(task),
    pilingWork: PILING_WORK.test(task),
    pilingPlatform: PILING_WORK.test(task) && /\b(working platforms?|works platforms?|piling platforms?|deliver\w*|assembl\w*|disassembl\w*|mobilis\w*|set up the rigs?)\b/i.test(task),
    pilingRig: PILING_WORK.test(task) && /\b(drill\w*|auger\w*|install\w*|piling|construct\w*)\b/i.test(task),
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
    siteEstablish: /\b(hoardings?|gantr(?:y|ies)|site fenc\w*|site sheds?|site establishment|temporary fenc\w*|temporary (?:fence )?panels?|fenc\w* around (?:a |the )?(?:construction |building )?site)\b/i.test(task),
    sitePlant: /\b(traffic controllers?|traffic management|site gate|separat\w* (?:plant|people|pedestrians))\b/i.test(task),
    sawCut: /\b(concrete cutt\w*|saw[- ]?cut\w*|wall saw\w*|floor saw\w*|wire saw\w*|cut\w* (?:and remov\w* )?(?:out )?(?:a |the )?(?:existing |old )?(?:concrete |floor |ground |suspended |basement )*slabs?|(?:concrete|demolition|quick[- ]?cut|power|cut[- ]?off|masonry) saws?[^.]{0,30}\b(?:concrete|slabs?|floors?|walls?|pavers?|blocks?|kerbs?|pavement)\b|cut\w*\b[^.]{0,40}\b(?:concrete|slabs?|kerbs?|pavement)\b[^.]{0,30}\b(?:concrete|demolition|quick[- ]?cut|power|cut[- ]?off|masonry) saws?)\b/i.test(task),
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
    // A new generator only tested or commissioned, with no install, is a generator test.
    generatorPlant: (/\b(?:install\w*|supply and install|new|place\w*|set)\b[^.]{0,40}\b(?:generators?|day tanks?)\b|\bgenerators?\b[^.]{0,30}\binstall\w*/i.test(task.replace(/[^.]+\.?/g, (sentence) => (/\b(test\w*|commission\w*|load banks?|load shed\w*)\b/i.test(sentence) && !PLANT_WORK.test(sentence) ? ' ' : sentence))) || /\b(?:day tanks?|fuel (?:lines?|tanks?|systems?))\b/i.test(task) && /\bgenerators?\b/i.test(task)),
    // Boilers being installed, not boilers named only as what a supply connects to.
    boilerPlant: /\b(?:install\w*|commission\w*|set\w*|lift\w*|replac\w*|supply and install)\b[^.]{0,40}\b(?:boilers?|pressure vessels?|calorifiers?|steam plant)\b|\b(?:boilers?|pressure vessels?|calorifiers?)\b[^.]{0,30}\b(?:install\w*|commission\w*)\b/i.test(task),
    cleaningStands: CLEANING.test(task) && /\b(stands?|seats?|tiers?|grandstands?|aisles?)\b/i.test(task),
    landscapeLift: LANDSCAPE.test(task) && /\b(soil|mulch|plant\w*|turf|planters?|landscap\w*)\b/i.test(task) && /\b(podium|roofs?|cranes?|(?:a|the|by|materials?|builder'?s|site|goods) hoists?)\b/i.test(task),
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
    balustradeEdge: /\bbalustrad\w*\b/i.test(task) && /\b(balcon\w*|edges?|terraces?|decks?|stairs?|landings?|verandahs?|voids?|mezzanines?|vomitor\w*|concourses?|grandstands?|tiers?|bridges?|ramps?|walkways?)\b/i.test(task),
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
    hddBore: /\b(directional(?:ly)? (?:drill|bor)\w*|hdd|under ?bor\w*|bored under|thrust bor\w*)\b/i.test(task),
    structureDemolition: /\bdemolish\w*\b[^.]{0,30}\b(?:garages?|sheds?|houses?|buildings?|carports?|decks?|pergolas?|verandahs?|structures?|dwellings?|granny flats?)\b/i.test(task),
    dampers: /\b(smoke|fire) dampers?\b/i.test(task),
    compaction: /\b(compact\w*|rollers?)\b/i.test(task),
    claddingInstall: /\b(?:roof|frame),? (?:and )?clad\b|\bclad(?:,| and) line\b/i.test(task) || /\b(?:install\w*|fix\w*|replac\w*|supply and)\b[^.]{0,40}\b(?:(?:fibre cement|timber|weatherboard|james hardie|composite|external) )?(?:cladding|weatherboards?|hebel (?:panels?|blocks?)|aac panels?)\b/i.test(task) && !/\b(?:unitised|curtain wall|facade panels?|aluminium composite panels?|acp)\b/i.test(task),
    repointing: /\b(repoint\w*|rak\w* out (?:the )?(?:mortar|joints?)|replac\w* (?:the )?(?:old )?mortar|re-?mortar\w*|sandstone (?:repair|restoration))\b/i.test(task),
    fixtures: /\b(?:install\w*|fit\w*|fix\w*)\b[^.]{0,40}\b(?:acoustic (?:wall )?panels? on (?:the )?walls?|grab rails?|handrails?|stair ?lifts?|tactile (?:indicators?|tiles?)|shelving|whiteboards?|mirrors?|toilet partitions?|lockers?|(?:wall[- ]mounted )?tvs?|televisions?|tv brackets?|access hatch(?:es)?)\b/i.test(task),
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
    tileRoofStrip: /\b(strip\w*|remov\w*|replac\w*)\b[^.]{0,30}\b(?:the )?(?:old )?tiled? roofs?\b|\bre-?(?:tile|batten)\w* (?:the |a )?(?:tiled |slate )?roof\b|\bstrip\w*\b[^.]{0,20}\broof tiles\b/i.test(task),
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
    jettyRepair: /\b(jett(?:y|ies)|wharf|wharves|boardwalks?|pontoons?|(?:foot|pedestrian |timber )bridges?|bridge decks?)\b/i.test(task) && /\b(remov\w*|replac\w*|repair\w*|rebuild\w*)\b/i.test(task) && !(/\b(concrete|spall\w*)\b/i.test(task) && !/\b(timbers?|decking|boards?|planks?)\b/i.test(task)),
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
    splitInstall: /\bsplit[- ]systems?\b|\b(?:wall[- ]hung|ductless) (?:air ?con\w*|units?)\b|\bair ?condition\w* (?:units? )?on (?:a )?wall brackets?\b/i.test(task) && /\b(install\w*|replac\w*|fit\w*|supply)\b/i.test(task),
    gateInstall: /\b(boom gates?|automatic gates?|sliding gates?|swing gates?|motorised gates?|gate motors?|gate openers?|barrier arms?|boom arms?)\b/i.test(task) && /\b(install\w*|replac\w*|fit\w*|new)\b/i.test(task),
    poolEquipment: /\bpool (?:pumps?|filters?|chlorinators?|equipment)\b/i.test(task) && /\b(install\w*|replac\w*|fit\w*|connect\w*)\b/i.test(task),
    escalatorInstall: /\b(escalators?|moving walkways?|travelators?)\b/i.test(task) && /\b(install\w*|replac\w*|supply)\b/i.test(task),
    tieDowns: /\b(cyclone (?:tie[- ]?downs?|straps?|rods?)|tie[- ]?downs?)\b/i.test(task),
    palletRacking: /\b(pallet racking|racking|shelving systems?)\b/i.test(task) && /\b(install\w*|erect\w*|assembl\w*|relocat\w*|supply)\b/i.test(task),
    antennaInstall: /\b(weather stations?|antennas?|aerials?|mobile phone (?:towers?|base stations?)|telecommunications? (?:equipment|towers?)|5g (?:equipment|antennas?)|satellite dish\w*)\b/i.test(task) && /\b(install\w*|replac\w*|fit\w*|mount\w*)\b/i.test(task),
    smallPour: SMALL_POUR.test(task),
    hvWork: /\b(high voltage|hv|11 ?kv|22 ?kv|33 ?kv|kiosk substations?|transformers?)\b/i.test(task),
    solarPanels: /\b(solar (?:panels?|pv|arrays?|modules?|systems? on (?:a |the )?(?:\w+ )*?roofs?)|pv (?:panels?|arrays?|modules?)|photovoltaic|panels? on the roof)\b/i.test(task),
    subfloor: /\bunder (?:the |a |an )?(?:existing )?(?:house|home|floor|building)\b|\bsub-?floor\b/i.test(task),
    upperFloor: /\b(?:level \d+|(?:first|second|third|fourth|fifth|\d+(?:st|nd|rd|th)) (?:floor|storey)|upper (?:floor|level)s?|balcon\w*)\b/i.test(task),
    childcare: /\b(child ?care|early (?:childhood|learning)|kindergartens?|kindy|preschools?|schools?|aged care|nursing homes?|hospitals?)\b/i.test(task),
    publicSite: /\b(medical (?:clinics?|centres?)|clinics?|surgeries|schools?|classrooms?|child ?care|kindergartens?|hospitals?|aged care|nursing homes?|residents?|shopping (?:centres?|centers?)|train stations?|railway stations?|parks?|playgrounds?|libraries|community halls?|churches?|caf(?:e|é)s?|hotels?|motels?|pubs?)\b/i.test(task),
    leadPaint: /\blead(?:[- ]based)? paint\b/i.test(task) && /\b(remov\w*|strip\w*|abrad\w*|sand\w*|scrap\w*)\b/i.test(task),
    stumpOnly: /\bstumps?\b/i.test(task) && !/\b(fell\w*|cut\w* down|trees? (?:removal|felling)|remov\w* (?:the |a |three |two |\w+ )?(?:large |dead |gum )?trees?(?! stumps?))\b/i.test(task),
    windowReplace: /\b(?:replac\w*|remov\w*)\b[^.]{0,40}\b(?:old |existing )?(?:aluminium |timber |steel )?(?:windows?|window frames?|frames|sliding doors?)\b|\bnew windows?\b[^.]{0,40}\bremov\w*/i.test(task),
    tileReplace: /\b(?:replac\w*|repair\w*)\b[^.]{0,20}\b(?:broken |cracked |damaged |loose )?(?:floor |wall )?tiles?\b/i.test(task) && !/\b(?:roof|carpet|vinyl|rubber|lino\w*|asbestos(?: \w+)?|ceiling) tiles?\b/i.test(task) && !(/\basbestos\b/i.test(task) && /\b(?:wall sheets?|backing|fibro)\b/i.test(task)),
    gasRun: /\b(?:run\w*|install\w*|lay\w*|extend\w*)\b[^.]{0,20}\b(?:a |the )?(?:new )?gas (?:lines?|pipes?|pipework|services?)\b/i.test(task),
    gasTest: /\bgas\b/i.test(task) && /\bpressure test\w*|\bleak test\w*|\btest\w* and commission\w*/i.test(task),
    roofExtension: /\b(skillion (?:roofs?|extensions?)|roof extensions?|lean-to\w*|extend\w* (?:the )?roof)\b/i.test(task),
    kitBuild: /\b(kit|colorbond|garden) (?:sheds?|carports?|garages?)\b|\bkit\b/i.test(task),
    tankStand: /\btank stands?\b|\b(?:on|onto) (?:a |the )?(?:\d+ ?m )?(?:steel |timber )?stands?\b/i.test(task),
    signPosts: /\b(sign ?posts?|signs? on posts|pole[- ]mounted signs?|car parks?|carparks?)\b/i.test(task),
    spigots: /\bglass (?:pool )?fenc\w*|\bspigots?\b/i.test(task),
    sprayRoad: /\b(spray seal\w*|bitumen seal\w*|chip seal\w*|bitumen spray\w*)\b/i.test(task),
    roadBarrier: /\b(crash barriers?|guard ?rails?|safety barriers?|road barriers?|wire rope barriers?|w-?beam|concrete barriers?|jersey barriers?)\b/i.test(task) && /\b(highways?|roads?|motorways?|freeways?|bridges?|bypass\w*)\b/i.test(task),
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
    rangeHood: /\b(range ?hoods?|exhaust hoods?|kitchen hoods?|canopy hoods?|exhaust canop(?:y|ies))\b/i.test(task),
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
    stormwaterOnly: /\b(downpipes?|stormwater|gutters?|roof water)\b/i.test(task) && !/\b(sewers?|sewage|sanitary|waste|toilets?|septic)\b/i.test(task),
    pumpOutLine: /\bpump[- ]?out (?:lines?|points?|pipes?)\b|\bpump[- ]?out\b[^.]{0,30}\b(?:septic|grease|arrestor|trap)\b|\b(?:septic|grease|arrestor|trap)\b[^.]{0,30}\bpump[- ]?out\b/i.test(task),
    platformLift: /\b(platform lifts?|wheelchair (?:lift|platform)\w*|disabled (?:access )?lifts?|lift platforms?)\b/i.test(task),
    pitLid: /\b(?:replac\w*|fit\w*|install\w*)\b[^.]{0,30}\b(?:pit (?:lids?|covers?|grates?)|(?:grated |access )?(?:lids?|covers?|grates?) (?:on|to|of) (?:a |the )?(?:\w+ )?pits?)\b/i.test(task),
    subfloorRepair: /\b(?:replac\w*|repair\w*|sister\w*)\b[^.]{0,30}\b(?:floor )?(?:joists?|bearers?)\b/i.test(task),
    boosterInstall: /\b(booster (?:assembl\w*|sets?|valves?|cabinets?)|hydrant boosters?|fire boosters?)\b/i.test(task),
    steelRails: /\b(steel|weld\w*)\b/i.test(task) && /\b(rails?|yards?|posts?|fenc\w*)\b/i.test(task),
    grinding: /\bgrind\w*\b/i.test(task),
    deckRefinish: /\b(?:strip\w*|refinish\w*|oil\w*|stain\w*|sand\w*)\b[^.]{0,30}\b(?:timber )?decks?\b/i.test(task),
    multiLevel: /\b(apartments?|levels?|storeys?|stor(?:e?y|ies)|multi-?stor\w*|high ?rises?|towers?|floors? (?:above|below)|office (?:buildings?|towers?)|hospitals?)\b/i.test(task),
    chasing: /\b(chas\w*|rough[- ]in|rewir\w*|new circuits?|(?:new|add\w*|extra|additional) (?:power points?|gpos?|outlets?|data points?)|conduits? in (?:the )?walls?|wall boxes?)\b/i.test(task),
    sportsField: /\b(sports? (?:fields?|ovals?|grounds?|courts?)|ovals?|stadiums?|playing fields?)\b/i.test(task),
    craneNamed: /\b(cranes?|work box\w*|screens?)\b/i.test(task),
    signPostsOnly: /\b(sign ?posts?|car ?parks?|parking (?:spaces?|bays?)|road signs?|street signs?)\b/i.test(task) && !/\b(facades?|shopfronts?|buildings? (?:front|face)|lit signs?|led screens?|billboards?)\b/i.test(task),
    panelCladding: /\b(cladding panels?|wall panels?|acm|aluminium composite|metal cladding|tilt-?up)\b/i.test(task) && !/\b(timber|weatherboards?|fibre cement|hardie\w*)\b/i.test(task),
    roofContext: /\b(roofs?|rooftop|roof ?top)\b/i.test(task),
    louvres: /\blouv(?:re|er)s?\b/i.test(task),
    refrigEquipment: /\b(fridges?|freezers?|cool ?rooms?|cold ?rooms?|refrigerat\w*|ice machines?|display cabinets?|chillers?)\b/i.test(task),
    stainlessFab: /\b(stainless steel (?:benches|benching|sinks?|shelving|joinery|custom fabricated items)|fabricat\w*|weld\w*)\b/i.test(task),
    retainingBlock: /\bretaining walls?\b/i.test(task) && /\b(blocks?|masonry|bricks?|besser)\b/i.test(task),
    masonryFooting: /\b(barbecues?|bbqs?|letterbox\w*|piers?|fences?|planters?)\b/i.test(task),
    wallRepair: /\b(failed|collapsed|leaning|cracked|damaged)\b[^.]{0,20}\b(?:retaining )?walls?\b|\brepair\w*[^.]{0,20}\bretaining walls?\b/i.test(task),
    skylightRepair: /\b(repair\w*|replac\w*)\b[^.]{0,30}\b(?:broken |damaged |hail[- ]damaged |cracked )?skylights?\b|\b(?:hail|storm)[- ]damaged skylights?\b/i.test(task),
    fuelSite: /\b(service stations?|petrol stations?|fuel (?:sites?|forecourts?|bowsers?|dispensers?))\b/i.test(task),
    balustradeReplace: /\b(?:replac\w*|remov\w*|repair\w*)\b[^.]{0,30}\bbalustrad\w*/i.test(task),
    landingDoors: /\blanding doors?\b|\b(?:lift )?shaft door frames?\b|\blift door frames?\b/i.test(task),
    kitchenStrip: /\bstrip\w*[- ]?out\b[^.]{0,30}\bkitchens?\b|\bkitchens?\b[^.]{0,30}\bstrip\w*[- ]?out\b/i.test(task),
    paneReplace: /\b(cracked|broken|smashed|storm[- ]damaged)\b[^.]{0,20}\b(?:window )?(?:panes?|glass|windows?)\b|\b(?:replac\w*)\b[^.]{0,20}\b(?:window |glass )?panes?\b/i.test(task),
    acUnit: /\b(air ?con\w*|condens\w*|split systems?|heat pump units?|outdoor units?)\b/i.test(task),
    slabRemoval: /\b(?:cut\w*|break\w*|remov\w*|demolish\w*)\b[^.]{0,30}\b(?:and remov\w* )?(?:a |the )?(?:existing |old )?(?:concrete )?slabs?\b/i.test(task) && /\bremov\w*|break\w*|demolish\w*/i.test(task),
    applianceSwap: /\b(?:replac\w*|swap\w*|chang\w*)\b[^.]{0,40}\b(?:stoves?|ovens?|cooktops?|rangehoods?|dishwashers?|appliances?)\b/i.test(task) && /\b(electric|induction|cooktops?|stoves?|ovens?)\b/i.test(task) && !/\bgas\b/i.test(task),
    tankWalls: /\bconstruct\w*[^.]{0,30}\bconcrete (?:water )?tanks?\b|\b(?:build|form|pour)\w*[^.]{0,30}\btank walls?\b/i.test(task),
    kerbWork: /\b(kerbs?|kerb and channel|channels?)\b/i.test(task),
    solarArray: /\b(solar (?:panels?|pv|arrays?|modules?|systems?)|pv|arrays?|panels?|photovoltaic)\b/i.test(task) && !/\b(battery|batteries)\b(?![^.]*\bpanels?\b)/i.test(task) || /\bsolar (?:panels?|arrays?)\b/i.test(task),
    chainWire: /\bchain ?wire\b|\bchainmesh\b|\bcyclone (?:wire|fenc\w*)\b/i.test(task),
    smallElectrical: /\b(houses?|homes?|units?|apartments?|cooktops?|stoves?|ovens?|sports? (?:fields?|ovals?|grounds?)|ev chargers?|garages?)\b/i.test(task),
    ewpNamed: /\b(ewps?|boom lifts?|elevating work platforms?|scissor lifts?|cherry pickers?)\b/i.test(task),
    attachedStructure: /\battached\b/i.test(task),
    lightStructure: /\b(sheds?|garages?|carports?|cubby houses?|pergolas?|fibro)\b/i.test(task),
    doorSpringJob: /\b(?:replac\w*|repair\w*|fix\w*|re-?tension\w*)\b[^.]{0,30}\b(?:door )?springs?\b/i.test(task),
    highBays: /\bhigh ?bays?\b/i.test(task),
    polesNamed: /\b(poles?|columns?|signals?|traffic lights)\b/i.test(task) && !/\bconduits? and cables? for\b/i.test(task) || /\b(install\w*|erect\w*|stand\w*|new)\b[^.]{0,20}\b(?:light(?:ing)? )?poles?\b/i.test(task),
    newPole: /\b(?:install\w*|erect\w*|stand\w*|new)\b[^.]{0,20}\bpoles?\b|\bpoles? (?:footings?|install\w*)\b/i.test(task),
    exhaustFan: /\bexhaust fans?\b/i.test(task) && /\b(bathrooms?|ceilings?|houses?|toilets?|laundr\w*)\b/i.test(task),
    pressureTank: /\bpressure (?:tanks?|vessels?)\b/i.test(task),
    switchboardReplace: /\b(?:replac\w*|upgrad\w*|chang\w*)\b[^.]{0,30}\b(?:switchboards?|switch ?boards?|fuse ?boards?|main boards?)\b/i.test(task) && !/\bmeter (?:box|board|panel)s?\b/i.test(task),
    solarHotWaterRoof: /\bsolar hot water\b/i.test(task) && /\b(roofs?|collectors?|panels?)\b/i.test(task),
    commercialAppliance: /\b(?:install\w*|replac\w*|connect\w*|fit\w*)\b[^.]{0,40}\b(?:(?:commercial )?coffee machines?|espresso machines?|commercial dishwashers?|commercial washing machines?|commercial dryers?|glass ?washers?|ice machines?|water boilers?|zip (?:taps?|boilers?)|boiling water units?)\b/i.test(task),
    gasBoiler: /\bgas[- ](?:fired )?boilers?\b|\bboilers?\b[^.]{0,30}\bgas\b/i.test(task),
    shoringWall: BULK_EXCAVATION.test(task) && /\b(shoring(?: walls?)?|soldier piles?|contiguous piles?|secant piles?|sheet piles?|piled walls?)\b/i.test(task) && /\b(install\w*|build\w*|construct\w*)\b/i.test(task),
    tactileInstall: /\b(tactiles?|tactile (?:ground surface )?indicators?|tgsis?)\b/i.test(task),
    pitPipeRepair: /\b(?:repair\w*|fix\w*|replac\w*|seal\w*)\b[^.]{0,30}\b(?:cracked |broken |leaking )?(?:pipe joints?|pipes?|joints?)\b/i.test(task) && /\b(pits?|manholes?|chambers?)\b/i.test(task),
    wetWellClean: /\bclean\w*(?: out)?\b[^.]{0,40}\b(wet wells?|pump stations?|sumps?)\b/i.test(task),
    buildUnder: /\bbuild\w* in\b[^.]{0,20}\b(?:under\w*|beneath|below)\b|\bbuild\w* (?:in )?under(?:neath)?\b/i.test(task),
    cattleGrid: /\b(cattle|stock) grids?\b/i.test(task),
    cycloneShutters: /\b(cyclone|storm|roller) shutters?\b/i.test(task),
    collapsedWall: /\b(collapsed|fallen|failed)\b[^.]{0,30}\bwalls?\b/i.test(task),
    acService: /\b(servic\w*|repair\w*|maintain\w*|maintenance)\b/i.test(task) && /\b(air ?condition\w*|a\/?c units?|hvac|package units?|condensers?)\b/i.test(task) && /\b(roofs?|rooftop)\b/i.test(task) && !/\b(install\w*|replac\w*)\b/i.test(task),
    rampBuild: /\b(?:install\w*|build\w*|construct\w*)\b[^.]{0,30}\b(?:disabled |wheelchair |access |accessible |concrete )*ramps?\b/i.test(task) && !/\b(boat|loading|skate) ramps?\b/i.test(task),
    outdoorKitchen: /\boutdoor kitchens?\b|\b(?:alfresco|bbq|barbecue) kitchens?\b/i.test(task) && /\b(install\w*|build\w*|construct\w*)\b/i.test(task),
    gasLineTest: /\bgas\b/i.test(task) && /\b(?:pressure|leak) test\w*\b[^.]{0,30}\b(?:gas )?(?:lines?|pipe\w*|installation)\b|\b(?:pressure|leak) test\w*\b[^.]{0,20}\b(?:a |the )?new gas\b/i.test(task),
    fenceRemove: /\b(?:replac\w*|remov\w*|demolish\w*|tak\w* down)\b[^.]{0,40}\bfenc\w*\b/i.test(task) && !/\b(temporary|site) fenc\w*\b/i.test(task),
    vanityInstall: /\b(?:replac\w*|install\w*|fit\w*|new)\b[^.]{0,30}\bvanit(?:y|ies)\b/i.test(task),
    shedTakeDown: /\b(?:remov\w*|demolish\w*|tak\w* down|dismantl\w*)\b[^.]{0,30}\b(?:\w+ )?(?:garden )?sheds?\b/i.test(task) && !/\b(machinery|hay|industrial|farm|storage) sheds?\b/i.test(task),
    controlPanelInstall: /\b(?:install\w*|replac\w*|new)\b[^.]{0,40}\bcontrol (?:panels?|boards?)\b/i.test(task),
    pumpStation: /\b(pump stations?|wet wells?|sewage pumps?)\b/i.test(task),
    rockLining: /\b(rock (?:lining|beaching|armour\w*|walls?)|rip ?rap)\b/i.test(task),
    lintelReplace: /\b(?:replac\w*|remov\w*)\b[^.]{0,30}\b(?:rusted |old |failed |cracked )?(?:steel )?lintels?\b/i.test(task),
    subBoardInstall: /\b(?:install\w*|new)\b[^.]{0,30}\b(?:3-phase |three phase |single phase )?(?:sub-?boards?|distribution boards?)\b/i.test(task),
    footpathWork: /\b(footpaths?|sidewalks?|shopfronts?|pedestrian)\b/i.test(task),
    farmWork: /\b(farms?|cattle|stock ?yards?|paddocks?|stations?|rural)\b/i.test(task),
    heatedAppliance: /\b(coffee|espresso|boilers?|zip|boiling water|dishwash\w*|glass ?wash\w*|booster heaters?|combi ovens?|steamers?)\b/i.test(task),
    ventReplace: /\b(?:replac\w*|chang\w*|swap\w*)\b[^.]{0,30}\b(?:roof )?(?:turbine )?(?:vents?|whirlybirds?|ventilators?)\b/i.test(task),
    inverterReplace: /\b(?:replac\w*|chang\w*|swap\w*)\b[^.]{0,20}\binverters?\b|\binverter replacement\b/i.test(task),
    screenReplace: /\b(?:replac\w*|remov\w*)\b[^.]{0,20}\b(?:shower |glass )?screens?\b/i.test(task),
    naturalStone: /\b(granite|marble|natural stone|quartzite|bluestone|travertine|limestone)\b/i.test(task),
    waterNetwork: /\b(water reticulation|reticulation mains?|water mains?|sewer reticulation)\b/i.test(task) && /\b(subdivisions?|estates?|networks?|utility)\b/i.test(task) && !/\b(?:house|home|lot|property) (?:services?|connections?)\b/i.test(task),
    mainRepair: /\b(burst|broken|leaking|damaged)\b[^.]{0,20}\b(?:water )?mains?\b/i.test(task),
    tempPole: /\b(temporary|builder'?s|construction) (?:power )?poles?\b/i.test(task),
    fireCollar: /\bfire collars?\b/i.test(task),
    pileComplete: /\b(bored|cfa|continuous flight auger|cast[- ]in[- ]place|cast[- ]in[- ]situ|screw) piles?\b/i.test(task) && /\b(install\w*|construct\w*|drill\w*|bore\w*)\b/i.test(task),
    wallPanels: /\b(acoustic|sound|wall) (?:wall )?panels?\b/i.test(task) && /\b(install\w*|fix\w*|fit\w*)\b/i.test(task) && !/\b(ceilings?|cladding|facades?|precast|tilt)\b/i.test(task),
    birdNetting: /\bbird (?:netting|nets?|mesh|proofing|spikes?|deterrents?)\b/i.test(task),
    // A day spa or a spa's reception is a business, not a spa pool.
    spaInstall: /\b(hot tubs?|(?<!\bday )spas?(?! (?:reception|front desk|desks?|treatment|salons?|retreats?|resorts?|centres?|centers?|lounges?|menus?|services|wing|buildings?))|swim spas?)\b/i.test(task) && /\b(install\w*|place\w*|connect\w*)\b/i.test(task),
    verandahRepair: /\b(?:repair\w*|fix\w*|restor\w*|replac\w*)\b[^.]{0,30}\b(?:sagging |rotten |damaged )?(?:verandahs?|porch\w*)\b/i.test(task),
    purlinInstall: /\b(?:install\w*|fix\w*|erect\w*|lift\w*)\b[^.]{0,30}\bpurlins?\b/i.test(task),
    stairLiftInstall: /\bstair ?lifts?\b/i.test(task) && /\b(install\w*|fit\w*|new)\b/i.test(task),
    artificialTurf: /\b(artificial|synthetic) (?:turf|grass)\b/i.test(task),
    timberStairs: /\b(?:replac\w*|rebuild\w*|build\w*|install\w*)\b[^.]{0,20}\b(?:the |new |a )?(?:timber |deck )+(?:stairs?|staircases?|steps)\b/i.test(task),
    windowSill: /\b(?:replac\w*|repair\w*)\b[^.]{0,30}\b(?:window )?sills?\b/i.test(task),
    chimneyRemoval: /\b(?:remov\w*|demolish\w*|tak\w* down|lower\w*)\b[^.]{0,30}\bchimneys?\b/i.test(task),
    concreteSteps: /\b(?:replac\w*|repair\w*|rebuild\w*)\b[^.]{0,20}\bconcrete steps\b/i.test(task),
    pipeRepair: /\b(?:replac\w*|repair\w*)\b[^.]{0,30}\b(?:section of )?(?:copper |water |pex |galvanised )?(?:water )?pip(?:e|es|ework)\b/i.test(task) && !/\b(sewer|stormwater|mains?|drains?)\b/i.test(task),
    saunaInstall: /\bsaunas?\b/i.test(task),
    treePruning: /\b(prun\w*|lopp\w*|trim\w*) (?:the |back )?(?:\w+ )?(?:trees?|branches)\b/i.test(task),
    poolHeater: /\bpool (?:heaters?|heat pumps?|heating)\b/i.test(task),
    appliancePower: /\b(power|electrical|electric(?:ity)?|booster heaters?)\b/i.test(task) && /\b(dishwashers?|coffee machines?|ice machines?|ovens?|fryers?|appliances?|machines?|equipment)\b/i.test(task) || /\bice machines?\b/i.test(task),
    smallMasonry: /\b(letterbox\w*|fences?|fence walls?|garden walls?|piers?|brick\w* up|block\w* up|fill\w* in|openings?|doorways?|repair\w*|patch\w*|barbecues?|bbqs?|steps|planter\w*)\b/i.test(task) && !/\b(storeys?|houses? (?:walls|brickwork)|face brick\w* (?:for|to) (?:a |the )?(?:new )?(?:\w+ )?(?:house|building)|fire walls?|block (?:walls?|fire walls?))\b/i.test(task),
    gantry: /\b(gantr(?:y|ies)|covered ways?)\b/i.test(task),
    hoarding: /\b(gantr(?:y|ies)|covered ways?|hoardings?)\b/i.test(task),
    substation: /\bsubstations?\b/i.test(task),
    nightWork: /\b(at night|night ?(?:work|shifts?)|overnight)\b/i.test(task),
    occupied: /\b(occupied|aged care|nursing homes?|hospitals?|while (?:the )?(?:\w+ )?(?:stay|remain)s? open|residents?|patients?|students? on site|during term)\b/i.test(task),
    // "Units" here are homes, not equipment such as fan coil or air handling units.
    houseWork: /\b(houses?|homes?|dwellings?|units?|apartments?|townhouses?|queenslanders?|residential|granny flats?)\b/i.test(task.replace(/\b(?:fan coil|air handling|condensing|indoor|outdoor|package(?:d)?|rooftop|wall[- ]hung|ceiling cassette|cassette|air ?condition\w*|split system|heat recovery|exhaust|power|control|pump|filter|terminal|treatment|dosing|chiller) units?\b/gi, '')) && !/\b(commercial|strata|apartment (?:building|block)s?|shopping|hospital|school|factory|warehouse)\b/i.test(task),
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
    // Flues named among the penetrations to flash or seal are another trade's flues.
    flueInstall: /\b(wood (?:heaters?|fires?|burners?)|flues?|chimney liners?|combustion heaters?)\b/i.test(task.replace(/[^.]+\.?/g, (sentence) => (/\b(flash\w*|seal\w*|penetrat\w*|fire[- ]?stop\w*|collars?)\b/i.test(sentence) && !/\b(heaters?|burners?|fireplaces?|(?:wood|open|gas) fires?|install\w* (?:the |a |new )?flues?|flue (?:kits?|liners?))\b/i.test(sentence) ? ' ' : sentence))),
    testTag: /\btest(?:ing)? and tag\w*\b|\btest and tag\b/i.test(task),
    edgeProtectionInstall: /\b(?:erect\w*|install\w*|remov\w*|dismantl\w*)\b[^.]{0,30}\b(?:edge protection|perimeter (?:screens?|guardrails?)|guardrails? around)\b/i.test(task),
    rockBreak: /\b(rock break\w*|hydraulic (?:hammer|breaker)s?|break\w* (?:up )?(?:the )?rock|rock (?:hammer|breaking))\b/i.test(task),
    drainClear: /\b(?:clear\w*|unblock\w*|clean\w*|jet\w*)\b[^.]{0,30}\b(?:blocked )?(?:drains?|sewers?|pipes?|downpipes?|stormwater)\b|\b(?:electric eel|drain machines?|jetters?)\b/i.test(task),
    signageInstall: /\b(?:install\w*|fit\w*|fix\w*|replac\w*|erect\w*|hang\w*)\b[^.]{0,60}\b(?:signs?|signage|led screens?|billboards?|shopfront signs?|banners?)\b/i.test(task) && !/\b(?:exit signs?|safety signs? and barriers|block plans)\b/i.test(task),
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
    // Friable asbestos is removed under a Class A licence, in an enclosure (s 475, s 477).
    // "Non-friable" is not friable: the hyphen is a word boundary, so it is ruled out first.
    friableAsbestos: /\basbestos\b/i.test(task) && /(?<!\bnon[- ]?)\bfriable\b|\b(class a\b|lagging|loose[- ]fill|limpet|sprayed asbestos|asbestos[- ]contaminated dust)/i.test(task),
    // Removing, repairing, modifying or disposing of installed engineered stone (s 529F).
    engStoneWork: ENG_STONE_INSTALLED.test(task) && /\bengineered stone\b/i.test(task),
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
    // A sentence that only marks or labels services names them; it does not install them.
    ductwork: /\bducted\b/i.test(task) && /\b(install\w*|replac\w*)\b/i.test(task) || MECHANICAL_WORK.test(task) && /\b(install\w*|exhaust systems?|supply and fix|fit(?:s|ted|ting)?)\b/i.test(task.replace(/\b(?:supply and )?install\w* (?:all )?(?:the )?(?:insulation|lagging)\b[^.]*/gi, '').replace(/[^.]+\.?/g, (sentence) => (/\b(mark\w*|label\w*|colour bands?|pipe markers?|flow arrows?)\b/i.test(sentence) && !/\b(?:install|supply|fit|run|replace)(?:s|ed|ing)?\b/i.test(sentence) ? ' ' : sentence))) && (!/\bon the roof\b/i.test(task) || /\b(?:install\w*|run\w*|connect\w*|fix\w*) (?:the |new )?(?:ductwork|ducting|ducts?)\b/i.test(task)) && (/\b(ductwork|duct(?:ing| runs?| sections?)|ducts)\b/i.test(task) || (/\b(fan coil units?|fcus?)\b/i.test(task) && !REFRIGERANT.test(task)) || /\b(split systems?|indoor units?|outdoor units?|wall[- ]hung units?)\b/i.test(task)),
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
    // Rules about cast-in conduits (none unless unavoidable, scan before drilling, avoid
    // striking them, the builder's own) are not installing them.
    castIn: /\bconduits?\b[^.]*\b(?:during (?:the )?pour\w*|before (?:the )?pour|pouring of concrete)\b|\b(cast[- ]in|in[- ]slab)\b/i.test(task.replace(/[^.]+\.?/g, (sentence) => (/\b(no|unless|if|builder will|by others)\b/i.test(sentence) || /\b(scan\w*|detect\w*|free of|impact|damag\w*|strik\w*|hit\w*|avoid\w*|integrity)\b/i.test(sentence) && /\b(drill\w*|cor(?:e|ing)|cut\w*|penetrat\w*|scan\w*)\b/i.test(sentence) ? ' ' : sentence))) && ELECTRICAL_CORE.test(task),
    containment: /\b(cable trays?|cable ladders?|containment|busduct)\b/i.test(task) && ELECTRICAL_CORE.test(task),
    cablePull: (/\b(cable pull\w*|pull\w* (?:the )?cables?|cable drums?|drums? of cable|submains?|consumer mains)\b/i.test(task) && ELECTRICAL_CORE.test(task)) || /\b(?:run\w*|lay\w*|install\w*)\b[^.]{0,20}\b(?:underground )?(?:power|supply|cable)\b[^.]{0,30}\bto (?:a |the )?(?:shed|garage|granny flat|pump|outbuilding|gate)\b/i.test(task),
    ictWork: ICT_WORK.test(task),
    securityWork: SECURITY_WORK.test(task),
    ictCabling: ICT_WORK.test(task) && !/\bon the roof\b/i.test(task) && (/\b(?:install\w*|pull\w*|run\w*)\b[^.]{0,60}\b(?:cabl\w*|containment|cable trays?|catenary|conduits?|data points?|data outlets?|cat ?6a?|cat ?5e?|fibre|copper|wi-?fi|wireless access points?|access points?|waps?)\b/i.test(task) || /\b(pabx|ip telephony|(?:tele)?phone systems?|handsets?)\b[^.]{0,80}\binstall\w*|\binstall\w*[^.]{0,80}\b(pabx|ip telephony|(?:tele)?phone systems?|handsets?)\b/i.test(task)),
    fibre: /\b(optical fibre|fibre optic\w*|fibre backbone|fibre cabl\w*|splic\w*)\b/i.test(task),
    commsRoom: ICT_WORK.test(task) && /\b(racks?|cabinets?|ups|batter(?:y|ies))\b/i.test(task) && /\b(install\w*|supply|provid\w*|fit\w*|mount\w*|head end|server)\b/i.test(task.replace(/\b(?:daily |regular )?inspections? of [^.]*/gi, '')),
    securityDevices: SECURITY_WORK.test(task) && /\b(install\w*|provid\w*|fit\w*)\b/i.test(task),
    fitOff: (/\b(rough[- ]in|fit[- ]off|rewir\w*|run\w* (?:new )?cables?|underfloor heating|heating cables?|heating mats?|exit signs?|emergency light\w*)\b/i.test(task) || /\b(?:install\w*|replac\w*|add\w*)\b[^.]{0,40}\b(?:led lighting|lighting|light fittings?|lights|downlights?|floodlights?|ceiling fans?|cooktops?|stoves?|ovens?|smoke alarms?|(?:ev |car )?chargers?|power (?:points?|circuits?|outlets?)|gpos?|switch(?:es)?|circuits?|outlets?)\b/i.test(task)) && ELECTRICAL_CORE.test(task),
    // Isolation steps for any work on the installation; commissioning only for the
    // permanent main switchboard and consumer mains, not construction power.
    isolation: SWITCHBOARD_WORK.test(task) || TEMP_POWER.test(task) || /\bunderground power\b|\bpower (?:supply )?to (?:a |the )?(?:granny flat|shed|garage|outbuilding|pool|pump)/i.test(task) || /\b(solar (?:panels?|pv|arrays?)|inverters?|meter (?:box|board|panel)s?|(?:home |house |solar |storage )batter(?:y|ies))\b/i.test(task) || ((/\b(rough[- ]in|fit[- ]off)\b/i.test(task) || /\b(?:install\w*|replac\w*|add\w*)\b[^.]{0,40}\b(?:led lighting|lighting|light fittings?|lights|downlights?|floodlights?|ceiling fans?|smoke alarms?|(?:ev |car )?chargers?|power (?:points?|circuits?|outlets?)|gpos?|switch(?:es)?|circuits?|outlets?)\b/i.test(task)) && ELECTRICAL_CORE.test(task)),
    // The site's main switchboard and consumer mains, not a mechanical or distribution board.
    mainSwitchboard: /\b(consumer mains|(?<!mechanical |mechanical services |mech |to the |to the existing |from the |from the existing |off the |existing )main switchboards?|msbs?|main distribution boards?|connection to (?:the )?(?:mains|supply))\b/i.test(task),
    commissioning: /\b((?:install\w*|replac\w*) (?:a |an |the )?(?:new )?(?:[\w-]+ ){0,4}(?:control panels?|sub-?boards?)|ev chargers?|electric vehicle chargers?|charging (?:stations?|points?)|new (?:dedicated )?circuits?|main switchboards?|consumer mains|commission\w*|fit[- ]?off|install\w* (?:a |the )?(?:new )?switchboards?|new switchboards?|replac\w* (?:the |a )?(?:old )?switchboards?|switchgear|connection to (?:the )?mains|provision of metering)\b/i.test(task) && ELECTRICAL_CORE.test(task) && !TEMP_POWER.test(task),
    deck: deckLaying(task),
    ewp: /\b(elevating work platforms?|ewps?|boom lifts?|scissor lifts?)\b/i.test(combinedFacts(task, facts)),
    precast: isPanelLift(task),
    asbestos: /\basbestos\b/i.test(task),
    asbestosCheck: asbestosLikely(task) && !/\basbestos\b/i.test(task),
    stripOut: /\b(strip\w* out|rip\w* out|strip\w* (?:the )?(?:old )?(?:bathroom|kitchen|laundry|room|ensuite|tiles?)|demolish\w* (?:the )?(?:bathroom|kitchen|laundry|walls?|tiles?)|remov\w* (?:the )?(?:\w+ )?(?:wall and floor tiles|floor tiles|wall tiles|vanit\w*|old cabinets?)|retil\w*|replac\w* (?:a |the )?(?:leaking )?shower bases?|wallpaper)\b/i.test(task) && !BULK_EXCAVATION.test(task) && !FORMWORK.test(task),
    deckBuild: /\b(timber decks?|timber decking|decking|decking boards?|pergolas?|verandahs?|patios?|boardwalks?|(?:timber )?(?:access|disabled|wheelchair) ramps?|(?:back|front|outdoor|house|garden|pool) decks?|decks? (?:at|on|for) (?:the )?(?:back|front) of (?:a|the) (?:house|home))\b/i.test(task) && /\b(build\w*|construct\w*|install\w*|erect\w*|frame\w*|lay\w*)\b/i.test(task),
    // Everyday residential and small works.
    kitchenEquipment: /\b(commercial kitchens?|kitchen equipment|kitchen items|commercial dishwash\w*|(?:commercial )?range ?hoods?|(?:kitchen )?exhaust canop(?:y|ies)|stainless steel (?:benches|benching|bench(?:es)?)|commercial (?:fridges?|refrigerators?|freezers?)|(?:commercial )?ice machines?|exhaust hoods?|cool ?rooms?|freezer rooms?|walk-in (?:freezers?|cool ?rooms?|fridges?)|combi ovens?|stainless steel (?:benches|benching|sinks?|shelving|joinery|custom fabricated items))\b/i.test(task) && /\b(install\w*|certif\w*|supply|provid\w*|fit\w*|deliver\w*)\b/i.test(task),
    safetyMesh: /\b(safety mesh|roof mesh|sarking)\b/i.test(task) && /\b(install\w*|fix\w*|lay\w*|run\w*)\b/i.test(task) && /\b(purlins?|warehouse|industrial|commercial|metal roof|roof sheet\w*)\b/i.test(task),
    waterHeater: /\b(?:install\w*|replac\w*|connect\w*|fit\w*)\b[^.]{0,40}\b(hot water (?:systems?|units?|heaters?|cylinders?|services?|heat pumps?|plant)|water heaters?|heat pumps?|pool heaters?)\b/i.test(task) && !/\b(air ?condition\w*)\b/i.test(task),
    solarPV: /\b(solar (?:panels?|pv|arrays?|power systems?|systems? on (?:a |the )?(?:\w+ )*?roofs?)|pv (?:panels?|arrays?|systems?)|photovoltaic|inverters?)\b/i.test(task.replace(/\b(?:connect\w*|link\w*|integrat\w*)\b[^.]{0,20}\bto (?:the |an |its )?(?:existing )?(?:solar )?inverter\b/gi, '')) && !/\bsolar hot water\b/i.test(task) && !/\bclean\w*\b/i.test(task),
    batteryStorage: /\binverters? and (?:an? )?batter(?:y|ies)\b|\bbatter(?:y|ies) and (?:an? )?inverters?\b|\b(?:home |house |solar |storage |lithium )batter(?:y|ies)\b|\bbattery (?:storage|systems?)\b|\bbatter(?:y|ies)\b[^.]{0,30}\b(?:solar|garage wall|house wall)\b/i.test(task),
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
    lineMarking: /\b(line marking|line-marking|linemarking|line mark\w*|road markings?|car ?park (?:lines|markings?)|(?:paint|mark)\w* (?:the )?(?:car ?park |parking )?(?:bays|lines))\b/i.test(task),
    bollards: /\b(bollards?|wheel stops?|speed (?:humps?|bumps?)|car stops?|parking stops?|traffic barriers?|crash barriers?|vehicle barriers?|barrier kerbs?)\b/i.test(task),
    shallowTrench: (/\b(garden taps?|irrigation|garden lights?|landscape lighting)\b/i.test(task) || /\b(?:dig|trench\w*)\b[^.]{0,40}\b(?:by hand|shallow|[1-9]\d{2} mm)\b/i.test(task)) && /\b(trench\w*|dig\w*|pipes?|cables?|lay\w*)\b/i.test(task) && !/\b(excavators?|sewer\w*|stormwater|conduits?|deep trench\w*|[2-9](?:\.\d+)? ?m deep|1\.[5-9]\d* ?m deep)\b/i.test(task),
    // Insulating the ceiling of an existing house is done from the roof space.
    roofSpace: /\b(roof spaces?|roof cavit\w*|attics?)\b/i.test(task) || (/\bceiling spaces?\b/i.test(task) && /\b(house|home|dwelling)\b/i.test(task)) || (/\b(insulation|batts)\b/i.test(task) && /\bceilings?\b/i.test(task) && /\bexisting\b/i.test(task) && /\b(house|home|dwelling)\b/i.test(task)) || (/\b(exhaust fans?|downlights?|ceiling fans?)\b/i.test(task) && /\b(houses?|homes?|dwellings?)\b/i.test(task) && /\b(ducted|roof|ceiling)\b/i.test(task)),
    // Domestic premises: the house refurbishment asbestos rule applies there.
    domesticPremises: /\b(houses?|homes?|dwellings?|townhouses?|duplex\w*|domestic premises|residences?)\b/i.test(task),
    houseFraming: (/\b(wall frames?|roof trusses?|stand\w* (?:the )?frames?|frame\w* (?:a|the) (?:new )?house)\b/i.test(task) && /\b(house|home|timber|dwelling|townhouses?|duplex)\b/i.test(task) || /\b(?:build\w*|construct\w*)\b[^.]{0,30}\b(?:granny flat|cabin|studio|extension|house)\b[^.]*\bframe\w*/i.test(task)) && !STEEL_WORK.test(task),
    fenceBuild: /\b(fenc\w*|cattle yards?|stock ?yards?|post and rail|posts and rails)\b/i.test(task) && /\b(build\w*|post holes?|install\w*|erect\w*|replac\w*|repair\w*|new)\b/i.test(task) && !/\b(site fenc\w*|temporary fenc\w*|hoardings?)\b/i.test(task),
    confined: choiceAnswer('spaceAssessment', facts.spaceAssessment) !== 'notConfined' && (/\bconfined space\b/i.test(task) || (/\b(?:enter\w*|go\w* into|work\w* in(?:side)?)\b[^.]{0,30}\b(?:pits?|wet wells?|manholes?|tanks?|sewers?|pump stations?|culverts?|silos?|vaults?)\b/i.test(task) || /\bclean\w* out\b[^.]{0,30}\b(?:pits?|wet wells?|tanks?|pump stations?|silos?|vaults?)\b/i.test(task)) || (/\b(?:install\w*|construct\w*|build\w*)\b[^.]{0,30}\b(?:manholes?|maintenance holes?)\b/i.test(task) && /\b(?:live|existing) (?:sewer\w*|roads?|mains?)\b|\bsewer\b/i.test(task)) || choiceAnswer('spaceAssessment', facts.spaceAssessment) === 'confined'),
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
    if (['deckMethod', 'energisedWork', 'spaceAssessment', 'refrigerantClass', 'scaffoldType'].includes(id)) return choiceAnswer(id, facts[id]);
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
  const scaffoldType = scaffoldTypeAnswer(task) || choiceAnswer('scaffoldType', facts.scaffoldType);
  const withClass = scaffoldLicenceLine(tidySteps(steps, combinedFacts(task, facts), answers), scaffoldType);
  return state.id === 'qld' ? scaffoldDesignLines(withClass, scaffoldType, task) : withClass;
}

// Queensland's Scaffolding Code of Practice 2021, Table 1: who designs and first inspects each scaffold.
const QLD_SCAFFOLD_CODE = 'Scaffolding Code of Practice 2021 (Qld) s 2.2, Table 1';
const SCAFFOLD_DESIGN = {
  modular: 'Modular scaffold is designed by the supplier or a competent person to the manufacturer\'s documented configurations, by the supplier or an engineer where it is clad above 4 m, and by an engineer where it is outside the manufacturer\'s documented parameters.',
  tubeCoupler: 'Tube and coupler scaffold with a top working platform above 33 m, or outside the scope of AS/NZS 1576.6, and cantilevered or spurred scaffold more than 6 m high, are designed by an engineer.',
  hung: 'Hung and drop scaffolds are designed by an engineer. Suspended scaffolds (swing stages and their supports) are designed and first inspected by an engineer.',
  mobile: 'Standard aluminium mobile scaffolds are erected to the manufacturer\'s instructions. Aluminium towers with a top working platform above 9 m, and other free-standing towers above 4 m, are designed by an engineer.',
};
function scaffoldDesignLines(steps, type, task) {
  const lines = [];
  if (SCAFFOLD_DESIGN[type]) lines.push(SCAFFOLD_DESIGN[type]);
  if (/\b(loading (?:bays?|platforms?)|landing bays?)\b/i.test(task)) lines.push('Loading bays with a top working platform above 9 m or a load over 2 t, or beyond the scaffold\'s duty rating, are designed and first inspected by an engineer.');
  if (/\bdemoli\w*\b/i.test(task)) lines.push('Perimeter demolition scaffold more than 9 m high is designed and first inspected by an engineer.');
  if (/\b(gantr\w*|overhead protection|covered ways?|public access|grandstands?|seating)\b/i.test(task)) lines.push('Gantries and overhead protection are designed by an engineer, and public access structures needing Building Code of Australia compliance are designed and first inspected by an engineer.');
  if (!lines.length) return steps;
  let added = false;
  return steps.map((step) => {
    if (added || step.step !== 'Erect the scaffold') return step;
    added = true;
    return { ...step, controls: [...step.controls, ...lines.map((line) => `${line} (${QLD_SCAFFOLD_CODE})`)] };
  });
}

// The licence line names the class for the scaffold used, once its type is known.
const SCAFFOLD_CLASS = {
  modular: 'This scaffold is modular: a basic scaffolding licence (SB) or higher.',
  tubeCoupler: 'This scaffold is tube and coupler, cantilevered or spur: an intermediate scaffolding licence (SI) or advanced (SA).',
  hung: 'This scaffold is hung or suspended: an advanced scaffolding licence (SA).',
  mobile: 'This scaffold is a mobile tower: a basic scaffolding licence (SB) or higher where a person or object could fall more than 4 m from it.',
};
function scaffoldLicenceLine(steps, type) {
  if (!SCAFFOLD_CLASS[type]) return steps;
  return steps.map((step) => ({
    ...step,
    controls: step.controls.map((line) => line.replace(/^Licence class: basic for modular scaffolds, intermediate for tube and coupler[^.]*\. Sight each licence before work\./, `${SCAFFOLD_CLASS[type]} Sight each licence before work.`)),
  }));
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
  [/^Nail guns?\b/, /\b(nail\w*|fram\w*|timber|skirting|architraves?|joinery|decking|cladding|battens?|trusses?)\b/i],
];

// Library lines partly said by an answer the user gave: the repeated part is
// reworded so the line adds only what the answer does not say, keeping its source.
const SAID_BY_FACT = [
  [/^A hot work permit is issued before hot work, and/, /\bhot work permit\b/i, 'Hot work is done only under the hot work permit, and'],
  // A fall control that keeps everyone out of the tree leaves no climbing system.
  [/^Pruning at height is done by an arborist from an EWP or with a climbing system and rescue plan,/, /\bno one climbs the tree\b/i, 'Pruning at height is done by an arborist from the EWP,'],
  // An answer that already has a licensed scaffolder erecting the scaffold leaves the instructions to add.
  [/^A licensed scaffolder erects the scaffold to the manufacturer's or designer's instructions\./, /\b(?:erected|put up)\b[^.]*\bby a licensed scaffolder\b|\blicensed scaffolder erects\b/i, 'The scaffold is erected to the manufacturer\'s or designer\'s instructions.'],
  // Where a licensed removalist takes the asbestos out first, the crew does not remove the fibro sheets.
  [/\bOld fibro sheets on a shed built before 2004 are treated as asbestos unless tested, and are removed under the asbestos rules\./, /\blicensed asbestos removalist\b[^.]*\bremoves any asbestos before this work starts\b/i, 'Old fibro sheets on a shed built before 2004 are treated as asbestos unless tested, and are removed by the licensed asbestos removalist before the rest of the shed is taken down.'],
  // An answer that already keeps the paint ventilated and away from ignition sources leaves nothing to add.
  [/^Line marking paint is used outdoors or with ventilation, away from ignition sources, as its safety data sheet says\.$/, /\bventilat\w*\b[^.]*\bignition\b|\bignition\b[^.]*\bventilat\w*\b/i, ''],
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
      if (!line) return false;
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
