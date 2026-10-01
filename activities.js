// Job steps for common kinds of construction work, each with its hazards and
// controls, as the regulators' SWMS templates lay them out. The text is general
// good practice for the subcontractor to check and change to suit the site.
// A control written { fact: 'id' } is replaced with what the user gave for that fact.

// Sources for controls taken from the law or a code of practice.
const ESR = (section) => `Electrical Safety Regulation 2026 (Qld) ${section}`;
const ESA = (section) => `Electrical Safety Act 2002 (Qld) ${section}`;
const CODE = (section) => `Model Code: Managing electrical risks ${section}`;
const src = (text, source) => ({ text, source });

const BEFORE = {
  step: 'Before starting',
  hazards: [
    'Work starts before everyone knows the risks and controls.',
    'People who are not involved walk into the work area.',
  ],
  controls: [
    'Workers have done the site induction, and this SWMS is explained to them before they sign it.',
    'Check that licences, tickets and permits needed for the task are current.',
    'Inspect tools, plant and equipment before use. Tag out and remove anything faulty.',
    'Set up barriers and signs around the work area.',
    'Workers know the site emergency plan, the first aid arrangements and how to raise the alarm.',
  ],
};

// Controls added to Before starting for some kinds of work.
const BEFORE_EXTRA = [
  { when: 'ptSlab', text: 'Check the post-tensioning drawings and scan the slab before drilling or fixing into a post-tensioned slab.' },
  { when: 'respirator', text: 'Tight-fitting respirators are fit tested to each wearer before use, for the make and model they wear, and wearers are clean shaven where the mask seals.' },
  { when: 'electricalWork', text: src('Electrical work is done or supervised only by licensed electrical workers, for a licensed electrical contractor.', `${ESA('s 55, s 56')}`) },
  { when: 'electricalWork', text: src('Apprentices are supervised at all times by a licensed electrical worker. In their first 6 months they do not work where they could contact a live low voltage exposed part.', ESR('s 307')) },
  { when: 'electricalWork', text: src('Everyone doing electrical work is competent in rescue and resuscitation.', ESR('s 211')) },
  { when: 'electricalWork', text: src('A serious electrical incident or dangerous electrical event is reported to the regulator immediately, and the site is left undisturbed.', ESR('s 292, s 296')) },
  { when: 'ewp', text: 'A rescue plan is in place for anyone working from an elevating work platform or held by a harness.' },
];

const FINISH = {
  step: 'Finish and clean up',
  hazards: [
    'Trips and cuts from waste and offcuts.',
    'The area is left unsafe for others.',
  ],
  controls: [
    'Remove waste and offcuts as the work goes, and at the end of each day.',
    'Barriers and signs stay in place until the hazard is gone.',
    'Report any incident, near miss or damage to the supervisor.',
  ],
};

const ACTIVITIES = [
  {
    when: 'road',
    steps: [{
      step: 'Set up traffic management',
      hazards: ['Workers struck by passing vehicles.', 'Vehicles or pedestrians enter the work area.'],
      controls: [
        'Set up traffic control to the approved traffic management plan before work starts, with the road authority\'s approval where needed.',
        'Only qualified traffic controllers direct traffic.',
        'Keep work, plant and materials inside the separated work area.',
        'Protect the public on the footpath with a closure or a gantry, as approved.',
        'A spotter guides trucks reversing or entering the loading zone.',
      ],
    }],
    ppe: ['hivisNight', 'sunscreen'],
  },
  {
    when: 'power',
    steps: [{
      step: 'Plan the work near overhead power lines',
      hazards: ['Plant, a load or a tool contacts or comes close to the lines, causing electrocution.'],
      controls: [
        { fact: 'electricalSafety' },
        'Stop work if any part of the plant or load comes inside the safe distance.',
        'Treat every line as live unless the network operator confirms in writing it is isolated.',
      ],
    }],
  },
  {
    when: 'scaffold',
    steps: [
      {
        step: 'Set up and protect the area below',
        hazards: ['Falling objects strike people below, including the public.', 'Scaffold collapse from poor ground or base.'],
        controls: [
          'Protect people below with a hoarding or gantry, or divert pedestrians, as approved.',
          'Check the ground and set out base plates and sole boards to the scaffold design.',
        ],
      },
      {
        step: 'Erect the scaffold',
        hazards: ['Scaffolders fall from height.', 'Dropped components.', 'Manual handling strain.'],
        controls: [
          { fact: 'fallControl' },
          { fact: 'systemInstructions' },
          'A licensed scaffolder erects the scaffold to the manufacturer\'s or designer\'s instructions. Do not mix components from different systems.',
          'Install ties as the scaffold goes up.',
          'Pass components hand to hand or use a gin wheel. Do not throw them.',
        ],
      },
      {
        step: 'Inspect and hand over',
        hazards: ['People use an incomplete or unsafe scaffold.'],
        controls: [
          'A competent person inspects the scaffold before it is used and tags it.',
          'Incomplete sections are tagged as not to be used and access is blocked.',
        ],
      },
    ],
    ppe: ['sunscreen'],
  },
  {
    when: 'roof',
    steps: [
      {
        step: 'Set up roof access and fall protection',
        hazards: ['Falling from the roof edge or through openings.'],
        controls: [
          { fact: 'fallControl' },
          'Fall protection is installed and checked before anyone goes onto the roof.',
          'Access by a scaffold stair, or a ladder secured top and bottom that extends above the landing.',
        ],
      },
      {
        step: 'Remove old roofing',
        hazards: ['Falling through brittle roofing or openings.', 'Cuts from sheet edges.', 'Sheets caught by wind.'],
        controls: [
          'Walk only on purlin lines or on safety mesh.',
          'Cover or barricade openings as soon as sheets are removed.',
          'Wear cut resistant gloves when handling sheets.',
          'Stop handling sheets in strong wind.',
        ],
      },
      {
        step: 'Lift materials to and from the roof',
        hazards: ['Falling objects strike people below.', 'Manual handling strain.'],
        controls: [
          'Exclusion zone below the work, with barriers and signs.',
          'Use mechanical lifting where possible. Team lift long sheets.',
          'Secure sheets stacked on the roof against wind.',
        ],
      },
      {
        step: 'Fix new roofing',
        hazards: ['Fall from height.', 'Power tool injuries.', 'Heat and sun exposure.'],
        controls: [
          'Stay inside the edge protection at all times.',
          'Use tools with guards in place. Keep leads away from edges.',
          'Plan work for cooler times. Water and shade breaks.',
        ],
      },
    ],
    ppe: ['gloveCut', 'sunHat', 'sunscreen'],
  },
  {
    when: 'trench',
    steps: [
      {
        step: 'Locate underground services',
        hazards: ['Striking underground electrical, gas, water or communications services.'],
        controls: [
          'Get service plans, for example through Before You Dig Australia, and locate services on site before digging.',
          'Dig by hand or by vacuum excavation near located services.',
        ],
      },
      {
        step: 'Excavate',
        hazards: ['The excavator strikes a person.', 'The ground collapses.'],
        controls: [
          { fact: 'trenchSupport' },
          'Exclusion zone around the excavator, with a spotter when people are nearby.',
          'Keep spoil and plant back from the trench edge.',
        ],
      },
      {
        step: 'Work in the trench',
        hazards: ['Trench collapse buries a worker.', 'Falling into the trench.', 'Water or bad air in the trench.'],
        controls: [
          'No one enters the trench until the support is in place and checked.',
          'Ladder access inside the supported area.',
          { fact: 'fallControl' },
          'Check the trench at the start of each shift and after rain.',
        ],
      },
      {
        step: 'Backfill and restore',
        hazards: ['Plant strikes a person.', 'An open trench is left unprotected.'],
        controls: [
          'Remove the support as backfilling proceeds, as designed.',
          'Cover or barricade any open trench overnight.',
        ],
      },
    ],
    ppe: ['earMuffs', 'sunscreen'],
  },
  {
    when: 'propping',
    steps: [{
      step: 'Install temporary support',
      hazards: ['The structure above collapses.'],
      controls: [
        { fact: 'temporarySupport' },
        'No load-bearing part is removed until the propping is installed and checked.',
      ],
    }],
  },
  {
    when: 'demolition',
    steps: [
      {
        step: 'Demolish',
        hazards: ['Falling bricks and debris.', 'Silica dust from cutting or breaking masonry or concrete.', 'Noise.'],
        controls: [
          'Exclusion zone around the demolition.',
          'Use water suppression or on-tool dust extraction when cutting or breaking masonry or concrete.',
          'Remove debris as the work goes.',
        ],
      },
      {
        step: 'Complete the permanent structure and remove props',
        hazards: ['Collapse when props are removed too early.'],
        controls: ['Props are removed only when the engineer confirms the permanent structure is complete.'],
      },
    ],
    ppe: ['p2', 'earMuffs'],
  },
  {
    // Cranes supplied and operated by a crane company: the crews' part is working with them.
    when: 'craneInterface',
    steps: [
      {
        step: 'Plan lifts with the crane company',
        hazards: ['Lifts not planned for this work.', 'Loads land where the structure cannot take them.'],
        controls: [
          { fact: 'craneCompany' },
          'Agree each day\'s lifts with the crane company\'s crew before work starts, including where loads land.',
          'Landing areas are clear, ready and within the rated load of where loads land before each lift.',
          'Wind and weather stops are set by the crane company. When the crane stops, the lift stops.',
        ],
      },
      {
        step: 'Work with the crane crew during lifts',
        hazards: ['A person is struck or crushed by a load.', 'A badly prepared load falls apart in the air.', 'Miscommunication with the crane crew.'],
        controls: [
          'Only licensed dogmen or riggers sling, direct and release loads.',
          'Prepare loads as the crane crew directs: bundled, strapped, and with loose items removed.',
          'Stay out from under suspended loads and out of the crane\'s exclusion zones.',
          'Stop and tell the crane crew straight away if a load is unstable or a lift looks unsafe.',
        ],
      },
    ],
  },
  {
    when: 'towerCrane',
    ppe: ['chinStrap'],
    steps: [
      {
        step: 'Plan the tower crane lifts',
        hazards: ['Overloading the crane.', 'Lifting in winds above the crane\'s limits.', 'Loads passing over people, including the public.'],
        controls: [
          { fact: 'craneChart' },
          'Know the weight of every load before it is lifted. Use the crane\'s load chart for the radius of each lift.',
          'Stop lifting when the wind is above the crane supplier\'s limits. Lower limits apply to loads with a large surface, such as formwork, screens and panels.',
          'Where more than one crane works, the cranes use the anti-collision or zoning system, and the operators follow an agreed radio protocol.',
          'No loads over the public unless the area below is protected or closed, as approved.',
          'The crane operator, dogmen and riggers hold current high risk work licences for the work they do.',
        ],
      },
      {
        step: 'Rig, lift and land loads with the tower crane',
        hazards: ['A dropped load.', 'A person is struck or crushed by the load.', 'The dogman loses sight of the load.'],
        controls: [
          'Inspect lifting gear before use. Check tags and ratings, and use gear rated for the load.',
          'Use tag lines to control loads. No one goes under a suspended load.',
          'The dogman stays in radio contact with the operator, and a second dogman is used where the load is out of sight.',
          'Land loads on a stable surface, within the rated load of where they land, and secure them before releasing the rigging.',
        ],
      },
    ],
  },
  {
    when: 'crane',
    steps: [
      {
        step: 'Set up the crane',
        hazards: ['The crane overturns from poor ground or an overload.'],
        controls: [
          { fact: 'craneChart' },
          'Check the ground and use outrigger pads before setting up.',
          'The crane operator, and the dogman or rigger, hold current high risk work licences.',
        ],
      },
      {
        step: 'Rig and lift the load',
        hazards: ['A dropped load.', 'A person is struck or crushed by the load.'],
        controls: [
          'Inspect lifting gear before use. Check tags and ratings.',
          'Use tag lines to control the load.',
          'Exclusion zone. No one goes under a suspended load.',
        ],
      },
      {
        step: 'Land and release the load',
        hazards: ['Crushing between the load and the structure.'],
        controls: ['Land the load on a stable surface, within the rated load of where it lands, and secure it before releasing the rigging.'],
      },
    ],
  },
  {
    when: 'loadOut',
    steps: [
      {
        step: 'Load out floors and use loading platforms',
        hazards: ['A person falls from the loading platform or slab edge.', 'Materials fall from the floor or the platform.', 'Overloading the platform, the slab or a newly poured floor, causing collapse.'],
        controls: [
          { fact: 'systemInstructions' },
          { fact: 'loadLimits' },
          'Load limits are signed at each landing and stacking area, and loads are checked against them before they are landed.',
          'Loading platforms are installed to the supplier\'s design, inspected, and signed with their rated load.',
          'Platform gates stay closed except when a load is being landed or taken off.',
          'Stack materials within the slab\'s allowable load, away from edges and penetrations, and secure them against wind.',
          'Keep loose materials, offcuts and packaging tied down or removed from the edges.',
        ],
      },
    ],
  },
  {
    when: 'forklift',
    steps: [
      {
        step: 'Operate forklifts',
        hazards: ['A person is struck by the forklift or its load.', 'The forklift tips over.', 'A suspended slab is overloaded.'],
        controls: [
          'Forklift operators hold a high risk work licence for forklift trucks. Telehandler operators are trained and assessed for the machine, and hold a crane licence where its set-up needs one.',
          'Separate people from forklift routes with barriers, and use a spotter where people are near.',
          'Wheel stops or barriers at slab edges and penetrations on forklift routes.',
          { fact: 'loadLimits' },
          'Check the slab and the backpropping can take the forklift and its load before it is used on a suspended floor, and keep to the routes and areas the load limits allow.',
          'Carry loads low, within the rated capacity, and never lift people on the forks.',
        ],
      },
    ],
    ppe: ['hivisNight'],
  },
  {
    when: 'formwork',
    steps: [
      {
        step: 'Erect falsework and shores',
        hazards: [
          'Falsework collapse.',
          'A person falls while erecting bearers and joists.',
          'Dropped components.',
          'Manual handling: lifting and carrying props, frames, beams and ply, often overhead or in awkward postures, and repeated many times a day.',
        ],
        controls: [
          { fact: 'systemInstructions' },
          'Erect, use and dismantle the system only to the supplier\'s instructions. Do not mix components from different systems, or change them, without the supplier\'s approval.',
          { fact: 'formworkDesign' },
          'Erect falsework to the formwork design, on a base that can take the load.',
          'Erect bearers and joists from a working platform or from below, as the formwork design sets out, so no one works at an unprotected edge.',
          'Manual handling: move props, frames, beams and ply to the work area in crane-lifted bundles, on trolleys or by hoist, not by carrying them across the floor.',
          'Manual handling: team lift long or heavy items, keep loads close to the body, and limit lifting above shoulder height.',
          'Manual handling: rotate tasks and take breaks during repetitive erection.',
        ],
      },
      {
        step: 'Install edge protection and lay the deck',
        hazards: ['A person falls from the slab edge or through gaps in the deck.', 'Materials fall from the edge.', 'Cuts, dust and noise from power saws.', 'Manual handling: carrying and placing ply sheets, often in wind.'],
        controls: [
          { fact: 'fallControl' },
          'Perimeter screens or edge protection are in place before anyone works near the edge.',
          {
            choice: 'deckMethod',
            options: {
              below: [
                'Lay the ply from a working platform below the joists, fully decked, at the height and width the formwork design sets.',
                'No one climbs onto the joists or the ply from below.',
                'Two people hand sheets up into place.',
              ],
              top: [
                'Stand only on sheets that are laid and fixed. Never step onto joists or unfixed sheets.',
                'Lay sheets progressively in front of the worker, working away from the edge, with the edge protection in place first.',
                'Nets or a platform under the deck where the formwork design calls for them.',
                'Two people handle full sheets, and sheets are not carried in strong wind.',
              ],
            },
          },
          'Use power saws with guards in place, with dust extraction or a P2 respirator, and hearing protection.',
        ],
      },
      {
        step: 'Load ply onto the deck while it is being laid',
        hazards: [
          'Overloading the deck or the joists with ply packs.',
          'A pack landed on joists or unfixed sheets falls through.',
          'A pack swinging into workers at the leading edge.',
          'Packs or sheets blown off the deck.',
        ],
        controls: [
          { fact: 'loadLimits' },
          'Load limits are signed at each landing and stacking area, and loads are checked against them before they are landed.',
          'Land ply packs only on laid and fixed deck over the bearers, within the load the formwork design allows. Never on joists alone or on unfixed sheets.',
          'Keep the landing area away from the leading edge, and clear of people while a load comes in.',
          'Crane loads are directed by the crane crew. A forklift or telehandler places packs within its rated capacity at that reach, with a spotter, and only where the formwork design allows.',
          'Secure landed packs against wind, and cut the straps only when the pack is stable.',
        ],
      },
      {
        step: 'Form penetrations and voids',
        hazards: ['A person falls through a penetration or void.'],
        controls: ['Cover penetrations straight away with fixed covers that can take the load and are marked, or fence them off.'],
      },
      {
        step: 'Inspect before the pour',
        hazards: ['Formwork fails during the pour.'],
        controls: ['A competent person checks the formwork and falsework are built to the design, and signs it off, before the pour.'],
      },
      {
        step: 'Strip formwork and backprop',
        hazards: ['The slab or falsework collapses.', 'Falling formwork strikes a person.', 'Manual handling: lowering ply and beams from overhead.'],
        controls: [
          'Strip only after stressing is complete and the post-tensioning engineer releases the slab, in the order in the formwork design.',
          'Install backprops progressively as each bay is stripped, to the design, and leave them until the design allows removal.',
          'Exclusion zone below and around the area being stripped.',
          'Lower components in a controlled way with stripping tools. Do not drop them or catch them from overhead.',
        ],
      },
    ],
    ppe: ['chinStrap', 'earPlugs'],
  },
  {
    when: 'jumpform',
    steps: [
      {
        step: 'Prepare to climb the jumpform',
        hazards: ['Loose materials fall during the climb.', 'Climbing in high wind.'],
        controls: [
          { fact: 'jumpformProcedure' },
          'Before each climb, the supplier or engineer confirms the concrete strength at the climbing anchors, and the pre-climb check is signed.',
          'Before each climb, remove loose materials and tools from all platforms and check anchors and hydraulics.',
          'Climb only within the supplier\'s wind limits.',
        ],
      },
      {
        step: 'Climb the jumpform',
        hazards: ['The jumpform fails or drops.', 'Falling objects strike people below.', 'Crushing between moving platforms and the wall.', 'Hydraulic hose failure and oil injection.'],
        controls: [
          'Only the trained climbing crew is on the jumpform during the climb, under a supervisor.',
          'No one stands between moving and fixed parts during the climb. Check hydraulic hoses before the climb, and never feel for a leak by hand.',
          'Exclusion zone below the core during the climb.',
          'After each climb, the platforms are inspected and handed over in writing before trades return.',
        ],
      },
      {
        step: 'Work on the jumpform platforms',
        hazards: ['A person falls through gaps between the platform and the wall.', 'Dropped objects.', 'Emergency escape from the platforms.'],
        controls: [
          'Close the gaps between platforms and the wall, and keep the screens and mesh in place.',
          'Keep tools tethered or contained, and keep platforms tidy.',
          'Keep emergency access routes from the platforms clear, and include the jumpform in the site emergency plan.',
          'Lift shafts and core voids are screened or covered at every level, including below hung platforms.',
        ],
      },
      {
        step: 'Fix reo and set the wall forms from the platforms',
        hazards: ['Overloading the platforms.', 'Impalement on exposed bars.', 'Dropped bars and tools.'],
        controls: [
          'Land materials on the platforms within the supplier\'s rated platform load.',
          'Cap or cover exposed bars.',
          'Keep tools tethered or contained when working near the platform edges.',
        ],
      },
      {
        step: 'Pour the core walls',
        hazards: ['Formwork overpressure from pouring too fast.', 'Hose whip at start-up or when a blockage clears.', 'Concrete on the skin and in the eyes.'],
        controls: [
          'Pour the walls at the rate in the formwork design.',
          'Concrete is placed by placing boom or kibble, with the hose hand in contact with the operator.',
          'The placing boom operator holds a high risk work licence for a concrete placing boom.',
          'No one stands or works under the boom while it is operating.',
          'Keep people clear of the end hose at start-up. Clear blockages only after the pressure is released.',
          'Wash wet concrete off the skin straight away. Wear gloves and eye protection.',
        ],
      },
    ],
    // On a jumpform, reo and concrete are core wall work, not slab work.
    replaces: ['reo', 'concrete'],
    ppe: ['chinStrap', 'gloveChemical', 'earPlugs'],
  },
  {
    when: 'reo',
    steps: [
      {
        step: 'Lift reo onto the deck',
        hazards: ['Dropped bundles.', 'Overloading the formwork with stacked bundles, causing collapse.'],
        controls: [
          'Lift bundles with rated slings or chains, never by the tie wire.',
          { fact: 'loadLimits' },
          'Land bundles on bearers, spread out within the formwork\'s allowable load. Do not stack bundles in one place.',
        ],
      },
      {
        step: 'Place and tie reo',
        hazards: ['Impalement on exposed bars.', 'Trips on bars and chairs.', 'Cuts and back strain.', 'A person falls from the edge.'],
        controls: [
          'Cap or cover exposed starter bars and ends of bars.',
          'Keep penetration covers in place. Fence any opening before a cover is lifted to pass bars through.',
          'Lay walkways over the reo where people need to cross it.',
          'Team lift long or heavy bars, and rotate tying tasks.',
          'Work inside the edge protection at all times.',
        ],
      },
    ],
    ppe: ['gloveCut', 'chinStrap'],
  },
  {
    when: 'ptTendons',
    ppe: ['earPlugs', 'faceShield'],
    steps: [
      {
        step: 'Place post-tensioning ducts and tendons',
        hazards: ['Coiled strand springs free when it is released.', 'Cuts from strand ends.', 'A person falls while fixing anchors at the slab edge.', 'Abrasive saw injuries, noise and sparks.'],
        controls: [
          'Lift strand coils in their cradle or with rated gear, and dispense strand from a cradle that stops the coil springing.',
          'Release coils and strapping in a controlled way, standing clear of the strand ends.',
          'Fix live-end anchors and pocket formers from inside the edge protection or from a working platform.',
          'Use abrasive saws with guards in place, with eye and hearing protection.',
          'Fix ducts and tendons to the post-tensioning drawings.',
        ],
      },
    ],
  },
  {
    when: 'concrete',
    steps: [
      {
        step: 'Set up the concrete pump and placing boom',
        hazards: ['The pump or boom overturns.', 'The boom strikes a person or structure.', 'The boom or pipeline fails, or concrete falls from the boom, onto a person below.'],
        controls: [
          'A truck-mounted pump stands on ground that can take the outrigger loads, with pads under the outriggers.',
          'A placing boom on the slab stands on an engineer-certified base or ballast.',
          'The pipeline is restrained, pressure-rated, and checked for wear and secure clamps before each pour.',
          'The placing boom operator holds a high risk work licence for a concrete placing boom.',
          'Keep the boom within its rated reach and clear of the crane\'s working area, as coordinated with the crane crew.',
          'No one stands or works under the boom while it is operating.',
        ],
      },
      {
        step: 'Pump and place concrete',
        hazards: ['Hose whip at start-up or when a blockage clears.', 'A burst line.', 'A person falls from the edge or through the deck.'],
        controls: [
          'Check pipes, clamps and the end hose before pumping.',
          'Keep people clear of the end hose at start-up. Clear blockages only after the pressure is released.',
          'Stay inside the edge protection.',
          'Place concrete evenly. Do not heap it on the deck beyond what the formwork design allows.',
          'A competent formwork watcher checks the formwork during the pour and can stop the pour.',
          'The hose hand stays in contact with the operator by radio or agreed signals.',
        ],
      },
      {
        step: 'Finish concrete',
        hazards: ['Cement burns to the skin and eyes.', 'Power trowel injuries.', 'Back strain.'],
        controls: [
          'Wash wet concrete off the skin straight away. Wear gloves and eye protection.',
          'Use power trowels with guards and a working stop switch.',
          'Rotate finishing tasks and take breaks.',
        ],
      },
    ],
    ppe: ['gloveChemical', 'chinStrap', 'earPlugs', 'gumboots'],
  },
  {
    when: 'stressing',
    steps: [
      {
        step: 'Stress the tendons',
        hazards: ['A tendon or anchor fails under load and is released violently, including out past the slab edge over the street or lower levels.', 'Hydraulic hose failure and oil injection.'],
        controls: [
          {
            fact: 'stressingProcedure',
            otherwise: 'Only the trained stressing crew stresses tendons, to the engineer\'s sequence, once the concrete strength the engineer requires is reached.',
          },
          'The line of fire behind each jack is shielded. No one stands behind or in line with the jack.',
          'During stressing, the area in line with the tendon is excluded, including outside the screens, on the levels below, and on the footpath or street below where the line of fire reaches it, as approved.',
          'Check the jack, gauges and hoses before use. Never feel for a hydraulic leak by hand. Release the pressure before disconnecting hoses.',
        ],
      },
      {
        step: 'Cut tails and grout',
        hazards: ['Grout on the skin and in the eyes.', 'Dust from mixing bagged grout.', 'Grout hose bursts or blockages.', 'Cutting disc injuries and noise.'],
        controls: [
          'Cut tendon tails only after the engineer accepts the stressing records.',
          'Wear gloves and eye protection when grouting, and a P2 respirator when mixing bagged grout.',
          'Check grout pump hoses and fittings before use. Release the pressure before clearing a blockage.',
          'Use cutting tools with guards in place, with hearing protection.',
        ],
      },
    ],
    ppe: ['faceShield', 'gloveChemical', 'p2', 'earPlugs'],
  },
  {
    when: 'ewp',
    steps: [{
      step: 'Use an elevating work platform',
      hazards: ['The platform overturns or falls from a slab edge.', 'The operator is crushed against the structure.'],
      controls: [
        'Check the slab can take the platform, and keep it back from slab edges and penetrations.',
        'The operator is trained for the platform, and holds a high risk work licence for a boom of 11 m or more.',
        'Wear a harness attached to the platform\'s anchor point in a boom-type platform.',
      ],
    }],
    ppe: ['harness'],
  },
  {
    when: 'precast',
    steps: [{
      step: 'Stand and brace the precast elements',
      hazards: ['A precast element falls or topples onto a person.'],
      controls: [
        { fact: 'erectionDesign' },
        { fact: 'centreOfGravity' },
        { fact: 'braceArrangement' },
        { fact: 'regulatorNotified' },
        'Inspect lifting inserts and elements for damage on delivery. Do not lift a damaged element.',
        'Each element has at least two braces fixed, as the erection design shows, before the crane hook is released. Where the design calls for more, all are fixed first.',
      ],
    }, {
      step: 'Grout the base and remove the braces',
      hazards: ['Grout dust, and grout on the skin and in the eyes.', 'An element falls if its braces are removed too early.'],
      controls: [
        'Mix bagged grout with dust control. Wear a P2 respirator, gloves and eye protection.',
        'Braces stay in place until the grout reaches strength and the connections are complete, and the engineer approves their removal.',
      ],
    }],
  },
  {
    when: 'tempPower',
    steps: [
      {
        step: 'Install construction power and temporary lighting',
        hazards: ['Electric shock from damaged leads or equipment.', 'Leads damaged by plant, water or concrete.', 'Trips over leads.'],
        controls: [
          { fact: 'constructionTesting' },
          src('All construction wiring and electrical equipment complies with AS/NZS 3012.', ESR('s 140, s 192')),
          src('Construction wiring, switchboards and RCDs carry a test tag only if new, or inspected and tested by a competent person, with the retest date and the tester shown.', ESR('s 140(3)-(4)')),
          src('Run leads where they will not be damaged, or protect them. Keep them off the ground on lead stands or insulated hangers, and away from doorways and sharp edges.', `${ESR('s 18')}; ${CODE('s 3')}`),
          src('RCD protection as AS/NZS 3012 requires. If an RCD trips, the circuit stays off until a competent person finds the cause.', CODE('s 3.4')),
        ],
      },
      {
        step: 'Inspect, test and maintain construction power',
        hazards: ['Unsafe equipment stays in use.'],
        controls: [
          src('Unsafe equipment is disconnected, labelled unsafe, and not reconnected until it is repaired or tested and found safe.', `${ESR('s 17')}; ${CODE('s 3.1')}`),
          src('Hired electrical equipment is inspected, tested and tagged by the hire company before hire.', ESR('s 142')),
          src('Use battery tools in place of mains tools where practical.', CODE('s 2.3')),
        ],
      },
    ],
  },
  {
    when: 'castIn',
    steps: [{
      step: 'Install cast-in conduits on the deck before the pour',
      hazards: ['A person falls from the slab edge or through a penetration.', 'Impalement or trips on reo.', 'Working among formworkers and reo fixers.', 'Leads damaged by water or concrete.'],
      controls: [
        src('Conduit work by a worker without an electrical licence is done under the supervision of a licensed electrical worker, with no energised wiring in the conduits.', ESA('s 18(2)(e)')),
        src('Agree access, timing and the order of work with the formwork and reo crews and the principal contractor before the pour.', CODE('s 7.2')),
        'Stay inside the edge protection, and keep penetration covers in place.',
        'Use walkways over the reo, and keep exposed bars capped or covered.',
        src('Run construction power leads on the deck where they will not be damaged by water, concrete or work, or protect them.', ESR('s 18')),
      ],
    }],
  },
  {
    when: 'containment',
    steps: [{
      step: 'Install cable tray, containment and cabling at height',
      hazards: ['A fall from a ladder, platform or elevating work platform.', 'A fall into an open riser or shaft.', 'Dropped tools and materials.', 'Contact with energised parts nearby.'],
      controls: [
        src('Use non-conductive ladders for electrical work.', CODE('s 9.2')),
        'Risers and shafts are screened or covered at each level. Only the section being worked on is opened, and it is fenced.',
        src('Restrain tools with lanyards or holders when working above others or near switchboards.', CODE('s 9.1')),
        src('Where an exposed energised part is within 3 m, de-energise it or fit covers, and use a safety observer where the work is energised work.', `${ESR('s 193')}; ${CODE('s 9.2')}`),
        'In the basement, use battery or electric plant where practical. Otherwise ventilate, and monitor for exhaust fumes.',
      ],
    }],
  },
  {
    when: 'cablePull',
    steps: [{
      step: 'Pull cables and handle cable drums',
      hazards: ['A drum rolls or falls.', 'Back strain and crush injuries handling drums and cable.', 'Caught in a winch or struck by a cable under tension.', 'Contact with an existing energised cable.'],
      controls: [
        'Move drums with a forklift, crane or drum trailer. Chock them, and pay out from a drum stand with a spindle.',
        'Use a winch with guards and a stop control. Keep people out of the line of pull and away from pulling points.',
        'Manual handling: team pull, rotate tasks, and keep cable bends and pulling points within reach without twisting.',
        src('Treat existing cables as energised until proved de-energised. Check both ends for isolation before cutting, and use a cable spiking device where it is fit for purpose.', `${ESR('s 196(2)')}; ${CODE('s 5.3')}`),
        src('Run the leads for winches and tools where they will not be damaged, or protect them.', ESR('s 18')),
      ],
    }],
    ppe: ['gloveGeneral'],
  },
  {
    when: 'fitOff',
    steps: [{
      step: 'Rough-in and fit-off in the apartments',
      hazards: ['Contact with live cables when drilling or chasing.', 'Silica dust from chasing or drilling concrete or blockwork.', 'Work in ceiling spaces.', 'A fall from a ladder or platform.', 'Swarf entering switchboards and enclosures.'],
      controls: [
        src('Work in a roof space (between the roof and the top floor ceiling) only when the electrical installation is de-energised, unless a risk assessment and written statement under the regulation cover the work.', ESR('s 31, s 33, s 34')),
        src('In ceiling spaces between floors, treat cables as energised until they are proved de-energised.', ESR('s 196(2)')),
        src('Check for cables before drilling or chasing, and scan post-tensioned slabs first.', CODE('appendix C')),
        'Chase and drill with water suppression or on-tool dust extraction.',
        'Use platform ladders or mobile scaffolds, not the top steps of a stepladder.',
        src('Cover open switchboards and enclosures to keep swarf out.', CODE('appendix C')),
      ],
    }],
    ppe: ['p2', 'earPlugs'],
  },
  {
    when: 'switchboard',
    steps: [
      {
        step: 'Isolate and prove de-energised',
        hazards: ['Electric shock and arc flash.', 'Equipment re-energised while work is underway.'],
        controls: [
          { fact: 'isolationProcedure' },
          src('Treat every exposed part as energised until it is isolated and tested by a competent person and found de-energised.', ESR('s 196')),
          src('Test the tester on a known source, test for zero volts, then test the known source again. Do not rely on proximity testers. Use instruments rated Category III or IV.', CODE('s 9.4')),
          src('Lock isolation points in the open position and tag them. Each worker fits a personal lock, and tags are removed only by the person who signed them.', `${ESR('s 197, s 198')}; ${CODE('s 6.1')}`),
        ],
      },
      {
        step: 'Work on or near energised parts',
        hazards: ['Electric shock and arc flash from exposed energised parts within 3 m.'],
        controls: [{
          choice: 'energisedWork',
          options: {
            none: [
              src('No work is done on or near energised parts (within 3 m of an exposed energised part). If that changes, stop and prepare for energised work as the regulation requires.', ESR('s 193, s 195')),
            ],
            testing: [
              src('Work on or near energised parts is done only where the regulation allows, such as testing, and never because it is more convenient.', `${ESR('s 195')}; ${CODE('s 7.1')}`),
              src('Before the work: a competent person\'s recorded risk assessment, this SWMS, clear access and exit, the isolation point labelled and quick to operate, and authorisation after consulting the principal contractor.', ESR('s 199, s 200')),
              src('Only authorised people enter the area, and barriers prevent contact with exposed energised parts.', ESR('s 201, s 202')),
              src('A safety observer, assessed in the last 12 months as competent in rescue and resuscitation, watches the work and does no other work.', `${ESR('s 203, schedule 10')}; ${CODE('s 7.3')}`),
              src('Use insulated tools, tested test equipment, and PPE rated for the energy at the point of work: an arc-rated face shield, insulated gloves and flame-resistant clothing. No metal jewellery.', `${ESR('s 203')}; ${CODE('s 9.5')}`),
            ],
          },
        }],
      },
      {
        step: 'Test, connect and commission',
        hazards: ['New work energised before it is safe.', 'People exposed while equipment is energised for testing.'],
        controls: [
          src('Test new work so it is electrically safe before it is connected, and keep people not needed for testing safe while it is energised.', ESR('s 207')),
          src('Do not connect an installation unless the work was done by a licensed person and tested as electrically safe and compliant with the wiring rules.', ESR('s 219')),
          src('Give the distribution entity the notice of test, and issue the certificate of testing and compliance.', ESR('s 228, s 229')),
          src('Before restoring power: terminate conductors, test insulation resistance, earth continuity, polarity and function, remove temporary bonds, tell workers, and remove locks and tags by the procedure.', CODE('s 6.3')),
        ],
      },
      {
        step: 'Leave unfinished work safe',
        hazards: ['Someone contacts or energises unfinished work.'],
        controls: [
          src('Terminate and secure conductors, tag and tape off, label the switchboard status, prevent re-energising, and hand over.', CODE('s 6.4')),
        ],
      },
    ],
  },
  {
    when: 'asbestos',
    steps: [
      {
        step: 'Prepare the asbestos work area',
        hazards: ['Asbestos fibres are released into the area.'],
        controls: [
          { fact: 'asbestosArrangement' },
          'Isolate the area with barriers and asbestos warning signs.',
          'Do not break, cut, drill or use power tools on the asbestos.',
        ],
      },
      {
        step: 'Remove the asbestos',
        hazards: ['Breathing in asbestos fibres.'],
        controls: [
          'Keep the material wet and remove it whole, by hand.',
          'Wear disposable coveralls and a respirator rated P2 or higher.',
        ],
      },
      {
        step: 'Bag, label and dispose of asbestos waste',
        hazards: ['Fibres spread beyond the work area.'],
        controls: [
          'Wrap the waste in heavy duty plastic, label it as asbestos waste and take it to a facility licensed to accept it.',
          'Where a licensed removalist does the work, a clearance inspection is done before the area is reopened.',
        ],
      },
    ],
    ppe: ['coveralls', 'p2'],
  },
  {
    when: 'confined',
    steps: [
      {
        step: 'Prepare to enter the confined space',
        hazards: ['Low oxygen, or toxic or flammable gas.', 'Engulfment or entrapment.'],
        controls: [
          { fact: 'confinedSpace' },
          'Isolate and lock out inlet and outlet lines before entry.',
        ],
      },
      {
        step: 'Enter and work',
        hazards: ['A fall at the access.', 'A worker is overcome by the atmosphere.'],
        controls: [
          { fact: 'fallControl' },
          'Monitor the air continuously. Leave at once if the alarm sounds.',
          'The standby person stays outside and in contact at all times.',
        ],
      },
      {
        step: 'Leave and close up',
        hazards: ['A person or tool is left inside.'],
        controls: [
          'Account for everyone and all tools before closing the access.',
          'Close and sign off the entry permit.',
        ],
      },
    ],
    ppe: ['harness'],
  },
  {
    when: 'water',
    steps: [
      {
        step: 'Set up rescue equipment',
        hazards: ['A person falls into the water and drowns.'],
        controls: [
          { fact: 'drowningControls' },
          'Check the tides and the weather before starting. Stop work in rough conditions.',
        ],
      },
      {
        step: 'Work over the water',
        hazards: ['Falling through open bays.', 'Splinters and cuts.', 'Power tool injuries.'],
        controls: [
          'Open one bay at a time and cover or barricade it.',
          'Wear gloves when handling timber.',
          'Use tools with guards in place.',
        ],
      },
    ],
    ppe: ['lifeJacket', 'sunHat', 'sunscreen'],
  },
  {
    when: 'painting',
    steps: [
      {
        step: 'Prepare to paint',
        hazards: ['Breathing in solvent fumes.', 'Fire from flammable vapour.'],
        controls: [
          { fact: 'safetyDataSheet' },
          'Ventilate the area: open doors and windows, and use fans if needed.',
          'No smoking, flames or sparks in the area.',
        ],
      },
      {
        step: 'Paint',
        hazards: ['Paint on the skin or in the eyes.', 'Trips over drop sheets and tins.'],
        controls: [
          'Wear the gloves and eye protection the safety data sheet lists.',
          'Keep only the paint needed in the work area, with lids on when not in use.',
        ],
      },
      {
        step: 'Clean up paint and solvents',
        hazards: ['Fire from solvent-soaked rags.'],
        controls: ['Put solvent-soaked rags in a closed metal container or take them off site.'],
      },
    ],
    ppe: ['gloveChemical'],
  },
];

// Personal protective equipment, grouped as site PPE lists usually are.
const PPE = [
  { area: 'Head', items: [['hardHat', 'Hard hat'], ['chinStrap', 'Chin strap'], ['sunHat', 'Broad brim or neck flap']] },
  { area: 'Eyes and face', items: [['glassesClear', 'Safety glasses, clear'], ['glassesTinted', 'Safety glasses, tinted'], ['goggles', 'Goggles'], ['faceShield', 'Face shield']] },
  { area: 'Hearing', items: [['earPlugs', 'Ear plugs'], ['earMuffs', 'Ear muffs']] },
  { area: 'Breathing', items: [['p2', 'P2 respirator (fit tested)'], ['halfFace', 'Half-face respirator with filters (fit tested)']] },
  { area: 'Hands', items: [['gloveGeneral', 'General purpose gloves'], ['gloveCut', 'Cut resistant gloves'], ['gloveChemical', 'Chemical resistant gloves'], ['gloveInsulated', 'Insulated electrical gloves']] },
  { area: 'Body', items: [['longs', 'Long sleeves and long pants'], ['hivis', 'Hi-vis, day'], ['hivisNight', 'Hi-vis, day and night'], ['coveralls', 'Disposable coveralls'], ['arcRated', 'Arc-rated face shield and flame-resistant clothing']] },
  { area: 'Feet', items: [['boots', 'Safety boots'], ['gumboots', 'Safety gumboots']] },
  { area: 'Sun', items: [['sunscreen', 'Sunscreen']] },
  { area: 'Falls and water', items: [['harness', 'Full body harness'], ['lifeJacket', 'Life jacket']] },
];

const SITE_MINIMUM = ['hardHat', 'glassesClear', 'gloveGeneral', 'longs', 'hivis', 'boots'];
const PPE_IDS = new Set(PPE.flatMap((group) => group.items.map(([id]) => id)));

// A fact control may carry `otherwise`, a line used only when the fact is not given.
// A choice control gives the lines for the option the user chose.
function expand(control, factText) {
  if (typeof control === 'string') return [control];
  // A control taken from a regulation or code carries its source, printed after it.
  if (control.text) return [control.source ? `${control.text} (${control.source})` : control.text];
  if (control.choice) return (control.options[factText(control.choice)] || []).flatMap((item) => expand(item, factText));
  const text = factText(control.fact);
  if (text) return [text];
  return control.otherwise ? [control.otherwise] : [];
}

// Steps for the kinds of work found, between the opening and closing steps.
// `flags` names the kinds of work found; `factText` returns the user's text for a fact.
// Work the library does not know uses `fallback`, a step built from the task.
function jobStepsFor(flags, factText, fallback) {
  let found = ACTIVITIES.filter((activity) => flags[activity.when]);
  const replaced = new Set(found.flatMap((activity) => activity.replaces || []));
  found = found.filter((activity) => !replaced.has(activity.when));
  const middle = found.length ? found.flatMap((activity) => activity.steps) : [fallback];
  const before = {
    ...BEFORE,
    controls: [...BEFORE.controls, ...BEFORE_EXTRA.filter((item) => flags[item.when]).flatMap((item) => expand(item.text, factText))],

  };
  const seen = new Set();
  const steps = [before, ...middle, FINISH]
    .filter((step) => !seen.has(step.step) && seen.add(step.step));
  return steps.map((step) => ({
    step: step.step,
    hazards: step.hazards.slice(),
    controls: step.controls.flatMap((item) => expand(item, factText)),
  }));
}

// The PPE list with each item ticked or not. A chosen list replaces the defaults.
function ppeFor(flags, chosen, mentionsHarness, indoors) {
  let ticked;
  if (Array.isArray(chosen) && chosen.some((id) => PPE_IDS.has(id))) {
    ticked = new Set(chosen.filter((id) => PPE_IDS.has(id)));
  } else {
    ticked = new Set(SITE_MINIMUM);
    const active = ACTIVITIES.filter((activity) => flags[activity.when]);
    const replaced = new Set(active.flatMap((activity) => activity.replaces || []));
    for (const activity of active) {
      if (!replaced.has(activity.when)) for (const id of activity.ppe || []) ticked.add(id);
    }
    if (ticked.has('gloveCut') || ticked.has('gloveChemical')) ticked.delete('gloveGeneral');
    if (ticked.has('hivisNight')) ticked.delete('hivis');
    if (mentionsHarness) ticked.add('harness');
    if (!indoors) ticked.add('sunscreen');
  }
  return PPE.map((group) => ({
    area: group.area,
    items: group.items.map(([id, label]) => ({ id, label, ticked: ticked.has(id) })),
  }));
}

module.exports = { jobStepsFor, ppeFor, PPE, SITE_MINIMUM };
