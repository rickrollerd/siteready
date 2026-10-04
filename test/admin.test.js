process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.ADMIN_EMAILS = 'owner@siteready.example';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const JSZip = require('jszip');
const { app } = require('../server');
const db = require('../db');
const { validAbn } = require('../accounts');
const { plainName, nearlySameName } = require('../admin');
const { setupAccounts, lastLinkToken } = require('./helpers');

const DAY = 86400000;
let server;
let base;
let owner;
let someone;

test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  owner = await signIn('owner@siteready.example');
  someone = await signIn('nosy@admin-test.example');
});

test.after(() => server.close());

const call = (method, route, { body, token } = {}) => fetch(`${base}${route}`, {
  method,
  headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});
const get = async (route, token = owner) => {
  const response = await call('GET', route, { token });
  return { status: response.status, data: await response.json() };
};

async function signIn(email) {
  await call('POST', '/api/auth/email', { body: { email } });
  return (await (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).json()).token;
}

// A different valid ABN each time: each ABN gets one trial, and its check digits must work.
const usedAbns = new Set();
function newAbn() {
  for (;;) {
    const digits = String(10000000000 + crypto.randomInt(0, 89999999999));
    if (validAbn(digits) && !usedAbns.has(digits)) {
      usedAbns.add(digits);
      return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
    }
  }
}

// Synthetic accounts and activity, written straight to the database.
async function addCompany({ name, address = '', phone = '', email = '', plan = 'trial', users = [] }) {
  const id = crypto.randomUUID();
  await db.query('INSERT INTO companies (id, name, abn, address, phone, email, trial_ends_at, plan_status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [id, name, newAbn(), address, phone, email, new Date(Date.now() + 14 * DAY), plan, new Date()]);
  for (const user of users) {
    await db.query('INSERT INTO users (id, company_id, email, created_at) VALUES ($1, $2, $3, $4)', [crypto.randomUUID(), id, user, new Date()]);
  }
  return id;
}
async function addDownloads(companyId, count, daysAgo) {
  for (let n = 0; n < count; n += 1) {
    await db.query('INSERT INTO events (id, company_id, type, created_at) VALUES ($1, $2, $3, $4)', [crypto.randomUUID(), companyId, 'download_word', new Date(Date.now() - daysAgo * DAY - n * 1000)]);
  }
}
async function addRefs(companyId, places) {
  for (const [state, postcode] of places) {
    await db.query('INSERT INTO swms_refs (ref, company_id, company_name, abn, title, state, postcode, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [`SR-T${crypto.randomBytes(6).toString('hex').toUpperCase()}`, companyId, 'Synthetic', '', 'Synthetic task', state, postcode, new Date(Date.now() - DAY)]);
  }
}
const warnings = async () => (await get('/api/admin/warnings')).data.warnings;
const flagged = (list, rule, companyId) => list.filter((item) => item.rule === rule && item.companies.some((company) => company.id === companyId));
const logRows = (action, target) => db.query('SELECT * FROM admin_access_log WHERE action = $1 AND target = $2', [action, target]);

test('only the owner can use the admin views, and refused looks are not logged', async () => {
  const before = Number((await db.one('SELECT COUNT(*) AS n FROM admin_access_log')).n);
  const routes = ['/api/admin/stats', '/api/admin/refs/SR-AAAA-BBBB', '/api/admin/companies?q=a', '/api/admin/companies/x', '/api/admin/warnings', '/api/admin/access-log'];
  for (const route of routes) {
    assert.equal((await call('GET', route, { token: someone })).status, 403, route);
    assert.equal((await call('GET', route)).status, 401, route);
  }
  assert.equal(Number((await db.one('SELECT COUNT(*) AS n FROM admin_access_log')).n), before);
});

test('a reference from a real download traces to the account, with the job\'s state and postcode only', async () => {
  const token = await signIn('roofer@lookup.example');
  const abn = newAbn();
  assert.equal((await call('PUT', '/api/company', { token, body: { name: 'Lookup Roofing Pty Ltd', abn } })).status, 200);
  const user = await db.one('SELECT company_id FROM users WHERE email = $1', ['roofer@lookup.example']);
  const body = {
    state: 'nsw', task: 'Replace a 3m length of fence.', fallRisk: 'no', workplace: '14 Pitt Street, Sydney NSW 2000',
    reviewConfirmed: true, reviewedBy: 'Jo Lee',
  };
  const response = await call('POST', '/api/draft.docx', { token, body });
  assert.equal(response.status, 200);
  const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
  const footer = Object.keys(zip.files).filter((name) => /footer/.test(name));
  const text = (await Promise.all(footer.map((name) => zip.file(name).async('string')))).join(' ');
  const ref = (text.match(/SR-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}/) || [])[0];
  assert.ok(ref, 'reference in the footer');

  const stored = await db.one('SELECT * FROM swms_refs WHERE ref = $1', [ref]);
  assert.equal(stored.state, 'nsw');
  assert.equal(stored.postcode, '2000');
  assert.ok(!JSON.stringify(stored).includes('Pitt'), 'the street address is not kept');

  const { status, data } = await get(`/api/admin/refs/${ref.toLowerCase()}`);
  assert.equal(status, 200);
  assert.equal(data.ref, ref);
  assert.equal(data.companyId, user.company_id);
  assert.equal(data.companyName, 'Lookup Roofing Pty Ltd');
  assert.equal(data.abn, abn);
  assert.match(data.title, /fence/);
  assert.equal(data.state, 'nsw');
  assert.equal(data.postcode, '2000');
  assert.ok(Date.now() - new Date(data.createdAt) < 60000);
  assert.equal(data.accountExists, true);
  assert.equal(data.accountLink, `/admin.html#account=${user.company_id}`);
  const logged = await logRows('ref_lookup', ref);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].admin_email, 'owner@siteready.example');

  const missing = await get('/api/admin/refs/SR-ZZZZ-ZZZZ');
  assert.equal(missing.status, 404);
  assert.equal((await logRows('ref_lookup', 'SR-ZZZZ-ZZZZ')).length, 1, 'a look that finds nothing is still logged');

  // The account view, found by name, ABN with or without spaces, and a user's email.
  for (const q of ['lookup roofing', abn, abn.replace(/\s/g, ''), 'roofer@lookup']) {
    const found = await get(`/api/admin/companies?q=${encodeURIComponent(q)}`);
    assert.equal(found.status, 200);
    const row = found.data.companies.find((item) => item.id === user.company_id);
    assert.ok(row, `found by ${q}`);
    assert.equal(row.name, 'Lookup Roofing Pty Ltd');
    assert.equal(row.users, 1);
    assert.equal(row.downloads30, 1);
    assert.equal(row.refs30, 1);
    assert.equal(row.plan.status, 'trial');
    assert.equal(row.plan.onTrial, true);
    assert.ok(row.plan.trialEndsAt);
    assert.equal((await logRows('account_search', q.toLowerCase())).length, 1, `search for ${q} logged`);
  }
  assert.equal((await get('/api/admin/companies?q=nobody-by-this-name')).data.companies.length, 0);

  await call('GET', '/api/me', { token });
  const detail = await get(`/api/admin/companies/${user.company_id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.data.company.name, 'Lookup Roofing Pty Ltd');
  assert.equal(detail.data.users.length, 1);
  assert.equal(detail.data.users[0].email, 'roofer@lookup.example');
  assert.ok(detail.data.users[0].lastSeenAt);
  assert.equal(detail.data.plan.onTrial, true);
  assert.equal(detail.data.trialAbn.abn, abn.replace(/\s/g, ''));
  assert.equal(detail.data.trialAbn.heldByThisAccount, true);
  assert.equal(detail.data.downloadsByMonth.length, 12);
  assert.equal(detail.data.downloadsByMonth.at(-1).downloads, 1);
  assert.equal(detail.data.downloadsByMonth.reduce((sum, item) => sum + item.downloads, 0), 1);
  assert.deepEqual(detail.data.refs.map((item) => [item.ref, item.state, item.postcode]), [[ref, 'nsw', '2000']]);
  assert.equal(detail.data.signins.total, 1);
  assert.equal(detail.data.signins.users[0].signins, 1);
  assert.equal((await logRows('account_view', user.company_id)).length, 1);
  assert.equal((await get('/api/admin/companies/no-such-account')).status, 404);
  assert.equal((await logRows('account_view', 'no-such-account')).length, 1);
});

test('downloads by month count the last 12 months only', async () => {
  const id = await addCompany({ name: 'Monthly Counts' });
  await addDownloads(id, 3, 0);
  await addDownloads(id, 2, 70);
  await addDownloads(id, 4, 380);
  const { data } = await get(`/api/admin/companies/${id}`);
  assert.equal(data.downloadsByMonth.reduce((sum, item) => sum + item.downloads, 0), 5);
  assert.ok(data.downloadsByMonth.at(-1).downloads >= 3);
  assert.equal(data.trialAbn, null, 'an ABN entered straight into the database has no trial record');
});

test('high download volume: 50 in a week, or 3 times the account\'s own average week', async () => {
  const fifty = await addCompany({ name: 'Fifty A Week' });
  await addDownloads(fifty, 50, 1);
  const fortyNine = await addCompany({ name: 'Forty Nine A Week' });
  await addDownloads(fortyNine, 49, 1);
  const jump = await addCompany({ name: 'Sudden Jump' });
  for (let week = 1; week <= 8; week += 1) await addDownloads(jump, 2, 7 * week + 2); // average 2 a week
  await addDownloads(jump, 12, 1); // 6 times the average
  const steady = await addCompany({ name: 'Steady Busy' });
  for (let week = 1; week <= 8; week += 1) await addDownloads(steady, 4, 7 * week + 2); // average 4 a week
  await addDownloads(steady, 12, 1); // 3 times, not more
  const small = await addCompany({ name: 'Small Jump' });
  await addDownloads(small, 1, 20);
  await addDownloads(small, 9, 1); // below the minimum of 10
  const fresh = await addCompany({ name: 'New Account' });
  await addDownloads(fresh, 20, 1); // nothing before to compare with

  const list = await warnings();
  assert.equal(flagged(list, 'volume', fifty).length, 1);
  assert.match(flagged(list, 'volume', fifty)[0].reason, /^50 downloads in the last 7 days/);
  assert.equal(flagged(list, 'volume', fortyNine).length, 0);
  assert.equal(flagged(list, 'volume', jump).length, 1);
  assert.match(flagged(list, 'volume', jump)[0].reason, /12 downloads in the last 7 days, 6\.0 times its average week of 2\.0/);
  assert.equal(flagged(list, 'volume', steady).length, 0);
  assert.equal(flagged(list, 'volume', small).length, 0);
  assert.equal(flagged(list, 'volume', fresh).length, 0);
});

test('many places: 4 or more states, or 15 or more postcodes, in 30 days', async () => {
  const states = await addCompany({ name: 'Four States' });
  await addRefs(states, [['qld', '4000'], ['nsw', '2000'], ['vic', '3000'], ['wa', '6000']]);
  const three = await addCompany({ name: 'Three States' });
  await addRefs(three, [['qld', '4000'], ['nsw', '2000'], ['vic', '3000'], ['vic', '3001']]);
  const postcodes = await addCompany({ name: 'Fifteen Postcodes' });
  await addRefs(postcodes, Array.from({ length: 15 }, (_, n) => ['qld', String(4000 + n)]));
  const fourteen = await addCompany({ name: 'Fourteen Postcodes' });
  await addRefs(fourteen, [...Array.from({ length: 14 }, (_, n) => ['qld', String(4000 + n)]), ['qld', '4000']]);
  const old = await addCompany({ name: 'Old References' });
  await addRefs(old, [['qld', '4000'], ['nsw', '2000'], ['vic', '3000'], ['wa', '6000']]);
  await db.query('UPDATE swms_refs SET created_at = $1 WHERE company_id = $2', [new Date(Date.now() - 31 * DAY), old]);

  const list = await warnings();
  assert.equal(flagged(list, 'places', states).length, 1);
  assert.match(flagged(list, 'places', states)[0].reason, /4 states \(NSW, Qld, Vic, WA\)/);
  assert.match(flagged(list, 'places', states)[0].reason, /consultant producing for many clients, or a shared login/);
  assert.equal(flagged(list, 'places', three).length, 0);
  assert.equal(flagged(list, 'places', postcodes).length, 1);
  assert.match(flagged(list, 'places', postcodes)[0].reason, /15 postcodes/);
  assert.equal(flagged(list, 'places', fourteen).length, 0);
  assert.equal(flagged(list, 'places', old).length, 0);
});

test('one business email domain on 3 or more accounts, leaving out public email services', async () => {
  const a = await addCompany({ name: 'Domain One', plan: 'active', users: ['a@threeway.example'] });
  const b = await addCompany({ name: 'Domain Two', plan: 'active', users: ['b@threeway.example'] });
  const c = await addCompany({ name: 'Domain Three', plan: 'active', email: 'office@THREEWAY.example' });
  const d = await addCompany({ name: 'Pair One', plan: 'active', users: ['a@twoway.example'] });
  await addCompany({ name: 'Pair Two', plan: 'active', users: ['b@twoway.example'] });
  const gmail = [];
  for (const n of [1, 2, 3, 4]) gmail.push(await addCompany({ name: `Gmail ${n}`, plan: 'active', users: [`tradie${n}@gmail.com`] }));

  const list = await warnings();
  const hit = list.filter((item) => item.rule === 'domain' && /threeway\.example/.test(item.reason));
  assert.equal(hit.length, 1);
  assert.deepEqual(hit[0].companies.map((company) => company.id).sort(), [a, b, c].sort());
  assert.match(hit[0].reason, /The email domain threeway\.example is on 3 accounts/);
  assert.equal(flagged(list, 'domain', d).length, 0);
  for (const id of gmail) assert.equal(flagged(list, 'domain', id).length, 0);
});

test('repeated trials: trial accounts sharing an address, phone or business email domain, or nearly the same name', async () => {
  const address1 = await addCompany({ name: 'Harbour Tiling', address: '7 Wharf Road, Newcastle NSW 2300' });
  const address2 = await addCompany({ name: 'Coastal Tiles', address: '7 wharf road newcastle, NSW 2300' });
  const phone1 = await addCompany({ name: 'Ridge Roofing', phone: '+61 7 3123 4567' });
  const phone2 = await addCompany({ name: 'Peak Gutters', phone: '(07) 3123 4567' });
  const domain1 = await addCompany({ name: 'Alpha Paving', users: ['x@pavers-group.example'] });
  const domain2 = await addCompany({ name: 'Beta Kerbing', email: 'admin@pavers-group.example' });
  const public1 = await addCompany({ name: 'Solo Sparky', users: ['solo@hotmail.com'] });
  await addCompany({ name: 'Other Sparky', users: ['other@hotmail.com'] });
  const name1 = await addCompany({ name: 'Smithfield Plumbing Pty Ltd' });
  const name2 = await addCompany({ name: 'Smithfeld Plumbing' });
  const name3 = await addCompany({ name: 'SMITHFIELD PLUMBING PTY. LTD.' });
  const unlike1 = await addCompany({ name: 'Brown Electrical' });
  await addCompany({ name: 'Green Electrical' });
  // Paying accounts at one address are not repeated trials.
  const paying1 = await addCompany({ name: 'Head Office Builders', plan: 'active', address: '1 Queen Street Brisbane QLD 4000' });
  await addCompany({ name: 'Branch Builders', plan: 'active', address: '1 Queen Street Brisbane QLD 4000' });

  const list = await warnings();
  const trial = (id) => flagged(list, 'trials', id);
  assert.match(trial(address1)[0].reason, /2 trial accounts share the address .*Harbour Tiling, Coastal Tiles/);
  assert.ok(trial(address2).length >= 1);
  assert.match(trial(phone1)[0].reason, /share the phone number 0731234567: Ridge Roofing, Peak Gutters/);
  assert.ok(trial(phone2).length >= 1);
  assert.match(trial(domain1)[0].reason, /share the email domain pavers-group\.example/);
  assert.ok(trial(domain2).length >= 1);
  assert.equal(trial(public1).length, 0);
  const names = trial(name1);
  assert.equal(names.length, 1);
  assert.match(names[0].reason, /3 trial accounts have nearly the same name/);
  assert.deepEqual(names[0].companies.map((company) => company.id).sort(), [name1, name2, name3].sort());
  assert.equal(trial(unlike1).length, 0);
  assert.equal(trial(paying1).length, 0);
});

test('names are compared without case, punctuation or Pty Ltd', () => {
  assert.equal(plainName('Smith & Sons Pty. Ltd.'), 'smithsons');
  assert.ok(nearlySameName(plainName('Acme Plumbing'), plainName('ACME PLUMBING PTY LTD')));
  assert.ok(nearlySameName(plainName('Acme Plumbing'), plainName('Acme Plumbing 2')));
  assert.ok(!nearlySameName(plainName('Ace Co'), plainName('Abe Co')), 'short names must match exactly');
  assert.ok(!nearlySameName(plainName('Jones Roofing'), plainName('Bones Fencing')));
});

test('unusual sign-ins are kept, in the numbers and as a warning sign', async () => {
  const id = await addCompany({ name: 'Shared Login Co', users: ['shared@sharedlogin.example'] });
  const user = await db.one('SELECT id FROM users WHERE email = $1', ['shared@sharedlogin.example']);
  for (const n of [1, 2, 3, 4]) {
    await db.query('INSERT INTO signins (id, user_id, network, device, created_at) VALUES ($1, $2, $3, $4, $5)', [crypto.randomUUID(), user.id, 'net1', `device${n}`, new Date(Date.now() - n * 3600000)]);
  }
  const quiet = await addCompany({ name: 'Quiet Login Co', users: ['quiet@quietlogin.example'] });
  const quietUser = await db.one('SELECT id FROM users WHERE email = $1', ['quiet@quietlogin.example']);
  for (const n of [1, 2, 3]) {
    await db.query('INSERT INTO signins (id, user_id, network, device, created_at) VALUES ($1, $2, $3, $4, $5)', [crypto.randomUUID(), quietUser.id, `net${n}`, `device${n}`, new Date(Date.now() - n * 3600000)]);
  }
  const stats = (await get('/api/admin/stats')).data;
  assert.ok(stats.unusualSignins.some((item) => item.email === 'shared@sharedlogin.example' && item.devices30 === 4));
  assert.ok(!stats.unusualSignins.some((item) => item.email === 'quiet@quietlogin.example'));
  const list = await warnings();
  assert.match(flagged(list, 'signins', id)[0].reason, /shared@sharedlogin\.example signed in from 4 devices in 30 days/);
  assert.equal(flagged(list, 'signins', quiet).length, 0);
  assert.ok(list.every((item) => typeof item.reason === 'string' && item.reason && !item.reason.includes('\n')), 'each reason is one line');
});

test('the access log shows the last 100 looks, newest first', async () => {
  for (let n = 0; n < 110; n += 1) {
    await db.query('INSERT INTO admin_access_log (id, admin_email, action, target, created_at) VALUES ($1, $2, $3, $4, $5)',
      [crypto.randomUUID(), 'owner@siteready.example', 'account_view', `old-${n}`, new Date(Date.now() - (n + 1) * 60000)]);
  }
  await get('/api/admin/refs/SR-LAST-LOOK');
  const { status, data } = await get('/api/admin/access-log');
  assert.equal(status, 200);
  assert.equal(data.entries.length, 100);
  assert.deepEqual(data.entries[0], { adminEmail: 'owner@siteready.example', action: 'ref_lookup', target: 'SR-LAST-LOOK', createdAt: data.entries[0].createdAt });
  const times = data.entries.map((item) => new Date(item.createdAt).getTime());
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
});
