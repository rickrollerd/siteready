// Subscriptions through Stripe: one monthly price per company. STRIPE_SECRET_KEY,
// STRIPE_PRICE_ID (the A$49 monthly price made in the Stripe dashboard) and
// STRIPE_WEBHOOK_SECRET switch it on. Stripe holds the card details; the app
// only keeps the customer and subscription ids and the subscription status.
const express = require('express');
const Stripe = require('stripe');
const db = require('./db');
const auth = require('./auth');
const { record, recordError } = require('./events');

let client = null;

function stripe() {
  if (!client && process.env.STRIPE_SECRET_KEY) client = new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

// Tests use a stand-in for Stripe.
function useStripe(next) {
  client = next;
}

function enabled() {
  return Boolean(stripe() && process.env.STRIPE_PRICE_ID);
}

const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// A request Stripe turns down is a set-up fault on our side, not a bad request from the
// user: Stripe's reason is kept in the error log for the admin page, and the user is told
// plainly that the payment page could not be opened.
async function fromStripe(where, call) {
  try {
    return await call();
  } catch (error) {
    if (!error || !String(error.type || '').startsWith('Stripe')) throw error;
    await recordError(`Stripe ${where}`, error);
    throw auth.fail(502, 'The payment page could not be opened. Try again shortly, or contact us if it keeps happening.');
  }
}
const router = express.Router();

async function customerFor(company, email) {
  if (company.stripe_customer_id) return company.stripe_customer_id;
  const customer = await stripe().customers.create({
    email: company.email || email,
    name: company.name || undefined,
    metadata: { companyId: company.id },
  });
  await db.query('UPDATE companies SET stripe_customer_id = $1 WHERE id = $2', [customer.id, company.id]);
  return customer.id;
}

// Subscribing during the free trial keeps the rest of the trial: the first
// charge is on the day the trial would have ended.
router.post('/billing/checkout', auth.requireUser, route(async (req, res) => {
  if (!enabled()) throw auth.fail(503, 'Subscriptions are not set up yet.');
  const base = auth.appUrl(req);
  const trialEnd = Math.floor(new Date(req.company.trial_ends_at).getTime() / 1000);
  const keepTrial = req.company.plan_status === 'trial' && trialEnd > Math.floor(Date.now() / 1000) + 48 * 3600;
  const customer = await fromStripe('customer', () => customerFor(req.company, req.user.email));
  const session = await fromStripe('checkout', () => stripe().checkout.sessions.create({
    mode: 'subscription',
    customer,
    // With an existing customer, Stripe needs leave to save the name and address
    // entered at checkout before it will collect a tax ID (ABN).
    customer_update: { name: 'auto', address: 'auto' },
    client_reference_id: req.company.id,
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    subscription_data: { metadata: { companyId: req.company.id }, ...(keepTrial ? { trial_end: trialEnd } : {}) },
    allow_promotion_codes: true,
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },
    success_url: `${base}/?billing=success`,
    cancel_url: `${base}/?billing=cancelled`,
  }));
  res.json({ url: session.url });
}));

// Change card, see invoices, or cancel, on Stripe's own page.
router.post('/billing/portal', auth.requireUser, route(async (req, res) => {
  if (!enabled() || !req.company.stripe_customer_id) throw auth.fail(400, 'There is no subscription to manage yet.');
  const session = await fromStripe('portal', () => stripe().billingPortal.sessions.create({ customer: req.company.stripe_customer_id, return_url: `${auth.appUrl(req)}/` }));
  res.json({ url: session.url });
}));

// Stripe statuses for a subscription that has ended. Any other Stripe status (active, trialing,
// past_due, unpaid, incomplete, paused) is a subscription still running at Stripe.
const ENDED = ['canceled', 'incomplete_expired'];
const liveSubscription = (company) => Boolean(company) && company.plan_status !== 'trial' && !ENDED.includes(company.plan_status);
// Stripe gives times in seconds.
const endDate = (subscription) => {
  const seconds = Number(subscription.ended_at || subscription.canceled_at);
  return seconds > 0 ? new Date(seconds * 1000) : new Date();
};

async function companyForSubscription(subscription) {
  const id = subscription.metadata && subscription.metadata.companyId;
  if (id) return db.one('SELECT * FROM companies WHERE id = $1', [id]);
  return db.one('SELECT * FROM companies WHERE stripe_customer_id = $1', [String(subscription.customer)]);
}

async function handleEvent(event) {
  const item = event.data.object;
  if (event.type === 'checkout.session.completed' && item.mode === 'subscription') {
    await db.query('UPDATE companies SET stripe_customer_id = $1, stripe_subscription_id = $2 WHERE id = $3',
      [String(item.customer), String(item.subscription), String(item.client_reference_id)]);
    return;
  }
  if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
    const company = await companyForSubscription(item);
    if (!company) return;
    const status = event.type === 'customer.subscription.deleted' ? 'canceled' : item.status;
    if (status !== company.plan_status) record(`plan_${status}`, company.id);
    // The day a subscription ended starts the 12 months its data is kept for; a new one clears it.
    const ended = ENDED.includes(status) ? (company.plan_ended_at || endDate(item)) : null;
    await db.query('UPDATE companies SET plan_status = $1, stripe_subscription_id = $2, stripe_customer_id = $3, plan_ended_at = $4 WHERE id = $5',
      [status, item.id, String(item.customer), ended, company.id]);
  }
}

// Stripe signs each webhook; the raw body is needed to check the signature.
const webhook = [
  express.raw({ type: 'application/json', limit: '1mb' }),
  route(async (req, res) => {
    if (!stripe() || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).end();
    let event;
    try {
      event = stripe().webhooks.constructEvent(req.body, req.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET);
    } catch {
      return res.status(400).json({ error: 'Bad signature.' });
    }
    await handleEvent(event);
    res.json({ received: true });
  }),
];

module.exports = { router, webhook, enabled, useStripe, handleEvent, liveSubscription };
