// The owner's pick list review, part 1 (11 October 2026): each task he commented on drafts what he
// asked for, from lines with a source held (D181), and names what it leaves to the user (D184).
const test = require('node:test');
const assert = require('node:assert/strict');
const { TRADES, answersFor } = require('../presets');
const { prepareDraft, questionsFor } = require('../draft');
const { draftBody } = require('../input');

const item = (key) => {
  const [tradeId, taskId] = key.split('/');
  return TRADES.find((trade) => trade.id === tradeId).tasks.find((task) => task.id === taskId);
};

// A picked task as the page sends it: the questions answered from the given facts, or the standard answers.
function picked(key, state = 'qld', given = {}) {
  const task = item(key);
  const input = { state, task: task.task, fallRisk: task.fallRisk, residential: 'no', crane: task.crane, kinds: task.kinds, leaveOut: task.leaveOut, pickGaps: task.gaps };
  const facts = { ...given };
  const asked = [];
  for (let round = 0; round < 8; round += 1) {
    const questions = questionsFor({ ...input, facts });
    const open = (questions.required || []).filter((fact) => !facts[fact.id]);
    if (!open.length) break;
    for (const fact of open) {
      asked.push(fact);
      facts[fact.id] = fact.id === 'liveElectrical' ? 'no' : fact.choices ? (fact.default || fact.choices[0].value) : ((answersFor(fact.id, questions.task)[0] || {}).text || `As set out in the site plan: ${fact.label}.`).replace(/_{3,}/g, fact.id === 'craneChart' ? '12' : 'as on the site plan');
    }
  }
  const draft = prepareDraft(draftBody({ ...input, facts }));
  assert.equal(draft.kind, 'draft', key);
  return { draft, asked, lines: draft.jobSteps.flatMap((step) => step.controls), steps: draft.jobSteps.map((step) => step.step) };
}
const has = (lines, pattern) => lines.some((line) => pattern.test(line));

test('traffic picks say traffic management plan (TMP), never vehicle management plan, and public road work adds its TGS (D203)', () => {
  for (const key of ['site-establishment-traffic/traffic-public-road', 'site-establishment-traffic/traffic-on-site']) {
    assert.match(item(key).task, /traffic management plan \(TMP\)/, key);
    assert.doesNotMatch(item(key).task, /vehicle management plan/i, key);
  }
  // Public road work names the TMP and its traffic guidance scheme (TGS) (D203); work inside the site does not.
  assert.match(item('site-establishment-traffic/traffic-public-road').task, /traffic management plan \(TMP\) and its traffic guidance scheme \(TGS\)/);
  assert.doesNotMatch(item('site-establishment-traffic/traffic-on-site').task, /traffic guidance scheme/i);
  assert.match(item('site-establishment-traffic/traffic-public-road').task, /tickets and training/);
  const { lines } = picked('site-establishment-traffic/traffic-public-road');
  assert.ok(has(lines, /accredited traffic controllers/i));
  assert.ok(has(lines, /^Set up traffic control to the approved traffic management plan \(TMP\) and its traffic guidance scheme \(TGS\) before work starts/));
  assert.ok(has(lines, /^The traffic management plan \(TMP\) and its traffic guidance scheme \(TGS\) are designed by a person trained in traffic management design/));
  assert.ok(!has(lines, /traffic management plan(?! \(TMP\))/));
  assert.ok(has(picked('site-establishment-traffic/traffic-on-site').lines, /^The current site traffic management plan \(TMP\), showing plant routes/));
});

test('site sheds: the ground or footings are ready before a shed, container or large load is placed', () => {
  assert.ok(has(picked('site-establishment-traffic/site-sheds').lines, /^Sheds, containers and other large loads are placed only once the ground, footings or supports .* are complete and ready .*\(Work Health and Safety Regulation 2011 \(Qld\) s 202\)$/));
});

test('soft strip leaves the structure untouched; building demolition follows the engineer, stops on movement, wets the dust and keeps the road clean', () => {
  assert.ok(has(picked('demolition-stripout/strip-out').lines, /^Structural elements, such as columns, beams, slabs and load-bearing walls, are left untouched\./));
  const { lines } = picked('demolition-stripout/building-demolition');
  assert.ok(has(lines, /^The structure is demolished in the sequence the structural engineer's demolition design or instructions set/));
  assert.ok(has(lines, /^While demolition goes on, .* unplanned movement, cracking or subsidence\. If any is found, demolition there stops until the structural engineer has inspected it/));
  assert.ok(has(lines, /^Dust is kept down with water throughout demolition and load-out, by hoses held by workers .* or by sprays fitted to the machines/));
  assert.ok(has(lines, /^Where the project has an environmental management plan/));
  assert.ok(has(lines, /onto the road or footpath is cleaned up straight away/));
  // A shed or carport is not demolished to an engineer's sequence.
  const shed = prepareDraft({ state: 'qld', fallRisk: 'no', task: 'Demolish a fibro garden shed and load the waste into a skip.', facts: { asbestosArrangement: 'The asbestos register shows none.' } });
  assert.ok(!has(shed.jobSteps.flatMap((step) => step.controls), /structural engineer's demolition design/));
});

test('partial demolition: the user describes the extent, the engineer\'s design comes first, and services go to their own trade', () => {
  const { draft, lines, steps } = picked('demolition-stripout/partial-demolition');
  assert.ok(draft.notCovered.some((part) => /parts of the structure being demolished \(describe/.test(part)));
  assert.ok(!steps.includes('Remove the wall') && !steps.includes('Cut an opening in a load-bearing wall'));
  assert.ok(has(lines, /^No part of the structure is demolished until the structural engineer has given the demolition design or clear written instructions/));
  assert.ok(has(lines, /^Electrical services in the part being demolished are disconnected or made safe by a licensed electrician, and water, sewer and drainage by a licensed plumber/));
});

test('asbestos removal: licensed removalist, the notices, and air monitoring as the user\'s choice (starting on No)', () => {
  const removal = picked('asbestos-removal/non-friable');
  const monitoring = removal.asked.find((fact) => fact.id === 'asbestosAirMonitoring');
  assert.equal(monitoring.default, 'no', 'offered, starting on No');
  assert.ok(has(removal.lines, /^Licensed asbestos removal work is done by a removalist holding the licence class it needs/));
  assert.ok(has(removal.lines, /^Before licensed removal starts, the removalist tells the person in control of the workplace/));
  assert.ok(has(removal.lines, /^Air monitoring is not planned for this non-friable removal\./));
  const chosen = picked('asbestos-removal/non-friable', 'qld', { asbestosAirMonitoring: 'yes' });
  assert.ok(has(chosen.lines, /^Air \(control\) monitoring is done before and during the removal/));
  assert.ok(has(chosen.lines, /^At 0\.01 fibres\/mL or more/));
  const questions = questionsFor({ state: 'qld', task: item('asbestos-removal/non-friable').task, kinds: item('asbestos-removal/non-friable').kinds, fallRisk: 'no', facts: {} });
  const offered = (questions.required || []).find((fact) => fact.id === 'asbestosAirMonitoring');
  assert.ok(offered && offered.default === 'no' && offered.choices.length === 2);
  // Friable removal always has air monitoring, so it is not offered as a choice.
  assert.ok(!has(picked('asbestos-removal/friable').lines, /^Air monitoring is not planned/));
});

test('hazardous materials sampling: a competent person, PPE, wetting and sealing the sample point; PCB capacitors', () => {
  const { draft, lines, steps } = picked('asbestos-removal/hazmat-survey');
  assert.ok(steps.includes('Take samples of suspect materials'));
  assert.ok(has(lines, /^Samples are taken only by a competent person/));
  assert.ok(has(lines, /water and PVA glue mix/));
  assert.ok(has(lines, /^Straight after sampling, the sample point is patched with tape and its edges sealed/));
  assert.deepEqual(draft.notCovered, []);
  const lead = picked('asbestos-removal/lead-smf-pcb');
  assert.ok(lead.steps.includes('Remove fittings with PCB capacitors'));
  assert.ok(!lead.draft.notCovered.some((part) => /PCB/.test(part)));
});

test('hung, cantilevered, suspended and support scaffolds: the engineer\'s design, the bearing check and the licence class', () => {
  for (const key of ['scaffolding/hung-suspended', 'scaffolding/support-scaffold']) {
    const { lines } = picked(key);
    assert.ok(has(lines, /^Hung, drop and suspended scaffolds, cantilevered or spurred scaffolds over 6 m high, and birdcages that are clad or over 20 m high are erected only to an engineer's verified design/), key);
    assert.ok(has(lines, /^Before erection, the bearing for the scaffold's loads is confirmed: ground .* by a geotechnical engineer, and a slab, suspended floor or other structure .* by a structural engineer/), key);
    assert.ok(has(lines, /^Hung and suspended scaffolds are erected by holders of an advanced scaffolding licence \(SA\)\. Cantilevered and spur scaffolds need at least an intermediate scaffolding licence \(SI\)\./), key);
  }
  // A plain fixed scaffold keeps its own lines.
  assert.ok(!has(picked('scaffolding/fixed-scaffold').lines, /^Hung and suspended scaffolds are erected by holders/));
});

test('edge protection covers penetrations in floors and roofs; mast climbers draft from their own step and name what is left', () => {
  assert.ok(has(picked('scaffolding/edge-protection-stairs-nets').lines, /^Cover or barricade every penetration as soon as it is formed/));
  const { draft, lines, steps } = picked('scaffolding/mast-climbers');
  assert.ok(steps.includes('Install, climb and dismantle the mast climbing work platform'));
  assert.ok(has(lines, /basic rigging or intermediate scaffolding licence/));
  assert.ok(has(lines, /to the manufacturer's instructions and the engineer's design/));
  assert.ok(draft.notCovered.some((part) => /engineer's approval of the ground or structure/.test(part)));
});

test('crane workbox: registered box, harnesses, trained and licensed people, and a warning for the rest', () => {
  const { draft, lines, steps } = picked('cranes-rigging/crane-workbox');
  assert.ok(steps.includes('Lift people in the crane workbox'));
  assert.ok(has(lines, /^The workbox is design registered/));
  assert.ok(has(lines, /^Everyone in the workbox wears a full body harness/));
  assert.ok(has(lines, /^Everyone using a harness is trained/));
  assert.ok(has(lines, /holds a dogging or rigging licence/));
  assert.deepEqual(draft.notCovered, ['the site permit and the rescue procedure for people stranded in the workbox']);
  // Tower crane climbing, chain blocks and jacking and skating stay named for the user to add.
  assert.ok(picked('cranes-rigging/tower-crane-erection').draft.notCovered.length > 0);
  assert.deepEqual(picked('cranes-rigging/rigging').draft.notCovered, ['chain blocks and lifting beams', 'jacking and skating heavy plant']);
});

test('site clearing: the user chooses stockpile and cover or trucks off site; services, potholing, spotters, plan and erosion controls', () => {
  const offsite = picked('civil-earthworks/site-clearing', 'qld', { clearingSpoil: 'offsite' });
  assert.ok(!offsite.steps.includes('Stockpile and cover spoil') && offsite.steps.includes('Cart away spoil'));
  const kept = picked('civil-earthworks/site-clearing', 'qld', { clearingSpoil: 'stockpile' });
  assert.ok(kept.steps.includes('Stockpile and cover spoil') && !kept.steps.includes('Cart away spoil'));
  assert.ok(has(kept.lines, /^Topsoil and cleared material are stockpiled only where/));
  const asked = picked('civil-earthworks/site-clearing').asked.find((fact) => fact.id === 'clearingSpoil');
  assert.deepEqual(asked.choices.map((choice) => choice.value), ['stockpile', 'offsite']);
  const { lines, steps } = kept;
  assert.ok(steps.includes('Install and maintain erosion and sediment controls'));
  assert.ok(has(lines, /^Before plant grubs out large trees and stumps or starts bulk earthworks, services .* are exposed by potholing/));
  assert.ok(has(lines, /^Spotters are trained and competent/));
  assert.ok(has(lines, /^Fauna spotters have the qualifications and experience/));
  assert.ok(has(lines, /^Get the current underground services information/));
  assert.ok(has(lines, /^Where the project has an environmental management plan/));
});

test('bulk earthworks: hand trimming and compaction, and blinding placed as the user says', () => {
  const asked = picked('civil-earthworks/bulk-earthworks').asked.find((fact) => fact.id === 'blindingMethod');
  assert.deepEqual(asked.choices.map((choice) => choice.value), ['chute', 'pump', 'barrow']);
  const barrow = picked('civil-earthworks/bulk-earthworks', 'qld', { blindingMethod: 'barrow' });
  assert.ok(barrow.steps.includes('Trim and compact the base by hand') && barrow.steps.includes('Place the blinding concrete'));
  assert.ok(has(barrow.lines, /^When digging by hand, workers using picks, shovels or bars keep far enough apart/));
  assert.ok(has(barrow.lines, /^A remote-controlled roller is fit for the task/));
  assert.ok(has(barrow.lines, /^Barrow runs are kept short/));
  assert.ok(!has(barrow.lines, /^The agitator truck stands back from the excavation edge/));
  const chute = picked('civil-earthworks/bulk-earthworks', 'qld', { blindingMethod: 'chute' });
  assert.ok(has(chute.lines, /^The agitator truck stands back from the excavation edge/));
  const pump = picked('civil-earthworks/bulk-earthworks', 'qld', { blindingMethod: 'pump' });
  assert.ok(has(pump.lines, /^Keep people clear of the end hose at start-up/));
  assert.match(item('civil-earthworks/locate-services').task, /before clearing, grubbing large trees and bulk earthworks/);
});

test('EPA Victoria\'s guide is cited in Victorian drafts only, and the NSW Blue Book in NSW drafts only', () => {
  const cited = (state) => picked('civil-earthworks/erosion-sediment', state).lines.join('\n');
  assert.match(cited('vic'), /EPA Victoria, Civil construction, building and demolition guide/);
  assert.doesNotMatch(cited('vic'), /Managing Urban Stormwater/);
  assert.match(cited('nsw'), /Managing Urban Stormwater: Soils and Construction/);
  assert.doesNotMatch(cited('nsw'), /EPA Victoria/);
  for (const state of ['qld', 'sa']) assert.doesNotMatch(cited(state), /EPA Victoria|Managing Urban Stormwater/, state);
});

test('typed words find the new steps: erosion and sediment controls, hand trimming and blinding, and mast climbers', () => {
  const suggested = (task) => (questionsFor({ state: 'qld', task, fallRisk: 'no', facts: {} }).steps || {}).suggested || [];
  assert.ok(suggested('Erosion and sediment controls: install and maintain silt fences.').includes('erosionControl'));
  assert.ok(suggested('Hand trim the footing base and place the blinding.').includes('handTrim'));
  assert.ok(suggested('Install and dismantle the mast climbing work platform.').includes('mastClimber'));
  assert.ok(!suggested('Lay pavers on a sand bed and compact with a plate compactor.').includes('handTrim'));
});

test('a site\'s own traffic management plan (TMP) is not road work; traffic management on a public road still is', () => {
  const suggested = (task) => (questionsFor({ state: 'qld', task, fallRisk: 'no', facts: {} }).steps || {}).suggested || [];
  assert.ok(!suggested(item('site-establishment-traffic/traffic-on-site').task).includes('road'));
  assert.ok(suggested(item('site-establishment-traffic/traffic-public-road').task).includes('road'));
  assert.ok(suggested('Traffic control on a public road for roadworks.').includes('road'));
});
