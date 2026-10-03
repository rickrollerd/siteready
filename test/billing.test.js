process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.STRIPE_PRICE_ID = 'price_test_49';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
process.env.ADMIN_EMAILS = 'owner@siteready.example';
const test = require('node:test');
const assert = require('node:assert/strict');
const Stripe = require('stripe');
const { app } = require('../server');
const db = require('../db');
const billing = require('../billing');
const { setupAccounts, lastLinkToken } = require('./helpers');

// A stand-in for Stripe that records what was asked of it, and uses the real
// library to sign and check webhooks.
const real = new Stripe('sk_test_not_used');
const asked = [];
billing.useStripe({
  customers: { create: async (args) => { asked.push(['customer', args]); return { id: 'cus_1' }; } },
  checkout: { sessions: { create: async (args) => { asked.push(['checkout', args]); return { url: 'https://checkout.stripe.test/s1' }; } } },
  billingPortal: { sessions: { create: async (args) => { asked.push(['portal', args]); return { url: 'https://billing.stripe.test/p1' }; } } },
  webhooks: real.webhooks,
});

let server;
let base;

test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

const call = (method, route, { body, token, raw, headers } = {}) => fetch(`${base}${route}`, {
  method,
  headers: { ...(body || raw ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
  body: raw || (body ? JSON.stringify(body) : undefined),
});

async function signIn(email) {
  await call('POST', '/api/auth/email', { body: { email } });
  return (await (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).json()).token;
}

function webhook(event) {
  const payload = JSON.stringify(event);
  const signature = real.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  return call('POST', '/api/billing/webhook', { raw: payload, headers: { 'stripe-signature': signature } });
}

test('subscribing during the trial keeps the rest of the trial', async () => {
  const token = await signIn('buyer@co.example');
  const config = await (await call('GET', '/api/config')).json();
  assert.equal(config.billing, true);
  assert.equal(config.price, 'A$49 a month incl. GST');
  const response = await call('POST', '/api/billing/checkout', { token });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).url, 'https://checkout.stripe.test/s1');
  const checkout = asked.find(([kind]) => kind === 'checkout')[1];
  assert.equal(checkout.mode, 'subscription');
  assert.deepEqual(checkout.line_items, [{ price: 'price_test_49', quantity: 1 }]);
  const company = await db.one('SELECT * FROM companies WHERE id = $1', [checkout.client_reference_id]);
  assert.equal(checkout.subscription_data.trial_end, Math.floor(new Date(company.trial_ends_at).getTime() / 1000));
  assert.equal(company.stripe_customer_id, 'cus_1');
});

test('Stripe webhooks set the plan, and a bad signature is refused', async () => {
  const token = await signIn('webhook@co.example');
  const user = await db.one('SELECT company_id FROM users WHERE email = $1', ['webhook@co.example']);
  await db.query('UPDATE companies SET trial_ends_at = $1 WHERE id = $2', [new Date(Date.now() - 1000), user.company_id]);
  assert.equal((await (await call('GET', '/api/me', { token })).json()).company.hasAccess, false);

  const bad = await call('POST', '/api/billing/webhook', { raw: '{}', headers: { 'stripe-signature': 't=1,v1=bad' } });
  assert.equal(bad.status, 400);

  const subscription = { id: 'sub_1', customer: 'cus_9', status: 'active', metadata: { companyId: user.company_id } };
  assert.equal((await webhook({ id: 'evt_1', type: 'customer.subscription.created', data: { object: subscription } })).status, 200);
  let me = await (await call('GET', '/api/me', { token })).json();
  assert.equal(me.company.planStatus, 'active');
  assert.equal(me.company.hasAccess, true);

  await webhook({ id: 'evt_2', type: 'customer.subscription.updated', data: { object: { ...subscription, status: 'past_due' } } });
  me = await (await call('GET', '/api/me', { token })).json();
  assert.equal(me.company.hasAccess, true, 'access is kept while a failed payment is retried');

  await webhook({ id: 'evt_3', type: 'customer.subscription.deleted', data: { object: { ...subscription, status: 'canceled' } } });
  me = await (await call('GET', '/api/me', { token })).json();
  assert.equal(me.company.planStatus, 'canceled');
  assert.equal(me.company.hasAccess, false);

  const portal = await call('POST', '/api/billing/portal', { token });
  assert.equal((await portal.json()).url, 'https://billing.stripe.test/p1');
});

test('the owner sees the numbers; others do not', async () => {
  const owner = await signIn('owner@siteready.example');
  const someone = await signIn('nosy@co.example');
  assert.equal((await call('GET', '/api/admin/stats', { token: someone })).status, 403);
  const stats = await (await call('GET', '/api/admin/stats', { token: owner })).json();
  assert.ok(stats.companies >= 3);
  assert.ok(stats.actions.days30.trial_started >= 3);
  assert.equal(typeof stats.monthlyRevenue, 'number');
});

test('the health check reports the database', async () => {
  const health = await (await call('GET', '/api/health')).json();
  assert.deepEqual(health, { ok: true, database: 'ok' });
});

test('a saved SWMS leaves one de-identified industry record, and an opted out business leaves none', async () => {
  const owner = await signIn('owner@siteready.example');
  const token = await signIn('industry@co.example');
  const abn = '83 914 571 673';
  assert.equal((await call('PUT', '/api/company', { token, body: { name: 'Secret Builders Pty Ltd', abn } })).status, 200);
  const input = {
    state: 'qld',
    trade: 'Plumber',
    workplace: 'Ward 3, Toowoomba Hospital, Pechey St, Toowoomba QLD 4350',
    task: 'Install sprinkler pipework in the ward ceilings from scissor lifts more than 2 m above the floor.',
    fallRisk: 'yes',
    facts: { fallControl: 'Scissor lifts with guardrails are used for all work above 2 m.' },
  };
  const confirm = { reviewConfirmed: true, reviewedBy: 'Alex Chen' };
  const before = Number((await db.one('SELECT COUNT(*) AS n FROM industry_records')).n);
  assert.equal((await call('POST', '/api/swms', { token, body: { input, ...confirm } })).status, 201);
  assert.equal((await call('POST', '/api/swms', { token, body: { input, ...confirm } })).status, 201);
  const rows = await db.query('SELECT * FROM industry_records');
  assert.equal(rows.length, before + 1, 'one record per business, task and month');
  const row = rows.find((item) => item.postcode_area === '43');
  assert.ok(row, 'the record keeps the first two digits of the postcode');
  assert.equal(row.state, 'qld');
  assert.equal(row.trade, 'Plumber');
  assert.equal(row.project_type, 'hospital');
  assert.match(row.month, /^\d{4}-\d{2}$/);
  assert.ok(JSON.parse(row.steps).length > 0);
  const text = JSON.stringify(row);
  for (const secret of ['Secret Builders', '83914571673', '83 914', 'industry@co.example', 'Toowoomba', 'Pechey', '4350', 'sprinkler pipework in the ward', 'Alex Chen']) {
    assert.ok(!text.includes(secret), `the record does not keep ${secret}`);
  }
  const company = await db.one('SELECT id FROM companies WHERE name = $1', ['Secret Builders Pty Ltd']);
  assert.ok(!text.includes(company.id), 'the record does not keep the account id');

  const seen = await (await call('GET', '/api/admin/industry', { token: owner })).json();
  assert.ok(seen.total >= 1);
  assert.ok(seen.records.every((record) => !('business' in record)));
  assert.equal((await call('GET', '/api/admin/industry', { token })).status, 403);

  assert.equal((await call('POST', '/api/admin/industry/opt-out', { token, body: { abn } })).status, 403);
  assert.equal((await call('POST', '/api/admin/industry/opt-out', { token: owner, body: { abn } })).status, 200);
  const other = { ...input, task: 'Cut and fit copper pipe to the hand basins in the ward.' };
  assert.equal((await call('POST', '/api/swms', { token, body: { input: other, ...confirm } })).status, 201);
  assert.equal(Number((await db.one('SELECT COUNT(*) AS n FROM industry_records')).n), before + 1, 'no record after opting out');
});
