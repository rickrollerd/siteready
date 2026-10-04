// Signing in: a link sent by email, then Face ID or Touch ID (a passkey) on
// devices that have it. A session is a random token the app sends as
// "Authorization: Bearer <token>"; only its hash is stored.
const crypto = require('crypto');
const {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const db = require('./db');
const { sendMail } = require('./mailer');
const { record } = require('./events');

const TRIAL_DAYS = 14;
const LINK_MINUTES = 20;
const SESSION_DAYS = 60;
const CHALLENGE_MINUTES = 5;
const DAY = 24 * 60 * 60 * 1000;

const newId = () => crypto.randomUUID();
const newToken = () => crypto.randomBytes(32).toString('base64url');
const hash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const later = (ms) => new Date(Date.now() + ms);

function fail(status, message) {
  return Object.assign(new Error(message), { status, publicMessage: true });
}

// Only a plain string is an email address: an array or object that happens to turn into
// one when written out is refused.
function cleanEmail(value) {
  if (typeof value !== 'string') return '';
  const email = value.trim().toLowerCase();
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email) ? email : '';
}

// Where links in emails point, and which page origins passkeys accept.
function appUrl(req) {
  return (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

function passkeySettings(req) {
  const url = new URL(appUrl(req));
  return { rpID: process.env.RP_ID || url.hostname, origin: url.origin };
}

async function sendLoginLink(req, email, companyId = null, invitedBy = '') {
  const token = newToken();
  // A new link replaces any earlier unused link for the same email (and the same company invite),
  // so an old link left in an inbox stops working.
  if (companyId) await db.query('DELETE FROM login_tokens WHERE email = $1 AND company_id = $2 AND used_at IS NULL', [email, companyId]);
  else await db.query('DELETE FROM login_tokens WHERE email = $1 AND company_id IS NULL AND used_at IS NULL', [email]);
  await db.query('INSERT INTO login_tokens (token_hash, email, company_id, expires_at) VALUES ($1, $2, $3, $4)',
    [hash(token), email, companyId, later(LINK_MINUTES * 60 * 1000)]);
  const link = `${appUrl(req)}/?login=${token}`;
  const opening = invitedBy ? `${invitedBy} has added you to their company on SiteReady.` : 'Use this link to sign in to SiteReady.';
  await sendMail({
    to: email,
    subject: 'Your SiteReady sign-in link',
    text: `${opening}\n\n${link}\n\nThe link works once and expires in ${LINK_MINUTES} minutes. If you did not ask for it, you can ignore this email.`,
  });
}

async function createSession(userId, req = null) {
  const token = newToken();
  await db.query('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)',
    [hash(token), userId, new Date(), later(SESSION_DAYS * DAY)]);
  if (req) await recordSignin(userId, req);
  return token;
}

// The network (IP address without its last part) and the kind of device, for spotting
// one sign-in shared across many places. Kept 90 days.
function networkOf(req) {
  const ip = String(req.ip || '').replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip.split('.').slice(0, 3).join('.');
  return ip.split(':').slice(0, 4).join(':');
}

function deviceOf(req) {
  const agent = String((req.headers && req.headers['user-agent']) || '');
  const system = /iphone|ipad/i.test(agent) ? 'iPhone or iPad' : /android/i.test(agent) ? 'Android' : /windows/i.test(agent) ? 'Windows' : /mac os/i.test(agent) ? 'Mac' : /linux/i.test(agent) ? 'Linux' : 'Other';
  const browser = /edg\//i.test(agent) ? 'Edge' : /chrome|crios/i.test(agent) ? 'Chrome' : /firefox|fxios/i.test(agent) ? 'Firefox' : /safari/i.test(agent) ? 'Safari' : 'Other';
  return `${system}, ${browser}, ${crypto.createHash('sha256').update(agent).digest('hex').slice(0, 8)}`;
}

async function recordSignin(userId, req) {
  try {
    await db.query('INSERT INTO signins (id, user_id, network, device, created_at) VALUES ($1, $2, $3, $4, $5)', [newToken(), userId, networkOf(req), deviceOf(req), new Date()]);
    await db.query('DELETE FROM signins WHERE created_at < $1', [new Date(Date.now() - 90 * DAY)]);
  } catch {
    // A missed record never stops a sign-in.
  }
}

// A first sign-in makes the company, with its free trial. An invited person
// joins the company that invited them. The person who makes the company is
// its administrator.
async function userForEmail(email, companyId) {
  const existing = await db.one('SELECT * FROM users WHERE email = $1', [email]);
  if (existing) return existing;
  let company = companyId;
  const founder = !company;
  if (!company) {
    company = newId();
    await db.query('INSERT INTO companies (id, email, trial_ends_at, created_at) VALUES ($1, $2, $3, $4)',
      [company, email, later(TRIAL_DAYS * DAY), new Date()]);
    await record('trial_started', company);
  }
  const id = newId();
  await db.query('INSERT INTO users (id, company_id, email, is_admin, created_at) VALUES ($1, $2, $3, $4, $5)', [id, company, email, founder, new Date()]);
  return db.one('SELECT * FROM users WHERE id = $1', [id]);
}

async function finishLogin(token, req = null) {
  const row = await db.one('SELECT * FROM login_tokens WHERE token_hash = $1', [hash(token)]);
  if (!row || row.used_at || new Date(row.expires_at) < new Date()) throw fail(400, 'This sign-in link has expired or has been used. Ask for a new one.');
  await db.query('UPDATE login_tokens SET used_at = $1 WHERE token_hash = $2', [new Date(), row.token_hash]);
  const user = await userForEmail(row.email, row.company_id);
  return createSession(user.id, req);
}

function hasAccess(company) {
  if (!company) return false;
  // A failed card payment keeps access while Stripe retries it.
  if (['active', 'trialing', 'past_due'].includes(company.plan_status)) return true;
  return company.plan_status === 'trial' && new Date(company.trial_ends_at) > new Date();
}

// Reads the session if there is one. Routes decide whether they need it.
async function readSession(req, _res, next) {
  try {
    // The app also sends the session in X-Session-Token, which wins when present: some test
    // and proxy setups replace the Authorization header on the way.
    const header = req.get('authorization') || '';
    const token = String(req.get('x-session-token') || '').trim() || (header.startsWith('Bearer ') ? header.slice(7).trim() : '');
    if (token && db.enabled()) {
      const user = await db.one(
        'SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = $1 AND sessions.expires_at > $2',
        [hash(token), new Date()],
      );
      if (user) {
        req.user = user;
        req.company = await db.one('SELECT * FROM companies WHERE id = $1', [user.company_id]);
        req.sessionHash = hash(token);
      }
    }
    next();
  } catch (error) {
    // A database that cannot answer is not a signed-out user: say so, so the app retries.
    const busy = fail(503, 'SiteReady is busy. Try again in a moment.');
    busy.cause = error;
    next(busy);
  }
}

function requireUser(req, _res, next) {
  if (!req.user) return next(fail(401, 'Sign in to use this.'));
  next();
}

function requireAccess(req, _res, next) {
  // Without a database there are no accounts, and downloads work as before.
  if (!db.enabled()) return next();
  if (!req.user) return next(fail(401, 'Sign in, or start a free trial, to download, save or share a SWMS.'));
  if (!hasAccess(req.company)) return next(fail(402, 'Your free trial has ended. Subscribe to keep downloading, saving and sharing SWMS.'));
  next();
}

async function saveChallenge(challenge, userId = null) {
  const id = newId();
  await db.query('INSERT INTO challenges (id, user_id, challenge, expires_at) VALUES ($1, $2, $3, $4)',
    [id, userId, challenge, later(CHALLENGE_MINUTES * 60 * 1000)]);
  return id;
}

async function takeChallenge(id) {
  const row = await db.one('SELECT * FROM challenges WHERE id = $1', [String(id || '')]);
  if (!row) throw fail(400, 'Face ID sign-in timed out. Try again.');
  await db.query('DELETE FROM challenges WHERE id = $1', [row.id]);
  if (new Date(row.expires_at) < new Date()) throw fail(400, 'Face ID sign-in timed out. Try again.');
  return row;
}

async function passkeyRegistrationOptions(req) {
  const { rpID } = passkeySettings(req);
  const existing = await db.query('SELECT id, transports FROM passkeys WHERE user_id = $1', [req.user.id]);
  const options = await generateRegistrationOptions({
    rpName: 'SiteReady',
    rpID,
    userName: req.user.email,
    userID: Buffer.from(req.user.id),
    attestationType: 'none',
    excludeCredentials: existing.map((key) => ({ id: key.id, transports: key.transports ? key.transports.split(',') : undefined })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  });
  return { options, challengeId: await saveChallenge(options.challenge, req.user.id) };
}

async function passkeyRegister(req) {
  const { challengeId, response } = req.body || {};
  const saved = await takeChallenge(challengeId);
  if (saved.user_id !== req.user.id) throw fail(400, 'Face ID could not be set up. Try again.');
  const { rpID, origin } = passkeySettings(req);
  let result;
  try {
    result = await verifyRegistrationResponse({ response, expectedChallenge: saved.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
  } catch {
    throw fail(400, 'Face ID could not be set up. Try again.');
  }
  if (!result.verified) throw fail(400, 'Face ID could not be set up. Try again.');
  const { credential } = result.registrationInfo;
  await db.query('INSERT INTO passkeys (id, user_id, public_key, counter, transports, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [credential.id, req.user.id, Buffer.from(credential.publicKey).toString('base64'), credential.counter || 0, (credential.transports || []).join(','), new Date()]);
}

async function passkeyLoginOptions(req) {
  const { rpID } = passkeySettings(req);
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
  return { options, challengeId: await saveChallenge(options.challenge) };
}

async function passkeyLogin(req) {
  const { challengeId, response } = req.body || {};
  const saved = await takeChallenge(challengeId);
  const key = response && await db.one('SELECT * FROM passkeys WHERE id = $1', [String(response.id || '')]);
  if (!key) throw fail(400, 'This Face ID is not set up for SiteReady on this device. Sign in with an email link first.');
  const { rpID, origin } = passkeySettings(req);
  let result;
  try {
    result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: saved.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: key.id,
        publicKey: new Uint8Array(Buffer.from(key.public_key, 'base64')),
        counter: Number(key.counter),
        transports: key.transports ? key.transports.split(',') : undefined,
      },
    });
  } catch {
    throw fail(400, 'Face ID sign-in failed. Try again, or use an email link.');
  }
  if (!result.verified) throw fail(400, 'Face ID sign-in failed. Try again, or use an email link.');
  await db.query('UPDATE passkeys SET counter = $1, last_used_at = $2 WHERE id = $3', [result.authenticationInfo.newCounter, new Date(), key.id]);
  return createSession(key.user_id, req);
}

module.exports = {
  TRIAL_DAYS, newId, newToken, hash, fail, cleanEmail, appUrl,
  sendLoginLink, finishLogin, createSession, hasAccess,
  readSession, requireUser, requireAccess,
  passkeyRegistrationOptions, passkeyRegister, passkeyLoginOptions, passkeyLogin,
};
