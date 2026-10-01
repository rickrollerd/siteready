// Numbers for the owner: sign-ups, trials, subscriptions, what people do, and
// recent errors. Only emails listed in ADMIN_EMAILS can see them.
const express = require('express');
const db = require('./db');
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
  const price = Number(process.env.PRICE_MONTHLY || 49);
  res.json({
    companies: companies.length,
    newCompanies: { days7: companies.filter((c) => new Date(c.created_at) >= since(7)).length, days30: companies.filter((c) => new Date(c.created_at) >= since(30)).length },
    plans,
    monthlyRevenue: (plans.active + plans.past_due) * price,
    actions: { days7: await count(7), days30: await count(30) },
    errors,
  });
}));

module.exports = { router, isAdmin };
