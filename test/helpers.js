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
  scaffoldSupervisor: 'Pat Doyle, Doyle Scaffolding',
  site: { liveServices: 'None', publicInterface: 'None', otherTrades: 'None', ground: 'None', access: 'Through the main site gate.' },
};

// The plant and the emergency response are asked for each task (goal 2): ready() confirms the plant
// SiteReady lists as used and answers each emergency question, for tests about something else.
function ready(input) {
  const { prepareDraft } = require('../draft');
  const { draftBody } = require('../input');
  let out = input;
  for (let pass = 0; pass < 2; pass += 1) {
    const draft = prepareDraft(draftBody(out));
    if (draft.kind !== 'draft') return out;
    const emergency = Object.fromEntries((draft.emergencyQuestions || []).map((item) => [item.id, `${item.short} answer for this site`]));
    out = { ...out, plantChoice: { used: (draft.plantInferred || []).map((item) => item.item), notUsed: [], added: [] }, emergency: { ...emergency, ...(input.emergency || {}) } };
  }
  return out;
}

module.exports = { setupAccounts, lastLinkToken, mailbox, ANSWERED, ready };
