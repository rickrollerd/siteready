// SiteLink, the main contractor's side of Goal 12 (stage 3, D303): the HSE lead and team, their
// account, their projects and the site details every contractor on a project must use. The lead and team sign in
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
const abnRegister = require('./abn');
const answers = require('./sitelink-answers');
const testHooks = require('./testhooks');
const { stateFromTyped } = require('./public/address');

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
// with any bullet or number at the start taken off. A placeholder such as "TBC" is refused at its box,
// and so is an answer the SWMS app would refuse ("me", "carpark", a first name only, a short phone):
// every problem is named at once, each at its own box (messy round 6: five saves for five problems).
const PEOPLE = { firstAider: { firstAider: true }, siteManager: {}, scaffoldSupervisor: { example: 'Pat Doyle, Tallow Scaffolding, 0412 345 678' } };
const PLACES = ['musterPoint', 'firstAidLocation'];
function detailProblem(field, value) {
  if (PEOPLE[field.key]) return answers.personProblem(value, PEOPLE[field.key]);
  if (PLACES.includes(field.key)) return answers.placeProblem(value);
  if (field.key === 'hospital') return answers.hospitalProblem(value);
  return answers.notAnswer(value);
}

// Several problems at once: one message for the top of the form, and each box's own (fields).
function problems(found, fieldsList) {
  const keys = Object.keys(found);
  if (!keys.length) return;
  if (keys.length === 1) throw Object.assign(fail(400, found[keys[0]]), { field: keys[0], fields: found });
  const names = keys.map((key) => ((fieldsList || []).find((field) => field.key === key) || { label: key }).label.toLowerCase());
  throw Object.assign(fail(400, `${keys.length} details need changing before they can be saved: ${answers.listed(names)}. Each box says why.`), { field: keys[0], fields: found });
}

function cleanDetails(body) {
  const out = {};
  const found = {};
  for (const field of FIELDS) {
    const raw = body ? body[field.key] : undefined;
    if (field.list) {
      const lines = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/\r?\n/) : [];
      out[field.key] = lines.filter((line) => typeof line === 'string')
        .map((line) => oneLine(line.replace(/^\s*(?:[-*•·]|\d{1,2}[.)])\s+/, ''), FIELD_LIMIT))
        .filter(Boolean).slice(0, RULES_LIMIT);
      const bad = out[field.key].find((line) => PLACEHOLDER.test(line));
      const weak = bad ? '' : out[field.key].map((line) => answers.notAnswer(line)).find(Boolean);
      if (bad) found[field.key] = `Take out the rule "${bad}". Add the site rules once you know them.`;
      else if (weak) found[field.key] = `${weak} Write the rule in full, or take it out.`;
    } else {
      out[field.key] = oneLine(raw, FIELD_LIMIT);
      if (PLACEHOLDER.test(out[field.key])) found[field.key] = `Leave ${field.label.toLowerCase()} empty until you know it. Contractors would see "${out[field.key]}" on their SWMS.`;
      else {
        const weak = detailProblem(field, out[field.key]);
        if (weak) found[field.key] = weak;
      }
    }
  }
  problems(found, FIELDS);
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

// ---- The account's ABN and the ABN register (D303) ----
// The ABN links the account to the company: it is given when the account is set up, and cannot be
// changed. The account shows Unverified until the register lists that ABN as active under the
// account's name (its legal name or one of its business names). When the register is not set up or
// not reachable, the account stays Unverified and nothing else stops.

const abnDigits = (value) => String(value || '').replace(/\D/g, '');
const formatAbn = (abn) => (abn.length === 11 ? `${abn.slice(0, 2)} ${abn.slice(2, 5)} ${abn.slice(5, 8)} ${abn.slice(8)}` : abn);
// Where people write to SiteWrite: SUPPORT_EMAIL, else the address the app's privacy policy and terms
// already give.
const supportEmail = () => String(process.env.SUPPORT_EMAIL || 'sitereadyaus@gmail.com').trim();
const ABN_FIXED = 'The ABN links this account and cannot be changed. If it is wrong, contact SiteWrite.';
const ABN_TAKEN = 'An account with this ABN is already on SiteLink. Ask that account\'s lead to add you to its team, then sign in with the email they used. You do not need a second account.';

// A company name the way the register and people both write it: no case, no punctuation, and no
// "Pty", "Ltd" or "The".
function companyKey(name) {
  return String(name || '').toLowerCase().replace(/&/g, ' and ').replace(/\bproprietary\b/g, 'pty').replace(/\blimited\b/g, 'ltd')
    .replace(/[^a-z0-9]+/g, ' ').split(' ').filter((word) => word && !['pty', 'ltd', 'the'].includes(word)).join(' ');
}
// The register writes most names in capitals. Offered as an account name, "CORBEL BUILD PTY LTD"
// reads as "Corbel Build Pty Ltd"; a short word with no vowel ("NSW") stays in capitals.
function readableCompany(name) {
  const value = String(name || '').trim();
  if (/[a-z]/.test(value)) return value;
  return value.replace(/[A-Z0-9'’]+/g, (word) => (word.length <= 3 && word !== 'LTD' && !/[AEIOUY]/.test(word) ? word : word.charAt(0) + word.slice(1).toLowerCase()));
}
const namesMatch = (name, names) => Boolean(companyKey(name)) && names.some((other) => companyKey(other) === companyKey(name));
const keptNames = (org) => {
  if (!org || !['verified', 'name'].includes(org.abn_check)) return [];
  try { return JSON.parse(org.abn_names || '[]').filter((item) => typeof item === 'string'); } catch { return []; }
};

// What the register says of this ABN for this name. A name the register gave before still counts
// while the register cannot be reached.
async function checkAbn(abn, name, kept = []) {
  let found = null;
  try { found = await abnRegister.lookupAbn(abn); } catch { found = null; }
  if (!found || !found.enabled || found.unavailable) {
    return kept.length ? { check: namesMatch(name, kept) ? 'verified' : 'name', names: kept } : { check: 'unavailable', names: [] };
  }
  if (!found.found) return { check: 'missing', names: [] };
  const names = [found.entityName, ...(found.businessNames || [])].filter(Boolean);
  if (!found.active) return { check: 'cancelled', names };
  return { check: namesMatch(name, names) ? 'verified' : 'name', names };
}

const duplicateKey = (error) => Boolean(error) && (error.code === '23505' || /duplicate key/i.test(String(error.message || '')));

async function refuseTakenAbn(abn) {
  if (await db.one('SELECT id FROM orgs WHERE abn = $1', [abn])) throw Object.assign(fail(409, ABN_TAKEN), { field: 'abn', taken: true });
}

// Staging testers (messy round 6): with the test hooks on (testhooks.js), an account set up by a test
// address does not ask the live ABN register, so a made-up ABN with the right check digits is set up
// Unverified, never refused. Production never has the hooks on, so nothing changes there.
const testSetUp = (reviewer) => Boolean(reviewer) && testHooks.enabled() && testHooks.isTestAddress(reviewer.email);

// What to do about an ABN the register does not list. The check digits are right, so the digits may
// be too: a company registered in the last few days may not be listed yet.
const notListed = (abn) => `The ABN register does not list ABN ${formatAbn(abn)}. Check it against the company's records. A company registered in the last few days may not be listed yet: try again in a few days, or contact SiteWrite at ${supportEmail()}.`;

// A new ABN for an account (when it is set up): valid, not held by another account, and on the
// register. When the register lists another name, the person is asked before the account is set up
// unverified, because the ABN cannot be changed afterwards.
async function newAbn(body, name, reviewer) {
  const abn = abnDigits(body.abn);
  if (!abn) throw Object.assign(fail(400, 'Enter the company\'s ABN. It links this account to your company.'), { field: 'abn' });
  if (!validAbn(abn)) throw Object.assign(fail(400, 'That ABN is not valid. Check the 11 digits.'), { field: 'abn' });
  await refuseTakenAbn(abn);
  if (testSetUp(reviewer)) return { abn, check: 'unavailable', names: [] };
  const result = await checkAbn(abn, name);
  if (result.check === 'missing') throw Object.assign(fail(400, notListed(abn)), { field: 'abn' });
  if (result.check === 'cancelled') throw Object.assign(fail(400, 'The ABN register shows that ABN as cancelled. Check the 11 digits, or enter the company\'s current ABN.'), { field: 'abn' });
  if (result.check === 'name' && !body.keepName) {
    const listedName = readableCompany(result.names[0]);
    throw Object.assign(fail(409, `The ABN register lists ABN ${formatAbn(abn)} under ${listedName}, not ${name}. Check the ABN. If it is right, use the name on the register.`), {
      field: 'abn', register: { name: listedName },
    });
  }
  return { abn, ...result };
}

const checkColumns = (result, org, now) => [result.check, JSON.stringify(result.names), now, result.check === 'verified' ? (org && org.abn_verified_at) || now : null];

// What the account's tag and settings say about its ABN.
function abnNote(org) {
  const names = keptNames(org);
  if (!org.abn) return 'Add the company\'s ABN. The account shows Unverified until its ABN matches the ABN register.';
  if (org.abn_verified_at) return 'The ABN matches the ABN register.';
  // The register's name is shown, not offered: a lookalike account must not take another company's name
  // in one click (messy round 6). The company itself writes to SiteWrite.
  if (org.abn_check === 'name' && names.length) return `The ABN register lists this ABN under ${readableCompany(names[0])}. The account shows Unverified. If this account is for ${readableCompany(names[0])}, contact SiteWrite at ${supportEmail()} to have it checked.`;
  if (org.abn_check === 'cancelled') return 'The ABN register shows this ABN as cancelled. The account shows Unverified.';
  if (org.abn_check === 'missing') return 'This ABN is not on the ABN register. The account shows Unverified.';
  return 'The ABN register could not be checked yet. The account shows Unverified until it is.';
}

function orgView(org, role) {
  const names = keptNames(org);
  return {
    id: org.id, name: org.name, abn: org.abn, abnShown: formatAbn(org.abn || ''), role,
    verified: Boolean(org.abn_verified_at), abnCheck: org.abn_check || '', registerName: org.abn_check === 'name' ? readableCompany(names[0]) : '', abnNote: abnNote(org), support: supportEmail(),
  };
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

// One entry in a project's log (project_events): subcontracts added, scopes read, list changes and
// invitations. projectId '' is the whole account (an invitation), shown on each of its projects.
async function logEvent({ orgId, projectId = '', who = '', text }) {
  if (!db.enabled()) return;
  await db.query('INSERT INTO project_events (id, org_id, project_id, who, text, created_at) VALUES ($1, $2, $3, $4, $5, $6)', [auth.newId(), orgId, projectId, who, String(text).slice(0, 500), new Date()]);
}

// The project's log: when it was set up, each version of the site details, and the other entries
// (logEvent). Later stages add lists sent, submissions, reviews and plan notices.
function logOf(project, creatorName, rows, events = []) {
  const entries = rows.map((row, i) => {
    const changed = changedKeys(i ? rows[i - 1].details : EMPTY, row.details).map((key) => labelOf(key).toLowerCase());
    return { at: row.set_at, when: dateTime(row.set_at, project.state), text: `${row.set_by_name} set site details version ${row.rev}${changed.length ? `: ${changed.join(', ')}` : ''}.` };
  });
  for (const event of events) entries.push({ at: event.created_at, when: dateTime(event.created_at, project.state), text: event.text });
  entries.push({ at: project.created_at, when: dateTime(project.created_at, project.state), text: `${creatorName} set up the project.` });
  return entries.sort((a, b) => new Date(b.at) - new Date(a.at)).map(({ when, text }) => ({ when, text }));
}

// An address typed all in lower case is kept as an address reads: "120 kingsford smith dr hamilton
// qld" becomes "120 Kingsford Smith Dr Hamilton QLD" (messy round 6: it reached the subcontractor's list
// in lower case).
const STATE_SHORT = /^(?:nsw|vic|qld|sa|wa|tas|nt|act)$/i;
function tidyAddress(text) {
  const value = oneLine(text, 300);
  if (!value || /[A-Z]/.test(value)) return value;
  return value.split(' ').map((word) => (STATE_SHORT.test(word.replace(/[,.]$/, '')) ? word.toUpperCase() : word.replace(/^([a-z])/, (letter) => letter.toUpperCase()))).join(' ');
}

function cleanProject(body, org) {
  const name = oneLine(body && body.name, 160);
  const workplace = tidyAddress(body && body.workplace);
  // The state chosen, else the state the address names, as the SWMS app reads a typed address
  // ("hamilton qld", "qld", a postcode).
  const state = String((body && body.state) || stateFromTyped(workplace).state || '').toLowerCase();
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

// The lead's name heads every invitation and sits on the site details contractors use, and the phone
// is the one they ring: both are judged as the SWMS app judges a person and a phone.
router.put('/hse/me', route(async (req, res) => {
  const body = req.body || {};
  const name = answers.tidyName(oneLine(body.name, 120));
  if (!name) throw Object.assign(fail(400, 'Enter your name.'), { field: 'name' });
  const position = oneLine(body.position, 120);
  const phone = oneLine(body.phone, 40);
  const found = {};
  const nameProblem = answers.personProblem(name, { example: 'Jo Park' });
  if (nameProblem) found.name = nameProblem.replace('Give their full name', 'Give your full name').replace('Give the full name', 'Give your full name');
  const positionProblem = answers.notAnswer(position);
  if (positionProblem) found.position = positionProblem;
  const phoneProblem = answers.phoneOnly(phone);
  if (phoneProblem) found.phone = phoneProblem;
  problems(found, [{ key: 'name', label: 'Your name' }, { key: 'position', label: 'Your role' }, { key: 'phone', label: 'Phone' }]);
  await db.query('UPDATE reviewers SET name = $1, position = $2, phone = $3 WHERE id = $4', [name, position, phone, req.reviewer.id]);
  res.json({ me: { email: req.reviewer.email, name, position, phone } });
}));

// ---- The main contractor's account and its team ----

const SET_UP_NEXT = 'Make your first project, then set its site details.';
const checkMessage = (check) => ({
  verified: 'Its ABN matches the ABN register.',
  name: 'It shows Unverified until its name matches the ABN register.',
  unavailable: 'The ABN register could not be checked just now, so the account shows Unverified for now.',
})[check] || 'It shows Unverified.';

router.post('/hse/orgs', route(async (req, res) => {
  needName(req);
  const body = req.body || {};
  const name = oneLine(body.name, 200);
  if (!name) throw Object.assign(fail(400, 'Enter your company name, as contractors know it.'), { field: 'name' });
  const checked = await newAbn(body, name, req.reviewer);
  const id = auth.newId();
  const now = new Date();
  try {
    await db.query('INSERT INTO orgs (id, name, abn, created_by, source, created_at, abn_check, abn_names, abn_checked_at, abn_verified_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [id, name, checked.abn, req.reviewer.id, 'hse-page', now, ...checkColumns(checked, null, now)]);
  } catch (error) {
    // Two people set up the same ABN at the same moment: the first is kept.
    if (duplicateKey(error)) throw Object.assign(fail(409, ABN_TAKEN), { field: 'abn', taken: true });
    throw error;
  }
  await db.query('INSERT INTO org_members (id, org_id, email, reviewer_id, role, invited_by, invited_at, joined_at, lead_of) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $2)',
    [auth.newId(), id, req.reviewer.email, req.reviewer.id, 'lead', req.reviewer.id, now]);
  record('org_created', null);
  res.status(201).json({
    org: orgView(await db.one('SELECT * FROM orgs WHERE id = $1', [id]), 'lead'),
    message: `Your account is set up. ${checkMessage(checked.check)} ${SET_UP_NEXT}`,
  });
}));

router.get('/hse/orgs/:orgId', route(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { org, role } = await membership(req, req.params.orgId);
  res.json({ org: orgView(org, role), team: await teamOf(org.id) });
}));

// The lead changes the account's name. The ABN cannot be changed (D303). An account set up before
// the ABN was asked for can be given one, once, with the same checks as setting up.
router.put('/hse/orgs/:orgId', route(async (req, res) => {
  const { org, role } = await membership(req, req.params.orgId);
  requireLead(role, 'Only the lead can change the account details.');
  const body = req.body || {};
  const name = oneLine(body.name, 200);
  if (!name) throw Object.assign(fail(400, 'Enter your company name, as contractors know it.'), { field: 'name' });
  const sent = body.abn === undefined || body.abn === null ? '' : abnDigits(body.abn);
  let checked;
  if (org.abn) {
    if (sent && sent !== org.abn) throw Object.assign(fail(400, ABN_FIXED), { field: 'abn' });
    checked = { abn: org.abn, ...(testSetUp(req.reviewer) ? { check: org.abn_check || 'unavailable', names: keptNames(org) } : await checkAbn(org.abn, name, keptNames(org))) };
  } else if (sent) {
    checked = await newAbn(body, name, req.reviewer);
  } else {
    checked = { abn: '', check: '', names: [] };
  }
  const now = new Date();
  try {
    await db.transaction(async (tx) => {
      // With the account locked, an ABN given at the same moment by someone else is not replaced.
      const locked = await tx.one('SELECT abn FROM orgs WHERE id = $1 FOR UPDATE', [org.id]);
      if (!locked || (locked.abn && locked.abn !== checked.abn)) throw Object.assign(fail(400, ABN_FIXED), { field: 'abn' });
      await tx.query('UPDATE orgs SET name = $1, abn = $2, abn_check = $3, abn_names = $4, abn_checked_at = $5, abn_verified_at = $6 WHERE id = $7',
        [name, checked.abn, ...checkColumns(checked, org, now), org.id]);
    });
  } catch (error) {
    if (duplicateKey(error)) throw Object.assign(fail(409, ABN_TAKEN), { field: 'abn', taken: true });
    throw error;
  }
  const saved = await db.one('SELECT * FROM orgs WHERE id = $1', [org.id]);
  res.json({
    org: orgView(saved, role),
    team: await teamOf(org.id),
    // When it is still Unverified, the settings say why beside the ABN.
    message: `The account details are saved.${saved.abn_verified_at ? ' The account is verified: its ABN matches the ABN register.' : ''}`,
  });
}));

// The register is asked again, for an account set up while it could not be reached.
router.post('/hse/orgs/:orgId/abn-check', route(async (req, res) => {
  const { org, role } = await membership(req, req.params.orgId);
  requireLead(role, 'Only the lead can change the account details.');
  if (!org.abn) throw Object.assign(fail(400, 'Add the company\'s ABN first.'), { field: 'abn' });
  const checked = testSetUp(req.reviewer) ? { check: 'unavailable', names: [] } : await checkAbn(org.abn, org.name, keptNames(org));
  await db.query('UPDATE orgs SET abn_check = $1, abn_names = $2, abn_checked_at = $3, abn_verified_at = $4 WHERE id = $5', [...checkColumns(checked, org, new Date()), org.id]);
  const saved = await db.one('SELECT * FROM orgs WHERE id = $1', [org.id]);
  res.json({
    org: orgView(saved, role),
    message: saved.abn_verified_at ? 'The account is verified: its ABN matches the ABN register.' : checked.check === 'unavailable' ? 'The ABN register could not be checked just now. Try again later.' : abnNote(saved),
  });
}));

// The lead hands the lead role to someone who has joined the team. The old lead becomes a member.
// The account's row is locked while the roles change, so two handovers at once cannot both pass,
// and there is always one lead (and the database allows no more than one).
router.post('/hse/orgs/:orgId/members/:memberId/lead', route(async (req, res) => {
  const { org, role, member } = await membership(req, req.params.orgId);
  requireLead(role, 'Only the lead can hand over the lead role.');
  const memberId = String(req.params.memberId || '');
  const message = await db.transaction(async (tx) => {
    await tx.query('SELECT id FROM orgs WHERE id = $1 FOR UPDATE', [org.id]);
    const me = await tx.one('SELECT * FROM org_members WHERE id = $1 AND org_id = $2', [member.id, org.id]);
    if (!me || me.role !== 'lead') throw fail(403, 'Only the lead can hand over the lead role.');
    const target = await tx.one('SELECT * FROM org_members WHERE id = $1 AND org_id = $2', [memberId, org.id]);
    if (!target) throw fail(404, 'That person is not in the team.');
    if (target.id === me.id) throw fail(400, 'You are already the lead.');
    if (!target.joined_at || !target.reviewer_id) throw fail(400, `${target.email} has not signed in yet. They can be made lead once they have joined the team.`);
    const stepped = await tx.query("UPDATE org_members SET role = 'member', lead_of = NULL WHERE id = $1 AND role = 'lead' RETURNING id", [me.id]);
    if (stepped.length !== 1) throw fail(403, 'Only the lead can hand over the lead role.');
    const changed = 'The team changed while you were doing this. Refresh the page, then try again.';
    let made;
    try {
      made = await tx.query("UPDATE org_members SET role = 'lead', lead_of = org_id WHERE id = $1 AND org_id = $2 AND joined_at IS NOT NULL RETURNING id", [target.id, org.id]);
    } catch (error) {
      if (duplicateKey(error)) throw fail(409, changed);
      throw error;
    }
    if (made.length !== 1) throw fail(409, changed);
    const person = await tx.one('SELECT name FROM reviewers WHERE id = $1', [target.reviewer_id]);
    return `${(person && person.name) || target.email} is now the lead. You are now a member.`;
  });
  record('org_lead_changed', null);
  res.json({ ok: true, message, org: orgView(await db.one('SELECT * FROM orgs WHERE id = $1', [org.id]), 'member'), team: await teamOf(org.id) });
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
  await logEvent({ orgId: org.id, who: req.reviewer.id, text: existing ? `${personName(req.reviewer)} sent the invitation to ${email} again.` : `${personName(req.reviewer)} invited ${email} to the team.` });
  res.status(existing ? 200 : 201).json({ ok: true, message: existing ? `The invitation to ${email} has been sent again.` : `An invitation has been sent to ${email}.`, team: await teamOf(org.id) });
}));

router.delete('/hse/orgs/:orgId/members/:memberId', route(async (req, res) => {
  const { org, member } = await membership(req, req.params.orgId);
  // Read again with the account locked, so a handover at the same moment is seen.
  const row = await db.transaction(async (tx) => {
    await tx.query('SELECT id FROM orgs WHERE id = $1 FOR UPDATE', [org.id]);
    const found = await tx.one('SELECT * FROM org_members WHERE id = $1 AND org_id = $2', [String(req.params.memberId || ''), org.id]);
    if (!found) throw fail(404, 'That person is not in the team.');
    if (found.role === 'lead') throw fail(403, 'The lead cannot be removed.');
    const me = await tx.one('SELECT role FROM org_members WHERE id = $1', [member.id]);
    requireLead(me && me.role, 'Only the lead can remove people from the team.');
    await tx.query("DELETE FROM org_members WHERE id = $1 AND role <> 'lead'", [found.id]);
    return found;
  });
  await logEvent({ orgId: org.id, who: req.reviewer.id, text: row.joined_at ? `${personName(req.reviewer)} removed ${row.email} from the team.` : `${personName(req.reviewer)} cancelled the invitation to ${row.email}.` });
  res.json({ ok: true, message: row.joined_at ? `${row.email} has been removed from the team.` : `The invitation to ${row.email} has been cancelled.`, team: await teamOf(org.id) });
}));

// A member leaves the team. The lead cannot leave, as an account always has a lead: they hand the
// lead role to someone first.
router.post('/hse/orgs/:orgId/leave', route(async (req, res) => {
  const { org, member } = await membership(req, req.params.orgId);
  await db.transaction(async (tx) => {
    await tx.query('SELECT id FROM orgs WHERE id = $1 FOR UPDATE', [org.id]);
    const me = await tx.one('SELECT role FROM org_members WHERE id = $1', [member.id]);
    if (!me) throw fail(404, 'That account was not found, or you are not in its team.');
    if (me.role === 'lead') throw fail(403, 'The lead cannot leave the team. Make someone else lead first, in Account settings.');
    await tx.query("DELETE FROM org_members WHERE id = $1 AND role <> 'lead'", [member.id]);
  });
  await logEvent({ orgId: org.id, who: req.reviewer.id, text: `${personName(req.reviewer)} left the team.` });
  res.json({ ok: true, message: `You have left ${org.name}. You no longer see its projects.` });
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

// Details this person set that a teammate's newer version changed (messy round 6: the lead learned only
// from the log that Sam's version 5 replaced her muster point). Said on the project screen while that
// version is the current one.
function replacedFor(rows, viewerId) {
  const latest = rows[rows.length - 1];
  if (!latest || !viewerId || latest.set_by === viewerId || rows.length < 2) return null;
  const keys = changedKeys(rows[rows.length - 2].details, latest.details).filter((key) => {
    for (let i = rows.length - 2; i >= 0; i -= 1) {
      if (changedKeys(i ? rows[i - 1].details : EMPTY, rows[i].details).includes(key)) return rows[i].set_by === viewerId;
    }
    return false;
  });
  if (!keys.length) return null;
  return { by: latest.set_by_name, rev: Number(latest.rev), details: keys.map((key) => labelOf(key).toLowerCase()) };
}

async function projectPage(project, org, role, viewerId = '') {
  const rows = await versionsOf(project.id);
  const creator = await db.one('SELECT name, email FROM reviewers WHERE id = $1', [project.created_by]);
  const events = await db.query("SELECT * FROM project_events WHERE org_id = $1 AND (project_id = $2 OR (project_id = '' AND created_at >= $3)) ORDER BY created_at DESC LIMIT 200", [org.id, project.id, project.created_at]);
  // Stage 5: lists sent, reminders, links opened, uploads and claims (project_log).
  for (const row of await require('./sitelink-send').logOf(project.id)) events.push({ created_at: row.created_at, text: row.summary });
  return {
    project: projectView(project),
    org: orgView(org, role),
    // Stage 4: each subcontract with its SWMS list count, and the project's free readings.
    ...(await scopes.projectSubcontracts(project, org)),
    siteDetails: detailsView(rows[rows.length - 1], project.state),
    versions: versionList(rows, project.state),
    team: await teamOf(org.id),
    log: logOf(project, creator ? personName(creator) : 'Someone', rows, events),
    replaced: replacedFor(rows, viewerId),
    fields: FIELDS,
  };
}

router.get('/hse/projects/:projectId', route(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { project, org, role } = await projectFor(req, req.params.projectId);
  res.json(await projectPage(project, org, role, req.reviewer.id));
}));

router.put('/hse/projects/:projectId', route(async (req, res) => {
  const { project, org, role } = await projectFor(req, req.params.projectId);
  const fields = cleanProject(req.body, org);
  await db.query('UPDATE projects SET name = $1, workplace = $2, state = $3, postcode = $4, pc_name = $5 WHERE id = $6',
    [fields.name, fields.workplace, fields.state, fields.postcode, fields.pcName, project.id]);
  res.json(await projectPage(await db.one('SELECT * FROM projects WHERE id = $1', [project.id]), org, role, req.reviewer.id));
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
    res.json({ saved: false, message: 'Nothing has changed, so no new version was made.', ...(await projectPage(project, org, role, req.reviewer.id)) });
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
    ...(await projectPage(project, org, role, req.reviewer.id)),
  });
}));

// ---- Subcontracts and their scopes (stage 4, sitelink-scopes.js) ----

const scopes = require('./sitelink-scopes').install(router, { projectFor, needName, personName, dateTime, detailsView, versionsOf, FIELDS, logEvent, supportEmail });

// ---- Sending the list, the list page, reminders and the project log (stage 5, sitelink-send.js) ----

require('./sitelink-send').install(router, { subcontractFor: scopes.subcontractFor, subcontractPage: scopes.subcontractPage, versionsOf, detailsView, FIELDS, dateTime, zones: ZONES });

module.exports = { router, FIELDS, cleanDetails, EMPTY, readableCompany, companyKey, tidyAddress, supportEmail };
