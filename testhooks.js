// Staging test hooks, for automated testing only. They are on only when TEST_HOOKS_SECRET
// (at least 32 characters) is set, and never in a Railway environment named production.
// Mail to an address at TEST_MAIL_DOMAIN goes to a test inbox in the database instead of
// being sent, and each call must carry the secret in the X-Test-Secret header.
const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const { divertMail } = require('./mailer');

const DOMAIN = () => String(process.env.TEST_MAIL_DOMAIN || 'siteready.test').toLowerCase();

function enabled() {
  const secret = String(process.env.TEST_HOOKS_SECRET || '');
  if (secret.length < 32) return false;
  if (String(process.env.RAILWAY_ENVIRONMENT_NAME || '').toLowerCase() === 'production') return false;
  return true;
}

function secretMatches(given) {
  const want = Buffer.from(String(process.env.TEST_HOOKS_SECRET || ''));
  const got = Buffer.from(String(given || ''));
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

let ready = null;
function table() {
  if (!ready) ready = db.query('CREATE TABLE IF NOT EXISTS test_inbox (id TEXT PRIMARY KEY, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL)').catch((error) => { ready = null; throw error; });
  return ready;
}

const isTestAddress = (to) => String(to || '').toLowerCase().endsWith(`@${DOMAIN()}`);

async function keep({ to, subject, text }) {
  await table();
  await db.query('INSERT INTO test_inbox (id, recipient, subject, body, created_at) VALUES ($1, $2, $3, $4, $5)', [crypto.randomBytes(12).toString('hex'), String(to).toLowerCase(), subject, text, new Date()]);
  // A week of test mail is plenty.
  await db.query('DELETE FROM test_inbox WHERE created_at < $1', [new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)]);
}

function install(app, { sendReviewReminders, removeExpired }) {
  if (!enabled()) return false;
  divertMail((message) => (db.enabled() && isTestAddress(message.to) ? keep(message).then(() => true) : false));
  const router = express.Router();
  router.use((req, res, next) => (secretMatches(req.get('X-Test-Secret')) ? next() : res.status(404).json({ kind: 'error', message: 'Not found.' })));
  router.get('/inbox', async (req, res, next) => {
    try {
      const to = String(req.query.to || '').toLowerCase();
      if (!isTestAddress(to)) return res.status(400).json({ kind: 'error', message: `Only addresses at ${DOMAIN()}.` });
      await table();
      const rows = await db.query('SELECT subject, body, created_at FROM test_inbox WHERE recipient = $1 ORDER BY created_at DESC LIMIT 20', [to]);
      return res.json({ messages: rows.map((row) => ({ subject: row.subject, text: row.body, at: row.created_at })) });
    } catch (error) { return next(error); }
  });
  // Google's raw results for Find nearest, with what the filter kept, so it can be tuned on real data.
  router.get('/nearby-raw', async (req, res, next) => {
    try {
      return res.json(await require('./places').nearbyCare(String(req.query.address || ''), { raw: true }));
    } catch (error) { return next(error); }
  });
  // Runs the review reminders and clean-up as if it were the given date, so a 12 month review can be tested now.
  router.post('/run-reminders', async (req, res, next) => {
    try {
      const now = req.body && req.body.now ? new Date(req.body.now) : new Date();
      if (Number.isNaN(now.getTime())) return res.status(400).json({ kind: 'error', message: 'now must be a date.' });
      const sent = await sendReviewReminders(now);
      await removeExpired(now);
      return res.json({ ok: true, swmsReminded: sent, now: now.toISOString() });
    } catch (error) { return next(error); }
  });
  app.use('/api/test', router);
  console.log(`Staging test hooks are on. Mail to @${DOMAIN()} goes to the test inbox.`);
  return true;
}

module.exports = { install, enabled };
