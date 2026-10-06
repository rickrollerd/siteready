// Worker sign-on pages are taken out of an uploaded SWMS before the builder check sends it to
// the AI (owner decision, 6 October 2026). Small PDF and Word SWMS with sign-on sheets are made
// here with made-up names; the AI is a stand-in that keeps what it was sent.
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, HeadingLevel, WidthType } = require('docx');
const aiScope = require('../ai-scope');
const { runCheck, useStripLog } = require('../check-read');
const { swmsWithoutSignOns } = require('../signon-strip');
const { prepareDraft } = require('../draft');
const { draftBody } = require('../input');
const { draftToPdf } = require('../pdf-draft');
const { draftToDocx } = require('../docx-draft');

// ---- Made-up SWMS and crews ----

const METHOD = [
  'SAFE WORK METHOD STATEMENT',
  'Task: Replace the metal roof sheets on a two storey house at 14 Banksia Road, Ashgrove QLD 4060.',
  'Date: 6 October 2026   Revision 2',
  'Person responsible: Site supervisor',
  'High risk work: Risk of a person falling more than 2 metres',
  'Step 1 Set up roof access',
  'Hazard: A fall from the ladder while getting onto the roof.',
  'Control: Access is by a scaffold stair with handrails on both sides.',
  'Step 2 Install edge protection',
  'Hazard: Falling from the roof edge while the rails are fitted.',
  'Control: Edge protection is installed from the scaffold platform before anyone goes onto the roof.',
  'Step 3 Fix new roof sheets',
  'Hazard: Falling through fragile sheets or skylights.',
  'Control: Skylights are covered with fixed mesh covers rated for a fall before work starts.',
  'PPE: Hard hat, safety boots, gloves, sun protection',
  'Emergency: Rescue plan for a person suspended in a harness, first aid kit in the site office.',
];
const CREW = [
  { name: 'Jarrah Quillfeather', employer: 'Fernleaf Plumbing', date: '06/10/2026', time: '6:48 am' },
  { name: 'Odalys Brightwater', employer: 'Kestrel Edge Scaffolding', date: '06/10/2026', time: '7:02 am' },
  { name: 'Tamsin Okoro-Vale', employer: 'Fernleaf Plumbing', date: '06/10/2026', time: '7:15 am' },
];
const LATE = { name: 'Ruairi Pembleton', employer: 'Wattlebird Roofing', date: '07/10/2026', time: '9:41 am' };
const READING_NOTE = 'Read in Vietnamese (translation), 6 min 40 s, all 12 sections viewed, check questions passed (2 attempts)';
// Everything about a worker that must never reach the AI.
const PRIVATE = [...[...CREW, LATE].flatMap((item) => [item.name, item.employer, item.time]), '06/10/2026', '07/10/2026',
  'Read in Vietnamese', 'sections viewed', 'check questions passed', 'I have read and understood', 'data:image', 'iVBOR'];

// A small grey PNG standing in for a finger signature.
function signaturePng() {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buffer) => {
    let c = 0xffffffff;
    for (const byte of buffer) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(60, 0);
  header.writeUInt32BE(20, 4);
  header[8] = 8;
  const raw = Buffer.alloc(61 * 20, 120);
  for (let y = 0; y < 20; y += 1) raw[y * 61] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const SIGNATURE = signaturePng();

// ---- Building the files ----

function pdf(build) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, autoFirstPage: false });
    const parts = [];
    doc.on('data', (part) => parts.push(part));
    doc.on('end', () => resolve(Buffer.concat(parts)));
    build(doc);
    doc.end();
  });
}

const footer = (doc, n) => doc.fontSize(8).text(`Roof replacement SWMS 0042  Page ${n}`, 50, 780, { lineBreak: false });
function methodPage(doc, lines, n) {
  doc.addPage();
  doc.fontSize(10);
  for (const line of lines) doc.text(line, 50);
  footer(doc, n);
}
// A sign-on table: one row per worker, the cells on one line, the signature as a picture.
function signOnRows(doc, rows, top) {
  let y = top;
  for (const item of rows) {
    doc.fontSize(10).text(item.name, 50, y, { lineBreak: false });
    doc.text(item.employer, 190, y, { lineBreak: false });
    doc.image(SIGNATURE, 330, y - 4, { width: 60 });
    doc.text(item.date, 410, y, { lineBreak: false });
    doc.text(item.time, 490, y, { lineBreak: false });
    y += 30;
  }
  return y;
}
function signOnHeader(doc, y) {
  ['Name', 'Employer', 'Signature', 'Date', 'Time'].forEach((label, i) => doc.fontSize(10).text(label, [50, 190, 330, 410, 490][i], y, { lineBreak: false }));
}

// Two method pages, a sign-on sheet, and its rows running on to a fourth page without a heading.
const signedPdf = () => pdf((doc) => {
  methodPage(doc, METHOD.slice(0, 9), 1);
  methodPage(doc, METHOD.slice(9), 2);
  doc.addPage();
  doc.fontSize(14).text('Worker Sign-On Sheet', 50, 50);
  doc.fontSize(10).text('I have read and understood this SWMS, and I will follow it.', 50, 80);
  signOnHeader(doc, 110);
  const y = signOnRows(doc, CREW, 140);
  doc.fontSize(8).text(READING_NOTE, 50, y);
  footer(doc, 3);
  doc.addPage();
  signOnRows(doc, [LATE], 60);
  footer(doc, 4);
});

// A method page with sign-on rows in the middle of the steps.
const mixedPdf = () => pdf((doc) => {
  methodPage(doc, METHOD.slice(0, 9), 1);
  doc.addPage();
  doc.fontSize(10).text(METHOD[9], 50, 50).text(METHOD[10], 50).text(METHOD[11], 50);
  signOnHeader(doc, 120);
  signOnRows(doc, CREW.slice(0, 2), 150);
  doc.text(METHOD[12], 50, 230).text(METHOD[13], 50).text('Hazard: Cuts from sheet edges when handling offcuts on the roof.', 50).text('Control: Cut-resistant gloves are worn and offcuts are bagged as they are made.', 50);
  footer(doc, 2);
});

// A method page and a page that is only a scanned picture.
const scannedPdf = () => pdf((doc) => {
  methodPage(doc, METHOD, 1);
  doc.addPage();
  doc.image(SIGNATURE, 50, 50, { width: 480 });
});

const cell = (children) => new TableCell({ width: { size: 1800, type: WidthType.DXA }, children: Array.isArray(children) ? children : [new Paragraph(String(children))] });
const row = (cells) => new TableRow({ children: cells.map(cell) });
const signatureCell = () => [new Paragraph({ children: [new ImageRun({ type: 'png', data: SIGNATURE, transformation: { width: 60, height: 20 } })] })];
const crewRows = (crew) => crew.map((item) => row([item.name, item.employer, signatureCell(), item.date, item.time]));
const headerRow = () => row(['Name', 'Company', 'Signature', 'Date', 'Time signed']);

async function word(children) {
  return Buffer.from(await Packer.toBuffer(new Document({ sections: [{ children }] })));
}
const methodParagraphs = () => [
  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Safe work method statement')] }),
  ...METHOD.slice(1, 5).map((line) => new Paragraph(line)),
  new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Job steps')] }),
  new Table({ rows: [row(['Job step', 'Hazards', 'Controls']), ...[0, 1, 2].map((i) => row([METHOD[5 + i * 3], METHOD[6 + i * 3], METHOD[7 + i * 3]]))] }),
  ...METHOD.slice(14).map((line) => new Paragraph(line)),
];

// The sign-on on its own page, after a page break.
const signedWord = () => word([
  ...methodParagraphs(),
  new Paragraph({ pageBreakBefore: true, children: [new TextRun({ text: 'Worker sign-on', bold: true })] }),
  new Paragraph('By signing, I confirm this SWMS has been explained to me, I understand it, and I will follow it.'),
  new Table({ rows: [headerRow(), ...crewRows([...CREW, LATE])] }),
  new Paragraph({ children: [new TextRun({ text: READING_NOTE, size: 14 })] }),
]);

// The sign-on as its own section under a heading, with no page break, and an empty table.
const emptySignOnWord = () => word([
  ...methodParagraphs(),
  new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Worker acknowledgement')] }),
  new Paragraph('I have read and understood this SWMS.'),
  new Table({ rows: [headerRow(), row(['', '', '', '', '']), row(['', '', '', '', ''])] }),
]);

// Sign-on rows inside the job steps table, with more steps after them.
const mixedWord = () => word([
  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Safe work method statement')] }),
  ...METHOD.slice(1, 5).map((line) => new Paragraph(line)),
  new Table({
    rows: [
      row(['Job step', 'Hazards', 'Controls', '', '']),
      row([METHOD[5], METHOD[6], METHOD[7], '', '']),
      headerRow(),
      ...crewRows(CREW.slice(0, 2)),
      row([METHOD[8], METHOD[9], METHOD[10], '', '']),
      row([METHOD[11], METHOD[12], METHOD[13], '', '']),
    ],
  }),
]);

// ---- The stand-in AI and the strip log ----

const READ = {
  state: 'qld', task: 'Replace the metal roof sheets on a two storey house.', fallRisk: 'yes', siteAddress: '14 Banksia Road, Ashgrove QLD 4060', siteConditions: [],
  highRisk: ['Risk of a person falling more than 2 metres'],
  steps: [{ step: 'Set up roof access', hazards: ['A fall from the ladder while getting onto the roof.'], controls: ['Access is by a scaffold stair with handrails on both sides.'], responsible: '' }],
  ppe: ['Hard hat'], responsiblePerson: 'Site supervisor', consultation: '', signatures: [], revision: 'Revision 2', date: '6 October 2026', reviewDate: '', principalContractor: '',
  licences: [], plant: [], emergency: [], review: '', legislation: [], riskMatrix: false,
};

function setUp(t) {
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
  const sent = [];
  aiScope.useClient({ beta: { messages: { stream(params) {
    sent.push(JSON.stringify(params));
    return { finalMessage: async () => ({ stop_reason: 'end_turn', model: 'claude-opus-5-5', usage: { input_tokens: 100, output_tokens: 100 }, content: [{ type: 'text', text: JSON.stringify(READ) }] }) };
  } } } });
  const logged = [];
  useStripLog((entry) => logged.push(entry));
  t.after(() => {
    delete process.env.ANTHROPIC_API_KEY;
    aiScope.useClient(null);
    useStripLog(null);
  });
  return { sent, logged };
}

const upload = (name, buffer) => ({ file: { name, data: buffer.toString('base64') } });
function assertNothingPrivate(text) {
  for (const item of PRIVATE) assert.ok(!text.includes(item), `"${item}" was sent to the AI`);
}

// ---- The tests ----

test('a PDF: the sign-on sheet and its run-on page are removed, the method is sent, and H7 still sees the crew', async (t) => {
  const { sent, logged } = setUp(t);
  const result = await runCheck(upload('roof-swms.pdf', await signedPdf()), { name: 'Test builder' });
  assert.equal(sent.length, 1);
  assertNothingPrivate(sent[0]);
  for (const line of ['Install edge protection', 'Skylights are covered with fixed mesh covers', 'Rescue plan for a person suspended']) assert.ok(sent[0].includes(line), `${line} is sent`);
  assert.deepEqual(logged, [{ pagesRemoved: 2, sectionsRemoved: 0, signOns: 4, refused: false }]);
  assert.ok(!result.hardFails.includes('H7'), 'four workers signed, counted before the sheet was removed');
  assert.match(result.findings.find((item) => item.rule === 'H7').message, /^4 workers have signed\./);
  assert.deepEqual(result.preStart, [], 'signed, so nothing is left to do before work starts');
  assert.ok(!JSON.stringify(result).includes('Worker 1'), 'the stand-in names are not shown');
  // On site the sign-on is required: the undated "Worker 1" stand-ins still count as sign-ons.
  const onSite = await runCheck({ ...upload('roof-swms.pdf', await signedPdf()), stage: 'on-site' }, {});
  assert.ok(!onSite.hardFails.includes('H7'));
  assert.match(onSite.findings.find((item) => item.rule === 'H7').message, /^4 workers have signed\./);
});

test('a Word file: the sign-on page is removed, its rows counted, and nothing about the crew is sent', async (t) => {
  const { sent, logged } = setUp(t);
  const result = await runCheck({ ...upload('roof-swms.docx', await signedWord()), stage: 'on-site' }, {});
  assertNothingPrivate(sent[0]);
  assert.ok(sent[0].includes('Edge protection is installed from the scaffold platform'));
  assert.deepEqual(logged, [{ pagesRemoved: 0, sectionsRemoved: 1, signOns: 4, refused: false }]);
  assert.ok(!result.hardFails.includes('H7'), 'on site, the four counted sign-ons pass H7');
});

test('a Word sign-on section under a heading is removed; an empty sign-on table is a condition at review and fails H7 on site', async (t) => {
  const { sent, logged } = setUp(t);
  const file = await emptySignOnWord();
  const review = await runCheck(upload('roof-swms.docx', file), {});
  assert.ok(!sent[0].includes('Worker acknowledgement') && !sent[0].includes('Time signed'));
  assert.ok(sent[0].includes('Rescue plan for a person suspended'));
  assert.deepEqual(logged, [{ pagesRemoved: 0, sectionsRemoved: 1, signOns: 0, refused: false }]);
  // At review the named supervisor records consultation; the sign-on is a condition before work starts.
  assert.ok(!review.hardFails.includes('H7'));
  assert.deepEqual(review.preStart, ['Workers must sign on before work starts.']);
  const onSite = await runCheck({ ...upload('roof-swms.docx', file), stage: 'on-site' }, {});
  assert.ok(onSite.hardFails.includes('H7'), 'on site, a sign-on with no one on it fails');
});

test('sign-on rows mixed into the method pages are refused, and nothing is sent', async (t) => {
  const { sent, logged } = setUp(t);
  for (const [name, file] of [['mixed.pdf', await mixedPdf()], ['mixed.docx', await mixedWord()]]) {
    await assert.rejects(runCheck(upload(name, file), {}), (error) => error.status === 422 && /Remove the sign-on pages and upload it again/.test(error.message), name);
  }
  assert.equal(sent.length, 0, 'the AI was not called');
  assert.deepEqual(logged, [{ pagesRemoved: 0, sectionsRemoved: 0, signOns: 0, refused: true }, { pagesRemoved: 0, sectionsRemoved: 0, signOns: 0, refused: true }]);
});

test('a page that is only a scanned picture cannot be checked for names, so it is refused', async (t) => {
  const { sent, logged } = setUp(t);
  await assert.rejects(runCheck(upload('scanned.pdf', await scannedPdf()), {}), (error) => error.status === 422 && /Page 2 is only a picture/.test(error.message));
  assert.equal(sent.length, 0);
  assert.equal(logged[0].refused, true);
});

test('a SWMS with no sign-on is sent as it is: a condition at review, and H7 fails on site', async (t) => {
  const { sent, logged } = setUp(t);
  const text = METHOD.join('\n');
  const result = await runCheck({ text }, {});
  assert.ok(sent[0].includes(JSON.stringify(text).slice(1, -1)), 'pasted text is unchanged');
  assert.deepEqual(logged, [{ pagesRemoved: 0, sectionsRemoved: 0, signOns: 0, refused: false }]);
  assert.ok(!result.hardFails.includes('H7'));
  assert.deepEqual(result.preStart, ['Workers must sign on before work starts.']);
  assert.ok((await runCheck({ text, stage: 'on-site' }, {})).hardFails.includes('H7'));
  // A pasted SWMS with its sign-on on the last page (after a page break) has it removed too.
  const stripped = await swmsWithoutSignOns({ text: `${text}\f\nWorker sign-on\nName\tCompany\tSignature\tDate\n${CREW.map((item) => `${item.name}\t${item.employer}\t\t${item.date} ${item.time}`).join('\n')}` });
  assertNothingPrivate(stripped.text);
  assert.deepEqual([stripped.pagesRemoved, stripped.signOns, stripped.found], [1, 3, true]);
  // Whether the rows were dated is kept for the builder check (W9, owner decision of 6 October 2026); the dates are not.
  assert.equal(stripped.signOnsUndated, 0);
  const undated = await swmsWithoutSignOns({ text: `${text}\f\nWorker sign-on\nName\tSignature\tDate\n${CREW.map((item) => `${item.name}\t\t`).join('\n')}` });
  assert.deepEqual([undated.signOns, undated.signOnsUndated], [3, 3]);
});

test('the preparer and reviewer signature lines are part of the SWMS, not a sign-on', async () => {
  const text = [...METHOD.slice(0, 8), 'Engineer sign-off', 'Hazard: Formwork loaded before it is certified.', 'Control: The engineer signs off the formwork before the pour starts.',
    'Sign in at the site office', ...METHOD.slice(8), 'Declaration', 'This SWMS was prepared in consultation with the workers doing the task and their health and safety representative.',
    'Prepared by: Name ______ Signature ______ Date ______', 'Approved by (name, position, signature, date): ______'].join('\n');
  const stripped = await swmsWithoutSignOns({ text });
  assert.equal(stripped.text, text);
  assert.equal(stripped.found, false);
});

test('a SiteReady SWMS with its own sign-on sheet: the sheet is removed from the Word and the PDF', async (t) => {
  const draft = prepareDraft(draftBody({ state: 'qld', task: 'Install metal roof sheeting on a new two storey house.', fallRisk: 'yes', workplace: '14 Banksia Road, Ashgrove QLD 4060', facts: { fallControl: 'Scaffold with edge protection around the roof perimeter.' } }));
  const signons = [
    { worker_name: CREW[0].name, worker_company: CREW[0].employer, signature: `data:image/png;base64,${SIGNATURE.toString('base64')}`, signedDate: '6 October 2026', note: '' },
    { worker_name: CREW[1].name, worker_company: CREW[1].employer, signature: '', signedDate: '6 October 2026', note: 'Explained by Imogen Thistlewood (supervisor)' },
  ];
  const { sent, logged } = setUp(t);
  for (const [name, file] of [['siteready.pdf', await draftToPdf(draft, { signons })], ['siteready.docx', Buffer.from(await draftToDocx(draft, { signons }))]]) {
    const result = await runCheck(upload(name, file), {});
    const text = sent[sent.length - 1];
    for (const item of [CREW[0].name, CREW[0].employer, CREW[1].name, CREW[1].employer, 'Imogen Thistlewood', 'Worker sign-on', 'By signing']) assert.ok(!text.includes(item), `${name}: "${item}" was sent to the AI`);
    assert.ok(text.includes('Scaffold with edge protection around the roof perimeter.'), `${name}: the method is sent`);
    assert.equal(logged[logged.length - 1].signOns, 2, name);
    assert.ok(!result.hardFails.includes('H7'), name);
  }
});
