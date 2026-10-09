// Industry data (terms of use section 8). For each SWMS saved or downloaded by a business,
// one de-identified record: the state, the job's postcode, the trade,
// the job steps and kinds of work, high risk work categories, plant and licence classes, the
// controls chosen (as fixed codes, control levels, listed choices and PPE ticked), the
// general type of project and the month. No names, ABN, address, email, account id or free
// text is kept. The business is kept only as a keyed one-way code, so figures can be limited
// to at least 10 businesses; it cannot be turned back into the account without the key.
// Figures for a postcode are only released where at least 10 businesses are counted in it;
// smaller counts roll up to the first two digits, then the state, then are left out.
const crypto = require('crypto');
const db = require('./db');
const { industryKey } = require('./secret-keys');

// INDUSTRY_KEY (or SESSION_SECRET). In production there is no built-in key: without one, no
// industry record is kept (secret-keys.js).
const code = (value) => {
  const key = industryKey();
  if (!key) throw new Error('INDUSTRY_KEY is not set.');
  return crypto.createHmac('sha256', key).update(String(value)).digest('hex').slice(0, 24);
};

// The general type of project, from fixed categories. The task's own words are not kept.
const PROJECT_TYPES = [
  ['hospital', /\b(hospitals?|health (?:precinct|facility)|clinics?|aged care)\b/i],
  ['school', /\b(schools?|classrooms?|universit\w*|tafe|campus|child ?care)\b/i],
  ['stadium or venue', /\b(stadiums?|arenas?|grandstands?|venues?|olympic\w*|aquatic cent\w*|velodrome)\b/i],
  ['road, rail or bridge', /\b(roads?|highways?|motorways?|freeways?|bridges?|rail\w*|tunnels?|interchanges?|culverts?|kerbs?)\b/i],
  ['high-rise residential', /\b(towers?|high-?rise|apartments?|units?|residential (?:tower|building)|storey)\b/i],
  ['house', /\b(houses?|homes?|dwellings?|granny flats?|duplex\w*|townhouses?|renovation\w*|bathrooms?|kitchens?)\b/i],
  ['industrial', /\b(warehouses?|factor\w*|industrial|plants?|mines?|quarr\w*|treatment plants?|depots?)\b/i],
  ['commercial', /\b(office\w*|shops?|retail|commercial|fit-?outs?|car ?parks?|hotels?)\b/i],
];
function projectType(text) {
  const found = PROJECT_TYPES.find(([, pattern]) => pattern.test(String(text || '')));
  return found ? found[0] : 'other';
}

// Controls chosen, kept only as fixed codes. Free text answers are read for these words and
// then dropped: only the code is kept.
const CONTROL_CODES = [
  ['guardrails', /\b(guard ?rails?|edge protection|handrails?)\b/i],
  ['scaffold', /\bscaffold\w*/i],
  ['ewp', /\b(EWPs?|elevating work platforms?|scissor lifts?|boom lifts?|cherry pickers?)\b/i],
  ['harness', /\b(harness\w*|fall arrest|travel restraint|restraint lines?|anchor points?|static lines?)\b/i],
  ['safetyMesh', /\b(safety mesh|catch nets?|safety nets?)\b/i],
  ['ladder', /\b(ladders?|platform ladders?|step ?ladders?)\b/i],
  ['propping', /\b(propp\w*|props|temporary (?:support|bracing))\b/i],
  ['shoring', /\b(shor\w*|trench (?:shields?|boxes?)|benching|battering|battered)\b/i],
  ['exclusionZone', /\b(exclusion zones?|barricad\w*|no[- ]go zones?|para-?webbing|bunting)\b/i],
  ['spotter', /\b(spotters?|safety observers?|sentries|sentry)\b/i],
  ['trafficControl', /\b(traffic (?:controllers?|management|control plan)|TMP|TGS|lane closures?)\b/i],
  ['isolation', /\b(isolat(?:e|ed|ion|ing)\b[^.]{0,40}\b(?:power|energy|supply|circuits?|services?|plant|gas|water|valves?|electric\w*)|lock ?out|LOTO|proved? de-?energised|test before (?:you )?touch)\b/i],
  ['permit', /\b(permits? to work|hot work permits?|entry permits?|excavation permits?|dig permits?)\b/i],
  ['serviceLocation', /\b(DBYD|before you dig|BYDA|service locat\w*|potholing|vacuum excavat\w*|non-?destructive dig\w*)\b/i],
  ['gasTest', /\b(gas (?:test\w*|detectors?|monitor\w*)|atmospheric (?:test\w*|monitor\w*)|atmosphere (?:test\w*|monitor\w*))\b/i],
  ['ventilation', /\b(ventilat\w*|extraction fans?|forced air)\b/i],
  ['dustSuppression', /\b(on-tool (?:water|extraction)|water suppression|wet cutting|dust extraction|H class vacuum|M class vacuum|shrouds?)\b/i],
  ['rpe', /\b(P2|P3|respirators?|PAPR|half[- ]face|full[- ]face|RPE)\b/i],
  ['hearing', /\b(ear ?plugs?|ear ?muffs?|hearing protection)\b/i],
  ['liftPlan', /\b(lift (?:plan|study)|crane (?:plan|study)|dogm[ae]n|riggers?|tag lines?)\b/i],
  ['engineerSignOff', /\b(?:engineers?|engineer's|geotech\w*)\b[^.]{0,40}\b(design\w*|certif\w*|sign\w*|inspect\w*|approv\w*)\b/i],
  ['inspection', /\b(pre-?start (?:checks?|inspections?)|daily inspections?|scaff ?tags?|inspected (?:daily|before))\b/i],
  ['rescuePlan', /\b(rescue (?:plan|procedure|equipment)|standby person|stand-?by person)\b/i],
  ['eyeWash', /\b(eye ?wash|emergency showers?)\b/i],
  ['training', /\b(trained|training|VOC|verification of competency)\b/i],
  ['heatStress', /\b(shade|rest breaks|drinking water|heat (?:stress|illness))\b/i],
  ['manualHandling', /\b(team lift\w*|mechanical aids?|trolleys?|lifting aids?|vacuum lifters?)\b/i],
];
// Questions answered by picking from a list. Only these listed values are kept.
const CHOICE_VALUES = {
  spaceAssessment: ['confined', 'notConfined'],
  energisedWork: ['none', 'testing'],
  deckMethod: ['below', 'top'],
  scaffoldType: ['modular', 'tubeCoupler', 'hung', 'mobile'],
  refrigerantClass: ['a1', 'a2l', 'a3'],
};

function controlsFor(draft, input) {
  const levels = {};
  for (const item of draft.controls || []) levels[item.level] = (levels[item.level] || 0) + 1;
  const text = [...(draft.controls || []).map((item) => item.text), ...(draft.jobSteps || []).flatMap((step) => step.controls || [])].join('\n');
  const codes = CONTROL_CODES.filter(([, pattern]) => pattern.test(text)).map(([code]) => code);
  const facts = input.facts || {};
  const choices = {};
  for (const [id, values] of Object.entries(CHOICE_VALUES)) {
    const value = values.find((item) => item.toLowerCase() === String(facts[id] || '').trim().toLowerCase());
    if (value) choices[id] = value;
  }
  const ppe = (draft.ppe || []).flatMap((area) => (area.items || []).filter((item) => item.ticked).map((item) => item.id)).sort();
  return { levels, codes, choices, ppe };
}

const LICENCE = /\b(S[BIA]|R[BIA]|DG|C[NV2601]|CT|CS|CD|CB|CP|CO|WP|PB|HM|HP|LF|LO|BS|BA|TO|ES)\b/g;

function recordFor(draft, input, company) {
  const postcode = (String(input.workplace || '').match(/\b(\d{4})\b(?!.*\b\d{4}\b)/) || [])[1] || '';
  const plant = [...new Set((draft.plant || []).map((item) => item.item))].sort();
  const licences = [...new Set((draft.plant || []).flatMap((item) => String(item.licence || '').match(LICENCE) || []))].sort();
  // Library job steps only: a step SiteReady made from the task's own words is free text and left out.
  const steps = [...new Set((draft.jobSteps || []).filter((step) => !step.fallback).map((step) => step.step))];
  const month = new Date().toISOString().slice(0, 7);
  return {
    month,
    state: String(input.state || '').toLowerCase().slice(0, 3),
    postcode,
    postcodeArea: postcode ? postcode.slice(0, 2) : '',
    trade: String(input.trade || '').slice(0, 60),
    projectType: projectType(`${draft.task || ''} ${input.workplace || ''}`),
    steps,
    kinds: Array.isArray(input.kinds) ? [...new Set(input.kinds)].slice(0, 80) : [],
    highRisk: [...(draft.highRisk || [])],
    plant,
    licences,
    controls: controlsFor(draft, input),
    business: code(company.id),
    // One record per business, task and month, however often it is downloaded.
    dedupe: code(`${company.id}|${month}|${String(input.state || '')}|${String(draft.task || '').toLowerCase()}`),
  };
}

async function recordIndustry(draft, input, company) {
  if (!db.enabled() || !company || company.industry_opt_out || !draft || draft.kind !== 'draft') return;
  if (!industryKey()) return;
  const record = recordFor(draft, input || {}, company);
  const seen = await db.one('SELECT 1 AS found FROM industry_records WHERE dedupe = $1', [record.dedupe]);
  if (seen) return;
  await db.query('INSERT INTO industry_records (id, month, state, postcode, postcode_area, trade, project_type, steps, kinds, high_risk, plant, licences, controls, business, dedupe) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)', [
    crypto.randomBytes(12).toString('hex'), record.month, record.state, record.postcode, record.postcodeArea, record.trade, record.projectType,
    JSON.stringify(record.steps), JSON.stringify(record.kinds), JSON.stringify(record.highRisk), JSON.stringify(record.plant), JSON.stringify(record.licences), JSON.stringify(record.controls),
    record.business, record.dedupe,
  ]);
}

const MIN_BUSINESSES = 10;

// Counts of SWMS and businesses by place, safe to release. A postcode with fewer than 10
// businesses is folded into its two digit area, an area into its state, and a state with
// fewer than 10 is left out. Optional filters narrow the records first (month, trade, project type).
async function releasableFigures({ month, trade, projectType: type } = {}) {
  const where = [];
  const values = [];
  for (const [column, value] of [['month', month], ['trade', trade], ['project_type', type]]) {
    if (value) { values.push(String(value)); where.push(`${column} = $${values.length}`); }
  }
  const rows = await db.query(`SELECT state, postcode, postcode_area, business FROM industry_records${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`, values);
  const group = (items, key) => {
    const out = new Map();
    for (const item of items) out.set(key(item), [...(out.get(key(item)) || []), item]);
    return out;
  };
  const businesses = (items) => new Set(items.map((item) => item.business)).size;
  const figures = [];
  let leftover = [];
  for (const [, items] of group(rows.filter((row) => row.postcode), (row) => `${row.state}|${row.postcode}`)) {
    if (businesses(items) >= MIN_BUSINESSES) figures.push({ level: 'postcode', state: items[0].state, place: items[0].postcode, swms: items.length, businesses: businesses(items) });
    else leftover.push(...items);
  }
  leftover.push(...rows.filter((row) => !row.postcode && row.postcode_area));
  const next = [];
  for (const [, items] of group(leftover, (row) => `${row.state}|${row.postcode_area}`)) {
    if (businesses(items) >= MIN_BUSINESSES) figures.push({ level: 'area', state: items[0].state, place: `${items[0].postcode_area}xx`, swms: items.length, businesses: businesses(items) });
    else next.push(...items);
  }
  leftover = [...next, ...rows.filter((row) => !row.postcode && !row.postcode_area)];
  let withheld = 0;
  for (const [, items] of group(leftover, (row) => row.state)) {
    if (businesses(items) >= MIN_BUSINESSES) figures.push({ level: 'state', state: items[0].state, place: items[0].state, swms: items.length, businesses: businesses(items) });
    else withheld += items.length;
  }
  return { figures, withheldSwms: withheld, minBusinesses: MIN_BUSINESSES };
}

module.exports = { recordIndustry, recordFor, controlsFor, CONTROL_CODES, projectType, releasableFigures, MIN_BUSINESSES };
