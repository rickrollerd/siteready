// Numbers for the owner: sign-ups, trials, subscriptions, what people do, and
// recent errors. Only emails listed in ADMIN_EMAILS can see them.
const express = require('express');
const db = require('./db');
const { releasableFigures } = require('./industry');
const auth = require('./auth');

const router = express.Router();
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function isAdmin(user) {
  const allowed = String(process.env.ADMIN_EMAILS || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  return Boolean(user && allowed.includes(user.email));
}

router.get('/admin/stats', auth.requireUser, route(async (req, res) => {
  if (!isAdmin(req.user)) throw auth.fail(403, 'Not available.');
  const now = Date.now();
  const since = (days) => new Date(now - days * 86400000);
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
  // One sign-in used on many devices or from many networks may be shared outside the company.
  const signins = await db.query(`SELECT s.user_id, u.email, c.name AS company, s.network, s.device, s.created_at
    FROM signins s JOIN users u ON u.id = s.user_id LEFT JOIN companies c ON c.id = u.company_id WHERE s.created_at >= $1`, [since(30)]);
  const byUser = new Map();
  for (const row of signins) {
    const entry = byUser.get(row.user_id) || { email: row.email, company: row.company || '', devices: new Set(), networks7: new Set(), signins: 0, last: row.created_at };
    entry.devices.add(row.device);
    if (new Date(row.created_at) >= since(7)) entry.networks7.add(row.network);
    entry.signins += 1;
    if (new Date(row.created_at) > new Date(entry.last)) entry.last = row.created_at;
    byUser.set(row.user_id, entry);
  }
  const unusualSignins = [...byUser.values()]
    .filter((entry) => entry.devices.size >= 4 || entry.networks7.size >= 4)
    .map((entry) => ({ email: entry.email, company: entry.company, devices30: entry.devices.size, networks7: entry.networks7.size, signins30: entry.signins, last: entry.last }))
    .sort((a, b) => (b.devices30 + b.networks7) - (a.devices30 + a.networks7));
  const price = Number(process.env.PRICE_MONTHLY || 49);
  res.json({
    companies: companies.length,
    newCompanies: { days7: companies.filter((c) => new Date(c.created_at) >= since(7)).length, days30: companies.filter((c) => new Date(c.created_at) >= since(30)).length },
    plans,
    monthlyRevenue: (plans.active + plans.past_due) * price,
    actions: { days7: await count(7), days30: await count(30) },
    errors,
    unusualSignins,
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

module.exports = { router, isAdmin };
