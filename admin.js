// Numbers for the owner: sign-ups, trials, subscriptions, what people do, and
// recent errors. Only emails listed in ADMIN_EMAILS can see them.
// The owner can also trace a SWMS reference to its account, look at an account, and see
// warning signs of a login being shared or trials being repeated. Every look at a
// reference or an account, and every account search, is kept in an access log.
const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const { releasableFigures } = require('./industry');
const auth = require('./auth');
const removal = require('./business-removal');

const router = express.Router();
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function isAdmin(user) {
  const allowed = String(process.env.ADMIN_EMAILS || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  return Boolean(user && allowed.includes(user.email));
}

const DAY = 86400000;
const DOWNLOADS = ['download_word', 'download_pdf'];

function requireOwner(req) {
  if (!isAdmin(req.user)) throw auth.fail(403, 'Not available.');
}

// Kept before anything is shown, so a look that cannot be logged is not shown.
async function logAccess(req, action, target) {
  await db.query('INSERT INTO admin_access_log (id, admin_email, action, target, created_at) VALUES ($1, $2, $3, $4, $5)',
    [crypto.randomUUID(), req.user.email, action, String(target || '').slice(0, 200), new Date()]);
}

const accountLink = (id) => `/admin.html#account=${encodeURIComponent(id)}`;
const abnDigits = (abn) => String(abn || '').replace(/\D/g, '');
const domainOf = (email) => String(email || '').trim().toLowerCase().split('@')[1] || '';
// Months are counted in Queensland time, which has no daylight saving.
const monthOf = (date) => new Date(new Date(date).getTime() + 10 * 3600000).toISOString().slice(0, 7);

function planView(company) {
  const onTrial = company.plan_status === 'trial' && new Date(company.trial_ends_at) > new Date();
  return { status: company.plan_status, trialEndsAt: company.trial_ends_at, onTrial, hasAccess: auth.hasAccess(company) };
}

// One sign-in used on many devices or from many networks may be shared outside the company.
async function unusualSignins(since) {
  const signins = await db.query(`SELECT s.user_id, u.email, u.company_id, c.name AS company, s.network, s.device, s.created_at
    FROM signins s JOIN users u ON u.id = s.user_id LEFT JOIN companies c ON c.id = u.company_id WHERE s.created_at >= $1`, [since(30)]);
  const byUser = new Map();
  for (const row of signins) {
    const entry = byUser.get(row.user_id) || { email: row.email, companyId: row.company_id, company: row.company || '', devices: new Set(), networks7: new Set(), signins: 0, last: row.created_at };
    entry.devices.add(row.device);
    if (new Date(row.created_at) >= since(7)) entry.networks7.add(row.network);
    entry.signins += 1;
    if (new Date(row.created_at) > new Date(entry.last)) entry.last = row.created_at;
    byUser.set(row.user_id, entry);
  }
  return [...byUser.values()]
    .filter((entry) => entry.devices.size >= 4 || entry.networks7.size >= 4)
    .map((entry) => ({ email: entry.email, companyId: entry.companyId, company: entry.company, devices30: entry.devices.size, networks7: entry.networks7.size, signins30: entry.signins, last: entry.last }))
    .sort((a, b) => (b.devices30 + b.networks7) - (a.devices30 + a.networks7));
}

router.get('/admin/stats', auth.requireUser, route(async (req, res) => {
  requireOwner(req);
  const now = Date.now();
  const since = (days) => new Date(now - days * DAY);
  const companies = await db.query('SELECT plan_status, trial_ends_at, created_at FROM companies');
  const plans = { trial: 0, trialEnded: 0, active: 0, trialing: 0, past_due: 0, canceled: 0, other: 0 };
  for (const company of companies) {
    if (company.plan_status === 'trial') plans[new Date(company.trial_ends_at) > new Date() ? 'trial' : 'trialEnded'] += 1;
    else if (plans[company.plan_status] !== undefined) plans[company.plan_status] += 1;
    else plans.other += 1;
  }
  const count = async (days) => {
    const rows = await db.query('SELECT type, COUNT(*) AS n FROM events WHERE created_at >= $1 GROUP BY type', [since(days)]);
    return Object.fromEntries(rows.map((row) => [row.type, Number(row.n)]));
  };
  const errors = await db.query('SELECT route, message, created_at FROM errors ORDER BY created_at DESC LIMIT 25');
  const unusual = await unusualSignins(since);
  const price = Number(process.env.PRICE_MONTHLY || 49);
  res.json({
    companies: companies.length,
    newCompanies: { days7: companies.filter((c) => new Date(c.created_at) >= since(7)).length, days30: companies.filter((c) => new Date(c.created_at) >= since(30)).length },
    plans,
    monthlyRevenue: (plans.active + plans.past_due) * price,
    actions: { days7: await count(7), days30: await count(30) },
    errors,
    unusualSignins: unusual,
  });
}));

// Industry data records, for the owner to inspect (terms section 8). Nothing in them identifies a business.
router.get('/admin/industry', auth.requireUser, route(async (req, res) => {
  if (!isAdmin(req.user)) throw auth.fail(403, 'Not available.');
  const total = await db.one('SELECT COUNT(*) AS n FROM industry_records');
  const recent = await db.query('SELECT month, state, postcode, postcode_area, trade, project_type, steps, kinds, high_risk, plant, licences, controls FROM industry_records ORDER BY month DESC LIMIT 50');
  const parse = (value) => { try { return JSON.parse(value); } catch { return []; } };
  res.json({
    total: Number(total.n),
    records: recent.map((row) => ({ month: row.month, state: row.state, postcode: row.postcode, postcodeArea: row.postcode_area, trade: row.trade, projectType: row.project_type, steps: parse(row.steps), kinds: parse(row.kinds), highRisk: parse(row.high_risk), plant: parse(row.plant), licences: parse(row.licences), controls: (() => { try { return JSON.parse(row.controls); } catch { return {}; } })() })),
  });
}));

// Figures safe to release: every place shown counts at least 10 businesses.
router.get('/admin/industry/figures', auth.requireUser, route(async (req, res) => {
  if (!isAdmin(req.user)) throw auth.fail(403, 'Not available.');
  const { month, trade, projectType } = req.query || {};
  res.json(await releasableFigures({ month, trade, projectType }));
}));

// A business that emails to opt out is left out from that day (terms section 8). Found by ABN.
router.post('/admin/industry/opt-out', auth.requireUser, route(async (req, res) => {
  if (!isAdmin(req.user)) throw auth.fail(403, 'Not available.');
  const abn = String((req.body || {}).abn || '').replace(/\D/g, '');
  const optOut = (req.body || {}).optOut !== false;
  if (abn.length !== 11) throw auth.fail(400, 'Enter an 11 digit ABN.');
  const rows = (await db.query("SELECT id, name, abn FROM companies WHERE abn IS NOT NULL AND abn <> ''")).filter((row) => String(row.abn).replace(/\D/g, '') === abn);
  if (!rows.length) throw auth.fail(404, 'No business with that ABN.');
  for (const row of rows) await db.query('UPDATE companies SET industry_opt_out = $1 WHERE id = $2', [optOut, row.id]);
  res.json({ ok: true, businesses: rows.map((row) => row.name), optOut });
}));

// ---- Tracing a SWMS and looking at an account ----

// The reference printed in a SWMS footer, traced to the account that downloaded it.
router.get('/admin/refs/:ref', auth.requireUser, route(async (req, res) => {
  requireOwner(req);
  const ref = String(req.params.ref || '').trim().toUpperCase().slice(0, 40);
  await logAccess(req, 'ref_lookup', ref);
  const row = await db.one('SELECT ref, company_id, company_name, abn, title, state, postcode, created_at FROM swms_refs WHERE ref = $1', [ref]);
  if (!row) throw auth.fail(404, 'No SWMS has that reference.');
  const company = row.company_id ? await db.one('SELECT id, name, abn FROM companies WHERE id = $1', [row.company_id]) : null;
  res.json({
    ref: row.ref,
    companyId: row.company_id,
    // As printed on the SWMS. The account may have been renamed or deleted since.
    companyName: row.company_name,
    abn: row.abn,
    title: row.title,
    state: row.state || '',
    postcode: row.postcode || '',
    createdAt: row.created_at,
    accountExists: Boolean(company),
    currentName: company ? company.name : '',
    accountLink: company ? accountLink(company.id) : '',
  });
}));

// Accounts whose name, ABN or a user's email has the words searched. With no words, the newest.
router.get('/admin/companies', auth.requireUser, route(async (req, res) => {
  requireOwner(req);
  const q = String((req.query || {}).q || '').trim().toLowerCase().slice(0, 100);
  await logAccess(req, 'account_search', q);
  const companies = await db.query('SELECT id, name, abn, plan_status, trial_ends_at, created_at FROM companies');
  const users = await db.query('SELECT company_id, email FROM users');
  const emails = new Map();
  for (const user of users) emails.set(user.company_id, [...(emails.get(user.company_id) || []), String(user.email).toLowerCase()]);
  // An ABN can be searched with or without its spaces.
  const digits = q.replace(/\s/g, '');
  const matches = (company) => !q
    || String(company.name || '').toLowerCase().includes(q)
    || (/^\d{3,}$/.test(digits) && abnDigits(company.abn).includes(digits))
    || (emails.get(company.id) || []).some((email) => email.includes(q));
  const found = companies.filter(matches)
    .sort((a, b) => (q ? String(a.name).localeCompare(String(b.name)) : new Date(b.created_at) - new Date(a.created_at)))
    .slice(0, 50);
  const since = new Date(Date.now() - 30 * DAY);
  const downloads = new Map((await db.query(`SELECT company_id, COUNT(*) AS n FROM events WHERE created_at >= $1 AND type IN ('download_word', 'download_pdf') GROUP BY company_id`, [since]))
    .map((row) => [row.company_id, Number(row.n)]));
  const refs = new Map((await db.query('SELECT company_id, COUNT(*) AS n FROM swms_refs WHERE created_at >= $1 GROUP BY company_id', [since]))
    .map((row) => [row.company_id, Number(row.n)]));
  res.json({
    companies: found.map((company) => ({
      id: company.id,
      name: company.name,
      abn: company.abn,
      plan: planView(company),
      users: (emails.get(company.id) || []).length,
      downloads30: downloads.get(company.id) || 0,
      refs30: refs.get(company.id) || 0,
      accountLink: accountLink(company.id),
    })),
  });
}));

// One account: its people, plan, trial ABN, downloads by month, recent references and sign-ins.
router.get('/admin/companies/:id', auth.requireUser, route(async (req, res) => {
  requireOwner(req);
  const id = String(req.params.id || '').slice(0, 100);
  await logAccess(req, 'account_view', id);
  const company = await db.one('SELECT * FROM companies WHERE id = $1', [id]);
  if (!company) throw auth.fail(404, 'No account with that id.');
  const users = await db.query('SELECT id, email, name, is_admin, created_at, last_seen_at FROM users WHERE company_id = $1 ORDER BY created_at', [id]);
  const digits = abnDigits(company.abn);
  const holder = digits ? await db.one('SELECT t.abn, t.company_id, t.created_at, c.name FROM trial_abns t LEFT JOIN companies c ON c.id = t.company_id WHERE t.abn = $1', [digits]) : null;
  // The last 12 months, this one included, oldest first.
  const thisMonth = new Date(`${monthOf(new Date())}-01T00:00:00Z`);
  const months = [];
  for (let back = 11; back >= 0; back -= 1) months.push(new Date(Date.UTC(thisMonth.getUTCFullYear(), thisMonth.getUTCMonth() - back, 1)).toISOString().slice(0, 7));
  const perMonth = Object.fromEntries(months.map((month) => [month, 0]));
  const events = await db.query(`SELECT created_at FROM events WHERE company_id = $1 AND type IN ('download_word', 'download_pdf') AND created_at >= $2`, [id, new Date(Date.now() - 400 * DAY)]);
  for (const row of events) if (perMonth[monthOf(row.created_at)] !== undefined) perMonth[monthOf(row.created_at)] += 1;
  const refs = await db.query('SELECT ref, title, state, postcode, created_at FROM swms_refs WHERE company_id = $1 ORDER BY created_at DESC LIMIT 50', [id]);
  // Sign-ins are kept for 90 days. These are the last 30.
  const signins = await db.query('SELECT s.user_id, s.network, s.device, s.created_at FROM signins s JOIN users u ON u.id = s.user_id WHERE u.company_id = $1 AND s.created_at >= $2', [id, new Date(Date.now() - 30 * DAY)]);
  const byUser = new Map(users.map((user) => [user.id, { email: user.email, signins: 0, devices: new Set(), networks: new Set(), last: null }]));
  for (const row of signins) {
    const entry = byUser.get(row.user_id);
    if (!entry) continue;
    entry.signins += 1;
    entry.devices.add(row.device);
    entry.networks.add(row.network);
    if (!entry.last || new Date(row.created_at) > new Date(entry.last)) entry.last = row.created_at;
  }
  res.json({
    company: {
      id: company.id, name: company.name, abn: company.abn, address: company.address, phone: company.phone, email: company.email,
      createdAt: company.created_at, industryOptOut: Boolean(company.industry_opt_out),
    },
    plan: planView(company),
    users: users.map((user) => ({ email: user.email, name: user.name, isAdmin: Boolean(user.is_admin), createdAt: user.created_at, lastSeenAt: user.last_seen_at })),
    trialAbn: holder
      ? { abn: holder.abn, heldByThisAccount: holder.company_id === company.id, holderId: holder.company_id, holderName: holder.name || '', holderDeleted: !holder.company_id, createdAt: holder.created_at }
      : null,
    downloadsByMonth: months.map((month) => ({ month, downloads: perMonth[month] })),
    refs: refs.map((row) => ({ ref: row.ref, title: row.title, state: row.state || '', postcode: row.postcode || '', createdAt: row.created_at })),
    signins: {
      days: 30,
      total: signins.length,
      devices: new Set(signins.map((row) => row.device)).size,
      networks: new Set(signins.map((row) => row.network)).size,
      users: [...byUser.values()].map((entry) => ({ email: entry.email, signins: entry.signins, devices: entry.devices.size, networks: entry.networks.size, last: entry.last })),
    },
  });
}));

// ---- Deleting a business ----

// Deletes a whole business on its request (privacy policy, "How long we keep it"). The owner types
// the business name to confirm. Refused while its Stripe subscription is still running.
router.post('/admin/companies/:id/delete', auth.requireUser, route(async (req, res) => {
  requireOwner(req);
  const result = await removal.deleteBusiness(String(req.params.id || '').slice(0, 100), { confirm: (req.body || {}).confirm, adminEmail: req.user.email });
  res.json({ ok: true, ...result });
}));

// Businesses that stopped paying, or whose trial ended, more than 12 months ago. Listed for the
// owner to decide on; nothing is deleted automatically. Looking at the list is logged.
router.get('/admin/removal-due', auth.requireUser, route(async (req, res) => {
  requireOwner(req);
  await logAccess(req, 'removal_list', '');
  const list = await removal.dueForRemoval();
  res.json({ months: removal.RETENTION_MONTHS, companies: list.map((item) => ({ ...item, accountLink: accountLink(item.id) })) });
}));

// ---- Warning signs ----

// Free email services: sharing one says nothing about two businesses being related.
const PUBLIC_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'outlook.com.au', 'hotmail.com', 'hotmail.com.au', 'live.com', 'live.com.au',
  'yahoo.com', 'yahoo.com.au', 'icloud.com', 'me.com', 'bigpond.com', 'bigpond.net.au', 'optusnet.com.au', 'proton.me', 'protonmail.com',
]);

const LIMITS = {
  weekDownloads: 50, // downloads in 7 days
  weekMultiple: 3, // times the account's own average week over the 8 weeks before
  weekMinimum: 10, // downloads in 7 days before the multiple counts
  states: 4, // states in 30 days
  postcodes: 15, // distinct postcodes in 30 days
  domainCompanies: 3, // accounts on one email domain
  relatedTrials: 2, // trial accounts sharing an address, phone, email domain or nearly the same name
};

const STATE_NAMES = { qld: 'Qld', nsw: 'NSW', vic: 'Vic', act: 'ACT', tas: 'Tas', sa: 'SA', wa: 'WA', nt: 'NT' };
const listNames = (items) => items.map((item) => item.name || '(no name)').join(', ');
const brief = (company) => ({ id: company.id, name: company.name || '', accountLink: accountLink(company.id) });

// Names compared without case, punctuation or words like "Pty Ltd".
const COMMON_WORDS = new Set(['pty', 'ltd', 'limited', 'proprietary', 'the', 'co', 'company', 'inc', 'and']);
function plainName(name) {
  return String(name || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter((word) => word && !COMMON_WORDS.has(word)).join('');
}
function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length];
}
// The same name, or one or two letters apart in a longer name (a typo, or a "2" on the end).
function nearlySameName(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = Math.min(a.length, b.length);
  if (shorter < 6) return false;
  return editDistance(a, b) <= (shorter >= 12 ? 2 : 1);
}
const plainAddress = (address) => String(address || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function plainPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.startsWith('61') && digits.length === 11 ? `0${digits.slice(2)}` : digits;
}

async function warningSigns(now = Date.now()) {
  const since = (days) => new Date(now - days * DAY);
  const warnings = [];
  const companies = await db.query('SELECT id, name, abn, address, phone, email, plan_status, trial_ends_at, created_at FROM companies');
  const byId = new Map(companies.map((company) => [company.id, company]));
  const nameOf = (id) => (byId.get(id) ? byId.get(id).name : '') || '(no name)';

  // Unusually high download volume: this week against a fixed number, and against the account's own past.
  const downloads = await db.query(`SELECT company_id, created_at FROM events WHERE company_id IS NOT NULL AND type IN ('download_word', 'download_pdf') AND created_at >= $1`, [since(63)]);
  const volume = new Map();
  for (const row of downloads) {
    const entry = volume.get(row.company_id) || { week: 0, before: 0 };
    if (new Date(row.created_at) >= since(7)) entry.week += 1;
    else entry.before += 1;
    volume.set(row.company_id, entry);
  }
  for (const [id, { week, before }] of volume) {
    const average = before / 8;
    let reason = '';
    if (week >= LIMITS.weekDownloads) reason = `${week} downloads in the last 7 days (${LIMITS.weekDownloads} or more is unusual for one business).`;
    // An account with no downloads in the 8 weeks before has no average to compare with.
    else if (week >= LIMITS.weekMinimum && before > 0 && week > LIMITS.weekMultiple * average) {
      reason = `${week} downloads in the last 7 days, ${(week / average).toFixed(1)} times its average week of ${average.toFixed(1)} over the 8 weeks before.`;
    }
    if (reason) warnings.push({ rule: 'volume', reason, companies: [brief({ id, name: nameOf(id) })] });
  }

  // Many places: one account making SWMS for jobs across several states or many postcodes.
  const refs = await db.query('SELECT company_id, state, postcode FROM swms_refs WHERE company_id IS NOT NULL AND created_at >= $1', [since(30)]);
  const places = new Map();
  for (const row of refs) {
    const entry = places.get(row.company_id) || { states: new Set(), postcodes: new Set() };
    if (row.state) entry.states.add(row.state);
    if (row.postcode) entry.postcodes.add(row.postcode);
    places.set(row.company_id, entry);
  }
  for (const [id, { states, postcodes }] of places) {
    const parts = [];
    if (states.size >= LIMITS.states) parts.push(`${states.size} states (${[...states].sort().map((state) => STATE_NAMES[state] || state).join(', ')})`);
    if (postcodes.size >= LIMITS.postcodes) parts.push(`${postcodes.size} postcodes`);
    if (parts.length) {
      warnings.push({ rule: 'places', reason: `SWMS for jobs in ${parts.join(' and ')} in 30 days: a consultant producing for many clients, or a shared login.`, companies: [brief({ id, name: nameOf(id) })] });
    }
  }

  // One business email domain on several accounts. Each account's users and its company email count.
  const users = await db.query('SELECT company_id, email FROM users');
  const domainsOf = new Map(companies.map((company) => [company.id, new Set([domainOf(company.email)].filter(Boolean))]));
  for (const user of users) if (domainsOf.has(user.company_id) && domainOf(user.email)) domainsOf.get(user.company_id).add(domainOf(user.email));
  const byDomain = new Map();
  for (const [id, domains] of domainsOf) {
    for (const domain of domains) if (!PUBLIC_DOMAINS.has(domain)) byDomain.set(domain, [...(byDomain.get(domain) || []), byId.get(id)]);
  }
  for (const [domain, list] of byDomain) {
    if (list.length >= LIMITS.domainCompanies) warnings.push({ rule: 'domain', reason: `The email domain ${domain} is on ${list.length} accounts: ${listNames(list)}.`, companies: list.map(brief) });
  }

  // Repeated trials: trial accounts that look like the same business.
  const trials = companies.filter((company) => company.plan_status === 'trial');
  const shared = (label, keysOf) => {
    const groups = new Map();
    for (const company of trials) for (const key of keysOf(company)) groups.set(key, [...(groups.get(key) || []), company]);
    for (const [key, list] of groups) {
      if (list.length >= LIMITS.relatedTrials) warnings.push({ rule: 'trials', reason: `${list.length} trial accounts share the ${label} ${key}: ${listNames(list)}.`, companies: list.map(brief) });
    }
  };
  shared('address', (company) => [company.address].filter((address) => plainAddress(address).length >= 8).map((address) => plainAddress(address)));
  shared('phone number', (company) => [plainPhone(company.phone)].filter((phone) => phone.length >= 8));
  shared('email domain', (company) => [...(domainsOf.get(company.id) || [])].filter((domain) => !PUBLIC_DOMAINS.has(domain)));
  // Nearly the same names are grouped, so A, B and C with similar names are one warning.
  const plain = trials.map((company) => plainName(company.name));
  const parent = trials.map((_, index) => index);
  const root = (index) => (parent[index] === index ? index : (parent[index] = root(parent[index])));
  for (let i = 0; i < trials.length; i += 1) {
    for (let j = i + 1; j < trials.length; j += 1) if (nearlySameName(plain[i], plain[j])) parent[root(j)] = root(i);
  }
  const named = new Map();
  trials.forEach((company, index) => named.set(root(index), [...(named.get(root(index)) || []), company]));
  for (const list of named.values()) {
    if (list.length >= LIMITS.relatedTrials) warnings.push({ rule: 'trials', reason: `${list.length} trial accounts have nearly the same name: ${listNames(list)}.`, companies: list.map(brief) });
  }

  // One login used on many devices or networks.
  for (const item of await unusualSignins(since)) {
    warnings.push({
      rule: 'signins',
      reason: `${item.email} signed in from ${item.devices30} devices in 30 days and ${item.networks7} networks in 7 days, which can mean the login is shared.`,
      companies: item.companyId ? [brief({ id: item.companyId, name: item.company })] : [],
    });
  }
  return warnings;
}

router.get('/admin/warnings', auth.requireUser, route(async (req, res) => {
  requireOwner(req);
  res.json({ limits: LIMITS, warnings: await warningSigns() });
}));

// ---- AI readings checked against the brief ----

// The last 50 AI readings of a scope, each with its check against the brief (quotes word for
// word, no "...", package names) and what it cost, so the output is checked on a regular basis.
// The readings themselves stay with each account; only their counts and checks are shown here.
router.get('/admin/ai-readings', auth.requireUser, route(async (req, res) => {
  requireOwner(req);
  const rows = await db.query(`SELECT r.id, r.status, r.brief_version, r.model, r.characters, r.checks, r.cost_usd, r.error, r.created_at, r.finished_at, c.name AS company_name
    FROM ai_readings r LEFT JOIN companies c ON c.id = r.company_id ORDER BY r.created_at DESC LIMIT 50`);
  res.json({
    readings: rows.map((row) => {
      const checks = row.checks ? JSON.parse(row.checks) : null;
      return {
        id: row.id,
        company: row.company_name || '',
        status: row.status,
        briefVersion: row.brief_version,
        model: row.model,
        characters: row.characters,
        costUsd: Number(row.cost_usd || 0),
        error: row.error,
        createdAt: row.created_at,
        minutes: row.finished_at ? Math.round((new Date(row.finished_at) - new Date(row.created_at)) / 6000) / 10 : null,
        checks: checks && {
          passed: checks.passed,
          activities: checks.activities,
          conflicts: checks.conflicts,
          quotes: checks.quotes,
          quotesNotFound: checks.quotesNotFound.length,
          quotesShortened: checks.quotesShortened.length,
          otherPackages: checks.otherPackages,
          rowsWithoutQuote: checks.rowsWithoutQuote.length,
        },
      };
    }),
  });
}));

// ---- What users change in the controls ----

// Counts only (task #102): by kind and outcome, the steps changed most, and how many changes were
// kept in the next revision. Rows are kept only while CONTROL_LEARNING is on.
router.get('/admin/control-learning', auth.requireUser, route(async (req, res) => {
  requireOwner(req);
  res.json(await require('./control-learning').summary());
}));

// Goal 11: the monthly learning report for one month (YYYY-MM, Queensland time; the last whole
// month if not given) and the months before it, as JSON or as text for the owner to keep. Owner
// only: nothing here is customer facing.
const reportMonth = (req) => {
  const { isMonth } = require('./control-learning');
  const month = String(req.query.month || '').trim();
  if (month && !isMonth(month)) throw auth.fail(400, 'Give the month as YYYY-MM.');
  return month || undefined;
};

router.get('/admin/control-learning/report', auth.requireUser, route(async (req, res) => {
  requireOwner(req);
  res.json(await require('./control-learning').monthlyReport({ month: reportMonth(req) }));
}));

router.get('/admin/control-learning/report.md', auth.requireUser, route(async (req, res) => {
  requireOwner(req);
  const { monthlyReport, reportMarkdown } = require('./control-learning');
  const report = await monthlyReport({ month: reportMonth(req) });
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="siteready-learning-${report.month}.md"`);
  res.send(reportMarkdown(report));
}));

// ---- Access log ----

router.get('/admin/access-log', auth.requireUser, route(async (req, res) => {
  requireOwner(req);
  const rows = await db.query('SELECT admin_email, action, target, created_at FROM admin_access_log ORDER BY created_at DESC LIMIT 100');
  res.json({ entries: rows.map((row) => ({ adminEmail: row.admin_email, action: row.action, target: row.target, createdAt: row.created_at })) });
}));

module.exports = { router, isAdmin, warningSigns, plainName, nearlySameName };
