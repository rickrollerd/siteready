// Work written out in sentences finds its job steps (goals 1 and 2, 10 October 2026): the wordings a
// 629-task corpus of commercial and infrastructure tasks missed (shaft walls and partitions, panelling,
// CFA piles, hollowcore units, BMS controllers, grilles and diffusers, "power to ...", "Seal the window
// perimeters", "Regrout", "Lag", "Rock hammering"). What the work is for does not choose the steps that
// build that thing ("sheet piles for the pump station cofferdam"), and others' work does not take the
// crew's own steps away.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor } = require('../draft');
const { readSlang } = require('../slang');
const { siteWorkLines } = require('../scope');

const SITE = { state: 'qld', fallRisk: 'no', residential: 'no', crane: 'company', company: 'Koval Site Services Pty Ltd', principalContractor: 'Principal Builders Pty Ltd', workplace: '1 Albert Street, Brisbane QLD 4000' };
const suggested = (task) => (questionsFor({ ...SITE, task, facts: {} }).steps || {}).suggested || [];
const draftOf = (task) => {
  const facts = {};
  for (let round = 0; round < 8; round += 1) {
    const open = (questionsFor({ ...SITE, task, facts }).required || []).filter((item) => !facts[item.id]);
    if (!open.length) break;
    for (const item of open) facts[item.id] = item.id === 'liveElectrical' ? 'no' : item.choices ? item.choices[0].value : `As set out in the site plan: ${item.label}.`;
  }
  return { draft: prepareDraft({ ...SITE, task, facts }), facts };
};
const check = (rows) => {
  for (const [task, want, not] of rows) {
    const got = suggested(task);
    for (const id of want) assert.ok(got.includes(id), `${task}\n  wanted ${id}, got ${got.join(', ')}`);
    for (const id of not) assert.ok(!got.includes(id), `${task}\n  did not want ${id}, got ${got.join(', ')}`);
  }
};

// [task, kinds that must be ticked, kinds that must not be]
test('walls, ceilings, joinery and linings', () => check([
  ['Build the shaft walls to the lift and service risers. Lift by the lift contractor.', ['carpFraming', 'plasterSheets'], ['liftInstall']],
  ['Build the shaft wall around the services shaft on levels 2 to 6.', ['carpFraming', 'plasterSheets'], ['trench']],
  ['Install the new partitions on level 3. Existing ceiling to remain and be protected.', ['carpFraming', 'plasterSheets'], ['ceilingGrid']],
  ['Install the toilet partitions in the amenities.', [], ['carpFraming', 'plasterSheets']],
  ['Install the ceilings in the lift lobbies from mobile scaffolds.', ['plasterCeiling'], ['liftInstall']],
  ['Install the access panels in the ceilings for the services. Services by others.', ['ceilingHatch'], []],
  ['Patch the plasterboard walls in the occupied office after the electrician\'s rough-in. Electrical by others.', ['plasterSanding'], ['fitOff']],
  ['Fix skirtings, architraves and timber wall panelling in the offices. Carpet laid later by the flooring contractor.', ['carpJoinery'], ['floorLay', 'wallPanels']],
  ['Install timber battens and acoustic panelling to the auditorium walls from a mobile scaffold.', ['wallPanels'], []],
  ['Frame and sheet the external soffits and fibre cement facade sheeting from the scaffold. Painting by others.', ['claddingInstall', 'eaveLining'], ['painting']],
]));

test('services: power to a thing, grilles, lagging, controllers, comms, fire', () => check([
  ['Install the power to the pool plant room. Pool plant and pumps by the pool contractor.', ['fitOff'], ['poolPlant', 'pumpInstall']],
  ['Install the power and data to the workstations, excluding data cabling which is by the IT contractor.', ['fitOff'], ['ictCabling']],
  ['Install the power track rail for the gallery lights. No ceiling works.', ['fitOff'], ['sportsLighting']],
  ['Install the external lighting along the hospital road.', ['fitOff'], []],
  ['Install the grilles and diffusers after the ceiling grid is in. Grid by the ceiling contractor.', ['ductwork'], ['ceilingGrid']],
  ['Install the security grilles to the shopfront.', [], ['ductwork']],
  ['Lag the chilled water pipework in the plant room. Pipework by the mechanical contractor.', ['mechInsulation'], ['mechPipework']],
  ['Install the BMS controllers and sensors in the plant rooms. Power supply to the panels by the electrician.', ['controlPanelInstall'], []],
  ['Service and repair the rooftop units at the shopping centre. Roof access by the fixed ladder.', ['acService'], []],
  ['Run the refrigerant lines to the cool room evaporators. Cool room panels by others.', ['refrigerantPipework'], ['coolroomPanels']],
  ['Mount the Wi-Fi access points and PA speakers in the stadium concourse from a boom lift.', ['ictCabling'], []],
  ['Install the comms backboards in the riser cupboards. No switchboard work.', ['commsRoom'], ['switchboardReplace']],
  ['Install FOBOTs, patch panels and patch leads in the comms racks.', ['commsRoom'], []],
  ['Haul the fibre through the existing pit and pipe network from pit 1 to pit 6.', ['fibre'], []],
  ['Haul, splice and test the optical fibre between the comms rooms through the existing pits. Pits are already in place.', ['fibre'], ['trench']],
  ['Upgrade the security system in the operating correctional centre with cutovers out of hours.', ['securityDevices'], []],
  ['Six monthly inspection and testing of the fire services in the shopping centre. Defects quoted separately.', ['fireLive'], []],
  ['Seal the penetrations in the lift shaft walls from the landings. Lift installation by others.', ['passiveFire'], ['liftInstall']],
  ['Fire seal the cable tray penetrations through the switchroom walls. Cable tray by the electrician.', ['passiveFire'], ['containment']],
  ['Seal the fire rated control joints and the slab edge perimeter between the curtain wall and the slab. Curtain wall by the facade contractor.', ['passiveFire'], []],
  ['Seal the window perimeters with silicone from a boom lift outside the school. No glass replacement.', ['glazingSeal'], ['glassHandle']],
]));

test('plumbing and drainage', () => check([
  ['Rough-in and fit off the bathrooms and kitchens. Tiling by the tiler.', ['plumbingFitOff'], ['tileLay']],
  ['Install the plumbing in the bathroom core of each apartment. Core walls by the blocklayer.', ['plumbingFitOff'], ['masonryLay']],
  ['Install the natural gas pipework to the kitchen appliances and test it. Kitchen equipment by others.', ['gasFitting'], ['kitchenEquipment']],
  ['Install medical gas pipework in the ward ceilings.', [], ['gasFitting']],
  ['Install downpipes and rainwater heads on the facade from boom lifts. Box gutters by the roofer.', ['gutters'], ['boxGutter']],
  ['Isolate, cap and remove the existing plumbing in the strip-out area. Demolition by others.', ['servicesStrip'], ['demolition']],
  ['Install temporary site plumbing to the site sheds. Sheds placed by the hire company.', ['waterConnection'], ['siteSheds', 'siteEstablish']],
  ['Set the floor wastes in the formwork before the pour. Formwork and pour by others.', ['castInPlumbing'], ['formwork', 'concrete']],
  ['Lay subsoil drains behind the retaining wall. Retaining wall by the wall builder.', ['wallDrainage'], ['retainingWall']],
  ['Lay the rising main line from the pump station to the discharge manhole.', ['trench'], []],
  ['Pump out the water from the excavation with a submersible pump before the concretor starts.', ['dewatering'], ['trench']],
]));

test('concrete, piling, excavation and structure', () => check([
  ['Set up the concrete boom pump on the street and pump to the core walls. Jump form by the formwork contractor.', ['concrete'], ['jumpform']],
  ['Place the blinding layer to the pile caps. Pile cap reo and formwork by others.', ['concrete'], ['reo', 'formwork']],
  ['Place and finish the level 3 slab. Pump supplied and operated by the pump company. Formwork by others.', ['concrete'], ['formwork']],
  ['Patch honeycombing and grind fins off the basement walls. Waterproofing by others.', ['concreteRepair'], ['belowGroundWp']],
  ['Form and pour the edge strip along the new asphalt. Asphalt by the asphalt crew.', ['slabGround'], []],
  ['Install the slab edge formwork and edge protection on the podium. Precast panels by the precaster.', ['formwork'], ['precast']],
  ['Construct the abutment and wingwalls for the creek bridge: excavate, form, fix reo and pour. Piling completed by others.', ['formwork'], ['pilingRig']],
  ['Form, reo and pour the cast in situ retaining wall along the boundary. Waterproofing of the back face by others.', ['concreteWall'], []],
  ['Build the timber crib wall behind the school oval. No excavation; the cut is already formed.', ['retainingWall'], ['trench']],
  ['Form the landscape walls in the plaza with block. No formwork.', ['masonryLay'], ['formwork']],
  ['Cut a penetration through the existing roof slab for the new stair opening, with props under. Steel stair by others.', ['sawCut'], ['accessSteel']],
  ['Take concrete core samples from the car park deck for testing. Cores sent to the lab.', ['coreDrill'], []],
  ['Stress, grout and cut the tails of the PT tendons on level 3. Concrete strength confirmed by the engineer.', ['stressing'], []],
  ['CFA piles for the apartment building with cages plunged into the fresh pile. Pile caps by others.', ['pilingRig'], []],
  ['Drill and concrete the bored piers for the light poles along the motorway. Poles by the electrical contractor.', ['pilingRig'], ['poleErect']],
  ['Drive precast concrete piles with the hydraulic hammer next to the operating rail line.', ['drivenPiles'], ['rockBreak']],
  ['Rock hammering and rock sawing in the lower basement next to the neighbouring church. No blasting.', ['rockBreak'], ['blasting']],
  ['Staged basement excavation in 2 m lifts with ground anchors installed and stressed at each level.', ['bulkDig'], []],
  ['Dewater the basement excavation with spear points and submersible pumps. Bulk excavation by others.', ['dewatering'], ['bulkDig']],
  ['Excavate the station box from the top down in stages with the clamshell grab and excavators.', ['bulkDig'], []],
  ['Excavate the access shaft for the tunnel boring machine with an excavator and crane muck skip.', ['bulkDig'], []],
  ['Land and fix the hollowcore floor units on the steel frame. Topping slab by the concretor.', ['precastFloor'], ['concrete']],
  ['Install the steel handrails and stair stringers in the fire stairs.', ['accessSteel'], []],
  ['Install the precast stair flights in the fire stairs with the tower crane. Handrails by the metalworker.', ['precastStair'], ['accessSteel']],
  ['Underpin the neighbour\'s strip footings in 1 m hit-and-miss sections before the basement dig.', [], ['restump']],
]));

test('other trades: roofing, insulation, painting, cleaning, landscaping, rail, lifts, demolition', () => check([
  ['Install the new roof over the extension. Existing roof to remain; flash into the existing roof.', ['roof'], []],
  ['Lay sisalation and blanket under the new metal roof. Roof sheeting by the roofer.', ['insulation'], []],
  ['Insulate the roof of the new warehouse. Roof sheeting by the roofer; we lay the blanket ahead of the sheets.', ['insulation'], []],
  ['Portable extinguishers, blankets, signs and block plans', [], ['insulation']],
  ['Apply protective coatings to the bridge steel after blasting. Containment by the scaffolder.', ['painting'], ['blasting']],
  ['Strip and reseal the vinyl floors in the corridors with a floor scrubber after hours.', ['cleaning'], ['floorLay']],
  ['Lay thermoplastic pedestrian crossing markings with a gas torch. Kerb ramps by others.', ['lineMarking'], []],
  ['Plant advanced street trees with a hiab and stake them. Tree pits dug by the civil contractor.', ['landscape'], ['trench']],
  ['Weld and destress the continuous welded rail on the up line.', ['railCorridor'], ['stressing']],
  ['Install the cable route troughs along the track for the signalling cables. Cable pulling by the signalling contractor.', ['railCorridor'], ['cablePull']],
  ['Remove the redundant lift and lift motor room equipment. New lift by others.', ['servicesStrip'], ['liftInstall']],
  ['Modernise the two passenger lifts: strip out the old equipment and install new controllers.', ['servicesStrip'], []],
  ['Remove the old cool room and its refrigeration. Refrigerant recovery by the refrigeration mechanic.', ['servicesStrip'], ['refrigerantCharge']],
  ['Isolate and strip out the existing lighting and power in the office strip-out area. Ceilings removed by the demolition contractor.', ['servicesStrip'], ['officeStrip']],
  ['Class B removal of AC roof sheets from the old warehouse roof. Access by boom lift from the car park.', ['asbestos'], []],
  ['Regrout the shower recesses in the occupied hotel rooms.', ['regroutStep'], ['tileLay']],
]));

// What the work is for, after the thing the crew builds, does not choose the steps that build that thing.
test('what the work is for is not the work', () => check([
  ['Install and extract steel sheet piles for the pump station cofferdam. Pump station by others.', ['drivenPiles'], ['pumpInstall', 'tankPlace']],
  ['Fix the reo cages for the bored piles at ground level. Lifting into the bores by the piling contractor.', ['reo'], ['pileCage', 'pilingRig', 'openBore']],
  ['Drive the steel H piles for the sign gantry. Gantry erection by the sign contractor.', ['drivenPiles'], ['steelErect', 'siteEstablish']],
  ['Install the pumps for the sewage pump station.', ['pumpInstall'], ['tankPlace']],
  ['Install the precast tanks for the sewerage treatment plant with the crane.', ['tankPlace'], []],
  ['Excavate the deep excavation for the detention tank and install the tank.', ['tankPlace'], []],
  ['Install the hangers for the sprinkler pipework.', ['fireAtHeight'], []],
  ['Install the brackets for the solar panels.', ['solarPV'], []],
  ['Build the formwork for the lift core walls.', ['formwork'], ['liftInstall']],
  ['Pour the concrete for the footings.', ['concrete'], []],
]));

// Things listed after painted line marking are painted too; bollards others install are not this SWMS's.
test('things listed after painted line marking are painted', () => {
  check([['Paint the car park line marking bays and bollards. Bollard installation by others.', ['lineMarking'], ['bollards']]]);
  const steps = draftOf('Paint the car park line marking bays and bollards. Bollard installation by others.').draft.jobSteps.map((step) => step.step);
  assert.ok(steps.includes('Paint line marking') && !steps.includes('Install bollards'), steps.join(' | '));
});

// Blasting named with coating steel is abrasive blasting: no explosives steps, no explosives category,
// and the SWMS is not stood down for want of shotfiring steps.
test('blasting before a protective coating is not explosives', () => {
  const { draft } = draftOf('Apply protective coatings to the bridge steel after blasting. Containment by the scaffolder.');
  assert.equal(draft.kind, 'draft', (draft.missing || []).join(' '));
  assert.ok(!draft.highRisk.some((label) => /explosives/i.test(label)), draft.highRisk.join(' / '));
  assert.ok(!draft.jobSteps.some((step) => /blast holes|Charge and fire/.test(step.step)), draft.jobSteps.map((step) => step.step).join(' | '));
  assert.ok(suggested('Drill and blast the rock in the basement.').includes('blasting'));
});

// Kinds the written wordings find bring the facts their steps need, as a typed title's kinds do; a CFA
// or bored pier rig is plant on the register and asks for its exclusion zone.
test('the facts and plant the new readings need are asked and listed', () => {
  assert.ok(draftOf('Lag the ductwork').facts.safetyDataSheet !== undefined);
  assert.ok(draftOf('CFA piles with rig').facts.rigExclusionZone !== undefined);
  const { draft } = draftOf('Drill and concrete the bored piers for the light poles along the motorway. Poles by the electrical contractor.');
  assert.ok(draft.plant.some((item) => item.item === 'Piling rig'), JSON.stringify(draft.plant));
  assert.ok(draft.highRisk.some((label) => /powered mobile plant/i.test(label)), draft.highRisk.join(' / '));
});

test('slang and spelling: AC roof sheets, regrout', () => {
  assert.equal(readSlang('Remove the AC roof sheets.'), 'Remove the asbestos cement roof sheets.');
  assert.equal(readSlang('Service the AC units.'), 'Service the air conditioning units.');
  assert.match(questionsFor({ ...SITE, task: 'Regrout the shower recesses.', facts: {} }).task, /^Regrout\b/);
});

// A honeycomb filter in a kitchen canopy is not honeycombed concrete.
test('honeycomb filters are not concrete repair', () => {
  assert.ok(!suggested('All exhaust and condensation canopies are standard hoods with honeycomb filters.').includes('concreteRepair'));
  assert.equal(siteWorkLines('All exhaust and condensation canopies are standard hoods with honeycomb filters.').length, 0);
});

// Work the library has no steps for is stood down, not drafted around the rail corridor or traffic
// steps alone: rail welding, cable troughs along the track, bridge expansion joints (owner gap list).
test('work with no job steps is stood down, not drafted around the corridor or traffic steps', () => {
  for (const task of [
    'Weld and destress the continuous welded rail on the up line. Stressing the rail to the neutral temperature with hydraulic tensors.',
    'Install the cable route troughs along the track for the signalling cables. Cable pulling by the signalling contractor.',
    'Replace the bridge expansion joints over the traffic lanes. Asphalt reinstatement by others.',
  ]) {
    const { draft } = draftOf(task);
    assert.equal(draft.kind, 'stand-down', `${task}: ${(draft.jobSteps || []).map((step) => step.step).join(' | ')}`);
  }
  assert.ok(!suggested('Weld and destress the continuous welded rail on the up line.').includes('hotWork'));
  assert.ok(suggested('Braze the copper pipework beside the rail line.').includes('hotWork'));
});
