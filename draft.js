const { HIERARCHY, SITE_FIELDS, HIGH_RISK, findState } = require('./legislation');

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

function isPanelLift(text) {
  return /\b(panel|precast|tilt-?up)\b/i.test(text) && /\blift/i.test(text);
}

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

function fallRisk(text) {
  if (/\bfall(?:ing)? (?:more than )?(?:2|two)\b/i.test(text)) return true;
  if (/\b(on the roof|working at height)\b/i.test(text)) return true;
  const match = String(text || '').match(/\b(\d+(?:\.\d+)?)\s*m(?:etre|eter)?s?\b/i);
  if (!match) return false;
  return Number(match[1]) > 2 && /\b(height|fall|roof|above|up to)\b/i.test(text);
}

function fallControlText(text) {
  const lines = sentences(text).filter((line) => /\b(do not place a person|stay(?:s|ing)? on the ground|from the ground|edge protection|guard\s?rails?|harness|scaffold|elevating work platform|\bewp\b|fall arrest|fall prevention|no one (?:goes|works) at)\b/i.test(line));
  return lines.join(' ');
}

function asbestosArrangement(text) {
  const lines = sentences(text).filter((line) => /\basbestos\b/i.test(line) && /\b(licen[cs]ed removal|removalist|left in place|exemption|removed before)\b/i.test(line));
  return lines.join(' ');
}

function mentioned(text, pattern) {
  return pattern.test(String(text || ''));
}

function highRiskMatches(text) {
  const checks = {
    fall: fallRisk(text),
    tower: mentioned(text, /\btelecommunication tower\b/i),
    demolition: mentioned(text, /\bdemolition\b/i) && mentioned(text, /\b(load-bearing|load bearing|structure)\b/i),
    asbestos: mentioned(text, /\basbestos\b/i),
    temporary: mentioned(text, /\b(temporary support|propping|structural alteration)\b/i),
    confined: mentioned(text, /\bconfined space\b/i),
    trench: mentioned(text, /\b(trench|shaft|tunnel)\b/i),
    explosives: mentioned(text, /\bexplosives?\b/i),
    gas: mentioned(text, /\b(gas main|pressuri[sz]ed gas)\b/i),
    chemicalLine: mentioned(text, /\b(fuel line|refrigerant line|chemical line)\b/i),
    electrical: mentioned(text, /\b(energised|energized|overhead (?:power )?lines?|live electrical|electrical services?)\b/i),
    atmosphere: mentioned(text, /\b(flammable atmosphere|contaminated atmosphere)\b/i),
    precast: mentioned(text, /\b(tilt-?up|precast)\b/i),
    road: mentioned(text, /\b(road\s?work|traffic control|traffic management|on the road|adjacent to (?:a |the )?road|carriageway|railway|shipping lane)\b/i),
    plant: mentioned(text, /\b(powered mobile plant|excavators?|forklifts?|trucks?|cranes?|loaders?|liebherr)\b/i),
    temperature: mentioned(text, /\bartificial extremes of temperature\b/i),
    water: mentioned(text, /\b(drown(?:ing)?|in or near water)\b/i),
    diving: mentioned(text, /\bdiving\b/i),
  };
  return HIGH_RISK.filter((item) => checks[item.id]);
}

function requiredFactsFor(task) {
  const facts = [];
  if (isCraneOrLift(task)) {
    facts.push({
      id: 'craneChart',
      label: 'Crane chart',
      prompt: 'Crane chart at the working radius.',
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
  if (fallRisk(task) && !fallControlText(task)) {
    facts.push({
      id: 'fallControl',
      label: 'Fall control',
      prompt: 'How a fall of more than 2 metres is prevented.',
    });
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
  ].map(supplied).filter(Boolean).join('\n');
}

function topicSupplied(task, fieldValue, pattern) {
  if (keptFact(fieldValue)) return true;
  return sentences(task).some((line) => pattern.test(line) && !isDenialLine(line));
}

function missingFacts(task, facts) {
  return requiredFactsFor(task).filter((item) => {
    if (item.id === 'fallControl' && fallControlText(acceptedText(combinedFacts(task, facts)))) return false;
    if (item.id === 'asbestosArrangement' && asbestosArrangement(acceptedText(combinedFacts(task, facts)))) return false;
    if (item.id === 'craneChart') return !topicSupplied(task, facts.craneChart, /\bcharts?\b/i);
    if (item.id === 'erectionDesign') return !topicSupplied(task, facts.erectionDesign, /\berection design\b/i);
    if (item.id === 'centreOfGravity') return !topicSupplied(task, facts.centreOfGravity, /\b(?:centre|center) of gravity\b/i);
    if (item.id === 'braceArrangement') return !topicSupplied(task, facts.braceArrangement, /\bbrace arrangement\b/i);
    if (item.id === 'safetyDataSheet') return !topicSupplied(task, facts.safetyDataSheet, /\b(safety data sheet|sds)\b/i);
    return !keptFact(facts[item.id]);
  });
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
  } else if (mentioned(source, /\b(powered mobile plant|excavators?|forklifts?|trucks?|loaders?)\b/i)) {
    push('Isolate or engineer', 'People stay clear of moving plant.');
  }

  if (mentioned(source, /\b(road\s?work|traffic control|traffic management|on the road|adjacent to (?:a |the )?road|carriageway)\b/i)) {
    push('Isolate or engineer', 'Separate the work from passing traffic before the task starts.');
  }

  if (/\b(relocat\w*|house removal|raising (?:a |the )?house|lowering (?:a |the )?house)\b/i.test(source) && !isCraneOrLift(source)) {
    push('Isolate or engineer', 'People stay clear of the structure while it is being moved.');
  }

  if (mentioned(source, /\b(energised|energized|overhead (?:power )?lines?|live electrical)\b/i)) {
    push('Isolate or engineer', 'Keep at least 4.0 m from a live overhead line unless the line owner agrees in writing.');
  }

  const fallLine = keptFact(facts.fallControl) || (isScaffoldErection(task) ? '' : fallControlText(source));
  if (fallRisk(source) && fallLine && !isScaffoldErection(task)) {
    const ppe = /\b(harness|fall arrest)\b/i.test(fallLine);
    const engineered = /\b(edge protection|guard\s?rails?|scaffold|elevating work platform|\bewp\b)\b/i.test(fallLine);
    const eliminated = /\b(do not place a person|from the ground|stay(?:s|ing)? on the ground)\b/i.test(fallLine);
    if (eliminated) push('Eliminate', fallLine);
    else if (engineered) push('Isolate or engineer', fallLine);
    else if (ppe) {
      push('Administrative', 'For a fall of more than 2 metres, elimination, substitution, and isolation or engineering were considered before personal protective equipment.');
      push('PPE', fallLine);
    } else push('Administrative', fallLine);
  }

  const asbestos = keptFact(facts.asbestosArrangement) || asbestosArrangement(source);
  if (asbestos && !isDenialLine(asbestos)) push('Administrative', asbestos);

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

function hazardsFor(task, facts, pack) {
  const source = combinedFacts(task, facts);
  const rows = [];
  const add = (hazard, risk) => rows.push({ hazard, risk });
  if (isCraneOrLift(source)) add('Dropped load', 'A person is struck by the load.');
  if (/\b(relocat\w*|house removal|raising (?:a |the )?house|lowering (?:a |the )?house)\b/i.test(source)) {
    add('Structure moving', 'A person is struck or crushed.');
  }
  if (mentioned(source, /\b(road\s?work|traffic control|on the road|adjacent to (?:a |the )?road|carriageway)\b/i)) {
    add('Traffic', 'A person or a vehicle is struck.');
  }
  if (fallRisk(source)) add('Fall from height', 'A person falls more than 2 metres.');
  if (isScaffoldErection(task) && scaffoldBrief(task, pack && pack.site, pack).hoarded) {
    add('Public footpath below', 'A person on the footpath is below the scaffold.');
  }
  if (mentioned(source, /\basbestos\b/i)) add('Asbestos', 'A person is exposed to asbestos.');
  if (mentioned(source, /\b(energised|energized|overhead (?:power )?lines?|live electrical)\b/i)) {
    add('Energised electrical service', 'A person contacts live electricity.');
  }
  if (needsSafetyDataSheet(source)) add('Hazardous substance', 'A person is exposed to the substance.');
  if (mentioned(source, /\b(powered mobile plant|excavators?|forklifts?|trucks?|loaders?|cranes?)\b/i) && !isCraneOrLift(source)) {
    add('Moving plant', 'A person is struck by plant.');
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
  if (isScaffoldErection(task)) return scaffoldMethod(scaffoldBrief(task, site, pack));
  const fromTask = sentences(task).filter((line) => !isDenialLine(line) && (!LIFT_BLEED.test(line) || isCraneOrLift(task)));
  const fromFacts = [];
  for (const id of ['craneChart', 'erectionDesign', 'centreOfGravity', 'braceArrangement', 'safetyDataSheet', 'fallControl', 'asbestosArrangement']) {
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

function questionsFor(input) {
  const state = findState(input.state);
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
    required: requiredFactsFor(task),
    site: SITE_FIELDS.map((field) => ({ id: field.id, label: field.label })),
  };
}

function prepareDraft(input) {
  const asked = questionsFor(input);
  if (asked.kind === 'refused' || asked.kind === 'error') return asked;
  const state = findState(input.state);
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
  };
  const missing = missingFacts(task, facts);
  const status = packIsTest(input)
    ? 'Not approved. Not signed. A test, not a site record.'
    : 'Not approved. Not signed.';
  const header = {
    state: state.name,
    instrument: state.instrument,
    compilation: state.compilation,
    section: state.section,
    sectionTitle: state.sectionTitle,
    contents: state.contents,
    principalContractor: keptFact(input.principalContractor),
    subcontractor: blankName(input.company || input.subcontractor),
    workplace: blankName(input.workplace || input.siteAddress),
    siteManager: keptFact(input.siteManager),
    scaffoldSupervisor: keptFact(input.scaffoldSupervisor),
    hospital: keptFact(input.hospital),
    firstAider: keptFact(input.firstAider),
    musterPoint: keptFact(input.musterPoint),
    task,
    date: cleanLine(input.date),
    status,
    test: packIsTest(input),
  };

  if (missing.length) {
    return {
      kind: 'stand-down',
      ...header,
      missing: missing.map((item) => item.label),
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

  return {
    kind: 'draft',
    ...header,
    missing: [],
    statement: '',
    highRisk: highRiskMatches(combinedFacts(task, facts)).map((item) => item.label),
    hazards: hazardsFor(task, facts, pack),
    controls: dedupe(ordered.map((item) => `${item.level}|${item.text}`)).map((key) => {
      const splitAt = key.indexOf('|');
      return { level: key.slice(0, splitAt), text: key.slice(splitAt + 1) };
    }),
    review: REVIEW,
    site: siteLines(site),
    method: steps,
    workers: [{ name: '', signature: '', date: '' }],
    signed: false,
    approved: false,
  };
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
