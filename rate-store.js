// Rate limit counts shared by every server process (goals 7 and 9).
// The server runs one process per processor core (server.js), and Railway may run more than one
// copy of the server. A count kept in each process's memory let a client have the limit once per
// process: with 24 processes, 10 sign-in emails became 240. The count is kept in the database
// instead, one row per client and limit, updated by one statement, so every process and every
// copy of the server counts the same requests.
// Without a database (a local run or a test without accounts) each process counts in memory.
// A row holds a keyed fingerprint of the client, never the IP address or email address, and is
// deleted within a minute of its window ending.
const crypto = require('crypto');
const { MemoryStore } = require('express-rate-limit');
const db = require('./db');
const { secretKey } = require('./secret-keys');

const BUILT_IN = 'siteready-rate-limit';
// A count the database has not given back in this time is left to the process's own count,
// so a slow database does not hold up every request.
const TIMEOUT_MS = 2000;
const TICK_MS = 100;
const SWEEP_MS = 60 * 1000;
const WARN_MS = 60 * 1000;

// Starts a new window when the old one has ended, otherwise adds one, in a single statement,
// so two processes counting the same client at the same moment both count.
const COUNT = `INSERT INTO rate_limits (key, hits, reset_at) VALUES ($1, 1, $3::timestamptz)
  ON CONFLICT (key) DO UPDATE SET
    hits = CASE WHEN rate_limits.reset_at <= $2::timestamptz THEN 1 ELSE rate_limits.hits + 1 END,
    reset_at = CASE WHEN rate_limits.reset_at <= $2::timestamptz THEN $3::timestamptz ELSE rate_limits.reset_at END
  RETURNING hits, reset_at`;

function fingerprint(key) {
  const secret = secretKey(['RATE_LIMIT_KEY', 'INDUSTRY_KEY', 'SESSION_SECRET'], BUILT_IN) || BUILT_IN;
  return crypto.createHmac('sha256', secret).update(`rate-limit:${key}`).digest('base64url').slice(0, 32);
}

// The time counts only while the process is free to read the answer, in steps of TICK_MS: a
// process busy preparing drafts, or still connecting, is not a database that does not answer.
function withinTime(promise) {
  let timer;
  const late = new Promise((resolve, reject) => {
    let waited = 0;
    const tick = () => {
      waited += TICK_MS;
      if (waited >= TIMEOUT_MS) reject(new Error(`no answer in ${TIMEOUT_MS / 1000} seconds`));
      else timer = setTimeout(tick, TICK_MS);
    };
    timer = setTimeout(tick, TICK_MS);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

// One line a minute at most, so a database outage does not fill the log.
let warnedAt = 0;
function warn(text) {
  if (Date.now() - warnedAt < WARN_MS) return;
  warnedAt = Date.now();
  console.warn(text);
}

// Each process deletes ended windows once a minute, once it has counted in the database.
let sweeping = null;
function startSweep() {
  if (sweeping) return;
  sweeping = setInterval(() => {
    if (db.enabled()) db.query('DELETE FROM rate_limits WHERE reset_at <= $1', [new Date()]).catch(() => {});
  }, SWEEP_MS);
  sweeping.unref();
}

// failClosed: when the shared count cannot be read, refuse the request rather than count it in
// this process alone. Used only for sign-in emails: an email costs money and can be aimed at
// someone else's inbox, and with the database down a sign-in link cannot be saved anyway.
// Every other limit fails open: it counts in this process, with a warning in the log.
class SharedStore {
  constructor(name, { failClosed = false } = {}) {
    this.prefix = `${name}:`;
    this.failClosed = failClosed;
    this.localKeys = false;
    this.memory = new MemoryStore();
  }

  init(options) {
    this.windowMs = options.windowMs;
    this.memory.init(options);
  }

  async count(key) {
    const now = Date.now();
    const rows = await db.query(COUNT, [fingerprint(this.prefix + key), new Date(now), new Date(now + this.windowMs)]);
    startSweep();
    return { totalHits: Number(rows[0].hits), resetTime: new Date(rows[0].reset_at) };
  }

  async increment(key) {
    if (!db.enabled()) return this.memory.increment(key);
    try {
      return await withinTime(this.count(key));
    } catch (error) {
      if (this.failClosed) {
        warn(`Rate limits: the shared count could not be read (${error.message}). Sign-in emails are refused until it can.`);
        throw Object.assign(new Error('Sign-in emails cannot be sent just now. Try again in a few minutes.'), { status: 503, publicMessage: true });
      }
      warn(`Rate limits: the shared count could not be read (${error.message}). Each process counts on its own until it can.`);
      return this.memory.increment(key);
    }
  }

  async decrement(key) {
    await this.memory.decrement(key);
    if (!db.enabled()) return;
    await db.query('UPDATE rate_limits SET hits = hits - 1 WHERE key = $1 AND hits > 0', [fingerprint(this.prefix + key)]).catch(() => {});
  }

  async resetKey(key) {
    await this.memory.resetKey(key);
    if (!db.enabled()) return;
    await db.query('DELETE FROM rate_limits WHERE key = $1', [fingerprint(this.prefix + key)]).catch(() => {});
  }
}

module.exports = { SharedStore, fingerprint, TIMEOUT_MS };
