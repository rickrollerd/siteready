// SiteLink, Goal 12 stage 6: the subcontractor's drafts (plan section I, stage 6, and section D).
//
// A company that took up a builder's list (stage 5, D308) finds it in SiteWrite under "From main
// contractors". Each list opens the one-go project page with its SWMS already listed, the builder's
// site details filled in, each marked "Set by {builder}", and the builder's answers to the scope's
// points shown. The company may change a detail the builder set; it is warned, by the builder's name,
// and the change is kept as an override for the builder to see on submission (stage 7). The
// company's own details (name, ABN, address, phone, email) always come from its own profile, never
// from the builder (public/builder-set.js).
//
// The company's work on the list is kept on the server (sub_progress), so the office can start on a
// desktop and the foreman finish on a phone. Only that company reads it. The main contractor never
// sees the drafts or the progress until a SWMS is submitted (stage 7): no route of the builder's reads
// sub_progress, and saving logs nothing to the project log. SWMS the company adds itself are its own,
// marked "Your own, not sent".
//
// Working on the drafts is creating SWMS, which needs a trial or subscription (D286). Seeing the
// list stays free.
//
// The lead of the builder's account can release a list taken up by the wrong company where no ABN was
// given (D311). The released company loses the list and cannot take it up again, unless the lead then
// gives the subcontract that company's ABN.
const express = require('express');
const db = require('./db');
const auth = require('./auth');
const handover = require('./handover');
const listMail = require('./list-mail');
const builderSet = require('./public/builder-set');
const { stable } = require('./public/check-parts');
const { record } = require('./events');

const { fail } = auth;
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const NOT_FOUND = 'That list was not found. It may have been withdrawn, or released from your company.';
// The most SWMS a list's page holds: the builder's (up to 60) and the company's own.
const ITEMS_LIMIT = 100;

// The helpers hse.js shares when it installs the lead's route (dateTime, the site details, who is in).
let shared = null;
const when = (date, state) => (shared ? shared.dateTime(date, state) : new Date(date).toISOString());
// Today where the project is (sitelink-send.js), asked when needed: that module needs this one.
const todayIn = (state) => require('./sitelink-send').todayIn(state);
const abnDigits = (value) => String(value || '').replace(/\D/g, '');
const formatAbn = (abn) => (abn.length === 11 ? `${abn.slice(0, 2)} ${abn.slice(2, 5)} ${abn.slice(5, 8)} ${abn.slice(8)}` : abn);

async function logEntry({ projectId, subId, kind, actorKind, actorName = '', summary }) {
  await db.query('INSERT INTO project_log (id, project_id, subcontract_id, required_swms_id, kind, actor_kind, actor_name, summary, ref_ids, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
    [auth.newId(), projectId, subId, '', kind, actorKind, String(actorName).slice(0, 200), String(summary).slice(0, 600), '{}', new Date()]);
}

// ---- A list the company took up ----

// The subcontract, its project and the builder's account, when this company holds it. Anything else
// reads as not found, so one company never learns of another's list.
async function listFor(company, id) {
  const value = String(id || '');
  const sub = value && company && company.id ? await db.one('SELECT * FROM subcontracts WHERE id = $1 AND company_id = $2 AND removed_at IS NULL', [value, company.id]) : null;
  if (!sub) {
    // A list whose builder has left SiteLink says so (messy round 8, wording 15). Only its id's hash and
    // the builder's name are kept, so this tells nothing to anyone without the id.
    const gone = value ? await db.one('SELECT builder FROM withdrawn_links WHERE token_hash = $1', [auth.hash(`list:${value}`)]).catch(() => null) : null;
    if (gone) throw Object.assign(fail(410, `${gone.builder || 'The main contractor'} has withdrawn this list, and no longer uses SiteLink. Your own copies in My SWMS stay.`), { withdrawn: true });
    throw fail(404, NOT_FOUND);
  }
  const project = await db.one('SELECT * FROM projects WHERE id = $1', [sub.project_id]);
  const org = project && await db.one('SELECT * FROM orgs WHERE id = $1', [project.org_id]);
  if (!project || !org) throw fail(404, NOT_FOUND);
  return { sub, project, org };
}

const keptRows = (subId) => db.query('SELECT * FROM required_swms WHERE subcontract_id = $1 AND removed_at IS NULL ORDER BY position, created_at', [subId]);
const latestDetails = async (projectId) => (await db.query('SELECT * FROM project_site_details WHERE project_id = $1 ORDER BY rev DESC LIMIT 1', [projectId]))[0] || null;
const detailsOf = (row) => ({ ...((shared && shared.EMPTY) || {}), ...((row && row.details) || {}) });

// Who sent the list, for "Questions about this list?": the person on the last list email.
async function contactOf(sub, org) {
  const link = (await db.query("SELECT sent_by, sent_by_name FROM list_links WHERE subcontract_id = $1 AND kind <> 'reminder' ORDER BY created_at DESC LIMIT 1", [sub.id]))[0];
  const person = link && link.sent_by ? await db.one('SELECT name, email, phone, position FROM reviewers WHERE id = $1', [link.sent_by]) : null;
  return { name: (person && person.name) || (link && link.sent_by_name) || '', position: require('./sitelink-answers').tidyRole((person && person.position) || ''), email: (person && person.email) || '', phone: (person && person.phone) || '', builder: org.name };
}

// The work each SWMS on the list covers, in the shape the one-go page opens (scope-choice.js
// projectItems), with any price taken out (handover.js). A SWMS the lead added, or whose work the lead
// changed, is read from the lead's words: the scope's words would no longer match it.
// The work folded into a SWMS (handover.withFolded) comes with it, so the SWMS drafts its steps too
// (messy round 7). A SWMS the reading matched to no step group is drafted from its words.
function itemOf(row, view, rows = []) {
  const item = row.item || {};
  const clean = (value) => handover.wordsWithoutPrices(value);
  const joined = handover.withFolded(row, rows);
  const extra = clean(joined.extraTask);
  const own = clean(row.task);
  const task = extra ? `${own.replace(/[.\s]*$/, '.')} ${extra}` : own;
  const ownWords = row.source === 'added' || row.task_changed;
  const scopeTask = ownWords || !item.scopeTask ? { plain: task, full: task, notes: '' } : { plain: task, full: clean(joined.scopeFull) || task, notes: clean(item.scopeTask.notes) };
  return {
    requiredId: row.id,
    title: handover.nameWithoutPrices(row.title),
    task,
    scopeTask,
    site: ownWords ? {} : Object.fromEntries(Object.entries(joined.site || {}).map(([key, value]) => [key, clean(value)]).filter(([, value]) => value)),
    plant: ownWords ? [] : (joined.plant || []).map(clean).filter(Boolean),
    trade: '',
    pick: item.pick || null,
    kinds: handover.draftKinds(joined.kinds),
    leaveOut: Array.isArray(joined.leaveOut) ? joined.leaveOut : null,
    unmatched: ownWords ? null : Array.isArray(joined.unmatched) ? joined.unmatched.map(clean).filter(Boolean) : null,
    fallRisk: item.fallRisk || '',
    fallHint: item.fallHint || '',
    crane: '',
    slinging: '',
    highRisk: view ? view.highRisk : null,
    clauses: view ? view.clauses : [],
    alsoCovers: view ? view.alsoCovers : [],
    // The scope reading's points that are not about who does or supplies what, kept on the list item
    // (rec7, sl6 decision 6): shown to the company as plain notes from the builder's scope, not questions.
    draftNotes: notesOf(joined.draftNotes),
  };
}

// A note from the scope settled by one of the lead's answers, and each note as plain words: in
// handover.js, so the lead's preview shows the same notes (messy round 10, blocker 2).
const { withSettled, notesOf } = handover;

// The list as the company opens it: the builder, the project, who it is for, the due date, each SWMS,
// the builder's answers, the site details with the version, and what the builder set.
async function listView(found) {
  const { sub, project, org } = found;
  const rows = await keptRows(sub.id);
  const all = await db.query('SELECT * FROM required_swms WHERE subcontract_id = $1 ORDER BY position, created_at', [sub.id]);
  const points = await db.query('SELECT * FROM subcontract_points WHERE subcontract_id = $1 ORDER BY position', [sub.id]);
  const row = await latestDetails(project.id);
  const details = detailsOf(row);
  const siteDetails = row ? { rev: Number(row.rev), details } : null;
  const view = handover.subcontractorView({ project, org, subcontract: sub, items: all, points, siteDetails, fields: (shared && shared.FIELDS) || [] });
  const due = sub.due_date || '';
  return {
    id: sub.id,
    builder: { name: org.name, verified: Boolean(org.abn_verified_at) },
    project: { name: project.name, workplace: project.workplace, state: project.state, pcName: project.pc_name || org.name },
    subcontractor: { name: sub.name, trade: sub.trade },
    due: { date: due, shown: due ? listMail.longDue(due) : '', past: Boolean(due) && due < todayIn(project.state) },
    contact: await contactOf(sub, org),
    items: rows.map((one, i) => withSettled(itemOf(one, view.swms[i], all), view.answers, { activities: handover.workOf(one, all) })),
    answers: view.answers.map(({ by: _by, ...answer }) => answer),
    siteDetails: row ? { rev: Number(row.rev), setBy: row.set_by_name, setOn: when(row.set_at, project.state) } : null,
    builderSet: builderSet.builderSetOf({ workplace: project.workplace, pcName: project.pc_name || org.name }, details),
    claimedOn: sub.claimed_at ? when(sub.claimed_at, project.state) : '',
  };
}

// The company's saved work on the list, with the page merged afresh: its own details from its profile,
// the builder's details where it has not changed them, and its own answers (builder-set.js).
async function progressView(found, company, list) {
  const row = await db.one('SELECT * FROM sub_progress WHERE subcontract_id = $1 AND company_id = $2', [found.sub.id, company.id]);
  const body = row ? row.body || {} : {};
  const start = { state: found.project.state };
  const merged = builderSet.mergePage({ company, builderSet: list.builderSet, page: row ? { ...start, ...(body.page || {}) } : start, seen: row ? row.seen : null });
  return {
    version: row ? Number(row.version) : 0,
    project: row ? body.project || null : null,
    page: merged.page,
    seen: merged.seen,
    overrides: builderSet.overridesOf(list.builderSet, merged.page),
    updatedOn: row ? when(row.updated_at, found.project.state) : '',
    updatedBy: row ? nameOnly(row.updated_by_name) : '',
  };
}
// A name kept before this rule may be an email address: it is not shown.
// A name saved in lower case shows with its capitals (SiteLink round 10, wording 5: "Last saved on ... by
// kirra pendlebury").
// A role typed after the name with no comma is not part of the name ("delphine okoro office admin" reads "Delphine Okoro").
const nameOnly = (value) => {
  if (String(value || '').includes('@')) return '';
  const answers = require('./sitelink-answers');
  const name = answers.tidyName(String(value || ''));
  const split = name.includes(',') ? { name: name.split(',')[0] } : answers.splitRole(name);
  return split ? split.name.trim() : name;
};

// How far the company has got, for its list of lists: from its own saved work only.
function progressSummary(row, total) {
  if (!row) return { started: false, total };
  const items = ((row.body && row.body.project && row.body.project.items) || []).filter((item) => item && typeof item === 'object');
  const required = items.filter((item) => item.requiredId);
  const ready = (item) => item.kind === 'draft' && !item.stale && item.check && item.check.name && item.check.role;
  return {
    started: true,
    total,
    prepared: required.filter((item) => item.kind === 'draft').length,
    checked: required.filter(ready).length,
    own: items.filter((item) => !item.requiredId).length,
    off: ((row.body && row.body.project && row.body.project.offList) || []).length,
  };
}

// ---- What the company's page sends to keep ----

// The project page, as scope.js keeps it, with the company's details taken out of the page and of each
// SWMS: they come from the profile each time. A SWMS that names a requiredId must be on this list.
function cleanProgress(body, list) {
  const project = body && body.project;
  if (!project || typeof project !== 'object' || Array.isArray(project) || !Array.isArray(project.items)) throw fail(400, 'The work could not be read. Reload the page, then carry on.');
  if (project.items.length > ITEMS_LIMIT) throw fail(400, `A list's page holds up to ${ITEMS_LIMIT} SWMS.`);
  const ids = new Set(list.items.map((item) => item.requiredId));
  const items = project.items.filter((item) => item && typeof item === 'object' && !Array.isArray(item)).map((item) => {
    const out = { ...item };
    if (out.requiredId !== undefined && !ids.has(out.requiredId)) {
      // A SWMS the builder has taken off the list since stays as the company's own.
      out.wasRequired = String(out.requiredId).slice(0, 80);
      delete out.requiredId;
    }
    if (out.body) out.body = builderSet.withoutCompany(out.body);
    return out;
  });
  const offList = Array.isArray(project.offList) ? project.offList.filter((item) => item && typeof item === 'object' && ids.has(item.requiredId)).map((item) => ({ ...item, body: item.body ? builderSet.withoutCompany(item.body) : item.body })) : undefined;
  const page = builderSet.withoutCompany(body.page && typeof body.page === 'object' && !Array.isArray(body.page) ? body.page : {});
  return { project: { ...project, items, offList }, page };
}

// ---- The company's routes ----

const router = express.Router();
router.use('/from-builders', auth.requireUser);

// The lists this company took up, newest first, with how far its own work has got. Free (D286).
router.get('/from-builders', route(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const subs = await db.query('SELECT * FROM subcontracts WHERE company_id = $1 AND removed_at IS NULL ORDER BY claimed_at DESC', [req.company.id]);
  const lists = [];
  for (const sub of subs) {
    const project = await db.one('SELECT * FROM projects WHERE id = $1', [sub.project_id]);
    const org = project && await db.one('SELECT id, name, abn_verified_at FROM orgs WHERE id = $1', [project.org_id]);
    if (!project || !org) continue;
    const kept = (await keptRows(sub.id)).length;
    const row = await db.one('SELECT body, updated_at, updated_by_name FROM sub_progress WHERE subcontract_id = $1 AND company_id = $2', [sub.id, req.company.id]);
    const due = sub.due_date || '';
    lists.push({
      id: sub.id,
      builder: { name: org.name, verified: Boolean(org.abn_verified_at) },
      project: { name: project.name, workplace: project.workplace },
      subcontractor: { name: sub.name, trade: sub.trade },
      due: { date: due, shown: due ? listMail.longDue(due) : '', past: Boolean(due) && due < todayIn(project.state) },
      progress: { ...progressSummary(row, kept), ...(await require('./sitelink-submit').companySummary(sub)), updatedOn: row ? when(row.updated_at, project.state) : '', updatedBy: row ? nameOnly(row.updated_by_name) : '' },
    });
  }
  res.json({ lists, access: auth.hasAccess(req.company) });
}));

// One list, to open on the one-go page, with the company's saved work. Without a trial or
// subscription the list shows, and the drafts wait (D286).
router.get('/from-builders/:id', route(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const found = await listFor(req.company, req.params.id);
  const list = await listView(found);
  const access = auth.hasAccess(req.company);
  record('builder_list_opened', req.company.id);
  // Stage 7: what the company has submitted on this list, the responses, conditions and the log.
  const sent = await require('./sitelink-submit').forCompany(found);
  res.json({ list, access, sent, progress: access ? await progressView(found, req.company, list) : null, message: access ? '' : 'Your free trial has ended. Subscribe to prepare these SWMS in SiteWrite. You can still upload a SWMS you already have from the page the list email links to.' });
}));

// Whether two saves hold the same work. Which SWMS is open and the page's stage are where this device
// is, not work: another device opens at the list (messy round 8, stuck point 1: a reload saved again,
// and the phone's next save was refused as "saved on another device").
const sameWork = (a, b) => {
  const work = (kept) => { const { project, page } = kept || {}; const { current, stage, ...rest } = project || {}; return stable({ project: rest, page: page || {} }); };
  return work(a) === work(b);
};

// The company's work on the list, kept. baseVersion is the version the page started from: a save from
// a device that is behind (the foreman's phone saved since) is refused with the newer work, so it is
// never lost. A save that holds the same work as kept is not a new version, so a reload, or a save
// sent again after its answer was lost (a 502), does not make another device's next save behind.
router.put('/from-builders/:id/progress', route(async (req, res) => {
  const found = await listFor(req.company, req.params.id);
  if (!auth.hasAccess(req.company)) throw fail(402, 'Your free trial has ended. Subscribe to keep preparing these SWMS.');
  const list = await listView(found);
  const body = req.body || {};
  const { project, page } = cleanProgress(body, list);
  const seen = Object.fromEntries(Object.entries(list.builderSet).map(([key, set]) => [key, set.value]));
  const overrides = builderSet.overridesOf(list.builderSet, page);
  const base = Number(body.baseVersion);
  if (!Number.isInteger(base) || base < 0) throw fail(400, 'Reload the page, then carry on.');
  // Who saved, by name, never an email address (messy round 7: "by r7c-office-...@siteready.test"). A person with no name on
  // their account is not named: the "Prepared by" name on the page names who prepared the SWMS, not who saved (messy round 19,
  // SiteLink wording 6: the foreman's save read "by Delphine Okoro Office Admin", the office's Prepared by as first typed).
  const who = String(req.user.name || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const now = new Date();
  // Which page saved (one id for each page load) and the version it started from, kept with the work.
  const pageId = typeof body.pageId === 'string' ? body.pageId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) : '';
  const kept = { project, page, ...(pageId ? { from: { page: pageId, base } } : {}) };
  let offBefore = [];
  const saved = await db.transaction(async (tx) => {
    const row = await tx.one('SELECT version, body, updated_at FROM sub_progress WHERE subcontract_id = $1 AND company_id = $2 FOR UPDATE', [found.sub.id, req.company.id]);
    const current = row ? Number(row.version) : 0;
    if (row && sameWork(row.body, kept)) return { version: current, at: row.updated_at };
    // The newer version is this page's own save, from the same version, whose answer was lost (a 502;
    // no other device has saved since, or the newest save would be that device's):
    // the page has that work and more since, so its save goes on top. Before, it was refused as "saved on
    // another device" and the page put back the work it had sent, losing the change made since (messy
    // round 15, SiteLink blocker 1: the foreman's own control was lost, and Submit sent revision 2).
    const ownLost = Boolean(pageId) && row && current > base && row.body && row.body.from && row.body.from.page === pageId && Number(row.body.from.base) === base;
    if (current !== base && !ownLost) return { behind: true, current };
    offBefore = offIds(row && row.body);
    if (row) {
      await tx.query('UPDATE sub_progress SET body = $1, seen = $2, overrides = $3, version = $4, updated_by = $5, updated_by_name = $6, updated_at = $7 WHERE subcontract_id = $8 AND company_id = $9',
        [JSON.stringify(kept), JSON.stringify(seen), JSON.stringify(overrides), current + 1, req.user.id, who, now, found.sub.id, req.company.id]);
    } else {
      await tx.query('INSERT INTO sub_progress (subcontract_id, company_id, body, seen, overrides, version, updated_by, updated_by_name, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [found.sub.id, req.company.id, JSON.stringify(kept), JSON.stringify(seen), JSON.stringify(overrides), 1, req.user.id, who, now]);
    }
    return { version: current + 1 };
  }).catch(async (error) => {
    // Two first saves at the same moment: the second is behind.
    if (error && (error.code === '23505' || /duplicate key/i.test(String(error.message || '')))) return { behind: true, current: 1 };
    throw error;
  });
  if (saved.behind) {
    const latest = await progressView(found, req.company, list);
    throw Object.assign(fail(409, `This list was saved on another device${latest.updatedBy ? ` by ${latest.updatedBy}` : ''} on ${latest.updatedOn}. The newest work is shown.`), { progress: latest });
  }
  if (!saved.at) await logOffList(found, req.company, who, offBefore, offIds(kept), list);
  res.json({ version: saved.version, savedOn: when(saved.at || now, found.project.state), overrides });
}));

// The builder's SWMS the company took off its list, by id, from what it saved.
const offIds = (body) => [...new Set(((body && body.project && Array.isArray(body.project.offList)) ? body.project.offList : [])
  .map((item) => (item && typeof item.requiredId === 'string' ? item.requiredId : '')).filter(Boolean))];
// Taking a SWMS off the list, or putting it back, goes in the log both sides see, as the page promises
// ("... sees that you took it off"): messy round 10, the office took Ductwork off and put it back, and
// neither reached the lead's log.
async function logOffList(found, company, who, before, after, list) {
  const titleOf = (id) => ((list.items || []).find((item) => item.requiredId === id) || {}).title || 'a SWMS';
  const by = who && who !== company.name ? `${who} at ${company.name}` : company.name;
  for (const id of after.filter((one) => !before.includes(one))) {
    await logEntry({ projectId: found.project.id, subId: found.sub.id, kind: 'taken_off', actorKind: 'sub', actorName: who, summary: `${by} took ${titleOf(id)} off its list in SiteWrite. It is not submitted.` });
  }
  for (const id of before.filter((one) => !after.includes(one))) {
    await logEntry({ projectId: found.project.id, subId: found.sub.id, kind: 'put_back', actorKind: 'sub', actorName: who, summary: `${by} put ${titleOf(id)} back on its list in SiteWrite.` });
  }
}

// ---- The lead's Release button (D311), installed on hse.js's router ----

const RELEASED = (name, builder, contact) => `${builder} released this list from ${name}, so ${name} cannot take it up again. If the list should be yours, contact ${contact}.`;

// Whether this company was released from the subcontract's list, and still is: giving the subcontract
// the company's own ABN afterwards lets it take the list up again.
async function releasedFrom(sub, company) {
  if (!company || !company.id) return false;
  const row = await db.one('SELECT id FROM subcontract_releases WHERE subcontract_id = $1 AND company_id = $2 LIMIT 1', [sub.id, company.id]);
  return Boolean(row) && !(sub.abn && sub.abn === abnDigits(company.abn));
}

// What the lead's subcontract page shows about releasing: who took the list up, and whether this
// person may release it.
async function releaseFor(ctx) {
  const { sub, project, role } = ctx;
  const done = await db.query('SELECT company_name, company_abn, released_by_name, released_at FROM subcontract_releases WHERE subcontract_id = $1 ORDER BY released_at', [sub.id]);
  return {
    can: Boolean(sub.claimed_at && sub.company_id && !sub.abn),
    lead: role === 'lead',
    check: sub.claimed_at ? new Date(sub.claimed_at).toISOString() : '',
    released: done.map((row) => ({ name: row.company_name, abn: formatAbn(row.company_abn || ''), by: row.released_by_name, on: when(row.released_at, project.state) })),
  };
}

function install(hseRouter, deps) {
  shared = deps;
  const { subcontractFor, subcontractPage, personName, supportEmail } = deps;

  hseRouter.post('/hse/subcontracts/:subId/release', route(async (req, res) => {
    const ctx = await subcontractFor(req, req.params.subId);
    const { sub, project } = ctx;
    if (ctx.role !== 'lead') throw fail(403, 'Only the lead of your account can release a list. Ask the lead to do it.');
    if (!sub.claimed_at || !sub.company_id) throw fail(400, 'No company has taken up this list in SiteWrite, so there is nothing to release.');
    if (sub.abn) throw fail(400, `${sub.claimed_name} took up the list with the ABN you gave (${formatAbn(sub.abn)}), so it cannot be released here. If that ABN was wrong, contact SiteWrite at ${supportEmail()}.`);
    // The company the lead saw is the one released: if another took it up since, nothing changes.
    const check = String((req.body && req.body.check) || '');
    if (check !== new Date(sub.claimed_at).toISOString()) throw fail(409, 'The list changed while you were looking at it. Refresh the page, then check who has it.');
    const now = new Date();
    const gone = await db.query("UPDATE subcontracts SET company_id = '', claimed_by = '', claimed_at = NULL, claimed_name = '', claimed_abn = '', status = CASE WHEN opened_at IS NOT NULL THEN 'opened' WHEN sent_at IS NOT NULL THEN 'sent' ELSE 'draft' END, updated_at = $1 WHERE id = $2 AND company_id = $3 RETURNING id",
      [now, sub.id, sub.company_id]);
    if (!gone.length) throw fail(409, 'The list changed while you were looking at it. Refresh the page, then check who has it.');
    const who = personName(req.reviewer);
    await db.query('INSERT INTO subcontract_releases (id, subcontract_id, company_id, company_name, company_abn, released_by, released_by_name, released_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [auth.newId(), sub.id, sub.company_id, sub.claimed_name, sub.claimed_abn, req.reviewer.id, who, now]);
    await logEntry({ projectId: project.id, subId: sub.id, kind: 'released', actorKind: 'org', actorName: who, summary: `${who} released the list for ${sub.name} from ${sub.claimed_name} (ABN ${formatAbn(sub.claimed_abn || '')}). ${sub.claimed_name} no longer has it in SiteWrite.` });
    record('list_released', null);
    ctx.sub = await db.one('SELECT * FROM subcontracts WHERE id = $1', [sub.id]);
    res.json(await subcontractPage(ctx, { message: `The list is released. ${sub.claimed_name} no longer has it in SiteWrite, and cannot take it up again. Add the subcontractor's ABN under Change details, so only the right company can take it up.` }));
  }));
}

// The SWMS on the list that the company took off its list (stage 6), by the builder's id for each: the
// only thing the main contractor reads of the company's work (stage 7), so its screen can say each is
// not submitted. Nothing else of the work is read.
async function offListOf(sub) {
  if (!sub || !sub.company_id) return [];
  const row = await db.one('SELECT body FROM sub_progress WHERE subcontract_id = $1 AND company_id = $2', [sub.id, sub.company_id]);
  const off = (row && row.body && row.body.project && Array.isArray(row.body.project.offList)) ? row.body.project.offList : [];
  return [...new Set(off.map((item) => (item && typeof item.requiredId === 'string' ? item.requiredId : '')).filter(Boolean))];
}

// Everything stage 6 keeps for a subcontract, for the staging hook that removes a test account.
async function removeForSubcontract(subId) {
  await db.query('DELETE FROM sub_progress WHERE subcontract_id = $1', [subId]);
  await db.query('DELETE FROM subcontract_releases WHERE subcontract_id = $1', [subId]);
}

module.exports = { sameWork, withSettled, router, install, releasedFrom, releaseFor, RELEASED, removeForSubcontract, cleanProgress, listView, listFor, progressView, contactOf, offListOf, NOT_FOUND };
