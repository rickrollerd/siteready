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

function missingFacts(task, facts) {
  return requiredFactsFor(task).filter((item) => {
    if (item.id === 'fallControl' && fallControlText(combinedFacts(task, facts))) return false;
    if (item.id === 'asbestosArrangement' && asbestosArrangement(combinedFacts(task, facts))) return false;
    if (item.id === 'craneChart' && /\bcharts?\b/i.test(task) && !/\bnot the chart\b/i.test(task)) return false;
    if (item.id === 'erectionDesign' && /\berection design\b/i.test(task)) return false;
    if (item.id === 'centreOfGravity' && /\b(?:centre|center) of gravity\b/i.test(task)) return false;
    if (item.id === 'braceArrangement' && /\bbrace arrangement\b/i.test(task)) return false;
    if (item.id === 'safetyDataSheet' && /\b(safety data sheet|sds)\b/i.test(task)) return false;
    return !supplied(facts[item.id]);
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

function controlsFor(task, facts) {
  const source = combinedFacts(task, facts);
  const items = [];
  const push = (level, text) => {
    const line = cleanLine(text);
    if (!line) return;
    items.push(control(level, line));
  };

  if (isCraneOrLift(source)) {
    const under = isPanelLift(source) ? 'No one goes under the panel.' : 'No one goes under the load.';
    push('Isolate or engineer', `Only the people doing the lift are inside the exclusion zone. Stop the lift if anyone else enters. Do not pass a load over a person. ${under}`);
    push('Administrative', 'No free-fall with a load.');
    for (const field of ['craneChart', 'erectionDesign', 'centreOfGravity', 'braceArrangement']) {
      const line = supplied(facts[field]);
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

  const fallLine = supplied(facts.fallControl) || fallControlText(source);
  if (fallRisk(source) && fallLine) {
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

  const asbestos = supplied(facts.asbestosArrangement) || asbestosArrangement(source);
  if (asbestos) push('Administrative', asbestos);

  const sheet = supplied(facts.safetyDataSheet);
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

function hazardsFor(task, facts) {
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

function methodSteps(task, facts, site) {
  const fromTask = sentences(task).filter((line) => !LIFT_BLEED.test(line) || isCraneOrLift(task));
  const fromFacts = [];
  for (const id of ['craneChart', 'erectionDesign', 'centreOfGravity', 'braceArrangement', 'safetyDataSheet', 'fallControl', 'asbestosArrangement']) {
    const line = supplied(facts[id]);
    if (!line) continue;
    if (sentences(task).some((item) => item.toLowerCase() === sentences(line).join(' ').toLowerCase())) continue;
    fromFacts.push(...sentences(line));
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
  const site = input.site || {};
  const missing = missingFacts(task, facts);
  const header = {
    state: state.name,
    instrument: state.instrument,
    compilation: state.compilation,
    section: state.section,
    sectionTitle: state.sectionTitle,
    contents: state.contents,
    subcontractor: blankName(input.company || input.subcontractor),
    workplace: blankName(input.workplace || input.siteAddress),
    task,
    date: input.date || '',
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

  let steps = methodSteps(task, facts, site);
  const built = controlsFor(task, facts);
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
    hazards: hazardsFor(task, facts),
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
