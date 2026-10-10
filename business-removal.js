// Deleting a whole business on request (privacy policy: "You can ask us to delete your business's
// data at any time and we will do so within 30 days"), and the list of businesses that stopped
// paying, or whose trial ended, more than 12 months ago ("kept ... for 12 months after you stop
// paying"). Only the owner deletes, from the admin page; nothing is deleted on a timer.
//
// Every row tied to the business goes: the company and its logo, its people and their sign-ins,
// sessions, Face ID keys and sign-in links, sites, saved SWMS with every revision, worker sign-ons,
// reads and translations, review flags, references (so the public check says the reference is
// not found), AI readings, action counts, its industry records, and the owner's access log entries
// about it. Two things stay: the ABN in trial_abns, with no link to the account, so a deleted
// business cannot start a second free trial; and the control learning rows, which hold no
// business, account, site or SWMS id. One access log entry records that a business was deleted,
// with its account id and the date, and no name.
const crypto = require('crypto');
const db = require('./db');
const { businessCode } = require('./industry');
const { liveSubscription } = require('./billing');

const RETENTION_MONTHS = 12;

const plainText = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

// The words to type to confirm: the business name, or the account id when it has none.
const confirmWord = (company) => String(company.name || '').trim() || company.id;

// The owner's account searches that found this business (by its name, ABN or a user's email,
// as the search matches them). The words searched can name it, so they go with it.
async function searchesAbout(company, emails) {
  const digits = String(company.abn || '').replace(/\D/g, '');
  const name = plainText(company.name);
  const rows = await db.query("SELECT id, target FROM admin_access_log WHERE action = 'account_search' AND target <> ''");
  return rows.filter((row) => {
    const q = plainText(row.target);
    const qDigits = q.replace(/\s/g, '');
    return (name && name.includes(q)) || (/^\d{3,}$/.test(qDigits) && digits.includes(qDigits)) || emails.some((email) => email.includes(q));
  }).map((row) => row.id);
}

// Deletes the business with this account id. confirm must be its name (or its id when it has
// none). Refused while a Stripe subscription is still running. Returns what was removed from
// each table. Each step can be run again, so a delete stopped part way is finished by repeating it.
async function deleteBusiness(companyId, { confirm, adminEmail, now = new Date() } = {}) {
  const id = String(companyId || '');
  const company = await db.one('SELECT * FROM companies WHERE id = $1', [id]);
  if (!company) throw Object.assign(new Error('No account with that id.'), { status: 404, publicMessage: true });
  if (plainText(confirm) !== plainText(confirmWord(company))) {
    throw Object.assign(new Error(company.name ? 'Type the business name exactly as shown to confirm.' : 'This business has no name. Type its account id to confirm.'), { status: 400, publicMessage: true });
  }
  if (liveSubscription(company)) {
    throw Object.assign(new Error('This business still has a Stripe subscription (active or payment overdue). Cancel the subscription in Stripe first, then delete the business.'), { status: 409, publicMessage: true });
  }
  const emails = (await db.query('SELECT email FROM users WHERE company_id = $1', [id])).map((row) => String(row.email).toLowerCase());
  const searches = await searchesAbout(company, emails);
  const removed = {};
  const run = async (table, sql, params = [id]) => {
    const rows = await db.query(`${sql} RETURNING 1 AS gone`, params);
    removed[table] = (removed[table] || 0) + rows.length;
  };
  const USERS = 'SELECT id FROM users WHERE company_id = $1';
  const SWMS = 'SELECT id FROM swms WHERE company_id = $1';

  // Signing in first, so nobody in the business is signed in while the rest goes.
  await run('sessions', `DELETE FROM sessions WHERE user_id IN (${USERS})`);
  await run('challenges', `DELETE FROM challenges WHERE user_id IN (${USERS})`);
  await run('passkeys', `DELETE FROM passkeys WHERE user_id IN (${USERS})`);
  await run('signins', `DELETE FROM signins WHERE user_id IN (${USERS})`);
  await run('login_tokens', `DELETE FROM login_tokens WHERE company_id = $1 OR email IN (SELECT email FROM users WHERE company_id = $1)`);

  // The owner's look-ups of this business: its account, its references, searches that found it.
  await run('admin_access_log', "DELETE FROM admin_access_log WHERE action = 'account_view' AND target = $1");
  await run('admin_access_log', `DELETE FROM admin_access_log WHERE action = 'ref_lookup' AND target IN (SELECT ref FROM swms_refs WHERE company_id = $1 OR swms_id IN (${SWMS}))`);
  for (const logId of searches) await run('admin_access_log', 'DELETE FROM admin_access_log WHERE id = $1', [logId]);

  // Saved SWMS with everything kept for them.
  await run('signons', `DELETE FROM signons WHERE swms_id IN (${SWMS})`);
  await run('sign_reads', `DELETE FROM sign_reads WHERE swms_id IN (${SWMS})`);
  await run('sign_translations', `DELETE FROM sign_translations WHERE swms_id IN (${SWMS})`);
  await run('swms_review_flags', `DELETE FROM swms_review_flags WHERE swms_id IN (${SWMS})`);
  await run('swms_revisions', `DELETE FROM swms_revisions WHERE swms_id IN (${SWMS})`);
  await run('swms_refs', `DELETE FROM swms_refs WHERE company_id = $1 OR swms_id IN (${SWMS})`);
  await run('swms', 'DELETE FROM swms WHERE company_id = $1');
  await run('sites', 'DELETE FROM sites WHERE company_id = $1');
  await run('ai_readings', 'DELETE FROM ai_readings WHERE company_id = $1');
  await run('events', 'DELETE FROM events WHERE company_id = $1');
  const code = businessCode(id);
  if (code) await run('industry_records', 'DELETE FROM industry_records WHERE business = $1', [code]);

  // The ABN stays, with no link to the account, so it cannot have a second free trial.
  await db.query("UPDATE trial_abns SET company_id = '' WHERE company_id = $1", [id]);
  await run('users', 'DELETE FROM users WHERE company_id = $1');
  await run('companies', 'DELETE FROM companies WHERE id = $1');

  await db.query('INSERT INTO admin_access_log (id, admin_email, action, target, created_at) VALUES ($1, $2, $3, $4, $5)',
    [crypto.randomUUID(), String(adminEmail || ''), 'business_deleted', id, now]);
  return { id, deletedAt: now, removed, stripeCustomer: company.stripe_customer_id || '' };
}

function monthsBefore(date, months) {
  const out = new Date(date);
  out.setMonth(out.getMonth() - months);
  return out;
}

// Businesses whose subscription ended, or whose free trial ended without one, more than 12
// months ago, oldest first, with the date. A subscription that ended before SiteReady kept its end
// date takes the day the cancellation was counted; with neither, it is listed with no date.
async function dueForRemoval(now = new Date()) {
  const cutoff = monthsBefore(now, RETENTION_MONTHS);
  const companies = await db.query("SELECT id, name, abn, plan_status, trial_ends_at, plan_ended_at, created_at FROM companies WHERE plan_status IN ('trial', 'canceled', 'incomplete_expired')");
  const cancelled = new Map((await db.query("SELECT company_id, MAX(created_at) AS at FROM events WHERE type = 'plan_canceled' AND company_id IS NOT NULL GROUP BY company_id"))
    .map((row) => [row.company_id, row.at]));
  const seen = new Map((await db.query('SELECT company_id, MAX(last_seen_at) AS at FROM users GROUP BY company_id')).map((row) => [row.company_id, row.at]));
  const out = [];
  for (const company of companies) {
    const trial = company.plan_status === 'trial';
    const ended = trial ? company.trial_ends_at : (company.plan_ended_at || cancelled.get(company.id) || null);
    if (ended && new Date(ended) >= cutoff) continue;
    out.push({
      id: company.id, name: company.name || '', abn: company.abn || '',
      reason: trial ? 'Free trial ended' : 'Subscription ended',
      endedAt: ended ? new Date(ended) : null,
      lastSeenAt: seen.get(company.id) || null,
    });
  }
  return out.sort((a, b) => (a.endedAt ? a.endedAt.getTime() : 0) - (b.endedAt ? b.endedAt.getTime() : 0));
}

module.exports = { deleteBusiness, dueForRemoval, confirmWord, RETENTION_MONTHS };
