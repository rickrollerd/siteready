const test = require('node:test');
const assert = require('node:assert/strict');
const { questionsFor, workFlags } = require('../draft');
const { readSlang } = require('../slang');
const { fixSpelling } = require('../spelling');
const { VARIANTS, CARDS, HOLDOUT } = require('./typed-variants.data');

// Goal 1: a subbie finds the task by typing it the way they would on a phone.
const ticked = new Map();
const ticks = (task) => {
  if (!ticked.has(task)) {
    const asked = questionsFor({ task, state: 'qld', fallRisk: 'no', crane: 'company' });
    ticked.set(task, (asked.steps && asked.steps.chosen) || []);
  }
  return ticked.get(task);
};
const passes = (row) => {
  const got = ticks(row.typed);
  return row.want.every((group) => group.some((id) => got.includes(id))) && !row.not.some((id) => got.includes(id));
};
const share = (rows) => ({ pass: rows.filter(passes).length, total: rows.length, failing: rows.filter((row) => !passes(row)).map((row) => row.typed) });

test('every catalogue task has a short, jargon, place and misspelt wording', () => {
  const tasks = [...new Set(VARIANTS.map((row) => `${row.trade}: ${row.label}`))];
  assert.equal(tasks.length, 285, 'the 285 catalogue tasks');
  for (const label of tasks) {
    const styles = VARIANTS.filter((row) => `${row.trade}: ${row.label}` === label).map((row) => row.style);
    for (const style of ['short', 'jargon', 'place', 'spelling']) assert.ok(styles.includes(style), `${label}: no ${style} wording`);
  }
});

// The pass shares when this was built (9 October 2026). They may rise, never fall. Before this work:
// wordings 757 of 1145, test kit cards 67 of 107, fresh wordings 182 of 241.
test('plain typed wordings tick the main job step (pass share holds)', () => {
  const all = share(VARIANTS);
  assert.equal(all.total, 1145);
  assert.ok(all.pass >= 1145, `wordings: ${all.pass} of ${all.total}; failing: ${all.failing.join(' | ')}`);
});

test('the test kit cards, and the plain wordings for them, tick the answer key main step', () => {
  const all = share(CARDS);
  assert.equal(all.total, 107);
  assert.ok(all.pass >= 107, `cards: ${all.pass} of ${all.total}; failing: ${all.failing.join(' | ')}`);
});

test('wordings written after the rules were built tick the main job step', () => {
  const all = share(HOLDOUT);
  assert.equal(all.total, 241);
  assert.ok(all.pass >= 241, `fresh wordings: ${all.pass} of ${all.total}; failing: ${all.failing.join(' | ')}`);
});

test('the wordings that missed on staging now tick the main step', () => {
  assert.ok(ticks('Refrigeration pipework').includes('refrigerantPipework'));
  assert.ok(ticks('aircon copper pipework').includes('refrigerantPipework'));
  assert.ok(ticks('In ground drainage').includes('trench'));
  assert.ok(ticks('Hydraulic pipework at height').includes('hydraulicRisers'));
  assert.ok(ticks('plasterboard walls').includes('plasterSheets'));
  assert.ok(ticks('frame and sheet walls').includes('plasterSheets'));
  assert.ok(ticks('set air handling units on roof').some((id) => ['plantLift', 'roofPlant'].includes(id)));
  const kerb = ticks('concrete kerb with kerb machine');
  assert.ok(kerb.includes('kerbInstall') && !kerb.includes('slabGround'), kerb.join(', '));
});

test('shorthand and slips are read the way they are meant', () => {
  const read = (text) => readSlang(fixSpelling(text).text);
  assert.equal(read('set AHUs on roof'), 'set air handling units on roof');
  assert.equal(read('temp power'), 'temporary power');
  assert.equal(read('elec fitoff'), 'electrical fit off');
  assert.equal(read('hydro rough in'), 'hydraulic rough in');
  assert.equal(read('hydro test'), 'hydrostatic test');
  assert.equal(read('PT the bridge deck'), 'post-tensioning the bridge deck');
  assert.equal(read('curb and channel'), 'kerb and channel');
  assert.equal(read('tower crain erection'), 'tower crane erection');
  assert.equal(read('hydrolic pipework'), 'hydraulic pipework');
  assert.equal(read('balcony tilling'), 'balcony tiling');
  assert.equal(read('rotary hoe tilling the garden beds'), 'rotary hoe tilling the garden beds');
  assert.equal(read('in ground drainage'), 'in-ground drainage');
  assert.equal(read('work in ground floor offices'), 'work in ground floor offices');
  for (const text of ['set AHUs on roof', 'PT the bridge deck', 'franna lifts', 're roofing', 'curb and channel']) assert.equal(readSlang(readSlang(text)), readSlang(text));
});

test('work the library has no steps for is still not forced onto a near step', () => {
  assert.ok(!ticks('install screw piles with an excavator').some((id) => ['pilingRig', 'drivenPiles', 'pileComplete'].includes(id)));
  assert.deepEqual(ticks('de-stressing'), []);
  assert.ok(!ticks('hazmat audit and asbestos sampling before demo').includes('asbestos'));
  assert.ok(!ticks('UPS install').includes('generatorPlant'));
  assert.ok(!ticks('erect mast climbers on the facade').includes('swingStage'));
  assert.ok(!ticks('install silt fence and sediment basin').some((id) => ['earthworks', 'plumbingFitOff'].includes(id)));
});

test('plain wording rules do not fire on other work that uses the same words', () => {
  // Torch-on sheet membranes are not liquid membranes; installing condensing units on the roof is
  // not receiving plant with a crane; bored piling rigs being assembled are not piles being bored.
  assert.ok(!ticks('Lay torch-on bitumen sheet membranes on the roof and podium next to the edge, lifting the membrane rolls by hoist.').includes('wpLiquid'));
  assert.ok(!ticks('Install condensing units, exhaust fans and ductwork on the roof, including brazing connections, next to the roof edge.').includes('plantLift'));
  assert.ok(!workFlags('Deliver, assemble and dismantle the CFA and bored piling rigs, and build and maintain the piling working platform in the basement excavation.').titleKinds.includes('pilingRig'));
  // Tiles on a slab on ground, reo to ground slabs, cast-in items in bondek slabs and traffic counters.
  assert.ok(!ticks('Prepare slab on ground and direct stick internal CT1 tiles (Internal floors, slab on ground).').includes('slabPour'));
  assert.ok(!ticks('Place, tie and chair reinforcing steel (bar and mesh) to ground slabs (Ground slabs).').includes('slabPour'));
  assert.ok(!ticks('Install cast-in sleeves, holding bolts and conduits into formwork (In-situ, bondek and precast slabs).').includes('deckingStuds'));
  assert.ok(!ticks('Line marking, Raised Pavement Markers, Signs & Traffic Counters Installation').includes('carpJoinery'));
  // Fire services named as the work are not live fire system work; control cabling is not a control panel.
  assert.ok(!ticks('Install in-ground and under-slab fire services (Under building slabs).').includes('fireLive'));
  assert.ok(!ticks('Install AVRS power supply, underground conduits and control cabling (Gatehouse; Sally Port).').includes('controlPanelInstall'));
  // Test and tag is not commissioning; a live sewer is not live electrical work; coring is not cast-in.
  assert.ok(!ticks('Test and tag electrical equipment').includes('commissioning'));
  assert.ok(!ticks('Connections to live sewers and work in existing manholes').includes('isolation'));
  assert.ok(!ticks('core drill through slab for conduits').includes('castIn'));
  assert.ok(!ticks('remove asbestos lagging from pipes, friable').includes('mechInsulation'));
  assert.ok(!ticks('reline sewer pipe').includes('trench'));
  assert.ok(!ticks('jump the core form').includes('formwork'));
  // A PE pipe butt weld in in-ground reticulation is not trenching.
  assert.ok(!ticks('Butt weld PE pipe (In-ground reticulation). On-site steel welding.').includes('trench'));
});
