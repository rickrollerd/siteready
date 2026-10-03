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
  assert.ok(steps(done).includes('Install the roller door and its motor'));
  assert.ok(!has(done, /plugged into a socket|lifted into place by two people/));
  assert.ok(has(done, /curtain and drum are lifted into place from an EWP or scissor lift, or with a forklift/));
  assert.ok(plant(done).includes('Forklift'));
  // A house garage door is still lifted by two people.
  const garage = draft('Replace a garage door and motor on a house.', { residential: 'yes' });
  assert.ok(steps(garage).includes('Install the garage or roller door and its motor'));
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
