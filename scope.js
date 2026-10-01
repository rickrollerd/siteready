// Reads a scope of works and lists the tasks in it that need a SWMS.
// A scope mixes site work with commercial terms, exclusions, work by others and
// paperwork. Only the subcontractor's own site work is kept. Each line of site
// work is matched to the kinds of work the drafting library knows, and lines of
// the same kind become one proposed task. A task is marked as needing a SWMS when
// it is high risk construction work.
const { workFlags, highRiskMatches } = require('./draft');
const { ACTIVITIES } = require('./activities');
const { findState, highRiskList } = require('./legislation');

// Headings that start a part of the scope that is not the subcontractor's site work.
const OUT_HEADING = /\b(exclu\w*|by others|not included|not in scope|omitted|n\.?i\.?c\.?|builder'?s? (?:responsibilit\w*|works?|scope)|by (?:the )?(?:builder|client|principal|head contractor)|free issue|payment|insurance|warrant\w*|retention|variations?|programme|price|pricing|tender\w*|schedule of rates|rates|invoic\w*|claims?|definitions?|interpretation|general conditions|special conditions|contract conditions|documentation|submissions?|shop drawings|o ?& ?m|operation and maintenance|as[- ]?builts?|defects?|liquidated|security of payment|commercial|qualifications?|clarifications?|hold points?|inspection and test plans?|quality assurance|program(?:me)?|samples?|handover|maintenance|manufacture|storage|overview|introduction|background|project description)\b/i;
// Headings that bring the reader back to the work.
const WORK_HEADING = /\b(scope of works?|extent of (?:the )?works?|trade specific|specific inclusions|works? included|inclusions?|the works|work to be (?:done|carried out)|description of (?:the )?works?|specific (?:works|requirements)|trade works?|installation|supply and install|general scope|subcontract works)\b/i;

// A line that is not the subcontractor's site work.
const NOT_OURS = /\b(by others|by (?:the )?(?:builder|client|principal|head contractor|main contractor|electrician|plumber|other trades?)|excluded|exclusions?|not included|not part of|n\.?i\.?c\b|supply only|supplied by (?:the )?(?:builder|client|others)|free issued?|builder (?:will|to) (?:supply|provide|install)|(?:client|builder) supplied)\b/i;
// Paperwork, money and meetings: no site work.
const PAPERWORK = /\b(shop drawings?|submit\w*|submissions?|certificat\w*|warrant\w*|manuals?|as[- ]?built|samples?|invoice\w*|payment|price\w*|pricing|rates?\b|cost\w*|insurance|meetings?|programme|schedule|retention|variation\w*|tender\w*|quotation|documentation|records?|registers?|reports?|approvals?|permits? fees?|nominat\w*|allowance|provisional sum|prime cost|liquidated|defects liability|ITPs?\b|inspection and test plans?|design\w*|engineer\w* (?:certif\w*|sign\w*)|fabricat\w* (?:off[- ]site|in the (?:shop|factory|workshop))|off[- ]site)\b/i;
// Verbs for work done on site. A line naming only materials or a drawing is not work.
const SITE_WORK = /\b(install\w*|supply and install|erect\w*|dismantl\w*|fix\w*|lay(?:s|ing)?\b|construct\w*|demoli\w*|remov\w*|strip\w*|excavat\w*|trench\w*|backfill\w*|pour\w*|place(?:s|d)?\b|placing|cut(?:s|ting)?\b|core[- ]?drill\w*|coring|drill\w*|weld\w*|braz\w*|paint(?:s|ed|ing)?\b|apply|applied|application of|spray\w*|connect\w*|terminat\w*|test(?:s|ed|ing)?\b|commission\w*|seal(?:s|ed|ing)?\b|caulk\w*|grout\w*|tiling|hang(?:s|ing)?\b|set ?out|lift(?:s|ed|ing)?\b|hoist\w*|unload\w*|break(?:s|ing)? out|grind\w*|polish\w*|clean(?:s|ed|ing)?\b|torch\w*|screed\w*|render(?:s|ed|ing)?\b|sheet(?:ed|ing)\b|clad(?:ding)?\b|glaz(?:e|ed|ing)\b|pump(?:s|ed|ing)?\b|scaffold\w*|compact\w*|bolt(?:s|ed|ing)\b|anchor(?:s|ed|ing)\b|mount(?:s|ed|ing)\b|suspend\w*|penetrat\w*|isolat(?:e|es|ed|ing)\b|energis\w*|charg(?:e|ed|ing)\b|purg\w*|flush\w*|planting|mulch\w*|irrigat\w*|pav(?:e|ed|ing)\b|line ?mark\w*|rig(?:s|ged|ging)\b|dogg\w*|reinstat\w*|relocat\w*|pull(?:s|ed|ing)?\b|reticulat\w*|run(?:s|ning)? (?:the |all |new )?(?:cables?|pipes?|pipework|ducts?|ductwork|conduits?|services)|form(?:s|ed|ing)? (?:up|the|all)|tie(?:s|d)? (?:the |all )?(?:reo|reinforc\w*|bars?)|stress(?:ed|ing)\b|turf(?:ed|ing)\b|fill(?:ed|ing)?\b)\b/i;

// Not this trade's site work: drawing and document titles, and other subcontractors' work.
const NOT_WORK = /(\b(?:layout|sheet \d+|part \d+|drawing ____|document ____|specification\s*[-–:]|schedule\s*[-–:]|appendix\b|annexure\b|attachment\b)|\b(?!(?:the|this|our|each|a|any|all|such)\b)(?:\w+\/)?\w+ subcontractors? (?:to|will|shall|is|are)\b|\bother (?:sub)?contractors?\b|\bpreliminar\w*|^comment by\b|\bnational code of practice\b|\bunderstood\b|\bfit for construction\b|\breserves? the right\b|\bunless noted otherwise\b)/i;

const MIN_WORDS = 4;

function words(line) {
  return line.split(/\s+/).filter(Boolean).length;
}

// Removes bullets, clause numbers and spare spaces from the start of a line.
function cleanLine(line) {
  return line
    .replace(/ /g, ' ')
    .replace(/^\s*(?:[•·▪◦‣○●■□\-–—*>]+|\(?[a-z]{1,3}\)|\(?[ivx]{1,5}[.)]|\d+(?:\.\d+)*\.?\)?)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// A bullet or lettered item ("· Roof frame", "(a) Ductwork") is never a heading.
function isBullet(raw) {
  return /^\s*(?:[•·▪◦‣○●■□\-–—*>]+|\(?[a-z]{1,3}\)|\(?[ivx]{1,5}\))\s+/i.test(raw);
}

// A short line with no full stop, often numbered or in capitals, starts a part of the scope.
function isHeading(raw, line) {
  if (!line || isBullet(raw) || words(line) > 10 || /[.;]$/.test(line)) return false;
  return /^\s*\d+(?:\.\d+)*\.?\s+\S/.test(raw) || line === line.toUpperCase() || /:$/.test(line) || words(line) <= 5;
}

function splitLines(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    // A long paragraph with several items separated by semicolons is several lines.
    .flatMap((raw) => (raw.length > 240 && raw.includes(';') ? raw.split(/;\s+/) : [raw]));
}

function isWork(line) {
  return SITE_WORK.test(line) || kindsOf(line).length > 0;
}

// Whether a line describes the subcontractor's own site work.
function keep(line) {
  if (words(line) < MIN_WORDS) return false;
  // Scopes often list the work without a verb ("Duct work including access panels"),
  // so a line that names a kind of work counts too.
  if (NOT_OURS.test(line) || NOT_WORK.test(line) || !isWork(line)) return false;
  // Mostly capitals is a title, not a description of work.
  const letters = line.replace(/[^A-Za-z]/g, '');
  if (letters.length > 12 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.6) return false;
  // A paperwork line is kept only if it also names work done on site.
  return !(PAPERWORK.test(line) && !/\b(install\w*|erect\w*|lay\w*|fix\w*|construct\w*|demoli\w*|excavat\w*|pour\w*|weld\w*|cut\w*|core[- ]drill\w*|lift\w*|rigg\w*)\b/i.test(line));
}

// The lines that describe the subcontractor's own site work. A line that leads into a
// list ("Rigging of the structural steel for buildings 1 to 3:") is joined to its
// items ("Roof frame", "Window and door heads"), as the items alone do not say what the work is.
function siteWorkLines(text) {
  let out = false;
  let lead = null;
  const kept = [];
  const seen = new Set();
  const add = (line) => {
    const tidy = line.replace(/[;,:\s-]+$/, '').replace(/([^.])$/, '$1.');
    const key = tidy.toLowerCase();
    if (!keep(tidy) || seen.has(key)) return;
    seen.add(key);
    kept.push(tidy);
  };
  const flush = () => {
    if (lead) add(lead.items.length ? `${lead.text.replace(/[:\s-]+$/, '')}: ${lead.items.join(', ')}` : lead.text);
    lead = null;
  };
  for (const raw of splitLines(text)) {
    const line = cleanLine(raw);
    if (!line) continue;
    if (lead && isBullet(raw) && words(line) <= 15) {
      lead.items.push(line.replace(/[.;,]+$/, ''));
      continue;
    }
    flush();
    if (!out && /:\s*-?$/.test(line) && isWork(line) && !OUT_HEADING.test(line) && !NOT_OURS.test(line)) {
      lead = { text: line, items: [] };
      continue;
    }
    if (isHeading(raw, line)) {
      if (OUT_HEADING.test(line)) out = true;
      else if (WORK_HEADING.test(line) || isWork(line)) out = false;
      continue;
    }
    if (!out) add(line);
  }
  flush();
  return kept;
}

// The kinds of work with their own job steps, in the library's order.
const KINDS = ACTIVITIES.filter((activity) => activity.when && (activity.steps || []).length);
// Kinds that only add detail to another kind (a post-tensioned slab, a crane company's lifts)
// do not make a task of their own.
// Neither do incidental kinds that any trade does (power tools, moving materials,
// cleaning up, mixing): they are steps inside the trade's own tasks.
const DETAIL = new Set(['ptSlab', 'craneInterface', 'cite', 'ewp', 'mobileScaffold', 'forklift', 'carpentryWork', 'carpLoad', 'sitePlant', 'tileMix', 'masonryMortar', 'masonryGrout', 'wpRolls', 'glassHandling', 'glassWind', 'gasCylinders', 'neighbours', 'siteSheds']);
// A kind found in fewer lines than this is a passing mention, unless it is high risk work.
const MIN_SUPPORT = 2;
// The kinds of work each trade does. A scope is for one or two trades; its tasks are
// that trade's kinds, plus work any trade can strike (CROSS) when the scope names it.
// `signal` is a flag (or a pattern) that shows the trade even where no kind of work matches.
const TRADES = [
  { id: 'electrical', name: 'Electrical work', signal: 'electricalWork', kinds: ['tempPower', 'castIn', 'containment', 'cablePull', 'fitOff', 'isolation', 'commissioning', 'generatorPlant'] },
  { id: 'communications', name: 'Communications cabling and equipment', signal: 'ictWork', kinds: ['ictCabling', 'fibre', 'commsRoom'] },
  { id: 'security', name: 'Security system installation', signal: 'securityWork', kinds: ['securityDevices'] },
  { id: 'plumbing', name: 'Plumbing and drainage work', signal: 'plumbingWork', kinds: ['sewerConnection', 'castInPlumbing', 'hydraulicRisers', 'hotWork', 'solventCement', 'plumbingFitOff', 'pressureTest', 'hotWater', 'boilerPlant'] },
  { id: 'mechanical', name: 'Mechanical services installation', signal: 'mechanicalWork', kinds: ['plantLift', 'ductwork', 'refrigerantPipework', 'refrigerantTest', 'refrigerantCharge', 'roofPlant', 'jetFans', 'mechInsulation', 'mechCommissioning'] },
  { id: 'fire', name: 'Fire services installation', signal: 'fireWork', kinds: ['fireAtHeight', 'fireGrooving', 'fireLive', 'passiveFire'] },
  { id: 'lifts', name: 'Lift installation', signal: 'liftWork', kinds: ['liftShaft', 'liftLifting', 'liftCar'] },
  { id: 'facade', name: 'Facade installation', signal: 'facadeWork', kinds: ['panelLoad', 'facadeCrane', 'panelInstall', 'swingStage', 'edgeBracket', 'facadeSeal'] },
  { id: 'glazing', name: 'Windows, doors and glazing installation', signal: 'glazingWork', kinds: ['balustradeEdge', 'glassHandle', 'glazingDrill', 'glazingSeal'] },
  { id: 'steel', name: 'Structural steel erection and rigging', signal: 'steelWork', kinds: ['steelLift', 'steelErect', 'steelWeld', 'temporaryTowers', 'dualLift'] },
  { id: 'masonry', name: 'Blockwork and brickwork', signal: 'masonryWork', kinds: ['masonryCut', 'masonryLay', 'masonryEdge'] },
  { id: 'plasterboard', name: 'Wall and ceiling linings', signal: 'plasterWork', kinds: ['plasterSheets', 'plasterHeight', 'plasterCeiling', 'plasterSanding', 'carpFraming'] },
  { id: 'carpentry', name: 'Carpentry and joinery', signal: /\b(carpent\w*|joinery|cabinetry|timber (?:fram\w*|floor\w*|decks?)|wall frames?|roof trusses|trusses|hang(?:ing)? doors?)\b/i, kinds: ['carpFraming', 'carpJoinery', 'carpEdge', 'timberFloor', 'houseFraming', 'deckBuild'] },
  { id: 'doors', name: 'Doors, frames and hardware', signal: /\b(door ?frames?|door hardware|doorsets?|hinges|door closers|locksets?|(?:hang|install|fix)\w* (?:the |all )?(?:\w+ ){0,3}doors)\b/i, kinds: ['carpJoinery'] },
  { id: 'kitchens', name: 'Commercial kitchen and stainless steel installation', signal: /\b(commercial kitchens?|kitchen equipment|kitchen items|exhaust hoods?|cool ?rooms?|freezer rooms?|dishwash\w*|combi ovens?|stainless steel (?:benches|benching|sinks?|shelving|joinery))\b/i, kinds: [] },
  { id: 'tiling', name: 'Floor and wall tiling', signal: 'tilingWork', kinds: ['tileCut', 'tileLay', 'tileEdge'] },
  { id: 'stone', name: 'Stone benchtops', signal: 'stoneWork', kinds: ['stoneSilica', 'stoneHandle'] },
  { id: 'flooring', name: 'Floor coverings', signal: 'floorWork', kinds: ['floorGrind', 'floorAdhesive', 'floorLevel', 'timberFloor', 'floorLay'] },
  { id: 'waterproofing', name: 'Waterproofing', signal: 'waterproofing', kinds: ['wpPrep', 'wpLiquid', 'wpTorch', 'wpEdge'] },
  { id: 'painting', name: 'Painting', signal: 'painting', kinds: ['painting', 'paintAccess', 'paintSpray', 'paintSolvent', 'paintSwing', 'paintExternal'] },
  { id: 'roofing', name: 'Roofing', kinds: ['roof', 'roofStrip'] },
  { id: 'landscaping', name: 'Landscaping', signal: 'landscape', kinds: ['landscape', 'landscapeLift', 'turf', 'paving'] },
  { id: 'piling', name: 'Piling', signal: 'pilingWork', kinds: ['pilingPlatform', 'pilingRig', 'pileCage', 'cfaCage', 'openBore', 'pileConcrete', 'pileTrim'] },
  { id: 'structure', name: 'Formwork, reinforcement and concrete', kinds: ['formwork', 'jumpform', 'reo', 'ptTendons', 'concrete', 'stressing', 'precast', 'loadOut', 'propping', 'precastTier'] },
  { id: 'excavation', name: 'Excavation', kinds: ['bulkDig', 'anchorsProps', 'detailDig', 'dewatering', 'contaminatedSpoil', 'basementEdge', 'retentionWall', 'earthworks'] },
  { id: 'scaffolding', name: 'Scaffolding', kinds: ['scaffold', 'hoistInstall', 'hoistOperate', 'safetyNet'] },
  { id: 'cleaning', name: 'Cleaning', kinds: ['cleaning', 'cleaningHeight', 'cleaningStands'] },
  { id: 'site', name: 'Site establishment', kinds: ['siteEstablish', 'road'] },
  { id: 'fencing', name: 'Fencing and gates', kinds: ['fenceBuild'] },
];
const CROSS = new Set(['demolition', 'trench', 'coreDrill', 'sawCut', 'structuralOpening', 'asbestos', 'asbestosCheck', 'confined', 'roofSpace', 'power', 'road', 'water', 'liveHospital', 'stripOut', 'crane', 'towerCrane', 'scaffold']);
// A trade is the scope's trade when it is found in this share of the lines of the most found trade.
const TRADE_SHARE = 0.3;
// A scope usually names its trade at the top ("Scope of Works - Fire Services"). That trade
// is the scope's; another trade must then be found nearly as often to count as well.
const TITLE_SHARE = 0.6;
const TITLE_CHARS = 1500;
const TITLE_WORDS = {
  electrical: /\belectrical\b/i,
  communications: /\b(comms|communications|ict|data)\b/i,
  security: /\bsecurity\b/i,
  plumbing: /\b(hydraulics?|plumbing)\b/i,
  mechanical: /\b(mechanical|hvac|air[- ]conditioning)\b/i,
  fire: /\bfire (?:services|protection|sprinklers?)\b|\bsprinklers?\b/i,
  lifts: /\b(lifts?|elevators?)\b/i,
  facade: /\b(facade|curtain wall)\b/i,
  glazing: /\b(glazing|windows?|glass)\b/i,
  steel: /\bstructural steel\b/i,
  masonry: /\b(masonry|blockwork|brickwork)\b/i,
  plasterboard: /\b(ceilings?|partitions?|plasterboard|drywall)\b/i,
  carpentry: /\b(carpentry|joinery)\b/i,
  doors: /\b(doors|door hardware)\b/i,
  kitchens: /\b(commercial kitchens?|stainless)\b/i,
  tiling: /\btiling\b/i,
  stone: /\bstone\b/i,
  flooring: /\b(floor(?:ing)? coverings?|carpet|vinyl|flooring)\b/i,
  waterproofing: /\b(waterproof\w*|membranes?)\b/i,
  painting: /\bpainting\b/i,
  roofing: /\broofing\b/i,
  landscaping: /\blandscap\w*/i,
  piling: /\bpiling\b/i,
  structure: /\b(formwork|concrete|reinforc\w*|frp)\b/i,
  excavation: /\b(excavation|earthworks|civil)\b/i,
  scaffolding: /\bscaffold\w*/i,
  cleaning: /\bcleaning\b/i,
  fencing: /\bfenc\w*/i,
};

const TITLE_LINES = 6;

// The document's own name for the work, such as "Commercial Kitchens & Stainless".
function documentTitle(text) {
  const lines = String(text || '').slice(0, TITLE_CHARS).split('\n').map((line) => line.trim()).filter(Boolean).slice(0, TITLE_LINES);
  const title = lines.find((line) => words(line) <= 8 && !/^(?:the project|scope of works?|schedule\b|revision\b|document\b)/i.test(line));
  return title ? title.replace(/\s*[-–]?\s*scope of works?\s*$/i, '').replace(/^\w/, (ch) => ch.toUpperCase()).replace(/\b([A-Z])([A-Z]+)\b/g, (_m, a, b) => a + b.toLowerCase()) : '';
}

function titleTrades(text) {
  const head = String(text || '').slice(0, TITLE_CHARS);
  const named = /\bscope of (?:the )?works?\b[^\n]{0,80}|\bcomprises? the [^\n]{0,80}/gi;
  // The document title is in its first few lines, often on a line of its own.
  const title = head.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, TITLE_LINES).filter((line) => words(line) <= 8);
  const found = new Set();
  for (const match of [...title, ...(head.match(named) || [])]) {
    for (const [id, words] of Object.entries(TITLE_WORDS)) if (words.test(match)) found.add(id);
  }
  return found;
}
// Routine kinds of work are steps of the trade's main task, not SWMS of their own
// (a painter has one painting SWMS, not one for preparing and one for reaching ceilings).
// They join one task named after the trade. Other kinds, the distinct and riskier
// work such as formwork, roof work or painting outside at height, stay tasks of their own.
const ROUTINE = new Set([
  'fitOff', 'cablePull', 'plumbingFitOff', 'solventCement', 'pressureTest', 'hotWater', 'refrigerantTest', 'refrigerantCharge',
  'mechInsulation', 'mechCommissioning', 'securityDevices', 'ictCabling', 'carpFraming', 'carpJoinery', 'carpEdge', 'tileCut', 'tileLay',
  'masonryCut', 'masonryLay', 'plasterSheets', 'plasterHeight', 'plasterCeiling', 'plasterSanding', 'painting', 'paintAccess',
  'paintSolvent', 'floorAdhesive', 'floorLevel', 'floorLay', 'timberFloor', 'glazingSeal', 'glazingDrill', 'wpPrep', 'wpLiquid', 'wpEdge',
  'landscape', 'turf', 'paving', 'fenceBuild', 'cleaning', 'edgeBracket', 'facadeSeal', 'panelLoad', 'liftLifting', 'fireGrooving',
  'pileConcrete', 'pileTrim', 'steelWeld', 'houseFraming', 'deckBuild',
]);
// General wording that says nothing about the work itself. It stays in the lines found,
// but the task is written from the specific lines.
const GENERAL = /\b(scope of works? (?:generally )?(?:comprises?|includes?)|provide all (?:necessary )?(?:labour|materials)|all labour,? materials|complete the (?:entire|whole)|in accordance with the (?:drawings|specifications?|subcontract)|as (?:required|specified|noted) (?:in|by) the|but not limited to|the subcontractor (?:is deemed|has made provision|acknowledges))\b/i;
// "The Subcontractor shall paint ..." reads as "Paint ...".
const SUBJECT = /^(?:the )?subcontractor(?:'s)? (?:shall|is to|must|will|has allowed (?:for|to)|is required to|to)\s+(?:allow (?:for|to) )?/i;
// Task names for the kinds whose first job step does not name the work well.
const TITLES = {
  road: 'Traffic management', power: 'Work near overhead power lines', scaffold: 'Scaffolding', roof: 'Roof work', roofStrip: 'Removing old roofing',
  trench: 'Trenching and underground services', propping: 'Temporary works and propping', demolition: 'Demolition', crane: 'Crane lifts', towerCrane: 'Tower crane lifts',
  formwork: 'Formwork and falsework', reo: 'Reinforcement', concrete: 'Concrete placing and finishing', precast: 'Precast installation',
  tempPower: 'Construction power and temporary lighting', castIn: 'Cast-in conduits', containment: 'Cable tray and containment at height',
  isolation: 'Terminations, testing and connection to supply', commissioning: 'Switchboards and mains', coreDrill: 'Core drilling and penetrations',
  sewerConnection: 'Connection to the live sewer', hydraulicRisers: 'Risers and pipework at height', hotWork: 'Brazing and soldering (hot work)',
  plantLift: 'Plant delivery and lifting', ductwork: 'Ductwork and units at height', roofPlant: 'Plant on the roof', commsRoom: 'Comms rooms, racks and UPS batteries',
  fibre: 'Optical fibre', generatorPlant: 'Generators and fuel systems', boilerPlant: 'Boilers and pressure vessels', fireLive: 'Work on live fire systems',
  fireAtHeight: 'Sprinkler and hydrant pipework at height', passiveFire: 'Fire stopping', paintExternal: 'External painting at height', paintSpray: 'Spray painting',
  tileEdge: 'Tiling near balcony and terrace edges', cleaningHeight: 'Window and balcony cleaning', panelInstall: 'Panel installation at the slab edge',
  sawCut: 'Saw cutting', asbestos: 'Asbestos removal', asbestosCheck: 'Asbestos check', confined: 'Confined space entry', roofSpace: 'Work in the roof space',
  floorGrind: 'Floor grinding', wpTorch: 'Torch-on membranes', stoneSilica: 'Cutting stone benchtops', steelErect: 'Steel erection at height',
  balustradeEdge: 'Balustrades at open edges', liftShaft: 'Work at open lift shafts', landscapeLift: 'Lifting soil and plants',
};
const MAX_LINES = 8;
const MAX_TASK = 900;

function kindsOf(line, flags = workFlags(line)) {
  return KINDS.filter((kind) => flags[kind.when] && !DETAIL.has(kind.when));
}

// "Shop draw, fabricate, supply, deliver, install and certify ..." keeps only the site work.
const OFF_SITE = /^(?:(?:document|shop draw|design|fabricate|manufacture|supply|deliver|transport|unload|handle|apply protective coating|complete their design & construct proposal),?\s*(?:&\s*|and\s+)?)+(?=\w)/i;

function taskLine(line) {
  const text = line.replace(SUBJECT, '').replace(OFF_SITE, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function taskText(found) {
  const specific = found.filter((line) => !GENERAL.test(line));
  const lines = (specific.length ? specific : found).slice(0, MAX_LINES).map(taskLine);
  let text = '';
  for (const line of lines) {
    if ((text + ' ' + line).length > MAX_TASK) break;
    text = text ? `${text} ${line}` : line;
  }
  return text;
}

// High risk categories that a single line is enough to raise. Falls and mobile plant
// are mentioned in passing in most scopes, so they need more than one line.
const STRONG = new Set(['demolition', 'asbestos', 'temporary', 'confined', 'explosives', 'gas', 'chemicalLine', 'electrical', 'atmosphere', 'precast', 'road', 'water', 'diving', 'tunnel']);

function strongHighRisk(lines, state) {
  return lines.some((line) => highRiskMatches(line, '', state).some((item) => STRONG.has(item.check)));
}

function tasksFromScope(text, stateId = 'qld') {
  const state = findState(stateId);
  const lines = siteWorkLines(text);
  if (!lines.length) {
    return { tasks: [], lines: 0, note: 'No site work was found in this text. If it is a contract or a cover letter, attach the scope of works on its own.' };
  }
  const groups = new Map();
  const tradeCount = new Map();
  const tradeLines = new Map();
  for (const line of lines) {
    const flags = workFlags(line);
    const kinds = kindsOf(line, flags);
    for (const kind of kinds) {
      if (!groups.has(kind.when)) groups.set(kind.when, { kind, lines: [] });
      groups.get(kind.when).lines.push(line);
    }
    for (const trade of TRADES) {
      const signal = trade.signal instanceof RegExp ? trade.signal.test(line) : Boolean(trade.signal && flags[trade.signal]);
      // A trade with its own signal is counted by that alone: its kinds of work are
      // found in passing in other trades' scopes (doors in a painting scope).
      if (trade.signal ? signal : kinds.some((kind) => trade.kinds.includes(kind.when))) {
        tradeCount.set(trade.id, (tradeCount.get(trade.id) || 0) + 1);
        if (!tradeLines.has(trade.id)) tradeLines.set(trade.id, []);
        tradeLines.get(trade.id).push(line);
      }
    }
  }
  // The scope's own trades, and the kinds of work they do.
  const titled = titleTrades(text);
  const count = (trade) => tradeCount.get(trade.id) || 0;
  const top = Math.max(0, ...tradeCount.values());
  const titleTop = Math.max(0, ...TRADES.filter((trade) => titled.has(trade.id)).map(count));
  const ours = TRADES.filter((trade) => titled.has(trade.id)
    || count(trade) >= Math.max(2, titled.size ? titleTop * TITLE_SHARE : top * TRADE_SHARE));
  const allowed = new Set(ours.flatMap((trade) => trade.kinds));
  const order = (when) => KINDS.findIndex((kind) => kind.when === when);
  const makeTask = (id, step, found) => {
    const title = TITLES[id] || step;
    const task = taskText(found);
    const highRisk = highRiskMatches(task, '', state).map((item) => item.label);
    return {
      id,
      title,
      task,
      lines: found,
      highRisk,
      fallRisk: highRisk.some((label) => /falling/i.test(label)) ? 'yes' : '',
      needsSwms: highRisk.length > 0,
    };
  };
  const tasks = [...groups.values()]
    // A short pasted scope may not show a trade; then every kind found is kept.
    .filter((group) => allowed.has(group.kind.when)
      || (!ours.length && group.lines.length >= MIN_SUPPORT)
      || (CROSS.has(group.kind.when) && (group.lines.length >= MIN_SUPPORT || strongHighRisk(group.lines, state))))
    .sort((a, b) => order(a.kind.when) - order(b.kind.when))
    .filter((group) => !(ROUTINE.has(group.kind.when) && ours.some((trade) => trade.kinds.includes(group.kind.when))))
    .map(({ kind, lines: found }) => makeTask(kind.when, kind.steps[0].step, found));
  // Each trade's routine work is one task, named after the trade.
  for (const trade of ours) {
    const found = [...new Set([...groups.values()].filter((group) => ROUTINE.has(group.kind.when) && trade.kinds.includes(group.kind.when)).flatMap((group) => group.lines))];
    if (found.length) tasks.push(makeTask(trade.id, trade.name, found));
  }
  // A trade of the scope with none of its kinds of work found still gets one task, from
  // the lines that show the trade, so its work is not missed.
  for (const trade of ours) {
    // A trade named in the title but not found line by line takes the lines no other task used.
    const unused = lines.filter((line) => !tasks.some((task) => task.lines.includes(line)));
    const found = tradeLines.get(trade.id) || (titled.has(trade.id) ? unused : []);
    if (!tasks.some((task) => task.id === trade.id || trade.kinds.includes(task.id)) && found.length) tasks.push(makeTask(trade.id, trade.name, found));
  }
  // Site work that matches no trade still makes one task, so the work is not lost.
  if (!tasks.length && lines.length >= MIN_SUPPORT) tasks.push(makeTask('general', documentTitle(text) || 'Work in the scope', lines));
  tasks
    // High risk construction work needs a SWMS by law, so it comes first.
    .sort((a, b) => Number(b.needsSwms) - Number(a.needsSwms));
  return {
    trades: ours.map((trade) => trade.id),
    tasks,
    lines: lines.length,
    note: tasks.length ? '' : 'Site work was found, but none matched a kind of work SiteReady drafts. Write the task in the form instead.',
  };
}

module.exports = { tasksFromScope, siteWorkLines };
