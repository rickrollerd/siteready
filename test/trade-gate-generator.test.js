// Code review A (D316): a generator named in typed text with no electrical work is a portable one in use,
// with its own job step, not the electrical generator install steps. A scope's trade still gates as before.
const test = require('node:test');
const assert = require('node:assert/strict');
const { suggestedKinds } = require('../draft');
const { ACTIVITIES } = require('../activities');
const { COMMON } = require('../trades');

test('a generator placed in a roofing task is used, not installed', () => {
  const kinds = suggestedKinds('Replace the metal roof sheets. Place a generator near the shed', {}, {});
  assert.ok(kinds.includes('generatorUse'), kinds.join(', '));
  assert.ok(!kinds.includes('generatorPlant'), kinds.join(', '));
  assert.ok(kinds.includes('roof'), kinds.join(', '));
});

test('a portable generator or a genny for power is used', () => {
  assert.ok(suggestedKinds('Run a portable generator for the power tools while framing the walls', {}, {}).includes('generatorUse'));
  assert.ok(suggestedKinds('Hire a genny for the site sheds', {}, {}).includes('generatorUse'));
});

test('installing, testing or controlling a generator keeps the electrical steps, with no use step', () => {
  const install = suggestedKinds('Install a standby generator and day tank in the plant room', {}, {});
  assert.ok(install.includes('generatorPlant') && !install.includes('generatorUse'), install.join(', '));
  const commission = suggestedKinds('Commission the generator with a load bank', {}, {});
  assert.ok(commission.includes('generatorTest') && !commission.includes('generatorUse'), commission.join(', '));
  const panel = suggestedKinds('Install generator control panel and modify existing generator master control system', {}, {});
  assert.ok(!panel.includes('generatorUse'), panel.join(', '));
});

test('the generator use activity has its step and is any trade\'s work', () => {
  const activity = ACTIVITIES.find((item) => item.when === 'generatorUse');
  assert.ok(activity && activity.steps.some((step) => step.step === 'Use a portable generator'));
  assert.ok(activity.steps.every((step) => step.hazards.some((line) => /carbon monoxide/i.test(line))));
  assert.ok(COMMON.has('generatorUse'));
});
