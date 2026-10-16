// Job steps the user writes for work SiteWrite has no job steps for (owner, 11 October 2026):
// "Warn the user that they must enter the specific steps themselves", and "we need to gather this
// data for our own learning". From the warning above the draft (D184) the user writes a step: its
// name, hazards, controls and who is responsible. It prints in the SWMS marked as their own, is
// saved with the SWMS and its revisions, moves, changes and goes like any step, and a part with a
// printed step needs no tick. The download gate and the builder check read its words like any
// other. With CONTROL_LEARNING on, each saved revision's steps are recorded de-identified, and the
// monthly report lists the work users wrote steps for most, by different saved SWMS.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.ADMIN_EMAILS = 'owner@ownsteps.example';
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const JSZip = require('jszip');
const { app } = require('../server');
const db = require('../db');
const { prepareDraft, notCoveredRefusal, OWN_STEP_MARK } = require('../draft');
const { draftBody } = require('../input');
const { downloadGaps, gateMessage } = require('../download-gate');
const { checkSwms, fromDraft } = require('../builder-check');
const { draftToDocx } = require('../docx-draft');
const { draftToPdf } = require('../pdf-draft');
const { recordFor } = require('../industry');
const { questionPool } = require('../sign-read');
const { recordFailedQuestions, monthlyReport, reportMarkdown, gapKey } = require('../control-learning');
const { setupAccounts, lastLinkToken, ANSWERED, ready, checked } = require('./helpers');
const { loadPage, settle } = require('./fake-dom');

const FACTS = { safetyDataSheet: 'The diesel safety data sheet is kept at the work area.' };
const GENERATOR = { state: 'qld', task: 'Install the generator and leak test the fuel line.', fallRisk: 'no', residential: 'no', date: '11 October 2026', facts: FACTS, trade: 'electrical' };
const PART = 'leak test the fuel line';
// The user's own words, as a subbie would write them. Not library lines: they print as written.
const STEP = {
  part: PART,
  name: 'Leak test the fuel line',
  hazards: ['Diesel sprays from a joint under test pressure and catches fire.', 'Diesel on the skin and in the eyes.'],
  controls: [
    'The day tank valve is shut and the line is drained back to the tank before the test.',
    'No hot work, smoking or running engines within 10 m while the line is under test.',
    'Safety glasses and nitrile gloves are worn.',
  ],
  who: 'Plumber',
};
const draft = (extra = {}) => prepareDraft(draftBody({ ...GENERATOR, ...extra }));
const ownOf = (d) => d.jobSteps.filter((step) => step.own);
const MARKED = `Leak test the fuel line ${OWN_STEP_MARK}`;

// ---- Writing a step ----

test('the page cannot write a whole step without this: the picks add library steps, the editor lines', () => {
  // Before this change the user could tick library steps, and change, remove and add lines and
  // hazards in SiteWrite's steps, but not write a step of their own: an edit keyed to a step that
  // is not in the SWMS is reported and not applied.
  const d = draft({ controlEdits: { 'Leak test the fuel line': { added: ['The line is tested.'] } } });
  assert.ok(!d.jobSteps.some((step) => /Leak test/.test(step.step)));
  assert.deepEqual(d.controlEdits.unmatched.map((item) => [item.step, item.reason]), [['Leak test the fuel line', 'step']]);
});

test('a step the user writes prints before the closing step, its name marked as their own, rated and with its Who', () => {
  const plain = draft();
  const d = draft({ ownSteps: [STEP] });
  assert.deepEqual(plain.notCovered, [PART]);
  const names = d.jobSteps.map((step) => step.step);
  assert.deepEqual(names, [...plain.jobSteps.map((step) => step.step).slice(0, -1), MARKED, 'Finish and clean up']);
  const [own] = ownOf(d);
  assert.deepEqual(own.hazards, STEP.hazards, 'the hazards as written, unmarked');
  assert.deepEqual(own.controls, STEP.controls, 'the controls as written, in the order written, with no permit or category line added');
  assert.equal(own.responsible, 'Plumber');
  assert.ok(own.risk && own.risk.before.level && own.risk.after.level, 'rated before and after like any step');
  // SiteWrite's own steps are as they were.
  assert.deepEqual(d.jobSteps.filter((step) => !step.own), plain.jobSteps);
  assert.deepEqual(d.notCovered, [PART], 'the part is still named above the draft');
  assert.deepEqual(d.notCoveredWritten, [PART]);
  // With no Who, the step gets the position SiteWrite gives a step of that name.
  assert.equal(ownOf(draft({ ownSteps: [{ ...STEP, who: '' }] }))[0].responsible, 'Leading hand');
});

test('drafts without a step of the user\'s own are exactly as before', () => {
  const plain = draft();
  assert.deepEqual(draft({ ownSteps: [] }), plain);
  assert.deepEqual(draft({ ownSteps: [{ name: '', hazards: ['x'], controls: ['y'] }, 'text', null] }), plain, 'nothing usable was written');
  assert.equal(plain.notCoveredWritten, undefined);
  assert.equal(plain.ownStepNotes, undefined);
});

test('what is sent is cleaned: limits, one step to a name, lines as text', () => {
  const body = draftBody({ ownSteps: [
    { ...STEP, hazards: [...STEP.hazards, 42, '  ', 'A  hazard\nover two lines'], controls: Array.from({ length: 40 }, (_, i) => `Control ${i + 1}.`) },
    { ...STEP, name: 'leak TEST the fuel line', part: 'another' },
    { part: PART, name: 'x'.repeat(400), hazards: ['h'], controls: ['c'], who: 'w'.repeat(200) },
  ] });
  assert.equal(body.ownSteps.length, 2, 'the same name again is dropped');
  assert.deepEqual(body.ownSteps[0].hazards, [...STEP.hazards, 'A hazard over two lines']);
  assert.equal(body.ownSteps[0].controls.length, 30);
  assert.equal(body.ownSteps[1].name.length, 300);
  assert.equal(body.ownSteps[1].who.length, 120);
  assert.equal(draftBody({ ownSteps: 'nope' }).ownSteps, undefined);
  assert.equal(draftBody({ ownSteps: Array.from({ length: 30 }, (_, i) => ({ ...STEP, name: `Step ${i}` })) }).ownSteps.length, 20);
});

test('a step needs a hazard and a control to print, and what a reviewer marks down is said beside it, not printed', () => {
  const half = draft({ ownSteps: [{ ...STEP, controls: [] }] });
  assert.deepEqual(ownOf(half), [], 'no control: not printed');
  assert.deepEqual(half.notCoveredWritten, [], 'and the part still needs its tick');
  assert.deepEqual(half.ownStepNotes, [{ name: STEP.name, part: PART, prints: false, notes: ['Add at least one control. A step with no control does not print.'] }]);
  const rough = draft({ ownSteps: [{ ...STEP, controls: ['Wear appropriate PPE.', 'Be careful.', 'The line is isolated at the day tank valve and locked before the test.'] }] });
  const notes = rough.ownStepNotes[0].notes.join(' ');
  assert.match(notes, /The wording is vague: "Wear appropriate PPE\."/);
  assert.match(notes, /Put the controls in hierarchy order/);
  assert.equal(draft({ ownSteps: [STEP] }).ownStepNotes[0].notes.length, 0, 'a clear step has nothing said beside it');
});

test('a step written for work the warning does not name prints too, and needs no part', () => {
  // "Install the cable tray, then jack and skate the transformer": the library's plant moving step
  // is picked and nothing is named above the draft, so the user writes the step under the job steps.
  const transformer = { part: '', name: 'Jack and skate the transformer into the plant room', hazards: ['The transformer tips off the skates and crushes a worker.'], controls: ['No one puts a hand or foot under the transformer: it is packed with timber cribbing as it is jacked.'], who: 'Rigger' };
  const d = draft({ ownSteps: [transformer] });
  assert.deepEqual(ownOf(d).map((step) => step.step), [`${transformer.name} ${OWN_STEP_MARK}`]);
  assert.deepEqual(d.notCoveredWritten, [], 'it stands for no part named above the draft');
  assert.equal(notCoveredRefusal(d, {}), notCoveredRefusal(draft(), {}), 'the leak test still needs its own step or the tick');
});

test('it moves like any step, and hazard and Who changes made on SiteWrite\'s steps do not reach it', () => {
  const plain = draft();
  const order = plain.jobSteps.map((step) => step.step);
  const at = order.indexOf('Install the generators');
  const moved = draft({ ownSteps: [STEP], stepOrder: [...order.slice(0, at + 1), MARKED, ...order.slice(at + 1)] });
  assert.equal(moved.jobSteps[at + 1].step, MARKED);
  // A Who or hazard change named for the step's name is not applied to it: it is changed in its form.
  const edited = draft({ ownSteps: [STEP], whoEdits: { [MARKED]: 'Someone else' }, hazardEdits: { [MARKED]: { added: ['Another hazard'] } } });
  assert.equal(ownOf(edited)[0].responsible, 'Plumber');
  assert.deepEqual(ownOf(edited)[0].hazards, STEP.hazards);
  assert.deepEqual(edited.controlEdits.unmatched.map((item) => item.kind).sort(), ['hazardAdded', 'whoChanged']);
});

// ---- The download gate (D184) ----

const READY = ready({ ...GENERATOR, ...ANSWERED });

test('a part with a printed step needs no tick; a part without one still does; a blank left in the step stops the download', () => {
  const two = { ...READY, task: 'Install the generator, leak test the fuel line and hang the artwork from the scissor lift.' };
  const both = prepareDraft(draftBody(two));
  assert.deepEqual(both.notCovered, [PART, 'hang the artwork from the scissor lift']);
  const one = prepareDraft(draftBody({ ...two, ownSteps: [STEP] }));
  assert.equal(notCoveredRefusal(one, { ownSteps: [STEP] }), 'SiteWrite has no job steps for: hang the artwork from the scissor lift. Above the draft, write your own step for it, say which step in this SWMS covers it, or say which SWMS covers it, before saving or downloading.');
  assert.equal(notCoveredRefusal(one, { notCoveredConfirmed: ['hang the artwork from the scissor lift'] }), '', 'the tick for the rest is enough');
  const cover = downloadGaps(draftBody({ ...two, ownSteps: [STEP] }), one).find((gap) => gap.kind === 'cover');
  assert.match(cover.need, /^SiteWrite has no job steps for: hang the artwork from the scissor lift\./);
  const written = prepareDraft(draftBody({ ...READY, ownSteps: [STEP] }));
  assert.deepEqual(downloadGaps(draftBody({ ...READY, ownSteps: [STEP] }), written), [], 'nothing outstanding once the step is written');
  // A blank or placeholder in the step is changed in the step.
  const open = { ...READY, ownSteps: [{ ...STEP, controls: [...STEP.controls, 'Test pressure is ____ kPa.'] }] };
  const gaps = downloadGaps(draftBody(open), prepareDraft(draftBody(open)));
  assert.deepEqual(gaps.map((gap) => [gap.kind, gap.field, gap.label]), [['own', 'own-step-1', `Your step: ${MARKED}`]]);
  assert.match(gaps[0].need, /Your step has a blank \(____\) or "To be completed" left in: "Test pressure is ____ kPa\."\. Change your step to say what applies\./);
  assert.match(gateMessage(gaps), /Still to answer: Your step: Leak test the fuel line \(Our own step\)\./);
});

// ---- The builder check ----

test('the builder check reads the user\'s own words like any other: vague wording, placeholders and order', () => {
  const check = (step) => {
    const d = prepareDraft(draftBody({ ...READY, ownSteps: [step] }));
    return checkSwms(fromDraft(d, { state: 'qld' }), { state: 'qld' });
  };
  const points = (result, rule) => result.findings.find((item) => item.rule === rule).points;
  const good = check(STEP);
  assert.ok(fromDraft(prepareDraft(draftBody({ ...READY, ownSteps: [STEP] }))).steps.some((step) => step.step === MARKED && step.controls.length === 3));
  const vague = check({ ...STEP, controls: [...STEP.controls, 'Take care.', 'Use appropriate controls.'] });
  assert.ok(points(vague, 'W3') < points(good, 'W3'), 'vague lines of the user\'s own lose points');
  const placeholder = check({ ...STEP, hazards: ['To be completed'] });
  assert.ok(placeholder.hardFails.includes('H8'), 'a placeholder left in the step is a must-fix item');
  assert.ok(!good.hardFails.includes('H8'));
  const order = check({ ...STEP, controls: ['Safety glasses and nitrile gloves are worn.', 'The day tank is isolated at its valve and locked off before the test.'] });
  // Out of hierarchy order, the step is named in the fix. One step out of order among many still rounds
  // to full points.
  assert.match(order.findings.find((item) => item.rule === 'W10').message, /in: Leak test the fuel line \(Our own step\)\./);
  assert.doesNotMatch(good.findings.find((item) => item.rule === 'W10').message, /Our own step/);
});

// ---- Word and PDF ----

function pdfText(buffer) {
  const raw = buffer.toString('latin1');
  const out = [];
  const streams = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (let match = streams.exec(raw); match; match = streams.exec(raw)) {
    let body;
    try { body = zlib.inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1'); } catch { continue; }
    for (const array of body.match(/\[[^\]]*\]\s*TJ/g) || []) {
      out.push((array.match(/<([0-9a-fA-F]*)>/g) || []).map((hex) => Buffer.from(hex.slice(1, -1), 'hex').toString('latin1')).join(''));
    }
  }
  return out.join('\n');
}
async function wordText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  return (await Promise.all(Object.keys(zip.files).filter((name) => /^word\/.*\.xml$/.test(name)).map((name) => zip.file(name).async('string')))).join(' ').replace(/<[^>]+>/g, '');
}

test('the Word and PDF files print the step in its place, marked as the user\'s own, and nothing said beside it', async () => {
  const d = draft({ ownSteps: [{ ...STEP, controls: [...STEP.controls, 'Take care.'] }] });
  const n = d.jobSteps.findIndex((step) => step.own) + 1;
  const word = await wordText(await draftToDocx(d, { confirmation: { name: 'Sam Lee', date: '11 October 2026' } }));
  assert.ok(word.includes(`${n}. ${MARKED}`), 'numbered in its place');
  for (const line of [...STEP.hazards, ...STEP.controls, 'Plumber']) assert.ok(word.includes(line), line);
  assert.doesNotMatch(word, /wording is vague|no job steps/i);
  const pdf = pdfText(Buffer.from(await draftToPdf(d, {}))).replace(/\s+/g, ' ');
  assert.ok(pdf.includes('Leak test the fuel line'), 'the step is in the PDF');
  assert.ok(pdf.includes('(Our own step)'));
  assert.ok(pdf.includes('nitrile gloves'));
  assert.doesNotMatch(pdf, /wording is vague|no job steps/i);
});

// ---- Saved, revised, downloaded ----

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

function abnFor(seed) {
  let n = 0;
  for (const ch of seed) n = (n * 31 + ch.charCodeAt(0)) % 1000000000;
  const tail = String(n).padStart(9, '0');
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  for (let head = 10; head <= 99; head += 1) {
    const digits = `${head}${tail}`;
    if ([...digits].reduce((sum, d, i) => sum + (Number(d) - (i === 0 ? 1 : 0)) * weights[i], 0) % 89 === 0) return digits;
  }
  return abnFor(`${seed}x`);
}

async function signIn(email, company) {
  await call('POST', '/api/auth/email', { body: { email } });
  const { token } = await (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).json();
  await call('PUT', '/api/company', { token, body: { name: company, abn: abnFor(email) } });
  return token;
}

const CONFIRM = { reviewConfirmed: true, reviewedBy: 'Sam Lee' };

test('downloads and saving need no tick for a part with a printed step, and the files carry it', async () => {
  const token = await signIn('download@ownsteps.example', 'Fuel Line Testing Pty Ltd');
  assert.equal((await call('POST', '/api/draft.docx', { token, body: checked({ ...READY, ...CONFIRM }) })).status, 400, 'without a step or a tick');
  assert.equal((await call('POST', '/api/draft.docx', { token, body: checked({ ...READY, ...CONFIRM, ownSteps: [{ ...STEP, hazards: [] }] }) })).status, 400, 'a step that does not print does not count');
  const word = await call('POST', '/api/draft.docx', { token, body: checked({ ...READY, ...CONFIRM, ownSteps: [STEP] }) });
  assert.equal(word.status, 200);
  assert.ok((await wordText(Buffer.from(await word.arrayBuffer()))).includes(MARKED));
  const pdf = await call('POST', '/api/draft.pdf', { token, body: checked({ ...READY, ...CONFIRM, ownSteps: [STEP] }) });
  assert.equal(pdf.status, 200);
  assert.ok(pdfText(Buffer.from(await pdf.arrayBuffer())).includes('(Our own step)'));
  // The preview carries the step, what is said beside it and the part it covers.
  const preview = await (await call('POST', '/api/draft', { body: { ...READY, ownSteps: [STEP] } })).json();
  assert.deepEqual(preview.notCoveredWritten, [PART]);
  assert.deepEqual(preview.gate, []);
  assert.equal(preview.ownStepNotes[0].prints, true);
});

test('the step is saved with the SWMS and its revisions, changed and removed like any step', async () => {
  const token = await signIn('revise@ownsteps.example', 'Revision Test Pty Ltd');
  const saved = await call('POST', '/api/swms', { token, body: checked({ input: { ...READY, ownSteps: [STEP] }, ...CONFIRM }) });
  assert.equal(saved.status, 201);
  const { swms } = await saved.json();
  const first = await (await call('GET', `/api/swms/${swms.id}`, { token })).json();
  assert.deepEqual(first.input.ownSteps, [STEP], 'kept with the SWMS as written');
  assert.ok(first.draft.jobSteps.some((step) => step.step === MARKED && step.own));
  // Changed: a new revision, and what changed is listed like any step's change.
  const changed = { ...STEP, controls: [...STEP.controls, 'A dry powder extinguisher is kept at the test point.'] };
  assert.equal((await call('PUT', `/api/swms/${swms.id}`, { token, body: checked({ input: { ...READY, ownSteps: [changed] }, ...CONFIRM }) })).status, 200);
  // Removed: the part needs its tick again, so the change without it is refused.
  assert.equal((await call('PUT', `/api/swms/${swms.id}`, { token, body: checked({ input: READY, ...CONFIRM }) })).status, 400);
  assert.equal((await call('PUT', `/api/swms/${swms.id}`, { token, body: checked({ input: { ...READY, notCoveredConfirmed: [PART] }, ...CONFIRM }) })).status, 200);
  const { revisions } = await (await call('GET', `/api/swms/${swms.id}/revisions`, { token })).json();
  assert.deepEqual(revisions.map((item) => item.revision), [3, 2, 1]);
  assert.deepEqual(revisions[1].changes, [`${MARKED}: Control added: A dry powder extinguisher is kept at the test point.`]);
  assert.ok(revisions[0].changes.includes(`Job step removed: ${MARKED}`), revisions[0].changes.join(' | '));
  // Each revision prints as it was saved.
  const two = await (await call('GET', `/api/swms/${swms.id}/revisions/2`, { token })).json();
  assert.ok(two.draft.jobSteps.find((step) => step.step === MARKED).controls.includes('A dry powder extinguisher is kept at the test point.'));
  const docx = await call('GET', `/api/swms/${swms.id}/docx?revision=2`, { token });
  assert.equal(docx.status, 200);
  assert.ok((await wordText(Buffer.from(await docx.arrayBuffer()))).includes('A dry powder extinguisher is kept at the test point.'));
  const now = await call('GET', `/api/swms/${swms.id}/pdf`, { token });
  assert.equal(now.status, 200);
  assert.ok(!pdfText(Buffer.from(await now.arrayBuffer())).includes('(Our own step)'), 'the current revision has no step of the user\'s own');
});

// ---- What SiteWrite keeps ----

test('industry data keeps no step the user wrote, and the sign-on questions do not ask it by name', () => {
  const d = draft({ ownSteps: [STEP] });
  const record = recordFor(d, { ...GENERATOR, workplace: '1 Test Street, Milton QLD 4064' }, { id: 'c1' });
  assert.ok(record.steps.length > 0);
  assert.ok(!record.steps.some((name) => /Leak test|Our own step/.test(name)));
  const pool = questionPool('swms-1', d);
  assert.ok(!pool.steps.some((item) => item.kind === 'step' && /Our own step/.test(item.correct)), 'a step question would give the answer away by its mark');
});

test('a wrong answer about a control the user wrote keeps neither the step\'s name nor the line', async () => {
  process.env.CONTROL_LEARNING = 'on';
  try {
    const d = draft({ ownSteps: [STEP] });
    const question = { id: 'q1', kind: 'control', step: MARKED, options: ['A library decoy line.', STEP.controls[0]], answer: 1 };
    const count = await recordFailedQuestions([question], { q1: 0 }, { draft: d, input: GENERATOR, company: { id: 'c1' }, now: new Date('2026-10-11T00:00:00Z') });
    assert.equal(count, 1);
    const [row] = await db.query("SELECT step, item, chosen FROM check_question_misses WHERE chosen = 'A library decoy line.'");
    assert.deepEqual([row.step, row.item], ['(a step made from the task)', '(a line the user wrote)']);
  } finally {
    delete process.env.CONTROL_LEARNING;
  }
});

const ownRows = (key) => (key ? db.query('SELECT * FROM own_step_events WHERE swms_key = $1 ORDER BY revision', [key]) : db.query('SELECT * FROM own_step_events'));

test('with CONTROL_LEARNING off, nothing is recorded', async () => {
  delete process.env.CONTROL_LEARNING;
  const before = (await ownRows()).length;
  const token = await signIn('off@ownsteps.example', 'Learning Off Pty Ltd');
  assert.equal((await call('POST', '/api/swms', { token, body: checked({ input: { ...READY, ownSteps: [STEP] }, ...CONFIRM }) })).status, 201);
  assert.equal((await call('POST', '/api/draft.docx', { token, body: checked({ ...READY, ...CONFIRM, ownSteps: [STEP] }) })).status, 200);
  assert.equal((await ownRows()).length, before);
});

test('with CONTROL_LEARNING on, each saved revision\'s steps are recorded once, de-identified, with whether they were kept', async () => {
  process.env.CONTROL_LEARNING = 'on';
  try {
    const token = await signIn('dave.okafor@harbourline.example', 'Harbourline Constructions Pty Ltd');
    const site = await (await call('POST', '/api/sites', { token, body: { name: 'Kestrel Point Apartments', workplace: '18 Wattlebird Lane, Toowong QLD 4066', principalContractor: 'Brookvale Building Group' } })).json();
    const named = {
      part: PART,
      name: 'Leak test the fuel line at kestrel point',
      hazards: ['Diesel sprays from a joint under test pressure.'],
      controls: ['dave okafor isolates the day tank before the test.', 'Brookvale permit signed. Call 0412 345 678 first.'],
      who: 'Dave Okafor (Harbourline)',
    };
    const input = { ...READY, workplace: '18 Wattlebird Lane, Toowong QLD 4066', principalContractor: 'Brookvale Building Group', ownSteps: [named] };
    const saved = await call('POST', '/api/swms', { token, body: checked({ input, siteId: site.site.id, ...CONFIRM }) });
    assert.equal(saved.status, 201);
    const { swms } = await saved.json();
    // A download of the same revision records nothing more.
    assert.equal((await call('POST', '/api/draft.docx', { token, body: checked({ ...input, ...CONFIRM, swmsId: swms.id }) })).status, 200);
    const [row, ...more] = await db.query("SELECT * FROM own_step_events WHERE part = 'leak test the fuel line' AND step LIKE '%[site]%'");
    assert.equal(more.length, 0, 'once for the revision');
    assert.deepEqual([row.revision, row.state, row.trade, row.month.length], [1, 'qld', 'electrical', 7]);
    assert.equal(row.part_key, gapKey(PART));
    assert.equal(row.step, 'Leak test the fuel line at [site]');
    assert.deepEqual(JSON.parse(row.controls), ['[name] isolates the day tank before the test.', '[name] permit signed. Call [phone] first.']);
    assert.equal(row.who, '[name] ([name])');
    assert.doesNotMatch(JSON.stringify(await ownRows(row.swms_key)), /harbourline|brookvale|kestrel|toowong|wattlebird|dave|okafor|0412/i);
    assert.doesNotMatch(row.swms_key, new RegExp(swms.id), 'the SWMS is known only by a keyed fingerprint');
    // The next revision marks the step kept when a step is still written for the same work.
    const next = { ...input, ownSteps: [{ ...named, controls: [...named.controls, 'Drip trays sit under every joint.'] }] };
    assert.equal((await call('PUT', `/api/swms/${swms.id}`, { token, body: checked({ input: next, ...CONFIRM }) })).status, 200);
    const rows = await ownRows(row.swms_key);
    assert.deepEqual(rows.map((item) => [item.revision, item.kept]), [[1, true], [2, null]]);
    // An opted-out business is left out.
    const other = await signIn('optout@ownsteps.example', 'Opt Out Pty Ltd');
    const user = await db.one('SELECT company_id FROM users WHERE email = $1', ['optout@ownsteps.example']);
    await db.query('UPDATE companies SET industry_opt_out = TRUE WHERE id = $1', [user.company_id]);
    const count = (await ownRows()).length;
    assert.equal((await call('POST', '/api/swms', { token: other, body: checked({ input: { ...READY, ownSteps: [STEP] }, ...CONFIRM }) })).status, 201);
    assert.equal((await ownRows()).length, count);
  } finally {
    delete process.env.CONTROL_LEARNING;
  }
});

test('the grouping key takes the same work typed a little differently as one', () => {
  assert.equal(gapKey('Jack and skate the transformer into the plant room'), gapKey('jack & skate transformers to plant room'));
  assert.notEqual(gapKey('Jack and skate the transformer into the plant room'), gapKey('Erect the tower crane'));
});

// ---- The monthly report ----

test('the monthly report lists the work users wrote steps for, counted by different saved SWMS', async () => {
  process.env.CONTROL_LEARNING = 'on';
  try {
    const seed = (swms, revision, month, part, step) => db.query(`INSERT INTO own_step_events (id, swms_key, revision, month, state, trade, part, part_key, step, hazards, controls, who, step_key, created_at)
      VALUES ($1, $2, $3, $4, 'qld', '', $5, $6, $7, '[]', '[]', '', $8, $9)`, [`seed-${swms}-${revision}-${part}`, `report-${swms}`, revision, month, part, gapKey(part), step, `${swms}${revision}`, new Date(`${month}-15T00:00:00Z`)]);
    // One SWMS saved three times counts once; four SWMS for the transformer, two for the tower crane.
    for (const revision of [1, 2, 3]) await seed('a', revision, '2026-09', 'jack and skate the transformer into the plant room', 'Jack and skate the transformer');
    await seed('b', 1, '2026-09', 'Jack and skate the transformer into the plant room', 'Jack and skate the transformer');
    await seed('c', 1, '2026-10', 'jack & skate transformers to plant room', 'Skate the transformer in');
    await seed('d', 1, '2026-10', 'jack and skate the transformer into the plant room', 'Jack and skate the transformer');
    await seed('e', 1, '2026-10', 'erect the tower crane', 'Erect the tower crane');
    await seed('f', 1, '2026-11', 'erect the tower crane', 'Erect the tower crane');
    // A step written for work the warning did not name is listed by its own name.
    const loose = 'Jack the chiller onto its plinth';
    await db.query(`INSERT INTO own_step_events (id, swms_key, revision, month, part, part_key, step, step_key, created_at) VALUES ('seed-loose', 'report-g', 1, '2026-10', '', $1, $2, 'g1', $3)`, [gapKey(loose), loose, new Date('2026-10-15T00:00:00Z')]);
    const report = await monthlyReport({ month: '2026-10', now: new Date('2026-11-20T00:00:00Z') });
    const items = report.ownSteps.items.filter((item) => /transformer|tower crane/.test(item.part));
    assert.deepEqual(items.map((item) => [item.part, item.step, item.swms, item.swmsThisMonth]), [
      ['jack and skate the transformer into the plant room', 'Jack and skate the transformer', 4, 2],
      ['erect the tower crane', 'Erect the tower crane', 1, 1],
    ]);
    assert.ok(report.ownSteps.items.some((item) => item.part === 'Jack the chiller onto its plinth' && item.swms === 1));
    const text = reportMarkdown(report);
    assert.match(text, /## Steps users wrote for work SiteWrite does not cover/);
    assert.match(text, /\| jack and skate the transformer into the plant room \| Jack and skate the transformer \| 4 \| 2 \| /);
    assert.match(report.method.join(' '), /not counted in the edit rate/);
    // The owner's page has it too.
    const token = await signIn('owner@ownsteps.example', 'SiteWrite');
    const page = await (await call('GET', '/api/admin/control-learning/report?month=2026-10', { token })).json();
    assert.ok(page.ownSteps.items.some((item) => item.part === 'erect the tower crane'));
    const file = await (await call('GET', '/api/admin/control-learning/report.md?month=2026-10', { token })).text();
    assert.match(file, /Steps users wrote for work SiteWrite does not cover/);
  } finally {
    delete process.env.CONTROL_LEARNING;
  }
});

// ---- The page ----

const PAGE_DRAFT = {
  kind: 'draft', state: 'Queensland', task: GENERATOR.task, highRisk: [], controls: [], site: [], ppe: [], references: [], sources: { legislation: [], codes: [] },
  jobSteps: [
    { step: 'Install the generators', hazards: ['Crush.'], controls: ['The generator is lifted by crane.'], responsible: 'Supervisor' },
    { step: MARKED, hazards: STEP.hazards, controls: STEP.controls, responsible: 'Plumber', own: true },
    { step: 'Finish and clean up', hazards: ['Trips.'], controls: ['Clean up.'], responsible: 'Supervisor' },
  ],
  notCovered: [PART, 'hang the artwork'],
  notCoveredWritten: [PART],
  ownStepNotes: [{ name: STEP.name, part: PART, prints: true, notes: ['The wording is vague: "Take care.".'] }],
};

test('the page offers a step for each part, asks which SWMS covers only the rest, and shows the step with its own tools', async () => {
  const p = loadPage(['app.js'], () => ({ body: {} }));
  await settle();
  p.run(`ownSteps = ${JSON.stringify([STEP])}`);
  const block = p.run(`notCoveredBlock(${JSON.stringify(PAGE_DRAFT)})`);
  // The top line names only the work still to deal with: the part with your own step is done (messy round 3).
  assert.match(block, /SiteWrite has no job steps for: hang the artwork\. Write your own step for it, say which step in this SWMS covers it, or say which SWMS covers it\./);
  assert.match(block, /You must enter the specific steps for this work yourself: SiteWrite cannot write them for you\./);
  assert.match(block, /Done: your step "Leak test the fuel line" is in the job steps below\.<\/span> <button type="button" class="link" data-own-change="Leak test the fuel line">Change your step<\/button>/);
  assert.match(block, /<button type="button" class="small" data-own-write="1">Write a step for this<\/button>/);
  assert.ok(!block.includes('data-cover-name="0"') && block.includes('data-cover-name="1"'), 'only the part with no step asks which SWMS covers it');
  // Named as covered by another SWMS, nothing is outstanding.
  assert.equal(p.run(`shownChecks = []; outstanding(${JSON.stringify(PAGE_DRAFT)}).length`), 1);
  assert.equal(p.run(`coverElsewhere = { 'hang the artwork': 'Artwork hanging SWMS' }; syncCoverTicked(); outstanding(${JSON.stringify(PAGE_DRAFT)}).length`), 0);
  // With every part written, nothing asks which SWMS covers it, and the box says each one is dealt with.
  const done = p.run(`notCoveredBlock(${JSON.stringify({ ...PAGE_DRAFT, notCovered: [PART] })})`);
  assert.doesNotMatch(done, /data-cover-name|data-cover-where/);
  assert.match(done, /^<div class="note not-covered"><p>Each piece of work SiteWrite has no job steps for is dealt with\.<\/p>/);
  const html = p.window.SiteWrite.render(PAGE_DRAFT, { movable: true });
  const row = html.split('data-step-row=')[2];
  assert.match(row, /^"1" data-own-row="Leak test the fuel line" class="own-step">/);
  assert.match(row, /id="own-step-1" data-own-change="Leak test the fuel line">Change your step<\/button><button type="button" class="link" data-own-remove="Leak test the fuel line">Remove your step<\/button>/);
  assert.match(row, /data-move="-1" data-index="1"/);
  assert.match(row, /<p class="warning ctl-warn">The wording is vague: &quot;Take care\.&quot;\.<\/p>/);
  assert.doesNotMatch(row, /data-ctl=|data-hz=|data-who=/, 'its lines are changed in its own form');
  // Read-only, the step is a step like any other.
  assert.doesNotMatch(p.window.SiteWrite.render(PAGE_DRAFT), /data-own|ctl-warn/);
  // What is sent with the draft, and what a new SWMS starts without.
  assert.deepEqual(JSON.parse(p.run('JSON.stringify(payload().ownSteps)')), [STEP]);
  p.run('newSwms()');
  assert.equal(p.run('payload().ownSteps'), undefined);
});
