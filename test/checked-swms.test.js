// Keeping SWMS checked with the builder check (owner, 11 October 2026; KEEP_CHECKED_SWMS): nothing
// kept with the setting off; the original, text, result, state, trade and month kept once with it on;
// the uploader apart; the learning copy de-identified; the owner-only view and its log; "Do not keep";
// deletion with the business and on request; retention; the storage bucket; the report section.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.ADMIN_EMAILS = 'owner@kept.example';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const crypto = require('crypto');
const { app } = require('../server');
const db = require('../db');
const aiScope = require('../ai-scope');
const kept = require('../checked-swms');
const store = require('../file-store');
const { monthlyReport, reportMarkdown } = require('../control-learning');
const { setupAccounts, lastLinkToken } = require('./helpers');

let server;
let base;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.KEEP_CHECKED_SWMS;
  aiScope.useClient(null);
});

// Each test starts from an empty database, with keeping on unless it says otherwise.
test.beforeEach(async () => {
  process.env.KEEP_CHECKED_SWMS = 'on';
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
  await setupAccounts();
});

const call = (method, route, { body, token } = {}) => fetch(`${base}${route}`, {
  method,
  headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});
const json = async (method, route, options) => {
  const response = await call(method, route, options);
  return { status: response.status, data: await response.json().catch(() => ({})) };
};
async function signIn(email) {
  await call('POST', '/api/auth/email', { body: { email } });
  return (await json('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).data.token;
}
// A builder's account with its business name set.
async function builder(email, name) {
  const token = await signIn(email);
  const { company_id: companyId, id: userId } = await db.one('SELECT company_id, id FROM users WHERE email = $1', [email]);
  await db.query('UPDATE companies SET name = $1, address = $2, email = $3 WHERE id = $4', [name, '1 Head Office Street, Fortitude Valley QLD 4006', email, companyId]);
  return { token, companyId, userId };
}

// A library line, so the report can tell lines the library has from lines it does not.
const LIBRARY_LINE = 'Drill anchors with on-tool extraction. Anyone still at risk of exposure after this control wears a fit tested respirator.';
const NEW_LINE = 'A second spotter holds the tag line from the trailer deck until the coil is chocked.';

// What the stand-in model reads from a subcontractor's SWMS; nothing is billed.
function reading({ controls = [NEW_LINE, LIBRARY_LINE], person = 'Dave Smith', builderName = 'ABC Builders Pty Ltd' } = {}) {
  return {
    state: 'qld', task: 'Install ductwork in the plant room.', fallRisk: 'no', siteAddress: '42 Smith Street, Paddington QLD 4064', siteConditions: [], highRisk: [],
    steps: [{ step: 'Fix hangers and supports', hazards: ['Silica dust from drilling.'], controls, responsible: person }],
    ppe: [], responsiblePerson: person, consultation: '', signatures: [], revision: '1', date: '', reviewDate: '', principalContractor: builderName,
    licences: [], plant: [], emergency: [], review: '', legislation: [], riskMatrix: false,
  };
}
function standIn(value = reading()) {
  aiScope.useClient({ beta: { messages: { stream: () => ({ finalMessage: async () => ({ stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: JSON.stringify(value) }] }) }) } } });
}
// A subcontractor's SWMS as text, naming its own business, people and contact details.
const swmsText = (company = 'Kestrel Point Plumbing Pty Ltd', extra = '') => `${company}
ABN 51 824 753 556
Safe work method statement: install ductwork
Site: 42 Smith Street, Paddington QLD 4064
Prepared by Dave Smith, phone 0412 345 678, dave@kestrelplumbing.com.au
Fix hangers and supports. Silica dust from drilling.
${NEW_LINE}
${LIBRARY_LINE}
${extra}`;
const asFile = (text, name = 'Kestrel ductwork SWMS.txt') => ({ name, data: Buffer.from(text).toString('base64') });

// Starts a check and waits for its result, as the check page does.
async function check(token, body) {
  const started = await json('POST', '/api/check', { token, body });
  assert.equal(started.status, 202, JSON.stringify(started.data));
  for (let i = 0; i < 300; i += 1) {
    const { data } = await json('GET', `/api/check/${started.data.id}`, { token });
    if (data.status !== 'checking') return data;
    await new Promise((resolve) => { setTimeout(resolve, 20); });
  }
  throw new Error('the check never finished');
}
const count = async (table) => Number((await db.one(`SELECT COUNT(*) AS n FROM ${table}`)).n);
const TABLES = ['checked_swms', 'checked_swms_uploaders', 'checked_swms_files', 'checked_swms_learning', 'checked_swms_lines'];

test('with KEEP_CHECKED_SWMS off, nothing is kept and the check answers as before', async () => {
  delete process.env.KEEP_CHECKED_SWMS;
  const { token } = await builder('off@builder.example', 'Off Builders Pty Ltd');
  standIn();
  assert.deepEqual((await json('GET', '/api/check/keeping')).data, { keeping: false });
  const data = await check(token, { file: asFile(swmsText()) });
  assert.equal(data.status, 'done');
  assert.equal(data.kept, undefined);
  assert.equal(data.keptNote, undefined);
  for (const table of TABLES) assert.equal(await count(table), 0, table);
  // The report has no section for it.
  const report = await monthlyReport({ month: '2026-10' });
  assert.equal(report.checkedSwms, undefined);
  assert.doesNotMatch(reportMarkdown(report), /Real SWMS checked/);
});

test('with it on, the notice shows and the document is kept once: original, text, result, state, month, uploader apart', async () => {
  const { token, companyId, userId } = await builder('on@builder.example', 'Brookvale Building Group Pty Ltd');
  const notice = (await json('GET', '/api/check/keeping')).data;
  assert.equal(notice.keeping, true);
  assert.equal(notice.years, 3);
  assert.match(notice.notice, /keeps a copy of each SWMS you check/);
  assert.match(notice.notice, /Names are not used outside SiteWrite/);
  assert.equal(notice.choice, 'Do not keep this document');
  standIn();
  const file = asFile(swmsText());
  const data = await check(token, { file });
  assert.equal(data.kept, true);
  assert.match(data.keptNote, /A copy of this document was kept/);
  const row = await db.one('SELECT * FROM checked_swms');
  assert.equal(row.source, 'file');
  assert.equal(row.file_name, 'Kestrel ductwork SWMS.txt');
  assert.equal(row.storage, 'database');
  assert.equal(row.content_hash, crypto.createHash('sha256').update(Buffer.from(file.data, 'base64')).digest('hex'));
  assert.equal(row.score, data.score);
  assert.equal(row.band, data.band);
  assert.equal(row.state, 'qld');
  assert.match(row.month, /^\d{4}-\d{2}$/);
  assert.match(row.text, /Kestrel Point Plumbing Pty Ltd/, 'the text keeps its names: it is the evidence');
  const result = JSON.parse(row.result);
  assert.equal(result.score, data.score);
  assert.ok(result.findings.length > 0);
  assert.equal(result.email, undefined, 'the email, with the names typed for it, is not kept');
  // The original, byte for byte, and the uploader in a table of its own.
  assert.deepEqual(await store.getFile(row.id, row.storage), Buffer.from(file.data, 'base64'));
  assert.deepEqual((await db.query('SELECT company_id, user_id FROM checked_swms_uploaders WHERE swms_id = $1', [row.id])).map((item) => [item.company_id, item.user_id]), [[companyId, userId]]);
  assert.ok(!Object.keys(row).some((column) => /company|user/.test(column)), 'the document row holds no account');
  // Pasted text is kept as the original too.
  standIn(reading({ controls: ['Pasted control line for the test only.'] }));
  const pasted = await check(token, { text: swmsText('Other Pasting Pty Ltd') });
  assert.equal(pasted.kept, true);
  const second = await db.one("SELECT id, source, storage FROM checked_swms WHERE source = 'pasted'");
  assert.match((await store.getFile(second.id, second.storage)).toString(), /^Other Pasting Pty Ltd/);
});

test('the same document is kept once: checked again it counts, and a second business is added as an uploader', async () => {
  const one = await builder('first@dup.example', 'First Dup Builders Pty Ltd');
  const two = await builder('second@dup.example', 'Second Dup Builders Pty Ltd');
  standIn();
  const file = asFile(swmsText());
  await check(one.token, { file });
  const again = await check(one.token, { file });
  assert.equal(again.kept, true);
  await check(two.token, { file });
  assert.equal(await count('checked_swms'), 1);
  assert.equal(await count('checked_swms_files'), 1);
  assert.equal((await db.one('SELECT checks FROM checked_swms')).checks, 3);
  assert.equal(await count('checked_swms_uploaders'), 2);
  const lines = await count('checked_swms_lines');
  assert.ok(lines > 0);
  // The learning copy and lines are not made again for a repeat.
  assert.equal(await count('checked_swms_learning'), 1);
  // A different file is a different document.
  await check(one.token, { file: asFile(swmsText('Kestrel Point Plumbing Pty Ltd', 'Revision 2.')) });
  assert.equal(await count('checked_swms'), 2);
});

test('the learning copy has names, phone numbers, emails, ABNs and addresses taken out, and the business only as a fingerprint', async () => {
  const { token } = await builder('deid@builder.example', 'Brookvale Building Group Pty Ltd');
  standIn(reading({ controls: [NEW_LINE, 'Call Dave Smith on 0412 345 678 or dave@kestrelplumbing.com.au before lifting at 42 Smith Street.', 'Brookvale Building Group site manager signs the permit.'] }));
  const text = `${swmsText()}\nLicence No: HRW1234567. PO Box 203 Chester Hill NSW 2162. www.kestrelplumbing.com.au ACN 123 456 789`;
  await check(token, { text });
  const learning = await db.one('SELECT * FROM checked_swms_learning');
  const lines = await db.query('SELECT * FROM checked_swms_lines');
  const everything = JSON.stringify({ learning, lines });
  for (const personal of ['Kestrel', 'Dave', 'Smith', '0412', 'kestrelplumbing', '51 824 753 556', '42 Smith Street', 'Paddington QLD 4064', 'HRW1234567', 'Chester Hill', 'PO Box 203', '123 456 789', 'Brookvale', 'ABC Builders']) {
    assert.ok(!everything.includes(personal), `the learning copy still holds ${personal}`);
  }
  assert.match(learning.text, /\[phone\]/);
  assert.match(learning.text, /\[email\]/);
  assert.match(learning.text, /ABN \[number\]|\[number\]/);
  assert.match(learning.text, /\[address\]/);
  assert.match(learning.org_key, /^[0-9a-f]{64}$/, 'the business is a keyed fingerprint, not a name');
  // The steps, hazards and controls are lines, each with the library step it is most like.
  const kinds = new Set(lines.map((line) => line.kind));
  assert.deepEqual([...kinds].sort(), ['control', 'hazard', 'step']);
  const call_ = lines.find((line) => /\[phone\]/.test(line.line));
  assert.ok(call_, 'the phone number line is kept with the number taken out');
  assert.match(call_.line, /\[name\]/);
  assert.ok(lines.find((line) => line.line === NEW_LINE));
  // Two documents from one business count as one organisation; the fingerprint does not depend on case or "Pty Ltd".
  assert.equal(kept.documentCompany('KESTREL POINT PLUMBING PTY. LTD.\nABN 1').key, kept.documentCompany('Kestrel Point Plumbing Pty Ltd').key);
  assert.equal(kept.documentCompany('Company: Hunter Lifts\nPrepared for ABC Builders Pty Ltd', { principalContractor: 'ABC Builders' }).name, 'Hunter Lifts');
  assert.equal(kept.documentCompany('Prepared for ABC Builders Pty Ltd\nby Hunter Lifts Pty Ltd', { principalContractor: 'ABC Builders Pty Ltd' }).name, 'Hunter Lifts Pty Ltd');
  assert.equal(kept.documentCompany('No business here.').key, '');
});

test('only the owner opens kept documents, from the admin page, and every look is logged', async () => {
  const { token } = await builder('access@builder.example', 'Access Builders Pty Ltd');
  const owner = await signIn('owner@kept.example');
  standIn();
  const file = asFile(swmsText());
  await check(token, { file });
  const { id } = await db.one('SELECT id FROM checked_swms');
  // The uploader and anyone else cannot.
  for (const route of ['/api/admin/checked-swms/status', '/api/admin/checked-swms', `/api/admin/checked-swms/${id}`, `/api/admin/checked-swms/${id}/original`]) {
    assert.equal((await call('GET', route, { token })).status, 403, route);
    assert.equal((await call('GET', route)).status, 401, route);
  }
  assert.equal((await call('POST', `/api/admin/checked-swms/${id}/delete`, { token, body: {} })).status, 403);
  assert.equal(await count('admin_access_log'), 0, 'a refused look is not logged as a look');

  // The page asks whether to show the panel: counts only, not logged.
  assert.deepEqual((await json('GET', '/api/admin/checked-swms/status', { token: owner })).data, { keeping: true, years: 3, bucket: false, total: 1 });
  assert.equal(await count('admin_access_log'), 0);
  const listed = await json('GET', '/api/admin/checked-swms', { token: owner });
  assert.equal(listed.status, 200);
  assert.equal(listed.data.keeping, true);
  assert.equal(listed.data.total, 1);
  assert.equal(listed.data.documents[0].id, id);
  assert.equal(listed.data.documents[0].businesses, 1);
  const opened = await json('GET', `/api/admin/checked-swms/${id}`, { token: owner });
  assert.equal(opened.status, 200);
  assert.equal(opened.data.uploaders[0].companyName, 'Access Builders Pty Ltd');
  assert.equal(opened.data.uploaders[0].email, 'access@builder.example');
  assert.match(opened.data.text, /Kestrel Point Plumbing/);
  assert.ok(opened.data.lines.some((line) => line.inLibrary === false));
  const original = await call('GET', `/api/admin/checked-swms/${id}/original`, { token: owner });
  assert.equal(original.status, 200);
  assert.match(original.headers.get('content-disposition'), /attachment; filename="Kestrel ductwork SWMS.txt"/);
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), Buffer.from(file.data, 'base64'));
  const log = await db.query('SELECT admin_email, action, target FROM admin_access_log ORDER BY created_at');
  assert.deepEqual(log.map((row) => [row.admin_email, row.action, row.target]), [
    ['owner@kept.example', 'checked_swms_list', ''],
    ['owner@kept.example', 'checked_swms_view', id],
    ['owner@kept.example', 'checked_swms_original', id],
  ]);
  // The owner deletes it on request: everything kept for it goes, and the delete is logged.
  assert.equal((await json('POST', `/api/admin/checked-swms/${id}/delete`, { token: owner, body: {} })).status, 200);
  for (const table of TABLES) assert.equal(await count(table), 0, table);
  const after = await db.query('SELECT action, target FROM admin_access_log');
  assert.deepEqual(after.map((row) => [row.action, row.target]), [['checked_swms_list', ''], ['checked_swms_deleted', id]], 'looks at a deleted document go with it; the delete stays');
  assert.equal((await json('GET', `/api/admin/checked-swms/${id}`, { token: owner })).status, 404);
});

test('"Do not keep this document" keeps nothing, and a business that opted out of industry data is left out', async () => {
  const { token, companyId } = await builder('nokeep@builder.example', 'No Keep Builders Pty Ltd');
  standIn();
  const data = await check(token, { file: asFile(swmsText()), keep: false });
  assert.equal(data.status, 'done');
  assert.equal(data.kept, false);
  assert.match(data.keptNote, /not kept, as you asked/);
  for (const table of TABLES) assert.equal(await count(table), 0, table);
  await db.query('UPDATE companies SET industry_opt_out = TRUE WHERE id = $1', [companyId]);
  const opted = await check(token, { file: asFile(swmsText()) });
  assert.equal(opted.kept, false);
  assert.match(opted.keptNote, /opted out of industry data/);
  for (const table of TABLES) assert.equal(await count(table), 0, table);
});

test('a document two businesses checked stays when one is deleted, and goes with the second', async () => {
  const owner = await signIn('owner@kept.example');
  const one = await builder('one@shared.example', 'Shared One Pty Ltd');
  const two = await builder('two@shared.example', 'Shared Two Pty Ltd');
  standIn();
  const file = asFile(swmsText());
  await check(one.token, { file });
  await check(two.token, { file });
  await check(one.token, { file: asFile(swmsText('Only One Pty Ltd')) });
  assert.equal(await count('checked_swms'), 2);
  const deleteBusiness = async (who, name) => {
    await db.query("UPDATE companies SET plan_status = 'canceled' WHERE id = $1", [who.companyId]);
    const done = await json('POST', `/api/admin/companies/${who.companyId}/delete`, { token: owner, body: { confirm: name } });
    assert.equal(done.status, 200, JSON.stringify(done.data));
    return done.data;
  };
  const first = await deleteBusiness(one, 'Shared One Pty Ltd');
  assert.equal(first.removed.checked_swms, 1, 'only the document no other business checked');
  assert.equal(await count('checked_swms'), 1);
  assert.deepEqual((await db.query('SELECT company_id FROM checked_swms_uploaders')).map((row) => row.company_id), [two.companyId]);
  await deleteBusiness(two, 'Shared Two Pty Ltd');
  for (const table of TABLES) assert.equal(await count(table), 0, table);
});

test('kept documents are deleted 3 years after they were last checked, or as KEEP_CHECKED_SWMS_YEARS says', async () => {
  const { token } = await builder('old@builder.example', 'Old Builders Pty Ltd');
  standIn();
  await check(token, { file: asFile(swmsText()) });
  const now = Date.now();
  const year = 365.25 * 86400000;
  assert.equal(await kept.removeOld(new Date(now + 2.9 * year)), 0);
  assert.equal(await count('checked_swms'), 1);
  process.env.KEEP_CHECKED_SWMS_YEARS = '2';
  try {
    assert.equal(kept.uploadNotice().years, 2);
    assert.match(kept.uploadNotice().notice, /kept for 2 years/);
    assert.equal(await kept.removeOld(new Date(now + 1.9 * year)), 0);
    assert.equal(await kept.removeOld(new Date(now + 2.1 * year)), 1);
  } finally {
    delete process.env.KEEP_CHECKED_SWMS_YEARS;
  }
  for (const table of TABLES) assert.equal(await count(table), 0, table);
  // The daily tidy-up runs it, with keeping off too.
  standIn();
  await check(token, { file: asFile(swmsText()) });
  delete process.env.KEEP_CHECKED_SWMS;
  await require('../accounts').removeExpired(new Date(now + 3.1 * year));
  assert.equal(await count('checked_swms'), 0);
});

test('a file over the database cap keeps its text and result but not the original, and production keeps originals only in the bucket', async () => {
  const { token } = await builder('big@builder.example', 'Big Builders Pty Ltd');
  standIn();
  process.env.KEEP_CHECKED_SWMS_DB_MAX_MB = '0.0001';
  try {
    await check(token, { file: asFile(swmsText()) });
  } finally {
    delete process.env.KEEP_CHECKED_SWMS_DB_MAX_MB;
  }
  const row = await db.one('SELECT storage, storage_note, text FROM checked_swms');
  assert.equal(row.storage, 'none');
  assert.match(row.storage_note, /over the 0 KB the database holds/);
  assert.match(row.text, /Fix hangers/);
  assert.equal(await count('checked_swms_files'), 0);
  assert.equal(kept.MAX_UPLOAD_BYTES, Math.floor((15 * 1024 * 1024 * 3) / 4), 'the builder check request limit');
  process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
  try {
    assert.deepEqual(await store.putFile('prod-test', Buffer.from('x'), 'text/plain'), { storage: 'none', note: 'Original not kept: the storage bucket is not set up (CHECKED_SWMS_BUCKET and its settings).' });
    assert.match(store.storageProblem(), /CHECKED_SWMS_BUCKET/);
  } finally {
    delete process.env.RAILWAY_ENVIRONMENT_NAME;
  }
  assert.equal(store.storageProblem(), null);
});

test('requests to the storage bucket are signed as S3 expects (the AWS example)', () => {
  const header = store.signature({
    method: 'GET', path: '/test.txt', region: 'us-east-1', keyId: 'AKIAIOSFODNN7EXAMPLE', secret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    headers: { host: 'examplebucket.s3.amazonaws.com', range: 'bytes=0-9', 'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'x-amz-date': '20130524T000000Z' },
  });
  assert.equal(header, 'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
});

test('with the bucket settings, the original goes to the bucket (a local stand-in), not the database, and is deleted from it', async () => {
  // A stand-in for the bucket that checks each request's signature and holds objects in memory.
  const objects = new Map();
  const seen = [];
  const bucket = http.createServer((req, res) => {
    const parts = [];
    req.on('data', (part) => parts.push(part));
    req.on('end', () => {
      const body = Buffer.concat(parts);
      const headers = { host: req.headers.host, 'x-amz-content-sha256': req.headers['x-amz-content-sha256'], 'x-amz-date': req.headers['x-amz-date'] };
      const expected = store.signature({ method: req.method, path: req.url, headers, region: 'auto', keyId: 'test-key-id', secret: 'test-secret' });
      const hashOk = headers['x-amz-content-sha256'] === crypto.createHash('sha256').update(body).digest('hex');
      seen.push(req.method);
      if (req.headers.authorization !== expected || !hashOk) { res.statusCode = 403; res.end(); return; }
      if (req.method === 'PUT') { objects.set(req.url, body); res.end(); return; }
      if (req.method === 'GET') { if (!objects.has(req.url)) { res.statusCode = 404; res.end(); return; } res.end(objects.get(req.url)); return; }
      if (req.method === 'DELETE') { objects.delete(req.url); res.statusCode = 204; res.end(); return; }
      res.statusCode = 405;
      res.end();
    });
  });
  bucket.listen(0);
  await new Promise((resolve) => bucket.once('listening', resolve));
  Object.assign(process.env, {
    CHECKED_SWMS_BUCKET: 'sitewrite-checks-abc123', CHECKED_SWMS_BUCKET_KEY_ID: 'test-key-id', CHECKED_SWMS_BUCKET_SECRET: 'test-secret',
    CHECKED_SWMS_BUCKET_ENDPOINT: `http://127.0.0.1:${bucket.address().port}`, CHECKED_SWMS_BUCKET_PATH_STYLE: 'on',
  });
  try {
    const owner = await signIn('owner@kept.example');
    const { token } = await builder('bucket@builder.example', 'Bucket Builders Pty Ltd');
    standIn();
    const file = asFile(swmsText());
    await check(token, { file });
    const row = await db.one('SELECT id, storage FROM checked_swms');
    assert.equal(row.storage, 'bucket');
    assert.equal(await count('checked_swms_files'), 0, 'nothing in the database');
    assert.deepEqual(objects.get(`/sitewrite-checks-abc123/checked-swms/${row.id}`), Buffer.from(file.data, 'base64'));
    const original = await call('GET', `/api/admin/checked-swms/${row.id}/original`, { token: owner });
    assert.deepEqual(Buffer.from(await original.arrayBuffer()), Buffer.from(file.data, 'base64'));
    assert.equal((await json('POST', `/api/admin/checked-swms/${row.id}/delete`, { token: owner, body: {} })).status, 200);
    assert.equal(objects.size, 0);
    assert.deepEqual(seen, ['PUT', 'GET', 'DELETE']);
  } finally {
    for (const name of ['CHECKED_SWMS_BUCKET', 'CHECKED_SWMS_BUCKET_KEY_ID', 'CHECKED_SWMS_BUCKET_SECRET', 'CHECKED_SWMS_BUCKET_ENDPOINT', 'CHECKED_SWMS_BUCKET_PATH_STYLE']) delete process.env[name];
    bucket.close();
  }
});

test('the monthly report shows real SWMS checked this month and the lines the library does not have, by library step and organisations', async () => {
  const owner = await signIn('owner@kept.example');
  const one = await builder('report1@builder.example', 'Report One Builders Pty Ltd');
  const two = await builder('report2@builder.example', 'Report Two Builders Pty Ltd');
  standIn();
  await check(one.token, { file: asFile(swmsText('Kestrel Point Plumbing Pty Ltd')) });
  await check(two.token, { file: asFile(swmsText('Hunter Valley Mechanical Pty Ltd')) });
  // A second document from the first organisation does not make a third organisation.
  await check(one.token, { file: asFile(swmsText('Kestrel Point Plumbing Pty Ltd', 'Revision 2.')) });
  const month = (await db.one('SELECT month FROM checked_swms LIMIT 1')).month;
  const report = await monthlyReport({ month });
  const section = report.checkedSwms;
  assert.ok(section);
  assert.equal(section.checkedThisMonth, 3);
  assert.equal(section.organisationsThisMonth, 2);
  const all = section.groups.flatMap((group) => group.lines.map((line) => ({ ...line, group: group.step })));
  const added = all.find((line) => line.line === NEW_LINE);
  assert.ok(added, 'a line the library does not have is listed');
  assert.equal(added.documents, 3);
  assert.equal(added.organisations, 2);
  assert.equal(added.twoOrganisations, true);
  assert.ok(!all.some((line) => line.line === LIBRARY_LINE), 'a line the library has is not listed');
  assert.ok(section.twoOrganisationLines >= 1);
  assert.ok(section.groups.every((group) => typeof group.step === 'string' && group.step));
  // No business, person or site appears anywhere in the section.
  const text = JSON.stringify(section);
  for (const personal of ['Kestrel', 'Hunter Valley', 'Report One', 'Dave', '0412', 'Smith Street']) assert.ok(!text.includes(personal), personal);
  const markdown = reportMarkdown(report);
  assert.match(markdown, /## Real SWMS checked/);
  assert.match(markdown, /Real SWMS checked this month: 3 \(from 2 organisations\)/);
  assert.match(markdown, /Lines that SiteWrite's library does not have: \d+/);
  // The owner's page gets it through the report route; a month before shows none checked.
  const shown = await json('GET', `/api/admin/control-learning/report?month=${month}`, { token: owner });
  assert.equal(shown.data.checkedSwms.checkedThisMonth, 3);
  const earlier = await monthlyReport({ month: '2026-01' });
  assert.equal(earlier.checkedSwms.checkedThisMonth, 0);
  assert.deepEqual(earlier.checkedSwms.groups, []);
});
