// Step list part 2 (code review E and D, D316): one step list worked out on the server from the task's words, the answers
// and the plant, with the page sending only its changes (kindsOff, kindsAdded) once the server has listed the steps found.
// Made-up companies, people and sites only.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');

const SITE = { residential: 'no', company: 'Test', workplace: '12 Wattle Road, Hamilton', principalContractor: 'Corbel Build Pty Ltd', hospital: 'Northside General Hospital', firstAider: 'Jo Smith', musterPoint: 'Front gate', worksManager: 'Sam Lee', worksManagerPhone: '0400 118 552', complianceResponsible: 'Sam Lee', reviewer: 'Sam Lee', date: '10 November 2026' };
function answered(input) {
  const facts = { ...(input.facts || {}) };
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
const bodyOf = (input) => draftBody(answered({ ...SITE, ...input }));
const names = (draft) => draft.jobSteps.map((step) => step.step);
const ROOF = { state: 'nsw', fallRisk: 'yes', fallMetres: '4', crane: 'none', task: 'Replace the metal roof sheets on the shed', facts: { fallAccess: 'mobileScaffold', harnessSystem: 'none' } };

test('the questions list the steps found from the words, the fall answer and the plant (steps.found)', () => {
  const asked = questionsFor(bodyOf(ROOF));
  assert.ok(Array.isArray(asked.steps.found), JSON.stringify(asked.steps));
  assert.ok(asked.steps.found.includes('mobileScaffold'), asked.steps.found.join());
  for (const id of asked.steps.chosen) assert.ok(asked.steps.found.includes(id), id);
  // The user's own changes do not change what was found.
  assert.deepEqual(questionsFor(bodyOf({ ...ROOF, kindsOff: ['mobileScaffold'], kindsAdded: ['generatorUse'] })).steps.found, asked.steps.found);
});

test('code review E: adding a step by its change never takes out a step the fall answer brought', () => {
  const draft = prepareDraft(bodyOf({ ...ROOF, kindsAdded: ['generatorUse'] }));
  assert.ok(names(draft).includes('Use mobile scaffolds'), names(draft).join(' | '));
  assert.ok(names(draft).includes('Use a portable generator'), names(draft).join(' | '));
  const asked = questionsFor(bodyOf({ ...ROOF, kindsAdded: ['generatorUse'] }));
  assert.ok(asked.steps.chosen.includes('mobileScaffold') && asked.steps.chosen.includes('generatorUse'), asked.steps.chosen.join());
  // Unticked by hand, it stays out, with the added step still in.
  const off = prepareDraft(bodyOf({ ...ROOF, kindsOff: ['mobileScaffold'], kindsAdded: ['generatorUse'] }));
  assert.ok(!names(off).includes('Use mobile scaffolds'), names(off).join(' | '));
  assert.ok(names(off).includes('Use a portable generator'), names(off).join(' | '));
});

const CRANE_TRUCK = 'Vehicle loading crane (crane truck) work: set up the outriggers, load and unload materials, and lift the portable building onto its footings. also lift the roof trusses up onto the top plates for the chippies';
test('a changed crane answer brings its step with only the changes sent (no kindsSeen, answersSeen or kindsBrought)', () => {
  const base = { state: 'act', task: CRANE_TRUCK, fallRisk: 'no', crane: 'none' };
  const before = questionsFor(draftBody(base)).steps;
  assert.ok(!before.found.includes('loaderCrane'));
  const off = before.found.includes('steelErect') ? ['steelErect'] : [];
  const now = questionsFor(draftBody({ ...base, crane: 'own', kindsOff: off }));
  assert.ok(now.steps.found.includes('loaderCrane'), now.steps.found.join());
  assert.ok(now.steps.chosen.includes('loaderCrane'), now.steps.chosen.join());
  // Unticked by hand, it stays off.
  assert.ok(!questionsFor(draftBody({ ...base, crane: 'own', kindsOff: [...off, 'loaderCrane'] })).steps.chosen.includes('loaderCrane'));
});

test('the generator ticked in the plant brings generatorUse into the steps found', () => {
  const task = 'Cut and patch the concrete footpath outside the shop';
  const plain = questionsFor(bodyOf({ state: 'qld', fallRisk: 'no', crane: 'none', task }));
  assert.ok(!plain.steps.found.includes('generatorUse'), plain.steps.found.join());
  const withPlant = questionsFor(bodyOf({ state: 'qld', fallRisk: 'no', crane: 'none', task, plantChoice: { used: ['Portable generator'], notUsed: [], added: [] } }));
  assert.ok(withPlant.steps.found.includes('generatorUse'), withPlant.steps.found.join());
});

test('code review D: the questions say the scaffold supervisor box is wanted where a scaffold is named, and not for "no scaffold"', () => {
  const task = 'Fix roof sheeting to the warehouse';
  const ask = (fallControl) => questionsFor(draftBody({ ...SITE, state: 'qld', fallRisk: 'yes', fallMetres: '4', crane: 'none', task, facts: { fallControl } }));
  assert.equal(ask('Work above 2 m is done from an EWP or a mobile scaffold with guardrails.').scaffoldSupervisor, true);
  assert.equal(ask('No scaffold is used. Edge protection by the builder.').scaffoldSupervisor, undefined);
  assert.equal(ask('Work from an EWP with a harness.').scaffoldSupervisor, undefined);
  assert.equal(questionsFor(draftBody({ ...SITE, state: 'qld', fallRisk: 'yes', fallMetres: '4', crane: 'none', task: 'Erect tube and coupler scaffold up the side of the building for the renderers' })).scaffoldSupervisor, true);
});

test('a saved SWMS or API caller still sending kinds, kindsSeen and kindsBrought drafts as before', () => {
  const base = { state: 'act', task: CRANE_TRUCK, fallRisk: 'no', crane: 'none' };
  const seen = questionsFor(draftBody(base)).steps.suggested;
  const picks = seen.filter((id) => id !== 'steelErect');
  const body = draftBody({ ...base, crane: 'own', kinds: picks, kindsOff: ['steelErect'], kindsSeen: seen, answersSeen: { crane: 'none', fallRisk: 'no' } });
  assert.ok(body.kinds.includes('loaderCrane'));
  assert.deepEqual(body.kindsBrought, ['loaderCrane']);
});

// ---- The page ----

test('the page sends the steps found with its picks, once the server has listed them for this task', () => {
  const { loadPage } = require('./fake-dom');
  const p = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }));
  p.run(`document.getElementById('task').value = 'Replace the metal roof sheets on the shed'`);
  p.run(`stepPicks = ['roof', 'generatorUse']; stepsFound = null`);
  let sent = JSON.parse(p.run('JSON.stringify(payload())'));
  assert.deepEqual(sent.kinds, ['roof', 'generatorUse']);
  assert.equal(sent.kindsFound, undefined);
  p.run(`stepsFound = { task: 'Replace the metal roof sheets on the shed', ids: ['roof', 'roofStrip', 'mobileScaffold'] }`);
  sent = JSON.parse(p.run('JSON.stringify(payload())'));
  assert.deepEqual(sent.kindsFound, ['roof', 'roofStrip', 'mobileScaffold']);
  // No picks of the user's own: nothing to read against.
  p.run('stepPicks = null');
  assert.equal(JSON.parse(p.run('JSON.stringify(payload())')).kindsFound, undefined);
  // Steps found for other words are not sent.
  p.run(`document.getElementById('task').value = 'Paint the fence'; stepPicks = ['paint']`);
  assert.equal(JSON.parse(p.run('JSON.stringify(payload())')).kindsFound, undefined);
  // Drawing the list keeps the steps found for the task as it is.
  p.run(`document.getElementById('task').value = 'Replace the metal roof sheets on the shed'; renderSteps({ suggested: ['roof'], chosen: ['roof'], locked: [], found: ['roof', 'mobileScaffold'] })`);
  assert.deepEqual(JSON.parse(p.run('JSON.stringify(foundNow())')), ['roof', 'mobileScaffold']);
});

test('picks sent with the steps found are read as changes: a step the fall answer or the plant brings since is kept', () => {
  // The list was drawn before the fall access answer: roofing only. The user then added the generator step, and answered
  // mobile scaffold. The picks do not name mobileScaffold, but it was not in the list they were made on, so it is kept.
  const drawn = questionsFor(bodyOf({ ...ROOF, facts: {} })).steps.found;
  assert.ok(!drawn.includes('mobileScaffold'), drawn.join());
  const picks = [...drawn, 'generatorUse'];
  const body = bodyOf({ ...ROOF, kinds: picks, kindsFound: drawn });
  assert.equal(body.kindsFound, undefined);
  assert.equal(body.kindsSeen, undefined);
  const draft = prepareDraft(body);
  assert.ok(names(draft).includes('Use mobile scaffolds'), names(draft).join(' | '));
  assert.ok(names(draft).includes('Use a portable generator'), names(draft).join(' | '));
  // A step found and not picked is unticked.
  const dropped = bodyOf({ ...ROOF, kinds: picks.filter((id) => id !== 'roofStrip'), kindsFound: drawn });
  assert.ok(dropped.kindsOff.includes('roofStrip'), JSON.stringify(dropped.kindsOff));
  assert.ok(!questionsFor(dropped).steps.chosen.includes('roofStrip'));
  // A changed crane answer brings the hiab step the same way.
  const base = { state: 'act', task: CRANE_TRUCK, fallRisk: 'no', crane: 'none' };
  const seen = questionsFor(draftBody(base)).steps.found;
  // The old way, picks alone with nothing else: the hiab step is lost (code review E).
  assert.ok(!questionsFor(draftBody({ ...base, crane: 'own', kinds: seen })).steps.chosen.includes('loaderCrane'));
  const now = draftBody({ ...base, crane: 'own', kinds: seen, kindsFound: seen });
  assert.ok(questionsFor(now).steps.chosen.includes('loaderCrane'), questionsFor(now).steps.chosen.join());
});

test('the page shows the scaffold supervisor box from the server list', () => {
  const { loadPage } = require('./fake-dom');
  const p = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }));
  const field = p.document.getElementById('scaffold-supervisor-field');
  field.classList.add('hidden');
  p.run(`document.getElementById('task').value = 'Fix roof sheeting to the warehouse'; questions = { scaffoldSupervisor: true }; showScaffoldField()`);
  assert.equal(field.classList.contains('hidden'), false);
  p.run('questions = { scaffoldSupervisor: false }; showScaffoldField()');
  assert.equal(field.classList.contains('hidden'), true);
});
