// The designs a SWMS relies on (owner, 11 October 2026: "yes, the reference number and attachment
// first"). Where a printed job step is done to an engineer's or temporary works design, the page asks
// once for each design: what it is, who prepared it, its number, revision and date, and the file if
// the user has it. The reference prints in the steps that rely on it and in a table near the top; a
// design "Not issued yet" prints as a hold point; "Not needed for this work" is the user's recorded
// choice. The download waits for each one. The file is kept with the saved revision, for the
// business's signed-in users only, and goes with the SWMS and the business. The builder check marks
// down a step done to a design that does not name it (W16).
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const JSZip = require('jszip');
const { app } = require('../server');
const db = require('../db');
const { prepareDraft, questionsFor } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { downloadGaps, gateMessage } = require('../download-gate');
const { checkSwms, fromDraft } = require('../builder-check');
const { draftToDocx } = require('../docx-draft');
const { draftToPdf } = require('../pdf-draft');
const { validAbn, removeExpired } = require('../accounts');
const designs = require('../designs');
const designFiles = require('../design-files');
const { contentHash, changesBetween, changeText } = require('../revisions');
const { designNeed } = require('../public/gate-rules');
const { setupAccounts, lastLinkToken, ANSWERED, ready, checked } = require('./helpers');

const SHORING = 'Staged basement excavation with ground anchors, shoring wall and temporary props, excavated by 20 t excavator.';
const SCAFFOLD = 'Erect a perimeter scaffold to a three storey building.';
const PLAIN = 'Install sprinkler pipework in the ward ceilings from scissor lifts more than 2 m above the floor.';
const GIVEN = { id: 'shoring', what: 'Shoring design', status: 'given', by: 'Smith Engineering', number: 'ABC-S-101', revision: 'Rev C', date: '2026-10-03' };
const LINE = 'Work to the shoring design ABC-S-101 rev C (Smith Engineering, 3 October 2026).';
const HOLD = 'Hold point: the scaffold design is not issued yet. Do not start this step until the design is issued and this SWMS is updated.';

// The task's questions answered with the first standard answer, as a user taking the offered answer would.
function answered(input) {
  const facts = { ...(input.facts || {}) };
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor({ ...input, facts });
    let added = false;
    for (const item of asked.required || []) {
      if (facts[item.id]) continue;
      facts[item.id] = item.id === 'liveElectrical' ? 'no' : item.choices ? item.choices[0].value : ((answersFor(item.id, asked.task)[0] || {}).text || `As set out in the site plan: ${item.label}.`).replace(/_{3,}/g, 'as on the plan');
      added = true;
    }
    if (!added) break;
  }
  return { ...input, facts };
}
const base = (task, extra = {}) => answered({ ...ANSWERED, state: 'qld', fallRisk: task === SCAFFOLD ? 'yes' : 'no', residential: 'no', task, date: '11 October 2026', ...extra });
const draft = (task, extra = {}) => prepareDraft(draftBody({ ...base(task), ...extra }));
const stepsWith = (d, text) => d.jobSteps.filter((step) => step.controls.includes(text)).map((step) => step.step);

// ---- Which steps rely on a design ----

test('only a SWMS with a step done to a design asks for one: a plain SWMS has no designs and prints as before', () => {
  const plain = draft(PLAIN);
  assert.equal(plain.kind, 'draft');
  assert.equal('designs' in plain, false);
  assert.equal(designs.withDesigns(plain, {}), plain, 'nothing is added to a SWMS with no design step');
  // Answers for designs it does not rely on change nothing in what prints.
  const answeredAnyway = draft(PLAIN, { designs: [GIVEN] });
  assert.equal(contentHash(answeredAnyway), contentHash(plain));
  assert.equal('designs' in answeredAnyway, false);
  const shoring = draft(SHORING);
  assert.deepEqual(shoring.designs.map((row) => [row.id, row.what, row.status, row.needed]), [['shoring', 'Shoring design', '', true]]);
  assert.deepEqual(shoring.designs[0].steps, ['Install and later remove ground anchors', 'Stress the ground anchors', 'Install and later remove props']);
  assert.equal(shoring.designs[0].statusText, 'Not given yet.');
  // Unanswered, the step lines are as the library words them: the download waits for the answer.
  assert.ok(!shoring.jobSteps.some((step) => step.controls.some((line) => /^Work to the|^Hold point/.test(line))));
  assert.deepEqual(draft(SCAFFOLD).designs.map((row) => row.id), ['scaffold']);
});

test('the design list covers the work the owner named: anchors, props and shoring, underpinning, demolition, scaffolds, mast climbers, formwork, propping, precast bracing, crane bases', () => {
  const ids = (task, extra) => (draft(task, extra).designs || []).map((row) => row.id);
  assert.ok(ids('Underpin the existing footings of the neighbouring building in pits, dug by hand in a hit and miss sequence.').includes('underpinning'));
  assert.ok(ids('Form, reinforce and pour the suspended slab on level 2, with falsework, backprops and edge protection.').includes('formwork'));
  assert.ok(ids('Install temporary propping under the existing beam, then remove the load-bearing wall below it.').includes('propping'));
  assert.ok(ids('Stand and brace the precast concrete wall panels with the mobile crane, then grout the bases.').includes('precast'));
  assert.ok(ids('Erect the tower crane on its base, then climb it as the building goes up.').includes('craneBase'));
  assert.deepEqual(ids('Clean the facade glazing from a swing stage hung from the roof.'), ['suspended']);
  // A mast climber has no job steps in the library yet (it is work SiteWrite does not cover), so
  // there is no step to name its design in: the user adds it with Add another design.
  assert.deepEqual(ids('Install the facade panels from a mast climbing work platform.'), []);
  assert.equal(designs.designsNeeded({ task: 'Work from the mast climber.', jobSteps: [{ step: 'Work from a swing stage', controls: ['Needles are fixed to an engineer-certified detail and positively restrained.'] }] })[0].label, 'Mast climber design');
  // Each kind is matched only by lines that require the design: a line that applies only "where"
  // something is so does not ask for a design.
  for (const kind of designs.KINDS) for (const pattern of kind.lines) assert.ok(!pattern.test('Where the house is raised, the engineer is consulted.') || kind.id === 'propping', kind.id);
});

// ---- Printing ----

test('the reference prints in each step that relies on the design and in the table near the top, in Word and PDF', async () => {
  const d = draft(SHORING, { designs: [{ ...GIVEN, file: { id: 'df_abcdefghijklmnopqrstu', name: 'ABC-S-101.pdf', type: 'application/pdf', size: 2048 } }] });
  assert.deepEqual(stepsWith(d, LINE), d.designs[0].steps);
  assert.equal(d.designs[0].reference, 'ABC-S-101 rev C (Smith Engineering, 3 October 2026)');
  assert.match(d.designs[0].statusText, /^Issued\. A copy is attached to this SWMS in SiteWrite \(ABC-S-101\.pdf\)\.$/);
  // Only the reference is added: every other line is as it was, in the same order.
  const before = draft(SHORING);
  d.jobSteps.forEach((step, i) => assert.deepEqual(step.controls.filter((line) => line !== LINE), before.jobSteps[i].controls, step.step));
  const zip = await JSZip.loadAsync(Buffer.from(await draftToDocx(d, {})));
  const word = (await zip.file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.ok(word.includes('Designs this SWMS relies on'));
  assert.ok(word.includes(LINE));
  assert.ok(word.includes('Smith Engineering') && word.includes('ABC-S-101 rev C') && word.includes('3 October 2026'));
  assert.ok(word.includes('A copy is attached to this SWMS in SiteWrite'));
  assert.ok(word.indexOf('Designs this SWMS relies on') < word.indexOf('Job steps'), 'the table is near the top, before the job steps');
  const pdf = await draftToPdf(d, {});
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  // A plain SWMS prints no table.
  const plainZip = await JSZip.loadAsync(Buffer.from(await draftToDocx(draft(PLAIN), {})));
  assert.ok(!(await plainZip.file('word/document.xml').async('string')).includes('Designs this SWMS relies on'));
});

test('"Not issued yet" prints a hold point first in each step that relies on the design, in bold in Word', async () => {
  const d = draft(SCAFFOLD, { designs: [{ id: 'scaffold', what: 'Scaffold design', status: 'notIssued' }] });
  const held = d.jobSteps.filter((step) => step.controls.includes(HOLD));
  assert.deepEqual(held.map((step) => step.step), ['Set up and protect the area below', 'Erect the scaffold']);
  for (const step of held) assert.equal(step.controls[0], HOLD);
  assert.match(d.designs[0].statusText, /^Not issued yet\. Hold point/);
  const zip = await JSZip.loadAsync(Buffer.from(await draftToDocx(d, {})));
  const xml = await zip.file('word/document.xml').async('string');
  const at = xml.indexOf('Hold point: the scaffold design');
  assert.ok(at > 0);
  assert.match(xml.slice(xml.lastIndexOf('<w:r>', at), at), /<w:b\/>/, 'the hold point is bold');
  // The gate takes it as an answer.
  assert.deepEqual(downloadGaps(base(SCAFFOLD, { designs: [{ id: 'scaffold', what: 'Scaffold design', status: 'notIssued' }] }), d).filter((gap) => gap.kind === 'design'), []);
});

test('"Not needed for this work" is recorded as the user\'s choice: the steps stay as worded and the table says so', () => {
  const d = draft(SHORING, { designs: [{ id: 'shoring', what: 'Shoring design', status: 'notNeeded' }] });
  assert.deepEqual(d.jobSteps.map((step) => step.controls), draft(SHORING).jobSteps.map((step) => step.controls));
  assert.match(d.designs[0].statusText, /^Not needed for this work \(the business's choice when preparing this SWMS\)\.$/);
  assert.deepEqual(designs.tableRows(d)[0].slice(0, 4), ['Shoring design', '', '', '']);
});

// ---- The gate ----

test('the download waits for each design: details, Not issued yet or Not needed; the refusal names it', () => {
  const gaps = (extra) => downloadGaps(base(SHORING, extra), draft(SHORING, extra)).filter((gap) => gap.kind === 'design');
  const open = gaps({});
  assert.deepEqual(open.map((gap) => [gap.id, gap.field, gap.label]), [['design.shoring', 'design-shoring', 'Design: Shoring design']]);
  assert.match(open[0].need, /^Say whether Shoring design is issued: give its details, choose Not issued yet, or say it is not needed for this work\.$/);
  assert.match(gateMessage(downloadGaps(base(SHORING), draft(SHORING))), /the designs it relies on are named/);
  // Given, it needs who prepared it, the number and the date; the revision and the file are optional.
  assert.match(gaps({ designs: [{ id: 'shoring', what: 'Shoring design', status: 'given', number: 'ABC-S-101' }] })[0].need, /^For Shoring design, give who prepared it and its date\.$/);
  assert.match(gaps({ designs: [{ ...GIVEN, number: 'TBC' }] })[0].need, /its document or drawing number/);
  assert.match(gaps({ designs: [{ ...GIVEN, by: '____' }] })[0].need, /who prepared it/);
  assert.deepEqual(gaps({ designs: [{ ...GIVEN, revision: '' }] }), []);
  assert.deepEqual(gaps({ designs: [GIVEN] }), []);
  assert.deepEqual(gaps({ designs: [{ id: 'shoring', status: 'notNeeded' }] }), []);
  // The page judges a card by the same rule as the server.
  assert.equal(designNeed({ ...GIVEN }), '');
  assert.match(designNeed({ id: 'x', what: 'Formwork design', status: 'given', by: 'Acme' }), /^For Formwork design, give its document or drawing number and its date\.$/);
  // A design the user added is asked about once named, and prints in the table only.
  const added = draft(SHORING, { designs: [GIVEN, { id: 'added-1', what: 'Geotechnical report', status: 'given', by: 'Rock Labs', number: 'GR-22', date: '2026-09-01' }] });
  assert.deepEqual(added.designs.map((row) => [row.id, row.needed, row.steps.length]), [['shoring', true, 3], ['added-1', false, 0]]);
  assert.ok(!added.jobSteps.some((step) => step.controls.some((line) => /GR-22/.test(line))));
});

// ---- The builder check (W16) ----

test('the builder check marks down a step done to a design that does not name it (W16), and not a hold point\'s order', () => {
  const w16 = (d) => checkSwms(fromDraft(d, { state: 'qld', swms: { signatures: [{ name: 'Jo Smith', date: '11 October 2026' }] } }), { state: 'qld' }).findings.find((item) => item.rule === 'W16');
  const open = w16(draft(SHORING));
  assert.equal(open.points, 0);
  assert.equal(open.max, 3);
  assert.match(open.message, /^Name the design each step is done to, with its document or drawing number, revision and who prepared it: Install and later remove ground anchors \(Shoring design\)/);
  assert.equal(w16(draft(SHORING, { designs: [GIVEN] })).points, 3);
  const held = w16(draft(SCAFFOLD, { designs: [{ id: 'scaffold', what: 'Scaffold design', status: 'notIssued' }] }));
  assert.equal(held.points, 0);
  assert.match(held.message, /These steps are on hold until their design is issued: Set up and protect the area below \(Scaffold design\)/);
  const skipped = w16(draft(SHORING, { designs: [{ id: 'shoring', what: 'Shoring design', status: 'notNeeded' }] }));
  assert.equal(skipped.points, 3);
  assert.match(skipped.message, /records Shoring design as not needed/);
  assert.equal(w16(draft(PLAIN)).points, 3);
  // The hold point goes first in its step, and is not judged for hierarchy order (W10).
  const scaffold = draft(SCAFFOLD, { designs: [{ id: 'scaffold', what: 'Scaffold design', status: 'notIssued' }] });
  const w10 = (d) => checkSwms(fromDraft(d, { state: 'qld' }), { state: 'qld' }).findings.find((item) => item.rule === 'W10').points;
  assert.equal(w10(scaffold), w10(draft(SCAFFOLD)));
  // A SWMS from elsewhere: a step "to the engineer's design" with no number loses its share.
  const form = (controls) => ({ state: 'qld', task: 'Install shoring', steps: [{ step: 'Install the shoring', hazards: ['Collapse.'], controls }, { step: 'Clean up', hazards: ['Trips.'], controls: ['Housekeeping each day.'] }] });
  const other = (controls) => checkSwms(form(controls), { state: 'qld' }).findings.find((item) => item.rule === 'W16');
  assert.equal(other(['Shoring is installed to the engineer\'s design.']).points, 0);
  assert.equal(other(['Shoring is installed to the engineer\'s design, drawing S-200 revision B.']).points, 3);
  assert.equal(other(['Where the trench is deeper than 1.5 m, it is shored to the engineer\'s design.']).points, 3, 'a line that applies only where something is so');
});

test('a design reference or hold point is never a sign-on check question, and the worker reads it in the step', () => {
  const { questionPool } = require('../sign-read');
  for (const d of [draft(SHORING, { designs: [GIVEN] }), draft(SCAFFOLD, { designs: [{ id: 'scaffold', what: 'Scaffold design', status: 'notIssued' }] })]) {
    const pool = questionPool('swms-1', d);
    assert.ok(pool.steps.length > 0);
    for (const item of [...pool.steps, ...pool.ppe]) for (const text of [item.correct, ...item.decoys]) assert.ok(!/^Work to the|^Hold point/.test(text), text);
  }
});

test('the page: a card for each design under the site questions, judged as typed, sent with the draft, shown in the draft', async () => {
  const { loadPage, settle } = require('./fake-dom');
  const p = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }));
  await settle();
  const shown = draft(SHORING).designs;
  p.run(`drawDesigns(${JSON.stringify(shown)})`);
  const html = p.document.getElementById('designs-block').innerHTML;
  assert.match(html, /<legend>Shoring design<\/legend>/);
  assert.match(html, /Used in: Install and later remove ground anchors; Stress the ground anchors; Install and later remove props\./);
  assert.match(html, /value="given" data-design-field="status"> I have it<\/label>.*value="notIssued" data-design-field="status"> Not issued yet<\/label>.*value="notNeeded" data-design-field="status"> Not needed for this work<\/label>/s);
  for (const label of ['What it is', 'Who prepared it', 'Document or drawing number', 'Revision', 'Date on the design', 'Attach the file']) assert.ok(html.includes(label), label);
  assert.match(html, /The file <span class="meta">\(optional\)<\/span>/);
  assert.match(html, /accept="\.pdf,\.png,\.jpg,\.jpeg,application\/pdf,image\/png,image\/jpeg"/);
  assert.match(html, /Do not start this step until the design is issued and this SWMS is updated\./);
  assert.equal(p.document.getElementById('designs-section').classList.contains('hidden'), false);
  // Sent with the draft as answered; the gate item is judged from the card as it is now.
  assert.deepEqual(JSON.parse(p.run('JSON.stringify(payload().designs)')), [{ id: 'shoring', what: 'Shoring design', status: '', by: '', number: '', revision: '', date: '' }]);
  const check = { kind: 'design', design: 'shoring', field: 'design-shoring', need: 'from the server' };
  p.run(`designRow('shoring').status = 'notIssued'`);
  assert.equal(p.run(`liveNeed(${JSON.stringify(check)})`), '');
  p.run(`Object.assign(designRow('shoring'), { status: 'given', by: 'Smith Engineering' })`);
  assert.equal(p.run(`liveNeed(${JSON.stringify(check)})`), 'For Shoring design, give its document or drawing number and its date.');
  // No design: no section, nothing sent.
  p.run('newSwms()');
  assert.equal(p.run('payload().designs'), undefined);
  assert.equal(p.document.getElementById('designs-section').classList.contains('hidden'), true);
  // In the draft: the table with a button to open the file, and the lines from the designs without
  // tools to change them there.
  const d = draft(SHORING, { designs: [{ ...GIVEN, file: { id: 'df_abcdefghijklmnopqrstu', name: 'ABC-S-101.pdf', type: 'application/pdf', size: 2048 } }] });
  const sheet = p.window.SiteWrite.render(d, { movable: true });
  assert.match(sheet, /<h4>Designs this SWMS relies on<\/h4>/);
  assert.match(sheet, /data-design-file-open="\/api\/designs\/files\/df_abcdefghijklmnopqrstu"/);
  assert.match(p.window.SiteWrite.render(d, { swmsId: 'swms-9' }), /data-design-file-open="\/api\/swms\/swms-9\/designs\/df_abcdefghijklmnopqrstu"/);
  assert.match(sheet, /class="design-line">Work to the shoring design ABC-S-101 rev C \(Smith Engineering, 3 October 2026\)\.<span class="meta"> From the designs this work relies on\. Change it there\.<\/span><\/li>/);
  assert.doesNotMatch(p.window.SiteWrite.render(draft(PLAIN), { movable: true }), /Designs this SWMS relies on|design-line/);
});

// ---- Files, accounts and storage ----

let server;
let baseUrl;
test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server && server.close());

const call = (method, route, { body, token, raw, headers = {} } = {}) => fetch(`${baseUrl}${route}`, {
  method,
  headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
  body: raw || (body ? JSON.stringify(body) : undefined),
});
const json = async (method, route, options) => {
  const response = await call(method, route, options);
  return { status: response.status, data: await response.json().catch(() => ({})) };
};
async function signIn(email) {
  await call('POST', '/api/auth/email', { body: { email } });
  return (await json('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).data.token;
}
let abnSeed = 0;
function nextAbn() {
  for (;;) {
    abnSeed += 1;
    const digits = crypto.createHash('sha256').update(`designs${abnSeed}`).digest('hex').replace(/\D/g, '').slice(0, 11);
    if (digits.length === 11 && digits[0] !== '0' && validAbn(digits)) return digits;
  }
}
async function business(key) {
  const token = await signIn(`admin@${key.toLowerCase()}-designs.example`);
  assert.equal((await json('PUT', '/api/company', { token, body: { name: `${key} Civil Pty Ltd`, abn: nextAbn() } })).status, 200);
  return token;
}
const pdf = (extra = '') => Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R ${extra}>> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x10, 0x00, 0x20, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9]);
const upload = (token, data, name, type = 'application/pdf') => json('POST', '/api/designs/files', { token, raw: data, headers: { 'Content-Type': type, 'X-File-Name': encodeURIComponent(name) } });
const CONFIRM = { reviewConfirmed: true, reviewedBy: 'Pat Subbie' };
const saveInput = (designRows) => ready(base(SHORING, { designs: designRows }));

test('uploads: PDF, PNG and JPEG only, read from the content not the name, up to 10 MB, signed in', async () => {
  const token = await business('Upload');
  const ok = await upload(token, pdf(), 'ABC-S-101 rev C.pdf');
  assert.equal(ok.status, 201);
  assert.match(ok.data.file.id, /^df_[A-Za-z0-9_-]{20,}$/);
  assert.deepEqual([ok.data.file.name, ok.data.file.type, ok.data.file.size], ['ABC-S-101 rev C.pdf', 'application/pdf', pdf().length]);
  assert.equal((await upload(token, PNG, 'photo.png', 'image/png')).data.file.type, 'image/png');
  assert.equal((await upload(token, JPEG, 'photo.jpg', 'image/jpeg')).data.file.type, 'image/jpeg');
  // The type is read from the bytes: a PNG named .pdf is kept as a PNG, with its name made to match.
  const renamed = await upload(token, PNG, 'drawing.pdf', 'application/pdf');
  assert.deepEqual([renamed.data.file.type, renamed.data.file.name], ['image/png', 'drawing.png']);
  // Not a PDF, PNG or JPEG, whatever its name and type say.
  for (const [data, name] of [[Buffer.from('MZ\x90\x00 this is a program'), 'shoring.pdf'], [Buffer.from('<html><script>alert(1)</script></html>'), 'shoring.png'], [Buffer.from('%PDF-1.4 cut short'), 'short.pdf'], [Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'bad.png']]) {
    const refused = await upload(token, data, name);
    assert.equal(refused.status, 415, name);
    assert.match(refused.data.message, /not a PDF, PNG or JPEG/);
  }
  // A PDF that runs or opens something is refused.
  for (const action of ['/OpenAction << /S /JavaScript /JS (app.alert(1)) >>', '/AA << /O << /S /Launch /F (cmd.exe) >> >>', '/Names << /EmbeddedFiles 3 0 R >>']) {
    const refused = await upload(token, pdf(action), 'active.pdf');
    assert.equal(refused.status, 415, action);
    assert.match(refused.data.message, /scripts, actions or embedded files/);
  }
  // Empty, and over 10 MB.
  assert.equal((await upload(token, Buffer.alloc(0), 'empty.pdf')).status, 400);
  const big = Buffer.concat([pdf(), Buffer.alloc(designFiles.MAX_BYTES)]);
  assert.equal((await upload(token, big, 'big.pdf')).status, 413);
  assert.throws(() => designFiles.checkFile(Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(designFiles.MAX_BYTES), Buffer.from('%%EOF')])), /larger than 10 MB/);
  // Signed out: no upload.
  assert.equal((await upload('', pdf(), 'x.pdf')).status, 401);
  assert.equal((await json('GET', '/api/config')).data.designFiles.maxMb, 10);
});

test('a saved SWMS keeps its file with each revision; only the business\'s signed-in users can open it', async () => {
  const token = await business('Alpha');
  const other = await business('Bravo');
  const first = (await upload(token, pdf('/Title (rev C)'), 'ABC-S-101 rev C.pdf')).data.file;
  const saved = await json('POST', '/api/swms', { token, body: checked({ input: saveInput([{ ...GIVEN, file: first }]), ...CONFIRM }) });
  assert.equal(saved.status, 201);
  const id = saved.data.swms.id;
  const view = (await json('GET', `/api/swms/${id}`, { token })).data;
  assert.deepEqual(view.draft.designs[0].file, first);
  assert.ok(stepsWith(view.draft, LINE).length === 3);
  const route = `/api/swms/${id}/designs/${first.id}`;
  const got = await call('GET', route, { token });
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-type'), 'application/pdf');
  assert.equal(got.headers.get('x-content-type-options'), 'nosniff');
  assert.match(got.headers.get('cache-control'), /no-store/);
  assert.match(got.headers.get('content-disposition'), /^inline; filename="ABC-S-101 rev C\.pdf"/);
  assert.deepEqual(Buffer.from(await got.arrayBuffer()), pdf('/Title (rev C)'));
  // No public link: signed out it is refused, and another business cannot have it by either route.
  assert.equal((await call('GET', route)).status, 401);
  assert.equal((await call('GET', route, { token: other })).status, 404);
  assert.equal((await call('GET', `/api/designs/files/${first.id}`, { token: other })).status, 404);
  // Another business's SWMS cannot be used to reach it, nor can its own SWMS name a file it does not hold.
  const theirs = await json('POST', '/api/swms', { token: other, body: checked({ input: saveInput([{ ...GIVEN, file: first }]), ...CONFIRM }) });
  assert.equal(theirs.status, 400);
  assert.match(theirs.data.message, /The file attached to Shoring design is no longer held/);
  // Revision 2 with a new revision of the design: both files stay, each with its revision.
  const second = (await upload(token, pdf('/Title (rev D)'), 'ABC-S-101 rev D.pdf')).data.file;
  const revised = await json('PUT', `/api/swms/${id}`, { token, body: checked({ input: saveInput([{ ...GIVEN, revision: 'D', file: second }]), ...CONFIRM, reason: 'Shoring design revision D' }) });
  assert.equal(revised.status, 200);
  assert.equal(revised.data.swms.revision, 2);
  assert.equal((await call('GET', route, { token })).status, 200, 'revision 1\'s file is kept');
  assert.equal((await call('GET', `/api/swms/${id}/designs/${second.id}`, { token })).status, 200);
  const history = (await json('GET', `/api/swms/${id}/revisions`, { token })).data.revisions;
  assert.ok(history[0].changes.some((line) => /Work to the shoring design ABC-S-101 rev D/.test(line)), JSON.stringify(history[0].changes));
  assert.ok(history[0].changes.some((line) => /^Design added: Shoring design: ABC-S-101 rev D/.test(line)));
  const word1 = await call('GET', `/api/swms/${id}/docx?revision=1`, { token });
  const zip1 = await JSZip.loadAsync(Buffer.from(await word1.arrayBuffer()));
  assert.ok((await zip1.file('word/document.xml').async('string')).includes('ABC-S-101 rev C'), 'revision 1 prints as it was saved');
  // Export all: each file once, named by the revisions that use it.
  const exported = await call('GET', '/api/swms/export.zip', { token });
  const zip = await JSZip.loadAsync(Buffer.from(await exported.arrayBuffer()));
  const names = Object.keys(zip.files).filter((name) => name.startsWith('Design files/') && !name.endsWith('/'));
  assert.equal(names.length, 2, Object.keys(zip.files).join(' | '));
  assert.ok(names.some((name) => /revision 1 - ABC-S-101 rev C\.pdf$/.test(name)));
  assert.ok(names.some((name) => /revision 2 - ABC-S-101 rev D\.pdf$/.test(name)));
  assert.deepEqual(await zip.file(names.find((name) => /rev C/.test(name))).async('nodebuffer'), pdf('/Title (rev C)'));
  const otherExport = await call('GET', '/api/swms/export.zip', { token: other });
  assert.equal(otherExport.status, 404, 'the other business has no saved SWMS and none of these files');
});

test('files go with the SWMS: 30 days after it is deleted, and unsaved uploads after 7 days; a copy keeps its own', async () => {
  const token = await business('Charlie');
  const file = (await upload(token, pdf('/Title (C)'), 'C.pdf')).data.file;
  const saved = (await json('POST', '/api/swms', { token, body: checked({ input: saveInput([{ ...GIVEN, file }]), ...CONFIRM }) })).data.swms;
  const copied = await json('POST', `/api/swms/${saved.id}/copy`, { token, body: checked(CONFIRM, saveInput([{ ...GIVEN, file }])) });
  assert.equal(copied.status, 201, JSON.stringify(copied.data));
  const copy = copied.data.swms;
  const lone = (await upload(token, pdf('/Title (lone)'), 'lone.pdf')).data.file;
  const fileRows = async (id) => (await db.query('SELECT id FROM design_files WHERE id = $1', [id])).length;
  const dataRows = async (id) => (await db.query('SELECT file_id FROM design_file_data WHERE file_id = $1', [id])).length;
  // Deleted: hidden at once, removed after 30 days, the file kept while the copy names it.
  assert.equal((await json('DELETE', `/api/swms/${saved.id}`, { token })).status, 200);
  assert.equal((await call('GET', `/api/swms/${saved.id}/designs/${file.id}`, { token })).status, 404);
  await db.query('UPDATE swms SET updated_at = $1 WHERE id = $2', [new Date(Date.now() - 31 * 24 * 60 * 60 * 1000), saved.id]);
  await removeExpired(new Date());
  assert.equal((await db.query('SELECT file_id FROM design_file_uses WHERE swms_id = $1', [saved.id])).length, 0);
  assert.equal(await fileRows(file.id), 1, 'the copy still names it');
  assert.equal((await call('GET', `/api/swms/${copy.id}/designs/${file.id}`, { token })).status, 200);
  // The copy deleted too: the file goes.
  await json('DELETE', `/api/swms/${copy.id}`, { token });
  // The file was uploaded more than 30 days ago, when the SWMS was saved.
  await db.query('UPDATE swms SET updated_at = $1 WHERE id = $2', [new Date(Date.now() - 31 * 24 * 60 * 60 * 1000), copy.id]);
  await db.query('UPDATE design_files SET created_at = $1 WHERE id = $2', [new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), file.id]);
  await removeExpired(new Date());
  assert.equal(await fileRows(file.id), 0);
  assert.equal(await dataRows(file.id), 0);
  // An upload never saved goes after 7 days, not before.
  await removeExpired(new Date(Date.now() + 6 * 24 * 60 * 60 * 1000));
  assert.equal(await fileRows(lone.id), 1);
  await removeExpired(new Date(Date.now() + 8 * 24 * 60 * 60 * 1000));
  assert.equal(await fileRows(lone.id), 0);
  assert.equal(await dataRows(lone.id), 0);
});

test('the gate refuses a download with a design unanswered, and the download prints the reference', async () => {
  const token = await business('Delta');
  const input = ready(base(SHORING, { designs: [{ id: 'shoring', what: 'Shoring design', status: '' }] }));
  const refused = await json('POST', '/api/draft.docx', { token, body: checked({ ...input, ...CONFIRM }) });
  assert.equal(refused.status, 400);
  assert.match(refused.data.message, /the designs it relies on are named and no blank is left in it\. Still to answer: Design: Shoring design/);
  const word = await call('POST', '/api/draft.docx', { token, body: checked({ ...ready(base(SHORING, { designs: [GIVEN] })), ...CONFIRM }) });
  assert.equal(word.status, 200);
  const zip = await JSZip.loadAsync(Buffer.from(await word.arrayBuffer()));
  assert.ok((await zip.file('word/document.xml').async('string')).includes(LINE));
  const sheet = await call('POST', '/api/draft.pdf', { token, body: checked({ ...ready(base(SCAFFOLD, { designs: [{ id: 'scaffold', what: 'Scaffold design', status: 'notIssued' }] })), ...CONFIRM }) });
  assert.equal(sheet.status, 200);
  // The questions page hears the designs as the draft would print them.
  const asked = await json('POST', '/api/draft/questions', { body: base(SHORING) });
  assert.deepEqual(asked.data.designs.map((row) => row.id), ['shoring']);
  assert.equal('designs' in (await json('POST', '/api/draft/questions', { body: base(PLAIN) })).data, false);
});

test('with the storage bucket set, files go to the bucket, signed, and come back and go from there', async () => {
  const keys = { DESIGN_FILES_BUCKET: 'sitewrite-files', DESIGN_FILES_BUCKET_KEY_ID: 'test-key-id', DESIGN_FILES_BUCKET_SECRET: 'test-secret-value', DESIGN_FILES_BUCKET_ENDPOINT: 'https://storage.example.test', DESIGN_FILES_BUCKET_REGION: 'auto' };
  Object.assign(process.env, keys);
  const store = new Map();
  const seen = [];
  designFiles.useBucketFetch(async (url, options) => {
    seen.push({ method: options.method, url, auth: options.headers.authorization });
    const key = new URL(url).pathname;
    if (options.method === 'PUT') { store.set(key, Buffer.from(options.body)); return new Response(null, { status: 200 }); }
    if (options.method === 'GET') return store.has(key) ? new Response(store.get(key), { status: 200 }) : new Response(null, { status: 404 });
    if (options.method === 'DELETE') { store.delete(key); return new Response(null, { status: 204 }); }
    return new Response(null, { status: 400 });
  });
  try {
    const token = await business('Echo');
    const file = (await upload(token, pdf('/Title (bucket)'), 'bucket.pdf')).data.file;
    assert.equal((await db.one('SELECT storage FROM design_files WHERE id = $1', [file.id])).storage, 'bucket');
    assert.equal((await db.query('SELECT file_id FROM design_file_data WHERE file_id = $1', [file.id])).length, 0, 'not in the database');
    assert.equal(seen[0].method, 'PUT');
    assert.equal(seen[0].url, `https://sitewrite-files.storage.example.test/design-files/${file.id}`);
    assert.match(seen[0].auth, /^AWS4-HMAC-SHA256 Credential=test-key-id\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    const back = await call('GET', `/api/designs/files/${file.id}`, { token });
    assert.deepEqual(Buffer.from(await back.arrayBuffer()), pdf('/Title (bucket)'));
    const company = (await db.one('SELECT company_id FROM design_files WHERE id = $1', [file.id])).company_id;
    await designFiles.removeForCompany(company);
    assert.equal(store.size, 0, 'deleting the business deletes its objects in the bucket');
  } finally {
    for (const key of Object.keys(keys)) delete process.env[key];
    designFiles.useBucketFetch(null);
  }
  // Production without the bucket takes no files, and says so; the reference still prints.
  process.env.NODE_ENV = 'production';
  try {
    assert.equal(designFiles.enabled(), false);
    assert.match(designFiles.storageProblem(), /DESIGN_FILES_BUCKET/);
    await assert.rejects(designFiles.saveUpload({ companyId: 'x', data: pdf(), name: 'a.pdf' }), /not switched on yet/);
  } finally {
    delete process.env.NODE_ENV;
  }
});
