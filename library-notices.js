// Goal 10: customers are told which SWMS to review after the law or the library changes.
// Each change released is listed in library-notices.json with the reason in plain words. When a
// server starts with a notice it has not run, it finds every saved, active SWMS whose current
// revision would now print differently (the same comparison as "Updated wording is available"),
// marks each in My SWMS with the reason, and emails each company's administrator one list.
// A notice runs once: the library_notices table records it.
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { sendMail } = require('./mailer');
const revisions = require('./revisions');

const noticesFile = () => process.env.LIBRARY_NOTICES_FILE || path.join(__dirname, 'library-notices.json');

// The notices in the file, each with an id and a reason. states, where given, limits a notice to
// SWMS written for those states.
function readNotices(file = noticesFile()) {
  let list;
  try {
    list = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return [];
  }
  return (Array.isArray(list) ? list : list.notices || []).filter((item) => item && typeof item.id === 'string' && item.id && typeof item.reason === 'string' && item.reason.trim());
}

const parse = (value) => (typeof value === 'string' ? JSON.parse(value) : value);
// Drafting a SWMS takes a moment, so the server answers other requests between them.
const breathe = () => new Promise((resolve) => setImmediate(resolve));

// Every saved, active SWMS whose current revision today's library would print differently, with
// what would change. states limits the search to SWMS for those states, and companies (for the
// staging test) to those businesses.
async function affectedSwms({ states = null, companies: only = null } = {}) {
  // Loaded here, as accounts.js uses this module's flags in turn.
  const { withCompany, updatedWording } = require('./accounts');
  const companies = new Map((await db.query('SELECT * FROM companies WHERE id IN (SELECT company_id FROM swms WHERE archived = FALSE)')).map((row) => [row.id, row]));
  const rows = await db.query('SELECT * FROM swms WHERE archived = FALSE ORDER BY company_id, title');
  const out = [];
  for (const row of rows) {
    const company = companies.get(row.company_id);
    const input = parse(row.input) || {};
    if (!company || (states && states.length && !states.includes(input.state)) || (only && !only.includes(row.company_id))) continue;
    await breathe();
    let update;
    try {
      const kept = await revisions.revisionOf(row, company, row.revision || 1, withCompany);
      update = updatedWording(row, company, kept);
    } catch (error) {
      console.error(`Library notice: SWMS ${row.id} could not be compared:`, error.message);
      continue;
    }
    if (update.available) out.push({ row, company, changes: update.changes });
  }
  return out;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// The email to a company's administrator: the reason, the list, and what to do. Plain words.
function noticeEmail(notice, items, siteNames = {}) {
  const lines = items.map(({ row, changes }) => {
    const site = siteNames[row.site_id] ? `, ${siteNames[row.site_id]}` : '';
    return `- ${row.title} (revision ${row.revision || 1}${site}): ${plural(changes.length, 'change', 'changes')}`;
  });
  return {
    subject: `SiteReady: ${plural(items.length, 'SWMS', 'SWMS')} to review after a change`,
    text: [
      'Hello,',
      '',
      notice.reason.trim(),
      '',
      `SiteReady has been updated to match. ${items.length === 1 ? 'This saved SWMS would now print differently:' : 'These saved SWMS would now print differently:'}`,
      '',
      ...lines,
      '',
      'Nothing in them has changed yet. Each one still prints as it was saved, so it is still the record your workers signed.',
      '',
      'What to do:',
      '1. Sign in to SiteReady and open My SWMS. These SWMS are marked "Review: the law or SiteReady changed".',
      '2. Open each one and read "What would change".',
      '3. If the changes suit the job, make a new revision with the updated wording. Your workers then sign on to the new revision.',
      '',
      'SiteReady',
    ].join('\n'),
  };
}

// Runs each notice not yet run: marks the SWMS it changes and emails each company once.
async function runLibraryNotices({ now = new Date(), notices = readNotices() } = {}) {
  if (!db.enabled()) return [];
  const results = [];
  for (const notice of notices) {
    if (await db.one('SELECT id FROM library_notices WHERE id = $1', [notice.id])) continue;
    // Claimed before the search, so a restart part way through does not email twice.
    await db.query('INSERT INTO library_notices (id, reason, released, library_version, started_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
      [notice.id, notice.reason.trim().slice(0, 1000), String(notice.released || ''), revisions.LIBRARY_VERSION, now]);
    const affected = await affectedSwms({ states: Array.isArray(notice.states) ? notice.states : null, companies: notice.companies || null });
    for (const { row, changes } of affected) {
      await db.query('INSERT INTO swms_review_flags (swms_id, notice_id, revision, reason, changes, flagged_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (swms_id, notice_id) DO NOTHING',
        [row.id, notice.id, row.revision || 1, notice.reason.trim().slice(0, 1000), changes.length, now]);
    }
    const byCompany = new Map();
    for (const item of affected) byCompany.set(item.company.id, [...(byCompany.get(item.company.id) || []), item]);
    let emails = 0;
    for (const [companyId, items] of byCompany) {
      // The administrator gets the list; a company with none marked gets it to every user.
      let users = await db.query('SELECT email FROM users WHERE company_id = $1 AND is_admin = TRUE', [companyId]);
      if (!users.length) users = await db.query('SELECT email FROM users WHERE company_id = $1', [companyId]);
      const siteNames = Object.fromEntries((await db.query('SELECT id, name FROM sites WHERE company_id = $1', [companyId])).map((site) => [site.id, site.name]));
      const message = noticeEmail(notice, items, siteNames);
      for (const user of users) {
        try {
          await sendMail({ to: user.email, ...message });
          emails += 1;
        } catch (error) {
          console.error('Library notice email could not be sent:', error.message);
        }
      }
    }
    await db.query('UPDATE library_notices SET finished_at = $1, swms_count = $2, companies = $3, emails = $4 WHERE id = $5', [new Date(), affected.length, byCompany.size, emails, notice.id]);
    results.push({ id: notice.id, swms: affected.length, companies: byCompany.size, emails });
  }
  return results;
}

// The marks to show for a company's SWMS: for each SWMS, the reasons from notices since it was
// last reviewed or saved. Reviewing it, or saving a new revision, clears them.
async function flagsFor(companyId) {
  const rows = await db.query('SELECT f.swms_id, f.reason, f.flagged_at, s.last_reviewed_at FROM swms_review_flags f JOIN swms s ON s.id = f.swms_id WHERE s.company_id = $1 ORDER BY f.flagged_at', [companyId]);
  const out = {};
  for (const row of rows) {
    if (row.last_reviewed_at && new Date(row.flagged_at) <= new Date(row.last_reviewed_at)) continue;
    out[row.swms_id] = [...new Set([...(out[row.swms_id] || []), row.reason])];
  }
  return out;
}

module.exports = { readNotices, affectedSwms, noticeEmail, runLibraryNotices, flagsFor };
