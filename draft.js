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
  if (/\b(panel|precast|tilt-?up)\b/i.test(source) && /\blift/i.test(source)) return true;
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
  if (concrete && /\b(lift\w*|erect\w*|stand\w*|stood|install\w*|plac\w*|crane\w*)\b/i.test(source)) return true;
  return /\bpanels?\b/i.test(source) && /\b(lift\w*|crane\w*)\b/i.test(source);
}

const DEMOLITION = /\b(demolition|demolish\w*|knock(?:ing)? down|pull(?:ing)? down)\b/i;
const ROAD = /\b(road\s?works?|traffic control|traffic management|on the road|(?:adjacent to|next to|beside|alongside) (?:a |the )?(?:road|street|highway)|open to traffic|live traffic|carriageway|railway|rail corridor|shipping lane)\b/i;
const WATER = /\b(drown(?:ing)?|in or near water|(?:over|into|beside|next to) (?:a |the )?(?:tidal )?(?:river|creek|lake|sea|harbour|dam|canal|water)|jetty|wharf|pontoon|boat ramp|sea ?wall)\b/i;

function isScaffoldErection(text) {
  return /\bscaffold\w*\b/i.test(text) && /\berect\w*\b/i.test(text);
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
  return /\b(paints?|solvents?|adhesives?|resins?|acids?|thinners?|fuels?|petrol|diesel|chemicals?|sealants?|epox(?:y|ies)|hazardous substances?)\b/i.test(text);
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
    temporary: mentioned(text, /\b(temporary support|propping|structural alteration)\b/i),
    confined: mentioned(text, /\bconfined space\b/i),
    trench: deepExcavation(text),
    explosives: mentioned(text, /\bexplosives?\b/i),
    gas: mentioned(text, /\b(gas main|pressuri[sz]ed gas)\b/i),
    chemicalLine: mentioned(text, /\b(fuel line|refrigerant line|chemical line)\b/i),
    electrical: mentioned(text, /\b(energised|energized|overhead (?:power )?lines?|live electrical|electrical services?)\b/i),
    atmosphere: mentioned(text, /\b(flammable atmosphere|contaminated atmosphere)\b/i),
    precast: mentioned(text, /\b(tilt-?up|precast)\b/i),
    road: mentioned(text, ROAD) || /\blight rail\b/i.test(String(text || '')),
    plant: mentioned(text, /\b(powered mobile plant|concrete pump(?: truck)?s?|pump trucks?|telehandlers?|excavators?|forklifts?|trucks?|cranes?|loaders?|liebherr)\b/i),
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
  return fallControlText(acceptedText(source)) || keptFact(facts.fallControl);
}

// Where a fall control sits in the hierarchy.
function fallControlLevel(line) {
  if (/\b(do not place a person|from the ground|stay(?:s|ing)? on the ground)\b/i.test(line)) return 'Eliminate';
  if (/\b(edge protection|guard\s?rails?|handrails?|scaffold|elevating work platform|\bewp\b|safety mesh|catch platform|perimeter screens?|edge screens?|screens|full height gates?|fenc\w*|barriers?|barricad\w*|hoarding|covers?|covered)\b/i.test(line)) return 'Isolate or engineer';
  if (/\b(harness|fall arrest|lanyard|restraint)\b/i.test(line)) return 'PPE';
  return 'Administrative';
}

const FORMWORK = /\b(formwork|falsework|formply|deck forms?|table forms?|backprop\w*)\b/i;
const JUMPFORM = /\b(jump ?forms?|self[- ]climbing (?:form\w*|system)|climbing form\w*)\b/i;
const PT = /\b(post[- ]?tension\w*|pt slabs?|pt tendons?|stressing)\b/i;
const ENERGISED = /\b(energised|energized|overhead (?:power )?lines?|live electrical)\b/i;

const CATEGORY_FACTS = [
  {
    id: 'confinedSpace',
    label: 'Confined space entry',
    prompt: 'The entry permit, atmosphere testing, the standby person outside, and how a person is rescued.',
    level: 'Administrative',
    applies: (text) => mentioned(text, /\bconfined space\b/i),
  },
  {
    id: 'temporarySupport',
    label: 'Temporary support design',
    prompt: 'The engineer\'s design for the propping or temporary support, and who checks it is in place before any load-bearing part is removed.',
    level: 'Isolate or engineer',
    applies: (text) => mentioned(text, /\b(temporary support|propping|structural alteration)\b/i)
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
    applies: (text) => /\b(stress(?:ing)? (?:the )?tendons?|stressing)\b/i.test(text),
  },
  {
    id: 'drowningControls',
    label: 'Drowning controls',
    prompt: 'How a person is kept from falling into the water, and the rescue plan: life jackets, rescue equipment and who does the rescue.',
    level: 'Administrative',
    applies: (text) => mentioned(text, WATER),
  },
];

function requiredFactsFor(task, answer, state) {
  const facts = [];
  if (isCraneOrLift(task)) {
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
    if (item.applies(task)) facts.push({ id: item.id, label: item.label, prompt: item.prompt });
  }
  if (/\basbestos\b/i.test(task) && !asbestosArrangement(task)) {
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
    push('Isolate or engineer', `Only the people doing the lift are inside the exclusion zone. Stop the lift if anyone else enters. Do not pass a load over a person. ${under}`);
    push('Administrative', 'No free-fall with a load.');
    for (const field of ['craneChart', 'erectionDesign', 'centreOfGravity', 'braceArrangement']) {
      const line = keptFact(facts[field]);
      if (line) push('Administrative', line);
    }
  } else if (mentioned(source, /\b(powered mobile plant|concrete pump(?: truck)?s?|pump trucks?|telehandlers?|excavators?|forklifts?|trucks?|loaders?)\b/i)) {
    push('Isolate or engineer', 'People stay clear of moving plant.');
  }

  if (mentioned(source, ROAD)) {
    push('Isolate or engineer', 'Separate the work from passing traffic before the task starts.');
  }

  if (/\b(relocat\w*|house removal|raising (?:a |the )?house|lowering (?:a |the )?house)\b/i.test(source) && !isCraneOrLift(source)) {
    push('Isolate or engineer', 'People stay clear of the structure while it is being moved.');
  }

  if (mentioned(source, /\b(energised|energized|overhead (?:power )?lines?|live electrical)\b/i)) {
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
    if (value && item.applies(source)) {
      for (const line of sentences(value)) push(item.level, line);
    }
  }

  const asbestos = keptFact(facts.asbestosArrangement) || asbestosArrangement(source);
  if (asbestos && !isDenialLine(asbestos)) push('Administrative', asbestos);

  const trench = trenchSupportText(acceptedText(source)) || keptFact(facts.trenchSupport);
  if (deepExcavation(source) && trench) push('Isolate or engineer', trench);

  const sheet = keptFact(facts.safetyDataSheet);
  if (sheet) {
    for (const line of sentences(sheet)) push('Administrative', line);
  }

  const ppeNamed = source.match(/\b(hard hats?|helmets?|safety glasses|eye protection|gloves?|safety boots|hearing protection|hi-?vis(?:ibility)?(?: clothing)?|high visibility clothing|respirators?|dust masks?)\b/gi) || [];
  for (const item of dedupe(ppeNamed)) {
    const name = `${item.charAt(0).toUpperCase()}${item.slice(1)}`;
    push('PPE', `Wear ${name}.`);
  }

  if (!items.length) {
    push('Administrative', 'The task is done in the order written in the method.');
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
  if (mentioned(source, /\b(energised|energized|overhead (?:power )?lines?|live electrical)\b/i)) {
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
  for (const id of ['craneChart', 'erectionDesign', 'centreOfGravity', 'braceArrangement', 'safetyDataSheet', 'fallControl', 'asbestosArrangement', 'trenchSupport', ...CATEGORY_FACTS.map((item) => item.id)]) {
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
  if (check.detected) return `No. The task mentions work at height, and the user confirmed no one can fall more than ${check.metres} metres.`;
  return 'No';
}

// Northern Territory: residential construction work (a Class 1 building, or a Class 10
// building attached or adjacent to one) has a 3 metre fall height.
function residentialAnswer(value) {
  const text = cleanLine(value).toLowerCase();
  return ['yes', 'no'].includes(text) ? text : '';
}

// The state, with the fall height that applies to this task.
function stateFor(input) {
  const state = findState(input.state);
  if (!state || !state.residentialFallMetres) return state;
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
  };
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
    scaffoldSupervisor: keptFact(input.scaffoldSupervisor),
    hospital: keptFact(input.hospital),
    firstAider: keptFact(input.firstAider),
    musterPoint: keptFact(input.musterPoint),
    worksManager: keptFact(input.worksManager),
    worksManagerPhone: keptFact(input.worksManagerPhone),
    complianceResponsible: keptFact(input.complianceResponsible),
    reviewer: keptFact(input.reviewer),
    reviewDate: keptFact(input.reviewDate),
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
    jobSteps: jobStepsForTask(task, facts, hazards, finalControls),
    ppe: ppeFor(
      workFlags(task),
      input.ppe,
      /\b(harness|fall arrest)\b/i.test(combinedFacts(task, facts)),
      /\b(interior|inside|indoors?|internal|shop|office)\b/i.test(task),
    ),
    missing: [],
    statement: '',
    highRisk: highRiskMatches(combinedFacts(task, facts), pack.fallAnswer, state)
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

// The kinds of work in the task, which choose the job steps and the PPE.
function workFlags(task) {
  const scaffold = isScaffoldErection(task);
  return {
    road: mentioned(task, ROAD),
    power: mentioned(task, ENERGISED),
    scaffold,
    // Roofing work, not a roof beam or a job under a roof.
    roof: /\b(roof(?:ing)? sheets?|roofing|re-?roof\w*|roof tiles?|on (?:the|a) roof|roof work|roof repairs?)\b/i.test(task) && !scaffold,
    trench: deepExcavation(task) || /\b(excavat\w*|trench\w*)\b/i.test(task),
    propping: CATEGORY_FACTS.find((item) => item.id === 'temporarySupport').applies(task),
    demolition: mentioned(task, DEMOLITION),
    towerCrane: /\btower cranes?\b/i.test(task),
    crane: isCraneOrLift(task) && !/\btower cranes?\b/i.test(task),
    loadOut: /\b(load(?:ing)?[- ]?out|loading platforms?|landing platforms?)\b/i.test(task),
    forklift: /\b(forklifts?|telehandlers?)\b/i.test(task),
    formwork: FORMWORK.test(task.replace(new RegExp(JUMPFORM.source, 'gi'), '')),
    reo: /\b(reo|reinforc\w*|rebar|steel fixing)\b/i.test(task),
    ptTendons: PT.test(task) && /\b(place|placing|install\w*|lay\w*|fix\w*)\b/i.test(task) && /\b(ducts?|tendons?|strand)\b/i.test(task),
    concrete: /\b(concrete pump\w*|placing boom|pump(?:ing)? concrete|pour\w*|(?:plac\w*|finish\w*) (?:and (?:finish\w*|plac\w*) )?(?:the )?concrete|concrete (?:plac\w*|finish\w*))\b/i.test(task),
    stressing: /\b(stress(?:ing)? (?:the )?tendons?|stressing)\b/i.test(task),
    jumpform: JUMPFORM.test(task),
    precast: isPanelLift(task),
    asbestos: /\basbestos\b/i.test(task),
    confined: /\bconfined space\b/i.test(task),
    water: mentioned(task, WATER),
    painting: needsSafetyDataSheet(task) && /\b(paint\w*|enamel|coating)\b/i.test(task),
  };
}

function asSentence(text) {
  const line = cleanLine(text);
  return line && !/[.!?]$/.test(line) ? `${line}.` : line;
}

// Job steps, each with its hazards and controls. Work the library does not know
// gets one middle step built from the task, its hazards and its controls.
function jobStepsForTask(task, facts, hazards, controls) {
  const source = acceptedText(combinedFacts(task, facts));
  const factText = (id) => {
    const given = keptFact(facts[id]);
    if (given) return asSentence(given);
    if (id === 'fallControl') return asSentence(fallControlText(source));
    if (id === 'trenchSupport') return asSentence(trenchSupportText(source));
    if (id === 'asbestosArrangement') return asSentence(asbestosArrangement(source));
    return '';
  };
  const [first] = sentences(task);
  return jobStepsFor(workFlags(task), factText, {
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
