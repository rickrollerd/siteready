const test = require('node:test');
const assert = require('node:assert/strict');
const { fixSpelling } = require('../spelling');
const { prepareDraft, questionsFor } = require('../draft');

test('clear typos in a task are fixed and listed', () => {
  const fixed = fixSpelling('Install plasterbord walls and cielings, then excavete the trench.');
  assert.equal(fixed.text, 'Install plasterboard walls and ceilings, then excavate the trench.');
  assert.deepEqual(fixed.fixes.map((fix) => fix.to), ['plasterboard', 'ceilings', 'excavate']);
});

test('names, brands, site words and plurals are left as written', () => {
  for (const text of ['Replace the Colorbond gutters at Smithfeild St.', 'Pour the bondek deck on the highset house.', 'Plant Syzgium moorei in the garden beds.', 'Telehandlers and formworkers on site.', 'Install CCTV, the flange and the porte cochere.', 'Skilled concretor for the slab.']) {
    assert.deepEqual(fixSpelling(text).fixes, [], text);
  }
});

test('the draft reads the fixed task and the SWMS prints it', () => {
  const body = { state: 'qld', task: 'Install plasterbord walls and cielings on level 3.', fallRisk: 'no' };
  assert.deepEqual(questionsFor(body).spellingFixes.map((fix) => fix.from), ['plasterbord', 'cielings']);
  assert.equal(prepareDraft(body).task, 'Install plasterboard walls and ceilings on level 3.');
});
