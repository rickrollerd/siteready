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
  { when: 'scaffold', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'hoistInstall', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'steelWork', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'masonryWork', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'plasterWork', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'floorWork', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'glazingWork', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'painting', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'fireWork', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'liftWork', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'passiveFire', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'siteEstablish', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'sawCut', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'landscape', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'cleaning', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'mobileScaffold', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'hoistOperate', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
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
        src('The principal contractor manages traffic near the site. Trained traffic controllers direct vehicles in and out, and pedestrians and traffic on the footpath and road.', `${WHS('s 315')}; ${MODEL('Construction work', 's 3.3, appendix F')}`),
        'Keep work, plant and materials inside the separated work area.',
        src('Protect the public on the footpath with a closure, with written approval from the authority that controls it, or a gantry.', WHS('s 315L, s 315M')),
        src('Deliveries are unloaded inside the site, not from the road, where practicable.', MODEL('Construction work', 'appendix F')),
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
        hazards: ['Falling objects strike people below, including the public.', 'Scaffold collapse from poor ground or base.', 'Contact with powerlines.'],
        controls: [
          'Protect people below with a hoarding or gantry, or divert pedestrians, as approved.',
          src('Where the scaffold is next to a street, the principal contractor provides the hoarding, gantry or closure the regulation requires, and lifts over the footpath happen only with the area closed or a gantry in place.', WHS('s 315F, s 315G, s 315L')),
          src('Exclusion zone below with keep out signs and a person controlling it while erecting and dismantling.', `${WHS('s 55')}; ${MODEL('Construction work', 's 3.3')}`),
          'Check the ground and set out base plates and sole boards to the scaffold design.',
          src('Within the powerline no go zone, work only under the electricity entity\'s permit to work. Keep electrical leads off the metal frame with plastic lead hooks or insulation.', MODEL('Managing the risk of falls', 's 5.1')),
        ],
      },
      {
        step: 'Erect the scaffold',
        hazards: ['Scaffolders fall from height.', 'Dropped components.', 'Manual handling strain.'],
        controls: [
          { fact: 'fallControl' },
          { fact: 'systemInstructions' },
          'A licensed scaffolder erects the scaffold to the manufacturer\'s or designer\'s instructions. Do not mix components from different systems.',
          src('Scaffolding work where a person or object could fall more than 4 m needs a licence for the class: basic for modular scaffolds, intermediate for tube and coupler, gantries, perimeter screens and cantilevered crane loading platforms, advanced for hung and suspended scaffolds. Trainees work under the direct supervision of a licensed scaffolder. Sight each licence before work.', `${WHS('s 81, s 85, schedule 3')}; ${MODEL('Managing the risk of falls', 's 5.1')}`),
          src('Where prefabricated (modular) scaffold is used, it has a registered design, and components are not mixed unless the manufacturer approves.', `${WHS('schedule 5')}; ${MODEL('Managing the risk of falls', 's 5.1')}`),
        src('Where harnesses are used, anchors are engineer designed or approved by a competent person, no one works alone, and a rescue procedure is set up and tested.', WHS('s 80, s 306I')),
          src('At each lift, a platform at least 450 mm wide, edge protection and access are installed before the next lift, with a platform not more than 2 m below, unless the scaffolder is otherwise protected from falling.', WHS('s 306P')),
          'Install ties as the scaffold goes up.',
          'Pass components hand to hand or use a gin wheel. Do not throw them.',
          src('Team lifts are an interim control only, with one person in charge.', MODEL('Hazardous manual tasks', 's 4.9')),
        ],
      },
      {
        step: 'Inspect and hand over',
        hazards: ['People use an incomplete or unsafe scaffold.'],
        controls: [
          src('A scaffold from which a person or thing could fall more than 4 m is not used until a competent person gives written confirmation it is complete. It is inspected before use, after any incident or repair, and at least every 30 days.', WHS('s 225')),
          'A competent person inspects the scaffold before it is used and tags it.',
          src('Incomplete sections are tagged as not to be used and access is blocked.', `${WHS('s 225')}; ${MODEL('Managing the risk of falls', 's 8.2')}`),
          src('Users are told the safe working load, never to use an incomplete or defective scaffold, to report defects straight away, and not to alter it. Only licensed scaffolders alter it.', MODEL('Managing the risk of falls', 's 5.1')),
          src('Edge protection at every open edge of a work platform: top rail at least 900 mm, no more than 450 mm between rails, toe board at least 150 mm.', `${WHS('s 306E')}; ${MODEL('Managing the risk of falls', 's 5.1')}`),
        ],
      },
      {
        step: 'Dismantle the scaffold',
        hazards: ['Scaffolders fall as edge protection is removed.', 'Components fall onto people below.'],
        controls: [
          src('Edge protection and access stay in place as long as practicable, with a platform not more than 2 m below the scaffolder.', WHS('s 306Q')),
          src('Exclusion zone below, with keep out signs and a person controlling it.', MODEL('Construction work', 's 3.3')),
          'Lower components with a gin wheel or crane. Do not drop them.',
        ],
      },
    ],
    ppe: ['sunscreen', 'harness'],
  },
  {
    when: 'mobileScaffold',
    steps: [{
      step: 'Use mobile scaffolds',
      hazards: ['The scaffold rolls or tips.', 'A fall from the platform or access.'],
      controls: [
        src('Workers are trained in its use. It stays level and plumb, castors are locked before anyone gets on, it is never moved with anyone on it, and it is accessed by its internal ladder.', MODEL('Managing the risk of falls', 's 5.1')),
        src('Keep it well clear of open floor edges and penetrations, and of powerlines outdoors.', MODEL('Managing the risk of falls', 's 5.1')),
        src('Prefabricated towers have a registered design and components are not mixed. Users are told the safe working load.', `${WHS('schedule 5')}; ${MODEL('Managing the risk of falls', 's 5.1')}`),
        src('Where a person or thing could fall more than 4 m from it, it is erected by a licensed scaffolder, handed over in writing by a competent person, and inspected at least every 30 days.', WHS('s 81, s 225, schedule 3')),
      ],
    }],
  },
  {
    when: 'hoistInstall',
    steps: [{
      step: 'Install, climb and dismantle the hoist',
      hazards: ['A fall from the mast or landing.', 'The hoist or mast collapses.', 'Crush between the car and the mast or landing.'],
      controls: [
        { fact: 'systemInstructions' },
        src('Setting up and dismantling a hoist is rigging work: basic rigging for hoists, intermediate rigging for hoists with jibs and self-climbing hoists. Sight each licence before work.', WHS('s 81, s 85, schedule 3')),
        src('A personnel hoist with platform travel over 2.4 m has a registered design, and the registration number is kept at the hoist.', WHS('s 243, s 260, schedule 5')),
        src('Installed, climbed and dismantled by competent people to the manufacturer\'s instructions, stable throughout, and not commissioned until it is without risk so far as reasonably practicable, including inspections.', `${WHS('s 204')}; ${MODEL('Managing the risks of plant in the workplace', 's 3.2, s 3.9')}`),
        src('Exclusion zone below the mast during installation and climbing.', WHS('s 55')),
        src('During installation the car is controlled only from the car top by the person on it, with other controls isolated, as the manufacturer\'s instructions set out.', WHS('s 204')),
        src('After each climb, the hoist is inspected and tested before it is used again, and landing gates are fitted at each new level.', `${WHS('s 204')}; ${MODEL('Managing the risk of falls', 's 4.2')}`),
        src('Where harnesses are used, anchors are approved by a competent person, no one works alone, and a rescue procedure is set up and tested.', WHS('s 80, s 306I')),
      ],
    }],
  },
  {
    when: 'hoistOperate',
    steps: [{
      step: 'Operate the hoist',
      hazards: ['A fall from an open landing.', 'An overloaded car.', 'Unintended movement.'],
      controls: [
        src('A personnel and materials hoist is operated by a holder of the personnel and materials hoist licence, a materials hoist by a materials hoist licence holder.', WHS('s 81, schedule 3')),
        src('Loads stay within the rated load, with lifting attachments suited to them, and under control.', WHS('s 219')),
        src('Landing gates prevent falls, and stay closed except when the car is at the landing.', MODEL('Managing the risk of falls', 's 4.2')),
        src('Controls are guarded against unintended activation and can be locked off. Emergency stops are red.', WHS('s 210, s 211')),
        src('Maintained and inspected by a competent person to the manufacturer\'s recommendations.', WHS('s 213')),
        src('An up-to-date register of inspections and maintenance is kept.', MODEL('Managing the risks of plant in the workplace', 's 3.5')),
        src('Used only as designed, and no unauthorised changes.', WHS('s 205, s 206')),
      ],
    }],
  },
  {
    when: 'roof',
    steps: [
      {
        step: 'Set up roof access and fall protection',
        hazards: ['Falling from the roof edge or through openings.', 'Falling through fragile sheets or skylights.'],
        controls: [
          { fact: 'fallControl' },
          'Fall protection is installed and checked before anyone goes onto the roof.',
          src('Roof edge protection is erected to the manufacturer\'s instructions: top rail at least 900 mm, a toe board at least 150 mm or a bottom rail, and no gap over 450 mm. On slopes over 26 degrees, mesh or sheeting to 900 mm.', WHS('s 306E')),
          src('Skylights, fibreglass and brittle sheets are covered with fixed covers that take a fall, or fenced off. Safety mesh does not protect edges or holes, so it is used with edge protection.', `${WHS('s 78, s 306F')}; ${MODEL('Managing the risk of falls', 's 3.1, s 5.3')}`),
          src('Travel restraint is not used on fragile roofing or slopes over 15 degrees. Where fall arrest is used near edges, swing down is controlled with guard rails or mobile anchors.', MODEL('Managing the risk of falls', 's 6.1, s 7.4')),
          'Access by a scaffold stair, or a ladder secured top and bottom that extends above the landing.',
        ],
      },
      {
        step: 'Lift materials to and from the roof',
        hazards: ['Falling objects strike people below.', 'Manual handling strain.', 'Wind catches sheets.'],
        controls: [
          'Exclusion zone below the work, with barriers and signs.',
          src('Crane lifts are coordinated with the crane company\'s SWMS. Loads stay under control, within limits, and never over people.', `${WHS('s 219')}; ${MODEL('Construction work', 's 4.1')}`),
          'Use mechanical lifting where possible. Team lift long sheets.',
          src('Handle sheets in low wind. Secure sheets and offcuts stacked on the roof against wind, and do not stack them near unmeshed edges.', `${MODEL('Hazardous manual tasks', 's 4.8')}; ${MODEL('Construction work', 'appendix K')}`),
        ],
      },
      {
        step: 'Fix new roofing',
        hazards: ['Fall from height.', 'Power tool injuries.', 'Noise from cutting.', 'Heat and sun exposure.'],
        controls: [
          'Stay inside the edge protection at all times.',
          'Use tools with guards in place. Keep leads away from edges.',
          src('Hearing protection near grinders and cutting. Eye protection with power tools. Tool lanyards and toe boards so nothing falls.', `${WHS('s 56, s 57')}; ${MODEL('Construction work', 'appendix K')}`),
          src('Cool drinking water, shade, rest breaks and work at cooler times. Sun protection: hat or brim, long sleeves and pants, sunglasses and SPF 30 or higher sunscreen. Minimise work at height in extreme heat.', `${MODEL('Construction work', 'appendix K')}; ${MODEL('Managing the risk of falls', 's 8.3')}`),
        ],
      },
    ],
    ppe: ['gloveCut', 'sunHat', 'sunscreen'],
  },
  {
    when: 'roofStrip',
    steps: [{
      step: 'Remove old roofing',
      hazards: ['Falling through brittle roofing or openings.', 'Cuts from sheet edges.', 'Sheets caught by wind.'],
      controls: [
        'Walk only on purlin lines or on safety mesh.',
        'Cover or barricade openings as soon as sheets are removed.',
        'Wear cut resistant gloves when handling sheets.',
        'Stop handling sheets in strong wind.',
      ],
    }],
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
        'Where a boom-type platform is used, the harness is attached to the platform\'s anchor point.',
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
          src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
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
          src('Assess in writing before drilling whether the processing is high risk, without counting PPE or administrative controls, and without relying only on engineering controls such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until it is.', WHS('s 529CA')),
          src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
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
        src('Assess in writing before drilling whether the processing is high risk, without counting PPE or administrative controls, and without relying only on engineering controls such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until it is.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
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
        src('Assess in writing before drilling whether the processing is high risk, without counting PPE or administrative controls, and without relying only on engineering controls such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until it is.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
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
        src('Assess in writing before drilling whether the processing is high risk, without counting PPE or administrative controls, and without relying only on engineering controls such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until it is.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
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
        src('Assess in writing before drilling whether the processing is high risk, without counting PPE or administrative controls, and without relying only on engineering controls such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until it is.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
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
        src('Assess in writing before drilling whether the processing is high risk, without counting PPE or administrative controls, and without relying only on engineering controls such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until it is.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
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
        src('Assess in writing before breaking whether the processing is high risk, without counting PPE or administrative controls, and without relying only on engineering controls such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until it is.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
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
      hazards: ['Back and shoulder strain carrying sheets, studs, doors and cabinets.', 'Wind catches large sheets.'],
      controls: [
        src('Move materials between levels with the materials hoist, not by hand.', MODEL('Construction work', 's 3.3')),
        src('Have materials delivered to the hoist or to where they are used.', MODEL('Hazardous manual tasks', 's 4.7')),
        src('Use trolleys, lift trolleys, panel lifters, and hooks or suction pads for sheets. Keep trolleys maintained.', MODEL('Hazardous manual tasks', 's 4.4, s 4.5')),
        src('Team lifts are an interim control only, with one person in charge.', MODEL('Hazardous manual tasks', 's 4.9')),
        src('Handle large sheets in low wind on balconies and at hoist landings.', MODEL('Hazardous manual tasks', 's 4.8')),
        src('Unload only inside the hoist landing gates. Gates stay closed except while the hoist is at the landing.', MODEL('Managing the risk of falls', 's 4.2')),
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
        src('A saw built for timber is used to cut steel studs only if a competent person has assessed it as suitable for that use. If not, it is not used.', MODEL('Managing the risks of plant in the workplace', 's 3.4')),
      ],
    }],
    ppe: ['gloveCut', 'earPlugs'],
  },
  {
    when: 'carpFraming',
    steps: [{
      step: 'Cut and fix steel studs and track',
      hazards: ['Hot swarf, sparks and sharp burrs from cutting metal.', 'Cuts from stud edges.'],
      controls: [
        'Eye protection and cut resistant gloves when cutting metal. Deburr cut edges, and keep sparks away from combustible materials.',
        'Use snips or a metal cutting saw rather than an abrasive disc where possible.',
      ],
    }],
  },
  {
    when: 'carpentryWork',
    steps: [{
      step: 'Use power tools',
      hazards: ['Cuts and amputation from saw blades.', 'Nails or fragments fired into a person.', 'Noise.', 'Dust from cutting.'],
      controls: [
        src('Guards are in place, strongly fixed and hard to bypass, and control ejected parts. Drop saws have a self-adjusting guard.', `${WHS('s 208')}; ${MODEL('Managing the risks of plant in the workplace', 's 4.1')}`),
        src('Disconnect the power before removing a guard, and refit it before use. Inspect hand-held tools regularly and repair or replace them.', MODEL('Managing the risks of plant in the workplace', 's 3.5, s 4.1')),
        'Nail guns: sequential trigger where available, never bypass the nose contact, no finger on the trigger while carrying, and keep the gun pointed away from people.',
        src('Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak. If you need to raise your voice to talk to someone 1 m away, the noise is likely hazardous. Use quieter methods, such as gluing instead of nailing, where possible.', `${WHS('s 56, s 57')}; ${MODEL('Managing noise and preventing hearing loss', 's 3.2, s 5.1')}`),
        src('Hearing protection is worn for the whole time of the noise. Workers who must wear it have hearing tests within 3 months and at least every 2 years.', `${WHS('s 58')}; ${MODEL('Managing noise and preventing hearing loss', 's 5.3, s 5.4')}`),
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
        src('Overhead cabinets and wardrobes are fitted from step platforms or platform ladders rated for at least 120 kg, not from the top of a stepladder.', `${WHS('s 306M')}; ${MODEL('Managing the risk of falls', 's 9.1')}`),
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
        src('Where temporary edge protection must be opened to fit handrails or screens, it is opened only under the principal contractor\'s permit, one section at a time. Workers at the opening use travel restraint so they cannot reach the edge. No one uses a fall arrest harness while working alone. The edge protection is put back before the area is left.', `${WHS('s 306D, s 306G, s 306I')}; ${MODEL('Managing the risk of falls', 's 8.2')}`),
        src('Handle large screens in low wind, with lifting aids.', MODEL('Hazardous manual tasks', 's 4.8')),
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
        src('A competent person inspects faces, batters and support often, including after rain and changes in the water table, and repairs are made from above before work below continues.', MODEL('Excavation work', 's 6.6')),
        src('Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak. Where rock is drilled or broken with plant, control the silica dust (wet methods or extraction) and assess it in writing before starting.', WHS('s 56, s 57, s 529B, s 529C, s 529CA')),
        src('The emergency plan covers ground slip, flooding and rescue from the excavation.', MODEL('Excavation work', 's 3.7')),
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
        src('Props and walers are lifted with plant designed to lift them, never over people, and slung by a licensed dogger. An excavator is used to lift only where plant designed to lift is not reasonably practicable, and it creates no greater risk.', WHS('s 219, schedule 3')),
        'Anchor stressing and de-stressing are done by the anchor contractor to the engineer\'s procedure, with an exclusion zone around and behind the jack.',
        src('Anchor loads are checked with hydraulic jacks and pressure gauges.', MODEL('Excavation work', 's 6.2')),
        src('Anchors drilled under the street or neighbouring land are checked against the underground services information for those areas.', `${WHS('s 304')}; ${MODEL('Excavation work', 's 3.5')}`),
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
        src('Trench shields protect workers if a collapse happens, but do not support the ground: they are not loaded beyond their design, and are used to the manufacturer\'s instructions. Enter sheeted areas only by ladder.', MODEL('Excavation work', 's 6.2, s 6.4')),
        src('Barriers go up around a pit or trench as it is dug, before it is deeper than 2 m.', WHS('s 306D')),
        src('A competent person inspects the sides and support often, and after rain.', MODEL('Excavation work', 's 6.6')),
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
        src('If asbestos is found or suspected, stop and keep clear. A competent person identifies it, or it is assumed to be asbestos, and it is removed by a licensed asbestos removalist unless the regulation allows otherwise.', WHS('s 422, s 458')),
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
        src('Assess in writing before cutting whether the processing is high risk, without counting PPE or administrative controls, and without relying only on engineering controls such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until it is.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
        src('No engineered stone benchtops, panels or slabs are cut or installed. Ceramic and porcelain tiles and grout are not engineered stone.', WHS('s 529A, s 529D')),
        'No dry cutting without wet cutting or extraction, unless neither is reasonably practicable and that is recorded. Anyone still at risk while cutting wears a fit tested respirator.',
        src('Where it is uncertain whether dust is below the exposure standard, monitor the air and keep the results for 30 years. For high risk processing, results above the exposure standard are reported to the regulator within 14 days.', WHS('s 49, s 50, s 529CE')),
        src('Health monitoring for workers at significant risk from crystalline silica.', WHS('s 368, schedule 14')),
        src('Saw and grinder guards are in place and hard to bypass. Isolate the cutting area, wear a face shield, and replace worn blades and wheels.', `${WHS('s 208')}; ${MODEL('Managing the risks of plant in the workplace', 's 2.2, s 3.5')}`),
        src('Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak. Hearing protection is worn for the whole time of the noise. Workers who must wear it have hearing tests within 3 months and at least every 2 years.', `${WHS('s 56, s 57, s 58')}; ${MODEL('Managing noise and preventing hearing loss', 's 5.3, s 5.4')}`),
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
        src('The current safety data sheet for each product is at the work area before first use, and every container, including anything decanted, is labelled.', WHS('s 341, s 342, s 344')),
        src('Ventilate when using solvent sealers, especially in small bathrooms, and keep ignition sources away.', `${WHS('s 351, s 355')}; ${MODEL('Managing risks of hazardous chemicals', 's 4.1')}`),
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
        src('Use panel lifters or trolleys for heavy stone and large format tiles.', MODEL('Hazardous manual tasks', 's 4.5')),
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
        src('Edge protection stays in place: top rail at least 900 mm above the finished surface (the falls code suggests 900 mm to 1100 mm), no more than 450 mm between rails, and a toe board at least 150 mm high. Recheck the height after screeding and tiling raise the floor.', `${WHS('s 306D, s 306E')}; ${MODEL('Managing the risk of falls', 's 5.2')}`),
        src('Do not stack tiles or bags near edges, and secure offcuts against wind.', MODEL('Construction work', 'appendix K')),
        src('Stop objects falling freely, and do not work above other trades.', `${WHS('s 55')}; ${MODEL('Managing the risk of falls', 's 8.3')}`),
      ],
    }],
  },
  {
    when: 'steelLift',
    steps: [{
      step: 'Lift and land steel with the crane company',
      hazards: ['A steel member falls or swings into a person.', 'A badly slung load.'],
      controls: [
        { fact: 'craneCompany' },
        src('Structural steel erection is basic rigging work, which includes dogging. Slinging and directing loads out of the operator\'s view is dogging. Sight each licence before work.', WHS('s 81, s 85, schedule 3, schedule 19')),
        src('Lifting gear suits the load, lifts stay within the crane\'s limits, no loads over people, and the load stays under control with tag lines.', WHS('s 219')),
        src('Enclose the area under the lift and use a spotter at ground level.', MODEL('Construction work', 'appendix K')),
        src('Our SWMS and the crane company\'s are coordinated before lifts start.', MODEL('Construction work', 's 4.1')),
        src('Lifts over the street happen only where the principal contractor has closed the area or erected a gantry. Catch platforms or screens protect the street where work is above it.', WHS('s 315G, s 315L')),
        'Wind limits: the crane company\'s for the crane, and the EWP manufacturer\'s for any EWP.',
      ],
    }],
  },
  {
    when: 'steelErect',
    steps: [{
      step: 'Erect and connect steel at height',
      hazards: ['A fall while connecting.', 'The partly built structure collapses.', 'Tools and bolts fall onto people below.'],
      controls: [
        { fact: 'fallControl' },
        { fact: 'erectionSequence' },
        src('Follow the designer\'s erection sequence, and brace and secure members as they go up so the structure stays stable.', MODEL('Construction work', 'appendix D, appendix K')),
        src('Prevent falls first, with EWPs or edge protection. Fall arrest only where prevention is not practicable.', WHS('s 306D')),
        src('Where boom EWPs are used: the harness is attached to the EWP\'s anchor point, not the handrail, the EWP has a registered design, and booms of 11 m or more need a licensed operator.', `${MODEL('Managing the risk of falls', 's 5.1')}; ${WHS('schedule 3, schedule 5')}`),
        src('Harness anchors are rated at least 15 kN for one person with a free fall, there is enough clearance below, no one works alone on a harness, and the rescue plan is tested.', WHS('s 80, s 306I')),
        src('Tool lanyards, and catch platforms or nets. Safety nets and static lines are installed by licensed riggers or scaffolders.', `${MODEL('Construction work', 'appendix K')}; ${MODEL('Managing the risk of falls', 's 7.2')}`),
      ],
    }],
    ppe: ['harness', 'chinStrap'],
  },
  {
    when: 'steelWeld',
    steps: [{
      step: 'Bolt and weld steel',
      hazards: ['Welding fume, including zinc fume from galvanised steel.', 'Arc flash to people nearby.', 'Fire from sparks.', 'Electric shock.'],
      controls: [
        { fact: 'hotWorkPermit' },
        src('Identify coatings before welding, and keep fume below the exposure standard. Galvanised steel gives off zinc oxide fume.', `${WHS('s 49')}; ${MODEL('Welding processes', 's 3.1, appendix B')}`),
        src('Screens and signs protect people nearby from arc flash.', MODEL('Welding processes', 's 3.2')),
        src('Hot work permit, fire-resistant barriers, fire-fighting equipment at hand, cylinders secured, and flashback arrestors fitted.', MODEL('Welding processes', 's 3.4')),
        src('No welding from ladders, and no hot work above safety nets.', `${MODEL('Welding processes', 's 3.9')}; ${MODEL('Managing the risk of falls', 's 7.2')}`),
        src('Fully insulated electrode holders, dry welding gloves, and an RCD on the supply.', MODEL('Welding processes', 's 3.3')),
        src('Ventilation or local exhaust for welding fume, and hearing protection for grinding.', MODEL('Welding processes', 's 3.7, s 4.1')),
      ],
    }],
    ppe: ['gloveWelding', 'filterEye', 'longs'],
  },
  {
    when: 'masonryCut',
    steps: [{
      step: 'Cut blocks and bricks',
      hazards: ['Silica dust from cutting.', 'Noise.', 'Cuts and flying fragments.'],
      controls: [
        { fact: 'silicaControls' },
        src('Bricks and blocks are not engineered stone, but cutting them with power tools is processing crystalline silica and must be controlled: wet cutting or on-tool extraction, and respirators for anyone still at risk.', WHS('s 529A, s 529B, s 529C')),
        src('Assess in writing before cutting whether the processing is high risk, without counting PPE or administrative controls, and without relying only on engineering controls such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until it is.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
        src('Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak, reducing it at the source first. Workers who must wear hearing protection have hearing tests within 3 months and at least every 2 years.', `${WHS('s 56, s 57, s 58')}; ${MODEL('Managing noise and preventing hearing loss', 's 5.1, s 5.4')}`),
        src('Use a noise-reduced saw blade. Guard the blade, isolate the cutting area and wear a face shield.', `${MODEL('Construction work', 's 3.3')}; ${MODEL('Managing the risks of plant in the workplace', 's 2.3')}`),
      ],
    }],
    ppe: ['p2', 'earMuffs', 'faceShield'],
  },
  {
    when: 'masonryLay',
    steps: [{
      step: 'Lay blocks and bricks',
      hazards: ['Back strain from repetitive lifting of blocks.', 'A fall from a scaffold or trestle.', 'A new wall collapses before it cures.'],
      controls: [
        src('Crane or hoist blocks to the work face, and stage them between waist and shoulder height. Training in lifting technique is not the main control.', `${MODEL('Construction work', 's 3.3')}; ${MODEL('Hazardous manual tasks', 's 4.3, s 4.9')}`),
        src('Work from scaffold with brick guards where a fall of more than 2 m is possible, and do not overload bays (the code\'s example limit is 400 kg of blocks a bay). A scaffold over 4 m is used only after written handover, and inspected at least every 30 days.', `${WHS('s 225')}; ${MODEL('Construction work', 'appendix F')}`),
        src('Trestles at 2 m or more are secured, with edge protection, a platform at least 450 mm wide and no higher than 5 m. Use only purpose-made pins.', `${WHS('s 306N, s 306O')}; ${MODEL('Managing the risk of falls', 's 5.1')}`),
        src('Brace new walls until they are complete and cured.', MODEL('Construction work', 'appendix F')),
        src('Secure the scaffold, for example by removing access ladders, when leaving site.', MODEL('Construction work', 's 2.1')),
      ],
    }],
  },
  {
    when: 'masonryMortar',
    steps: [{
      step: 'Mix mortar',
      hazards: ['Cement burns and dermatitis.', 'Strain lifting bags.', 'Caught in the mixer.'],
      controls: [
        { fact: 'safetyDataSheet' },
        'Avoid skin contact with wet mortar: gloves, long sleeves and eye protection, and wash skin straight away.',
        src('Move bags with trolleys or mechanical aids rather than carrying them.', MODEL('Hazardous manual tasks', 's 2.2, s 4.5')),
        src('Mixer guards are in place, and the mixer is switched off and isolated before cleaning.', `${WHS('s 208')}; ${MODEL('Managing the risks of plant in the workplace', 's 3.6')}`),
      ],
    }],
    ppe: ['gloveChemical', 'goggles'],
  },
  {
    when: 'masonryGrout',
    steps: [{
      step: 'Mix mortar and core fill',
      hazards: ['Cement burns and dermatitis.', 'Strain lifting bags.', 'A concrete placing boom strikes a person.'],
      controls: [
        { fact: 'safetyDataSheet' },
        'Avoid skin contact with wet mortar and grout: gloves, long sleeves and eye protection, and wash skin straight away.',
        src('Move bags with mechanical aids rather than carrying them.', MODEL('Hazardous manual tasks', 's 2.2, s 4.5')),
        src('A concrete placing boom used for core filling has a registered design and is a registered item, with a licensed operator. Never stand under a working boom.', WHS('schedule 3, schedule 5')),
      ],
    }],
    ppe: ['gloveChemical', 'goggles'],
  },
  {
    when: 'masonryEdge',
    steps: [{
      step: 'Work near slab edges',
      hazards: ['A fall from the slab edge.', 'Blocks or tools fall onto people below.'],
      controls: [
        { fact: 'fallControl' },
        src('Edge protection: top rail at least 900 mm, toe board at least 150 mm, no more than 450 mm between rails. Openings covered with fixed covers.', WHS('s 306D, s 306E, s 306F')),
        src('No stacking near unmeshed edges. Perimeter screens and toe boards stop falling objects.', `${WHS('s 55')}; ${MODEL('Construction work', 'appendix K')}`),
        src('Sequence work so trades are not working directly above or below each other.', MODEL('Managing the risk of falls', 's 8.3')),
        src('Where edge protection must be opened to build at the edge, it is opened only under the principal contractor\'s permit, one section at a time, with travel restraint, and put back before the area is left.', `${WHS('s 306D, s 306G')}; ${MODEL('Managing the risk of falls', 's 8.2')}`),
      ],
    }],
  },
  {
    when: 'plasterSheets',
    steps: [{
      step: 'Move and fix plasterboard sheets',
      hazards: ['Back and shoulder strain from carrying and holding sheets.'],
      controls: [
        src('Use sheet lifters and suction pads or hooks, with training in each aid. Have sheets delivered to the floor where they are used.', MODEL('Hazardous manual tasks', 's 4.4, s 4.5, s 4.7')),
        src('Holding sheets in place while fixing is a hazardous posture: prop or support sheets rather than holding them.', MODEL('Hazardous manual tasks', 's 2.2')),
        src('Team lifts are an interim control only, with one person in charge. Training in lifting technique is not the main control.', MODEL('Hazardous manual tasks', 's 4.9')),
      ],
    }],
  },
  {
    when: 'plasterHeight',
    steps: [{
      step: 'Work at the upper wall and ceiling line',
      hazards: ['A fall from a mobile scaffold, step platform or ladder.', 'Working with arms overhead.'],
      controls: [
        src('Fall hazards under 2 m are identified, assessed and controlled before work starts. Platforms 2 m or higher have guardrails so a fall is prevented.', WHS('s 306C, s 306D')),
        src('Work from the floor or a platform where possible. Ladders only after scaffolds and EWPs are considered.', `${WHS('s 78, s 79')}; ${MODEL('Managing the risk of falls', 's 9')}`),
        src('Ladders are industrial and rated for at least 120 kg. Use step platforms rather than plain stepladders, never stand above the second tread below the top of a stepladder, and never use two-handed tools on a ladder.', `${WHS('s 306M')}; ${MODEL('Managing the risk of falls', 's 9.1')}`),
        src('Working with arms overhead is a hazardous posture: rotate tasks and take short breaks.', MODEL('Hazardous manual tasks', 's 2.2, s 4.9')),
      ],
    }],
  },
  {
    when: 'plasterCeiling',
    steps: [{
      step: 'Fix ceiling sheets',
      hazards: ['Strain holding ceiling sheets overhead.'],
      controls: [
        src('Use sheet lifters to hold ceiling sheets in place while fixing.', MODEL('Hazardous manual tasks', 's 2.2, s 4.5')),
      ],
    }],
  },
  {
    when: 'plasterSanding',
    steps: [{
      step: 'Cut, set and sand',
      hazards: ['Dust from sanding and cutting.', 'Silica dust where products contain crystalline silica.'],
      controls: [
        src('Keep dust below the exposure standard, and monitor the air if unsure. Check each product\'s safety data sheet: a product with 1% or more crystalline silica is a crystalline silica substance, and power sanding or cutting it is processing that must be controlled, with a written assessment before it starts.', WHS('s 49, s 50, s 529A, s 529C, s 529CA')),
        src('Sanders with dust extraction. Pre-mixed compounds instead of mixing powders.', MODEL('Managing risks of hazardous chemicals', 's 4.1')),
        src('Vacuum or wet clean, never dry sweep. Respirators where dust exposure remains.', `${MODEL('Managing risks of hazardous chemicals', 'appendix J')}; ${MODEL('Construction work', 'appendix K')}`),
      ],
    }],
    ppe: ['p2', 'glassesClear'],
  },
  {
    when: 'paintExternal',
    steps: [{
      step: 'Paint the outside of the building at height',
      hazards: ['A fall from the EWP.', 'Paint or tools fall onto people below.'],
      controls: [
        { fact: 'fallControl' },
        src('Prevent falls first.', WHS('s 306D')),
        src('In a boom EWP, the harness is attached to the EWP\'s anchor point, not the handrail. Boom EWPs of 11 m or more need a licensed operator. EWPs only on solid level ground and in suitable wind.', MODEL('Managing the risk of falls', 's 5.1')),
        src('No one uses a fall arrest harness while working alone.', WHS('s 306I')),
        src('Tool lanyards and lidded paint containers so nothing falls, then an exclusion zone below.', `${WHS('s 55')}; ${MODEL('Construction work', 'appendix K')}`),
        src('Sun protection: hat, long sleeves, sunglasses and SPF 30 or higher sunscreen.', MODEL('Construction work', 'appendix K')),
      ],
    }],
    ppe: ['harness', 'sunHat'],
  },
  {
    when: 'floorGrind',
    steps: [{
      step: 'Prepare and grind floors',
      hazards: ['Silica dust from grinding concrete.', 'Noise.'],
      controls: [
        { fact: 'silicaControls' },
        src('Grinding concrete is processing crystalline silica and must be controlled: wet suppression, on-tool extraction or local exhaust, and respirators for anyone still at risk.', WHS('s 529A, s 529B, s 529C')),
        src('Assess in writing before grinding whether the processing is high risk, without counting PPE or administrative controls, and without relying only on engineering controls such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until it is.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
        src('Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak, reducing it at the source first. Workers who must wear hearing protection have hearing tests within 3 months and at least every 2 years.', `${WHS('s 56, s 57, s 58')}; ${MODEL('Managing noise and preventing hearing loss', 's 5.1, s 5.4')}`),
        src('Inspect grinders and replace worn wheels.', MODEL('Managing the risks of plant in the workplace', 's 3.5')),
        src('Health monitoring for workers at significant risk from crystalline silica. For high risk processing, air monitoring results above the exposure standard are reported to the regulator within 14 days.', WHS('s 368, s 529CE, schedule 14')),
      ],
    }],
    ppe: ['p2', 'earMuffs'],
  },
  {
    when: 'floorAdhesive',
    steps: [{
      step: 'Apply flooring adhesives',
      hazards: ['Solvent vapour collecting at floor level.', 'Fire from flammable adhesive vapour.', 'Skin contact.'],
      controls: [
        { fact: 'safetyDataSheet' },
        src('The current safety data sheet is at the work area and the product is on the register.', WHS('s 344, s 346')),
        src('Use mechanical fixing, or less volatile and less flammable adhesives, where possible.', MODEL('Managing risks of hazardous chemicals', 's 4.1, appendix J')),
        src('Vapour heavier than air collects near the floor: ventilate, and keep ignition sources out.', `${WHS('s 355')}; ${MODEL('Managing risks of hazardous chemicals', 's 4.1')}`),
        src('Wear the gloves the safety data sheet lists, and contain spills.', `${WHS('s 357')}; ${MODEL('Managing risks of hazardous chemicals', 's 4.2')}`),
      ],
    }],
    ppe: ['gloveChemical'],
  },
  {
    when: 'floorLevel',
    steps: [{
      step: 'Apply primers and levelling compounds',
      hazards: ['Skin and eye burns from alkaline compounds.', 'Dust from mixing powders.'],
      controls: [
        { fact: 'safetyDataSheet' },
        src('The current safety data sheet is at the work area and the product is on the register.', WHS('s 344, s 346')),
        src('Cement-based compounds have a very high pH and are corrosive to skin and eyes: gloves, eye protection and long sleeves, and wash skin straight away.', MODEL('Managing risks of hazardous chemicals', 's 3.3')),
        src('Use pre-mixed products where possible, and mix powders with dust control.', MODEL('Managing risks of hazardous chemicals', 's 4.1')),
      ],
    }],
    ppe: ['gloveChemical', 'goggles'],
  },
  {
    when: 'timberFloor',
    steps: [{
      step: 'Cut and install timber floors',
      hazards: ['Cuts from saws.', 'Noise.', 'Timber dust.', 'Knee strain.'],
      controls: [
        src('Saw guards in place and hard to bypass, and tools inspected regularly.', `${WHS('s 208')}; ${MODEL('Managing the risks of plant in the workplace', 's 3.5, s 4.1')}`),
        src('Keep noise below 85 dB(A) over 8 hours. Hearing protection for cutting, with hearing tests for workers who must wear it.', WHS('s 56, s 57, s 58')),
        src('Dust from machining timber is hazardous: dust extraction on saws, and cut in a ventilated area.', MODEL('Managing risks of hazardous chemicals', 's 2.1, s 4.1')),
        src('Kneeling is a hazardous posture: rotate tasks, take short frequent breaks, and wear knee pads.', MODEL('Hazardous manual tasks', 's 2.2, s 4.9')),
      ],
    }],
    ppe: ['earPlugs', 'glassesClear'],
  },
  {
    when: 'floorLay',
    steps: [{
      step: 'Lay carpet and vinyl',
      hazards: ['Knee injury from kneeling and knee kickers.', 'Strain moving rolls.'],
      controls: [
        src('Kneeling to lay floor coverings is a hazardous posture: rotate tasks and take short frequent breaks. Replace hand tools with power tools to reduce force.', MODEL('Hazardous manual tasks', 's 2.2, s 3.3, s 4.1, s 4.9')),
        'Wear knee pads, and use a power stretcher instead of a knee kicker where possible.',
        src('Move rolls with trolleys or hand trucks, pushing rather than pulling, and order smaller loads or move large rolls mechanically.', MODEL('Hazardous manual tasks', 's 4.4, s 4.5')),
      ],
    }],
  },
  {
    when: 'balustradeEdge',
    steps: [{
      step: 'Install balustrades at balcony edges',
      hazards: ['A fall from the balcony edge while temporary edge protection is opened.', 'Glass, fixings or tools fall onto people below.'],
      controls: [
        { fact: 'fallControl' },
        src('Prevent falls first. Temporary edge protection is opened only at the panel being installed, under the principal contractor\'s permit, and put back before the area is left.', `${WHS('s 79, s 306D')}; ${MODEL('Managing the risk of falls', 's 8.2')}`),
        src('Workers at the opening use travel restraint, installed by a competent person and set so they cannot reach the edge, with users trained and the system inspected at least every 6 months.', `${WHS('s 306G')}; ${MODEL('Managing the risk of falls', 's 6.1')}`),
        src('Where fall arrest is used instead, anchors are engineer designed or approved by a competent person, no one works alone, and the rescue procedure is tested.', WHS('s 80, s 306I')),
        src('Exclusion zone below, and nothing left loose at the edge.', WHS('s 55')),
      ],
    }],
    ppe: ['harness'],
  },
  {
    when: 'glassHandle',
    steps: [{
      step: 'Handle and install glass panels',
      hazards: ['Back strain and crush from heavy panels.', 'Cuts from glass edges and broken glass.', 'Wind catches a panel.'],
      controls: [
        src('Use vacuum lifters, glass panel lifters, suction pads and trolleys, not hand carrying.', MODEL('Hazardous manual tasks', 's 4.4, s 4.5')),
        src('Team lifts are an interim control only, with one person in charge and the lift rehearsed.', MODEL('Hazardous manual tasks', 's 4.9')),
        src('Large panels are handled in low wind. Plant that lifts glass keeps it under control and within its limits.', `${WHS('s 219')}; ${MODEL('Hazardous manual tasks', 's 3.4, s 4.8')}`),
        'Cut resistant gloves and eye protection. Broken glass is cleaned up straight away and put in a marked container.',
      ],
    }],
    ppe: ['gloveCut', 'glassesClear'],
  },
  {
    when: 'glazingSeal',
    steps: [{
      step: 'Seal glazing',
      hazards: ['Skin sensitisation from sealants.'],
      controls: [
        { fact: 'safetyDataSheet' },
        src('The current safety data sheet is at the work area. Use mechanical fixing or less hazardous sealants where possible, and gloves resistant to the product.', `${WHS('s 344')}; ${MODEL('Managing risks of hazardous chemicals', 's 2.2, s 4.1')}`),
      ],
    }],
    ppe: ['gloveChemical'],
  },
  {
    when: 'stoneSilica',
    steps: [{
      step: 'Cut and finish stone and porcelain benchtops',
      hazards: ['Silica dust from cutting, drilling and polishing.', 'Noise.'],
      controls: [
        { fact: 'silicaControls' },
        src('No engineered stone benchtops, panels or slabs are supplied, installed or processed. Porcelain and sintered stone are not engineered stone.', WHS('s 529A, s 529D')),
        src('Natural stone and porcelain with 1% or more crystalline silica: cutting, drilling and polishing with power tools is processing that must be controlled, with wet methods or on-tool extraction, and respirators for anyone still at risk. Cut in the factory where possible.', WHS('s 529A, s 529B, s 529C')),
        src('Assess in writing before processing whether it is high risk, without counting PPE or administrative controls. Where it is high risk, a silica risk control plan applies and workers have crystalline silica training.', WHS('s 529CA, s 529CB, s 529CD')),
        src('Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak. Hearing protection worn for the whole time of the noise.', `${WHS('s 56, s 57, s 58')}; ${MODEL('Managing noise and preventing hearing loss', 's 5.3')}`),
      ],
    }],
    ppe: ['p2', 'earMuffs'],
  },
  {
    when: 'stoneHandle',
    steps: [{
      step: 'Move and set heavy benchtops',
      hazards: ['Back injury and crush from heavy stone.', 'A benchtop breaks or falls.'],
      controls: [
        src('Use lift trolleys, vacuum lifters or cranes. Where team lifts are regular, redesign the task to use mechanical aids. Training in lifting technique is not the main control.', MODEL('Hazardous manual tasks', 's 3.4, s 4.5, s 4.9')),
        src('Any team lift is matched to the load, rehearsed, and led by one person.', MODEL('Hazardous manual tasks', 's 4.9')),
        'Benchtops are carried on edge in an A-frame and supported along their length until fixed.',
      ],
    }],
  },
  {
    when: 'fireAtHeight',
    steps: [{
      step: 'Install sprinkler and hydrant pipework at height',
      hazards: ['A fall from an EWP, ladder or open riser.', 'Strain lifting pipe overhead.', 'Pipe or fittings fall onto people below.'],
      controls: [
        { fact: 'fallControl' },
        src('Prevent falls first. Use EWPs or scaffolds before ladders.', `${WHS('s 79, s 306D')}; ${MODEL('Managing the risk of falls', 's 9')}`),
        src('Ladders are industrial and rated for at least 120 kg. No two-handed tools such as stillsons on a ladder without extra fall protection. Keep 3 points of contact on single or extension ladders where a fall of 2 m or more is possible.', `${WHS('s 306L, s 306M')}; ${MODEL('Managing the risk of falls', 's 9, s 9.1')}`),
        src('In a boom EWP, the harness is attached to the EWP\'s anchor point. Booms of 11 m or more need a licensed operator. No one uses a fall arrest harness alone.', `${WHS('s 306I, schedule 3')}; ${MODEL('Managing the risk of falls', 's 5.1')}`),
        src('Risers are covered or screened, with only the section being worked on opened.', `${WHS('s 306F')}; ${MODEL('Managing the risk of falls', 's 4.2')}`),
        src('Use pipe lifters and mechanical aids. Team lifts are an interim control only.', MODEL('Hazardous manual tasks', 's 4.5, s 4.9')),
        'Before drilling into a post-tensioned slab, check the post-tensioning drawings, and scan and mark tendons, conduits and pipes. Never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval.',
      ],
    }],
  },
  {
    when: 'fireGrooving',
    steps: [{
      step: 'Roll groove, thread and cut pipe',
      hazards: ['Hands caught in the roll groover or threader.', 'Noise.', 'Ejected parts.'],
      controls: [
        src('Guards are fixed in place, control ejected parts, and the machine cannot restart until a removed guard is replaced. Controls lock off.', WHS('s 208, s 210')),
        src('Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak. Hearing protection is worn for the whole time of the noise, in signposted areas, with hearing tests.', `${WHS('s 56, s 57, s 58')}; ${MODEL('Managing noise and preventing hearing loss', 's 5.3')}`),
      ],
    }],
    ppe: ['earMuffs', 'glassesClear'],
  },
  {
    when: 'fireLive',
    steps: [{
      step: 'Work on live fire systems and in pump rooms',
      hazards: ['Water under pressure released.', 'Pumps start automatically.', 'The building is unprotected while the system is impaired.'],
      controls: [
        { fact: 'isolationProcedure' },
        src('Lock out pumps and isolate valves. Each worker fits their own padlock, a tag alone is not an isolation, and only the person who applied a lock or tag removes it.', MODEL('Managing the risks of plant in the workplace', 's 4.5')),
        src('Release stored pressure before breaking into pipework.', MODEL('Managing the risks of plant in the workplace', 's 4.5')),
        src('Warn everyone before pumps are restarted.', MODEL('Managing the risks of plant in the workplace', 's 3.6')),
        'Impairments are agreed with the principal contractor and the building\'s fire safety adviser, alternative protection is in place while the system is out of service, and the system is returned to service as soon as practicable.',
        src('The system is not commissioned until it is, so far as reasonably practicable, without risks, and tests are done by a competent person.', WHS('s 204, s 213')),
      ],
    }],
  },
  {
    when: 'liftShaft',
    steps: [{
      step: 'Work at open lift shafts and landing doors',
      hazards: ['A fall into the open lift shaft.', 'Objects fall onto people working below in the shaft.'],
      controls: [
        { fact: 'fallControl' },
        src('Shaft openings have barriers or fixed covers as soon as they are formed: covers carry a 2 kN point load, are fixed in place and signed DANGER HOLE BENEATH. Edge protection top rail at least 900 mm.', `${WHS('s 78, s 306E, s 306F')}; ${MODEL('Managing the risk of falls', 's 3.1, s 4.2')}`),
        src('Where harnesses are used in the shaft, anchors are rated at least 15 kN for one person, the lanyard is attached before moving to the edge, and a rescue procedure is set up.', WHS('s 80, s 306I')),
        src('Prevent objects falling first: tool lanyards, catch platforms or nets, and toe boards. Then exclusion zones and no go areas below.', `${WHS('s 55')}; ${MODEL('Construction work', 'appendix K')}; ${MODEL('Managing the risk of falls', 's 8.1')}`),
        src('Sequence work so no one works in the shaft below another trade.', MODEL('Managing the risk of falls', 's 8.3')),
      ],
    }],
    ppe: ['harness'],
  },
  {
    when: 'liftLifting',
    steps: [{
      step: 'Lift machines, rails and equipment into the shaft',
      hazards: ['A load falls in the shaft.', 'Lifting beam or gear failure.'],
      controls: [
        src('Lift with plant and lifting beams designed for the load, within their limits, never over people, and kept under control. Dual lifts only where each machine is designed to lift.', WHS('s 219')),
        src('Slinging and directing loads out of the operator\'s view is dogging, and setting up hoists is rigging. Sight each licence.', WHS('s 81, s 85, schedule 3')),
        src('Install with the manufacturer\'s jigs and tools, by competent people with the available information.', `${WHS('s 204')}; ${MODEL('Managing the risks of plant in the workplace', 's 3.2')}`),
      ],
    }],
  },
  {
    when: 'liftCar',
    steps: [{
      step: 'Work on the car top and in the pit',
      hazards: ['The car moves while someone is on it or in the pit.', 'Crush between the car and the shaft.', 'A poor atmosphere in the pit.'],
      controls: [
        { fact: 'plantIsolation' },
        src('Isolate power, stored energy and gravity before work. When the car must move, only the person doing the work can operate it.', `${WHS('s 210')}; ${MODEL('Managing the risks of plant in the workplace', 's 4.5')}`),
        src('The lift has a registered design and is a registered item, and is not commissioned until it is registered.', WHS('s 234, schedule 5')),
        src('The pit is assessed: if it meets the confined space definition, the confined space controls apply.', `${WHS('s 66')}; ${MODEL('Confined spaces', 's 1.1')}`),
      ],
    }],
  },
  {
    when: 'passiveFire',
    steps: [{
      step: 'Seal penetrations and fire stop',
      hazards: ['A fall through an open penetration or riser.', 'Fibres from batts and dust from cutting.', 'Skin contact with sealants and mastics.'],
      controls: [
        { fact: 'fallControl' },
        src('Penetrations keep their covers until they are sealed, and only the one being worked on is opened. Plywood alone is not preferred, and mesh needs a cover over it.', `${WHS('s 79, s 306F')}; ${MODEL('Managing the risk of falls', 's 4.2')}`),
        src('No stepladders beside an open penetration without extra fall protection.', MODEL('Managing the risk of falls', 's 9.1')),
        src('The current safety data sheet for each sealant, mastic and batt is at the work area, the products are on the register, and decanted products are labelled.', WHS('s 342, s 344, s 346')),
        src('Keep dust and fibres below the exposure standard, monitor where unsure, and wear respiratory protection where fibres remain.', `${WHS('s 49, s 50')}; ${MODEL('Construction work', 'appendix K')}`),
      ],
    }],
    ppe: ['p2', 'gloveChemical', 'longs'],
  },
  {
    when: 'siteEstablish',
    steps: [{
      step: 'Erect fencing, hoardings and gantries',
      hazards: ['The public is struck by falling objects.', 'Unauthorised entry to the site.', 'Hoardings or gantries collapse.'],
      controls: [
        src('The site is secured from unauthorised access.', WHS('s 298')),
        src('Where the measured angle to the hoarding line is 75 degrees or more, a fully sheeted hoarding at least 1,800 mm high and a gantry, closure or catch platform with screening.', WHS('s 315F, s 315G')),
        src('Gantries are engineer designed (10 kPa where heavier work is done above 10 m), stop water and dust, light the footpath to 50 lux, have edge sheeting at least 900 mm, and are designed for any shed or materials on them.', WHS('s 315K')),
        src('Footpath or road closures have written approval from the authority that controls the area.', WHS('s 315M')),
        src('Gantries and covered ways in tube and coupler are erected by licensed intermediate scaffolders.', WHS('schedule 3')),
        src('Temporary cables are kept off access routes, materials are stacked away from fences and hoardings, and emergency exits stay clear and lit.', MODEL('Construction work', 'appendix K')),
      ],
    }],
  },
  {
    when: 'sitePlant',
    steps: [{
      step: 'Separate plant and people on site',
      hazards: ['A person is struck by plant or a truck.'],
      controls: [
        src('Plant does not collide with people, and has a warning device where it could. Combine alarms with flashing lights.', `${WHS('s 215')}; ${MODEL('Managing the risks of plant in the workplace', 's 4.4')}`),
        src('Separate entries, or marked walkways with kerbs or barriers, clear vehicle paths and physical barriers.', `${MODEL('Construction work', 'appendix K')}; ${MODEL('Excavation work', 's 2.3')}`),
        src('Plan for blind spots, and use a spotter for crane lifts and reversing trucks.', `${MODEL('Excavation work', 's 4.3')}; ${MODEL('Construction work', 'appendix K')}`),
      ],
    }],
    ppe: ['hivisNight'],
  },
  {
    when: 'sawCut',
    steps: [{
      step: 'Saw cut concrete',
      hazards: ['Silica dust.', 'Cutting a post-tensioning tendon or live service.', 'Electric shock from wet cutting.', 'A cut section falls.', 'Noise.'],
      controls: [
        { fact: 'silicaControls' },
        src('Cutting concrete is processing a crystalline silica substance and must be controlled: wet cutting or on-tool extraction, and respirators for anyone still at risk.', WHS('s 529A, s 529B, s 529C')),
        src('Assess in writing before cutting whether the processing is high risk, without counting PPE or administrative controls, and without relying only on engineering controls such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until it is.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
        'Before cutting a post-tensioned slab, check the post-tensioning drawings, and scan and mark tendons, conduits and pipes. Never cut within a marked tendon zone without the structural engineer\'s written approval.',
        src('Services may be hidden in slabs and walls: scan and confirm before cutting. Use RCD protected equipment, and keep leads out of water.', `${MODEL('Construction work', 's 3.3, appendix K')}; ${WHS('s 291')}`),
        src('Cut sections are supported and lowered under control, with an exclusion zone below.', WHS('s 55')),
        src('Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak, with signposted hearing protector areas and hearing tests. No concrete saws on ladders.', `${WHS('s 56, s 57, s 58')}; ${MODEL('Managing noise and preventing hearing loss', 's 5.3')}; ${MODEL('Managing the risk of falls', 's 9.1')}`),
        'Contain slurry and dispose of it as the principal contractor directs.',
      ],
    }],
    ppe: ['p2', 'earMuffs', 'gumboots', 'faceShield'],
  },
  {
    when: 'landscape',
    steps: [{
      step: 'Move soil and mulch, and plant',
      hazards: ['Back strain from bags and soil.', 'Dust.', 'Heat.'],
      controls: [
        src('Buy smaller bags, or bulk loads moved by machine. Deliver by crane or hoist to the podium. Use mechanical aids, and rotate tasks.', MODEL('Hazardous manual tasks', 's 4.4, s 4.5, s 4.7, s 4.9')),
        src('Keep dust down with wet methods.', MODEL('Managing risks of hazardous chemicals', 's 4.1')),
        src('Cool drinking water, shade and rest breaks in hot weather.', MODEL('Construction work', 'appendix K')),
      ],
    }],
    ppe: ['sunHat', 'sunscreen', 'p2'],
  },
  {
    when: 'paving',
    steps: [{
      step: 'Lay and cut pavers',
      hazards: ['Silica dust from cutting pavers.', 'Noise.', 'Kneeling.'],
      controls: [
        { fact: 'silicaControls' },
        src('Pavers are not engineered stone, but cutting pavers with 1% or more crystalline silica is processing that must be controlled: wet cutting or on-tool extraction, and respirators for anyone still at risk. Assess in writing before cutting.', WHS('s 529A, s 529B, s 529C, s 529CA')),
        src('Manage saw noise, and use handling aids for pavers. Kneeling is a hazardous posture.', `${WHS('s 57')}; ${MODEL('Hazardous manual tasks', 's 2.2, s 4.4')}`),
      ],
    }],
    ppe: ['p2', 'earMuffs'],
  },
  {
    when: 'podiumEdge',
    steps: [{
      step: 'Work at podium edges and on the street',
      hazards: ['A fall from the podium edge.', 'Struck by traffic in street works.'],
      controls: [
        { fact: 'fallControl' },
        src('Edge protection at the podium edge: top rail at least 900 mm with a mid rail or infill, and no go areas below.', `${WHS('s 306D, s 306E')}; ${MODEL('Managing the risk of falls', 's 5.2, s 8.1')}`),
        src('Street works next to traffic are high risk construction work, and footpath closures need written approval.', WHS('s 291, s 315M')),
      ],
    }],
  },
  {
    when: 'cleaning',
    steps: [{
      step: 'Clean with chemicals',
      hazards: ['Chemical burns and fumes.', 'Reactions between cleaning products.'],
      controls: [
        { fact: 'safetyDataSheet' },
        src('Safety data sheets are at the work area, including for supermarket products used for work, and decanted containers are labelled. Never mix products.', `${WHS('s 341, s 344, s 351')}; ${MODEL('Managing risks of hazardous chemicals', 's 2.2, s 2.3')}`),
        src('Use diluted, ready-to-use products, keep lids closed, and contain spills.', `${WHS('s 357')}; ${MODEL('Managing risks of hazardous chemicals', 's 4.1')}`),
      ],
    }],
    ppe: ['gloveChemical', 'goggles'],
  },
  {
    when: 'cleaningHeight',
    steps: [{
      step: 'Clean windows and balconies',
      hazards: ['A fall from a balcony or from a ladder near an edge.', 'Items fall from balconies.'],
      controls: [
        src('Work from the floor with extendable tools. Balcony balustrades and opening barriers are in place before cleaning.', `${WHS('s 78')}; ${MODEL('Managing the risk of falls', 's 4.1, s 4.2')}`),
        src('No stepladders at balustrades or open edges. Ladders only for short light work.', MODEL('Managing the risk of falls', 's 9.1')),
        src('Nothing is left loose on balconies, with an exclusion zone below where items could fall.', WHS('s 55')),
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
    when: 'wpPrep',
    steps: [{
      step: 'Prepare surfaces by grinding',
      hazards: ['Silica dust from grinding concrete.', 'Noise.', 'Flying particles.'],
      controls: [
        { fact: 'silicaControls' },
        src('Grinding concrete is processing a crystalline silica substance and must be controlled: wet suppression, on-tool extraction or local exhaust, and respirators worn by anyone still at risk.', WHS('s 529B, s 529C')),
        src('Assess in writing before grinding whether the processing is high risk, without counting PPE or administrative controls, and without relying only on engineering controls such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until it is.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
        src('Where it is uncertain whether dust is below the exposure standard, monitor the air.', WHS('s 50')),
        src('Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak. Wear hearing protection near grinders.', `${WHS('s 56, s 57')}; ${MODEL('Construction work', 'appendix K')}`),
        src('Vacuum or wet clean dust, never dry sweep.', MODEL('Managing risks of hazardous chemicals', 's 4.1')),
      ],
    }],
    ppe: ['p2', 'earMuffs', 'glassesClear'],
  },
  {
    when: 'wpLiquid',
    steps: [{
      step: 'Apply primers and liquid membranes',
      hazards: ['Breathing vapour from primers and membranes.', 'Fire from flammable vapour where solvent-based products are used.', 'Skin and eye contact.', 'Knee strain from long periods kneeling.'],
      controls: [
        { fact: 'safetyDataSheet' },
        src('The current safety data sheet for each product is at the work area, the product is on the hazardous chemicals register, and anything decanted is labelled.', WHS('s 342, s 344, s 346')),
        src('Use a less hazardous product where possible, such as a water-based membrane instead of a solvent or two-part epoxy system.', MODEL('Construction work', 's 3.3')),
        src('Keep vapour below the exposure standard. Vapour heavier than air collects low down: extract from the lowest point and bring fresh air in from above.', `${WHS('s 49')}; ${MODEL('Managing risks of hazardous chemicals', 's 3.4, s 4.1')}`),
        src('No ignition sources where flammable vapour may be present. Keep only small quantities at the work area.', WHS('s 53, s 355')),
        src('Lids stay on except when pouring, and spills are contained and cleaned up straight away.', `${WHS('s 357')}; ${MODEL('Managing risks of hazardous chemicals', 's 4.2')}`),
        src('Wear gloves resistant to the product used, and no eating, drinking or smoking in the work area.', MODEL('Managing risks of hazardous chemicals', 's 4.1')),
        src('Where solvent-based products are used, fans and electrical equipment are designed for hazardous areas.', MODEL('Managing risks of hazardous chemicals', 's 4.2')),
        src('Long periods kneeling are a hazardous manual task: rotate tasks and use knee pads.', MODEL('Hazardous manual tasks', 's 2.2')),
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
        src('LPG cylinders are upright and secured, have a working relief valve, and valves are closed when not in use. Flashback arrestors are fitted, hoses have crimped or permanent clips, and fittings are leak tested with detergent or leak spray.', `${MODEL('Managing risks of hazardous chemicals', 's 4.2')}; ${MODEL('Welding processes', 's 3.4, s 3.6')}`),
        src('Gas heavier than air collects in pits and low areas. No torching in pits, sumps or enclosed spaces.', MODEL('Welding processes', 's 3.6')),
        src('Avoid contact with hot surfaces, wear heat resistant gloves, drink cool water and take regular rest breaks.', MODEL('Welding processes', 's 3.5')),
        'A fire watch stays after torching ends, for the time set in the principal contractor\'s hot work permit.',
      ],
    }],
    ppe: ['gloveWelding', 'longs'],
  },
  {
    when: 'wpEdge',
    steps: [{
      step: 'Work at edges',
      hazards: ['A fall from the edge.', 'Materials or tools fall or blow off the edge.'],
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
        src('Hoist loads stay within the rated load and under control, landing gates stay closed except while loading, and no one stands under a load being lifted.', `${WHS('s 219')}; ${MODEL('Managing the risk of falls', 's 4.2')}`),
        src('Long periods kneeling are a hazardous manual task: rotate tasks and use knee pads.', `${WHS('s 60')}; ${MODEL('Hazardous manual tasks', 's 2.2')}`),
      ],
    }],
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
        hazards: ['Breathing in paint vapour.'],
        controls: [
          { fact: 'safetyDataSheet' },
          src('The current safety data sheet is at the work area, the product is on the register, and containers are labelled. Use water-based paint instead of solvent-based paint where possible.', `${WHS('s 341, s 344, s 346')}; ${MODEL('Construction work', 's 3.3')}`),
          src('Ventilate as the label says: natural ventilation suits only small amounts of low toxicity products. Use fans or extraction otherwise.', MODEL('Managing risks of hazardous chemicals', 's 4.1, s 4.2')),
        ],
      },
      {
        step: 'Paint',
        hazards: ['Paint on the skin or in the eyes.', 'Trips over drop sheets and tins.'],
        controls: [
          src('Wear the gloves and eye protection the safety data sheet lists.', MODEL('Managing risks of hazardous chemicals', 's 4.1')),
          src('Painting is a repetitive task: rotate tasks.', MODEL('Hazardous manual tasks', 's 2.2')),
          'Keep only the paint needed in the work area, with lids on when not in use.',
        ],
      },
    ],
    ppe: ['gloveChemical'],
  },
  {
    when: 'paintAccess',
    steps: [{
      step: 'Reach high walls and ceilings',
      hazards: ['A fall from a ladder, trestle or step platform.'],
      controls: [
        'Use extension poles for walls and ceilings where possible.',
        src('Sanding between coats: vacuum or wet clean the dust, never dry sweep.', MODEL('Managing risks of hazardous chemicals', 's 4.1')),
        src('Fall hazards under 2 m are identified, assessed and controlled before work starts.', WHS('s 306C')),
        src('Ladders are industrial and rated for at least 120 kg. Use step platforms or trestles rather than stepladders.', `${WHS('s 306M')}; ${MODEL('Managing the risk of falls', 's 9.1')}`),
      ],
    }],
  },
  {
    when: 'paintSpray',
    steps: [{
      step: 'Spray paint with airless sprayers',
      hazards: ['Injection injury from the spray tip.', 'Breathing spray mist and vapour.', 'Fire or explosion from flammable vapour.'],
      controls: [
        { fact: 'safetyDataSheet' },
        src('Spraying makes a hazardous airborne concentration likely. Ventilate, and wear the respirator the safety data sheet lists, even with other controls in place. Two-pack isocyanate paints: full-face air-fed respirators.', MODEL('Managing risks of hazardous chemicals', 's 3.3, s 4.1')),
        src('No ignition sources where flammable vapour may be present. Earthed and intrinsically safe equipment, and static controlled.', `${WHS('s 355')}; ${MODEL('Managing risks of hazardous chemicals', 's 4.2')}`),
        'Never point the gun at anyone. Tip guard and trigger lock on, and release pressure before cleaning or changing tips. An injection injury is a medical emergency, even if it looks minor.',
        src('Heavier than air vapour collects in stairwells and the basement car park. An atmosphere above 5% of the lower explosive limit is a hazardous atmosphere: stop and ventilate.', `${WHS('s 51')}; ${MODEL('Managing risks of hazardous chemicals', 'appendix J')}`),
        src('Workers spraying two-pack isocyanate paints who are at significant risk have health monitoring.', WHS('s 368, schedule 14')),
      ],
    }],
    ppe: ['halfFace', 'coveralls', 'goggles'],
  },
  {
    when: 'paintSolvent',
    steps: [{
      step: 'Control solvent-based paint',
      hazards: ['Breathing solvent fumes.', 'Fire from flammable vapour and solvent-soaked rags.'],
      controls: [
        src('No smoking, flames or sparks where flammable vapour may be present.', WHS('s 355')),
        src('Where it is uncertain whether vapour is below the exposure standard, for example in stairwells and the basement, monitor the air.', WHS('s 49, s 50')),
        src('Painters exposed to solvents and noise together: noise is reduced to 80 dB(A) or below where practicable, as the noise code recommends for ototoxic substances, with hearing tests.', MODEL('Managing noise and preventing hearing loss', 'appendix B, s 5.4')),
        'Put solvent-soaked rags in a closed metal container or take them off site.',
      ],
    }],
  },
  {
    when: 'paintSwing',
    steps: [{
      step: 'Paint from a swing stage',
      hazards: ['A fall from the swing stage.'],
      controls: [
        src('Everyone on the swing stage wears a harness anchored to the stage, operators are trained, and installers hold an advanced rigging or scaffolding licence.', MODEL('Managing the risk of falls', 's 5.1')),
      ],
    }],
    ppe: ['harness'],
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
  let middle = found.length ? found.flatMap((activity) => activity.steps) : [fallback];
  // Work done inside a confined space happens before the permit is closed.
  const close = middle.filter((step) => step.step === 'Leave and close up');
  middle = [...middle.filter((step) => step.step !== 'Leave and close up'), ...close];
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
