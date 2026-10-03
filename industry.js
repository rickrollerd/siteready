// Industry data (terms of use section 8). For each SWMS saved or downloaded by a business,
// one de-identified record: the state, the first two digits of the job's postcode, the trade,
// the job steps and kinds of work, high risk work categories, plant and licence classes, the
// general type of project and the month. No names, ABN, address, email, account id or free
// text is kept. The business is kept only as a keyed one-way code, so figures can be limited
// to at least 10 businesses; it cannot be turned back into the account without the key.
const crypto = require('crypto');
const db = require('./db');

const KEY = () => process.env.INDUSTRY_KEY || process.env.SESSION_SECRET || 'siteready-industry';
const code = (value) => crypto.createHmac('sha256', KEY()).update(String(value)).digest('hex').slice(0, 24);

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
    postcodeArea: postcode ? postcode.slice(0, 2) : '',
    trade: String(input.trade || '').slice(0, 60),
    projectType: projectType(`${draft.task || ''} ${input.workplace || ''}`),
    steps,
    kinds: Array.isArray(input.kinds) ? [...new Set(input.kinds)].slice(0, 80) : [],
    highRisk: [...(draft.highRisk || [])],
    plant,
    licences,
    business: code(company.id),
    // One record per business, task and month, however often it is downloaded.
    dedupe: code(`${company.id}|${month}|${String(input.state || '')}|${String(draft.task || '').toLowerCase()}`),
  };
}

async function recordIndustry(draft, input, company) {
  if (!db.enabled() || !company || company.industry_opt_out || !draft || draft.kind !== 'draft') return;
  const record = recordFor(draft, input || {}, company);
  const seen = await db.one('SELECT 1 AS found FROM industry_records WHERE dedupe = $1', [record.dedupe]);
  if (seen) return;
  await db.query('INSERT INTO industry_records (id, month, state, postcode_area, trade, project_type, steps, kinds, high_risk, plant, licences, business, dedupe) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)', [
    crypto.randomBytes(12).toString('hex'), record.month, record.state, record.postcodeArea, record.trade, record.projectType,
    JSON.stringify(record.steps), JSON.stringify(record.kinds), JSON.stringify(record.highRisk), JSON.stringify(record.plant), JSON.stringify(record.licences),
    record.business, record.dedupe,
  ]);
}

module.exports = { recordIndustry, recordFor, projectType };
