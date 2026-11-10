// The review of each bill line on the QuantityForge tab (accept, reject, move, reset), against the same stand-in
// QuantityForge as test/quantityforge.test.js (helpers copied from there).
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const PDFDocument = require('pdfkit');

const TOKEN = 'test-qf-token-not-real';
const ON = { QF_TAB_ENABLED: '1', QF_API_URL: 'http://qf.invalid', QF_API_TOKEN: TOKEN };

function withEnv(vars, fn) {
  return async () => {
    const before = {};
    for (const key of ['QF_TAB_ENABLED', 'QF_API_URL', 'QF_API_TOKEN']) { before[key] = process.env[key]; delete process.env[key]; }
    Object.assign(process.env, vars);
    try { await fn(); } finally {
      for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
  };
}

const line = (ref, rule, unit, qty, extra = {}) => ({
  item_ref: ref, rule_id: rule, clause_ref: 'Clause 1', description: `Line ${ref}`, unit, qty_raw: qty, qty_billed: Math.ceil(qty),
  confidence: 0.9, reasons: [], provisional: false, rate: null, amount: null,
  contributions: [{ candidate_ref: 'slab#1', sheet: { sheet_id: 'sheet.pdf p1', page_index: 0, scale_status: 'verified', scale_ratio_mm_per_pt: 35.27777919324422 }, element_ids: ['l0'], measures: { area_m2: [qty, unit, []] }, parameters: {}, reasons: ['slab recognised'], bbox_mm: [2822.2223354595376, -22644.446630795697, 14822.22351138551, -13644.446630795695] }],
  ...extra,
});
const BILL = {
  currency: 'AUD', total: 0, profile_id: 'all', notes: [], cross_checks: [], held_back: ['pad_footing#1'],
  questions: [{ ref: 'Q1', subject: 'pad_footing', parameter: 'depth_mm', rule_id: 'conc.footing.pad.count', clause_ref: 'Clause 2', candidate_refs: ['pad_footing#1'], prompt: 'What is the depth in mm?', suggested: null }],
  lines: [line('6.1/001', 'conc.slab.ground.area', 'm2', 102.312), line('9/001', 'block.wall.area', 'm2', 20)],
};
const NO_PARAMS_BILL = {
  ...BILL, lines: [], held_back: ['slab#1'],
  questions: [
    { ref: 'Q1', subject: 'slab', parameter: 'thickness_mm', clause_ref: 'Clause 1', candidate_refs: ['slab#1'], prompt: 'What is the slab thickness in mm?', suggested: null },
    { ref: 'Q2', subject: 'slab', parameter: 'reinforced', clause_ref: 'Clause 1', candidate_refs: ['slab#1'], prompt: 'Reinforced or plain?', suggested: null },
  ],
};

// A stand-in QuantityForge that records each call.
function fakeQf({ measured = BILL, status = 200 } = {}) {
  const calls = [];
  const reply = (code, body) => new Response(JSON.stringify(body), { status: code, headers: { 'Content-Type': 'application/json' } });
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname;
    const json = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ path, method: init.method, headers: init.headers, json, form: init.body instanceof FormData ? init.body : null });
    if (status !== 200) return reply(status, { detail: 'refused' });
    if (path === '/v1/profiles') return reply(200, { profiles: [{ id: 'all', label: 'All trades', prefixes: [] }, { id: 'concrete', label: 'Concrete', prefixes: ['conc.'] }] });
    if (path === '/v1/sheets/measure') return reply(200, { bill: measured, scale_ratio_mm_per_pt: 35.27, scale_status: 'verified' });
    if (path === '/v1/bill/profile') return reply(200, { ...json.bill, profile_id: json.profile, lines: json.bill.lines.filter((l) => json.profile === 'all' || l.rule_id.startsWith('conc.')) });
    if (path === '/v1/bill/override') {
      const lines = json.bill.lines.map((l) => (l.item_ref === json.item_ref ? { ...l, qty_original: l.qty_billed, qty_billed: json.quantity, overridden_by: init.headers['X-SiteWrite-User-Email'], overridden_at: '2026-11-10T09:00:00Z' } : l));
      return lines.some((l) => l.item_ref === json.item_ref) ? reply(200, { ...json.bill, lines }) : reply(404, { detail: 'not found' });
    }
    if (path === '/v1/bill/rate') {
      const lines = json.bill.lines.map((l) => (l.item_ref === json.item_ref ? { ...l, rate: json.rate, amount: json.rate === null ? null : l.qty_billed * json.rate } : l));
      return reply(200, { ...json.bill, lines, total: lines.reduce((t, l) => t + (l.amount || 0), 0) });
    }
    if (path === '/v1/bill/provenance') {
      const found = json.bill.lines.find((l) => l.item_ref === json.item_ref);
      if (!found) return reply(404, { detail: 'not found' });
      return reply(200, { item_ref: found.item_ref, rule_id: found.rule_id, clause_ref: found.clause_ref, description: found.description, unit: found.unit, qty_billed: found.qty_billed, qty_raw: found.qty_raw, override: null,
        contributions: found.contributions.map(({ sheet, parameters: _left, ...c }) => ({ ...c, sheet_id: sheet.sheet_id, scale_ratio_mm_per_pt: sheet.scale_ratio_mm_per_pt, measures: { area_m2: { value: found.qty_raw, unit: 'm2', notes: [] } } })) });
    }
    return reply(404, { detail: 'no route' });
  };
  return { calls, fetchImpl };
}

async function serve(qf, { user = { email: 'estimator@example.test' } } = {}) {
  delete require.cache[require.resolve('../quantityforge')];
  const { router } = require('../quantityforge');
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use((req, _res, next) => { if (user) req.user = user; next(); });
  app.use('/api', router({ fetchImpl: qf.fetchImpl }));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ kind: 'error', message: error.publicMessage ? error.message : 'Server error' }));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/qf`;
  return { base, close: () => new Promise((resolve) => server.close(resolve)) };
}

function pdf() {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4' });
    const parts = [];
    doc.on('data', (b) => parts.push(b));
    doc.on('end', () => resolve(Buffer.concat(parts)));
    doc.rect(80, 80, 300, 200).stroke();
    doc.end();
  });
}

const post = (base, path, json) => fetch(`${base}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(json) });
const view = require('../qf-view');
const WITH_M3 = { ...BILL, lines: [...BILL.lines, line('6.1/002', 'conc.slab.ground.volume', 'm3', 10.2)] };
const overrides = (qf) => qf.calls.filter((c) => c.path === '/v1/bill/override');
const qtyOf = (data, ref) => data.bill.lines.find((l) => l.item_ref === ref).qty_billed;
const lineOf = (data, ref) => data.view.lines.find((l) => l.itemRef === ref);

test('accepting a line calls nothing on QuantityForge and comes back marked', withEnv(ON, async () => {
  const qf = fakeQf();
  const app = await serve(qf);
  try {
    const r = await post(app.base, 'review', { bill: BILL, itemRef: '6.1/001', action: 'accept' });
    const data = await r.json();
    assert.equal(r.status, 200);
    assert.equal(qf.calls.length, 0);
    assert.equal(data.reviews['6.1/001'].state, 'accepted');
    assert.equal(data.reviews['6.1/001'].by, 'estimator@example.test');
    assert.ok(lineOf(data, '6.1/001').flags.includes('Accepted by estimator@example.test.'));
    assert.equal(qtyOf(data, '6.1/001'), 103);
  } finally { await app.close(); }
}));

test('rejecting a line sets it to 0 through the override, with the token and the user, and reset puts it back', withEnv(ON, async () => {
  const qf = fakeQf();
  const app = await serve(qf);
  try {
    const r = await post(app.base, 'review', { bill: BILL, itemRef: '6.1/001', action: 'reject', reason: 'Counted on the other sheet' });
    const data = await r.json();
    assert.equal(r.status, 200);
    const [call] = overrides(qf);
    assert.equal(call.json.quantity, 0);
    assert.equal(call.json.item_ref, '6.1/001');
    assert.equal(call.json.reason, 'Rejected in SiteWrite: Counted on the other sheet');
    assert.equal(call.headers['X-SiteWrite-User-Email'], 'estimator@example.test');
    assert.equal(call.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(qtyOf(data, '6.1/001'), 0);
    assert.deepEqual({ state: data.reviews['6.1/001'].state, qty: data.reviews['6.1/001'].qty }, { state: 'rejected', qty: 103 });
    assert.ok(!JSON.stringify(data).includes(TOKEN));
    // A rejected line cannot be accepted or moved until it is reset.
    assert.equal((await post(app.base, 'review', { bill: data.bill, reviews: data.reviews, itemRef: '6.1/001', action: 'accept' })).status, 400);
    const back = await (await post(app.base, 'review', { bill: data.bill, reviews: data.reviews, itemRef: '6.1/001', action: 'reset' })).json();
    assert.equal(qtyOf(back, '6.1/001'), 103);
    assert.deepEqual(back.reviews, {});
    assert.equal(overrides(qf).at(-1).json.reason, 'Reject undone in SiteWrite');
  } finally { await app.close(); }
}));

test('moving a line to another of the same unit moves its quantity, and reset undoes both', withEnv(ON, async () => {
  const qf = fakeQf();
  const app = await serve(qf);
  try {
    const data = await (await post(app.base, 'review', { bill: BILL, itemRef: '9/001', action: 'reclassify', toRef: '6.1/001' })).json();
    assert.equal(overrides(qf).length, 2);
    assert.equal(qtyOf(data, '9/001'), 0);
    assert.equal(qtyOf(data, '6.1/001'), 123);
    assert.deepEqual(overrides(qf).map((c) => c.json.reason), ['Moved to 6.1/001 in SiteWrite', 'Moved from 9/001 in SiteWrite']);
    assert.equal(data.reviews['9/001'].to, '6.1/001');
    assert.ok(lineOf(data, '9/001').flags.includes('Moved to 6.1/001 by estimator@example.test.'));
    const back = await (await post(app.base, 'review', { bill: data.bill, reviews: data.reviews, itemRef: '9/001', action: 'reset' })).json();
    assert.equal(qtyOf(back, '9/001'), 20);
    assert.equal(qtyOf(back, '6.1/001'), 103);
    assert.deepEqual(back.reviews, {});
  } finally { await app.close(); }
}));

test('a move to a line in another unit, to itself or to nothing is refused before QuantityForge is called', withEnv(ON, async () => {
  const qf = fakeQf();
  const app = await serve(qf);
  try {
    const unit = await post(app.base, 'review', { bill: WITH_M3, itemRef: '6.1/001', action: 'reclassify', toRef: '6.1/002' });
    assert.equal(unit.status, 400);
    assert.equal((await unit.json()).message, 'That line is in a different unit.');
    assert.equal((await post(app.base, 'review', { bill: BILL, itemRef: '6.1/001', action: 'reclassify', toRef: '6.1/001' })).status, 400);
    assert.equal((await post(app.base, 'review', { bill: BILL, itemRef: '6.1/001', action: 'reclassify' })).status, 400);
    assert.equal((await post(app.base, 'review', { bill: BILL, itemRef: '6.1/001', action: 'delete' })).status, 400);
    assert.equal((await post(app.base, 'review', { bill: BILL, itemRef: 'nope', action: 'accept' })).status, 404);
    assert.equal(qf.calls.length, 0);
  } finally { await app.close(); }
}));

test('a typed quantity replaces the decision on that line; a rate or a trade keeps it', withEnv(ON, async () => {
  const qf = fakeQf();
  const app = await serve(qf);
  try {
    const reviews = { '6.1/001': { state: 'accepted', by: 'a@example.test', at: '2026-11-11T00:00:00Z' }, '9/001': { state: 'accepted', by: 'a@example.test', at: '2026-11-11T00:00:00Z' } };
    const typed = await (await post(app.base, 'override', { bill: BILL, reviews, itemRef: '6.1/001', quantity: 105 })).json();
    assert.deepEqual(Object.keys(typed.reviews), ['9/001']);
    const rated = await (await post(app.base, 'rate', { bill: BILL, reviews, itemRef: '6.1/001', rate: 10 })).json();
    assert.deepEqual(Object.keys(rated.reviews).sort(), ['6.1/001', '9/001']);
    const traded = await (await post(app.base, 'profile', { bill: BILL, reviews, profile: 'concrete' })).json();
    assert.equal(traded.view.lines[0].review.state, 'accepted');
  } finally { await app.close(); }
}));

test('the review route is off with the tab', withEnv({ QF_API_URL: 'http://qf.invalid', QF_API_TOKEN: TOKEN }, async () => {
  const qf = fakeQf();
  const app = await serve(qf);
  try {
    assert.equal((await post(app.base, 'review', { bill: BILL, itemRef: '6.1/001', action: 'accept' })).status, 404);
    assert.equal(qf.calls.length, 0);
  } finally { await app.close(); }
}));

test('reviews from the page keep only known lines, known states and sound values', () => {
  const kept = view.reviewsFrom({
    '6.1/001': { state: 'rejected', by: 'a@example.test', at: 'x', qty: 103 },
    '9/001': { state: 'reclassified', to: '6.1/001', qty: 20 },
    'nope': { state: 'accepted' },
    __proto__: { state: 'accepted' },
    '6.1/002': { state: 'accepted' },
  }, BILL);
  assert.deepEqual(Object.keys(kept).sort(), ['6.1/001', '9/001']);
  assert.deepEqual(view.reviewsFrom({ '6.1/001': { state: 'deleted' }, '9/001': { state: 'rejected', qty: -1 } }, BILL), {});
  assert.deepEqual(view.reviewsFrom({ '9/001': { state: 'reclassified', to: '9/001', qty: 1 } }, BILL), {});
  assert.deepEqual(view.reviewsFrom('nonsense', BILL), {});
  // A decided line is not called low confidence (an override caps QuantityForge's confidence).
  const low = view.withReviews(view.billView({ lines: [line('6.1/001', 'r', 'm2', 5, { confidence: 0.6 })] }), { '6.1/001': { state: 'accepted', by: 'a@example.test' } });
  assert.deepEqual(low.lines[0].flags, ['Accepted by a@example.test.']);
});

test('a picked line lists the changes QuantityForge recorded on it', withEnv(ON, async () => {
  const qf = fakeQf();
  const app = await serve(qf);
  try {
    const changed = { ...BILL, lines: BILL.lines.map((l) => (l.item_ref === '6.1/001' ? { ...l, qty_billed: 0, reasons: ['quantity overridden by estimator@example.test from 103 to 0: Rejected in SiteWrite', 'confidence capped below review threshold after override'] } : l)) };
    const { line: picked } = await (await post(app.base, 'provenance', { bill: changed, itemRef: '6.1/001', pageWidthPt: 842, pageHeightPt: 595 })).json();
    assert.deepEqual(picked.changes, ['quantity overridden by estimator@example.test from 103 to 0: Rejected in SiteWrite']);
    const { line: plain } = await (await post(app.base, 'provenance', { bill: BILL, itemRef: '9/001', pageWidthPt: 842, pageHeightPt: 595 })).json();
    assert.deepEqual(plain.changes, []);
    assert.equal(plain.override, null);
  } finally { await app.close(); }
}));
