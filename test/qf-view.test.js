// The QuantityForge tab's words (qf-view.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const v = require('../qf-view');

test('units and held-back items read in plain words', () => {
  assert.deepEqual(['m2', 'm3', 'm', 'nr', 'kg', 't', 'm²', 'ha', null].map(v.unitLabel), ['m²', 'm³', 'm', 'each', 'kg', 't', 'm²', 'ha', '']);
  assert.deepEqual(['pad_footing#2', 'slab#1', 'strip_footing#10', 'pedestal'].map(v.heldBackLabel), ['Pad footing 2', 'Slab 1', 'Strip footing 10', 'Pedestal']);
});

test('a bill line carries its flags: low confidence, provisional, and a changed quantity with who changed it', () => {
  const view = v.billView({
    currency: 'AUD', total: 500, profile_id: 'concrete', held_back: ['slab#2', 'slab#2', 'pad_footing#1'], notes: ['a note'],
    cross_checks: [{ outcome: 'warn', message: 'Outline 2.3% off.' }, { outcome: 'pass', message: 'fine' }, { outcome: 'not_applicable', message: 'n/a' }],
    lines: [
      { item_ref: 'A', description: 'Slab', unit: 'm2', qty_billed: 105, qty_raw: 102.3, qty_original: 103, overridden_by: 'a@example.test', overridden_at: 'T', confidence: 0.69, provisional: true, rate: 5, amount: 525 },
      { item_ref: 'B', description: 'Edge', unit: 'm', qty_billed: 41, qty_raw: 40.46, confidence: 0.7, rate: null, amount: null },
    ],
  });
  assert.equal(view.profileId, 'concrete');
  assert.equal(view.total, 500);
  assert.deepEqual(view.lines[0].flags, ['Low confidence: check this quantity on the drawing.', 'Provisional quantity.', 'Quantity changed from 103 by a@example.test.']);
  assert.deepEqual(view.lines[0].overridden, { from: 103, by: 'a@example.test', at: 'T' });
  assert.deepEqual(view.lines[1].flags, [], '0.7 is not below 0.7');
  assert.equal(view.lines[1].overridden, null);
  assert.deepEqual(view.heldBack.map((h) => h.label), ['Slab 2', 'Pad footing 1']);
  assert.deepEqual(view.heldBackGroups, [{ label: 'Slab 2', count: 1 }, { label: 'Pad footing 1', count: 1 }]);
  assert.deepEqual(v.billView({ held_back: ['strip_footing#1', 'strip_footing#2', 'pad_footing#1', 'strip_footing#3'] }).heldBackGroups, [{ label: 'Strip footings', count: 3 }, { label: 'Pad footing 1', count: 1 }]);
  assert.deepEqual(view.warnings, ['Outline 2.3% off.']);
  assert.deepEqual(view.notes, ['a note']);
});

test('no rate on any line means no total; a missing bill never throws', () => {
  assert.equal(v.billView({ total: 0, lines: [{ item_ref: 'A', rate: null }] }).total, null);
  for (const bad of [null, undefined, 'x', [], { lines: 'no' }]) {
    const view = v.billView(bad);
    assert.deepEqual([view.lines, view.heldBack, view.notes, view.warnings, view.currency], [[], [], [], [], 'AUD']);
  }
});

test('questions are merged per item and question, in plain words, with the right kind of box', () => {
  const qs = v.questionsView({ questions: [
    { subject: 'slab', parameter: 'thickness_mm', candidate_refs: ['slab#1'], prompt: 'What is the slab thickness in mm for slab slab#1?', clause_ref: 'C1', suggested: null },
    { subject: 'slab', parameter: 'grade', candidate_refs: ['slab#1'], prompt: 'Grade?' },
    { subject: 'slab', parameter: 'reinforced', candidate_refs: ['slab#1'], prompt: 'What is the reinforced or plain?' },
    { subject: 'pad_footing', parameter: 'depth_mm', candidate_refs: ['pad_footing#1', 'pad_footing#2'], prompt: 'Depth?' },
    { subject: 'pad_footing', parameter: 'depth_mm', candidate_refs: ['pad_footing#2', 'pad_footing#3'], prompt: 'Depth again?', suggested: 400 },
    { subject: 'strip_footing', parameter: 'placement', candidate_refs: ['strip_footing#1', 'strip_footing#2', 'strip_footing#3', 'strip_footing#4', 'strip_footing#5', 'strip_footing#6', 'strip_footing#7'], prompt: 'Placement?' },
    { subject: 'slab', parameter: 'overall_dimensions', candidate_refs: ['slab#1'], prompt: 'Outline 2.3% off the dimensions.' },
    { subject: 'slab', parameter: 'odd_thing', candidate_refs: ['slab#1'], prompt: 'Something else?' },
    { subject: 'Slab<x>', parameter: 'grade', candidate_refs: [] },
  ] });
  assert.deepEqual(qs.map((q) => [q.key, q.label, q.input, q.unit, q.items]), [
    ['slab.thickness_mm', 'Slab thickness', 'number', 'mm', 'Slab 1'],
    ['slab.grade', 'Concrete grade', 'text', '', 'Slab 1'],
    ['slab.reinforced', 'Reinforced or plain?', 'choice', '', 'Slab 1'],
    ['pad_footing.depth_mm', 'Depth', 'number', 'mm', 'Pad footings 1, 2 and 3'],
    ['strip_footing.placement', 'Poured into formwork, or against the dug ground?', 'choice', '', 'Strip footings (7)'],
    ['slab.overall_dimensions', 'Check the slab outline', 'confirm', '', 'Slab 1'],
    ['slab.odd_thing', 'Something else?', 'text', '', 'Slab 1'],
  ]);
  assert.equal(qs[1].placeholder, 'For example N25 or N32');
  assert.deepEqual(qs[2].choices.map((c) => c.value), ['yes', 'no']);
  assert.equal(qs[3].suggested, 400);
  assert.equal(qs[3].prompt, 'Depth?');
  assert.equal(qs[0].clauseRef, 'C1');
  assert.deepEqual(v.questionsView({ questions: [{ subject: 'strip_footing', parameter: 'width_mm', candidate_refs: ['strip_footing#1', 'strip_footing#2'] }] })[0].items, 'Strip footings 1 and 2');
  assert.deepEqual(v.questionsView(null), []);
});

test('answers become QuantityForge params: numbers for sizes, yes or no for reinforcement, and no unsafe names', () => {
  const params = v.paramsFromAnswers({
    'slab.thickness_mm': '75', 'slab.edge_height_mm': '0', 'slab.reinforced': 'yes', 'slab.grade': '  N25 ', 'slab.level': '',
    'pad_footing.reinforced': 'no', 'pad_footing.depth_mm': 'deep', 'strip_footing.placement': 'into_formwork',
    '__proto__.polluted': 'x', 'slab.__proto__': 'x', 'constructor.prototype': 'x', 'no_dot': '1', 'a.b.c': '1', 'Slab.grade': 'N32',
  }, { height_mm: '300', width_mm: '-1', other: 5 });
  assert.deepEqual(params, {
    slab: { thickness_mm: 75, reinforced: true, grade: 'N25' },
    pad_footing: { reinforced: false },
    strip_footing: { placement: 'into_formwork' },
    defaults: { height_mm: 300 },
  });
  assert.equal({}.polluted, undefined);
  assert.equal(v.paramsFromAnswers({ 'slab.grade': 'x'.repeat(200) }).slab.grade.length, 80);
  assert.deepEqual(v.paramsFromAnswers(null), {});
  assert.deepEqual(v.paramsFromAnswers('x', {}), {});
});

test('a line box lands where the drawing is on the page (a QuantityForge test sheet, 1:100)', () => {
  const c = { sheet: { scale_ratio_mm_per_pt: 35.27777919324422 }, bbox_mm: [2822.2223354595376, -22644.446630795697, 14822.22351138551, -13644.446630795695] };
  const b = v.boxOnPage(c, 1190.551, 841.8898);
  const near = (a, e) => assert.ok(Math.abs(a - e) < 1e-3, `${a} vs ${e}`);
  near(b.left, 80 / 1190.551);
  near(b.top, 386.7717 / 841.8898);
  near(b.left + b.width, 420.1575 / 1190.551);
  near(b.top + b.height, 641.8898 / 841.8898);
  const flat = v.boxOnPage({ scale_ratio_mm_per_pt: 35.27777919324422, bbox_mm: c.bbox_mm }, 1190.551, 841.8898);
  near(flat.left, b.left);
});

test('a box is clipped to the page, and there is none without a box, a scale or a page size', () => {
  const clipped = v.boxOnPage({ scale_ratio_mm_per_pt: 1, bbox_mm: [-50, -150, 50, -50] }, 100, 100);
  assert.deepEqual(clipped, { left: 0, top: 0.5, width: 0.5, height: 0.5 });
  assert.equal(v.boxOnPage({ scale_ratio_mm_per_pt: 1, bbox_mm: [200, -50, 300, -10] }, 100, 100), null, 'off the page');
  assert.equal(v.boxOnPage({ scale_ratio_mm_per_pt: 1 }, 100, 100), null);
  assert.equal(v.boxOnPage({ scale_ratio_mm_per_pt: 0, bbox_mm: [0, -10, 10, 0] }, 100, 100), null);
  assert.equal(v.boxOnPage({ scale_ratio_mm_per_pt: 1, bbox_mm: [0, -10, 10, 0] }, 0, 100), null);
  assert.equal(v.boxOnPage(null, 100, 100), null);
});

test('a line detail lists its boxes, reasons, measures and what was taken as answered', () => {
  const view = v.provenanceView({
    item_ref: '7.1/001', description: 'Edge formwork', unit: 'm', qty_billed: 41, qty_raw: 40.46, clause_ref: 'C7',
    contributions: [
      { scale_ratio_mm_per_pt: 1, bbox_mm: [0, -50, 50, 0], reasons: ['outline found', 'gaps closed'], measures: { perimeter_m: { value: 40.46, unit: 'm' } }, parameters: { edge_height_mm: { value: 75, source: 'supplied' } } },
      { scale_ratio_mm_per_pt: 1, reasons: ['outline found'], measures: { area_m2: [102.3, 'm2', []] } },
    ],
  }, 100, 100);
  assert.equal(view.unitLabel, 'm');
  assert.deepEqual(view.boxes, [{ left: 0, top: 0, width: 0.5, height: 0.5 }]);
  assert.deepEqual(view.reasons, ['outline found', 'gaps closed']);
  assert.deepEqual(view.measures, [{ name: 'perimeter_m', value: 40.46, unit: 'm' }, { name: 'area_m2', value: 102.3, unit: 'm2' }]);
  assert.deepEqual(view.parameters, [{ name: 'edge_height_mm', value: 75, source: 'supplied' }]);
  assert.deepEqual(v.provenanceView(undefined, 1, 1).boxes, []);
});

test('the bill as a CSV file: the lines with their flags, the total, held-back items, and no formulas', () => {
  const csv = v.billCsv({
    currency: 'AUD', total: 1030, profile_id: 'concrete', held_back: ['pad_footing#1', 'pad_footing#2'], cross_checks: [{ outcome: 'warn', message: 'Outline 2.3% off.' }],
    lines: [
      { item_ref: '4.1/001', description: 'Surface preparation to slab bed', unit: 'm2', qty_billed: 103, qty_raw: 102.312, confidence: 0.9, rate: 10, amount: 1030 },
      { item_ref: '7.1/001', description: '=cmd|"/c calc"!A1, edge', unit: 'm', qty_billed: 41, qty_raw: 40.46, confidence: 0.5, rate: null, amount: null },
      { item_ref: '9/001', description: '-ve allowance', unit: 'nr', qty_billed: -1, confidence: 0.9 },
    ],
  }, { sheet: 'Ground floor page 2' });
  assert.ok(csv.startsWith('\ufeff'), 'byte order mark, so m² opens right');
  const rows = csv.slice(1).split('\r\n');
  assert.deepEqual(rows.slice(0, 5), ['Sheet,Ground floor page 2', 'Trade,concrete', 'Currency,"AUD, excluding GST"', '', 'Item,Description,Quantity,Unit,Rate,Amount,Measured (before rounding),Check']);
  assert.equal(rows[5], '4.1/001,Surface preparation to slab bed,103,m²,10,1030,102.312,');
  assert.equal(rows[6], `7.1/001,"'=cmd|""/c calc""!A1, edge",41,m,,,40.46,Low confidence: check this quantity on the drawing.`);
  assert.equal(rows[7], "9/001,'-ve allowance,-1,each,,,,", 'a number stays a number; text that starts like a formula does not');
  assert.equal(rows[8], ',Total of priced lines,,,,1030');
  assert.equal(rows[10], 'Found but not billed yet,Pad footings (2)');
  assert.equal(rows[11], 'Check,Outline 2.3% off.');
  assert.equal(v.billCsv({ lines: [] }).includes('Total'), false);
  assert.deepEqual([v.csvCell(null), v.csvCell('@x'), v.csvCell('a\nb'), v.csvCell(3)], ['', "'@x", '"a\nb"', '3']);
});
