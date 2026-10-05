// The contractor's own changes to the controls (task #102): lines removed, reworded and added,
// legal lines kept, and the de-identified learning store that is off unless CONTROL_LEARNING=on.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.ADMIN_EMAILS = 'owner@edits.example';
const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { app } = require('../server');
const db = require('../db');
const { prepareDraft, legalSource, OWN_MARK } = require('../draft');
const { draftBody } = require('../input');
const { draftToDocx } = require('../docx-draft');
const { recordControlEdits } = require('../control-learning');
const { setupAccounts, lastLinkToken } = require('./helpers');

let server;
let base;

test.before(async () => {
  delete process.env.CONTROL_LEARNING;
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
  delete process.env.CONTROL_LEARNING;
});

function call(method, route, { body, token } = {}) {
  return fetch(`${base}${route}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// A valid ABN made from the email, as in the accounts tests.
function abnFor(seed) {
  let n = 0;
  for (const ch of seed) n = (n * 31 + ch.charCodeAt(0)) % 1000000000;
  const tail = String(n).padStart(9, '0');
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  for (let head = 10; head <= 99; head += 1) {
    const digits = `${head}${tail}`;
    const total = [...digits].reduce((sum, d, i) => sum + (Number(d) - (i === 0 ? 1 : 0)) * weights[i], 0);
    if (total % 89 === 0) return digits;
  }
  return abnFor(`${seed}x`);
}

async function signIn(email, company) {
  await call('POST', '/api/auth/email', { body: { email } });
  const { token } = await (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).json();
  if (company) await call('PUT', '/api/company', { token, body: { name: company, abn: abnFor(email) } });
  return token;
}

const INPUT = { state: 'qld', task: 'Dig a trench 1 m deep with an excavator.', fallRisk: 'no', trade: 'civil' };
const plain = prepareDraft(draftBody(INPUT));
const excavate = plain.jobSteps.find((step) => step.step === 'Excavate');
const before = plain.jobSteps.find((step) => step.step === 'Before starting');
// A code line the user may change or remove, and a regulation line they may not.
const CODE_LINE = excavate.controls.find((line) => !legalSource(line) && /\(Excavation work Code/.test(line));
const PLAIN_LINE = excavate.controls.find((line) => !legalSource(line) && !line.endsWith(')'));
const LEGAL_LINE = before.controls.find((line) => /white card/.test(line));

const EDITS = {
  Excavate: {
    removed: [PLAIN_LINE],
    changed: [{ from: CODE_LINE, to: 'Spoil is kept 2 m back from the trench edge.' }],
    added: ['A toolbox talk on trench safety is held each morning.'],
  },
};

test('the lines picked for the test are what they should be', () => {
  assert.ok(CODE_LINE && PLAIN_LINE && LEGAL_LINE);
  assert.equal(legalSource(LEGAL_LINE), 'Work Health and Safety Regulation 2011 (Qld) s 317');
  assert.equal(legalSource(CODE_LINE), '', 'a code of practice line is not a legal requirement');
  assert.equal(legalSource('Workers hold a white card (general construction induction card).'), '', 'brackets that are not a source');
  assert.equal(legalSource('Fit-out work. (Occupational Health and Safety Regulations 2017 (Vic) r 21)'), 'Occupational Health and Safety Regulations 2017 (Vic) r 21');
});

test('removed, changed and added lines are applied to the step, with the user\'s own lines marked and uncited', () => {
  const draft = prepareDraft(draftBody({ ...INPUT, controlEdits: EDITS }));
  const controls = draft.jobSteps.find((step) => step.step === 'Excavate').controls;
  assert.ok(!controls.includes(PLAIN_LINE), 'removed');
  assert.ok(!controls.includes(CODE_LINE), 'changed from');
  // The removed line shifts the changed line up one place only when it came before it.
  const at = excavate.controls.indexOf(CODE_LINE) - (excavate.controls.indexOf(PLAIN_LINE) < excavate.controls.indexOf(CODE_LINE) ? 1 : 0);
  assert.equal(controls[at], `Spoil is kept 2 m back from the trench edge. ${OWN_MARK}`, 'the changed line takes the old line\'s place, without the code citation');
  assert.equal(controls[controls.length - 1], `A toolbox talk on trench safety is held each morning. ${OWN_MARK}`);
  assert.equal(controls.length, excavate.controls.length);
  assert.deepEqual(draft.controlEdits.applied.map((item) => item.kind).sort(), ['added', 'changed', 'removed']);
  assert.deepEqual(draft.controlEdits.refused, []);
  // Other steps are as they were.
  assert.deepEqual(draft.jobSteps.find((step) => step.step === 'Before starting').controls, before.controls);
  // Without changes, the draft is as before and carries no report.
  assert.equal(plain.controlEdits, undefined);
});

test('a line that is a legal requirement is not removed or changed, and the reason is given', () => {
  const draft = prepareDraft(draftBody({ ...INPUT, controlEdits: { 'Before starting': { removed: [LEGAL_LINE] }, Excavate: { changed: [{ from: LEGAL_LINE, to: 'x' }] } } }));
  assert.deepEqual(draft.jobSteps.find((step) => step.step === 'Before starting').controls, before.controls);
  assert.equal(draft.controlEdits.refused.length, 1, 'a line not in the step is left alone');
  assert.equal(draft.controlEdits.refused[0].text, LEGAL_LINE);
  assert.match(draft.controlEdits.refused[0].reason, /legal requirement \(Work Health and Safety Regulation 2011 \(Qld\) s 317\), so it cannot be removed or changed/);
  const changed = prepareDraft(draftBody({ ...INPUT, controlEdits: { 'Before starting': { changed: [{ from: LEGAL_LINE, to: 'No white card needed.' }] } } }));
  assert.ok(changed.jobSteps[0].controls.includes(LEGAL_LINE));
  assert.ok(!changed.jobSteps[0].controls.some((line) => /No white card/.test(line)));
});

test('a step keeps at least one control', () => {
  const step = plain.jobSteps.find((item) => item.controls.every((line) => !legalSource(line)));
  const draft = prepareDraft(draftBody({ ...INPUT, controlEdits: { [step.step]: { removed: step.controls } } }));
  assert.deepEqual(draft.jobSteps.find((item) => item.step === step.step).controls, step.controls);
  assert.equal(draft.controlEdits.refused.length, step.controls.length);
});

test('the changes are size-limited when read from a request', () => {
  const long = 'x'.repeat(5000);
  const body = draftBody({ ...INPUT, controlEdits: { Excavate: { removed: Array(100).fill('a'), changed: [{ from: long, to: long }, { from: 1, to: 'y' }], added: Array(50).fill(long) }, Empty: {}, Bad: 'text' } });
  const edit = body.controlEdits.Excavate;
  assert.equal(edit.removed.length, 40);
  assert.equal(edit.changed.length, 1);
  assert.equal(edit.changed[0].to.length, 600);
  assert.equal(edit.added.length, 20);
  assert.equal(edit.added[0].length, 600);
  assert.deepEqual(Object.keys(body.controlEdits), ['Excavate']);
  assert.equal(draftBody({ ...INPUT, controlEdits: [] }).controlEdits, undefined);
  assert.equal(draftBody({ ...INPUT, controlEdits: { ['__proto__']: { added: ['a'] } } }).controlEdits.__proto__.added[0], 'a');
});

test('the Word file prints what the user chose', async () => {
  const draft = prepareDraft(draftBody({ ...INPUT, controlEdits: EDITS }));
  const zip = await JSZip.loadAsync(await draftToDocx(draft, {}));
  const xml = await zip.file('word/document.xml').async('string');
  assert.match(xml, /Spoil is kept 2 m back from the trench edge\. \(Our own control\)/);
  assert.match(xml, /A toolbox talk on trench safety is held each morning\. \(Our own control\)/);
  assert.doesNotMatch(xml, new RegExp(PLAIN_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('the preview marks the legal lines, and a saved SWMS keeps the changes', async () => {
  const preview = await (await call('POST', '/api/draft', { body: { ...INPUT, controlEdits: EDITS } })).json();
  assert.equal(preview.controlLegal.length, preview.jobSteps.length);
  const start = preview.jobSteps.findIndex((step) => step.step === 'Before starting');
  assert.equal(preview.controlLegal[start][preview.jobSteps[start].controls.indexOf(LEGAL_LINE)], 'Work Health and Safety Regulation 2011 (Qld) s 317');

  const token = await signIn('saver@edits.example', 'Saver Pty Ltd');
  const saved = await call('POST', '/api/swms', { token, body: { input: { ...INPUT, controlEdits: EDITS }, reviewConfirmed: true, reviewedBy: 'Sam Lee' } });
  assert.equal(saved.status, 201);
  const { swms } = await saved.json();
  const detail = await (await call('GET', `/api/swms/${swms.id}`, { token })).json();
  assert.deepEqual(detail.input.controlEdits, EDITS);
  assert.ok(detail.draft.jobSteps.find((step) => step.step === 'Excavate').controls.includes(`A toolbox talk on trench safety is held each morning. ${OWN_MARK}`));
});

test('with CONTROL_LEARNING off, nothing is kept', async () => {
  delete process.env.CONTROL_LEARNING;
  const token = await signIn('off@edits.example', 'Off Learning Pty Ltd');
  assert.equal((await call('POST', '/api/swms', { token, body: { input: { ...INPUT, controlEdits: EDITS }, reviewConfirmed: true, reviewedBy: 'Sam Lee' } })).status, 201);
  assert.equal(await recordControlEdits(prepareDraft(draftBody({ ...INPUT, controlEdits: EDITS })), INPUT), 0);
  assert.equal(Number((await db.one('SELECT COUNT(*) AS n FROM control_edits')).n), 0);
});

test('with CONTROL_LEARNING on, de-identified rows are kept and counted for the owner', async () => {
  process.env.CONTROL_LEARNING = 'on';
  try {
    const token = await signIn('on@edits.example', 'Learning Builders Pty Ltd');
    const input = { ...INPUT, controlEdits: EDITS, workplace: '12 Smith Street, Brisbane QLD 4000', siteManager: 'Jo Bloggs' };
    assert.equal((await call('POST', '/api/swms', { token, body: { input, reviewConfirmed: true, reviewedBy: 'Sam Lee' } })).status, 201);
    const rows = await db.query('SELECT * FROM control_edits ORDER BY kind');
    assert.equal(rows.length, 3);
    assert.deepEqual(Object.keys(rows[0]).sort(), ['id', 'kind', 'month', 'new_line', 'original', 'state', 'step', 'trade', 'uses']);
    const changed = rows.find((row) => row.kind === 'changed');
    assert.equal(changed.step, 'Excavate');
    assert.equal(changed.original, CODE_LINE);
    assert.equal(changed.new_line, 'Spoil is kept 2 m back from the trench edge.');
    assert.equal(changed.state, 'qld');
    assert.equal(changed.trade, 'civil');
    assert.match(changed.month, /^\d{4}-\d{2}$/);
    const text = JSON.stringify(rows);
    assert.doesNotMatch(text, /Learning Builders|Sam Lee|Jo Bloggs|Smith Street|on@edits|Dig a trench/, 'no business, name, address, email or task');

    // The same change again adds to its count.
    assert.equal((await call('POST', '/api/swms', { token, body: { input, reviewConfirmed: true, reviewedBy: 'Sam Lee' } })).status, 201);
    assert.equal(Number((await db.one('SELECT COUNT(*) AS n FROM control_edits')).n), 3);
    assert.equal(Number((await db.one("SELECT uses FROM control_edits WHERE kind = 'added'")).uses), 2);

    const owner = await signIn('owner@edits.example');
    const summary = await (await call('GET', '/api/admin/control-learning', { token: owner })).json();
    assert.deepEqual(summary, { enabled: true, total: 6, byKind: { removed: 2, changed: 2, added: 2 }, steps: [{ step: 'Excavate', changes: 6 }] });
    assert.equal((await call('GET', '/api/admin/control-learning', { token })).status, 403);
  } finally {
    delete process.env.CONTROL_LEARNING;
  }
});
