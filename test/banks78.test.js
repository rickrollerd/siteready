const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor } = require('../draft');
const { answersFor } = require('../presets');

// Each task is drafted the way a user does it: every question the draft asks is
// answered with the first standard answer offered for this task, or the first choice.
function ready(input) {
  const facts = { ...(input.facts || {}) };
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor({ ...input, facts });
    let added = false;
    for (const item of asked.required || []) {
      if (facts[item.id]) continue;
      const answer = item.choices ? item.choices[0].value : (answersFor(item.id, asked.task)[0] || {}).text;
      if (answer) { facts[item.id] = answer; added = true; }
    }
    if (!added) break;
  }
  const draft = prepareDraft({ ...input, facts });
  assert.equal(draft.kind, 'draft', `${input.task}: ${(draft.missing || []).join('; ')}`);
  return draft;
}
const draft = (task, extra = {}) => ready({ state: 'qld', fallRisk: 'no', residential: 'no', ...extra, task });
const steps = (done) => done.jobSteps.map((step) => step.step);
const lines = (done) => done.jobSteps.flatMap((step) => [...step.hazards, ...step.controls]);
const step = (done, name) => done.jobSteps.find((item) => item.step === name);
const plant = (done) => done.plant.map((item) => item.item);
const has = (done, pattern) => lines(done).some((line) => pattern.test(line));
const PLANT_RISK = /powered mobile plant/i;
// The asbestos question has no standard answer: this is the one a user gives where a removalist does it first.
const REMOVALIST = { asbestosArrangement: 'Asbestos register sighted. A licensed asbestos removalist (licence ____) removes any asbestos before this work starts. Clearance certificate sighted.' };

test('the first fall control offered suits the work: no open edge for a door, ceiling cabling or dampers', () => {
  for (const task of ['Remove and replace a damaged roller door at a warehouse.', 'Install data cabling and Wi-Fi access points in a school.', 'Install fire dampers in ductwork in a hospital.', 'Repaint the exterior of a two storey weatherboard house.', 'Build a timber pergola over a backyard patio.']) {
    assert.equal(answersFor('fallControl', task)[0].label, 'EWP or mobile scaffold', task);
    const done = draft(task, { fallRisk: 'yes' });
    assert.ok(!done.controls.some((item) => /every open edge/.test(item.text)), task);
  }
  assert.equal(answersFor('fallControl', 'Paint a stairwell in a five storey apartment building.')[0].label, 'Stair void platforms');
  assert.equal(answersFor('fallControl', 'Replace a timber balcony balustrade on a first floor unit.')[0].label, 'Travel restraint');
  assert.equal(answersFor('fallControl', 'Install a rooftop exhaust fan on a restaurant.')[0].label, 'Roof edge guardrail');
  // Real open edges keep edge protection first.
  for (const task of ['Install a mezzanine floor in a warehouse.', 'Pour a bridge deck from a falsework system.', 'Erect edge protection around a three storey building slab.']) {
    assert.equal(answersFor('fallControl', task)[0].label, 'Edge protection', task);
  }
  assert.equal(answersFor('fallControl')[0].label, 'Edge protection');
});

test('a warehouse roller door is lifted by plant, its motor wired in, and the forklift listed', () => {
  const done = draft('Remove and replace a damaged roller door at a warehouse.', { fallRisk: 'yes' });
  assert.ok(steps(done).includes('Install the roller door') && steps(done).includes('Install the door motor'));
  assert.ok(!has(done, /plugged into a socket|lifted into place by two people/));
  assert.ok(has(done, /curtain and drum are lifted into place from an EWP or scissor lift, or with a forklift/));
  assert.ok(plant(done).includes('Forklift'));
  // A house garage door is still lifted by two people.
  const garage = draft('Replace a garage door and motor on a house.', { residential: 'yes' });
  assert.ok(steps(garage).includes('Install the door') && steps(garage).includes('Install the door motor'));
  assert.ok(has(garage, /lifted into place by two people/));
});

test('a cubby house at a school is built floor, walls and roof, with no house, scaffold or EWP wording', () => {
  const done = draft('Build a timber cubby house at a primary school.');
  assert.ok(steps(done).includes('Build the cubby house'));
  assert.ok(has(done, /floor frame is set level/));
  assert.ok(!has(done, /fixed to an existing building|fixed to the house|Roof sheets are fixed from a scaffold/));
  assert.ok(!plant(done).some((item) => /Scaffold|elevating work platform/i.test(item)));
  assert.ok(!done.highRisk.some((item) => PLANT_RISK.test(item)));
});

test('painting a metal shed roof is roof work, in order, with no wall painting or filler', () => {
  const done = draft('Paint the roof of a metal shed on a rural property.', { fallRisk: 'yes' });
  const names = steps(done);
  assert.ok(names.includes('Paint the roof'));
  assert.ok(!names.includes('Sand and fill surfaces'));
  assert.ok(!names.some((name) => /outside of the structure/.test(name)));
  assert.ok(names.indexOf('Prepare to paint') < names.indexOf('Paint the roof'));
  assert.ok(has(done, /Painting works back towards the access point/));
  assert.ok(!has(done, /Platform ladders are used only for short work below 2 m, on firm level ground/));
  // Paint goes up by hand line, not by crane, and the gutter guard is mesh.
  assert.ok(!has(done, /lifted to the roof by crane|placed only where the roof structure is designed/));
  const guard = draft('Install new gutter guard on a single storey house.', { fallRisk: 'yes', residential: 'yes' });
  assert.ok(has(guard, /hauled up in a bag or bucket on a hand line/));
  assert.ok(has(guard, /Cuts from the mesh/) && !has(guard, /sheet metal and flashing edges/));
  // A roof painted from a scissor lift keeps its access step, and a house exterior sets up access before preparing.
  assert.ok(steps(draft('Repaint a school roof from a scissor lift.', { fallRisk: 'yes' })).includes('Work at height on the outside of the structure'));
  const house = steps(draft('Repaint the exterior of a two storey weatherboard house.', { fallRisk: 'yes', residential: 'yes' }));
  assert.ok(house.indexOf('Work at height on the outside of the structure') < house.indexOf('Prepare to paint'));
  assert.ok(!house.includes('Paint the outside of the structure at height'));
});

test('a driveway repair is a patch, not a new slab, with each line said once', () => {
  const done = draft('Repair a concrete driveway with cracks and trip hazards.', { residential: 'yes' });
  const names = steps(done);
  assert.ok(names.indexOf('Break out and repair damaged concrete') < names.indexOf('Prepare the ground and set out'));
  assert.ok(!names.includes('Place and tie reo on the ground'));
  assert.ok(!has(done, /edge beams|Excavators, bobcats|deeper than 1\.5 m|Concrete trucks reverse|Power trowels/));
  assert.ok(!plant(done).some((item) => /^(Excavator|Skid steer|Concrete truck|Power trowel)/.test(item)));
  assert.ok(!done.highRisk.some((item) => PLANT_RISK.test(item)));
  const all = done.jobSteps.flatMap((item) => item.controls);
  assert.equal(all.filter((line) => /monitor the air|Air monitoring is done/.test(line)).length, 1);
  assert.equal(all.filter((line) => /^(Keep noise below 85|Hearing protection where noise exceeds)/.test(line)).length, 1);
  // Section 140 is cited only for the equipment complying with AS/NZS 3012.
  assert.ok(!all.some((line) => /Services may be hidden[^(]*\(Electrical Safety Regulation 2026 \(Qld\) s 140/.test(line)));
  assert.ok(all.some((line) => /comply with AS\/NZS 3012[^(]*\(Electrical Safety Regulation 2026 \(Qld\) s 140\)/.test(line)));
  // A new driveway still gets its full slab steps.
  const fresh = draft('Pour a new concrete driveway at a house.', { residential: 'yes' });
  assert.ok(steps(fresh).includes('Place and tie reo on the ground'));
  assert.ok(has(fresh, /edge beams/));
});

test('a roof over a deck puts up its posts, beams and rafters first, with no flue flashing', () => {
  const done = draft('Install a metal roof over an existing timber deck.', { fallRisk: 'yes', residential: 'yes' });
  const names = steps(done);
  assert.ok(names.includes('Erect the posts, beams and rafters'));
  assert.ok(names.indexOf('Erect the posts, beams and rafters') < names.indexOf('Fix new roofing'));
  assert.ok(has(done, /on the deck frame only where the engineer or supplier confirms it can take the load/));
  assert.ok(!has(done, /Before flashing around flues/));
});

test('Wi-Fi access points have their own mounting step', () => {
  const done = draft('Install data cabling and Wi-Fi access points in a school.', { fallRisk: 'yes' });
  assert.ok(steps(done).includes('Mount the Wi-Fi access points'));
  assert.ok(!steps(draft('Install data cabling in an office.', { fallRisk: 'yes' })).includes('Mount the Wi-Fi access points'));
});

test('fly screens upstairs follow the fall control, and no security screens are added', () => {
  const done = draft('Install fly screens on windows of a two storey house.', { fallRisk: 'yes', residential: 'yes' });
  assert.ok(steps(done).includes('Fit the fly screens'));
  assert.ok(!has(done, /Where a ladder is used, it is a platform ladder/));
  assert.ok(has(done, /fitted from the access set out in the fall control/));
  assert.ok(steps(draft('Install security screens on the windows of a house.', { residential: 'yes' })).includes('Fit fly and security screens'));
});

test('a tiled roof valley stacks and cuts its tiles once, and drills nothing', () => {
  const done = draft('Fix a leaking roof valley on a tiled roof.', { fallRisk: 'yes', residential: 'yes' });
  assert.equal(lines(done).filter((line) => /stacked on the (?:roof )?battens/.test(line)).length, 1);
  assert.equal(lines(done).filter((line) => /wet saw/.test(line)).length, 1);
  assert.ok(!has(done, /^Drill with on-tool extraction/));
  const skylight = draft('Install a skylight in a tiled roof of a two storey house.', { fallRisk: 'yes', residential: 'yes', state: 'wa' });
  assert.equal(lines(skylight).filter((line) => /stacked on the (?:roof )?battens/.test(line)).length, 1);
  const names = steps(skylight);
  assert.ok(names.indexOf('Cut in and install the skylight') < names.indexOf('Work in the roof space'));
  assert.ok(!(has(skylight, /^Treat all cables in the roof space as live/) && has(skylight, /cables are treated as energised/)));
});

test('a stairwell is painted from stair platforms, not inside edge protection', () => {
  const done = draft('Paint a stairwell in a five storey apartment building.', { fallRisk: 'yes' });
  assert.match(done.controls[0].text, /stair void is done from stair platforms/);
});

test('wall tiles in a commercial kitchen are not floor tiling or a bathroom', () => {
  const done = draft('Install wall tiles in a commercial kitchen.');
  assert.ok(steps(done).includes('Fix the wall tiles'));
  assert.ok(!has(done, /kneeling|knee pads|edge of a bath/i));
  assert.ok(has(draft('Retile the walls of a house bathroom.', { residential: 'yes' }), /edge of a bath/));
});

test('boardwalk handrails are fixed to the boardwalk, not a wall', () => {
  const water = 'Where people work over or next to the water, no one works alone, a rescue pole and life ring are at the edge, and a person trained in CPR is on site.';
  const done = draft('Install handrails on a public boardwalk over a creek.', { facts: { drowningControls: water, lifeJacketDetails: 'Level 150 inflatable life jackets, checked before use and serviced yearly.' } });
  assert.ok(!has(done, /wall or floor/));
  assert.ok(has(done, /Fixings suit the boardwalk structure/));
});

test('solar street lights: footings poured before the poles, the EWP after, and the crane only where used', () => {
  const done = draft('Install solar street lights in a park.', { fallRisk: 'yes' });
  const names = steps(done);
  assert.ok(names.indexOf('Dig and pour the footings') < names.indexOf('Use an elevating work platform'));
  assert.ok(names.indexOf('Use an elevating work platform') < names.indexOf('Stand and fix the solar light poles'));
  assert.ok(has(done, /footings are poured and left to cure/));
  assert.ok(has(done, /crane truck, where one is used/));
  assert.match(done.plant.find((item) => /crane/i.test(item.item)).licence, /where one is used/);
});

test('a sandstone wall cites the silica code, and an outside wall has no room wording or asbestos sheet line', () => {
  const done = draft('Clean and seal a sandstone wall on a heritage building.', { fallRisk: 'yes' });
  assert.ok(lines(done).some((line) => /^Sandstone contains crystalline silica.*\(Managing respirable crystalline silica dust exposure in construction and manufacturing of construction elements Code of Practice 2022 \(Qld\) s 5\.1, s 5\.2, s 8\.1\)$/.test(line)));
  assert.ok(done.sources.codes.some((code) => /crystalline silica/.test(code)));
  assert.ok(!has(done, /small or enclosed rooms|High-pressure water and compressed air are never used on it|high-pressure jet/));
});

test('louvres and a sewer pump list the plant their steps use, and a well not entered needs no entry training', () => {
  assert.ok(plant(draft('Replace broken louvres in a school classroom.')).includes('Ladders'));
  const pump = draft('Replace a failed sewer pump in a residential pump well.', { residential: 'yes', state: 'vic' });
  const items = plant(pump);
  for (const item of ['Gas detector', 'Vacuum truck', 'Davit or tripod (pump lifting)']) assert.ok(items.includes(item), item);
  assert.ok(!pump.qualifications.some((name) => /Confined space entry/.test(name)));
  assert.ok(steps(pump).includes('Lower in and connect the new pump'));
  assert.ok(!has(pump, /bores and pits/));
});

test('a chain wire fence by a railway has no pool or sheet fence wording', () => {
  const done = draft('Replace a section of chain wire fence along a railway line.', { state: 'nt' });
  assert.ok(!has(done, /\bpool\b|sheet and wire edges|posts, sheets and concrete/));
  assert.ok(has(done, /no one can get into the rail corridor/));
});

test('a stone retaining wall handles stones, not blocks, and has the silica assessment', () => {
  const done = draft('Build a stone retaining wall with a mini excavator.', { state: 'sa', residential: 'yes' });
  const wall = step(done, 'Build the retaining wall');
  assert.ok(!wall.hazards.concat(wall.controls).some((line) => /\bblocks?\b/i.test(line)));
  assert.ok(wall.controls.some((line) => /^Assess in writing before starting whether the processing is high risk/.test(line)));
  // Block and sleeper walls keep their own wording.
  assert.ok(has(draft('Build a 900 mm high retaining wall from interlocking blocks.', { residential: 'yes' }), /Blocks are team lifted/));
  assert.ok(!has(draft('Build a timber retaining wall in a backyard.', { residential: 'yes' }), /Blocks are team lifted|stones/i));
});

test('a block pool fence wall is laid from trestles, not a heavy duty scaffold', () => {
  const done = draft('Build a concrete block pool fence wall.', { state: 'tas', residential: 'yes' });
  assert.ok(!has(done, /heavy duty scaffold/));
  assert.ok(!plant(done).includes('Scaffold'));
});

test('a pylon sign with no screen is not called signs and screens', () => {
  const done = draft('Install signage on a pylon sign at a shopping centre.', { fallRisk: 'yes', state: 'act' });
  assert.ok(steps(done).includes('Install the signs'));
  assert.ok(!has(done, /\bscreens?\b/));
});

test('a timber balustrade replaced on a unit has no permit or glass panel wording', () => {
  const done = draft('Replace a timber balcony balustrade on a first floor unit.', { fallRisk: 'yes', residential: 'yes' });
  assert.ok(!has(done, /principal contractor's permit|panel being installed/));
  assert.ok(has(done, /opened only at the section being worked on/));
});

test('a nail gun is a hazard only where its control is', () => {
  const done = draft('Lay a polished concrete floor in a new café.');
  assert.ok(!has(done, /^Nail gun injuries/));
  assert.ok(!plant(done).includes('Nail gun'));
});

test('hail damaged warehouse skylights are taken out and replaced, not cut in', () => {
  const done = draft('Repair hail damaged skylights on a warehouse.', { fallRisk: 'yes', state: 'wa' });
  assert.ok(steps(done).includes('Remove and replace the damaged skylights'));
  assert.ok(!has(done, /Before the sheet is cut|Roof sheet is cut with nibblers|crawl boards|covered as soon as it is cut/));
  assert.ok(has(done, /Each damaged skylight is fenced off/));
});

test('a playground is its equipment and footings as well as the softfall', () => {
  const done = draft('Install a playground with soft fall at a school.', { state: 'vic' });
  assert.ok(steps(done).includes('Install playground equipment') && steps(done).includes('Lay the rubber softfall'));
  assert.ok(has(done, /Footing holes are dug/) && has(done, /services information before digging footings/));
  assert.ok(has(done, /paddle mixer/));
});

test('a battery and inverter: inverter mounted, terminals and testing each said once', () => {
  const done = draft('Install a solar inverter and battery in a farm workshop.');
  const names = steps(done);
  assert.ok(names.indexOf('Isolate and prove de-energised') < names.indexOf('Connect the inverter and battery'));
  assert.ok(has(done, /The inverter is mounted to the manufacturer's instructions/));
  assert.equal(lines(done).filter((line) => /terminals stay covered/.test(line)).length, 2);
  assert.ok(!has(done, /Battery and inverter terminals stay covered/));
  assert.ok(!has(done, /^The system is tested before it is connected/));
});

test('a solar system on a house is electrical work, with its hoist listed and the ladder line said once', () => {
  const done = draft('Install a solar system on a Perth house roof.', { fallRisk: 'yes', residential: 'yes' });
  assert.ok(done.sources.legislation.includes('Electrical Safety Act 2002 (Qld)'));
  assert.ok(has(done, /\(Electrical Safety Act 2002 \(Qld\) s 55, s 56\)$/));
  assert.ok(plant(done).includes('Personnel or materials hoist'));
  assert.equal(lines(done).filter((line) => /never carried up a ladder/.test(line)).length, 1);
});

test('pruning from an EWP with no one in the tree has no climbing line', () => {
  const done = draft('Prune trees over a school playground.', { fallRisk: 'yes', facts: { fallControl: 'Pruning at height is done by an arborist from an EWP with its guardrails in place, harness clipped to its anchor point, and no one climbs the tree.', harnessSystem: answersFor('harnessSystem')[0].text } });
  assert.ok(!has(done, /climbing system/));
  assert.ok(has(done, /^Pruning at height is done by an arborist from the EWP/));
});

test('road markings in a school car park: no forklifts, and the paint line is not said twice', () => {
  const done = draft('Paint road markings in a school car park on the weekend.');
  assert.ok(!has(done, /forklifts/));
  assert.ok(!has(done, /^Line marking paint is used outdoors or with ventilation/));
  assert.ok(has(draft('Paint line markings in a working warehouse.'), /separated from forklifts/));
});

test('a new main switchboard has its cables pulled in and terminated', () => {
  const done = draft('Install a new main switchboard in a hospital plant room.');
  const names = steps(done);
  assert.ok(names.includes('Pull in and terminate the cables'));
  assert.ok(names.indexOf('Pull in and terminate the cables') < names.indexOf('Test the new work'));
  assert.ok(has(done, /terminated at the new board only once each is proved de-energised/));
});

test('a scaffold stair tower has its stairs, and the first fall answer suits erecting a scaffold', () => {
  const task = 'Install a temporary scaffold stair tower on a construction site.';
  assert.equal(answersFor('fallControl', task)[0].label, 'Advance guardrails');
  const done = draft(task, { fallRisk: 'yes', state: 'nt' });
  assert.ok(has(done, /stair modules, stair handrails and landing guardrails are fitted as each lift goes up/));
  assert.ok(has(done, /Every flight, handrail, landing and gate is checked at handover/));
  // A fall answer that already has a licensed scaffolder erecting it is not repeated.
  const again = draft(task, { fallRisk: 'yes', state: 'nt', facts: { fallControl: 'Work is done from a scaffold with full edge protection, erected and handed over by a licensed scaffolder.' } });
  assert.ok(!has(again, /^A licensed scaffolder erects the scaffold/));
});

test('a sewage treatment plant has its tank pit dug from outside and its pumps wired by an electrician', () => {
  const done = draft('Install a sewage treatment plant at a rural property.', { residential: 'yes', state: 'nt' });
  assert.ok(has(done, /The tank pit is dug to the tank maker's dimensions/));
  assert.ok(has(done, /pumps, blower and alarm are wired and connected by a licensed electrician/));
  assert.ok(has(done, /The pipe trenches are kept shallower than 1\.5 m/));
  assert.ok(steps(done).includes('Lay pipes') && !has(done, /conduit/));
  assert.ok(has(draft('Replace an old septic tank with a new one.', { residential: 'yes', state: 'tas' }), /The tank pit is dug/));
});

test('a pothole repair with a roller brings the mobile plant category', () => {
  assert.ok(draft('Repair a pothole in a council car park.', { state: 'nt' }).highRisk.some((item) => PLANT_RISK.test(item)));
});

test('drilling or cutting a silica material with a power tool brings the written assessment', () => {
  for (const task of ['Install pallet racking in a new distribution centre.', 'Install new fire hose reels and extinguishers in a factory.', 'Install bike racks at a train station.']) {
    assert.ok(has(draft(task, { fallRisk: 'yes' }), /^Assess in writing before starting whether the processing is high risk/), task);
  }
  // A chimney taken down by hand is not processing with a power tool.
  assert.ok(!has(draft('Remove a brick chimney from the roof of a house.', { fallRisk: 'yes', residential: 'yes' }), /^Assess in writing/));
});

test('bollards: services found before drilling, and in-ground bollards concreted in', () => {
  const done = draft('Install bollards around a petrol station forecourt.');
  assert.ok(step(done, 'Before starting').controls.some((line) => /services information before drilling or digging/.test(line)));
  assert.ok(has(done, /In-ground bollards are set in footing holes/));
});

test('doors are not cabinets, and cabinets are not doors or wardrobes', () => {
  const doors = draft('Install skirting and doors in a new aged care building.');
  assert.ok(!has(doors, /hold units while fixing/));
  const cabinets = draft('Install new kitchen cabinets in a staff room.', { state: 'vic' });
  assert.ok(steps(cabinets).includes('Install joinery and cabinets'));
  assert.ok(!has(cabinets, /\bdoors?\b|wardrobes/i));
});

test('a new distribution centre is not an operating warehouse, and indoor work has no sun line', () => {
  const done = draft('Install pallet racking in a new distribution centre.', { fallRisk: 'yes', state: 'nsw' });
  assert.ok(!has(done, /operating warehouse/) && !has(done, /Sun and heat/));
  for (const task of ['Strip wallpaper and paint walls in a 1960s house.', 'Install smoke alarms in a rental house.', 'Fit off lights and power points in a new house.']) {
    assert.ok(!has(draft(task, { residential: 'yes', facts: REMOVALIST }), /Sun and heat/), task);
  }
});

test('trucks are guided into the work area, not a loading zone', () => {
  assert.ok(!has(draft('Install fibre optic cable through existing conduits in a street.'), /loading zone/));
});

test('new lighting is tested before it is energised, with no unused respirator line', () => {
  const done = draft('Install new lighting in a car park at night.', { fallRisk: 'yes', state: 'wa' });
  assert.ok(steps(done).includes('Test the new work'));
  assert.ok(!has(done, /Tight-fitting respirators are fit tested/));
});

test('access control door strikes are cut into the frames, with the exits kept usable', () => {
  const done = draft('Install access control readers and door strikes in an office.', { state: 'sa' });
  assert.ok(steps(done).includes('Install the security devices and door strikes'));
  assert.ok(has(done, /Door frames are cut out for strikes/) && has(done, /Doors stay usable as exits/));
});

test('old roof sheets come off bay by bay in the removal step, not the set-up step', () => {
  const done = draft('Replace roof sheets damaged by hail on a factory.', { fallRisk: 'yes', state: 'wa' });
  assert.ok(!step(done, 'Set up roof access and fall protection').controls.some((line) => /bay by bay/.test(line)));
  assert.ok(step(done, 'Remove old roofing').controls.some((line) => /bay by bay/.test(line)));
});

test('cutting tiles wet or with extraction is said once', () => {
  const done = draft('Fix cracked tiles on a commercial balcony.', { fallRisk: 'yes', state: 'nsw' });
  assert.ok(!has(done, /^No dry cutting/));
  assert.ok(has(done, /wet cutting or on-tool extraction, never dry cutting/));
});

test('a farm shed switchboard is carried in, its EWP listed and its electric shock first aid set out', () => {
  const done = draft('Install a new switchboard in a farm shed.', { state: 'nt' });
  assert.ok(!steps(done).includes('Deliver and place switchboards'));
  assert.ok(plant(done).includes('Elevating work platform'));
  assert.ok(done.emergency.some((row) => /Electric shock/.test(row.type)));
});

test('a granny flat kit and a dumbwaiter are recognised as work at height', () => {
  for (const task of ['Install a granny flat kit on a concrete slab.', 'Install a dumbwaiter in a restaurant.']) {
    assert.ok(questionsFor({ state: 'vic', task, fallRisk: 'no' }).fall.detected, task);
  }
  const flat = draft('Install a granny flat kit on a concrete slab.', { state: 'vic', residential: 'yes', fallRisk: 'yes' });
  assert.ok(has(flat, /^Before the first truss is stood, edge protection or a scaffold is in place along the top plate/));
});

test('a broken sewer under a driveway: flow stopped, sewage handled and the driveway reinstated', () => {
  const done = draft('Replace a broken sewer pipe under a driveway.', { residential: 'yes', state: 'sa' });
  assert.ok(has(done, /the flow is stopped/) && has(done, /sewage-soaked soil/));
  assert.ok(has(done, /The driveway or path is reinstated/));
});

test('a damaged pit is broken out in its own step, with the breaker listed', () => {
  const done = draft('Replace a damaged stormwater pit in a council road.', { state: 'wa' });
  const names = steps(done);
  assert.ok(names.indexOf('Break out the damaged pit') < names.indexOf('Work in the trench'));
  assert.ok(!step(done, 'Install pits').controls.some((line) => /broken out/.test(line)));
  assert.ok(plant(done).includes('Rock breaker (hydraulic hammer)'));
});

test('ducted heating in a house: no slab drilling, the flue reached safely, and gas work licensed', () => {
  const done = draft('Install ducted heating in a Ballarat house.', { residential: 'yes', state: 'vic' });
  assert.ok(!has(done, /slab|hanger anchors|above or below each other/));
  assert.ok(has(done, /flue and cowl above the roof are fitted from a platform/));
  assert.ok(done.qualifications.some((name) => /^Gas work licence/.test(name)));
});

test('a rooftop fan on a sheet roof is fixed to the purlins, with no slab drilling', () => {
  const done = draft('Install a rooftop exhaust fan on a restaurant.', { fallRisk: 'yes' });
  assert.ok(!has(done, /roof slab/) && has(done, /fixed to the purlins or a support frame/));
});

test('a timber pergola is cut and fixed on site, with no kit or roof sheet wording', () => {
  const done = draft('Build a timber pergola over a backyard patio.', { fallRisk: 'yes', residential: 'yes', state: 'act' });
  assert.ok(!has(done, /kit supplier|Roof sheets|every open edge/));
  assert.ok(has(done, /Posts, beams and rafters are cut with a drop saw/));
  assert.ok(plant(done).includes('Nail gun') && plant(done).includes('Electric power tools and leads'));
});

test('an outdoor shower has its trench and none of the indoor rough-in lines', () => {
  const done = draft('Install an outdoor shower at a beach surf club.');
  const names = steps(done);
  assert.ok(names.indexOf('Dig a shallow trench and lay the pipes') < names.indexOf('Plumbing fit-off'));
  assert.ok(!names.includes('Plumbing rough-in'));
  assert.ok(!has(done, /open penetration|drilling into a slab/));
});

test('a basement wall is dug out before it is waterproofed, with the excavator and code listed', () => {
  const done = draft('Waterproof a basement wall in an Adelaide house.', { residential: 'yes' });
  const wall = step(done, 'Waterproof walls below ground').controls;
  assert.ok(wall.findIndex((line) => /services information/.test(line)) < wall.findIndex((line) => /No one works in the excavation/.test(line)));
  assert.ok(plant(done).includes('Excavator'));
  assert.ok(done.sources.codes.includes('Excavation work Code of Practice 2021 (Qld)'));
});

test('fibro removed by a licensed removalist is not removed by the crew', () => {
  const done = draft('Demolish an old garden shed with a fibro roof.', { residential: 'yes', state: 'act', facts: REMOVALIST });
  assert.ok(has(done, /removed by the licensed asbestos removalist before the rest of the shed is taken down/));
});

test('industrial steel is prepared under AS/NZS 4361.1, not the house and building part', () => {
  const done = draft('Paint steel beams in a warehouse from a boom lift.', { fallRisk: 'yes', state: 'tas' });
  assert.ok(steps(done).includes('Prepare the steel surfaces'));
  assert.ok(has(done, /AS\/NZS 4361\.1/) && !has(done, /4361\.2|filler/));
});

test('glass pool fencing closes the pool while the barrier is open', () => {
  assert.ok(has(draft('Install glass pool fencing around a hotel pool.', { state: 'nsw' }), /The pool is closed to guests and children while the barrier is open/));
});

test('saws named in the steps are listed as plant', () => {
  assert.ok(plant(draft('Replace kitchen benchtops with laminate in a house.', { residential: 'yes', state: 'nsw' })).includes('Electric power tools and leads'));
  assert.ok(plant(draft('Erect a colorbond fence between two houses.', { residential: 'yes', state: 'nt' })).includes('Electric power tools and leads'));
  assert.ok(plant(draft('Lay a new gravel driveway on a rural property.', { residential: 'yes', state: 'act' })).includes('Water cart'));
});

test('a range hood is not gas work', () => {
  const done = draft('Install a commercial range hood in a café kitchen.', { fallRisk: 'yes' });
  assert.ok(!done.qualifications.some((name) => /^Gas work/.test(name)));
  assert.ok(!done.sources.legislation.some((act) => /Petroleum and Gas/.test(act)));
});

test('a shade structure is covered in fabric, not roof sheets', () => {
  const done = draft('Install a playground shade structure at a kindergarten.', { fallRisk: 'yes', state: 'act' });
  assert.ok(steps(done).includes('Erect the frame and fix the shade fabric'));
  assert.ok(!has(done, /Roof sheets|fixed to an existing building/));
});

test('one window frame, and a ground floor shopfront with its glass doors', () => {
  const frame = draft('Replace a timber window frame in a Canberra townhouse.', { residential: 'yes', state: 'tas' });
  assert.ok(steps(frame).includes('Replace the window frame'));
  assert.ok(!has(frame, /\bdoors\b|from the platform\./));
  const shop = draft('Install a new shopfront with glass doors in a shopping strip.', { state: 'nsw' });
  assert.ok(has(shop, /Glass doors are hung/) && !has(shop, /above the ground floor|through the window opening/));
});

test('jetty deck boards: boards, not bearers, and openings covered once', () => {
  const water = { drowningControls: 'Where people work over or next to the water, no one works alone, a rescue pole and life ring are at the edge, and a person trained in CPR is on site.', lifeJacketDetails: 'Level 150 inflatable life jackets, checked before use and serviced yearly.' };
  const done = draft('Replace a section of timber deck boards on a jetty.', { state: 'nt', facts: water });
  assert.ok(steps(done).includes('Remove and replace the deck boards'));
  assert.ok(!has(done, /Bearers/) && !has(done, /^Openings in the deck are barricaded/));
});

test('speed humps are not bollards, and a street has no walls', () => {
  const done = draft('Install traffic calming speed humps on a council street.', { state: 'wa' });
  assert.ok(!has(done, /bollards|walls and slabs/));
});

test('stripping vinyl lifts only vinyl, with its adhesives covered', () => {
  const done = draft('Strip and replace vinyl flooring in a medical clinic.', { state: 'nt' });
  assert.ok(!has(done, /carpet/i));
  assert.ok(has(done, /Floor primers, adhesives and levelling compounds/));
});

test('a vehicle crossover is boxed out to the council detail, with no ladders or edge beams', () => {
  const done = draft('Install a vehicle crossover at a new house.', { residential: 'yes', state: 'wa' });
  assert.ok(steps(done).includes('Box out the crossover'));
  assert.ok(!has(done, /concrete saws on ladders|edge beams|Nail gun/));
});

test('laying turf cites no excavation code, and the water line is said once', () => {
  const done = draft('Lay turf at a new housing estate park.');
  assert.ok(!has(done, /Excavation work Code of Practice/));
  assert.equal(lines(done).filter((line) => /Cool drinking water, shade and rest breaks/.test(line)).length, 1);
});

test('a shower re-tile has no hoist, crane or panel lifters', () => {
  assert.ok(!has(draft('Repair a leaking shower by removing and relaying the tiles.', { residential: 'yes', state: 'tas' }), /hoist or crane|panel lifters/));
});

test('a laboratory eyewash is connected, flushed and tested in a cleared lab', () => {
  const done = draft('Install an emergency eyewash station in a laboratory.', { state: 'nt' });
  assert.ok(steps(done).includes('Install, connect and test the eyewash station'));
  assert.ok(has(done, /laboratory manager confirms which chemicals/) && has(done, /flushed and tested for flow/));
});
