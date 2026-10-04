// Accounts, sites, saved SWMS and worker sign-ons are kept in Postgres.
// DATABASE_URL points at the database (Railway sets it when a Postgres service
// is added). Without it the app still drafts, but signing in is switched off.
const { Pool } = require('pg');

let pool = null;

function connect() {
  if (pool || !process.env.DATABASE_URL) return pool;
  const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL || 5),
    ssl: local || process.env.DATABASE_SSL === 'off' ? false : { rejectUnauthorized: false },
  });
  return pool;
}

// Tests pass in an in-memory database with the same interface.
function useDatabase(next) {
  pool = next;
}

function enabled() {
  return Boolean(connect());
}

async function query(text, params = []) {
  const db = connect();
  if (!db) throw Object.assign(new Error('Accounts are not set up on this server.'), { status: 503, publicMessage: true });
  const result = await db.query(text, params);
  return result.rows;
}

async function one(text, params = []) {
  return (await query(text, params))[0] || null;
}

// Each statement is safe to run again, so the schema is brought up to date on start.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    abn TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    logo TEXT NOT NULL DEFAULT '',
    trial_ends_at TIMESTAMPTZ NOT NULL,
    plan_status TEXT NOT NULL DEFAULT 'trial',
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    created_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS login_tokens (
    token_hash TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    company_id TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS passkeys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    public_key TEXT NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0,
    transports TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS challenges (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    challenge TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sites (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    name TEXT NOT NULL,
    details JSONB NOT NULL,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS swms (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    site_id TEXT,
    title TEXT NOT NULL,
    input JSONB NOT NULL,
    reviewed_by TEXT NOT NULL,
    created_by TEXT NOT NULL,
    signon_token TEXT NOT NULL UNIQUE,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    last_reviewed_at TIMESTAMPTZ NOT NULL,
    review_due_at TIMESTAMPTZ NOT NULL,
    reminder_sent_at TIMESTAMPTZ
  )`,
  // Industry data (terms section 8): de-identified, not linked to any account.
  `CREATE TABLE IF NOT EXISTS industry_records (
    id TEXT PRIMARY KEY,
    month TEXT NOT NULL,
    state TEXT NOT NULL,
    postcode_area TEXT NOT NULL DEFAULT '',
    trade TEXT NOT NULL DEFAULT '',
    project_type TEXT NOT NULL DEFAULT '',
    steps TEXT NOT NULL DEFAULT '[]',
    kinds TEXT NOT NULL DEFAULT '[]',
    high_risk TEXT NOT NULL DEFAULT '[]',
    plant TEXT NOT NULL DEFAULT '[]',
    licences TEXT NOT NULL DEFAULT '[]',
    business TEXT NOT NULL,
    dedupe TEXT NOT NULL UNIQUE
  )`,
  // Every downloaded SWMS gets a reference printed in its footer, so a SWMS can be traced to the account that made it.
  `CREATE TABLE IF NOT EXISTS swms_refs (
    ref TEXT PRIMARY KEY,
    company_id TEXT,
    company_name TEXT NOT NULL DEFAULT '',
    abn TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL
  )`,
  // Added later: the job's state and postcode (never the full address), so the owner can see
  // where an account's SWMS are for. Older references keep them blank.
  "ALTER TABLE swms_refs ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE swms_refs ADD COLUMN IF NOT EXISTS postcode TEXT NOT NULL DEFAULT ''",
  'CREATE INDEX IF NOT EXISTS swms_refs_company ON swms_refs (company_id, created_at)',
  // Each ABN gets one free trial. Kept apart from companies so deleting an account does not reset it.
  `CREATE TABLE IF NOT EXISTS trial_abns (
    abn TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS signins (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    network TEXT NOT NULL DEFAULT '',
    device TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    company_id TEXT,
    type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS events_company ON events (company_id, created_at)',
  // Each time the owner looks up a reference, opens an account or searches accounts.
  `CREATE TABLE IF NOT EXISTS admin_access_log (
    id TEXT PRIMARY KEY,
    admin_email TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS errors (
    id TEXT PRIMARY KEY,
    route TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS signons (
    id TEXT PRIMARY KEY,
    swms_id TEXT NOT NULL REFERENCES swms(id),
    worker_name TEXT NOT NULL,
    worker_company TEXT NOT NULL DEFAULT '',
    signature TEXT NOT NULL,
    signed_at TIMESTAMPTZ NOT NULL
  )`,
];

async function migrate() {
  for (const statement of SCHEMA) await query(statement);
  // Added after launch: the person who created each company is its administrator.
  const columns = await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_admin'");
  if (!columns.length) await query('ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE');
  const withAdmin = new Set((await query('SELECT company_id FROM users WHERE is_admin = TRUE')).map((row) => row.company_id));
  const companies = new Set((await query('SELECT company_id FROM users')).map((row) => row.company_id));
  for (const companyId of [...companies].filter((id) => !withAdmin.has(id))) {
    const first = await one('SELECT id FROM users WHERE company_id = $1 ORDER BY created_at LIMIT 1', [companyId]);
    await query('UPDATE users SET is_admin = TRUE WHERE id = $1', [first.id]);
  }
  // A business that asked to be left out of industry data (terms section 8).
  const optOut = await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'industry_opt_out'");
  if (!optOut.length) await query('ALTER TABLE companies ADD COLUMN industry_opt_out BOOLEAN NOT NULL DEFAULT FALSE');
  const postcode = await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'industry_records' AND column_name = 'postcode'");
  if (!postcode.length) await query("ALTER TABLE industry_records ADD COLUMN postcode TEXT NOT NULL DEFAULT ''");
  const controls = await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'industry_records' AND column_name = 'controls'");
  if (!controls.length) await query("ALTER TABLE industry_records ADD COLUMN controls TEXT NOT NULL DEFAULT '{}'");
  // ABNs entered before the one-trial rule are registered to the first company that used each.
  const registered = new Set((await query('SELECT abn FROM trial_abns')).map((row) => row.abn));
  for (const row of await query("SELECT id, abn FROM companies WHERE abn <> '' ORDER BY created_at")) {
    const abn = String(row.abn).replace(/\D/g, '');
    if (abn.length !== 11 || registered.has(abn)) continue;
    registered.add(abn);
    await query('INSERT INTO trial_abns (abn, company_id, created_at) VALUES ($1, $2, $3)', [abn, row.id, new Date()]);
  }
}

module.exports = { connect, useDatabase, enabled, query, one, migrate };
