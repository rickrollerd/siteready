const test = require('node:test');
const assert = require('node:assert/strict');
const { fixSpelling } = require('../spelling');
const { prepareDraft } = require('../draft');

// Testing agent F-003: clear typos of everyday words were left alone.
test('everyday words one letter out are corrected; site words and brands are not', () => {
  for (const [typo, word] of [['truses', 'trusses'], ['resedential', 'residential'], ['amenites', 'amenities']]) {
    assert.equal(fixSpelling(`install ${typo} now`).text, `install ${word} now`);
  }
  // Testing agent F-005: "nightshift" became "nightshirt". Run-together site words are left alone.
  for (const word of ['bunnings', 'concretor', 'bondek', 'tamarind', 'screeding', 'acrows', 'nightshift', 'nightwork', 'laydown', 'hardstand', 'vibro']) {
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

// Testing agent F-007: tilt-up work written as "tilt panels" or "tilt up" was not tilt-up high risk work.
test('tilt panels and tilt up are tilt-up or precast high risk work', () => {
  const { questionsFor } = require('../draft');
  for (const task of ['Erect tilt panels and portal frame to the new data centre with a 300t crane.', 'Tilt up concrete wall panels for the warehouse with a mobile crane.']) {
    const q = questionsFor({ state: 'nsw', task, fallRisk: 'yes' });
    const facts = {};
    for (const item of q.required || []) facts[item.id] = item.choices ? item.choices[0].value : 'Done to engineer design ED-01 and checked by the site manager before work starts.';
    const draft = prepareDraft({ state: 'nsw', task, fallRisk: 'yes', facts });
    assert.ok(draft.highRisk.some((item) => /tilt-up or precast/i.test(item)), task);
  }
});

// Testing agent F-008: a 100,000-character entry made the PDF add pages forever (502 on staging).
test('a PDF with an entry taller than a page is still made, quickly', async () => {
  const { draftToPdf } = require('../pdf-draft');
  const { draftBody } = require('../input');
  const { questionsFor } = require('../draft');
  const big = 'A'.repeat(100000);
  for (const task of ['Install sprinkler pipework in the ward ceilings from scissor lifts above 2 m. ' + big, 'Install sprinkler pipework in the ward ceilings from scissor lifts above 2 m.']) {
    const base = { state: 'qld', task, fallRisk: 'yes' };
    const facts = {};
    for (const item of questionsFor(draftBody(base)).required || []) facts[item.id] = item.choices ? item.choices[0].value : big;
    const draft = prepareDraft(draftBody({ ...base, facts, workplace: big, siteManager: big }));
    const started = Date.now();
    const pdf = await draftToPdf(draft);
    assert.ok(pdf.length > 1000);
    assert.ok(Date.now() - started < 10000, `took ${Date.now() - started} ms`);
  }
});
