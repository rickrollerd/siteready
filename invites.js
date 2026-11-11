// Invite codes for the founding-member beta. When INVITE_ONLY is on, a new company
// or a new SiteLink org needs an admin-issued invite. Existing accounts, company
// team joins and reviewers are not affected.
const crypto = require('crypto');
const db = require('./db');

const DAY = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 30;

function switchedOn() {
  return /^(1|true|yes|on)$/i.test(String(process.env.INVITE_ONLY || '').trim());
}

function enabled() {
  return switchedOn() && db.enabled();
}

function supportEmail() {
  return String(process.env.SUPPORT_EMAIL || 'sitereadyaus@gmail.com').trim() || 'sitereadyaus@gmail.com';
}

function refusal() {
  return `This founding-member beta is invite-only. Request an invite at ${supportEmail()}.`;
}

function refuse() {
  return Object.assign(new Error(refusal()), { status: 403, publicMessage: true });
}

function codeFrom(body) {
  return String((body && (body.invite || body.inviteCode)) || '').trim();
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code), 'utf8').digest('hex');
}

function links(code, base) {
  const root = String(base || process.env.APP_URL || '').replace(/\/$/, '');
  const q = encodeURIComponent(code);
  return {
    code,
    link: root ? `${root}/?invite=${q}` : `/?invite=${q}`,
    sitelinkLink: root ? `${root}/sitelink?invite=${q}` : `/sitelink?invite=${q}`,
  };
}

function storeOf(store) {
  return store && typeof store.one === 'function' ? store : db;
}

async function create({ note = '', maxUses = 1, createdBy, base, expiresAt } = {}) {
  const id = crypto.randomUUID();
  const code = crypto.randomBytes(18).toString('base64url');
  const hashed = hashCode(code);
  const uses = Math.max(1, Math.round(Number(maxUses) || 1));
  const expires = expiresAt ? new Date(expiresAt) : new Date(Date.now() + DEFAULT_DAYS * DAY);
  await db.query(
    `INSERT INTO invites (id, code, code_hash, code_hint, note, created_by, created_at, max_uses, use_count, expires_at, last_used_at, last_used_by, revoked_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, NULL, '', NULL)`,
    [id, hashed, hashed, code.slice(-4), String(note || '').trim().slice(0, 200), String(createdBy || ''), new Date(), uses, expires],
  );
  return { id, ...links(code, base), expiresAt: expires };
}

function usableSql() {
  return `revoked_at IS NULL
     AND (expires_at IS NULL OR expires_at > now())
     AND use_count < max_uses`;
}

async function peek(code, store) {
  const value = String(code || '').trim();
  if (!value) return null;
  const hashed = hashCode(value);
  return storeOf(store).one(
    `SELECT * FROM invites WHERE (code_hash = $1 OR code = $1)
     AND ${usableSql()}`,
    [hashed],
  );
}

async function consume(code, usedBy, store) {
  const value = String(code || '').trim();
  if (!value) throw refuse();
  const hashed = hashCode(value);
  const row = await storeOf(store).one(
    `UPDATE invites
     SET use_count = use_count + 1,
         last_used_at = now(),
         last_used_by = $2
     WHERE (code_hash = $1 OR code = $1)
       AND ${usableSql()}
     RETURNING *`,
    [hashed, String(usedBy || '')],
  );
  if (!row) throw refuse();
  return row;
}

async function revoke(id) {
  const row = await db.one(
    `UPDATE invites SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1 RETURNING *`,
    [String(id || '').trim()],
  );
  return row;
}

function publicRow(row) {
  return {
    id: row.id,
    codeHint: row.code_hint,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
    maxUses: row.max_uses,
    useCount: row.use_count,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    lastUsedAt: row.last_used_at,
    lastUsedBy: row.last_used_by,
  };
}

async function listInvites() {
  const rows = await db.query(
    `SELECT id, code_hint, note, created_by, created_at, max_uses, use_count, expires_at, revoked_at, last_used_at, last_used_by
     FROM invites ORDER BY created_at DESC`,
  );
  return rows.map(publicRow);
}

async function backfillHashes(query) {
  const rows = await query('SELECT id, code, code_hash, code_hint FROM invites');
  for (const row of rows) {
    const code = String(row.code || '');
    if (row.code_hash) continue;
    if (!code) continue;
    if (/^[0-9a-f]{64}$/.test(code)) {
      await query('UPDATE invites SET code_hash = $1 WHERE id = $2', [code, row.id]);
      continue;
    }
    const hashed = hashCode(code);
    const hint = String(row.code_hint || '') || code.slice(-4);
    await query('UPDATE invites SET code_hash = $1, code_hint = $2, code = $1 WHERE id = $3', [hashed, hint, row.id]);
  }
}

module.exports = {
  enabled, refusal, refuse, create, peek, consume, revoke, list: listInvites, codeFrom,
  supportEmail, links, hashCode, publicRow, backfillHashes, DEFAULT_DAYS,
};
