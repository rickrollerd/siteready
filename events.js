// Counts of what people do (never the content), and server errors, so the
// owner can see how the app is used and where it fails. Nothing is sent to a
// third party.
const crypto = require('crypto');
const db = require('./db');

async function record(type, companyId = null) {
  if (!db.enabled()) return;
  try {
    await db.query('INSERT INTO events (id, company_id, type, created_at) VALUES ($1, $2, $3, $4)', [crypto.randomUUID(), companyId, type, new Date()]);
  } catch {
    // Counting must never stop the work it counts.
  }
}

async function recordError(route, error) {
  console.error(`Error on ${route}:`, error);
  if (!db.enabled()) return;
  try {
    await db.query('INSERT INTO errors (id, route, message, created_at) VALUES ($1, $2, $3, $4)',
      [crypto.randomUUID(), String(route).slice(0, 200), String((error && error.message) || error).slice(0, 1000), new Date()]);
  } catch {
    // The error is in the log either way.
  }
}

module.exports = { record, recordError };
