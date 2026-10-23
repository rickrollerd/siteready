// SiteLink, Goal 12 stage 4: subcontract scopes become SWMS lists, read once on the project (plan
// section C). The HSE lead adds a subcontract to a project and uploads its scope of works. The scope
// is read by the AI once, on the project, and paid for by SiteWrite up to the project's free readings
// (D302). The work packages that need a SWMS become the subcontract's list; the lead keeps, removes,
// adds or rewords them, answers the reading's points to confirm, and sees what the subcontractor will
// see. Sending the list is stage 5.
//
// Every route names a subcontract or a project and checks the person has joined its account (hse.js).
// Anything else reads as not found. The reading belongs to the account; no company ever reads it.
// No price, rate or amount from a scope is kept or shown to anyone (handover.js).
const crypto = require('crypto');
const db = require('./db');
const auth = require('./auth');
const aiScope = require('./ai-scope');
const handover = require('./handover');
const { scopeText } = require('./scope-text');
const { record } = require('./events');
const { textField } = require('./input');
const { BRIEF_VERSION } = require('./ai-brief');
const controlLearning = require('./control-learning');
const { controlLearningKey } = require('./secret-keys');
const answers = require('./sitelink-answers');
const send = require('./sitelink-send');
const { validAbn } = require('./accounts');

const { fail } = auth;
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const oneLine = (value, max) => textField(value, max).replace(/\s+/g, ' ').trim();
const PLACEHOLDER = /^(?:tbc|tba|tbd|to be confirmed|to be advised|unknown|\?+|-+|\.+|x+)$/i;
const NOT_FOUND = 'That subcontract was not found.';
const ITEM_LIMIT = 60;

// ---- Is it a scope? ----
// Checked before any reading, so a wrong file costs nothing.

const words = (line) => (String(line).match(/[A-Za-z][A-Za-z'’-]+/g) || []).length;
const smallWords = (line) => (String(line).match(/\b[a-z][a-z'’-]+/g) || []).length;
const DRAWING = 'This file has very few typed sentences. It looks like a drawing or a scanned page, not a scope of works. Upload the subcontract\'s scope of works as a Word file or a PDF with typed text.';
const PRICE_SCHEDULE = 'This file looks like a price schedule: most of its lines are prices. Upload the subcontract\'s scope of works instead. SiteLink never passes prices, rates or amounts on to the subcontractor.';

// A scope is written in sentences. A drawing's text is labels, grid lines and levels; a scan has
// none. Every held scope passes (at least 0.44 of its words are in sentences); a drawing has few.
function notAScope(text) {
  const lines = String(text || '').split('\n');
  const total = lines.reduce((sum, line) => sum + words(line), 0);
  if (total < 60) return DRAWING;
  const inSentences = lines.reduce((sum, line) => sum + (smallWords(line) >= 4 ? words(line) : 0), 0);
  if (inSentences < total * 0.25) return DRAWING;
  const filled = lines.filter((line) => line.trim());
  const priced = filled.filter((line) => handover.hasMoney(line)).length;
  if (priced >= 5 && priced > filled.length * 0.3) return PRICE_SCHEDULE;
  return '';
}

// The scope file's text (scope-text.js). Its messages offer to paste the scope, which SiteLink does
// not; here they say what to upload instead.
const FILE_MESSAGES = [
  [/has no text to read/, 'This PDF has no typed text. It may be a drawing or a scanned page. Upload the scope of works as a Word file or a PDF with typed text.'],
  [/^The PDF could not be read/, 'The PDF could not be read. Save it again as a PDF, or upload the Word file of the scope.'],
  [/^The Word file could not be read/, 'The Word file could not be read. Save it again as .docx and upload it again.'],
  [/^Older Word files/, 'Older Word files (.doc) cannot be read. Save it as .docx and upload it again.'],
  [/^Attach a Word file/, 'SiteLink reads a scope from a Word file (.docx), a PDF or a text file. A photo or picture of a scope cannot be read.'],
  [/^Attach the scope/, 'Choose the scope file first.'],
];
async function fileText(body) {
  try {
    return await scopeText({ file: body.file });
  } catch (error) {
    const found = error.publicMessage && FILE_MESSAGES.find(([pattern]) => pattern.test(error.message));
    if (found) throw Object.assign(fail(error.status || 400, found[1]), { field: 'scope' });
    throw error;
  }
}

// ---- Does the scope fit the subcontract's trade? ----
// A rushed lead can upload the wrong file (messy round 6: a mechanical scope for a hydraulics and an
// electrical subcontract). The trade a scope is for is read from its title, at the top; the trade
// typed for the subcontract is read the same way. They differ only when the title names other trades
// and the trade typed is hardly mentioned in the whole scope. It warns; the lead can carry on.
const TRADES = [
  ['mechanical', 'mechanical', /\bmechanical\b|\bhvac\b|\bair[- ]?condition\w*/gi],
  ['hydraulics', 'hydraulics', /\bhydraulic\w*|\bplumb\w*/gi],
  ['electrical', 'electrical', /\belectrical\b|\belectricians?\b/gi],
  ['fire', 'fire services', /\bfire (?:services|protection)\b|\bsprinklers?\b/gi],
  ['formwork', 'formwork', /\bform ?work\b/gi],
  ['reinforcement', 'reinforcement', /\breinforc\w*|\breo\b|\bsteel fix\w*/gi],
  ['concrete', 'civil and concrete', /\bconcret\w*|\bcivil\b/gi],
  ['steel', 'structural steel', /\bstructural steel\b|\bsteel erect\w*/gi],
  ['roofing', 'roofing', /\broof\w*/gi],
  ['painting', 'painting', /\bpaint\w*/gi],
  ['tiling', 'tiling', /\btil(?:e|es|ing)\b/gi],
  ['glazing', 'windows and glazing', /\bglaz\w*|\bwindows?\b/gi],
  ['ceilings', 'ceilings and partitions', /\bceilings?\b|\bpartitions?\b|\bplasterboard\b/gi],
  ['waterproofing', 'waterproofing', /\bwaterproof\w*/gi],
  ['landscaping', 'landscaping', /\blandscap\w*/gi],
  ['joinery', 'joinery', /\bjoinery\b|\bcabinet\w*/gi],
  ['flooring', 'floor coverings', /\bcarpet\w*|\bvinyl\b|\bfloor ?coverings?\b/gi],
  ['security', 'security', /\bsecurity\b|\bcctv\b|\baccess control\b/gi],
  ['cleaning', 'cleaning', /\bclean(?:ing|ers?)?\b/gi],
  ['pool', 'swimming pool', /\bswimming pools?\b/gi],
  ['kitchens', 'commercial kitchens', /\bkitchens?\b/gi],
  ['doors', 'doors', /\bdoors?\b|\bdoor hardware\b/gi],
  ['fencing', 'fencing', /\bfenc\w*/gi],
];
const tradesNamed = (text) => TRADES.filter(([, , pattern]) => new RegExp(pattern.source, 'i').test(String(text || '')));
const timesNamed = (text, trade) => (String(text || '').match(trade[2]) || []).length;
function tradeMismatch(text, tradeTyped) {
  const typedTrades = tradesNamed(tradeTyped);
  const titled = tradesNamed(String(text || '').slice(0, 300));
  if (!typedTrades.length || !titled.length || typedTrades.some((trade) => titled.includes(trade))) return '';
  const top = Math.max(...titled.map((trade) => timesNamed(text, trade)));
  const mine = Math.max(...typedTrades.map((trade) => timesNamed(text, trade)));
  if (mine * 3 > top) return '';
  // The trades the title names that the scope is mostly about.
  const main = titled.filter((trade) => timesNamed(text, trade) * 2 >= top);
  return `This scope reads as ${answers.listed(main.map((trade) => trade[1]))} work, but the subcontract's trade is ${String(tradeTyped).trim().toLowerCase()}. Check it is the right scope for this subcontract.`;
}

// ---- What the lead types ----

function typed(value, max, label, field, { answer = false } = {}) {
  const text = oneLine(value, max);
  if (PLACEHOLDER.test(text)) throw Object.assign(fail(400, `Leave ${label} empty until you know it. The subcontractor would see "${text}".`), { field });
  if (handover.hasPrice(text)) throw Object.assign(fail(400, 'Take the price out. The subcontractor sees this, and SiteLink never passes on prices, rates or amounts.'), { field });
  // An answer the SWMS app would refuse ("me", "dont know", "check with dana") says nothing yet.
  // A point asks who does or supplies something: "us" is answered with the company, not a site role
  // (messy round 8, wording 10: the example was "The site supervisor").
  const weak = answer ? answers.notAnswer(text).replace(/Name the role, for example "The site supervisor"\.$/, 'Name the company, for example "The main contractor supplies them" or "The subcontractor supplies them".') : '';
  if (weak) throw Object.assign(fail(400, weak), { field });
  // "na" or "n/a" answers nothing the point asks, as in a SWMS's blanks (messy round 15, SiteLink: "na" was
  // saved as the answer "Na." and sent to the subcontractor, while "tbc" was refused). An empty point is not sent.
  if (answer && NOT_AN_ANSWER.test(text.replace(/[.;,\s]+$/, ''))) throw Object.assign(fail(400, `"${text}" does not answer the point. Write the answer, or leave it empty: a point with no answer does not go to the subcontractor.`), { field });
  return text;
}
const NOT_AN_ANSWER = /^(?:n\.?\s?a\.?|n\/a|not applicable|nah|nope|nothing|nothing yet|ok|okay|same|ditto|as above|x|-+|\?+)$/i;

// The subcontractor's ABN is optional (D308). With it, only a company with that ABN can take up the list
// in SiteWrite; its check digits must work.
function cleanSubcontract(body) {
  // A company typed in lower case takes its capitals, as the lead's own does (SiteLink round 10, wording 1:
  // "echidna ductworks pty ltd" on the table, the log and the preview).
  const name = answers.tidyName(oneLine(body && body.name, 200));
  // Typed case is tidied (messy round 7: "(mechanical)").
  // "Electrical n comms" reads "Electrical and comms" (messy round 15, SiteLink wording 6).
  const trade = answers.tidyTitle(oneLine(body && body.trade, 120));
  const rawEmail = oneLine(body && body.email, 200);
  const abn = String((body && typeof body.abn === 'string' && body.abn) || '').replace(/\s+/g, '');
  if (!name) throw Object.assign(fail(400, 'Enter the subcontractor\'s company name.'), { field: 'name' });
  if (!trade) throw Object.assign(fail(400, 'Enter the trade, for example Formwork or Electrical.'), { field: 'trade' });
  const email = rawEmail ? auth.cleanEmail(rawEmail) : '';
  if (rawEmail && !email) throw Object.assign(fail(400, 'Enter a valid email address, or leave it empty.'), { field: 'email' });
  if (abn && !validAbn(abn)) throw Object.assign(fail(400, 'That ABN is not valid. Check the 11 digits, or leave it empty.'), { field: 'abn' });
  return { name, trade, email, abn };
}

// ---- Learning from the lead's changes (without names) ----

const monthOf = (date) => new Date(date.getTime() + 10 * 3600000).toISOString().slice(0, 7);

// The names this project holds (the account, the project, its address, the subcontractor, the team),
// taken out of anything kept.
async function namesOf(ctx) {
  const team = await db.query('SELECT reviewers.name FROM org_members JOIN reviewers ON reviewers.id = org_members.reviewer_id WHERE org_members.org_id = $1', [ctx.org.id]);
  const subs = await db.query('SELECT name FROM subcontracts WHERE project_id = $1', [ctx.project.id]);
  return controlLearning.accountTerms({
    businesses: [ctx.org.name, ctx.project.pc_name, ...subs.map((row) => row.name)],
    people: team.map((row) => row.name).filter(Boolean),
    places: [ctx.project.name, ctx.project.workplace],
  });
}

// One change to a list, kept without names or ids. Kinds: removed, restored, added, taskChanged.
async function recordListEdit(ctx, { kind, pack, wording = '', original = '' }) {
  if (!controlLearning.enabled() || !db.enabled()) return;
  const terms = await namesOf(ctx);
  const keyed = ctx.sub.doc_hash ? crypto.createHmac('sha256', controlLearningKey()).update(`scope:${ctx.sub.doc_hash}`).digest('hex') : '';
  await db.query('INSERT INTO list_edit_events (id, month, state, brief_version, package, kind, wording, original, reading_key, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)', [
    crypto.randomUUID(), monthOf(new Date()), ctx.project.state || '', ctx.sub.list_reading_id ? BRIEF_VERSION : '',
    controlLearning.scrub(pack, '', terms).slice(0, 200), kind, controlLearning.scrub(wording, original, terms), controlLearning.scrub(original, '', terms), keyed, new Date(),
  ]);
}

// ---- Views ----

function install(router, deps) {
  const { projectFor, needName, personName, dateTime, detailsView, versionsOf, FIELDS, logEvent } = deps;
  const log = (ctx, req, text) => logEvent({ orgId: ctx.org.id, projectId: ctx.project.id, who: req.reviewer.id, text: `${personName(req.reviewer)} ${text}` });

  async function subcontractFor(req, id) {
    const sub = id && await db.one('SELECT * FROM subcontracts WHERE id = $1 AND removed_at IS NULL', [String(id || '')]);
    if (!sub) throw fail(404, NOT_FOUND);
    try {
      // viewer: who is signed in, for what this person may do (sending, stage 5).
      return { sub, ...(await projectFor(req, sub.project_id)), viewer: req.reviewer };
    } catch {
      throw fail(404, NOT_FOUND);
    }
  }

  const itemsOf = (subId) => db.query('SELECT * FROM required_swms WHERE subcontract_id = $1 ORDER BY position, created_at', [subId]);
  const pointsOf = (subId) => db.query('SELECT * FROM subcontract_points WHERE subcontract_id = $1 ORDER BY position', [subId]);

  // Where each SWMS sits on the lead's page: on the list, set aside as work that may not need a SWMS
  // by law, or removed (with why).
  const groupOf = (row) => (!row.removed_at ? 'list' : row.removed_why === 'noLaw' ? 'aside' : 'removed');
  // Work part of another SWMS, or taken out of it, is shown by the work title it takes on the list, not the
  // reading's package name (messy round 11, SiteLink blocker 6: "Trade installation: cast-in items" under
  // Removed). "Also covers" keeps the scope's name (sl10 decision 6).
  const shownTitle = (row) => (row.removed_at && row.item && row.item.listTitle && !row.item.titleChanged && row.title === row.package ? row.item.listTitle : row.title);
  function itemView(row, rows = []) {
    const item = row.item || {};
    const into = row.removed_why === 'folded' ? rows.find((other) => other.package && other.package === item.foldedInto) : null;
    return {
      id: row.id,
      title: shownTitle(row),
      task: row.task,
      source: row.source,
      removed: Boolean(row.removed_at),
      group: groupOf(row),
      removedWhy: !row.removed_at ? '' : row.removed_why === 'folded' ? handover.foldedWhy(into ? into.title : 'the main SWMS') : handover.REMOVED_WHY[row.removed_why] || '',
      alsoCovers: rows.filter((other) => other.removed_at && other.removed_why === 'folded' && other.item && other.item.foldedInto && other.item.foldedInto === row.package).map((other) => other.title),
      taskChanged: row.task_changed,
      // With the high risk work of the work folded into it, in SiteLink's words (messy round 7).
      highRisk: row.removed_at ? handover.riskOf(item.highRisk || null) : handover.withFolded(row, rows).highRisk,
      // SiteWrite has no job steps for its work: it must not reach the subcontractor empty.
      noSteps: Boolean(item.noSteps),
      titleChanged: Boolean(item.titleChanged),
      activities: (item.activities || []).length,
      clauses: handover.clausesOf(row),
    };
  }

  // A point is asked of the lead only when it asks who does or supplies what (messy round 7: 33 points,
  // mostly statements). A point kept from an earlier reading that does not is not shown, unless it was
  // answered.
  const asked = (row) => Boolean(String(row.answer || '').trim()) || handover.asksWho(row.question);
  function pointView(row, state, rows = []) {
    const item = handover.pointItem(row, rows);
    return {
      // The work it is about with its capital, as it reads (messy round 15, SiteLink wording 3: "remove existing
      // submains (clause 1.30 (a))"); the activity matched against the list is kept as read.
      id: row.id, activity: handover.sentence(row.activity), clause: row.clause, question: handover.pointSentence(row.question), answer: row.answer, answeredBy: row.answered_by_name, answeredOn: row.answered_at ? dateTime(row.answered_at, state) : '',
      // A point about a SWMS that is not on the list is not asked or sent (messy round 6).
      inPlay: handover.pointInPlay(row, rows), swms: item ? item.title : '',
    };
  }

  async function readingsLeft(project) {
    const limit = aiScope.projectFreeReadings();
    const used = await aiScope.projectReadingsUsed(project.id);
    return { used, limit, left: Math.max(0, limit - used), message: used >= limit ? aiScope.limitMessage(limit) : '' };
  }

  // The reading of the subcontract's scope as the page shows it. A finished reading the list was not
  // made from yet becomes the list here, once.
  async function readingOf(ctx) {
    const { sub, org, project } = ctx;
    if (!sub.reading_id) return { status: 'none' };
    let reading;
    try {
      reading = await aiScope.getProjectReading(org, sub.reading_id, project.state);
    } catch {
      return { status: 'none' };
    }
    if (reading.status === 'done' && sub.list_reading_id !== reading.id) await buildList(ctx, reading);
    const read = reading.reading;
    return {
      status: reading.status,
      progress: reading.progress,
      error: reading.error,
      checksPassed: reading.checks ? reading.checks.passed !== false : true,
      // Testing and commissioning done on site is work, not a duty with no SWMS (messy round 11, SiteLink: the
      // hydraulic test and commissioning was listed among the duties that need no SWMS). It is said apart.
      duties: read ? (read.activities || []).filter((row) => row.type === 'Duty' && !handover.handsOnTesting(row.activity)).map((row) => row.activity) : [],
      testing: read ? (read.activities || []).filter((row) => row.type === 'Duty' && handover.handsOnTesting(row.activity)).map((row) => row.activity) : [],
      found: read ? new Set((read.activities || []).filter((row) => row.type !== 'Duty').map((row) => row.package)).size : 0,
    };
  }

  // The list made from a finished reading: the SWMS it lists (handover.listItems) and its points to
  // confirm. SWMS the lead added stay. Made once for each reading, by whichever request gets there first.
  async function buildList(ctx, reading) {
    const items = handover.listItems(reading.reading);
    // Whether SiteWrite has job steps for each SWMS's work, asked once, here.
    for (const item of items) item.noSteps = handover.noJobSteps(item, ctx.project.state);
    const points = handover.listPoints(reading.reading);
    const now = new Date();
    let made = false;
    await db.transaction(async (tx) => {
      const claimed = await tx.query('UPDATE subcontracts SET list_reading_id = $1, list_rev = list_rev + 1, updated_at = $3 WHERE id = $2 AND list_reading_id <> $1 RETURNING list_rev', [reading.id, ctx.sub.id, now]);
      if (!claimed.length) return;
      made = true;
      const rev = Number(claimed[0].list_rev);
      await tx.query("DELETE FROM required_swms WHERE subcontract_id = $1 AND source = 'reading'", [ctx.sub.id]);
      await tx.query('DELETE FROM subcontract_points WHERE subcontract_id = $1', [ctx.sub.id]);
      let position = 0;
      for (const item of items.slice(0, ITEM_LIMIT)) {
        const { package: pack, removedWhy, title, task, ...rest } = item;
        await tx.query('INSERT INTO required_swms (id, subcontract_id, position, package, title, task, item, source, removed_at, removed_why, list_rev, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)',
          [auth.newId(), ctx.sub.id, position, pack, title, task, JSON.stringify({ ...rest, title, task }), 'reading', removedWhy ? now : null, removedWhy, rev, now]);
        position += 1;
      }
      const added = await tx.query("SELECT id FROM required_swms WHERE subcontract_id = $1 AND source = 'added' ORDER BY position, created_at", [ctx.sub.id]);
      for (const row of added) {
        await tx.query('UPDATE required_swms SET position = $1 WHERE id = $2', [position, row.id]);
        position += 1;
      }
      let at = 0;
      for (const point of points) {
        await tx.query('INSERT INTO subcontract_points (id, subcontract_id, position, activity, clause, question) VALUES ($1, $2, $3, $4, $5, $6)', [auth.newId(), ctx.sub.id, at, point.activity, point.clause, point.question]);
        at += 1;
      }
    });
    ctx.sub = await db.one('SELECT * FROM subcontracts WHERE id = $1', [ctx.sub.id]);
    // "SiteLink read it" only once the reading has finished (messy round 7: it was logged at 6%).
    if (made) {
      const kept = items.filter((item) => !item.removedWhy).length;
      // A file read before is not read again: the line says the list came from that reading (messy round
      // 8, wording 11: "SiteLink read ..." straight after "It was read before, so it cost nothing").
      const reused = Boolean(await db.one('SELECT id FROM subcontracts WHERE reading_id = $1 AND id <> $2 LIMIT 1', [reading.id, ctx.sub.id]));
      await logEvent({ orgId: ctx.org.id, projectId: ctx.project.id, text: reused ? `SiteLink listed ${kept} SWMS for ${ctx.sub.name} from its earlier reading of ${ctx.sub.doc_name || 'the scope'}.` : `SiteLink read ${ctx.sub.doc_name || 'the scope'}, the scope for ${ctx.sub.name}, and listed ${kept} SWMS.` });
    }
  }

  function subcontractView(sub, state, read) {
    // When the scope was read: the reading's own time, which for a file read before is earlier than
    // when it was chosen for this subcontract (messy round 6).
    const readAt = read && (read.finished_at || read.created_at);
    return {
      id: sub.id, projectId: sub.project_id, name: answers.tidyName(sub.name), trade: sub.trade, email: sub.contact_email, status: sub.status,
      docName: sub.doc_name, scopeOn: sub.scope_at ? dateTime(sub.scope_at, state) : '', scopeBy: sub.scope_by_name, listRev: Number(sub.list_rev || 0),
      readOn: readAt ? dateTime(readAt, state) : '', readBefore: Boolean(readAt && sub.scope_at && new Date(readAt) < new Date(sub.scope_at) - 60000),
      tradeWarning: sub.trade_warning || '',
      abn: sub.abn || '',
    };
  }

  async function subcontractPage(ctx, extra = {}) {
    const reading = await readingOf(ctx);
    const { sub, project, org, role } = ctx;
    const rows = await itemsOf(sub.id);
    const points = await pointsOf(sub.id);
    const versions = await versionsOf(project.id);
    const siteDetails = detailsView(versions[versions.length - 1], project.state);
    // A reading of the same file on another subcontract of this project, said so the lead knows it was not paid twice.
    const shared = sub.doc_hash ? await db.query('SELECT name, trade FROM subcontracts WHERE project_id = $1 AND doc_hash = $2 AND id <> $3 AND removed_at IS NULL', [project.id, sub.doc_hash, sub.id]) : [];
    const read = sub.reading_id ? await db.one('SELECT created_at, finished_at FROM ai_readings WHERE id = $1', [sub.reading_id]) : null;
    return {
      subcontract: subcontractView(sub, project.state, read),
      project: { id: project.id, name: project.name, workplace: project.workplace, state: project.state, pcName: project.pc_name },
      org: { id: org.id, name: org.name, role },
      reading,
      sameFile: shared.map((row) => `${row.name}${row.trade ? ` (${row.trade})` : ''}`),
      items: rows.map((row) => itemView(row, rows)),
      points: points.filter(asked).map((row) => pointView(row, project.state, rows)),
      readings: await readingsLeft(project),
      preview: handover.subcontractorView({ project, org, subcontract: sub, items: rows, points, siteDetails, fields: FIELDS, withNotes: true }),
      // Stage 5: sending the list, reminders, the files uploaded, the claim and the log.
      sending: await send.sendingFor(ctx),
      // Stage 7: what has been submitted or received for each SWMS on the list.
      received: await require('./sitelink-submit').forSubcontractPage(ctx),
      ...extra,
    };
  }

  // ---- The project's subcontracts, for the project screen ----

  async function projectSubcontracts(project, org) {
    const subs = await db.query('SELECT * FROM subcontracts WHERE project_id = $1 AND removed_at IS NULL ORDER BY created_at', [project.id]);
    const out = [];
    for (const sub of subs) {
      // A reading finished since anyone opened the subcontract becomes its list here, so the count is right.
      if (sub.reading_id && sub.list_reading_id !== sub.reading_id) await readingOf({ sub, org, project });
      const items = await db.query('SELECT * FROM required_swms WHERE subcontract_id = $1', [sub.id]);
      // Only the points the lead is still asked: who does or supplies what, about a SWMS on the list, before
      // the list is sent. Once it is sent, a point left unanswered is the lead's choice (messy round 7:
      // "27 points to answer" stayed after sending).
      const open = sub.sent_at ? [] : (await db.query("SELECT * FROM subcontract_points WHERE subcontract_id = $1 AND answer = ''", [sub.id])).filter((point) => asked(point) && handover.pointInPlay(point, items));
      let scope = sub.reading_id ? 'reading' : 'none';
      if (sub.reading_id) {
        const row = await db.one('SELECT status FROM ai_readings WHERE id = $1', [sub.reading_id]);
        scope = row ? row.status : 'none';
      }
      // Work folded into a SWMS that is itself removed goes with it: it is removed, not "in another SWMS"
      // (messy round 11, SiteLink: "5 in another SWMS" for lists where that SWMS was removed).
      const hostOn = (row) => items.some((other) => !other.removed_at && other.package && row.item && other.package === row.item.foldedInto);
      const inOther = (row) => row.removed_at && row.removed_why === 'folded' && hostOn(row);
      out.push({
        id: sub.id, name: answers.tidyName(sub.name), trade: sub.trade, scope, status: sub.status,
        swms: items.filter((row) => !row.removed_at).length, removed: items.filter((row) => row.removed_at && row.removed_why !== 'noLaw' && !inOther(row)).length,
        // Work folded into another SWMS on the list, said apart from work removed (messy round 7).
        folded: items.filter(inOther).length,
        aside: items.filter((row) => row.removed_at && row.removed_why === 'noLaw').length,
        pointsOpen: open.length,
        ...(await send.summaryFor(sub, project)),
        // Stage 7: each SWMS on the list, whether it is in, its review, conditions and changed details.
        ...(await require('./sitelink-submit').summaryFor(sub, project)),
      });
    }
    return { subcontracts: out, readings: await readingsLeft(project) };
  }

  // ---- Routes ----

  router.post('/hse/projects/:projectId/subcontracts', route(async (req, res) => {
    const { project, org, role } = await projectFor(req, req.params.projectId);
    needName(req);
    const fields = cleanSubcontract(req.body);
    const id = auth.newId();
    const now = new Date();
    await db.query('INSERT INTO subcontracts (id, project_id, name, trade, contact_email, abn, created_by, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)',
      [id, project.id, fields.name, fields.trade, fields.email, fields.abn, req.reviewer.id, now]);
    record('subcontract_added', null);
    const sub = await db.one('SELECT * FROM subcontracts WHERE id = $1', [id]);
    await log({ org, project }, req, `added the subcontract ${fields.name} (${fields.trade}).`);
    res.status(201).json(await subcontractPage({ sub, project, org, role, viewer: req.reviewer }));
  }));

  router.get('/hse/subcontracts/:subId', route(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await subcontractPage(await subcontractFor(req, req.params.subId)));
  }));

  router.put('/hse/subcontracts/:subId', route(async (req, res) => {
    const ctx = await subcontractFor(req, req.params.subId);
    const fields = cleanSubcontract(req.body);
    // Once a company has taken up the list, the ABN that decided it stays (D308).
    if (ctx.sub.claimed_at && fields.abn !== (ctx.sub.abn || '')) throw Object.assign(fail(400, `${ctx.sub.claimed_name} has taken up the list in SiteWrite, so the ABN cannot be changed now.`), { field: 'abn' });
    // A new trade clears the warning that the scope is for another trade.
    await db.query('UPDATE subcontracts SET name = $1, trade = $2, contact_email = $3, abn = $7, updated_at = $4, trade_warning = $6 WHERE id = $5',
      [fields.name, fields.trade, fields.email, new Date(), ctx.sub.id, fields.trade === ctx.sub.trade ? ctx.sub.trade_warning || '' : '', fields.abn]);
    if (fields.email !== ctx.sub.contact_email && ctx.sub.sent_at) await log(ctx, req, `changed the contact email for ${ctx.sub.name} from ${ctx.sub.contact_email || 'none'} to ${fields.email || 'none'}.`);
    ctx.sub = await db.one('SELECT * FROM subcontracts WHERE id = $1', [ctx.sub.id]);
    res.json(await subcontractPage(ctx, { message: 'The subcontract details are saved.' }));
  }));

  router.delete('/hse/subcontracts/:subId', route(async (req, res) => {
    const ctx = await subcontractFor(req, req.params.subId);
    await db.query('UPDATE subcontracts SET removed_at = $1 WHERE id = $2', [new Date(), ctx.sub.id]);
    await log(ctx, req, `removed the subcontract ${ctx.sub.name}.`);
    res.json({ ok: true, message: `${ctx.sub.name} has been removed from the project.` });
  }));

  // The subcontract's scope: read once on the project, or the account's reading of the same file used
  // again at no cost. A list already made from another scope is replaced only when the lead says so.
  router.post('/hse/subcontracts/:subId/scope', route(async (req, res) => {
    const ctx = await subcontractFor(req, req.params.subId);
    needName(req);
    const body = req.body || {};
    const text = await fileText(body);
    const wrong = notAScope(text);
    if (wrong) throw Object.assign(fail(422, wrong), { field: 'scope' });
    const hash = aiScope.fingerprint(text);
    if (ctx.sub.list_reading_id && hash !== ctx.sub.doc_hash && !body.replace) {
      throw Object.assign(fail(409, 'This subcontract already has a SWMS list from its scope. Reading a new scope replaces that list and the answers you gave. SWMS you added yourself stay.'), { replace: true });
    }
    // A scope for another trade is asked about before anything is read, so a wrong file costs nothing.
    const mismatch = tradeMismatch(text, ctx.sub.trade);
    if (mismatch && !body.tradeChecked) throw Object.assign(fail(409, mismatch), { field: 'scope', tradeMismatch: true });
    let started;
    try {
      started = await aiScope.startProjectReading(ctx, text, ctx.project.state, { clean: (reading, checks) => ({ reading: handover.scrubReading(reading), checks: handover.scrubChecks(checks) }) });
    } catch (error) {
      if (error.limit) throw Object.assign(fail(402, error.message), { limit: true });
      throw error;
    }
    const name = String((body.file && body.file.name) || 'Pasted text').replace(/[\\/]/g, ' ').slice(0, 200);
    await db.query('UPDATE subcontracts SET reading_id = $1, doc_name = $2, doc_hash = $3, scope_at = $4, scope_by_name = $5, updated_at = $4, trade_warning = $7 WHERE id = $6',
      [started.id, name, hash, new Date(), personName(req.reviewer), ctx.sub.id, mismatch]);
    record(started.kept ? 'project_scope_kept' : 'project_scope', null);
    await log(ctx, req, started.kept ? `used ${name} as the scope for ${ctx.sub.name}. It was read before, so it cost nothing.` : `uploaded ${name} as the scope for ${ctx.sub.name}. SiteLink is reading it.`);
    ctx.sub = await db.one('SELECT * FROM subcontracts WHERE id = $1', [ctx.sub.id]);
    const message = started.kept ? 'This file was read before for your account, so it was not read again. It cost nothing and does not count toward the project\'s free readings.' : '';
    res.status(started.kept ? 200 : 202).json(await subcontractPage(ctx, { kept: Boolean(started.kept), message }));
  }));

  // The scope's own words for the list's SWMS (their titles as read, work, activities and quoted lines), for the
  // short names it writes in capitals.
  // The companies and people the lead's words may name: the builder, the subcontractor, and the people in the site
  // details and the builder's team.
  const leadNames = async (ctx) => ({
    names: [ctx.org && ctx.org.name, ctx.project && ctx.project.pc_name, ctx.sub.name, ctx.sub.claimed_name].filter(Boolean),
    people: await require('./sitelink-submit').projectPeople(ctx.project.id, ctx.org && ctx.org.id),
  });
  const scopeWordsOf = (rows) => (rows || []).flatMap((one) => {
    const item = one.item || {};
    return [one.package, one.task, item.scopeTask && item.scopeTask.full, ...(item.activities || []).flatMap((entry) => [entry.activity, ...(entry.quotes || [])])];
  }).filter((text) => typeof text === 'string').join('\n');

  // A SWMS the lead adds to the list.
  router.post('/hse/subcontracts/:subId/items', route(async (req, res) => {
    const ctx = await subcontractFor(req, req.params.subId);
    const body = req.body || {};
    const scopeText = scopeWordsOf(await itemsOf(ctx.sub.id));
    const title = answers.tidyTitle(typed(body.title, 160, 'the title', 'title'), scopeText);
    // "n", "b4", short names and the project's people as they print (messy round 17, SiteLink wording 3).
    const task = answers.leadWords(typed(body.task, 1500, 'the work', 'task'), { ...(await leadNames(ctx)), scopeText, stop: true });
    if (!title) throw Object.assign(fail(400, 'Enter a title for the SWMS, for example Formwork to suspended slabs.'), { field: 'title' });
    if (!task) throw Object.assign(fail(400, 'Say what work this SWMS covers, in a sentence or two.'), { field: 'task' });
    // The high risk work the lead's own words name, by the scope reading's rules (messy round 6: a
    // 60 t mobile crane lift showed none).
    const highRisk = handover.highRiskOf(`${title}. ${task}`, ctx.project.state);
    const rows = await itemsOf(ctx.sub.id);
    if (rows.length >= ITEM_LIMIT) throw fail(400, `A list holds up to ${ITEM_LIMIT} SWMS.`);
    const now = new Date();
    const rev = await bumpList(ctx);
    await db.query('INSERT INTO required_swms (id, subcontract_id, position, package, title, task, item, source, list_rev, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)',
      [auth.newId(), ctx.sub.id, rows.length, '', title, task, JSON.stringify({ title, task, scopeTask: { plain: task, full: task, notes: '' }, kinds: null, leaveOut: null, unmatched: null, activities: [], highRisk, noSteps: handover.noJobSteps({ task, kinds: null }, ctx.project.state) }), 'added', rev, now]);
    await recordListEdit(ctx, { kind: 'added', pack: title, wording: task });
    await log(ctx, req, `added ${title} to the SWMS list for ${ctx.sub.name}.`);
    res.status(201).json(await subcontractPage(ctx, { message: `${title} is added to the list.${answers.ourWordsNote(task, ctx.sub.name)}` }));
  }));

  async function bumpList(ctx) {
    const rows = await db.query('UPDATE subcontracts SET list_rev = list_rev + 1, updated_at = $2 WHERE id = $1 RETURNING list_rev', [ctx.sub.id, new Date()]);
    ctx.sub = await db.one('SELECT * FROM subcontracts WHERE id = $1', [ctx.sub.id]);
    return Number(rows[0].list_rev);
  }

  // Keep, remove or put back a SWMS, or change the words of its work.
  router.put('/hse/subcontracts/:subId/items/:itemId', route(async (req, res) => {
    const ctx = await subcontractFor(req, req.params.subId);
    const row = await db.one('SELECT * FROM required_swms WHERE id = $1 AND subcontract_id = $2', [String(req.params.itemId || ''), ctx.sub.id]);
    if (!row) throw fail(404, 'That SWMS is not on this list.');
    const body = req.body || {};
    const now = new Date();
    let message = '';
    if (typeof body.removed === 'boolean' && body.removed !== Boolean(row.removed_at)) {
      const rev = await bumpList(ctx);
      // Work that was part of another SWMS takes its work title when it goes on the list (messy round 10,
      // blocker 7), unless the lead named it or another SWMS on the list has that title.
      const listTitle = !body.removed && row.item && row.item.listTitle && !row.item.titleChanged && row.title === row.package ? row.item.listTitle : '';
      const free = listTitle && !(await itemsOf(ctx.sub.id)).some((other) => other.id !== row.id && !other.removed_at && other.title.trim().toLowerCase() === listTitle.toLowerCase());
      if (free) row.title = listTitle;
      await db.query("UPDATE required_swms SET removed_at = $1, removed_why = '', title = $2, list_rev = $3, updated_at = $4 WHERE id = $5", [body.removed ? now : null, row.title, rev, now, row.id]);
      await recordListEdit(ctx, { kind: body.removed ? 'removed' : 'restored', pack: row.package || row.title, wording: row.task });
      const moved = !body.removed && row.removed_why === 'noLaw';
      message = body.removed ? `${row.title} is removed from the list.` : moved ? `${row.title} is moved to the list.` : `${row.title} is back on the list.`;
      await log(ctx, req, body.removed ? `removed ${row.title} from the SWMS list for ${ctx.sub.name}.` : `put ${row.title} on the SWMS list for ${ctx.sub.name}.`);
    }
    // A new title (messy round 7: "Plant delivery and lifting: whole project" held the whole installation,
    // and could not be renamed). The same checks as a SWMS the lead adds: a capital first letter, no price.
    if (typeof body.title === 'string') {
      const title = answers.tidyTitle(typed(body.title, 160, 'the title', 'title'), scopeWordsOf(await itemsOf(ctx.sub.id)));
      if (!title) throw Object.assign(fail(400, 'Enter a title for the SWMS, for example Formwork to suspended slabs.'), { field: 'title' });
      const rows = await itemsOf(ctx.sub.id);
      if (rows.some((other) => other.id !== row.id && !other.removed_at && other.title.trim().toLowerCase() === title.toLowerCase())) throw Object.assign(fail(400, 'Another SWMS on this list has that title. Give this one another.'), { field: 'title' });
      if (title !== row.title) {
        const rev = await bumpList(ctx);
        const task = row.task;
        // A title alone does not change the work, so the reading's high risk work stays; the lead's own
        // words are read again, as when they are changed.
        const own = row.source === 'added' || row.task_changed;
        const item = { ...(row.item || {}), title, titleChanged: true, ...(own ? { highRisk: handover.highRiskOf(`${title}. ${task}`, ctx.project.state, row.item || {}) } : {}) };
        await db.query('UPDATE required_swms SET title = $1, item = $2, list_rev = $3, updated_at = $4 WHERE id = $5', [title, JSON.stringify(item), rev, now, row.id]);
        await recordListEdit(ctx, { kind: 'titleChanged', pack: row.package || row.title, wording: title, original: row.title });
        await log(ctx, req, `changed the title of ${row.title} to ${title} on the SWMS list for ${ctx.sub.name}.`);
        message = `The title is saved: ${title}.`;
        row.title = title;
        row.item = item;
      }
    }
    let unfolded = '';
    if (typeof body.task === 'string') {
      // Typed case is tidied (messy round 7: "install AHUs, ..." reached the subcontractor).
      // Each sentence with its capital and the last with its full stop (messy round 8, wording 14).
      // "n", "b4", short names and the project's people as they print (messy round 17, SiteLink wording 3: "Clean inside AHUs
      // n replace filters b4 practical completion").
      const task = answers.leadWords(typed(body.task, 1500, 'the work', 'task'), { ...(await leadNames(ctx)), scopeText: scopeWordsOf(await itemsOf(ctx.sub.id)), stop: true });
      if (!task) throw Object.assign(fail(400, 'Say what work this SWMS covers, in a sentence or two.'), { field: 'task' });
      if (task !== row.task) {
        const rev = await bumpList(ctx);
        // The high risk work is read again from the lead's own words, with only the package's step groups
        // those words still name, and so is whether SiteWrite has job steps for it (messy round 8, blocker
        // 1: reworded to data cabling only, it still said "Chemical, fuel or refrigerant lines" and
        // "Energised electrical installations" from the scope's step groups).
        const named = require('./draft').kindsInWords({ state: ctx.project.state, task });
        const kept = Array.isArray((row.item || {}).kinds) ? row.item.kinds.filter((id) => named.includes(id)) : null;
        const base = { ...(row.item || {}), task, kinds: kept && kept.length ? kept : null };
        const item = { ...base, highRisk: handover.highRiskOf(`${row.title}. ${task}`, ctx.project.state, base), noSteps: handover.noJobSteps({ task, kinds: handover.draftKinds(base.kinds) }, ctx.project.state) };
        await db.query('UPDATE required_swms SET task = $1, item = $2, task_changed = TRUE, list_rev = $3, updated_at = $4 WHERE id = $5', [task, JSON.stringify(item), rev, now, row.id]);
        // Work folded into it from the scope is no longer part of it: the lead's words say what it covers
        // now, so "Also covers" and that work's high risk go with it. It is under Removed, to put back.
        // Work the new words still name stays part of it (messy round 10, blocker 5).
        const folded = (await itemsOf(ctx.sub.id)).filter((other) => other.removed_at && other.removed_why === 'folded' && row.package && other.item && other.item.foldedInto === row.package && !handover.foldedNamed(task, other));
        if (folded.length) {
          // Each takes its work title now it stands alone (messy round 11, blocker 6), unless the list has it.
          const all = await itemsOf(ctx.sub.id);
          for (const other of folded) {
            const own = other.item && other.item.listTitle && !other.item.titleChanged && other.title === other.package && !all.some((one) => one.id !== other.id && one.title.trim().toLowerCase() === other.item.listTitle.toLowerCase()) ? other.item.listTitle : other.title;
            await db.query("UPDATE required_swms SET removed_why = 'unfolded', title = $1, list_rev = $2, updated_at = $3 WHERE id = $4", [own, rev, now, other.id]);
          }
          // Named as "Also covers" names them, not by the reading's package names (messy round 9, wording 3:
          // "Trade installation: fire hydrant services, ... are no longer part of it").
          const names = folded.map((other) => String(other.title).replace(/^trade installation:\s*/i, '').replace(/^./, (letter) => letter.toLowerCase()));
          const lead = names.length === 1 ? `${names[0]} is` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are`;
          unfolded = ` ${lead.replace(/^./, (letter) => letter.toUpperCase())} no longer part of it: ${names.length === 1 ? 'it is' : 'they are'} under Removed. Put ${names.length === 1 ? 'it' : 'one'} back if it needs a SWMS of its own.`;
        }
        await recordListEdit(ctx, { kind: 'taskChanged', pack: row.package || row.title, wording: task, original: row.task });
        await log(ctx, req, `changed the work for ${row.title} on the SWMS list for ${ctx.sub.name}.`);
        message = `${message ? `${message} The work for ${row.title} is saved too.` : `The work for ${row.title} is saved.`}${unfolded}${answers.ourWordsNote(task, ctx.sub.name)}`;
      }
    }
    res.json(await subcontractPage(ctx, { message }));
  }));

  // The lead's answer to a point to confirm. Only answered points go to the subcontractor.
  router.put('/hse/subcontracts/:subId/points/:pointId', route(async (req, res) => {
    const ctx = await subcontractFor(req, req.params.subId);
    needName(req);
    const row = await db.one('SELECT * FROM subcontract_points WHERE id = $1 AND subcontract_id = $2', [String(req.params.pointId || ''), ctx.sub.id]);
    if (!row) throw fail(404, 'That point is not on this subcontract.');
    // Each sentence with its capital (messy round 8, wording 2: "... boards. wallaroo installs them").
    // The companies' own names take their capitals, and a full stop at the end (messy round 10, wording 7:
    // "Potoroo bend builds", "Approval is a hold point before install").
    // "n", "b4" and the project's people with their capitals too (messy round 17, SiteLink wording 3: "Callum fitzwilliam
    // will give you the date", "n walkways", "b4 use").
    const answer = answers.leadWords(typed(req.body && req.body.answer, 1000, 'the answer', 'answer', { answer: true }), { ...(await leadNames(ctx)), stop: true });
    await db.query('UPDATE subcontract_points SET answer = $1, answered_by = $2, answered_by_name = $3, answered_at = $4 WHERE id = $5',
      [answer, answer ? req.reviewer.id : '', answer ? personName(req.reviewer) : '', answer ? new Date() : null, row.id]);
    res.json(await subcontractPage(ctx, { message: answer ? 'Your answer is saved. The subcontractor will see it with the list.' : 'The answer is taken off. The subcontractor will not see this point.' }));
  }));

  return { projectSubcontracts, subcontractFor, subcontractPage };
}

module.exports = { install, notAScope, tradeMismatch, DRAWING, PRICE_SCHEDULE };
