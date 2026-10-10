// Work inside an existing deep excavation (tester, 10 October 2026): the "Work inside a deep excavation"
// step is suggested for the ways subbies write it (trades, places and depths), and not where the crew
// digs it, the excavation is shallow, the shaft is in a building, the basement is built, or the work
// is at ground level beside it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, packageKinds } = require('../draft');

const SITE = { state: 'qld', fallRisk: 'no', residential: 'no', crane: 'company', company: 'Koval Site Services Pty Ltd', principalContractor: 'Principal Builders Pty Ltd' };
const suggested = (task) => (questionsFor({ ...SITE, task, facts: {} }).steps || {}).suggested || [];
const DIG = ['trench', 'earthworks', 'bulkDig', 'detailDig', 'basementEdge'];
const INSIDE = 'Work inside a deep excavation';

// The draft as the page makes it, every question answered with its first choice or a site answer.
function draft(task) {
  const facts = {};
  for (let round = 0; round < 8; round += 1) {
    const open = (questionsFor({ ...SITE, task, facts }).required || []).filter((item) => !facts[item.id]);
    if (!open.length) break;
    for (const item of open) facts[item.id] = item.id === 'liveElectrical' ? 'no' : item.choices ? item.choices[0].value : `As set out in the site plan: ${item.label}.`;
  }
  return prepareDraft({ ...SITE, task, facts });
}

// in: the step is suggested and no dig step is. dig: a dig step and not this one. no: not this one.
const PHRASINGS = [
  // Work inside an existing excavation, pit, station box, shaft, basement dig, trench or cutting over 1.5 m deep.
  ['Lay blockwork inside the excavation 2 m deep.', 'in'],
  ['Lay blockwork in a deep excavation.', 'in'],
  ['Lay the blockwork walls of the pump pit inside the existing excavation, 2.5m deep.', 'in'],
  ['Brickwork to the manhole at the bottom of the excavation, 2.5m deep.', 'in'],
  ['Lay blockwork at the bottom of the pit 2.5 m deep.', 'in'],
  ['Core fill and lay blockwork retaining walls inside the excavation over 1.5 metres deep.', 'in'],
  ['Install drainage inside the excavation 2.5 m deep.', 'in'],
  ['Install drainage at the base of the existing excavation, over 1.5 metres deep.', 'in'],
  ['Install subsoil drainage and ag pipe at the bottom of the deep excavation.', 'in'],
  ['Lay drainage pipes in the existing deep excavation.', 'in'],
  ['Install the drainage cell and strip drain at the base of the basement excavation, 4 m deep.', 'in'],
  ['Install the drainage at the bottom of the rail cutting, 6 m deep.', 'in'],
  ['Install the sump pump in the bottom of the excavation, 3.5 metres deep.', 'in'],
  ['Install the pump and rising main in the existing wet well, 6 m deep.', 'in'],
  ['Install the pump in the pit over 2 metres deep.', 'in'],
  ['Carry out concrete repairs inside the existing excavation, 3 m deep.', 'in'],
  ['Concrete repairs inside an existing excavation over 1.5 metres deep.', 'in'],
  ['Concrete repairs to the culvert inside a deep excavation.', 'in'],
  ['Patch and repair the concrete shaft lining inside the shaft, 12 m deep.', 'in'],
  ['Repair the retaining wall at the base of the cutting, 5 m deep.', 'in'],
  ['Reinforcement inside a shaft 4m.', 'in'],
  ['Fix reinforcement for the base slab in the station box excavation, 15 m deep.', 'in'],
  ['Fix reo and pour the base slab in the station box, 20m deep.', 'in'],
  ['Form and pour the pile caps in the bottom of the 3 m deep excavation dug by the civil contractor.', 'in'],
  ['Install the formwork for the footings in the excavation 2m deep.', 'in'],
  ['Strip the formwork inside the shaft, 10 m deep.', 'in'],
  ['Fix reo in the basement excavation 6 m deep.', 'in'],
  ['Waterproof the base slab and walls inside the basement dig, 7 m deep.', 'in'],
  ['Apply the waterproofing membrane to the base slab inside the 4 m deep excavation.', 'in'],
  ['Lay the stormwater pipes in the existing trench 2.4 m deep dug by others.', 'in'],
  ['Install conduits in the open trench 2 m deep, excavated by the civil contractor.', 'in'],
  ['Weld the steel liner plates inside the existing shaft, 8 metres deep.', 'in'],
  ['Paint the walls inside the existing shaft, over 1.5 m deep.', 'in'],
  ['Survey and set out the footings at the base of the excavation, 3 m deep.', 'in'],
  ['Install the ground anchors in the existing excavation, 5 m deep.', 'in'],
  ['Install the electrical conduits in the base of the excavation 2.5 m deep.', 'in'],
  ['Install the precast culvert units inside the deep excavation with a crane.', 'in'],
  ['Blocklaying to the pump station walls inside the excavation which is 3m deep.', 'in'],
  ['Brick the sewer manhole down in the excavation, 2.8 m deep.', 'in'],
  ['Install the stormwater drainage in the bottom of the excavation, more than 2 m deep.', 'in'],
  ['Install ag drains behind the retaining wall in the deep excavation.', 'in'],
  ['Concrete spalling repairs to the culvert walls inside the existing excavation 2.2m deep.', 'in'],
  ['Epoxy injection crack repairs inside the shaft, 15 m deep.', 'in'],
  ['Install the anode cathodic protection inside the deep shaft.', 'in'],
  ['Fix the reo cages for the lift pit base inside the excavation 3 m deep.', 'in'],
  ['Electrical: install earthing grid at the base of the excavation 2 m deep.', 'in'],
  ['Plumber to install sewer pipework inside the basement excavation, 5 m deep.', 'in'],
  ['Waterproofing the shaft walls inside the shaft 6 m.', 'in'],
  ['Install the formwork to the walls in the station box, 25 m deep.', 'in'],
  ['Hydro demolition and concrete repairs inside the pit 3 m deep.', 'in'],
  ['Install geotextile and drainage gravel in the base of the cutting 8 m deep.', 'in'],
  ['Lay the conduits in the open trench, 1.8 m deep.', 'in'],
  ['Lay blockwork inside a 2 metre deep excavation.', 'in'],
  // The crew digs it: the dig steps, not this one.
  ['Excavate a trench 2.4 m deep and lay the stormwater pipe.', 'dig'],
  ['Dig the pit 3 m deep and install the pump.', 'dig'],
  ['Excavate the basement 6 m deep with excavators and trucks.', 'dig'],
  ['Excavate to 2.5 m deep and lay blockwork in the excavation.', 'dig'],
  ['Sink the shaft to 12 m deep and install the liner rings inside the shaft.', 'dig'],
  ['Bulk excavate the station box to 18 m deep with excavators.', 'dig'],
  ['Excavate the rail cutting 5 m deep.', 'dig'],
  ['Dig the trench 2 m deep and install drainage.', 'dig'],
  ['Dig the pile caps inside the excavation 3 m deep with a mini excavator.', 'dig'],
  ['Excavate the deep excavation for the detention tank and install the tank.', 'dig'],
  ['Excavate the pit 2.5 m deep, then lay blockwork in the pit.', 'dig'],
  ['Trenching for drainage 2 m deep, lay pipe and backfill.', 'dig'],
  ['Excavate and install the drainage pipes in the trench 2.5 m deep.', 'dig'],
  // 1.5 m deep or less, shallow, or no depth given for an excavation.
  ['Lay blockwork inside the excavation 1.2 m deep.', 'no'],
  ['Install drainage inside a shallow excavation.', 'no'],
  ['Install the pump in the pit 1 m deep.', 'no'],
  ['Concrete repairs inside the excavation, 900 mm deep.', 'no'],
  ['Lay pipes in the existing trench 1.2 m deep dug by others.', 'no'],
  ['Form and pour a footing inside the excavation 1.2 m deep.', 'no'],
  ['Lay blockwork in the excavation.', 'no'],
  ['Pour the base slab within the station box excavation.', 'no'],
  ['Lay blockwork in the excavation 1 m deep.', 'no'],
  ['Install conduits in the shallow pit.', 'no'],
  ['Install the drainage in the existing excavation, 600 mm deep.', 'no'],
  // Shafts and pits in a building.
  ['Install lift guide rails inside the lift shaft.', 'no'],
  ['Install pipework in the riser shaft from level 1 to level 9.', 'no'],
  ['Lay blockwork to the lift shaft walls on level 3.', 'no'],
  ['Install ductwork in the ventilation shaft from basement to roof, 40 m.', 'no'],
  ['Install fire dampers in the shaft between levels 2 and 5.', 'no'],
  ['Waterproof the lift pit, 1.8 m deep.', 'no'],
  ['Fire seal the penetrations in the services shaft on each floor.', 'no'],
  ['Install the lift doors and rails in the shaft.', 'no'],
  ['Install the cables down the riser shaft from level 8.', 'no'],
  // Basements already built.
  ['Install drainage in the basement, 6 m below ground.', 'no'],
  ['Lay blockwork in basement level 2.', 'no'],
  ['Concrete repairs to the basement car park walls, two levels below ground.', 'no'],
  ['Install the sump pump in the basement plant room, 4 m below street level.', 'no'],
  ['Paint the walls inside the existing basement, 3 m deep.', 'no'],
  ['Lay blockwork walls in the basement car park, 9 m below ground.', 'no'],
  ['Install drainage in the existing basement.', 'no'],
  // Work at ground level beside or above an excavation.
  ['Erect the hoarding around the edge of the 3 m deep excavation.', 'no'],
  ['Lay pavers beside the excavation, 2 m deep.', 'no'],
  ['Install edge protection along the top of the excavation, 4 m deep.', 'no'],
  ['Set up the mobile crane next to the excavation 5 m deep.', 'no'],
  ['Install temporary fencing near the open trench 2 m deep.', 'no'],
  ['Pump concrete from the street into the shaft 10 m deep, working from ground level.', 'no'],
  ['Install the shoring monitoring prisms around the top of the 6 m deep excavation.', 'no'],
  ['Install the hoarding next to the deep excavation.', 'no'],
  ['Stockpile materials 3 m back from the edge of the excavation 4 m deep.', 'no'],
  // Pits that are built chambers, and a trench the crew digs.
  ['Install the stormwater pit 2 m deep in the footpath.', 'no'],
  ['Install cable pits along the road.', 'no'],
  ['Lay the stormwater pipes in the trench 2 m deep, keeping the existing fence.', 'no'],
];

test('work inside an existing deep excavation is found however it is written, and nothing else brings it', () => {
  assert.ok(PHRASINGS.length >= 100);
  for (const [task, expected] of PHRASINGS) {
    const kinds = suggested(task);
    assert.equal(kinds.includes('inExcavation'), expected === 'in', task);
    if (expected === 'in') assert.ok(!kinds.some((id) => DIG.includes(id)), `${task}: ${kinds}`);
    if (expected === 'dig') assert.ok(kinds.some((id) => DIG.includes(id)), `${task}: ${kinds}`);
  }
});

test('the draft for work inside a deep excavation has the step and no dig steps, and the trench category where it is not a basement or cutting', () => {
  for (const task of ['Lay blockwork in a deep excavation.', 'Install drainage at the base of the existing excavation, over 1.5 metres deep.', 'Concrete repairs inside an existing excavation over 1.5 metres deep.', 'Lay blockwork at the bottom of the pit 2.5 m deep.', 'Install conduits in the open trench 2 m deep, excavated by the civil contractor.']) {
    const d = draft(task);
    assert.equal(d.kind, 'draft', task);
    const steps = d.jobSteps.map((step) => step.step);
    assert.ok(steps.includes(INSIDE), task);
    for (const name of ['Locate underground services', 'Excavate', 'Work in the trench', 'Backfill the trench']) assert.ok(!steps.includes(name), `${task}: ${name}`);
    assert.ok(d.highRisk.some((item) => /trench with an excavated depth greater than 1\.5 ?m/.test(item)), task);
  }
  // A basement dig and a cutting are not trenches or shafts.
  for (const task of ['Fix reo in the basement excavation 6 m deep.', 'Install the drainage at the bottom of the rail cutting, 6 m deep.']) {
    const d = draft(task);
    assert.ok(d.jobSteps.some((step) => step.step === INSIDE), task);
    assert.ok(!d.highRisk.some((item) => /trench/.test(item)), task);
  }
});

test('pipes, drains or conduits laid in an excavation others dug have the trench laying steps, without its dig steps', () => {
  const cases = [
    ['Install drainage at the base of the existing excavation, over 1.5 metres deep.', 'Lay pipes'],
    ['Lay the stormwater pipes in the existing trench 2.4 m deep dug by others.', 'Lay pipes'],
    ['Plumber to install sewer pipework inside the basement excavation, 5 m deep.', 'Lay pipes'],
    ['Install conduits in the open trench 2 m deep, excavated by the civil contractor.', 'Lay conduits'],
  ];
  for (const [task, laying] of cases) {
    assert.ok(suggested(task).includes('layInExcavation'), task);
    const steps = draft(task).jobSteps.map((step) => step.step);
    assert.deepEqual(steps.filter((name) => ![INSIDE, 'Before starting', 'Finish and clean up'].includes(name)), [laying], task);
  }
  // Blockwork, a pump, a drainage cell or drains behind a retaining wall are not pipe laying.
  for (const task of ['Lay blockwork at the bottom of the pit 2.5 m deep.', 'Install the sump pump in the bottom of the excavation, 3.5 metres deep.', 'Install the drainage cell and strip drain at the base of the basement excavation, 4 m deep.', 'Install ag drains behind the retaining wall in the deep excavation.', 'Install geotextile and drainage gravel in the base of the cutting 8 m deep.']) {
    assert.ok(!suggested(task).includes('layInExcavation'), task);
  }
  // Digging the trench keeps the trench steps.
  assert.ok(!suggested('Dig the trench 2 m deep and install drainage.').includes('layInExcavation'));
});

test('a scope package inside an excavation others dug loses the trench steps the AI chose; one the crew digs keeps them', () => {
  assert.deepEqual(packageKinds('Install drainage at the base of the existing excavation, over 1.5 metres deep.', ['trench']), ['inExcavation', 'layInExcavation']);
  assert.deepEqual(packageKinds('Lay blockwork inside the excavation 2 m deep.', ['masonryLay', 'trench']), ['masonryLay', 'inExcavation']);
  assert.deepEqual(packageKinds('Excavate a trench 2.4 m deep and lay the stormwater pipe.', ['trench']), ['trench']);
});
