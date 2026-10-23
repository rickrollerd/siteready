// Content faults found by the messy-user test, round 17 (staging runs 1 to 8, 23 October 2026, on main 4741220): wrong-context
// groups and steps; wrong-context lines, licences and plant; the trench depth contradiction; work neither stepped nor listed;
// false items in the work with no job steps; SiteWrite's own order; W17 silent or partial; own steps placed where added;
// ratings; hold points; products and substances.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { prepareDraft, questionsFor, packageKinds, suggestedKinds } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { checkSwms, fromDraft } = require('../builder-check');
const { firmFaults, inStageOrder } = require('../step-stages');
const { plantFor } = require('../register');
const { tableRows } = require('../designs');
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
const draftOf = (input, given) => prepareDraft(bodyOf(input, given));
const names = (draft) => draft.jobSteps.map((step) => step.step);
const lines = (draft) => draft.jobSteps.flatMap((step) => [...step.hazards, ...step.controls]).join('\n');
const stepNamed = (draft, name) => draft.jobSteps.find((step) => step.step === name);
const before = (list, a, b) => list.indexOf(a) >= 0 && list.indexOf(b) >= 0 && list.indexOf(a) < list.indexOf(b);
const asSteps = (list) => list.map((step) => (typeof step === 'string' ? { step, hazards: [], controls: [] } : step));
const checked = (draft, state) => checkSwms(fromDraft(draft, { state, swms: { signatures: [{ name: 'Jo Smith', date: '1 October 2026' }] } }), { state });
const finding = (draft, state, rule) => checked(draft, state).findings.find((item) => item.rule === rule);
const firm = (list) => firmFaults(asSteps(list));
const flagged = (list, step, after) => firm(list).some((item) => item.step === step && item.after === after);

// The runs' own words.
const CCTV = { state: 'qld', fallRisk: 'yes', crane: 'company', slinging: 'crane', task: 'CCTV: fix 24 cameras in the car park and lobby, on the facades and at the roof edges from a boom lift; stand 4 camera poles on their footings in the car park with a hired crane truck and its operator; fit the pole enclosures and surge protection; run the camera cables through the ceiling space from a platform ladder.' };
const RAIL = { state: 'sa', fallRisk: 'no', crane: 'company', task: 'Resleeper and rerail 400 m of the Outer Harbor line between Woodville and Cheltenham in a 52 hour possession. Dig out old timber sleepers with a hi-rail excavator and sleeper changer, lay new concrete sleepers, new rail unloaded off the supplier\'s hiab truck at the level crossing, cut rail with a rail saw, aluminothermic welds, ballast top up from hi-rail wagons, then tamp and regulate. Protection officer supplied by the rail operator.' };
const JOINERY = { state: 'tas', fallRisk: 'no', crane: 'none', task: 'Shop draw, fabricate, supply, deliver, install and certify all front of house joinery items: Front of house bathroom joinery. Main bar structure and finishes. Library shelving, cabinet and wall finishes. Restaurant servery areas. Restaurant waiter stations. Private dining cladding to frame and glazing. Day spa front desk and display unit. All materials handling will be by the Subcontractor. Provide all trade specific handling equipment for movement and installation of their work. Final clean including the removal of plastic coatings from equipment and benches to be coordinated with the Contractor.' };
const BRIDGE = { state: 'act', fallRisk: 'yes', crane: 'company', slinging: 'crane', task: 'replace the timbr deck n handrails on the pedestrain bridge over the lake at emu bank. pull up old deck boards, cut out rotten stringers, crane in 2 new steel beams (50t crane from the crane hire mob), jackhammer the old abutment capping, form n pour new capping beam, new deck n handrails. work over the water off a barge n from the bank' };
const TREES = { state: 'nt', fallRisk: 'no', crane: 'own', task: 'Advanced tree planting: excavate the tree pit next to the road, lift the large root ball trees in with a crane truck, plant and stake the trees. 6 x 200L trees in the carpark gardens along temple tce, our hiab truck, bobcat with an auger for the pits, irigation drip line to each tree and mulch. Shoppers walk past the carpark gardens' };
const TREE_CHART = { craneChart: 'Hiab XS 144 vehicle loading crane, 10.5 metre-tonnes, rated 1.2 t at 8 m radius from its load chart; heaviest tree 0.9 t at 7 m.', groundBearing: 'The principal contractor confirmed by email the car park pavement takes the outrigger loads. Outriggers on 600 mm steel pads.' };
const EXCAVATION = { state: 'vic', fallRisk: 'no', crane: 'none', task: 'Install, maintain and remove shake out pit at site entrance gate and reinstate the area. Excavate site. Backfill and compact. Remove soft spots and replace with select granular fill. Cart away and dump excavated fill off site. Grade and compact subgrade. Water spray excavations for dust suppression. Hand trim sides and bottoms of excavations and hand backfill and compact. Install, maintain and remove sediment and erosion controls. Clear boulders, vegetation and obstructions, remove from site and make good. Excavate, grade, backfill and compact for concrete works. Install underground stormwater pipes and pits. Roadsaw existing asphalt.' };
const CIVIL_CONCRETE = { state: 'vic', fallRisk: 'no', crane: 'none', task: 'Install and remove formwork. Fix steel reinforcement. Install dowels and expansion joints. Pump concrete. Place and finish concrete.' };
const POOL_PLANT = { state: 'wa', fallRisk: 'no', crane: 'own', task: 'Install swimming pool filtration system. Install chemical controller and dosing equipment. Install water feature filtration systems. Install movement and isolation joints and mounts to pipework and plant. Install acoustic treatment to pool plant and equipment. Install robotic commercial pool cleaner system. Pumps and filters lifted into the plant room off the hiab truck.' };
const POOL_CHART = { craneChart: 'Hiab XS 144 vehicle loading crane, rated 1.2 t at 8 m radius from its load chart; heaviest pump skid 0.4 t at 6 m.', groundBearing: 'The builder\'s engineer confirmed the driveway slab carries the outrigger loads (letter GE-04). Outriggers on 600 mm steel pads.' };
const POOL_FINISHES = { state: 'wa', fallRisk: 'no', crane: 'none', task: 'Clean, grind and prepare concrete pool surface. Apply pool shell waterproofing. Skim coat and screed pool surface. Apply pebble aggregate finish to pool and water features. Install tiles: wet deck, waterline and water feature edges and grout. Install pool copings and nosings including to negative edges. Install wet deck stone grating. Install waterproof joints and caulking at coping and concourse.' };

// ---- 1. Wrong-context groups and steps ----

test('B run 7: "Formwork and falsework" for a bridge capping beam gives the side form step, no deck steps, deck questions or forklift', () => {
  const draft = draftOf({ ...BRIDGE, kinds: ['craneInterface', 'concrete', 'marinePlant', 'deckBuild', 'water', 'formwork'] });
  const list = names(draft);
  assert.ok(list.includes('Stand and brace wall and column forms'), list.join(' | '));
  for (const name of ['Erect falsework and shores', 'Lay the formwork deck', 'Load ply onto the deck while it is being laid', 'Form penetrations and voids', 'Install backprops']) assert.ok(!list.includes(name), name);
  const asked = (questionsFor(bodyOf({ ...BRIDGE, kinds: ['craneInterface', 'concrete', 'formwork', 'water'] })).required || []).map((item) => item.id);
  assert.ok(!asked.includes('deckMethod') && !asked.includes('loadLimits'), asked.join(', '));
  assert.ok(!draft.plant.some((item) => /forklift|telehandler/i.test(item.item)), draft.plant.map((item) => item.item).join(' | '));
  // The task's own words form the capping beam the same way, with no jackhammer read as jacking; a suspended slab keeps its deck.
  assert.ok(suggestedKinds('Form and pour new capping beam on the abutment.', {}, {}).includes('formVertical'));
  assert.ok(!suggestedKinds('Form and pour new capping beam on the abutment.', {}, {}).includes('formwork'));
  assert.ok(names(draftOf({ state: 'act', fallRisk: 'yes', crane: 'none', task: 'Form, reo and pour the level 2 suspended slab.', kinds: ['formwork', 'reo', 'concrete'] })).includes('Lay the formwork deck'));
});

test('B run 8: augered tree pits with a drip line keep the tree pit steps, not pipes, pits, work in the trench or a trench over 1.5 m', () => {
  const draft = draftOf(TREES, TREE_CHART);
  const list = names(draft);
  for (const name of ['Lay pipes', 'Install pits', 'Work in the trench']) assert.ok(!list.includes(name), list.join(' | '));
  assert.ok(list.includes('Backfill the tree pits') && list.includes('Locate underground services'), list.join(' | '));
  assert.ok(!draft.highRisk.some((label) => /trench/i.test(label)), draft.highRisk.join(' | '));
  // The trench group's warning when it is unticked names the services as well.
  assert.match(fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8'), /trench: 'The work involves digging or a trench\. Make sure underground services are located before digging/);
});

test('B run 6: a joiner\'s final clean and glazing words tick no cleaning or window cleaning steps, and are not listed', () => {
  const draft = draftOf(JOINERY);
  const list = names(draft);
  for (const name of ['Clean with chemicals', 'Clean windows and balconies', 'Clean floors, fixtures and plant rooms']) assert.ok(!list.includes(name), list.join(' | '));
  assert.ok(!draft.notCovered.some((part) => /final clean/i.test(part)), JSON.stringify(draft.notCovered));
  // A cleaning contractor's final clean is still cleaning.
  assert.ok(suggestedKinds('Final clean of the apartments before handover: floors, kitchens and bathrooms.', {}, {}).includes('cleaning'));
});

test('A run 3: a crane company\'s crane truck that stands poles ticks the crane crew step, not the hiab unloading step; a hiab that unloads keeps it', () => {
  const list = names(draftOf(CCTV));
  assert.ok(!list.includes('Unload with the truck loading crane (hiab)'), list.join(' | '));
  assert.ok(list.includes('Work with the crane crew during lifts'), list.join(' | '));
  assert.ok(names(draftOf(RAIL)).includes('Unload with the truck loading crane (hiab)'));
});

// ---- 2. Wrong-context lines, licences and plant ----

test('A run 2: a road saw on asphalt prints no overhead, inverted, through-wall or basement petrol saw lines; a wall saw keeps them', () => {
  const road = stepNamed(draftOf({ ...EXCAVATION, kinds: ['sawCut', 'earthworks', 'trench'] }), 'Saw cut concrete');
  assert.ok(road);
  assert.doesNotMatch(road.controls.join('\n'), /above shoulder height|Inverted cutting|cutting through a wall|basement car parks/);
  const wall = stepNamed(draftOf({ state: 'nsw', fallRisk: 'no', crane: 'none', task: 'Saw cut a new door opening through the concrete wall in the basement.', kinds: ['sawCut'] }), 'Saw cut concrete');
  assert.match(wall.controls.join('\n'), /cutting through a wall/);
});

test('A run 2: an unticked mulcher takes its lines and the chainsaw and mulcher noise line; tree felling lines only where trees are named', () => {
  const draft = draftOf({ ...EXCAVATION, kinds: ['vegClearing', 'earthworks'], plantChoice: { used: [], notUsed: ['Mulcher'], added: [] } });
  const step = draft.jobSteps.find((item) => /mulcher/.test(item.step));
  assert.ok(step, names(draft).join(' | '));
  assert.doesNotMatch([...step.hazards, ...step.controls].join('\n'), /mulcher|Large trees are felled|Trees fall on plant/i);
  const trees = draftOf({ state: 'vic', fallRisk: 'no', crane: 'none', task: 'Clear vegetation and fell the trees along the creek with the mulcher and excavator.', kinds: ['vegClearing'] });
  assert.match(lines(trees), /Large trees are felled/);
});

test('A run 2: slabs on ground print no vertical pump line, and a lifting gear unticked with No crane brings no dogging licence', () => {
  assert.doesNotMatch(lines(draftOf({ ...CIVIL_CONCRETE, kinds: ['slabGround', 'slabPour', 'concrete'] })), /Vertical pipelines are positively secured/);
  assert.match(lines(draftOf({ state: 'vic', fallRisk: 'no', crane: 'none', task: 'Pump and place the level 3 slab concrete.', kinds: ['concrete'] })), /Vertical pipelines are positively secured/);
  const plantChoice = { used: ['Excavator'], notUsed: ['Lifting gear (slings, chains, shackles)'], added: [] };
  const draft = draftOf({ ...EXCAVATION, plantChoice });
  assert.ok(!draft.qualifications.some((name) => /dogging or rigging/.test(name)), draft.qualifications.join(' | '));
});

test('A run 2: kerbs with no road named print no traffic or kerb machine lines, and the check does not force the roadway category', () => {
  const draft = draftOf({ ...CIVIL_CONCRETE, kinds: ['slabGround', 'slabPour', 'concrete', 'kerbInstall'] });
  const kerb = stepNamed(draft, 'Form and pour the kerb and channel');
  assert.ok(kerb, names(draft).join(' | '));
  assert.doesNotMatch([...kerb.hazards, ...kerb.controls].join('\n'), /traffic management|kerb machine|extruding|traffic/i);
  const h1 = finding(draft, 'vic', 'H1');
  assert.ok(!h1 || !/roadways/i.test(h1.message || ''), h1 && h1.message);
  const road = stepNamed(draftOf({ state: 'vic', fallRisk: 'no', crane: 'none', task: 'Extrude the new kerb and channel along Smith Road with the kerb machine.', kinds: ['kerbInstall'] }), 'Form and pour the kerb and channel');
  assert.match(road.controls.join('\n'), /traffic management/);
  assert.match(road.controls.join('\n'), /kerb machine/);
});

test('A run 3: CCTV poles on existing footings and the device step print no dig, footing hole, repeated pole or 15 kN lines, no excavation code and no low voltage rescue with live work No', () => {
  const draft = draftOf(CCTV);
  const poles = stepNamed(draft, 'Stand and fix the poles');
  assert.doesNotMatch([...poles.hazards, ...poles.controls].join('\n'), /Footings are bored|open footing hole|footings are bored or excavated/i);
  const devices = stepNamed(draft, 'Install security devices');
  assert.doesNotMatch(devices.controls.join('\n'), /Poles are lifted|Pole footings are dug|15 kN/);
  assert.ok(!draft.sources.codes.some((title) => /Excavation/.test(title)), draft.sources.codes.join(' | '));
  assert.ok(!draft.emergency.some((row) => /Electric shock/.test(row.type)), draft.emergency.map((row) => row.type).join(' | '));
  // New poles keep the footing lines.
  assert.match(lines(draftOf({ ...CCTV, task: 'Dig footings and stand 4 new camera poles in the car park with a hired crane truck.' })), /Footings are bored or excavated by machine/);
});

test('A run 3: the boom lift fall answer has no steel wording unless the work is steel', () => {
  assert.doesNotMatch(answersFor('fallControl', CCTV.task).find((item) => item.label === 'Boom lifts').text, /steel|Connections/);
  assert.match(answersFor('fallControl', 'Erect the structural steel portal frames.').find((item) => item.label === 'Boom lifts').text, /No one climbs the steel/);
});

test('B run 5: a rail job prints no disc sander or loose stone lines, and a thermit weld lists no electric welder', () => {
  const text = lines(draftOf(RAIL));
  assert.doesNotMatch(text, /disc sander|loose stone/);
  assert.ok(!plantFor('Aluminothermic weld the rail joints. Welds are made under the hot work permit.').some((item) => item.item === 'Welder'));
  assert.ok(plantFor('MIG weld the brackets to the steel frame.').some((item) => item.item === 'Welder'));
  // A resealed road keeps the loose stone line.
  assert.match(lines(draftOf({ state: 'sa', fallRisk: 'no', crane: 'none', task: 'Spray seal the road with bitumen and aggregate under traffic control.' })), /loose stone/);
});

test('B run 6: joinery prints no plasterboard sheet, stud or hoist landing lines in "Move materials into place"', () => {
  const step = stepNamed(draftOf(JOINERY), 'Move materials into place');
  assert.ok(step);
  assert.doesNotMatch([...step.hazards, ...step.controls].join('\n'), /sheets, studs|Wind catches large sheets|hoist landing gates|balconies and at hoist landings/);
});

test('B run 7: a capping beam pour gets no power trowel, concrete saw, penetration cover or deck access lines, and W13 asks no scaffold tag over water', () => {
  const draft = draftOf(BRIDGE);
  assert.doesNotMatch(lines(draft), /power trowels with guards|Concrete saws have their blade guards|Penetration covers stay firmly fixed|Workers reach the deck by a stair tower/);
  assert.ok(!draft.plant.some((item) => /Power trowel|Concrete saw/.test(item.item)), draft.plant.map((item) => item.item).join(' | '));
  const w13 = finding(draft, 'act', 'W13');
  assert.ok(!w13 || !/scaffold tag/.test(w13.message), w13 && w13.message);
  // A slab keeps the trowel.
  assert.match(lines(draftOf({ state: 'act', fallRisk: 'no', crane: 'none', task: 'Pour and power trowel the ground slab.', kinds: ['slabGround', 'slabPour', 'concrete'] })), /power trowel/i);
});

// ---- 3. The trench lines ----

test('A run 2: a trench listed as high risk work over 1.5 m is not said to be kept shallower than 1.5 m, and a depth given once for the project counts', () => {
  for (const extra of [{}, { site: { ground: 'Clay. Trenches upto 1.8m.' }, siteShared: true }]) {
    const draft = draftOf({ ...EXCAVATION, ...extra });
    assert.ok(draft.highRisk.some((label) => /trench/i.test(label)), draft.highRisk.join(' | '));
    assert.doesNotMatch(lines(draft), /kept shallower than 1\.5 m/);
  }
  assert.match(lines(draftOf({ ...EXCAVATION, site: { ground: 'Clay. Trenches upto 1.8m.' }, siteShared: true })), /A trench 1\.5 m deep or more has all sides supported/);
});

// ---- 4. Missing work, stepped or listed ----

test('A run 1: tile laying from a scope reading ticks tile cutting too', () => {
  assert.ok(packageKinds('Lay balcony floor tiles.', ['tileMix', 'tileLay', 'tileEdge']).includes('tileCut'));
  assert.ok(!packageKinds('Seal the grout lines.', ['tileGrout']).includes('tileCut'));
});

test('B runs 5, 7 and 8: rail cutting, landing the steel beams and the drip line are listed; the capping beam forms are stepped', () => {
  assert.ok(draftOf(RAIL).notCovered.some((part) => /cut rail with a rail saw/i.test(part)));
  const bridge = draftOf(BRIDGE);
  assert.ok(bridge.notCovered.some((part) => /steel beams/i.test(part)), JSON.stringify(bridge.notCovered));
  assert.ok(names(bridge).includes('Stand and brace wall and column forms'), names(bridge).join(' | '));
  assert.ok(draftOf(TREES, TREE_CHART).notCovered.some((part) => /drip line/i.test(part)));
});

test('A run 4: waterproofing in the task with its steps unticked by hand is listed', () => {
  const kinds = suggestedKinds(POOL_FINISHES.task, {}, {});
  const off = kinds.filter((id) => /^wp/.test(id));
  assert.ok(off.length, kinds.join(', '));
  const draft = draftOf({ ...POOL_FINISHES, kinds: kinds.filter((id) => !off.includes(id)), kindsOff: off });
  assert.ok(draft.notCovered.some((part) => /waterproofing/i.test(part)), JSON.stringify(draft.notCovered));
  assert.ok(!draftOf({ ...POOL_FINISHES, kinds }).notCovered.some((part) => /waterproofing/i.test(part)));
});

// ---- 5. False items in the work with no job steps ----

test('A run 3 and B run 6: a place fragment of a retyped task and "installation of their work" are not listed', () => {
  assert.ok(!draftOf(CCTV).notCovered.some((part) => /^on the facades/i.test(part)), JSON.stringify(draftOf(CCTV).notCovered));
  assert.ok(!draftOf(JOINERY).notCovered.some((part) => /their work/i.test(part)), JSON.stringify(draftOf(JOINERY).notCovered));
});

// ---- 6 and 7. SiteWrite's own order, and W17 ----

test('SiteWrite\'s own order: timbers and break-out before the pour, the barge first, the hiab before the rail, the bed trimmed before the pipes, curing after the pours and before the joints are sawn, the crane crew before the poles, cutting after the screed', () => {
  const bridge = names(draftOf({ ...BRIDGE, kinds: ['craneInterface', 'concrete', 'marinePlant', 'deckBuild', 'water', 'silicaDrill'] }));
  assert.ok(before(bridge, 'Remove and replace the decking', 'Pump and place concrete') || before(bridge, 'Remove and replace damaged timbers', 'Pump and place concrete'), bridge.join(' | '));
  assert.ok(before(bridge, 'Drill or cut concrete, masonry or stone', 'Pump and place concrete'), bridge.join(' | '));
  assert.ok(bridge.indexOf('Work from the barge or marine plant') < 5, bridge.join(' | '));
  assert.ok(before(names(draftOf(RAIL)), 'Unload with the truck loading crane (hiab)', 'Replace the sleepers and ballast'));
  const dig = names(draftOf({ ...EXCAVATION, kinds: ['earthworks', 'trench', 'handTrim'] }));
  assert.ok(before(dig, 'Trim and compact the base by hand', 'Lay pipes'), dig.join(' | '));
  const cured = names(draftOf({ ...CIVIL_CONCRETE, kinds: ['slabGround', 'slabPour', 'concrete', 'kerbInstall'] }));
  assert.ok(before(cured, 'Form and pour the kerb and channel', 'Cure the concrete') && before(cured, 'Finish the concrete', 'Cure the concrete'), cured.join(' | '));
  assert.ok(before(inStageOrder(asSteps(['Before starting', 'Pump and place concrete', 'Finish the concrete', 'Saw cut the joints', 'Cure the concrete', 'Finish and clean up'])).map((step) => step.step), 'Cure the concrete', 'Saw cut the joints'));
  assert.ok(before(names(draftOf(CCTV)), 'Work with the crane crew during lifts', 'Stand and fix the poles'));
  const tiles = inStageOrder(asSteps(['Before starting', 'Cut tiles and stone', 'Lay the screed', 'Mix and spread the tile adhesive', 'Lay tiles', 'Grout the tiles', 'Finish and clean up'])).map((step) => step.step);
  assert.ok(before(tiles, 'Lay the screed', 'Cut tiles and stone') && before(tiles, 'Cut tiles and stone', 'Lay tiles'), tiles.join(' | '));
});

test('W17: the hiab unload, traffic set-up and corridor named when the sleepers move up; Plant moved above the traffic and the dig; own welds above the rail', () => {
  const rail = ['Before starting', 'Replace the sleepers and ballast', 'Work in the rail corridor', 'Set up traffic management', 'Unload with the truck loading crane (hiab)', 'Finish and clean up'];
  for (const step of ['Work in the rail corridor', 'Set up traffic management', 'Unload with the truck loading crane (hiab)']) assert.ok(flagged(rail, step, 'Replace the sleepers and ballast'), step);
  const trees = ['Before starting', 'Plant', 'Set up traffic management', 'Unload with the truck loading crane (hiab)', 'Operate small earthmoving plant', 'Excavate', 'Finish and clean up'];
  for (const step of ['Set up traffic management', 'Unload with the truck loading crane (hiab)', 'Operate small earthmoving plant']) assert.ok(flagged(trees, step, 'Plant'), step);
  const weld = ['Before starting', 'Aluminothermic weld the rail joints (Our own step)', 'Work in the rail corridor', 'Replace the sleepers and ballast', 'Finish and clean up'];
  assert.ok(flagged(weld, 'Work in the rail corridor', 'Aluminothermic weld the rail joints (Our own step)'));
  assert.ok(flagged(['Before starting', 'Stand and fix the poles', 'Work with the crane crew during lifts', 'Finish and clean up'], 'Work with the crane crew during lifts', 'Stand and fix the poles'));
  assert.ok(flagged(['Before starting', 'Lay pipes', 'Trim and compact the base by hand', 'Finish and clean up'], 'Trim and compact the base by hand', 'Lay pipes'));
  // SiteWrite's own drafts of these runs raise no W17.
  for (const [input, given] of [[RAIL], [TREES, TREE_CHART], [CCTV], [BRIDGE], [{ ...EXCAVATION, kinds: ['earthworks', 'trench', 'handTrim'] }]]) assert.deepEqual(firmFaults(draftOf(input, given).jobSteps), [], input.task.slice(0, 40));
});

// ---- 8. Own steps placed by their words ----

test('Own steps: a step done "b4 pour", forms and old concrete broken out go before the pour, and W17 flags them after it', () => {
  const own = (name) => ({ name, hazards: ['Silica dust.'], controls: ['Wet methods and P2 masks.'] });
  const slab = names(draftOf({ ...CIVIL_CONCRETE, kinds: ['slabGround', 'slabPour', 'concrete'], ownSteps: [own('drill n epoxy dowels into existing slab edge, fit expansion joint foam b4 pour')] }));
  const dowels = slab.find((name) => /dowels/.test(name));
  assert.ok(before(slab, dowels, 'Pump and place concrete'), slab.join(' | '));
  assert.ok(flagged(['Before starting', 'Pump and place concrete', dowels, 'Finish and clean up'], dowels, 'Pump and place concrete'));
  const bridge = names(draftOf({ ...BRIDGE, ownSteps: [own('Jackhammer the old abutment capping'), own('Form up the new capping beam on the abutment')] }));
  for (const name of ['Jackhammer the old abutment capping (Our own step)', 'Form up the new capping beam on the abutment (Our own step)']) {
    assert.ok(before(bridge, name, 'Pump and place concrete'), bridge.join(' | '));
    assert.ok(flagged(['Before starting', 'Pump and place concrete', name, 'Finish and clean up'], name, 'Pump and place concrete'), name);
  }
});

// ---- 9. Ratings ----

test('SiteWrite\'s own steps are not High after their own controls: sleepers in a possession, rescue equipment over water, pool plant and dosing', () => {
  assert.notEqual(stepNamed(draftOf(RAIL), 'Replace the sleepers and ballast').risk.after.level, 'High');
  const bridge = stepNamed(draftOf(BRIDGE), 'Set up rescue equipment');
  assert.notEqual(bridge.risk.after.level, 'High');
  assert.ok((bridge.seeAlso || []).includes('Work over the water'), JSON.stringify(bridge.seeAlso));
  const pool = draftOf({ ...POOL_PLANT }, POOL_CHART);
  for (const name of ['Install the pool plant', 'Install the chemical dosing']) assert.notEqual(stepNamed(pool, name).risk.after.level, 'High', name);
});

// ---- 10. Hold points ----

test('A formwork design not issued for a pour-only crew: the table says no step is held, the page says only forming steps are, and an own forming step naming it is held', () => {
  const pour = draftOf({ ...CIVIL_CONCRETE, kinds: ['concrete'], designs: [{ id: 'formwork', status: 'notIssued' }] });
  const row = tableRows(pour).find((cells) => cells[0] === 'Formwork design');
  assert.match(row[4], /Worked to in: Pump and place concrete\. No step is held\./);
  assert.doesNotMatch(lines(pour), /Hold point/);
  for (const file of ['../public/app.js', '../public/project-go.js']) assert.doesNotMatch(fs.readFileSync(path.join(__dirname, file), 'utf8'), /'The answer above prints as a hold point/);
  const own = { name: 'Form up the new capping beam on the abutment', hazards: ['Falls into the water.'], controls: ['Forms are built to the formwork design and braced before the pour.'] };
  const bridge = draftOf({ ...BRIDGE, ownSteps: [own], designs: [{ id: 'formwork', status: 'notIssued' }] });
  const step = stepNamed(bridge, 'Form up the new capping beam on the abutment (Our own step)');
  assert.match(step.controls[0], /^Hold point: the formwork design is not issued yet/);
  assert.ok(bridge.designs.find((item) => item.id === 'formwork').steps.includes(step.step));
});

// ---- 11. Products and substances ----

test('Products: an SDS answer with "n" and plain concrete makes both products; a refused answer makes none on the project page', () => {
  const made = rules.sdsProducts('concrete, form oil n curing compound');
  // Form oil and curing compound are two products of one type, each its own row (sl14, messy round 17 SiteLink).
  assert.deepEqual(made.map((row) => row.type).sort(), ['Cement, concrete, grout and mortar', 'Curing compounds and form release agents', 'Curing compounds and form release agents']);
  assert.deepEqual(made.map((row) => row.product.toLowerCase()).sort(), ['concrete', 'curing compound', 'form oil']);
  assert.match(fs.readFileSync(path.join(__dirname, '../public/project-go.js'), 'utf8'), /entry\.id === 'safetyDataSheet'\)\) return body;/);
});

test('Products go to the step that uses them: curing compound to curing, pool chlorine to dosing, old concrete off the timber step, diesel off the hiab, adhesive to the joinery; potting mix asked beside the Legionella line', () => {
  const st = (list) => list.map((step) => ({ step, hazards: [], controls: [] }));
  assert.equal(rules.stepOf({ type: 'Curing compounds and form release agents', product: 'Curing compound' }, st(['Form and pour the kerb and channel', 'Finish the concrete', 'Cure the concrete'])), 'Cure the concrete');
  assert.equal(rules.stepOf({ type: 'Pool and water treatment chemicals', product: 'Pool chlorine' }, st(['Acid wash the pebble finish', 'Install the chemical dosing'])), 'Install the chemical dosing');
  const silica = rules.TYPES.find((type) => /silica/i.test(type));
  assert.notEqual(rules.stepOf({ type: silica, product: 'Old capping concrete' }, st(['Remove and replace damaged timbers', 'Drill or cut concrete, masonry or stone'])), 'Remove and replace damaged timbers');
  assert.equal(rules.matchStep('Fuels (diesel, petrol)', draftOf(RAIL).jobSteps), 'Replace the sleepers and ballast');
  assert.equal(rules.matchStep('Fuels (diesel, petrol)', st(['Set up traffic management', 'Unload with the truck loading crane (hiab)', 'Operate small earthmoving plant', 'Plant'])), 'Operate small earthmoving plant');
  assert.equal(rules.matchStep('Adhesives', st(['Move materials into place', 'Use power tools', 'Install joinery and cabinets'])), 'Install joinery and cabinets');
  const types = require('../substances').typeItems(draftOf(TREES, TREE_CHART), bodyOf(TREES, TREE_CHART)).map((item) => item.type);
  assert.ok(types.includes('Potting mix, soil conditioners and fertilisers'), types.join(' | '));
});
