// Two short sample methodologies written for the tests (no real company's document or name), and the
// readings a stand-in for the AI returns for them, as the real model would: steps in order, the
// methodology's words quoted word for word, library job step groups where they fit.
const JUMP_LIFT = [
  'Jump Lift Machine Platform Raising Methodology',
  'Document No. JL-MS-03 Revision B Date 2 October 2026',
  'Prepared by the lift contractor for the jump lift in the main core.',
  '1. Purpose',
  'This methodology sets out the sequence for raising the jump lift machine platform to the next working level as the core rises.',
  '2. Before the raise',
  '2.1 Confirm the core walls at the new machine platform level have reached the concrete strength stated by the structural engineer and the formwork contractor has released the level.',
  '2.2 Stop the jump lift and park the car at the lowest landing. Lock off and tag the main switch at the jump lift controller.',
  '2.3 Barricade all landing entrances to the shaft and fix signs reading "Lift shaft work in progress - no entry".',
  '2.4 Inspect the climbing beams, pockets and lifting chains before use and record the inspection on the pre-raise checklist.',
  '3. Install the lifting equipment',
  '3.1 Install the two climbing beams in the wall pockets at the new level from the working platform, wearing a harness clipped to the anchor points on the platform.',
  '3.2 Hang the 5 tonne chain blocks from the climbing beams and attach them to the machine platform lifting points with rated shackles.',
  '3.3 The supervisor checks every shackle and chain block tag before the raise starts.',
  '4. Raise the machine platform',
  '4.1 Release the machine platform locking pins only when the chain blocks are taking the load.',
  '4.2 Raise the machine platform evenly with both chain blocks, one landing at a time, with a person at each chain block and the supervisor watching the platform level.',
  '4.3 No person is to stand on the machine platform or below it in the shaft while it is being raised, as the platform could fall if a chain block fails.',
  '4.4 Stop the raise if the platform tilts more than 50 mm side to side, and level it before continuing.',
  '5. Secure the platform',
  '5.1 Insert the locking pins at the new level and confirm all four pins are fully engaged.',
  '5.2 Remove the chain blocks and store them in the site container.',
  '6. Return the lift to service',
  '6.1 Extend the guide rails and the travelling cable to suit the new level.',
  '6.2 Remove the lock and tag and run the jump lift through its test runs before passengers are carried.',
  '6.3 Record the raise, the test runs and the new top landing on the jump lift register.',
];

const EXCAVATION = [
  'Staged Excavation Sequence of Works - Basement Bulk Excavation',
  'Document No. EX-SOW-01 Revision A Date 30 September 2026',
  'Stage 1 - Site preparation',
  '1. Locate and mark all in-ground services with the service locator before any digging. Pothole by vacuum excavation where services are within 1 m of the dig.',
  '2. Install the perimeter fencing and the truck wash-down bay at the site exit.',
  'Stage 2 - Excavate to the first anchor level',
  '3. Bulk excavate with the 30 tonne excavator to 500 mm below the first row of ground anchors, keeping a 2 m wide berm against the shoring wall.',
  '4. Load trucks within the exclusion zone. The spotter controls truck movements and no person enters the excavator\'s swing radius.',
  'Stage 3 - Install and stress the first row of anchors',
  '5. The anchor contractor drills, grouts and stresses the first row of ground anchors from the berm. Excavation below the anchor level does not start until the engineer has inspected and released the anchors.',
  'Stage 4 - Excavate to the second anchor level and to bulk excavation level',
  '6. Remove the berm and excavate to the second anchor level, then repeat stage 3 for the second row of anchors.',
  '7. Excavate to bulk excavation level. The geotechnical engineer inspects the base and the batters.',
  'Stage 5 - Detail excavation',
  '8. Excavate the pile caps, lift pits and service trenches with the 5 tonne excavator. Trenches deeper than 1.5 m are battered or shored before anyone enters.',
  '9. Dewater the excavation with the sump pumps where groundwater is found, and discharge only through the sediment tank.',
];

const step = (name, quotes, { plant = '', conditions = '', controls = [], hazards = [] } = {}) => ({ step: name, quotes, plant, conditions, controls, hazards });

// The first call's answer for the jump lift methodology.
const JUMP_LIFT_READING = {
  isMethodology: true,
  notMethodology: '',
  steps: [
    step('Confirm the core level is released for the raise', ['Confirm the core walls at the new machine platform level have reached the concrete strength stated by the structural engineer and the formwork contractor has released the level.'], { controls: ['Confirm the core walls at the new machine platform level have reached the concrete strength stated by the structural engineer and the formwork contractor has released the level.'] }),
    step('Stop and lock off the jump lift', ['Stop the jump lift and park the car at the lowest landing.', 'Lock off and tag the main switch at the jump lift controller.'], { controls: ['Lock off and tag the main switch at the jump lift controller.'] }),
    step('Barricade the landing entrances', ['Barricade all landing entrances to the shaft and fix signs reading "Lift shaft work in progress - no entry".'], { conditions: 'Open lift shaft', controls: ['Barricade all landing entrances to the shaft and fix signs reading "Lift shaft work in progress - no entry".'] }),
    step('Inspect the climbing beams and lifting chains', ['Inspect the climbing beams, pockets and lifting chains before use and record the inspection on the pre-raise checklist.'], { controls: ['Inspect the climbing beams, pockets and lifting chains before use and record the inspection on the pre-raise checklist.'] }),
    step('Install the climbing beams and chain blocks', ['Install the two climbing beams in the wall pockets at the new level from the working platform, wearing a harness clipped to the anchor points on the platform.', 'Hang the 5 tonne chain blocks from the climbing beams and attach them to the machine platform lifting points with rated shackles.'], { plant: '5 tonne chain blocks', controls: ['wearing a harness clipped to the anchor points on the platform', 'The supervisor checks every shackle and chain block tag before the raise starts.'] }),
    step('Raise the machine platform with the chain blocks', ['Release the machine platform locking pins only when the chain blocks are taking the load.', 'Raise the machine platform evenly with both chain blocks, one landing at a time, with a person at each chain block and the supervisor watching the platform level.'], {
      plant: 'Chain blocks',
      controls: ['Release the machine platform locking pins only when the chain blocks are taking the load.', 'No person is to stand on the machine platform or below it in the shaft while it is being raised', 'Stop the raise if the platform tilts more than 50 mm side to side, and level it before continuing.'],
      hazards: ['the platform could fall if a chain block fails'],
    }),
    step('Pin the platform at the new level', ['Insert the locking pins at the new level and confirm all four pins are fully engaged.', 'Remove the chain blocks and store them in the site container.'], { controls: ['confirm all four pins are fully engaged'] }),
    step('Extend the guide rails and travelling cable', ['Extend the guide rails and the travelling cable to suit the new level.']),
    step('Return the jump lift to service', ['Remove the lock and tag and run the jump lift through its test runs before passengers are carried.', 'Record the raise, the test runs and the new top landing on the jump lift register.'], { controls: ['run the jump lift through its test runs before passengers are carried'] }),
  ],
};
// The step matching's answer: the library groups that fit, by step (the scope reading's STEPS_BRIEF).
const JUMP_LIFT_STEPS = { packages: [
  { package: 'Step 3: Barricade the landing entrances', groups: ['liftShaft'], unmatched: [], byOthers: [] },
  { package: 'Step 8: Extend the guide rails and travelling cable', groups: ['liftInstall'], unmatched: [], byOthers: [] },
] };

const EXCAVATION_READING = {
  isMethodology: true,
  notMethodology: '',
  steps: [
    step('Locate and pothole the in-ground services', ['Locate and mark all in-ground services with the service locator before any digging.', 'Pothole by vacuum excavation where services are within 1 m of the dig.'], { plant: 'Service locator; vacuum excavation truck', controls: ['Locate and mark all in-ground services with the service locator before any digging.'] }),
    step('Install the perimeter fencing and wash-down bay', ['Install the perimeter fencing and the truck wash-down bay at the site exit.']),
    step('Bulk excavate to the first anchor level', ['Bulk excavate with the 30 tonne excavator to 500 mm below the first row of ground anchors, keeping a 2 m wide berm against the shoring wall.', 'Load trucks within the exclusion zone.'], { plant: '30 tonne excavator; trucks', controls: ['keeping a 2 m wide berm against the shoring wall', 'The spotter controls truck movements and no person enters the excavator\'s swing radius.'] }),
    step('Hold until the first row of anchors is released', ['Excavation below the anchor level does not start until the engineer has inspected and released the anchors.'], { controls: ['Excavation below the anchor level does not start until the engineer has inspected and released the anchors.'] }),
    step('Excavate to the second anchor level and bulk excavation level', ['Remove the berm and excavate to the second anchor level, then repeat stage 3 for the second row of anchors.', 'Excavate to bulk excavation level.'], { controls: ['The geotechnical engineer inspects the base and the batters.'] }),
    step('Detail excavate pile caps, lift pits and trenches', ['Excavate the pile caps, lift pits and service trenches with the 5 tonne excavator.'], { plant: '5 tonne excavator', controls: ['Trenches deeper than 1.5 m are battered or shored before anyone enters.'] }),
    step('Dewater the excavation', ['Dewater the excavation with the sump pumps where groundwater is found, and discharge only through the sediment tank.'], { plant: 'Sump pumps; sediment tank', controls: ['discharge only through the sediment tank'] }),
  ],
};
const EXCAVATION_STEPS = { packages: [
  { package: 'Step 1: Locate and pothole the in-ground services', groups: ['vacExcavation'], unmatched: [], byOthers: [] },
  { package: 'Step 3: Bulk excavate to the first anchor level', groups: ['bulkDig'], unmatched: [], byOthers: [] },
  { package: 'Step 5: Excavate to the second anchor level and bulk excavation level', groups: ['bulkDig'], unmatched: [], byOthers: [] },
  { package: 'Step 6: Detail excavate pile caps, lift pits and trenches', groups: ['detailDig'], unmatched: [], byOthers: [] },
  { package: 'Step 7: Dewater the excavation', groups: ['dewatering'], unmatched: [], byOthers: [] },
] };

// A stand-in for the SDK client: the methodology call (its schema has "steps") gets the reading, the
// step matching call (its schema has "packages") gets the groups. Records what was asked.
function standIn(reading, steps, extra = {}) {
  const client = {
    calls: [],
    stepCalls: [],
    beta: {
      messages: {
        stream(params) {
          const mapping = Boolean(params.output_config.format.schema.properties.packages);
          (mapping ? client.stepCalls : client.calls).push(params);
          const body = mapping ? steps : reading;
          return { finalMessage: async () => ({ stop_reason: 'end_turn', model: 'claude-opus-5-5', usage: mapping ? { input_tokens: 9000, output_tokens: 600 } : { input_tokens: 2000, output_tokens: 3000 }, content: [{ type: 'text', text: typeof body === 'string' ? body : JSON.stringify(body) }], ...(mapping ? {} : extra) }) };
        },
      },
    },
  };
  return client;
}

module.exports = { JUMP_LIFT, EXCAVATION, JUMP_LIFT_READING, JUMP_LIFT_STEPS, EXCAVATION_READING, EXCAVATION_STEPS, standIn };
