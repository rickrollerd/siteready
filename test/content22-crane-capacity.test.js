// content22, crane capacity: a heaviest load over the crane's rated capacity is a must-fix on the questions page, at
// download and in Builder check, not a crane chart answer that prints. Made-up companies, people and sites only.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { checkSwms } = require('../builder-check');
const gate = require('../public/gate-rules');

const SITE = { residential: 'no', company: 'Test', workplace: '12 Wattle Road, Hamilton', principalContractor: 'Corbel Build Pty Ltd', hospital: 'Northside General Hospital', firstAider: 'Jo Smith', musterPoint: 'Front gate', worksManager: 'Sam Lee', worksManagerPhone: '0400 118 552', complianceResponsible: 'Sam Lee', reviewer: 'Sam Lee', date: '10 November 2026' };
function answered(input, given) {
  const facts = { ...(input.facts || {}), ...given };
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor(draftBody({ ...input, facts }));
    let added = false;
    for (const item of asked.required || []) {
      if (facts[item.id] !== undefined && facts[item.id] !== '') continue;
      facts[item.id] = item.id === 'liveElectrical' ? 'no' : item.choices ? item.choices[0].value : ((answersFor(item.id, asked.task)[0] || {}).text || 'As set out in the site plan.').replace(/_{3,}/g, 'x');
      added = true;
    }
    if (!added) break;
  }
  return { ...input, facts };
}
const OVER = 'Rated capacity from the crane chart: 60 t at 12 m radius. Heaviest gross load (load, lifting gear and rigging) is 70 t at 12 m radius.';
const WITHIN = 'Rated capacity from the crane chart: 60 t at 12 m radius. Heaviest gross load (load, lifting gear and rigging) is 50 t at 12 m radius.';
const LIFT = { ...SITE, state: 'qld', fallRisk: 'no', crane: 'own', task: 'Lift the precast concrete wall panels into place with a mobile crane and stand them on their footings' };
const GROUND = { groundBearing: "The principal contractor's engineer confirmed the hardstand takes the crane's outrigger loads, report GT-104." };

test('the shared rule reads the rated capacity and the heaviest load, in tonnes or kilograms', () => {
  assert.deepEqual(gate.craneOverCapacity(OVER), { rated: '60 t at 12 m', load: '70 t at 12 m' });
  assert.equal(gate.craneOverCapacity(WITHIN), null);
  assert.deepEqual(gate.craneOverCapacity('Chart: 2.1 t at 8 m radius. Load is 2500 kg at 8 m.'), { rated: '2.1 t at 8 m', load: '2500 kg at 8 m' });
  assert.deepEqual(gate.craneOverCapacity('4.2 t at 22 m radius from the crane chart, heaviest unit 5 t'), { rated: '4.2 t at 22 m', load: '5 t' });
  // Answers the rule leaves alone: within capacity, figures only, a load at a shorter radius than the capacity given,
  // and the crane's own size.
  for (const text of ['4.2 t at 22 m radius from the crane chart, heaviest unit 1.6 t', 'hiab chart 1.2t at 8m', '25t at 20m from the chart', 'Rated 10 t at 20 m. Heaviest load 12 t at 8 m.', 'Heaviest lift is 4 t at 10 m; the 50 t crane is rated 6 t at 10 m']) {
    assert.equal(gate.craneOverCapacity(text), null, text);
  }
  assert.match(gate.craneOverWhy(OVER), /^The heaviest load \(70 t at 12 m\) is more than the crane's rated capacity \(60 t at 12 m\)\. The lift cannot go ahead as written/);
});

test('the questions page says why an over-capacity crane chart answer is refused', () => {
  const input = answered(LIFT, { ...GROUND, craneChart: OVER });
  const asked = questionsFor(draftBody(input));
  assert.ok((asked.required || []).some((item) => item.id === 'craneChart'), 'the crane chart is asked');
  const weak = (asked.weak || []).find((item) => item.id === 'craneChart');
  assert.ok(weak, JSON.stringify(asked.weak));
  assert.match(weak.why, /more than the crane's rated capacity/);
});

test('an over-capacity lift is not drafted for download; within capacity it is', () => {
  const over = prepareDraft(draftBody(answered(LIFT, { ...GROUND, craneChart: OVER })));
  assert.notEqual(over.kind, 'draft');
  const help = (over.missingHelp || []).find((item) => item.id === 'craneChart');
  assert.ok(help, JSON.stringify(over.missingHelp));
  assert.match(help.why, /The heaviest load \(70 t at 12 m\) is more than the crane's rated capacity \(60 t at 12 m\)/);
  const within = prepareDraft(draftBody(answered(LIFT, { ...GROUND, craneChart: WITHIN })));
  assert.ok(!(within.missing || []).some((item) => (item.id || item) === 'craneChart' || /crane chart/i.test(String(item.label || item))), JSON.stringify(within.missing));
});

const SWMS = Object.freeze({
  state: 'qld',
  task: 'Lift precast concrete wall panels into place with a mobile crane.',
  fallRisk: 'no',
  site: { address: '12 Wattle Road, Hamilton QLD 4007', conditions: ['Access: the crane sets up on the engineered hardstand.'] },
  highRisk: ['Work involving the use of a crane'],
  steps: [
    { step: 'Lift and place the wall panels', hazards: ['A panel or the crane falls if the lift is over capacity.'], controls: ['The crane is set up on the engineered hardstand on outrigger mats.'], responsible: 'Crane crew', riskBefore: 'High', riskAfter: 'Medium' },
  ],
  responsiblePerson: 'Sam Lee, site supervisor',
  consultation: 'The crew were consulted at the prestart.',
  signatures: [{ name: 'Jo Smith' }],
  principalContractor: 'Corbel Build Pty Ltd',
  date: '2026-11-10',
  reviewDate: '2027-11-10',
});
const withLine = (line) => ({ ...SWMS, steps: [{ ...SWMS.steps[0], controls: [...SWMS.steps[0].controls, line] }] });

test('Builder check: a SWMS whose heaviest load is over the rated capacity has a must-fix item (H10)', () => {
  const result = checkSwms(withLine(OVER), { state: 'qld', today: '2026-11-10' });
  const h10 = result.findings.find((item) => item.rule === 'H10');
  assert.ok(h10, JSON.stringify(result.findings.map((item) => item.rule)));
  assert.equal(h10.hard, true);
  assert.equal(h10.pass, false);
  assert.ok(result.hardFails.includes('H10'));
  assert.match(h10.message, /more than the crane's rated capacity \(60 t at 12 m\).*\(Lift and place the wall panels\)/);
  assert.ok(h10.source && /rated capacity/.test(h10.source));
  // Within capacity, or with no chart figures given, the item is not raised.
  for (const swms of [withLine(WITHIN), SWMS]) assert.ok(!checkSwms(swms, { state: 'qld', today: '2026-11-10' }).findings.some((item) => item.rule === 'H10'));
});

test('the page has a place for H10, the crane chart answer', () => {
  const app = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/app.js'), 'utf8');
  assert.match(app, /case 'H10': return document\.getElementById\('fact-craneChart'\)/);
});
