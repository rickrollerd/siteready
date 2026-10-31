// The principal contractor's review (goal 3, Goal 12 stage 1): a reviewer opens a saved SWMS from
// its reference, signs in by email link as a reviewer (no company, trial or payment), reads the kept
// revision as it prints, runs Builder check on it and returns a set response, recorded against that
// revision. The business is told its review is back (D283); the verify page shows only the response
// and its date (D286).
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.RATE_LIMIT_REVIEW_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const JSZip = require('jszip');
const { app } = require('../server');
const db = require('../db');
const revisions = require('../revisions');
const { prepareDraft, questionsFor } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { checkSwms, fromDraft } = require('../builder-check');
const { removeExpired, validAbn } = require('../accounts');
const reviews = require('../reviews');
const { setupAccounts, lastLinkToken, mailbox, ANSWERED, ready, checked } = require('./helpers');

let server;
let base;

test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

function call(method, route, { body, token, reviewer, raw, headers = {} } = {}) {
  return fetch(`${base}${route}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(reviewer ? { 'X-Reviewer-Token': reviewer } : {}),
      ...headers,
    },
    body: raw || (body ? JSON.stringify(body) : undefined),
  });
}

let abnSeed = 0;
function nextAbn() {
  for (;;) {
    abnSeed += 1;
    const digits = crypto.createHash('sha256').update(`review${abnSeed}`).digest('hex').replace(/\D/g, '').slice(0, 11);
    if (digits.length === 11 && digits[0] !== '0' && validAbn(digits)) return digits;
  }
}

async function signIn(email) {
  await call('POST', '/api/auth/email', { body: { email } });
  const { token } = await (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).json();
  assert.equal((await call('PUT', '/api/company', { token, body: { name: `Business ${email.split('@')[0]} Pty Ltd`, abn: nextAbn() } })).status, 200);
  return token;
}

const INPUT = ready({ ...ANSWERED, state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no', date: '14 October 2026' });
const CONFIRM = { reviewConfirmed: true, reviewedBy: 'Alex Chen' };

// Each saved SWMS's business session, so a reviewer can be invited to it (D313).
const owners = new Map();

// A business with a saved SWMS: its session, the SWMS and the reference printed on revision 1.
async function savedSwms(email, input = INPUT) {
  const token = await signIn(email);
  const saved = await call('POST', '/api/swms', { token, body: checked({ input, ...CONFIRM }) });
  assert.equal(saved.status, 201, JSON.stringify(await saved.clone().json()));
  const { swms } = await saved.json();
  const opened = await (await call('GET', `/api/swms/${swms.id}`, { token })).json();
  owners.set(swms.id, token);
  return { token, id: swms.id, ref: opened.swms.ref, signonPath: opened.swms.signonPath };
}

// The reviewer's link token from the last email to that address.
function reviewerLink(email) {
  const message = [...mailbox].reverse().find((item) => item.to === email);
  return message && /review\.html\?ref=[^&\s]+&login=([A-Za-z0-9_-]+)/.exec(message.text);
}

// The business invites the reviewer to the SWMS the reference was printed on (D313), then the reviewer signs in.
async function inviteReviewer(email, ref) {
  const { swms } = await reviews.revisionForRef(ref);
  const invited = await call('POST', `/api/swms/${swms.id}/review-invites`, { token: owners.get(swms.id), body: { email } });
  assert.ok([200, 201].includes(invited.status), JSON.stringify(await invited.clone().json()));
}

async function reviewerSignIn(email, ref, { invite = true } = {}) {
  if (invite) await inviteReviewer(email, ref);
  const sent = await call('POST', '/api/review/email', { body: { email, ref } });
  assert.equal(sent.status, 200);
  const link = reviewerLink(email);
  assert.ok(link, 'the reviewer link opens the review page for the reference');
  const response = await call('POST', '/api/review/verify', { body: { token: link[1] } });
  assert.equal(response.status, 200);
  return (await response.json()).token;
}

const count = async (table) => Number((await db.one(`SELECT COUNT(*) AS n FROM ${table}`)).n);

test('a reviewer link never opens an account, and reviewer and account sessions never cross', async () => {
  const { ref } = await savedSwms('own1@business.example');
  const companies = await count('companies');
  const users = await count('users');
  const reviewer = await reviewerSignIn('hse@tierone.example', ref);
  for (const email of ['other@tierone.example', 'both@tierone.example', 'late@tierone.example']) await inviteReviewer(email, ref);
  assert.equal(await count('companies'), companies, 'no company or trial is made for a reviewer');
  assert.equal(await count('users'), users, 'a reviewer is not an account user');
  const me = await (await call('GET', '/api/review/me', { reviewer })).json();
  assert.equal(me.reviewer.email, 'hse@tierone.example');
  // A reviewer's session is not an account session, and an account session is not a reviewer's.
  assert.equal((await call('GET', '/api/me', { token: reviewer })).status, 401);
  assert.equal((await call('GET', '/api/swms', { token: reviewer })).status, 401);
  assert.equal((await call('GET', '/api/me', { headers: { 'X-Session-Token': reviewer } })).status, 401);
  const account = await signIn('own2@business.example');
  assert.equal((await call('GET', '/api/review/me', { reviewer: account })).status, 401);
  assert.equal((await call('GET', `/api/review/swms/${ref}`, { token: account })).status, 401, 'an account session does not open a SWMS by reference');
  // A reviewer's link never opens an account, and an account link never makes a reviewer.
  await call('POST', '/api/review/email', { body: { email: 'other@tierone.example', ref } });
  assert.equal((await call('POST', '/api/auth/verify', { body: { token: reviewerLink('other@tierone.example')[1] } })).status, 400);
  assert.equal(await db.one('SELECT id FROM users WHERE email = $1', ['other@tierone.example']), null);
  await call('POST', '/api/auth/email', { body: { email: 'third@tierone.example' } });
  assert.equal((await call('POST', '/api/review/verify', { body: { token: lastLinkToken('third@tierone.example') } })).status, 400);
  // An account sign-in link asked for later does not cancel a reviewer's link to the same email, or the other way round.
  await call('POST', '/api/review/email', { body: { email: 'both@tierone.example', ref } });
  const reviewerToken = reviewerLink('both@tierone.example')[1];
  await call('POST', '/api/auth/email', { body: { email: 'both@tierone.example' } });
  assert.equal((await call('POST', '/api/review/verify', { body: { token: reviewerToken } })).status, 200);
  // A link works once, on one device: opened again (a second device), it is refused.
  assert.equal((await call('POST', '/api/review/verify', { body: { token: reviewerToken } })).status, 400);
  // An expired link is refused.
  await call('POST', '/api/review/email', { body: { email: 'late@tierone.example', ref } });
  const late = reviewerLink('late@tierone.example')[1];
  await db.query('UPDATE login_tokens SET expires_at = $1 WHERE email = $2', [new Date(Date.now() - 1000), 'late@tierone.example']);
  const expired = await call('POST', '/api/review/verify', { body: { token: late } });
  assert.equal(expired.status, 400);
  assert.match((await expired.json()).message, /expired or has been used\. Ask for a new one/);
  // A link is only sent for a reference that is in SiteWrite's records.
  assert.equal((await call('POST', '/api/review/email', { body: { email: 'hse@tierone.example', ref: 'SR-2222-2222' } })).status, 404);
  assert.equal((await call('POST', '/api/review/email', { body: { email: 'hse@tierone.example', ref: 'nonsense' } })).status, 400);
  assert.equal((await call('POST', '/api/review/email', { body: { email: 'not an email', ref } })).status, 400);
  // Signing out ends the session.
  await call('POST', '/api/review/logout', { reviewer });
  assert.equal((await call('GET', '/api/review/me', { reviewer })).status, 401);
});

test('a reference is read as typed or pasted, and a wrong one is named plainly', async () => {
  assert.equal(reviews.cleanRef(' sr abcd 2345 '), 'SR-ABCD-2345');
  assert.equal(reviews.cleanRef('SRABCD2345'), 'SR-ABCD-2345');
  assert.equal(reviews.cleanRef('SiteWrite reference SR-ABCD-2345, revision 2'), 'SR-ABCD-2345');
  assert.equal(reviews.cleanRef('SR-ABCD-23456'), 'SR-ABCD-23456');
  // New references start SW- (D295), read the same ways.
  assert.equal(reviews.cleanRef(' sw abcd 2345 '), 'SW-ABCD-2345');
  assert.equal(reviews.cleanRef('SWMS for review, SiteWrite reference SWABCD2345, revision 2'), 'SW-ABCD-2345');
  const { ref } = await savedSwms('typed@business.example');
  assert.match(ref, /^SW-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/, 'a new SWMS gets an SW- reference');
  const reviewer = await reviewerSignIn('typed@tierone.example', ref.toLowerCase().replace(/-/g, ' '));
  assert.equal((await call('GET', `/api/review/swms/${encodeURIComponent(ref.toLowerCase().replace(/-/g, ''))}`, { reviewer })).status, 200);
  const wrong = await call('GET', '/api/review/swms/SR-2222-2223', { reviewer });
  assert.equal(wrong.status, 404);
  assert.match((await wrong.json()).message, /not in SiteWrite's records\. Check each letter and number/);
  const shape = await call('GET', '/api/review/swms/12345', { reviewer });
  assert.equal(shape.status, 400);
  assert.match((await shape.json()).message, /looks like SW-ABCD-2345 \(or SR-ABCD-2345 on older SWMS\)/);
});

// A SWMS printed while the app was called SiteReady carries an SR- reference (D295). It still verifies,
// is found however it is typed, and can be reviewed and responded to, as a new SW- reference can.
test('an old SR- reference still verifies and can be reviewed', async () => {
  const { token, id, ref } = await savedSwms('old-ref@business.example');
  const old = `SR-${ref.slice(3)}`;
  // As it was issued before the change of name.
  await db.query('UPDATE swms_refs SET ref = $1 WHERE ref = $2', [old, ref]);
  await db.query('UPDATE swms_revisions SET ref = $1 WHERE ref = $2', [old, ref]);
  const verified = await (await call('GET', `/api/verify/${old}`)).json();
  assert.equal(verified.found, true);
  assert.equal(verified.ref, old);
  assert.equal(verified.reviewable, true);
  assert.equal((await (await call('GET', `/api/verify/${old.toLowerCase()}`)).json()).found, true, 'typed in lower case');
  assert.equal((await (await call('GET', `/api/verify/${ref}`)).json()).found, false, 'the SW- form of an old reference is not a second reference');
  const reviewer = await reviewerSignIn('old-ref@tierone.example', old.toLowerCase().replace(/-/g, ' '));
  const opened = await call('GET', `/api/review/swms/${old}`, { reviewer });
  assert.equal(opened.status, 200);
  const sent = await call('POST', `/api/review/swms/${old}/response`, { reviewer, body: { response: 'approved', name: 'Priya Shah', company: 'Tier One Builders' } });
  assert.equal(sent.status, 201);
  const row = await db.one('SELECT ref, swms_id FROM swms_reviews WHERE swms_id = $1', [id]);
  assert.deepEqual([row.ref, row.swms_id], [old, id]);
  assert.equal((await (await call('GET', `/api/verify/${old}`)).json()).review.label, 'Approved');
  const listed = await (await call('GET', '/api/swms', { token })).json();
  assert.equal(listed.swms.find((entry) => entry.id === id).review.label, 'Approved');
});

test('the reviewer sees the revision exactly as saved, never who signed on or how they read it', async () => {
  const { id, ref, signonPath } = await savedSwms('own3@business.example');
  // A worker signs on before the review.
  const signToken = new URL(signonPath, base).searchParams.get('t');
  const signed = await call('POST', `/api/sign/${signToken}`, { body: { name: 'Wiremu Worker', company: 'Crew Co', signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAABRB27rAAAADElEQVR4nGNgYGAAAAAEAAGnV0ytAAAAAElFTkTINXpH', confirmed: true, explained: true, supervisor: 'Sam Supervisor' } });
  assert.equal(signed.status, 201);
  assert.equal((await call('GET', `/api/review/swms/${ref}`)).status, 401, 'the reference alone does not open the SWMS');
  const reviewer = await reviewerSignIn('reader@tierone.example', ref);
  const response = await call('GET', `/api/review/swms/${ref.toLowerCase()}`, { reviewer });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const text = await response.text();
  const data = JSON.parse(text);
  const kept = await revisions.getRevision(id, 1);
  assert.equal(data.revision, 1);
  assert.equal(data.current, true);
  assert.equal(data.business, 'Business own3 Pty Ltd');
  assert.deepEqual(data.draft.jobSteps, kept.draft.jobSteps, 'the kept revision, not today\'s library');
  assert.equal(data.draft.task, kept.draft.task);
  assert.deepEqual(data.draft.workers, []);
  assert.equal(data.draft.controlEdits, undefined);
  assert.equal(data.input, undefined, 'the answers as typed are not sent');
  for (const word of ['Wiremu', 'Crew Co', 'Sam Supervisor', 'signons', 'signature', 'read_seconds', 'sections_viewed']) assert.ok(!text.includes(word), `the reviewer does not see ${word}`);
  // Who checked it part by part prints on the SWMS (D286), so the reviewer sees it as printed.
  assert.deepEqual(data.checked.map(([label]) => label), ['Name', 'Role', 'Date', 'Parts checked']);
  assert.equal(data.checked[0][1], 'Alex Chen');
  assert.deepEqual(data.responses, []);
  // Each look is logged.
  const log = await db.query('SELECT action, ref FROM review_access_log WHERE reviewer_email = $1', ['reader@tierone.example']);
  assert.deepEqual(log.map((row) => [row.action, row.ref]), [['view', ref]]);
});

// ---- Today's content on the read-only sheet ----

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
const SHORING = 'Staged basement excavation with ground anchors, shoring wall and temporary props, excavated by 20 t excavator, saw cut the existing slab.';
const GIVEN = { id: 'shoring', what: 'Shoring design', status: 'given', by: 'Smith Engineering', number: 'ABC-S-101', revision: 'Rev C', date: '2026-10-03' };
const BOGGY = 'ground onsite is very boggy';
const pdf = (extra = '') => Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R ${extra}>> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`);
const upload = async (token, data, name) => (await (await call('POST', '/api/designs/files', { token, raw: data, headers: { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent(name) } })).json()).file;

// A SWMS with today's parts: a design with its file, a product from its safety data sheet with its
// file, a hazard the user added with its own control, and a SiteWrite hazard that does not apply.
function richInput(designFile, sdsFile) {
  const start = answered({ ...ANSWERED, state: 'qld', fallRisk: 'no', residential: 'no', task: SHORING, date: '14 October 2026', designs: [{ ...GIVEN, file: designFile }] });
  const first = prepareDraft(draftBody(ready(start)));
  const types = ((first.substances && first.substances.items) || []).map((item) => item.product);
  const type = types[0];
  const product = {
    id: 'sub-1', type, product: 'FuelMax Diesel', supplier: 'Example Fuels Pty Ltd', sdsDate: '2024-03-12', hazards: ['H226 Flammable liquid and vapour.'],
    controls: ['Wear chemical resistant gloves (nitrile).'], firstAid: ['Skin: wash with soap and water.'], storage: ['Store away from ignition sources.'], confirmed: true, file: sdsFile,
  };
  let input = ready({ ...start, substances: [product], substancesNotUsed: types.filter((item) => item !== type) });
  // The basement edge step, wherever the order of the work puts it (messy round 10): its fall hazard is the one marked not applying.
  const steps = prepareDraft(draftBody(input)).jobSteps;
  const step = steps.find((item) => item.step === 'Protect the basement edge') || steps[1];
  input = { ...input, hazardEdits: { [step.step]: { changed: [], added: [BOGGY], notApplicable: [step.hazards[0]], own: { [BOGGY]: { written: ['Duckboards are laid over the wet areas.'] } } } } };
  return { input, step: step.step, removed: step.hazards[0], type };
}

test('the read-only sheet carries today\'s content: designs, products from their SDS, step PPE, own and removed hazards', async () => {
  const token = await signIn('rich@business.example');
  const designFile = await upload(token, pdf('/Title (rev C)'), 'ABC-S-101 rev C.pdf');
  const sdsFile = await upload(token, pdf('/Title (SDS)'), 'FuelMax SDS.pdf');
  const { input, step, removed } = richInput(designFile, sdsFile);
  const saved = await call('POST', '/api/swms', { token, body: checked({ input, ...CONFIRM }) });
  assert.equal(saved.status, 201, JSON.stringify(await saved.clone().json()));
  const { swms } = await saved.json();
  const { ref } = (await (await call('GET', `/api/swms/${swms.id}`, { token })).json()).swms;
  owners.set(swms.id, token);
  const reviewer = await reviewerSignIn('rich@tierone.example', ref);
  const data = await (await call('GET', `/api/review/swms/${ref}`, { reviewer })).json();
  // The designs table, as it prints, with the file to open.
  assert.equal(data.tables.designs.title, 'Designs this SWMS relies on');
  assert.equal(data.tables.designs.rows[0][0], 'Shoring design');
  assert.match(data.tables.designs.rows[0][2], /ABC-S-101 rev C/);
  assert.deepEqual(data.tables.designs.files[0], { id: designFile.id, name: 'ABC-S-101 rev C.pdf' });
  // Each product from its safety data sheet, with its controls and file.
  assert.equal(data.tables.substances.title, 'Hazardous substances');
  assert.match(data.tables.substances.rows[0][0], /FuelMax Diesel/);
  assert.match(data.tables.substances.rows[0][2], /chemical resistant gloves/);
  assert.deepEqual(data.tables.substances.files[0], { id: sdsFile.id, name: 'FuelMax SDS.pdf' });
  // The step that uses the product names it, and the extra PPE for particular steps is listed with its steps.
  assert.ok(data.draft.jobSteps.some((item) => item.controls.some((line) => /FuelMax Diesel/.test(line))));
  assert.ok(data.tables.stepPpe.length >= 1, 'PPE for particular steps');
  assert.ok(data.tables.stepPpe.every((item) => item.label && item.steps.length));
  // The user's own hazard with its own control, and a removed SiteWrite hazard marked as not applying.
  const printed = data.draft.jobSteps.find((item) => item.step === step);
  assert.ok(printed.hazards.includes(`${BOGGY} (Our own hazard)`));
  assert.ok(printed.hazards.includes(`${removed} (Does not apply to this job)`));
  assert.ok(printed.controls.includes('Duckboards are laid over the wet areas. (Our own control)'));
  assert.equal(data.draft.ownHazards, undefined, 'the page\'s working list is not sent');
  // The reviewer opens the files the revision names, and only those; each is logged.
  const got = await call('GET', `/api/review/swms/${ref}/files/${designFile.id}`, { reviewer });
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(Buffer.from(await got.arrayBuffer()), pdf('/Title (rev C)'));
  assert.equal((await call('GET', `/api/review/swms/${ref}/files/${sdsFile.id}`, { reviewer })).status, 200);
  assert.equal((await call('GET', `/api/review/swms/${ref}/files/${designFile.id}`)).status, 401);
  const stray = await upload(token, pdf('/Title (stray)'), 'stray.pdf');
  assert.equal((await call('GET', `/api/review/swms/${ref}/files/${stray.id}`, { reviewer })).status, 404, 'a file the revision does not name');
  const log = await db.query('SELECT action FROM review_access_log WHERE reviewer_email = $1', ['rich@tierone.example']);
  assert.equal(log.filter((row) => row.action === 'file').length, 2);
  // The page renders the sheet from these; its script holds the marks and table parts it shows.
  const script = await (await call('GET', '/review.js')).text();
  for (const words of ['Does not apply to this job', 'Our own hazard', 'For particular steps', 'Hold point:', 'Job step', 'Risk rating']) assert.ok(script.includes(words), words);
});

test('Builder check runs on the kept revision with no upload and no AI', async () => {
  const { id, ref } = await savedSwms('own4@business.example');
  const reviewer = await reviewerSignIn('checker@tierone.example', ref);
  assert.equal((await call('POST', `/api/review/swms/${ref}/check`)).status, 401);
  const response = await call('POST', `/api/review/swms/${ref}/check`, { reviewer });
  assert.equal(response.status, 200);
  const result = await response.json();
  const kept = await revisions.getRevision(id, 1);
  const expected = checkSwms(fromDraft(kept.draft, { state: 'qld' }), { state: 'qld', stage: 'review' });
  assert.equal(result.kind, 'check');
  assert.equal(result.score, expected.score);
  assert.equal(result.band, expected.band);
  assert.deepEqual(result.hardFails, expected.hardFails);
  assert.equal(result.email, undefined, 'the response goes through SiteWrite, not a copied email');
});

test('approved with conditions is recorded against the revision, the business is told its review is back, and sees it under My SWMS', async () => {
  const { token, id, ref } = await savedSwms('own5@business.example');
  const reviewer = await reviewerSignIn('pc@tierone.example', ref);
  const respond = (body) => call('POST', `/api/review/swms/${ref}/response`, { reviewer, body: { name: 'Priya Shah', company: 'Tier One Builders', ...body } });
  const refused = async (body, pattern, field) => {
    const response = await respond(body);
    assert.equal(response.status, 400, JSON.stringify(body));
    const data = await response.json();
    assert.match(data.message, pattern);
    if (field) assert.equal(data.field, field);
  };
  await refused({ response: 'maybe' }, /Choose a response/);
  await refused({ response: 'conditions', text: '  ' }, /^Write the conditions of the approval\.$/, 'text');
  await refused({ response: 'conditions', text: 'none' }, /If there are none, choose Approved/, 'text');
  await refused({ response: 'conditions', text: 'TBC.' }, /If there are none, choose Approved/, 'text');
  await refused({ response: 'changes' }, /^Write the changes needed\.$/, 'text');
  await refused({ response: 'changes', text: 'n/a' }, /so the business knows what to fix/, 'text');
  await refused({ response: 'approved', name: '' }, /^Enter your name\.$/, 'name');
  await refused({ response: 'approved', company: ' ' }, /^Enter your company\.$/, 'company');
  assert.equal((await call('POST', `/api/review/swms/${ref}/response`, { body: { response: 'approved', name: 'A', company: 'B' } })).status, 401);
  assert.equal((await db.query('SELECT id FROM swms_reviews WHERE swms_id = $1', [id])).length, 0, 'nothing refused is kept');
  const before = mailbox.length;
  const conditions = 'Exclusion zone under the work to be barricaded.\nOperator ticket sighted before start.';
  const sent = await respond({ response: 'conditions', text: conditions });
  assert.equal(sent.status, 201);
  const { review } = await sent.json();
  assert.equal(review.label, 'Approved with conditions');
  assert.equal(review.revision, 1);
  assert.equal(review.name, 'Priya Shah');
  assert.equal(review.company, 'Tier One Builders');
  assert.match(review.date, /^\d{1,2} [A-Z][a-z]+ \d{4}$/);
  assert.equal(review.email, undefined);
  const row = await db.one('SELECT * FROM swms_reviews WHERE swms_id = $1', [id]);
  assert.equal(row.revision, 1);
  assert.equal(row.ref, ref);
  assert.equal(row.reviewer_email, 'pc@tierone.example');
  assert.equal(row.text, conditions);
  assert.equal(typeof row.check_score, 'number', 'the check result on the revision is kept with the response');
  // The business's people are emailed that the review is back, by whom, and nothing else (D283).
  const mails = mailbox.slice(before);
  const mail = mails.find((item) => item.to === 'own5@business.example');
  assert.ok(mail, 'the business is emailed');
  assert.equal(mail.subject, 'Your SWMS review is back');
  assert.equal(mail.text, 'Your SWMS review is back.\n\nFrom Priya Shah, Tier One Builders.');
  for (const words of ['Approved', 'Exclusion zone', 'http', 'Fix this', ref]) assert.ok(!mail.text.includes(words) && !mail.subject.includes(words), `the email does not carry ${words}`);
  assert.equal(mails.filter((item) => item.to === 'pc@tierone.example').length, 0, 'the reviewer is not emailed');
  // The business sees it on the SWMS, with the reviewer's email, and in its list.
  const opened = await (await call('GET', `/api/swms/${id}`, { token })).json();
  assert.equal(opened.reviews.length, 1);
  assert.equal(opened.reviews[0].label, 'Approved with conditions');
  assert.equal(opened.reviews[0].email, 'pc@tierone.example');
  assert.match(opened.reviews[0].text, /Operator ticket/);
  const listed = await (await call('GET', '/api/swms', { token })).json();
  const item = listed.swms.find((entry) => entry.id === id);
  assert.equal(item.review.label, 'Approved with conditions');
  assert.equal(item.review.date, review.date);
  // "Fix this in SiteWrite" is on the page, not in the email.
  const page = await (await call('GET', '/account.js')).text();
  assert.ok(page.includes('Fix this in SiteWrite'));
  // The business's own check is named for the business, apart from the principal contractor's review (D290).
  assert.ok(page.includes('Mark as checked by ${esc(ownName())}'));
  assert.ok(!page.includes('Mark reviewed') && !page.includes('Mark as reviewed'));
  // The verify page shows the response and its date only: no names and no conditions (D286).
  const verified = await (await call('GET', `/api/verify/${ref}`)).json();
  assert.deepEqual(verified.review, { label: 'Approved with conditions', response: 'conditions', date: review.date });
  assert.equal(verified.reviewable, true);
  const shown = JSON.stringify(verified);
  for (const words of ['Priya', 'Tier One', 'Exclusion', 'pc@tierone']) assert.ok(!shown.includes(words), `the verify page does not show ${words}`);
  // The reviewer sees the response on the revision, and the name and company fill in next time.
  const again = await (await call('GET', `/api/review/swms/${ref}`, { reviewer })).json();
  assert.equal(again.responses[0].label, 'Approved with conditions');
  const me = await (await call('GET', '/api/review/me', { reviewer })).json();
  assert.equal(me.reviewer.name, 'Priya Shah');
  assert.equal(me.reviewer.company, 'Tier One Builders');
});

test('the same response sent twice (a double press, or Back and send again) is kept and emailed once', async () => {
  const { id, ref } = await savedSwms('twice@business.example');
  const reviewer = await reviewerSignIn('twice@tierone.example', ref);
  const body = { response: 'changes', text: 'Add the traffic management for the delivery gate.', name: 'Lee Park', company: 'Tier One Builders' };
  const before = mailbox.length;
  assert.equal((await call('POST', `/api/review/swms/${ref}/response`, { reviewer, body })).status, 201);
  const again = await call('POST', `/api/review/swms/${ref}/response`, { reviewer, body });
  assert.equal(again.status, 200);
  const data = await again.json();
  assert.equal(data.repeated, true);
  assert.equal(data.review.label, 'Not approved');
  assert.equal((await db.query('SELECT id FROM swms_reviews WHERE swms_id = $1', [id])).length, 1);
  assert.equal(mailbox.slice(before).filter((item) => item.to === 'twice@business.example').length, 1);
  // A different response is a new one, and stands.
  const changed = await call('POST', `/api/review/swms/${ref}/response`, { reviewer, body: { ...body, response: 'approved', text: '' } });
  assert.equal(changed.status, 201);
  assert.equal((await db.query('SELECT id FROM swms_reviews WHERE swms_id = $1', [id])).length, 2);
  assert.equal((await reviews.latestReview(id, 1)).label, 'Approved');
  assert.equal(mailbox.slice(before).filter((item) => item.to === 'twice@business.example').length, 2);
});

test('a later revision starts unreviewed, and a response on the old revision is refused', async () => {
  const { token, id, ref } = await savedSwms('own6@business.example');
  const reviewer = await reviewerSignIn('pc2@tierone.example', ref);
  const body = { response: 'approved', name: 'Lee Park', company: 'Tier One Builders' };
  assert.equal((await call('POST', `/api/review/swms/${ref}/response`, { reviewer, body })).status, 201);
  // Revision 2 has no step that cuts concrete, so the slab product listed for revision 1's post holes goes.
  // The cement its fence step pours stays listed (a step that uses it cannot be "Not required", content8).
  const kept = (INPUT.substances || []).filter((row) => row.type !== require('../public/substance-rules').SILICA);
  const changed = await call('PUT', `/api/swms/${id}`, { token, body: checked({ input: { ...INPUT, task: `${INPUT.task} Replace the gate too.`, substances: kept.length ? kept : undefined }, ...CONFIRM }) });
  assert.equal(changed.status, 200);
  const opened = await (await call('GET', `/api/swms/${id}`, { token })).json();
  assert.equal(opened.swms.revision, 2);
  assert.notEqual(opened.swms.ref, ref);
  assert.match(opened.swms.reviewLink, new RegExp(`/review\\.html\\?ref=${opened.swms.ref}$`));
  const list = await (await call('GET', '/api/swms', { token })).json();
  assert.equal(list.swms.find((item) => item.id === id).review, null, 'revision 2 is not reviewed');
  assert.equal(opened.reviews.length, 1, 'revision 1\'s response is still kept');
  assert.equal(opened.reviews[0].revision, 1);
  assert.equal((await (await call('GET', `/api/verify/${opened.swms.ref}`)).json()).review, null);
  const old = await (await call('GET', `/api/review/swms/${ref}`, { reviewer })).json();
  assert.equal(old.current, false);
  assert.equal(old.latestRevision, 2);
  const refused = await call('POST', `/api/review/swms/${ref}/response`, { reviewer, body: { ...body, response: 'conditions', text: 'A new condition.' } });
  assert.equal(refused.status, 409);
  assert.match((await refused.json()).message, /This is revision 1\. The business has saved revision 2 since/);
  assert.equal((await (await call('GET', `/api/verify/${ref}`)).json()).reviewable, false);
  // The new revision takes its own response.
  const changes = await call('POST', `/api/review/swms/${opened.swms.ref}/response`, { reviewer, body: { ...body, response: 'changes', text: 'Add the gate hinge pinch point.' } });
  assert.equal(changes.status, 201);
  const verified = await (await call('GET', `/api/verify/${opened.swms.ref}`)).json();
  assert.deepEqual(Object.keys(verified.review).sort(), ['date', 'label', 'response']);
  assert.equal(verified.review.label, 'Not approved');
});

test('the business that prepared a SWMS cannot review it, and a deleted SWMS cannot be opened', async () => {
  const { token, id, ref } = await savedSwms('own7@business.example');
  // The business cannot invite its own people (D313), and they are not sent a sign-in link.
  const own = await call('POST', `/api/swms/${id}/review-invites`, { token, body: { email: 'OWN7@business.example ' } });
  assert.equal(own.status, 403);
  assert.match((await own.json()).message, /belongs to the business that prepared the SWMS, so it cannot review it/);
  assert.equal((await call('POST', '/api/review/email', { body: { email: 'own7@business.example', ref } })).status, 403);
  // Someone invited who then joins the business cannot respond either.
  const reviewer = await reviewerSignIn('mate7@business.example', ref);
  await call('POST', '/api/company/users', { token, body: { email: 'mate7@business.example' } });
  assert.equal((await call('POST', '/api/auth/verify', { body: { token: lastLinkToken('mate7@business.example') } })).status, 200);
  const response = await call('POST', `/api/review/swms/${ref}/response`, { reviewer, body: { response: 'approved', name: 'Own', company: 'Own' } });
  assert.equal(response.status, 403);
  assert.match((await response.json()).message, /belongs to the business that prepared the SWMS/);
  assert.equal((await db.query('SELECT id FROM swms_reviews WHERE swms_id = $1', [id])).length, 0);
  await call('DELETE', `/api/swms/${id}`, { token });
  const gone = await call('GET', `/api/review/swms/${ref}`, { reviewer });
  assert.equal(gone.status, 404);
  assert.match((await gone.json()).message, /has deleted it/);
});

test('responses are removed with a deleted SWMS, and expired reviewer sessions are removed', async () => {
  const { token, id, ref } = await savedSwms('own8@business.example');
  const reviewer = await reviewerSignIn('pc3@tierone.example', ref);
  await call('POST', `/api/review/swms/${ref}/response`, { reviewer, body: { response: 'approved', name: 'Kim Lo', company: 'Tier One Builders' } });
  await call('DELETE', `/api/swms/${id}`, { token });
  await db.query('UPDATE reviewer_sessions SET expires_at = $1', [new Date(Date.now() - 1000)]);
  await removeExpired(new Date(Date.now() + 31 * 24 * 60 * 60 * 1000));
  assert.equal((await db.query('SELECT id FROM swms_reviews WHERE swms_id = $1', [id])).length, 0);
  assert.equal((await db.query('SELECT token_hash FROM reviewer_sessions')).length, 0);
});

test('conditions are kept de-identified for learning only when control learning is on', async () => {
  const { ref, id } = await savedSwms('own9@business.example');
  const reviewer = await reviewerSignIn('jo.bloggs@tierone.example', ref);
  const before = await count('review_learning');
  delete process.env.CONTROL_LEARNING;
  await call('POST', `/api/review/swms/${ref}/response`, { reviewer, body: { response: 'conditions', text: 'Barricade the work area.', name: 'Jo Bloggs', company: 'Tier One Builders' } });
  assert.equal(await count('review_learning'), before, 'nothing is kept with learning off');
  process.env.CONTROL_LEARNING = 'on';
  try {
    const sent = await call('POST', `/api/review/swms/${ref}/response`, { reviewer, body: { response: 'changes', name: 'Jo Bloggs', company: 'Tier One Builders', text: 'Call Jo Bloggs on 0412 345 678 before the gate is lifted.\nTier One Builders site rules apply.' } });
    assert.equal(sent.status, 201);
  } finally {
    delete process.env.CONTROL_LEARNING;
  }
  const rows = await db.query('SELECT * FROM review_learning');
  assert.equal(rows.length, before + 1);
  const row = rows.find((item) => item.response === 'changes');
  assert.equal(row.state, 'qld');
  assert.equal(row.revision, 1);
  assert.notEqual(row.swms_key, id, 'the SWMS is known only by a keyed fingerprint');
  assert.match(row.text, /before the gate is lifted/);
  const stored = JSON.stringify(row);
  for (const word of ['Jo', 'Bloggs', '0412', 'Tier One', 'tierone', 'own9', 'Business own9', id, ref]) assert.ok(!stored.includes(word), `the learning row does not keep ${word}`);
});

test('the Word and PDF files say where to review the SWMS in SiteWrite', async () => {
  const { token, id, ref } = await savedSwms('own10@business.example');
  const response = await call('GET', `/api/swms/${id}/docx`, { token });
  assert.equal(response.status, 200);
  const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
  const xml = await zip.file('word/document.xml').async('string');
  assert.ok(xml.includes(`/review.html?ref=${ref}`), 'the review link is printed');
  assert.ok(xml.includes('Or review it in SiteWrite and send your response from there'));
  const { reviewInvite } = require('../docx-draft');
  assert.equal(reviewInvite(''), '');
  assert.equal((await call('GET', `/api/swms/${id}/pdf`, { token })).status, 200);
});
