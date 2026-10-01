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

module.exports = { setupAccounts, lastLinkToken, mailbox };
