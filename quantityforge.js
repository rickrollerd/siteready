// The QuantityForge tab (QuantityForge build plan task 19, first part). A signed-in user uploads one
// drawing sheet as a PDF and sees the bill of quantities in plain trade words, answers what
// QuantityForge needs to know (a slab's thickness, edge, concrete grade and reinforcement), clicks a
// line to see where it sits on the drawing, changes a quantity, enters rates (AUD) and picks a trade.
//
// Only this server talks to QuantityForge, never the browser, so its API token stays here. Every call
// sends Authorization: Bearer QF_API_TOKEN and X-SiteWrite-User-Email, so a changed quantity records the
// person who changed it (QuantityForge docs/API.md). QuantityForge keeps nothing: the bill goes back and
// forth with the page, as its API is built.
//
// Off unless QF_TAB_ENABLED is set and QF_API_URL and QF_API_TOKEN are there too.
const express = require('express');
const { PDFParse } = require('pdf-parse');
const { requireUser } = require('./auth');
const view = require('./qf-view');

const MAX_BYTES = 50 * 1024 * 1024; // QuantityForge's own limit for a sheet.
// Wide enough to zoom into a dimension on an A1 sheet; about 1 MB as a picture.
const IMAGE_WIDTH = 2400;
const fail = (status, message) => Object.assign(new Error(message), { status, publicMessage: true });

const baseUrl = () => String(process.env.QF_API_URL || '').trim().replace(/\/+$/, '');
const apiToken = () => String(process.env.QF_API_TOKEN || '').trim();
const switchedOn = () => /^(1|true|yes|on)$/i.test(String(process.env.QF_TAB_ENABLED || '').trim());
const enabled = () => switchedOn() && Boolean(baseUrl()) && Boolean(apiToken());
const timeoutMs = (measuring) => {
  const set = Number(process.env.QF_TIMEOUT_MS);
  return Number.isFinite(set) && set > 0 ? set : measuring ? 300000 : 30000;
};

// QuantityForge's answer in words the user can act on. Its own words for a sheet it cannot measure
// (422) are about the sheet, so they are shown; a refused token or entitlement is SiteWrite's set-up,
// not the user's, so it says only that the tab is not available.
function qfFailure(status, payload) {
  const detail = payload && typeof payload.detail === 'string' ? payload.detail.slice(0, 300) : '';
  if (status === 401 || status === 403) return fail(502, 'QuantityForge is not available right now. Try again later.');
  if (status === 413) return fail(413, 'That PDF is over 50 MB. Upload just the sheet to measure.');
  if (status === 415) return fail(415, 'That file is not a PDF.');
  if (status === 404) return fail(404, 'That line is no longer in the bill. Measure the sheet again.');
  if (status === 422) return fail(422, detail ? `QuantityForge could not use this: ${detail}` : 'QuantityForge could not use this sheet.');
  return fail(502, 'QuantityForge could not measure this just now. Try again in a moment.');
}

// One call to QuantityForge. fetchImpl is for the tests.
async function qfCall(path, { method = 'GET', json, form, email, measuring = false, fetchImpl = fetch } = {}) {
  const headers = { Authorization: `Bearer ${apiToken()}`, Accept: 'application/json' };
  if (email) headers['X-SiteWrite-User-Email'] = String(email);
  let body;
  if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  let response;
  try {
    response = await fetchImpl(`${baseUrl()}/v1${path}`, { method, headers, body, signal: AbortSignal.timeout(timeoutMs(measuring)) });
  } catch {
    throw fail(503, 'QuantityForge is not answering. Try again in a moment.');
  }
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
  if (!response.ok) throw qfFailure(response.status, payload);
  return payload;
}

// The sheet as a picture for the page to draw on, and its size in PDF points so a line's box can be
// placed on it. A page that will not draw still measures: the page says the picture is missing.
async function pageImage(data, page) {
  const parser = new PDFParse({ data: new Uint8Array(data) });
  try {
    const shot = await parser.getScreenshot({ partial: [page], desiredWidth: IMAGE_WIDTH, imageDataUrl: true, imageBuffer: false });
    const one = shot && shot.pages && shot.pages[0];
    if (!one || !one.dataUrl || !(one.scale > 0)) return null;
    return { image: one.dataUrl, widthPt: one.width / one.scale, heightPt: one.height / one.scale };
  } catch {
    return null;
  } finally {
    await parser.destroy().catch(() => {});
  }
}

const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/i;
const wholeNumber = (value, low, high) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= low && n <= high ? n : null;
};

function readAnswers(req) {
  const raw = req.get('x-qf-answers');
  if (!raw) return {};
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw fail(400, 'The answers could not be read. Measure again.');
  }
}

function billFrom(body) {
  const bill = body && body.bill;
  if (!bill || typeof bill !== 'object' || Array.isArray(bill) || !Array.isArray(bill.lines)) throw fail(400, 'Measure the sheet first.');
  return bill;
}

function itemRefFrom(body) {
  const ref = body && typeof body.itemRef === 'string' ? body.itemRef.trim() : '';
  if (!ref || ref.length > 40) throw fail(400, 'Pick a line in the bill.');
  return ref;
}

const profileFrom = (body) => {
  const id = body && typeof body.profile === 'string' ? body.profile.trim() : '';
  return SAFE_ID.test(id) ? id : 'all';
};

// What the page shows: the whole bill is kept (a change on one trade's view is a change to the bill),
// and the lines shown are the picked trade's.
// The decisions on each line (reviews) come back with it, less any for lines no longer in the bill.
async function shown(bill, profile, email, fetchImpl, reviews = {}) {
  const filtered = profile && profile !== 'all'
    ? await qfCall('/bill/profile', { method: 'POST', json: { bill, profile }, email, fetchImpl })
    : bill;
  const kept = view.reviewsFrom(reviews, bill);
  return { bill, profile: profile || 'all', view: view.withReviews(view.billView(filtered), kept), questions: view.questionsView(bill), reviews: kept };
}

function router({ fetchImpl } = {}) {
  const r = express.Router();
  const call = (path, options) => qfCall(path, { ...options, fetchImpl: fetchImpl || fetch });
  const handle = (fn) => async (req, res, next) => {
    try { await fn(req, res); } catch (error) { next(error); }
  };

  r.get('/qf/status', (_req, res) => res.json({ enabled: enabled() }));
  r.use('/qf', (req, _res, next) => (enabled() ? next() : next(fail(404, 'The QuantityForge tab is not switched on.'))));

  r.get('/qf/profiles', requireUser, handle(async (req, res) => {
    const payload = await call('/profiles', { email: req.user.email });
    const profiles = (Array.isArray(payload.profiles) ? payload.profiles : [])
      .filter((p) => p && SAFE_ID.test(String(p.id || '')))
      .map((p) => ({ id: p.id, label: String(p.label || p.id) }));
    res.json({ profiles });
  }));

  // The sheet is the request body (PDF), its page and sheet type in the address, and the answers so far
  // in X-QF-Answers (the questions page's boxes, as JSON). ?image=1 also sends the page as a picture.
  r.post('/qf/measure', requireUser, express.raw({ type: () => true, limit: MAX_BYTES + 1024 }), handle(async (req, res) => {
    const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!data.length) throw fail(400, 'Choose the PDF of the sheet to measure.');
    if (data.length > MAX_BYTES) throw fail(413, 'That PDF is over 50 MB. Upload just the sheet to measure.');
    if (data.subarray(0, 5).toString('latin1') !== '%PDF-') throw fail(415, 'That file is not a PDF.');
    const page = wholeNumber(req.query.page || 1, 1, 9999);
    if (!page) throw fail(400, 'Give the page number of the sheet, 1 or more.');
    const sheetType = String(req.query.sheetType || 'slab_plan');
    if (!/^[a-z][a-z_]{0,39}$/.test(sheetType)) throw fail(400, 'Pick the kind of sheet.');
    const scale = req.query.scale ? wholeNumber(req.query.scale, 1, 10000) : null;
    if (req.query.scale && !scale) throw fail(400, 'Give the scale as one number, for example 100 for 1:100.');
    const params = view.paramsFromAnswers(readAnswers(req), { height_mm: req.query.heightMm, width_mm: req.query.widthMm });
    const profile = profileFrom(req.query);

    const form = new FormData();
    form.append('file', new Blob([data], { type: 'application/pdf' }), 'sheet.pdf');
    form.append('sheet_type', sheetType);
    form.append('page', String(page));
    if (scale) form.append('scale', String(scale));
    form.append('params', JSON.stringify(params));
    const [measured, picture] = await Promise.all([
      call('/sheets/measure', { method: 'POST', form, email: req.user.email, measuring: true }),
      req.query.image === '1' ? pageImage(data, page) : Promise.resolve(undefined),
    ]);
    if (!measured.bill || !Array.isArray(measured.bill.lines)) throw fail(502, 'QuantityForge could not measure this just now. Try again in a moment.');
    res.json({
      ...(await shown(measured.bill, profile, req.user.email, fetchImpl || fetch)),
      scaleStatus: String(measured.scale_status || ''),
      ...(picture !== undefined ? { page: picture } : {}),
    });
  }));

  r.post('/qf/provenance', requireUser, handle(async (req, res) => {
    const bill = billFrom(req.body);
    const itemRef = itemRefFrom(req.body);
    const prov = await call('/bill/provenance', { method: 'POST', json: { bill, item_ref: itemRef }, email: req.user.email });
    const line = view.provenanceView(prov, Number(req.body.pageWidthPt), Number(req.body.pageHeightPt));
    // The provenance answer can leave out what each item was taken as (thickness, grade and so on);
    // the bill line has it, so the page can still show which values were the user's answers.
    if (!line.parameters.length) {
      const billed = bill.lines.find((l) => l && l.item_ref === itemRef);
      line.parameters = view.provenanceView({ contributions: billed && billed.contributions }, 1, 1).parameters;
    }
    // Each change to the quantity, as QuantityForge recorded it on the line (who, from what, why), and its override.
    const billedLine = bill.lines.find((l) => l && l.item_ref === itemRef) || {};
    line.changes = (Array.isArray(billedLine.reasons) ? billedLine.reasons : []).filter((r) => typeof r === 'string' && /^quantity overridden by /.test(r)).map((r) => r.slice(0, 300));
    const o = prov && prov.override && typeof prov.override === 'object' ? prov.override : null;
    line.override = o ? { from: typeof o.qty_original === 'number' ? o.qty_original : null, by: String(o.overridden_by || '').slice(0, 200), at: String(o.overridden_at || '').slice(0, 40) } : null;
    res.json({ line });
  }));

  r.post('/qf/override', requireUser, handle(async (req, res) => {
    const bill = billFrom(req.body);
    const itemRef = itemRefFrom(req.body);
    const quantity = Number(req.body.quantity);
    if (req.body.quantity === '' || req.body.quantity === null || !Number.isFinite(quantity) || quantity < 0) throw fail(400, 'Give the quantity as a number, 0 or more.');
    const reason = String(req.body.reason || '').trim().slice(0, 200) || 'Changed in SiteWrite';
    const updated = await call('/bill/override', { method: 'POST', json: { bill, item_ref: itemRef, quantity, reason }, email: req.user.email });
    // A quantity typed in replaces what was decided on that line.
    const reviews = view.reviewsFrom(req.body.reviews, bill);
    delete reviews[itemRef];
    res.json(await shown(updated, profileFrom(req.body), req.user.email, fetchImpl || fetch, reviews));
  }));

  // Accept, reject, move to another line (reclassify) or reset one line. Accept is kept by SiteWrite only (an
  // override would mark the line low confidence); reject and move change quantities through /v1/bill/override, so
  // QuantityForge records who changed them. The decisions ride beside the bill (view.reviewsFrom).
  r.post('/qf/review', requireUser, handle(async (req, res) => {
    let bill = billFrom(req.body);
    const itemRef = itemRefFrom(req.body);
    const reviews = view.reviewsFrom(req.body.reviews, bill);
    const email = req.user.email;
    const lineOf = (b, ref) => b.lines.find((l) => l && l.item_ref === ref);
    const source = lineOf(bill, itemRef);
    if (!source) throw fail(404, 'Pick a line in the bill.');
    const qtyOf = (l) => (typeof l.qty_billed === 'number' && Number.isFinite(l.qty_billed) ? l.qty_billed : 0);
    const override = async (b, ref, quantity, reason) => call('/bill/override', { method: 'POST', json: { bill: b, item_ref: ref, quantity, reason }, email });
    const before = reviews[itemRef];
    const stamp = { by: String(email || ''), at: new Date().toISOString() };
    const action = String(req.body.action || '');
    if (action === 'accept') {
      if (before && before.state !== 'accepted') throw fail(400, 'Reset this line first.');
      reviews[itemRef] = { state: 'accepted', ...stamp };
    } else if (action === 'reject') {
      if (before && before.state !== 'accepted') throw fail(400, 'Reset this line first.');
      const qty = qtyOf(source);
      const reason = String(req.body.reason || '').replace(/\s+/g, ' ').trim().slice(0, 160);
      if (qty > 0) bill = await override(bill, itemRef, 0, `Rejected in SiteWrite${reason ? `: ${reason}` : ''}`);
      reviews[itemRef] = { state: 'rejected', ...stamp, qty };
    } else if (action === 'reclassify') {
      if (before && before.state !== 'accepted') throw fail(400, 'Reset this line first.');
      const toRef = typeof req.body.toRef === 'string' ? req.body.toRef.trim() : '';
      const target = toRef && toRef !== itemRef ? lineOf(bill, toRef) : null;
      if (!target) throw fail(400, 'Pick the line to move it to.');
      if (String(target.unit || '') !== String(source.unit || '')) throw fail(400, 'That line is in a different unit.');
      const qty = qtyOf(source);
      bill = await override(bill, itemRef, 0, `Moved to ${toRef} in SiteWrite`);
      const moved = lineOf(bill, toRef);
      if (!moved) throw fail(502, 'QuantityForge could not change this just now. Try again in a moment.');
      bill = await override(bill, toRef, qtyOf(moved) + qty, `Moved from ${itemRef} in SiteWrite`);
      delete reviews[toRef];
      reviews[itemRef] = { state: 'reclassified', ...stamp, to: toRef, qty };
    } else if (action === 'reset') {
      if (before && before.state === 'rejected') {
        bill = await override(bill, itemRef, before.qty, 'Reject undone in SiteWrite');
      } else if (before && before.state === 'reclassified') {
        const target = lineOf(bill, before.to);
        if (target) bill = await override(bill, before.to, Math.max(0, qtyOf(target) - before.qty), 'Move undone in SiteWrite');
        bill = await override(bill, itemRef, before.qty, 'Move undone in SiteWrite');
      }
      delete reviews[itemRef];
    } else {
      throw fail(400, 'Pick accept, reject, move or reset.');
    }
    if (!bill || !Array.isArray(bill.lines)) throw fail(502, 'QuantityForge could not change this just now. Try again in a moment.');
    res.json(await shown(bill, profileFrom(req.body), email, fetchImpl || fetch, reviews));
  }));

  r.post('/qf/rate', requireUser, handle(async (req, res) => {
    const bill = billFrom(req.body);
    const itemRef = itemRefFrom(req.body);
    const blank = req.body.rate === null || req.body.rate === '' || req.body.rate === undefined;
    const rate = blank ? null : Number(req.body.rate);
    if (!blank && (!Number.isFinite(rate) || rate < 0)) throw fail(400, 'Give the rate in dollars, 0 or more, or leave it empty.');
    const updated = await call('/bill/rate', { method: 'POST', json: { bill, item_ref: itemRef, rate }, email: req.user.email });
    res.json(await shown(updated, profileFrom(req.body), req.user.email, fetchImpl || fetch, view.reviewsFrom(req.body.reviews, bill)));
  }));

  // The bill as a CSV file: the lines of the trade picked, as the page shows them.
  r.post('/qf/export.csv', requireUser, handle(async (req, res) => {
    const bill = billFrom(req.body);
    const profile = profileFrom(req.body);
    const filtered = profile !== 'all' ? await call('/bill/profile', { method: 'POST', json: { bill, profile }, email: req.user.email }) : bill;
    const sheet = String(req.body.sheet || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 120);
    const stem = (sheet || 'bill').replace(/\.pdf\b/gi, '').replace(/[^A-Za-z0-9 ._-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'bill';
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${stem}-quantities.csv"`);
    res.send(view.billCsv(filtered, { sheet }));
  }));

  r.post('/qf/profile', requireUser, handle(async (req, res) => {
    const bill = billFrom(req.body);
    res.json(await shown(bill, profileFrom(req.body), req.user.email, fetchImpl || fetch, view.reviewsFrom(req.body.reviews, bill)));
  }));

  return r;
}

module.exports = { router, enabled, qfCall, qfFailure, pageImage, MAX_BYTES };
