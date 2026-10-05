// Job steps, high risk categories and hazards for scope of works lines, from a run of
// real subcontract scopes. Each line here is a short synthetic one with the same shape.
// A word in passing (a plant list in a test, a business name, a trim) must not bring
// the job steps of other work, and the real work keeps its steps.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, suggestedKinds, workFlags, highRiskMatches } = require('../draft');
const { findState } = require('../legislation');
const { answersFor } = require('../presets');
const { tradeIds } = require('../trades');

// The kinds a scope task is given for its trade, as the scope reader suggests them.
const kinds = (task, trade = '') => suggestedKinds(task, {}, { trades: tradeIds(trade) });

// A draft made the way the app makes one from a scope task: the trade and its suggested
// kinds are sent, and every question is answered with the first standard answer.
function draft(task, trade = '', extra = {}) {
  const input = { state: 'qld', fallRisk: 'no', residential: 'no', task, trade, kinds: kinds(task, trade), ...extra };
  const facts = { ...(extra.facts || {}) };
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor({ ...input, facts });
    let added = false;
    for (const item of asked.required || []) {
      if (facts[item.id]) continue;
      const answer = item.choices ? item.choices[0].value : (answersFor(item.id, asked.task)[0] || {}).text || `As set out in the site plan: ${item.label}.`;
      facts[item.id] = answer;
      added = true;
    }
    if (!added) break;
  }
  const done = prepareDraft({ ...input, facts });
  assert.equal(done.kind, 'draft', `${task}: ${(done.missing || []).join('; ')}`);
  return done;
}
const steps = (done) => done.jobSteps.map((step) => step.step);
const risks = (done) => done.highRisk.join('\n');
const hazards = (done) => done.hazards.map((row) => row.hazard);

test('plant named only as checked during a generator load test brings no pump, tank, trench or confined space work', () => {
  const task = 'Load test the new standby generators with a load bank. During each load shed, check that the switchboards, sewage pump stations, wet wells and chillers restart.';
  for (const trade of ['electrical', 'plumbing', 'mechanical', 'fire', '']) {
    const found = kinds(task, trade);
    for (const id of ['trench', 'pumpInstall', 'tankPlace', 'confined']) assert.ok(!found.includes(id), `${trade}: ${id}`);
  }
  assert.ok(kinds(task, 'electrical').includes('generatorTest'));
  const done = draft(task, 'electrical');
  assert.ok(steps(done).includes('Run and load test generators'));
  for (const name of ['Excavate', 'Install the pump and pipework', 'Lift and place tanks, pits or precast units']) assert.ok(!steps(done).includes(name), name);
  assert.doesNotMatch(risks(done), /confined space|flammable atmosphere/i);
  // Building or entering a pump station is still that work.
  const station = 'Install a new sewage pump station with a precast wet well.';
  assert.ok(kinds(station, 'plumbing').includes('tankPlace'));
  assert.ok(kinds(station, 'plumbing').includes('trench'));
  assert.match(risks(draft(station, 'plumbing')), /confined space/i);
});

test('testing an existing and a new generator system is not installing generators or work on fuel lines', () => {
  assert.ok(!kinds('Test and commission the existing and new generator systems with resistive load banks.', 'electrical').includes('generatorPlant'));
  assert.ok(kinds('Install a new diesel generator and its day tank.', 'electrical').includes('generatorPlant'));
  // A load test is not work on the fuel lines; installing the generator and its day tank is.
  assert.doesNotMatch(risks(draft('Test and commission the existing and new generator systems with resistive load banks.', 'electrical')), /fuel/i);
  assert.match(risks(draft('Install a new diesel generator and its day tank.', 'electrical')), /fuel/i);
});

test('flues named as penetrations to flash and seal are not a heater and flue install', () => {
  assert.ok(!kinds('Flash and seal every pipe, duct and flue where it passes through the external walls.', 'plumbing').includes('flueInstall'));
  assert.ok(kinds('Install the gas heater and flue.', 'plumbing').includes('flueInstall'));
});

test('a day spa is a business, not a spa to place and connect', () => {
  assert.ok(!kinds('Install the day spa reception desk and the bar joinery.', 'carpentry').includes('spaInstall'));
  assert.ok(!kinds('Install the joinery to the spa treatment rooms.', 'carpentry').includes('spaInstall'));
  assert.ok(kinds('Install and connect the new spa on the deck.').includes('spaInstall'));
});

test('edge strips and edge trims are not tiling at a balcony edge', () => {
  const task = 'Fix aluminium edge strips where the floor tiles meet the carpet at doorways.';
  assert.ok(!kinds(task, 'tiling').includes('tileEdge'));
  assert.ok(!steps(draft(task, 'tiling')).includes('Lay tiles near open edges'));
  assert.ok(kinds('Tile the balcony up to the open edge.', 'tiling').includes('tileEdge'));
});

test('hoist in a list of verbs is not a lift of soil and plants to a podium', () => {
  assert.ok(!kinds('Supply, unload, hoist and install the topsoil, mulch and plants to the garden beds.', 'landscaping').includes('landscapeLift'));
  assert.ok(kinds('Crane the soil and plants up to the podium planters.', 'landscaping').includes('landscapeLift'));
});

test('painting over welds is not welding, brazing or soldering', () => {
  const task = 'Touch up the paint over the welds on the roof sheets.';
  assert.ok(!workFlags(task).hotWork);
  assert.ok(!kinds(task, 'roofing,plumbing').includes('hotWork'));
  assert.ok(workFlags('Braze the copper pipe joints.').hotWork);
  assert.ok(hazards(draft('Weld the steel brackets to the beams.', 'steel')).includes('Hot work'));
  assert.ok(hazards(draft(task, 'roofing')).every((name) => name !== 'Hot work'));
});

test('a fixture fit-off that also drains a safety shower keeps the fit-off step', () => {
  const done = draft('Fit off the toilets, basins and tapware, and connect the drainage to the safety shower.', 'plumbing');
  assert.ok(steps(done).includes('Plumbing fit-off'));
  assert.ok(!steps(done).includes('Plumbing rough-in'));
  assert.ok(!steps(done).includes('Install, connect and test the eyewash station'));
  assert.ok(steps(draft('Install and test an emergency eyewash station in the laboratory.', 'plumbing')).includes('Install, connect and test the eyewash station'));
});

test('mouldings and wet areas are not water-damaged linings', () => {
  assert.ok(!kinds('Stand the new door frames and fit the skirtings and mouldings. Remove the protective film from the linings.', 'doors').includes('wetLiningStrip'));
  assert.ok(!kinds('Fix new wall linings to the wet areas and remove the offcuts.', 'plasterboard').includes('wetLiningStrip'));
  assert.ok(kinds('Strip the mould-affected plasterboard linings after the leak.', 'plasterboard').includes('wetLiningStrip'));
});

test('cables fixed in overhead runs are not work near overhead power lines', () => {
  assert.ok(!kinds('Fix the cables to catenary wires or to insulators in overhead lines between the buildings.', 'electrical').includes('power'));
  assert.ok(kinds('Dig a trench for a conduit near the overhead power lines.', 'electrical').includes('power'));
});

test('windows, louvres and doors are not panels at an open slab edge', () => {
  assert.ok(!kinds('Install the aluminium windows, glass louvres and doors to the single storey cabins, and the glazing film to the doors.', 'glazing').includes('panelInstall'));
  assert.ok(kinds('Install the unitised curtain wall panels at the slab edge.', 'facade').includes('panelInstall'));
});

test('automatic doors are installed and commissioned, not only hung', () => {
  const done = draft('Supply, install and commission the automatic sliding doors.', 'doors');
  assert.ok(steps(done).includes('Install and commission the automatic doors'));
  assert.ok(!steps(done).includes('Stand the door frames') && !steps(done).includes('Hang the doors'));
  assert.ok(done.jobSteps.flatMap((step) => step.controls).some((line) => /sensors are tested for crush and entrapment/.test(line)));
  assert.ok(steps(draft('Supply and install the automatic doors, including commissioning. Section 0820 Doors and Door Frames.', 'doors')).includes('Install and commission the automatic doors'));
  const frames = steps(draft('Stand the door frames and hang the timber doors.', 'doors'));
  assert.ok(frames.includes('Stand the door frames') && frames.includes('Hang the doors'));
});

test('stacks a drain collects, or a ceiling named in a rule, are not risers or pipework at height', () => {
  const drain = 'Install the sewer drainage system that collects the sanitary plumbing stacks.';
  assert.ok(!kinds(drain, 'plumbing').includes('hydraulicRisers'));
  assert.ok(kinds(drain, 'plumbing').includes('trench'));
  assert.ok(!kinds('Make sure no pipework rests on the ceiling grid. Install the pipe sleeves.', 'plumbing').includes('hydraulicRisers'));
  assert.ok(kinds('Install the sanitary plumbing stacks and waste pipes in the risers.', 'plumbing').includes('hydraulicRisers'));
  assert.ok(kinds('Install the hot and cold water pipework in the ceilings.', 'plumbing').includes('hydraulicRisers'));
});

test('labelling pipes and ductwork is not installing them', () => {
  assert.ok(!kinds('Mark the pipes, ductwork and plant with colour bands and flow arrows for each type of installation.', 'mechanical').includes('ductwork'));
  assert.ok(kinds('Install the supply air ductwork.', 'mechanical').includes('ductwork'));
});

test('a reglet saw cut for flashings is not saw cutting a slab', () => {
  const task = 'Fix the metal roof sheeting, and fix the flashings into reglets or saw cut chases in the masonry parapet.';
  assert.ok(!kinds(task, 'roofing').includes('sawCut'));
  assert.ok(!steps(draft(task, 'roofing')).includes('Saw cut concrete'));
  assert.ok(kinds('Saw cut the concrete slab for the new drain.', 'excavation').includes('sawCut'));
});

test('new fascias are fixed, not replaced', () => {
  const done = draft('Supply and fix the new fascias and cappings.', 'roofing', { fallRisk: 'yes' });
  assert.ok(!steps(done).includes('Replace the fascia boards'));
  assert.ok(steps(draft('Replace the rotten fascia boards on the house.', 'roofing', { fallRisk: 'yes' })).includes('Replace the fascia boards'));
});

test('extra low voltage door locking cabling is not isolation of an electrical installation', () => {
  assert.ok(!kinds('Install and terminate the electronic door locking system cabling.', 'electrical').includes('isolation'));
  assert.ok(kinds('Install and terminate the submains at the distribution boards.', 'electrical').includes('isolation'));
});

test('a rule about scanning for cast-in conduits is not installing cast-in conduits', () => {
  assert.ok(!kinds('Scan the slab for cast in conduits before core drilling the penetrations.', 'electrical').includes('castIn'));
  assert.ok(!kinds('No conduits are to be cast in-slab unless there is no alternative. Core drill the cable penetrations.', 'electrical').includes('castIn'));
  assert.ok(kinds('Install cast-in conduits in the slab before the pour.', 'electrical').includes('castIn'));
});

test('wiring a fire panel to a gas shut off valve is not work on gas piping', () => {
  assert.doesNotMatch(risks(draft('Install the fire alarm cabling, and the wiring and connection to the gas shut off valve in the kitchen.', 'fire')), /gas/i);
  assert.match(risks(draft('Connect the new gas line to the meter.', 'plumbing')), /gas/i);
});

test('traffic control "if required" is not work on a road', () => {
  const task = 'Provide any traffic control required for their works.';
  assert.ok(!kinds(task, 'structure').includes('road'));
  assert.ok(!highRiskMatches(task, '', findState('qld')).some((item) => item.check === 'road'));
  assert.ok(!highRiskMatches('Provide any required traffic control/management for the works.', '', findState('vic')).some((item) => item.check === 'roadOrRail'));
  assert.ok(kinds('Set up traffic control on the public road.', 'structure').includes('road'));
});

test('gravel ballast on a roof is not a railway', () => {
  assert.doesNotMatch(risks(draft('Lay the roof membrane under the insulation boards and washed gravel ballast.', 'waterproofing')), /railway/i);
  assert.match(risks(draft('Replace the sleepers and ballast on the live rail track.', 'excavation')), /railway/i);
});

test('kitchen cooking equipment with no gas named is not gas fitting', () => {
  assert.ok(!kinds('Install the cooking equipment and shelving in the restaurant kitchen.', 'kitchens').includes('gasFitting'));
  assert.ok(kinds('Install the commercial wok burners in the restaurant kitchen.', 'kitchens').includes('gasFitting'));
});

test('a scheduled chilled water pipework item has an install step', () => {
  assert.ok(kinds('Chilled water pipework including valves and insulation.', 'mechanical').includes('ductwork'));
  assert.ok(!kinds('Insulate the chilled water pipework.', 'mechanical').includes('ductwork'));
});

test('treating the sides of trenches, or filling existing trenches, is not digging a trench', () => {
  assert.ok(!kinds('Apply termite treatment to the sides and bottoms of the trenches.', 'landscaping').includes('trench'));
  assert.ok(!kinds('Place concrete in the existing trenches in the switch room.', 'structure').includes('trench'));
  assert.ok(kinds('Dig the trenches for the stormwater pipes.', 'plumbing').includes('trench'));
});

test('grinding a concrete surface is not hot work; grinding steel is', () => {
  assert.ok(!hazards(draft('Grind and prepare the concrete floor before the membrane goes down.', 'waterproofing')).includes('Hot work'));
  assert.ok(hazards(draft('Grind the steel welds flush on the handrail.', 'steel')).includes('Hot work'));
});

test('cast-in pipework in an in-ground pool is not work on a deck before the pour', () => {
  assert.ok(!kinds('Install the cast-in pipework in the in-ground pool shell before the pour, and the plumbing and drainage.', 'plumbing').includes('castInPlumbing'));
  assert.ok(kinds('Install cast-in sleeves and puddle flanges on the suspended slab before the pour.', 'plumbing').includes('castInPlumbing'));
});

test('preparing a floor for a skim coat is levelling, not grinding', () => {
  const found = kinds('Prepare the subfloor for a 1 mm skim coat before the sheet vinyl.', 'flooring');
  assert.ok(!found.includes('floorGrind'));
  assert.ok(found.includes('floorLevel'));
  assert.ok(kinds('Grind and prepare the subfloor before the sheet vinyl.', 'flooring').includes('floorGrind'));
});

test('plant set on a footpath is not work beside a road in use; a footpath beside a live road is', () => {
  const task = 'Supply and install two condensers on the footpath outside the amenities block, and fence them off during the works.';
  assert.ok(!kinds(task, 'mechanical').includes('road'));
  assert.ok(!highRiskMatches(task, '', findState('qld')).some((item) => item.check === 'road'));
  assert.ok(!highRiskMatches(task, '', findState('vic')).some((item) => item.check === 'roadOrRail'));
  const kerb = 'Replace the damaged slabs on the footpath next to the street, with traffic passing at the kerb.';
  assert.ok(highRiskMatches(kerb, '', findState('qld')).some((item) => item.check === 'road'));
  assert.ok(kinds(kerb, 'structure').includes('road'));
  assert.ok(highRiskMatches('Excavate a sewer trench in the road reserve.', '', findState('qld')).some((item) => item.check === 'road'));
});

test('a new fan coil unit is lifted into place, a replaced one is lowered out first', () => {
  const { prepareDraft } = require('../draft');
  const steps = (task) => prepareDraft({ state: 'qld', task, fallRisk: 'no', residential: 'no' }).jobSteps.map((step) => step.step);
  assert.ok(steps('Supply and install fan coil units in the server room, with drip trays drained outside.').includes('Lift the fan coil unit into place and fix it'));
  const replace = steps('Replace the existing fan coil units on level 2.');
  assert.ok(replace.includes('Remove the old fan coil unit') && replace.includes('Lift the fan coil unit into place and fix it'));
});

test('a search for mech lists mechanical work, not steps that only mention mechanical aids', () => {
  const { searchSteps } = require('../steps');
  const ids = searchSteps('mech');
  assert.ok(ids.includes('ductwork'));
  assert.ok(!ids.includes('turf') && !ids.includes('floorLay') && !ids.includes('masonryMortar'), ids.join(','));
});

test('ducting connected on the roof is ductwork, and fire dampeners are fire dampers', () => {
  const flags = workFlags('Install fan coil units on the roof, connecting ducting to roof connections and install fire dampeners');
  assert.ok(flags.ductwork && flags.fireDampers);
});

test('sleeves and pants follow the site rules unless the work needs long clothing', () => {
  const ticked = (task) => prepareDraft({ state: 'qld', task, fallRisk: 'no', residential: 'no' }).ppe.flatMap((group) => group.items.filter((item) => item.ticked).map((item) => item.id));
  assert.ok(ticked('Install ductwork in the ceiling.').includes('siteClothing'));
  assert.ok(!ticked('Install ductwork in the ceiling.').includes('longs'));
});

test('mechanical work has one step per activity: hangers, ductwork, pipework and units are separate', () => {
  const duct = steps(draft('Install ductwork in the ceilings.', 'mechanical'));
  assert.ok(duct.includes('Fix hangers and supports') && duct.includes('Install ductwork'));
  assert.ok(!duct.includes('Install mechanical pipework') && !duct.includes('Fix the units in place'));
  const pipe = steps(draft('Install chilled water pipework in the plant room.', 'mechanical'));
  assert.ok(pipe.includes('Install mechanical pipework') && pipe.includes('Fix hangers and supports'));
  assert.ok(!pipe.includes('Install ductwork'));
  const both = steps(draft('Install ductwork, chilled water pipework and fan coil units in the apartment ceilings and risers.', 'mechanical'));
  assert.equal(both.filter((name) => name === 'Fix hangers and supports').length, 1);
  assert.ok(!both.includes('Work in the roof space'), 'fan coil units are not homes');
});

test('refrigerant is recovered only when a system is emptied or taken out', () => {
  const install = steps(draft('Install split systems and charge with refrigerant.', 'mechanical'));
  assert.ok(install.includes('Evacuate and charge the system') && !install.includes('Recover refrigerant'));
  const removal = steps(draft('Recover refrigerant from the old split systems and remove them.', 'mechanical'));
  assert.ok(removal.includes('Recover refrigerant') && !removal.includes('Evacuate and charge the system'));
});

test('a trench lays pipes, sets pits and lays conduits in separate steps, each only when named', () => {
  const both = steps(draft('Excavate a trench for stormwater pipes and pits, and comms conduits.', 'plumbing'));
  assert.ok(both.includes('Lay pipes') && both.includes('Install pits') && both.includes('Lay conduits'));
  const conduits = steps(draft('Excavate a trench for underground power conduits to the shed.', 'electrical'));
  assert.ok(conduits.includes('Lay conduits') && !conduits.includes('Lay pipes') && !conduits.includes('Install pits'));
  const pit = steps(draft('Replace a damaged stormwater pit in a council road.', 'plumbing'));
  assert.ok(pit.includes('Install pits') && !pit.includes('Lay pipes'));
});

test('asphalt is saw cut and reinstated in separate steps; a pothole patch has no cut', () => {
  const road = steps(draft('Saw cut and reinstate the asphalt over the new sewer trench in the road.', 'plumbing'));
  assert.ok(road.includes('Reinstate asphalt') && road.indexOf('Reinstate asphalt') > road.indexOf('Backfill the trench'));
  const cut = steps(draft('Reinstate the asphalt over the backfilled trench.'));
  assert.ok(cut.indexOf('Saw cut asphalt') >= 0 && cut.indexOf('Saw cut asphalt') < cut.indexOf('Reinstate asphalt'));
  const pothole = steps(draft('Repair potholes in the car park with hot asphalt and a roller.'));
  assert.ok(pothole.includes('Reinstate asphalt') && !pothole.includes('Saw cut asphalt'));
});

test('demolition removes the props only where it was propped', () => {
  assert.ok(steps(draft('Demolish the internal load-bearing wall with temporary propping.')).includes('Remove the props'));
  assert.ok(!steps(draft('Demolish the internal brick wall in the kitchen.')).includes('Remove the props'));
});

test('structure: jumpform reo and forms, tendon tails and grout, precast grout and braces are separate steps', () => {
  const jump = steps(draft('Climb the jumpform on the core and pour the core walls.', 'structure'));
  assert.ok(jump.indexOf('Fix the wall reo from the platforms') >= 0 && jump.indexOf('Fix the wall reo from the platforms') < jump.indexOf('Set the wall forms from the platforms'));
  const pt = steps(draft('Stress the post-tensioned tendons on level 5, cut tails and grout the ducts.', 'structure'));
  assert.ok(pt.includes('Cut the tendon tails') && pt.includes('Grout the tendon ducts'));
  const precast = steps(draft('Erect the precast wall panels with a mobile crane, brace, grout and remove the braces.', 'structure'));
  assert.ok(precast.indexOf('Grout the base') >= 0 && precast.indexOf('Grout the base') < precast.indexOf('Remove the braces'));
});

test('ground anchors and props are their own steps, each only when named', () => {
  const anchors = steps(draft('Bulk excavate the basement installing ground anchors.', 'excavation'));
  assert.ok(anchors.includes('Install and later remove ground anchors') && anchors.includes('Stress the ground anchors') && !anchors.includes('Install and later remove props'));
  const props = steps(draft('Bulk excavate the basement with hydraulic props and walers.', 'excavation'));
  assert.ok(props.includes('Install and later remove props') && !props.includes('Stress the ground anchors'));
});

test('blast holes are drilled in one step, and the shotfirer charges and fires in the next', () => {
  const blast = draft('Drill and blast rock in the basement excavation.');
  const names = steps(blast);
  assert.ok(names.indexOf('Drill the blast holes') >= 0 && names.indexOf('Drill the blast holes') < names.indexOf('Charge and fire the blast'));
  assert.ok(blast.jobSteps.find((step) => step.step === 'Charge and fire the blast').controls.some((line) => /shotfirer holding the licence/.test(line)));
});

test('core fill comes after the blocks are laid, apart from mixing mortar', () => {
  const names = steps(draft('Lay blockwork walls with mortar and core fill.', 'masonry'));
  assert.ok(names.indexOf('Mix mortar') < names.indexOf('Lay blocks and bricks') && names.indexOf('Lay blocks and bricks') < names.indexOf('Core fill blockwork'));
  assert.equal(names.filter((name) => name === 'Mix mortar').length, 1);
});

test('concrete and tank walls are formed, reinforced and poured in separate steps', () => {
  const wall = steps(draft('Construct a reinforced concrete retaining wall along the boundary.'));
  assert.ok(wall.indexOf('Form the retaining wall') >= 0 && wall.indexOf('Form the retaining wall') < wall.indexOf('Fix the retaining wall reo') && wall.indexOf('Fix the retaining wall reo') < wall.indexOf('Pour the retaining wall'));
  const tank = steps(draft('Construct concrete water tanks: form, reinforce and pour the tank walls.'));
  assert.ok(tank.includes('Form the tank walls') && tank.includes('Fix the tank wall reo') && tank.includes('Pour the tank walls'));
});

test('concrete steps, pool shells and pool removal are split into their stages', () => {
  const stairs = steps(draft('Break out and replace the concrete steps at the front entry.'));
  assert.ok(stairs.indexOf('Break out the old concrete steps') >= 0 && stairs.indexOf('Break out the old concrete steps') < stairs.indexOf('Form and pour the new concrete steps'));
  const shell = steps(draft('Construct a pool shell with sprayed concrete.'));
  assert.ok(shell.indexOf('Fix the pool shell reo') >= 0 && shell.indexOf('Fix the pool shell reo') < shell.indexOf('Spray the pool shell'));
  const removal = steps(draft('Remove the old in-ground pool and fill it with compacted sand.'));
  assert.ok(removal.indexOf('Break out the pool') >= 0 && removal.indexOf('Break out the pool') < removal.indexOf('Fill the pool void'));
});

test('bollards, barriers, wheel stops and speed humps are each their own step, only when named', () => {
  const stops = steps(draft('Install wheel stops and speed humps in the car park.'));
  assert.ok(stops.includes('Install wheel stops') && stops.includes('Install speed humps') && !stops.includes('Install bollards'));
  const mixed = steps(draft('Install traffic barriers and bollards at the loading dock.'));
  assert.ok(mixed.includes('Install bollards') && mixed.includes('Install barriers') && !mixed.includes('Install speed humps'));
});

test('old services are isolated by the licensed trades in one step and removed in the next', () => {
  const names = steps(draft('Strip out the old services in the plant room: isolate, make safe and remove the old pipework and cable trays.'));
  assert.ok(names.indexOf('Isolate and make safe the old services') >= 0 && names.indexOf('Isolate and make safe the old services') < names.indexOf('Remove the old services'));
});

test('bricking up an opening removes the old frames and cuts the lintel bearings in separate steps', () => {
  const names = steps(draft('Remove the old window frames, prop the brickwork and brick up the window openings with a new lintel.', 'masonry'));
  assert.ok(names.indexOf('Remove the old frames') >= 0 && names.indexOf('Remove the old frames') < names.indexOf('Cut the lintel bearings'));
  assert.ok(names.indexOf('Cut the lintel bearings') < names.indexOf('Cut blocks and bricks'));
});

test('cable tray and the cabling laid on it are separate steps, and cabling comes only when named', () => {
  const both = steps(draft('Install cable tray, containment and cabling in the risers and apartment ceilings.', 'electrical'));
  assert.ok(both.includes('Install cable tray and containment') && both.includes('Install cabling'));
  const tray = steps(draft('Install cable tray and containment in the basement car park.', 'electrical'));
  assert.ok(tray.includes('Install cable tray and containment') && !tray.includes('Install cabling'));
  // Heavy cables pulled off drums have their own cable pulling step.
  const pulled = steps(draft('Install cable ladder and pull the submains cables in the riser.', 'electrical'));
  assert.ok(pulled.includes('Pull cables and handle cable drums') && !pulled.includes('Install cabling'));
});

test('electrical rough-in and fit-off are separate steps, with the circuit isolated first', () => {
  const both = steps(draft('Rough-in and fit-off the electrical installation in the apartments.', 'electrical'));
  assert.ok(both.indexOf('Isolate and prove de-energised') < both.indexOf('Rough-in'));
  assert.ok(both.indexOf('Rough-in') < both.indexOf('Fit off'));
  const roughIn = steps(draft('Rough-in the electrical for the new house.', 'electrical'));
  assert.ok(roughIn.includes('Rough-in') && !roughIn.includes('Fit off'));
  const fitOff = steps(draft('Replace the light fittings in the office.', 'electrical'));
  assert.ok(fitOff.includes('Fit off') && !fitOff.includes('Rough-in'));
});

test('new electrical work is tested, then connected and commissioned, as separate steps', () => {
  const names = steps(draft('Install a new main switchboard and consumer mains, test and commission.', 'electrical'));
  assert.ok(names.indexOf('Test the new work') >= 0 && names.indexOf('Test the new work') < names.indexOf('Connect and commission'));
  assert.ok(!names.includes('Test, connect and commission'));
});

test('communications containment and the cable pull are separate steps', () => {
  const both = steps(draft('Install cable tray and pull Cat6A cabling to the data outlets on level 3.', 'communications'));
  assert.ok(both.includes('Install communications containment') && both.includes('Pull communications cabling'));
  const pull = steps(draft('Pull Cat6 cabling through the existing containment to the workstations.', 'communications'));
  assert.ok(pull.includes('Pull communications cabling') && !pull.includes('Install communications containment'));
  const containment = steps(draft('Install catenary and conduits for the communications cabling.', 'communications'));
  assert.ok(containment.includes('Install communications containment') && !containment.includes('Pull communications cabling'));
});

test('optical fibre is hauled in its own step only where no other step pulls it, then spliced and tested', () => {
  const backbone = steps(draft('Install and splice the fibre backbone between the comms rooms.', 'communications'));
  assert.ok(backbone.includes('Pull communications cabling') && backbone.includes('Splice and test optical fibre'));
  assert.ok(!backbone.includes('Haul the optical fibre cable'));
  const splice = steps(draft('Splice and test the optical fibre in the comms room.', 'communications'));
  assert.ok(splice.includes('Splice and test optical fibre') && !splice.includes('Haul the optical fibre cable'));
});

test('signal pits and conduits, and the poles, are separate steps', () => {
  const both = steps(draft('Install new traffic signals at the intersection, with pits and conduits.', 'electrical'));
  assert.ok(both.indexOf('Install pits and conduits') >= 0 && both.indexOf('Install pits and conduits') < both.indexOf('Stand the poles'));
  const pole = steps(draft('Replace the damaged traffic signal pole at the corner.', 'electrical'));
  assert.ok(pole.includes('Stand the poles') && !pole.includes('Install pits and conduits'));
  // Pits laid in the trench steps are not repeated.
  const street = steps(draft('Install street lighting poles, pits and conduits along the new road.', 'electrical'));
  assert.ok(street.includes('Install pits') && street.includes('Lay conduits') && street.includes('Stand the poles') && !street.includes('Install pits and conduits'));
});

test('a sub-board is mounted, and its sub-mains run, as separate steps', () => {
  const board = steps(draft('Install a new distribution board on level 2.', 'electrical'));
  assert.ok(board.indexOf('Mount the sub-board') >= 0 && board.indexOf('Mount the sub-board') < board.indexOf('Run the sub-mains'));
  // Where the cable pulling step runs the sub-mains, it is not repeated, and the termination at the main switchboard stays.
  const done = draft('Install a new sub-board in the workshop and run the sub-mains from the main switchboard.', 'electrical');
  assert.ok(steps(done).includes('Mount the sub-board') && !steps(done).includes('Run the sub-mains'));
  assert.ok(JSON.stringify(done.jobSteps).includes('Before termination at the main switchboard'));
});

test('sports lighting and screens are separate steps, each only when named', () => {
  const both = steps(draft('Install sports field lighting and the scoreboard screen at the stadium.', 'electrical'));
  assert.ok(both.includes('Install sports lighting') && both.includes('Install the screens'));
  const lights = steps(draft('Install sports lighting on the oval light towers.', 'electrical'));
  assert.ok(lights.includes('Install sports lighting') && !lights.includes('Install the screens'));
  const screen = steps(draft('Install the LED video screen at the stadium.', 'electrical'));
  assert.ok(screen.includes('Install the screens') && !screen.includes('Install sports lighting'));
});

test('plumbing rough-in and fit-off are separate steps', () => {
  const both = steps(draft('Rough-in and fit-off the plumbing in the apartments.', 'plumbing'));
  assert.ok(both.indexOf('Plumbing rough-in') >= 0 && both.indexOf('Plumbing rough-in') < both.indexOf('Plumbing fit-off'));
  const roughIn = steps(draft('Rough-in the plumbing for the new bathroom.', 'plumbing'));
  assert.ok(roughIn.includes('Plumbing rough-in') && !roughIn.includes('Plumbing fit-off'));
});

test('a pipe is cleaned and inspected, then relined, as separate steps', () => {
  const reline = steps(draft('Inspect the sewer with a CCTV camera and reline it with a cured in place liner.', 'plumbing'));
  assert.ok(reline.indexOf('Clean and inspect the pipe') >= 0 && reline.indexOf('Clean and inspect the pipe') < reline.indexOf('Reline the pipe'));
  // The drain clearing step does the cleaning where it is there.
  const cleared = steps(draft('Clean, inspect and reline the sewer pipe under the house.', 'plumbing'));
  assert.ok(cleared.includes('Clear the drain with a drain machine or jetter') && cleared.includes('Reline the pipe') && !cleared.includes('Clean and inspect the pipe'));
});

test('an old septic tank is pumped out, then removed, as separate steps', () => {
  const names = steps(draft('Pump out and remove the old septic tank and install a new treatment plant.', 'plumbing'));
  assert.ok(names.indexOf('Pump out the septic tank') >= 0 && names.indexOf('Pump out the septic tank') < names.indexOf('Remove the old septic tank'));
  assert.ok(names.indexOf('Remove the old septic tank') < names.indexOf('Lift and place tanks, pits or precast units'));
});

test('timber floors are cut and laid as separate steps, with damaged boards cut out only in a repair', () => {
  const lay = steps(draft('Install engineered timber floors in the apartments.', 'flooring'));
  assert.ok(lay.includes('Cut timber flooring to size') && lay.includes('Lay timber floors'));
  assert.ok(!lay.includes('Cut out the damaged floorboards'));
  assert.ok(steps(draft('Replace the damaged timber floorboards in the hallway.', 'flooring')).includes('Cut out the damaged floorboards'));
});

test('re-roofing a tiled roof strips the tiles, lays sarking, fixes battens and re-lays the tiles as separate steps', () => {
  const all = steps(draft('Strip and re-tile the roof.', 'roofing'));
  assert.deepEqual(all.filter((name) => /tiles|sarking|battens/.test(name)), ['Strip the roof tiles', 'Lay the sarking', 'Fix new roof battens', 'Lay the roof tiles']);
  const slate = steps(draft('Strip the slate roof and re-batten.', 'roofing'));
  assert.ok(slate.includes('Strip the slates') && slate.includes('Fix new roof battens') && slate.includes('Lay the slates'));
  assert.ok(!slate.includes('Lay the sarking'), 'sarking is not named');
});

test('tile adhesive, screed, grout and sealer are separate steps, shown only when the task names them', () => {
  const laid = steps(draft('Lay floor tiles with adhesive and grout the joints.', 'tiling'));
  assert.ok(laid.includes('Mix and spread the tile adhesive') && laid.includes('Grout the tiles'));
  assert.ok(!laid.includes('Lay the screed') && !laid.includes('Apply sealer to the tiles and grout'));
  assert.ok(laid.indexOf('Lay tiles') < laid.indexOf('Grout the tiles'), 'grout goes on after the tiles');
  const sealed = steps(draft('Seal the stone tiles with a penetrating sealer.', 'tiling'));
  assert.ok(sealed.includes('Apply sealer to the tiles and grout') && !sealed.includes('Grout the tiles') && !sealed.includes('Mix and spread the tile adhesive'));
  assert.ok(steps(draft('Lay the sand and cement screed and tile the bathroom floor.', 'tiling')).includes('Lay the screed'));
});

test('facade fixings are drilled and joints sealed as separate steps; resealing joints drills nothing', () => {
  const fix = steps(draft('Fix the facade brackets to the slab edges and seal the panel joints with silicone.', 'facade'));
  assert.ok(fix.includes('Drill fixing holes in the slab edge') && fix.includes('Seal the facade joints'));
  const reseal = steps(draft('Work from swing stages on the outside of the building to seal joints, fix sunshades and replace damaged glazing.', 'facade'));
  assert.ok(reseal.includes('Seal the facade joints') && !reseal.includes('Drill fixing holes in the slab edge'));
});

test('doors, cabinets and trim are separate joinery steps', () => {
  const all = steps(draft('Install doors, kitchen cabinets and skirting.', 'carpentry'));
  assert.ok(all.includes('Hang the doors') && all.includes('Install joinery and cabinets') && all.includes('Fix skirting and architraves'));
  assert.ok(!steps(draft('Install the kitchen cabinets.', 'carpentry')).includes('Hang the doors'));
});

test('door frames are stood and doors hung as separate steps', () => {
  const hang = steps(draft('Hang the internal doors.', 'doors'));
  assert.ok(hang.includes('Hang the doors') && !hang.includes('Stand the door frames'));
  const frames = steps(draft('Install the door frames on level 3.', 'doors'));
  assert.ok(frames.includes('Stand the door frames') && !frames.includes('Hang the doors'));
});

test('post holes are dug and the fence built as separate steps; a paling repair digs no holes', () => {
  const build = steps(draft('Build a new colorbond fence with posts in concrete.', 'fencing'));
  assert.ok(build.includes('Dig post holes') && build.includes('Build the fence'));
  const repair = steps(draft('Repair the broken fence palings.', 'fencing'));
  assert.ok(repair.includes('Build the fence') && !repair.includes('Dig post holes'));
});

test('fascia, gutters and downpipes, and eaves linings are separate steps', () => {
  const all = steps(draft('Replace gutters, fascia and downpipes on a house.', 'roofing'));
  assert.ok(all.includes('Replace the fascia boards') && all.includes('Install gutters and downpipes'));
  const eaves = steps(draft('Install new gutters and reline the eaves.', 'roofing'));
  assert.ok(eaves.includes('Install gutters and downpipes') && eaves.includes('Install the eaves linings') && !eaves.some((name) => /fascia/.test(name)));
});

test('steel welding is its own step, as bolting is part of erecting and connecting the steel', () => {
  assert.ok(steps(draft('Bolt and weld the steel beams and columns.', 'steel')).includes('Weld steel'));
});

test('abrasive blasting is its own step and the repaint comes from the painting steps', () => {
  const done = steps(draft('Abrasive blast and repaint the steel beams on the bridge.', 'painting'));
  assert.ok(done.includes('Abrasive blast the surfaces') && done.includes('Paint'));
});

test('metal decking and shear stud welding are separate steps', () => {
  const both = steps(draft('Lay the metal decking and weld the shear studs.', 'steel'));
  assert.ok(both.includes('Lay metal decking') && both.includes('Weld shear studs'));
  assert.ok(!both.includes('Braze and solder pipe joints (hot work)'));
  const studs = steps(draft('Weld shear studs on the existing metal decking.', 'steel'));
  assert.ok(studs.includes('Weld shear studs') && !studs.includes('Lay metal decking'));
});

test('playground equipment and rubber softfall are separate steps', () => {
  const both = steps(draft('Install new playground equipment and rubber softfall at a council park.', 'landscaping'));
  assert.ok(both.includes('Install playground equipment') && both.includes('Lay the rubber softfall'));
  assert.ok(!steps(draft('Install the playground equipment.', 'landscaping')).includes('Lay the rubber softfall'));
});

test('shade sail posts are stood and sails fitted as separate steps; new sails on old posts stand no posts', () => {
  const both = steps(draft('Install new playground shade sails at a school.', 'landscaping'));
  assert.ok(both.includes('Stand the shade sail posts') && both.includes('Fit and tension the shade sails'));
  const sails = steps(draft('Replace the shade sails on the existing posts.'));
  assert.ok(sails.includes('Fit and tension the shade sails') && !sails.includes('Stand the shade sail posts'));
});

test('the tank stand is built and the tank lifted on as separate steps', () => {
  const both = steps(draft('Build a steel tank stand and lift the rainwater tank onto it.', 'plumbing'));
  assert.ok(both.includes('Build the tank stand') && both.includes('Lift the tank onto the stand'));
  assert.ok(!steps(draft('Build the tank stand.', 'plumbing')).includes('Lift the tank onto the stand'));
});

test('the stage is built and the lighting rigged as separate steps', () => {
  const both = steps(draft('Build the temporary stage and rig the lighting for the concert.'));
  assert.ok(both.includes('Build the stage') && both.includes('Rig the lighting'));
  const rig = steps(draft('Rig the lighting trusses for the concert.'));
  assert.ok(rig.includes('Rig the lighting') && !rig.includes('Build the stage'));
});

test('site fencing, hoardings and gantries are separate steps', () => {
  const street = steps(draft('Erect hoardings and a gantry along the street frontage.', 'site'));
  assert.ok(street.includes('Erect the hoardings') && street.includes('Erect the gantry') && !street.includes('Erect temporary fencing'));
  const fence = steps(draft('Erect temporary fencing around the site.', 'site'));
  assert.ok(fence.includes('Erect temporary fencing') && !fence.includes('Erect the hoardings') && !fence.includes('Erect the gantry'));
});

test('construction power and temporary lighting are separate steps; lighting alone installs no power', () => {
  const both = steps(draft('Install construction power and temporary lighting for the new building.', 'electrical'));
  assert.ok(both.includes('Install construction power') && both.includes('Install temporary lighting'));
  const light = steps(draft('Install temporary lighting in the stairwells.', 'electrical'));
  assert.ok(light.includes('Install temporary lighting') && !light.includes('Install construction power'));
});

test('comms racks and cabinets are stood before the equipment goes in, as separate steps', () => {
  const done = steps(draft('Install comms racks and equipment in the comms room.'));
  assert.ok(done.includes('Install comms racks and cabinets') && done.includes('Install comms equipment'));
});

test('hydraulic risers and pipework are installed in a step that does not name the height', () => {
  assert.ok(steps(draft('Install hydraulic risers and pipework in the shafts.', 'plumbing')).includes('Install risers and pipework'));
});

test('hydronic pipes are laid and fixed, then pressure tested, as separate steps', () => {
  const done = steps(draft('Install hydronic heating pipes in the slab and pressure test.', 'plumbing'));
  assert.ok(done.includes('Lay and fix the hydronic pipes') && done.includes('Pressure test the hydronic pipes'));
});

test('the boiler is moved and set, then connected, as separate steps', () => {
  const done = steps(draft('Install the new gas boiler in the plant room.', 'plumbing'));
  assert.ok(done.includes('Move and set the boiler') && done.includes('Connect the boiler'));
});

test('pool plant and chemical dosing are separate steps; dosing alone installs no pool plant', () => {
  const both = steps(draft('Install the pool plant and chemical dosing at the aquatic centre.', 'plumbing'));
  assert.ok(both.includes('Install the pool plant') && both.includes('Install the chemical dosing'));
  const dosing = steps(draft('Install the pool chemical dosing system.', 'plumbing'));
  assert.ok(dosing.includes('Install the chemical dosing') && !dosing.includes('Install the pool plant'));
});

test('a processing plant is run and maintained as separate steps, named for the plant', () => {
  const crush = steps(draft('Operate the crushing and screening plant at the quarry.'));
  assert.ok(crush.includes('Run the crushing and screening plant') && crush.includes('Maintain the crushing and screening plant'));
  const batch = steps(draft('Run the concrete batching plant.'));
  assert.ok(batch.includes('Run the batching plant') && batch.includes('Maintain the batching plant'));
});

test('high voltage cables are prepared and terminated, then tested, as separate steps', () => {
  const done = steps(draft('Terminate and test the 11 kV high voltage cables at the substation.', 'electrical'));
  assert.ok(done.includes('Prepare and terminate the high voltage cables') && done.includes('Test the high voltage cables'));
});

test('sprinkler and hydrant pipework are separate steps, each when named and both when neither is', () => {
  const both = steps(draft('Install sprinkler and hydrant pipework on levels 1 to 5.', 'fire'));
  assert.ok(both.includes('Install sprinkler pipework') && both.includes('Install hydrant pipework'));
  const sprinkler = steps(draft('Install sprinkler pipework in the ceilings on level 4.', 'fire'));
  assert.ok(sprinkler.includes('Install sprinkler pipework') && !sprinkler.includes('Install hydrant pipework'));
  const hydrant = steps(draft('Install hydrant pipework in the risers.', 'fire'));
  assert.ok(hydrant.includes('Install hydrant pipework') && !hydrant.includes('Install sprinkler pipework'));
  const neither = steps(draft('Install fire services pipework at height.', 'fire'));
  assert.ok(neither.includes('Install sprinkler pipework') && neither.includes('Install hydrant pipework'));
});

test('work on live fire systems and work in the pump room are separate steps; the pump room only when named', () => {
  const both = steps(draft('Isolate the fire pumps in the pump room and drain the sprinkler system.', 'fire'));
  assert.ok(both.includes('Work on live fire systems') && both.includes('Work in pump rooms'));
  const live = steps(draft('Isolate the live sprinkler system to connect new heads.', 'fire'));
  assert.ok(live.includes('Work on live fire systems') && !live.includes('Work in pump rooms'));
});

test('the door and its motor are installed as separate steps; a motor alone hangs no door', () => {
  const both = steps(draft('Install a new garage door and motor on a house.'));
  assert.ok(both.includes('Install the door') && both.includes('Install the door motor'));
  const motor = steps(draft('Replace the garage door motor.'));
  assert.ok(motor.includes('Install the door motor') && !motor.includes('Install the door'));
});

test('the rainwater tank and its pump are separate steps; the pump only when named', () => {
  const both = steps(draft('Install a rainwater tank and pump at the house.', 'plumbing'));
  assert.ok(both.includes('Install the rainwater tank') && both.includes('Install the pump'));
  const tank = steps(draft('Install a rainwater tank at the house.', 'plumbing'));
  assert.ok(tank.includes('Install the rainwater tank') && !tank.includes('Install the pump'));
  const pump = steps(draft('Replace the rainwater tank pump.', 'plumbing'));
  assert.ok(pump.includes('Install the pump') && !pump.includes('Install the rainwater tank'));
});

test('fuel lines and fuel dispensers are separate steps, each when named', () => {
  const both = steps(draft('Install new fuel dispensers and fuel lines at the service station.'));
  assert.ok(both.includes('Install fuel lines') && both.includes('Install fuel dispensers'));
  const dispensers = steps(draft('Replace the fuel dispensers at the service station.'));
  assert.ok(dispensers.includes('Install fuel dispensers') && !dispensers.includes('Install fuel lines'));
});

test('clean room walls and ceilings and the clean room flooring are separate steps, each when named', () => {
  const both = steps(draft('Install the clean room walls, ceilings and floor for the pharmacy.'));
  assert.ok(both.includes('Install clean room walls and ceilings') && both.includes('Install clean room flooring'));
  const panels = steps(draft('Install clean room wall and ceiling panels.'));
  assert.ok(panels.includes('Install clean room walls and ceilings') && !panels.includes('Install clean room flooring'));
});
test('plasterboard is cut and fixed, set, and sanded as separate steps, each when named', () => {
  const all = steps(draft('Cut in and set the new plasterboard patches in the corridor walls.', 'plasterboard'));
  assert.ok(all.includes('Cut and fix plasterboard') && all.includes('Set the joints') && all.includes('Sand the joints'));
  const sand = steps(draft('Sand the joints on the level 2 plasterboard walls.', 'plasterboard'));
  assert.ok(sand.includes('Sand the joints') && !sand.includes('Set the joints') && !sand.some((name) => /^Cut/.test(name)));
  // Sheets fixed in their own step: the cutting step is only the cutting, and comes first.
  const hang = steps(draft('Install, set and sand plasterboard walls in the new office.', 'plasterboard'));
  assert.ok(hang.indexOf('Cut plasterboard') >= 0 && hang.indexOf('Cut plasterboard') < hang.indexOf('Move and fix plasterboard sheets'));
});

test('windows, doors and louvres are separate steps, each when named', () => {
  const all = steps(draft('Install aluminium windows, fixed glass louvres and doors.', 'glazing'));
  assert.ok(all.includes('Install windows') && all.includes('Install doors') && all.includes('Install louvres'));
  const windows = steps(draft('Install new aluminium windows on levels 2 to 6.', 'glazing'));
  assert.ok(windows.includes('Install windows') && !windows.includes('Install doors') && !windows.includes('Install louvres'));
  const doors = steps(draft('Replace the sliding doors to the balconies.', 'glazing'));
  assert.ok(doors.includes('Install doors') && !doors.includes('Install windows'));
});

test('cladding battens are fixed as their own step before the cladding', () => {
  const clad = steps(draft('Install fibre cement cladding to the new house.', 'carpentry'));
  assert.ok(clad.indexOf('Fix the battens') >= 0 && clad.indexOf('Fix the battens') < clad.indexOf('Install the external cladding'));
  const boards = steps(draft('Replace the rotten weatherboards on the west wall.', 'carpentry'));
  assert.ok(boards.includes('Replace the cladding boards') && !boards.includes('Fix the battens'));
});

test('masonry joints are raked out and repointed as separate steps', () => {
  const done = steps(draft('Rake out and repoint the sandstone walls of the church.', 'masonry'));
  assert.ok(done.indexOf('Rake out the joints') >= 0 && done.indexOf('Rake out the joints') < done.indexOf('Repoint the masonry'));
});

test('timber floors are sanded and coated as separate steps; a coat alone sands nothing', () => {
  const both = steps(draft('Sand and polish the timber floors in the house.', 'flooring'));
  assert.ok(both.includes('Sand timber floors') && both.includes('Coat timber floors'));
  const coat = steps(draft('Coat the timber floors with polyurethane.', 'flooring'));
  assert.ok(coat.includes('Coat timber floors') && !coat.includes('Sand timber floors'));
  const deck = steps(draft('Strip, sand and oil the timber deck.', 'carpentry'));
  assert.ok(deck.includes('Strip and sand the deck') && deck.includes('Oil or stain the deck'));
});

test('fly screens and security doors are separate steps, each when named', () => {
  const both = steps(draft('Supply and install security doors and fly screens to the unit.'));
  assert.ok(both.includes('Fit fly screens') && both.includes('Fit security doors') && !both.includes('Hang the doors'));
  const doors = steps(draft('Fit a new security screen door at the back door.'));
  assert.ok(doors.includes('Fit security doors') && !doors.some((name) => /screens$/.test(name)));
});

test('the valley iron is replaced and the tiles rebedded as separate steps, without re-roofing', () => {
  const done = steps(draft('Replace the valley iron on a tiled roof.', 'roofing'));
  assert.ok(done.indexOf('Replace the valley iron') >= 0 && done.indexOf('Replace the valley iron') < done.indexOf('Rebed the tiles'));
  assert.ok(!done.includes('Strip the roof tiles') && !done.includes('Lay the roof tiles'));
});

test('safety mesh and sarking are separate steps, each when named', () => {
  const both = steps(draft('Install safety mesh and sarking and new roof sheets on the warehouse.', 'roofing'));
  assert.ok(both.indexOf('Install safety mesh') >= 0 && both.indexOf('Install safety mesh') < both.indexOf('Install sarking') && both.indexOf('Install sarking') < both.indexOf('Fix new roofing'));
  const mesh = steps(draft('Install safety mesh over the purlins on the new warehouse.', 'roofing'));
  assert.ok(mesh.includes('Install safety mesh') && !mesh.includes('Install sarking'));
});

test('solvent-based paint is applied as its own step, after the painting and before the clean-up', () => {
  const done = steps(draft('Paint the interior walls with solvent-based enamel.', 'painting'));
  assert.ok(done.indexOf('Apply solvent-based paint') > done.indexOf('Paint') && done.indexOf('Apply solvent-based paint') < done.indexOf('Clean brushes and rollers'));
});
// Site set-up, civil, concrete and structure steps: one activity per step.
test('the hoist is installed and its mast climbed as separate steps; a climb alone installs nothing', () => {
  const both = steps(draft('Install, climb and dismantle the personnel and materials hoist on the building face.', 'builder'));
  assert.ok(both.includes('Install and dismantle the hoist') && both.includes('Climb the hoist mast'));
  const climb = steps(draft('Climb the materials hoist mast to level 12.', 'builder'));
  assert.ok(climb.includes('Climb the hoist mast') && !climb.includes('Install and dismantle the hoist'));
});

test('roof access and roof edge protection are separate steps, for the roofer and for other trades', () => {
  const roofer = steps(draft('Remove and replace the corrugated iron roof sheets on a two storey house.', 'roofing'));
  assert.ok(roofer.includes('Set up roof access') && roofer.includes('Install roof edge protection'));
  assert.ok(roofer.indexOf('Install roof edge protection') < roofer.indexOf('Remove old roofing'));
  const other = steps(draft('Install condensing units and exhaust fans on the roof, next to the roof edge.', 'mechanical'));
  assert.ok(other.includes('Get onto the roof') && other.includes('Set up roof fall protection'));
});

test('a trench is backfilled, and its surface reinstated only where there is one', () => {
  const plain = steps(draft('Excavate a 1.2 m trench and lay a new sewer line to the house.', 'plumbing'));
  assert.ok(plain.includes('Backfill the trench') && !plain.includes('Reinstate the surface'));
  const lawn = steps(draft('Excavate a trench across the lawn for a new stormwater pipe and backfill.', 'plumbing'));
  assert.ok(lawn.includes('Backfill the trench') && lawn.indexOf('Reinstate the surface') > lawn.indexOf('Backfill the trench'));
});

test('loading platforms are installed in their own step only when the task installs them', () => {
  const use = steps(draft('Load out each floor using the tower crane and the loading platforms.'));
  assert.ok(use.includes('Load out the floors') && !use.includes('Install loading platforms'));
  const both = steps(draft('Relocate the loading platform up a level and load out the floor with the tower crane.'));
  assert.ok(both.includes('Install loading platforms') && both.includes('Load out the floors'));
});

test('a slab on ground is set out, prepared, finished, joint cut and cured as separate steps', () => {
  const slab = steps(draft('Excavate, form, reinforce and pour a concrete house slab on ground with edge beams, finished with a power trowel, and saw cut control joints.', 'concreting'));
  for (const name of ['Set out', 'Prepare the ground', 'Finish the concrete', 'Saw cut the joints', 'Cure the concrete']) assert.ok(slab.includes(name), name);
  const noJoints = steps(draft('Form and pour a concrete driveway at a house.', 'concreting'));
  assert.ok(noJoints.includes('Finish the concrete') && !noJoints.includes('Saw cut the joints'));
  const crossover = steps(draft('Build a new vehicle crossover to council standards.', 'concreting'));
  assert.ok(crossover.includes('Box out the crossover') && !crossover.includes('Prepare the ground'));
});

test('formwork edge protection, the deck, the pour watch, stripping and backprops are separate steps', () => {
  const form = steps(draft('Erect the slab formwork and falsework, lay the deck, install edge protection, then strip the formwork and install backprops.', 'formwork'));
  for (const name of ['Install edge protection', 'Lay the formwork deck', 'Monitor the formwork during the pour', 'Strip the formwork', 'Install backprops']) assert.ok(form.includes(name), name);
  assert.ok(!form.includes('Install or remove edge protection'), 'one edge protection step');
  assert.ok(form.indexOf('Strip the formwork') < form.indexOf('Install backprops'));
});

test('basement edge, wall drainage, concrete repair, collapsed wall and spoil are split by activity', () => {
  const basement = steps(draft('Bulk excavate the basement with excavators and trucks.', 'civil'));
  assert.ok(basement.includes('Protect the basement edge') && basement.includes('Provide access into the basement'));
  const wall = steps(draft('Install ag drainage and backfill behind the new retaining wall.', 'landscaping'));
  assert.ok(wall.includes('Install drainage behind the retaining wall') && wall.includes('Backfill behind the retaining wall'));
  const repair = steps(draft('Break out and repair spalled concrete on the car park columns.'));
  assert.ok(repair.includes('Break out damaged concrete') && repair.includes('Repair the concrete'));
  const driveway = steps(draft('Repair a concrete driveway with cracks and trip hazards.'));
  assert.ok(driveway.includes('Break out damaged concrete') && !driveway.includes('Repair the concrete') && !driveway.includes('Set out'));
  const street = steps(draft('Clear the collapsed front brick wall next to the footpath and rebuild it.'));
  assert.ok(street.indexOf('Protect the footpath') >= 0 && street.indexOf('Protect the footpath') < street.indexOf('Clear the collapsed wall'));
  assert.ok(!steps(draft('Clear the collapsed brick boundary wall in the back yard.')).includes('Protect the footpath'));
  const spoil = steps(draft('Excavate the basement, stockpile the spoil and cart it away to a licensed tip.', 'civil'));
  assert.ok(spoil.includes('Stockpile and cover spoil') && spoil.includes('Cart away spoil'));
});

test('heavy and dual lifts are planned and carried out as separate steps', () => {
  const heavy = steps(draft('Heavy lift of the 120 t transformer onto its plinth with a 400 t crawler crane.'));
  assert.ok(heavy.includes('Plan the heavy lift') && heavy.includes('Carry out the heavy lift'));
  const dual = draft('Dual lift the bridge girder with two mobile cranes.');
  assert.ok(steps(dual).includes('Plan the dual lift') && steps(dual).includes('Carry out the dual lift'));
  assert.ok(dual.qualifications.some((name) => /intermediate rigging \(RI\) or higher, for the dual lift/.test(name)));
});

test('a shallow trench is dug and the pipe or cable laid as separate steps', () => {
  const pipes = steps(draft('Dig a shallow trench by hand and lay irrigation pipe to the garden tap.', 'plumbing'));
  assert.ok(pipes.includes('Dig the trench') && pipes.includes('Lay the pipes'));
});

test('trees, stumps, soil, planting and the green roof are split by activity', () => {
  const trees = steps(draft('Fell and remove two dead gum trees and grind out the roots.', 'landscaping'));
  assert.ok(trees.includes('Remove trees') && trees.includes('Remove stumps and roots'));
  const mulch = steps(draft('Spread mulch over the garden beds.', 'landscaping'));
  assert.ok(mulch.includes('Move soil and mulch') && !mulch.includes('Plant'));
  const both = steps(draft('Plant shrubs and trees and spread mulch in the new garden beds.', 'landscaping'));
  assert.ok(both.includes('Move soil and mulch') && both.includes('Plant'));
  const roof = steps(draft('Install the green roof drainage layers, growing media and plants.'));
  assert.ok(roof.includes('Install the green roof layers') && roof.includes('Plant the green roof') && !roof.includes('Plant'));
});

test('decks, floor frames, kit structures and ground mount solar are split by activity', () => {
  const deck = steps(draft('Build a timber deck 2.5 m above the ground at the back of a house, digging post holes and concreting the posts.', 'carpentry'));
  for (const name of ['Set out', 'Dig post holes', 'Build the deck frame', 'Lay the decking']) assert.ok(deck.includes(name), name);
  const boards = steps(draft('Replace the rotten deck boards on the back deck.', 'carpentry'));
  assert.ok(boards.includes('Remove and replace the decking') && !boards.includes('Build the deck frame') && !boards.includes('Dig post holes'));
  const floor = steps(draft('Lay floor joists and particleboard flooring for the new upper storey extension.', 'carpentry'));
  assert.ok(floor.includes('Lay floor joists') && floor.includes('Lay the floor deck'));
  const carport = steps(draft('Build a colorbond carport with a skillion roof.', 'carpentry'));
  assert.ok(carport.includes('Erect the frame') && carport.includes('Fix the roof'));
  const pergola = steps(draft('Build a timber pergola at ground level.', 'carpentry'));
  assert.ok(pergola.includes('Erect the frame') && !pergola.includes('Fix the roof'));
  const solar = steps(draft('Install a ground mount solar array on the farm.', 'electrical'));
  assert.ok(solar.includes('Install the ground mount frame') && solar.includes('Install the solar panels'));
});
test('drill and blast work is the excavation trade\'s, and a basement blast digs no trench', () => {
  const task = 'Drill and blast rock in the basement excavation.';
  assert.ok(kinds(task, 'excavation').includes('blasting'));
  const done = steps(draft(task, 'excavation'));
  assert.ok(done.includes('Drill the blast holes') && done.includes('Charge and fire the blast'));
  for (const name of ['Lay pipes', 'Work in the trench', 'Excavate']) assert.ok(!done.includes(name), name);
  // A trench that is named is still dug.
  assert.ok(kinds('Drill and blast rock in the basement for the sewer trench.', 'excavation').includes('trench'));
});

test('a septic tank pumped out and filled with sand is decommissioned, with no pump-out line', () => {
  const done = steps(draft('Pump out the septic tank and fill it with sand.'));
  assert.ok(done.includes('Pump out the septic tank'));
  assert.ok(!done.includes('Install the pump-out line'));
  assert.ok(steps(draft('Install a pump-out line to the septic tank.', 'plumbing')).includes('Install the pump-out line'));
});

test('drilling into post-tensioned slabs for anchors is not pouring a slab', () => {
  const task = 'Install cable tray and pull structured data cabling in the tower risers, drilling into the post-tensioned slabs for tray anchors.';
  for (const trade of ['', 'communications', 'electrical']) {
    for (const id of ['formwork', 'reo', 'ptTendons', 'concrete', 'stressing']) assert.ok(!kinds(task, trade).includes(id), `${trade}: ${id}`);
  }
  assert.ok(steps(draft(task, 'communications')).includes('Pull communications cabling'));
  // Building the post-tensioned slab is still that work.
  assert.ok(kinds('Install and pour the post-tensioned slabs on level 3.', 'structure').includes('stressing'));
});

test('blasting the old paint off is not painting, unless repainting is named', () => {
  const done = steps(draft('Sandblast the old paint off the steel.', 'painting'));
  assert.ok(done.includes('Abrasive blast the surfaces') && !done.includes('Paint') && !done.includes('Prepare to paint'));
  assert.ok(steps(draft('Sandblast the old paint off the steel and repaint it.', 'painting')).includes('Paint'));
  assert.ok(steps(draft('Strip wallpaper and paint walls in a 1960s house.')).includes('Paint'));
});

test('a rainwater tank on a new steel stand gets the tank stand steps', () => {
  const done = steps(draft('Install the rainwater tank on a new 2 m steel stand.', 'plumbing'));
  assert.ok(done.includes('Build the tank stand') && done.includes('Install the rainwater tank'));
});

test('tiling always mixes adhesive and grouts; screed and sealer only when named', () => {
  for (const trade of ['tiling', '']) {
    const done = steps(draft('Tile the bathroom floors and walls.', trade));
    assert.ok(done.includes('Mix and spread the tile adhesive') && done.includes('Grout the tiles'), trade);
    assert.ok(!done.includes('Lay the screed') && !done.includes('Apply sealer to the tiles and grout'), trade);
  }
  const named = steps(draft('Screed and tile the bathroom floor, then seal the tiles.', 'tiling'));
  assert.ok(named.includes('Lay the screed') && named.includes('Apply sealer to the tiles and grout'));
});

test('commissioning a diesel fire pumpset gets the pump room step', () => {
  for (const trade of ['fire', '']) assert.ok(steps(draft('Commission the diesel fire pumpset in the pump room.', trade)).includes('Work in pump rooms'), trade);
});

test('replacing a garage door motor takes down no door', () => {
  for (const trade of ['doors', '']) {
    const done = steps(draft('Replace the garage door motor.', trade));
    assert.ok(done.includes('Install the door motor') && !done.includes('Take down the old roller door'), trade);
  }
  assert.ok(steps(draft('Remove the old roller door and install a new roller door with a motor.', 'doors')).includes('Take down the old roller door'));
});

test('comms racks and cabinets are electrical trade work too', () => {
  assert.ok(steps(draft('Install communications racks and cabinets in the comms rooms.', 'electrical')).includes('Install comms racks and cabinets'));
});

test('grinding tree stumps is tree work, not restumping a house', () => {
  for (const task of ['Remove three trees and grind the stumps.', 'Grind the old stumps.']) {
    const done = steps(draft(task));
    assert.ok(done.includes('Remove stumps and roots') && !done.includes('Jack the house and replace stumps'), task);
  }
  assert.ok(steps(draft('Restump the house with new steel stumps.')).includes('Jack the house and replace stumps'));
});

test('a flat roof built over an existing deck is roofed and builds no deck', () => {
  for (const trade of ['carpentry', '']) {
    const done = steps(draft('Build a flat roof over the existing back deck.', trade));
    assert.ok(done.includes('Erect the posts, beams and rafters') && done.includes('Fix new roofing'), trade);
    assert.ok(!done.includes('Build the deck frame and lay the decking') && !done.includes('Set out and dig post holes'), trade);
  }
});

test('painting car park columns and soffits relines no eaves', () => {
  for (const task of ['Paint the car park columns and soffits.', 'Paint the new car park columns and soffits.']) {
    const done = steps(draft(task, 'painting'));
    assert.ok(done.includes('Paint') && !done.includes('Fit the new eave lining'), task);
  }
});

test('a trench for irrigation or a garden tap gets one set of trench steps', () => {
  for (const trade of ['plumbing', 'landscaping', '']) {
    const done = steps(draft('Dig a trench for the irrigation line and a garden tap.', trade));
    assert.ok(done.includes('Dig the trench') && done.includes('Lay the pipes'), trade);
    assert.ok(!done.includes('Lay pipes') && !done.includes('Work in the trench'), trade);
  }
  const deep = steps(draft('Dig the subsoil drainage trenches across the pitch with an excavator, up to 1 m deep, lay the drainage pipe and irrigation, then lay the turf rolls.', 'landscaping'));
  assert.ok(deep.includes('Excavate') && !deep.includes('Dig the trench') && !deep.includes('Lay the pipe or cable'));
});

test('chilled water pipework with insulation to ductwork and filter cleaning installs the pipework only', () => {
  const done = steps(draft('Chilled water pipework including valves, control valves, insulation. Insulation to ductwork, conditioner housings and plenums. Cleaning or replacing filters as required, including filters within any air handling unit.', 'mechanical', { state: 'vic', fallRisk: 'yes' }));
  assert.ok(done.includes('Install mechanical pipework') && done.includes('Insulate ductwork and pipework'));
  assert.ok(!done.includes('Install ductwork') && !done.includes('Fix the units in place'));
  // Ductwork and air handling units that are installed keep their steps.
  const both = steps(draft('Chilled water pipework including valves. Install the ductwork and the air handling units.', 'mechanical'));
  assert.ok(both.includes('Install ductwork') && both.includes('Fix the units in place') && both.includes('Install mechanical pipework'));
});

test('live electrical work near comms equipment is the user\'s answer, and Yes adds the isolation by others step', () => {
  const task = 'Install admin handsets, intercoms and door stations in the ceilings and comms rooms.';
  const asked = questionsFor({ state: 'nsw', fallRisk: 'no', residential: 'no', task, trade: '', kinds: kinds(task) });
  assert.ok((asked.required || []).some((item) => item.id === 'liveElectrical'));
  const no = draft(task, '', { facts: { liveElectrical: 'no' } });
  assert.ok(!no.highRisk.some((line) => /energised electrical/i.test(line)));
  assert.ok(!steps(no).includes('Confirm the isolation by others before work'));
  for (const answer of ['yes', 'unsure']) {
    const live = draft(task, '', { facts: { liveElectrical: answer } });
    assert.ok(live.highRisk.some((line) => /energised electrical/i.test(line)), answer);
    assert.ok(steps(live).includes('Confirm the isolation by others before work'), answer);
  }
});

test('a step for work the scope gives to others can be left out', () => {
  const task = 'Install and fit off the light fittings and power points in the new offices.';
  const all = steps(draft(task, 'electrical'));
  assert.ok(all.includes('Rough-in') || all.includes('Fit off'));
  const left = steps(draft(task, 'electrical', { leaveOut: ['Rough-in'] }));
  assert.ok(!left.includes('Rough-in') && left.includes('Before starting'));
});

test('explosive-powered fixing tools are not blasting: the SWMS is not stood down for shotfirer work', () => {
  const { prepareDraft } = require('../draft');
  const d = prepareDraft({ state: 'nsw', task: 'Install pipe and duct supports. Fix using explosive and low velocity (powder-actuated) tool fasteners. Install ductwork.', fallRisk: 'no', residential: 'no' });
  assert.equal(d.kind, 'draft');
  assert.ok(!d.jobSteps.some((step) => /blast/i.test(step.step)));
  const blast = prepareDraft({ state: 'nsw', task: 'Drill and blast the rock in the cutting using explosives, licensed shotfirer.', fallRisk: 'no', residential: 'no' });
  assert.ok(blast.jobSteps.some((step) => step.step === 'Charge and fire the blast'));
});

// Content review of drafts built from AI scope readings (samples S7 to S105).
const work = (done, name) => done.jobSteps.find((step) => step.step === name);
const lines = (step) => [...step.hazards, ...step.controls].map((line) => line.text || line).join('\n');

test('the trench steps follow the trench category: support when it is ticked, under 1.5 m when it is not', () => {
  // A trench picked for in-ground services: the support answer names trenches, so the category is ticked.
  const deep = draft('Install in-ground and under-slab fire services (Under building slabs).', 'fire', { kinds: ['trench'] });
  assert.match(risks(deep), /trench/i);
  assert.match(lines(work(deep, 'Work in the trench')), /No one enters the trench until the support is in place/);
  assert.doesNotMatch(lines(work(deep, 'Work in the trench')), /kept shallower than 1\.5 m/);
  assert.match(lines(work(deep, 'Excavate')), /all sides supported by shoring, benching or battering/);
  // A stated shallow trench is not high risk, and the trench step keeps it under 1.5 m.
  const shallow = draft('Dig a 1.2 m deep trench and lay the stormwater pipe.', 'plumbing', { kinds: ['trench'], facts: { trenchSupport: 'The trench is 1.2 m deep at most, with the sides battered where the ground is loose.' } });
  assert.doesNotMatch(risks(shallow), /trench/i);
  assert.match(lines(work(shallow, 'Work in the trench')), /kept shallower than 1\.5 m/);
  assert.doesNotMatch(lines(work(shallow, 'Work in the trench')), /support is in place/);
});

test('"deeper than 1.5 m" is past 1.5 m, so deep sewer work keeps the trench category', () => {
  assert.ok(highRiskMatches('Dig the sewer trench deeper than 1.5 m.', 'no', 'qld').some((item) => item.check === 'trench'));
  assert.ok(!highRiskMatches('Dig the sewer trench no deeper than 1.5 m.', 'no', 'qld').some((item) => item.check === 'trench'));
  // A new pump station adds "shaft excavation deeper than 1.5 m", which must not read as a 1.5 m trench.
  const done = draft('Trench, excavate, bed, backfill and compact for the sewer. Install sewer manholes. Install sewer pump stations with control panels and covers. Install deep sewer branches 1 and 2.', 'plumbing');
  assert.match(risks(done), /trench/i);
});

test('cutting out pipe or duct in an existing building is not demolition of a load-bearing element, and does not assume asbestos', () => {
  const pipe = draft('Identify, label and protect existing fire services to be retained or demolished (Existing Visitor Processing building). Cut out section of existing pipe and blank off retained pipework (Existing Visitor Processing building).', 'fire', { kinds: ['serviceLabels', 'servicesStrip'] });
  assert.doesNotMatch(risks(pipe), /load-bearing|asbestos/i);
  const duct = draft('Identify, label and protect existing plant to be retained or demolished (Visitor Processing building). Remove sections of existing duct and blank off retained duct (Visitor Processing building). Recover refrigerant from plant to be demolished (Visitor Processing building).', 'mechanical', { kinds: ['servicesStrip', 'serviceLabels', 'refrigerantCharge'] });
  assert.doesNotMatch(risks(duct), /load-bearing|asbestos/i);
  // A building that is itself demolished still is.
  assert.ok(highRiskMatches('Demolish the existing two storey office building (Visitor Processing building).', 'no', 'qld').some((item) => item.check === 'demolition'));
  assert.ok(highRiskMatches('Strip out the old ductwork and the asbestos cement ceiling linings.', 'no', 'qld').some((item) => item.check === 'asbestos'));
});

test('the gas line pressure test answer is offered only where the task names gas', () => {
  const pool = answersFor('pressureTesting', 'Commission pool and water feature systems (Pool, water features and plant room).');
  assert.ok(!pool.some((answer) => answer.label === 'Gas line test'));
  assert.equal(pool[0].label, 'Water test');
  assert.equal(answersFor('pressureTesting', 'Pressure test the refrigeration pipework.')[0].label, 'Nitrogen test');
  assert.equal(answersFor('pressureTesting', 'Pressure test and commission a new gas line to the bakery oven.')[0].label, 'Gas line test');
  const done = draft('Pressure test and commission the pool and water feature systems.', 'plumbing', { kinds: ['pressureTest'] });
  assert.doesNotMatch(lines(work(done, 'Pressure test and commission')), /gas pipework/i);
});

test('treating the ground and trenches with chemicals is not digging a trench', () => {
  assert.ok(!highRiskMatches('Poison tree suckers and roots and treat ground areas and trenches.', 'no', 'qld').some((item) => item.check === 'trench'));
  assert.ok(highRiskMatches('Excavate trenches for the new sewer main.', 'no', 'qld').some((item) => item.check === 'trench'));
});

test('kitchen floor wastes and gutters are set into the floor, not laid in an underslab trench, and a cool room location is not a refrigerant line', () => {
  const done = draft('Install slot drains, floor wastes and floor gutters (Kitchens and cool rooms; locations not stated).', 'plumbing', { kinds: ['underslabDrainage'] });
  assert.ok(steps(done).includes('Set floor wastes, slot drains and floor gutters'));
  assert.ok(!steps(done).includes('Lay drainage under the slab or floor'));
  assert.doesNotMatch(risks(done), /refrigerant/i);
  // Drainage under the slab keeps its trench step, and installing a cool room is still a refrigerant line.
  assert.ok(steps(draft('Lay the sewer drainage under the slab to the kitchen floor wastes.', 'plumbing', { kinds: ['underslabDrainage'] })).includes('Lay drainage under the slab or floor'));
  assert.match(risks(draft('Install and connect the cool room refrigeration units.', 'mechanical')), /refrigerant/i);
});

test('energised work named in the task: an answer of none stands with a warning, and testing gives the category', () => {
  for (const task of ['Thermographic scanning of energised switchboards.', 'Modify the existing HV main switchboard (conditions: Live HV in operating facility).', 'Alter the existing MSB and UPS DB (conditions: Existing energised switchboards).']) {
    const none = draft(task, 'electrical', { facts: { energisedWork: 'none' } });
    assert.equal(none.warnings.length, 1, task);
    assert.match(none.warnings[0], /no work is done on or near energised parts, but the task mentions/);
    const testing = draft(task, 'electrical', { facts: { energisedWork: 'testing' } });
    assert.match(risks(testing), /energised electrical/i, task);
    assert.deepEqual(testing.warnings, []);
  }
  // Work near overhead HV lines is near energised installations whatever the trade.
  assert.match(risks(draft('Trim trees along the HV aerial route (conditions: Near overhead HV lines).', 'landscaping')), /energised electrical/i);
  // Isolated and de-energised work gives no warning.
  assert.deepEqual(draft('Replace the circuit breakers in the switchboard, isolated and proved de-energised first.', 'electrical', { facts: { energisedWork: 'none' } }).warnings, []);
});

test('live electrical answered No for comms work beside live mains is warned, and Yes gives the category', () => {
  const task = 'Install data cabling in the comms room risers beside the live mains.';
  const no = draft(task, '', { facts: { liveElectrical: 'no' } });
  assert.match(no.warnings.join(' '), /You answered No to live electrical work/);
  assert.match(risks(draft(task, '', { facts: { liveElectrical: 'yes' } })), /energised electrical/i);
});

test('a scope package keeps its conditions and plant in the task, so they reach the high risk check', () => {
  const { packageTask } = require('../public/scope-task');
  const pool = packageTask([{ activity: 'Clean external areas including the external pool area', where: 'External areas', conditions: 'Near pool and spa' }, { activity: 'Clean road surfaces by machine', plant: 'Road cleaning machine', conditions: 'Near roads' }]);
  assert.equal(pool, 'Clean external areas including the external pool area (External areas; conditions: Near pool and spa). Clean road surfaces by machine (conditions: Near roads; plant: Road cleaning machine).');
  const cleaning = risks(draft(pool, 'cleaning', { kinds: ['cleaning'] }));
  for (const pattern of [/drowning/i, /road/i, /powered mobile plant/i]) assert.match(cleaning, pattern);
  assert.match(risks(draft(packageTask([{ activity: 'Tile the external swimming pool area including steps', conditions: 'Adjacent to 1000m2 swimming pool' }]), 'tiling', { kinds: ['tileLay'] })), /drowning/i);
  assert.match(risks(draft(packageTask([{ activity: 'Load, unload, store and move materials around site', plant: 'Trolleys; crates', conditions: 'Moving plant and traffic on site; Traffic Management Plan applies' }]), 'carpentry', { kinds: ['carpLoad'] })), /powered mobile plant/i);
  assert.match(risks(draft(packageTask([{ activity: 'Fill existing trenches in switchroom with concrete', where: 'Switchroom', conditions: 'Existing trenches in switchroom' }]), 'concrete', { kinds: ['slabPour'] })), /energised electrical/i);
  // What the scope leaves out is not a condition, and a live facility alone is not live electrical work.
  assert.equal(packageTask([{ activity: 'Supply and use working platforms', conditions: 'Scissor lifts excluded', plant: 'Working platforms (type not stated)' }]), 'Supply and use working platforms (plant: Working platforms, type not stated).');
  assert.ok(!highRiskMatches(packageTask([{ activity: 'Install data outlets in the offices', conditions: 'Live or operating facility; live existing facility' }]), 'no', 'qld').some((item) => item.check === 'electrical'));
});
