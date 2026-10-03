const test = require('node:test');
const assert = require('node:assert/strict');
const { fixSpelling } = require('../spelling');
const { prepareDraft } = require('../draft');

// Testing agent F-003: clear typos of everyday words were left alone.
test('everyday words one letter out are corrected; site words and brands are not', () => {
  for (const [typo, word] of [['truses', 'trusses'], ['resedential', 'residential'], ['amenites', 'amenities']]) {
    assert.equal(fixSpelling(`install ${typo} now`).text, `install ${word} now`);
  }
  for (const word of ['bunnings', 'concretor', 'bondek', 'tamarind', 'screeding', 'acrows']) {
    assert.equal(fixSpelling(`install ${word} now`).text, `install ${word} now`, word);
  }
});

test('a 1.2 m trench is not high risk work for trenches over 1.5 m; a deeper or unstated one is', () => {
  const trench = (task) => prepareDraft({ state: 'vic', task, fallRisk: 'no', facts: { trenchSupport: 'Trench shield installed before entry.', silicaControls: 'Wet cutting.' } })
    .highRisk.some((item) => /trench or shaft/i.test(item));
  assert.equal(trench('Saw cut and excavate a 1.2 m trench across a live road for a new water main, with an excavator.'), false);
  assert.equal(trench('Excavate a 2.4 m trench for a sewer main with an excavator.'), true);
  assert.equal(trench('Excavate a 30 m trench for a sewer main, 2 m deep, with an excavator.'), true);
  assert.equal(trench('Excavate a trench for a sewer main with an excavator.'), true);
});
