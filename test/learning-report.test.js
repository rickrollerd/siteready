// Goal 11: the monthly learning report, from seeded rows. Rates by month in Queensland time,
// candidates counted by different saved SWMS (not rows), changes undone, empty months, learning
// off, what is shown of steps and lines, and the owner-only routes.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.ADMIN_EMAILS = 'owner@report.example';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { app } = require('../server');
const db = require('../db');
const { monthlyReport, reportMarkdown, CANDIDATE_THRESHOLD } = require('../control-learning');
const { setupAccounts, lastLinkToken } = require('./helpers');

const NOW = new Date('2026-10-05T00:00:00Z');
const id = () => crypto.randomUUID();
let server;
let base;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
  delete process.env.CONTROL_LEARNING;
});

// Each test starts from an empty database, with learning on unless it says otherwise.
test.beforeEach(async () => {
  process.env.CONTROL_LEARNING = 'on';
  await setupAccounts();
});

async function company(optOut = false) {
  const companyId = id();
  await db.query('INSERT INTO companies (id, name, trial_ends_at, created_at) VALUES ($1, $2, $3, $3)', [companyId, 'Seeded Pty Ltd', NOW]);
  if (optOut) await db.query('UPDATE companies SET industry_opt_out = TRUE WHERE id = $1', [companyId]);
  return companyId;
}
const event = (companyId, type, at, count = 1) => Promise.all(Array.from({ length: count }, () => db.query('INSERT INTO events (id, company_id, type, created_at) VALUES ($1, $2, $3, $4)', [id(), companyId, type, new Date(at)])));
async function revisions(companyId, at, count) {
  for (let n = 0; n < count; n += 1) {
    const swmsId = id();
    await db.query(`INSERT INTO swms (id, company_id, title, input, reviewed_by, created_by, signon_token, created_at, updated_at, last_reviewed_at, review_due_at)
      VALUES ($1, $2, 'Seeded', '{}', 'x', 'x', $3, $4, $4, $4, $4)`, [swmsId, companyId, id(), new Date(at)]);
    await db.query("INSERT INTO swms_revisions (id, swms_id, revision, input, draft, content_hash, created_at) VALUES ($1, $2, 1, '{}', '{}', 'h', $3)", [id(), swmsId, new Date(at)]);
  }
}
async function edit(row) {
  const full = { revision: 1, step: 'Excavate', kind: 'removed', outcome: 'applied', original: '', new_line: '', legal: '', kept: null, ...row };
  full.edit_key = full.edit_key || crypto.createHash('sha256').update(JSON.stringify([full.step, full.kind, full.original, full.new_line])).digest('hex');
  await db.query(`INSERT INTO control_edit_events (id, swms_key, revision, month, step, kind, outcome, original, new_line, legal, edit_key, kept, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
  [id(), full.swms, full.revision, full.month, full.step, full.kind, full.outcome, full.original, full.new_line, full.legal, full.edit_key, full.kept, NOW]);
}
const miss = (month, kind, item, step = 'Excavate', count = 1) => Promise.all(Array.from({ length: count }, () => db.query('INSERT INTO check_question_misses (id, month, kind, step, item, chosen) VALUES ($1, $2, $3, $4, $5, $6)', [id(), month, kind, step, item, 'a wrong option'])));
const byMonth = (report, month) => report.months.find((item) => item.month === month);

test('rates by month: changes on new SWMS against SWMS saved, in Queensland months, leaving out opted-out businesses', async () => {
  const firm = await company();
  const optedOut = await company(true);
  // July: 4 new SWMS, 2 of them changed (3 changes); 4 sign-ons, 4 wrong answers.
  await event(firm, 'swms_saved', '2026-07-10T00:00:00Z', 4);
  await event(firm, 'worker_signon', '2026-07-12T00:00:00Z', 4);
  await revisions(firm, '2026-07-10T00:00:00Z', 4);
  await edit({ swms: 'a1', month: '2026-07', original: 'Line one.' });
  await edit({ swms: 'a1', month: '2026-07', kind: 'added', new_line: 'Own line.' });
  await edit({ swms: 'a2', month: '2026-07', original: 'Line two.' });
  await miss('2026-07', 'ppe', 'Hard hat', '', 4);
  // August: 4 new SWMS, one saved at 1 am on 1 August in Queensland (still July in UTC); 1 changed
  // (2 changes). A second revision of a1 carries one change and makes one new one.
  await event(firm, 'swms_saved', '2026-07-31T15:00:00Z');
  await event(firm, 'swms_saved', '2026-08-10T00:00:00Z', 3);
  await event(firm, 'worker_signon', '2026-08-12T00:00:00Z', 4);
  await revisions(firm, '2026-08-10T00:00:00Z', 5);
  await edit({ swms: 'b1', month: '2026-08', original: 'Line one.' });
  await edit({ swms: 'b1', month: '2026-08', original: 'Line three.' });
  await edit({ swms: 'a1', revision: 2, month: '2026-08', original: 'Line one.' });
  await edit({ swms: 'a1', revision: 2, month: '2026-08', kind: 'changed', original: 'Line four.', new_line: 'Line four, reworded.' });
  await miss('2026-08', 'step', 'Excavate', '', 1);
  await miss('2026-08', 'control', 'Spoil is kept back from the edge.', 'Excavate', 1);
  // September: 5 new SWMS (and 3 from a business that opted out), 1 change; 4 sign-ons, 1 wrong.
  await event(firm, 'swms_saved', '2026-09-10T00:00:00Z', 5);
  await event(optedOut, 'swms_saved', '2026-09-10T00:00:00Z', 3);
  await event(optedOut, 'worker_signon', '2026-09-10T00:00:00Z', 3);
  await event(firm, 'worker_signon', '2026-09-12T00:00:00Z', 4);
  await revisions(optedOut, '2026-09-10T00:00:00Z', 3);
  await edit({ swms: 'c1', month: '2026-09', original: 'Line two.' });
  await miss('2026-09', 'ppe', 'Hard hat', '', 1);

  const report = await monthlyReport({ month: '2026-09', now: NOW });
  assert.equal(report.month, '2026-09');
  assert.equal(report.whole, true);
  assert.equal(report.recording, true);
  assert.deepEqual(report.months.map((item) => item.month), ['2026-07', '2026-08', '2026-09']);
  const [july, august, september] = report.months;
  assert.deepEqual([july.swmsSaved, july.newSwmsChanged, july.newSwmsChanges, july.editRate, july.shareChanged], [4, 2, 3, 0.75, 0.5]);
  assert.deepEqual([august.swmsSaved, august.newSwmsChanged, august.newSwmsChanges, august.editRate], [4, 1, 2, 0.5], 'the 1 am save on 1 August counts in August');
  assert.deepEqual([august.revisionsSaved, august.revisionsChanged, august.changes, august.newChanges, august.revisionRate], [5, 2, 4, 3, 0.6], 'the carried change is not new in revision 2');
  assert.deepEqual([september.swmsSaved, september.signons, september.editRate, september.revisionsSaved], [5, 4, 0.2, 0], 'the opted-out business is left out');
  assert.equal(september.revisionRate, null);
  assert.deepEqual([july.wrongAnswers, july.wrongRate, august.wrongRate, september.wrongRate], [4, 1, 0.5, 0.25]);
  assert.deepEqual(august.wrongByKind, { ppe: 0, step: 1, control: 1 });
  assert.deepEqual(report.failedQuestions, { total: 1, byKind: { ppe: 1, step: 0, control: 0 }, items: [{ kind: 'ppe', step: '', item: 'Hard hat', wrong: 1 }] });
  assert.equal(report.trend.editRate.fell, true);
  assert.deepEqual(report.trend.editRate.values.map((item) => item.value), [0.75, 0.5, 0.2]);
  assert.equal(report.trend.wrongRate.fell, true);
  assert.equal(report.trend.acceptance.captured, false);
  assert.match(report.trend.acceptance.says, /not captured yet/);
  assert.ok(report.method.some((line) => /SWMS saved is counted once when a new SWMS is saved/.test(line)), 'the method is stated');

  // August's report: the items most often wrong that month, and a trend that cannot be read yet.
  const earlier = await monthlyReport({ month: '2026-08', now: NOW });
  assert.deepEqual(earlier.months.map((item) => item.month), ['2026-06', '2026-07', '2026-08']);
  assert.equal(earlier.months[0].editRate, null);
  assert.equal(earlier.months[0].editRateWhy, 'nothing recorded yet');
  assert.equal(earlier.trend.editRate.fell, null);
  assert.match(earlier.trend.editRate.says, /^Cannot say: 2026-06 has no figure \(nothing recorded yet\)/);
  assert.deepEqual(earlier.failedQuestions.items.map((item) => [item.kind, item.item]), [['control', 'Spoil is kept back from the edge.'], ['step', 'Excavate']]);
});

test('candidates are counted by different saved SWMS, not rows, and only from the threshold up', async () => {
  assert.equal(CANDIDATE_THRESHOLD, 5);
  // A line removed in 5 different SWMS: shown.
  for (const swms of ['s1', 's2', 's3', 's4', 's5']) await edit({ swms, month: '2026-09', original: 'Spoil is heaped at least 1 m back.' });
  // A line removed in 1 SWMS on 8 revisions: 8 rows, 1 SWMS, below the threshold.
  for (let revision = 1; revision <= 8; revision += 1) await edit({ swms: 'one', revision, month: '2026-09', original: 'Trench is barricaded.' });
  // The same added line, worded three ways, in 5 SWMS: one pattern.
  const wordings = ['A toolbox talk is held each morning.', 'a toolbox talk is held each morning', 'A toolbox  talk, is held each morning!', 'A toolbox talk is held each morning.', 'A toolbox talk is held each morning.'];
  for (const [n, wording] of wordings.entries()) await edit({ swms: `t${n}`, month: n < 3 ? '2026-08' : '2026-09', kind: 'added', new_line: wording });
  // The same added line in another step is another pattern.
  await edit({ swms: 'x1', month: '2026-09', step: 'Backfill the trench', kind: 'added', new_line: 'A toolbox talk is held each morning.' });
  // A hazard marked "does not apply" in 4 SWMS: below the threshold of 5.
  for (const swms of ['h1', 'h2', 'h3', 'h4']) await edit({ swms, month: '2026-09', kind: 'hazardNotApplicable', original: 'Trench collapse.' });
  // A legal line removed with a warning in 5 SWMS: shown, with the law. Refused removals in 6: not a candidate.
  for (const swms of ['l1', 'l2', 'l3', 'l4', 'l5']) await edit({ swms, month: '2026-09', outcome: 'warned', original: 'Workers hold a white card.', legal: 'Work Health and Safety Regulation 2011 (Qld) s 317' });
  for (const swms of ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']) await edit({ swms, month: '2026-09', outcome: 'refused', original: 'Refused line.' });
  // A change in October is after the month and not counted.
  await edit({ swms: 's6', month: '2026-10', original: 'Spoil is heaped at least 1 m back.' });

  const report = await monthlyReport({ month: '2026-09', now: NOW });
  const { removed, added, notApplicable } = report.candidates;
  assert.equal(report.candidates.threshold, 5);
  assert.equal(report.candidates.thresholdDecided, false);
  assert.match(report.candidates.thresholdNote, /awaits the owner's decision/);
  assert.deepEqual(removed.shown.map((item) => [item.line, item.swms, item.rows, item.legalRequirement]), [
    ['Spoil is heaped at least 1 m back.', 5, 5, ''],
    ['Workers hold a white card.', 5, 5, 'Work Health and Safety Regulation 2011 (Qld) s 317'],
  ]);
  assert.equal(removed.below, 1, 'the line removed on 8 revisions of one SWMS');
  assert.deepEqual(added.shown.map((item) => [item.step, item.newLine, item.swms, item.swmsThisMonth]), [['Excavate', 'A toolbox talk is held each morning.', 5, 2]]);
  assert.equal(added.below, 1, 'the same line in another step');
  assert.deepEqual([notApplicable.shown.length, notApplicable.below], [0, 1]);
  for (const item of [...removed.shown, ...added.shown]) assert.equal(item.goal5CheckNeeded, true);
  assert.match(report.candidates.rule, /source we hold \(D181\).*goal 5 evidence test.*sign-off.*never changes the library/);

  // A lower threshold, once the owner chooses one, shows the hazard.
  const lower = await monthlyReport({ month: '2026-09', threshold: 4, now: NOW });
  assert.deepEqual(lower.candidates.notApplicable.shown.map((item) => [item.line, item.swms]), [['Trench collapse.', 4]]);
});

test('changes undone in the next revision are listed by different SWMS', async () => {
  for (const swms of ['u1', 'u2', 'u3', 'u4', 'u5']) {
    await edit({ swms, month: '2026-09', kind: 'changed', original: 'Spoil is heaped at least 1 m back.', new_line: 'Spoil kept back.', kept: false });
    await edit({ swms, month: '2026-09', kind: 'added', new_line: 'A spotter is used.', kept: true });
  }
  for (const swms of ['v1', 'v2']) await edit({ swms, month: '2026-09', kind: 'removed', original: 'Trench is barricaded.', kept: false });
  const report = await monthlyReport({ month: '2026-09', now: NOW });
  assert.deepEqual(report.candidates.reverted.shown.map((item) => [item.kind, item.line, item.newLine, item.swms]), [['changed', 'Spoil is heaped at least 1 m back.', 'Spoil kept back.', 5]]);
  assert.equal(report.candidates.reverted.below, 1);
  const text = reportMarkdown(report);
  assert.match(text, /### Changes undone in the next revision\n\n\| Step \| Change \| SiteReady line \| User line \| SWMS \| This month \| Goal 5 check needed \|/);
  assert.match(text, /\| Excavate \| changed \| Spoil is heaped at least 1 m back\. \| Spoil kept back\. \| 5 \| 5 \| Yes \|/);
});

test('empty months: no rows give no rates, and a month with saves but no changes reads as 0 once learning has started', async () => {
  const empty = await monthlyReport({ month: '2026-09', now: NOW });
  assert.deepEqual(empty.months.map((item) => [item.month, item.recorded, item.editRate, item.wrongRate]), [['2026-07', false, null, null], ['2026-08', false, null, null], ['2026-09', false, null, null]]);
  assert.equal(empty.firstRecorded, null);
  assert.equal(empty.trend.editRate.fell, null);
  assert.deepEqual(empty.failedQuestions, { total: 0, byKind: { ppe: 0, step: 0, control: 0 }, items: [] });
  for (const group of ['removed', 'added', 'notApplicable', 'reverted']) assert.deepEqual(empty.candidates[group], { shown: [], below: 0 });
  const text = reportMarkdown(empty);
  assert.match(text, /No wrong answers recorded this month\./);
  assert.match(text, /\| 2026-09 \| 0 \| 0 \| 0 \| none \(nothing recorded yet\) \|/);

  // Learning started in June; July had saves and no changes, August had no saves at all.
  const firm = await company();
  await edit({ swms: 'j1', month: '2026-06', original: 'Line one.' });
  await event(firm, 'swms_saved', '2026-06-10T00:00:00Z', 2);
  await event(firm, 'swms_saved', '2026-07-10T00:00:00Z', 3);
  await event(firm, 'swms_saved', '2026-09-10T00:00:00Z', 1);
  const report = await monthlyReport({ month: '2026-09', now: NOW });
  assert.deepEqual(report.months.map((item) => [item.month, item.editRate, item.editRateWhy]), [
    ['2026-06', 0.5, ''], ['2026-07', 0, ''], ['2026-08', null, 'no SWMS saved'], ['2026-09', 0, ''],
  ]);
  assert.match(report.trend.editRate.says, /^Cannot say: 2026-08 has no figure \(no SWMS saved\)/);
  // The current month is not over.
  assert.equal((await monthlyReport({ month: '2026-10', now: NOW })).whole, false);
  // Without a month, the last whole month.
  assert.equal((await monthlyReport({ now: NOW })).month, '2026-09');
});

test('learning off: the report says nothing is being recorded', async () => {
  delete process.env.CONTROL_LEARNING;
  const report = await monthlyReport({ month: '2026-09', now: NOW });
  assert.equal(report.recording, false);
  assert.match(report.recordingNote, /^Control learning is off: nothing is being recorded\./);
  assert.match(reportMarkdown(report), /\*\*Control learning is off: nothing is being recorded\./);
  assert.ok(report.months.every((item) => item.editRate === null && item.wrongRate === null));
});

test('steps made from the task are not shown by name, and lines are scrubbed again before they are shown', async () => {
  for (const swms of ['p1', 'p2', 'p3', 'p4', 'p5']) {
    await edit({ swms, month: '2026-09', step: 'Paint the kestrel point lobby walls', original: 'Brush the walls.' });
    await edit({ swms, month: '2026-09', original: 'Tell Dave Smith on 0412 345 678 before starting.' });
  }
  await miss('2026-09', 'control', 'Ferndale Hospital security first.', 'Paint the kestrel point lobby walls');
  const report = await monthlyReport({ month: '2026-09', now: NOW });
  assert.deepEqual(report.candidates.removed.shown.map((item) => [item.step, item.line]).sort(), [
    ['(a step made from the task)', 'Brush the walls.'],
    ['Excavate', 'Tell [name] on [phone] before starting.'],
  ]);
  assert.deepEqual(report.failedQuestions.items.map((item) => [item.step, item.item]), [['(a step made from the task)', '[site] security first.']]);
  const text = JSON.stringify(report) + reportMarkdown(report);
  assert.doesNotMatch(text, /kestrel|Dave|Smith|0412|Ferndale/i);
});

// ---- The owner's routes ----

function call(route, token) {
  return fetch(`${base}${route}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}
async function signIn(email) {
  await fetch(`${base}/api/auth/email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
  const response = await fetch(`${base}/api/auth/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: lastLinkToken(email) }) });
  return (await response.json()).token;
}

test('the report and its text are for the owner only', async () => {
  for (const swms of ['o1', 'o2', 'o3', 'o4', 'o5']) await edit({ swms, month: '2026-09', original: 'Spoil is heaped at least 1 m back.' });
  const owner = await signIn('owner@report.example');
  const someone = await signIn('someone@report.example');
  for (const route of ['/api/admin/control-learning/report', '/api/admin/control-learning/report.md']) {
    assert.equal((await call(route)).status, 401, route);
    assert.equal((await call(route, someone)).status, 403, route);
  }
  const bad = await call('/api/admin/control-learning/report?month=2026-13', owner);
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).message, 'Give the month as YYYY-MM.');
  const json = await (await call('/api/admin/control-learning/report?month=2026-09', owner)).json();
  assert.equal(json.month, '2026-09');
  assert.equal(json.candidates.removed.shown[0].swms, 5);
  const text = await call('/api/admin/control-learning/report.md?month=2026-09', owner);
  assert.equal(text.status, 200);
  assert.match(text.headers.get('content-type'), /^text\/markdown/);
  assert.equal(text.headers.get('content-disposition'), 'attachment; filename="siteready-learning-2026-09.md"');
  const body = await text.text();
  assert.match(body, /^# SiteReady learning report: 2026-09\n/);
  assert.match(body, /\| Excavate \| Spoil is heaped at least 1 m back\. \| 5 \| 5 \| No \| Yes \|/);
  assert.match(body, /\n- First-time acceptance \(goal 3\) is not captured yet/);
});
