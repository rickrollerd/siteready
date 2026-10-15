// A written method or sequence of works the work follows (owner, D224, 12 October 2026: "Need to be
// cautious with the add a design. You cannot read drawings, only words and good chance we could muck
// this up. If its a written methodology, or sequence of works. Yes, it should be an option."). Any
// SWMS may list one: what it is, who prepared it, its document number and revision, its date and the
// file. It is kept with the designs (kind "method") and prints in their table once given in full.
// Nothing from it goes into the steps on its own (a typed one can be read to suggest job steps the user
// accepts, method-read.test.js): the download never waits for it and the builder check does not count
// it. A SWMS that lists none is unchanged.
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
const { downloadGaps } = require('../download-gate');
const { checkSwms, fromDraft } = require('../builder-check');
const { draftToDocx } = require('../docx-draft');
const { draftToPdf } = require('../pdf-draft');
const { validAbn, removeExpired } = require('../accounts');
const designs = require('../designs');
const { changesBetween, changeText, contentHash } = require('../revisions');
const { methodNeed, sameDesignNumbers, designNeed } = require('../public/gate-rules');
const { loadPage, settle, FakeEvent } = require('./fake-dom');
const { setupAccounts, lastLinkToken, ANSWERED, ready, checked } = require('./helpers');

const PLAIN = 'Install cable tray in the plant room ceiling from an EWP.';
const SHORING = 'Staged basement excavation with ground anchors, shoring wall and temporary props, excavated by 20 t excavator.';
const JUMP = 'Operate the builders hoist and the jump lift for the builder while the building rises, and work inside the lift cars.';
const FILE = { id: 'df_abcdefghijklmnopqrstu', name: 'AL-MS-014 rev B.pdf', type: 'application/pdf', size: 4096 };
const METHOD = { id: 'method-1', what: 'Jump lift machine platform raising methodology', status: 'given', by: 'Acme Lifts Pty Ltd', number: 'AL-MS-014', revision: 'B', date: '2026-09-30' };
const SHORING_DESIGN = { id: 'shoring', what: 'Shoring design', status: 'given', by: 'Smith Engineering', number: 'ABC-S-101', revision: 'C', date: '2026-10-03' };

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
const base = (task, extra = {}) => answered({ ...ANSWERED, state: 'qld', fallRisk: task === JUMP ? 'yes' : 'no', residential: 'no', task, date: '12 October 2026', ...extra });
const draft = (task, extra = {}) => prepareDraft(draftBody({ ...base(task), ...extra }));
const without = (d, key) => { const { [key]: _, ...rest } = d; return rest; };
const word = async (d) => (await (await JSZip.loadAsync(Buffer.from(await draftToDocx(d, {})))).file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ').replace(/&apos;/g, '\'').replace(/\s+/g, ' ');
const check = (d) => checkSwms(fromDraft(d, { state: 'qld', swms: { signatures: [{ name: 'Jo Smith', date: '12 October 2026' }] } }), { state: 'qld' });

// ---- What prints ----

test('a method prints in the table once given in full; the steps, the gate and the builder check are unchanged', async () => {
  const plain = draft(PLAIN);
  assert.equal(plain.kind, 'draft');
  assert.equal(plain.designs, undefined);
  const withMethod = draft(PLAIN, { designs: [{ ...METHOD, file: FILE }] });
  // Only the table is added: every step and everything else prints as without it.
  assert.deepEqual(without(withMethod, 'designs'), plain);
  assert.deepEqual(withMethod.designs, [{
    status: 'given', by: 'Acme Lifts Pty Ltd', number: 'AL-MS-014', revision: 'B', date: '2026-09-30', file: FILE,
    id: 'method-1', what: 'Jump lift machine platform raising methodology', label: '', steps: [], needed: false, kind: 'method',
    reference: 'AL-MS-014 rev B (Acme Lifts Pty Ltd, 30 September 2026)',
    statusText: 'The work follows this methodology. A copy is attached to this SWMS in SiteWrite (AL-MS-014 rev B.pdf).',
  }]);
  assert.ok(!JSON.stringify(withMethod.jobSteps).includes('AL-MS-014'), 'no line goes into the steps');
  // No gate item, and the builder check scores it the same.
  const gaps = (d, extra) => downloadGaps({ ...base(PLAIN), ...extra, notCoveredConfirmed: d.notCovered }, d);
  assert.deepEqual(gaps(withMethod, { designs: [METHOD] }), gaps(plain, {}));
  assert.deepEqual(check(withMethod), check(plain));
  // Not given in full: it does not print, and the draft is the same as without it.
  for (const missing of ['what', 'by', 'date']) {
    assert.deepEqual(draft(PLAIN, { designs: [{ ...METHOD, [missing]: '' }] }), plain, missing);
  }
  // D236: with no document number it prints, without a number.
  const noNumber = draft(PLAIN, { designs: [{ ...METHOD, number: '' }] });
  assert.equal(noNumber.designs[0].reference, 'rev B (Acme Lifts Pty Ltd, 30 September 2026)');
  assert.deepEqual(without(noNumber, 'designs'), plain);
  assert.deepEqual(check(noNumber), check(plain));
  assert.deepEqual(gaps(noNumber, { designs: [{ ...METHOD, number: '' }] }), gaps(plain, {}));
  // The same-number warning leaves out a methodology with no number (D236), and a design unchanged.
  assert.deepEqual(sameDesignNumbers([{ ...METHOD, number: '' }, { ...METHOD, id: 'method-2', number: '' }]), []);
  assert.deepEqual(designNeed({ id: 'shoring', what: 'Shoring design', status: 'given', by: 'Smith Engineering', number: '', date: '2026-10-03' }), 'For Shoring design, give its document or drawing number.');
  assert.deepEqual(draft(PLAIN, { designs: [{ ...METHOD, number: 'TBC' }] }), plain);
  assert.deepEqual(draft(PLAIN, { designs: [{ ...METHOD, revision: '' }] }).designs[0].reference, 'AL-MS-014 (Acme Lifts Pty Ltd, 30 September 2026)');
  assert.equal(draft(PLAIN, { designs: [METHOD] }).designs[0].statusText, 'The work follows this methodology.');
  // In Word: its own title, column and note; nothing is printed of SiteWrite checking it.
  const text = await word(withMethod);
  assert.ok(text.includes('Written methodologies this SWMS relies on'), text.slice(0, 2000));
  assert.ok(text.includes('The work follows each methodology listed here. Work to the revision listed here. If a new revision is issued, check this SWMS against it and update it before work continues.'));
  assert.ok(text.includes(' Methodology ') && text.includes('Jump lift machine platform raising methodology') && text.includes('AL-MS-014 rev B') && text.includes('30 September 2026') && text.includes('Acme Lifts Pty Ltd'));
  assert.ok(!/Designs this SWMS relies on|Each step that relies on a design/.test(text));
  assert.ok(text.indexOf('Written methodologies this SWMS relies on') < text.indexOf('Job steps'));
  assert.ok(!(await word(plain)).includes('relies on'), 'a SWMS with none prints no table');
  const pdf = await draftToPdf(withMethod, {});
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
});

test('with designs and a method, the table reads "Designs and methodologies"; with designs only it prints as before', async () => {
  const designsOnly = draft(SHORING, { designs: [SHORING_DESIGN] });
  const both = draft(SHORING, { designs: [SHORING_DESIGN, METHOD] });
  assert.deepEqual(both.jobSteps, designsOnly.jobSteps, 'the method adds no line to the steps');
  assert.deepEqual(both.designs.map((row) => [row.id, row.kind || 'design']), [['shoring', 'design'], ['method-1', 'method']]);
  assert.deepEqual(both.designs.slice(0, 1), designsOnly.designs);
  assert.equal(designs.tableTitle(designsOnly), 'Designs this SWMS relies on');
  assert.deepEqual(designs.tableHead(designsOnly), designs.TABLE_HEAD);
  assert.equal(designs.tableNote(designsOnly), designs.TABLE_NOTE);
  assert.equal(designs.tableTitle(both), 'Designs and methodologies this SWMS relies on');
  assert.deepEqual(designs.tableHead(both), ['Design or methodology', 'Prepared by', 'Document or drawing, revision', 'Date', 'Status']);
  assert.equal(designs.tableNote(both), 'Each step that relies on a design names it. The work follows each methodology listed here. Work to the revision listed here. If a new revision is issued, check this SWMS against it and update it before work continues.');
  assert.deepEqual(designs.tableRows(both)[1], ['Jump lift machine platform raising methodology', 'Acme Lifts Pty Ltd', 'AL-MS-014 rev B', '30 September 2026', 'The work follows this methodology.']);
  const text = await word(both);
  assert.ok(text.includes('Designs and methodologies this SWMS relies on') && text.includes('Design or methodology'));
  // The gate asks for the design as before, never for the method; W16 scores the same.
  const gaps = (extra) => downloadGaps(base(SHORING, extra), draft(SHORING, extra)).filter((gap) => gap.kind === 'design').map((gap) => gap.id);
  assert.deepEqual(gaps({ designs: [{ id: 'shoring', status: '' }, METHOD] }), ['design.shoring']);
  assert.deepEqual(gaps({ designs: [{ id: 'shoring', status: '' }, { ...METHOD, by: '' }] }), ['design.shoring']);
  assert.deepEqual(check(both), check(designsOnly));
});

test('what a method still needs is said on its card; the same number warns across designs and methods (D225)', () => {
  assert.equal(methodNeed({ id: 'method-1' }), 'Not in the SWMS yet. Give what it is, who prepared it and its date.');
  assert.equal(methodNeed({ ...METHOD, by: '', date: '' }), 'Not in the SWMS yet. Give who prepared it and its date.');
  assert.equal(methodNeed({ ...METHOD, number: 'TBC' }), 'Not in the SWMS yet. Give its document number (or leave the number empty).');
  // D236: the document number is optional for a methodology.
  assert.equal(methodNeed({ ...METHOD, number: '' }), '');
  assert.equal(methodNeed({ ...METHOD, revision: '____' }), 'Not in the SWMS yet. Give its revision (or leave the revision empty).');
  assert.equal(methodNeed(METHOD), '');
  // A design and a method with the same number and revision: one document may cover both.
  const pair = (revision) => sameDesignNumbers([SHORING_DESIGN, { ...METHOD, number: 'abc s 101', revision }]);
  assert.deepEqual(pair('C'), [{ ids: ['shoring', 'method-1'], text: 'Shoring design and Jump lift machine platform raising methodology both give document ABC-S-101 rev C. Check each number against its document. If the one document covers both, nothing needs changing.' }]);
  assert.equal(pair('B')[0].text, 'Shoring design (rev C) and Jump lift machine platform raising methodology (rev B) both give document ABC-S-101. Two revisions of one document is most likely a mistake. Check each number and revision against its document.');
  // Two methods, one not named yet.
  assert.equal(sameDesignNumbers([METHOD, { id: 'method-2', status: 'given', number: 'AL-MS-014', revision: 'B' }])[0].text,
    'Jump lift machine platform raising methodology and A written methodology both give document AL-MS-014 rev B. Check each number against its document. If the one document covers both, nothing needs changing.');
  // Designs alone read as before.
  assert.match(sameDesignNumbers([SHORING_DESIGN, { ...SHORING_DESIGN, id: 'propping', what: 'Propping design' }])[0].text, /both give drawing ABC-S-101 rev C\. Check each number against the design's title block\./);
});

test('a new method, or a new revision of one, is listed in the changes between revisions', () => {
  const before = draft(PLAIN);
  const after = draft(PLAIN, { designs: [METHOD] });
  assert.notEqual(contentHash(before), contentHash(after));
  assert.deepEqual(changesBetween(before, after).map(changeText), ['Written methodology added: Jump lift machine platform raising methodology: AL-MS-014 rev B (Acme Lifts Pty Ltd, 30 September 2026): The work follows this methodology.']);
  const next = draft(PLAIN, { designs: [{ ...METHOD, revision: 'C' }] });
  assert.ok(changesBetween(after, next).map(changeText).some((line) => /^Written methodology added: .*AL-MS-014 rev C/.test(line)));
  // A design's change still reads as a design.
  assert.ok(changesBetween(draft(SHORING), draft(SHORING, { designs: [SHORING_DESIGN] })).map(changeText).some((line) => /^Design added: Shoring design/.test(line)));
});

test('the jump lift note points to the new option', () => {
  const d = draft(JUMP);
  assert.ok(d.warnings.includes('Raising a jump lift\'s machine platform follows the lift company\'s methodology. Get their methodology, write your step for this work from it, and add it under "Add a written methodology or sequence of works".'), JSON.stringify(d.warnings));
});

// ---- The page ----

function type(p, id, field, value) {
  const event = new FakeEvent('input', { bubbles: true });
  event.target = { value, checked: true, dataset: { designField: field }, closest: () => ({ dataset: { design: id }, querySelector: () => ({}) }) };
  p.document.getElementById('methods-block').dispatchEvent(event);
}

test('the page: the option is on every draft, small and optional; its card says SiteWrite reads typed words only', async () => {
  const p = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }));
  await settle();
  // A draft with no design step: the designs section stays hidden, the option shows, nothing is sent.
  p.run('drawDesigns([])');
  assert.equal(p.document.getElementById('designs-section').classList.contains('hidden'), true);
  assert.equal(p.document.getElementById('methods-section').classList.contains('hidden'), false);
  assert.equal(p.document.getElementById('methods-head').classList.contains('hidden'), true);
  assert.equal(p.document.getElementById('method-add').textContent, 'Add a written methodology or sequence of works (optional)');
  assert.equal(p.run('payload().designs'), undefined);
  // Added: a card with the caution, the same details and file as a design, and no status to choose.
  p.document.getElementById('method-add').click();
  const html = p.document.getElementById('methods-block').innerHTML;
  assert.match(html, /<legend>Written methodology or sequence of works<\/legend>/);
  assert.ok(html.includes('SiteWrite reads only the typed words of a methodology, never drawings or scanned pages, and its suggestions can be wrong: check every one against the methodology. It is up to you to make sure the job steps match it. Where they differ, change the steps on the draft with &quot;Change this step&quot;, or write your own with &quot;Write a step for this&quot; or &quot;Write a step of your own&quot;.'), html);
  assert.ok(html.includes('Prints in the table near the top of the SWMS. Nothing is added to the job steps unless you accept a suggested step.'));
  for (const label of ['What it is', 'Who prepared it', 'Document number', 'Revision', 'Date on the document', 'Attach the file', 'Remove this methodology']) assert.ok(html.includes(label), label);
  assert.match(html, /accept="\.pdf,\.png,\.jpg,\.jpeg,application\/pdf,image\/png,image\/jpeg"/);
  assert.ok(!/data-design-field="status"/.test(html), 'no status to choose');
  assert.equal(p.document.getElementById('methods-head').classList.contains('hidden'), false);
  assert.equal(p.document.getElementById('method-add').textContent, 'Add another written methodology or sequence of works (optional)');
  assert.equal(p.document.getElementById('designs-section').classList.contains('hidden'), true, 'the designs section stays hidden');
  // Empty, it is not sent; as it is typed, its card says what it still needs.
  assert.equal(p.run('payload().designs'), undefined);
  const need = () => p.document.getElementById('design-method-1-need');
  assert.match(html, /<p class="method-need" id="design-method-1-need" role="status">Not in the SWMS yet\. Give what it is, who prepared it and its date\.<\/p>/);
  type(p, 'method-1', 'what', METHOD.what);
  type(p, 'method-1', 'by', METHOD.by);
  type(p, 'method-1', 'number', METHOD.number);
  assert.equal(need().textContent, 'Not in the SWMS yet. Give its date.');
  type(p, 'method-1', 'date', METHOD.date);
  assert.equal(need().hidden, true);
  assert.deepEqual(JSON.parse(p.run('JSON.stringify(payload().designs)')), [{ ...METHOD, revision: '' }]);
  // Two methods with one number: each card says so.
  p.document.getElementById('method-add').click();
  type(p, 'method-2', 'number', 'al ms 014');
  assert.equal(p.document.getElementById('design-method-1-same').hidden, false);
  assert.match(p.document.getElementById('design-method-2-same').textContent, /^Jump lift machine platform raising methodology and A written methodology both give document AL-MS-014\./);
  // Removed.
  const remove = new FakeEvent('click', { bubbles: true });
  remove.target = { closest: (selector) => (selector === '[data-design-remove]' ? { dataset: { designRemove: 'method-2' } } : null) };
  p.document.getElementById('methods-block').dispatchEvent(remove);
  assert.deepEqual(JSON.parse(p.run('JSON.stringify(payload().designs)')).map((row) => row.id), ['method-1']);
  // In the draft: the table, with the file to open.
  const sheet = p.window.SiteWrite.render(draft(PLAIN, { designs: [{ ...METHOD, file: FILE }] }), { movable: true });
  assert.match(sheet, /<h4>Written methodologies this SWMS relies on<\/h4><p class="meta">The work follows each methodology listed here\./);
  assert.match(sheet, /<th>Methodology<\/th>/);
  assert.match(sheet, /data-design-file-open="\/api\/designs\/files\/df_abcdefghijklmnopqrstu"/);
  const both = p.window.SiteWrite.render(draft(SHORING, { designs: [SHORING_DESIGN, METHOD] }), { movable: true });
  assert.match(both, /<h4>Designs and methodologies this SWMS relies on<\/h4><p class="meta">Each step that relies on a design names it\. The work follows each methodology listed here\./);
  assert.match(both, /<th>Design or methodology<\/th>/);
  assert.match(p.window.SiteWrite.render(draft(SHORING, { designs: [SHORING_DESIGN] }), { movable: true }), /<h4>Designs this SWMS relies on<\/h4>.*<th>Design<\/th>/s);
  // A new SWMS starts with none.
  p.run('newSwms()');
  assert.equal(p.run('payload().designs'), undefined);
  assert.equal(p.document.getElementById('methods-block').innerHTML, '');
});

test('a saved SWMS opened again with Change keeps its method', async () => {
  const second = { ...METHOD, id: 'method-2', what: 'Sequence of works for the machine room', number: 'al-ms-014' };
  const input = { ...base(PLAIN, { designs: [{ ...METHOD, file: FILE }, second] }), ppe: [] };
  const saved = { swms: { id: 'saved-m', title: 'Cable tray', revision: 1, revisedAt: '2026-10-12', lastReviewedAt: '2026-10-12', reviewDueAt: '2027-01-12', reviewedBy: 'Sam', signonPath: '/sign.html?t=x' },
    input, draft: prepareDraft(draftBody(input)), signons: [], revisions: [], update: { available: false, changes: [] } };
  let asked = 0;
  const respond = (method, route, sent) => {
    if (route === '/api/config') return { body: { accounts: true, trialDays: 14, designFiles: { enabled: true, maxMb: 10 } } };
    if (route === '/api/me') return { body: { user: { email: 'a@b.example', name: 'Sam' }, company: { name: 'Co', abn: '1', hasAccess: true, planStatus: 'active' } } };
    if (route === '/api/sites') return { body: { sites: [] } };
    if (route === '/api/steps') return { body: { groups: [] } };
    if (route === '/api/swms/saved-m') return { body: saved };
    if (route === '/api/swms/saved-m/qr.svg') return { body: '<svg></svg>', headers: { 'content-type': 'image/svg+xml' } };
    if (route === '/api/draft/questions') {
      asked += 1;
      return { body: { required: [], steps: { suggested: [], chosen: [], locked: [] } } };
    }
    if (route === '/api/draft') return { body: { ...prepareDraft(draftBody(sent)), controlLegal: [] } };
    return { body: {} };
  };
  const p = loadPage(['gate-rules.js', 'app.js', 'account.js'], respond, { stored: { 'sitewrite.session': 'token' } });
  await settle();
  const open = new FakeEvent('click', { bubbles: true });
  open.target = { closest: (selector) => (selector === '[data-swms]' ? { dataset: { swms: 'saved-m' } } : null) };
  p.document.getElementById('swms-list').dispatchEvent(open);
  await settle();
  const view = p.document.getElementById('result').innerHTML;
  assert.match(view, /<h4>Written methodologies this SWMS relies on<\/h4>/);
  assert.match(view, /data-design-file-open="\/api\/swms\/saved-m\/designs\/df_abcdefghijklmnopqrstu"/);
  // The same number on two methods: said above the SWMS, corrected under the methods' heading.
  assert.ok(view.includes('<p>Jump lift machine platform raising methodology and Sequence of works for the machine room both give document AL-MS-014 rev B. Check each number against its document. If the one document covers both, nothing needs changing.</p><p>To correct a number, choose Change, fix it under "Written methodologies and sequences of works" and save a new revision.</p>'), view.slice(0, 3000));
  p.document.getElementById('saved-edit').click();
  await settle();
  assert.ok(asked >= 1);
  assert.deepEqual(JSON.parse(p.run('JSON.stringify(payload().designs)')), input.designs, 'the method and its file are kept');
  const html = p.document.getElementById('methods-block').innerHTML;
  assert.match(html, /<legend>Jump lift machine platform raising methodology<\/legend>.*<legend>Sequence of works for the machine room<\/legend>/s);
  assert.match(html, /Attached: <strong>AL-MS-014 rev B\.pdf<\/strong>/);
  assert.equal(p.document.getElementById('designs-section').classList.contains('hidden'), true);
});

// ---- Files, saved SWMS, Export all and deletion ----

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
let abnSeed = 0;
function nextAbn() {
  for (;;) {
    abnSeed += 1;
    const digits = crypto.createHash('sha256').update(`methods${abnSeed}`).digest('hex').replace(/\D/g, '').slice(0, 11);
    if (digits.length === 11 && digits[0] !== '0' && validAbn(digits)) return digits;
  }
}
async function business(key) {
  const email = `admin@${key.toLowerCase()}-methods.example`;
  await call('POST', '/api/auth/email', { body: { email } });
  const token = (await json('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).data.token;
  assert.equal((await json('PUT', '/api/company', { token, body: { name: `${key} Lifts Pty Ltd`, abn: nextAbn() } })).status, 200);
  return token;
}
const pdf = (extra = '') => Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R ${extra}>> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`);
const upload = (token, data, name) => json('POST', '/api/designs/files', { token, raw: data, headers: { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent(name) } });
const CONFIRM = { reviewConfirmed: true, reviewedBy: 'Pat Subbie' };

test('a method\'s file is kept with each saved revision, opened only by the business, exported, and goes with the SWMS', async () => {
  const token = await business('Echo');
  const other = await business('Foxtrot');
  // The download is not held by a method, given or not, and prints it. (A download keeps a copy of
  // the SWMS for the business, so it has its own file here.)
  const copy = (await upload(token, pdf('/Title (copy)'), 'Lift method copy.pdf')).data.file;
  const half = await call('POST', '/api/draft.docx', { token, body: checked({ ...ready(base(PLAIN, { designs: [{ ...METHOD, by: '' }] })), ...CONFIRM }) });
  assert.equal(half.status, 200);
  const docx = await call('POST', '/api/draft.docx', { token, body: checked({ ...ready(base(PLAIN, { designs: [{ ...METHOD, file: copy }] })), ...CONFIRM }) });
  assert.equal(docx.status, 200);
  const xml = (await (await JSZip.loadAsync(Buffer.from(await docx.arrayBuffer()))).file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ');
  assert.ok(xml.includes('Written methodologies this SWMS relies on') && xml.includes('AL-MS-014 rev B'));
  assert.equal((await call('POST', '/api/draft.pdf', { token, body: checked({ ...ready(base(PLAIN, { designs: [{ ...METHOD, file: copy }] })), ...CONFIRM }) })).status, 200);
  const first = (await upload(token, pdf('/Title (B)'), 'AL-MS-014 rev B.pdf')).data.file;
  // Saved: the file is the SWMS's, for the business only.
  const saved = await json('POST', '/api/swms', { token, body: checked({ input: ready(base(PLAIN, { designs: [{ ...METHOD, file: first }] })), ...CONFIRM }) });
  assert.equal(saved.status, 201, JSON.stringify(saved.data));
  const id = saved.data.swms.id;
  const view = (await json('GET', `/api/swms/${id}`, { token })).data;
  assert.deepEqual(view.draft.designs.map((row) => [row.id, row.kind, row.file && row.file.id]), [['method-1', 'method', first.id]]);
  const route = `/api/swms/${id}/designs/${first.id}`;
  assert.equal((await call('GET', route, { token })).status, 200);
  assert.equal((await call('GET', route)).status, 401);
  assert.equal((await call('GET', route, { token: other })).status, 404);
  const theirs = await json('POST', '/api/swms', { token: other, body: checked({ input: ready(base(PLAIN, { designs: [{ ...METHOD, file: first }] })), ...CONFIRM }) });
  assert.equal(theirs.status, 400);
  assert.match(theirs.data.message, /The file attached to Jump lift machine platform raising methodology is no longer held/);
  // Revision 2 with the method's revision C: both files kept, the change listed.
  const second = (await upload(token, pdf('/Title (C)'), 'AL-MS-014 rev C.pdf')).data.file;
  const revised = await json('PUT', `/api/swms/${id}`, { token, body: checked({ input: ready(base(PLAIN, { designs: [{ ...METHOD, revision: 'C', file: second }] })), ...CONFIRM, reason: 'Lift method revision C' }) });
  assert.equal(revised.status, 200);
  assert.equal((await call('GET', route, { token })).status, 200, 'revision 1\'s file is kept');
  const history = (await json('GET', `/api/swms/${id}/revisions`, { token })).data.revisions;
  assert.ok(history[0].changes.some((line) => /^Written methodology added: Jump lift machine platform raising methodology: AL-MS-014 rev C/.test(line)), JSON.stringify(history[0].changes));
  // Export all: each file once, named by the revisions that use it.
  const zip = await JSZip.loadAsync(Buffer.from(await (await call('GET', '/api/swms/export.zip', { token })).arrayBuffer()));
  const names = Object.keys(zip.files).filter((name) => name.startsWith('Design files/') && /AL-MS-014 rev [BC]\.pdf$/.test(name));
  assert.equal(names.length, 2, names.join(' | '));
  assert.ok(names.some((name) => /revision 1 - AL-MS-014 rev B\.pdf$/.test(name)) && names.some((name) => /revision 2 - AL-MS-014 rev C\.pdf$/.test(name)));
  // Deleted: hidden at once, and after 30 days its files go.
  assert.equal((await json('DELETE', `/api/swms/${id}`, { token })).status, 200);
  assert.equal((await call('GET', route, { token })).status, 404);
  await db.query('UPDATE swms SET updated_at = $1 WHERE id = $2', [new Date(Date.now() - 31 * 24 * 60 * 60 * 1000), id]);
  await db.query('UPDATE design_files SET created_at = $1 WHERE id IN ($2, $3)', [new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), first.id, second.id]);
  await removeExpired(new Date());
  assert.equal((await db.query('SELECT id FROM design_files WHERE id IN ($1, $2)', [first.id, second.id])).length, 0);
  assert.equal((await db.query('SELECT file_id FROM design_file_data WHERE file_id IN ($1, $2)', [first.id, second.id])).length, 0);
});
