// Words for work this crew does not do choose no job steps (tester's top weakness, 10 October 2026):
// work others do, work left out, what stays as it is or is already done, the trades before or after,
// and what is not there at all. A thing named only as the place, the thing treated or the next trade
// does not choose the steps that build it. The crane, EWP, traffic and power lines the crew still
// meets stay, and so does the crew's own work in the same sentence.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor } = require('../draft');

const SITE = { state: 'qld', fallRisk: 'no', residential: 'no', crane: 'company', company: 'Koval Site Services Pty Ltd', principalContractor: 'Principal Builders Pty Ltd' };
const suggested = (task) => (questionsFor({ ...SITE, task, facts: {} }).steps || {}).suggested || [];

// [task, kinds that must be ticked, kinds that must not be]
const CASES = {
  'work by others': [
    ['Erect formwork to the level 3 slab. Concrete pour by others, reo by others.', ['formwork'], ['reo', 'concrete']],
    ['Excavate the trench for the stormwater line. Pipe laying and backfill by others.', ['trench'], []],
    ['Install cable tray in the plant room ceiling from scissor lifts. Fire sprinkler pipework by others.', ['containment', 'ewp'], ['fireAtHeight']],
    ['Install power to the pump station control panel. Pump installation by the mechanical contractor.', ['controlPanelInstall'], ['pumpInstall']],
    ['Fix reo to the suspended slabs and beams on levels 3 to 6. Formwork by the formwork contractor.', ['reo'], ['formwork']],
    ['Install cast-in conduits and boxes on the level 6 deck before the pour. Formwork and reo by others.', ['castIn'], ['formwork', 'reo']],
    ['Tower crane operation and dogging for the structure. Formwork, reo and precast lifts for the other trades.', ['craneInterface'], ['formwork', 'reo', 'precast']],
    ['Install the hot water plant. Builder to supply and install the gas line.', [], ['gasFitting']],
    ['Lay the PE water main with butt fusion and pressure test it. Connection to the live main by the water authority.', ['trench', 'peFusion'], ['waterConnection']],
    ['Sheet the ceilings once the sprinkler fitter, electrician and plumber have finished their rough-in.', [], ['fitOff', 'plumbingFitOff']],
    ['Reinstate the footpath where the electrician dug his trench. Pavers to match existing.', ['paving'], ['trench']],
    ['Erect the hung scaffold under the bridge deck for the painting contractor.', ['scaffold'], ['painting']],
  ],
  'left out': [
    ['Re-sheet the factory roof. Gutters and downpipes excluded. Asbestos removal excluded.', ['roof'], ['gutters', 'asbestos']],
    ['Install the power and data to the workstations, excluding data cabling which is by the IT contractor.', [], ['ictCabling']],
    ['Place the post-tensioning ducts, strand and anchorages on level 4. Stressing in a separate SWMS.', ['ptTendons'], ['stressing']],
    ['Fix the reinforcement to the footings, pile caps and ground slab. Concrete by others.', ['reo'], ['slabPour', 'concrete']],
    ['Clean the stadium stands and aisles after the event. No pressure cleaning.', ['cleaningStands'], ['pressureClean']],
    ['Core drill the floor penetrations. Fire collars and sealing not in our scope.', ['coreDrill'], ['fireCollar', 'passiveFire']],
  ],
  'stays as it is or already done': [
    ['Install the new partitions on level 3 with steel studs. Existing ceiling to remain and be protected.', ['carpFraming'], ['ceilingGrid', 'officeStrip']],
    ['Tile the new ensuite. Existing waterproofing to remain; protect the existing tiles in the hallway.', ['tileLay'], ['wpLiquid', 'tileRemove']],
    ['Strip out ceilings and services in the ward. Existing fire sprinklers to remain live.', ['officeStrip'], ['fireAtHeight']],
    ['Lay floor and wall tiles in the bathrooms. Waterproofing by the waterproofer is complete and flood tested.', ['tileLay'], ['wpLiquid', 'floodTest']],
    ['Lay carpet tiles on level 2. No floor grinding; the slab is already prepared.', ['floorLay'], ['floorGrind']],
  ],
  'not there at all': [
    ['Install LED lighting in the warehouse from scissor lifts. No overhead power lines near the work. No asbestos in the building.', ['ewp'], ['power', 'asbestos']],
    ['Replace the roof sheets on the gym. There are no overhead lines; the building is set back from the street.', ['roof'], ['power']],
    ['Install split systems in the classrooms. Crane not required; condensers on wall brackets at ground level.', ['splitInstall'], ['craneInterface', 'crane']],
  ],
  'the crew still meets it': [
    ['Lay the asphalt on the highway at night. Traffic control by others.', ['asphaltLay', 'road'], []],
    ['Install the escalator handrails and steps. Escalator truss lifted in by the crane company.', ['escalatorParts', 'craneInterface'], []],
    ['Roof sheets lifted to the roof by the builder\'s tower crane. We fix the sheets and flashings.', ['roof'], []],
    ['Install the doors supplied by the joinery factory on levels 2 and 3.', ['doorHang'], []],
  ],
  'a thing named as the place, treated or the next trade': [
    ['Install lighting in the lift shaft and lift pit. Lift installation by the lift contractor.', ['fitOff', 'liftShaft'], ['liftInstall']],
    ['Install CCTV cameras in the lift cars and lift lobbies.', ['securityDevices'], ['liftInstall', 'liftShaft']],
    ['Install the purlins and roof sheeting on the new portal frame.', ['roof'], ['steelErect']],
    ['Paint the steel portal frames in the warehouse from boom lifts.', ['painting'], ['steelErect', 'kitStructure']],
    ['Clean the gutters and box gutters of the school buildings from roof access.', ['gutterClean'], ['boxGutter', 'gutters']],
    ['Install wall and ceiling batts in the apartments before the plasterboard.', ['insulation'], ['plasterSheets']],
    ['Fix the reo to the level 2 slab ready for the pour on Friday.', ['reo'], ['concrete']],
    ['Install louvres to the plant room openings on the roof.', ['windowInstall'], ['plantLift']],
    ['Saw cut and remove the slab on ground for the new sewer trench in the warehouse.', ['sawCut'], ['trench']],
    ['Road saw the asphalt pavement for the water main connection.', ['asphalt'], ['waterConnection']],
    ['Stand the car park light poles on their footings with a truck crane and wire them.', ['poleErect'], ['footingHoles']],
    ['Mount the condensers on the roof rails beside the plant deck.', ['roofPlant'], ['railCorridor']],
    ['Acid wash the new face brickwork to remove mortar stains.', ['cleaning'], ['masonryMortar']],
    ['Lay reinforced blockwork walls to the lift and stair cores and core fill them.', ['masonryLay', 'masonryGrout'], ['reo', 'liftInstall']],
    ['Lay the gravity sewer main and build the manholes in the subdivision.', ['trench'], ['sewerConnection']],
    ['Stress and grout the post-tensioned bridge deck tendons from the abutment ends.', ['stressing'], ['formwork', 'reo', 'concrete']],
    ['Form the strip footings, ground slab and edge forms for the warehouse.', ['slabGround'], ['slabPour']],
    ['Install the power to the scissor lift charging bays.', [], ['ewp']],
    ['Demolish the internal blockwork walls on level 1.', ['demolition'], ['masonryLay']],
  ],
};

for (const [group, rows] of Object.entries(CASES)) {
  test(`steps from the words: ${group}`, () => {
    for (const [task, want, not] of rows) {
      const got = suggested(task);
      for (const id of want) assert.ok(got.includes(id), `${task}\n  wanted ${id}, got ${got.join(', ')}`);
      for (const id of not) assert.ok(!got.includes(id), `${task}\n  did not want ${id}, got ${got.join(', ')}`);
    }
  });
}

// Trade words used as verbs choose the trade's steps, as the nouns do.
test('trade words used as verbs', () => {
  const rows = [
    ['Membrane the shower bases and walls in the change rooms.', ['wpLiquid'], []],
    ['Tank the basement walls and lift pit.', ['belowGroundWp'], ['liftInstall']],
    ['Glaze the shopfronts.', ['glassHandle'], []],
    ['Plant out the median strip on the highway at night.', ['landscape'], []],
    ['Lag the chilled water pipework in the plant room.', ['mechInsulation'], []],
    ['Frame the ceilings in the car park lobby from mobile scaffolds.', ['carpFraming'], []],
    ['Form the level 2 deck.', ['formwork'], []],
    ['Form, reinforce and pour the concrete columns and raker beams for the grandstands.', ['formwork', 'reo', 'concrete'], ['grandstand']],
    ['Concrete the stair flights and landings in the fire stairs by pump.', ['concrete'], []],
    ['Mark out the sports courts in the school hall.', ['lineMarking'], []],
    ['Run the ductwork along the corridor on level 4.', ['ductwork'], []],
    ['Install new fire door sets to the stair cores.', ['doorHang'], []],
    ['Install the fire detection in the car park.', ['fireAlarm'], []],
    ['Form the landscape walls in the plaza with block.', [], ['formwork']],
    ['Form and pour a concrete driveway and path at a house, with the concrete truck and a line pump in the street.', [], ['formwork']],
  ];
  for (const [task, want, not] of rows) {
    const got = suggested(task);
    for (const id of want) assert.ok(got.includes(id), `${task}\n  wanted ${id}, got ${got.join(', ')}`);
    for (const id of not) assert.ok(!got.includes(id), `${task}\n  did not want ${id}, got ${got.join(', ')}`);
  }
});

// The same words as the crew's own work still choose the steps.
test('own work keeps its steps', () => {
  const rows = [
    ['Erect formwork, fix reo and pour the level 3 slab.', ['formwork', 'reo', 'concrete']],
    ['Install the new passenger lift in the existing shaft.', ['liftInstall', 'liftShaft']],
    ['Install the lift pit ladder and buffers, then the car.', ['liftInstall']],
    ['Install the noise wall posts and panels along the motorway.', ['noiseWall']],
    ['Remove the old roof sheets and fix new roof sheets.', ['roof', 'roofStrip']],
    ['Connect the new building sewer to the live council main and install the water meter.', ['sewerConnection']],
    ['Work near the overhead power lines on the street; no outage is possible.', ['power']],
    ['Strip the formwork and reprop the slab on level 2. No concrete work.', ['formwork']],
    ['No hot works without a permit. Braze the copper pipework in the plant room.', ['hotWork']],
  ];
  for (const [task, want] of rows) {
    const got = suggested(task);
    for (const id of want) assert.ok(got.includes(id), `${task}\n  wanted ${id}, got ${got.join(', ')}`);
  }
});

// The main work is read the same way: a frame named only as where the roofing goes, or as what is
// painted, does not stand the SWMS down for want of steel erection steps.
test('a thing named only as the place or as what is painted is not the main work', () => {
  for (const [task, want, not] of [
    ['Install the purlins and roof sheeting on the new portal frame. Portal frame by the steel erector.', 'Fix new roofing', 'Erect and connect steel at height'],
    ['Paint the steel portal frames in the warehouse from boom lifts.', 'Paint', 'Erect and connect steel at height'],
  ]) {
    const facts = {};
    for (let round = 0; round < 8; round += 1) {
      const open = (questionsFor({ ...SITE, task, facts }).required || []).filter((item) => !facts[item.id]);
      if (!open.length) break;
      for (const item of open) facts[item.id] = item.id === 'liveElectrical' ? 'no' : item.choices ? item.choices[0].value : `As set out in the site plan: ${item.label}.`;
    }
    const result = prepareDraft({ ...SITE, task, facts });
    assert.equal(result.kind, 'draft', `${task}: ${result.message || ''}`);
    const steps = result.jobSteps.map((step) => step.step);
    assert.ok(steps.includes(want) && !steps.includes(not), `${task}: ${steps.join(' | ')}`);
  }
});

// What is not there asks no question and lists no high risk work: no overhead lines, a building set back
// from the street. Lines that are there still do.
test('what is not there asks no question and lists no high risk construction work', () => {
  const draftOf = (task) => {
    const facts = {};
    for (let round = 0; round < 8; round += 1) {
      const open = (questionsFor({ ...SITE, task, facts }).required || []).filter((item) => !facts[item.id]);
      if (!open.length) break;
      for (const item of open) facts[item.id] = item.id === 'liveElectrical' ? 'no' : item.choices ? item.choices[0].value : `As set out in the site plan: ${item.label}.`;
    }
    return prepareDraft({ ...SITE, task, facts });
  };
  const tray = 'Install cable tray in the plant room ceiling from scissor lifts. No overhead lines on site.';
  assert.ok(!(questionsFor({ ...SITE, task: tray, facts: {} }).required || []).some((item) => item.id === 'electricalSafety'));
  assert.ok(!draftOf(tray).highRisk.some((label) => /energised/i.test(label)), draftOf(tray).highRisk.join(' / '));
  const gym = 'Replace the roof sheets on the gym. There are no overhead lines; the building is set back from the street.';
  assert.ok(!draftOf(gym).highRisk.some((label) => /road|energised/i.test(label)), draftOf(gym).highRisk.join(' / '));
  const near = 'Install the street lights near the overhead power lines on the main road.';
  assert.ok((questionsFor({ ...SITE, task: near, facts: {} }).required || []).some((item) => item.id === 'electricalSafety'));
  assert.ok(draftOf(near).highRisk.some((label) => /energised/i.test(label)), draftOf(near).highRisk.join(' / '));
});

// The draft follows: roofing others fix is not in a strip-only SWMS, and its access steps stay.
test('a strip-only roof job has no fix new roofing step when the new roof is by others', () => {
  const facts = {};
  const input = { ...SITE, task: 'Remove the existing roof sheeting and purlins from the warehouse. New roof by the roofer.' };
  for (let round = 0; round < 8; round += 1) {
    const open = (questionsFor({ ...input, facts }).required || []).filter((item) => !facts[item.id]);
    if (!open.length) break;
    for (const item of open) facts[item.id] = item.id === 'liveElectrical' ? 'no' : item.choices ? item.choices[0].value : `As set out in the site plan: ${item.label}.`;
  }
  const steps = prepareDraft({ ...input, facts }).jobSteps.map((step) => step.step);
  assert.ok(steps.includes('Remove old roofing') && steps.includes('Set up roof access'), steps.join(' | '));
  assert.ok(!steps.includes('Fix new roofing'), steps.join(' | '));
});
