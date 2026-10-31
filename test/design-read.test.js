// The design card filled from the drawing's typed words when its file is attached (owner, D249 and
// D250), with a stand-in for the AI so no request is made or billed.
const test = require('node:test');
const assert = require('node:assert/strict');
const PDFDocument = require('pdfkit');
const { setupAccounts } = require('./helpers');
const db = require('../db');
const aiScope = require('../ai-scope');
const designFiles = require('../design-files');
const designRead = require('../design-read');
const { DESIGN_BRIEF, DESIGN_SCHEMA, DESIGN_BRIEF_VERSION } = require('../design-brief');
const { designNeed } = require('../public/gate-rules');
const { draftBody } = require('../input');

const company = { id: 'company-design-read', name: 'Deckform' };
const TITLE_BLOCK = ['EXAMPLE CONSULTING ENGINEERS', 'FORMWORK AND FALSEWORK LEVEL 3 SLAB', 'DRAWING No. FW-S-201', 'REV C', 'DATE 03.10.2026', 'SCALE 1:100'];

// A vector drawing: lines and grid labels, with a typed title block; or a scan, with no words at all.
function drawing(lines) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A3', layout: 'landscape', margin: 30 });
    const parts = [];
    doc.on('data', (part) => parts.push(part));
    doc.on('end', () => resolve(Buffer.concat(parts)));
    for (let i = 0; i < 6; i += 1) doc.moveTo(80 + i * 150, 80).lineTo(80 + i * 150, 600).stroke();
    if (lines) {
      for (let i = 0; i < 6; i += 1) doc.fontSize(9).text(`GRID ${i + 1}`, 70 + i * 150, 610, { lineBreak: false });
      lines.forEach((line, i) => doc.fontSize(9).text(line, 880, 680 + i * 14, { lineBreak: false }));
    } else {
      for (let i = 0; i < 30; i += 1) doc.rect(60 + (i % 10) * 100, 100 + Math.floor(i / 10) * 150, 80, 120).fill(i % 2 ? '#777777' : '#bbbbbb');
    }
    doc.end();
  });
}

function standIn(answer) {
  const client = { calls: [], beta: { messages: { stream(params) {
    client.calls.push(params);
    return { finalMessage: async () => ({ stop_reason: 'end_turn', model: 'claude-opus-5-5', usage: { input_tokens: 1200, output_tokens: 400 }, content: [{ type: 'text', text: JSON.stringify(answer) }] }) };
  } } } };
  return client;
}
const upload = async (data, name) => designFiles.saveUpload({ companyId: company.id, userId: 'u1', data, name });

test.before(async () => {
  await setupAccounts();
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
});
test.after(() => {
  delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENROUTER_API_KEY;
  aiScope.useClient(null);
});

test('the brief asks for the title block\'s own words only, never a guess; its schema is strict', () => {
  assert.equal(DESIGN_BRIEF_VERSION, 'design m1');
  assert.match(DESIGN_BRIEF, /Copy each value exactly as it is written in the text, character for character/);
  assert.match(DESIGN_BRIEF, /leave it as an empty string\. Never guess\./);
  assert.deepEqual(DESIGN_SCHEMA.required, ['title', 'by', 'number', 'revision', 'date']);
  assert.equal(DESIGN_SCHEMA.additionalProperties, false);
});

test('a vector drawing\'s typed title block fills the card; only its words are sent; the same drawing is not read twice', async () => {
  const model = standIn({ title: 'FORMWORK AND FALSEWORK LEVEL 3 SLAB', by: 'EXAMPLE CONSULTING ENGINEERS', number: 'FW-S-201', revision: 'C', date: '03.10.2026' });
  aiScope.useClient(model);
  const file = await upload(await drawing(TITLE_BLOCK), 'FW-S-201 rev C.pdf');
  const result = await designRead.readDesign(company, file.id);
  assert.deepEqual(result.details, { what: 'FORMWORK AND FALSEWORK LEVEL 3 SLAB', by: 'EXAMPLE CONSULTING ENGINEERS', number: 'FW-S-201', revision: 'C', date: '2026-10-03' });
  assert.deepEqual(result.read, ['what', 'by', 'number', 'revision', 'date']);
  const params = model.calls[0];
  assert.equal(params.model, 'claude-opus-5-5');
  assert.equal(params.system[0].text, DESIGN_BRIEF);
  assert.equal(params.output_config.effort, 'low');
  // The text layer only: no image is sent.
  assert.equal(typeof params.messages[0].content, 'string');
  for (const line of TITLE_BLOCK) assert.ok(params.messages[0].content.includes(line), line);
  // Cost recorded: (1,200 x $4 + 400 x $20) per million = $0.0128.
  const row = await db.one('SELECT cost_usd, status FROM ai_readings WHERE company_id = $1 AND brief_version = $2', [company.id, 'design m1']);
  assert.equal(Number(row.cost_usd), 0.0128);
  assert.equal(row.status, 'done');
  const again = await designRead.readDesign(company, (await upload(await drawing(TITLE_BLOCK), 'copy.pdf')).id);
  assert.equal(again.kept, true);
  assert.equal(model.calls.length, 1);
  await assert.rejects(designRead.readDesign({ id: 'someone-else' }, file.id), /not found/);
});

test('a value not in the drawing\'s words word for word is left empty; dates are read day first', async () => {
  aiScope.useClient(standIn({ title: '', by: 'Example Consulting Engineers Pty Ltd', number: 'FW-S-201', revision: 'D', date: '3 Oct 2026' }));
  const file = await upload(await drawing([...TITLE_BLOCK.slice(0, 2), 'DRAWING No. FW-S-201', 'REV C', 'ISSUED 3 Oct 2026']), 'other.pdf');
  const result = await designRead.readDesign(company, file.id);
  assert.deepEqual(result.details, { number: 'FW-S-201', date: '2026-10-03' });
  assert.deepEqual(designRead.isoDate('3/10/26'), '2026-10-03');
  assert.equal(designRead.isoDate('31.02.2026'), '');
  assert.equal(designRead.isoDate('2026-10-03'), '2026-10-03');
  assert.equal(designRead.isoDate('October'), '');
  assert.deepEqual(designRead.cardDetails({ revision: 'Rev C' }).details, { revision: 'C' });
});

test('a scan or a photo has no typed words: not read, with the plain message', async () => {
  const model = standIn({ title: '', by: '', number: 'X', revision: '', date: '' });
  aiScope.useClient(model);
  const scan = await upload(await drawing(null), 'scan.pdf');
  await assert.rejects(designRead.readDesign(company, scan.id), /^Error: This drawing has no typed words SiteWrite can read, so type its details\.$/);
  const photo = await upload(require('fs').readFileSync(require('path').join(__dirname, '../public/icon-192.png')), 'photo.png');
  await assert.rejects(designRead.readDesign(company, photo.id), /This drawing has no typed words SiteWrite can read, so type its details\./);
  assert.equal(model.calls.length, 0);
});

test('off without the API key, with a plain message', async () => {
  delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENROUTER_API_KEY;
  try {
    await assert.rejects(designRead.readDesign(company, 'df_x'), /Reading the drawing is not switched on here\. Type its details\./);
  } finally {
    process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
  }
});

test('details read wait for "These match the drawing" before download; typed by hand they do not', () => {
  const given = { id: 'formwork', what: 'Formwork design', status: 'given', by: 'Example Consulting Engineers', number: 'FW-S-201', revision: 'C', date: '2026-10-03' };
  assert.equal(designNeed(given), '');
  assert.equal(designNeed({ ...given, read: { fields: ['number', 'revision'], checked: false } }), 'For Formwork design, check the details read from the drawing against its title block and tick "These match the drawing".');
  assert.equal(designNeed({ ...given, read: { fields: ['number'], checked: true } }), '');
  // An edit after reading keeps the tick needed, alongside anything else missing.
  assert.equal(designNeed({ ...given, by: '', read: { fields: ['number'], checked: false } }), 'For Formwork design, give who prepared it and tick "These match the drawing" once checked.');
  // The page sends it, and only real fields are kept.
  const input = draftBody({ designs: [{ ...given, read: { fields: ['number', 'made up'], checked: 'yes' } }] });
  assert.deepEqual(input.designs[0].read, { fields: ['number'], checked: false });
  assert.equal(draftBody({ designs: [given] }).designs[0].read, undefined);
});

test('the route needs an account', async () => {
  const { app } = require('../server');
  const server = app.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/designs/read`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId: 'df_x' }) });
    assert.equal(response.status, 401);
  } finally {
    server.close();
  }
});
