// Messy test round 7 (16 October 2026), flow faults: every answer a question asks for prints, the task's
// own words are never a control, pasted bullets and quote labels come off the task line and the title,
// the draft follows a detail changed above it, a wrong ABN is said at its box, a second standard answer
// replaces the first, only the parts that changed lose their ticks, plant typed with -er is spelt right,
// and the smaller fixes. The page-load and on-screen faults (the draft brought back under a project's
// list, the review notice, the 502s) are also run in a browser (scratchpad/flow7).
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, taskLine } = require('../draft');
const { draftBody } = require('../input');
const { fixSpelling } = require('../spelling');
const { titleFor } = require('../accounts');
const { toSuggestion } = require('../places');
const scopeChoice = require('../public/scope-choice');
const { loadPage } = require('./fake-dom');
const { ANSWERED } = require('./helpers');

const draftOf = (input) => prepareDraft(draftBody({ fallRisk: 'no', residential: 'no', crane: 'none', ...ANSWERED, ...input }));
const allLines = (draft) => [...(draft.controls || []).map((item) => item.text), ...(draft.jobSteps || []).flatMap((step) => step.controls)];

// ---- 2. Every answer a question asks for prints ----

const SCAFFOLD = 'erect independant scafold 4 lifts on the north facade of the office building for window replacment by others, scafold up to 12m high, tied into slab edges, loading bay on level 3, shade cloth and toe boards, alter as the job goes then dismantel at the end. our truck with hiab delivers the tube and fittings';
const SCAFFOLD_FACTS = {
  craneChart: '1.2 t at 6 m radius from the hiab chart, 0.8 t at 5 m',
  groundBearing: 'The builder\'s site engineer confirmed the road pavement carries the hiab outrigger loads. 600 x 600 mm outrigger pads are used.',
  fallControl: 'Scaffolders work from a fully decked platform, with advance guardrails fitted before they step up to each new lift.',
  systemInstructions: 'Kwikstage modular scaffold erected to the supplier\'s instructions KS-UG-01 rev 4 by a crew trained by our leading hand.',
};

test('the crane chart and the ground under a truck loading crane print in its step, as the questions asked for them', () => {
  // Run 4: both were required ("Too thin to print" until done), then printed nowhere.
  const input = { state: 'wa', fallRisk: 'yes', crane: 'own', task: SCAFFOLD, facts: { ...ANSWERED.facts, ...SCAFFOLD_FACTS } };
  const asked = questionsFor(draftBody({ ...ANSWERED, residential: 'no', ...input })).required.map((item) => item.id);
  assert.ok(asked.includes('craneChart') && asked.includes('groundBearing'), asked.join(', '));
  const draft = draftOf(input);
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  const hiab = draft.jobSteps.find((step) => /hiab/.test(step.step));
  assert.ok(hiab.controls.includes('1.2 t at 6 m radius from the hiab chart, 0.8 t at 5 m.'), hiab.controls.join('\n'));
  assert.ok(hiab.controls.includes(SCAFFOLD_FACTS.groundBearing));
  // Each prints once.
  assert.equal(allLines(draft).filter((line) => line.includes('600 x 600 mm')).length, 1);
});

test('an answer a step already prints is not added again', () => {
  const draft = draftOf({ state: 'qld', crane: 'own', task: 'Lift precast panels with our mobile crane and stand them on the footings.', facts: { ...ANSWERED.facts, craneChart: '25 t at 20 m radius from the crane chart.', groundBearing: 'Geotechnical engineer\'s report GR-07 confirms 200 kPa under the outrigger pads.', erectionDesign: 'Erection design ED-1 rev B.', centreOfGravity: 'Marked on each panel shop drawing.', braceArrangement: 'Two braces per panel to ED-1.' } });
  if (draft.kind !== 'draft') return;
  assert.equal(allLines(draft).filter((line) => line.includes('25 t at 20 m radius')).length, 1);
});

// ---- 4. The task text is never a control ----

const STORMWATER = 'Stormwater drainage: excavate trenches, including trenches deeper than 1.5 m with shoring or shields installed by workers competent in that system, or with benches the geotechnical engineer designs, lay and joint the pipes and subsoil drain pipes, place the precast pits and gully pits, and backfill and compact.';

test('the task\'s own sentence never prints as an "Isolate or engineer" control or in Excavate', () => {
  // Run 8: the whole task printed as a control, and again in "Excavate", with "hiab" rewritten.
  const task = `${STORMWATER} 375 rcp storm water along mitchel st verge, trench up to 2.4m deep, trench sheild, 13t excavater and hiab truck to unload pipes, we sling the pipes off the excavator with chains, plate compacter and jumping jack, concrete saw to cut the kerb`;
  const draft = draftOf({ state: 'nt', fallRisk: 'yes', crane: 'own', task, facts: { ...ANSWERED.facts, craneChart: '2 t at 6 m radius', groundBearing: 'Engineer report GR-1 confirms the verge carries the outriggers.', fallControl: 'Mesh fence round the open trench.', excavationPlan: 'Excavation and traffic plan TMP-4 rev 2.' } });
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  assert.ok(!allLines(draft).some((line) => /375 rcp|vehicle loading crane truck|backfill and compact\. 375/.test(line)), allLines(draft).filter((line) => /375/.test(line)).join('\n'));
  // His "trench shield" is said in SiteWrite's words, where the trench support goes.
  const excavate = draft.jobSteps.find((step) => /^Excavate/.test(step.step));
  assert.ok(excavate.controls.includes('The trench is supported with trench shields.'), excavate.controls.slice(0, 4).join('\n'));
  assert.ok(draft.controls.some((item) => item.level === 'Isolate or engineer' && item.text === 'The trench is supported with trench shields.'));
});

test('a pick-list task that offers a choice of trench support does not answer the Trench support question', () => {
  // Run 8: "shoring or shields ... or with benches" stopped the question for a 2.4 m trench.
  const asked = (task) => questionsFor(draftBody({ ...ANSWERED, state: 'nt', fallRisk: 'no', residential: 'no', crane: 'none', task })).required.map((item) => item.id);
  assert.ok(asked(`${STORMWATER} trench up to 2.4m deep along the verge`).includes('trenchSupport'));
  assert.ok(asked('Trenching for services, including trenches deeper than 1.5 m: excavate the trench, shore it or use a trench shield, lay the pipes or conduits, backfill and compact in layers, and reinstate the surface.').includes('trenchSupport'));
  // One way named in the task answers it, in SiteWrite's words.
  assert.ok(!asked('Excavate a 2.4 m deep trench with a trench shield and lay the stormwater pipe.').includes('trenchSupport'));
  // The answer the user gives prints as given.
  const answer = 'Trench shield rated for 2.4 m, as designed by the supplier\'s engineer.';
  const draft = draftOf({ state: 'nt', task: `${STORMWATER} trench up to 2.4m deep`, facts: { ...ANSWERED.facts, trenchSupport: answer, excavationPlan: 'Excavation and traffic plan TMP-4 rev 2.' } });
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  assert.ok(draft.controls.some((item) => item.text === answer));
  assert.ok(!allLines(draft).some((line) => line.includes('shoring or shields installed by workers competent in that system, or with benches')), 'the pick list\'s choice of ways is not a control');
});

// ---- 5. Bullets and quote labels ----

test('pasted list bullets and quote labels come off the task line and the title', () => {
  // Run 3: "· All fire dampers ..." named the SWMS, bullet included; run 2: "Variation Price Option:".
  const pasted = '· All fire dampers required on duct passing through fire wall on grid 17.\n· All safe trays and insulation to the AHUs\n• Kitchen exhaust duct as detailed on the kitchen consultant\'s drawings and spec';
  assert.equal(taskLine(pasted), 'All fire dampers required on duct passing through fire wall on grid 17. All safe trays and insulation to the AHUs. Kitchen exhaust duct.');
  assert.equal(titleFor({}, { task: pasted }), 'All fire dampers required on duct passing through fire wall on grid 17');
  assert.equal(taskLine('Fit out prototype cell and prototype officers post. Variation Price Option: vending machine data outlets and IP56 power points. Labelling of all items.'), 'Fit out prototype cell and prototype officers post. Vending machine data outlets and IP56 power points. Labelling of all items.');
  assert.equal(taskLine('Provisional sum: 20 extra light fittings in the car park.'), '20 extra light fittings in the car park.');
  // Work words are kept: a colon that is not a quote label, and a minus sign.
  assert.equal(taskLine('Power to specialised equipment: Rising Step panel.'), 'Power to specialised equipment: Rising Step panel.');
  const draft = draftOf({ state: 'qld', task: pasted });
  assert.ok(!/[·•]/.test(draft.task), draft.task);
});

// ---- 11. Spelling ----

test('plant typed with -er for -or is spelt right, and a street typed one letter out takes the job address\'s spelling', () => {
  // Run 8: "mitchel", "excavater" and "compacter" stayed; only "sheild" was fixed.
  const text = 'along mitchel st verge, trench sheild, 13t excavater and hiab truck, plate compacter and jumping jack';
  const fixed = fixSpelling(text, { places: '45 Mitchell St, Darwin City NT' });
  assert.equal(fixed.text, 'along Mitchell st verge, trench shield, 13t excavator and hiab truck, plate compactor and jumping jack');
  assert.equal(fixSpelling('install the elevater and a generater').text, 'install the elevator and a generator');
  // Trade and product names stay as typed.
  assert.equal(fixSpelling('kwikstage scaffold, hilti drill, bondek deck, propress copper').text.includes('kwikstage'), true);
  // Without the address, a name is not "fixed" to a place.
  assert.equal(fixSpelling('along mitchel st').text, 'along mitchel st');
  // The task line prints with the address's spelling.
  const draft = draftOf({ state: 'nt', workplace: '45 Mitchell St, Darwin City NT', task: 'Lay 375 stormwater pipe along the mitchel st verge in a 1.2 m deep trench with a 13t excavater.' });
  // The job address's street takes its capitals in the task line since messy round 17 (flow18).
  assert.match(draft.task, /Mitchell St verge/);
  assert.match(draft.task, /13t excavator/);
});

// ---- 12. Smaller faults ----

test('an address suggestion carries no stray symbols', () => {
  // Run 1: "60 ⛉ Bridge Street, Benalla VIC".
  assert.deepEqual(toSuggestion({ text: { text: '60 ⛉ Bridge Street, Benalla VIC, Australia' }, types: ['street_address'] }), { text: '60 Bridge Street, Benalla VIC', state: 'vic' });
  assert.equal(toSuggestion({ text: { text: '12/4 O’Connell St, North Sydney NSW, Australia' }, types: ['subpremise'] }).text, '12/4 O’Connell St, North Sydney NSW');
});

test('a step the scope gives to this crew starts at Yes in the scope review, and one given to others at No', () => {
  // Run 1: "Supply and install edge protection ..." started at "No, leave it out".
  const rows = [{ activity: 'Supply and install edge protection to slab edges', quotes: ['2.4 Supply and install edge protection to all slab edges and stair voids during formwork, reinforcement and pour, and maintain it until handed over to the builder\'s perimeter screens. Perimeter screens are supplied by others.'] }];
  const pack = { name: 'Edge protection', rows };
  assert.equal(scopeChoice.othersAnswer({}, pack, { step: 'Install edge protection' }), 'yes');
  assert.equal(scopeChoice.othersAnswer({}, pack, { step: 'Install perimeter screens' }), 'no');
  // What the user answers stands.
  assert.equal(scopeChoice.othersAnswer({ 'Edge protection': { 'Install edge protection': 'no' } }, pack, { step: 'Install edge protection' }), 'no');
  const reading = { activities: rows.map((row) => ({ ...row, package: 'Edge protection', type: 'Site work' })), packages: [{ package: 'Edge protection', groups: ['edgeProtection'], byOthers: [{ group: 'edgeExtra', step: 'Install edge protection' }] }] };
  const [item] = scopeChoice.projectItems(reading, ['Edge protection']);
  assert.ok(item.kinds.includes('edgeExtra'));
  assert.deepEqual(item.leaveOut, []);
});

test('harness anchors are not asked for where no harness is used', () => {
  // Run 1: an "Other findings" item asked a formwork SWMS for harness anchors, from the lines saying a
  // harness is not used at the perimeter and what the rescue plan covers "where harnesses are used".
  const { checkSwms, fromDraft } = require('../builder-check');
  const facts = { ...ANSWERED.facts, fallControl: 'Edge protection is fitted to every open edge before the deck is used.', formworkDesign: 'Formwork design FW-03 rev C by Parra Structural Engineers.', loadLimits: '3 kPa on the deck.', deckMethod: 'below', systemInstructions: 'Erected to the supplier\'s instructions UG-01 rev 3 by a crew trained by the supplier.' };
  const draft = draftOf({ state: 'nsw', fallRisk: 'yes', crane: 'company', slinging: 'crane', task: 'Form and pour suspended slabs from a fully decked formwork deck with edge protection at every open edge.', facts });
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  const anchors = (lines) => {
    const steps = draft.jobSteps.map((step, index) => (index === 1 ? { ...step, controls: [...step.controls, ...lines] } : step));
    return /anchor point for each harness/.test(JSON.stringify(checkSwms(fromDraft({ ...draft, jobSteps: steps }, { state: 'nsw' }), { state: 'nsw' })));
  };
  assert.equal(anchors(['Harness-based fall arrest or work positioning systems are not used as the fall control at the formwork perimeter.', 'A rescue plan covers a person suspended in a harness where harnesses are used.']), false);
  // Where a harness is used, its anchor is asked for.
  assert.equal(anchors(['Workers wear a full body harness clipped to the static line while fixing the perimeter screens.']), true);
});

// ---- 8. A wrong ABN is said at its box ----

test('an ABN that cannot be right is said at its box', () => {
  const p = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }));
  assert.equal(p.run('abnProblem("51 824 753 55")'), 'An ABN has 11 digits. This one has 10.');
  assert.equal(p.run('abnProblem("51 824 753 557")'), 'That ABN is not valid. Check the 11 digits.');
  assert.equal(p.run('abnProblem("51 824 753 556")'), '');
  assert.equal(p.run('abnProblem("")'), '');
  const box = p.document.getElementById('profile-abn');
  box.value = '5182475355';
  box.dispatchEvent(new p.window.Event('blur'));
  const said = p.document.getElementById('abn-error');
  assert.equal(said.textContent, 'An ABN has 11 digits. This one has 10.');
  assert.equal(said.classList.contains('hidden'), false);
  // Put right while typing, the note goes.
  box.value = '51824753556';
  box.dispatchEvent(new p.window.Event('input'));
  assert.equal(said.classList.contains('hidden'), true);
});

// ---- 9. A second standard answer replaces the first ----

test('a second standard answer for the same question takes the place of the first, with the person\'s words kept', () => {
  const p = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }));
  const picks = [
    { label: 'Mobile scaffold', text: 'Mobile scaffolds with guardrails are used for work above 2 m.' },
    { label: 'Scissor lifts', text: 'Scissor lifts with guardrails are used for all work above 2 m.' },
  ];
  p.window.testPicks = picks;
  p.window.testBox = { value: 'Mobile scaffolds with guardrails are used for work above 2 m. Lvl 3 corridor only.' };
  const swap = p.run('pickSwap(testBox, testPicks, 1)');
  assert.equal(swap.value, 'Lvl 3 corridor only. Scissor lifts with guardrails are used for all work above 2 m.');
  assert.deepEqual([...swap.replaced], ['Mobile scaffold']);
  assert.equal(swap.both, 'Mobile scaffolds with guardrails are used for work above 2 m. Lvl 3 corridor only. Scissor lifts with guardrails are used for all work above 2 m.');
  // No other standard answer in the box: nothing to replace.
  p.window.testBox = { value: 'Work from the podium slab behind the hoarding.' };
  assert.equal(p.run('pickSwap(testBox, testPicks, 1)'), null);
});
