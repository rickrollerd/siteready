// The main contractor's side of Goal 12 (stage 3): the HSE lead and team, their account, their
// projects and the site details every contractor on a project must use. The lead and team sign in
// free, as reviewers (auth.js): no company, no trial and no payment is ever made for them. The
// sign-in is kept apart from a SiteWrite company account, even for the same email.
//
// Every route that names an account or a project checks that the person signed in has joined that
// account. Anything else reads as not found, so one main contractor never learns of another's.
const express = require('express');
const db = require('./db');
const auth = require('./auth');
const { record } = require('./events');
const { textField } = require('./input');
const { validAbn } = require('./accounts');

const router = express.Router();
const { fail } = auth;
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const STATES = ['act', 'nsw', 'nt', 'qld', 'sa', 'tas', 'vic', 'wa'];
const ZONES = { act: 'Australia/Sydney', nsw: 'Australia/Sydney', vic: 'Australia/Melbourne', tas: 'Australia/Hobart', qld: 'Australia/Brisbane', sa: 'Australia/Adelaide', nt: 'Australia/Darwin', wa: 'Australia/Perth' };

// The site details, in the order they show. The keys are the SWMS's own, so a contractor's draft
// can take them as they are (stage 6). First aid location and site rules are new.
const FIELDS = [
  { key: 'musterPoint', label: 'Muster point' },
  { key: 'firstAider', label: 'First aider' },
  { key: 'firstAidLocation', label: 'First aid location' },
  { key: 'hospital', label: 'Hospital or medical centre' },
  { key: 'scaffoldSupervisor', label: 'Scaffold supervisor' },
  { key: 'siteManager', label: 'Site manager' },
  { key: 'siteRules', label: 'Site rules', list: true },
];
const FIELD_LIMIT = 300;
const RULES_LIMIT = 40;
// Words that hold a place without saying anything. Printed on every contractor's SWMS, they would
// pass for an answer, so the box is left empty until the detail is known.
const PLACEHOLDER = /^(?:tbc|tba|tbd|to be confirmed|to be advised|unknown|\?+|-+|\.+|x+)$/i;

const EMPTY = Object.freeze(Object.fromEntries(FIELDS.map((field) => [field.key, field.list ? [] : ''])));
const oneLine = (value, max) => textField(value, max).replace(/\s+/g, ' ').trim();

function longDate(date, state) {
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: ZONES[state] || 'Australia/Sydney' }).format(new Date(date));
}
function dateTime(date, state) {
  const time = new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: ZONES[state] || 'Australia/Sydney' }).format(new Date(date));
  return `${longDate(date, state)}, ${time.replace(/\s/g, ' ').toLowerCase()}`;
}

// The details as typed: each box one line, the site rules one per line (a list or lines of text),
// with any bullet or number at the start taken off. A placeholder such as "TBC" is refused at its box.
function cleanDetails(body) {
  const out = {};
  for (const field of FIELDS) {
    const raw = body ? body[field.key] : undefined;
    if (field.list) {
      const lines = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/\r?\n/) : [];
      out[field.key] = lines.filter((line) => typeof line === 'string')
        .map((line) => oneLine(line.replace(/^\s*(?:[-*•·]|\d{1,2}[.)])\s+/, ''), FIELD_LIMIT))
        .filter(Boolean).slice(0, RULES_LIMIT);
      const bad = out[field.key].find((line) => PLACEHOLDER.test(line));
      if (bad) throw Object.assign(fail(400, `Take out the rule "${bad}". Add the site rules once you know them.`), { field: field.key });
    } else {
      out[field.key] = oneLine(raw, FIELD_LIMIT);
      if (PLACEHOLDER.test(out[field.key])) throw Object.assign(fail(400, `Leave ${field.label.toLowerCase()} empty until you know it. Contractors would see "${out[field.key]}" on their SWMS.`), { field: field.key });
    }
  }
  return out;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const filled = (details) => ({ ...EMPTY, ...(details || {}) });
const changedKeys = (from, to) => FIELDS.filter((field) => !same(filled(from)[field.key], filled(to)[field.key])).map((field) => field.key);
const labelOf = (key) => (FIELDS.find((field) => field.key === key) || {}).label || key;

// ---- Who is signed in, and what they have joined ----

const personName = (reviewer) => reviewer.name || reviewer.email;

function needName(req) {
  if (!req.reviewer.name) throw Object.assign(fail(400, 'Enter your name first. Contractors see it on the details you set.'), { field: 'name' });
}

// The person's place in an account they have joined, or a not found that says nothing of the account.
async function membership(req, orgId) {
  const id = String(orgId || '');
  const row = id && await db.one('SELECT * FROM org_members WHERE org_id = $1 AND reviewer_id = $2 AND joined_at IS NOT NULL', [id, req.reviewer.id]);
  if (!row) throw fail(404, 'That account was not found, or you are not in its team.');
  const org = await db.one('SELECT * FROM orgs WHERE id = $1', [id]);
  if (!org) throw fail(404, 'That account was not found, or you are not in its team.');
  return { org, role: row.role, member: row };
}

async function projectFor(req, projectId) {
  const id = String(projectId || '');
  const project = id && await db.one('SELECT * FROM projects WHERE id = $1', [id]);
  if (!project) throw fail(404, 'That project was not found.');
  try {
    return { project, ...(await membership(req, project.org_id)) };
  } catch {
    throw fail(404, 'That project was not found.');
  }
}

function requireLead(role, message) {
  if (role !== 'lead') throw fail(403, message);
}

// An invitation to the person's email becomes membership once they sign in with that email.
async function joinInvites(reviewer) {
  const waiting = await db.query('SELECT id FROM org_members WHERE email = $1 AND joined_at IS NULL', [reviewer.email]);
  for (const row of waiting) await db.query('UPDATE org_members SET reviewer_id = $1, joined_at = $2 WHERE id = $3', [reviewer.id, new Date(), row.id]);
}

function orgView(org, role) {
  return { id: org.id, name: org.name, abn: org.abn, role };
}

async function teamOf(orgId) {
  const rows = await db.query(
    `SELECT org_members.*, reviewers.name AS person_name, reviewers.position AS person_position, reviewers.phone AS person_phone
     FROM org_members LEFT JOIN reviewers ON reviewers.id = org_members.reviewer_id WHERE org_members.org_id = $1 ORDER BY org_members.invited_at`,
    [orgId],
  );
  const order = (row) => (row.role === 'lead' ? 0 : row.joined_at ? 1 : 2);
  return rows.sort((a, b) => order(a) - order(b)).map((row) => ({
    id: row.id,
    email: row.email,
    name: row.person_name || '',
    position: row.person_position || '',
    phone: row.person_phone || '',
    role: row.role,
    joined: Boolean(row.joined_at),
    invitedOn: longDate(row.invited_at),
  }));
}

// ---- Projects and site details ----

function projectView(project) {
  return {
    id: project.id, orgId: project.org_id, name: project.name, workplace: project.workplace, state: project.state, postcode: project.postcode,
    pcName: project.pc_name, status: project.status, createdOn: longDate(project.created_at, project.state),
  };
}

async function versionsOf(projectId) {
  return db.query('SELECT * FROM project_site_details WHERE project_id = $1 ORDER BY rev', [projectId]);
}

function detailsView(row, state) {
  if (!row) return { rev: 0, details: { ...EMPTY }, setBy: '', setAt: null, setOn: '' };
  return { rev: Number(row.rev), details: filled(row.details), setBy: row.set_by_name, setAt: row.set_at, setOn: dateTime(row.set_at, state) };
}

// Each version, newest first, with what it changed from the one before.
function versionList(rows, state) {
  return rows.map((row, i) => ({
    rev: Number(row.rev), setBy: row.set_by_name, setOn: dateTime(row.set_at, state),
    changed: changedKeys(i ? rows[i - 1].details : EMPTY, row.details).map(labelOf),
  })).reverse();
}

// The project's log so far: when it was set up and each version of the site details. Later stages
// add lists sent, submissions, reviews and plan notices.
function logOf(project, creatorName, rows) {
  const entries = rows.map((row, i) => {
    const changed = changedKeys(i ? rows[i - 1].details : EMPTY, row.details).map((key) => labelOf(key).toLowerCase());
    return { at: row.set_at, when: dateTime(row.set_at, project.state), text: `${row.set_by_name} set site details version ${row.rev}${changed.length ? `: ${changed.join(', ')}` : ''}.` };
  });
  entries.push({ at: project.created_at, when: dateTime(project.created_at, project.state), text: `${creatorName} set up the project.` });
  return entries.sort((a, b) => new Date(b.at) - new Date(a.at)).map(({ when, text }) => ({ when, text }));
}

function cleanProject(body, org) {
  const name = oneLine(body && body.name, 160);
  const workplace = oneLine(body && body.workplace, 300);
  const state = String((body && body.state) || '').toLowerCase();
  if (!name) throw Object.assign(fail(400, 'Enter the project name.'), { field: 'name' });
  if (!workplace) throw Object.assign(fail(400, 'Enter the job address.'), { field: 'workplace' });
  if (!STATES.includes(state)) throw Object.assign(fail(400, 'Choose the state or territory the work is in.'), { field: 'state' });
  const postcodes = workplace.match(/\b\d{4}\b/g) || [];
  return { name, workplace, state, postcode: postcodes.length ? postcodes[postcodes.length - 1] : '', pcName: oneLine(body && body.pcName, 200) || org.name };
}

// ---- Signing in ----

router.post('/hse/email', route(async (req, res) => {
  const email = auth.cleanEmail(req.body && req.body.email);
  if (!email) throw Object.assign(fail(400, 'Enter a valid email address.'), { field: 'email' });
  await auth.sendHseLink(req, email);
  res.json({ ok: true, message: `A sign-in link has been sent to ${email}. It expires in 20 minutes.` });
}));

router.post('/hse/verify', route(async (req, res) => {
  res.json({ token: await auth.finishReviewerLogin(String((req.body && req.body.token) || '')) });
}));

router.use('/hse', auth.readReviewer, auth.requireReviewer);

router.post('/hse/logout', route(async (req, res) => {
  if (req.reviewerSessionHash) await db.query('DELETE FROM reviewer_sessions WHERE token_hash = $1', [req.reviewerSessionHash]);
  res.json({ ok: true });
}));

router.get('/hse/me', route(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  await joinInvites(req.reviewer);
  await db.query('UPDATE reviewers SET last_seen_at = $1 WHERE id = $2', [new Date(), req.reviewer.id]);
  const rows = await db.query('SELECT orgs.*, org_members.role FROM org_members JOIN orgs ON orgs.id = org_members.org_id WHERE org_members.reviewer_id = $1 AND org_members.joined_at IS NOT NULL ORDER BY orgs.created_at', [req.reviewer.id]);
  const orgs = [];
  for (const row of rows) {
    const projects = await db.query("SELECT * FROM projects WHERE org_id = $1 AND status = 'open' ORDER BY created_at DESC", [row.id]);
    orgs.push({ ...orgView(row, row.role), projects: projects.map(projectView) });
  }
  const { email, name, position, phone } = req.reviewer;
  res.json({ me: { email, name, position, phone }, orgs });
}));

router.put('/hse/me', route(async (req, res) => {
  const body = req.body || {};
  const name = oneLine(body.name, 120);
  if (!name) throw Object.assign(fail(400, 'Enter your name.'), { field: 'name' });
  const position = oneLine(body.position, 120);
  const phone = oneLine(body.phone, 40);
  await db.query('UPDATE reviewers SET name = $1, position = $2, phone = $3 WHERE id = $4', [name, position, phone, req.reviewer.id]);
  res.json({ me: { email: req.reviewer.email, name, position, phone } });
}));

// ---- The main contractor's account and its team ----

router.post('/hse/orgs', route(async (req, res) => {
  needName(req);
  const body = req.body || {};
  const name = oneLine(body.name, 200);
  if (!name) throw Object.assign(fail(400, 'Enter your company name, as contractors know it.'), { field: 'name' });
  const abn = String(body.abn || '').replace(/\D/g, '');
  if (abn && !validAbn(abn)) throw Object.assign(fail(400, 'That ABN is not valid. Check the 11 digits, or leave it empty.'), { field: 'abn' });
  const id = auth.newId();
  const now = new Date();
  await db.query('INSERT INTO orgs (id, name, abn, created_by, source, created_at) VALUES ($1, $2, $3, $4, $5, $6)', [id, name, abn, req.reviewer.id, 'hse-page', now]);
  await db.query('INSERT INTO org_members (id, org_id, email, reviewer_id, role, invited_by, invited_at, joined_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)',
    [auth.newId(), id, req.reviewer.email, req.reviewer.id, 'lead', req.reviewer.id, now]);
  record('org_created', null);
  res.status(201).json({ org: orgView(await db.one('SELECT * FROM orgs WHERE id = $1', [id]), 'lead') });
}));

router.get('/hse/orgs/:orgId', route(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { org, role } = await membership(req, req.params.orgId);
  res.json({ org: orgView(org, role), team: await teamOf(org.id) });
}));

router.put('/hse/orgs/:orgId', route(async (req, res) => {
  const { org, role } = await membership(req, req.params.orgId);
  requireLead(role, 'Only the lead can change the account details.');
  const body = req.body || {};
  const name = oneLine(body.name, 200);
  if (!name) throw Object.assign(fail(400, 'Enter your company name, as contractors know it.'), { field: 'name' });
  const abn = String(body.abn || '').replace(/\D/g, '');
  if (abn && !validAbn(abn)) throw Object.assign(fail(400, 'That ABN is not valid. Check the 11 digits, or leave it empty.'), { field: 'abn' });
  await db.query('UPDATE orgs SET name = $1, abn = $2 WHERE id = $3', [name, abn, org.id]);
  res.json({ org: orgView(await db.one('SELECT * FROM orgs WHERE id = $1', [org.id]), role) });
}));

router.post('/hse/orgs/:orgId/members', route(async (req, res) => {
  const { org, role } = await membership(req, req.params.orgId);
  requireLead(role, 'Only the lead can add people to the team.');
  needName(req);
  const email = auth.cleanEmail(req.body && req.body.email);
  if (!email) throw Object.assign(fail(400, 'Enter a valid email address.'), { field: 'email' });
  const existing = await db.one('SELECT * FROM org_members WHERE org_id = $1 AND email = $2', [org.id, email]);
  if (existing && existing.joined_at) throw Object.assign(fail(409, `${email} is already in the team.`), { field: 'email' });
  if (existing) await db.query('UPDATE org_members SET invited_by = $1, invited_at = $2 WHERE id = $3', [req.reviewer.id, new Date(), existing.id]);
  else {
    await db.query('INSERT INTO org_members (id, org_id, email, reviewer_id, role, invited_by, invited_at, joined_at) VALUES ($1, $2, $3, NULL, $4, $5, $6, NULL)',
      [auth.newId(), org.id, email, 'member', req.reviewer.id, new Date()]);
  }
  await auth.sendHseLink(req, email, { invitedBy: personName(req.reviewer), orgName: org.name });
  record('org_invite', null);
  res.status(existing ? 200 : 201).json({ ok: true, message: existing ? `The invitation to ${email} has been sent again.` : `An invitation has been sent to ${email}.`, team: await teamOf(org.id) });
}));

router.delete('/hse/orgs/:orgId/members/:memberId', route(async (req, res) => {
  const { org, role } = await membership(req, req.params.orgId);
  const row = await db.one('SELECT * FROM org_members WHERE id = $1 AND org_id = $2', [String(req.params.memberId || ''), org.id]);
  if (!row) throw fail(404, 'That person is not in the team.');
  if (row.role === 'lead') throw fail(403, 'The lead cannot be removed.');
  requireLead(role, 'Only the lead can remove people from the team.');
  await db.query('DELETE FROM org_members WHERE id = $1', [row.id]);
  res.json({ ok: true, message: row.joined_at ? `${row.email} has been removed from the team.` : `The invitation to ${row.email} has been cancelled.`, team: await teamOf(org.id) });
}));

// ---- Projects ----

router.get('/hse/orgs/:orgId/projects', route(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { org } = await membership(req, req.params.orgId);
  const rows = await db.query('SELECT * FROM projects WHERE org_id = $1 ORDER BY created_at DESC', [org.id]);
  res.json({ projects: rows.map(projectView) });
}));

router.post('/hse/orgs/:orgId/projects', route(async (req, res) => {
  const { org } = await membership(req, req.params.orgId);
  needName(req);
  const fields = cleanProject(req.body, org);
  const id = auth.newId();
  await db.query('INSERT INTO projects (id, org_id, name, workplace, state, postcode, pc_name, log_token, status, created_by, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
    [id, org.id, fields.name, fields.workplace, fields.state, fields.postcode, fields.pcName, auth.newToken().slice(0, 16).toLowerCase(), 'open', req.reviewer.id, new Date()]);
  record('project_created', null);
  res.status(201).json({ project: projectView(await db.one('SELECT * FROM projects WHERE id = $1', [id])) });
}));

async function projectPage(project, org, role) {
  const rows = await versionsOf(project.id);
  const creator = await db.one('SELECT name, email FROM reviewers WHERE id = $1', [project.created_by]);
  return {
    project: projectView(project),
    org: orgView(org, role),
    siteDetails: detailsView(rows[rows.length - 1], project.state),
    versions: versionList(rows, project.state),
    team: await teamOf(org.id),
    log: logOf(project, creator ? personName(creator) : 'Someone', rows),
    fields: FIELDS,
  };
}

router.get('/hse/projects/:projectId', route(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { project, org, role } = await projectFor(req, req.params.projectId);
  res.json(await projectPage(project, org, role));
}));

router.put('/hse/projects/:projectId', route(async (req, res) => {
  const { project, org, role } = await projectFor(req, req.params.projectId);
  const fields = cleanProject(req.body, org);
  await db.query('UPDATE projects SET name = $1, workplace = $2, state = $3, postcode = $4, pc_name = $5 WHERE id = $6',
    [fields.name, fields.workplace, fields.state, fields.postcode, fields.pcName, project.id]);
  res.json(await projectPage(await db.one('SELECT * FROM projects WHERE id = $1', [project.id]), org, role));
}));

router.get('/hse/projects/:projectId/site-details/:rev', route(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { project } = await projectFor(req, req.params.projectId);
  const row = await db.one('SELECT * FROM project_site_details WHERE project_id = $1 AND rev = $2', [project.id, Number(req.params.rev) || 0]);
  if (!row) throw fail(404, 'That version was not found.');
  res.json({ siteDetails: detailsView(row, project.state) });
}));

// A change to the site details is a new version. The page sends the version it started from. If
// someone else saved since, their change and this one are both kept when they touch different
// details; when both changed the same detail differently, nothing is saved and the person is
// shown what was saved, to decide.
router.put('/hse/projects/:projectId/site-details', route(async (req, res) => {
  const { project, org, role } = await projectFor(req, req.params.projectId);
  needName(req);
  const body = req.body || {};
  const mine = cleanDetails(body.details);
  const baseRev = Number(body.baseRev);
  if (!Number.isInteger(baseRev) || baseRev < 0) throw fail(400, 'Refresh the page, then make your change again.');
  const rows = await versionsOf(project.id);
  const latest = rows[rows.length - 1] || null;
  const currentRev = latest ? Number(latest.rev) : 0;
  const current = filled(latest && latest.details);
  let next = mine;
  let theirs = [];
  if (baseRev !== currentRev) {
    const base = baseRev === 0 ? { ...EMPTY } : rows.find((row) => Number(row.rev) === baseRev);
    if (!base || baseRev > currentRev) throw fail(400, 'Refresh the page, then make your change again.');
    const from = filled(base.details || base);
    const changedByMe = changedKeys(from, mine);
    theirs = changedKeys(from, current);
    const clash = changedByMe.filter((key) => theirs.includes(key) && !same(mine[key], current[key]));
    if (clash.length) {
      throw Object.assign(fail(409, `${latest.set_by_name} saved version ${currentRev} while you were editing, and changed ${clash.map((key) => labelOf(key).toLowerCase()).join(', ')} too. Your changes are not saved yet. Choose which to keep, then save again.`), {
        conflict: { clash, current: detailsView(latest, project.state) },
      });
    }
    next = { ...current };
    for (const key of changedByMe) next[key] = mine[key];
  }
  if (same(filled(next), current)) {
    res.json({ saved: false, message: 'Nothing has changed, so no new version was made.', ...(await projectPage(project, org, role)) });
    return;
  }
  const rev = currentRev + 1;
  try {
    await db.query('INSERT INTO project_site_details (project_id, rev, details, set_by, set_by_name, set_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [project.id, rev, JSON.stringify(filled(next)), req.reviewer.id, personName(req.reviewer), new Date()]);
  } catch (error) {
    // Two saves at the same moment: the first is kept, and this one is asked again.
    if (await db.one('SELECT rev FROM project_site_details WHERE project_id = $1 AND rev = $2', [project.id, rev])) {
      throw fail(409, 'Someone saved the site details at the same moment. Check them, then save again.');
    }
    throw error;
  }
  record('site_details_set', null);
  const merged = theirs.filter((key) => !changedKeys(current, next).includes(key));
  res.json({
    saved: true,
    message: merged.length ? `Saved as version ${rev}. ${latest.set_by_name} had also changed ${merged.map((key) => labelOf(key).toLowerCase()).join(', ')}. Both changes are kept.` : `Saved as version ${rev}.`,
    ...(await projectPage(project, org, role)),
  });
}));

module.exports = { router, FIELDS, cleanDetails, EMPTY };
