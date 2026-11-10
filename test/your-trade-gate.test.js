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

test('a stated trade drops the questions only other trades\' work asks', () => {
  const { questionsFor } = require('../draft');
  const task = 'Paint the plant room walls. Install a new sub-board and run cables in the plant room.';
  const ids = (yourTrade) => questionsFor(ready({ ...ANSWERED, state: 'qld', task, fallRisk: 'no', residential: 'no', ...(yourTrade ? { yourTrade } : {}) })).required.map((item) => item.id);
  const open = ids(); const painter = ids('painting'); const sparky = ids('electrical');
  assert.ok(painter.length <= open.length && sparky.length <= open.length);
  for (const id of painter) assert.ok(open.includes(id), id);
});
