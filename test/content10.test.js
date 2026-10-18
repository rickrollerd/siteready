// Content faults found by the messy-user test, round 10 on staging (17 October 2026, build 0e3e946): the step order
// (a work stage for every library step, and an order checker), wrong-context steps and lines, missing work and plant,
// "Not required" for cleaning chemicals, conditional solvents and one epoxy asked twice, unticked plant lines,
// products in the right step, an own item that names the generator, hospitals and short typos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { prepareDraft, questionsFor, packageKinds } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { checkSwms, fromDraft } = require('../builder-check');
const { typeItems } = require('../substances');
const { ACTIVITIES } = require('../activities');
const { fixSpelling } = require('../spelling');
const { stageOf, inStageOrder, orderFaults, BY_NAME } = require('../step-stages');
const rules = require('../public/substance-rules');
const places = require('../places');

const SITE = { residential: 'no', company: 'Test', workplace: '12 Smith Street, Paddington', principalContractor: 'ABC Builders Pty Ltd', hospital: 'Royal Hospital', firstAider: 'Jo Smith', musterPoint: 'Front gate', worksManager: 'Sam Lee', worksManagerPhone: '0400 118 552', complianceResponsible: 'Sam Lee', reviewer: 'Sam Lee', date: '17 October 2026' };
function answered(input, given = {}) {
  const facts = { ...(input.facts || {}) };
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor({ ...input, facts });
    let added = false;
    for (const item of asked.required || []) {
      if (facts[item.id]) continue;
      facts[item.id] = given[item.id] || (item.id === 'liveElectrical' ? 'no' : item.choices ? item.choices[0].value : ((answersFor(item.id, asked.task)[0] || {}).text || 'As set out in the site plan.').replace(/_{3,}/g, 'as on the site plan'));
      added = true;
    }
    if (!added) break;
  }
  return { ...input, facts };
}
const bodyOf = (input, given) => draftBody(answered({ ...SITE, ...input }, given));
const draftOf = (input, given) => prepareDraft(bodyOf(input, given));
const names = (draft) => draft.jobSteps.map((step) => step.step);
const lines = (draft) => draft.jobSteps.flatMap((step) => [...step.hazards, ...step.controls]).join('\n');
const plantOf = (draft) => (draft.plantInferred || []).map((item) => item.item);
const before = (list, a, b) => list.indexOf(a) >= 0 && list.indexOf(b) >= 0 && list.indexOf(a) < list.indexOf(b);
const askedOf = (input, id) => (questionsFor(bodyOf(input)).required || []).find((item) => item.id === id);
const site = (extra = {}) => ({ liveServices: 'none', publicInterface: 'none', otherTrades: 'none', ground: 'firm', access: 'main gate', ...extra });

const WALL = 'build 1.8m high besser blok retaning wall 40m long on back boundry. dig footing with 5t excavater, reo n pour footing off the concrete truck chute, lay blocks, core fill, agg pipe n gravel behind, membrane on back of wall, backfill n compact with plate compacter';
const wall = (extra = {}) => ({ state: 'qld', fallRisk: 'no', crane: 'none', task: WALL, site: site(), ...extra });
const MAIN = 'Replace 300m of old 150mm cast iron water main with 200mm PE along the nature strip and footpath on Main Rd Moonah. Saw cut the footpath and asphallt with a petrol road saw, excavate the trench with a 5t excavtor, about 1.2m deep, trench sheild where its deeper than 1.5m at the Albert Rd crossing. Electofusion weld the PE, presure test and chlorinate. Night shutdown for the tie in to the live main with the water authority. Backfil, compact and reinstat the footpath to ground level. Traffic control by others.';
const main = (extra = {}) => ({ state: 'tas', fallRisk: 'no', crane: 'none', task: MAIN, site: site({ liveServices: 'water main live', publicInterface: 'footpath closed', access: 'Trench ladder at each open section' }), ...extra });
const FENCE = 'Fencing and gates: set out the fence line, dig the post holes, set the posts in concrete, and build the fence and hang the gates. 2.4m security fence round the substation compound at the back, post holes with a petrol auger, galv posts cut with a petrol cut off saw and cold gal on the cut ends. Barbed wire outriggers fixed on top from a ladder and our sissor lift, chemset anchors for the gate posts in the existing slab. Plus anti climb mesh along the top of the 3m retaning wal from the EWP.';
const fence = (extra = {}) => ({ state: 'nt', fallRisk: 'yes', crane: 'none', trade: 'fencing', task: FENCE, site: site({ liveServices: 'substation', access: 'drive in off mcminn st gate, scissor and EWP on a float' }), ...extra });
const KITCHEN = 'Install the commercial kitchens in buildings 1 and 2: cool rooms and freezer rooms in EPS panel, stainless steel benches, shelving and wall linings, exhaust and condensate canopies, slot drains, floor wastes and floor gutters, tap sets, water filters and indirect drains, and the kitchen equipment.';
const kitchen = (extra = {}) => ({ state: 'nsw', fallRisk: 'no', crane: 'none', task: KITCHEN, site: site({ ground: 'slab', access: 'Pallet jacks through the loading dock' }), ...extra });
const CLEAN = 'DESCRIPTION OF WORK All builders plus final cleaning ready for the opening of the resort, including but not limited to:\n• Kitchen areas\n• Bathrooms/wet areas\n• Conference rooms\n• Restaurants\n• Plantrooms\n• Café\n• Bars\n• Back of House (BOH) areas\n• Corridors\n• Glazing\n• External pool area\n• Road surface cleaning';
const cleaning = (extra = {}) => ({ state: 'act', fallRisk: 'no', crane: 'none', task: CLEAN, site: site(), ...extra });

// ---- 1. The order of the work ----

test('every library step has a work stage, or goes with the step beside it', () => {
  const missing = [...new Set(ACTIVITIES.flatMap((activity) => activity.steps.map((step) => step.step)))].filter((name) => stageOf(name) === null);
  assert.deepEqual(missing, []);
  assert.equal(stageOf('Before starting'), 0);
  assert.equal(stageOf('Finish and clean up'), 999);
  assert.equal(stageOf('Use an elevating work platform'), 'lead');
  assert.equal(stageOf('My own step (Our own step)'), null);
});

test('the stages agree with the pairs of steps the library already orders, apart from the ones the round 10 cases overturn', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'activities.js'), 'utf8');
  const pairs = [...src.matchAll(/moveBefore\('([^']+)', '([^']+)'\)/g)].map((m) => [m[1], m[2]]).concat([...src.matchAll(/moveAfter\('([^']+)', '([^']+)'\)/g)].map((m) => [m[2], m[1]]));
  const against = pairs.filter(([a, b]) => typeof stageOf(a) === 'number' && typeof stageOf(b) === 'number' && stageOf(a) > stageOf(b)).map(([a, b]) => `${a} > ${b}`);
  // Kitchen equipment goes in after the rough-in (round 10, run 1), a vanity after the rough-in, and a shallow
  // trench's fit-off and the asbestos shed's bagging are settled by the context stages or the stage itself.
  assert.deepEqual(against.sort(), [
    'Deliver and install commercial kitchen equipment > Plumbing rough-in',
    'Plumbing fit-off > Backfill the trench',
    'Remove and fit the vanity > Plumbing rough-in',
    // Content14 (messy round 13, A run 1): a tiler drills tiled walls once the tiles are laid (a glazier's shower screen is
    // drilled before its glass, by the context stages), and tiles near open edges are laid after the old tiles are broken
    // out, with the other tiling.
    'Drill tiled walls for fixings > Handle and install glass panels',
    'Lay tiles near open edges > Break out the cracked tiles',
  ].sort());
});

test('the stage sort keeps steps of one stage in their order, and an unstaged step with the step it leads into', () => {
  const steps = ['Before starting', 'Place and tie reo', 'Use an elevating work platform', 'Dig footing holes', 'My own step (Our own step)', 'Lay blocks and bricks', 'Finish and clean up'].map((step) => ({ step }));
  assert.deepEqual(inStageOrder(steps).map((item) => item.step), ['Before starting', 'Use an elevating work platform', 'Dig footing holes', 'My own step (Our own step)', 'Place and tie reo', 'Lay blocks and bricks', 'Finish and clean up']);
  const faults = orderFaults(steps);
  assert.ok(faults.some((item) => item.step === 'Dig footing holes' && item.after === 'Place and tie reo'));
});

test('run 3: the footing is dug before the reo and the pour, the wall is set out first, and the blocks before the core fill', () => {
  const draft = draftOf(wall());
  const list = names(draft);
  assert.ok(before(list, 'Excavate and set out the retaining wall', 'Dig and pour footings'), list.join(' | '));
  assert.ok(before(list, 'Dig and pour footings', 'Place and tie reo'), list.join(' | '));
  assert.ok(before(list, 'Lay blocks and bricks', 'Core fill blockwork'), list.join(' | '));
  assert.ok(before(list, 'Core fill blockwork', 'Backfill behind the retaining wall'), list.join(' | '));
  assert.ok(!list.includes('Build the retaining wall'), 'the wall is not "built" before its blocks are laid');
  assert.deepEqual(orderFaults(draft.jobSteps), []);
});

test('run 1: floor wastes, cool rooms, the equipment, then the plumbing fit-off; and the roof plant before the brazing', () => {
  const draft = draftOf(kitchen({ kinds: ['kitchenEquipment', 'plumbingFitOff', 'underslabDrainage', 'coolroomPanels'] }));
  const list = names(draft);
  assert.ok(before(list, 'Set floor wastes, slot drains and floor gutters', 'Erect coolroom panels'), list.join(' | '));
  assert.ok(before(list, 'Erect coolroom panels', 'Deliver and install commercial kitchen equipment'), list.join(' | '));
  assert.ok(before(list, 'Plumbing rough-in', 'Deliver and install commercial kitchen equipment'), list.join(' | '));
  assert.ok(before(list, 'Deliver and install commercial kitchen equipment', 'Plumbing fit-off'), list.join(' | '));
  const roof = names(draftOf({ state: 'nsw', fallRisk: 'yes', crane: 'none', task: 'Install remote refrigeration: condensing units on the roof plant deck, refrigerant pipework brazed with oxy-acetylene, pressure tested with nitrogen, evacuated and charged.', site: site() }));
  assert.ok(before(roof, 'Install plant and equipment on the roof', 'Braze refrigerant pipework'), roof.join(' | '));
  assert.ok(before(roof, 'Braze refrigerant pipework', 'Pressure test with nitrogen'), roof.join(' | '));
});

test('run 2 and run 4: primer before the adhesive, doors sealed before they are hung, and unloading before moving into place', () => {
  const floor = names(draftOf({ state: 'vic', fallRisk: 'no', crane: 'none', task: 'Install sheet vinyl flooring with 100mm coving to all walls. Skim subfloor to sheet vinyl areas. Install commercial carpet tiles by direct stick method.', kinds: ['floorLay', 'floorAdhesive', 'floorLevel'], site: site() }));
  assert.ok(before(floor, 'Apply primers and levelling compounds', 'Apply flooring adhesives'), floor.join(' | '));
  const doors = names(draftOf({ state: 'wa', fallRisk: 'no', crane: 'none', task: 'Seal: paint bottoms of doors before hanging. Install timber doors: fire rated and non-fire rated. Install door hardware to supplied timber doors.', site: site() }));
  assert.ok(before(doors, 'Paint', 'Hang the doors'), doors.join(' | '));
  const unload = names(draftOf({ state: 'wa', fallRisk: 'no', crane: 'none', task: 'Accept delivery, unload with the hiab and move materials into place.', kinds: ['carpLoad', 'loaderCrane'], site: site() }));
  assert.ok(before(unload, 'Unload with the truck loading crane (hiab)', 'Move materials into place'), unload.join(' | '));
});

test('run 6: the pipe is joined and tested, and tied in, before the trench is backfilled and the surface reinstated', () => {
  const list = names(draftOf(main()));
  assert.ok(before(list, 'Lay pipes', 'Join polyethylene pipe by electrofusion'), list.join(' | '));
  assert.ok(before(list, 'Join polyethylene pipe by electrofusion', 'Pressure test and commission'), list.join(' | '));
  assert.ok(before(list, 'Pressure test and commission', 'Backfill the trench'), list.join(' | '));
  assert.ok(before(list, 'Connect to the water supply', 'Backfill the trench'), list.join(' | '));
  assert.ok(before(list, 'Backfill the trench', 'Reinstate asphalt'), list.join(' | '));
});

test('run 5 and run 8: welding after the hoisting, and an own step done from the scissor lift after the fence is built', () => {
  const lift = names(draftOf({ state: 'sa', fallRisk: 'yes', crane: 'none', trade: 'lifts', task: 'Install the lift: set the lift rails, fix the landing doors, and build the lift car and counterweight in the lift shaft. Chain blocks off the lifting beams, rails welded to brackets', kinds: ['liftShaft', 'liftLifting', 'liftInstall', 'steelWeld', 'silicaDrill'], site: site() }));
  assert.ok(before(lift, 'Lift machines, rails and equipment into the shaft', 'Weld steel'), lift.join(' | '));
  const own = { name: 'Fix the barbed wire outriggers from the scissor lift', hazards: ['A fall from the scissor lift.'], controls: ['The scissor lift is used on firm level ground with its gate shut.'] };
  const list = names(draftOf(fence({ ownSteps: [own] })));
  const ownName = list.find((name) => /^Fix the barbed wire outriggers/.test(name));
  assert.ok(before(list, 'Dig post holes', ownName) && before(list, 'Build the fence', ownName), list.join(' | '));
});

test('SiteWrite\'s check flags an order it cannot fix (the user\'s own), with no points', () => {
  const body = bodyOf(wall());
  const draft = prepareDraft({ ...body, stepOrder: ['Before starting', 'Place and tie reo', 'Dig and pour footings'] });
  const result = checkSwms(fromDraft(draft, { state: 'qld' }), { state: 'qld' });
  const flag = result.findings.find((item) => item.rule === 'W17');
  assert.ok(flag && !flag.pass && flag.max === 0 && flag.points === 0, JSON.stringify(flag));
  assert.match(flag.message, /is usually done before/);
  const tidy = checkSwms(fromDraft(draftOf(wall()), { state: 'qld' }), { state: 'qld' });
  assert.ok(!tidy.findings.some((item) => item.rule === 'W17'));
});

// ---- 2. Wrong-context steps and lines ----

test('run 3: a strip footing poured off the chute has no deck, pump or boom lines, and a 1.8 m wall no scaffold', () => {
  const draft = draftOf(wall());
  const all = lines(draft);
  assert.ok(!names(draft).some((name) => /deck|pump|boom/i.test(name)), names(draft).join(' | '));
  assert.ok(!/deck perimeter|Crew on the deck|stays on the deck during the pour|placing booms? are registered/i.test(all));
  assert.ok(!/scaffold ties|heavy duty scaffold|scaffold over 4 m/i.test(all));
  assert.ok(!plantOf(draft).includes('Scaffold'), plantOf(draft).join(' | '));
  assert.equal(draft.scaffoldSupervisor || '', '');
});

test('run 1: an indoor scissor lift has no boom, outrigger, wind or lightning lines; the pallet jack is no forklift and not High', () => {
  const draft = draftOf(kitchen({ plantChoice: { used: ['Ladders', 'Electric power tools and leads', 'Trolley or panel lifter', 'Scissor lift'], notUsed: ['Welder', 'Elevating work platform'], added: [] } }));
  const ewp = draft.jobSteps.find((step) => step.step === 'Use an elevating work platform');
  assert.ok(ewp, names(draft).join(' | '));
  const said = ewp.controls.join('\n');
  assert.ok(!/secondary guarding|boom's pivot point|^Outriggers are set|Outdoors, stop in winds|When lightning|anemometer/m.test(said), said);
  const jack = draftOf({ state: 'nsw', fallRisk: 'no', crane: 'none', task: 'Deliver, handle and move kitchen materials and equipment on site with pallet jacks.', site: site({ access: 'Pallet jacks through the loading dock' }) });
  const step = jack.jobSteps.find((item) => item.step === 'Move loads with a pallet jack or walkie stacker');
  assert.ok(step);
  assert.notEqual(step.risk.after.level, 'High');
  assert.ok(!step.controls.some((line) => /lift people on the forks|warning device/.test(line)));
  assert.ok(!plantOf(jack).includes('Forklift'), plantOf(jack).join(' | '));
  const limits = askedOf({ state: 'nsw', fallRisk: 'no', crane: 'none', task: 'Deliver, handle and move kitchen materials and equipment on site with pallet jacks.', site: site() }, 'loadLimits');
  if (limits) assert.doesNotMatch(limits.prompt, /formwork deck/);
});

test('run 2: heat welding vinyl is laying it with the hot air gun, not a welder or brazing', () => {
  const draft = draftOf({ state: 'vic', fallRisk: 'no', crane: 'none', task: 'Heat weld vinyl joins.', site: site() });
  assert.equal(draft.kind, 'draft');
  assert.deepEqual(names(draft), ['Before starting', 'Lay floor coverings', 'Finish and clean up']);
  assert.match(lines(draft), /hot air gun/);
  assert.ok(!plantOf(draft).includes('Welder'));
  assert.deepEqual(packageKinds('Heat weld vinyl joins.', ['hotWork']), ['floorLay']);
  // A pond liner's seams are not a floor.
  assert.notEqual(draftOf({ state: 'vic', fallRisk: 'no', crane: 'none', task: 'Heat weld the PVC pond liner seams.', site: site() }).kind, 'draft');
});

test('run 6: a trench ladder is no ladder work, electrofusion has no heater plate or hot work permit, and the water main is the authority\'s', () => {
  const draft = draftOf(main());
  const list = names(draft);
  assert.ok(!list.includes('Work from ladders'), list.join(' | '));
  assert.ok(!list.includes('Butt fuse polyethylene pipe'));
  assert.ok(!/heater plate stand|Burns from the heater plate|in its stand when not in use/.test(lines(draft)));
  const w12 = checkSwms(fromDraft(draft, { state: 'tas' }), { state: 'tas' }).findings.find((item) => item.rule === 'W12');
  assert.doesNotMatch(w12.message, /hot work/);
  const shutdown = askedOf(main(), 'serviceShutdown');
  assert.ok(shutdown);
  assert.doesNotMatch(shutdown.prompt, /hospital|patients/);
  assert.ok(!answersFor('serviceShutdown', MAIN).some((item) => /Hospital/.test(item.label)));
  assert.ok(answersFor('serviceShutdown', 'Tie in the medical gas to the live hospital supply').some((item) => /Hospital/.test(item.label)));
  assert.ok(!/Backflow prevention is installed/.test(lines(draft)));
  assert.ok(!draft.jobSteps.some((step) => step.responsible === 'Licensed plumber'), draft.jobSteps.map((step) => `${step.step}: ${step.responsible}`).join(' | '));
});

test('run 5: no outdoor hot work lines in an indoor lift shaft; run 4: no spray painting code for doors sealed by brush', () => {
  const lift = draftOf({ state: 'sa', fallRisk: 'yes', crane: 'none', trade: 'lifts', task: 'Install the lift in the lift shaft. Rails welded to brackets.', kinds: ['liftShaft', 'liftLifting', 'liftInstall', 'steelWeld'], site: site() });
  assert.ok(names(lift).includes('Weld steel'), names(lift).join(' | '));
  assert.ok(!/safety nets|total fire ban|exposed to rain/.test(lines(lift)), lines(lift));
  const doors = draftOf({ state: 'wa', fallRisk: 'no', crane: 'none', task: 'Seal: paint bottoms of doors before hanging. Install timber doors.', site: site() });
  assert.ok(!(doors.sources.codes || []).some((code) => /Spray painting/i.test(code)), JSON.stringify(doors.sources.codes));
  assert.match(lines(doors), /Only the paints and solvents needed for the work are kept in the work area, with lids replaced after each use\.$/m);
  const spray = draftOf({ state: 'wa', fallRisk: 'no', crane: 'none', task: 'Spray paint the doors with an airless sprayer.', site: site() });
  assert.ok((spray.sources.codes || []).some((code) => /Spray painting/i.test(code)));
});

test('run 1: the cool room panel lines print once, and the exhaust canopies bring the hood lines', () => {
  const draft = draftOf(kitchen());
  const count = (re) => draft.jobSteps.flatMap((step) => step.controls).filter((line) => re.test(line)).length;
  assert.equal(count(/^Coolroom panels are stood and fixed in sequence/), 0);
  assert.equal(count(/^Hoods and exhaust ducts are lifted into place/), 1);
});

// ---- 3. Missing work and plant ----

test('run 4: loads slung for unloading with a crane company bring the crane crew step; "No crane" brings none', () => {
  const task = 'Accept delivery, unload, check and handle materials on site, including slinging loads.';
  const company = names(draftOf({ state: 'wa', fallRisk: 'no', crane: 'company', slinging: 'crane', task, site: site() }));
  assert.ok(company.includes('Work with the crane crew during lifts'), company.join(' | '));
  const none = draftOf({ state: 'wa', fallRisk: 'no', crane: 'none', task, site: site() });
  assert.ok(none.kind !== 'draft' || !names(none).some((name) => /crane/i.test(name)));
});

test('run 1: remote refrigeration places the condensing units and runs, brazes, tests and charges the pipe, with the gas type asked', () => {
  const body = bodyOf({ state: 'nsw', fallRisk: 'no', crane: 'none', task: 'Install remote refrigeration.', site: site() });
  const draft = prepareDraft(body);
  const list = names(draft);
  for (const name of ['Receive plant and move it into position', 'Fix plant on its supports', 'Run and fix refrigerant pipe and pair coil', 'Braze refrigerant pipework', 'Pressure test with nitrogen', 'Evacuate and charge the system']) assert.ok(list.includes(name), `${name}: ${list.join(' | ')}`);
  assert.ok(typeItems(draft, body).some((item) => item.type === 'Gases (LPG, acetylene, oxygen)'));
  assert.deepEqual(draft.notCovered, []);
});

test('run 7: a cleaning scope\'s glazing gets the window step, the pool area and roads are named, and floor machines are plant', () => {
  const draft = draftOf(cleaning());
  assert.ok(names(draft).includes('Clean windows and balconies'), names(draft).join(' | '));
  assert.deepEqual(draft.notCovered, ['External pool area', 'Road surface cleaning']);
  assert.ok(plantOf(draft).includes('Floor scrubber or polisher'), plantOf(draft).join(' | '));
});

test('run 8: the petrol cut-off saw and the EWP are plant, "from a ladder" brings the ladder step and the wall top the edge step', () => {
  const draft = draftOf(fence());
  const plant = plantOf(draft);
  assert.ok(plant.includes('Bar cutter or cut-off saw') && plant.includes('Elevating work platform') && plant.includes('Scissor lift'), plant.join(' | '));
  assert.ok(names(draft).includes('Work from ladders'), names(draft).join(' | '));
  assert.ok(names(draft).includes('Work at edges'), names(draft).join(' | '));
  assert.match(draft.task, /retaining wall from the EWP/);
});

// ---- 4. "Not required" ----

test('cleaning chemicals cannot be "Not required" beside "Clean with chemicals"', () => {
  const draft = draftOf(cleaning());
  const need = rules.notUsedNeed('Cleaning chemicals', '', rules.ownWords({ task: CLEAN }), rules.stepWords(draft), '', '', draft);
  assert.match(need, /Clean with chemicals/);
});

test('solvents named only on a condition in the brush washout step take a reason, not a refusal', () => {
  const draft = { jobSteps: [{ step: 'Clean brushes and rollers', hazards: ['Paint washings polluting drains, stormwater or soil.', 'Solvent vapour and skin contact from cleaning solvents.'], controls: ['Clean water-based paint equipment at the washout facility, never in a drain, gutter or on the ground.', 'Wear the gloves the safety data sheet lists when cleaning with solvents, with the area ventilated.'] }] };
  const type = 'Solvents and thinners';
  assert.equal(rules.usedByStep(type, draft).conditional, true);
  // "by others" does not settle it: the crew cleans its own brushes (content8).
  assert.match(rules.notUsedNeed(type, 'supplied and applied by others', '', rules.stepWords(draft), '', '', draft), /Clean brushes and rollers/);
  assert.equal(rules.notUsedNeed(type, 'water based sealer only, washed out in water', '', rules.stepWords(draft), '', '', draft), '');
  assert.match(rules.notUsedNeed(type, '', '', rules.stepWords(draft), '', '', draft), /short reason/);
});

test('a chemset epoxy anchor adhesive is the epoxy, asked for once', () => {
  const sds = 'chemset epoxy anchor adhesive for the gate posts';
  assert.equal(rules.namedIn('Adhesives', sds), '');
  assert.ok(rules.namedIn('Epoxy, resins and two-part products', sds));
  assert.equal(rules.sdsConflict('Adhesives', `The products used are ${sds}.`), '');
  const found = rules.SUBSTANCES.filter(([, pattern]) => pattern.test(sds)).map(([type]) => type);
  assert.deepEqual(found, ['Epoxy, resins and two-part products']);
});

test('the example reason fits a real "Not required" for each type, never "supplied and applied by others"', () => {
  for (const type of rules.TYPES) assert.doesNotMatch(rules.reasonExample(type), /by others/);
  assert.match(rules.reasonExample(rules.SILICA), /no cutting, drilling or grinding/);
  const message = rules.notUsedNeed('Fuels (diesel, petrol)', '', 'petrol generator', '');
  assert.match(message, /battery and electric plant only/);
  for (const file of ['substances.js', 'project-go.js', 'substance-rules.js']) {
    const page = fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');
    assert.doesNotMatch(page, /for example "supplied and applied by others"/, file);
  }
});

// ---- 5. Unticked plant ----

test('unticked plant takes every line that names only it: the nail gun, the placing boom and the scaffold', () => {
  const doors = (choice) => draftOf({ state: 'wa', fallRisk: 'no', crane: 'none', task: 'Hang timber doors and fit the skirting and architraves.', site: site(), plantChoice: choice });
  const kept = lines(doors(undefined));
  assert.match(kept, /Nails or fragments fired into a person|Nail guns/);
  const gone = lines(doors({ used: ['Electric power tools and leads'], notUsed: ['Nail gun'], added: [] }));
  assert.doesNotMatch(gone, /Nails or fragments fired|Glue instead of nailing|Air hoses for nail guns|^Nail guns/m);
  assert.match(lines(draftOf(wall())), /A concrete placing boom strikes a person/);
  const boom = draftOf(wall({ plantChoice: { used: ['Excavator', 'Concrete truck'], notUsed: ['Concrete placing boom', 'Scaffold'], added: [] } }));
  assert.doesNotMatch(lines(boom), /A concrete placing boom strikes a person|Never stand under a working boom/);
});

// ---- 6. Products in the right step ----

test('fuel goes with the digging, an adhesive not with "Use power tools", and a product the user\'s own step names goes there', () => {
  const steps = [{ step: 'Excavate and set out the retaining wall', hazards: [], controls: [] }, { step: 'Place and tie reo', hazards: [], controls: [] }];
  assert.equal(rules.matchStep('Fuels (diesel, petrol)', steps), 'Excavate and set out the retaining wall');
  const power = [{ step: 'Use power tools', hazards: ['Cuts.'], controls: ['Glue instead of nailing where the fixing specification allows.'] }, { step: 'Hang the doors', hazards: [], controls: [] }];
  assert.equal(rules.matchStep('Adhesives', power), '');
  const own = [{ step: 'Build the fence', hazards: [], controls: [] }, { step: 'Fix the gate posts with chemset anchors (Our own step)', own: true, hazards: [], controls: ['Cold gal is brushed on the cut ends.'] }];
  assert.equal(rules.matchStep('Epoxy, resins and two-part products', own), 'Fix the gate posts with chemset anchors (Our own step)');
  assert.equal(rules.matchStep('Paints and coatings', own), '');
});

// ---- 7. Plant: an own item that runs off the generator ----

test('run 6: an own item "off the generator" does not take the library generator off the list', () => {
  const draft = draftOf(main({ plantChoice: { used: ['Excavator', 'Generator', 'Concrete saw'], notUsed: [], added: [{ item: 'Electrofusion control box (240V, off the generator)' }] } }));
  const plant = (draft.plant || []).map((item) => item.item);
  assert.ok(plant.includes('Generator'), plant.join(' | '));
  assert.ok(plant.includes('Electrofusion control box (240V, off the generator)'));
});

// ---- 8. Minor ----

test('a private operator\'s hospital with no emergency department comes after the public emergency department', async () => {
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';
  const at = (latitude, longitude) => ({ latitude, longitude });
  const place = (id, text, location) => ({ id, displayName: { text }, formattedAddress: 'Hobart TAS, Australia', location, primaryType: 'hospital' });
  const reply = (body) => ({ ok: true, json: async () => body });
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    if (url.endsWith(':searchText') && body.pageSize === 1) return reply({ places: [{ location: at(-42.857, 147.297) }] });
    if (url.endsWith(':searchText') && body.textQuery === 'public hospital emergency department') return reply({ places: [place('r', 'Royal Hobart Hospital', at(-42.881, 147.329))] });
    if (url.endsWith(':searchText') && body.textQuery === 'hospital emergency department') return reply({ places: [place('c', 'Calvary Lenah Valley Hospital', at(-42.869, 147.290)), place('r', 'Royal Hobart Hospital', at(-42.881, 147.329))] });
    return reply({ places: [] });
  };
  const result = await places.nearbyCare('120 Main Road, Moonah TAS 7009', { fetchImpl });
  assert.equal(result.hospitals[0].name, 'Royal Hobart Hospital');
  assert.ok(!places.PRIVATE_NAME.test('Calvary Mater Newcastle'));
  delete process.env.GOOGLE_PLACES_API_KEY;
});

test('"blok" and "wal" are fixed in the task line; "Wal" as a name is kept', () => {
  assert.equal(fixSpelling('besser blok retaning wall').text, 'besser block retaining wall');
  assert.equal(fixSpelling('the top of the 3m retaining wal').text, 'the top of the 3m retaining wall');
  assert.equal(fixSpelling('ask Wal at the gate').text, 'ask Wal at the gate');
  assert.match(draftOf(wall()).task, /besser block retaining wall/);
});

test('every step name the stage map names is a library step or one of its printed names', () => {
  const library = new Set(ACTIVITIES.flatMap((activity) => activity.steps.map((step) => step.step)));
  const src = fs.readFileSync(path.join(__dirname, '..', 'activities.js'), 'utf8');
  const printed = new Set([...src.matchAll(/[?:] '([^']+)'/g)].map((m) => m[1]));
  const unknown = Object.keys(BY_NAME).filter((name) => !library.has(name) && !printed.has(name) && !['Before starting', 'Finish and clean up', 'Load reo onto the deck', 'Set up the concrete pump', 'Lift and land steel with the crane', 'Dig and pour'].includes(name));
  assert.deepEqual(unknown, []);
});

test('run 8: chemset anchors in the existing slab are drilled, with the library\'s drilling step (coordinator item from flow10)', () => {
  const draft = draftOf(fence());
  assert.ok(names(draft).includes('Drill or cut concrete, masonry or stone'), names(draft).join(' | '));
  assert.ok(!(draft.notCovered || []).some((part) => /chemset/i.test(part)), JSON.stringify(draft.notCovered));
  const plain = draftOf({ state: 'nt', fallRisk: 'no', crane: 'none', task: 'Install handrail posts on the existing slab with chemset anchors.', site: site() });
  assert.ok(names(plain).includes('Drill or cut concrete, masonry or stone'), names(plain).join(' | '));
  // Anchors cast into a new pour are not drilled.
  const cast = draftOf({ state: 'nt', fallRisk: 'no', crane: 'none', task: 'Set the cast-in anchors before the slab is poured.', site: site() });
  assert.ok(!(cast.jobSteps || []).some((step) => step.step === 'Drill or cut concrete, masonry or stone'));
});
