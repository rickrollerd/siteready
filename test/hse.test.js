// Goal 12 stage 3: SiteLink, the main contractor's HSE lead and team. They sign in free on /sitelink as
// reviewers (no company, no trial), set up the account, invite and remove people, make projects and
// set each project's site details, where each change is a new version. One account never sees
// another's projects: every route checks the person has joined the account.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.RATE_LIMIT_HSE_REQUESTS = '5000';
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const db = require('../db');
const hse = require('../hse');
const { setupAccounts, lastLinkToken, mailbox } = require('./helpers');
const abnRegister = require('../abn');
const { validAbn } = require('../accounts');

// The ABN register, as the tests set it. An ABN not listed here is answered as when the lookup is
// not set up, so no test reaches the real register.
const register = new Map();
abnRegister.lookupAbn = async (raw) => {
  const abn = String(raw || '').replace(/\D/g, '');
  const answer = register.get(abn);
  if (typeof answer === 'function') return answer();
  return answer || { enabled: false };
};
const listed = (entityName, businessNames = [], status = 'Active') => ({ enabled: true, found: true, active: status === 'Active', status, entityName, businessNames });
const NOT_LISTED = { enabled: true, found: false, error: 'The ABN was not found on the Australian Business Register.' };
const DOWN = { enabled: true, found: false, unavailable: true, error: 'The ABN lookup is not available right now. Type your business details.' };

// A different valid ABN each time.
let abnSeed = 51000000000;
function nextAbn() {
  for (abnSeed += 101; ; abnSeed += 1) if (validAbn(String(abnSeed))) return String(abnSeed);
}

let server;
let base;

test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

async function call(method, route, { body, reviewer, token } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(reviewer ? { 'X-Reviewer-Token': reviewer } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

// The HSE page's sign-in link from the last email to that address.
function hseLink(email) {
  const message = [...mailbox].reverse().find((item) => item.to === email);
  return message && /\/sitelink\?login=([A-Za-z0-9_-]+)/.exec(message.text);
}

async function hseSignIn(email, name = '') {
  assert.equal((await call('POST', '/api/hse/email', { body: { email } })).status, 200);
  const link = hseLink(email);
  assert.ok(link, 'the email links to the HSE page');
  const { status, data } = await call('POST', '/api/hse/verify', { body: { token: link[1] } });
  assert.equal(status, 200);
  if (name) assert.equal((await call('PUT', '/api/hse/me', { reviewer: data.token, body: { name, position: 'HSE manager' } })).status, 200);
  return data.token;
}

async function accountSignIn(email) {
  await call('POST', '/api/auth/email', { body: { email } });
  const { data } = await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } });
  return data.token;
}

// A lead with an account and a project.
async function leadWithProject(email, orgName, name = 'Riley Morgan') {
  const lead = await hseSignIn(email, name);
  const org = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: orgName, abn: nextAbn() } });
  assert.equal(org.status, 201, JSON.stringify(org.data));
  const project = await call('POST', `/api/hse/orgs/${org.data.org.id}/projects`, { reviewer: lead, body: { name: 'Harbour Street offices', workplace: '40 Harbour Street, Sydney NSW 2000', state: 'nsw' } });
  assert.equal(project.status, 201, JSON.stringify(project.data));
  return { lead, orgId: org.data.org.id, projectId: project.data.project.id };
}

async function invite(lead, orgId, email, name) {
  const sent = await call('POST', `/api/hse/orgs/${orgId}/members`, { reviewer: lead, body: { email } });
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  const member = await hseSignIn(email, name);
  // Joining happens when the invited person signs in with that email.
  await call('GET', '/api/hse/me', { reviewer: member });
  return member;
}

const count = async (table) => Number((await db.one(`SELECT COUNT(*) AS n FROM ${table}`)).n);
const DETAILS = {
  musterPoint: 'Car park on Kent Street, by the site office',
  firstAider: 'Jo Park, 0412 000 111',
  firstAidLocation: 'Site office, ground floor',
  hospital: 'Sydney Hospital and Sydney Eye Hospital, Macquarie Street',
  scaffoldSupervisor: 'Pat Doyle, Tallow Scaffolding',
  siteManager: 'Sam Lee',
  siteRules: '- Sign in at the site office\n- Hard hats past the gate\n\n- No work before 7 am',
};

test('no company, user or trial is ever made for the HSE lead or the team', async () => {
  const before = { companies: await count('companies'), users: await count('users'), trials: Number((await db.one("SELECT COUNT(*) AS n FROM events WHERE type = 'trial_started'")).n) };
  const { lead, orgId, projectId } = await leadWithProject('lead1@corbel.example', 'Corbel Build Pty Ltd');
  const member = await invite(lead, orgId, 'member1@corbel.example', 'Ash Kim');
  assert.equal((await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: member, body: { baseRev: 0, details: DETAILS } })).status, 200);
  assert.equal(await count('companies'), before.companies);
  assert.equal(await count('users'), before.users);
  assert.equal(Number((await db.one("SELECT COUNT(*) AS n FROM events WHERE type = 'trial_started'")).n), before.trials);
  // The sign-in email says SiteLink and links to /sitelink; a SiteLink link never opens an account.
  await call('POST', '/api/hse/email', { body: { email: 'nobody@corbel.example' } });
  const message = [...mailbox].reverse().find((item) => item.to === 'nobody@corbel.example');
  assert.equal(message.subject, 'Your SiteLink sign-in link');
  assert.match(message.text, /^Use this link to sign in to SiteLink by SiteWrite\./);
  assert.match(message.text, /\/sitelink\?login=/);
  assert.match(message.text, /SiteLink is free for main contractors\./);
  assert.doesNotMatch(message.text, /main contractors\.\n|SiteWrite for main contractors/);
  assert.equal((await call('POST', '/api/auth/verify', { body: { token: hseLink('nobody@corbel.example')[1] } })).status, 400);
  assert.equal(await count('users'), before.users);
});

test('the same email as a subcontractor account signs in separately, and neither session opens the other', async () => {
  const account = await accountSignIn('both@tallow.example');
  const companies = await count('companies');
  const reviewer = await hseSignIn('both@tallow.example', 'Pat Doyle');
  assert.equal(await count('companies'), companies, 'no second company');
  const me = await call('GET', '/api/hse/me', { reviewer });
  assert.equal(me.status, 200);
  assert.equal(me.data.me.email, 'both@tallow.example');
  assert.deepEqual(me.data.orgs, []);
  // The account session does not open the HSE side, and the HSE session does not open the account.
  assert.equal((await call('GET', '/api/hse/me', { token: account })).status, 401);
  assert.equal((await call('GET', '/api/hse/me', { reviewer: account })).status, 401);
  assert.equal((await call('GET', '/api/me', { token: reviewer })).status, 401);
  assert.equal((await call('GET', '/api/me', { token: account })).status, 200, 'the account still works');
  // Signing out of one leaves the other signed in.
  await call('POST', '/api/hse/logout', { reviewer });
  assert.equal((await call('GET', '/api/hse/me', { reviewer })).status, 401);
  assert.equal((await call('GET', '/api/me', { token: account })).status, 200);
});

test('setting up the account needs a name and a valid ABN', async () => {
  const lead = await hseSignIn('lead2@corbel.example');
  const noName = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Corbel Build Pty Ltd' } });
  assert.equal(noName.status, 400);
  assert.equal(noName.data.field, 'name');
  assert.equal((await call('PUT', '/api/hse/me', { reviewer: lead, body: { name: '  ' } })).status, 400);
  await call('PUT', '/api/hse/me', { reviewer: lead, body: { name: 'Riley Morgan' } });
  assert.equal((await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: '' } })).status, 400);
  const badAbn = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Corbel Build Pty Ltd', abn: '12 345 678 901' } });
  assert.equal(badAbn.status, 400);
  assert.equal(badAbn.data.field, 'abn');
  assert.equal(badAbn.data.message, 'That ABN is not valid. Check the 11 digits.');
  // The ABN links the account to the company, so it is needed (D303).
  const noAbn = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Corbel Build Pty Ltd', abn: '' } });
  assert.equal(noAbn.status, 400);
  assert.equal(noAbn.data.field, 'abn');
  assert.match(noAbn.data.message, /Enter the company's ABN/);
  assert.equal((await call('GET', '/api/hse/me', { reviewer: lead })).data.orgs.length, 0);
  const made = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Corbel Build Pty Ltd', abn: nextAbn() } });
  assert.equal(made.status, 201);
  assert.equal(made.data.org.role, 'lead');
  const me = await call('GET', '/api/hse/me', { reviewer: lead });
  assert.equal(me.data.orgs.length, 1);
  assert.equal(me.data.orgs[0].role, 'lead');
});

test('the lead invites and removes people; a member cannot remove the lead or anyone else', async () => {
  const { lead, orgId, projectId } = await leadWithProject('lead3@corbel.example', 'Corbel Build Pty Ltd');
  // A typo in the email, then fixed: the wrong one is cancelled and cannot join later.
  const typo = await call('POST', `/api/hse/orgs/${orgId}/members`, { reviewer: lead, body: { email: 'ash@corbel.exmaple' } });
  assert.equal(typo.status, 201);
  const mail = [...mailbox].reverse().find((item) => item.to === 'ash@corbel.exmaple');
  assert.equal(mail.subject, 'Riley Morgan has added you to Corbel Build Pty Ltd on SiteLink');
  assert.match(mail.text, /^Riley Morgan has added you to the Corbel Build Pty Ltd team on SiteLink by SiteWrite\./);
  assert.match(mail.text, /\/sitelink\?login=/);
  assert.match(mail.text, /go to http:\/\/[^ ]+\/sitelink and sign in/);
  const wrong = typo.data.team.find((person) => person.email === 'ash@corbel.exmaple');
  assert.equal(wrong.joined, false);
  const cancelled = await call('DELETE', `/api/hse/orgs/${orgId}/members/${wrong.id}`, { reviewer: lead });
  assert.equal(cancelled.status, 200);
  assert.match(cancelled.data.message, /cancelled/);
  const stray = await hseSignIn('ash@corbel.exmaple', 'Someone Else');
  assert.deepEqual((await call('GET', '/api/hse/me', { reviewer: stray })).data.orgs, [], 'a cancelled invitation joins no one');
  assert.equal((await call('GET', `/api/hse/projects/${projectId}`, { reviewer: stray })).status, 404);
  const member = await invite(lead, orgId, 'ash@corbel.example', 'Ash Kim');
  const other = await invite(lead, orgId, 'lee@corbel.example', 'Lee Ng');
  const team = (await call('GET', `/api/hse/orgs/${orgId}`, { reviewer: member })).data.team;
  assert.deepEqual(team.map((person) => [person.email, person.role, person.joined]), [['lead3@corbel.example', 'lead', true], ['ash@corbel.example', 'member', true], ['lee@corbel.example', 'member', true]]);
  // Inviting someone already in the team is refused; inviting a waiting person again sends it again.
  assert.equal((await call('POST', `/api/hse/orgs/${orgId}/members`, { reviewer: lead, body: { email: 'ash@corbel.example' } })).status, 409);
  await call('POST', `/api/hse/orgs/${orgId}/members`, { reviewer: lead, body: { email: 'later@corbel.example' } });
  const again = await call('POST', `/api/hse/orgs/${orgId}/members`, { reviewer: lead, body: { email: 'later@corbel.example' } });
  assert.equal(again.status, 200);
  assert.match(again.data.message, /sent again/);
  assert.equal(again.data.team.filter((person) => person.email === 'later@corbel.example').length, 1);
  // A member cannot add, remove the lead, or remove another member.
  const leadRow = team.find((person) => person.role === 'lead');
  const otherRow = team.find((person) => person.email === 'lee@corbel.example');
  assert.equal((await call('POST', `/api/hse/orgs/${orgId}/members`, { reviewer: member, body: { email: 'x@corbel.example' } })).status, 403);
  const noLead = await call('DELETE', `/api/hse/orgs/${orgId}/members/${leadRow.id}`, { reviewer: member });
  assert.equal(noLead.status, 403);
  assert.match(noLead.data.message, /The lead cannot be removed/);
  assert.equal((await call('DELETE', `/api/hse/orgs/${orgId}/members/${otherRow.id}`, { reviewer: member })).status, 403);
  // Nor can the lead remove the lead.
  assert.equal((await call('DELETE', `/api/hse/orgs/${orgId}/members/${leadRow.id}`, { reviewer: lead })).status, 403);
  assert.equal((await call('GET', `/api/hse/orgs/${orgId}`, { reviewer: lead })).data.team.length, 4);
  // The lead removes a member, who then sees nothing of the account.
  assert.equal((await call('GET', `/api/hse/projects/${projectId}`, { reviewer: other })).status, 200);
  const removed = await call('DELETE', `/api/hse/orgs/${orgId}/members/${otherRow.id}`, { reviewer: lead });
  assert.equal(removed.status, 200);
  assert.equal((await call('GET', `/api/hse/projects/${projectId}`, { reviewer: other })).status, 404);
  assert.equal((await call('GET', `/api/hse/orgs/${orgId}`, { reviewer: other })).status, 404);
  assert.deepEqual((await call('GET', '/api/hse/me', { reviewer: other })).data.orgs, []);
  // Only the lead changes the account's name.
  assert.equal((await call('PUT', `/api/hse/orgs/${orgId}`, { reviewer: member, body: { name: 'Other' } })).status, 403);
  assert.equal((await call('PUT', `/api/hse/orgs/${orgId}`, { reviewer: lead, body: { name: 'Corbel Build (NSW) Pty Ltd' } })).status, 200);
});

test('each change to the site details makes a new version; an unchanged save makes none', async () => {
  const { lead, orgId, projectId } = await leadWithProject('lead4@corbel.example', 'Corbel Build Pty Ltd');
  const start = (await call('GET', `/api/hse/projects/${projectId}`, { reviewer: lead })).data;
  assert.equal(start.siteDetails.rev, 0);
  assert.equal(start.project.pcName, 'Corbel Build Pty Ltd', 'the principal contractor defaults to the account name');
  assert.equal(start.project.postcode, '2000');
  const first = await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 0, details: DETAILS } });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.siteDetails.rev, 1);
  assert.deepEqual(first.data.siteDetails.details.siteRules, ['Sign in at the site office', 'Hard hats past the gate', 'No work before 7 am']);
  assert.equal(first.data.siteDetails.details.firstAidLocation, 'Site office, ground floor');
  assert.equal(first.data.siteDetails.setBy, 'Riley Morgan');
  const same = await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 1, details: first.data.siteDetails.details } });
  assert.equal(same.data.saved, false);
  assert.equal(same.data.siteDetails.rev, 1);
  const second = await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 1, details: { ...first.data.siteDetails.details, musterPoint: 'Kent Street gate' } } });
  assert.equal(second.data.siteDetails.rev, 2);
  assert.deepEqual(second.data.versions.map((v) => [v.rev, v.changed]), [[2, ['Muster point']], [1, ['Muster point', 'First aider', 'First aid location', 'Hospital or medical centre', 'Scaffold supervisor', 'Site manager', 'Site rules']]]);
  assert.equal(second.data.log[0].text, 'Riley Morgan set site details version 2: muster point.');
  // Each version is kept as it was.
  const old = await call('GET', `/api/hse/projects/${projectId}/site-details/1`, { reviewer: lead });
  assert.equal(old.data.siteDetails.details.musterPoint, DETAILS.musterPoint);
  assert.equal((await call('GET', `/api/hse/projects/${projectId}/site-details/9`, { reviewer: lead })).status, 404);
  assert.equal(await count(`project_site_details WHERE project_id = '${projectId}'`), 2);
  // A placeholder is refused at its box, and nothing is saved.
  const tbc = await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 2, details: { ...DETAILS, hospital: 'TBC' } } });
  assert.equal(tbc.status, 400);
  assert.equal(tbc.data.field, 'hospital');
  assert.equal(await count(`project_site_details WHERE project_id = '${projectId}'`), 2);
  assert.equal(orgId.length > 0, true);
});

test('two people editing at once: different details are both kept, the same detail is asked', async () => {
  const { lead, orgId, projectId } = await leadWithProject('lead5@corbel.example', 'Corbel Build Pty Ltd');
  const member = await invite(lead, orgId, 'ash5@corbel.example', 'Ash Kim');
  await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 0, details: DETAILS } });
  const v1 = (await call('GET', `/api/hse/projects/${projectId}`, { reviewer: lead })).data.siteDetails.details;
  // Both open version 1. The member saves the muster point; the lead then saves the first aider.
  assert.equal((await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: member, body: { baseRev: 1, details: { ...v1, musterPoint: 'Kent Street gate' } } })).data.siteDetails.rev, 2);
  const merged = await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 1, details: { ...v1, firstAider: 'Lou Tran, 0400 222 333' } } });
  assert.equal(merged.status, 200);
  assert.equal(merged.data.siteDetails.rev, 3);
  assert.equal(merged.data.siteDetails.details.musterPoint, 'Kent Street gate');
  assert.equal(merged.data.siteDetails.details.firstAider, 'Lou Tran, 0400 222 333');
  assert.match(merged.data.message, /Ash Kim had also changed muster point\. Both changes are kept\./);
  // Both change the hospital from version 3: the second is not saved and is shown the first.
  const v3 = merged.data.siteDetails.details;
  await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: member, body: { baseRev: 3, details: { ...v3, hospital: 'St Vincent\'s Hospital, Darlinghurst' } } });
  const clash = await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 3, details: { ...v3, hospital: 'Royal Prince Alfred Hospital, Camperdown' } } });
  assert.equal(clash.status, 409);
  assert.deepEqual(clash.data.conflict.clash, ['hospital']);
  assert.equal(clash.data.conflict.current.rev, 4);
  assert.equal(clash.data.conflict.current.details.hospital, 'St Vincent\'s Hospital, Darlinghurst');
  assert.match(clash.data.message, /Ash Kim saved version 4 while you were editing/);
  // Saving again from version 4 is kept.
  assert.equal((await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 4, details: { ...v3, hospital: 'Royal Prince Alfred Hospital, Camperdown' } } })).data.siteDetails.rev, 5);
  // A version that does not exist yet is refused.
  assert.equal((await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 9, details: v3 } })).status, 400);
  // Saves sent at the same moment never make two versions with one number.
  const results = await Promise.all([1, 2, 3].map((n) => call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: n % 2 ? lead : member, body: { baseRev: 5, details: { ...v3, siteManager: `Pat Ng ${n}` } } })));
  const revs = (await db.query('SELECT rev FROM project_site_details WHERE project_id = $1', [projectId])).map((row) => Number(row.rev));
  assert.equal(new Set(revs).size, revs.length);
  assert.ok(results.every((r) => [200, 409].includes(r.status)), JSON.stringify(results.map((r) => r.status)));
});

test('a project needs a name, a job address and a state', async () => {
  const { lead, orgId, projectId } = await leadWithProject('lead6@corbel.example', 'Corbel Build Pty Ltd');
  for (const [body, field] of [[{ workplace: '1 A St, Sydney NSW 2000', state: 'nsw' }, 'name'], [{ name: 'X', state: 'nsw' }, 'workplace'], [{ name: 'X', workplace: '1 A St', state: 'zz' }, 'state']]) {
    const made = await call('POST', `/api/hse/orgs/${orgId}/projects`, { reviewer: lead, body });
    assert.equal(made.status, 400);
    assert.equal(made.data.field, field);
  }
  const changed = await call('PUT', `/api/hse/projects/${projectId}`, { reviewer: lead, body: { name: 'Harbour Street offices stage 2', workplace: '40 Harbour Street, Sydney NSW 2000', state: 'nsw', pcName: 'Corbel Build (NSW) Pty Ltd' } });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.project.pcName, 'Corbel Build (NSW) Pty Ltd');
});

test('one account never sees another account\'s projects, on every route', async () => {
  const a = await leadWithProject('lead-a@corbel.example', 'Corbel Build Pty Ltd');
  const b = await leadWithProject('lead-b@marlin.example', 'Marlin Constructions Pty Ltd', 'Dana Cho');
  const bMember = await invite(b.lead, b.orgId, 'member-b@marlin.example', 'Kit Ray');
  await call('PUT', `/api/hse/projects/${a.projectId}/site-details`, { reviewer: a.lead, body: { baseRev: 0, details: DETAILS } });
  const aTeam = (await call('GET', `/api/hse/orgs/${a.orgId}`, { reviewer: a.lead })).data.team;
  const aLeadRow = aTeam[0].id;
  const outsider = await hseSignIn('outsider@nowhere.example', 'Out Sider');
  const account = await accountSignIn('subbie@tallow.example');
  // Every route that names account A or its project, tried by B's lead, B's member, a signed-in
  // person in no account, an account session and no one at all.
  const routes = [
    ['GET', `/api/hse/orgs/${a.orgId}`],
    ['PUT', `/api/hse/orgs/${a.orgId}`, { name: 'Taken' }],
    ['POST', `/api/hse/orgs/${a.orgId}/members`, { email: 'spy@marlin.example' }],
    ['DELETE', `/api/hse/orgs/${a.orgId}/members/${aLeadRow}`],
    ['GET', `/api/hse/orgs/${a.orgId}/projects`],
    ['POST', `/api/hse/orgs/${a.orgId}/projects`, { name: 'Spy', workplace: '1 A St, Sydney NSW 2000', state: 'nsw' }],
    ['GET', `/api/hse/projects/${a.projectId}`],
    ['PUT', `/api/hse/projects/${a.projectId}`, { name: 'Spy', workplace: '1 A St, Sydney NSW 2000', state: 'nsw' }],
    ['GET', `/api/hse/projects/${a.projectId}/site-details/1`],
    ['POST', `/api/hse/orgs/${a.orgId}/abn-check`],
    ['POST', `/api/hse/orgs/${a.orgId}/members/${aLeadRow}/lead`],
    ['PUT', `/api/hse/projects/${a.projectId}/site-details`, { baseRev: 1, details: { ...DETAILS, musterPoint: 'Spy' } }],
  ];
  const projectsBefore = await count('projects');
  for (const [method, path, body] of routes) {
    for (const [who, reviewer] of [['other lead', b.lead], ['other member', bMember], ['in no account', outsider]]) {
      const answer = await call(method, path, { reviewer, body });
      assert.equal(answer.status, 404, `${who}: ${method} ${path} gave ${answer.status}`);
      assert.doesNotMatch(JSON.stringify(answer.data), /Corbel|Harbour|Kent Street/, `${who}: ${method} ${path} says nothing of the account`);
    }
    assert.equal((await call(method, path, { token: account, body })).status, 401, `account session: ${method} ${path}`);
    assert.equal((await call(method, path, { body })).status, 401, `signed out: ${method} ${path}`);
  }
  // Nothing was changed by any of them.
  assert.equal(await count('projects'), projectsBefore);
  const page = (await call('GET', `/api/hse/projects/${a.projectId}`, { reviewer: a.lead })).data;
  assert.equal(page.siteDetails.rev, 1);
  assert.equal(page.project.name, 'Harbour Street offices');
  assert.equal(page.team.length, 1);
  assert.equal(page.org.name, 'Corbel Build Pty Ltd');
  // Each lead's own list holds only its own projects.
  const bList = (await call('GET', '/api/hse/me', { reviewer: b.lead })).data.orgs;
  assert.deepEqual(bList.map((org) => org.name), ['Marlin Constructions Pty Ltd']);
  assert.ok(bList[0].projects.every((project) => project.orgId === b.orgId));
  assert.deepEqual((await call('GET', `/api/hse/orgs/${b.orgId}/projects`, { reviewer: b.lead })).data.projects.map((p) => p.id), [b.projectId]);
});

test('the site details keep the SWMS field names, and list the two new ones', () => {
  assert.deepEqual(hse.FIELDS.map((field) => field.key), ['musterPoint', 'firstAider', 'firstAidLocation', 'hospital', 'scaffoldSupervisor', 'siteManager', 'siteRules']);
  assert.deepEqual(hse.cleanDetails({ siteRules: ['1. One', '• Two', '', '  '] }).siteRules, ['One', 'Two']);
  assert.throws(() => hse.cleanDetails({ musterPoint: 'tba' }), /Leave muster point empty until you know it/);
  assert.throws(() => hse.cleanDetails({ siteRules: 'Hard hats\nTBC' }), /Take out the rule "TBC"/);
});

// ---- D303: SiteLink, the ABN check, one account for each ABN, and handing over the lead ----

const leadsOf = async (orgId) => Number((await db.one("SELECT COUNT(*) AS n FROM org_members WHERE org_id = $1 AND role = 'lead'", [orgId])).n);

test('an account shows Unverified until its ABN matches the ABN register', async () => {
  const lead = await hseSignIn('verify1@corbel.example', 'Riley Morgan');
  const orgs = await count('orgs');
  // The register is down, or not set up: the account is set up, Unverified, and nothing breaks.
  const downAbn = nextAbn();
  register.set(downAbn, DOWN);
  const down = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Corbel Build Pty Ltd', abn: downAbn } });
  assert.equal(down.status, 201, JSON.stringify(down.data));
  assert.equal(down.data.org.verified, false);
  assert.equal(down.data.org.abnCheck, 'unavailable');
  assert.match(down.data.message, /The ABN register could not be checked just now, so the account shows Unverified for now\./);
  const offLead = await hseSignIn('verify-off@corbel.example', 'Sam Lee');
  const off = await call('POST', '/api/hse/orgs', { reviewer: offLead, body: { name: 'Corbel Build Pty Ltd', abn: nextAbn() } });
  assert.equal(off.status, 201);
  assert.equal(off.data.org.verified, false);
  // A lookup that fails outright is the same as the register being down.
  const brokenLead = await hseSignIn('verify-broken@corbel.example', 'Jo Park');
  const brokenAbn = nextAbn();
  register.set(brokenAbn, () => { throw new Error('offline'); });
  const broken = await call('POST', '/api/hse/orgs', { reviewer: brokenLead, body: { name: 'Corbel Build Pty Ltd', abn: brokenAbn } });
  assert.equal(broken.status, 201);
  assert.equal(broken.data.org.verified, false);
  // When the register is back, the lead checks again. A member cannot.
  register.set(downAbn, listed('CORBEL BUILD PTY LTD', ['Corbel Build']));
  const member = await invite(lead, down.data.org.id, 'verify1-member@corbel.example', 'Ash Kim');
  assert.equal((await call('POST', `/api/hse/orgs/${down.data.org.id}/abn-check`, { reviewer: member })).status, 403);
  const again = await call('POST', `/api/hse/orgs/${down.data.org.id}/abn-check`, { reviewer: lead });
  assert.equal(again.status, 200);
  assert.equal(again.data.org.verified, true);
  assert.equal(again.data.message, 'The account is verified: its ABN matches the ABN register.');
  // Every member sees the account as verified.
  assert.equal((await call('GET', '/api/hse/me', { reviewer: member })).data.orgs[0].verified, true);
  // A new name that is not on the register makes it Unverified, and a business name on it counts.
  const renamed = await call('PUT', `/api/hse/orgs/${down.data.org.id}`, { reviewer: lead, body: { name: 'Harbour Projects' } });
  assert.equal(renamed.data.org.verified, false);
  assert.equal(renamed.data.org.registerName, 'Corbel Build Pty Ltd');
  assert.equal(renamed.data.message, 'The account details are saved.');
  // The register's name is shown, with where to write if this is that company: never offered as a one-click rename.
  assert.equal(renamed.data.org.abnNote, 'The ABN register lists this ABN under Corbel Build Pty Ltd. The account shows Unverified. If this account is for Corbel Build Pty Ltd, contact SiteWrite at sitereadyaus@gmail.com to have it checked.');
  // While the register is down, the names it gave before still count.
  register.set(downAbn, DOWN);
  const back = await call('PUT', `/api/hse/orgs/${down.data.org.id}`, { reviewer: lead, body: { name: 'Corbel Build' } });
  assert.equal(back.data.org.verified, true);
  const legal = await call('PUT', `/api/hse/orgs/${down.data.org.id}`, { reviewer: lead, body: { name: 'Corbel Build Pty. Ltd.' } });
  assert.equal(legal.data.org.verified, true);
  assert.equal(await count('orgs'), orgs + 3);
});

test('setting up with a wrong ABN asks first, and an ABN that is not on the register is refused', async () => {
  const lead = await hseSignIn('verify2@tallow.example', 'Pat Doyle');
  const orgs = await count('orgs');
  // The ABN belongs to another company: nothing is set up, and the register's name is offered.
  const wrong = nextAbn();
  register.set(wrong, listed('MARLIN CONSTRUCTIONS PTY LTD'));
  const asked = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Tallow Build Pty Ltd', abn: wrong } });
  assert.equal(asked.status, 409);
  assert.equal(asked.data.field, 'abn');
  assert.deepEqual(asked.data.register, { name: 'Marlin Constructions Pty Ltd' });
  assert.match(asked.data.message, new RegExp(`The ABN register lists ABN ${wrong.slice(0, 2)} ${wrong.slice(2, 5)} ${wrong.slice(5, 8)} ${wrong.slice(8)} under Marlin Constructions Pty Ltd, not Tallow Build Pty Ltd\\. Check the ABN\\.`));
  assert.equal(await count('orgs'), orgs);
  // Not on the register, or cancelled: refused at the ABN box.
  const missing = nextAbn();
  register.set(missing, NOT_LISTED);
  const notListed = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Tallow Build Pty Ltd', abn: missing } });
  assert.equal(notListed.status, 400);
  // The check digits are right, so it does not say to check the 11 digits: it says the register does
  // not list it, and what to do (messy round 6).
  assert.equal(notListed.data.message, `The ABN register does not list ABN ${missing.slice(0, 2)} ${missing.slice(2, 5)} ${missing.slice(5, 8)} ${missing.slice(8)}. Check it against the company's records. A company registered in the last few days may not be listed yet: try again in a few days, or contact SiteWrite at sitereadyaus@gmail.com.`);
  assert.doesNotMatch(notListed.data.message, /11 digits/);
  const cancelled = nextAbn();
  register.set(cancelled, listed('TALLOW BUILD PTY LTD', [], 'Cancelled'));
  assert.match((await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Tallow Build Pty Ltd', abn: cancelled } })).data.message, /shows that ABN as cancelled/);
  assert.equal(await count('orgs'), orgs);
  // The right ABN: set up and verified.
  const right = nextAbn();
  register.set(right, listed('TALLOW BUILD PTY LTD', ['Tallow Scaffolding']));
  const made = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Tallow Build Pty Ltd', abn: `${right.slice(0, 2)} ${right.slice(2, 5)} ${right.slice(5, 8)} ${right.slice(8)}` } });
  assert.equal(made.status, 201);
  assert.equal(made.data.org.verified, true);
  assert.equal(made.data.org.abn, right);
  assert.match(made.data.message, /^Your account is set up\. Its ABN matches the ABN register\./);
  // Someone who keeps their own name is set up Unverified.
  const other = await hseSignIn('verify2b@kestrel.example', 'Kit Ray');
  register.set(wrong, listed('KESTREL GROUP PTY LTD'));
  const kept = await call('POST', '/api/hse/orgs', { reviewer: other, body: { name: 'Kestrel Interiors', abn: wrong, keepName: true } });
  assert.equal(kept.status, 201);
  assert.equal(kept.data.org.verified, false);
  assert.equal(kept.data.org.registerName, 'Kestrel Group Pty Ltd');
  assert.equal(hse.readableCompany('CORBEL BUILD (NSW) PTY LTD'), 'Corbel Build (NSW) Pty Ltd');
  assert.equal(hse.readableCompany('Corbel Build'), 'Corbel Build');
  // Using the register's name later makes it verified.
  assert.equal((await call('PUT', `/api/hse/orgs/${kept.data.org.id}`, { reviewer: other, body: { name: 'KESTREL GROUP PTY LTD' } })).data.org.verified, true);
});

test('the ABN cannot be changed once the account is set up', async () => {
  const { lead, orgId } = await leadWithProject('fixed1@corbel.example', 'Corbel Build Pty Ltd');
  const before = (await call('GET', `/api/hse/orgs/${orgId}`, { reviewer: lead })).data.org;
  assert.match(before.abn, /^\d{11}$/);
  const changed = await call('PUT', `/api/hse/orgs/${orgId}`, { reviewer: lead, body: { name: 'Corbel Build Pty Ltd', abn: nextAbn() } });
  assert.equal(changed.status, 400);
  assert.equal(changed.data.field, 'abn');
  assert.equal(changed.data.message, 'The ABN links this account and cannot be changed. If it is wrong, contact SiteWrite.');
  assert.equal((await call('GET', `/api/hse/orgs/${orgId}`, { reviewer: lead })).data.org.abn, before.abn);
  // The same ABN, typed with spaces, or none at all, is not a change.
  assert.equal((await call('PUT', `/api/hse/orgs/${orgId}`, { reviewer: lead, body: { name: 'Corbel Build Pty Ltd', abn: before.abnShown } })).status, 200);
  assert.equal((await call('PUT', `/api/hse/orgs/${orgId}`, { reviewer: lead, body: { name: 'Corbel Build (NSW) Pty Ltd' } })).data.org.abn, before.abn);
  // An account set up before the ABN was asked for is given one once, and then it is fixed.
  const legacyLead = await hseSignIn('fixed2@corbel.example', 'Lee Ng');
  const legacyId = 'legacy-org-1';
  await db.query('INSERT INTO orgs (id, name, abn, created_by, source, created_at) VALUES ($1, $2, $3, $4, $5, $6)', [legacyId, 'Pillar Homes Pty Ltd', '', 'x', 'hse-page', new Date()]);
  const meRow = await db.one('SELECT id FROM reviewers WHERE email = $1', ['fixed2@corbel.example']);
  await db.query('INSERT INTO org_members (id, org_id, email, reviewer_id, role, invited_by, invited_at, joined_at, lead_of) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $2)', ['legacy-member-1', legacyId, 'fixed2@corbel.example', meRow.id, 'lead', meRow.id, new Date()]);
  const legacy = (await call('GET', `/api/hse/orgs/${legacyId}`, { reviewer: legacyLead })).data.org;
  assert.equal(legacy.verified, false);
  assert.match(legacy.abnNote, /^Add the company's ABN\./);
  assert.equal((await call('PUT', `/api/hse/orgs/${legacyId}`, { reviewer: legacyLead, body: { name: 'Pillar Homes Pty Ltd', abn: before.abn } })).status, 409, 'an ABN another account holds');
  const given = nextAbn();
  const gave = await call('PUT', `/api/hse/orgs/${legacyId}`, { reviewer: legacyLead, body: { name: 'Pillar Homes Pty Ltd', abn: given } });
  assert.equal(gave.status, 200, JSON.stringify(gave.data));
  assert.equal(gave.data.org.abn, given);
  assert.equal((await call('PUT', `/api/hse/orgs/${legacyId}`, { reviewer: legacyLead, body: { name: 'Pillar Homes Pty Ltd', abn: nextAbn() } })).status, 400);
  assert.equal((await db.one('SELECT abn FROM orgs WHERE id = $1', [legacyId])).abn, given);
});

test('a second account with the same ABN is asked to join the first, and learns nothing of its people', async () => {
  const abn = nextAbn();
  register.set(abn, listed('CORBEL BUILD PTY LTD'));
  const first = await hseSignIn('dup-lead@corbel.example', 'Riley Morgan');
  const made = await call('POST', '/api/hse/orgs', { reviewer: first, body: { name: 'Corbel Build Pty Ltd', abn } });
  assert.equal(made.status, 201);
  await invite(first, made.data.org.id, 'dup-member@corbel.example', 'Ash Kim');
  const orgs = await count('orgs');
  const second = await hseSignIn('dup-second@corbel.example', 'Dana Cho');
  for (const typed of [abn, `${abn.slice(0, 2)} ${abn.slice(2, 5)} ${abn.slice(5, 8)} ${abn.slice(8)}`]) {
    const again = await call('POST', '/api/hse/orgs', { reviewer: second, body: { name: 'Corbel Build', abn: typed, keepName: true } });
    assert.equal(again.status, 409);
    assert.equal(again.data.field, 'abn');
    assert.equal(again.data.taken, true);
    assert.equal(again.data.message, 'An account with this ABN is already on SiteLink. Ask that account\'s lead to add you to its team, then sign in with the email they used. You do not need a second account.');
    assert.doesNotMatch(JSON.stringify(again.data), /Riley|Morgan|Ash|Kim|dup-lead|dup-member|corbel\.example/);
  }
  assert.equal(await count('orgs'), orgs);
  assert.deepEqual((await call('GET', '/api/hse/me', { reviewer: second })).data.orgs, []);
  // Even when the register is down, and even at the same moment, there is one account for the ABN.
  const raceAbn = nextAbn();
  register.set(raceAbn, DOWN);
  const a = await hseSignIn('race-a@corbel.example', 'Rae Avery');
  const b = await hseSignIn('race-b@corbel.example', 'Rob Bell');
  const both = await Promise.all([a, b].map((reviewer) => call('POST', '/api/hse/orgs', { reviewer, body: { name: 'Race Build', abn: raceAbn } })));
  assert.deepEqual(both.map((r) => r.status).sort(), [201, 409]);
  assert.equal(Number((await db.one('SELECT COUNT(*) AS n FROM orgs WHERE abn = $1', [raceAbn])).n), 1);
  // The database itself refuses a second account with the ABN.
  await assert.rejects(db.query('INSERT INTO orgs (id, name, abn, created_by, source, created_at) VALUES ($1, $2, $3, $4, $5, $6)', ['dup-org', 'Copy', abn, 'x', 'test', new Date()]));
});

test('the lead hands over the lead role; there is always exactly one lead', async () => {
  const { lead, orgId, projectId } = await leadWithProject('hand-lead@corbel.example', 'Corbel Build Pty Ltd');
  const ash = await invite(lead, orgId, 'hand-ash@corbel.example', 'Ash Kim');
  const lee = await invite(lead, orgId, 'hand-lee@corbel.example', 'Lee Ng');
  await call('POST', `/api/hse/orgs/${orgId}/members`, { reviewer: lead, body: { email: 'hand-waiting@corbel.example' } });
  const team = (await call('GET', `/api/hse/orgs/${orgId}`, { reviewer: lead })).data.team;
  const row = (email) => team.find((person) => person.email === email).id;
  // Only the lead hands over, and only to someone who has joined this team.
  const byMember = await call('POST', `/api/hse/orgs/${orgId}/members/${row('hand-ash@corbel.example')}/lead`, { reviewer: ash });
  assert.equal(byMember.status, 403);
  assert.equal(byMember.data.message, 'Only the lead can hand over the lead role.');
  const waiting = await call('POST', `/api/hse/orgs/${orgId}/members/${row('hand-waiting@corbel.example')}/lead`, { reviewer: lead });
  assert.equal(waiting.status, 400);
  assert.equal(waiting.data.message, 'hand-waiting@corbel.example has not signed in yet. They can be made lead once they have joined the team.');
  assert.equal((await call('POST', `/api/hse/orgs/${orgId}/members/${row('hand-lead@corbel.example')}/lead`, { reviewer: lead })).data.message, 'You are already the lead.');
  assert.equal((await call('POST', `/api/hse/orgs/${orgId}/members/nobody/lead`, { reviewer: lead })).status, 404);
  const elsewhere = await leadWithProject('hand-other@marlin.example', 'Marlin Constructions Pty Ltd', 'Dana Cho');
  const theirRow = (await call('GET', `/api/hse/orgs/${elsewhere.orgId}`, { reviewer: elsewhere.lead })).data.team[0].id;
  assert.equal((await call('POST', `/api/hse/orgs/${orgId}/members/${theirRow}/lead`, { reviewer: lead })).status, 404, 'a person in another account');
  assert.equal(await leadsOf(elsewhere.orgId), 1);
  assert.equal(await leadsOf(orgId), 1);
  // The lead makes Ash lead. The old lead is a member.
  const handed = await call('POST', `/api/hse/orgs/${orgId}/members/${row('hand-ash@corbel.example')}/lead`, { reviewer: lead });
  assert.equal(handed.status, 200, JSON.stringify(handed.data));
  assert.equal(handed.data.message, 'Ash Kim is now the lead. You are now a member.');
  assert.equal(handed.data.org.role, 'member');
  assert.deepEqual(handed.data.team.filter((person) => person.joined).map((person) => [person.email, person.role]),
    [['hand-ash@corbel.example', 'lead'], ['hand-lead@corbel.example', 'member'], ['hand-lee@corbel.example', 'member']]);
  assert.equal(await leadsOf(orgId), 1);
  // The old lead can no longer add or remove people, rename, check the ABN or hand over.
  assert.equal((await call('DELETE', `/api/hse/orgs/${orgId}/members/${row('hand-lee@corbel.example')}`, { reviewer: lead })).status, 403);
  assert.equal((await call('DELETE', `/api/hse/orgs/${orgId}/members/${row('hand-ash@corbel.example')}`, { reviewer: lead })).data.message, 'The lead cannot be removed.');
  assert.equal((await call('POST', `/api/hse/orgs/${orgId}/members`, { reviewer: lead, body: { email: 'x@corbel.example' } })).status, 403);
  assert.equal((await call('PUT', `/api/hse/orgs/${orgId}`, { reviewer: lead, body: { name: 'Other' } })).status, 403);
  assert.equal((await call('POST', `/api/hse/orgs/${orgId}/abn-check`, { reviewer: lead })).status, 403);
  assert.equal((await call('POST', `/api/hse/orgs/${orgId}/members/${row('hand-lee@corbel.example')}/lead`, { reviewer: lead })).status, 403);
  // As a member, the old lead still changes site details and makes projects (D303 1).
  assert.equal((await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 0, details: DETAILS } })).status, 200);
  assert.equal((await call('POST', `/api/hse/orgs/${orgId}/projects`, { reviewer: lead, body: { name: 'Second job', workplace: '2 B St, Sydney NSW 2000', state: 'nsw' } })).status, 201);
  // The new lead can do all of it, and the old lead's view says who the lead is.
  assert.equal((await call('PUT', `/api/hse/orgs/${orgId}`, { reviewer: ash, body: { name: 'Corbel Build Pty Ltd' } })).status, 200);
  assert.deepEqual((await call('GET', '/api/hse/me', { reviewer: lead })).data.orgs.map((org) => org.role), ['member']);
  // Two handovers sent at once: one is made, and there is still one lead.
  const twice = await Promise.all([row('hand-lead@corbel.example'), row('hand-lee@corbel.example')].map((id) => call('POST', `/api/hse/orgs/${orgId}/members/${id}/lead`, { reviewer: ash })));
  assert.deepEqual(twice.map((r) => r.status).sort(), [200, 403], JSON.stringify(twice.map((r) => r.data)));
  assert.equal(await leadsOf(orgId), 1);
  // The new lead removes Lee, who then sees nothing.
  const newLead = (await call('GET', `/api/hse/orgs/${orgId}`, { reviewer: lead })).data.team.find((person) => person.role === 'lead');
  const remover = newLead.email === 'hand-lead@corbel.example' ? lead : lee;
  const leaver = remover === lead ? 'hand-lee@corbel.example' : 'hand-ash@corbel.example';
  assert.equal((await call('DELETE', `/api/hse/orgs/${orgId}/members/${row(leaver)}`, { reviewer: remover })).status, 200);
  assert.equal(await leadsOf(orgId), 1);
  // The database itself refuses a second lead.
  await assert.rejects(db.query("UPDATE org_members SET role = 'lead', lead_of = org_id WHERE org_id = $1", [orgId]));
  assert.equal(await leadsOf(orgId), 1);
});

test('SiteLink is served at /sitelink and /hse.html, with a SiteLink tab at the top of the app, the start page and SiteLink', async () => {
  for (const path of ['/sitelink', '/sitelink/', '/sitelink?login=abc', '/hse.html']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.match(html, /<title>SiteLink by SiteWrite<\/title>/, path);
    assert.match(html, /<a href="\/sitelink" aria-current="page">SiteLink<span>For builders<\/span><\/a>/, path);
    assert.doesNotMatch(html, /SiteWrite for main contractors|main contractor account/, path);
    assert.match(html, /SiteLink is free for main contractors\./);
  }
  const fs = require('fs');
  const page = (name) => fs.readFileSync(require('path').join(__dirname, '..', 'public', name), 'utf8');
  for (const [name, here] of [['index.html', '/'], ['welcome.html', '/welcome.html']]) {
    assert.match(page(name), new RegExp(`<a href="${here.replace(/\./g, '\\.')}" aria-current="page">SiteWrite<span>For subcontractors</span></a>`), name);
    assert.match(page(name), /<a href="\/sitelink"[^>]*>SiteLink<span>For builders<\/span><\/a>/, name);
  }
  assert.doesNotMatch(page('hse.js'), /SiteWrite for main contractors/);
  assert.match(page('hse.html'), /The company's 11 digit ABN\. It links this account to your company and cannot be changed later\./);
  assert.match(page('hse.js'), /The ABN links this account and cannot be changed\. If it is wrong, contact SiteWrite/);
});

// Messy round 6: with the staging test hooks off (production), a test address gets no exception from
// the ABN register, and the hook that removes a test SiteLink account is not there at all.
test('with the test hooks off, a test address is checked against the ABN register and the remove hook is absent', async () => {
  assert.equal(require('../testhooks').enabled(), false);
  const removed = await fetch(`${base}/api/test/sitelink/remove`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Test-Secret': 'r'.repeat(40) }, body: JSON.stringify({ email: 'lead-off@siteready.test' }) });
  assert.equal(removed.status, 404);
  const lead = await hseSignIn('lead-off@siteready.test', 'Tess Offord');
  const abn = nextAbn();
  register.set(abn, NOT_LISTED);
  const refused = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Offline Builders Pty Ltd', abn } });
  assert.equal(refused.status, 400);
  assert.match(refused.data.message, /^The ABN register does not list ABN/);
});
