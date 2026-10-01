// Job steps for common kinds of construction work, each with its hazards and
// controls, as the regulators' SWMS templates lay them out. The text is general
// good practice for the subcontractor to check and change to suit the site.
// A control written { fact: 'id' } is replaced with what the user gave for that fact.

// Sources for controls taken from the law or a code of practice.
const ESR = (section) => `Electrical Safety Regulation 2026 (Qld) ${section}`;
const ESA = (section) => `Electrical Safety Act 2002 (Qld) ${section}`;
const CODE = (section) => `Model Code: Managing electrical risks ${section}`;
const WHS = (section) => `Work Health and Safety Regulation 2011 (Qld) ${section}`;
const PDA = (section) => `Plumbing and Drainage Act 2018 (Qld) ${section}`;
const MODEL = (code, section) => `Model Code: ${code} ${section}`;
const PSTD = (section) => `Piling industry standard (WorkSafe Victoria and PFSF, 2014, Victorian guidance) ${section}`;
const OZONE = (section) => `Ozone Protection and Synthetic Greenhouse Gas Management Regulations 1995 (Cth) ${section}`;
const CPR = (section) => `Telecommunications (Cabling Provider) Rules 2025 (Cth) ${section}`;
const SPA = (section) => `Security Providers Act 1993 (Qld) ${section}`;
const ARC = (section) => `Australian Refrigeration Council, Refrigerant Handling Code of Practice 2025 Part 2 ${section}`;
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
    { text: 'This SWMS takes into account the principal contractor\'s WHS management plan for the site.', source: 'Work Health and Safety Regulation 2011 (Qld) s 299' },
  ],
};

// Controls added to Before starting for some kinds of work.
const BEFORE_EXTRA = [
  { when: 'ptSlab', text: 'Check the post-tensioning drawings and scan the slab before drilling or fixing into a post-tensioned slab.' },
  { when: 'respirator', text: 'Tight-fitting respirators are fit tested to each wearer before use, for the make and model they wear, and wearers are clean shaven where the mask seals.' },
  { when: 'electricalWork', text: src('Electrical work is done or supervised only by licensed electrical workers, for a licensed electrical contractor.', `${ESA('s 55, s 56')}`) },
  { when: 'electricalWork', text: src('Apprentices are supervised at all times by a licensed electrical worker. In their first 6 months they do not work where they could contact a live low voltage exposed part.', ESR('s 307')) },
  { when: 'electricalWork', text: src('Everyone who performs or helps in performing electrical work is competent in rescue and resuscitation.', ESR('s 211')) },
  { when: 'electricalWork', text: src('A serious electrical incident or dangerous electrical event is reported to the regulator immediately, and the site is left undisturbed.', ESR('s 292, s 296')) },
  { when: 'plumbingWork', text: src('Plumbing and drainage work is done by licensed workers, and supervised only by licensed workers. Trainees are directly supervised by a licensed person, who directs the work and ensures it complies.', PDA('s 56, s 57, s 58, s 59')) },
  { when: 'plumbingWork', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'mechanicalWork', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'ictWork', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'ictWork', text: src('Cabling work is done by a registered cabling provider whose registration covers the work (an open registration, with the extra units of competency for structured, optical fibre or coaxial cabling notified to the registrar), or by a cabler directly supervised at all times by one who holds that competency and accepts full responsibility for the work. All cabling complies with the Wiring Rules (AS/CA S009), and cabling and equipment comply with the Labelling Notice.', CPR('s 21, s 22, s 23, s 24')) },
  { when: 'ictWork', text: src('When the cabling work is complete, the registered cabling provider gives a statement that it complies fully with the Wiring Rules to their employer and the customer, and keeps a copy for at least 1 year.', CPR('s 25')) },
  { when: 'bulkDig', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'waterproofing', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'tilingWork', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'carpentryWork', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'pilingWork', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'pilingWork', text: 'Piling controls cited to the piling industry standard are Victorian guidance, used here as good practice. Qld has no piling rig licence.' },
  { when: 'facadeWork', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'securityWork', text: src('Security equipment such as CCTV, access control, intercoms and alarms is installed only by licensed security equipment installers.', SPA('s 6B, s 8A, s 9')) },
  { when: 'refrigerantWork', text: src('Work on refrigeration and air conditioning equipment, including installing and commissioning it whether or not refrigerant is present, is done only by holders of a refrigerant handling licence that covers the work. Trainee licence holders work under the supervision of a full licence holder.', `${OZONE('reg 111, reg 134')}; ${ARC('s 1.1.1')}`) },
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
          src('Get the current underground services information from the principal contractor before digging, and work to it.', WHS('s 304')),
          'Get service plans, for example through Before You Dig Australia, and locate services on site before digging.',
          src('Pothole with water pressure and a vacuum system to confirm where services are, as plans may not be accurate.', MODEL('Excavation work', 's 3.5')),
        ],
      },
      {
        step: 'Excavate',
        hazards: ['The excavator strikes a person.', 'The ground collapses.'],
        controls: [
          { fact: 'trenchSupport' },
          src('A trench 1.5 m deep or more has all sides supported by shoring, benching or battering, unless a geotechnical engineer has advised in writing, for a stated period, that the sides are safe from collapse.', WHS('s 306')),
          src('Secure the trench area from unauthorised and inadvertent entry.', WHS('s 306(1)')),
          'Exclusion zone around the excavator, with a spotter when people are nearby.',
          src('Two-way acknowledged communication between plant operators and ground workers.', MODEL('Excavation work', 's 4.3')),
          src('Keep spoil, materials, plant and traffic out of the trench\'s zone of influence unless the support is designed for those loads.', MODEL('Excavation work', 's 4.1')),
          src('Dewater with pumps where groundwater or water inrush is possible.', MODEL('Excavation work', 'table')),
          src('Where diesel or petrol plant works in the basement, ventilate and monitor carbon monoxide.', MODEL('Excavation work', 's 4.6')),
        ],
      },
      {
        step: 'Work in the trench',
        hazards: ['Trench collapse buries a worker.', 'Falling into the trench.', 'Water or bad air in the trench.'],
        controls: [
          'No one enters the trench until the support is in place and checked.',
          src('Work only inside the trench shield, with the access ladder secured to the shield.', MODEL('Excavation work', 's 6.4')),
          { fact: 'fallControl' },
          src('A competent person checks the trench walls and support frequently, including at the start of each shift and after rain. Any damage is repaired from above before work below continues.', MODEL('Excavation work', 's 6.6')),
          src('No engine-driven plant runs in the trench while workers are in it. Check the air with a gas monitor before entry, with a safety observer at the surface.', MODEL('Excavation work', 's 4.6')),
          src('The emergency plan covers ground slip, flooding, gas leaks and rescue from the trench.', MODEL('Excavation work', 's 3.7')),
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
          'Check the ground or working platform can carry the crane\'s outrigger or track loads under the heaviest lift before setting up.',
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
        'Check the slab, working platform or ground can take the platform, and keep it back from edges, penetrations and open excavations.',
        src('The operator is trained for the platform. A high risk work licence is needed only for a boom-type platform with a boom of 11 m or more.', WHS('s 81, schedule 3')),
        'Wear a harness attached to the platform\'s anchor point in a boom-type platform.',
        src('Check for crushing points such as low soffits, beams and services before raising or moving the platform. Operators are trained in safe work procedures to avoid crushing.', MODEL('Managing the risk of falls', 's 5.1')),
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
          src('Construction wiring, switchboards and RCDs carry a test tag only if new, or inspected and tested by a competent person and found to comply with AS/NZS 3012, with the retest date and the tester shown.', ESR('s 140(3)-(4)')),
          src('Run leads where they will not be damaged, or protect them. Keep them off the ground on lead stands or insulated hangers, and away from doorways and sharp edges.', `${ESR('s 18')}; ${CODE('s 3')}`),
          src('RCD protection as AS/NZS 3012 requires.', ESR('s 140')),
          src('Fixed RCDs are tested by a competent person immediately after they are connected, then at the intervals AS/NZS 3012 sets for construction sites. A faulty RCD is tagged and withdrawn from use at once.', ESR('s 139, s 140')),
          src('If an RCD trips, the circuit stays off until a competent person finds the cause.', CODE('s 3')),
        ],
      },
      {
        step: 'Inspect, test and maintain construction power',
        hazards: ['Unsafe equipment stays in use.'],
        controls: [
          src('Unsafe equipment is disconnected, labelled unsafe, and not reconnected until it is repaired or tested and found safe.', `${ESR('s 17')}; ${CODE('s 3.1')}`),
          src('Check hired electrical equipment carries the hire company\'s current test tag, no more than 6 months old, and reject it if not.', ESR('s 142')),
          src('Find faults first with de-energised testing methods. Use energised testing only if that fails.', CODE('s 7.5')),
          'As floors rise, relocate switchboards and leads de-energised, and tell the principal contractor of changes to the construction wiring.',
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
        src('Workers without an electrical licence build conduits only if they will not be earthed and contain no energised wiring, under the supervision of a person licensed for electrical installation work. Any earthing or bonding is done by licensed workers.', ESA('s 18(2)(e)')),
        'Agree access, timing and the order of work with the formwork and reo crews and the principal contractor before the pour.',
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
        src('Where an exposed energised part is within 3 m, de-energise it or fit covers, and use a safety observer where needed.', `${ESR('s 193')}; ${CODE('s 8.2, s 9.2')}`),
        'Before anchoring supports into a post-tensioned slab, check the post-tensioning drawings, and scan and mark tendons, conduits and pipes. Never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval. Other detected services are isolated and confirmed before drilling near them.',
        'Exclusion zone below open risers and work areas for dropped objects.',
        'Drill anchors with on-tool dust extraction, and wear a fit tested P2 respirator.',
        'Nearby parts are de-energised before work starts. If they cannot be, the work is planned as energised work with its own controls.',
        'In the basement, use battery or electric plant where practical. Otherwise ventilate, and monitor for exhaust fumes.',
      ],
    }],
    ppe: ['p2', 'earPlugs'],
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
        src('Helpers without an electrical licence assist only under the direct supervision of a licensed electrical worker, and do not touch energised equipment.', ESA('s 18(2)(g)')),
        'In risers, use cable grips and anti-runback brakes, keep radio contact between levels, and keep an exclusion zone below.',
        'Existing cables near the pull are isolated and proved de-energised before work starts. If they cannot be, the work is planned as energised work.',
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
        src('Work in a roof space (between the roof and the top floor ceiling) only when the electrical installation is de-energised. If that is not reasonably practicable, a risk assessment is done, the risks are as low as reasonably practicable, and the work follows a written statement of the controls.', ESR('s 31, s 33, s 34')),
        src('In ceiling spaces between floors, treat cables as energised until they are proved de-energised.', ESR('s 196(2)')),
        src('Check for cables before drilling or chasing.', CODE('appendix C')),
        'Before drilling into a post-tensioned slab, check the post-tensioning drawings, and scan and mark tendons, conduits and pipes. Never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval. Other detected services are isolated and confirmed before drilling near them.',
        'Chase and drill with water suppression or on-tool dust extraction.',
        'Use platform ladders or mobile scaffolds, not the top steps of a stepladder.',
        src('Cover open switchboards and enclosures to keep swarf out.', CODE('appendix C')),
      ],
    }],
    ppe: ['p2', 'earPlugs'],
  },
  {
    when: 'isolation',
    steps: [
      {
        step: 'Isolate and prove de-energised',
        hazards: ['Electric shock and arc flash.', 'Equipment re-energised while work is underway.'],
        controls: [
          { fact: 'isolationProcedure' },
          src('Treat every exposed part as energised until it is isolated and tested by a competent person and found de-energised.', ESR('s 196')),
          src('Test the tester on a known source, test for zero volts, then test the known source again. Do not rely on proximity testers. Use instruments rated Category III or IV.', CODE('s 9.4')),
          src('Lock the isolating device open, or stop it being closed, and attach a warning sign, so the equipment cannot be re-energised while work is underway.', ESR('s 197, s 198')),
          src('Each worker fits a personal lock, and danger tags are removed only by the people who signed them.', CODE('s 6.1')),
          src('Check for every source of supply: construction supply, permanent supply, generators, solar and supplies from other boards.', CODE('s 6')),
          src('When cutting multi-core control cables, check for current transformer secondary circuits first.', CODE('s 5.3')),
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
              src('Tools, test equipment and PPE are suitable for the work, properly tested and in good working order.', ESR('s 203')),
              src('PPE rated for the energy at the point of work, such as an arc-rated face shield, insulated gloves and flame-resistant clothing.', CODE('s 9.5')),
              src('No watches, jewellery or other metal personal items. Fire extinguishers suitable for electrical fires are at hand.', CODE('s 7.3')),
              src('Energised work is authorised by: ____________ (position), after the principal contractor\'s ____________ (position) has been consulted and signs the permit.', `${ESR('s 199(1)(e)')}; ${CODE('s 7.3')}`),
              src('Keep the risk assessment until at least 28 days after the work and this SWMS until the work is complete, both readily available to the workers.', ESR('s 204')),
            ],
          },
        }],
      },
    ],
  },
  {
    when: 'commissioning',
    steps: [
      {
        step: 'Deliver and place switchboards',
        hazards: ['A switchboard tips or falls during delivery or placement.', 'Crushing and back strain moving heavy boards.'],
        controls: [
          'Lift and move boards with the crane crew, a forklift or skates, on a planned route within the slab\'s load limits.',
          'Keep people clear of the load, and secure each board as soon as it is placed.',
          'Manual handling: no manual lifting of heavy boards; use skates, jacks and team handling for final positioning.',
        ],
      },
      {
        step: 'Test, connect and commission',
        hazards: ['New work energised before it is safe.', 'People exposed while equipment is energised for testing.'],
        controls: [
          src('Test new work so it is electrically safe before it is connected, and keep people not needed for testing safe while it is energised.', ESR('s 207')),
          src('The consumer mains and main switchboard are not connected for the first time until the distribution entity has examined them, confirmed there are no serious defects and tested them.', ESR('s 217, s 218')),
          src('The electrical contractor connects only when satisfied the Act and regulation have been complied with.', ESR('s 223')),
          src('After later work, an installation is reconnected only if the work was done by a licensed person and tested as electrically safe and compliant with the wiring rules.', ESR('s 219')),
          src('Give the distribution entity the notice of test, and issue the certificate of testing and safety.', ESR('s 208, s 228')),
          src('Where we connect the installation, issue the certificate of testing and compliance.', ESR('s 229')),
          src('Any high voltage electrical installation is not connected until an accredited auditor has inspected and certified it.', ESR('s 221')),
          'Once the main switchboard is energised, the switchroom is locked with access controlled, and live and dead status boards are kept up to date.',
          'Do an arc flash (incident energy) assessment of the main switchboard, so PPE is rated for the energy at the point of work.',
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
    when: 'sewerConnection',
    steps: [{
      step: 'Connect to the live sewer',
      hazards: ['Sewer gases such as hydrogen sulphide.', 'Infection from sewage.', 'Entry into a manhole or sewer, a confined space.', 'Traffic at the connection in the street.'],
      controls: [
        'Work to the sewer authority\'s approval and connection requirements.',
        src('If a manhole or sewer must be entered, the entry is planned and done as confined space entry, with its own permit and controls.', `${WHS('s 65 to s 77')}; ${MODEL('Confined spaces', 'appendix B')}`),
        'Wash hands before eating or smoking, cover cuts, and keep a clean water supply and first aid at the work area.',
      ],
    }],
    ppe: ['gloveChemical', 'goggles', 'gumboots'],
  },
  {
    when: 'castInPlumbing',
    steps: [{
      step: 'Install cast-in sleeves and puddle flanges on the deck before the pour',
      hazards: ['A person falls through an opening or penetration.', 'Falling objects from the deck edge.', 'Working among formworkers and reo fixers.'],
      controls: [
        src('Cover or barricade every penetration as soon as it is formed. Covers withstand a fall onto them and are fixed in place.', WHS('s 306D, s 306F')),
        src('Covers take a point load of at least 2 kN, are signed DANGER HOLE BENEATH, and plywood alone is not preferred.', MODEL('Managing the risk of falls', 's 4.2')),
        src('Work only inside edge protection installed by others to the regulation. Do not remove or alter it, and report any damage.', WHS('s 306E')),
        src('Barriers or an exclusion zone below the work for falling objects.', WHS('s 55')),
        'Agree access, timing and the order of work with the formwork and reo crews before the pour.',
      ],
    }],
  },
  {
    when: 'coreDrill',
    steps: [
      {
        step: 'Plan core holes',
        hazards: ['Cutting a post-tensioning tendon or reo.', 'Water and slurry near electrical leads.'],
        controls: [
          'Each core hole is approved by the engineer. Check the post-tensioning drawings, and scan and mark tendons, conduits and pipes. Never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval. Other detected services are isolated and confirmed before drilling near them.',
          'Keep leads off wet floors and protect them with RCDs. Contain water and slurry.',
        ],
      },
      {
        step: 'Core drill through the slab',
        hazards: ['Silica dust from drilling concrete.', 'Noise and vibration.', 'The core falls to the floor below.', 'A person falls through the hole.'],
        controls: [
          { fact: 'silicaControls' },
          src('Drilling concrete is processing a crystalline silica substance. It is controlled by wet drilling, on-tool extraction or local exhaust.', WHS('s 529A, s 529B, s 529C')),
          src('The operator and anyone in the dust zone wear fit tested P2 respirators while drilling.', WHS('s 529B')),
          src('Assess in writing before starting whether the processing is high risk, without counting PPE or administrative controls.', WHS('s 529CA')),
          src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS, with the written assessment attached, can be the plan only where the work is also high risk construction work), and workers have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
          src('Health monitoring for workers at significant risk from crystalline silica.', WHS('s 368, schedule 14')),
          src('Barricade and sign the area below, so a falling core cannot hit anyone.', WHS('s 55')),
          src('Cover or barricade the hole as soon as it is cut, with a fixed cover rated for a 2 kN point load and signed DANGER HOLE BENEATH.', `${WHS('s 306F')}; ${MODEL('Managing the risk of falls', 's 4.2')}`),
          src('Hearing protection where noise exceeds the exposure standard. Workers who must wear it have hearing tests within 3 months of starting and at least every 2 years.', WHS('s 57, s 58')),
        ],
      },
    ],
    ppe: ['p2', 'earMuffs', 'gumboots'],
  },
  {
    when: 'hydraulicRisers',
    steps: [
      {
        step: 'Install risers and pipework at height',
        hazards: ['A fall into a shaft or from a ladder, platform or elevating work platform.', 'Dropped pipe and fittings.', 'Back strain lifting pipe.'],
        controls: [
          src('Work from the floor or a solid platform where possible. Otherwise use fall prevention: covers, guardrails or working platforms, before work positioning or fall arrest.', WHS('s 78, s 79')),
          src('Shaft openings have barriers.', MODEL('Managing the risk of falls', 's 4.2')),
          'Open only the section of shaft being worked on.',
          src('A harness user never works alone. Anchors are rated for 12 kN with limited free fall or 15 kN with free fall, with enough clear distance to arrest a fall, and rescue procedures are set and practised.', WHS('s 80, s 306I')),
          src('Single or extension ladders are used only for access or for work that can be done with one hand, at 70 to 80 degrees. Ladders are industrial and rated for at least 120 kg.', WHS('s 306K, s 306M')),
          src('No stillsons or other high-force tools from a ladder, and no stepladder beside an open shaft or penetration without extra fall protection.', MODEL('Managing the risk of falls', 's 9.1')),
          src('Raise and lower pipe with a hoist or rope, not by hand up ladders, with an exclusion zone below.', WHS('s 55')),
        ],
      },
    ],
    ppe: ['gloveGeneral'],
  },
  {
    when: 'hotWork',
    steps: [{
      step: 'Braze and solder pipe joints (hot work)',
      hazards: ['Fire from the flame or hot metal.', 'Gas cylinder leaks or flashback.', 'Fumes.', 'Burns.'],
      controls: [
        { fact: 'hotWorkPermit' },
        src('A hot work permit is issued before hot work, and fire-fighting equipment is kept near the work.', MODEL('Welding processes', 's 3.4')),
        src('No flame where there could be a flammable atmosphere.', WHS('s 355')),
        src('Keep the fewest gas cylinders, full or empty, at the work area.', WHS('s 53')),
        src('Fit flashback arrestors at the torch and regulator. Keep cylinders upright and secured, valves closed when not in use, and turn the gas off at the valve straight after use. Gases heavier than air collect in pits and basements, so store and use cylinders where leaks can disperse.', `${MODEL('Welding processes', 's 3.4, s 3.6')}`),
        src('Gas cylinders carry a current inspection mark.', WHS('s 224')),
        src('Extract or ventilate fumes so no one is exposed above the exposure standard.', `${WHS('s 49')}; ${MODEL('Welding processes', 's 4.1')}`),
        src('No hot work from a ladder.', MODEL('Managing the risk of falls', 's 9.1')),
        src('Mark hot pipe as hot. Wear fire-resistant gloves, natural fibre clothing and filter eye protection for the flame.', MODEL('Welding processes', 's 3.5, s 4.2')),
        'Hot work at height or in risers also follows the controls in the SWMS for work at height.',
      ],
    }],
    ppe: ['gloveWelding', 'filterEye'],
  },
  {
    when: 'solventCement',
    steps: [{
      step: 'Join PVC pipe with primer and solvent cement',
      hazards: ['Flammable vapour.', 'Breathing in solvent vapour.', 'Skin and eye contact.'],
      controls: [
        { fact: 'safetyDataSheet' },
        src('Keep the current safety data sheet at the work area, and keep containers correctly labelled, including anything decanted.', WHS('s 341, s 342, s 344')),
        src('Keep only small quantities at the work area, and no flames or sparks nearby.', WHS('s 53, s 355')),
        'Ventilate the area, especially in ducts, risers and basements. Lids on when not in use.',
        src('Contain spills, and clean them up straight away.', WHS('s 357')),
      ],
    }],
    ppe: ['gloveChemical'],
  },
  {
    when: 'plumbingFitOff',
    steps: [{
      step: 'Rough-in and fit-off in the apartments',
      hazards: ['Back strain carrying and fitting tubs, toilets and pipe.', 'Silica dust from chasing or drilling.', 'A fall from a ladder.'],
      controls: [
        src('Use trolleys and lifting aids for heavy items. Plan team lifts with one person in charge. Training alone is not the control.', `${WHS('s 60')}; ${MODEL('Hazardous manual tasks', 's 4.5, s 4.9')}`),
        src('Chase and drill with water or on-tool extraction. The operator and anyone in the dust zone wear fit tested P2 respirators.', WHS('s 529B, s 529C')),
        src('Assess in writing before chasing whether the processing is high risk. If it is, prepare a silica risk control plan and give it to workers before they start, and workers have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CA, s 529CB, s 529CC, s 529CD')),
        src('Health monitoring for workers at significant risk from crystalline silica.', WHS('s 368, schedule 14')),
        'Before chasing or drilling a wall, check for live circuits and services in it. If chasing near energised circuits, have them isolated first, or treat it as work near energised electrical installations and tick that high risk category.',
        src('No stepladder beside an open penetration or unprotected edge without extra fall protection.', MODEL('Managing the risk of falls', 's 9.1')),
        'Before drilling into a post-tensioned slab, check the post-tensioning drawings, and scan and mark tendons, conduits and pipes. Never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval. Other detected services are isolated and confirmed before drilling near them.',
        src('Use platform ladders. Ladders are industrial and rated for at least 120 kg.', WHS('s 306M')),
      ],
    }],
    ppe: ['p2'],
  },
  {
    when: 'plantLift',
    steps: [
      {
        step: 'Receive plant and move it into position',
        hazards: ['A person is crushed by plant on skates, a pallet jack or a forklift.', 'Back and shoulder injury moving heavy plant, ductwork and pipe.', 'The slab or roof is overloaded where plant lands or is set down.'],
        controls: [
          { fact: 'loadLimits' },
          'Set plant down only where the load limits allow, on the plinths or supports designed for it.',
          src('Move plant with mechanical aids such as skates, pallet jacks or powered tugs, not by carrying.', MODEL('Hazardous manual tasks', 's 4.5')),
          src('Team lifts are an interim control only. One person plans and takes charge of each team lift.', MODEL('Hazardous manual tasks', 's 4.9')),
          src('Forklifts are kept apart from people, with a warning device, and carry no passengers. A forklift left unattended is parked level, with the brake on and the key removed.', `${WHS('s 215, s 218')}; ${MODEL('Managing the risks of plant in the workplace', 's 3.8')}`),
          src('Leave an access way around plant for maintenance (about 600 mm is suggested).', MODEL('Managing the risks of plant in the workplace', 's 3.2')),
        ],
      },
    ],
  },
  {
    when: 'ductwork',
    steps: [
      {
        step: 'Install ductwork, pipework and units at height',
        hazards: ['A fall from a platform, ladder or open riser.', 'Tools, fixings and duct sections fall onto people below.', 'Silica dust from drilling hanger anchors.', 'Cutting a post-tensioning tendon when drilling.', 'Cuts from duct edges and strain from lifting duct overhead.'],
        controls: [
          { fact: 'fallControl' },
          src('Work from the floor or a platform where possible. Fall prevention comes before work positioning or fall arrest.', WHS('s 78, s 79')),
          src('Risers and shafts are covered or screened at each level, with only the section being worked on opened. Covers are fixed in place and signed DANGER HOLE BENEATH.', `${WHS('s 306F')}; ${MODEL('Managing the risk of falls', 's 4.2')}`),
          src('Ladders are industrial and rated for at least 120 kg.', WHS('s 306M')),
          src('When working from a ladder, keep two feet and one other point of contact with it, and use a tool belt.', MODEL('Managing the risk of falls', 's 9.1')),
          src('Barricade and sign the area below, and stop tools and materials falling.', `${WHS('s 55')}; ${MODEL('Managing the risk of falls', 's 8.1')}`),
          src('Sequence the work so trades are not working above or below each other at the same time.', MODEL('Managing the risk of falls', 's 8.3')),
          'Before drilling into a post-tensioned slab, check the post-tensioning drawings, and scan and mark tendons, conduits and pipes. Never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval. Other detected services are isolated and confirmed before drilling near them.',
          src('Drill anchors with on-tool extraction, and wear a fit tested P2 respirator.', WHS('s 529B, s 529C')),
          src('Assess in writing before drilling whether the processing is high risk, without counting PPE or administrative controls, and without relying only on on-tool extraction or wet methods. If it cannot be determined, treat it as a risk to health until it is.', WHS('s 529CA')),
          src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS, with the written assessment attached, can be the plan only where the work is also high risk construction work), and workers have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
          src('Use lifting aids such as duct lifters for overhead duct sections, rather than holding them up by hand.', MODEL('Hazardous manual tasks', 's 4.5')),
        ],
      },
    ],
    ppe: ['gloveCut', 'p2'],
  },
  {
    when: 'refrigerantPipework',
    steps: [
      {
        step: 'Braze refrigerant pipework',
        hazards: ['Fire from the flame.', 'Nitrogen or refrigerant displaces air in a small or enclosed space.', 'Burns.'],
        controls: [
          src('Before hot work on a system that has held refrigerant, recover or isolate all of it, ventilate the area, and evacuate and purge the system or section with oxygen-free nitrogen.', ARC('s 9.3, s 9.9.3, s 9.9.4')),
          src('Purge oxygen-free nitrogen continuously through the pipe while brazing, at minimal pressure.', ARC('s 4.6.5')),
          src('Oxygen monitoring where the work is in an enclosed space. Nitrogen is an asphyxiant.', ARC('s 4.9.1, s 10.4')),
        ],
      },
    ],
  },
  {
    when: 'refrigerantTest',
    steps: [
      {
        step: 'Pressure test with nitrogen',
        hazards: ['A joint, fitting or hose fails under high pressure.', 'Nitrogen is an asphyxiant.'],
        controls: [
          { fact: 'pressureTesting' },
          src('Test only with oxygen-free nitrogen, never standard grade nitrogen. Never use refrigerant to pressure test.', ARC('s 4.9, s 4.9.3')),
          src('Test pressure is never above the maximum allowable pressure (PS) on the equipment, and below the relief valve settings.', ARC('s 4.9.4')),
          src('Raise the pressure in stages, then isolate the system from the nitrogen cylinder.', ARC('s 4.9.5')),
          'Exclusion zone around the pipework under test. No one works on it while it is under pressure. Release pressure fully before touching fittings.',
          src('A tracer gas has no more than 5% hydrogen.', ARC('s 4.9.3')),
          src('Gas cylinders are secured upright, with valves closed when not in use.', MODEL('Welding processes', 's 3.6')),
        ],
      },
    ],
    replaces: ['pressureTest'],
  },
  {
    when: 'refrigerantCharge',
    steps: [{
      step: 'Evacuate, charge and recover refrigerant',
      hazards: ['Freeze burns from liquid refrigerant.', 'Asphyxiation from a leak in an enclosed space.', 'Fire from a flammable refrigerant.', 'A cylinder bursts.'],
      controls: [
        src('Read the refrigerant\'s safety data sheet before handling it.', ARC('s 13.1')),
        {
          choice: 'refrigerantClass',
          options: {
            a1: [
              'The refrigerant is non-flammable (A1). Ventilate enclosed plant rooms and keep oxygen monitoring where the space is enclosed.',
            ],
            a2l: [
              src('Before charging, assess the area for ventilation, ignition sources and fire safety equipment, and set up a temporary flammable zone. Earth the system before charging.', ARC('s 6.6')),
              src('Tools and equipment are rated for the refrigerant\'s flammability grade. Use a leak detector rated for flammable refrigerants, never a halide detector.', ARC('s 4.3, s 4.9.3')),
              src('If a leak is suspected, remove or put out all ignition sources and naked flames.', ARC('s 9.3')),
            ],
            a3: [
              src('Before charging, assess the area for ventilation, ignition sources and fire safety equipment, and set up a temporary flammable zone. Earth the system before charging.', ARC('s 6.6')),
              src('Tools and equipment are rated for the refrigerant\'s flammability grade. Use a leak detector rated for flammable refrigerants, never a halide detector.', ARC('s 4.3, s 4.9.3')),
              src('If a leak is suspected, remove or put out all ignition sources and naked flames.', ARC('s 9.3')),
            ],
          },
        },
        src('Charge only with the refrigerant on the equipment\'s compliance plate. Charging a different refrigerant with a higher global warming potential is prohibited.', OZONE('reg 2AAA, reg 111A')),
        src('Leak test charging hoses before fully opening the cylinder valve. Never let refrigerant flow back into the cylinder.', ARC('s 6.3, s 6.5')),
        src('Do not overfill the system. Keep charging lines short and do not trap liquid refrigerant between closed valves. Wear cold resistant gloves and eye protection when connecting and disconnecting.', ARC('s 6.4, s 6.5')),
        src('Recover into in-date cylinders suited to the refrigerant (A2 and A2L into their own cylinders). Never vent refrigerant.', ARC('s 10.1, s 12.2.3')),
        src('Store refrigerant only in refillable containers, and give recovered refrigerant to a refrigerant trading authorisation holder or a destruction facility.', OZONE('reg 135')),
        src('Close cylinder valves and fit the sealing caps when not in use.', ARC('s 13.6.3')),
      ],
    }],
    ppe: ['gloveCold', 'goggles'],
  },
  {
    when: 'roofPlant',
    steps: [{
      step: 'Install plant and equipment on the roof',
      hazards: ['A fall from the roof edge or through a roof opening.', 'Wind on large panels and plant.', 'Silica dust and tendon strike when drilling fixings into the roof slab.'],
      controls: [
        { fact: 'fallControl' },
        src('Edge protection or travel restraint where a fall of 2 m or more is possible, before work starts.', WHS('s 306D')),
        src('Edge protection has a top rail at least 900 mm above the roof, a toe board or bottom rail, and no more than 450 mm between rails.', WHS('s 306E')),
        src('Harness anchors are engineer designed or approved by a competent person, rated at least 12 kN for one person with a limited free fall, 15 kN for one person with a free fall, or 21 kN for two. Energy absorbers limit the arrest force to 6 kN, there is enough clearance below to stop a fall before it hits anything, and no one uses a harness system alone.', WHS('s 306I')),
        src('Where fall arrest is used, a rescue plan is set and practised.', WHS('s 80')),
        src('Check the wind, rain and heat before roof work, and stop in unsafe conditions.', MODEL('Managing the risk of falls', 's 3.2')),
        src('Tether tools, and secure materials and packaging at the edge, so nothing can fall to the street.', WHS('s 55')),
        'Before drilling fixings into a post-tensioned roof slab, check the post-tensioning drawings, and scan and mark tendons, conduits and pipes. Never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval.',
        src('Drill with on-tool extraction, and wear a fit tested P2 respirator.', WHS('s 529B, s 529C')),
        src('Assess in writing before drilling whether the processing is high risk, without counting PPE or administrative controls, and without relying only on on-tool extraction or wet methods. If it cannot be determined, treat it as a risk to health until it is.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS, with the written assessment attached, can be the plan only where the work is also high risk construction work), and workers have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
      ],
    }],
    ppe: ['harness', 'chinStrap', 'p2'],
  },
  {
    when: 'jetFans',
    steps: [{
      step: 'Install car park fans over traffic areas',
      hazards: ['Vehicles and mobile plant in the car park strike workers or the platform.', 'Objects fall onto people below.', 'The platform tips on a ramp, drain or penetration.'],
      controls: [
        src('Close the work area to vehicles with barriers, or separate the platform and workers from traffic.', WHS('s 215')),
        src('Exclusion zone below overhead work, with barriers that are highly visible and fixed in place.', `${WHS('s 55')}; ${MODEL('Managing the risk of falls', 's 8.1')}`),
        src('Check the slab for ramps, slopes, drains and penetrations before driving the platform.', MODEL('Managing the risk of falls', 's 5.1')),
      ],
    }],
    ppe: ['hivisNight'],
  },
  {
    when: 'mechInsulation',
    steps: [{
      step: 'Insulate ductwork and pipework',
      hazards: ['Skin, eye and breathing irritation from insulation and adhesives.', 'Fumes from adhesives and sealants.'],
      controls: [
        { fact: 'safetyDataSheet' },
        src('Keep the current safety data sheet for each insulation, adhesive and sealant at the work area. Label anything decanted.', WHS('s 342, s 344')),
        'Follow the safety data sheet for ventilation, PPE and clean up. Use a vacuum, not compressed air or dry sweeping.',
        src('Ladders are industrial and rated for at least 120 kg.', WHS('s 306M')),
        src('When working from a ladder, keep two feet and one other point of contact with it, and use a tool belt.', MODEL('Managing the risk of falls', 's 9.1')),
        'Riser covers and screens stay in place. Only the section being worked on is opened, and it is fenced.',
      ],
    }],
    ppe: ['gloveChemical', 'p2'],
  },
  {
    when: 'mechCommissioning',
    steps: [
      {
        step: 'Isolate plant before work on it',
        hazards: ['Fans, pumps or compressors start without warning.', 'Stored energy: pressure, capacitors, springs.', 'Contact with rotating parts.'],
        controls: [
          { fact: 'plantIsolation' },
          src('Isolate every energy source, control stored energy, then test by trying to start the plant.', MODEL('Managing the risks of plant in the workplace', 's 4.5')),
          src('Each worker fits their own padlock. A tag alone is not an isolation. Only the person who fitted a lock or tag removes it, or a supervisor after consulting them.', MODEL('Managing the risks of plant in the workplace', 's 4.5')),
          src('Plant controls can be locked in the off position.', WHS('s 210')),
          src('Fans and pumps under automatic or building management system control are isolated where they could start without warning.', WHS('s 222')),
          src('Lock out before removing a guard, and replace guards before the plant returns to service.', `${WHS('s 208')}; ${MODEL('Managing the risks of plant in the workplace', 's 4.1')}`),
          'Electrical work, including wiring and terminating, is done only by licensed electricians.',
        ],
      },
      {
        step: 'Commission and balance the system',
        hazards: ['Contact with moving parts during start-up.', 'Noise from fans and plant.', 'Entering ducts or plenums.'],
        controls: [
          src('Plant is not commissioned until it has been checked to be without risk, by competent people.', WHS('s 204')),
          src('Keep noise exposure below 85 dB(A) over 8 hours and 140 dB(C) peak: reduce noise at the source and keep people away from noisy plant first, with hearing protection as the last control. Workers who must wear it have hearing tests.', WHS('s 56, s 57, s 58')),
          src('Ladders used for balancing at fans and grilles are industrial and rated for at least 120 kg. Keep two feet and one other point of contact.', `${WHS('s 306M')}; ${MODEL('Managing the risk of falls', 's 9.1')}`),
          'No entry into ducts or plenums under this SWMS unless a competent person has assessed the space as not a confined space. If confined space entry is needed, stop and prepare a separate SWMS and entry permit.',
          src('Ducts and plenums that meet the confined space definition are entered only after a competent person\'s risk assessment recorded in writing, under a confined space entry permit, with signs at the entry, a standby person and connected plant isolated.', `${WHS('s 66, s 67, s 68, s 69, s 70')}; ${MODEL('Confined spaces', 's 1.1')}`),
        ],
      },
    ],
    ppe: ['earMuffs'],
  },
  {
    when: 'ictCabling',
    steps: [{
      step: 'Install containment and pull communications cabling',
      hazards: ['A fall from a ladder, platform or open riser.', 'Tools and cable boxes fall onto people below.', 'Contact with energised electrical parts in shared risers and ceilings.', 'Silica dust from drilling anchors.', 'Strain from pulling and lifting cable.'],
      controls: [
        { fact: 'fallControl' },
        src('Risers and shafts are covered or screened at each level, with only the section being worked on opened. Covers are fixed in place and signed DANGER HOLE BENEATH.', `${WHS('s 306F')}; ${MODEL('Managing the risk of falls', 's 4.2')}`),
        src('Ladders are industrial and rated for at least 120 kg.', WHS('s 306M')),
        src('When working from a ladder, keep two feet and one other point of contact with it, and use a tool belt.', MODEL('Managing the risk of falls', 's 9.1')),
        src('Barricade and sign the area below, and stop tools and materials falling.', `${WHS('s 55')}; ${MODEL('Managing the risk of falls', 's 8.1')}`),
        src('Where exposed energised parts are nearby, have them de-energised or covered by the electrician before work starts, and use non-conductive ladders near them.', CODE('s 8.2, s 9.2')),
        'Before drilling into a post-tensioned slab, check the post-tensioning drawings, and scan and mark tendons, conduits and pipes. Never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval. Other detected services are isolated and confirmed before drilling near them.',
        src('Drill anchors with on-tool extraction, and wear a fit tested P2 respirator.', WHS('s 529B, s 529C')),
        src('Assess in writing before drilling whether the processing is high risk, without counting PPE or administrative controls, and without relying only on on-tool extraction or wet methods. If it cannot be determined, treat it as a risk to health until it is.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS, with the written assessment attached, can be the plan only where the work is also high risk construction work), and workers have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
        src('Use cable dispensers and rollers, and plan team pulls with one person in charge.', MODEL('Hazardous manual tasks', 's 4.5, s 4.9')),
        'Keep communications cabling separated from power cabling as the Wiring Rules require.',
      ],
    }],
    ppe: ['gloveCut', 'p2'],
  },
  {
    when: 'fibre',
    steps: [{
      step: 'Install, splice and test optical fibre',
      hazards: ['Glass fibre shards in skin or eyes.', 'Eye injury from test light sources.', 'Solvents used for cleaning.'],
      controls: [
        'Collect fibre offcuts in a marked, sealed container on a dark work mat. No eating or drinking at the splicing station.',
        'Know the laser class of each test source. Never look into a fibre end or connector, and treat every fibre as live until it is checked. Inspect ends with a filtered inspection scope or check them with a power meter.',
        src('Keep the safety data sheet for cleaning solvents at the work area.', WHS('s 344')),
      ],
    }],
    ppe: ['glassesClear'],
  },
  {
    when: 'commsRoom',
    steps: [{
      step: 'Install racks, cabinets and UPS batteries in the comms rooms',
      hazards: ['Strain or crush moving racks, cabinets and batteries.', 'A rack tips over.', 'Battery electrolyte, short circuits and stored energy.', 'Contact with live UPS outputs and distribution boards in the comms room.', 'Silica dust and tendon strike when drilling rack anchors.'],
      controls: [
        src('Move racks and batteries with trolleys, pallet jacks or lifting aids. Team lifts are an interim control, with one person in charge.', MODEL('Hazardous manual tasks', 's 4.5, s 4.9')),
        'Fix racks to the floor or wall as soon as they are stood up, before loading equipment.',
        'Before drilling rack anchors into a post-tensioned slab, check the post-tensioning drawings, and scan and mark tendons, conduits and pipes. Never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval.',
        src('Drill with on-tool extraction, and wear a fit tested P2 respirator.', WHS('s 529B, s 529C')),
        src('Assess in writing before drilling whether the processing is high risk, without counting PPE or administrative controls, and without relying only on on-tool extraction or wet methods. If it cannot be determined, treat it as a risk to health until it is.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS, with the written assessment attached, can be the plan only where the work is also high risk construction work), and workers have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
        src('Keep the battery safety data sheet at the work area.', WHS('s 344')),
        'UPS and power connections are made only by licensed electricians.',
        src('Where exposed energised parts are nearby, have them de-energised or covered by the electrician before work starts, and use non-conductive ladders near them.', CODE('s 8.2, s 9.2')),
      ],
    }],
    ppe: ['gloveChemical', 'p2'],
  },
  {
    when: 'securityDevices',
    steps: [{
      step: 'Install security cameras, card readers and intercoms',
      hazards: ['A fall from a ladder or platform.', 'Vehicles in the car park.', 'Silica dust from drilling.', 'Contact with energised cables in walls and ceilings.'],
      controls: [
        src('Ladders are industrial and rated for at least 120 kg.', WHS('s 306M')),
        src('When working from a ladder, keep two feet and one other point of contact with it, and use a tool belt.', MODEL('Managing the risk of falls', 's 9.1')),
        'In the car park, work inside the principal contractor\'s traffic management: the work area is closed to vehicles with barriers, or workers are separated from traffic.',
        src('Drill with on-tool extraction, and wear a fit tested P2 respirator.', WHS('s 529B, s 529C')),
        src('Assess in writing before drilling whether the processing is high risk, without counting PPE or administrative controls, and without relying only on on-tool extraction or wet methods. If it cannot be determined, treat it as a risk to health until it is.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS, with the written assessment attached, can be the plan only where the work is also high risk construction work), and workers have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
        'Check for cables before drilling walls and ceilings. Door hardware and power supplies are connected to mains power only by licensed electricians.',
        src('Where exposed energised parts are nearby, have them de-energised or covered by the electrician before work starts, and use non-conductive ladders near them.', CODE('s 8.2, s 9.2')),
        'Before drilling into a post-tensioned slab, check the post-tensioning drawings, and scan and mark tendons, conduits and pipes. Never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval.',
      ],
    }],
    ppe: ['p2'],
  },
  {
    when: 'panelLoad',
    steps: [{
      step: 'Load panels onto the floors and move them to the work face',
      hazards: ['A panel or stillage falls during the lift or tips over on the floor.', 'The slab is overloaded by stacked panels.', 'Loads over the street or people.', 'Strain or crush moving panels.'],
      controls: [
        { fact: 'loadLimits' },
        src('Stack panels only where the load limits allow. When in doubt, a structural engineer sets the safe load before use.', MODEL('Managing the risk of falls', 's 4.2')),
        'Stillages and racks are secured against wind and tipping on the floor, and panels are restrained on them until moved.',
        src('No loads over people. Loads are lifted over the street only where the principal contractor has closed the area or erected a gantry.', WHS('s 219, s 315L')),
        src('Move panels with well maintained trolleys, pushing rather than pulling.', MODEL('Hazardous manual tasks', 's 4.5')),
      ],
    }],
  },
  {
    when: 'facadeCrane',
    steps: [{
      step: 'Set up and use the floor crane or monorail',
      hazards: ['The crane or monorail collapses or tips.', 'The slab or edge fails under the outriggers or base.', 'A load falls.'],
      controls: [
        { fact: 'systemInstructions' },
        { fact: 'craneChart' },
        src('Erect the crane or monorail to the manufacturer\'s instructions, keeping it stable while it goes up. Only competent people install, set up and dismantle it, and it is not used until it is, so far as reasonably practicable, without risks.', `${WHS('s 204')}; ${MODEL('Managing the risks of plant in the workplace', 's 3.2')}`),
        src('The crane or monorail rests on a suitable foundation: a structural engineer confirms the slab and edge can take its base or outrigger loads.', MODEL('Managing the risks of plant in the workplace', 's 3.2')),
        src('Inspect and maintain it as the manufacturer requires, or otherwise as a competent person recommends.', WHS('s 213')),
        src('Set-up at the slab edge is done inside edge protection or with a travel restraint system.', WHS('s 306D')),
        src('Operators hold the high risk work licence the crane needs (for example, a slewing mobile crane licence for a mini crawler crane; confirm the class with the manufacturer). Setting up or dismantling a crane is rigging work (intermediate rigging), and slinging is dogging work, both licensed. Sight each licence before work.', WHS('s 81, s 85, schedule 3')),
      ],
    }, {
      step: 'Lift panels with the floor crane or monorail',
      hazards: ['A panel falls onto the floors below or the street.', 'A person is struck or crushed by a swinging panel.', 'Wind catches a panel.'],
      controls: [
        src('Lift only within the rated capacity, with lifting gear that suits the load, and keep the load under control with tag lines until it is fixed and the rigging released.', WHS('s 219')),
        src('No loads over people. Loads swing out over the street only where the principal contractor has closed the area or erected a gantry.', WHS('s 219, s 315L')),
        'A licensed dogman directs every lift that is out of the operator\'s view. Exclusion zones on the floors below.',
        'Wind limits come from the crane and monorail manufacturer\'s manuals. Stop lifting when they are reached.',
      ],
    }],
    replaces: ['crane'],
  },
  {
    when: 'panelInstall',
    steps: [{
      step: 'Install panels at the open slab edge',
      hazards: ['A fall from the open slab edge while edge protection is removed.', 'A panel or tool falls to the street or lower floors.', 'Wind catches a panel.', 'Crush between the panel and the slab edge.'],
      controls: [
        { fact: 'fallControl' },
        src('Prevent falls first: edge protection or a travel restraint system. Fall arrest is used only where prevention is not reasonably practicable.', WHS('s 306D')),
        src('A travel restraint system is installed by a competent person, and used only by workers trained in it.', WHS('s 306G')),
        src('Where fall arrest is used instead of restraint: harness anchors are engineer designed or approved by a competent person, rated at least 12 kN for one person with a limited free fall, 15 kN for one person with a free fall, or 21 kN for two. Energy absorbers limit the arrest force to 6 kN, there is enough clearance below to stop a fall before it hits anything, and no one uses a harness system alone.', WHS('s 306I')),
        src('Clip on before moving into a position where you could fall. Lanyards do not run over unprotected slab edges.', WHS('s 306I')),
        src('Travel restraint and fall arrest systems are inspected by a competent person at least every 6 months, and worn components are not used.', WHS('s 306G, s 306I')),
        src('A panel on the crane or monorail stays under control until it is fixed and the rigging is released.', WHS('s 219')),
        src('A licensed dogman directs lifts that are out of the operator\'s view.', WHS('s 81, schedule 3')),
        src('Insert-type anchors are not used for fall arrest where the load would pull them straight out. Anchors are proof tested.', MODEL('Managing the risk of falls', 's 7.3')),
        'Only the panel opening being worked on is opened, and edge protection or screens are put back before the area is left.',
        src('Tether tools, and keep fixings in closed containers, so nothing can fall. Exclusion zones on the floors below.', WHS('s 55')),
        src('Work over the street only where the principal contractor\'s gantry, road closure or catch protection is in place.', WHS('s 315G, s 315L')),
        src('Sequence the work so trades are not working above or below each other at the same time.', MODEL('Managing the risk of falls', 's 8.3')),
        src('Stop panel handling when the wind could take control of the panel.', `${MODEL('Managing the risk of falls', 's 3.2')}; ${MODEL('Hazardous manual tasks', 's 3.4')}`),
      ],
    }],
    ppe: ['harness', 'chinStrap'],
  },
  {
    when: 'glassHandling',
    steps: [{
      step: 'Handle glass and panels',
      hazards: ['Back strain and crush handling heavy panels.', 'Cuts from broken glass.', 'A vacuum lifter loses grip.'],
      controls: [
        src('Use vacuum lifters and glass panel lifters, not hand carrying. Lifting aids suit the load, are maintained, and workers are trained in them.', MODEL('Hazardous manual tasks', 's 4.5')),
        src('A vacuum lifter used under a crane is lifting gear: suitable for the load, within its limits, and the load kept under control.', WHS('s 219')),
        src('Vacuum lifters are inspected and maintained as the manufacturer requires, by a competent person.', WHS('s 213')),
        src('Team lifts are an interim control only, with one person in charge.', MODEL('Hazardous manual tasks', 's 4.9')),
        src('Plan glass handling for low wind conditions.', MODEL('Hazardous manual tasks', 's 4.8')),
        'Wear cut resistant gloves that still give a good grip. Broken glass is cleaned up straight away and disposed of safely.',
      ],
    }],
    ppe: ['gloveCut'],
  },
  {
    when: 'swingStage',
    steps: [{
      step: 'Work from a swing stage',
      hazards: ['A fall from the platform.', 'The platform or its suspension fails.', 'Stranded at height.'],
      controls: [
        src('Swing stages are installed by holders of an advanced rigging or advanced scaffolding licence, and workers operating them are trained in their safe operation.', `${WHS('schedule 3')}; ${MODEL('Managing the risk of falls', 's 5.1')}`),
        src('Everyone on a swing stage wears a harness attached to a suitable anchor on the stage, and the platform stays horizontal as it moves up or down.', MODEL('Managing the risk of falls', 's 5.1')),
        src('Tether tools and materials on the stage. Exclusion zone below the stage, with the principal contractor\'s gantry or closure where it is over the street.', WHS('s 55, s 315G')),
        'Wind limits come from the swing stage supplier. Stop work and bring the stage down when they are reached.',
        src('A suspended scaffold is not used until a competent person gives written confirmation that it is complete, and it is inspected at least every 30 days. No one uses it while it is incomplete.', WHS('s 225')),
        src('Rescue procedures are set up and tested, and workers are trained in them.', WHS('s 80')),
      ],
    }],
    ppe: ['harness'],
  },
  {
    when: 'edgeBracket',
    steps: [{
      step: 'Fix brackets at the slab edge',
      hazards: ['A fall from the slab edge where edge protection is opened.', 'Tools and fixings fall to the floors below or the street.'],
      controls: [
        { fact: 'fallControl' },
        src('A travel restraint system is installed by a competent person, and used only by workers trained in it. A competent person inspects it at least every 6 months.', WHS('s 306G')),
        'Edge protection is opened only at the bracket being fixed, and put back before moving on.',
        src('Tether tools, and keep fixings in closed containers. Exclusion zones on the floors below.', WHS('s 55')),
      ],
    }],
    ppe: ['harness'],
  },
  {
    when: 'facadeSeal',
    steps: [{
      step: 'Fix, seal and finish',
      hazards: ['Silica dust from drilling.', 'Cutting a post-tensioning tendon.', 'Fumes from sealants and cleaners.'],
      controls: [
        { fact: 'safetyDataSheet' },
        src('Keep the current safety data sheet for each sealant, primer and cleaner used at the work area.', WHS('s 344')),
        'Before drilling into a post-tensioned slab edge, check the post-tensioning drawings, and scan and mark tendons, conduits and pipes. Never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval.',
        src('Drill with on-tool extraction, and wear a fit tested P2 respirator.', WHS('s 529B, s 529C')),
        src('Assess in writing before drilling whether the processing is high risk, without counting PPE or administrative controls, and without relying only on on-tool extraction or wet methods. If it cannot be determined, treat it as a risk to health until it is.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS, with the written assessment attached, can be the plan only where the work is also high risk construction work), and workers have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
      ],
    }],
    ppe: ['gloveChemical', 'p2'],
  },
  {
    when: 'pilingPlatform',
    steps: [
      {
        step: 'Prepare the piling working platform',
        hazards: ['The rig overturns because the platform cannot carry it.', 'Other works weaken the platform.'],
        controls: [
          { fact: 'pilingPlatform' },
          src('A competent person, such as a geotechnical engineer, designs the working platform from the rig\'s operating bearing pressures, not its static weight.', PSTD('s 3.12')),
          src('After the platform is built, a competent person inspects it and states in writing its maximum plant loading. The rig operator has a copy before the rig goes onto it.', PSTD('s 4.3')),
          src('A different rig, even a smaller one, is checked against the platform first. Smaller rigs often have higher bearing pressures.', PSTD('s 4.3')),
          src('No piling where trenching or other work has disturbed the platform until it is reinstated and approved again. The platform is monitored and maintained for the whole job.', PSTD('s 4.3')),
          src('Slopes are within the rig\'s limits, and the ground carries the rig and delivery trucks.', PSTD('s 4.1')),
        ],
      },
      {
        step: 'Deliver, assemble and dismantle the rig',
        hazards: ['Crushing or falling parts during assembly.', 'Delivery trucks strike people.', 'A fall from the mast or rig.'],
        controls: [
          src('Assemble and dismantle the rig to the manufacturer\'s procedure, by a crew trained in that procedure for that rig.', PSTD('s 4.4')),
          src('Exclusion zone around assembly and disassembly. Deliveries follow the site traffic management plan, and drivers follow the traffic controller and the piling crew.', `${PSTD('s 4.4, s 4.9')}; ${MODEL('Excavation work', 's 4.3')}`),
          src('Keep rigs and trucks apart from people.', WHS('s 215')),
          { fact: 'fallControl' },
          src('Assembly procedures control the risks of working at height. No climbing the mast; work at height on the rig uses its access systems or an elevating work platform.', PSTD('s 4.4')),
        ],
      },
    ],
  },
  {
    when: 'pilingRig',
    steps: [{
      step: 'Drill and install piles',
      hazards: ['Entanglement in the rotating auger or kelly.', 'The rig overturns or strikes a person.', 'Striking underground services or overhead powerlines.', 'Spoil thrown from the auger.'],
      controls: [
        { fact: 'rigExclusionZone' },
        src('Fence and sign the operational safety zone around the rig. The exclusion zone is described in this SWMS, and the piling supervisor supervises it.', PSTD('s 4.5, s 4.6')),
        src('No one approaches the rig until the operator has agreed. Agree hand signals or radios, with a relay offsider when the signaller is out of the operator\'s view.', `${MODEL('Excavation work', 's 4.3')}; ${PSTD('s 3.13')}`),
        src('Isolate the rig before cleaning the auger or any maintenance.', MODEL('Managing the risks of plant in the workplace', 's 3.6')),
        src('Manage the risk of the rig overturning or colliding with any person or thing.', WHS('s 214')),
        src('The principal contractor obtains the underground services information, and services are marked so rig operators can see them.', `${WHS('s 304')}; ${PSTD('s 4.8')}`),
        src('Treat powerlines as live unless the asset owner confirms in writing that they are isolated, and keep the platform from raising ground levels under them. Where powerlines are near, the no go zones and how they are kept are written here: ____.', PSTD('s 4.7')),
        src('Rigs keep out of the zone of influence of the basement edge and the retention wall unless the support is designed by a competent person for the rig.', MODEL('Excavation work', 's 4.1, s 4.3')),
        src('Spoil is kept outside the zone of influence of the basement excavation and any open bores.', MODEL('Excavation work', 's 4.1')),
        src('Operators are trained on the specific rig and its attachments. Trainees never operate unsupervised.', PSTD('s 5.4, s 5.5')),
        src('Pre-start inspection each shift. Safety faults are fixed before the rig is used. A competent person maintains it to the manufacturer\'s recommendations, with an annual inspection.', `${WHS('s 213')}; ${PSTD('s 6.2, s 6.3, s 6.4')}`),
      ],
    }],
    ppe: ['earMuffs', 'hivis'],
  },
  {
    when: 'pileCage',
    steps: [{
      step: 'Lift, pitch and lower reinforcement cages',
      hazards: ['A cage falls or buckles during the lift.', 'A person is struck or crushed by a swinging cage.', 'A fall into the open bore while guiding the cage.'],
      controls: [
        src('The crane operator holds the slewing mobile crane licence for the crane\'s maximum rated capacity (up to 20 t, 60 t, 100 t or over 100 t). Slinging and directing lifts out of the operator\'s view is dogging work. Sight each licence before work.', WHS('s 81, s 85, schedule 3')),
        src('A mobile crane with a maximum rated capacity over 10 t is registered, and its registration is current.', WHS('schedule 5')),
        src('Lifting gear suits the cage, and lifts stay within the crane\'s limits. No one stands under a suspended cage, and the cage stays under control while it is pitched and lowered, with tag lines.', WHS('s 219')),
        src('Pitching with two machines (crane and rig, or a tailing crane) only where each machine is designed to lift a load. The rig\'s whip line is used only where the rig is designed to lift that load.', WHS('s 219')),
        src('Plan the slings and the cage lay-down areas.', PSTD('s 3.9, s 3.10')),
        'Guide the cage into the bore from outside the bore guard, never by standing over the open bore.',
      ],
    }],
    replaces: ['reo'],
  },
  {
    when: 'cfaCage',
    steps: [{
      step: 'Lift and plunge cages into the fresh CFA pile',
      hazards: ['A cage falls or buckles during the lift.', 'A person is struck or crushed by a swinging cage.', 'Concrete splash and skin burns from wet concrete.'],
      controls: [
        src('The crane operator holds the slewing mobile crane licence for the crane\'s maximum rated capacity (up to 20 t, 60 t, 100 t or over 100 t). Slinging and directing lifts out of the operator\'s view is dogging work. Sight each licence before work.', WHS('s 81, s 85, schedule 3')),
        src('A mobile crane with a maximum rated capacity over 10 t is registered, and its registration is current.', WHS('schedule 5')),
        src('Lifting gear suits the cage, and lifts stay within the crane\'s limits. No one stands under a suspended cage, and the cage stays under control while it is pitched and plunged, with tag lines.', WHS('s 219')),
        src('Plan the slings and the cage lay-down areas.', PSTD('s 3.9, s 3.10')),
        'Guide the cage from beside the pile, never under it, and keep hands clear of the cage as it is pushed into the concrete.',
      ],
    }],
    replaces: ['reo'],
    ppe: ['gloveChemical', 'goggles'],
  },
  {
    when: 'openBore',
    steps: [{
      step: 'Protect open bores',
      hazards: ['A person falls into an open bore.', 'Drowning in a bore holding water or slurry.', 'Bore collapse.'],
      controls: [
        src('Cover or guard each bore as soon as it is formed. Covers carry at least a 2 kN point load, are fixed down, and are signed DANGER HOLE BENEATH.', `${MODEL('Managing the risk of falls', 's 4.2')}; ${WHS('s 306F')}`),
        src('Pile hole guards with a footplate, or a lockable cover, at every open bore.', `${PSTD('s 3.7, s 3.10')}; ${MODEL('Excavation work', 's 5.3')}`),
        src('Barricade and sign the bore area, and keep the site secure from unauthorised access.', `${MODEL('Managing the risk of falls', 's 8.1')}; ${WHS('s 298')}`),
        'No one enters a pile bore.',
        src('The emergency plan covers rescue of a person from a bore or excavation.', MODEL('Excavation work', 's 3.7')),
      ],
    }],
  },
  {
    when: 'pileConcrete',
    steps: [{
      step: 'Place concrete in the piles',
      hazards: ['A pressurised concrete line or hydraulic hose fails.', 'A line blockage releases under pressure.', 'Strain handling hoses and pipes.'],
      controls: [
        src('Manage failure of pressurised concrete lines and hydraulics.', WHS('s 214')),
        src('Release pressure and isolate before clearing a blockage. Refit guards before restarting.', MODEL('Managing the risks of plant in the workplace', 's 3.6')),
        src('Use lifting aids for hoses and pipes rather than carrying them.', MODEL('Hazardous manual tasks', 's 4.5')),
        src('Agitator trucks keep to the set routes.', PSTD('s 4.9')),
      ],
    }],
    replaces: ['concrete'],
  },
  {
    when: 'pileTrim',
    steps: [{
      step: 'Trim pile heads',
      hazards: ['Silica dust from breaking concrete.', 'Noise and hand-arm vibration from breakers.', 'Flying fragments.', 'Back strain and crush handling broken pile heads.'],
      controls: [
        { fact: 'silicaControls' },
        src('Breaking concrete with power tools or plant is processing crystalline silica. Control it with wet suppression or on-tool extraction, and fit tested respirators for anyone still at risk.', WHS('s 529A, s 529B, s 529C')),
        src('Assess in writing before breaking whether the processing is high risk, without counting PPE or administrative controls, and without relying only on on-tool extraction or wet methods. If it cannot be determined, treat it as a risk to health until it is.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS, with the written assessment attached, can be the plan only where the work is also high risk construction work), and workers have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
        src('Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak, reducing it at the source first. Workers who must wear hearing protection have hearing tests within 3 months and at least every 2 years.', WHS('s 56, s 57, s 58')),
        src('Choose low vibration tools, or plant such as hydraulic pile croppers, to reduce hand-held breaking.', MODEL('Hazardous manual tasks', 's 4.8')),
        'Where hand-held breakers are used: rotate operators to limit time on the tool, use the lightest breaker that does the job, keep both hands on it, and keep others outside the fragment zone.',
        'Exposed starter bars are capped or bent over, and broken pile heads are lifted with lifting gear, not by hand.',
        src('An excavator lifts broken pile heads only where it is designed to lift that load, or the lift creates no greater risk than with plant designed for it.', WHS('s 219')),
        src('Keep people clear of the excavator and croppers while they work.', WHS('s 215')),
        src('Isolate the work area for flying fragments, and wear a face shield.', MODEL('Managing the risks of plant in the workplace', 's 2.3')),
      ],
    }],
    ppe: ['p2', 'earMuffs', 'faceShield'],
  },
  {
    when: 'retentionWall',
    steps: [{
      step: 'Excavate in front of the retention wall',
      hazards: ['The wall or face collapses.', 'Neighbouring buildings move or flood.', 'A fall from the basement edge.', 'Plant at the edge overloads the wall.'],
      controls: [
        { fact: 'temporarySupport' },
        src('Neighbouring buildings are protected before digging, and the work does not flood them.', MODEL('Excavation work', 's 3.4')),
        src('Excavate in stages, with support keeping pace. No one works ahead of the support. Where ground anchors are used, soil above them is removed only after a competent person approves.', MODEL('Excavation work', 's 6.2')),
        src('No plant or loads near the edge unless the support is designed by a competent person to carry them.', MODEL('Excavation work', 's 4.1')),
        src('A competent person inspects the wall and excavation often, and any repair is made from above before work below continues.', MODEL('Excavation work', 's 6.6')),
        src('The emergency plan covers ground slip, flooding and rescue from the excavation.', MODEL('Excavation work', 's 3.7')),
      ],
    }],
  },
  {
    when: 'carpLoad',
    steps: [{
      step: 'Move materials and joinery to the floors',
      hazards: ['Back and shoulder strain carrying sheets, doors and cabinets.', 'A fall at an open hoist landing.', 'Wind catches large sheets.'],
      controls: [
        src('Move materials between levels with the materials hoist or crane, not by hand.', MODEL('Construction work', 's 3.3')),
        src('Have materials delivered to the hoist or to where they are used.', MODEL('Hazardous manual tasks', 's 4.7')),
        src('Use trolleys, lift trolleys, panel lifters, and hooks or suction pads for sheets. Keep trolleys maintained.', MODEL('Hazardous manual tasks', 's 4.4, s 4.5')),
        src('Team lifts are an interim control only, with one person in charge.', MODEL('Hazardous manual tasks', 's 4.9')),
        src('Take care with large sheets in wind on balconies and at hoist landings.', MODEL('Hazardous manual tasks', 's 3.4')),
        src('Hoist landing gates stay closed except while loading.', MODEL('Managing the risk of falls', 's 4.2')),
      ],
    }],
  },
  {
    when: 'carpFraming',
    steps: [{
      step: 'Frame walls and bulkheads',
      hazards: ['A fall from a ladder or mobile scaffold.', 'Cuts from steel stud edges.', 'Noise and flying particles from cutting.'],
      controls: [
        src('Ladders are industrial and rated for at least 120 kg.', WHS('s 306M')),
        src('When working from a ladder, keep two feet and one other point of contact with it, and use a tool belt.', MODEL('Managing the risk of falls', 's 9.1')),
        src('Use step platforms rather than plain stepladders. Never stand above the second tread below the top of a stepladder, never use two-handed saws on a ladder, and plan the work so no one works from a ladder for long periods.', MODEL('Managing the risk of falls', 's 8.3, s 9.1')),
        src('Mobile scaffolds: lock the castors before anyone gets on, never move it with anyone on it, keep it clear of open edges and penetrations, and do not alter it.', MODEL('Managing the risk of falls', 's 5.1')),
        src('Never use a ladder to hold up a platform.', WHS('s 306M')),
        src('Do not cut steel studs with a saw built for timber unless the hazards are assessed and controlled.', MODEL('Managing the risks of plant in the workplace', 's 3.4')),
      ],
    }],
    ppe: ['gloveCut', 'earPlugs'],
  },
  {
    when: 'carpentryWork',
    steps: [{
      step: 'Use power tools: saws and nail guns',
      hazards: ['Cuts and amputation from saw blades.', 'Nails or fragments fired into a person.', 'Noise.', 'Timber and MDF dust.'],
      controls: [
        src('Guards are in place, strongly fixed and hard to bypass, and control ejected parts. Drop saws have a self-adjusting guard.', `${WHS('s 208')}; ${MODEL('Managing the risks of plant in the workplace', 's 4.1')}`),
        src('Disconnect the power before removing a guard, and refit it before use. Inspect hand-held tools regularly and repair or replace them.', MODEL('Managing the risks of plant in the workplace', 's 3.5, s 4.1')),
        'Nail guns: sequential trigger where available, never bypass the nose contact, no finger on the trigger while carrying, and keep the gun pointed away from people.',
        src('Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak. If you need to raise your voice to talk to someone 1 m away, the noise is likely hazardous. Use quieter methods, such as gluing instead of nailing, where possible.', `${WHS('s 56, s 57')}; ${MODEL('Managing noise and preventing hearing loss', 's 3.2, s 5.1')}`),
        src('Hearing protection is worn for the whole time of the noise. Workers who must wear it have hearing tests within 3 months and at least every 2 years.', `${WHS('s 58')}; ${MODEL('Managing noise and preventing hearing loss', 's 5.3')}`),
        src('Keep timber and MDF dust below the exposure standard with dust extraction on saws, and monitor where unsure.', WHS('s 49, s 50')),
      ],
    }],
    ppe: ['glassesClear', 'earPlugs'],
  },
  {
    when: 'carpJoinery',
    steps: [{
      step: 'Install doors, joinery and cabinets',
      hazards: ['Strain holding heavy units in place while fixing.', 'Crush from a falling door or cabinet.'],
      controls: [
        src('No engineered stone benchtops, panels or slabs are installed or processed.', WHS('s 529D')),
        src('Ask suppliers to deliver joinery ready to install and the right way up.', MODEL('Hazardous manual tasks', 's 4.7')),
        src('Use lifting aids, straps, trolleys and props to hold units while fixing, rather than holding them up by hand for long periods.', MODEL('Hazardous manual tasks', 's 2.2, s 4.9')),
        'Doors and cabinets are fixed or propped as soon as they are stood up.',
      ],
    }],
  },
  {
    when: 'carpEdge',
    steps: [{
      step: 'Work near balcony edges, voids and penetrations',
      hazards: ['A fall from a balcony edge, void or penetration.', 'Tools and offcuts fall onto people below.'],
      controls: [
        { fact: 'fallControl' },
        src('Edge protection and penetration covers stay in place. Covers carry a 2 kN point load, are fixed down and signed DANGER HOLE BENEATH. Plywood alone is not preferred.', `${WHS('s 306E, s 306F')}; ${MODEL('Managing the risk of falls', 's 4.2')}`),
        src('No stepladders near an open edge, penetration or beside a railing without extra fall protection.', MODEL('Managing the risk of falls', 's 9.1')),
        src('Barricade and sign no go areas below, and keep tools and offcuts away from edges.', MODEL('Managing the risk of falls', 's 8.1')),
      ],
    }],
  },
  {
    when: 'bulkDig',
    steps: [{
      step: 'Bulk excavate and load trucks',
      hazards: ['An excavator or truck strikes a person.', 'Plant overturns on a ramp or at the edge.', 'The excavation face or batter collapses.'],
      controls: [
        { fact: 'excavationPlan' },
        src('Manage the risk of plant overturning and colliding with people or things. Plant that could hit people has a warning device.', WHS('s 214, s 215')),
        src('A traffic management plan is in place before plant starts. Ramps and haul roads are built and maintained.', MODEL('Excavation work', 's 4.3')),
        src('Physical barriers separate people from plant. Operators and ground workers use two way acknowledgement before anyone approaches plant.', MODEL('Excavation work', 's 2.3, s 4.3')),
        src('Plant, trucks and stockpiles stay out of the zone of influence unless the support is designed for them. Wheel stops at edges.', MODEL('Excavation work', 's 4.1, s 4.3')),
        src('Batters are no steeper than 45 degrees unless designed by a competent person and certified in writing. If ground conditions change, stop until the ground is stable.', MODEL('Excavation work', 's 6.1')),
        src('Earthmoving plant over 1500 kg with a seated operator has a rollover or falling object protective structure. Daily pre-start checks, and defective plant is taken out of service.', MODEL('Excavation work', 's 4.3')),
      ],
    }],
    ppe: ['hivisNight'],
  },
  {
    when: 'anchorsProps',
    steps: [{
      step: 'Install, stress and later remove ground anchors and props',
      hazards: ['The wall moves or collapses if anchors lose load.', 'A prop or waler falls during lifting.', 'Stored energy released when de-stressing.'],
      controls: [
        { fact: 'temporarySupport' },
        src('Ground anchors are designed by a competent person, such as a geotechnical engineer. Anchor loads are checked while they are in service.', MODEL('Excavation work', 's 6.2')),
        src('Do not dig below the design stage level, or remove soil above anchors or within the active soil zone, without a competent person\'s approval. No one works ahead of the support.', MODEL('Excavation work', 's 6.2')),
        src('Hydraulic props are designed for the expected ground pressures.', MODEL('Excavation work', 's 6.2')),
        src('Remove supports in reverse order of installation, installing temporary members first where needed, with workers kept clear.', MODEL('Excavation work', 's 6.3')),
        src('Props and walers are lifted only with plant designed to lift them, never over people, and slung by a licensed dogger. An excavator is used to lift only where a competent person has assessed that it does not increase the risk.', `${WHS('s 219, schedule 3')}; ${MODEL('Managing the risks of plant in the workplace', 's 3.3')}`),
      ],
    }],
  },
  {
    when: 'detailDig',
    steps: [{
      step: 'Excavate pile caps, lift pits and trenches',
      hazards: ['The sides collapse and bury a worker.', 'A fall into a pit or trench.', 'Striking underground services.', 'Exhaust fumes in a pit.'],
      controls: [
        { fact: 'trenchSupport' },
        src('Every side of a trench or pit 1.5 m deep or more is supported by shoring, benching or battering, unless a geotechnical engineer advises in writing, for a stated period, that it is safe. Support it at any depth where there is a risk of engulfment.', `${WHS('s 306')}; ${MODEL('Excavation work', 's 5.1')}`),
        src('Trenches and pits are secured from unauthorised or accidental entry. Lift pits have a lockable cover or a guard rail with a gate.', `${WHS('s 306')}; ${MODEL('Excavation work', 's 5.3')}`),
        src('Get the underground services information and pothole to confirm services before digging.', `${WHS('s 304')}; ${MODEL('Excavation work', 's 3.5')}`),
        src('No combustion engine plant in a trench or pit while workers are in it. Check the atmosphere before starting.', MODEL('Excavation work', 's 4.6')),
        src('Trench shields are not loaded beyond their design, and are used to the manufacturer\'s instructions. Enter sheeted areas only by ladder.', MODEL('Excavation work', 's 6.2, s 6.4')),
      ],
    }],
  },
  {
    when: 'dewatering',
    steps: [{
      step: 'Dewater the excavation',
      hazards: ['Water softens the faces and undermines the support.', 'Flooding traps workers.', 'Boiling or piping of sandy ground.'],
      controls: [
        src('The dewatering system is planned, and pumps stop water building up.', MODEL('Excavation work', 's 2.3, s 4')),
        src('Support is designed for groundwater pressure and saturated soil. Watch for boils in sandy ground.', MODEL('Excavation work', 's 4.1, s 6')),
        src('Faces and support are inspected often as the water table changes. Spoil is placed to channel runoff away from the excavation.', MODEL('Excavation work', 's 4.1, s 6.6')),
        src('The emergency plan covers flooding and rescue from the excavation.', MODEL('Excavation work', 's 3.7')),
      ],
    }],
  },
  {
    when: 'contaminatedSpoil',
    steps: [{
      step: 'Handle contaminated or unknown material in the spoil',
      hazards: ['Exposure to contaminated soil, gases or asbestos.', 'Gases collecting in the excavation.'],
      controls: [
        src('Workers are trained to recognise buried contaminants and what to do: stop, keep clear, and report.', MODEL('Excavation work', 's 2.1, s 4')),
        src('Manage exposure to airborne contaminants in the excavation, with gas monitors and mechanical ventilation where needed.', `${WHS('s 305')}; ${MODEL('Excavation work', 's 4, s 4.6')}`),
        src('If asbestos is found or likely, stop. Its removal is planned as asbestos work.', WHS('s 291')),
        src('Plan haul routes and disposal for spoil.', MODEL('Excavation work', 's 2.2')),
      ],
    }],
  },
  {
    when: 'basementEdge',
    steps: [{
      step: 'Protect the basement edge and provide access',
      hazards: ['A fall from the basement edge.', 'Spoil or objects fall onto workers below.', 'No safe way in or out.'],
      controls: [
        { fact: 'fallControl' },
        src('Edge protection at the basement edge before a fall of 2 m or more is possible: top rail at least 900 mm, toe board at least 150 mm, and no more than 450 mm between rails.', WHS('s 306D, s 306E')),
        src('Toe boards where spoil could fall in.', MODEL('Excavation work', 's 4.1')),
        src('Safe access and exit: scaffold stairs or landing platforms in deep excavations, and emergency exits.', `${WHS('s 78')}; ${MODEL('Excavation work', 's 4.4')}`),
        src('Ladders are for access only, industrial and rated for at least 120 kg, set at 4 to 1 and secured.', MODEL('Managing the risk of falls', 's 9.1')),
      ],
    }],
  },
  {
    when: 'neighbours',
    steps: [{
      step: 'Protect neighbouring buildings and the street',
      hazards: ['A neighbouring building moves, cracks or floods.', 'The public is struck by plant or falling material.', 'Traffic loads collapse the edge near the street.'],
      controls: [
        src('No digging until steps are taken to prevent collapse of neighbouring buildings. Digging below their footings is assessed by a competent person and supported. Vibration and flooding of neighbours are controlled.', MODEL('Excavation work', 's 3.4')),
        src('Underground services information covers adjacent areas too.', WHS('s 304')),
        src('The site is secured from unauthorised access, and the edge near the street is supported against traffic loads.', `${WHS('s 298')}; ${MODEL('Excavation work', 's 5.1')}`),
        'Trained traffic controllers direct trucks in and out of the site under the principal contractor\'s traffic management plan.',
      ],
    }],
  },
  {
    when: 'tileCut',
    steps: [{
      step: 'Cut tiles and stone',
      hazards: ['Silica dust from cutting tiles and stone.', 'Cuts and flying fragments from saws and grinders.', 'Noise.', 'Electric shock from tools used with water.'],
      controls: [
        { fact: 'silicaControls' },
        src('Tiles and stone with 1% or more crystalline silica are a crystalline silica substance. Cutting them with power tools is processing that must be controlled: wet cutting or on-tool extraction, and respirators for anyone still at risk.', WHS('s 529A, s 529B, s 529C')),
        src('Assess in writing before cutting whether the processing is high risk, without counting PPE or administrative controls, and without relying only on on-tool extraction or wet methods. If it cannot be determined, treat it as a risk to health until it is.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS, with the written assessment attached, can be the plan only where the work is also high risk construction work), and workers have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
        src('No engineered stone benchtops, panels or slabs are cut or installed. Ceramic and porcelain tiles and grout are not engineered stone.', WHS('s 529A, s 529D')),
        src('Where it is uncertain whether dust is below the exposure standard, monitor the air and keep the results for 30 years.', WHS('s 49, s 50')),
        src('Saw and grinder guards are in place and hard to bypass. Isolate the cutting area, wear a face shield, and replace worn blades and wheels.', `${WHS('s 208')}; ${MODEL('Managing the risks of plant in the workplace', 's 2.2, s 3.5')}`),
        src('Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak. Hearing protection is worn for the whole time of the noise. Workers who must wear it have hearing tests within 3 months and at least every 2 years.', `${WHS('s 56, s 57, s 58')}; ${MODEL('Managing noise and preventing hearing loss', 's 5.3')}`),
        src('Use RCD protected tools and leads, keep leads off wet floors and out of access ways, and inspect tools regularly.', `${MODEL('Construction work', 's 3.3')}; ${MODEL('Managing the risks of plant in the workplace', 's 3.5')}`),
      ],
    }],
    ppe: ['p2', 'earMuffs', 'faceShield', 'gumboots'],
  },
  {
    when: 'tileMix',
    steps: [{
      step: 'Mix and apply adhesives, grouts, screeds and sealers',
      hazards: ['Cement dust and skin burns from wet cement products.', 'Skin sensitisation from epoxy grouts and sealers.', 'Vapour from sealers.'],
      controls: [
        { fact: 'safetyDataSheet' },
        src('The current safety data sheet for each product is at the work area before first use, and every container, including anything decanted, is labelled.', WHS('s 341, s 344')),
        src('Keep dust below the exposure standard. Mix bagged products with dust control, keep containers closed, vacuum or wet clean instead of dry sweeping, and clean spills straight away.', `${WHS('s 49')}; ${MODEL('Managing risks of hazardous chemicals', 's 4.1')}`),
        src('Avoid skin contact with cement and epoxy: wear chemical resistant gloves suited to the product. No eating, drinking or smoking in the work area, and wash before breaks.', MODEL('Managing risks of hazardous chemicals', 's 4.1, appendix J')),
      ],
    }],
    ppe: ['gloveChemical', 'goggles', 'p2'],
  },
  {
    when: 'tileLay',
    steps: [{
      step: 'Lay tiles',
      hazards: ['Knee and back injury from long periods kneeling.', 'Strain lifting tile boxes and adhesive bags.', 'Slips on wet slurry.'],
      controls: [
        src('Kneeling while laying tiles is a hazardous manual task. Rotate tasks and take short, frequent breaks.', `${WHS('s 60')}; ${MODEL('Hazardous manual tasks', 's 2.2, s 4.9')}`),
        src('Buy smaller or lighter bags and boxes where possible, have materials delivered to the hoist or work area, move them between levels by hoist, and use trolleys.', `${MODEL('Hazardous manual tasks', 's 4.1, s 4.4, s 4.5, s 4.7')}; ${MODEL('Construction work', 's 3.3')}`),
        'Wear knee pads.',
        src('Keep access ways clear, put waste in bins, and clean up slurry so floors are not slippery.', MODEL('Construction work', 'appendix K')),
      ],
    }],
  },
  {
    when: 'tileEdge',
    steps: [{
      step: 'Tile balconies and terraces near edges',
      hazards: ['A fall from the balcony edge.', 'Tiles, offcuts or tools fall onto people below.'],
      controls: [
        { fact: 'fallControl' },
        src('Edge protection stays in place: top rail 900 mm to 1100 mm, mid rail and toe board.', `${WHS('s 78, s 79')}; ${MODEL('Managing the risk of falls', 's 5.2')}`),
        src('Do not stack tiles or bags near edges, and secure offcuts against wind.', MODEL('Construction work', 'appendix K')),
        src('Stop objects falling freely, and do not work above other trades.', `${WHS('s 55')}; ${MODEL('Managing the risk of falls', 's 8.3')}`),
      ],
    }],
  },
  {
    when: 'wpPrep',
    steps: [{
      step: 'Prepare surfaces by grinding',
      hazards: ['Silica dust from grinding concrete.', 'Noise.', 'Flying particles.'],
      controls: [
        { fact: 'silicaControls' },
        src('Grinding concrete is processing a crystalline silica substance and must be controlled: wet suppression, on-tool extraction or local exhaust, and respirators worn by anyone still at risk.', WHS('s 529B, s 529C')),
        src('Assess in writing before grinding whether the processing is high risk, without counting PPE or administrative controls, and without relying only on on-tool extraction or wet methods. If it cannot be determined, treat it as a risk to health until it is.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS, with the written assessment attached, can be the plan only where the work is also high risk construction work), and workers have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
        src('Where it is uncertain whether dust is below the exposure standard, monitor the air.', WHS('s 50')),
        src('Keep noise below 85 dB(A) over 8 hours. Wear hearing protection near grinders.', `${WHS('s 56, s 57')}; ${MODEL('Construction work', 'appendix K')}`),
        src('Vacuum or wet clean dust, never dry sweep.', MODEL('Managing risks of hazardous chemicals', 's 4.1')),
      ],
    }],
    ppe: ['p2', 'earMuffs', 'glassesClear'],
  },
  {
    when: 'wpLiquid',
    steps: [{
      step: 'Apply primers and liquid membranes',
      hazards: ['Breathing solvent vapour.', 'Fire from flammable vapour.', 'Skin and eye contact with primers and membranes.'],
      controls: [
        { fact: 'safetyDataSheet' },
        src('The current safety data sheet for each product is at the work area, the product is on the hazardous chemicals register, and anything decanted is labelled.', WHS('s 342, s 344, s 346')),
        src('Use a less hazardous product where possible, such as a water-based membrane instead of a solvent or two-part epoxy system.', MODEL('Construction work', 's 3.3')),
        src('Keep vapour below the exposure standard. Vapour heavier than air collects low down: extract from the lowest point and bring fresh air in from above.', `${WHS('s 49')}; ${MODEL('Managing risks of hazardous chemicals', 's 3.4, s 4.1')}`),
        src('No ignition sources where flammable vapour may be present. Keep only small quantities at the work area.', WHS('s 53, s 355')),
        src('Lids stay on except when pouring, and spills are contained and cleaned up straight away.', `${WHS('s 357')}; ${MODEL('Managing risks of hazardous chemicals', 's 4.2')}`),
        src('Wear gloves resistant to the specific solvent, and no eating, drinking or smoking in the work area.', MODEL('Managing risks of hazardous chemicals', 's 4.1')),
      ],
    }],
    ppe: ['gloveChemical', 'goggles', 'halfFace'],
  },
  {
    when: 'wpTorch',
    steps: [{
      step: 'Lay torch-on membranes',
      hazards: ['Fire from the torch and hot bitumen.', 'LPG cylinder leaks or flashback.', 'Burns and heat stress.'],
      controls: [
        { fact: 'hotWorkPermit' },
        src('A hot work permit is issued before torching. Bitumen is a combustible fuel: clear rubbish and other fuel from the area, and keep fire-fighting equipment at the work area.', `${MODEL('Managing risks of hazardous chemicals', 's 4.2, appendix H')}; ${MODEL('Welding processes', 's 3.4')}`),
        src('LPG cylinders are upright and secured, have a working relief valve, and valves are closed when not in use. Hoses are fitted with crimped or permanent clips, and fittings are leak tested with detergent or leak spray.', `${MODEL('Managing risks of hazardous chemicals', 's 4.2')}; ${MODEL('Welding processes', 's 3.6')}`),
        src('Gas heavier than air collects in pits and low areas. No torching in pits, sumps or enclosed spaces.', `${MODEL('Welding processes', 's 3.6')}; ${WHS('s 73')}`),
        src('Avoid contact with hot surfaces, wear heat resistant gloves, drink cool water and take regular rest breaks.', MODEL('Welding processes', 's 3.5')),
        'A fire watch stays after torching ends, for the time set in the principal contractor\'s hot work permit.',
      ],
    }],
    ppe: ['gloveWelding', 'longs'],
  },
  {
    when: 'wpEdge',
    steps: [{
      step: 'Work at roof, podium and balcony edges',
      hazards: ['A fall from the roof, podium or balcony edge.', 'Rolls, tools or materials fall or blow off the roof.'],
      controls: [
        { fact: 'fallControl' },
        src('Work from a solid surface with edge protection before a fall of 2 m or more is possible: top rail at least 900 mm, rails no more than 450 mm apart, toe board at least 150 mm.', WHS('s 78, s 306D, s 306E')),
        src('Openings are covered with fixed covers that take a fall.', WHS('s 306F')),
        src('Where travel restraint is used, it stops the wearer reaching the edge. Fall arrest is used only with someone on site who can rescue.', MODEL('Managing the risk of falls', 's 6.1, s 7.3')),
        src('No materials stacked near edges, and loose material is secured against wind.', MODEL('Construction work', 'appendix K')),
      ],
    }],
    ppe: ['sunHat'],
  },
  {
    when: 'wpRolls',
    steps: [{
      step: 'Move membrane rolls and materials',
      hazards: ['Back strain lifting rolls and drums.', 'Long periods kneeling.'],
      controls: [
        src('Rolls and drums are delivered by crane or hoist to where they are used, ordered in smaller loads for handling, and moved with trolleys.', MODEL('Hazardous manual tasks', 's 4.4, s 4.5, s 4.7')),
        src('Team lifts are an interim control only, with one person in charge.', MODEL('Hazardous manual tasks', 's 4.9')),
        src('Long periods kneeling are a hazardous manual task: rotate tasks and use knee pads.', `${WHS('s 60')}; ${MODEL('Hazardous manual tasks', 's 2.2')}`),
      ],
    }],
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
          src('Install so that entry is not needed where possible, for example pumps on guide rails that lift out from above.', WHS('s 64')),
          src('A competent person does a written risk assessment first, including whether the work can be done without entering.', WHS('s 66')),
          src('Workers are trained in the hazards, controls, permit and emergency procedures, with training records kept for 2 years.', WHS('s 76')),
          src('No one enters without a written entry permit from a competent person, naming the space, the people entering, the time and the controls.', WHS('s 65, s 67')),
          src('Signs at each entry say it is a confined space and not to enter without a permit.', WHS('s 68')),
          src('Isolate connected pipes and plant: blank or cap lines, or close, lock and tag two valves with the drain between them locked open, and release stored energy. Pump power is locked out and tagged, and each person keeps the key to their own lock.', `${WHS('s 70')}; ${MODEL('Confined spaces', 's 4.4')}`),
          src('Ventilate or purge, never with pure oxygen. Test from outside for oxygen (19.5% to 23.5%), flammable gas (below 5% of the lower explosive limit) and toxic gases such as hydrogen sulphide and carbon monoxide.', `${WHS('s 71, s 72, schedule 19')}; ${MODEL('Confined spaces', 's 3.4')}`),
        ],
      },
      {
        step: 'Enter and work',
        hazards: ['A fall at the access.', 'A worker is overcome by the atmosphere.'],
        controls: [
          { fact: 'fallControl' },
          src('Monitor the air continuously, with the flammable gas alarm set at 5% of the lower explosive limit. Leave at once if any alarm sounds.', WHS('s 72')),
          'Access by fixed ladder, or by a tripod and winch with a harness where there is a fall at the access.',
          src('A standby person stays outside, in continuous contact, and never enters to rescue. Rescue is started from outside.', `${WHS('s 69, s 74')}; ${MODEL('Confined spaces', 's 4.6')}`),
          src('Rescue and first aid procedures are set and practised, rescue equipment is ready at the entry, and air supplied breathing equipment is available for any rescue entry.', WHS('s 74, s 75')),
          src('No ignition source is taken in if there is any possibility of fire or explosion.', WHS('s 73')),
        ],
      },
      {
        step: 'Leave and close up',
        hazards: ['A person or tool is left inside.'],
        controls: [
          'Account for everyone and all tools before closing the access.',
          src('Close and sign off the entry permit, confirming everyone has left. Keep the risk assessment for 28 days after the work and the permit until the work is complete.', WHS('s 67, s 77')),
        ],
      },
    ],
    ppe: ['harness'],
  },
  {
    when: 'pressureTest',
    steps: [{
      step: 'Pressure test and commission',
      hazards: ['A fitting or cap blows off under pressure.', 'Hot water scalds.', 'Flooding.'],
      controls: [
        { fact: 'pressureTesting' },
        'Exclusion zone around the pipework under test. No one works on it while it is under pressure.',
        'Release pressure fully before tightening or changing fittings.',
        src('Guard or insulate hot pipes.', WHS('s 209')),
        'Check temperature control devices before hot water is used.',
      ],
    }],
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
  { area: 'Eyes and face', items: [['glassesClear', 'Safety glasses, clear'], ['glassesTinted', 'Safety glasses, tinted'], ['goggles', 'Goggles'], ['faceShield', 'Face shield'], ['filterEye', 'Filter eye protection (brazing or welding)']] },
  { area: 'Hearing', items: [['earPlugs', 'Ear plugs'], ['earMuffs', 'Ear muffs']] },
  { area: 'Breathing', items: [['p2', 'P2 respirator (fit tested)'], ['halfFace', 'Half-face respirator with filters (fit tested)']] },
  { area: 'Hands', items: [['gloveGeneral', 'General purpose gloves'], ['gloveCut', 'Cut resistant gloves'], ['gloveChemical', 'Chemical resistant gloves'], ['gloveInsulated', 'Insulated electrical gloves'], ['gloveWelding', 'Welding or heat resistant gloves'], ['gloveCold', 'Cold resistant gloves (refrigerant)']] },
  { area: 'Body', items: [['longs', 'Long sleeves and long pants'], ['hivis', 'Hi-vis, day'], ['hivisNight', 'Hi-vis, day and night'], ['coveralls', 'Disposable coveralls'], ['arcRated', 'Arc-rated face shield and flame-resistant clothing']] },
  { area: 'Feet', items: [['boots', 'Safety boots'], ['gumboots', 'Safety gumboots']] },
  { area: 'Sun', items: [['sunscreen', 'Sunscreen']] },
  { area: 'Falls and water', items: [['harness', 'Full body harness'], ['lifeJacket', 'Life jacket']] },
];

const SITE_MINIMUM = ['hardHat', 'glassesClear', 'gloveGeneral', 'longs', 'hivis', 'boots'];
const PPE_IDS = new Set(PPE.flatMap((group) => group.items.map(([id]) => id)));

// A fact control may carry `otherwise`, a line used only when the fact is not given.
// A choice control gives the lines for the option the user chose.
function expand(control, factText, cite = true) {
  if (typeof control === 'string') return [control];
  // A control taken from a regulation or code carries its source, printed after it.
  // The sources are Queensland's, so other states get the control without them.
  if (control.text) return [control.source && cite ? `${control.text} (${control.source})` : control.text];
  if (control.choice) return (control.options[factText(control.choice)] || []).flatMap((item) => expand(item, factText, cite));
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
    controls: [...BEFORE.controls, ...BEFORE_EXTRA.filter((item) => flags[item.when]).flatMap((item) => expand(item.text, factText, flags.cite))],
  };
  const seen = new Set();
  const steps = [before, ...middle, FINISH]
    .filter((step) => !seen.has(step.step) && seen.add(step.step));
  return steps.map((step) => ({
    step: step.step,
    hazards: step.hazards.slice(),
    controls: step.controls.flatMap((item) => expand(item, factText, flags.cite)),
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
