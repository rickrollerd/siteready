// The QuantityForge tab's server side (quantityforge.js), against a stand-in QuantityForge: only the
// server calls QuantityForge, with the token and the user's email; the token never reaches the page.
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

test('the tab is off unless QF_TAB_ENABLED, QF_API_URL and QF_API_TOKEN are all set', withEnv({ QF_API_URL: 'http://qf.invalid', QF_API_TOKEN: TOKEN }, async () => {
  const qf = fakeQf();
  const app = await serve(qf);
  try {
    assert.deepEqual(await (await fetch(`${app.base}/status`)).json(), { enabled: false });
    const r = await fetch(`${app.base}/profiles`);
    assert.equal(r.status, 404);
    assert.match((await r.json()).message, /not switched on/);
    assert.equal(qf.calls.length, 0);
  } finally { await app.close(); }
}));

test('a signed-out person cannot use the tab', withEnv(ON, async () => {
  const qf = fakeQf();
  const app = await serve(qf, { user: null });
  try {
    assert.deepEqual(await (await fetch(`${app.base}/status`)).json(), { enabled: true });
    assert.equal((await fetch(`${app.base}/profiles`)).status, 401);
    assert.equal(qf.calls.length, 0);
  } finally { await app.close(); }
}));

test('measuring sends the sheet, the answers as params, the token and the user email, and gives the plain bill and the page picture', withEnv(ON, async () => {
  const qf = fakeQf();
  const app = await serve(qf);
  try {
    const answers = encodeURIComponent(JSON.stringify({ 'slab.thickness_mm': '75', 'slab.reinforced': 'yes', 'slab.grade': ' N25 ', '__proto__.x': '1' }));
    const r = await fetch(`${app.base}/measure?page=1&sheetType=slab_plan&image=1&heightMm=300`, { method: 'POST', headers: { 'Content-Type': 'application/pdf', 'X-QF-Answers': answers }, body: await pdf() });
    const text = await r.text();
    assert.equal(r.status, 200, text);
    assert.ok(!text.includes(TOKEN), 'the token never goes to the page');
    const data = JSON.parse(text);
    const call = qf.calls.find((c) => c.path === '/v1/sheets/measure');
    assert.equal(call.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(call.headers['X-SiteWrite-User-Email'], 'estimator@example.test');
    assert.equal(call.form.get('sheet_type'), 'slab_plan');
    assert.equal(call.form.get('page'), '1');
    assert.deepEqual(JSON.parse(call.form.get('params')), { slab: { thickness_mm: 75, reinforced: true, grade: 'N25' }, defaults: { height_mm: 300 } });
    assert.equal(data.view.lines.length, 2);
    assert.equal(data.view.lines[0].unitLabel, 'm²');
    assert.equal(data.view.lines[0].qty, 103);
    assert.equal(data.questions[0].key, 'pad_footing.depth_mm');
    assert.deepEqual(data.view.heldBack, [{ ref: 'pad_footing#1', label: 'Pad footing 1' }]);
    assert.equal(data.profile, 'all');
    assert.match(data.page.image, /^data:image\/png;base64,/);
    assert.ok(Math.abs(data.page.widthPt - 595.28) < 1 && Math.abs(data.page.heightPt - 841.89) < 1, JSON.stringify([data.page.widthPt, data.page.heightPt]));
  } finally { await app.close(); }
}));

test('a measure with no answers gives the questions and the held-back items, not a bill', withEnv(ON, async () => {
  const qf = fakeQf({ measured: NO_PARAMS_BILL });
  const app = await serve(qf);
  try {
    const r = await fetch(`${app.base}/measure?page=1`, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: await pdf() });
    const data = await r.json();
    assert.equal(r.status, 200);
    assert.deepEqual(JSON.parse(qf.calls[0].form.get('params')), {});
    assert.equal(data.view.lines.length, 0);
    assert.deepEqual(data.questions.map((q) => [q.key, q.label, q.input]), [['slab.thickness_mm', 'Slab thickness', 'number'], ['slab.reinforced', 'Reinforced or plain?', 'choice']]);
    assert.deepEqual(data.view.heldBack.map((h) => h.label), ['Slab 1']);
    assert.equal(data.page, undefined, 'no picture unless asked for');
  } finally { await app.close(); }
}));

test('a file that is not a PDF, an empty file and a bad page are refused before QuantityForge is called', withEnv(ON, async () => {
  const qf = fakeQf();
  const app = await serve(qf);
  try {
    assert.equal((await fetch(`${app.base}/measure`, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: 'hello' })).status, 415);
    assert.equal((await fetch(`${app.base}/measure`, { method: 'POST', headers: { 'Content-Type': 'application/pdf' } })).status, 400);
    assert.equal((await fetch(`${app.base}/measure?page=0`, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: await pdf() })).status, 400);
    assert.equal((await fetch(`${app.base}/measure?sheetType=../x`, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: await pdf() })).status, 400);
    assert.equal(qf.calls.length, 0);
  } finally { await app.close(); }
}));

test('QuantityForge refusing the token is said plainly, without its words or the token', withEnv(ON, async () => {
  const qf = fakeQf({ status: 401 });
  const app = await serve(qf);
  try {
    const r = await fetch(`${app.base}/profiles`);
    const text = await r.text();
    assert.equal(r.status, 502);
    assert.match(JSON.parse(text).message, /not available right now/);
    assert.ok(!text.includes(TOKEN) && !text.includes('refused'));
  } finally { await app.close(); }
}));

test('QuantityForge not answering is a plain 503', withEnv(ON, async () => {
  const app = await serve({ fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  try {
    const r = await fetch(`${app.base}/profiles`);
    assert.equal(r.status, 503);
    assert.match((await r.json()).message, /not answering/);
  } finally { await app.close(); }
}));

test('the trade list comes from QuantityForge', withEnv(ON, async () => {
  const qf = fakeQf();
  const app = await serve(qf);
  try {
    const data = await (await fetch(`${app.base}/profiles`)).json();
    assert.deepEqual(data.profiles, [{ id: 'all', label: 'All trades' }, { id: 'concrete', label: 'Concrete' }]);
  } finally { await app.close(); }
}));

test('picking a trade shows only its lines, and the whole bill is kept', withEnv(ON, async () => {
  const qf = fakeQf();
  const app = await serve(qf);
  try {
    const data = await (await post(app.base, 'profile', { bill: BILL, profile: 'concrete' })).json();
    assert.deepEqual(data.view.lines.map((l) => l.itemRef), ['6.1/001']);
    assert.equal(data.bill.lines.length, 2);
    assert.equal(data.profile, 'concrete');
    assert.equal(qf.calls[0].json.profile, 'concrete');
  } finally { await app.close(); }
}));

test('changing a quantity records the signed-in user, and the trade view stays', withEnv(ON, async () => {
  const qf = fakeQf();
  const app = await serve(qf);
  try {
    const r = await post(app.base, 'override', { bill: BILL, itemRef: '6.1/001', quantity: 105, profile: 'concrete' });
    const data = await r.json();
    assert.equal(r.status, 200);
    const call = qf.calls.find((c) => c.path === '/v1/bill/override');
    assert.equal(call.headers['X-SiteWrite-User-Email'], 'estimator@example.test');
    assert.deepEqual(call.json, { bill: BILL, item_ref: '6.1/001', quantity: 105, reason: 'Changed in SiteWrite' });
    assert.equal(data.view.lines.length, 1);
    assert.equal(data.view.lines[0].qty, 105);
    assert.deepEqual(data.view.lines[0].overridden, { from: 103, by: 'estimator@example.test', at: '2026-11-10T09:00:00Z' });
    assert.equal(data.bill.lines.length, 2);
    assert.equal((await post(app.base, 'override', { bill: BILL, itemRef: '6.1/001', quantity: -1 })).status, 400);
    assert.equal((await post(app.base, 'override', { bill: BILL, itemRef: '6.1/001', quantity: '' })).status, 400);
    assert.equal((await post(app.base, 'override', { bill: BILL, itemRef: 'nope', quantity: 1 })).status, 404);
    assert.equal((await post(app.base, 'override', { itemRef: '6.1/001', quantity: 1 })).status, 400);
  } finally { await app.close(); }
}));

test('a rate gives the amount and the total in AUD, and an empty rate clears it', withEnv(ON, async () => {
  const qf = fakeQf();
  const app = await serve(qf);
  try {
    const rated = await (await post(app.base, 'rate', { bill: BILL, itemRef: '6.1/001', rate: 250 })).json();
    assert.equal(rated.view.currency, 'AUD');
    assert.equal(rated.view.lines[0].amount, 25750);
    assert.equal(rated.view.total, 25750);
    const cleared = await (await post(app.base, 'rate', { bill: rated.bill, itemRef: '6.1/001', rate: '' })).json();
    assert.equal(qf.calls.at(-1).json.rate, null);
    assert.equal(cleared.view.lines[0].rate, null);
    assert.equal((await post(app.base, 'rate', { bill: BILL, itemRef: '6.1/001', rate: -5 })).status, 400);
  } finally { await app.close(); }
}));

test('clicking a line gives where it sits on the page and how it was measured', withEnv(ON, async () => {
  const qf = fakeQf();
  const app = await serve(qf);
  try {
    const { line: l } = await (await post(app.base, 'provenance', { bill: BILL, itemRef: '6.1/001', pageWidthPt: 1190.551, pageHeightPt: 841.8898 })).json();
    assert.equal(l.itemRef, '6.1/001');
    assert.equal(l.boxes.length, 1);
    const [b] = l.boxes;
    assert.ok(Math.abs(b.left - 80 / 1190.551) < 1e-3 && Math.abs(b.top - 386.7717 / 841.8898) < 1e-3);
    assert.ok(Math.abs(b.left + b.width - 420.1575 / 1190.551) < 1e-3 && Math.abs(b.top + b.height - 641.8898 / 841.8898) < 1e-3);
    assert.deepEqual(l.reasons, ['slab recognised']);
    assert.deepEqual(l.measures, [{ name: 'area_m2', value: 102.312, unit: 'm2' }]);
    assert.deepEqual(l.parameters, [], 'none in the bill line either');
    const withParams = { ...BILL, lines: BILL.lines.map((x, i) => (i ? x : { ...x, contributions: [{ ...x.contributions[0], parameters: { thickness_mm: { value: 75, source: 'supplied' } } }] })) };
    const { line: l2 } = await (await post(app.base, 'provenance', { bill: withParams, itemRef: '6.1/001', pageWidthPt: 1190.551, pageHeightPt: 841.8898 })).json();
    assert.deepEqual(l2.parameters, [{ name: 'thickness_mm', value: 75, source: 'supplied' }], 'taken from the bill line when provenance leaves them out');
  } finally { await app.close(); }
}));
