// Invite codes for the founding-member beta. When INVITE_ONLY is on, a new company
// or a new SiteLink org needs an admin-issued invite. Existing accounts, company
// team joins and reviewers are not affected.
const crypto = require('crypto');
const db = require('./db');

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

function links(code, base) {
  const root = String(base || process.env.APP_URL || '').replace(/\/$/, '');
  const q = encodeURIComponent(code);
  return {
    code,
    link: root ? `${root}/?invite=${q}` : `/?invite=${q}`,
    sitelinkLink: root ? `${root}/sitelink?invite=${q}` : `/sitelink?invite=${q}`,
  };
}

async function create({ note = '', maxUses = 1, createdBy, base } = {}) {
  const code = crypto.randomBytes(18).toString('base64url');
  const uses = Math.max(1, Math.round(Number(maxUses) || 1));
  await db.query(
    `INSERT INTO invites (id, code, note, created_by, created_at, max_uses, use_count, expires_at, last_used_at, last_used_by)
     VALUES ($1, $2, $3, $4, $5, $6, 0, NULL, NULL, '')`,
    [crypto.randomUUID(), code, String(note || '').trim().slice(0, 200), String(createdBy || ''), new Date(), uses],
  );
  return links(code, base);
}

async function peek(code) {
  const value = String(code || '').trim();
  if (!value) return null;
  return db.one(
    `SELECT * FROM invites WHERE code = $1
     AND (expires_at IS NULL OR expires_at > now())
     AND use_count < max_uses`,
    [value],
  );
}

async function consume(code, usedBy) {
  const value = String(code || '').trim();
  if (!value) throw refuse();
  const row = await db.one(
    `UPDATE invites
     SET use_count = use_count + 1,
         last_used_at = now(),
         last_used_by = $2
     WHERE code = $1
       AND (expires_at IS NULL OR expires_at > now())
       AND use_count < max_uses
     RETURNING *`,
    [value, String(usedBy || '')],
  );
  if (!row) throw refuse();
  return row;
}

async function listInvites() {
  return db.query('SELECT * FROM invites ORDER BY created_at DESC');
}

module.exports = { enabled, refusal, refuse, create, peek, consume, list: listInvites, codeFrom, supportEmail, links };
