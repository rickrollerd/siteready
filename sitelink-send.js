// SiteLink, Goal 12 stage 5: sending the list, the list page, the project log and reminders (plan
// section I, stage 5, and section G).
//
// The lead sends a subcontract its SWMS list by email, with a submission due date, after seeing the
// email exactly as it will go. The email (list-mail.js) is from "{person} via SiteWrite", replies go
// to the person who sent it, and it carries a link to /list.html?t={token}. Each email has its own
// link, made for that subcontract and the list as it was then; only the token's hash is kept. The link
// always shows the current list, and says so when the list has changed since the email. A link sent to
// an address the lead has since corrected stops working. A link gives its own subcontract and nothing
// else.
//
// On the list page, with no account, the subcontractor sees the builder, the project, the SWMS list,
// the due date and the site details, and can upload a SWMS it already has for each SWMS on the list
// (PDF or Word). It can sign in, or start an account, and take up (claim) the list (D308): when the
// lead gave the subcontract an ABN, only a company with that ABN can claim it; with no ABN the first
// company to claim gets it, and the lead sees which. "Opened" is recorded only when the link is used
// (D306 item 3).
//
// The lead can remind the subcontractor of the SWMS not yet received, at most once every
// LIST_REMINDER_HOURS (48) and LIST_REMINDER_MAX (3) times after each list sent. An address that asks
// to stop these emails gets nothing more from that main contractor's account. Each send, reminder,
// opening, upload and claim goes in the project log (project_log), on the project screen and the
// subcontract.
const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const auth = require('./auth');
const handover = require('./handover');
const mailer = require('./mailer');
const designFiles = require('./design-files');
const listMail = require('./list-mail');
const { record } = require('./events');
const { textField } = require('./input');
const testHooks = require('./testhooks');

const { fail } = auth;
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const oneLine = (value, max) => textField(value, max).replace(/\s+/g, ' ').trim();
const HOUR = 60 * 60 * 1000;
const positive = (value, fallback) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback);
const reminderHours = () => positive(process.env.LIST_REMINDER_HOURS, 48);
const reminderMax = () => Math.floor(positive(process.env.LIST_REMINDER_MAX, 3));
// List emails one main contractor's account can send in a day, so an account cannot be used to send
// mail to many addresses.
const dailyLimit = () => Math.floor(positive(process.env.PROJECT_MAIL_DAILY_LIMIT, 200));

const UPLOAD_MAX_MB = 10;
const UPLOAD_MAX_BYTES = UPLOAD_MAX_MB * 1024 * 1024;
const UPLOADS_PER_ITEM = 5;
const UPLOADS_PER_LIST = 40;
const TYPES = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

// The helpers hse.js shares when it installs the routes (dateTime, the time zones, who is signed in).
let shared = null;
const ZONE = (state) => (shared && shared.zones && shared.zones[state]) || 'Australia/Sydney';
const when = (date, state) => (shared ? shared.dateTime(date, state) : new Date(date).toISOString());

// Today's date (YYYY-MM-DD) where the project is.
function todayIn(state, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: ZONE(state) }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// The due date the lead chose: a real date, not in the past where the project is, and within a year.
function cleanDue(value, state, now = new Date()) {
  const due = String(value || '').trim();
  if (!due) throw Object.assign(fail(400, 'Choose the date the SWMS are due.'), { field: 'due' });
  const day = /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(`${due}T00:00:00Z`) : null;
  if (!day || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== due) throw Object.assign(fail(400, 'That is not a date. Choose the date the SWMS are due.'), { field: 'due' });
  const today = todayIn(state, now);
  if (due < today) throw Object.assign(fail(400, 'That date has passed. Choose today or a later date.'), { field: 'due' });
  const yearOn = new Date(`${today}T00:00:00Z`);
  yearOn.setUTCFullYear(yearOn.getUTCFullYear() + 1);
  if (day > yearOn) throw Object.assign(fail(400, 'That date is more than a year away. Check the year.'), { field: 'due' });
  return due;
}

const abnDigits = (value) => String(value || '').replace(/\D/g, '');
const formatAbn = (abn) => (abn.length === 11 ? `${abn.slice(0, 2)} ${abn.slice(2, 5)} ${abn.slice(5, 8)} ${abn.slice(8)}` : abn);

// ---- The list as it stands, and what changed since it was sent ----

const keptRows = (subId) => db.query('SELECT * FROM required_swms WHERE subcontract_id = $1 AND removed_at IS NULL ORDER BY position, created_at', [subId]);
const allRows = (subId) => db.query('SELECT * FROM required_swms WHERE subcontract_id = $1 ORDER BY position, created_at', [subId]);
// The list as an email names it: each SWMS's id, title and work, with any price taken out (handover.js).
const snapshot = (rows) => rows.filter((row) => !row.removed_at).map((row) => ({ id: row.id, title: handover.nameWithoutPrices(row.title), task: handover.wordsWithoutPrices(row.task) }));
const itemsOf = (link) => (Array.isArray(link.items) ? link.items : (() => { try { return JSON.parse(link.items || '[]'); } catch { return []; } })());

function changesFrom(before, now) {
  const was = new Map(before.map((item) => [item.id, item]));
  const is = new Map(now.map((item) => [item.id, item]));
  return {
    added: now.filter((item) => !was.has(item.id)).map((item) => item.title),
    removed: before.filter((item) => !is.has(item.id)).map((item) => item.title),
    changed: now.filter((item) => was.has(item.id) && (was.get(item.id).task !== item.task || was.get(item.id).title !== item.title)).map((item) => item.title),
  };
}
const anyChange = (changes) => Boolean(changes && (changes.added.length || changes.removed.length || changes.changed.length));

// ---- The project log (both sides) ----

async function logEntry({ projectId, subId = '', itemId = '', kind, actorKind, actorName = '', summary, refs = {} }) {
  if (!db.enabled()) return;
  await db.query('INSERT INTO project_log (id, project_id, subcontract_id, required_swms_id, kind, actor_kind, actor_name, summary, ref_ids, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
    [auth.newId(), projectId, subId, itemId, kind, actorKind, String(actorName).slice(0, 200), String(summary).slice(0, 600), JSON.stringify(refs), new Date()]);
}
const logOf = (projectId, subId = null) => (subId
  ? db.query('SELECT * FROM project_log WHERE project_id = $1 AND subcontract_id = $2 ORDER BY created_at DESC LIMIT 200', [projectId, subId])
  : db.query('SELECT * FROM project_log WHERE project_id = $1 ORDER BY created_at DESC LIMIT 200', [projectId]));

// ---- Links ----

const newSecret = () => crypto.randomBytes(24).toString('base64url');
const linkUrl = (base, token) => `${base}/list.html?t=${token}`;
const stopUrl = (base, token) => `${base}/list.html?stop=${token}`;
// What the lead's preview shows in place of each link: the real ones are made when the email is sent.
const PREVIEW_LINK = '[The link to the list. It works only for this subcontract.]';
const PREVIEW_STOP = '[A link to stop these emails]';

async function stopOf(orgId, email) {
  return email ? db.one('SELECT * FROM mail_stops WHERE org_id = $1 AND email = $2', [orgId, email]) : null;
}

// Every email sent for a subcontract, oldest first.
const linksOf = (subId) => db.query('SELECT * FROM list_links WHERE subcontract_id = $1 ORDER BY created_at', [subId]);
// The last list (not a reminder) sent to a working link, and the last one sent to this address.
const lastList = (links, email = null) => [...links].reverse().find((link) => link.kind !== 'reminder' && !link.revoked_at && (email === null || link.email === email)) || null;

// ---- What the lead is about to send ----

// Only an account whose ABN matches the ABN register sends list emails (D311, stage 5 decision 2):
// anyone can set up an Unverified account under a builder's name, and it must not email subcontractors
// as that builder. With the staging test hooks on, a test address may still send to a test address,
// whose mail stays in the test inbox (testhooks.js). '' when the account can send.
function sendBlock(org, reviewer, to) {
  if (org && org.abn_verified_at) return '';
  if (testHooks.enabled() && reviewer && testHooks.isTestAddress(reviewer.email) && (!to || testHooks.isTestAddress(to))) return '';
  const support = shared && shared.supportEmail ? shared.supportEmail() : '';
  return `${org.name} shows Unverified, so SiteLink cannot send its lists yet. Only an account whose ABN matches the ABN register can email subcontractors. The lead can check the register again in Account settings${support ? `, or contact SiteWrite at ${support}` : ''}.`;
}

function sender(req) {
  return { id: req.reviewer.id, name: req.reviewer.name || req.reviewer.email, email: req.reviewer.email };
}

// The email for the lead to check, or to send: kind, recipient, From name, Reply-To, subject and text.
// urls: { link, stop } (the stand-ins for a preview). Refuses what cannot be sent, with why.
async function plan(ctx, req, body, { reminder = false, urls = { link: PREVIEW_LINK, stop: PREVIEW_STOP } } = {}) {
  const { sub, project, org } = ctx;
  if (!req.reviewer.name) throw Object.assign(fail(400, 'Enter your name first. The email says who it is from.'), { field: 'name' });
  const to = sub.contact_email;
  if (!to) throw Object.assign(fail(400, 'Add the subcontractor\'s contact email first, under Change details.'), { field: 'email' });
  const blocked = sendBlock(org, req.reviewer, to);
  if (blocked) throw Object.assign(fail(403, blocked), { unverified: true });
  const stop = await stopOf(org.id, to);
  if (stop) throw Object.assign(fail(409, `${to} asked on ${when(stop.stopped_at, project.state)} for no more list emails from ${org.name}. SiteLink will not email them. Contact them yourself, or change the contact email to another person.`), { field: 'email' });
  const rows = await keptRows(sub.id);
  if (!rows.length) throw fail(400, 'No SWMS are on the list. Put one back or add one before sending it.');
  const versions = await shared.versionsOf(project.id);
  if (!versions.length) throw fail(400, 'Set the project\'s site details before sending the list. The subcontractor\'s list page shows them.');
  const links = await linksOf(sub.id);
  const items = snapshot(rows);
  const person = req.reviewer.name;
  const base = { person, builder: org.name, project: project.name, link: urls.link, stopLink: urls.stop, today: todayIn(project.state) };
  if (reminder) {
    const last = lastList(links);
    if (!last) throw fail(400, 'The list has not been sent yet. Send it first.');
    if (last.email !== to) throw fail(400, `The list was sent to ${last.email}, not ${to}. Send the list to ${to} first.`);
    if (anyChange(changesFrom(itemsOf(last), items))) throw fail(409, 'The list has changed since it was sent. Send the updated list instead, so the subcontractor sees what changed.');
    const since = links.filter((link) => link.created_at >= last.created_at && link.kind === 'reminder' && link.email === to);
    if (since.length >= reminderMax()) throw fail(429, `${since.length} reminders have gone since the list was sent. SiteLink sends no more, so the subcontractor is not flooded. Ring them instead.`);
    const latest = links.filter((link) => link.email === to).pop();
    const next = new Date(new Date(latest.created_at).getTime() + reminderHours() * HOUR);
    if (next > new Date()) throw fail(429, `An email went to ${to} on ${when(latest.created_at, project.state)}. The next reminder can go from ${when(next, project.state)}, so they are not flooded.`);
    const uploaded = new Set((await db.query('SELECT required_swms_id FROM list_uploads WHERE subcontract_id = $1 AND removed_at IS NULL', [sub.id])).map((row) => row.required_swms_id));
    const waiting = items.filter((item) => !uploaded.has(item.id));
    if (!waiting.length) throw fail(400, 'A file has been uploaded for every SWMS on the list, so there is nothing to remind them of.');
    const email = listMail.compose({ ...base, kind: 'reminder', items: waiting.map((item) => item.title), due: sub.due_date || last.due_date });
    return { kind: 'reminder', to, due: sub.due_date || last.due_date, items, email };
  }
  const due = cleanDue(body && body.due, project.state);
  const before = lastList(links, to);
  let kind = 'list_sent';
  let changes = null;
  let dueWas = '';
  if (before) {
    changes = changesFrom(itemsOf(before), items);
    dueWas = before.due_date !== due ? before.due_date : '';
    if (!anyChange(changes) && !dueWas) throw fail(409, `The list has not changed since it was sent to ${to} on ${when(before.created_at, project.state)}. Use Remind to send a reminder.`);
    kind = 'list_changed';
  }
  const email = listMail.compose({ ...base, kind, items: items.map((item) => item.title), due, changes, dueWas });
  // Links sent to another address (a wrong one the lead has since corrected) stop working when this goes.
  const others = [...new Set(links.filter((link) => !link.revoked_at && link.email !== to).map((link) => link.email))];
  return { kind, to, due, items, changes, dueWas, others, email };
}

// What the lead sees before sending, and the check that what is sent is what they saw.
function previewOf(planned, req) {
  const email = { to: planned.to, fromName: listMail.fromName(req.reviewer.name), replyTo: req.reviewer.email, subject: planned.email.subject, text: planned.email.text };
  const check = crypto.createHash('sha256').update(JSON.stringify([planned.kind, email])).digest('hex').slice(0, 32);
  return { kind: planned.kind, email, check, others: planned.others || [], template: { name: planned.email.template, version: planned.email.version } };
}

// Sends the email planned, with a link of its own, and logs it.
async function deliver(ctx, req, planned) {
  const { sub, project, org } = ctx;
  const sent = await db.query('SELECT COUNT(*) AS n FROM list_links WHERE org_id = $1 AND created_at > $2', [org.id, new Date(Date.now() - 24 * HOUR)]);
  if (Number(sent[0].n) >= dailyLimit()) throw fail(429, `Your account has sent ${sent[0].n} list emails in the last day, the most SiteLink sends in a day. Try again tomorrow.`);
  const token = newSecret();
  const stopToken = newSecret();
  const base = auth.appUrl(req);
  const final = await plan(ctx, req, { due: planned.due }, { reminder: planned.kind === 'reminder', urls: { link: linkUrl(base, token), stop: stopUrl(base, stopToken) } });
  const who = sender(req);
  const linkId = auth.newId();
  const now = new Date();
  await db.query('INSERT INTO list_links (id, subcontract_id, project_id, org_id, token_hash, stop_hash, email, kind, list_rev, due_date, items, sent_by, sent_by_name, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)',
    [linkId, sub.id, project.id, org.id, auth.hash(token), auth.hash(stopToken), final.to, final.kind, Number(sub.list_rev || 0), final.due, JSON.stringify(final.items), who.id, who.name, now]);
  const message = {
    to: final.to,
    subject: final.email.subject,
    text: final.email.text,
    from: { name: listMail.fromName(who.name), address: String(process.env.PROJECT_MAIL_FROM_ADDRESS || '').trim() },
    replyTo: who.email,
    // A one-press "stop these emails" for mail programs that offer it (RFC 8058).
    headers: { 'List-Unsubscribe': `<${base}/api/list/stop/${stopToken}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
  let result;
  try {
    result = await mailer.sendMail(message);
  } catch (error) {
    // Not sent: the link goes, so nothing says it was.
    await db.query('DELETE FROM list_links WHERE id = $1', [linkId]);
    throw error;
  }
  // The body is kept with the link's token and the stop token taken out.
  const kept = final.email.text.split(token).join('…').split(stopToken).join('…');
  await db.query('INSERT INTO mail_messages (id, project_id, subcontract_id, link_id, template, template_version, recipient, from_name, reply_to, subject, body, provider, provider_id, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)',
    [auth.newId(), project.id, sub.id, linkId, final.email.template, final.email.version, final.to, message.from.name, who.email, final.email.subject, kept, result ? result.provider : '', result ? result.id : '', result ? 'sent' : 'kept', now]);
  const count = `${final.items.length} SWMS`;
  if (final.kind === 'reminder') {
    await logEntry({ projectId: project.id, subId: sub.id, kind: 'reminder', actorKind: 'org', actorName: who.name, summary: `${who.name} sent ${sub.name} a reminder at ${final.to}.`, refs: { link: linkId } });
    record('list_reminder', null);
    return { message: `A reminder has gone to ${final.to}.` };
  }
  let revoked = [];
  if (final.others.length) {
    revoked = final.others;
    await db.query('UPDATE list_links SET revoked_at = $1 WHERE subcontract_id = $2 AND email <> $3 AND revoked_at IS NULL', [now, sub.id, final.to]);
  }
  await db.query("UPDATE subcontracts SET due_date = $1, sent_at = COALESCE(sent_at, $2), status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END, updated_at = $2 WHERE id = $3", [final.due, now, sub.id]);
  const dueText = listMail.longDue(final.due);
  const what = final.kind === 'list_changed' ? 'the updated SWMS list' : 'the SWMS list';
  const gone = revoked.length ? ` The link sent to ${revoked.join(' and ')} no longer works.` : '';
  await logEntry({ projectId: project.id, subId: sub.id, kind: final.kind === 'list_changed' ? 'list_resent' : 'list_sent', actorKind: 'org', actorName: who.name, summary: `${who.name} sent ${what} (${count}, due ${dueText}) to ${sub.name} at ${final.to}.${gone}`, refs: { link: linkId } });
  record(final.kind === 'list_changed' ? 'list_resent' : 'list_sent', null);
  return { message: `The list has been sent to ${final.to}.${gone}` };
}

// ---- The lead's view of sending (for the subcontract page and the project screen) ----

async function uploadsOf(subId) {
  return db.query('SELECT * FROM list_uploads WHERE subcontract_id = $1 AND removed_at IS NULL ORDER BY created_at', [subId]);
}
const uploadView = (row, state) => ({ id: row.id, itemId: row.required_swms_id, name: row.name, type: row.content_type === TYPES.pdf ? 'PDF' : 'Word', size: Number(row.size), on: when(row.created_at, state) });

async function sendingFor(ctx) {
  const { sub, project, org } = ctx;
  const links = await linksOf(sub.id);
  const last = lastList(links);
  const rows = await keptRows(sub.id);
  const changes = last ? changesFrom(itemsOf(last), snapshot(rows)) : null;
  const stop = await stopOf(org.id, sub.contact_email);
  // Reminders: how many since the list was sent, and when the next can go.
  let remind = { can: false, why: last ? '' : 'Send the list first.', used: 0, max: reminderMax(), next: '' };
  if (last) {
    const toNow = links.filter((link) => link.email === last.email);
    const used = toNow.filter((link) => link.kind === 'reminder' && link.created_at >= last.created_at).length;
    const latest = toNow[toNow.length - 1];
    const next = new Date(new Date(latest.created_at).getTime() + reminderHours() * HOUR);
    remind = { can: true, why: '', used, max: reminderMax(), next: next > new Date() ? when(next, project.state) : '' };
    if (used >= reminderMax()) remind = { ...remind, can: false, why: `${used} reminders have gone since the list was sent. Ring them instead.` };
    else if (remind.next) remind = { ...remind, can: false, why: `The next reminder can go from ${remind.next}.` };
    else if (anyChange(changes)) remind = { ...remind, can: false, why: 'The list has changed. Send the updated list instead.' };
    else if (sub.contact_email !== last.email) remind = { ...remind, can: false, why: `The contact email has changed. Send the list to ${sub.contact_email || 'the new address'} first.` };
  }
  const log = await logOf(project.id, sub.id);
  const blocked = sendBlock(org, ctx.viewer, sub.contact_email);
  return {
    // Why nothing can be sent from this account yet (it shows Unverified), or ''.
    blocked: blocked ? { message: blocked, orgId: org.id } : null,
    email: sub.contact_email,
    abn: sub.abn || '',
    abnShown: formatAbn(sub.abn || ''),
    dueDate: sub.due_date || '',
    dueShown: sub.due_date ? listMail.longDue(sub.due_date) : '',
    today: todayIn(project.state),
    sent: last ? { to: last.email, on: when(last.created_at, project.state), by: last.sent_by_name, due: last.due_date, dueShown: listMail.longDue(last.due_date), count: itemsOf(last).length } : null,
    firstSentOn: sub.sent_at ? when(sub.sent_at, project.state) : '',
    opened: sub.opened_at ? when(sub.opened_at, project.state) : '',
    claimed: sub.claimed_at ? { name: sub.claimed_name, abn: formatAbn(sub.claimed_abn || ''), on: when(sub.claimed_at, project.state) } : null,
    stopped: stop ? { email: stop.email, on: when(stop.stopped_at, project.state) } : null,
    // Stage 6 (D311): whether the list can be released from the company that took it up, and by whom.
    release: await subbie().releaseFor(ctx),
    changes: last && anyChange(changes) ? changes : null,
    emailChanged: Boolean(last && sub.contact_email && sub.contact_email !== last.email),
    remind,
    emails: links.slice().reverse().map((link) => ({ kind: link.kind, to: link.email, on: when(link.created_at, project.state), by: link.sent_by_name, opened: link.opened_at ? when(link.opened_at, project.state) : '', revoked: Boolean(link.revoked_at) })),
    uploads: (await uploadsOf(sub.id)).map((row) => uploadView(row, project.state)),
    log: log.map((row) => ({ when: when(row.created_at, project.state), text: row.summary, kind: row.kind })),
    reminderHours: reminderHours(),
  };
}

// The subcontract's line on the project screen: sent, due, opened, claimed, files in and last contact.
async function summaryFor(sub, project) {
  const uploads = await db.query('SELECT DISTINCT required_swms_id FROM list_uploads WHERE subcontract_id = $1 AND removed_at IS NULL', [sub.id]);
  const kept = new Set((await keptRows(sub.id)).map((row) => row.id));
  const last = await db.one('SELECT * FROM project_log WHERE project_id = $1 AND subcontract_id = $2 ORDER BY created_at DESC LIMIT 1', [project.id, sub.id]);
  return {
    sentOn: sub.sent_at ? shortDate(sub.sent_at, project.state) : '',
    due: sub.due_date ? listMail.shortDue(sub.due_date) : '',
    opened: Boolean(sub.opened_at),
    claimedName: sub.claimed_at ? sub.claimed_name : '',
    filesIn: uploads.filter((row) => kept.has(row.required_swms_id)).length,
    lastContact: last ? { text: LAST_CONTACT[last.kind] || last.summary, on: shortDate(last.created_at, project.state) } : null,
  };
}
const LAST_CONTACT = { released: 'Released from the company that took it up', list_sent: 'List sent', list_resent: 'Updated list sent', reminder: 'Reminder sent', list_opened: 'List opened', uploaded: 'SWMS uploaded', upload_removed: 'Upload taken off', claimed: 'Taken up in SiteWrite', claim_refused: 'Another company tried to take it up', stopped: 'Asked to stop emails', restarted: 'Emails started again' };
function shortDate(date, state) {
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', timeZone: ZONE(state) }).format(new Date(date));
}

// ---- Files uploaded from the list page ----

// A PDF with no scripts or actions, or a Word file (.docx) with no macros. Older Word files (.doc)
// are refused: they can carry macros SiteWrite cannot see.
function checkUpload(data) {
  if (!Buffer.isBuffer(data) || !data.length) throw fail(400, 'The file is empty. Choose the SWMS file again.');
  if (data.length > UPLOAD_MAX_BYTES) throw fail(413, `The file is larger than ${UPLOAD_MAX_MB} MB. Upload a smaller copy of the SWMS.`);
  if (designFiles.pdfReads(data)) {
    if (designFiles.PDF_ACTIVE.test(data.toString('latin1'))) throw fail(415, 'This PDF has scripts, actions or embedded files in it, so it cannot be taken. Save it again as a plain PDF (print to PDF) and upload that.');
    return TYPES.pdf;
  }
  if (data.subarray(0, 4).toString('hex') === '504b0304') {
    const names = data.toString('latin1');
    if (/vbaProject\.bin|vbaData\.xml/i.test(names)) throw fail(415, 'This Word file has macros in it, so it cannot be taken. Save it as a Word document (.docx) without macros, or as a PDF.');
    if (names.includes('word/document.xml')) return TYPES.docx;
    throw fail(415, 'This file is not a PDF or a Word file (.docx). Upload the SWMS as a PDF or a Word file.');
  }
  if (data.subarray(0, 8).toString('hex') === 'd0cf11e0a1b11ae1') throw fail(415, 'Older Word files (.doc) cannot be taken. Save it as .docx or as a PDF and upload it again.');
  throw fail(415, 'This file is not a PDF or a Word file (.docx). Upload the SWMS as a PDF or a Word file.');
}

function uploadName(name, type) {
  const base = String(name || '').replace(/^.*[\\/]/, '').replace(/[\u0000-\u001f\u007f"<>|*?:]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150) || 'SWMS';
  const ending = type === TYPES.pdf ? 'pdf' : 'docx';
  return new RegExp(`\\.${ending}$`, 'i').test(base) ? base : `${base.replace(/\.[A-Za-z0-9]{1,5}$/, '')}.${ending}`;
}

const objectKey = (id) => `list-uploads/${id}`;
async function putData(id, data, type) {
  if (designFiles.bucketConfigured()) {
    await designFiles.bucketRequest('PUT', objectKey(id), data, type);
    return 'bucket';
  }
  await db.query('INSERT INTO list_upload_data (upload_id, data) VALUES ($1, $2)', [id, data.toString('base64')]);
  return 'database';
}
async function getData(row) {
  if (row.storage === 'bucket') return designFiles.bucketRequest('GET', objectKey(row.id));
  const kept = await db.one('SELECT data FROM list_upload_data WHERE upload_id = $1', [row.id]);
  return kept ? Buffer.from(kept.data, 'base64') : null;
}
async function removeData(row) {
  if (row.storage === 'bucket') await designFiles.bucketRequest('DELETE', objectKey(row.id)).catch(() => {});
  await db.query('DELETE FROM list_upload_data WHERE upload_id = $1', [row.id]);
}

// Everything stage 5 keeps for a subcontract, for the staging hook that removes a test account.
async function removeForSubcontract(subId) {
  for (const row of await db.query('SELECT * FROM list_uploads WHERE subcontract_id = $1', [subId])) await removeData(row);
  await db.query('DELETE FROM list_uploads WHERE subcontract_id = $1', [subId]);
  await db.query('DELETE FROM list_links WHERE subcontract_id = $1', [subId]);
  await db.query('DELETE FROM mail_messages WHERE subcontract_id = $1', [subId]);
}

function sendUpload(res, row, data) {
  res.setHeader('Content-Type', row.content_type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  const inline = row.content_type === TYPES.pdf ? 'inline' : 'attachment';
  res.setHeader('Content-Disposition', `${inline}; filename="${row.name.replace(/[^A-Za-z0-9 ._-]+/g, '_')}"; filename*=UTF-8''${encodeURIComponent(row.name)}`);
  res.send(data);
}

// ---- The lead's routes (installed on hse.js's router: signed in, and in the subcontract's account) ----

function install(router, deps) {
  shared = deps;
  const { subcontractFor } = deps;
  const page = async (ctx, message) => deps.subcontractPage(ctx, { message });

  router.post('/hse/subcontracts/:subId/send/preview', route(async (req, res) => {
    const ctx = await subcontractFor(req, req.params.subId);
    res.json({ preview: previewOf(await plan(ctx, req, req.body || {}), req) });
  }));

  // Sends only the email the lead checked: if anything in it changed since, the new email is shown.
  router.post('/hse/subcontracts/:subId/send', route(async (req, res) => {
    const ctx = await subcontractFor(req, req.params.subId);
    const body = req.body || {};
    const planned = await plan(ctx, req, body);
    const preview = previewOf(planned, req);
    if (String(body.check || '') !== preview.check) {
      throw Object.assign(fail(409, 'The email has changed since you checked it. Check it again, then send.'), { preview });
    }
    const done = await deliver(ctx, req, planned);
    ctx.sub = await db.one('SELECT * FROM subcontracts WHERE id = $1', [ctx.sub.id]);
    res.json(await page(ctx, done.message));
  }));

  router.post('/hse/subcontracts/:subId/remind/preview', route(async (req, res) => {
    const ctx = await subcontractFor(req, req.params.subId);
    res.json({ preview: previewOf(await plan(ctx, req, {}, { reminder: true }), req) });
  }));

  router.post('/hse/subcontracts/:subId/remind', route(async (req, res) => {
    const ctx = await subcontractFor(req, req.params.subId);
    const planned = await plan(ctx, req, {}, { reminder: true });
    const preview = previewOf(planned, req);
    if (String((req.body && req.body.check) || '') !== preview.check) throw Object.assign(fail(409, 'The reminder has changed since you checked it. Check it again, then send.'), { preview });
    const done = await deliver(ctx, req, planned);
    res.json(await page(ctx, done.message));
  }));

  // A SWMS the subcontractor uploaded on the list page, for the lead.
  router.get('/hse/subcontracts/:subId/uploads/:uploadId', route(async (req, res) => {
    const ctx = await subcontractFor(req, req.params.subId);
    const row = await db.one('SELECT * FROM list_uploads WHERE id = $1 AND subcontract_id = $2 AND removed_at IS NULL', [String(req.params.uploadId || ''), ctx.sub.id]);
    const data = row && await getData(row);
    if (!data) throw fail(404, 'That file was not found.');
    sendUpload(res, row, data);
  }));
}

// ---- The list page's routes (no account needed: the link's token is the key) ----

const publicRouter = express.Router();
const GONE_LINK = 'This link is not right. Check you copied all of it from the email, or ask the main contractor to send the list again.';

// The link, its subcontract, project and account, and who sent it. A link that was replaced (sent to a
// wrong address) or whose subcontract was removed says so.
async function linkFor(token) {
  const value = String(token || '');
  const link = /^[A-Za-z0-9_-]{20,80}$/.test(value) ? await db.one('SELECT * FROM list_links WHERE token_hash = $1', [auth.hash(value)]) : null;
  if (!link) throw fail(404, GONE_LINK);
  const sub = await db.one('SELECT * FROM subcontracts WHERE id = $1', [link.subcontract_id]);
  const project = sub && await db.one('SELECT * FROM projects WHERE id = $1', [sub.project_id]);
  const org = project && await db.one('SELECT * FROM orgs WHERE id = $1', [project.org_id]);
  if (!sub || !project || !org) throw fail(404, GONE_LINK);
  const person = await db.one('SELECT name, email, phone, position FROM reviewers WHERE id = $1', [link.sent_by]);
  const from = { name: (person && person.name) || link.sent_by_name, email: (person && person.email) || '', phone: (person && person.phone) || '', position: (person && person.position) || '' };
  const contact = `${from.name} at ${org.name}${from.email ? ` (${from.email})` : ''}`;
  if (sub.removed_at) throw fail(410, `${org.name} has withdrawn this list. If you think this is wrong, contact ${contact}.`);
  if (link.revoked_at) throw fail(410, `This link no longer works. ${org.name} sent the list to another address. Ask ${contact} to send it to you.`);
  return { link, sub, project, org, from, contact };
}

// Why a company cannot take up the list (D308), said the same way on the page and when it presses.
const ABN_REFUSED = (name, contact) => `This list is for a company with a different ABN, so it has not been added to ${name}. If the list should be yours, contact ${contact}.`;
const TAKEN = (name, contact) => `Another company has already taken up this list in SiteWrite, so it has not been added to ${name}. If the list should be yours, contact ${contact}.`;
// A company the lead released the list from (stage 6, D311) is told so.
async function refusalFor(sub, company, contact, builder) {
  const name = String((company && company.name) || '').trim();
  const abn = abnDigits(company && company.abn);
  if (!company || !name || abn.length !== 11 || sub.company_id === company.id) return '';
  if (sub.abn && sub.abn !== abn) return ABN_REFUSED(name, contact);
  if (await subbie().releasedFrom(sub, company)) return subbie().RELEASED(name, builder, contact);
  if (sub.company_id) return TAKEN(name, contact);
  return '';
}
const subbie = () => require('./sitelink-subbie');

// viewer: the signed-in company, if any, so the page knows the list is already theirs, or why that
// company cannot take it up.
async function listView(found, viewer = null) {
  const { link, sub, project, org, from } = found;
  const rows = await allRows(sub.id);
  const points = await db.query('SELECT * FROM subcontract_points WHERE subcontract_id = $1 ORDER BY position', [sub.id]);
  const versions = await shared.versionsOf(project.id);
  const siteDetails = shared.detailsView(versions[versions.length - 1], project.state);
  const view = handover.subcontractorView({ project, org, subcontract: sub, items: rows, points, siteDetails, fields: shared.FIELDS });
  const kept = rows.filter((row) => !row.removed_at);
  const uploads = await uploadsOf(sub.id);
  const due = sub.due_date || link.due_date;
  return {
    builder: { name: org.name, verified: Boolean(org.abn_verified_at) },
    from: { name: from.name, position: from.position, phone: from.phone, email: from.email },
    project: view.project,
    subcontractor: { name: sub.name, trade: sub.trade },
    due: { date: due, shown: listMail.longDue(due), past: due < todayIn(project.state) },
    // Each SWMS as the preview shows it, with its id for uploads, and the files uploaded for it.
    swms: view.swms.map((item, i) => ({ ...item, id: kept[i].id, uploads: uploads.filter((row) => row.required_swms_id === kept[i].id).map((row) => uploadView(row, project.state)) })),
    answers: view.answers,
    siteDetails: view.siteDetails,
    // An older email's link shows the list as it is now, and says the list has changed since.
    changed: anyChange(changesFrom(itemsOf(link), snapshot(rows))),
    sentOn: when(link.created_at, project.state),
    abnSet: Boolean(sub.abn),
    claimed: Boolean(sub.claimed_at),
    mine: Boolean(viewer && sub.company_id && sub.company_id === viewer.id),
    // The list in the company's SiteWrite, under From main contractors (stage 6).
    listId: viewer && sub.company_id && sub.company_id === viewer.id ? sub.id : '',
    refusal: await refusalFor(sub, viewer, found.contact, org.name),
    uploadsOn: designFiles.enabled(),
    uploadMaxMb: UPLOAD_MAX_MB,
  };
}

publicRouter.get('/list/:token', route(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const found = await linkFor(req.params.token);
  const { link, sub, project } = found;
  const now = new Date();
  // "Opened" is the link used (D306): the first time for each email is logged; later times are counted.
  const first = await db.query('UPDATE list_links SET opened_at = $1, last_opened_at = $1 WHERE id = $2 AND opened_at IS NULL RETURNING id', [now, link.id]);
  if (first.length) {
    await db.query("UPDATE subcontracts SET opened_at = COALESCE(opened_at, $1), status = CASE WHEN status = 'sent' THEN 'opened' ELSE status END WHERE id = $2", [now, sub.id]);
    const what = link.kind === 'reminder' ? 'reminder' : 'list';
    await logEntry({ projectId: project.id, subId: sub.id, kind: 'list_opened', actorKind: 'sub', summary: `The link in the ${what} sent to ${sub.name} at ${link.email} on ${when(link.created_at, project.state)} was opened.`, refs: { link: link.id } });
    record('list_opened', null);
  } else {
    await db.query('UPDATE list_links SET last_opened_at = $1 WHERE id = $2', [now, link.id]);
  }
  res.json(await listView(found, req.company));
}));

// A sign-in link to the address given, which opens this list again to claim it.
publicRouter.post('/list/:token/sign-in', route(async (req, res) => {
  const found = await linkFor(req.params.token);
  const email = auth.cleanEmail(req.body && req.body.email);
  if (!email) throw Object.assign(fail(400, 'Enter a valid email address.'), { field: 'email' });
  await auth.sendListLink(req, email, { listToken: req.params.token, source: `project-invite:${found.project.id}`, builder: found.org.name });
  res.json({ ok: true, message: `A sign-in link has been sent to ${email}. It expires in 20 minutes. Open it on this device to take up the list.` });
}));

// Takes up the list for the signed-in person's company (D308).
publicRouter.post('/list/:token/claim', auth.requireUser, route(async (req, res) => {
  const found = await linkFor(req.params.token);
  const { sub, project, org, contact } = found;
  const company = req.company;
  const name = String(company.name || '').trim();
  const abn = abnDigits(company.abn);
  if (!name || abn.length !== 11) throw Object.assign(fail(400, 'Add your company name and ABN first. They link the list to your company.'), { field: 'company' });
  const refused = async (message, why) => {
    await logEntry({ projectId: project.id, subId: sub.id, kind: 'claim_refused', actorKind: 'sub', summary: `${sub.name}: ${why}`, refs: {} });
    throw Object.assign(fail(409, message), { field: 'claim' });
  };
  if (sub.company_id && sub.company_id === company.id) {
    res.json({ ok: true, already: true, company: name, listId: sub.id, message: `This list is already linked to ${name} in SiteWrite.` });
    return;
  }
  if (sub.abn && sub.abn !== abn) {
    await refused(ABN_REFUSED(name, contact), 'A company whose ABN does not match the ABN you gave tried to take up the list in SiteWrite. It was not linked to them.');
  }
  // Released from this company by the lead (stage 6, D311): it cannot take the list up again.
  if (await subbie().releasedFrom(sub, company)) {
    await refused(subbie().RELEASED(name, org.name, contact), `${name}, which you released the list from, tried to take it up again in SiteWrite. It was not linked to them.`);
  }
  if (sub.company_id) {
    await refused(TAKEN(name, contact), 'A second company tried to take up the list in SiteWrite. It stays with the company that took it up first.');
  }
  const now = new Date();
  // The first company to claim it gets it, even when two press at the same moment.
  const taken = await db.query("UPDATE subcontracts SET company_id = $1, claimed_by = $2, claimed_at = $3, claimed_name = $4, claimed_abn = $5, status = 'claimed', updated_at = $3 WHERE id = $6 AND company_id = '' RETURNING id",
    [company.id, req.user.id, now, name, abn, sub.id]);
  if (!taken.length) {
    const again = await db.one('SELECT company_id FROM subcontracts WHERE id = $1', [sub.id]);
    if (again && again.company_id === company.id) { res.json({ ok: true, already: true, company: name, listId: sub.id, message: `This list is already linked to ${name} in SiteWrite.` }); return; }
    await refused(TAKEN(name, contact), 'A second company tried to take up the list in SiteWrite. It stays with the company that took it up first.');
  }
  await logEntry({ projectId: project.id, subId: sub.id, kind: 'claimed', actorKind: 'sub', actorName: name, summary: `${name} (ABN ${formatAbn(abn)}) took up the list for ${sub.name} in SiteWrite.`, refs: {} });
  record('list_claimed', company.id);
  res.json({ ok: true, company: name, listId: sub.id, message: `The list is now linked to ${name} in SiteWrite. ${org.name} can see that you have it.` });
}));

// A SWMS the subcontractor already has, for one SWMS on the list.
// A file over the limit is refused in words, not as a request that could not be read.
const rawUpload = express.raw({ type: () => true, limit: UPLOAD_MAX_BYTES + 64 * 1024 });
const readUpload = (req, res, next) => rawUpload(req, res, (error) => next(error && error.type === 'entity.too.large' ? fail(413, `The file is larger than ${UPLOAD_MAX_MB} MB. Upload a smaller copy of the SWMS.`) : error));
publicRouter.post('/list/:token/items/:itemId/upload', readUpload, route(async (req, res) => {
  const found = await linkFor(req.params.token);
  const { sub, project } = found;
  if (!designFiles.enabled()) throw fail(503, `Uploading is not switched on yet. Email the SWMS to ${found.contact}.`);
  const item = await db.one('SELECT * FROM required_swms WHERE id = $1 AND subcontract_id = $2 AND removed_at IS NULL', [String(req.params.itemId || ''), sub.id]);
  if (!item) throw fail(404, 'That SWMS is no longer on the list. Reload the page to see the list as it is now.');
  const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const type = checkUpload(data);
  const active = await uploadsOf(sub.id);
  if (active.filter((row) => row.required_swms_id === item.id).length >= UPLOADS_PER_ITEM) throw fail(400, `${item.title} already has ${UPLOADS_PER_ITEM} files. Take one off before adding another.`);
  if (active.length >= UPLOADS_PER_LIST) throw fail(400, `This list already has ${UPLOADS_PER_LIST} files. Take one off before adding another.`);
  const name = uploadName((() => { try { return decodeURIComponent(String(req.get('X-File-Name') || '')); } catch { return ''; } })(), type);
  const id = auth.newId();
  const storage = await putData(id, data, type);
  await db.query('INSERT INTO list_uploads (id, subcontract_id, required_swms_id, link_id, name, content_type, size, sha256, storage, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
    [id, sub.id, item.id, found.link.id, name, type, data.length, crypto.createHash('sha256').update(data).digest('hex'), storage, new Date()]);
  await logEntry({ projectId: project.id, subId: sub.id, itemId: item.id, kind: 'uploaded', actorKind: 'sub', summary: `${name} was uploaded for ${handover.nameWithoutPrices(item.title)} on the list sent to ${sub.name}.`, refs: { upload: id } });
  record('list_upload', null);
  res.status(201).json({ message: `${name} is uploaded for ${handover.nameWithoutPrices(item.title)}. ${found.org.name} can see it.`, list: await listView(found, req.company) });
}));

// A file uploaded for the wrong SWMS is taken off.
publicRouter.delete('/list/:token/uploads/:uploadId', route(async (req, res) => {
  const found = await linkFor(req.params.token);
  const { sub, project } = found;
  const row = await db.one('SELECT * FROM list_uploads WHERE id = $1 AND subcontract_id = $2 AND removed_at IS NULL', [String(req.params.uploadId || ''), sub.id]);
  if (!row) throw fail(404, 'That file was not found. Reload the page.');
  const item = await db.one('SELECT title FROM required_swms WHERE id = $1', [row.required_swms_id]);
  await db.query('UPDATE list_uploads SET removed_at = $1 WHERE id = $2', [new Date(), row.id]);
  await removeData(row);
  const title = item ? handover.nameWithoutPrices(item.title) : 'its SWMS';
  await logEntry({ projectId: project.id, subId: sub.id, itemId: row.required_swms_id, kind: 'upload_removed', actorKind: 'sub', summary: `${row.name} was taken off ${title} on the list sent to ${sub.name}.`, refs: { upload: row.id } });
  res.json({ message: `${row.name} is taken off ${title}.`, list: await listView(found, req.company) });
}));

// "Stop these emails": the address in the email gets no more list emails from that main contractor's
// account, until it asks to start them again. The page asks first; mail programs that offer a
// one-press stop (List-Unsubscribe-Post) post to the token's own address.
async function stopFor(token) {
  const value = String(token || '');
  const link = /^[A-Za-z0-9_-]{20,80}$/.test(value) ? await db.one('SELECT * FROM list_links WHERE stop_hash = $1', [auth.hash(value)]) : null;
  if (!link) throw fail(404, 'This link is not right. Check you copied all of it from the email.');
  const org = await db.one('SELECT id, name FROM orgs WHERE id = $1', [link.org_id]);
  if (!org) throw fail(404, 'This link is not right. Check you copied all of it from the email.');
  return { link, org };
}
async function setStop({ link, org }, stop) {
  const was = await stopOf(org.id, link.email);
  const project = await db.one('SELECT state FROM projects WHERE id = $1', [link.project_id]);
  if (stop && !was) {
    await db.query('INSERT INTO mail_stops (org_id, email, stopped_at) VALUES ($1, $2, $3) ON CONFLICT (org_id, email) DO NOTHING', [org.id, link.email, new Date()]);
    await logEntry({ projectId: link.project_id, subId: link.subcontract_id, kind: 'stopped', actorKind: 'sub', summary: `${link.email} asked for no more list emails from ${org.name}. SiteLink will not email them.`, refs: {} });
  }
  if (!stop && was) {
    await db.query('DELETE FROM mail_stops WHERE org_id = $1 AND email = $2', [org.id, link.email]);
    await logEntry({ projectId: link.project_id, subId: link.subcontract_id, kind: 'restarted', actorKind: 'sub', summary: `${link.email} asked to get list emails from ${org.name} again.`, refs: {} });
  }
  const now = await stopOf(org.id, link.email);
  return { builder: org.name, email: link.email, stopped: Boolean(now), on: now ? when(now.stopped_at, project ? project.state : '') : '' };
}
publicRouter.get('/list/stop/:token', route(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const found = await stopFor(req.params.token);
  const stop = await stopOf(found.org.id, found.link.email);
  res.json({ builder: found.org.name, email: found.link.email, stopped: Boolean(stop) });
}));
publicRouter.post('/list/stop/:token', route(async (req, res) => {
  const found = await stopFor(req.params.token);
  const undo = Boolean(req.body && req.body.undo === true);
  const result = await setStop(found, !undo);
  res.json({ ...result, message: result.stopped ? `${result.email} will get no more list emails from ${result.builder} through SiteWrite.` : `${result.email} will get list emails from ${result.builder} again.` });
}));

module.exports = {
  install, publicRouter, sendingFor, summaryFor, logOf, removeForSubcontract, checkUpload, cleanDue, todayIn, changesFrom,
  PREVIEW_LINK, PREVIEW_STOP, UPLOAD_MAX_MB, reminderHours, reminderMax,
};
