const test = require('node:test');
const assert = require('node:assert/strict');
const { foundKinds, prepareDraft } = require('../draft');
const { draftBody } = require('../input');
const { ready, ANSWERED } = require('./helpers');

const BASE = { state: 'qld', fallRisk: 'no', residential: 'no', ...ANSWERED };

function kinds(extra) {
  const input = ready({ ...BASE, ...extra });
  return foundKinds(input) || [];
}

function draftKinds(extra) {
  const input = ready({ ...BASE, ...extra });
  const draft = prepareDraft(draftBody(input));
  return draft.jobSteps ? draft.jobSteps.map((s) => s.step) : [];
}

test('yourTrade painting gates glazing out of a mixed task', () => {
  const k = kinds({ task: 'Paint all walls. Fit glass shower screens and mirrors', yourTrade: 'painting' });
  assert.ok(k.includes('painting'));
  assert.ok(!k.includes('glassHandle'));
});

test('yourTrade glazing gates painting out of a mixed task', () => {
  const k = kinds({ task: 'Paint all walls. Fit glass shower screens and mirrors', yourTrade: 'glazing' });
  assert.ok(k.includes('glassHandle'));
  assert.ok(!k.includes('painting'));
});

test('no yourTrade leaves both trades in a mixed task', () => {
  const k = kinds({ task: 'Paint all walls. Fit glass shower screens and mirrors' });
  assert.ok(k.includes('painting'));
  assert.ok(k.includes('glassHandle'));
});

test('yourTrade fire keeps fire dampers', () => {
  const k = kinds({ task: 'Install fire dampers in the hospital wards', yourTrade: 'fire' });
  assert.ok(k.includes('fireDampers'));
  const steps = draftKinds({ task: 'Install fire dampers in the hospital wards', yourTrade: 'fire' });
  assert.ok(steps.some((s) => /fire dampers/i.test(s)));
});

test('unknown yourTrade changes nothing', () => {
  const k = kinds({ task: 'Paint all walls. Fit glass shower screens and mirrors', yourTrade: 'astronaut' });
  assert.ok(k.includes('painting'));
  assert.ok(k.includes('glassHandle'));
});

test('a scope trade wins over yourTrade', () => {
  const k = kinds({ task: 'Paint all walls. Fit glass shower screens and mirrors', trade: 'painting', yourTrade: 'glazing' });
  assert.ok(k.includes('painting'));
  assert.ok(!k.includes('glassHandle'));
});

test('a step of another trade added by hand stays, only the suggestions are gated', () => {
  const { questionsFor } = require('../draft');
  const body = ready({ ...ANSWERED, state: 'qld', task: 'Paint all walls. Fit glass shower screens and mirrors', fallRisk: 'no', residential: 'no', yourTrade: 'painting' });
  const { steps } = questionsFor({ ...body, kinds: ['painting', 'paintAccess', 'glassHandle'] });
  assert.ok(!steps.suggested.includes('glassHandle'), steps.suggested.join(', '));
  assert.ok(steps.chosen.includes('glassHandle'), steps.chosen.join(', '));
});

test('Your trade is kept from the form only when it is a known trade', () => {
  const { draftBody: draftFields } = require('../input');
  assert.equal(draftFields({ task: 'Paint the walls', yourTrade: 'painting' }).yourTrade, 'painting');
  assert.equal('yourTrade' in draftFields({ task: 'Paint the walls', yourTrade: 'astronaut' }), false);
  assert.equal('yourTrade' in draftFields({ task: 'Paint the walls' }), false);
  const { STATED_TRADES } = require('../activity-trades');
  assert.equal(STATED_TRADES.length, new Set(STATED_TRADES.map((t) => t.id)).size);
  assert.ok(STATED_TRADES.every((t) => typeof t.label === 'string' && t.label));
});

test('yourTrade plumbing keeps trench and road as any-trade work', () => {
  const k = kinds({ task: 'Lay 375 stormwater pipe in a 1.2 m deep trench along the street verge, next to the road.', yourTrade: 'plumbing' });
  assert.ok(k.includes('trench'), k.join(', '));
  assert.ok(k.includes('road'), k.join(', '));
});

test('yourTrade carpentry keeps doorHang', () => {
  const k = kinds({ task: 'Hang the new timber doors and fit the door hardware.', yourTrade: 'carpentry' });
  assert.ok(k.includes('doorHang'), k.join(', '));
});

test('yourTrade civil keeps asphaltLay', () => {
  const k = kinds({ task: 'Lay and roll asphalt on the service road with the paver and rollers.', yourTrade: 'civil' });
  assert.ok(k.includes('asphaltLay'), k.join(', '));
});

test('yourTrade demolition keeps structureDemolition and roofStrip', () => {
  const open = kinds({ task: 'Demolish a two storey brick office building. Strip the metal roof sheeting first.' });
  const k = kinds({ task: 'Demolish a two storey brick office building. Strip the metal roof sheeting first.', yourTrade: 'demolition' });
  for (const kind of open) assert.ok(k.includes(kind), `missing ${kind}: ` + k.join(', '));
});

test('silicaDrill stays off when a cutting kind is gated off by yourTrade', () => {
  const open = kinds({ task: 'Install shower screens, drilling into the tiled walls' });
  assert.ok(open.includes('tileCut'), open.join(', '));
  assert.ok(!open.includes('silicaDrill'), open.join(', '));
  const k = kinds({ task: 'Install shower screens, drilling into the tiled walls', yourTrade: 'glazing' });
  assert.ok(!k.includes('tileCut'), k.join(', '));
  assert.ok(!k.includes('silicaDrill'), k.join(', '));
});

test('a stated trade drops the questions only other trades\' work asks', () => {
  const { questionsFor } = require('../draft');
  const task = 'Paint the plant room walls. Install a new sub-board and run cables in the plant room.';
  const ids = (yourTrade) => questionsFor(ready({ ...ANSWERED, state: 'qld', task, fallRisk: 'no', residential: 'no', ...(yourTrade ? { yourTrade } : {}) })).required.map((item) => item.id);
  const open = ids(); const painter = ids('painting'); const sparky = ids('electrical');
  assert.ok(painter.length <= open.length && sparky.length <= open.length);
  for (const id of painter) assert.ok(open.includes(id), id);
});

test('a fire contractor keeps painting its own pipework, a plumber keeps the thrust block concrete', () => {
  const fire = kinds({ task: 'Install sprinkler pipework. Paint fire services installation as specified.', yourTrade: 'fire' });
  assert.ok(fire.includes('painting'), fire.join(', '));
  const task = 'Water mains: excavate the trench, lay PE and PVC mains, form and pour the concrete thrust blocks, and pressure test the main.';
  const open = kinds({ task });
  const plumber = kinds({ task, yourTrade: 'plumbing' });
  for (const kind of open) assert.ok(plumber.includes(kind), `missing ${kind}: ${plumber.join(', ')}`);
});

test('a tiler retiling a floor keeps stripping out the old tiles', () => {
  const open = kinds({ task: 'Retile a commercial kitchen floor.' });
  const tiler = kinds({ task: 'Retile a commercial kitchen floor.', yourTrade: 'tiling' });
  for (const kind of open) assert.ok(tiler.includes(kind), `missing ${kind}: ${tiler.join(', ')}`);
});

test('a scaffolder keeps setting up the area below, a formwork crew keeps jumping its perimeter screens', () => {
  for (const [task, yourTrade] of [
    ['Erect and dismantle a tube and coupler scaffold up the front of a 3 storey building, with hoarding and fencing at the base on the footpath.', 'scaffolding'],
    ['Erect, strip and remove formwork to suspended slabs. Install and jump the perimeter screens.', 'structure'],
  ]) {
    const open = kinds({ task });
    const stated = kinds({ task, yourTrade });
    for (const kind of open) assert.ok(stated.includes(kind), `${yourTrade} missing ${kind}: ${stated.join(', ')}`);
  }
});

test('a pasted scope with a stated trade that does not match it: the scope trade wins and no scope step is dropped', () => {
  const { tasksFromScope } = require('../scope');
  const { questionsFor } = require('../draft');
  const scopes = [
    ['SCOPE OF WORKS - PAINTING\n1. Prepare and paint all internal plasterboard walls and ceilings, 3 coat system.\n2. Paint the external render and fascias from a mobile scaffold.\n3. Spray paint the timber doors with an airless sprayer.', 'electrical'],
    ['SCOPE OF WORKS - ELECTRICAL\n1. Install a new sub-board in the plant room and run cables through the ceiling space.\n2. Fit off downlights and power points.\n3. Test and commission the new circuits.', 'painting'],
  ];
  let checked = 0;
  for (const [text, wrongTrade] of scopes) {
    const read = tasksFromScope(text);
    assert.ok(read.tasks.length, text);
    for (const item of read.tasks) {
      assert.notEqual(item.trade, wrongTrade);
      // As the form sends a picked scope task (its trade and its steps), and with the trade alone.
      for (const sent of [{ task: item.task, trade: item.trade, kinds: item.kinds }, { task: item.task, trade: item.trade }]) {
        const plain = ready({ ...BASE, ...sent });
        const stated = ready({ ...BASE, ...sent, yourTrade: wrongTrade });
        assert.deepEqual(foundKinds(stated), foundKinds(plain), `${item.task} (${wrongTrade})`);
        assert.deepEqual(questionsFor(stated).required.map((q) => q.id), questionsFor(plain).required.map((q) => q.id), item.task);
        assert.deepEqual(questionsFor(stated).steps, questionsFor(plain).steps, item.task);
        const steps = (input) => (prepareDraft(draftBody(input)).jobSteps || []).map((step) => step.step);
        assert.deepEqual(steps(stated), steps(plain), item.task);
        checked += 1;
      }
    }
  }
  assert.ok(checked >= 4, `checked ${checked}`);
});
