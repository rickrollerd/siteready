// Every SWMS carries a revision number (owner decision, 5 Oct): a new SWMS and a copy are
// revision 1, each saved change adds one, and the Word and PDF files print it.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const JSZip = require('jszip');
const { app } = require('../server');
const { prepareDraft } = require('../draft');
const { draftBody } = require('../input');
const { draftToDocx } = require('../docx-draft');
const { draftToPdf } = require('../pdf-draft');
const { fromDraft, checkSwms } = require('../builder-check');
const { setupAccounts, lastLinkToken } = require('./helpers');

let server;
let base;

test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

function call(method, route, { body, token } = {}) {
  return fetch(`${base}${route}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function signIn(email) {
  await call('POST', '/api/auth/email', { body: { email } });
  const { token } = await (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).json();
  await call('PUT', '/api/company', { token, body: { name: 'Revision Co', abn: '53 004 085 616' } });
  return token;
}

const INPUT = {
  state: 'qld',
  task: 'Install sprinkler pipework in the ward ceilings from scissor lifts more than 2 m above the floor.',
  fallRisk: 'yes',
  facts: { fallControl: 'Scissor lifts with guardrails are used for all work above 2 m.' },
};
const CONFIRM = { reviewConfirmed: true, reviewedBy: 'Alex Chen' };

async function wordText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  return (await zip.file('word/document.xml').async('string')).replace(/<[^>]+>/g, '');
}

// The text drawn in a PDF: each compressed page stream inflated, and its hex strings read.
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

test('a new SWMS is revision 1, each saved change adds one, and a copy starts at 1', async () => {
  const token = await signIn('revisions@example.com');
  const { swms } = await (await call('POST', '/api/swms', { token, body: { input: INPUT, ...CONFIRM } })).json();
  assert.equal(swms.revision, 1);

  const first = await (await call('PUT', `/api/swms/${swms.id}`, { token, body: { input: INPUT, ...CONFIRM } })).json();
  assert.equal(first.swms.revision, 2);
  const second = await (await call('PUT', `/api/swms/${swms.id}`, { token, body: { title: 'Sprinklers', ...CONFIRM } })).json();
  assert.equal(second.swms.revision, 3);

  // Marking it reviewed with no change is not a new revision.
  const reviewed = await (await call('POST', `/api/swms/${swms.id}/reviewed`, { token, body: CONFIRM })).json();
  assert.equal(reviewed.swms.revision, 3);

  const copy = await (await call('POST', `/api/swms/${swms.id}/copy`, { token, body: CONFIRM })).json();
  assert.equal(copy.swms.revision, 1);
  const list = await (await call('GET', '/api/swms', { token })).json();
  assert.deepEqual(list.swms.map((item) => item.revision).sort(), [1, 3]);

  // The saved Word and PDF files print the revision and its date.
  const docx = await wordText(Buffer.from(await (await call('GET', `/api/swms/${swms.id}/docx`, { token })).arrayBuffer()));
  assert.match(docx, /Revision 3, \d{1,2} [A-Z][a-z]+ \d{4}/);
  const pdf = pdfText(Buffer.from(await (await call('GET', `/api/swms/${swms.id}/pdf`, { token })).arrayBuffer()));
  assert.match(pdf, /Revision 3, \d{1,2} [A-Z][a-z]+ \d{4}/);
  const copied = await wordText(Buffer.from(await (await call('GET', `/api/swms/${copy.swms.id}/docx`, { token })).arrayBuffer()));
  assert.match(copied, /Revision 1, /);
});

test('an unsaved draft prints Revision 1 in Word and PDF, and the builder check sees it', async () => {
  const draft = prepareDraft(draftBody({ ...INPUT, date: '5 October 2026' }));
  assert.equal(draft.revision, '1');
  const docx = await wordText(await draftToDocx(draft));
  assert.match(docx, /Revision 1, 5 October 2026/);
  // Once in the details and once on the sign-on page.
  assert.equal((docx.match(/Revision 1, 5 October 2026/g) || []).length, 2);
  assert.match(pdfText(await draftToPdf(draft)), /Revision 1, 5 October 2026/);

  const result = checkSwms(fromDraft(draft, { state: 'qld' }), { state: 'qld' });
  const control = JSON.stringify(result);
  assert.doesNotMatch(control, /Add a revision number/);
});

test('a SWMS saved before revisions reads as revision 1, dated when it was made', async () => {
  const db = require('../db');
  const token = await signIn('revisions@example.com');
  const { swms } = await (await call('POST', '/api/swms', { token, body: { input: INPUT, ...CONFIRM } })).json();
  const row = await db.one('SELECT * FROM swms WHERE id = $1', [swms.id]);
  // Saved the old way: no revision columns given.
  await db.query(
    `INSERT INTO swms (id, company_id, site_id, title, input, reviewed_by, created_by, signon_token, created_at, updated_at, last_reviewed_at, review_due_at)
     VALUES ('older-swms', $1, NULL, 'Older', $2, 'Alex Chen', $3, 'older-token', $4, $4, $4, $4)`,
    [row.company_id, JSON.stringify(row.input), row.created_by, new Date('2026-01-02T00:00:00Z')],
  );
  const older = (await (await call('GET', '/api/swms', { token })).json()).swms.find((item) => item.id === 'older-swms');
  assert.equal(older.revision, 1);
  assert.equal(new Date(older.revisedAt).toISOString(), '2026-01-02T00:00:00.000Z');
  const docx = await wordText(Buffer.from(await (await call('GET', '/api/swms/older-swms/docx', { token })).arrayBuffer()));
  assert.match(docx, /Revision 1, 2 January 2026/);
});

test('the worker sign-on page and the on-screen preview show the revision', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const token = await signIn('revisions@example.com');
  const { swms } = await (await call('POST', '/api/swms', { token, body: { input: INPUT, ...CONFIRM } })).json();
  const key = new URLSearchParams(swms.signonPath.split('?')[1]).get('t');
  const first = await (await call('GET', `/api/sign/${key}`)).json();
  assert.match(first.revision, /^Revision 1, \d{1,2} [A-Z][a-z]+ \d{4}$/);
  await call('PUT', `/api/swms/${swms.id}`, { token, body: { title: 'Sprinklers', ...CONFIRM } });
  const second = await (await call('GET', `/api/sign/${key}`)).json();
  assert.match(second.revision, /^Revision 2, \d{1,2} [A-Z][a-z]+ \d{4}$/);
  // The sign-on page prints it under the title, with the company and workplace.
  const sign = fs.readFileSync(path.join(__dirname, '../public/sign.js'), 'utf8');
  assert.match(sign, /\[data\.company, data\.workplace, data\.revision\]/);

  // The preview prints a Revision row, worded as the Word and PDF files word it.
  const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  assert.match(app, /<tr><th>Revision<\/th><td>\$\{esc\(revisionText\(draft\)\)\}<\/td><\/tr>/);
  const source = /function revisionText\(draft\) \{[\s\S]*?\n\}/.exec(app)[0];
  const preview = vm.runInNewContext(`${source}; revisionText`);
  const { revisionText } = require('../docx-draft');
  const unsaved = prepareDraft(draftBody({ ...INPUT, date: '5 October 2026' }));
  assert.equal(preview(unsaved), 'Revision 1, 5 October 2026');
  assert.equal(preview(unsaved), revisionText(unsaved));
  const saved = (await (await call('GET', `/api/swms/${swms.id}`, { token })).json()).draft;
  assert.match(preview(saved), /^Revision 2, \d{1,2} [A-Z][a-z]+ \d{4}$/);
  assert.equal(preview(saved), revisionText(saved));
});
