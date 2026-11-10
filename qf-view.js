// The QuantityForge tab's words (quantityforge.js): QuantityForge's bill, questions and line detail
// turned into what the page shows, in plain trade language. Pure functions: no calls, no files.
const UNITS = { m2: 'm²', 'm²': 'm²', m3: 'm³', 'm³': 'm³', m: 'm', nr: 'each', kg: 'kg', t: 't' };
const SAFE = /^[a-z][a-z0-9_]*$/;
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
const list = (value) => (Array.isArray(value) ? value : []);
const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

function unitLabel(unit) {
  if (unit === null || unit === undefined) return '';
  return UNITS[unit] || String(unit);
}

// 'pad_footing#2' -> 'Pad footing 2'.
function words(kind) {
  const text = String(kind || '').replace(/_/g, ' ').trim();
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}
function heldBackLabel(ref) {
  const [kind, n] = String(ref || '').split('#');
  return n === undefined ? words(kind) : `${words(kind)} ${n}`.trim();
}

const LOW_CONFIDENCE = 0.7;
function lineView(line) {
  const l = line && typeof line === 'object' ? line : {};
  const overridden = l.overridden_by ? { from: l.qty_original, by: l.overridden_by, at: l.overridden_at || null } : null;
  const flags = [];
  if (num(l.confidence) !== null && l.confidence < LOW_CONFIDENCE) flags.push('Low confidence: check this quantity on the drawing.');
  if (l.provisional === true) flags.push('Provisional quantity.');
  if (overridden) flags.push(`Quantity changed from ${overridden.from} by ${overridden.by}.`);
  return {
    itemRef: String(l.item_ref || ''),
    description: String(l.description || ''),
    qty: num(l.qty_billed),
    qtyRaw: num(l.qty_raw),
    unit: l.unit || '',
    unitLabel: unitLabel(l.unit),
    rate: num(l.rate),
    amount: num(l.amount),
    confidence: num(l.confidence),
    flags,
    overridden,
  };
}

function billView(bill) {
  const b = bill && typeof bill === 'object' && !Array.isArray(bill) ? bill : {};
  const lines = list(b.lines).map(lineView);
  const seen = new Set();
  const heldBack = list(b.held_back).filter((ref) => typeof ref === 'string' && !seen.has(ref) && seen.add(ref)).map((ref) => ({ ref, label: heldBackLabel(ref) }));
  // A sheet can hold back dozens of footings, so the page lists them by kind.
  const groups = new Map();
  for (const { ref } of heldBack) {
    const kind = ref.split('#')[0];
    groups.set(kind, (groups.get(kind) || 0) + 1);
  }
  const heldBackGroups = [...groups.entries()].map(([kind, count]) => ({ label: count > 1 ? `${words(kind)}s` : heldBackLabel(heldBack.find((h) => h.ref.split('#')[0] === kind).ref), count }));
  return {
    currency: typeof b.currency === 'string' && b.currency ? b.currency : 'AUD',
    total: lines.some((l) => l.rate !== null) ? num(b.total) : null,
    profileId: typeof b.profile_id === 'string' && b.profile_id ? b.profile_id : 'all',
    lines,
    heldBack,
    heldBackGroups,
    notes: list(b.notes).filter((n) => typeof n === 'string'),
    warnings: list(b.cross_checks).filter((c) => c && (c.outcome === 'warn' || c.outcome === 'fail') && typeof c.message === 'string').map((c) => c.message),
  };
}

const LABELS = {
  thickness_mm: 'Slab thickness', edge_height_mm: 'Slab edge height', grade: 'Concrete grade', reinforced: 'Reinforced or plain?',
  level: 'Level', length_mm: 'Length', width_mm: 'Width', depth_mm: 'Depth', height_mm: 'Height',
  placement: 'Poured into formwork, or against the dug ground?', overall_dimensions: 'Check the slab outline',
};
const CHOICES = {
  reinforced: [{ value: 'yes', label: 'Reinforced' }, { value: 'no', label: 'Plain' }],
  placement: [{ value: 'into_formwork', label: 'Into formwork' }, { value: 'between_excavated_faces', label: 'Against the dug ground' }],
};
const PLACEHOLDERS = { grade: 'For example N25 or N32', level: 'For example Ground' };

// ['pad_footing#1', 'pad_footing#2', 'pad_footing#3'] -> 'Pad footings 1, 2 and 3'.
function itemsInWords(refs) {
  const all = list(refs).filter((r) => typeof r === 'string');
  if (!all.length) return '';
  if (all.length === 1) return heldBackLabel(all[0]);
  const kinds = new Set(all.map((r) => r.split('#')[0]));
  if (kinds.size > 1) return all.map(heldBackLabel).join(', ');
  const plural = `${words(all[0].split('#')[0])}s`;
  if (all.length > 6) return `${plural} (${all.length})`;
  const ns = all.map((r) => r.split('#')[1] || '');
  return `${plural} ${ns.slice(0, -1).join(', ')} and ${ns.at(-1)}`;
}

function questionsView(bill) {
  const groups = new Map();
  for (const q of list(bill && bill.questions)) {
    if (!q || !SAFE.test(String(q.subject || '')) || !SAFE.test(String(q.parameter || ''))) continue;
    const key = `${q.subject}.${q.parameter}`;
    const group = groups.get(key);
    if (group) {
      for (const ref of list(q.candidate_refs)) if (!group.refs.includes(ref)) group.refs.push(ref);
      if (group.suggested === null && q.suggested !== null && q.suggested !== undefined) group.suggested = q.suggested;
      continue;
    }
    groups.set(key, { q, refs: [...list(q.candidate_refs)], suggested: q.suggested ?? null });
  }
  return [...groups.entries()].map(([key, { q, refs, suggested }]) => {
    const mm = q.parameter.endsWith('_mm');
    const input = q.parameter === 'overall_dimensions' ? 'confirm' : CHOICES[q.parameter] ? 'choice' : mm ? 'number' : 'text';
    return {
      key,
      subject: q.subject,
      parameter: q.parameter,
      label: LABELS[q.parameter] || String(q.prompt || q.parameter),
      input,
      unit: mm ? 'mm' : '',
      choices: input === 'choice' ? CHOICES[q.parameter] : [],
      placeholder: PLACEHOLDERS[q.parameter] || '',
      items: itemsInWords(refs),
      prompt: String(q.prompt || ''),
      suggested,
      clauseRef: String(q.clause_ref || ''),
    };
  });
}

// The page's answers as QuantityForge's params. Only safe names are copied, so a crafted answer name
// cannot reach an object's prototype.
function paramsFromAnswers(answers, defaults) {
  const params = {};
  const plain = answers && typeof answers === 'object' && !Array.isArray(answers) ? answers : {};
  for (const [key, raw] of Object.entries(plain)) {
    const parts = key.split('.');
    if (parts.length !== 2) continue;
    const [subject, parameter] = parts;
    if (!SAFE.test(subject) || !SAFE.test(parameter) || UNSAFE.has(subject) || UNSAFE.has(parameter)) continue;
    let value;
    if (parameter.endsWith('_mm')) {
      const n = typeof raw === 'string' && raw.trim() === '' ? NaN : Number(raw);
      if (!Number.isFinite(n) || n <= 0) continue;
      value = n;
    } else if (parameter === 'reinforced') {
      if (raw === 'yes' || raw === true) value = true;
      else if (raw === 'no' || raw === false) value = false;
      else continue;
    } else {
      const text = String(raw ?? '').trim().slice(0, 80);
      if (!text) continue;
      value = text;
    }
    if (!Object.prototype.hasOwnProperty.call(params, subject)) params[subject] = {};
    params[subject][parameter] = value;
  }
  const d = {};
  for (const name of ['height_mm', 'width_mm']) {
    const raw = defaults && typeof defaults === 'object' ? defaults[name] : undefined;
    if (raw === undefined || raw === null || raw === '') continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) d[name] = n;
  }
  if (Object.keys(d).length) params.defaults = d;
  return params;
}

// Where a contribution sits on the page, as fractions of the page. QuantityForge gives the box in sheet
// millimetres with the PDF's top-down Y negated, so the page top is -maxY.
function boxOnPage(contribution, pageWidthPt, pageHeightPt) {
  const c = contribution && typeof contribution === 'object' ? contribution : {};
  const bbox = c.bbox_mm;
  const ratio = num(c.sheet && c.sheet.scale_ratio_mm_per_pt) ?? num(c.scale_ratio_mm_per_pt);
  const w = Number(pageWidthPt);
  const h = Number(pageHeightPt);
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every((v) => num(v) !== null) || !(ratio > 0) || !(w > 0) || !(h > 0)) return null;
  const clip = (v) => Math.min(1, Math.max(0, v));
  const left = clip(bbox[0] / ratio / w);
  const right = clip(bbox[2] / ratio / w);
  const top = clip(-bbox[3] / ratio / h);
  const bottom = clip(-bbox[1] / ratio / h);
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}

function provenanceView(prov, pageWidthPt, pageHeightPt) {
  const p = prov && typeof prov === 'object' ? prov : {};
  const contributions = list(p.contributions).filter((c) => c && typeof c === 'object');
  const reasons = [...new Set(contributions.flatMap((c) => list(c.reasons).filter((r) => typeof r === 'string')))];
  const measures = [];
  const parameters = [];
  for (const c of contributions) {
    for (const [name, m] of Object.entries(c.measures && typeof c.measures === 'object' ? c.measures : {})) {
      if (Array.isArray(m)) measures.push({ name, value: m[0] ?? null, unit: m[1] ?? '' });
      else if (m && typeof m === 'object') measures.push({ name, value: m.value ?? null, unit: m.unit ?? '' });
    }
    for (const [name, v] of Object.entries(c.parameters && typeof c.parameters === 'object' ? c.parameters : {})) {
      if (v && typeof v === 'object') parameters.push({ name, value: v.value ?? null, source: v.source ?? '' });
    }
  }
  return {
    itemRef: String(p.item_ref || ''),
    description: String(p.description || ''),
    unit: p.unit || '',
    unitLabel: unitLabel(p.unit),
    qty: num(p.qty_billed),
    qtyRaw: num(p.qty_raw),
    clauseRef: String(p.clause_ref || ''),
    boxes: contributions.map((c) => boxOnPage(c, pageWidthPt, pageHeightPt)).filter(Boolean),
    reasons,
    measures,
    parameters,
  };
}

module.exports = { unitLabel, heldBackLabel, billView, questionsView, paramsFromAnswers, boxOnPage, provenanceView };
