// What users change in the controls (task #102), kept to improve the step library. Off unless
// CONTROL_LEARNING=on, until the privacy policy covers it. Each row is de-identified: the job
// step, the line as SiteReady wrote it, the user's line, the state, the trade and the month.
// No business, name, address, account or task wording is kept. The same change made again in
// the same month adds to its count, so a row is never tied to one SWMS.
const crypto = require('crypto');
const db = require('./db');
const { findState } = require('./legislation');

const enabled = () => String(process.env.CONTROL_LEARNING || '').trim().toLowerCase() === 'on';
// Months are counted in Queensland time, which has no daylight saving.
const monthOf = (date) => new Date(date.getTime() + 10 * 3600000).toISOString().slice(0, 7);

// Records the changes the draft applied. Returns how many were recorded.
async function recordControlEdits(draft, input, now = new Date()) {
  if (!enabled() || !db.enabled() || !draft || !draft.controlEdits) return 0;
  const state = findState(input && input.state);
  const fields = { month: monthOf(now), state: state ? state.id : '', trade: String((input && input.trade) || '').slice(0, 100) };
  let count = 0;
  for (const item of draft.controlEdits.applied || []) {
    const row = { ...fields, step: item.step, kind: item.kind, original: item.from || '', newLine: item.to || '' };
    const id = crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex');
    await db.query(`INSERT INTO control_edits (id, month, state, trade, step, kind, original, new_line, uses) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)
      ON CONFLICT (id) DO UPDATE SET uses = control_edits.uses + 1`, [id, row.month, row.state, row.trade, row.step, row.kind, row.original, row.newLine]);
    count += 1;
  }
  return count;
}

// Counts for the owner: changes by kind, and the steps changed most.
async function summary() {
  const kinds = await db.query('SELECT kind, SUM(uses) AS n FROM control_edits GROUP BY kind');
  const steps = await db.query('SELECT step, SUM(uses) AS n FROM control_edits GROUP BY step ORDER BY n DESC LIMIT 20');
  const byKind = { removed: 0, changed: 0, added: 0 };
  for (const row of kinds) byKind[row.kind] = Number(row.n);
  return {
    enabled: enabled(),
    total: Object.values(byKind).reduce((sum, n) => sum + n, 0),
    byKind,
    steps: steps.map((row) => ({ step: row.step, changes: Number(row.n) })),
  };
}

module.exports = { enabled, recordControlEdits, summary };
