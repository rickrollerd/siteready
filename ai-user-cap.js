// A per-user daily limit on AI requests (D323): a cost cap for the founding-member beta, on top of
// the company and account caps on scope readings (D317). Each POST that starts AI work counts once
// for the signed-in user, per UTC day, whatever the feature (scope, methodology, design, SDS, check).
// AI_USER_DAILY_REQUESTS sets the limit (default 20; 0 blocks AI for everyone). Polling a reading
// (GET) never counts. Without a database, or without a signed-in user, nothing is counted.
const db = require('./db');
const { fail } = require('./auth');

function userDailyLimit() {
  const value = Number(process.env.AI_USER_DAILY_REQUESTS);
  return process.env.AI_USER_DAILY_REQUESTS !== undefined && process.env.AI_USER_DAILY_REQUESTS !== '' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 20;
}

const today = () => new Date().toISOString().slice(0, 10);

// Counts one request when the user is under the limit, in one UPDATE so two requests at once cannot
// both take the last one. Returns false at the limit.
async function takeOne(userId, limit = userDailyLimit()) {
  const day = today();
  await db.query('INSERT INTO ai_user_daily (user_id, day, n) VALUES ($1, $2, 0) ON CONFLICT (user_id, day) DO NOTHING', [userId, day]);
  const row = await db.one('UPDATE ai_user_daily SET n = n + 1 WHERE user_id = $1 AND day = $2 AND n < $3 RETURNING n', [userId, day, limit]);
  return Boolean(row);
}

async function userDailyCap(req, _res, next) {
  try {
    if (!db.enabled() || !req.user) return next();
    const limit = userDailyLimit();
    if (!(await takeOne(req.user.id, limit))) return next(fail(429, `You have used today's ${limit} AI requests. Try again tomorrow.`));
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { userDailyCap, userDailyLimit, takeOne };
