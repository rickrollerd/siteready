// SiteLink, Goal 12 stage 7: submit, review from the one screen, conditions. A SWMS on a builder's list
// is submitted only after SiteWrite's check and the part-by-part check; the submitted revision is what
// the main contractor reads, and nothing else; the "Set by" details it changed are worked out again on
// submission; the HSE lead reviews it in the project's context; a later revision starts unreviewed; the
// subcontractor marks each condition done and the lead confirms it; a SWMS received outside SiteWrite
// is recorded, with an optional Builder check that counts toward the project's free readings.
// Made-up companies, people and sites only. No paid AI reading: the stand-in client answers.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.RATE_LIMIT_HSE_REQUESTS = '5000';
process.env.RATE_LIMIT_MAX_REQUESTS = '5000';
process.env.RATE_LIMIT_LIST_REQUESTS = '5000';
process.env.RATE_LIMIT_LIST_SENDS = '1000';
process.env.RATE_LIMIT_WORD_REQUESTS = '30000';
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const db = require('../db');
const send = require('../sitelink-send');
const submit = require('../sitelink-submit');
const abnRegister = require('../abn');
const aiScope = require('../ai-scope');
const { validAbn } = require('../accounts');
const { prepareDraft } = require('../draft');
const { draftBody } = require('../input');
const { draftToDocx } = require('../docx-draft');
const { setupAccounts, mailbox, lastLinkToken, ANSWERED, ready, checked } = require('./helpers');

abnRegister.lookupAbn = async () => ({ enabled: false });
let abnSeed = 71928374000;
function nextAbn() {
  for (abnSeed += 97; ; abnSeed += 1) if (validAbn(String(abnSeed))) return String(abnSeed);
}

let server;
let base;
test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  server.keepAliveTimeout = 120000;
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => {
  aiScope.useClient(null);
  delete process.env.ANTHROPIC_API_KEY;
  server.close();
});

async function call(method, route, { body, reviewer, session, raw, headers = {} } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(reviewer ? { 'X-Reviewer-Token': reviewer } : {}), ...(session ? { Authorization: `Bearer ${session}` } : {}), ...headers },
    body: raw || (body ? JSON.stringify(body) : undefined),
  });
  const type = response.headers.get('content-type') || '';
  return { status: response.status, headers: response.headers, data: type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
}

function inDays(days) {
  const day = new Date(`${send.todayIn('qld')}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

async function leadSignIn(email, name = 'Dana Whitfield') {
  assert.equal((await call('POST', '/api/hse/email', { body: { email } })).status, 200);
  const text = [...mailbox].reverse().find((item) => item.to === email).text;
  const token = /\/sitelink\?login=([A-Za-z0-9_-]+)/.exec(text)[1];
  const { data } = await call('POST', '/api/hse/verify', { body: { token } });
  assert.equal((await call('PUT', '/api/hse/me', { reviewer: data.token, body: { name, position: 'HSE manager', phone: '0412 555 012' } })).status, 200);
  return data.token;
}

const WORKPLACE = '12 Wattle Road, Hamilton QLD 4007';
const DETAILS = {
  musterPoint: 'Assembly area A at the Wattle Road gate',
  firstAider: 'Priya Nair, site office, 0412 555 019',
  firstAidLocation: 'Site office, ground floor',
  hospital: 'Northside General Hospital, Emergency Department',
  siteManager: 'Ravi Patel, 0412 555 020',
  siteRules: ['Sign in at the site office before starting.', 'No work before 6:30 am.'],
};
const ITEMS = [['Boundary fence repairs', 'Replace a 3m length of timber fence along the site boundary.'], ['Ceilings to level 2', 'Install ceiling grid and plasterboard to level 2 offices.']];

// A builder's account with a project, its site details, a subcontract with two SWMS, and the list sent.
async function builder(prefix, { abn = '' } = {}) {
  const lead = await leadSignIn(`dana@${prefix}.example`);
  const org = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Corbel Build Pty Ltd', abn: nextAbn() } });
  assert.equal(org.status, 201, JSON.stringify(org.data));
  await db.query("UPDATE orgs SET abn_check = 'verified', abn_verified_at = $1 WHERE id = $2", [new Date(), org.data.org.id]);
  const project = await call('POST', `/api/hse/orgs/${org.data.org.id}/projects`, { reviewer: lead, body: { name: 'Northgate Health Hub', workplace: WORKPLACE, state: 'qld' } });
  const projectId = project.data.project.id;
  assert.equal((await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 0, details: DETAILS } })).status, 200);
  const email = `office@${prefix}-sub.example`;
  const added = await call('POST', `/api/hse/projects/${projectId}/subcontracts`, { reviewer: lead, body: { name: 'Tallow Interiors Pty Ltd', trade: 'Interiors', email, abn } });
  assert.equal(added.status, 201, JSON.stringify(added.data));
  const subId = added.data.subcontract.id;
  for (const [title, task] of ITEMS) assert.equal((await call('POST', `/api/hse/subcontracts/${subId}/items`, { reviewer: lead, body: { title, task } })).status, 201);
  const due = inDays(14);
  const preview = await call('POST', `/api/hse/subcontracts/${subId}/send/preview`, { reviewer: lead, body: { due } });
  assert.equal((await call('POST', `/api/hse/subcontracts/${subId}/send`, { reviewer: lead, body: { due, check: preview.data.preview.check } })).status, 200);
  const token = /\/list\.html\?t=([A-Za-z0-9_-]+)/.exec(mailbox.filter((item) => item.to === email).pop().text)[1];
  return { lead, orgId: org.data.org.id, projectId, subId, token, email, leadEmail: `dana@${prefix}.example` };
}

async function subbie(email, name = '', abn = '') {
  assert.equal((await call('POST', '/api/auth/email', { body: { email } })).status, 200);
  const { data } = await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } });
  if (name) assert.equal((await call('PUT', '/api/company', { session: data.token, body: { name, abn, address: '4 Tallow Lane, Darra QLD 4076', phone: '07 3555 0100', email } })).status, 200);
  return data.token;
}

async function claimed(prefix) {
  const b = await builder(prefix);
  const officeEmail = `admin@${prefix}-sub.example`;
  const office = await subbie(officeEmail, 'Tallow Interiors Pty Ltd', nextAbn());
  assert.equal((await call('POST', `/api/list/${b.token}/claim`, { session: office })).status, 200);
  const { list } = (await call('GET', `/api/from-builders/${b.subId}`, { session: office })).data;
  return { ...b, office, officeEmail, list };
}

// A SWMS for a list item as the one-go page sends it: the builder's details filled in, prepared,
// SiteWrite's check passed and each part ticked by the foreman.
function swmsFor(item, extra = {}, who = { name: 'Tom Beck', role: 'Foreman' }) {
  const input = ready({ ...ANSWERED, state: 'qld', task: item.task, fallRisk: 'no', residential: 'no', workplace: WORKPLACE, principalContractor: 'Corbel Build Pty Ltd', ...DETAILS, ...extra });
  return { ...checked(input, null, who), swmsTitle: item.title };
}
const submitItems = (c, entries) => call('POST', `/api/from-builders/${c.subId}/submit`, { session: c.office, body: { items: entries } });
const one = (item, extra, who) => ({ requiredId: item.requiredId, swms: swmsFor(item, extra, who) });
const project = async (c) => (await call('GET', `/api/hse/projects/${c.projectId}`, { reviewer: c.lead })).data;
const rowOf = async (c, title) => (await project(c)).subcontracts[0].stage7.items.find((item) => item.title === title);

// ---- Submitting ----

test('a SWMS submits only after SiteWrite\'s check and the part-by-part check; the lead is emailed once, briefly', async () => {
  const c = await claimed('sub1');
  const [fence] = c.list.items;
  // Not prepared, not checked, or a blank left: each refused with why, nothing submitted.
  const noCheck = swmsFor(fence);
  delete noCheck.check;
  let r = await submitItems(c, [{ requiredId: fence.requiredId, swms: noCheck }]);
  assert.equal(r.status, 400);
  assert.equal(r.data.refused[0].message, 'Tick each part as checked, and give your name and role, before submitting.');
  r = await submitItems(c, [one(fence, { musterPoint: '' })]);
  assert.equal(r.status, 400);
  assert.match(r.data.refused[0].message, /^SiteWrite does not produce a SWMS until the site questions are answered/);
  const stale = swmsFor(fence);
  stale.check.partHashes.steps = 'changed-since';
  r = await submitItems(c, [{ requiredId: fence.requiredId, swms: stale }]);
  assert.equal(r.status, 400);
  assert.equal(r.data.refused[0].stale[0], 'steps');
  assert.equal((await db.query('SELECT * FROM submissions WHERE subcontract_id = $1', [c.subId])).length, 0);
  assert.equal((await rowOf(c, fence.title)).state, 'none');
  // Checked: submitted, saved under My SWMS as revision 1, and the lead emailed.
  const before = mailbox.length;
  r = await submitItems(c, [one(fence)]);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.submitted.length, 1);
  assert.equal(r.data.submitted[0].revision, 1);
  assert.equal(r.data.message, 'Boundary fence repairs is submitted to Corbel Build Pty Ltd, and Dana Whitfield has been emailed. That revision is what Corbel Build Pty Ltd reviews. If you change it now, submit it again.');
  const mine = (await call('GET', '/api/swms', { session: c.office })).data.swms;
  assert.equal(mine.length, 1, 'saved under My SWMS');
  const mail = mailbox.slice(before).filter((item) => item.to === c.leadEmail);
  assert.equal(mail.length, 1);
  assert.equal(mail[0].subject, 'SWMS submitted for Northgate Health Hub');
  assert.equal(mail[0].from.name, 'Tom Beck via SiteWrite');
  assert.equal(mail[0].replyTo, c.officeEmail);
  assert.equal(mail[0].text, `Tom Beck from Tallow Interiors Pty Ltd has submitted a SWMS for Northgate Health Hub:\n\n• Boundary fence repairs, revision 1.\n\nReview it in SiteLink:\n${base}/sitelink#/project/${c.projectId}`);
  const kept = await db.one("SELECT * FROM mail_messages WHERE subcontract_id = $1 AND template = 'submitted'", [c.subId]);
  assert.equal(kept.template_version, 1);
  assert.equal(kept.from_name, 'Tom Beck via SiteWrite');
  // The same revision submitted again is kept once, and no second email goes.
  const again = await submitItems(c, [one(fence)]);
  assert.equal(again.status, 200);
  assert.equal(again.data.submitted[0].repeated, true);
  assert.equal(again.data.message, 'That revision was already submitted to Corbel Build Pty Ltd. Nothing has changed since.');
  assert.equal(mailbox.slice(before).filter((item) => item.to === c.leadEmail).length, 1);
  // Logged both sides: the lead's log and the company's.
  const leadLog = (await call('GET', `/api/hse/subcontracts/${c.subId}`, { reviewer: c.lead })).data.sending.log.map((entry) => entry.text);
  assert.ok(leadLog.includes('Tallow Interiors Pty Ltd submitted Boundary fence repairs (revision 1). Checked by Tom Beck, Foreman.'), leadLog.join('\n'));
  assert.ok(leadLog.includes('SiteLink emailed Dana Whitfield that Boundary fence repairs was submitted.'));
  const theirs = (await call('GET', `/api/from-builders/${c.subId}`, { session: c.office })).data.sent;
  assert.ok(theirs.log.some((entry) => entry.text.startsWith('Tallow Interiors Pty Ltd submitted Boundary fence repairs (revision 1)')));
  assert.equal(theirs.items[fence.requiredId].latest.revision, 1);
  assert.equal(theirs.items[fence.requiredId].latest.review, null);
  // The one screen: in, not reviewed yet.
  const row = await rowOf(c, fence.title);
  assert.equal(row.state, 'sitewrite');
  assert.equal(row.review, null);
  assert.equal((await project(c)).subcontracts[0].stage7.toReview, 1);
  // Its list of lists says how many are submitted.
  const lists = (await call('GET', '/api/from-builders', { session: c.office })).data.lists;
  assert.equal(lists[0].progress.submitted, 1);
});

test('only the submitted revision is visible to the builder: never a draft, never a later revision until it is submitted', async () => {
  const c = await claimed('vis1');
  const [fence] = c.list.items;
  const r = await submitItems(c, [one(fence)]);
  const submissionId = r.data.submitted[0].id;
  const swmsId = r.data.submitted[0].swmsId;
  // The company keeps working: a draft on the list page, and a later revision saved but not submitted.
  const draftMarker = 'Quillon-Draft-5512 crew note';
  const laterMarker = 'Quillon-Later-7781 rear lane gate';
  assert.equal((await call('PUT', `/api/from-builders/${c.subId}/progress`, { session: c.office, body: { baseVersion: 0, project: { stage: 'review', current: 0, items: c.list.items.map((item) => ({ ...item, body: { task: draftMarker } })) }, page: { state: 'qld', worksManager: draftMarker } } })).status, 200);
  const later = swmsFor(fence, { musterPoint: laterMarker });
  const zip = await call('POST', '/api/project.zip', { session: c.office, body: { swms: [{ ...later, swmsId }] } });
  assert.equal(zip.status, 200);
  assert.equal((await db.one('SELECT revision FROM swms WHERE id = $1', [swmsId])).revision, 2, 'revision 2 is saved for the company');
  const seen = [];
  for (const route of [`/api/hse/submissions/${submissionId}`, `/api/hse/subcontracts/${c.subId}`, `/api/hse/projects/${c.projectId}`, `/api/hse/orgs/${c.orgId}/projects`]) {
    const got = await call('GET', route, { reviewer: c.lead });
    assert.equal(got.status, 200, route);
    seen.push(JSON.stringify(got.data));
  }
  for (const text of seen) {
    assert.ok(!text.includes(draftMarker), 'a draft reached the builder');
    assert.ok(!text.includes(laterMarker), 'a revision not submitted reached the builder');
  }
  const page = (await call('GET', `/api/hse/submissions/${submissionId}`, { reviewer: c.lead })).data;
  assert.equal(page.submission.revision, 1);
  assert.equal(page.draft.musterPoint, DETAILS.musterPoint);
  assert.equal(page.draft.workers.length, 0, 'no worker rows');
  assert.equal(page.current, true);
  // Its Builder check is on the submitted revision, with no AI.
  const check = await call('POST', `/api/hse/submissions/${submissionId}/check`, { reviewer: c.lead });
  assert.equal(check.status, 200);
  assert.equal(check.data.source, 'saved revision');
  assert.equal(typeof check.data.score, 'number');
});

test('the submitted revision is frozen: a later check of it by the company does not change what the builder reads', async () => {
  const c = await claimed('frz1');
  const [fence] = c.list.items;
  const r = await submitItems(c, [one(fence)]);
  const { id: submissionId, swmsId } = r.data.submitted[0];
  const kept = (await db.one('SELECT input FROM swms_revisions WHERE swms_id = $1 AND revision = 1', [swmsId])).input;
  const recheck = checked({}, kept, { name: 'Someone Else', role: 'Director' });
  assert.equal((await call('POST', `/api/swms/${swmsId}/reviewed`, { session: c.office, body: recheck })).status, 200);
  const page = (await call('GET', `/api/hse/submissions/${submissionId}`, { reviewer: c.lead })).data;
  assert.deepEqual(page.checked.slice(0, 2), [['Name', 'Tom Beck'], ['Role', 'Foreman']]);
  assert.equal((await db.one('SELECT confirmation FROM swms_revisions WHERE swms_id = $1 AND revision = 1', [swmsId])).confirmation.name, 'Tom Beck', 'the kept revision is unchanged');
  assert.ok(!JSON.stringify(page.checked).includes('Someone Else'));
  assert.equal(page.submission.checkedBy.name, 'Tom Beck');
});

test('"Set by" details changed are worked out again on submission, from the SWMS itself, and shown to the builder', async () => {
  const c = await claimed('ovr1');
  const [fence, ceilings] = c.list.items;
  // Changed inside the open SWMS: only this SWMS's body says so. A version the builder replaced is said as such.
  assert.equal((await call('PUT', `/api/hse/projects/${c.projectId}/site-details`, { reviewer: c.lead, body: { baseRev: 1, details: { ...DETAILS, hospital: 'Royal Brisbane and Women\'s Hospital, Emergency Department' } } })).status, 200);
  const before = mailbox.length;
  const r = await submitItems(c, [one(fence, { musterPoint: 'Car park behind the site sheds', hospital: 'Royal Brisbane and Women\'s Hospital, Emergency Department' }), one(ceilings)]);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.deepEqual(r.data.submitted[0].overrides.map((item) => item.key), ['musterPoint']);
  assert.deepEqual(r.data.submitted[1].overrides.map((item) => [item.key, item.olderRev]), [['hospital', 1]]);
  const mail = mailbox.slice(before).find((item) => item.to === c.leadEmail);
  assert.match(mail.text, /• Boundary fence repairs, revision 1\. It changes details you set: muster point\.\n• Ceilings to level 2, revision 1\. It changes details you set: hospital or medical centre \(as in site details version 1\)\./);
  assert.match(mail.text, /has submitted 2 SWMS for Northgate Health Hub:/);
  assert.match(mail.text, /Review them in SiteLink:/);
  const row = await rowOf(c, fence.title);
  assert.deepEqual(row.overrides, [{ label: 'Muster point', set: DETAILS.musterPoint, now: 'Car park behind the site sheds', olderRev: 0 }]);
  assert.equal((await project(c)).subcontracts[0].stage7.overrides, 2);
  const log = (await call('GET', `/api/hse/subcontracts/${c.subId}`, { reviewer: c.lead })).data.sending.log.map((entry) => entry.text);
  assert.ok(log.some((text) => text.endsWith('Checked by Tom Beck, Foreman. It changes details Corbel Build Pty Ltd set: muster point.')), log.join('\n'));
  const page = (await call('GET', `/api/hse/submissions/${r.data.submitted[0].id}`, { reviewer: c.lead })).data;
  assert.equal(page.submission.overrides[0].now, 'Car park behind the site sheds');
  // The words the company was warned with are now true: the builder sees the change on submission.
  assert.match(require('../public/builder-set').changedWarning('Corbel Build Pty Ltd', 'x'), /will see this change when you submit\.$/);
});

// ---- Reviewing from the project screen ----

test('review states: Not approved needs the changes; Approved with conditions keeps each line; the business is told only that its review is back, and by whom', async () => {
  const c = await claimed('rev1');
  const [fence] = c.list.items;
  const sid = (await submitItems(c, [one(fence)])).data.submitted[0].id;
  const respond = (body, reviewer = c.lead) => call('POST', `/api/hse/submissions/${sid}/response`, { reviewer, body });
  let r = await respond({ response: 'changes', text: '' });
  assert.equal(r.status, 400);
  assert.deepEqual([r.data.message, r.data.field], ['Write the changes needed.', 'text']);
  r = await respond({ response: 'changes', text: 'none' });
  assert.equal(r.data.message, 'Write the changes needed, so the business knows what to fix.');
  r = await respond({ response: 'conditions', text: 'TBC' });
  assert.equal(r.data.message, 'Write the conditions of the approval. If there are none, choose Approved.');
  r = await respond({ response: 'conditions', text: 'Add the gate key holder.\nn/a' });
  assert.equal(r.data.message, '"n/a" is not a condition. Write each condition in full, one to a line, or take it out.');
  r = await respond({ response: 'maybe' });
  assert.equal(r.status, 400);
  assert.equal((await rowOf(c, fence.title)).review, null, 'nothing recorded');
  const before = mailbox.length;
  r = await respond({ response: 'conditions', text: '1. Add the name of the spotter for the bobcat.\n- Show the exclusion zone on the site plan.' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.review.label, 'Approved with conditions');
  assert.equal(r.data.review.company, 'Corbel Build Pty Ltd');
  assert.equal(r.data.review.name, 'Dana Whitfield');
  assert.deepEqual(r.data.review.conditions.map((item) => [item.text, item.status]), [['Add the name of the spotter for the bobcat.', 'outstanding'], ['Show the exclusion zone on the site plan.', 'outstanding']]);
  const mail = mailbox.slice(before).filter((item) => item.to === c.officeEmail);
  assert.equal(mail.length, 1);
  assert.equal(mail[0].subject, 'Your SWMS review is back');
  assert.equal(mail[0].text, 'Your SWMS review is back.\n\nFrom Dana Whitfield, Corbel Build Pty Ltd.');
  assert.equal(mail[0].from.name, 'Dana Whitfield via SiteWrite');
  assert.equal(mail[0].replyTo, c.leadEmail);
  assert.ok(await db.one("SELECT id FROM mail_messages WHERE subcontract_id = $1 AND template = 'review_back' AND template_version = 1", [c.subId]));
  // Sent again by a double press: kept once, emailed once.
  const twice = await respond({ response: 'conditions', text: '1. Add the name of the spotter for the bobcat.\n- Show the exclusion zone on the site plan.' });
  assert.equal(twice.data.repeated, true);
  assert.equal(mailbox.slice(before).filter((item) => item.to === c.officeEmail).length, 1);
  // The one screen, the company's page and My SWMS all show it; the response prints on the revision.
  const row = await rowOf(c, fence.title);
  assert.deepEqual([row.review.label, row.conditionsOpen, row.toConfirm], ['Approved with conditions', 2, 0]);
  const theirs = (await call('GET', `/api/from-builders/${c.subId}`, { session: c.office })).data.sent.items[fence.requiredId];
  assert.equal(theirs.latest.review.label, 'Approved with conditions');
  assert.equal(theirs.conditions.length, 2);
  const mine = (await call('GET', '/api/swms', { session: c.office })).data.swms[0];
  assert.equal(mine.review.label, 'Approved with conditions', 'My SWMS shows the response on its current revision');
  const log = (await call('GET', `/api/hse/subcontracts/${c.subId}`, { reviewer: c.lead })).data.sending.log.map((entry) => entry.text);
  assert.ok(log.includes('Dana Whitfield returned "Approved with conditions" on Boundary fence repairs (revision 1) for Tallow Interiors Pty Ltd, with 2 conditions. Tallow Interiors Pty Ltd was emailed that its review is back.'), log.join('\n'));
  // A business cannot review its own SWMS from SiteLink either.
  const own = await leadSignIn(c.officeEmail, 'Tom Beck');
  const ownOrg = await call('POST', '/api/hse/orgs', { reviewer: own, body: { name: 'Tallow Builds Pty Ltd', abn: nextAbn() } });
  const ownId = (await db.one('SELECT id FROM reviewers WHERE email = $1', [c.officeEmail])).id;
  await db.query('INSERT INTO org_members (id, org_id, email, reviewer_id, role, invited_by, invited_at, joined_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)',
    [`m-own-${Date.now()}`, c.orgId, c.officeEmail, ownId, 'member', 'x', new Date()]);
  assert.equal(ownOrg.status, 201);
  const refused = await call('POST', `/api/hse/submissions/${sid}/response`, { reviewer: own, body: { response: 'approved' } });
  assert.equal(refused.status, 403);
});

// Reviewers by invitation (D313) leave SiteLink as it was: a SWMS submitted on a builder's list is already bound to
// the project, so the lead opens, checks and responds to it from the project with no invitation, and no invitation
// is made for the lead, at the response or when the migrations run again. The lead's session does not open the
// SWMS by its reference, which needs an invitation from the business.
test('a submission is reviewed from the project with no invitation, and the lead is not invited by it (D313)', async () => {
  const c = await claimed('inv313');
  const [fence] = c.list.items;
  const sid = (await submitItems(c, [one(fence)])).data.submitted[0].id;
  const sub = await db.one('SELECT swms_id, ref FROM submissions WHERE id = $1', [sid]);
  assert.equal((await call('GET', `/api/hse/submissions/${sid}`, { reviewer: c.lead })).status, 200);
  assert.equal((await call('POST', `/api/hse/submissions/${sid}/check`, { reviewer: c.lead })).status, 200);
  const sent = await call('POST', `/api/hse/submissions/${sid}/response`, { reviewer: c.lead, body: { response: 'approved' } });
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  await db.inviteEarlierReviewers();
  assert.equal((await db.query('SELECT id FROM swms_review_invites WHERE swms_id = $1', [sub.swms_id])).length, 0);
  const byRef = await call('GET', `/api/review/swms/${sub.ref}`, { reviewer: c.lead });
  assert.equal(byRef.status, 403);
  assert.match(byRef.data.message, /This email has not been invited to review this SWMS\. Ask Tallow Interiors Pty Ltd to invite you from SiteWrite\./);
});

test('a later revision starts unreviewed; a response on the earlier one is refused; its open conditions still count', async () => {
  const c = await claimed('later1');
  const [fence] = c.list.items;
  const first = (await submitItems(c, [one(fence)])).data.submitted[0];
  assert.equal((await call('POST', `/api/hse/submissions/${first.id}/response`, { reviewer: c.lead, body: { response: 'conditions', text: 'Add the spotter.' } })).status, 201);
  // Edited and submitted again (a new revision of the same SWMS).
  const second = (await submitItems(c, [{ requiredId: fence.requiredId, swms: { ...swmsFor(fence, { worksManagerPhone: '0412 345 999' }), swmsId: first.swmsId } }])).data.submitted[0];
  assert.equal(second.revision, 2);
  assert.equal(second.swmsId, first.swmsId);
  const row = await rowOf(c, fence.title);
  assert.equal(row.revision, 2);
  assert.equal(row.review, null, 'the later revision starts unreviewed');
  assert.equal(row.reviewedBefore, 'Approved with conditions');
  assert.equal(row.conditionsOpen, 1, 'the earlier condition still stands');
  const old = await call('POST', `/api/hse/submissions/${first.id}/response`, { reviewer: c.lead, body: { response: 'approved' } });
  assert.equal(old.status, 409);
  assert.equal(old.data.message, 'Tallow Interiors Pty Ltd has submitted revision 2 since, so this one cannot be given a response. Open the latest from the project screen.');
  const oldPage = (await call('GET', `/api/hse/submissions/${first.id}`, { reviewer: c.lead })).data;
  assert.equal(oldPage.current, false);
  assert.equal(oldPage.later.revision, 2);
  const newPage = (await call('GET', `/api/hse/submissions/${second.id}`, { reviewer: c.lead })).data;
  assert.equal(newPage.responses.length, 0);
  assert.equal(newPage.openBefore.length, 1);
  assert.equal(newPage.earlier[0].revision, 1);
  assert.equal((await call('POST', `/api/hse/submissions/${second.id}/response`, { reviewer: c.lead, body: { response: 'approved' } })).status, 201);
  assert.equal((await rowOf(c, fence.title)).review.label, 'Approved');
});

test('conditions: the company marks each done, the lead confirms it or sends it back; the counts follow', async () => {
  const c = await claimed('cond1');
  const [fence] = c.list.items;
  const sid = (await submitItems(c, [one(fence)])).data.submitted[0].id;
  const review = (await call('POST', `/api/hse/submissions/${sid}/response`, { reviewer: c.lead, body: { response: 'conditions', text: 'Add the spotter.\nShow the exclusion zone.' } })).data.review;
  const [a, b] = review.conditions;
  // The lead cannot confirm what the company has not marked done.
  const early = await call('POST', `/api/hse/conditions/${a.id}/confirm`, { reviewer: c.lead });
  assert.equal(early.status, 409);
  assert.equal(early.data.message, 'Tallow Interiors Pty Ltd has not marked this condition done yet. Confirm it once they have.');
  const done = await call('POST', `/api/from-builders/${c.subId}/conditions/${a.id}/done`, { session: c.office, body: { note: 'Spotter is Lee Wong, added to step 2.' } });
  assert.equal(done.status, 200);
  assert.equal(done.data.message, 'Marked done. Corbel Build Pty Ltd confirms it.');
  assert.equal((await call('POST', `/api/from-builders/${c.subId}/conditions/${a.id}/done`, { session: c.office })).status, 409);
  await call('POST', `/api/from-builders/${c.subId}/conditions/${b.id}/done`, { session: c.office });
  let row = await rowOf(c, fence.title);
  assert.deepEqual([row.conditionsOpen, row.toConfirm], [0, 2]);
  // Undone before it is confirmed.
  assert.equal((await call('POST', `/api/from-builders/${c.subId}/conditions/${b.id}/undo`, { session: c.office })).status, 200);
  row = await rowOf(c, fence.title);
  assert.deepEqual([row.conditionsOpen, row.toConfirm], [1, 1]);
  await call('POST', `/api/from-builders/${c.subId}/conditions/${b.id}/done`, { session: c.office });
  // Confirmed, and sent back with what is still needed.
  assert.equal((await call('POST', `/api/hse/conditions/${a.id}/confirm`, { reviewer: c.lead })).status, 200);
  const empty = await call('POST', `/api/hse/conditions/${b.id}/back`, { reviewer: c.lead, body: { note: '' } });
  assert.equal(empty.status, 400);
  assert.equal(empty.data.message, 'Say what is still needed, so the subcontractor knows what to do.');
  assert.equal((await call('POST', `/api/hse/conditions/${b.id}/back`, { reviewer: c.lead, body: { note: 'The site plan still shows no exclusion zone.' } })).status, 200);
  row = await rowOf(c, fence.title);
  assert.deepEqual([row.conditionsOpen, row.toConfirm], [1, 0]);
  const theirs = (await call('GET', `/api/from-builders/${c.subId}`, { session: c.office })).data.sent;
  const states = theirs.items[fence.requiredId].conditions.map((item) => [item.status, item.backNote, item.doneNote]);
  assert.deepEqual(states, [['closed', '', 'Spotter is Lee Wong, added to step 2.'], ['outstanding', 'The site plan still shows no exclusion zone.', '']]);
  // A confirmed condition cannot be undone by the company.
  assert.equal((await call('POST', `/api/from-builders/${c.subId}/conditions/${a.id}/undo`, { session: c.office })).status, 409);
  assert.ok(theirs.log.some((entry) => entry.text === 'Dana Whitfield said a condition on Boundary fence repairs for Tallow Interiors Pty Ltd is not done yet: "Show the exclusion zone". Still needed: "The site plan still shows no exclusion zone".'));
  const summary = (await project(c)).subcontracts[0].stage7;
  assert.deepEqual([summary.conditionsOpen, summary.toConfirm], [1, 0]);
  // The list of lists says how many conditions the company has to do.
  assert.equal((await call('GET', '/api/from-builders', { session: c.office })).data.lists[0].progress.conditionsToDo, 1);
  assert.equal(row.conditionsMet, false);
  await call('POST', `/api/from-builders/${c.subId}/conditions/${b.id}/done`, { session: c.office });
  await call('POST', `/api/hse/conditions/${b.id}/confirm`, { reviewer: c.lead });
  assert.equal((await rowOf(c, fence.title)).conditionsMet, true, 'every condition confirmed');
});

test('the one screen: in or not, taken off the company\'s list, the sign-ons on the submitted revision, last contact', async () => {
  const c = await claimed('scr1');
  const [fence, ceilings] = c.list.items;
  // The company takes the ceilings off its list; only that it did is read.
  const work = { project: { stage: 'questions', current: 0, items: [{ ...fence, body: null, status: 'todo' }], offList: [{ ...ceilings, body: { task: 'Secret-Off-9931' } }] }, page: { state: 'qld' } };
  assert.equal((await call('PUT', `/api/from-builders/${c.subId}/progress`, { session: c.office, body: { baseVersion: 0, ...work } })).status, 200);
  const r = await submitItems(c, [one(fence)]);
  const { swmsId } = r.data.submitted[0];
  await db.query('INSERT INTO signons (id, swms_id, worker_name, worker_company, signature, signed_at, revision) VALUES ($1, $2, $3, $4, $5, $6, 1)', ['so-scr1-a', swmsId, 'Worker One', 'Tallow', 'sig', new Date()]);
  await db.query('INSERT INTO signons (id, swms_id, worker_name, worker_company, signature, signed_at, revision) VALUES ($1, $2, $3, $4, $5, $6, 1)', ['so-scr1-b', swmsId, 'Worker Two', 'Tallow', 'sig', new Date()]);
  const data = await project(c);
  const text = JSON.stringify(data);
  assert.ok(!text.includes('Secret-Off-9931'));
  assert.ok(!text.includes('Worker One'), 'only the count of sign-ons, never names (K9 B)');
  const sub = data.subcontracts[0];
  assert.deepEqual(sub.stage7.items.map((item) => [item.title, item.state]), [['Boundary fence repairs', 'sitewrite'], ['Ceilings to level 2', 'off']]);
  assert.equal(sub.stage7.items[0].signOns, 2);
  assert.equal(sub.stage7.off, 1);
  assert.equal(sub.stage7.in, 1);
  assert.equal(sub.lastContact.text, 'SWMS submitted');
});

// ---- SWMS received outside SiteWrite ----

async function wordFile(task) {
  const draft = prepareDraft(draftBody(ready({ ...ANSWERED, state: 'qld', task, fallRisk: 'no', residential: 'no' })));
  return Buffer.from(await draftToDocx(draft, {}));
}
// A stand-in model for the Builder check's reading; nothing is billed.
const READ = {
  state: 'qld', task: 'Install ceiling grid.', fallRisk: 'no', siteAddress: '', siteConditions: [], highRisk: [],
  steps: [{ step: 'Install grid', hazards: ['Falling objects.'], controls: ['Exclusion zone below.'], responsible: '', riskBefore: '', riskAfter: '', riskResponse: '' }],
  ppe: [], responsiblePerson: '', consultation: '', signatures: [], revision: '', date: '', reviewDate: '', principalContractor: '',
  licences: [], plant: [], emergency: [], review: '', legislation: [], riskMatrix: false,
};
function standIn() {
  let calls = 0;
  aiScope.useClient({ beta: { messages: { stream: () => { calls += 1; return { finalMessage: async () => ({ stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: JSON.stringify(READ) }] }) }; } } } });
  return () => calls;
}
async function settled(c, id) {
  for (let i = 0; i < 200; i += 1) {
    const page = (await call('GET', `/api/hse/submissions/${id}`, { reviewer: c.lead })).data;
    if (page.submission.checkStatus !== 'reading') return page;
    await new Promise((resolve) => { setTimeout(resolve, 25); });
  }
  throw new Error('the check never finished');
}

test('a SWMS received outside SiteWrite is recorded against the list item; its Builder check is optional and counts toward the free readings', async () => {
  const c = await claimed('out1');
  const [, ceilings] = c.list.items;
  const file = await wordFile(ceilings.task);
  const rec = (data, name, reviewer = c.lead, item = ceilings.requiredId) => call('POST', `/api/hse/subcontracts/${c.subId}/items/${item}/outside`, { reviewer, raw: data, headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(name), 'X-Note': encodeURIComponent('Emailed by Tom on Monday') } });
  assert.equal((await rec(Buffer.from('not a swms'), 'notes.txt')).status, 415);
  const r = await rec(file, 'Ceilings SWMS.docx');
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.message, 'Ceilings SWMS.docx is recorded as received for Ceilings to level 2. Review it from the project screen or below.');
  const row = await rowOf(c, ceilings.title);
  assert.equal(row.state, 'outside');
  let page = (await call('GET', `/api/hse/submissions/${r.data.id}`, { reviewer: c.lead })).data;
  assert.equal(page.submission.channel, 'outside');
  assert.equal(page.submission.file.name, 'Ceilings SWMS.docx');
  assert.equal(page.submission.note, 'Emailed by Tom on Monday');
  assert.equal(page.draft, undefined, 'no SiteWrite draft for a file');
  const got = await call('GET', `/api/hse/submissions/${r.data.id}/file`, { reviewer: c.lead });
  assert.equal(got.status, 200);
  assert.equal(Buffer.compare(got.data, file), 0);
  // The check: off when the AI is off; with the stand-in, one reading, counted for the project.
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal((await call('POST', `/api/hse/submissions/${r.data.id}/check`, { reviewer: c.lead })).status, 503);
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
  const calls = standIn();
  const used = await aiScope.projectReadingsUsed(c.projectId);
  const started = await call('POST', `/api/hse/submissions/${r.data.id}/check`, { reviewer: c.lead });
  assert.equal(started.status, 202);
  page = await settled(c, r.data.id);
  assert.equal(page.submission.checkStatus, 'done');
  assert.equal(typeof page.submission.builderCheck.score, 'number');
  assert.equal(calls(), 1);
  assert.equal(await aiScope.projectReadingsUsed(c.projectId), used + 1, 'the reading counts toward the project\'s free readings (D302)');
  // At the limit, no reading runs.
  const was = process.env.PROJECT_FREE_READINGS;
  process.env.PROJECT_FREE_READINGS = String(used + 1);
  try {
    const second = await rec(file, 'Ceilings SWMS again.docx');
    const limited = await call('POST', `/api/hse/submissions/${second.data.id}/check`, { reviewer: c.lead });
    assert.equal(limited.status, 402);
    assert.equal(calls(), 1);
  } finally {
    if (was === undefined) delete process.env.PROJECT_FREE_READINGS; else process.env.PROJECT_FREE_READINGS = was;
  }
  // A response on the latest file; the company, which is on SiteWrite, is told.
  const latest = (await rowOf(c, ceilings.title)).submissionId;
  const back = await call('POST', `/api/hse/submissions/${latest}/response`, { reviewer: c.lead, body: { response: 'changes', text: 'Add the exclusion zone below the ceiling work.' } });
  assert.equal(back.status, 201);
  assert.equal((await rowOf(c, ceilings.title)).review.label, 'Not approved');
  const log = (await call('GET', `/api/hse/subcontracts/${c.subId}`, { reviewer: c.lead })).data.sending.log.map((entry) => entry.text);
  assert.ok(log.includes('Dana Whitfield recorded a SWMS received outside SiteWrite for Ceilings to level 2 from Tallow Interiors Pty Ltd: Ceilings SWMS.docx. Note: "Emailed by Tom on Monday".'), log.join('\n'));
  assert.ok(log.some((text) => /^Builder check on Ceilings SWMS\.docx for Ceilings to level 2: \d+ out of 100, /.test(text)));
});

test('a file uploaded on the list page can be recorded as received, once', async () => {
  const c = await builder('upl1');
  const items = (await call('GET', `/api/hse/subcontracts/${c.subId}`, { reviewer: c.lead })).data.items;
  const file = await wordFile(ITEMS[0][1]);
  const up = await call('POST', `/api/list/${c.token}/items/${items[0].id}/upload`, { raw: file, headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent('Fence SWMS.docx') } });
  assert.equal(up.status, 201);
  const page = (await call('GET', `/api/hse/subcontracts/${c.subId}`, { reviewer: c.lead })).data;
  assert.equal((await rowOf(c, ITEMS[0][0])).state, 'uploaded');
  const uploadId = page.sending.uploads[0].id;
  const r = await call('POST', `/api/hse/subcontracts/${c.subId}/uploads/${uploadId}/record`, { reviewer: c.lead });
  assert.equal(r.status, 201);
  assert.equal((await rowOf(c, ITEMS[0][0])).state, 'outside');
  assert.equal((await call('POST', `/api/hse/subcontracts/${c.subId}/uploads/${uploadId}/record`, { reviewer: c.lead })).status, 409);
  // No company on SiteWrite: no email, and the lead closes a condition directly.
  const sid = (await rowOf(c, ITEMS[0][0])).submissionId;
  const before = mailbox.length;
  const review = await call('POST', `/api/hse/submissions/${sid}/response`, { reviewer: c.lead, body: { response: 'conditions', text: 'Sign the SWMS before starting.' } });
  assert.equal(review.data.emailed, false);
  assert.equal(mailbox.length, before);
  assert.equal((await call('POST', `/api/hse/conditions/${review.data.review.conditions[0].id}/confirm`, { reviewer: c.lead })).status, 200);
});

// ---- Isolation on every new route ----

test('isolation: another builder, a company and someone signed out reach none of the new routes; one company never reaches another\'s', async () => {
  const c = await claimed('iso7');
  const [fence, ceilings] = c.list.items;
  const sid = (await submitItems(c, [one(fence)])).data.submitted[0].id;
  const review = (await call('POST', `/api/hse/submissions/${sid}/response`, { reviewer: c.lead, body: { response: 'conditions', text: 'Add the spotter.' } })).data.review;
  const cid = review.conditions[0].id;
  const file = await wordFile(ceilings.task);
  const out = await call('POST', `/api/hse/subcontracts/${c.subId}/items/${ceilings.requiredId}/outside`, { reviewer: c.lead, raw: file, headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': 'x.docx' } });
  assert.equal(out.status, 201);
  const otherLead = await leadSignIn('dana@iso7-other.example', 'Sam Other');
  await call('POST', '/api/hse/orgs', { reviewer: otherLead, body: { name: 'Elsewhere Build Pty Ltd', abn: nextAbn() } });
  const lead = [
    ['GET', `/api/hse/submissions/${sid}`], ['POST', `/api/hse/submissions/${sid}/check`], ['POST', `/api/hse/submissions/${sid}/response`, { response: 'approved' }],
    ['GET', `/api/hse/submissions/${out.data.id}/file`], ['GET', `/api/hse/submissions/${sid}/files/none`],
    ['POST', `/api/hse/conditions/${cid}/confirm`], ['POST', `/api/hse/conditions/${cid}/back`, { note: 'Not done.' }],
    ['POST', `/api/hse/subcontracts/${c.subId}/items/${ceilings.requiredId}/outside`], ['POST', `/api/hse/subcontracts/${c.subId}/uploads/none/record`],
  ];
  for (const [method, route, body] of lead) {
    const raw = route.endsWith('/outside') ? file : undefined;
    const asOther = await call(method, route, { reviewer: otherLead, body: raw ? undefined : body, raw, headers: raw ? { 'Content-Type': 'application/octet-stream' } : {} });
    assert.equal(asOther.status, 404, `${route} for another builder`);
    assert.ok(!JSON.stringify(asOther.data).includes('Northgate'));
    assert.equal((await call(method, route, { session: c.office, body: raw ? undefined : body, raw, headers: raw ? { 'Content-Type': 'application/octet-stream' } : {} })).status, 401, `${route} for a company`);
    assert.equal((await call(method, route, { body: raw ? undefined : body, raw, headers: raw ? { 'Content-Type': 'application/octet-stream' } : {} })).status, 401, `${route} signed out`);
  }
  const otherCompany = await subbie('admin@iso7-co.example', 'Other Interiors Pty Ltd', nextAbn());
  const company = [
    ['POST', `/api/from-builders/${c.subId}/submit`, { items: [one(fence)] }],
    ['POST', `/api/from-builders/${c.subId}/conditions/${cid}/done`, {}], ['POST', `/api/from-builders/${c.subId}/conditions/${cid}/undo`, {}],
  ];
  for (const [method, route, body] of company) {
    assert.equal((await call(method, route, { session: otherCompany, body })).status, 404, `${route} for another company`);
    assert.equal((await call(method, route, { reviewer: c.lead, body })).status, 401, `${route} for the lead`);
    assert.equal((await call(method, route, { body })).status, 401, `${route} signed out`);
  }
  // A condition of another list cannot be reached through this company's own list.
  const d = await claimed('iso7b');
  assert.equal((await call('POST', `/api/from-builders/${d.subId}/conditions/${cid}/done`, { session: d.office })).status, 404);
  assert.equal((await db.one('SELECT status FROM review_conditions WHERE id = $1', [cid])).status, 'outstanding');
});

test('submitting needs a trial or subscription (D286), and the company name and ABN', async () => {
  const c = await claimed('trial7');
  const companyId = (await db.one('SELECT company_id FROM users WHERE email = $1', [c.officeEmail])).company_id;
  await db.query("UPDATE companies SET plan_status = 'trial', trial_ends_at = $1 WHERE id = $2", [new Date(Date.now() - 1000), companyId]);
  const r = await submitItems(c, [one(c.list.items[0])]);
  assert.equal(r.status, 402);
  assert.equal(r.data.message, 'Your free trial has ended. Subscribe to submit these SWMS in SiteWrite.');
  await db.query("UPDATE companies SET plan_status = 'active' WHERE id = $1", [companyId]);
  await db.query("UPDATE companies SET abn = '' WHERE id = $1", [companyId]);
  const noAbn = await submitItems(c, [one(c.list.items[0])]);
  assert.equal(noAbn.status, 400);
  assert.equal(noAbn.data.message, 'Add your company name and ABN under Company profile before submitting. They are printed on every SWMS.');
  assert.equal((await db.query('SELECT * FROM submissions WHERE subcontract_id = $1', [c.subId])).length, 0);
});

test('a deleted business leaves the builder its record of what was submitted, with no SWMS behind it', async () => {
  const c = await claimed('del7');
  const [fence] = c.list.items;
  const sid = (await submitItems(c, [one(fence)])).data.submitted[0].id;
  await call('POST', `/api/hse/submissions/${sid}/response`, { reviewer: c.lead, body: { response: 'approved' } });
  const companyId = (await db.one('SELECT company_id FROM users WHERE email = $1', [c.officeEmail])).company_id;
  await require('../business-removal').deleteBusiness(companyId, { confirm: 'Tallow Interiors Pty Ltd', adminEmail: 'owner@sitewrite.example' });
  const kept = await db.one('SELECT * FROM submissions WHERE id = $1', [sid]);
  assert.deepEqual([kept.company_id, kept.swms_id, kept.company_name], ['', '', 'Tallow Interiors Pty Ltd']);
  const page = (await call('GET', `/api/hse/submissions/${sid}`, { reviewer: c.lead })).data;
  assert.equal(page.gone, true);
  assert.equal(page.responses[0].label, 'Approved', 'the builder\'s own response stays in its record');
});

test('the submission email and condition lines read as written', () => {
  assert.deepEqual(submit.conditionLines(' 1. One\n\n• Two \n- Three'), ['One', 'Two', 'Three']);
  const mail = submit.submittedMail({ person: 'Tom Beck', company: 'Tallow', project: 'Hub', link: 'L', items: [{ title: 'A', revision: 2, overrides: [] }] });
  assert.deepEqual(mail, { subject: 'SWMS submitted for Hub', text: 'Tom Beck from Tallow has submitted a SWMS for Hub:\n\n• A, revision 2.\n\nReview it in SiteLink:\nL' });
});
