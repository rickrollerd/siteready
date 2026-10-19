// An in-memory Postgres and a captured mailbox, so account tests need no setup.
const { newDb } = require('pg-mem');
const db = require('../db');
const { captureMail } = require('../mailer');

const mailbox = [];

// TEST_DATABASE_URL runs the same tests against a real, empty Postgres.
async function setupAccounts() {
  if (process.env.TEST_DATABASE_URL) {
    const { Pool } = require('pg');
    db.useDatabase(new Pool({ connectionString: process.env.TEST_DATABASE_URL }));
  } else {
    const { Pool } = newDb().adapters.createPg();
    db.useDatabase(new Pool());
  }
  await db.migrate();
  captureMail((message) => { mailbox.push(message); });
}

function lastLinkToken(email) {
  const message = [...mailbox].reverse().find((item) => item.to === email);
  const match = message && /\?login=([A-Za-z0-9_-]+)/.exec(message.text);
  return match && match[1];
}

// Goal 2: a SWMS downloads or saves only once its site questions and key people are answered
// (download-gate.js). Tests about something else download with these answers.
const ANSWERED = {
  workplace: '12 Smith Street, Paddington QLD 4064',
  principalContractor: 'ABC Builders Pty Ltd',
  complianceResponsible: 'Sam Lee, supervisor',
  reviewer: 'Sam Lee, supervisor',
  firstAider: 'Jo Smith',
  musterPoint: 'Front gate on Smith Street',
  // Needed before download (D292).
  hospital: 'Royal Brisbane and Women\'s Hospital, Herston',
  scaffoldSupervisor: 'Pat Doyle, Doyle Scaffolding',
  // Needed before download (D289).
  worksManager: 'Sam Lee',
  worksManagerPhone: '0412 345 678',
  // Ground is asked where a step digs, so it says what the ground is (messy round 15, SiteLink: "None" is refused there).
  site: { liveServices: 'None', publicInterface: 'None', otherTrades: 'None', ground: 'Firm level ground, no soft spots.', access: 'Through the main site gate.' },
};

// Live services named for work beside a live supply (messy round 14: "None" is refused there).
const LIVE_SERVICES = 'Live 240 V power and lighting circuits in the work area, isolated and tested by the electrician before work.';

// The plant and the emergency response are asked for each task (goal 2): ready() confirms the plant
// SiteWrite lists as used and answers each emergency question, for tests about something else.
function ready(input) {
  const { prepareDraft } = require('../draft');
  const { draftBody } = require('../input');
  let out = input;
  for (let pass = 0; pass < 2; pass += 1) {
    const draft = prepareDraft(draftBody(out));
    if (draft.kind !== 'draft') return out;
    const emergency = Object.fromEntries((draft.emergencyQuestions || []).map((item) => [item.id, `${item.short} answer for this site`]));
    // Each design the steps rely on is named (designs.js), unless the test gives its own answers.
    const designs = input.designs || ((draft.designs || []).length ? draft.designs.map((row) => ({ id: row.id, what: row.what, status: 'given', by: 'Smith Engineering', number: `SE-${row.id.toUpperCase()}-101`, revision: 'C', date: '2026-10-03' })) : undefined);
    // Each type of hazardous substance SiteWrite suggests is ticked "Not required" (D277), unless
    // the test gives its own products or ticks.
    const types = (draft.substances && draft.substances.items) || [];
    const notUsed = input.substancesNotUsed || (input.substances || !types.length ? undefined : types.map((item) => item.product));
    // A type the task, the answers or the job steps name gives a reason (D292 item 3, messy round 5), unless
    // the test gives its own.
    const rules = require('../public/substance-rules');
    // A type no reason settles (silica beside a step that cuts concrete, or a product a step uses, messy
    // round 7) is listed as a product instead, checked against its safety data sheet.
    const settled = (type) => !rules.notUsedNeed(type, 'Supplied and applied by others', rules.ownWords(input), rules.stepWords(draft), '', rules.cutStep(draft), draft);
    const listedTypes = input.substancesNotUsed || input.substances ? [] : (notUsed || []).filter((type) => !settled(type));
    const products = listedTypes.map((type, n) => ({ id: `sub-${n + 90}`, type, product: `${rules.SHORT.get(type)} used on this job`, controls: ['Wear the gloves and eye protection the safety data sheet sets out'], sdsDate: '2026-01-15', step: rules.matchStep(type, draft.jobSteps) ? '' : (type === rules.SILICA ? rules.cutStep(draft) : '') || ((draft.jobSteps || [])[1] || {}).step || '', confirmed: true }));
    const left = (notUsed || []).filter((type) => !listedTypes.includes(type));
    const named = left.filter((type) => rules.notUsedNeed(type, '', rules.ownWords(input), rules.stepWords(draft)));
    // Fuel beside a line refuelling the crew's plant takes no "by others" reason (messy round 9), so another is given.
    const reasonFor = (type) => (rules.notUsedNeed(type, 'Supplied and applied by others', rules.ownWords(input), rules.stepWords(draft), '', '', draft) ? 'Not used by our crew on this job' : 'Supplied and applied by others');
    const why = input.substancesNotUsedWhy || (named.length ? Object.fromEntries(named.map((type) => [type, reasonFor(type)])) : undefined);
    // Live services are named where a step's hazard is a live supply, as "None" is refused there (messy round 14).
    const site = out.site || {};
    const liveNamed = /^(?:none|nil|n\/a|na|not applicable)?\.?$/i.test(String(site.liveServices || '').trim()) && require('../download-gate').liveSupplyHazard(draft) ? { site: { ...site, liveServices: LIVE_SERVICES } } : {};
    out = { ...out, ...liveNamed, plantChoice: { used: (draft.plantInferred || []).map((item) => item.item), notUsed: [], added: [] }, emergency: { ...emergency, ...(input.emergency || {}) }, ...(designs ? { designs } : {}), ...(notUsed ? { substancesNotUsed: products.length ? left : notUsed } : {}), ...(products.length ? { substances: products } : {}), ...(why ? { substancesNotUsedWhy: why } : {}) };
  }
  return out;
}

// The check before a download or save (D286), as the page sends it, for tests about something else:
// every part ticked against the draft the body prints (or input, for a saved SWMS), with a name and
// role. A name in the body's old reviewedBy is kept.
function checked(body = {}, input = null, { name = '', role = 'Supervisor' } = {}) {
  const { prepareDraft } = require('../draft');
  const { draftBody } = require('../input');
  const { partHashes, IDS } = require('../public/check-parts');
  const source = input || (body.input && typeof body.input === 'object' ? body.input : body);
  const draft = prepareDraft(draftBody(source));
  const { reviewConfirmed: _tick, reviewedBy, ...rest } = body;
  return { ...rest, check: { parts: Object.fromEntries(IDS.map((id) => [id, true])), partHashes: partHashes(draft), name: name || reviewedBy || 'Alex Chen', role, ack: true } };
}

module.exports = { setupAccounts, lastLinkToken, mailbox, ANSWERED, LIVE_SERVICES, ready, checked };
