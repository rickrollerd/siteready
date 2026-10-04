// A quote is read like a scope of works: prices, totals, rates, terms and exclusions are not work.
const test = require('node:test');
const assert = require('node:assert');
const { siteWorkLines, tasksFromScope } = require('../scope');

const STEEL = `APEX STEEL FABRICATIONS PTY LTD
QUOTATION No. Q-2417
Project: Warehouse B, Pinkenba QLD

Item  Description                                                   Qty   Unit   Rate       Amount
1     Supply, fabricate and erect structural steel portal frames     86    t      $5,850     $503,100.00
2     Mobile crane hire (60t) for steel erection                     12    days   $2,400     $28,800.00
4     Roof and wall purlins and girts, supply and install            1     item              $96,000.00
      Subtotal                                                                             $712,500.00
      TOTAL                                                                                $783,750.00

Exclusions
- Concrete, holding down bolt setting, roof and wall cladding, electrical, fire services

Qualifications
- Price valid for 30 days
- Payment terms: 30 days from end of month`;

const CIVIL = `Quote 5521 - Civil and stormwater works
Penrith Business Park Stage 2, Penrith NSW

Scope of quote
Bulk earthworks cut to fill and compaction to 98% SMDD .......... $142,000
Supply and lay 450mm RCP stormwater in shored trenches (to 3.2 m deep), 320 lm .......... $188,500
Pavement: subgrade prep, 300mm DGB20, 40mm AC14 .......... $221,000
Traffic management on Mulgoa Rd for connection works .......... $18,000

Total ex GST: $615,700

Excludes: electrical conduits, landscaping, demolition, contaminated material disposal
Rates for extra over: rock excavation $95/m3
This quote is valid for 60 days. Progress claims monthly.`;

const ELECTRICAL = `SPARKFORCE ELECTRICAL
Quote: Fit-out electrical, Level 3 tenancy, 200 Adelaide St Brisbane

1. Strip out existing lighting and power to tenancy (make safe by isolating at DB) - $6,400
2. Install new LED lighting on Unistrut in ceiling, 140 fittings - $38,200
5. Emergency and exit lighting, test and tag - $7,900
TOTAL $110,000 + GST`;

test('quote lines keep the work and drop the prices', () => {
  const lines = siteWorkLines(STEEL);
  assert.ok(lines.includes('Supply, fabricate and erect structural steel portal frames.'));
  assert.ok(lines.every((line) => !/\$|\btotal\b|\bvalid\b|payment/i.test(line)), lines.join('\n'));
});

test('a short priced item is work, not a heading', () => {
  assert.ok(siteWorkLines(ELECTRICAL).includes('Emergency and exit lighting, test and tag.'));
});

test('inline exclusions and rates in a quote are not work', () => {
  const lines = siteWorkLines(CIVIL);
  assert.ok(!lines.some((line) => /^(Excludes|Rates)/.test(line)), lines.join('\n'));
  const titles = tasksFromScope(CIVIL, 'nsw').tasks.map((task) => task.title);
  assert.ok(!titles.some((title) => /contaminated/i.test(title)), titles.join(', '));
  assert.ok(titles.includes('Trenching and underground services'), titles.join(', '));
});

test('a deep trench in one quote line is enough for a trench task', () => {
  const task = tasksFromScope(CIVIL, 'qld').tasks.find((item) => item.id === 'trench');
  assert.ok(task && task.needsSwms);
});

test('a scope line ending in a number is left alone', () => {
  assert.deepStrictEqual(siteWorkLines('Install handrails to the stairs from ground to level 3'), ['Install handrails to the stairs from ground to level 3.']);
});

test('the silica hazard row is the same in every state for a trench with pipe cutting', () => {
  const { prepareDraft, questionsFor } = require('../draft');
  const task = 'Supply and lay 450mm RCP stormwater in shored trenches (to 3.2 m deep), 320 lm, and reinstate the concrete paving.';
  for (const state of ['qld', 'nsw', 'vic', 'sa', 'wa', 'tas', 'act', 'nt']) {
    const base = { state, task, fallRisk: 'no', residential: 'no', company: 'T', principalContractor: 'P', kinds: ['trench'] };
    const facts = {};
    let done;
    for (let round = 0; round < 5; round += 1) {
      for (const item of questionsFor({ ...base, facts }).required || []) {
        const options = item.choices || item.options;
        if (!facts[item.id]) facts[item.id] = options && options.length ? options[0].value : `As planned: ${item.label}`;
      }
      done = prepareDraft({ ...base, facts });
      if (done.kind !== 'stand-down') break;
    }
    assert.ok(JSON.stringify(done.hazards).includes('Respirable crystalline silica'), state);
  }
});

test('one line of deep trench or road work makes a task in Victoria as in the other states', () => {
  const ids = (state) => tasksFromScope(CIVIL, state).tasks.map((task) => task.id).sort().join(',');
  for (const state of ['nsw', 'vic', 'sa', 'wa', 'tas', 'act', 'nt']) assert.equal(ids(state), ids('qld'), state);
});

test('a drawing with almost no text is named as such', () => {
  const result = tasksFromScope('su\nb\nm\nit yo\n34275\nRectangle\n34275\nCall Out\nInstall\n');
  assert.equal(result.tasks.length, 0);
  assert.match(result.note, /almost no text/);
});
