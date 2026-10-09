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
const { setupAccounts, lastLinkToken, ANSWERED, ready } = require('./helpers');

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

// The site questions answered, as a SWMS needs before it is saved or downloaded (goal 2).
const INPUT = ready({ ...ANSWERED, state: 'qld', task: 'Dig a trench 1 m deep with an excavator.', fallRisk: 'no', trade: 'civil' });
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

test('a line that is a legal requirement can be removed or changed, with a warning citing the law, and the change is recorded', () => {
  // Owner decision, 6 October 2026: any line can be removed or weakened, with a warning.
  const draft = prepareDraft(draftBody({ ...INPUT, controlEdits: { 'Before starting': { removed: [LEGAL_LINE], reasons: [{ line: LEGAL_LINE, reason: 'othersCover', note: 'The builder checks white cards at the gate.' }] }, Excavate: { changed: [{ from: LEGAL_LINE, to: 'x' }] } } }));
  assert.ok(!draft.jobSteps.find((step) => step.step === 'Before starting').controls.includes(LEGAL_LINE), 'removed');
  assert.deepEqual(draft.controlEdits.refused, []);
  assert.equal(draft.controlEdits.unmatched.length, 1, 'a line not in the step is left alone, and reported');
  const [warned] = draft.controlEdits.warned;
  assert.equal(warned.text, LEGAL_LINE);
  assert.equal(warned.kind, 'removed');
  assert.equal(warned.legal, 'Work Health and Safety Regulation 2011 (Qld) s 317');
  assert.match(warned.warnings[0], /^This line is a legal requirement \(Work Health and Safety Regulation 2011 \(Qld\) s 317\)\. Removing or weakening it is not recommended/);
  assert.deepEqual([warned.reason, warned.note], ['othersCover', 'The builder checks white cards at the gate.']);
  const applied = draft.controlEdits.applied.find((item) => item.from === LEGAL_LINE);
  assert.deepEqual([applied.kind, applied.reason], ['removed', 'othersCover']);
  const changed = prepareDraft(draftBody({ ...INPUT, controlEdits: { 'Before starting': { changed: [{ from: LEGAL_LINE, to: 'No white card needed.' }] } } }));
  assert.ok(!changed.jobSteps[0].controls.includes(LEGAL_LINE));
  assert.ok(changed.jobSteps[0].controls.includes(`No white card needed. ${OWN_MARK}`));
  assert.equal(changed.controlEdits.warned[0].kind, 'changed');
});

test('weakening a control is warned about: a smaller number, softer words, a lost permit, vague wording', () => {
  const line = SPOIL;
  const check = (to) => prepareDraft(draftBody({ ...INPUT, controlEdits: { Excavate: { changed: [{ from: line, to }] } } })).controlEdits.warned.flatMap((item) => item.warnings);
  assert.match(check('Spoil is heaped at least 0.5 m back from the trench edge.').join(' '), /A number has changed \(1 m to 0\.5 m\)/);
  assert.match(check('Spoil should be heaped 1 m back from the trench edge where possible.').join(' '), /"should" makes the control optional.*"where possible" makes the control optional/);
  assert.match(check('Take care with spoil near the trench.').join(' '), /The wording is vague/);
  assert.deepEqual(check('Spoil is heaped at least 2 m back from the trench edge, on the low side.'), [], 'a stronger line is not warned about');
  const permit = prepareDraft(draftBody({ ...INPUT, controlEdits: { 'Locate underground services': { changed: [{ from: plain.jobSteps.find((step) => step.step === 'Locate underground services').controls.find((item) => /excavation permit/.test(item)), to: 'Services are located before digging.' }] } } }));
  const warnings = permit.controlEdits.warned[0].warnings.join(' ');
  assert.match(warnings, /^Removing or weakening this line is not recommended \(Excavation work Code of Practice 2021 \(Qld\) s 3\.\d+\)\. The excavation permit confirms/);
  assert.match(warnings, /The line no longer mentions "permit"/);
  // A vague line of the user's own is warned about too.
  const added = prepareDraft(draftBody({ ...INPUT, controlEdits: { Excavate: { added: ['Be careful near the trench.'] } } }));
  assert.equal(added.controlEdits.warned[0].kind, 'added');
});

test('the lines SiteReady recommends keeping carry a warning, whatever they are cited to', () => {
  const { keepWarning } = require('../draft');
  const cases = [
    ['No person enters a confined space until a confined space entry permit is issued. (Confined spaces Code of Practice 2021 (Qld) s 4.3)', /confined space/],
    ['Plant stays 3 m from overhead power lines. (Electrical Safety Code of Practice 2020: Working near overhead and underground electric lines (Qld) s 4.2)', /3 m zone/],
    ['No hot work starts until a hot work permit is issued.', /hot work permit/],
    ['Before work on isolated plant, an isolation permit is issued.', /lock-out/],
    ['A trench 1.5 m deep or more has all sides supported.', /geotechnical engineer/],
    ['Stop work and leave if the oxygen level is below 19.5% or above 23%.', /oxygen-enriched/],
  ];
  for (const [line, why] of cases) assert.match(keepWarning(line), why, line);
  assert.equal(keepWarning('Keep the work area tidy.'), '');
  assert.equal(keepWarning(`No hot work starts until a hot work permit is issued. ${OWN_MARK}`), '', 'the user\'s own line');
});

test('reasons are cleaned and limited to the pick list', () => {
  const body = draftBody({ ...INPUT, controlEdits: { Excavate: { removed: ['a'], reasons: [{ line: 'a', reason: 'notNeeded', note: 'x'.repeat(500) }, { line: 'b', reason: 'made up' }, { line: 'c', reason: 'other' }, 'bad'] } } });
  assert.deepEqual(body.controlEdits.Excavate.reasons.map((item) => [item.line, item.reason, item.note.length]), [['a', 'notNeeded', 300], ['c', 'other', 0]]);
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
  // And why removing it is not recommended, so the page warns before the user goes ahead.
  assert.match(preview.controlWarn[start][preview.jobSteps[start].controls.indexOf(LEGAL_LINE)], /^This line is a legal requirement \(Work Health and Safety Regulation 2011 \(Qld\) s 317\)/);

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
  assert.equal(await recordControlEdits(prepareDraft(draftBody({ ...INPUT, controlEdits: EDITS })), INPUT, { company: { id: 'c' }, swmsId: 's', revision: 1 }), 0);
  assert.equal(Number((await db.one('SELECT COUNT(*) AS n FROM control_edit_events')).n), 0);
  assert.equal(Number((await db.one('SELECT COUNT(*) AS n FROM control_edits')).n), 0);
});

const eventCount = async () => Number((await db.one('SELECT COUNT(*) AS n FROM control_edit_events')).n);

test('with CONTROL_LEARNING on, each change is kept once for each saved revision, de-identified, with whether it was kept', async () => {
  process.env.CONTROL_LEARNING = 'on';
  try {
    const token = await signIn('on@edits.example', 'Learning Builders Pty Ltd');
    const start = await eventCount();
    const input = { ...INPUT, controlEdits: EDITS, workplace: '12 Smith Street, Brisbane QLD 4000', siteManager: 'Jo Bloggs', kinds: ['trench'] };
    const { swms } = await (await call('POST', '/api/swms', { token, body: { input, reviewConfirmed: true, reviewedBy: 'Sam Lee' } })).json();
    const rows = await db.query('SELECT * FROM control_edit_events WHERE revision = 1 ORDER BY kind');
    assert.equal(rows.length, 3);
    assert.deepEqual(Object.keys(rows[0]).sort(), ['created_at', 'edit_key', 'high_risk', 'id', 'kept', 'kind', 'kinds', 'legal', 'month', 'new_line', 'note', 'original', 'outcome', 'reason', 'revision', 'state', 'step', 'swms_key', 'trade', 'warning']);
    const changed = rows.find((row) => row.kind === 'changed');
    assert.equal(changed.step, 'Excavate');
    assert.equal(changed.outcome, 'applied');
    assert.equal(changed.original, CODE_LINE);
    assert.equal(changed.new_line, 'Spoil is kept 2 m back from the trench edge.');
    assert.equal(changed.state, 'qld');
    assert.equal(changed.trade, 'civil');
    assert.deepEqual(JSON.parse(changed.kinds), ['trench']);
    assert.match(changed.month, /^\d{4}-\d{2}$/);
    assert.notEqual(changed.swms_key, swms.id);
    assert.doesNotMatch(JSON.stringify(rows), new RegExp(`Learning Builders|Sam Lee|Jo Bloggs|Smith Street|on@edits|Dig a trench|${swms.id}`), 'no business, name, address, email, task or SWMS id');

    // Downloading it, again and again, records nothing more.
    await call('GET', `/api/swms/${swms.id}/docx`, { token });
    await call('POST', '/api/draft.docx', { token, body: { ...input, swmsId: swms.id, reviewConfirmed: true, reviewedBy: 'Sam Lee' } });
    assert.equal(await eventCount(), start + 3);
    // A new revision records its changes once, and marks those of the revision before as kept or not.
    const fewer = { ...input, controlEdits: { Excavate: { ...EDITS.Excavate, added: [] } } };
    await call('PUT', `/api/swms/${swms.id}`, { token, body: { input: fewer, reviewConfirmed: true, reviewedBy: 'Sam Lee' } });
    assert.equal(await eventCount(), start + 5);
    const first = await db.query('SELECT kind, kept FROM control_edit_events WHERE swms_key = $1 AND revision = 1 ORDER BY kind', [changed.swms_key]);
    assert.deepEqual(first.map((row) => [row.kind, row.kept]), [['added', false], ['changed', true], ['removed', true]]);

    const owner = await signIn('owner@edits.example');
    const summary = await (await call('GET', '/api/admin/control-learning', { token: owner })).json();
    assert.equal(summary.enabled, true);
    assert.equal(summary.total, 5);
    assert.deepEqual([summary.byKind.removed, summary.byKind.changed, summary.byKind.added], [2, 2, 1]);
    assert.equal(summary.byOutcome.applied, 5);
    assert.deepEqual(summary.kept, { kept: 2, notKept: 1 });
    assert.deepEqual(summary.steps, [{ step: 'Excavate', changes: 5 }]);
    assert.equal((await call('GET', '/api/admin/control-learning', { token })).status, 403);
  } finally {
    delete process.env.CONTROL_LEARNING;
  }
});

test('warned changes, reasons, hazard and Who changes and unmatched changes are kept; personal details are taken out', async () => {
  process.env.CONTROL_LEARNING = 'on';
  try {
    const token = await signIn('warned@edits.example', 'Warned Learning Pty Ltd');
    const edits = {
      'Before starting': { removed: [LEGAL_LINE], reasons: [{ line: LEGAL_LINE, reason: 'othersCover', note: 'Ask Dave Smith on 0412 345 678.' }] },
      Excavate: { added: ['Call Dave Smith on 0412 345 678 or dave@example.com before digging at 12 Smith Street.'], removed: ['A line from an older release.'] },
    };
    const hazard = excavate.hazards[1];
    const input = { ...INPUT, controlEdits: edits, hazardEdits: { Excavate: { notApplicable: [hazard], reasons: [{ line: hazard, reason: 'anotherWay' }] } }, whoEdits: { Excavate: 'Kim Lee, leading hand' } };
    const { swms } = await (await call('POST', '/api/swms', { token, body: { input, reviewConfirmed: true, reviewedBy: 'Sam Lee' } })).json();
    const key = (await db.query('SELECT swms_key FROM control_edit_events WHERE original = $1', [LEGAL_LINE]))[0].swms_key;
    const rows = await db.query('SELECT * FROM control_edit_events WHERE swms_key = $1', [key]);
    const by = (kind) => rows.find((row) => row.kind === kind);
    assert.equal(by('removed').outcome, 'warned');
    assert.match(by('removed').warning, /legal requirement/);
    assert.equal(by('removed').legal, 'Work Health and Safety Regulation 2011 (Qld) s 317');
    assert.equal(by('removed').reason, 'othersCover');
    assert.equal(by('removed').note, 'Ask [name] on [phone].');
    assert.equal(by('added').new_line, 'Call [name] on [phone] or [email] before digging at [address].');
    assert.equal(by('hazardNotApplicable').original, hazard);
    assert.equal(by('hazardNotApplicable').reason, 'anotherWay');
    assert.equal(by('whoChanged').new_line, '[name], leading hand');
    assert.equal(rows.find((row) => row.outcome === 'unmatched').original, 'A line from an older release.');
    // Only the text fields: random hex ids and keys can contain "0412" by chance.
    const text = rows.map(({ original, new_line, note, warning, step, reason }) => [original, new_line, note, warning, step, reason].join(' ')).join(' ');
    assert.doesNotMatch(text, /Dave|Smith|0412|example\.com|Kim Lee/);
    assert.ok(swms.id);
  } finally {
    delete process.env.CONTROL_LEARNING;
  }
});

test('a business that opted out of industry data is left out, and rows are deleted after 3 years', async () => {
  process.env.CONTROL_LEARNING = 'on';
  try {
    const token = await signIn('optout@edits.example', 'Opt Out Pty Ltd');
    const user = await db.one('SELECT company_id FROM users WHERE email = $1', ['optout@edits.example']);
    await db.query('UPDATE companies SET industry_opt_out = TRUE WHERE id = $1', [user.company_id]);
    const before = await eventCount();
    assert.equal((await call('POST', '/api/swms', { token, body: { input: { ...INPUT, controlEdits: EDITS }, reviewConfirmed: true, reviewedBy: 'Sam Lee' } })).status, 201);
    assert.equal(await eventCount(), before);

    const { removeOld, RETENTION_YEARS } = require('../control-learning');
    assert.equal(RETENTION_YEARS, 3);
    await db.query(`INSERT INTO control_edit_events (id, swms_key, revision, month, step, kind, outcome, edit_key, created_at) VALUES ('old-row', 'k', 1, '2023-01', 'Excavate', 'added', 'applied', 'e', $1)`, [new Date('2023-01-15T00:00:00Z')]);
    await removeOld(new Date('2026-10-06T00:00:00Z'));
    assert.equal(await db.one("SELECT id FROM control_edit_events WHERE id = 'old-row'"), null);
    assert.equal(await eventCount(), before);
  } finally {
    delete process.env.CONTROL_LEARNING;
  }
});

// ---- Changes made on a line SiteReady has since reworded (audit step 4, bugs B4 and B5) ----

const SPOIL = excavate.controls.find((line) => /^Spoil is heaped at least 1 m back/.test(line));
const BARRICADE = excavate.controls.find((line) => /^Open trenches are barricaded/.test(line));

test('a change made on a line SiteReady has since reworded or re-cited follows the line, and says so', () => {
  // The line as an older release worded it: another source, and one word different.
  const oldSpoil = SPOIL.replace(/\(Excavation work Code[^]*\)$/, '(Excavation work Code of Practice 2011 (Qld) s 4)');
  const oldBarricade = BARRICADE.replace('secure them', 'protect them').replace(/\s*\([^]*\)$/, '');
  const draft = prepareDraft(draftBody({ ...INPUT, controlEdits: { Excavate: { removed: [oldSpoil], changed: [{ from: oldBarricade, to: 'Trenches are fenced with mesh panels.' }], added: [] } } }));
  const controls = draft.jobSteps.find((step) => step.step === 'Excavate').controls;
  assert.ok(!controls.includes(SPOIL), 'the removed line is out, though its source changed');
  assert.ok(!controls.includes(BARRICADE), 'the changed line is replaced, though it was reworded');
  assert.ok(controls.includes(`Trenches are fenced with mesh panels. ${OWN_MARK}`));
  assert.deepEqual(draft.controlEdits.remapped.map((item) => [item.kind, item.line]), [['removed', SPOIL], ['changed', BARRICADE]]);
  assert.deepEqual(draft.controlEdits.unmatched, []);
});

test('a change that no longer matches any line is reported with the old line, not silently dropped', () => {
  const gone = 'Trench walls are inspected by a geotechnical engineer every hour. (Excavation work Code of Practice 2011 (Qld) s 9)';
  const draft = prepareDraft(draftBody({ ...INPUT, controlEdits: {
    Excavate: { removed: [gone], changed: [], added: [] },
    'Pump out the sump': { removed: [], changed: [], added: ['The sump pump is checked daily.'] },
  } }));
  assert.deepEqual(draft.jobSteps.find((step) => step.step === 'Excavate').controls, excavate.controls, 'nothing changed');
  assert.deepEqual(draft.controlEdits.unmatched.map((item) => [item.step, item.kind, item.text || item.to, item.reason]).sort(), [
    ['Excavate', 'removed', gone, 'line'],
    ['Pump out the sump', 'added', 'The sump pump is checked daily.', 'step'],
  ]);
});

test('a step SiteReady has renamed keeps its changes', () => {
  const draft = prepareDraft(draftBody({ ...INPUT, controlEdits: { 'Excavate the trench': { removed: [PLAIN_LINE], changed: [], added: [] } } }));
  assert.ok(!draft.jobSteps.find((step) => step.step === 'Excavate').controls.includes(PLAIN_LINE));
  assert.deepEqual(draft.controlEdits.remapped, [{ step: 'Excavate the trench', kind: 'step', from: 'Excavate the trench', line: 'Excavate' }]);
});

test('typing in the task keeps the changes that still apply, and reports the rest', () => {
  // The same changes on a task with no trench: the Excavate step is gone, the first step stays.
  const edits = { ...EDITS, 'Before starting': { removed: [], changed: [], added: ['Neighbours are told.'] } };
  const draft = prepareDraft(draftBody({ state: 'qld', task: 'Paint the interior walls of a shop with water-based paint.', fallRisk: 'no', facts: { safetyDataSheet: 'Water-based paint SDS at the work area.' }, controlEdits: edits }));
  assert.ok(draft.jobSteps[0].controls.includes(`Neighbours are told. ${OWN_MARK}`));
  assert.deepEqual([...new Set(draft.controlEdits.unmatched.map((item) => item.step))], ['Excavate']);
  assert.equal(draft.controlEdits.unmatched.length, 3);
});

test('the scrubber keeps public bodies and product brands, and still takes out people and surname brands', () => {
  const { scrub } = require('../control-learning');
  assert.equal(scrub('Telstra pit lids are lifted with a lid lifter.'), 'Telstra pit lids are lifted with a lid lifter.');
  assert.equal(scrub('Ausgrid or Energex approval held before Hilti and Ramset tools are used.'), 'Ausgrid or Energex approval held before Hilti and Ramset tools are used.');
  assert.equal(scrub('Workers sign the Dial Before You Dig plans.'), 'Workers sign the Dial Before You Dig plans.');
  assert.equal(scrub('Call Dave Smith on 0412 345 678.'), 'Call [name] on [phone].');
  assert.match(scrub('Coates supplies the Genie lift.'), /^\[name\] supplies the Genie lift\.$/);
});

// ---- The scrubber with the account's own names (goal 11, item 2). Every name here is invented. ----

const ACCOUNT = {
  company: { name: 'Harbourline Constructions Pty Ltd', address: '7 Corella Court, Milton QLD 4064', email: 'office@harbourline.example' },
  input: { workplace: '18 Wattlebird Lane, Toowong QLD 4066', principalContractor: 'Brookvale Building Group', siteManager: 'Dave Okafor', firstAider: 'Priya Ramesh (leading hand)', musterPoint: 'Gate 2 car park' },
  rows: {
    users: [{ name: 'Lena Marsh', email: 'lena.marsh@harbourline.example' }, { name: '', email: 'tomh@gmail.com' }],
    sites: [{ name: 'Kestrel Point Apartments', details: { principalContractor: 'Brookvale Building Group', siteManager: 'Dave Okafor' } }],
    workers: [{ worker_name: 'Ravi Patel', worker_company: 'Coastline Formwork', explained_by: '' }],
    reviewedBy: 'Tom Halloran',
  },
};

test('the scrubber takes out the account\'s own business, site, principal contractor and people names, in any case', () => {
  const { scrub, accountValues, accountTerms } = require('../control-learning');
  const terms = accountTerms(accountValues(ACCOUNT.company, ACCOUNT.input, ACCOUNT.rows));
  const cases = [
    // Notes as subbies type them: lower case, initials, the site by its short name.
    ['ask dave from harbourline first', 'ask [name] from [name] first'],
    ['bbg super wants permits signed before 7am', '[name] super wants permits signed before 7am'],
    ['Use the Genie scissor lift on level 3 of kestrel point', 'Use the Genie scissor lift on level 3 of [site]'],
    ['Kestrel Point Apartments level 4 slab edge', '[site] level 4 slab edge'],
    ['toowong job: gate 2 only, no deliveries before 7am', '[site] job: gate 2 only, no deliveries before 7am'],
    ['priya ramesh is first aider, radio channel 4', '[name] is first aider, radio channel 4'],
    ['lena to check scaffold tags weekly', '[name] to check scaffold tags weekly'],
    ['ravi from coastline does the formwork strip', '[name] from [name] does the formwork strip'],
    ['tom halloran signs off the permit', '[name] signs off the permit'],
    ['brookvale want hold points photographed', '[name] want hold points photographed'],
    ['OKAFOR TO SIGN THE PERMIT', '[name] TO SIGN THE PERMIT'],
    // Library words in the account's names are not taken out on their own.
    ['Muster at the gate 2 car park, the leading hand calls the roll.', 'Muster at the gate 2 car park, the leading hand calls the roll.'],
  ];
  for (const [typed, kept] of cases) assert.equal(scrub(typed, '', terms), kept, typed);
  // Without the account, the same notes keep the names the patterns cannot see.
  assert.equal(scrub('ask dave from harbourline first'), 'ask [name] from harbourline first');
  assert.equal(scrub('bbg super wants permits signed before 7am'), 'bbg super wants permits signed before 7am');
});

test('the scrubber takes out lower-case given names, initials in capitals, businesses before a trade word and named places', () => {
  const { scrub } = require('../control-learning');
  const cases = [
    ['ask dave from abc plumbing first', 'ask [name] from [name] plumbing first'],
    ['ring mick from coates hire for the tag', 'ring [name] from [name] hire for the tag'],
    ['HCG supervisor checks the harness', '[name] supervisor checks the harness'],
    ['smith and sons deliver the steel', '[name] and sons deliver the steel'],
    ['Barricade near the Royal Brisbane Hospital entry', 'Barricade near the [site] entry'],
    ['barricade near the royal brisbane hospital entry', 'barricade near the [site] entry'],
    ['Brisbane Airport works need an airside permit', '[site] works need an airside permit'],
    ['Spotter from Coates on site at 42 Smith Street', 'Spotter from [name] on site at [address]'],
    // Library lines, site short forms and public names stay as typed.
    ['LOTO on the MSB before the sparky starts. SWMS and JSA signed.', 'LOTO on the MSB before the sparky starts. SWMS and JSA signed.'],
    ['PPE: P2 mask and safety glasses, check with the PC', 'PPE: P2 mask and safety glasses, check with the PC'],
    ['Mobile scaffold tower is inspected before use.', 'Mobile scaffold tower is inspected before use.'],
    ['the car park and the site office', 'the car park and the site office'],
    ['Telstra pit lids are lifted with a lid lifter.', 'Telstra pit lids are lifted with a lid lifter.'],
    ['DO NOT ENTER THE EXCLUSION ZONE WHILE THE CRANE IS LIFTING', 'DO NOT ENTER THE EXCLUSION ZONE WHILE THE CRANE IS LIFTING'],
  ];
  for (const [typed, kept] of cases) assert.equal(scrub(typed), kept, typed);
});

test('a saved SWMS records the user\'s words without the account\'s business, site, principal contractor or people', async () => {
  process.env.CONTROL_LEARNING = 'on';
  try {
    const token = await signIn('lena.marsh@harbourline.example', 'Harbourline Constructions Pty Ltd');
    const site = await (await call('POST', '/api/sites', { token, body: { name: 'Kestrel Point Apartments', workplace: '18 Wattlebird Lane, Toowong QLD 4066', principalContractor: 'Brookvale Building Group', siteManager: 'Dave Okafor', firstAider: 'Priya Ramesh' } })).json();
    const edits = {
      'Before starting': { removed: [LEGAL_LINE], reasons: [{ line: LEGAL_LINE, reason: 'othersCover', note: 'brookvale check white cards at the toowong gate, ask dave okafor' }] },
      Excavate: { added: ['Ask dave before the bbg super walks the kestrel point slab edge.', 'lena marsh signs the dig permit with harbourline.'] },
    };
    const input = { ...INPUT, controlEdits: edits, whoEdits: { Excavate: 'priya (first aider)' } };
    const saved = await call('POST', '/api/swms', { token, body: { input, siteId: site.site.id, reviewConfirmed: true, reviewedBy: 'Tom Halloran' } });
    assert.equal(saved.status, 201);
    const key = (await db.query('SELECT swms_key FROM control_edit_events WHERE original = $1 AND reason = $2', [LEGAL_LINE, 'othersCover'])).pop().swms_key;
    const rows = await db.query('SELECT * FROM control_edit_events WHERE swms_key = $1', [key]);
    const lines = rows.map((row) => row.new_line).sort();
    assert.ok(lines.includes('Ask [name] before the [name] super walks the [site] slab edge.'), lines.join(' | '));
    assert.ok(lines.includes('[name] signs the dig permit with [name].'), lines.join(' | '));
    assert.ok(lines.includes('[name] (first aider)'), lines.join(' | '));
    assert.equal(rows.find((row) => row.kind === 'removed').note, '[name] check white cards at the [site] gate, ask [name]');
    assert.doesNotMatch(JSON.stringify(rows), /harbourline|brookvale|bbg|kestrel|toowong|wattlebird|dave|okafor|priya|ramesh|lena|marsh|halloran/i);
  } finally {
    delete process.env.CONTROL_LEARNING;
  }
});
