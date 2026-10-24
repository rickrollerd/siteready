// Reviewers by invitation only (D313). The business invites the principal contractor's reviewer by email
// on a saved SWMS; only an invited email is sent a sign-in link, and every reviewer route asks again, so a
// removed invitation stops an open session at once. An invitation covers the SWMS's later revisions, never
// another SWMS. Reviewers who had responded before invitations began are invited by the migration.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.RATE_LIMIT_REVIEW_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { app } = require('../server');
const db = require('../db');
const reviews = require('../reviews');
const { validAbn } = require('../accounts');
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

async function call(method, route, { body, token, reviewer } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(reviewer ? { 'X-Reviewer-Token': reviewer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = response.headers.get('content-type') || '';
  return { status: response.status, data: type.includes('json') ? await response.json() : null };
}

let abnSeed = 0;
function nextAbn() {
  for (;;) {
    abnSeed += 1;
    const digits = crypto.createHash('sha256').update(`invite${abnSeed}`).digest('hex').replace(/\D/g, '').slice(0, 11);
    if (digits.length === 11 && digits[0] !== '0' && validAbn(digits)) return digits;
  }
}

async function signIn(email, name) {
  await call('POST', '/api/auth/email', { body: { email } });
  const { token } = (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).data;
  assert.equal((await call('PUT', '/api/company', { token, body: { name, abn: nextAbn() } })).status, 200);
  if (name) await call('PUT', '/api/me', { token, body: { name: `Alex ${name.split(' ')[0]}` } });
  return token;
}

const INPUT = ready({ ...ANSWERED, state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no', date: '14 October 2026' });
const CONFIRM = { reviewConfirmed: true, reviewedBy: 'Alex Chen' };

async function savedSwms(token, task = INPUT.task) {
  const saved = await call('POST', '/api/swms', { token, body: checked({ input: { ...INPUT, task }, ...CONFIRM }) });
  assert.equal(saved.status, 201, JSON.stringify(saved.data));
  const id = saved.data.swms.id;
  const opened = (await call('GET', `/api/swms/${id}`, { token })).data;
  return { id, ref: opened.swms.ref, opened };
}

const lastMail = (email) => [...mailbox].reverse().find((item) => item.to === email);

async function signInReviewer(email, ref) {
  const sent = await call('POST', '/api/review/email', { body: { email, ref } });
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  const login = /review\.html\?ref=[^&\s]+&login=([A-Za-z0-9_-]+)/.exec(lastMail(email).text)[1];
  return (await call('POST', '/api/review/verify', { body: { token: login } })).data.token;
}

const invite = (token, id, email) => call('POST', `/api/swms/${id}/review-invites`, { token, body: { email } });
const NOT_INVITED = (business) => `This email has not been invited to review this SWMS. Ask ${business} to invite you from SiteWrite.`;
const REMOVED = (business) => `Your invitation to review this SWMS has been removed by ${business}. Ask them to invite you again from SiteWrite.`;
const logged = async (email, action) => (await db.query('SELECT id FROM review_access_log WHERE reviewer_email = $1 AND action = $2', [email, action])).length;

test('an email not invited is refused a sign-in link, plainly, and the refusal is logged', async () => {
  const token = await signIn('owner1@fence.example', 'Fenceline Pty Ltd');
  const { ref } = await savedSwms(token);
  const before = mailbox.length;
  const refused = await call('POST', '/api/review/email', { body: { email: 'stranger@tierone.example', ref } });
  assert.equal(refused.status, 403);
  assert.equal(refused.data.message, NOT_INVITED('Fenceline Pty Ltd'));
  assert.equal(mailbox.length, before, 'no email is sent');
  assert.equal(await logged('stranger@tierone.example', 'refused-signin'), 1);
  assert.equal(await db.one("SELECT token_hash FROM login_tokens WHERE email = 'stranger@tierone.example'"), null, 'no sign-in link is made');
  // A reference that is not in SiteWrite's records is still named as such.
  assert.equal((await call('POST', '/api/review/email', { body: { email: 'stranger@tierone.example', ref: 'SW-2222-2222' } })).status, 404);
});

test('an invited email is sent the invitation, signs in, views, checks and responds; the business sees the review back', async () => {
  const token = await signIn('owner2@fence.example', 'Gatehouse Pty Ltd');
  const { id, ref, opened } = await savedSwms(token);
  assert.deepEqual(opened.invites, [], 'no one is invited to start with');
  const sent = await invite(token, id, ' PC@TierOne.example ');
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  assert.equal(sent.data.message, 'pc@tierone.example has been invited and sent the review link.');
  assert.deepEqual(sent.data.invites.map((item) => [item.email, item.by, item.earlier]), [['pc@tierone.example', 'Alex Gatehouse', false]]);
  // The invitation: short and plain, with the review link and no attachments.
  const mail = lastMail('pc@tierone.example');
  assert.equal(mail.subject, 'Alex Gatehouse has asked you to review a SWMS');
  assert.equal(mail.text, `Alex Gatehouse from Gatehouse Pty Ltd has asked you to review the SWMS ${opened.swms.title} in SiteWrite.\n\n${opened.swms.reviewLink}\n\nOpen the link and sign in with this email address. You need no SiteWrite account.`);
  assert.ok(!mail.attachments || !mail.attachments.length, 'no attachments');
  // Invited again: sent again, listed once.
  const again = await invite(token, id, 'pc@tierone.example');
  assert.equal(again.status, 200);
  assert.match(again.data.message, /was already invited\. The invitation has been sent again\./);
  assert.equal(again.data.invites.length, 1);
  const reviewer = await signInReviewer('pc@tierone.example', ref);
  const view = await call('GET', `/api/review/swms/${ref}`, { reviewer });
  assert.equal(view.status, 200);
  assert.equal(view.data.business, 'Gatehouse Pty Ltd');
  assert.equal((await call('POST', `/api/review/swms/${ref}/check`, { reviewer })).status, 200);
  const response = await call('POST', `/api/review/swms/${ref}/response`, { reviewer, body: { response: 'conditions', text: 'Spotter on the footpath.', name: 'Pat Reviewer', company: 'Tier One Builders' } });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  const back = (await call('GET', `/api/swms/${id}`, { token })).data;
  assert.equal(back.reviews[0].label, 'Approved with conditions');
  assert.equal(back.reviews[0].email, 'pc@tierone.example');
  // Anyone signed in to the business sees who is invited.
  assert.equal((await call('GET', `/api/swms/${id}/review-invites`, { token })).data.invites[0].email, 'pc@tierone.example');
  // Another business never sees or changes them.
  const other = await signIn('owner2b@other.example', 'Other Pty Ltd');
  assert.equal((await call('GET', `/api/swms/${id}/review-invites`, { token: other })).status, 404);
  assert.equal((await invite(other, id, 'x@tierone.example')).status, 404);
  assert.equal((await call('POST', `/api/swms/${id}/review-invites`, { body: { email: 'x@tierone.example' } })).status, 401, 'signed out');
  assert.equal((await invite(token, id, 'not an email')).status, 400);
});

test('a removed invitation is refused on every route at once, an open session included, and can be given again', async () => {
  const token = await signIn('owner3@fence.example', 'Postline Pty Ltd');
  const { id, ref } = await savedSwms(token);
  const { invites } = (await invite(token, id, 'gone@tierone.example')).data;
  const reviewer = await signInReviewer('gone@tierone.example', ref);
  assert.equal((await call('GET', `/api/review/swms/${ref}`, { reviewer })).status, 200);
  const removed = await call('DELETE', `/api/swms/${id}/review-invites/${invites[0].id}`, { token });
  assert.equal(removed.status, 200);
  assert.equal(removed.data.message, 'gone@tierone.example can no longer open or respond to this SWMS.');
  assert.deepEqual(removed.data.invites, []);
  assert.equal((await call('DELETE', `/api/swms/${id}/review-invites/${invites[0].id}`, { token })).status, 404, 'removed already');
  for (const [method, route, body] of [['GET', `/api/review/swms/${ref}`], ['GET', `/api/review/swms/${ref}/files/any`], ['POST', `/api/review/swms/${ref}/check`],
    ['POST', `/api/review/swms/${ref}/response`, { response: 'approved', name: 'Pat', company: 'Tier One' }]]) {
    const refused = await call(method, route, { reviewer, body });
    assert.equal(refused.status, 403, `${method} ${route}`);
    assert.equal(refused.data.message, REMOVED('Postline Pty Ltd'));
  }
  assert.equal((await db.query('SELECT id FROM swms_reviews WHERE swms_id = $1', [id])).length, 0, 'no response was recorded');
  assert.equal(await logged('gone@tierone.example', 'refused'), 4);
  const signin = await call('POST', '/api/review/email', { body: { email: 'gone@tierone.example', ref } });
  assert.equal(signin.status, 403);
  assert.equal(signin.data.message, REMOVED('Postline Pty Ltd'));
  // The session itself is still the reviewer's (they may be invited to other SWMS).
  assert.equal((await call('GET', '/api/review/me', { reviewer })).status, 200);
  // Invited again, the same session opens it again.
  assert.equal((await invite(token, id, 'gone@tierone.example')).status, 201);
  assert.equal((await call('GET', `/api/review/swms/${ref}`, { reviewer })).status, 200);
});

test('an invitation to one SWMS never opens another, even of the same business', async () => {
  const token = await signIn('owner4@fence.example', 'Twofold Pty Ltd');
  const a = await savedSwms(token);
  const b = await savedSwms(token, 'Replace a 3m length of timber fence and a gate.');
  await invite(token, a.id, 'only-a@tierone.example');
  const reviewer = await signInReviewer('only-a@tierone.example', a.ref);
  assert.equal((await call('GET', `/api/review/swms/${a.ref}`, { reviewer })).status, 200);
  const other = await call('GET', `/api/review/swms/${b.ref}`, { reviewer });
  assert.equal(other.status, 403);
  assert.equal(other.data.message, NOT_INVITED('Twofold Pty Ltd'));
  assert.equal((await call('POST', `/api/review/swms/${b.ref}/response`, { reviewer, body: { response: 'approved', name: 'Pat', company: 'Tier One' } })).status, 403);
  assert.equal((await call('POST', '/api/review/email', { body: { email: 'only-a@tierone.example', ref: b.ref } })).status, 403);
});

test('the business cannot invite its own people', async () => {
  const token = await signIn('owner5@fence.example', 'Selfsame Pty Ltd');
  const { id } = await savedSwms(token);
  const own = await invite(token, id, 'Owner5@fence.example');
  assert.equal(own.status, 403);
  assert.equal(own.data.message, reviews.OWN_BUSINESS);
  assert.equal((await db.query('SELECT id FROM swms_review_invites WHERE swms_id = $1', [id])).length, 0);
});

test('an invitation covers the SWMS\'s later revisions', async () => {
  const token = await signIn('owner6@fence.example', 'Laterwood Pty Ltd');
  const { id, ref } = await savedSwms(token);
  await invite(token, id, 'later@tierone.example');
  const reviewer = await signInReviewer('later@tierone.example', ref);
  const changed = await call('PUT', `/api/swms/${id}`, { token, body: checked({ input: { ...INPUT, task: `${INPUT.task} Replace the gate too.` }, ...CONFIRM }) });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  const next = (await call('GET', `/api/swms/${id}`, { token })).data.swms;
  assert.equal(next.revision, 2);
  assert.equal((await call('GET', `/api/review/swms/${next.ref}`, { reviewer })).status, 200);
  assert.equal((await call('POST', `/api/review/swms/${next.ref}/response`, { reviewer, body: { response: 'approved', name: 'Lee Park', company: 'Tier One' } })).status, 201);
  // A new sign-in from the new reference works too.
  assert.equal((await call('POST', '/api/review/email', { body: { email: 'later@tierone.example', ref: next.ref } })).status, 200);
});

test('the migration invites reviewers who had already responded, once, and never one the business removed', async () => {
  const token = await signIn('owner7@fence.example', 'Earlybird Pty Ltd');
  const { id, ref } = await savedSwms(token);
  // A response given before invitations began, and one on a SiteLink submission.
  const row = (email, submission = '') => db.query(`INSERT INTO swms_reviews (id, swms_id, revision, ref, reviewer_id, reviewer_email, reviewer_name, reviewer_company, response, text, created_at, submission_id)
    VALUES ($1, $2, 1, $3, $4, $5, 'Old Reviewer', 'Old Builders', 'approved', '', $6, $7)`, [crypto.randomUUID(), id, ref, crypto.randomUUID(), email, new Date('2026-10-20T01:00:00Z'), submission]);
  await row('early@tierone.example');
  await row('early@tierone.example');
  await row('lead@builder.example', 'sub-1');
  await db.inviteEarlierReviewers();
  await db.inviteEarlierReviewers();
  const { invites } = (await call('GET', `/api/swms/${id}/review-invites`, { token })).data;
  assert.deepEqual(invites.map((item) => [item.email, item.earlier, item.by]), [['early@tierone.example', true, '']]);
  assert.equal(invites[0].date, '20 October 2026');
  const stored = await db.one('SELECT * FROM swms_review_invites WHERE id = $1', [invites[0].id]);
  assert.deepEqual([stored.invited_by, stored.source, stored.company_id], [null, 'earlier-review', (await db.one('SELECT company_id FROM swms WHERE id = $1', [id])).company_id]);
  // The earlier reviewer is not locked out.
  const reviewer = await signInReviewer('early@tierone.example', ref);
  assert.equal((await call('GET', `/api/review/swms/${ref}`, { reviewer })).status, 200);
  // Removed by the business, it stays removed when the migrations run again.
  await call('DELETE', `/api/swms/${id}/review-invites/${invites[0].id}`, { token });
  await db.inviteEarlierReviewers();
  assert.deepEqual((await call('GET', `/api/swms/${id}/review-invites`, { token })).data.invites, []);
  assert.equal((await call('GET', `/api/review/swms/${ref}`, { reviewer })).status, 403);
});

test('invitations go with a deleted SWMS', async () => {
  const token = await signIn('owner8@fence.example', 'Shortlived Pty Ltd');
  const { id, ref } = await savedSwms(token);
  await invite(token, id, 'brief@tierone.example');
  const reviewer = await signInReviewer('brief@tierone.example', ref);
  await call('DELETE', `/api/swms/${id}`, { token });
  const gone = await call('GET', `/api/review/swms/${ref}`, { reviewer });
  assert.equal(gone.status, 404);
  assert.match(gone.data.message, /has deleted it/);
  await require('../accounts').removeExpired(new Date(Date.now() + 31 * 24 * 60 * 60 * 1000));
  assert.equal((await db.query('SELECT id FROM swms_review_invites WHERE swms_id = $1', [id])).length, 0);
});
