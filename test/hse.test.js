// Goal 12 stage 3: the main contractor's HSE lead and team. They sign in free on /hse.html as
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
  return message && /\/hse\.html\?login=([A-Za-z0-9_-]+)/.exec(message.text);
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
  const org = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: orgName } });
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
  // The sign-in email says SiteWrite and links to the HSE page; an HSE link never opens an account.
  await call('POST', '/api/hse/email', { body: { email: 'nobody@corbel.example' } });
  const message = [...mailbox].reverse().find((item) => item.to === 'nobody@corbel.example');
  assert.match(message.subject, /SiteWrite/);
  assert.match(message.text, /\/hse\.html\?login=/);
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

test('setting up the account needs a name, and a valid ABN if one is given', async () => {
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
  const made = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Corbel Build Pty Ltd', abn: '' } });
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
  assert.match(mail.subject, /Riley Morgan has added you to Corbel Build Pty Ltd on SiteWrite/);
  assert.match(mail.text, /hse\.html/);
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
  const results = await Promise.all([1, 2, 3].map((n) => call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: n % 2 ? lead : member, body: { baseRev: 5, details: { ...v3, siteManager: `Site manager ${n}` } } })));
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
