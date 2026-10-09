// Revisions are kept as they printed (owner decisions, 6 October 2026): downloading saves the
// SWMS, each revision is frozen with its own reference, an old revision prints the same after
// the library changes, the saved SWMS says when updated wording is available, project SWMS are
// saved when the project is downloaded, and the verify page shows only the business, title,
// revision and whether it is current.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const JSZip = require('jszip');
const { app } = require('../server');
const db = require('../db');
const revisions = require('../revisions');
const { setupAccounts, lastLinkToken, ANSWERED, ready } = require('./helpers');

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

let abnSeed = 0;
// A valid ABN for each test company.
function newAbn() {
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  for (;;) {
    abnSeed += 1;
    const tail = String(700000000 + abnSeed * 7919).slice(-9);
    for (let head = 10; head <= 99; head += 1) {
      const digits = `${head}${tail}`;
      const total = [...digits].reduce((sum, d, i) => sum + (Number(d) - (i === 0 ? 1 : 0)) * weights[i], 0);
      if (total % 89 === 0) return digits;
    }
  }
}

async function signIn(email, name = 'History Co Pty Ltd') {
  await call('POST', '/api/auth/email', { body: { email } });
  const { token } = await (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).json();
  await call('PUT', '/api/company', { token, body: { name, abn: newAbn() } });
  return token;
}

// The site questions answered, as a SWMS needs before it is saved or downloaded (goal 2).
const INPUT = ready({ ...ANSWERED, state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no', date: '5 October 2026' });
const CONFIRM = { reviewConfirmed: true, reviewedBy: 'Alex Chen' };
const REF = /SR-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}/;

async function wordParts(response) {
  const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
  const read = async (pattern) => (await Promise.all(Object.keys(zip.files).filter((name) => pattern.test(name)).map((name) => zip.file(name).async('string')))).join(' ').replace(/<[^>]+>/g, '');
  return { body: await read(/word\/document\.xml$/), footer: await read(/footer/) };
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

test('downloading saves the SWMS, and the same SWMS downloaded again unchanged is the same revision', async () => {
  const token = await signIn('download-saves@history.example');
  const first = await call('POST', '/api/draft.docx', { token, body: { ...INPUT, ...CONFIRM } });
  assert.equal(first.status, 200);
  const id = first.headers.get('x-siteready-swms');
  assert.ok(id, 'the download says which saved SWMS it is');
  assert.equal(first.headers.get('x-siteready-revision'), '1');
  const list = (await (await call('GET', '/api/swms', { token })).json()).swms;
  assert.deepEqual(list.map((item) => item.id), [id], 'saved under My SWMS');
  const { footer } = await wordParts(first);
  const ref = (footer.match(REF) || [])[0];
  assert.ok(ref);
  assert.match(footer, new RegExp(`Working copy\\. The signed record is SiteReady reference ${ref} revision 1\\. Changes made outside SiteReady are not part of the record\\.`));

  // The same SWMS again, unchanged: no new SWMS and no new revision, and the same reference.
  const again = await call('POST', '/api/draft.docx', { token, body: { ...INPUT, ...CONFIRM, swmsId: id } });
  assert.equal(again.headers.get('x-siteready-swms'), id);
  assert.equal(again.headers.get('x-siteready-revision'), '1');
  assert.equal(((await wordParts(again)).footer.match(REF) || [])[0], ref);
  // Changed: the next revision, with its own reference.
  const changed = await call('POST', '/api/draft.pdf', { token, body: { ...INPUT, task: 'Replace a 6m length of timber fence.', ...CONFIRM, swmsId: id } });
  assert.equal(changed.status, 200);
  assert.equal(changed.headers.get('x-siteready-revision'), '2');
  const pdf = pdfText(Buffer.from(await changed.arrayBuffer()));
  const ref2 = (pdf.match(REF) || [])[0];
  assert.ok(ref2 && ref2 !== ref, 'each revision has its own reference');
  assert.match(pdf, new RegExp(`SiteReady reference ${ref2}, revision 2`));
  assert.equal((await (await call('GET', '/api/swms', { token })).json()).swms.length, 1);

  // Each reference is tied to its saved SWMS and revision.
  const stored = await db.one('SELECT swms_id, revision, content_hash FROM swms_refs WHERE ref = $1', [ref]);
  assert.equal(stored.swms_id, id);
  assert.equal(Number(stored.revision), 1);
  assert.match(stored.content_hash, /^[0-9a-f]{64}$/);
});

test('each saved revision is kept with who saved it and why, and the history says what changed', async () => {
  const token = await signIn('history@history.example');
  const { swms } = await (await call('POST', '/api/swms', { token, body: { input: INPUT, ...CONFIRM } })).json();
  const edits = { 'Before starting': { removed: [], changed: [], added: ['Neighbours are told the day before work starts.'] } };
  await call('PUT', `/api/swms/${swms.id}`, { token, body: { input: { ...INPUT, controlEdits: edits }, reason: 'Neighbours asked to be told', ...CONFIRM, reviewedBy: 'Jo Smith' } });
  const rows = await db.query('SELECT revision, edited_name, reason, library_version FROM swms_revisions WHERE swms_id = $1 ORDER BY revision', [swms.id]);
  assert.deepEqual(rows.map((row) => [Number(row.revision), row.edited_name, row.reason]), [[1, 'Alex Chen', ''], [2, 'Jo Smith', 'Neighbours asked to be told']]);
  assert.equal(rows[0].library_version, revisions.LIBRARY_VERSION);

  const { revisions: history } = await (await call('GET', `/api/swms/${swms.id}/revisions`, { token })).json();
  assert.deepEqual(history.map((item) => [item.revision, item.current]), [[2, true], [1, false]]);
  assert.deepEqual(history[0].changes, ['Before starting: Control added: Neighbours are told the day before work starts. (Our own control)']);
  const one = await (await call('GET', `/api/swms/${swms.id}/revisions/1?against=2`, { token })).json();
  assert.equal(one.revision.revision, 1);
  assert.deepEqual(one.changes, history[0].changes);
  assert.equal((await call('GET', `/api/swms/${swms.id}/revisions/9`, { token })).status, 404);
});

test('an old revision prints as it was saved after the library changes, and updated wording is offered', async () => {
  const token = await signIn('frozen@history.example');
  const { swms } = await (await call('POST', '/api/swms', { token, body: { input: INPUT, ...CONFIRM } })).json();
  await call('PUT', `/api/swms/${swms.id}`, { token, body: { title: 'Fence', ...CONFIRM } });
  // The library, when these revisions were saved, worded the first control another way.
  for (const revision of [1, 2]) {
    const row = await db.one('SELECT draft FROM swms_revisions WHERE swms_id = $1 AND revision = $2', [swms.id, revision]);
    const draft = typeof row.draft === 'string' ? JSON.parse(row.draft) : row.draft;
    draft.jobSteps[0].controls[0] = `Old wording of the first control, revision ${revision}.`;
    await db.query('UPDATE swms_revisions SET draft = $1 WHERE swms_id = $2 AND revision = $3', [JSON.stringify(draft), swms.id, revision]);
  }
  const first = await wordParts(await call('GET', `/api/swms/${swms.id}/docx?revision=1`, { token }));
  assert.match(first.body, /Old wording of the first control, revision 1\./);
  assert.match(first.footer, /revision 1\. Changes made outside SiteReady/);
  const current = await wordParts(await call('GET', `/api/swms/${swms.id}/docx`, { token }));
  assert.match(current.body, /Old wording of the first control, revision 2\./);
  assert.match(pdfText(Buffer.from(await (await call('GET', `/api/swms/${swms.id}/pdf`, { token })).arrayBuffer())), /Old wording of the first control, revision 2\./);

  // Workers sign the saved revision, not today's wording.
  const key = new URLSearchParams(swms.signonPath.split('?')[1]).get('t');
  const sign = await (await call('GET', `/api/sign/${key}`)).json();
  assert.equal(sign.jobSteps[0].controls[0], 'Old wording of the first control, revision 2.');

  // The saved SWMS says updated wording is available, and what would change.
  const detail = await (await call('GET', `/api/swms/${swms.id}`, { token })).json();
  assert.equal(detail.update.available, true);
  assert.ok(detail.update.changes.some((line) => /Control removed: Old wording of the first control, revision 2\./.test(line)));
  assert.equal(detail.draft.jobSteps[0].controls[0], 'Old wording of the first control, revision 2.');
  // A new revision takes today's wording.
  await call('PUT', `/api/swms/${swms.id}`, { token, body: { reason: 'Updated wording', ...CONFIRM } });
  const after = await (await call('GET', `/api/swms/${swms.id}`, { token })).json();
  assert.equal(after.swms.revision, 3);
  assert.equal(after.update.available, false);
  assert.doesNotMatch(JSON.stringify(after.draft), /Old wording/);
});

test('an older revision prints the workers who signed it, and never how they read it', async () => {
  const token = await signIn('signed-revision@history.example');
  const { swms } = await (await call('POST', '/api/swms', { token, body: { input: INPUT, ...CONFIRM } })).json();
  // A worker signed revision 1 after reading it in Vietnamese; the business sees only the signing.
  await db.query(`INSERT INTO signons (id, swms_id, worker_name, worker_company, signature, signed_at, language, read_seconds, sections_viewed, sections_total, check_attempts, explained_by, revision)
    VALUES ('rev1-signon', $1, 'Rev One Worker', 'Crew Co', '', $2, 'vi', 245, 7, 7, 2, '', 1)`, [swms.id, new Date()]);
  await call('PUT', `/api/swms/${swms.id}`, { token, body: { title: 'Fence', ...CONFIRM } });
  const READING = /Read in |sections? viewed|check questions|attempt|Vietnamese|\d+ min \d+ s/;
  const old = await wordParts(await call('GET', `/api/swms/${swms.id}/docx?revision=1`, { token }));
  assert.match(old.body, /Rev One Worker/);
  assert.doesNotMatch(old.body, READING);
  const oldPdf = pdfText(Buffer.from(await (await call('GET', `/api/swms/${swms.id}/pdf?revision=1`, { token })).arrayBuffer()));
  assert.match(oldPdf, /Rev One Worker/);
  assert.doesNotMatch(oldPdf, READING);
  // Revision 2 has not been signed by that worker.
  assert.doesNotMatch((await wordParts(await call('GET', `/api/swms/${swms.id}/docx`, { token }))).body, /Rev One Worker/);
});

// Goal 6: every worker signs on to the current version. A new revision starts with no sign-ons;
// workers who signed an earlier one are shown apart, as still to sign.
test('after a new revision, the owner sees no one has signed it, and who signed only an earlier one', async () => {
  const limit = process.env.SIGNON_LIMIT;
  process.env.SIGNON_LIMIT = '2';
  try {
    const token = await signIn('resign@history.example');
    const { swms } = await (await call('POST', '/api/swms', { token, body: { input: INPUT, ...CONFIRM } })).json();
    const key = new URLSearchParams(swms.signonPath.split('?')[1]).get('t');
    const signature = `data:image/png;base64,${Buffer.from('signature').toString('base64')}`;
    const signOn = (name) => call('POST', `/api/sign/${key}`, { body: { name, company: 'Crew Co', signature, confirmed: true, explained: true, supervisor: 'Sam Lee' } });
    const listed = async () => (await (await call('GET', '/api/swms', { token })).json()).swms.find((item) => item.id === swms.id);
    const detail = async () => (await call('GET', `/api/swms/${swms.id}`, { token })).json();

    assert.equal((await signOn('Jo Worker')).status, 201);
    assert.equal((await signOn('Kim Worker')).status, 201);
    assert.equal((await signOn('Third Worker')).status, 409, 'the cap on sign-ons for this revision');
    assert.deepEqual([(await listed()).signons, (await listed()).signedEarlier], [2, 0]);
    // A sign-on from before sign-ons kept their revision, signed on revision 1.
    await db.query(`INSERT INTO signons (id, swms_id, worker_name, worker_company, signature, signed_at, explained_by)
      VALUES ('legacy-before', $1, 'Old Worker', 'Crew Co', '', $2, '')`, [swms.id, new Date()]);

    // Revision 2: no one has signed it, the earlier signers are listed apart, and the save says so.
    const saved = await (await call('PUT', `/api/swms/${swms.id}`, { token, body: { title: 'Fence, revision 2', reason: 'Gate added', ...CONFIRM } })).json();
    assert.equal(saved.swms.revision, 2);
    assert.deepEqual([saved.swms.signons, saved.swms.signedEarlier], [0, 3]);
    let view = await detail();
    assert.deepEqual(view.signons, []);
    assert.deepEqual(view.earlierSignons.map((item) => [item.worker_name, item.revision]), [['Jo Worker', 1], ['Kim Worker', 1], ['Old Worker', null]]);
    assert.equal(view.earlierSignons[0].note, 'Explained by Sam Lee (supervisor)');
    assert.doesNotMatch(JSON.stringify(view.earlierSignons), /read_seconds|check_attempts|language|section/);
    assert.deepEqual([(await listed()).signons, (await listed()).signedEarlier], [0, 3], 'the list does not count earlier sign-ons as on this revision');

    // Jo signs revision 2 (the cap counts this revision only), and a sign-on with no revision kept,
    // made after revision 2 was saved, counts on it too.
    assert.equal((await signOn('Jo Worker')).status, 201);
    await db.query(`INSERT INTO signons (id, swms_id, worker_name, worker_company, signature, signed_at, explained_by)
      VALUES ('legacy-after', $1, 'New Worker', 'Crew Co', '', $2, '')`, [swms.id, new Date(Date.now() + 1000)]);
    view = await detail();
    assert.deepEqual(view.signons.map((item) => item.worker_name), ['Jo Worker', 'New Worker']);
    assert.deepEqual(view.earlierSignons.map((item) => item.worker_name), ['Kim Worker', 'Old Worker'], 'Jo has signed this revision');
    assert.deepEqual([(await listed()).signons, (await listed()).signedEarlier], [2, 2]);

    // The sheets: each revision prints the workers who signed it.
    const current = (await wordParts(await call('GET', `/api/swms/${swms.id}/docx`, { token }))).body;
    assert.match(current, /Jo Worker/);
    assert.match(current, /New Worker/);
    assert.doesNotMatch(current, /Kim Worker|Old Worker/);
    const first = (await wordParts(await call('GET', `/api/swms/${swms.id}/docx?revision=1`, { token }))).body;
    assert.match(first, /Kim Worker/);
    assert.match(first, /Old Worker/);
    assert.doesNotMatch(first, /New Worker/);

    // The cap counts sign-ons on this revision, as kept with it.
    assert.equal((await signOn('Kim Worker')).status, 201);
    assert.equal((await signOn('Third Worker')).status, 409);
  } finally {
    if (limit === undefined) delete process.env.SIGNON_LIMIT;
    else process.env.SIGNON_LIMIT = limit;
  }
});

test('a reference can be checked: business, title, revision and whether it is current, nothing else', async () => {
  const token = await signIn('verify@history.example', 'Verify History Pty Ltd');
  const first = await call('POST', '/api/draft.docx', { token, body: { ...INPUT, ...CONFIRM } });
  const id = first.headers.get('x-siteready-swms');
  const ref = ((await wordParts(first)).footer.match(REF) || [])[0];
  const check = async () => (await call('GET', `/api/verify/${ref}`)).json();
  const now = await check();
  assert.deepEqual(Object.keys(now).sort(), ['business', 'current', 'found', 'ref', 'revision', 'title']);
  assert.equal(now.business, 'Verify History Pty Ltd');
  assert.equal(now.revision, 1);
  assert.equal(now.current, true);
  await call('POST', '/api/draft.docx', { token, body: { ...INPUT, task: 'Replace a 9m length of timber fence.', ...CONFIRM, swmsId: id } });
  const later = await check();
  assert.equal(later.revision, 1);
  assert.equal(later.current, false, 'revision 2 is now the current one');
  await call('DELETE', `/api/swms/${id}`, { token });
  const ref2 = (await db.one('SELECT ref FROM swms_refs WHERE swms_id = $1 AND revision = 2', [id])).ref;
  assert.equal((await (await call('GET', `/api/verify/${ref2}`)).json()).current, false, 'a deleted SWMS is not current');
});

test('a project download saves each SWMS, and saves a changed one as its next revision', async () => {
  const token = await signIn('project@history.example');
  const fence = { ...INPUT, swmsTitle: 'Fencing' };
  const paint = ready({ ...ANSWERED, state: 'qld', task: 'Paint the interior walls of a shop with water-based paint.', fallRisk: 'no', residential: 'no', date: '5 October 2026', facts: { safetyDataSheet: 'Water-based acrylic paint SDS, revision 2, at the work area.' }, swmsTitle: 'Painting' });
  const response = await call('POST', '/api/project.zip', { token, body: { swms: [fence, paint], ...CONFIRM } });
  assert.equal(response.status, 200);
  const saved = JSON.parse(decodeURIComponent(response.headers.get('x-siteready-saved')));
  assert.deepEqual(saved.map((item) => [item.index, item.revision]), [[0, 1], [1, 1]]);
  const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
  const footer = await zip.file(Object.keys(zip.files).find((name) => name.endsWith('.docx'))).async('nodebuffer').then(JSZip.loadAsync)
    .then((inner) => Promise.all(Object.keys(inner.files).filter((name) => /footer/.test(name)).map((name) => inner.file(name).async('string'))))
    .then((parts) => parts.join(' ').replace(/<[^>]+>/g, ''));
  assert.match(footer, /The signed record is SiteReady reference SR-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4} revision 1\./);
  const list = (await (await call('GET', '/api/swms', { token })).json()).swms;
  assert.deepEqual(list.map((item) => item.title).sort(), ['Fencing', 'Painting']);

  // Downloaded again with the fence changed: the fence is revision 2, the painting stays at 1.
  const next = await call('POST', '/api/project.zip', { token, body: { swms: [{ ...fence, swmsId: saved[0].id, task: 'Replace a 5m length of timber fence.' }, { ...paint, swmsId: saved[1].id }], ...CONFIRM } });
  const again = JSON.parse(decodeURIComponent(next.headers.get('x-siteready-saved')));
  assert.deepEqual(again.map((item) => [item.id, item.revision]), [[saved[0].id, 2], [saved[1].id, 1]]);
  assert.equal((await (await call('GET', '/api/swms', { token })).json()).swms.length, 2);
});

test('the kept draft prints the same Word file as the draft it was made from', async () => {
  const { prepareDraft } = require('../draft');
  const { draftBody } = require('../input');
  const { draftToDocx } = require('../docx-draft');
  const draft = prepareDraft(draftBody({ ...INPUT, controlEdits: { 'Before starting': { removed: [], changed: [], added: ['Neighbours are told.'] } } }));
  const text = async (value) => (await (await JSZip.loadAsync(await draftToDocx(value))).file('word/document.xml').async('string'));
  assert.equal(await text(JSON.parse(JSON.stringify(draft))), await text(draft));
  assert.equal(revisions.contentHash(JSON.parse(JSON.stringify(draft))), revisions.contentHash(draft));
  assert.equal(revisions.stable({ b: 1, a: [1, { d: 2, c: 3 }] }), revisions.stable({ a: [1, { c: 3, d: 2 }], b: 1 }));
});
