// Goal 10: after a change to the law or the library, customers are told which saved SWMS to
// review. A change that only moves the printed regulation version, or the list of laws and codes,
// is flagged and listed under "What would change". Each released change marks the saved SWMS it
// would print differently in My SWMS and emails each business's administrator one list.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const db = require('../db');
const revisions = require('../revisions');
const notices = require('../library-notices');
const { setupAccounts, lastLinkToken, mailbox, ANSWERED, ready } = require('./helpers');

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

let abnSeed = 300;
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

async function signIn(email, name) {
  await call('POST', '/api/auth/email', { body: { email } });
  const { token } = await (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).json();
  await call('PUT', '/api/company', { token, body: { name, abn: newAbn() } });
  return token;
}

const FENCE = { ...ANSWERED, task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no', date: '5 October 2026' };
const CONFIRM = { reviewConfirmed: true, reviewedBy: 'Alex Chen' };

async function save(token, input, title) {
  const response = await call('POST', '/api/swms', { token, body: { input: ready(input), title, ...CONFIRM } });
  assert.equal(response.status, 201);
  return (await response.json()).swms;
}

// The saved revision, as if it had been saved under the library as it was before a change.
async function age(swmsId, change) {
  const row = await db.one('SELECT draft, revision FROM swms_revisions WHERE swms_id = $1 ORDER BY revision DESC LIMIT 1', [swmsId]);
  const draft = typeof row.draft === 'string' ? JSON.parse(row.draft) : row.draft;
  change(draft);
  await db.query('UPDATE swms_revisions SET draft = $1 WHERE swms_id = $2 AND revision = $3', [JSON.stringify(draft), swmsId, row.revision]);
}

test('a change that only moves the printed regulation version is flagged and listed', async () => {
  const token = await signIn('version@notice.example', 'Version Fencing Pty Ltd');
  const swms = await save(token, { ...FENCE, state: 'nsw' });
  const now = (await (await call('GET', `/api/swms/${swms.id}`, { token })).json());
  assert.equal(now.update.available, false);
  const current = now.draft.versionLabel;
  assert.ok(current);
  await age(swms.id, (draft) => { draft.versionLabel = 'current version from 1 March 2026'; });
  const detail = await (await call('GET', `/api/swms/${swms.id}`, { token })).json();
  assert.equal(detail.update.available, true);
  assert.deepEqual(detail.update.changes, [`Law changed from "Work Health and Safety Regulation 2025 (NSW), current version from 1 March 2026, ${now.draft.sectionRef}" to "Work Health and Safety Regulation 2025 (NSW), ${current}, ${now.draft.sectionRef}"`]);
});

test('a change that only moves the list of laws and codes is flagged and listed', async () => {
  const token = await signIn('sources@notice.example', 'Sources Fencing Pty Ltd');
  const swms = await save(token, { ...FENCE, state: 'nsw' });
  let dropped;
  await age(swms.id, (draft) => {
    dropped = draft.sources.codes.pop();
    draft.sources.codes.push('SafeWork NSW Code of practice: An older code (May 2001)');
  });
  const detail = await (await call('GET', `/api/swms/${swms.id}`, { token })).json();
  assert.equal(detail.update.available, true);
  assert.deepEqual(detail.update.changes.sort(), [
    `Law or code listed added: ${dropped}`,
    'Law or code listed removed: SafeWork NSW Code of practice: An older code (May 2001)',
  ].sort());
});

test('any other printed difference is still listed, never "What would change (0)"', () => {
  const draft = { jobSteps: [], plant: [{ item: 'Post hole auger', inspection: 'Pre-start check.', licence: 'No' }], emergency: [], review: 'Old review wording.' };
  const after = { ...draft, plant: [{ item: 'Post hole auger', inspection: 'Pre-start check each shift.', licence: 'No' }], review: 'New review wording.' };
  const lines = revisions.changesBetween(draft, after).map(revisions.changeText);
  assert.ok(lines.includes('Plant added: Post hole auger. Pre-start check each shift.. licence: No'));
  assert.ok(lines.includes('Review wording changed from "Old review wording." to "New review wording."'));
  const odd = revisions.changesBetween({ jobSteps: [], substances: { items: [], note: 'a' } }, { jobSteps: [], substances: { items: [], note: 'b' } }).map(revisions.changeText);
  assert.deepEqual(odd, ['Other printed wording changed']);
});

test('a released change marks each affected SWMS and emails each administrator one list', async () => {
  const tokenA = await signIn('admin-a@notice.example', 'Alpha Fencing Pty Ltd');
  const fenceA = await save(tokenA, { ...FENCE, state: 'nsw' }, 'Fence repairs');
  const paintA = await save(tokenA, { ...FENCE, state: 'nsw', task: 'Replace a 5m length of timber fence.' }, 'Back fence');
  const untouched = await save(tokenA, { ...FENCE, state: 'nsw', task: 'Replace a 7m length of timber fence.' }, 'Side fence');
  // A second person in business A who is not its administrator.
  const companyA = (await db.one('SELECT company_id FROM users WHERE email = $1', ['admin-a@notice.example'])).company_id;
  await db.query('INSERT INTO users (id, company_id, email, is_admin, created_at) VALUES ($1, $2, $3, FALSE, $4)', ['notice-member', companyA, 'member-a@notice.example', new Date()]);
  const tokenB = await signIn('admin-b@notice.example', 'Bravo Fencing Pty Ltd');
  const fenceB = await save(tokenB, { ...FENCE, state: 'nsw' }, 'Boundary fence');
  // A Queensland SWMS is left alone by a notice for NSW, even when it would change.
  const qld = await save(tokenB, { ...FENCE, state: 'qld' }, 'Queensland fence');
  const older = (draft) => { draft.versionLabel = 'current version from 1 March 2026'; };
  for (const id of [fenceA.id, paintA.id, fenceB.id, qld.id]) await age(id, older);

  const reason = 'The NSW Work Health and Safety Regulation 2025 has a new version in force from 1 November 2026.';
  const sent = mailbox.length;
  // The other tests' businesses have changed SWMS too; this one looks at A and B only.
  const companyB = (await db.one('SELECT company_id FROM users WHERE email = $1', ['admin-b@notice.example'])).company_id;
  const results = await notices.runLibraryNotices({ notices: [{ id: 'test-nsw-reg-2026-11', reason, released: '2026-11-03', states: ['nsw'], companies: [companyA, companyB] }] });
  assert.deepEqual(results, [{ id: 'test-nsw-reg-2026-11', swms: 3, companies: 2, emails: 2 }]);
  const mail = mailbox.slice(sent);
  assert.deepEqual(mail.map((item) => item.to).sort(), ['admin-a@notice.example', 'admin-b@notice.example']);
  const toA = mail.find((item) => item.to === 'admin-a@notice.example');
  assert.equal(toA.subject, 'SiteReady: 2 SWMS to review after a change');
  assert.match(toA.text, new RegExp(reason.replace(/[.()]/g, '\\$&')));
  assert.match(toA.text, /- Back fence \(revision 1\): 1 change\n- Fence repairs \(revision 1\): 1 change/);
  assert.doesNotMatch(toA.text, /Side fence|Boundary fence/);
  assert.match(toA.text, /still prints as it was saved/);
  assert.match(toA.text, /make a new revision with the updated wording\. Your workers then sign on to the new revision\./);
  assert.doesNotMatch(toA.text, /—/, 'no em dashes');

  // Marked in My SWMS, with the reason.
  const list = (await (await call('GET', '/api/swms', { token: tokenA })).json()).swms;
  const marks = Object.fromEntries(list.map((item) => [item.title, item.changeReview]));
  assert.deepEqual(marks['Fence repairs'], [reason]);
  assert.deepEqual(marks['Back fence'], [reason]);
  assert.deepEqual(marks['Side fence'], []);
  const listB = (await (await call('GET', '/api/swms', { token: tokenB })).json()).swms;
  assert.deepEqual(listB.find((item) => item.id === qld.id).changeReview, []);
  const detail = await (await call('GET', `/api/swms/${fenceA.id}`, { token: tokenA })).json();
  assert.deepEqual(detail.update.reasons, [reason]);
  assert.equal(detail.update.available, true);

  // A notice runs once: a restart sends nothing more.
  const again = await notices.runLibraryNotices({ notices: [{ id: 'test-nsw-reg-2026-11', reason, states: ['nsw'] }] });
  assert.deepEqual(again, []);
  assert.equal(mailbox.length, sent + 2);

  // A new revision with the updated wording clears the mark; so does marking the SWMS reviewed.
  await call('PUT', `/api/swms/${fenceA.id}`, { token: tokenA, body: { reason: 'Updated wording', ...CONFIRM } });
  await call('POST', `/api/swms/${paintA.id}/reviewed`, { token: tokenA, body: CONFIRM });
  const after = (await (await call('GET', '/api/swms', { token: tokenA })).json()).swms;
  assert.deepEqual(after.map((item) => item.changeReview), [[], [], []]);
  assert.equal((await (await call('GET', `/api/swms/${fenceA.id}`, { token: tokenA })).json()).update.available, false);
  assert.ok(untouched.id);
});

test('the notices file is read safely, and a change with nothing affected sends nothing', async () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'notices-')), 'notices.json');
  fs.writeFileSync(file, JSON.stringify({ notices: [{ id: 'a', reason: 'A reason.' }, { id: '', reason: 'No id.' }, { id: 'b' }] }));
  assert.deepEqual(notices.readNotices(file).map((item) => item.id), ['a']);
  assert.deepEqual(notices.readNotices(path.join(path.dirname(file), 'missing.json')), []);
  // The file shipped with the app is valid.
  assert.ok(Array.isArray(require('../library-notices.json').notices));
  const sent = mailbox.length;
  const results = await notices.runLibraryNotices({ notices: [{ id: 'test-wa-nothing', reason: 'A Western Australian code changed.', states: ['wa'] }] });
  assert.deepEqual(results, [{ id: 'test-wa-nothing', swms: 0, companies: 0, emails: 0 }]);
  assert.equal(mailbox.length, sent);
});
