// Content faults found by the messy-user test, round 18 (staging runs 1 to 8, 23 October 2026, on main 05b21de): wrong-context
// steps for a kitchen fit-out, a fence and a sewer main; SiteWrite's own order; W17 partial; own steps placed where added;
// wrong-context lines, questions, plant, licences and citations; the licence contradiction for chain block hoisting; own plant and
// its high risk work; the refrigerant contradiction; ratings; missing work and false items; products and substances.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { prepareDraft, questionsFor, packageKinds, suggestedKinds } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { checkSwms, fromDraft } = require('../builder-check');
const { firmFaults } = require('../step-stages');
const { typeItems } = require('../substances');
const rules = require('../public/substance-rules');

const SITE = { residential: 'no', company: 'Test', workplace: '12 Smith Street, Paddington', principalContractor: 'ABC Builders Pty Ltd', hospital: 'Royal Hospital', firstAider: 'Jo Smith', musterPoint: 'Front gate', worksManager: 'Sam Lee', worksManagerPhone: '0400 118 552', complianceResponsible: 'Sam Lee', reviewer: 'Sam Lee', date: '23 October 2026' };
function answered(input, given = {}) {
  const facts = { ...(input.facts || {}) };
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor({ ...input, facts });
    let added = false;
    for (const item of asked.required || []) {
      if (facts[item.id] !== undefined && facts[item.id] !== '') continue;
      facts[item.id] = given[item.id] || (item.id === 'liveElectrical' ? 'no' : item.choices ? item.choices[0].value : ((answersFor(item.id, asked.task)[0] || {}).text || 'As set out in the site plan.').replace(/_{3,}/g, 'as on the site plan'));
      added = true;
    }
    if (!added) break;
  }
  return { ...input, facts };
}
const bodyOf = (input, given) => draftBody(answered({ ...SITE, ...input }, given));
const draftOf = (input, given, extra = {}) => prepareDraft({ ...bodyOf(input, given), ...extra });
const names = (draft) => draft.jobSteps.map((step) => step.step);
const textOf = (line) => (typeof line === 'string' ? line : line.text);
const lines = (draft) => draft.jobSteps.flatMap((step) => [...step.hazards, ...step.controls]).map(textOf).join('\n');
const stepNamed = (draft, name) => draft.jobSteps.find((step) => step.step === name);
const before = (list, a, b) => list.indexOf(a) >= 0 && list.indexOf(b) >= 0 && list.indexOf(a) < list.indexOf(b);
const asSteps = (list) => list.map((step) => (typeof step === 'string' ? { step, hazards: [], controls: [] } : step));
const checked = (draft, state) => checkSwms(fromDraft(draft, { state, swms: { signatures: [{ name: 'Jo Smith', date: '1 October 2026' }] } }), { state });
const w17 = (draft, state) => checked(draft, state).findings.filter((item) => item.rule === 'W17' && !item.pass);
const flagged = (list, step, after) => firmFaults(asSteps(list)).some((item) => item.step === step && item.after === after);
const plantNames = (draft) => (draft.plantInferred || draft.plant || []).filter((item) => !item.maybe).map((item) => item.item);
const ticked = (draft) => draft.ppe.flatMap((group) => (group.items || []).filter((item) => item.ticked).map((item) => item.id));

// The runs' own words.
const KITCHEN = { state: 'nsw', fallRisk: 'no', crane: 'company', slinging: 'crane', task: 'Set out kitchen works from the Contractor\'s datum and set-out points. Install custom fabricated stainless steel benches, counters, sinks, hand basins, trolleys, racks, ice wells and fitments, including bench plinths. Install stainless steel wall linings, services spine wall and services duct. Install stainless steel exhaust and condensate canopies. Install proprietary cooking equipment: combi ovens, fryers, ranges, bratt pan, kettle, pasta cooker, chargrill, salamander, induction units, wood fired pizza oven. Install self-contained refrigeration equipment: fridges, freezers, blast chillers, ice machines. Install dish, pot and glass-wash machines, including reverse osmosis units, rack conveyor and powered inlet pull. Install preparation, serving and mobile equipment and food displays, including sneeze guards, heat lamps, insect lamps and boiling water unit. Install shelving and racks: shelving, dunnage racks, plate racks, wine shelving, pizza racks. Install slot drains, floor wastes and floor gutters. Supply and fit tap sets and spray rinse arms, and run tails from breach pieces to below bench. Install water filters for equipment. Install indirect drains from custom fabricated equipment. Install stainless steel trims, bump guards and edge protectors. Protect adjacent and finished surfaces and replace damaged materials. Canopies and combi ovens lifted off the supplier\'s hiab truck at the dock.' };
const WALL = { state: 'qld', fallRisk: 'yes', crane: 'none', task: 'Build a 1.8 m high reinforced concrete block retaining wall, 45 m long, on the rear boundary of a new townhouse site. Cut the bank back and dig the strip footing with our 5 t excavator. Place the reo and pour the footing from the concrete truck chute. Lay 200 series concrete blocks over the starter bars, then core fill the blocks with a concrete pump. Apply a bitumen waterproofing membrane to the back face, lay the ag drain and drainage gravel, then backfill and compact behind the wall in 300 mm layers with a plate compactor. Blocks come on pallets on the supplier\'s truck and are unloaded with the supplier\'s forklift.' };
const WALL_RETYPED = { ...WALL, task: 'Build a 1.8 m high reinforced concrete block retaining wall, 45 m long, on the rear boundary of a new townhouse site. Set out the wall line from the surveyor\'s pegs. Cut the bank back to a 1:1 batter and dig the 600 mm deep strip footing with our 5 t excavator, run by our own operator. Place the reo and starter bars in the footing and pour it from the concrete truck chute. Lay 200 series concrete blocks over the starter bars, cutting blocks with a wet saw, then core fill the blocks with a line pump. Apply a bitumen waterproofing membrane to the back face, lay the ag drain and drainage gravel, then backfill and compact behind the wall in 300 mm layers with a plate compactor. Blocks come on pallets on the supplier\'s truck and are unloaded with the supplier\'s forklift.' };
const LIFTS = { state: 'sa', fallRisk: 'yes', crane: 'company', slinging: 'crane', priorKinds: ['liftLifting', 'liftShaft'], task: 'Hoist the lift machine, rails and equipment into the lift shaft and machine room with chain blocks, working at open lift shafts and landing doors. 2 new lifts in the office tower, 14 levels. New machines and rail bundles come off the semi at the loading dock with a franna then wheeled in and chain blocked up the shaft off the lifting beam. Working off the shaft platform with landing screens up' };
const SEWER = { state: 'tas', fallRisk: 'yes', crane: 'own', task: 'lay new 225 pvc sewer main allong the nature strip on main rd, about 80m, trench upto 2.2m deep dug with our 13t excavater n a trench sheild, pipes come off the truck with our hiab, conect into the exsisting manhole, backfill n compact, reinstate footpath' };
const SEWER_GIVEN = { craneChart: 'Hiab XS 144 vehicle loading crane, rated 1.2 t at 8 m radius from its load chart; heaviest pipe 0.4 t at 6 m.', groundBearing: 'The principal contractor confirmed the road takes the outrigger loads. Outriggers on 600 mm pads.', fallControl: 'trench sheild' };
const CLEAN = { state: 'act', fallRisk: 'yes', crane: 'none', task: 'All builders plus final cleaning ready for the opening of the resort: Kitchen areas. Bathrooms/wet areas. Glazing. External pool area. Road surface cleaning. No acid cleaning products to be used without prior consent of the Contractor in writing. All windows are to be cleaned to a streak free finish including the removal of paint, mortar tags, render and the like on the frame and glass. Both internal and external. Ensure tracks of sliding doors and external windows are clean and free from obstruction. Provide all access equipment necessary to complete the works. No EWP’s on tiled or carpet areas. Mobile scaffolds are to be used.' };
const FENCE = { state: 'nt', fallRisk: 'no', crane: 'none', priorKinds: ['fenceBuild'], task: 'Fencing and gates: set out the fence line, dig the post holes, set the posts in concrete, and build the fence and hang the gates. 180 m of 2.1 m chainmesh security fence round the new depot. Post holes augered with our bobcat, posts concreted from bagged mix, one 8 m sliding gate on a motor, the electrician wires the motor.' };
const FLOORS = { state: 'vic', fallRisk: 'no', crane: 'none', task: 'Install sheet vinyl flooring with 100mm coved skirting to all walls. Skim subfloor in sheet vinyl areas. Install custom hospitality carpet by direct stick method. Install commercial carpet tiles by direct stick method.' };

// ---- 1. Commercial kitchens ----

test('A run 1: a kitchen fit-out ticks the kitchen equipment step, and no steel, glass, hot conditions or refrigerant charging', () => {
  const kinds = suggestedKinds(KITCHEN.task, {}, {});
  assert.ok(kinds.includes('kitchenEquipment'), kinds.join(' '));
  for (const id of ['steelErect', 'steelLift', 'glassHandle', 'glassWind', 'heatWork', 'refrigerantCharge', 'refrigerantTest', 'conveyorInstall']) assert.ok(!kinds.includes(id), id);
  const draft = draftOf(KITCHEN);
  const list = names(draft);
  assert.ok(list.includes('Deliver and install commercial kitchen equipment'), list.join(' | '));
  for (const name of ['Lift and land steel with the crane company', 'Erect and connect steel at height', 'Handle glass in the wind', 'Handle and install glass panels', 'Work in hot conditions', 'Recover refrigerant', 'Evacuate and charge the system']) assert.ok(!list.includes(name), name);
  // The kitchen step covers the canopies, benches and gas connections in its own lines.
  const kitchen = stepNamed(draft, 'Deliver and install commercial kitchen equipment').controls.map(textOf).join('\n');
  assert.match(kitchen, /Hoods and exhaust ducts are lifted into place/);
  assert.match(kitchen, /Gas connections are made by a licensed gas fitter/);
  assert.match(kitchen, /benches/);
});

test('A run 1: self-contained, pre-charged refrigeration is not refrigerant line work; piped refrigeration still is', () => {
  const draft = draftOf(KITCHEN);
  assert.ok(!draft.highRisk.some((label) => /refrigerant lines/i.test(label)), draft.highRisk.join(' | '));
  assert.ok(!suggestedKinds('Install the chargrill and the salamander. Install self-contained fridges.', {}, {}).includes('refrigerantCharge'));
  assert.ok(!suggestedKinds('Install pre-charged plug-in display fridges.', {}, {}).includes('refrigerantCharge'));
  const piped = suggestedKinds('Install the remote condensing units, run and braze the refrigerant pipework, pressure test, evacuate and charge the system.', {}, {});
  for (const id of ['refrigerantPipework', 'refrigerantTest', 'refrigerantCharge']) assert.ok(piped.includes(id), id);
  const remote = draftOf({ state: 'nsw', fallRisk: 'no', crane: 'none', task: 'Install the remote condensing units, run and braze the refrigerant pipework, pressure test, evacuate and charge the system.' });
  assert.ok(remote.highRisk.some((label) => /refrigerant lines/i.test(label)));
});

test('A run 1: the kitchen floor saw cuts print no overhead, inverted or through-wall cutting lines', () => {
  const text = lines(draftOf(KITCHEN));
  assert.match(text, /Cutting concrete is processing a crystalline silica substance/);
  for (const pattern of [/No cutting above shoulder height/, /Inverted cutting of the underside/, /When cutting through a wall/]) assert.doesNotMatch(text, pattern);
  // A wall cut keeps them.
  const wall = lines(draftOf({ state: 'nsw', fallRisk: 'no', crane: 'none', task: 'Saw cut a new doorway opening through the existing concrete wall, and saw cut slot drains in the floor.' }));
  assert.match(wall, /When cutting through a wall/);
});

// ---- 2. Wrong-context steps ----

test('B run 8: posts concreted from bagged mix are not rendering; bagging a wall still is', () => {
  assert.ok(!suggestedKinds(FENCE.task, {}, {}).includes('rendering'));
  assert.ok(!names(draftOf(FENCE)).includes('Apply render to walls'));
  assert.ok(suggestedKinds('Render and bagg the new brick walls.', {}, {}).includes('rendering'));
});

test('B run 6: a sewer main connected into an existing manhole installs no pits; new pits still do', () => {
  const draft = draftOf(SEWER, SEWER_GIVEN);
  assert.ok(!names(draft).includes('Install pits'), names(draft).join(' | '));
  assert.ok(names(draft).includes('Connect to the live sewer'));
  const pits = draftOf({ ...SEWER, task: 'Lay 80 m of 225 pvc stormwater pipe in a 1.2 m deep trench and install 2 new pits, then connect into the existing pit.' }, SEWER_GIVEN);
  assert.ok(names(pits).includes('Install pits'));
});

// ---- 3 and 4. SiteWrite's own order, and W17 ----

test('A run 3: the block wall cuts blocks with the laying, and the core fill pump comes after the blocks', () => {
  for (const input of [WALL, WALL_RETYPED]) {
    const draft = draftOf(input);
    const list = names(draft);
    assert.ok(before(list, 'Excavate and set out the retaining wall', 'Cut blocks and bricks'), list.join(' | '));
    assert.ok(before(list, 'Cut blocks and bricks', 'Lay blocks and bricks'), list.join(' | '));
    const pump = list.find((name) => /^Set up the concrete pump/.test(name));
    assert.ok(before(list, 'Lay blocks and bricks', pump) && before(list, pump, 'Core fill blockwork'), list.join(' | '));
    assert.equal(w17(draft, 'qld').length, 0);
  }
  // A pump that also pours the footing keeps its place with the footing.
  const both = names(draftOf({ ...WALL, task: WALL.task.replace('pour the footing from the concrete truck chute', 'pump the footing') }));
  assert.ok(before(both, 'Pump and place concrete', 'Lay blocks and bricks'), both.join(' | '));
});

test('A run 1: the kitchen isolation and energised work come after the equipment is installed', () => {
  const draft = draftOf(KITCHEN);
  const list = names(draft);
  assert.ok(before(list, 'Deliver and install commercial kitchen equipment', 'Isolate and prove de-energised'), list.join(' | '));
  assert.ok(before(list, 'Deliver and install commercial kitchen equipment', 'Work on or near energised parts'), list.join(' | '));
  assert.ok(before(list, 'Work with the crane crew during lifts', 'Deliver and install commercial kitchen equipment'), list.join(' | '));
  assert.equal(w17(draft, 'nsw').length, 0);
});

test('W17: block cutting above the dig, and the hoisting above the crane delivery and shaft protection, are flagged', () => {
  assert.ok(flagged(['Before starting', 'Cut blocks and bricks', 'Excavate and set out the retaining wall', 'Dig and pour footings', 'Lay blocks and bricks'], 'Excavate and set out the retaining wall', 'Cut blocks and bricks'));
  assert.ok(flagged(['Before starting', 'Lift machines, rails and equipment into the shaft', 'Work with the crane crew during lifts', 'Work at open lift shafts and landing doors'], 'Work with the crane crew during lifts', 'Lift machines, rails and equipment into the shaft'));
  assert.ok(flagged(['Before starting', 'Lift machines, rails and equipment into the shaft', 'Work at open lift shafts and landing doors'], 'Work at open lift shafts and landing doors', 'Lift machines, rails and equipment into the shaft'));
  // SiteWrite's own lift order is not flagged.
  assert.equal(w17(draftOf(LIFTS), 'sa').length, 0);
});

// ---- 4 and 5. Own steps placed where added, and W17 on them ----

test('B run 8: an own set-out step goes before the plant and the digging, and W17 flags it after the digging', () => {
  const own = { name: 'Set out the fence line and mark post holes', hazards: ['Tripping on pegs and string lines'], controls: ['Pegs capped and string lines flagged'] };
  const list = names(draftOf(FENCE, {}, { ownSteps: [own] }));
  const mine = list.find((name) => name.startsWith('Set out the fence line'));
  assert.ok(before(list, mine, 'Operate small earthmoving plant') && before(list, mine, 'Dig post holes'), list.join(' | '));
  assert.ok(flagged(['Before starting', 'Operate small earthmoving plant', 'Dig post holes', `${own.name} (Our own step)`, 'Build the fence'], `${own.name} (Our own step)`, 'Dig post holes'));
});

// ---- 6. Wrong-context lines, questions, plant, licences and citations ----

test('A run 3: a block retaining wall asks no deck load limits and prints no deck, slab, shaft, room or road base lines', () => {
  for (const input of [WALL, WALL_RETYPED]) {
    const asked = questionsFor(bodyOf(input)).required.map((item) => item.id);
    assert.ok(!asked.includes('loadLimits'), asked.join(' '));
    const draft = draftOf(input);
    const text = lines(draft);
    for (const pattern of [/suspended (?:slab|floor)/i, /backpropping/i, /penetration covers/i, /lift shafts/i, /The room is closed/, /road base/i, /table drains/i, /\bgrader\b/i, /Use a water cart/]) assert.doesNotMatch(text, pattern);
    assert.ok(!names(draft).includes('Lift reo onto the deck'));
    assert.ok(!names(draft).includes('Operate forklifts'));
    assert.ok(!names(draft).includes('Spread and compact the gravel'));
    for (const item of ['Forklift', 'Loader', 'Water cart', 'Tipper or dump truck', 'Lifting gear (slings, chains, shackles)']) assert.ok(!plantNames(draft).includes(item), item);
    assert.ok(!draft.qualifications.some((name) => /forklift|dogging/i.test(name)), draft.qualifications.join(' | '));
    assert.ok(!draft.sources.codes.concat(draft.sources.legislation || []).some((title) => /Plumbing and Drainage/i.test(title)), JSON.stringify(draft.sources));
  }
  // The line pump retype brings no placing boom.
  const retyped = draftOf(WALL_RETYPED);
  assert.ok(!plantNames(retyped).includes('Concrete placing boom'));
  assert.ok(names(retyped).includes('Set up the concrete pump'));
  assert.doesNotMatch(lines(retyped), /placing boom/i);
});

test('A run 3: the wall\'s geotechnical design is linked to the cut, the footing and the backfill', () => {
  const draft = draftOf(WALL_RETYPED, {}, { designs: [{ id: 'excavation', what: 'Retaining wall and geotechnical design', by: 'Kawana Civil Consulting', number: 'KCC-2214-RW01', revision: 'B', date: '2026-08-14', status: 'given' }] });
  const row = draft.designs.find((item) => item.id === 'excavation');
  assert.deepEqual(row.steps, ['Excavate and set out the retaining wall', 'Dig and pour footings', 'Backfill behind the retaining wall']);
});

test('B run 7: mobile scaffolds named for the glass bring no EWP-only window line, and no balcony hazards with no balcony', () => {
  const draft = draftOf(CLEAN);
  const window = stepNamed(draft, 'Clean windows and balconies');
  const text = [...window.hazards, ...window.controls].map(textOf).join('\n');
  assert.doesNotMatch(text, /cleaned only from an EWP/);
  assert.doesNotMatch(text, /balcony or from a ladder|from balconies|loose on balconies/);
  assert.match(text, /A fall from a ladder or platform\./);
  const balcony = draftOf({ ...CLEAN, task: 'Clean the windows and balconies of the 12 apartments.' });
  assert.match(lines(balcony), /cleaned only from an EWP/);
  assert.match(lines(balcony), /Items fall from balconies/);
});

test('B run 8: the electrician wiring the gate motor brings no low voltage rescue or electrical licence to the fencers', () => {
  const draft = draftOf(FENCE);
  assert.doesNotMatch(lines(draft), /low voltage rescue/);
  assert.ok(!draft.qualifications.some((name) => /electric|rescue and resuscitation/i.test(name)), draft.qualifications.join(' | '));
});

test('B run 8: holes augered in the ground print no silica from cutting and coring, and ask no silica product', () => {
  const draft = draftOf(FENCE);
  const holes = stepNamed(draft, 'Dig post holes');
  assert.doesNotMatch([...holes.hazards, ...holes.controls].map(textOf).join('\n'), /silica/i);
  assert.ok(!typeItems(draft, bodyOf(FENCE)).some((item) => /silica/i.test(item.type)));
  const paving = draftOf({ ...FENCE, task: 'Core the post holes through the existing concrete footpath and set the posts. Build the fence.' });
  assert.match([...stepNamed(paving, 'Dig post holes').hazards].map(textOf).join('\n'), /Silica dust/);
});

test('B run 6: a fall only into the trench asks nothing about edge protection, a working platform or an EWP', () => {
  const draft = draftOf(SEWER, SEWER_GIVEN);
  assert.ok(!draft.controls.some((item) => /working platform or an EWP was considered first/.test(item.text)), JSON.stringify(draft.controls.map((item) => item.text)));
  // A roof fall still asks it.
  const roof = draftOf({ state: 'tas', fallRisk: 'yes', crane: 'none', task: 'Replace the roof sheets on the shed.' }, { fallControl: 'harness and lanyard' });
  assert.ok(roof.controls.some((item) => /working platform or an EWP was considered first/.test(item.text)));
});

test('A run 2: laying carpet and sheet vinyl ticks no broad brim or sunscreen', () => {
  const draft = draftOf({ ...FLOORS, kinds: packageKinds(FLOORS.task, ['floorLay', 'floorAdhesive', 'floorLevel']) });
  const on = ticked(draft);
  assert.ok(!on.includes('sunHat') && !on.includes('sunscreen'), on.join(' '));
  assert.ok(on.includes('kneePads'));
});

// ---- 7. Licence contradiction ----

test('B run 5: the crew\'s own chain block hoisting lists the dogging or rigging licence beside the crane company\'s dogman', () => {
  const draft = draftOf(LIFTS);
  assert.ok(draft.qualifications.some((name) => /dogging or rigging/.test(name)), draft.qualifications.join(' | '));
  // A crane company lift with no rigging of our own still leaves it to the crane crew (D258).
  const crane = draftOf({ state: 'sa', fallRisk: 'no', crane: 'company', slinging: 'crane', task: 'Crane company lifts the new rooftop AC units onto the roof; we receive them and fix them on their supports.' });
  assert.ok(!crane.qualifications.some((name) => /dogging or rigging/.test(name)), crane.qualifications.join(' | '));
});

// ---- 8. Own plant brings its high risk work ----

test('B run 7: a ride-on sweeper the user adds to the plant lists moving powered mobile plant', () => {
  const plant = { used: ['Mobile scaffold'], notUsed: [], added: [{ item: 'Ride-on sweeper for the roads and car park', licence: 'No' }] };
  const draft = draftOf(CLEAN, {}, { plantChoice: plant });
  assert.ok(draft.highRisk.some((label) => /powered mobile plant/.test(label)), draft.highRisk.join(' | '));
  assert.ok(!draftOf(CLEAN).highRisk.some((label) => /powered mobile plant/.test(label)));
});

// ---- 10. Ratings ----

test('B run 5: the hoisting step and an own proof load step are not left High after their own controls', () => {
  const own = { name: 'proof load test n tag the lifting beam b4 hoisting', hazards: ['beam or anchor fails under load', 'chain block slips'], controls: ['beam rated n tagged by the builders engineer, proof loaded to 1.25 x the heaviest lift b4 first use', 'chain block tagged n inspected each shift, load never over the rated WLL'] };
  const draft = draftOf(LIFTS, {}, { ownSteps: [own] });
  for (const step of draft.jobSteps) assert.notEqual(step.risk.after.level, 'High', step.step);
  assert.match(stepNamed(draft, 'Lift machines, rails and equipment into the shaft').controls.map(textOf).join('\n'), /Exclusion zone\. No one goes under a suspended load\./);
});

// ---- 11. Missing work and false items ----

test('B run 7: road surface cleaning is listed though a pressure cleaning step is ticked', () => {
  const draft = draftOf({ ...CLEAN, kinds: ['mobileScaffold', 'cleaning', 'cleaningHeight', 'pressureClean'] });
  assert.ok(draft.notCovered.includes('Road surface cleaning'), JSON.stringify(draft.notCovered));
});

test('B run 5: lift machines wheeled in from the dock are listed as work with no job steps', () => {
  assert.ok(draftOf(LIFTS).notCovered.some((part) => /wheeled in/.test(part)), JSON.stringify(draftOf(LIFTS).notCovered));
});

test('False items: "run by our own operator", "backfill n compact" and "posts concreted from bagged mix" are not listed', () => {
  assert.deepEqual(draftOf(WALL_RETYPED).notCovered, []);
  assert.deepEqual(draftOf(SEWER, SEWER_GIVEN).notCovered, []);
  assert.ok(!draftOf(FENCE, {}, { kindsOff: ['rendering'] }).notCovered.some((part) => /bagged mix/.test(part)));
});

// ---- 12. Products and substances ----

test('A run 2 and B run 7: the safety data sheet answer\'s products are made, each under its type', () => {
  assert.deepEqual(rules.sdsProducts('carpet adhesive n floor levelling compound, sds in the van').map((row) => [row.type, row.product]), [['Adhesives', 'carpet adhesive'], ['Cement, concrete, grout and mortar', 'floor levelling compound']]);
  const cleaning = rules.sdsProducts('Neutral floor cleaner, glass cleaner, stainless steel polish and a mild alkaline degreaser. No acid cleaners unless the builder approves in writing. Products are decanted only into labelled bottles, and the SDS are kept in the cleaning van.');
  assert.deepEqual(cleaning.map((row) => row.product), ['Neutral floor cleaner', 'glass cleaner', 'stainless steel polish', 'mild alkaline degreaser']);
  assert.ok(cleaning.every((row) => row.type === 'Cleaning chemicals'));
});

test('A run 2 and B run 7: on the SWMS page the answer\'s products become products, once each', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'substances.js'), 'utf8');
  const listeners = [];
  const context = { window: { SiteWriteSubstanceRules: rules, SiteWrite: {} }, document: { addEventListener: (...args) => listeners.push(args), head: null, getElementById: () => null, querySelector: () => null }, CSS: { escape: (value) => value } };
  vm.runInNewContext(source, context);
  const page = context.window.SiteWriteSubstances;
  assert.equal(page.fromAnswer('carpet adhesive n floor levelling compound, sds in the van'), true);
  assert.deepEqual(JSON.parse(JSON.stringify(page.payload().map((row) => [row.type, row.product]))), [['Adhesives', 'Carpet adhesive'], ['Cement, concrete, grout and mortar', 'Floor levelling compound']]);
  // The same answer again adds nothing, and a type ticked "Not required" is left alone.
  assert.equal(page.fromAnswer('carpet adhesive n floor levelling compound, sds in the van'), false);
  page.load([], ['Cleaning chemicals'], {});
  assert.equal(page.fromAnswer('glass cleaner'), false);
});

test('B run 7: a glass cleaner goes in the window step, and a floor cleaner in the floor step', () => {
  const steps = ['Before starting', 'Use mobile scaffolds', 'Clean with chemicals', 'Clean windows and balconies', 'Clean floors, fixtures and plant rooms', 'Finish and clean up'].map((step) => ({ step }));
  assert.equal(rules.stepOf({ type: 'Cleaning chemicals', product: 'Glass cleaner' }, steps), 'Clean windows and balconies');
  assert.equal(rules.stepOf({ type: 'Cleaning chemicals', product: 'Neutral floor cleaner' }, steps), 'Clean floors, fixtures and plant rooms');
  assert.equal(rules.stepOf({ type: 'Cleaning chemicals', product: 'Mild alkaline degreaser' }, steps), 'Clean with chemicals');
});

test('A run 2: heat welding vinyl joins suggests no adhesive; laying vinyl still does', () => {
  const adhesive = rules.SUBSTANCES.find(([type]) => type === 'Adhesives')[1];
  assert.equal(adhesive.test('Groove and heat weld the vinyl joins with a hot air welder'), false);
  assert.equal(adhesive.test('Heat weld vinyl joins'), false);
  assert.equal(adhesive.test('Lay sheet vinyl in the wards'), true);
});
