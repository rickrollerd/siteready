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
  // A connection the database drops while idle (a restart or an outage) is reported here.
  // Without a listener it stopped the server process; the next query opens a new connection.
  pool.on('error', (error) => console.warn(`Database connection lost: ${error.message}`));
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
  // Added later: each SWMS carries a revision number, as builder review checklists expect.
  // A new SWMS or a copy is revision 1; each saved change adds one. Older SWMS start at 1.
  'ALTER TABLE swms ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1',
  'ALTER TABLE swms ADD COLUMN IF NOT EXISTS revised_at TIMESTAMPTZ',
  'UPDATE swms SET revised_at = created_at WHERE revised_at IS NULL',
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
  // Proof of reading (task #92): how each worker read the SWMS before signing on. Kept for
  // SiteWrite's own learning only: never shown to the business or put in the industry data.
  "ALTER TABLE signons ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT ''",
  'ALTER TABLE signons ADD COLUMN IF NOT EXISTS read_seconds INTEGER',
  'ALTER TABLE signons ADD COLUMN IF NOT EXISTS sections_viewed INTEGER',
  'ALTER TABLE signons ADD COLUMN IF NOT EXISTS sections_total INTEGER',
  'ALTER TABLE signons ADD COLUMN IF NOT EXISTS section_seconds TEXT',
  'ALTER TABLE signons ADD COLUMN IF NOT EXISTS check_attempts INTEGER',
  "ALTER TABLE signons ADD COLUMN IF NOT EXISTS explained_by TEXT NOT NULL DEFAULT ''",
  // The revision the worker signed. Sign-ons from before revisions were kept have none.
  'ALTER TABLE signons ADD COLUMN IF NOT EXISTS revision INTEGER',
  // A random key the worker's phone makes for one sign-on, so a sign-on sent again after a lost
  // answer (no signal) is not saved twice (goal 7).
  'ALTER TABLE signons ADD COLUMN IF NOT EXISTS client_key TEXT',
  // Each time a worker opens the sign-on page: the server's own start time for the read.
  `CREATE TABLE IF NOT EXISTS sign_reads (
    id TEXT PRIMARY KEY,
    swms_id TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    used_at TIMESTAMPTZ
  )`,
  // When the last wrong answer was given, for the wait before the next try.
  'ALTER TABLE sign_reads ADD COLUMN IF NOT EXISTS wrong_at TIMESTAMPTZ',
  // A SWMS translated once per language, kept against a fingerprint of its English.
  `CREATE TABLE IF NOT EXISTS sign_translations (
    id TEXT PRIMARY KEY,
    swms_id TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    language TEXT NOT NULL,
    translation TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    usage TEXT,
    created_at TIMESTAMPTZ NOT NULL
  )`,
  // The main app's draft translated for the contractor to read (task #94), kept against a
  // fingerprint of its English and the language. Nothing ties it to an account.
  `CREATE TABLE IF NOT EXISTS draft_translations (
    id TEXT PRIMARY KEY,
    content_hash TEXT NOT NULL,
    language TEXT NOT NULL,
    translation TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    usage TEXT,
    created_at TIMESTAMPTZ NOT NULL
  )`,
  // Changes users make to the controls (task #102), de-identified: the step, the line and the
  // new line, state, trade and month only. Written only when CONTROL_LEARNING is on.
  `CREATE TABLE IF NOT EXISTS control_edits (
    id TEXT PRIMARY KEY,
    month TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT '',
    trade TEXT NOT NULL DEFAULT '',
    step TEXT NOT NULL,
    kind TEXT NOT NULL,
    original TEXT NOT NULL DEFAULT '',
    new_line TEXT NOT NULL DEFAULT '',
    uses INTEGER NOT NULL DEFAULT 1
  )`,
  // The AI's reading of a scope, kept against the company and the document's fingerprint
  // (never the document itself), with its check against the brief and what it cost.
  `CREATE TABLE IF NOT EXISTS ai_readings (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    doc_hash TEXT NOT NULL,
    brief_version TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    characters INTEGER NOT NULL DEFAULT 0,
    reading TEXT,
    checks TEXT,
    usage TEXT,
    cost_usd NUMERIC NOT NULL DEFAULT 0,
    error TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ
  )`,
  'CREATE INDEX IF NOT EXISTS ai_readings_doc ON ai_readings (company_id, doc_hash, brief_version)',
  // Added later: which of the reading's two calls is running, and since when, for the progress bar
  // (public/read-progress.js): 'reading' (the document) then 'steps' (matching the job steps).
  "ALTER TABLE ai_readings ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT ''",
  'ALTER TABLE ai_readings ADD COLUMN IF NOT EXISTS stage_at TIMESTAMPTZ',
  // Each saved revision of a SWMS as it printed (owner decision, 6 October 2026): its input, the
  // finished draft, a fingerprint of its content, the library version, its reference, and who
  // saved it and why. Downloads and sign-on of a revision read this, never today's library.
  `CREATE TABLE IF NOT EXISTS swms_revisions (
    id TEXT PRIMARY KEY,
    swms_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    input JSONB NOT NULL,
    draft JSONB NOT NULL,
    content_hash TEXT NOT NULL,
    library_version TEXT NOT NULL DEFAULT '',
    ref TEXT NOT NULL DEFAULT '',
    edited_by TEXT NOT NULL DEFAULT '',
    edited_name TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    confirmation JSONB,
    created_at TIMESTAMPTZ NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS swms_revisions_swms ON swms_revisions (swms_id, revision)',
  // Added later: a reference is tied to the saved SWMS and revision it was printed for, with a
  // fingerprint of what it printed. References from before, and stood-down drafts, have none.
  'ALTER TABLE swms_refs ADD COLUMN IF NOT EXISTS swms_id TEXT',
  'ALTER TABLE swms_refs ADD COLUMN IF NOT EXISTS revision INTEGER',
  'ALTER TABLE swms_refs ADD COLUMN IF NOT EXISTS content_hash TEXT',
  // What users change in their SWMS, once for each saved revision (owner decisions, 6 October
  // 2026): the step, the kind of change and how it came out, SiteWrite's line, the user's words
  // with personal details taken out, any warning and reason, and whether the change was kept in
  // the next revision. The SWMS is known only by a keyed fingerprint. Written only when
  // CONTROL_LEARNING is on; kept 3 years. Replaces the counted control_edits rows.
  `CREATE TABLE IF NOT EXISTS control_edit_events (
    id TEXT PRIMARY KEY,
    swms_key TEXT NOT NULL,
    revision INTEGER NOT NULL,
    month TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT '',
    trade TEXT NOT NULL DEFAULT '',
    kinds TEXT NOT NULL DEFAULT '[]',
    high_risk TEXT NOT NULL DEFAULT '[]',
    step TEXT NOT NULL,
    kind TEXT NOT NULL,
    outcome TEXT NOT NULL,
    original TEXT NOT NULL DEFAULT '',
    new_line TEXT NOT NULL DEFAULT '',
    warning TEXT NOT NULL DEFAULT '',
    legal TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    edit_key TEXT NOT NULL,
    kept BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS control_edit_events_swms ON control_edit_events (swms_key, revision)',
  // Wrong answers to the check questions at worker sign-on (goal 11): the kind of question, the
  // step and item it tested, the wrong option chosen, the language, state, trade and month. No
  // worker, business, site, SWMS or read, and no time finer than the month. Written only when
  // CONTROL_LEARNING is on; kept 3 years.
  `CREATE TABLE IF NOT EXISTS check_question_misses (
    id TEXT PRIMARY KEY,
    month TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT '',
    trade TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL,
    step TEXT NOT NULL DEFAULT '',
    item TEXT NOT NULL DEFAULT '',
    chosen TEXT NOT NULL DEFAULT ''
  )`,
  // Job steps users write for work SiteWrite has no job steps for (owner, 11 October 2026), once for
  // each saved revision: the part of the task the step was written for, the step's name, hazards,
  // controls and Who, each with personal details taken out, and the state, trade and month. The
  // SWMS is known only by a keyed fingerprint. Written only when CONTROL_LEARNING is on; kept 3 years.
  `CREATE TABLE IF NOT EXISTS own_step_events (
    id TEXT PRIMARY KEY,
    swms_key TEXT NOT NULL,
    revision INTEGER NOT NULL,
    month TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT '',
    trade TEXT NOT NULL DEFAULT '',
    part TEXT NOT NULL DEFAULT '',
    part_key TEXT NOT NULL DEFAULT '',
    step TEXT NOT NULL DEFAULT '',
    hazards TEXT NOT NULL DEFAULT '[]',
    controls TEXT NOT NULL DEFAULT '[]',
    who TEXT NOT NULL DEFAULT '',
    step_key TEXT NOT NULL,
    kept BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS own_step_events_swms ON own_step_events (swms_key, revision)',
  // D262: answers to the questions whose standard answers have blanks (designs, systems, supplier's
  // instructions), as each saved revision gives them: the question, the standard answer used (or ''
  // where the user wrote their own), and the answer with names, businesses and document or drawing
  // numbers taken out, the ratings (kPa, kN, masses, heights) kept. The SWMS is known only by a keyed
  // fingerprint. Written only when CONTROL_LEARNING is on; kept 3 years.
  `CREATE TABLE IF NOT EXISTS answer_events (
    id TEXT PRIMARY KEY,
    swms_key TEXT NOT NULL,
    revision INTEGER NOT NULL,
    month TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT '',
    trade TEXT NOT NULL DEFAULT '',
    question TEXT NOT NULL,
    standard TEXT NOT NULL DEFAULT '',
    answer TEXT NOT NULL DEFAULT '',
    answer_key TEXT NOT NULL,
    kept BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS answer_events_swms ON answer_events (swms_key, revision)',
  // Goal 10: each change to the library or the law released to customers (library-notices.json),
  // run once: when, how many saved SWMS it changed, and how many emails went out.
  `CREATE TABLE IF NOT EXISTS library_notices (
    id TEXT PRIMARY KEY,
    reason TEXT NOT NULL,
    released TEXT NOT NULL DEFAULT '',
    library_version TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ,
    swms_count INTEGER,
    companies INTEGER,
    emails INTEGER
  )`,
  // Each saved SWMS a released change would print differently, with the reason. It shows in My
  // SWMS until the SWMS is reviewed or saved as a new revision.
  `CREATE TABLE IF NOT EXISTS swms_review_flags (
    swms_id TEXT NOT NULL,
    notice_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    reason TEXT NOT NULL,
    changes INTEGER NOT NULL DEFAULT 0,
    flagged_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (swms_id, notice_id)
  )`,
  // Files of the designs a SWMS relies on (owner, 11 October 2026; design-files.js): the business that
  // uploaded each, its name, type (read from its content), size and fingerprint, and where it is
  // stored (the storage bucket, or design_file_data without one).
  `CREATE TABLE IF NOT EXISTS design_files (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    storage TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS design_files_company ON design_files (company_id)',
  // A design file's content when there is no storage bucket (tests and local runs).
  `CREATE TABLE IF NOT EXISTS design_file_data (
    file_id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  )`,
  // Each saved SWMS revision that names a design file, so the file is kept as long as one does.
  `CREATE TABLE IF NOT EXISTS design_file_uses (
    file_id TEXT NOT NULL,
    swms_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (file_id, swms_id, revision)
  )`,
  // When a business's subscription ended, as Stripe reports it, so the owner can see which
  // businesses stopped paying more than 12 months ago (privacy policy, "How long we keep it").
  'ALTER TABLE companies ADD COLUMN IF NOT EXISTS plan_ended_at TIMESTAMPTZ',
  // SWMS checked with the builder check, kept to improve the library (owner, 11 October 2026;
  // checked-swms.js). Written only when KEEP_CHECKED_SWMS is on. One row for each document, found
  // again by its content fingerprint: its file name and type, where its original is stored, the text
  // read from it with worker sign-ons taken out, the check result and score, state, trade and month.
  // The original keeps its names and is for the owner only. Kept 3 years unless set otherwise.
  `CREATE TABLE IF NOT EXISTS checked_swms (
    id TEXT PRIMARY KEY,
    content_hash TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL,
    file_name TEXT NOT NULL DEFAULT '',
    file_type TEXT NOT NULL DEFAULT '',
    file_bytes INTEGER NOT NULL DEFAULT 0,
    storage TEXT NOT NULL,
    storage_note TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL DEFAULT '',
    result TEXT NOT NULL DEFAULT '{}',
    score INTEGER,
    band TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT '',
    trade TEXT NOT NULL DEFAULT '',
    month TEXT NOT NULL,
    checks INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL,
    last_checked_at TIMESTAMPTZ NOT NULL
  )`,
  // Who uploaded each kept SWMS (the account and the person), apart from the document, so a
  // business's documents go when the business is deleted. One document checked by two businesses
  // has two rows and goes when neither is left.
  `CREATE TABLE IF NOT EXISTS checked_swms_uploaders (
    swms_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    user_id TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (swms_id, company_id)
  )`,
  // The original file of a kept SWMS (or the pasted text), when there is no storage bucket.
  `CREATE TABLE IF NOT EXISTS checked_swms_files (
    swms_id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  )`,
  // The learning copy of a kept SWMS: its text with names, phone numbers, emails, ABNs and addresses
  // taken out, and its organisation only as a keyed fingerprint (never a name).
  `CREATE TABLE IF NOT EXISTS checked_swms_learning (
    swms_id TEXT PRIMARY KEY,
    month TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT '',
    trade TEXT NOT NULL DEFAULT '',
    org_key TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL
  )`,
  // Each job step, hazard and control of a kept SWMS as a line, de-identified as above, with the
  // library step it is most like and whether the library already has the line.
  `CREATE TABLE IF NOT EXISTS checked_swms_lines (
    id TEXT PRIMARY KEY,
    swms_id TEXT NOT NULL,
    month TEXT NOT NULL,
    org_key TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL,
    step TEXT NOT NULL DEFAULT '',
    line TEXT NOT NULL DEFAULT '',
    line_key TEXT NOT NULL DEFAULT '',
    library_step TEXT NOT NULL DEFAULT '',
    likeness REAL NOT NULL DEFAULT 0,
    in_library BOOLEAN NOT NULL DEFAULT FALSE
  )`,
  'CREATE INDEX IF NOT EXISTS checked_swms_lines_swms ON checked_swms_lines (swms_id)',
  // The principal contractor's reviewer (goal 3). A reviewer proves an email address with a
  // sign-in link of its own kind ("reviewer"), and has no company, no trial and no payment.
  // A reviewer's link and session are kept apart from account ones, so one never works as the other.
  "ALTER TABLE login_tokens ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT ''",
  `CREATE TABLE IF NOT EXISTS reviewers (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    company TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS reviewer_sessions (
    token_hash TEXT PRIMARY KEY,
    reviewer_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
  )`,
  // Each response a reviewer returns, against the saved revision it was given for, with the
  // reviewer's name, company and email as they gave them, and the builder check's result on that
  // revision when the response was given. A later revision starts unreviewed.
  `CREATE TABLE IF NOT EXISTS swms_reviews (
    id TEXT PRIMARY KEY,
    swms_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    ref TEXT NOT NULL DEFAULT '',
    reviewer_id TEXT NOT NULL,
    reviewer_email TEXT NOT NULL,
    reviewer_name TEXT NOT NULL,
    reviewer_company TEXT NOT NULL,
    response TEXT NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    check_score INTEGER,
    check_band TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS swms_reviews_swms ON swms_reviews (swms_id, revision)',
  // Each time a reviewer opens a SWMS, runs the check on it, opens a file or responds, kept like
  // the owner's access log. Kept 2 years.
  `CREATE TABLE IF NOT EXISTS review_access_log (
    id TEXT PRIMARY KEY,
    reviewer_email TEXT NOT NULL,
    action TEXT NOT NULL,
    ref TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL
  )`,
  // Reviewers' conditions and changes needed, de-identified, for goal 11's library updates (not
  // built yet): the response, the text with personal details taken out, the builder check's result,
  // state, trade, kinds of work, high risk work and month. The SWMS is known only by a keyed
  // fingerprint. Written only when CONTROL_LEARNING is on; kept 3 years.
  `CREATE TABLE IF NOT EXISTS review_learning (
    id TEXT PRIMARY KEY,
    swms_key TEXT NOT NULL,
    revision INTEGER NOT NULL,
    month TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT '',
    trade TEXT NOT NULL DEFAULT '',
    kinds TEXT NOT NULL DEFAULT '[]',
    high_risk TEXT NOT NULL DEFAULT '[]',
    response TEXT NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    check_score INTEGER,
    check_band TEXT NOT NULL DEFAULT '',
    check_failed TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL
  )`,
  // Goal 12 stage 3: the main contractor's HSE lead and team, on free reviewer sign-ins (no company,
  // no trial). A reviewer gives a position and phone as well as a name.
  "ALTER TABLE reviewers ADD COLUMN IF NOT EXISTS position TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE reviewers ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT ''",
  // The main contractor's account. Its name is the one contractors see on the details it sets.
  `CREATE TABLE IF NOT EXISTS orgs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    abn TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL
  )`,
  // The people in it: one lead, who adds and removes people, and members. An invited person is a row
  // with an email and no reviewer until they sign in with that email.
  `CREATE TABLE IF NOT EXISTS org_members (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    email TEXT NOT NULL,
    reviewer_id TEXT,
    role TEXT NOT NULL,
    invited_by TEXT NOT NULL DEFAULT '',
    invited_at TIMESTAMPTZ NOT NULL,
    joined_at TIMESTAMPTZ
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS org_members_email ON org_members (org_id, email)',
  'CREATE INDEX IF NOT EXISTS org_members_reviewer ON org_members (reviewer_id)',
  // D303: there is never more than one lead in an account. lead_of holds the account's id on the
  // lead's row and is empty on everyone else's, so the unique index allows one lead for each account.
  // Handing over (hse.js) empties the old lead's before setting the new lead's, in one transaction.
  'ALTER TABLE org_members ADD COLUMN IF NOT EXISTS lead_of TEXT',
  "UPDATE org_members SET lead_of = org_id WHERE role = 'lead' AND lead_of IS NULL",
  'CREATE UNIQUE INDEX IF NOT EXISTS org_members_one_lead ON org_members (lead_of)',
  // D303: an account is unverified until its ABN matches the ABN register. abn_check is the last
  // answer: verified, name (the register lists another name), cancelled, missing (not on the
  // register) or unavailable (the register was not checked). abn_names keeps the names the register
  // gave (legal name, then business names), so a rename can be checked while the register is down.
  'ALTER TABLE orgs ADD COLUMN IF NOT EXISTS abn_verified_at TIMESTAMPTZ',
  "ALTER TABLE orgs ADD COLUMN IF NOT EXISTS abn_check TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE orgs ADD COLUMN IF NOT EXISTS abn_names TEXT NOT NULL DEFAULT '[]'",
  'ALTER TABLE orgs ADD COLUMN IF NOT EXISTS abn_checked_at TIMESTAMPTZ',
  // One account for each ABN: a second account with the same ABN is asked to join the first.
  "CREATE UNIQUE INDEX IF NOT EXISTS orgs_abn ON orgs (abn) WHERE abn <> ''",
  // A project of the main contractor's. log_token makes the project's log email address (stage 10).
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    name TEXT NOT NULL,
    workplace TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT '',
    postcode TEXT NOT NULL DEFAULT '',
    pc_name TEXT NOT NULL DEFAULT '',
    log_token TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ
  )`,
  'CREATE INDEX IF NOT EXISTS projects_org ON projects (org_id)',
  // The site details the main contractor sets for every contractor on the project. Each change is a
  // new version (rev counts up from 1), so a SWMS and the log can name the version it used.
  `CREATE TABLE IF NOT EXISTS project_site_details (
    project_id TEXT NOT NULL,
    rev INTEGER NOT NULL,
    details JSONB NOT NULL,
    set_by TEXT NOT NULL,
    set_by_name TEXT NOT NULL DEFAULT '',
    set_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (project_id, rev)
  )`,
  // Goal 12 stage 4: a scope read on a main contractor's project is kept against the account (org_id)
  // and the project it was read for, never a company (company_id is ''). The project's readings count
  // toward its free readings (D302).
  "ALTER TABLE ai_readings ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE ai_readings ADD COLUMN IF NOT EXISTS project_id TEXT NOT NULL DEFAULT ''",
  'CREATE INDEX IF NOT EXISTS ai_readings_org_doc ON ai_readings (org_id, doc_hash, brief_version)',
  'CREATE INDEX IF NOT EXISTS ai_readings_project ON ai_readings (project_id)',
  // A subcontract on a project: the company's name as typed, its trade, a contact email (sending is
  // stage 5) and the reading of its scope. list_reading_id is the reading its SWMS list was made from;
  // list_rev counts each change to the list. A removed subcontract keeps its row (removed_at).
  `CREATE TABLE IF NOT EXISTS subcontracts (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    trade TEXT NOT NULL DEFAULT '',
    contact_email TEXT NOT NULL DEFAULT '',
    abn TEXT NOT NULL DEFAULT '',
    company_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    reading_id TEXT NOT NULL DEFAULT '',
    doc_name TEXT NOT NULL DEFAULT '',
    doc_hash TEXT NOT NULL DEFAULT '',
    scope_at TIMESTAMPTZ,
    scope_by_name TEXT NOT NULL DEFAULT '',
    list_reading_id TEXT NOT NULL DEFAULT '',
    list_rev INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    removed_at TIMESTAMPTZ
  )`,
  'CREATE INDEX IF NOT EXISTS subcontracts_project ON subcontracts (project_id)',
  // A scope whose title names another trade than the subcontract's (messy round 6), said on its page.
  "ALTER TABLE subcontracts ADD COLUMN IF NOT EXISTS trade_warning TEXT NOT NULL DEFAULT ''",
  // The SWMS a subcontract needs, in the shape the one-go page opens (scope-choice.js projectItems),
  // with prices taken out (handover.js). source is 'reading' or 'added'. A removed SWMS keeps its row
  // (removed_at), so the lead can put it back; removed_why says why one started removed.
  `CREATE TABLE IF NOT EXISTS required_swms (
    id TEXT PRIMARY KEY,
    subcontract_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    package TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    task TEXT NOT NULL DEFAULT '',
    item JSONB NOT NULL,
    source TEXT NOT NULL,
    removed_at TIMESTAMPTZ,
    removed_why TEXT NOT NULL DEFAULT '',
    task_changed BOOLEAN NOT NULL DEFAULT FALSE,
    list_rev INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS required_swms_subcontract ON required_swms (subcontract_id, position)',
  // The reading's points to confirm with the main contractor (D302, K12): the lead may answer them, and
  // only answered ones go to the subcontractor.
  `CREATE TABLE IF NOT EXISTS subcontract_points (
    id TEXT PRIMARY KEY,
    subcontract_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    activity TEXT NOT NULL DEFAULT '',
    clause TEXT NOT NULL DEFAULT '',
    question TEXT NOT NULL,
    answer TEXT NOT NULL DEFAULT '',
    answered_by TEXT NOT NULL DEFAULT '',
    answered_by_name TEXT NOT NULL DEFAULT '',
    answered_at TIMESTAMPTZ
  )`,
  'CREATE INDEX IF NOT EXISTS subcontract_points_subcontract ON subcontract_points (subcontract_id, position)',
  // A SiteLink project's log (messy round 6): subcontracts added, scopes read, list changes and
  // invitations, with who and when. An entry with no project (an invitation) shows on every project of
  // the account. The site details versions are logged from their own table.
  `CREATE TABLE IF NOT EXISTS project_events (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    project_id TEXT NOT NULL DEFAULT '',
    who TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS project_events_org ON project_events (org_id, created_at)',
  // Someone refused a second account for an ABN already on SiteLink asked SiteLink to tell that
  // account's lead (D307, stage 3 decision 4): who asked which account, and when, so the lead is not
  // asked again and again.
  `CREATE TABLE IF NOT EXISTS lead_asks (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    reviewer_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS lead_asks_org ON lead_asks (org_id, created_at)',
  // The HSE lead's changes to a SWMS list, kept to improve how SiteWrite reads scopes (Goal 12): the
  // month, state, brief version, the package's name and wording with names taken out, the kind of
  // change, and the reading by a keyed fingerprint. No project, account, subcontract or person.
  // Written only when CONTROL_LEARNING is on; kept 3 years.
  `CREATE TABLE IF NOT EXISTS list_edit_events (
    id TEXT PRIMARY KEY,
    month TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT '',
    brief_version TEXT NOT NULL DEFAULT '',
    package TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL,
    wording TEXT NOT NULL DEFAULT '',
    original TEXT NOT NULL DEFAULT '',
    reading_key TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL
  )`,
  // Goal 12 stage 5: sending the list. The submission due date the lead sets (YYYY-MM-DD), when the
  // list was first sent and first opened, and the company that claimed it in SiteWrite (D308): its id
  // and the user who claimed, and its name and ABN as they were then, which the main contractor sees.
  // The ABN the lead may enter for the subcontract is in abn (above).
  "ALTER TABLE subcontracts ADD COLUMN IF NOT EXISTS due_date TEXT NOT NULL DEFAULT ''",
  'ALTER TABLE subcontracts ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ',
  'ALTER TABLE subcontracts ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ',
  'ALTER TABLE subcontracts ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ',
  "ALTER TABLE subcontracts ADD COLUMN IF NOT EXISTS claimed_by TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE subcontracts ADD COLUMN IF NOT EXISTS claimed_name TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE subcontracts ADD COLUMN IF NOT EXISTS claimed_abn TEXT NOT NULL DEFAULT ''",
  // Each list email sent carries a link of its own: one for each subcontract and list version. Only the
  // hashes of the link's token and of its "stop these emails" token are kept. items is the list as
  // it was sent (titles and work), so a later email can say what changed. A link sent to an address
  // the lead has since corrected is revoked.
  `CREATE TABLE IF NOT EXISTS list_links (
    id TEXT PRIMARY KEY,
    subcontract_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    org_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    stop_hash TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    kind TEXT NOT NULL,
    list_rev INTEGER NOT NULL,
    due_date TEXT NOT NULL DEFAULT '',
    items JSONB NOT NULL,
    sent_by TEXT NOT NULL DEFAULT '',
    sent_by_name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL,
    opened_at TIMESTAMPTZ,
    last_opened_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
  )`,
  'CREATE INDEX IF NOT EXISTS list_links_subcontract ON list_links (subcontract_id, created_at)',
  // Every email SiteLink sends about a project, with the template and its version, so it is known
  // which wording went out. The body is kept with the link's token taken out.
  `CREATE TABLE IF NOT EXISTS mail_messages (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    subcontract_id TEXT NOT NULL DEFAULT '',
    link_id TEXT NOT NULL DEFAULT '',
    template TEXT NOT NULL,
    template_version INTEGER NOT NULL,
    recipient TEXT NOT NULL,
    from_name TEXT NOT NULL DEFAULT '',
    reply_to TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT '',
    provider_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS mail_messages_subcontract ON mail_messages (subcontract_id, created_at)',
  // An address that asked for no more list emails from one main contractor's account ("stop these
  // emails"). SiteLink sends it nothing more from that account until it asks to start them again.
  `CREATE TABLE IF NOT EXISTS mail_stops (
    org_id TEXT NOT NULL,
    email TEXT NOT NULL,
    stopped_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (org_id, email)
  )`,
  // A SWMS the subcontractor already has, uploaded from the list page for one SWMS on the list (PDF or
  // Word). The file is in the storage bucket, or in list_upload_data without one (design-files.js).
  `CREATE TABLE IF NOT EXISTS list_uploads (
    id TEXT PRIMARY KEY,
    subcontract_id TEXT NOT NULL,
    required_swms_id TEXT NOT NULL,
    link_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    storage TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    removed_at TIMESTAMPTZ
  )`,
  'CREATE INDEX IF NOT EXISTS list_uploads_subcontract ON list_uploads (subcontract_id, created_at)',
  `CREATE TABLE IF NOT EXISTS list_upload_data (
    upload_id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  )`,
  // The project's log both sides see (plan section B), from stage 5: lists sent, reminders, a list's
  // link opened, uploads and claims. subcontract_id is empty for an entry about the whole project.
  `CREATE TABLE IF NOT EXISTS project_log (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    subcontract_id TEXT NOT NULL DEFAULT '',
    required_swms_id TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL,
    actor_kind TEXT NOT NULL,
    actor_name TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL,
    ref_ids JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS project_log_project ON project_log (project_id, created_at)',
  // D283: a sign-up that came from a builder's list is tagged with where it came from
  // ('project-invite:{projectId}'), so sign-ups from the review loop can be counted.
  "ALTER TABLE login_tokens ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE companies ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT ''",
  // Goal 12 stage 6: the subcontractor's work on a list it took up, kept on the server so the office can
  // start on a desktop and the foreman finish on a phone. One row for each list and company: the
  // project page as the company left it (body), the builder's details as it last saw them (seen), the
  // builder's details it changed (overrides), and a version that counts up with each save, so a save
  // from a device that is behind is refused. The company's own details are never kept here; they come
  // from its profile. Only that company reads it: the main contractor never does (submission is
  // stage 7).
  `CREATE TABLE IF NOT EXISTS sub_progress (
    subcontract_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    body JSONB NOT NULL,
    seen JSONB NOT NULL,
    overrides JSONB NOT NULL,
    version INTEGER NOT NULL,
    updated_by TEXT NOT NULL DEFAULT '',
    updated_by_name TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (subcontract_id, company_id)
  )`,
  // A list the lead released from the company that took it up (D311: the wrong company, where no ABN
  // was given). The released company loses the list and cannot take it up again. The main
  // contractor's record: the company's name as it was, and no link to the company once it is deleted.
  `CREATE TABLE IF NOT EXISTS subcontract_releases (
    id TEXT PRIMARY KEY,
    subcontract_id TEXT NOT NULL,
    company_id TEXT NOT NULL DEFAULT '',
    company_name TEXT NOT NULL DEFAULT '',
    company_abn TEXT NOT NULL DEFAULT '',
    released_by TEXT NOT NULL DEFAULT '',
    released_by_name TEXT NOT NULL DEFAULT '',
    released_at TIMESTAMPTZ NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS subcontract_releases_subcontract ON subcontract_releases (subcontract_id)',
  'CREATE INDEX IF NOT EXISTS subcontracts_company ON subcontracts (company_id)',
  // Goal 12 stage 7: a SWMS submitted to the main contractor for one SWMS on its list. channel
  // 'sitewrite' is a saved revision the company submitted after its check: the revision is frozen, and
  // the check (check_info), SiteWrite's Builder check (builder_check) and the builder's details it
  // changed (overrides) are kept as they were on submission. channel 'outside' is a SWMS the main
  // contractor received another way and recorded against the list item, with its file. Only these
  // revisions are ever read by the main contractor: never a draft, and never a later revision until it
  // is submitted. company_id is cleared when the business is deleted; the record stays the builder's.
  `CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    subcontract_id TEXT NOT NULL,
    required_swms_id TEXT NOT NULL,
    company_id TEXT NOT NULL DEFAULT '',
    company_name TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL,
    swms_id TEXT NOT NULL DEFAULT '',
    revision INTEGER NOT NULL DEFAULT 0,
    ref TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    content_hash TEXT NOT NULL DEFAULT '',
    check_info JSONB,
    builder_check JSONB,
    overrides JSONB NOT NULL,
    file_name TEXT NOT NULL DEFAULT '',
    file_type TEXT NOT NULL DEFAULT '',
    file_size INTEGER NOT NULL DEFAULT 0,
    file_sha256 TEXT NOT NULL DEFAULT '',
    file_storage TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    check_status TEXT NOT NULL DEFAULT '',
    check_error TEXT NOT NULL DEFAULT '',
    check_reading_id TEXT NOT NULL DEFAULT '',
    submitted_by TEXT NOT NULL DEFAULT '',
    submitted_by_name TEXT NOT NULL DEFAULT '',
    submitted_at TIMESTAMPTZ NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS submissions_subcontract ON submissions (subcontract_id, submitted_at)',
  'CREATE INDEX IF NOT EXISTS submissions_swms ON submissions (swms_id, revision)',
  // The file of a SWMS received outside SiteWrite, where there is no storage bucket (design-files.js).
  `CREATE TABLE IF NOT EXISTS submission_file_data (
    submission_id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  )`,
  // A review given from the project screen names its project and submission. Reviews by reference
  // (stage 1) have neither.
  "ALTER TABLE swms_reviews ADD COLUMN IF NOT EXISTS project_id TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE swms_reviews ADD COLUMN IF NOT EXISTS submission_id TEXT NOT NULL DEFAULT ''",
  'CREATE INDEX IF NOT EXISTS swms_reviews_submission ON swms_reviews (submission_id)',
  // Each condition of an "Approved with conditions" review (K10 "C"): the subcontractor marks it done,
  // with an optional note, and the main contractor confirms it, or says it is not done yet. status is
  // 'outstanding', 'done' or 'closed'.
  `CREATE TABLE IF NOT EXISTS review_conditions (
    id TEXT PRIMARY KEY,
    review_id TEXT NOT NULL,
    submission_id TEXT NOT NULL,
    subcontract_id TEXT NOT NULL,
    required_swms_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    text TEXT NOT NULL,
    status TEXT NOT NULL,
    done_note TEXT NOT NULL DEFAULT '',
    done_by_name TEXT NOT NULL DEFAULT '',
    done_at TIMESTAMPTZ,
    closed_by_name TEXT NOT NULL DEFAULT '',
    closed_at TIMESTAMPTZ,
    back_note TEXT NOT NULL DEFAULT '',
    back_by_name TEXT NOT NULL DEFAULT '',
    back_at TIMESTAMPTZ
  )`,
  'CREATE INDEX IF NOT EXISTS review_conditions_subcontract ON review_conditions (subcontract_id)',
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

// Runs fn with a client of its own between BEGIN and COMMIT, and rolls back if fn throws. fn gets
// query and one, as above, bound to that client.
async function transaction(fn) {
  const pool = connect();
  if (!pool) throw Object.assign(new Error('Accounts are not set up on this server.'), { status: 503, publicMessage: true });
  const client = await pool.connect();
  const tx = {
    query: async (text, params = []) => (await client.query(text, params)).rows,
    one: async (text, params = []) => (await client.query(text, params)).rows[0] || null,
  };
  try {
    await client.query('BEGIN');
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { connect, useDatabase, enabled, query, one, migrate, transaction };
