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
// A Queensland code of practice section, checked against the Queensland code itself.
const QLD_CODE_TITLES = {
  ...Object.fromEntries(Object.entries(require('./scenarios/qld-codes.json')).map(([code, { title }]) => [code, title])),
  'Concrete pumping': 'Concrete pumping Code of Practice 2019 (Qld)',
  'Steel construction': 'Steel construction Code of Practice 2004 (Qld)',
  'Construction work': 'Model Code: Construction work',
  'Demolition': 'Demolition work Code of Practice 2021 (Qld)',
  'Silica': 'Managing respirable crystalline silica dust exposure in construction and manufacturing of construction elements Code of Practice 2022 (Qld)',
};
const QCODE = (code, section) => `${QLD_CODE_TITLES[code]} ${section}`;
const { localSource, localText } = require('./citations');

// Drilling, chasing or cutting concrete, masonry or stone is processing a crystalline
// silica substance. These lines go with any step that does it.
const SILICA_FOLLOW_UP = [
  src('Assess in writing before starting whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation.', WHS('s 529CA')),
  src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
  src('Dust and slurry are cleaned up at least at the end of each day or task, with an H class vacuum (M class only where H class is not reasonably practicable) or wet methods. No dry sweeping, compressed air or blowers, including for clothing.', QCODE('Silica', 's 7.4.2, s 8.1, s 8.2, s 8.3')),
];

const BEFORE = {
  step: 'Before starting',
  hazards: [
    'Work starts before everyone knows the risks and controls.',
    'People who are not involved walk into the work area.',
  ],
  controls: [
    'Workers have done the site induction, and this SWMS is explained to them before they sign it.',
    { text: 'Workers hold a general construction induction card (white card).', source: 'Work Health and Safety Regulation 2011 (Qld) s 317' },
    'Check that licences, tickets and permits needed for the task are current.',
    'Inspect tools, plant and equipment before use. Tag out and remove anything faulty.',
    'Set up barriers and signs around the work area.',
    'Workers know the site emergency plan, the first aid arrangements and how to raise the alarm.',
    { text: 'This SWMS takes into account the principal contractor\'s WHS management plan for the site.', source: 'Work Health and Safety Regulation 2011 (Qld) s 299' },
  ],
};

// Controls added to Before starting for some kinds of work.
const BEFORE_EXTRA = [
  { when: 'publicSite', text: 'The work area is fenced or screened off from children, students, patients, residents and the public, with the areas and times agreed with the site or facility manager.' },
  { when: 'nightWork', text: 'At night, work areas, stairs and access routes are lit for the work, shifts and breaks are planned to manage fatigue, and no one works alone.' },
  { when: 'ptSlab', unless: 'coreDrill', text: 'Check the post-tensioning drawings and scan the slab before drilling or fixing into a post-tensioned slab.' },
  { when: 'respirator', text: 'Tight-fitting respirators are fit tested to each wearer before use and at least once a year, for the make and model they wear. Wearers are clean shaven where the mask seals, and fit check the respirator each time they put it on.' },
  { when: 'electricalWork', text: src('Electrical work is done or supervised only by licensed electrical workers, for a licensed electrical contractor.', `${ESA('s 55, s 56')}`) },
  { when: 'electricalWork', text: src('Apprentices are supervised at all times by a licensed electrical worker. In their first 6 months they do not work where they could contact a live low voltage exposed part.', ESR('s 307')) },
  { when: 'electricalWork', text: src('Everyone who performs or helps in performing electrical work is competent in rescue and resuscitation.', ESR('s 211')) },
  { when: 'electricalWork', text: src('A serious electrical incident or dangerous electrical event is reported to the regulator immediately, and the site is left undisturbed.', ESR('s 292, s 296')) },
  { when: 'waterNetwork', text: 'Mains that will become part of the water utility\'s network are laid to the utility\'s standards and inspections, by a contractor the utility accepts for the work.' },
  { when: 'plumbingWork', unless: 'waterNetwork', text: src('Plumbing and drainage work is done by licensed workers, and supervised only by licensed workers. Trainees are directly supervised by a licensed person, who directs the work and ensures it complies.', PDA('s 56, s 57, s 58, s 59')) },
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
  { when: 'roof', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'sitePlant', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'formwork', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'medicalGas', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'leadShielding', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'liveHospital', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'helipad', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'pneumaticTube', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'generatorPlant', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'boilerPlant', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'earthworks', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'electricalWork', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'precastTier', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'seating', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'sportsLighting', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'temporaryTowers', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'dualLift', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'stripOut', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'deckBuild', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'houseFraming', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'fenceBuild', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'roofSpace', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'stoneWork', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
  { when: 'paving', text: src('Workers hold a general construction induction card (white card).', WHS('s 317')) },
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
        src('The principal contractor manages traffic near the site, or where there is no principal contractor, our supervisor puts the traffic management plan in place.', WHS('s 315')),
        'Traffic controllers who hold Queensland traffic controller accreditation direct vehicles, pedestrians and traffic on the footpath and road, as the traffic management plan sets out.',
        'Keep work, plant and materials inside the separated work area.',
        { text: 'Over or next to a railway, work goes ahead only under the rail operator\'s access permit and its protection officer arrangements.', only: 'railCorridor' },
        src('Footpath or road closures have written approval from the authority that controls the area.', WHS('s 315M')),
        'A physical barrier separates the work area from live traffic, and pedestrians are diverted on a safe, marked route.',
        src('Deliveries are unloaded inside the site or the closed work area, not from the live road, where practicable.', WHS('s 315')),
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
          src('Exclusion zone below with keep out signs and a person controlling it while erecting and dismantling.', `${WHS('s 55')}; ${QCODE('Managing the risk of falls', 's 8.1')}`),
          'Check the ground and set out base plates and sole boards to the scaffold design.',
          src('Within the powerline no go zone, work only under the electricity entity\'s permit to work. Keep electrical leads off the metal frame with plastic lead hooks or insulation.', MODEL('Managing the risk of falls', 's 5.1')),
        ],
      },
      {
        unless: 'scaffoldDismantleOnly',
        step: 'Erect the scaffold',
        hazards: ['Scaffolders fall from height.', 'Dropped components.', 'Manual handling strain.'],
        controls: [
          { fact: 'fallControl' },
          { fact: 'systemInstructions' },
          'A licensed scaffolder erects the scaffold to the manufacturer\'s or designer\'s instructions. Do not mix components from different systems.',
          src('Scaffolding work where a person or object could fall more than 4 m is done by a person holding a scaffolding high risk work licence, or a trainee under the direct supervision of a licensed scaffolder.', `${WHS('s 81, s 85, schedule 3')}; ${QCODE('Managing the risk of falls', 's 5.1')}`),
          src('Licence class: basic for modular scaffolds, intermediate for tube and coupler, gantries, perimeter screens and cantilevered crane loading platforms, advanced for hung and suspended scaffolds. Sight each licence before work.', WHS('s 85, schedule 3')),
          src('Where prefabricated (modular) scaffold is used, it has a registered design, and components are not mixed unless the manufacturer approves.', `${WHS('schedule 5')}; ${MODEL('Managing the risk of falls', 's 5.1')}`),
        src('Where harnesses are used, anchors are engineer designed or approved by a competent person, no one works alone, and a rescue procedure is set up and tested.', WHS('s 80, s 306I')),
          src('At each lift, a platform at least 450 mm wide, edge protection and access are installed before the next lift, with a platform not more than 2 m below, unless the scaffolder is otherwise protected from falling.', WHS('s 306P')),
          'Install ties as the scaffold goes up.',
          'Pass components hand to hand or use a gin wheel. Do not throw them.',
          src('Team lifts are an interim control only, with one person in charge.', MODEL('Hazardous manual tasks', 's 4.9')),
        ],
      },
      {
        unless: 'scaffoldDismantleOnly',
        step: 'Inspect and hand over',
        hazards: ['People use an incomplete or unsafe scaffold.'],
        controls: [
          src('A scaffold from which a person or thing could fall more than 4 m is not used until a competent person gives written confirmation it is complete. It is inspected before use, after any incident or repair, and at least every 30 days.', WHS('s 225')),
          'The scaffold is tagged once it is inspected.',
          src('Incomplete sections are tagged as not to be used and access is blocked.', `${WHS('s 225')}; ${QCODE('Managing the risk of falls', 's 5.1, s 8.2')}`),
          src('Users are told the safe working load, never to use an incomplete or defective scaffold, to report defects straight away, and not to alter it. Only licensed scaffolders alter it.', MODEL('Managing the risk of falls', 's 5.1')),
          src('Edge protection, with a top rail, mid rail and toe board, at every open edge of a work platform: top rail at least 900 mm.', `${WHS('s 306E')}; ${QCODE('Managing the risk of falls', 's 5.1, s 5.2')}`),
          src('No more than 450 mm between rails, toe board at least 150 mm.', WHS('s 306E')),
        ],
      },
      {
        step: 'Dismantle the scaffold',
        hazards: ['Scaffolders fall as edge protection is removed.', 'Components fall onto people below.'],
        controls: [
          src('Edge protection and access stay in place as long as practicable, with a platform not more than 2 m below the scaffolder.', WHS('s 306Q')),
          src('Exclusion zone below, with keep out signs and a person controlling it.', `${WHS('s 55')}; ${QCODE('Managing the risk of falls', 's 8.1')}`),
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
      hazards: ['The mobile scaffold rolls or tips.', 'A fall from the platform or access.'],
      controls: [
        src('Workers are trained in using the scaffold. The scaffold stays level and plumb, castors are locked before anyone gets on, it is never moved with anyone on it, and it is accessed by its internal ladder.', MODEL('Managing the risk of falls', 's 5.1')),
        src('Keep it well clear of open floor edges and penetrations, and of powerlines outdoors.', MODEL('Managing the risk of falls', 's 5.1')),
        src('Prefabricated towers have a registered design and components are not mixed. Users are told the safe working load.', `${WHS('schedule 5')}; ${MODEL('Managing the risk of falls', 's 5.1')}`),
        src('Where a person or thing could fall more than 4 m from it, it is erected by a licensed scaffolder, handed over in writing by a competent person, and inspected at least every 30 days.', WHS('s 81, s 225, schedule 3')),
        { only: 'mobileScaffoldErect', text: 'It is erected and dismantled to the manufacturer\'s instructions by workers trained in that system, with the base set level and castors locked first, and each platform\'s guardrails fitted from the level below before anyone stands on it.' },
        { only: 'mobileScaffoldErect', text: 'Components are passed up and down by hand line or from person to person within the tower, not thrown, with the area below barricaded.' },
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
        src('Landing gates are fitted at each new level.', `${WHS('s 204')}; ${QCODE('Managing the risk of falls', 's 4.2')}`),
        'After each climb, the hoist is inspected and tested before it is used again.',
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
        src('Landing gates prevent falls.', QCODE('Managing the risk of falls', 's 4.2')),
        'Landing gates stay closed except when the car is at the landing.',
        src('Controls are guarded against unintended activation and can be locked off. Emergency stops are red.', WHS('s 210, s 211')),
        src('Maintained and inspected by a competent person to the manufacturer\'s recommendations.', WHS('s 213')),
        src('An up-to-date register of inspections and maintenance is kept.', MODEL('Managing the risks of plant in the workplace', 's 3.5')),
        src('Used only as designed, and no unauthorised changes.', WHS('s 205, s 206')),
      ],
    }],
  },
  {
    when: 'roof',
    // A roofer's own access step covers getting onto the roof.
    replaces: ['roofAccess'],
    steps: [
      {
        step: 'Set up roof access and fall protection',
        hazards: ['Falling from the roof edge or through openings.', 'Falling through fragile sheets or skylights.'],
        controls: [
          { fact: 'fallControl' },
          'Fall protection is installed and checked before anyone goes onto the roof.',
          'Safety mesh is run out from the protected edge, and installers work only over bays already meshed or from the edge protection. No one walks on unmeshed purlins.',
          src('Roof edge protection is erected to the manufacturer\'s instructions: top rail at least 900 mm above the surface, a toe board at least 150 mm high or a bottom rail 150 mm to 250 mm above the surface, and no more than 450 mm between rails, or between the lowest rail and the toe board. On slopes over 26 degrees, mesh or sheeting to 900 mm.', WHS('s 306E')),
          src('Skylights, fibreglass, brittle sheets, membrane panels and any other surface a person could fall through are covered with fixed covers that take a fall, or fenced off. Where safety mesh is used, it does not protect edges or holes, so it is used with edge protection.', `${WHS('s 78, s 306F')}; ${MODEL('Managing the risk of falls', 's 3.1, s 5.3')}`),
          src('Travel restraint may not be practicable on fragile roofing or slopes over 15 degrees, where fall arrest may be more appropriate. Where fall arrest is used near edges, swing down is controlled with guard rails or mobile anchors.', QCODE('Managing the risk of falls', 's 6.1, s 7.3')),
          'Travel restraint is not used on fragile roofing or slopes over 15 degrees.',
          src('Where fall arrest is used, anchors are tested and approved by a competent person before first use and meet the anchor strength in AS/NZS 1891.4, there is enough clearance below that the user cannot hit the ground or another surface, no one uses it alone, at least one other person on site can rescue them, and the rescue procedure is tested.', `${WHS('s 80, s 306I')}; ${QCODE('Managing the risk of falls', 's 7.3, s 10.1')}`),
          src('Anchors are rated for at least 15 kN for one person who could free fall (12 kN where only a limited free fall is possible, 21 kN for two people).', WHS('s 306I')),
          'Access by a scaffold stair, or a ladder secured top and bottom that extends above the landing.',
        ],
      },
      {
        step: 'Lift materials to and from the roof',
        hazards: ['Falling objects strike people below.', 'Manual handling strain.', 'Wind catches sheets.'],
        controls: [
          'Exclusion zone below the work, with barriers and signs.',
          src('Where a crane is used, lifts are coordinated with the crane company\'s SWMS. Loads stay under control, within limits, and never over people.', `${WHS('s 219')}; ${QCODE('Managing the risks of plant in the workplace', 's 1.3, s 3.3')}`),
          'Use mechanical lifting where possible. Team lift long sheets. Materials are lifted to the roof by crane, hoist or materials lift, never carried up a ladder.',
          src('Handle sheets in low wind.', QCODE('Hazardous manual tasks', 's 4.6')),
          src('Secure sheets and offcuts stacked on the roof against wind, and do not stack them near unprotected edges or over unmeshed areas.', WHS('s 54, s 55')),
          'Agree before work starts the wind speed at which sheet handling stops, check the forecast and the wind on the roof each day, and stop when it is reached.',
        ],
      },
      {
        step: 'Fix new roofing',
        hazards: ['Fall from height.', 'Slipping on wet or dewy roof sheets.', 'Power tool injuries.', 'Noise from cutting.', 'Skin and eye irritation from insulation, where it is installed.', 'Cuts from sheet edges and offcuts.', 'Heat and sun exposure.'],
        controls: [
          'Stay inside the edge protection at all times.',
          'Use tools with guards in place. Keep leads away from edges.',
          'Roof sheets are slippery when wet, dewy or dusty. Do not walk or work on them in those conditions.',
          'Wear cut resistant gloves when handling sheets, flashings and offcuts.',
          { text: 'Where insulation and sarking are installed, handle them with long sleeves and gloves. Wear a P2 respirator where cutting releases fibres or dust.', unless: 'insulation' },
          'Before flashing around flues, exhausts or plant on the roof, the trade that owns the plant isolates it, so hot exhaust or moving parts cannot reach the roofer.',
          'Touch-up paint is used as its safety data sheet says.',
          src('Hearing protection near grinders and cutting. Eye protection with power tools. Tool lanyards and toe boards so nothing falls.', `${WHS('s 56, s 57, s 44, s 55')}; ${QCODE('Managing noise and preventing hearing loss', 's 5.3')}`),
          src('Minimise work at height in extreme heat.', QCODE('Managing the risk of falls', 's 8.3')),
          src('Cool drinking water, shade, rest breaks and work at cooler times. Sun protection: hat or brim, long sleeves and pants, sunglasses and SPF 30 or higher sunscreen.', QCODE('Hazardous manual tasks', 's 4.6')),
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
        'On the old roof sheeting, walk only on the sheets over the purlin lines, or on safety mesh. No one stands on bare purlins.',
        { unless: 'asbestosRoof', text: 'Old roof sheets on a building built before 2004 (asbestos products were used until the national ban at the end of 2003) are checked for asbestos cement before they are disturbed.' },
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
          src('Get the current underground services information from the principal contractor and service plans, for example through Before You Dig Australia, locate services on site before digging, and work to it.', WHS('s 304')),
          src('Pothole with water pressure and a vacuum system to confirm where services are, as plans may not be accurate.', MODEL('Excavation work', 's 3.5')),
          'Within the clearance zone the asset owner sets, dig by hand or vacuum only, and support and protect exposed services as the owner requires.',
        ],
      },
      {
        step: 'Excavate',
        hazards: ['The excavator strikes a person.', 'The ground collapses.'],
        controls: [
          { fact: 'trenchSupport' },
          { only: 'deepTrench', ...src('A trench 1.5 m deep or more has all sides supported by shoring, benching or battering, unless a geotechnical engineer has advised in writing, for a stated period, that the sides are safe from collapse.', WHS('s 306')) },
          { only: 'deepTrench', ...src('A trench 1.5 m deep or more is secured from unauthorised and inadvertent entry.', WHS('s 306')) },
          'Open trenches are barricaded.',
          'Exclusion zone around the excavator, with a spotter when people are nearby.',
          { unless: 'indoorDig', text: 'Check for overhead power lines before plant starts. Plant stays outside the approach distances for the line, with a spotter where it could come close.' },
          src('Two-way acknowledged communication between plant operators and ground workers.', MODEL('Excavation work', 's 4.3')),
          src('Keep spoil, materials, plant and traffic out of the trench\'s zone of influence unless the support is designed for those loads.', MODEL('Excavation work', 's 4.1')),
          src('Dewater with pumps where groundwater or water inrush is possible.', MODEL('Excavation work', 'chapter 4 table')),
          src('Plant with a combustion engine, such as a compressor or generator, is never used in the trench while workers are in it. Where engine exhaust could collect, ventilate and monitor for carbon monoxide.', MODEL('Excavation work', 's 4.6')),
        ],
      },
      {
        step: 'Work in the trench',
        hazards: ['Trench collapse buries a worker.', 'Falling into the trench.', 'Water or bad air in the trench.'],
        controls: [
          { only: 'deepTrench', text: 'No one enters the trench until the support is in place and checked.' },
          { only: 'deepTrench', ...src('Work only inside the trench support, with the access ladder secured to it.', QCODE('Excavation work', 's 4.4, s 6.3')) },
          { unless: 'deepTrench', ...src('Before anyone enters, check the depth. A trench at least 1.5 m deep is shored, benched or battered first, and work in or near a trench deeper than 1.5 m is high risk construction work: stop and have this SWMS reviewed.', WHS('s 291, s 306')) },
          { fact: 'fallControl' },
          src('A competent person checks the trench walls and support at the start of each shift and frequently, including after rain. Any damage is repaired from above before work below continues.', QCODE('Excavation work', 's 6.7')),
          src('Check the air with a gas monitor before entry, with a safety observer at the surface.', MODEL('Excavation work', 's 4.6')),
          src('The emergency plan covers ground slip, flooding, gas leaks and rescue from the trench.', MODEL('Excavation work', 's 3.7')),
        ],
      },
      {
        step: 'Lay pipes, pits and conduits',
        hazards: ['A suspended pipe or pit strikes or crushes a person.', 'Hands crushed between the load and the trench wall.', 'Strain lifting pipe lengths.'],
        controls: [
          'Where pipes, pits or conduit bundles are lifted with the excavator, this is done only where it has a rated lifting point, the load is within its lifting chart, and the operator is competent to lift with it.',
          'No one is in the trench under a suspended load. Guide loads with tag lines from outside the trench until they are near the bottom.',
          'Keep hands clear between the load and the trench wall when lowering.',
          'Team lift or use mechanical aids for pipe lengths, conduit bundles and small pits.',
        ],
      },
      {
        step: 'Backfill and restore',
        hazards: ['Plant strikes a person.', 'An open trench is left unprotected.', 'Noise and vibration from compaction plant.', 'A roller overturns at a trench edge or slope.'],
        controls: [
          { only: 'deepTrench', text: 'Remove the support as backfilling proceeds, as designed.' },
          'Cover or barricade any open trench overnight.',
          'Where spoil is carted by truck or loader, haul routes are kept apart from people, reversing and tipping are guided by a spotter, and plant stops back from the tip edge.',
          src('Where concrete or paving is cut to reinstate it, it is cut wet or with on-tool extraction, anyone still at risk wears a fit tested P2 respirator, and the written silica assessment covers the cutting.', `${WHS('s 529B, s 529C, s 529CA')}; ${QCODE('Silica', 's 7.4.1, s 7.4.2, s 7.6.1, s 7.6.2')}`),
          'Plate compactors and rollers are used with guards in place. Ride-on rollers have rollover protection, the seatbelt is worn, and they stay back from trench edges and steep slopes.',
          'Rotate compactor operators to limit hand-arm and whole-body vibration, and wear hearing protection.',
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
        hazards: ['Falling debris.', 'Striking live cables or pipes in the part being demolished.', { only: 'masonryDemo', text: 'Silica dust from cutting or breaking masonry or concrete.' }, 'Noise.'],
        controls: [
          'Services in or behind the part being demolished are found and isolated by the licensed trades before it is cut or pulled down.',
          'Exclusion zone around the demolition.',
          { only: 'masonryDemo', text: 'Use water suppression or on-tool dust extraction when cutting or breaking masonry or concrete.' },
          'Remove debris as the work goes.',
        ],
      },
      {
        step: 'Complete the permanent structure and remove props',
        hazards: ['Collapse when props are removed too early.'],
        controls: [{ text: 'Props are removed only when the engineer confirms the permanent structure is complete.', only: 'propping' }],
      },
    ],
    ppe: ['p2', 'earMuffs'],
  },
  {
    // Cranes supplied and operated by a crane company: the crews' part is working with them.
    when: 'craneInterface',
    steps: [
      {
        step: 'Work with the crane crew during lifts',
        hazards: ['A person is struck or crushed by a load.', 'A badly prepared load falls apart in the air.', 'Miscommunication with the crane crew.'],
        controls: [
          'The crane company plans and does the lifts under its own lift plan. Its licensed crew slings, directs and releases loads.',
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
          'Each loading platform is inspected before use and signed with its rated load.',
          'Perimeter edge protection stays in place, and our crew does not remove or alter it.',
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
    // New formwork is backpropped in its own step; the general temporary support step is for alterations.
    replaces: ['propping'],
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
          'Exclusion zone below and around falsework being erected. Components are passed up, not thrown, and secured against falling.',
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
        hazards: ['A person falls from an open edge of the deck or through gaps in it.', 'Materials fall from the edge.', 'Cuts, dust and noise from power saws.', 'Manual handling: carrying and placing ply sheets, often in wind.'],
        controls: [
          { fact: 'fallControl' },
          'Ply sheets are carried by two people or with sheet lifters, and sheet handling stops when wind lifts the sheets.',
          'Edge protection and handrails to parapets are installed from inside the deck, from a working platform, or fixed to the formwork before it is lifted into place. No one works outside them while installing them.',
          src('Where objects could fall on people outside the site, the principal contractor closes the adjoining area or erects perimeter containment screening before formwork is erected or dismantled.', WHS('s 315H, s 315I')),
          src('Where the deck slopes more than 26 degrees, mesh or sheeting extends at least 900 mm up the edge protection.', WHS('s 306E')),
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
        step: 'During the pour',
        hazards: ['Formwork or falsework fails under the wet concrete.', 'A person under the loaded deck is struck if it fails.'],
        controls: [
          'No one is under the deck or inside the falsework while it carries wet concrete, and the area below is barricaded and signed.',
          'A competent formwork watcher stays in a safe position outside that zone for the whole pour and can stop it at once. Adjustments are made only from outside the zone, and only as the formwork design allows.',
          'The stop-pour signal is agreed with the pump operator and the concreting crew before the pour starts.',
        ],
      },
      {
        step: 'Strip formwork and backprop',
        hazards: ['The slab or falsework collapses.', 'Falling formwork strikes a person.', 'Manual handling: lowering ply and beams from overhead.'],
        controls: [
          'Strip only when the engineer confirms the concrete strength, in the order in the formwork design. For a post-tensioned slab, strip only after stressing is complete and the post-tensioning engineer releases the slab.',
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
          src('The placing boom operator holds a high risk work licence for a concrete placing boom.', WHS('s 81, schedule 3')),
          src('Only the line hand and the pour crew work under the boom. All other workers stay out from under it.', QCODE('Concrete pumping', 's 4.3.4')),
          'Keep people clear of the end hose at start-up. Clear blockages only after the pressure is released.',
          src('Start the pump slowly. No metal fittings on the free end of the delivery hose, the hose is never stretched to reach, and no more hose hangs from the boom than the manufacturer allows.', QCODE('Concrete pumping', 's 4.1.4')),
          src('Keep the hopper topped up so air is not drawn in. Where air is in the line, keep people out of an exclusion zone, and purge into a bin before moving the boom over the pour.', QCODE('Concrete pumping', 's 4.1.4, s 4.3.2')),
          src('When opening a coupling, stand to one side, never straddle the line, and never try to restrain the hose. Blockages are not cleared with compressed air. Lines are cleaned with water rather than air, and the pump operator stays at the controls while the line is under pressure.', QCODE('Concrete pumping', 's 4.3.5, s 4.3.6')),
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
        unless: 'groundSlab',
        step: 'Lift reo onto the deck',
        hazards: ['Dropped bundles.', 'Overloading the formwork with stacked bundles, causing collapse.'],
        controls: [
          'Bundles are slung by the crane crew with rated slings or chains, never by the tie wire.',
          { fact: 'loadLimits' },
          { text: 'Land bundles on the deck over the bearers, spread out within the formwork\'s allowable load. Do not stack bundles in one place.', unless: 'groundSlab' },
        ],
      },
      {
        step: 'Place and tie reo',
        hazards: ['Impalement on exposed bars.', 'Trips on bars and chairs.', 'Cuts and back strain.', 'Cuts, sparks and noise from cutting bars.', 'A wall cage topples, or a fall while fixing wall reo.', 'A person falls from the edge.'],
        controls: [
          { only: 'groundSlab', text: 'Where bundles are lifted in by crane, they are slung by the crane crew with rated slings or chains, never by the tie wire, and landed on bearers clear of the excavation edge.' },
          'Cap or cover exposed starter bars and ends of bars.',
          'Keep penetration covers in place. Fence any opening before a cover is lifted to pass bars through.',
          'Lay walkways over the reo where people need to cross it.',
          'Team lift long or heavy bars, and rotate tying tasks.',
          'Cut and trim bars with a bar cutter, or with a grinder or cut-off saw with its guards in place. Wear eye and hearing protection, and keep sparks away from combustible materials and other workers.',
          src('Footings, thickenings and pits are entered by a secured ladder, with water pumped out and a barrier at the edge. Check the depth first: work in or near one deeper than 1.5 m is high risk construction work this SWMS does not cover, so stop, have the SWMS reviewed, and do not enter until its sides are shored, benched or battered and checked.', WHS('s 291, s 302')),
          'Where walls, lift shafts or stairwells are reinforced, fix the reo from working platforms or scaffolds, never by climbing the cage, and brace tall wall cages so they cannot topple.',
          'Work inside the edge protection at all times.',
          'Where our crew stays on the deck during the pour, they keep clear of the pump hose end and placing boom, follow the formwork watcher\'s stop signal, and do not go under the deck. Avoid skin contact with wet concrete: wear gumboots and chemical resistant gloves, and wash concrete off skin straight away.',
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
        hazards: ['The boom contacts overhead power lines.', 'The pump or boom overturns.', 'The boom strikes a person or structure.', 'The boom or pipeline fails, or concrete falls from the boom, onto a person below.'],
        controls: [
          'A truck-mounted pump stands on ground that can take the outrigger loads, with pads under the outriggers.',
          src('Each outrigger is loaded one at a time, and its pad enlarged if it starts to sink. Outriggers are set back from an excavation by at least its depth, or twice its depth in loose or backfilled ground. Short legging only where the manufacturer allows.', QCODE('Concrete pumping', 's 4.2.2')),
          'Check for overhead power lines before setting up. Keep the boom outside the approach distances, with a spotter where it could come close.',
          src('Every part of the boom and drop hose stays at least 3 m from overhead power lines up to 132 kV, and the boom is not worked over energised lines. De-energising or re-routing the lines is considered first.', QCODE('Concrete pumping', 's 4.2.3')),
          src('The boom is not set up or worked over access ways or site sheds unless a 10 kPa gantry protects them. The pumping area is signed, and only authorised people enter it.', QCODE('Concrete pumping', 's 4.2.1')),
          src('The boom is not worked in winds above the manufacturer\'s limit, checked at boom height.', QCODE('Concrete pumping', 's 4.3.3')),
          src('Drop hoses and reducers at the boom tip have safety slings, so they cannot fall if a clamp fails.', QCODE('Concrete pumping', 's 4.3.4')),
          'Where a separate placing boom is set up on the slab, it stands on an engineer-certified base or ballast.',
          'The pipeline is restrained, pressure-rated, and checked for wear and secure clamps before each pour.',
          src('Concrete placing booms are registered items of plant. Check the registration before use.', WHS('schedule 5')),
          src('The placing boom operator holds a high risk work licence for a concrete placing boom.', WHS('s 81, schedule 3')),
          'Keep the boom within its rated reach. Where a crane works on site, keep clear of its working area, as coordinated with the crane crew.',
          src('Only the line hand and the pour crew work under the boom. All other workers stay out from under it.', QCODE('Concrete pumping', 's 4.3.4')),
        ],
      },
      {
        step: 'Pump and place concrete',
        hazards: ['Hose whip at start-up or when a blockage clears.', 'A burst line.', 'A person falls from the edge or through the deck.', 'A reversing concrete truck strikes a person.', 'Electric shock and vibration from vibrators.', 'Exhaust fumes from generators.', 'Eye injury when blowing out decks with compressed air.'],
        controls: [
          'Check pipes, clamps and the end hose before pumping.',
          'Keep people clear of the end hose at start-up. Clear blockages only after the pressure is released.',
          src('Start the pump slowly. No metal fittings on the free end of the delivery hose, the hose is never stretched to reach, and no more hose hangs from the boom than the manufacturer allows.', QCODE('Concrete pumping', 's 4.1.4')),
          src('Keep the hopper topped up so air is not drawn in. Where air is in the line, keep people out of an exclusion zone, and purge into a bin before moving the boom over the pour.', QCODE('Concrete pumping', 's 4.1.4, s 4.3.2')),
          src('When opening a coupling, stand to one side, never straddle the line, and never try to restrain the hose. Blockages are not cleared with compressed air. Lines are cleaned with water rather than air, and the pump operator stays at the controls while the line is under pressure.', QCODE('Concrete pumping', 's 4.3.5, s 4.3.6')),
          'Stay inside the edge protection.',
          'Place concrete evenly. Do not heap it on the deck beyond what the formwork design allows.',
          'Workers reach the deck only by a stair tower, scaffold stair or secured ladder. Hoses, screeds and tools are lifted up, not carried up ladders, and hose runs and walkways over the reo are kept clear and boarded.',
          { text: 'The pour starts only once the formwork and props have been inspected and signed off by a competent person, and penetrations and voids are covered and fixed.', unless: 'formwork' },
          { text: 'A competent formwork watcher checks the formwork during the pour and can stop the pour.', unless: 'formwork' },
          'On a slab on ground, concrete trucks stand back from excavation edges, and people keep clear of the chute while it is swung or extended.',
          { text: 'No one works under the deck being poured except the formwork watcher in a safe position, and the area below is barricaded and signed.', unless: 'formwork' },
          'The hose hand stays in contact with the operator by radio or agreed signals.',
          'Concrete trucks reverse only with a spotter, into a marked area kept clear of people.',
          'Vibrators have their leads checked and tagged and are protected by an RCD. Rotate operators to limit hand-arm vibration.',
          'Generators, petrol trowels and petrol saws run only outdoors or where exhaust cannot collect, and are refuelled only when stopped and cool.',
          'Vacuum decks first. Compressed air is used only for loose debris the vacuum cannot reach, never on concrete dust or slurry, with eye protection and a P2 respirator, and others kept clear.',
        ],
      },
      {
        step: 'Finish concrete',
        hazards: ['Cement burns to the skin and eyes.', 'Power trowel injuries.', 'Back strain.', 'Chemicals in curing compounds.', 'Silica dust from grinding and patching concrete.', 'Noise from vibrators, trowels, pumps and generators.', 'Silica dust and noise from saw cutting joints.'],
        controls: [
          'Wash wet concrete off the skin straight away. Wear gloves and eye protection.',
          'Use power trowels with guards and a working stop switch.',
          'Rotate finishing tasks and take breaks.',
          'Curing compounds are used as their safety data sheet says, with gloves and eye protection.',
          src('Where concrete is ground or patched, it is done with on-tool extraction or wet methods, and a fit tested P2 respirator is worn where dust remains.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.1, s 7.4.2, s 7.6.1, s 7.6.2')}`),
          src('Where control joints are saw cut, or concrete is cut or drilled, it is done wet or with on-tool extraction. This is processing a crystalline silica substance. Anyone still at risk of exposure wears a fit tested P2 respirator.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 5.1, s 7.4.1, s 7.4.2, s 7.6.1, s 7.6.2')}`),
          'Concrete saws have their blade guards in place, and electric saws used wet are protected by an RCD, with leads kept out of water.',
          ...SILICA_FOLLOW_UP,
          src('Where it is uncertain whether dust is below the exposure standard, monitor the air.', WHS('s 50')),
          src('Health monitoring is provided for workers at significant risk from crystalline silica.', `${WHS('s 368, schedule 14')}; ${QCODE('Silica', 's 10, s 10.1')}`),
          src('Wear hearing protection near concrete saws, vibrators, power trowels, pumps and generators. Workers who must wear it have hearing tests within 3 months of starting and at least every 2 years.', WHS('s 57, s 58')),
          'Where soffits and walls are patched after stripping, it is done from a mobile scaffold with its castors locked, or a platform ladder, not from a stepladder.',
          'Penetration covers stay fixed in place, and hoses and screeds are not dragged over them in a way that could dislodge them.',
        ],
      },
    ],
    ppe: ['gloveChemical', 'chinStrap', 'earPlugs', 'gumboots', 'goggles'],
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
      hazards: ['The platform overturns or falls from an edge.', 'The operator is crushed against the structure.'],
      controls: [
        'Check the slab, working platform or ground can take the platform, and keep it back from edges, penetrations and open excavations.',
        src('Use the platform only on a solid level surface, unless it is designed for rough terrain.', QCODE('Managing the risk of falls', 's 5.1')),
        'Sequence trades so they are not working above or below each other.',
        'Outdoors, stop in winds above the manufacturer\'s limit, and check for overhead power lines, keeping the platform outside the approach distances.',
        src('The operator is trained for the platform. A high risk work licence is needed only for a boom-type platform with a boom of 11 m or more.', WHS('s 81, schedule 3')),
        'Where a boom-type platform is used, the harness is attached to the platform\'s anchor point.',
        src('Check for crushing points such as soffits, beams, steelwork and services before raising or moving the platform. Operators are trained in safe work procedures to avoid crushing.', MODEL('Managing the risk of falls', 's 5.1')),
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
        hazards: ['Electric shock from damaged leads or equipment.', 'Leads damaged by plant, water or concrete.', 'Trips over leads.', 'A fall while installing lighting at height.'],
        controls: [
          { fact: 'constructionTesting' },
          src('All construction wiring and electrical equipment complies with AS/NZS 3012.', ESR('s 140, s 192')),
          src('Construction wiring, switchboards and RCDs carry a test tag only if new, or inspected and tested by a competent person and found to comply with AS/NZS 3012, with the retest date and the tester shown.', ESR('s 140(3)-(4)')),
          src('Run leads where they will not be damaged, or protect them. Keep them off the ground on lead stands or insulated hangers, and away from doorways and sharp edges.', `${ESR('s 18')}; ${CODE('s 3')}`),
          src('Circuits have RCD protection as AS/NZS 3012 requires.', ESR('s 140')),
          'Temporary lighting at height is installed from a non-conductive platform ladder or a mobile scaffold, not from a stepladder near an open edge.',
          src('A faulty RCD is disconnected or isolated at once, and is not used again until it is repaired or tested as safe.', ESR('s 17')),
          'If an RCD trips, the circuit stays off until a competent person finds the cause.',
        ],
      },
      {
        step: 'Inspect, test and maintain construction power',
        hazards: ['Unsafe equipment stays in use.'],
        controls: [
          src('Unsafe equipment is disconnected, labelled unsafe, and not reconnected until it is repaired or tested and found safe.', `${ESR('s 17')}; ${CODE('s 3.1')}`),
          src('Hired electrical equipment is inspected, tested and tagged by a competent person at least once every 6 months. Reject it if the tag is missing or out of date.', ESR('s 142')),
          src('Find faults with de-energised testing methods first. Any energised testing is done only under the controls for work on or near energised parts.', CODE('s 7.5')),
          'As the work moves, relocate switchboards and leads de-energised, and tell the principal contractor of changes to the construction wiring.',
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
        src('Extension ladders used for electrical work are no longer than 9.2 m.', WHS('s 306M')),
        'Ladders are used for access, and work is done from the platforms set out in the fall controls.',
        'Risers and shafts are screened or covered at each level. Only the section being worked on is opened, and it is fenced.',
        src('Restrain tools with lanyards or holders when working near switchboards or above others.', QCODE('Managing electrical risks', 's 7.1')),
        src('Where an exposed energised part is within 3 m, de-energise it or fit covers, and use a safety observer where needed.', `${ESR('s 193')}; ${QCODE('Managing electrical risks', 's 6.1, s 7.2')}`),
        'Before anchoring supports into a slab, scan and mark reinforcement, conduits and pipes. In a post-tensioned slab, check the post-tensioning drawings, and never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval. Other detected services are isolated and confirmed before drilling near them.',
        'Exclusion zone below open risers and work areas for dropped objects.',
        src('Drill anchors with on-tool dust extraction. Anyone still at risk of exposure wears a fit tested respirator (P2 or better).', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2, s 7.6.1, s 7.6.2')}`),
        ...SILICA_FOLLOW_UP,
        'In enclosed areas, use battery or electric plant where practical. Otherwise ventilate, and monitor for exhaust fumes.',
        'Fire rated sealants and mastics for penetrations are used as their safety data sheets set out, with good ventilation and gloves resistant to the product.',
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
        'Move drums with a forklift, crane or drum trailer. Forklifts are driven by a forklift licence holder, and crane loads are slung by a licensed dogger. Chock them, and pay out from a drum stand with a spindle.',
        'Use a winch with guards and a stop control. Keep people out of the line of pull and away from pulling points.',
        'Manual handling: team pull, rotate tasks, and keep cable bends and pulling points within reach without twisting.',
        src('Treat existing cables as energised until proved de-energised. Check both ends for isolation before cutting, and use a cable spiking device where it is fit for purpose.', `${ESR('s 196(2)')}; ${CODE('s 5.3')}`),
        src('Run the leads for winches and tools where they will not be damaged, or protect them.', ESR('s 18')),
        src('Helpers without an electrical licence assist only under the direct supervision of a licensed electrical worker, and do not touch energised equipment.', ESA('s 18(2)(g)')),
        'In risers, use cable grips and anti-runback brakes, keep radio contact between levels, and keep an exclusion zone below.',
      ],
    }],
    ppe: ['gloveGeneral'],
  },
  {
    when: 'fitOff',
    steps: [{
      step: 'Rough-in and fit-off',
      hazards: ['Contact with live cables when drilling or chasing.', { only: 'chasing', text: 'Silica dust from chasing or drilling concrete or blockwork.' }, { only: 'chasing', text: 'Noise from chasing and drilling.' }, { unless: 'noRoofSpace', text: 'Work in ceiling spaces.' }, 'A fall from a ladder or platform.', 'Swarf entering switchboards and enclosures.'],
      controls: [
        { ...src('Work in a roof space (between the roof and the top floor ceiling) only when the electrical installation is de-energised. If that is not reasonably practicable, a risk assessment is done, the risks are as low as reasonably practicable, and the work follows a written statement of the controls.', ESR('s 31, s 33, s 34')), only: 'roofSpaceRule', unless: 'noRoofSpace' },
        { text: 'Before work in a roof space, the electrical installation is de-energised where practicable. If it cannot be, cables are treated as energised and the controls are set out in this SWMS.', unless: 'roofSpaceRule', only: 'roofSpaceWork' },
        { only: 'multiLevel', ...src('In ceiling spaces between floors, treat cables as energised until they are proved de-energised.', ESR('s 196(2)')) },
        src('Check for cables before drilling or chasing.', CODE('appendix C')),
        { only: 'chasing', text: 'Before drilling into a slab, scan and mark reinforcement, conduits and pipes. In a post-tensioned slab, check the post-tensioning drawings, and never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval. Other detected services are isolated and confirmed before drilling near them.' },
        { only: 'chasing', ...src('Chase and drill with water suppression or on-tool dust extraction. Anyone still at risk of exposure wears a fit tested respirator (P2 or better).', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.1, s 7.4.2, s 7.6.1, s 7.6.2')}`) },
        { only: 'chasing', ...src('Hearing protection where noise exceeds the exposure standard. Workers who must wear it have hearing tests within 3 months of starting and at least every 2 years.', WHS('s 57, s 58')) },
        ...SILICA_FOLLOW_UP.map((item) => ({ only: 'chasing', ...(typeof item === 'string' ? { text: item } : item) })),
        'Use platform ladders or a working platform, not the top steps of a stepladder.',
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
          { unless: 'noCTCheck', ...src('When cutting multi-core control cables, check for current transformer secondary circuits first.', CODE('s 5.3')) },
        ],
      },
      {
        step: 'Work on or near energised parts',
        hazards: ['Electric shock and arc flash from exposed energised parts within 3 m.'],
        controls: [{
          choice: 'energisedWork',
          options: {
            none: [
              src('No electrical work is done on or near energised parts (within 3 m of an exposed energised part). Parts of the installation that stay energised, such as construction power, are identified, and the work is kept separated from them. If that changes, stop and prepare for energised work as the regulation requires.', ESR('s 193, s 195')),
            ],
            testing: [
              src('Work on or near energised parts is done only where the regulation allows, such as testing, and never because it is more convenient.', `${ESR('s 195')}; ${CODE('s 7.1')}`),
              src('Before the work: a competent person\'s recorded risk assessment, this SWMS, clear access and exit, the isolation point labelled and quick to operate, and authorisation after consulting the principal contractor.', ESR('s 199, s 200')),
              src('Only authorised people enter the area, and barriers prevent contact with exposed energised parts.', ESR('s 201, s 202')),
              src('A safety observer, assessed in the last 12 months as competent in rescue and resuscitation, watches the work and does no other work.', `${ESR('s 203, schedule 10')}; ${CODE('s 7.3')}`),
              src('Tools, test equipment and PPE are suitable for the work, properly tested and in good working order.', ESR('s 203')),
              src('PPE rated for the energy at the point of work, such as an arc-rated face shield, insulated gloves and flame-resistant clothing.', CODE('s 9.5')),
              src('No watches, jewellery or other metal personal items. Fire extinguishers suitable for electrical fires are at hand.', QCODE('Managing electrical risks', 's 6.3, appendix C')),
              src('Energised work is authorised by: ____________ (position), after the principal contractor\'s ____________ (position) has been consulted.', `${ESR('s 199(1)(e)')}; ${QCODE('Managing electrical risks', 's 6.2, s 6.3')}`),
              'The principal contractor\'s ____________ (position) signs the permit.',
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
        only: 'boardDelivery',
        step: 'Deliver and place switchboards',
        hazards: ['A switchboard tips or falls during delivery or placement.', 'Crushing and back strain moving heavy boards.'],
        controls: [
          'Move boards on skates, trolleys or jacks, on a planned route within the slab\'s load limits. A crane or forklift is used only by a licensed operator, inside an exclusion zone.',
          'Keep people clear of the load, and secure each board as soon as it is placed.',
          'Manual handling: no manual lifting of heavy boards; use skates, jacks and team handling for final positioning.',
        ],
      },
      {
        step: 'Test, connect and commission',
        hazards: ['New work energised before it is safe.', 'People exposed while equipment is energised for testing.'],
        controls: [
          'Cable jointing resins are used as their safety data sheets set out, with chemical resistant gloves. Gas torches for heat shrink are used with an extinguisher nearby and flammables cleared.',
          { text: 'Before the main switchboard is first energised, do an arc flash (incident energy) assessment of it, so PPE is rated for the energy at the point of work.', only: 'mainSwitchboard' },
          src('Test new work so it is electrically safe before it is connected, and keep people not needed for testing safe while it is energised.', ESR('s 207')),
          { ...src('The consumer mains and main switchboard are not connected for the first time until the distribution entity has examined them, confirmed there are no serious defects and tested them.', ESR('s 217, s 218')), only: 'mainSwitchboard' },
          src('The electrical contractor connects only when satisfied the Act and regulation have been complied with.', ESR('s 223')),
          src('After later work, an installation is reconnected only if the work was done by a licensed person and tested as electrically safe and compliant with the wiring rules.', ESR('s 219')),
          src('Give the distribution entity the notice of test, and issue the certificate of testing and safety.', ESR('s 208, s 228')),
          src('Where we connect the installation, issue the certificate of testing and compliance.', ESR('s 229')),
          { unless: 'houseWork', ...src('Any high voltage electrical installation is not connected until an accredited auditor has inspected and certified it.', ESR('s 221')) },
          { text: 'Once the main switchboard is energised, the switchroom is locked with access controlled, and live and dead status boards are kept up to date.', only: 'mainSwitchboard' },
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
      hazards: ['Sewer gases such as hydrogen sulphide.', 'Infection from sewage.', 'Entry into a manhole or sewer, a confined space.', { only: 'road', text: 'Traffic at the connection in the street.' }],
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
        src('Cover or barricade every penetration as soon as it is formed. Covers withstand a fall onto them, are fixed in place so they cannot be moved by accident, and are marked as covering a hole.', `${WHS('s 306D, s 306F')}; ${QCODE('Managing the risk of falls', 's 4.2')}`),
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
          { only: 'groundCut', ...src('Get the current underground services information before drilling into the ground slab or footpath, and work to it.', WHS('s 304')) },
          'Each core hole has the structural engineer\'s written approval before drilling. Scan and mark reinforcement, conduits and pipes. In a post-tensioned slab, check the post-tensioning drawings, and never drill within a marked tendon zone: move the hole. Other detected services are isolated and confirmed before drilling near them.',
          'Keep leads off wet floors and protect them with RCDs. Contain water and slurry.',
        ],
      },
      {
        step: 'Core drill through the slab or wall',
        hazards: ['Silica dust from drilling concrete.', 'Noise and vibration.', { unless: 'groundCut', text: 'The core falls to the floor below.' }, { unless: 'groundCut', text: 'A person falls through the hole.' }],
        controls: [
          { fact: 'silicaControls' },
          src('Drilling concrete is processing a crystalline silica substance. It is controlled by wet drilling, on-tool extraction or local exhaust.', `${WHS('s 529A, s 529B, s 529C')}; ${QCODE('Silica', 's 5.1, s 7.4.1, s 7.4.2')}`),
          src('Anyone still at risk of exposure after these controls wears a fit tested respirator (P2 or better).', `${WHS('s 529B')}; ${QCODE('Silica', 's 7.4.1, s 7.4.2, s 7.6.1, s 7.6.2')}`),
          src('Assess in writing before starting whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation.', WHS('s 529CA')),
          src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
          src('Air monitoring is done where it is not certain the exposure standard is met, and results are kept for 30 years. For high risk processing, results over the exposure standard go to the regulator within 14 days. Workers with a significant risk from ongoing exposure have health monitoring supervised by a registered medical practitioner.', `${WHS('s 50, s 368, s 371, s 529CE, schedule 14')}; ${QCODE('Silica', 's 9.1, s 9.4, s 10.1, s 10.2')}`),
          { unless: 'groundCut', ...src('Barricade and sign the area below, so a falling core cannot hit anyone.', WHS('s 55')) },
          src('Cover or barricade the hole as soon as it is cut. Covers are strong enough to take anyone who could fall onto them, securely fixed so they cannot be moved or removed by accident, and marked as covering a hole.', `${WHS('s 306F')}; ${MODEL('Managing the risk of falls', 's 4.2')}`),
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
          src('Single or extension ladders are used for access, with 3 points of contact, or for permitted work only: nothing carried that restricts movement or balance, the body centred between the stiles, and tools used with one hand. Where a person could fall 2 m or more (3 m in housing construction), the worker keeps 3 limbs on the ladder or uses a pole strap or a harness not attached to the ladder, and the ladder is secured at the top or bottom. Ladders are industrial and rated for at least 120 kg.', WHS('s 306A, s 306K, s 306L, s 306M')),
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
        src('Extract or ventilate fumes so no one is exposed above the exposure standard.', `${WHS('s 49')}; ${QCODE('Welding processes', 's 3.1, s 4.1')}`),
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
        'Ventilate the area, especially in enclosed areas such as ducts, risers, basements, plant rooms and bathrooms. Lids on when not in use.',
        src('Contain spills, and clean them up straight away.', WHS('s 357')),
        'Fire rated sealants and mastics for penetrations are used as their safety data sheets set out, with good ventilation and gloves resistant to the product.',
      ],
    }],
    ppe: ['gloveChemical'],
  },
  {
    when: 'plumbingFitOff',
    steps: [{
      step: 'Plumbing rough-in and fit-off',
      hazards: ['Back strain carrying and fitting fixtures and pipe.', { unless: 'fixtureSwap', text: 'Silica dust from chasing or drilling.' }, 'A fall from a ladder.', { only: 'fixtureSwap', text: 'Sewage, and cuts from broken porcelain, when removing the old fixture.' }],
      controls: [
        src('Use trolleys and lifting aids for heavy items. Plan team lifts with one person in charge. Training alone is not the control.', `${WHS('s 60')}; ${QCODE('Hazardous manual tasks', 's 4.1, s 4.4, s 4.7')}`),
        { unless: 'fixtureSwap', ...src('Chase and drill with water or on-tool extraction. Anyone still at risk of exposure after these controls wears a fit tested respirator (P2 or better).', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.1, s 7.4.2, s 7.6.1, s 7.6.2')}`) },
        { unless: 'fixtureSwap', ...src('Assess in writing before chasing whether the processing is high risk, without counting PPE or administrative controls, and without relying only on the dust controls used for the processing. If it is, prepare a silica risk control plan and give it to workers before they start, and workers have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CA, s 529CB, s 529CC, s 529CD')) },
        { unless: 'fixtureSwap', ...src('Health monitoring is provided for workers at significant risk from crystalline silica.', `${WHS('s 368, schedule 14')}; ${QCODE('Silica', 's 10, s 10.1')}`) },
        { unless: 'fixtureSwap', text: 'Before chasing or drilling a wall, check for live circuits and services in it. If chasing near energised circuits, have them isolated first, or stop and have this SWMS reviewed, as work near energised electrical installations is high risk construction work.' },
        { unless: 'fixtureSwap', ...src('No stepladder beside an open penetration or unprotected edge without extra fall protection.', MODEL('Managing the risk of falls', 's 9.1')) },
        { unless: 'fixtureSwap', text: 'Before drilling into a slab, scan and mark reinforcement, conduits and pipes. In a post-tensioned slab, check the post-tensioning drawings, and never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval. Other detected services are isolated and confirmed before drilling near them.' },
        { unless: 'fixtureSwap', ...src('Use platform ladders. Ladders are industrial and rated for at least 120 kg.', WHS('s 306M')) },
        { only: 'fixtureSwap', text: 'The old fixture is isolated and drained, broken porcelain is handled with cut resistant gloves, and gloves and hand washing protect against sewage.' },
        { only: 'appliancePower', unless: 'kitchenEquipment', text: 'The power connection is electrical work for a licensed electrician, with the circuit isolated and proved de-energised first.' },
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
          src('Forklifts are kept apart from people, with a warning device. A forklift left unattended is parked level, with the brake on and the key removed.', `${WHS('s 215, s 218')}; ${QCODE('Managing the risks of plant in the workplace', 's 2.3.1, s 3.8, s 4.4')}`),
          'Forklifts carry no passengers.',
          src('Leave an access way around plant for maintenance (about 600 mm is suggested).', MODEL('Managing the risks of plant in the workplace', 's 3.2')),
        ],
      },
      {
        step: 'Fix plant on its supports',
        hazards: ['Plant tips or drops while it is being fixed.', 'Strain lifting plant onto frames or brackets.', { unless: 'roofPlant', text: 'Silica dust from drilling anchors into concrete or masonry.' }],
        controls: [
          'Plant is fixed to its plinths, frames or brackets as the designer or manufacturer specifies before the lifting gear, skates or props are taken away.',
          'Units stacked one above another sit on a frame or rack designed for their combined weight, fixed before the next unit goes on.',
          'Plant is lifted onto frames and brackets with mechanical aids, not by hand.',
          { unless: 'roofPlant', ...src('Drill anchors with on-tool extraction, and wear a fit tested P2 respirator.', WHS('s 529B, s 529C')) },
          ...SILICA_FOLLOW_UP.map((item) => ({ unless: 'roofPlant', ...(typeof item === 'string' ? { text: item } : item) })),
          { unless: 'roofPlant', text: 'Electrical, refrigerant and pipe connections are made by the licensed trades after the plant is fixed.' },
        ],
      },
    ],
  },
  {
    when: 'ductwork',
    steps: [
      {
        step: 'Install ductwork, pipework and units at height',
        hazards: [{ only: 'multiLevel', text: 'A fall from a platform, ladder or open riser.' }, { unless: 'multiLevel', text: 'A fall from a platform or ladder.' }, 'Tools, fixings and duct sections fall onto people below.', 'Silica dust from drilling hanger anchors.', 'Cutting a post-tensioning tendon when drilling.', 'Cuts from duct edges and strain from lifting duct overhead.'],
        controls: [
          { fact: 'fallControl' },
          src('Work from the floor or a platform where possible. Fall prevention comes before work positioning or fall arrest.', WHS('s 78, s 79')),
          { only: 'multiLevel', ...src('Risers and shafts are covered or screened at each level. Covers are strong enough to take anyone who could fall onto them, securely fixed so they cannot be moved or removed by accident, and marked as covering a hole.', `${WHS('s 306F')}; ${QCODE('Managing the risk of falls', 's 4.2')}`) },
          'Only the section being worked on is opened.',
          src('Ladders are industrial and rated for at least 120 kg.', WHS('s 306M')),
          src('When working from a ladder, keep two feet and one other point of contact with it, and use a tool belt.', MODEL('Managing the risk of falls', 's 9.1')),
          src('Barricade and sign the area below.', `${WHS('s 55')}; ${QCODE('Managing the risk of falls', 's 8.1')}`),
          'Stop tools and materials falling.',
          src('Sequence the work so trades are not working above or below each other at the same time.', MODEL('Managing the risk of falls', 's 8.3')),
          'Before drilling into a slab, scan and mark reinforcement, conduits and pipes. In a post-tensioned slab, check the post-tensioning drawings, and never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval. Other detected services are isolated and confirmed before drilling near them.',
          src('Drill anchors with on-tool extraction, and wear a fit tested P2 respirator.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2, s 7.6.1, s 7.6.2')}`),
          src('Assess in writing before drilling whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until that is determined.', WHS('s 529CA')),
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
        { only: 'acUnit', text: 'Refrigerant pipework is connected, pressure tested and charged only by the holder of a refrigerant handling licence, and the power connection is made by a licensed electrician.' },
        { fact: 'fallControl' },
        src('Edge protection or travel restraint where a fall of 2 m or more (3 m in housing construction) is possible, before work starts.', WHS('s 306D')),
        { unless: 'roofAccess', ...src('Edge protection has a top rail at least 900 mm above the roof, a toe board or bottom rail, and no more than 450 mm between rails.', WHS('s 306E')) },
        src('Harness anchors are engineer designed or approved by a competent person, rated at least 12 kN for one person with a limited free fall, 15 kN for one person with a free fall, or 21 kN for two. Energy absorbers limit the arrest force to 6 kN, there is enough clearance below to stop a fall before it hits anything, and no one uses a harness system alone.', WHS('s 306I')),
        src('Where fall arrest is used, a rescue plan is set and practised.', WHS('s 80')),
        src('Check the wind, rain and heat before roof work, and stop in unsafe conditions.', MODEL('Managing the risk of falls', 's 3.2')),
        src('Tether tools, and secure materials and packaging at the edge, so nothing can fall to the street.', WHS('s 55')),
        { unless: 'houseWork', text: 'Before drilling fixings into a roof slab, scan and mark reinforcement, conduits and pipes. In a post-tensioned slab, check the post-tensioning drawings, and never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval.' },
        src('Drill with on-tool extraction. Anyone still at risk of exposure wears a fit tested respirator (P2 or better).', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2, s 7.6.1, s 7.6.2')}`),
        src('Assess in writing before drilling whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until that is determined.', WHS('s 529CA')),
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
          src('No entry into ducts or plenums under this SWMS unless a competent person has assessed the space as not a confined space. If it is a confined space, stop: it is entered only under a confined space entry permit, after a competent person\'s risk assessment recorded in writing, with signs at the entry, a standby person and connected plant isolated.', `${WHS('s 66, s 67, s 68, s 69, s 70')}; ${QCODE('Confined spaces', 's 1.1, s 3.4, s 4.3, s 4.4, s 4.6, s 4.8')}`),
          'A confined space is entered only under a separate SWMS.',
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
        src('Risers and shafts are covered or screened at each level. Covers are strong enough to take anyone who could fall onto them, securely fixed so they cannot be moved or removed by accident, and marked as covering a hole.', `${WHS('s 306F')}; ${QCODE('Managing the risk of falls', 's 4.2')}`),
        'Only the section being worked on is opened.',
        src('Ladders are industrial and rated for at least 120 kg.', WHS('s 306M')),
        src('When working from a ladder, keep two feet and one other point of contact with it, and use a tool belt.', MODEL('Managing the risk of falls', 's 9.1')),
        src('Barricade and sign the area below.', `${WHS('s 55')}; ${QCODE('Managing the risk of falls', 's 8.1')}`),
        'Stop tools and materials falling.',
        src('Where exposed energised parts are nearby, have them de-energised or covered by the electrician before work starts, and use non-conductive ladders near them.', QCODE('Managing electrical risks', 's 7.2')),
        'Before drilling into a slab, scan and mark reinforcement, conduits and pipes. In a post-tensioned slab, check the post-tensioning drawings, and never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval. Other detected services are isolated and confirmed before drilling near them.',
        src('Drill anchors with on-tool extraction, and wear a fit tested P2 respirator.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2, s 7.6.1, s 7.6.2')}`),
        src('Assess in writing before drilling whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until that is determined.', WHS('s 529CA')),
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
      step: 'Install comms racks, cabinets and equipment',
      hazards: ['Strain or crush moving racks, cabinets and batteries.', 'A rack tips over.', { only: 'upsWork', text: 'Battery electrolyte, short circuits and stored energy.' }, 'Contact with live UPS outputs and distribution boards in the comms room.', 'Silica dust and tendon strike when drilling rack anchors.'],
      controls: [
        src('Move racks and batteries with trolleys, pallet jacks or lifting aids. Team lifts are an interim control, with one person in charge.', MODEL('Hazardous manual tasks', 's 4.5, s 4.9')),
        'Fix racks to the floor or wall as soon as they are stood up, before loading equipment.',
        'Before drilling rack anchors into a slab, scan and mark reinforcement, conduits and pipes. In a post-tensioned slab, check the post-tensioning drawings, and never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval.',
        src('Drill with on-tool extraction. Anyone still at risk of exposure wears a fit tested respirator (P2 or better).', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2, s 7.6.1, s 7.6.2')}`),
        src('Assess in writing before drilling whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until that is determined.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
        { only: 'upsWork', ...src('Keep the battery safety data sheet at the work area.', WHS('s 344')) },
        { only: 'upsWork', text: 'UPS and power connections are made only by licensed electricians.' },
        src('Where exposed energised parts are nearby, have them de-energised or covered by the electrician before work starts, and use non-conductive ladders near them.', QCODE('Managing electrical risks', 's 7.2')),
      ],
    }],
    ppe: ['gloveChemical', 'p2'],
  },
  {
    when: 'securityDevices',
    steps: [{
      step: 'Install security devices',
      hazards: ['A fall from a ladder or platform.', 'Silica dust from drilling.', { unless: 'poleMount', text: 'Contact with energised cables in walls and ceilings.' }],
      controls: [
        { only: 'newPole', text: 'Poles are stood in footings dug after services are located, lifted with a crane truck or by two people for light poles, and braced until the footing has cured.' },
        { only: 'poleMount', text: 'Use an EWP to fit cameras and devices at the top of the pole, with the harness clipped to its anchor.' },
        src('Ladders are industrial and rated for at least 120 kg.', WHS('s 306M')),
        src('When working from a ladder, keep two feet and one other point of contact with it, and use a tool belt.', MODEL('Managing the risk of falls', 's 9.1')),
        src('Drill with on-tool extraction. Anyone still at risk of exposure wears a fit tested respirator (P2 or better).', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2, s 7.6.1, s 7.6.2')}`),
        src('Assess in writing before drilling whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until that is determined.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
        { unless: 'poleMount', text: 'Check for cables before drilling walls and ceilings. Door hardware and power supplies are connected to mains power only by licensed electricians.' },
        src('Where exposed energised parts are nearby, have them de-energised or covered by the electrician before work starts, and use non-conductive ladders near them.', QCODE('Managing electrical risks', 's 7.2')),
        { unless: 'poleMount', text: 'Before drilling into a slab, scan and mark reinforcement, conduits and pipes. In a post-tensioned slab, check the post-tensioning drawings, and never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval.' },
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
        src('The crane or monorail rests on a suitable foundation that keeps it stable and secure.', QCODE('Managing the risks of plant in the workplace', 's 3.2')),
        'A structural engineer confirms the slab and edge can take its base or outrigger loads.',
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
        src('Where objects could fall onto the street or footpath, work goes ahead only once the principal contractor has the protection the regulation sets for the height of the work and its distance from the boundary: a barricade or hoarding, or for steep angles a gantry, a closure approved by the authority that controls the area, or a catch platform with perimeter containment screening.', WHS('s 315F, s 315G, s 315M')),
        src('Sequence the work so trades are not working above or below each other at the same time.', MODEL('Managing the risk of falls', 's 8.3')),
        src('Stop panel handling when the wind could take control of the panel.', `${MODEL('Managing the risk of falls', 's 3.2')}; ${QCODE('Hazardous manual tasks', 's 3.4, s 4.6')}`),
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
        'Before drilling into a slab edge, scan and mark reinforcement, conduits and pipes. In a post-tensioned slab, check the post-tensioning drawings, and never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval.',
        src('Drill with on-tool extraction. Anyone still at risk of exposure wears a fit tested respirator (P2 or better).', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2, s 7.6.1, s 7.6.2')}`),
        src('Assess in writing before drilling whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until that is determined.', WHS('s 529CA')),
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
        unless: 'platformOnly',
        step: 'Deliver, assemble and dismantle the rig',
        hazards: ['Crushing or falling parts during assembly.', 'Delivery trucks strike people.', 'A fall from the mast or rig.'],
        controls: [
          src('Assemble and dismantle the rig to the manufacturer\'s procedure, by a crew trained in that procedure for that rig.', PSTD('s 4.4')),
          src('Deliveries follow the site traffic management plan.', `${PSTD('s 4.4, s 4.9')}; ${QCODE('Excavation work', 's 4.3')}`),
          'Exclusion zone around assembly and disassembly, and drivers follow the traffic controller and the piling crew.',
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
        src('No one approaches the rig until the operator has agreed.', `${QCODE('Excavation work', 's 4.3')}; ${PSTD('s 3.13')}`),
        'Agree hand signals or radios, with a relay offsider when the signaller is out of the operator\'s view.',
        src('Isolate the rig before cleaning the auger or any maintenance.', MODEL('Managing the risks of plant in the workplace', 's 3.6')),
        src('Manage the risk of the rig overturning or colliding with any person or thing.', WHS('s 214')),
        src('The principal contractor obtains the underground services information, and services are marked so rig operators can see them.', `${WHS('s 304')}; ${PSTD('s 4.8')}`),
        src('Treat powerlines as live unless the asset owner confirms in writing that they are isolated, and keep the platform from raising ground levels under them. Where powerlines are near, the no go zones and how they are kept are written here: ____.', PSTD('s 4.7')),
        src('Rigs keep out of the zone of influence of any excavation, batter, trench or retention wall unless the support is designed by a competent person for the rig.', MODEL('Excavation work', 's 4.1, s 4.3')),
        src('Spoil is kept outside the zone of influence of any excavation and any open bores.', MODEL('Excavation work', 's 4.1')),
        src('Keep rig noise below 85 dB(A) over 8 hours and 140 dB(C) peak. Hearing protection in signposted areas, with hearing tests within 3 months of starting and at least every 2 years.', WHS('s 56, s 57, s 58')),
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
        src('Cover or guard each bore as soon as it is formed. Covers are strong enough to take anyone who could fall onto them, securely fixed so they cannot be moved or removed by accident, and marked as covering a hole.', `${MODEL('Managing the risk of falls', 's 4.2')}; ${WHS('s 306F')}`),
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
        src('Release pressure and isolate before clearing a blockage. Refit guards before restarting.', QCODE('Managing the risks of plant in the workplace', 's 3.6, s 4.5')),
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
        src('Breaking concrete with power tools or plant is processing crystalline silica. Control it with wet suppression or on-tool extraction, and fit tested respirators for anyone still at risk.', `${WHS('s 529A, s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.1, s 7.4.2, s 7.6.2, appendix 4')}`),
        src('Assess in writing before breaking whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until that is determined.', WHS('s 529CA')),
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
      step: 'Move materials into place',
      hazards: ['Back and shoulder strain carrying sheets, studs and other materials.', 'Wind catches large sheets.'],
      controls: [
        src('Where there is a materials hoist, move materials between levels with it, not by hand.', QCODE('Hazardous manual tasks', 's 4.1, s 4.4')),
        src('Have materials delivered as close as possible to where they are used.', MODEL('Hazardous manual tasks', 's 4.7')),
        src('Use trolleys, lift trolleys, panel lifters, and hooks or suction pads for sheets. Keep trolleys maintained.', MODEL('Hazardous manual tasks', 's 4.4, s 4.5')),
        src('Team lifts are an interim control only, with one person in charge.', MODEL('Hazardous manual tasks', 's 4.9')),
        src('Handle large sheets in low wind, especially on balconies and at hoist landings.', MODEL('Hazardous manual tasks', 's 4.8')),
        'Where a hoist is used, unload only inside the hoist landing gates. Gates stay closed except while the hoist is at the landing.',
      ],
    }],
  },
  {
    when: 'carpFraming',
    steps: [{
      step: 'Frame walls and bulkheads',
      hazards: ['A fall from a ladder or mobile scaffold.', 'Cuts from steel stud edges.', 'Noise and flying particles from cutting.'],
      controls: [
        { ...src('Ladders are industrial and rated for at least 120 kg.', WHS('s 306M')), unless: 'plasterHeight' },
        src('When working from a ladder, keep two feet and one other point of contact with it, and use a tool belt.', MODEL('Managing the risk of falls', 's 9.1')),
        { ...src('Use step platforms rather than plain stepladders. Never stand above the second tread below the top of a stepladder, never use two-handed saws on a ladder, and plan the work so no one works from a ladder for long periods.', MODEL('Managing the risk of falls', 's 8.3, s 9.1')), unless: 'plasterHeight' },
        src('Mobile scaffolds: lock the castors before anyone gets on, never move it with anyone on it, keep it clear of open edges and penetrations, and do not alter it.', MODEL('Managing the risk of falls', 's 5.1')),
        src('Never use a ladder to hold up a platform.', WHS('s 306M')),
        src('A saw built for timber is not used to cut steel studs unless a competent person has assessed it as suitable for that use.', MODEL('Managing the risks of plant in the workplace', 's 3.4')),
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
        src('Guards are in place, strongly fixed and hard to bypass, and control ejected parts.', `${WHS('s 208')}; ${QCODE('Managing the risks of plant in the workplace', 's 4.1')}`),
        'Drop saws have a self-adjusting guard.',
        src('Disconnect the power before removing a guard, and refit it before use. Inspect hand-held tools regularly and repair or replace them.', MODEL('Managing the risks of plant in the workplace', 's 3.5, s 4.1')),
        'Nail guns: sequential trigger where available, never bypass the nose contact, no finger on the trigger while carrying, and keep the gun pointed away from people.',
        src('Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak. If you need to raise your voice to talk to someone 1 m away, the noise is likely hazardous. Use quieter methods, such as gluing instead of nailing, where possible.', `${WHS('s 56, s 57')}; ${QCODE('Managing noise and preventing hearing loss', 's 2.2, s 3.2, s 5.1')}`),
        src('Hearing protection is worn the whole time workers are exposed to the noise. Workers who must wear it have hearing tests within 3 months and at least every 2 years.', `${WHS('s 58')}; ${MODEL('Managing noise and preventing hearing loss', 's 5.3, s 5.4')}`),
        { only: 'timberWork', ...src('Keep timber and MDF dust below the exposure standard with dust extraction on saws, and monitor where unsure.', WHS('s 49, s 50')) },
        { only: 'timberWork', text: 'Wear a P2 respirator where dust extraction does not keep dust down, such as when sanding MDF.' },
        { unless: 'timberWork', text: 'Wear a P2 respirator where cutting or drilling makes dust that extraction does not control.' },
        { only: 'plasterWork', ...src('Keep plasterboard and metal cutting dust below the exposure standard: score and snap boards where possible, and use extraction on power tools.', WHS('s 49, s 50')) },
      ],
    }],
    ppe: ['glassesClear', 'earPlugs'],
  },
  {
    when: 'carpJoinery',
    steps: [{
      step: 'Install doors, joinery and cabinets',
      hazards: [{ only: 'cabinetWork', text: 'Strain holding heavy units in place while fixing.' }, { unless: 'cabinetWork', text: 'Strain holding doors in place while fixing.' }, { only: 'cabinetWork', text: 'Crush from a falling door or cabinet.' }, { unless: 'cabinetWork', text: 'Crush from a falling door.' }, { unless: 'cabinetWork', text: 'Cuts from saws and fixings when trimming doors and mouldings.' }],
      controls: [
        { ...src('Engineered stone benchtops, panels and slabs are banned and are not installed or processed. Natural stone tops are cut and finished by the supplier; if any stone must be cut on site, this SWMS is updated with silica controls first.', WHS('s 529D')), only: 'stoneWork' },
        src('Ask suppliers to deliver joinery ready to install and the right way up.', MODEL('Hazardous manual tasks', 's 4.7')),
        src('Use lifting aids, straps, trolleys and props to hold units while fixing, rather than holding them up by hand for long periods.', QCODE('Hazardous manual tasks', 's 2.2, s 4.4')),
        { only: 'cabinetWork', text: 'Doors and cabinets are fixed or propped as soon as they are stood up.' },
        { unless: 'cabinetWork', text: 'Doors are propped or wedged while hung, and fixed before they are left.' },
        'Adhesives, sealants and sealers are used as their safety data sheets set out, with good ventilation and gloves resistant to the product.',
        { ...src('Overhead cabinets and wardrobes are fitted from step platforms or platform ladders rated for at least 120 kg, not from the top of a stepladder.', `${WHS('s 306M')}; ${MODEL('Managing the risk of falls', 's 9.1')}`), only: 'cabinets' },
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
        src('Edge protection and penetration covers stay in place. Covers are strong enough to take anyone who could fall onto them, securely fixed so they cannot be moved or removed by accident, and marked as covering a hole.', `${WHS('s 306E, s 306F')}; ${MODEL('Managing the risk of falls', 's 4.2')}`),
        src('No stepladders near an open edge, penetration or beside a railing without extra fall protection.', MODEL('Managing the risk of falls', 's 9.1')),
        src('Where temporary edge protection must be opened, it is opened only under the principal contractor\'s permit. Workers at the opening use travel restraint so they cannot reach the edge. No one uses a fall arrest harness while working alone.', `${WHS('s 306D, s 306G, s 306I')}; ${QCODE('Managing the risk of falls', 's 6.1, s 8.2, s 10.1')}`),
        'Edge protection opened under the permit is opened one section at a time, and put back before the area is left. Otherwise it is not removed or opened by us.',
        src('Barricade and sign no go areas below.', QCODE('Managing the risk of falls', 's 8.1')),
        'Keep tools and offcuts away from edges.',
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
        src('Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak. Where rock is drilled or broken with plant, control the silica dust (wet methods or extraction) and assess it in writing before starting.', `${WHS('s 56, s 57, s 529B, s 529C, s 529CA')}; ${QCODE('Silica', 's 5.1, s 7.4.1, appendix 4')}`),
        src('Get the current underground services information before digging, and work to it.', WHS('s 304')),
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
        src('Do not remove soil above anchors without a competent person\'s approval. No one works ahead of the support.', QCODE('Excavation work', 's 6.3')),
        'Do not dig below the design stage level, or remove soil within the active soil zone, without a competent person\'s approval.',
        src('Hydraulic props are designed for the expected ground pressures.', MODEL('Excavation work', 's 6.2')),
        src('Remove supports in reverse order of installation, installing temporary members first where needed, with workers kept clear.', MODEL('Excavation work', 's 6.3')),
        src('Props and walers are lifted with plant designed to lift them, never over people, and slung by a licensed dogman. An excavator is used to lift only where plant designed to lift is not reasonably practicable, and it creates no greater risk.', WHS('s 219, schedule 3')),
        'Anchor stressing and de-stressing are done by the anchor contractor to the engineer\'s procedure, with an exclusion zone around and behind the jack.',
        src('Anchor loads are checked with hydraulic jacks and pressure gauges.', MODEL('Excavation work', 's 6.2')),
        src('Excavation does not start until steps are taken to stop any neighbouring building collapsing. Excavation below the level of a neighbouring footing is assessed by a competent person and supported to a competent person\'s design. The work does not cause flooding or water getting into neighbouring buildings.', QCODE('Excavation work', 's 3.5')),
        'The neighbouring building is monitored as the excavation goes down.',
        src('Anchors drilled under streets, neighbouring land or buildings are checked against the underground services information for those areas.', `${WHS('s 304')}; ${MODEL('Excavation work', 's 3.5')}`),
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
        src('Trenches and pits are secured from unauthorised or accidental entry. Lift pits have a lockable cover or a guard rail with a gate.', `${WHS('s 306')}; ${QCODE('Excavation work', 's 5.1, s 5.3')}`),
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
        src('The dewatering system is planned, and pumps stop water building up.', QCODE('Excavation work', 'Table 2')),
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
        src('Workers are trained to recognise buried contaminants and what action to take.', QCODE('Excavation work', 's 2.1, Table 2')),
        'If buried contaminants are found, stop, keep clear, and report.',
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
        { unless: 'anchorsProps', ...src('No digging until steps are taken to prevent collapse of neighbouring buildings. Digging below their footings is assessed by a competent person and supported. Vibration and flooding of neighbours are controlled.', MODEL('Excavation work', 's 3.4')) },
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
        { only: 'tileReplace', text: 'Broken tiles are cut out with a grinder or multi-tool with on-tool extraction, wearing eye protection and a P2 respirator, and the bed is cleaned back before the new tiles go in.' },
        { fact: 'silicaControls' },
        src('Tiles and stone with 1% or more crystalline silica are a crystalline silica substance. Cutting them with power tools is processing that must be controlled: wet cutting or on-tool extraction, and respirators for anyone still at risk.', `${WHS('s 529A, s 529B, s 529C')}; ${QCODE('Silica', 's 1.4, s 5.1, s 7.4.1, s 7.4.2, s 7.6')}`),
        src('Assess in writing before cutting whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until that is determined.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
        src('No engineered stone benchtops, panels or slabs are cut or installed. Ceramic and porcelain tiles and grout are not engineered stone.', WHS('s 529A, s 529D')),
        'No dry cutting: tiles and stone are cut wet or with on-tool extraction. Anyone still at risk while cutting wears a fit tested respirator.',
        src('Where it is uncertain whether dust is below the exposure standard, monitor the air and keep the results for 30 years. For high risk processing, results above the exposure standard are reported to the regulator within 14 days.', `${WHS('s 49, s 50, s 529CE')}; ${QCODE('Silica', 's 9.1, s 9.4')}`),
        src('Health monitoring is provided for workers at significant risk from crystalline silica.', `${WHS('s 368, schedule 14')}; ${QCODE('Silica', 's 10, s 10.1')}`),
        src('Saw and grinder guards are in place and hard to bypass. Isolate the cutting area, wear a face shield, and replace worn blades and wheels.', `${WHS('s 208')}; ${QCODE('Managing the risks of plant in the workplace', 's 2.3, s 3.5, s 4.1')}`),
        src('Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak. Hearing protection is worn the whole time workers are exposed to the noise. Workers who must wear it have hearing tests within 3 months and at least every 2 years.', `${WHS('s 56, s 57, s 58')}; ${QCODE('Managing noise and preventing hearing loss', 's 2.2, s 5.3, s 5.4')}`),
        src('Inspect tools regularly.', QCODE('Managing the risks of plant in the workplace', 's 3.5')),
        src('Use RCD protected tools and leads, and keep leads off wet floors and out of access ways.', QCODE('Managing electrical risks', 's 3, s 3.3')),
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
        src('Ventilate when using solvent sealers, especially in small or enclosed rooms, and keep ignition sources away.', `${WHS('s 351, s 355')}; ${QCODE('Managing risks of hazardous chemicals', 's 4.1, s 4.2')}`),
        src('Keep dust below the exposure standard. Mix bagged products with dust control, keep containers closed, vacuum or wet clean instead of dry sweeping, and clean spills straight away.', `${WHS('s 49')}; ${QCODE('Managing risks of hazardous chemicals', 's 1.5, s 4.1, s 4.2')}`),
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
        { unless: 'wallTiling', ...src('Kneeling while laying tiles is a hazardous manual task. Rotate tasks and take short, frequent breaks.', `${WHS('s 60')}; ${MODEL('Hazardous manual tasks', 's 2.2, s 4.9')}`) },
        { unless: 'wallTiling', ...src('Buy smaller or lighter bags and boxes where possible, have materials delivered as close to the work area as possible, move them between levels by hoist or crane, and use trolleys.', MODEL('Hazardous manual tasks', 's 4.1, s 4.4, s 4.5, s 4.7')) },
        src('Use panel lifters or trolleys for any heavy stone and large format tiles.', MODEL('Hazardous manual tasks', 's 4.5')),
        'Wear knee pads.',
        'Top courses of wall tiles are reached from a platform ladder or step platform, not a stepladder, bucket or bath edge.',
        src('Keep access ways clear, put waste in bins, and clean up slurry so floors are not slippery.', `${WHS('s 40')}; ${QCODE('Hazardous manual tasks', 's 4.6')}`),
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
        src('Edge protection stays in place: top rail at least 900 mm above the finished surface (the falls code suggests 900 mm to 1100 mm), with a mid rail and a toe board. Recheck the height after screeding and tiling raise the floor.', `${WHS('s 306D, s 306E')}; ${QCODE('Managing the risk of falls', 's 5.2')}`),
        src('No more than 450 mm between rails, and a toe board at least 150 mm high.', WHS('s 306E')),
        src('Do not stack tiles or bags near edges, and secure offcuts against wind.', WHS('s 54, s 55')),
        src('Do not work above other trades.', `${WHS('s 55')}; ${QCODE('Managing the risk of falls', 's 8.3')}`),
        'Stop objects falling freely.',
      ],
    }],
  },
  {
    when: 'steelLift',
    // The steel erector's own riggers sling and direct the steel, so the general
    // crane company step (its crew slings the loads) does not apply.
    replaces: ['craneInterface'],
    steps: [{
      step: 'Lift and land steel with the crane company',
      hazards: ['A steel member falls or swings into a person.', 'A badly slung load.'],
      controls: [
        'The crane company operates the crane under its lift plan. Our licensed riggers sling, direct, land and release the steel.',
        src('Structural steel erection is basic rigging work, which includes dogging. Slinging and directing loads out of the operator\'s view is dogging. Sight each licence before work.', WHS('s 81, s 85, schedule 3, schedule 19')),
        src('Lifting gear suits the load, lifts stay within the crane\'s limits, no loads over people, and the load stays under control with tag lines.', WHS('s 219')),
        src('Enclose the area under the lift and use a spotter at ground level.', `${WHS('s 55, s 219')}; ${QCODE('Managing the risk of falls', 's 8.1')}`),
        src('Our SWMS and the crane company\'s are coordinated before lifts start.', QCODE('Managing the risks of plant in the workplace', 's 1.3')),
        src('No loads are lifted over areas outside the site. If one must be, the principal contractor closes the area or erects a gantry first.', WHS('s 315L')),
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
        src('Brace and secure members as they go up so the structure stays stable.', QCODE('Steel construction', 's 2.8')),
        src('Use EWPs or edge protection to prevent falls first. Fall arrest only where prevention is not practicable.', WHS('s 306D')),
        src('Where boom EWPs are used: the harness is attached to the EWP\'s anchor point, not the handrail, and booms of 11 m or more need a licensed operator.', `${QCODE('Managing the risk of falls', 's 5.1')}; ${WHS('schedule 3')}`),
        'A boom-type EWP has a registered design.',
        src('Harness anchors are rated at least 15 kN for one person with a free fall, there is enough clearance below, no one works alone on a harness, and the rescue plan is tested.', WHS('s 80, s 306I')),
        src('Catch platforms or nets. Safety nets are installed by licensed riggers or scaffolders.', QCODE('Managing the risk of falls', 's 7.1, s 7.2')),
        'Tools are tethered with lanyards.',
        src('Static lines are installed by licensed riggers.', WHS('schedule 3')),
        src('Impact wrenches and bolting are repetitive: rotate tasks.', `${WHS('s 60')}; ${QCODE('Hazardous manual tasks', 's 4.7')}`),
        src('Impact wrenches and bolting are noisy: reduce noise at the source. Where noise still exceeds 85 dB(A) over 8 hours or 140 dB(C) peak, wear hearing protection and have hearing tests.', WHS('s 56, s 57, s 58')),
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
        src('No welding from ladders.', `${QCODE('Welding processes', 's 3.9')}; ${MODEL('Managing the risk of falls', 's 9.1')}`),
        src('No hot work above safety nets.', MODEL('Managing the risk of falls', 's 7.2')),
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
        src('Bricks and blocks are not engineered stone, but cutting them with power tools is processing crystalline silica and must be controlled: wet cutting or on-tool extraction, and respirators for anyone still at risk.', `${WHS('s 529A, s 529B, s 529C')}; ${QCODE('Silica', 's 1.4, s 5.1, s 7.4.1, s 7.4.2, s 7.6')}`),
        src('Assess in writing before cutting whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until that is determined.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
        src('Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak, reducing it at the source first. Workers who must wear hearing protection have hearing tests within 3 months and at least every 2 years.', `${WHS('s 56, s 57, s 58')}; ${QCODE('Managing noise and preventing hearing loss', 's 2.2, s 5.1, s 5.4')}`),
        src('Guard the blade, isolate the cutting area and wear a face shield.', QCODE('Managing the risks of plant in the workplace', 's 2.3')),
        'Use a noise-reduced saw blade.',
      ],
    }],
    ppe: ['p2', 'earMuffs', 'faceShield'],
  },
  {
    when: 'masonryLay',
    steps: [{
      step: 'Lay blocks and bricks',
      hazards: ['Back strain from repetitive lifting of blocks and bricks.', { unless: 'smallMasonry', text: 'A fall from a scaffold or trestle.' }, { only: 'smallMasonry', text: 'A fall from trestles or a ladder.' }, 'A new wall collapses before it cures.'],
      controls: [
        { only: 'masonryFence', unless: 'fenceRemove', text: 'The old fence is taken down in sections with the boundary kept secure, and footings are dug only after services are located.' },
        { only: 'masonryFooting', unless: 'footingHoles', text: 'Footings are dug and poured to the drawings after services are located.' },
        { unless: 'smallMasonry', ...src('Crane, hoist or barrow blocks to the work face, and stage them between waist and shoulder height. Training in lifting technique is not the main control.', QCODE('Hazardous manual tasks', 's 4.1, s 4.3, s 4.4, s 4.5')) },
        { unless: 'smallMasonry', ...src('Work from scaffold with brick guards where a fall of more than 2 m is possible, and do not overload bays: bricklaying and blocklaying need a heavy duty scaffold, rated up to 675 kg a bay. A scaffold over 4 m is used only after written handover, and inspected at least every 30 days.', `${WHS('s 225')}; ${QCODE('Managing the risk of falls', 's 5.1')}`) },
        src('Trestle platforms where a person could fall 2 m or more (3 m in housing construction) have their trestles secured, edge protection, and a platform at least 450 mm wide and no higher than 5 m; below that height the platform is at least 450 mm wide (225 mm for light work). Use only purpose-made pins.', `${WHS('s 306N, s 306O')}; ${QCODE('Managing the risk of falls', 's 5.1')}`),
        { unless: 'repointing', text: 'Brace new walls until they are complete and cured.' },
        { only: 'retainingBlock', text: 'Drainage and backfill are placed behind the wall as the courses go up, and compacted in layers as the design shows.' },
        { only: 'smallMasonry', text: 'Blocks and bricks are stacked close to the work at waist height, and lifted one at a time. Trestles or a platform ladder are used for courses above shoulder height.' },
        { unless: 'smallMasonry', ...src('Secure the scaffold, for example by removing access ladders, when leaving site.', `${WHS('s 225, s 298')}; ${QCODE('Managing the risk of falls', 's 5.1')}`) },
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
        src('No stacking near unmeshed edges. Perimeter screens and toe boards stop falling objects.', WHS('s 55, s 54')),
        src('Sequence work so trades are not working directly above or below each other.', MODEL('Managing the risk of falls', 's 8.3')),
        src('Where edge protection must be opened to build at the edge, it is opened only under the principal contractor\'s permit, with travel restraint.', `${WHS('s 306D, s 306G')}; ${QCODE('Managing the risk of falls', 's 6.1, s 8.2')}`),
        'It is opened one section at a time, and put back before the area is left.',
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
        src('Holding sheets in place while fixing is a hazardous posture: prop or support sheets rather than holding them.', QCODE('Hazardous manual tasks', 's 2.2, s 4.4')),
        src('Team lifts are an interim control only, with one person in charge. Training in lifting technique is not the main control.', QCODE('Hazardous manual tasks', 's 4.1, s 4.7')),
      ],
    }],
  },
  {
    when: 'plasterHeight',
    steps: [{
      step: 'Work at the upper wall and ceiling line',
      hazards: ['A fall from a mobile scaffold, step platform or ladder.', 'Working with arms overhead.'],
      controls: [
        { only: 'ceilingRepair', text: 'A sagging ceiling is propped before work starts and no one stands under it. In a building built before 2004 (asbestos products were used until the national ban at the end of 2003), the ceiling and anything above it are checked for asbestos and loose-fill insulation before it is disturbed.' },
        src('Fall hazards under 2 m (3 m in housing construction) are identified, assessed and controlled before work starts. Where a person could fall 2 m or more (3 m in housing construction), platforms have guardrails so a fall is prevented.', WHS('s 306C, s 306D')),
        src('Work from the floor or a platform where possible. Ladders only after scaffolds and EWPs are considered.', `${WHS('s 78, s 79')}; ${QCODE('Managing the risk of falls', 's 4.1, s 9')}`),
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
        src('Keep dust below the exposure standard, and monitor the air if unsure. Check each product\'s safety data sheet: a product with 1% or more crystalline silica is a crystalline silica substance, and power sanding or cutting it is processing that must be controlled, with a written assessment before it starts.', `${WHS('s 49, s 50, s 529A, s 529C, s 529CA')}; ${QCODE('Silica', 's 1.3, s 5.1, s 9.1')}`),
        src('Sanders with dust extraction. Pre-mixed compounds instead of mixing powders.', MODEL('Managing risks of hazardous chemicals', 's 4.1')),
        src('Vacuum or wet clean, never dry sweep. Respirators where dust exposure remains.', QCODE('Managing risks of hazardous chemicals', 's 4.1, appendix J')),
      ],
    }],
    ppe: ['p2', 'glassesClear'],
  },
  {
    when: 'paintExternal',
    steps: [{
      step: 'Paint the outside of the structure at height',
      hazards: ['A fall from height.', 'Paint or tools fall onto people below.'],
      controls: [
        { fact: 'fallControl' },
        { unless: 'ewp', ...src('In a boom EWP, the harness is attached to the EWP\'s anchor point, not the handrail. Boom EWPs of 11 m or more need a licensed operator. EWPs only on solid level ground and in suitable wind.', MODEL('Managing the risk of falls', 's 5.1')) },
        { unless: 'ewpNamed', ...src('No one uses a fall arrest harness while working alone.', WHS('s 306I')) },
        'Platform ladders are used only for short work below 2 m, on firm level ground, and are not set up near an open edge.',
        src('Use tool lanyards and lidded paint containers so nothing falls, and set up an exclusion zone below.', `${WHS('s 55')}; ${QCODE('Managing the risk of falls', 's 8.1')}`),
        src('Sun protection: hat, long sleeves, sunglasses and SPF 30 or higher sunscreen. Drinking water, shade and rest breaks in hot weather.', `${WHS('s 40, s 41, s 44')}; ${QCODE('Hazardous manual tasks', 's 4.6')}`),
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
        src('Grinding concrete is processing crystalline silica and must be controlled: wet suppression, on-tool extraction or local exhaust, and respirators for anyone still at risk.', `${WHS('s 529A, s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.1, s 7.4.2, s 7.6')}`),
        src('Assess in writing before grinding whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until that is determined.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
        src('Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak, reducing it at the source first. Workers who must wear hearing protection have hearing tests within 3 months and at least every 2 years.', `${WHS('s 56, s 57, s 58')}; ${QCODE('Managing noise and preventing hearing loss', 's 2.2, s 5.1, s 5.4')}`),
        src('Inspect grinders and replace worn wheels.', MODEL('Managing the risks of plant in the workplace', 's 3.5')),
        src('Health monitoring is provided for workers at significant risk from crystalline silica. For high risk processing, air monitoring results above the exposure standard are reported to the regulator within 14 days.', `${WHS('s 368, s 529CE, schedule 14')}; ${QCODE('Silica', 's 10, s 10.1')}`),
      ],
    }],
    ppe: ['p2', 'earMuffs'],
  },
  {
    when: 'floorAdhesive',
    steps: [{
      step: 'Apply flooring adhesives',
      hazards: ['Skin sensitisation from epoxy adhesives.', 'Solvent vapour collecting at floor level, where solvent-based adhesives are used.', 'Fire from flammable adhesive vapour.', 'Skin contact.'],
      controls: [
        { fact: 'safetyDataSheet' },
        src('The current safety data sheet is at the work area and the product is on the register.', WHS('s 344, s 346')),
        src('Use mechanical fixing, or less volatile and less flammable adhesives, where possible.', MODEL('Managing risks of hazardous chemicals', 's 4.1, appendix J')),
        src('Where solvent-based adhesives are used, the vapour is heavier than air and collects near the floor: ventilate, and keep ignition sources out.', `${WHS('s 355')}; ${QCODE('Managing risks of hazardous chemicals', 's 4.1, s 4.2')}`),
        'Epoxy adhesives can cause skin sensitisation: avoid all skin contact, wear the chemical resistant gloves the safety data sheet lists, and change gloves as soon as they are contaminated.',
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
        src('Cement-based compounds have a very high pH and are corrosive to skin and eyes: gloves and eye protection, and wash skin straight away.', QCODE('Managing risks of hazardous chemicals', 's 3.3, s 4.1, appendix J')),
        'Wear long sleeves.',
        src('Use pre-mixed products where possible, and mix powders with dust control.', MODEL('Managing risks of hazardous chemicals', 's 4.1')),
        'Wear a P2 respirator when mixing powders without dust control.',
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
        src('Kneeling is a hazardous posture: rotate tasks and take short frequent breaks.', QCODE('Hazardous manual tasks', 's 2.2, s 4.7')),
        'Wear knee pads.',
      ],
    }],
    ppe: ['earPlugs', 'glassesClear'],
  },
  {
    when: 'floorLay',
    steps: [{
      step: 'Lay floor coverings',
      hazards: ['Knee injury from kneeling.', { unless: 'carpetTiles', text: 'Strain moving rolls.' }, 'Cuts from knives and blades.', { only: 'vinylWeld', text: 'Burns from the hot air gun.' }],
      controls: [
          { text: 'Old carpet, vinyl and adhesive are lifted with scrapers and stripping tools. In a building built before 2004 (asbestos products were used until the national ban at the end of 2003), vinyl, underlay and adhesive are checked for asbestos before they are lifted.', only: 'oldFloorCoverings' },
        src('Kneeling to lay floor coverings is a hazardous posture: rotate tasks and take short frequent breaks. Replace hand tools with power tools to reduce force.', MODEL('Hazardous manual tasks', 's 2.2, s 3.3, s 4.1, s 4.9')),
        'Wear knee pads.',
        { only: 'carpet', unless: 'carpetTiles', text: 'Use a power stretcher instead of a knee kicker where possible.' },
        { only: 'carpetTiles', text: 'Carpet tiles are moved in cartons on trolleys, and tile adhesive is used as its safety data sheet sets out.' },
        { only: 'vinylWeld', text: 'Weld vinyl seams with the hot air gun, and rest it on its stand when it is not in use. Keep the work area ventilated, weld only once solvent adhesive vapour has cleared, and wear heat resistant gloves.' },
        'Use retractable or safety knives, cut away from the body, and put used blades in a blade container.',
        { unless: 'carpetTiles', ...src('Move rolls with trolleys or hand trucks, pushing rather than pulling, and order smaller loads or move large rolls mechanically.', MODEL('Hazardous manual tasks', 's 4.4, s 4.5')) },
      ],
    }],
  },
  {
    when: 'balustradeEdge',
    steps: [{
      step: 'Install balustrades at open edges',
      hazards: ['A fall from the open edge while temporary edge protection is opened.', 'Panels, fixings or tools fall onto people below.'],
      controls: [
        { only: 'balustradeReplace', text: 'The old balustrade is removed one section at a time, with temporary edge protection fixed across each gap before it is left.' },
        { fact: 'fallControl' },
        src('Prevent objects falling first: tools on lanyards, panels and fixings secured at the edge until fixed, and catch screens or toe boards. Then an exclusion zone below.', `${WHS('s 55')}; ${QCODE('Managing the risk of falls', 's 8.1')}`),
        src('Prevent falls first. Temporary edge protection is opened only under the principal contractor\'s permit.', `${WHS('s 79, s 306C, s 306D')}; ${QCODE('Managing the risk of falls', 's 8.2')}`),
        src('It is opened only at the panel being installed, and put back before the area is left.', WHS('s 79, s 306C, s 306D')),
        src('Workers at the opening use travel restraint, installed by a competent person and set so they cannot reach the edge, with users trained.', `${WHS('s 306G')}; ${QCODE('Managing the risk of falls', 's 6, s 6.1')}`),
        'The travel restraint system is inspected at least every 6 months.',
        src('Where fall arrest is used instead, anchors are engineer designed or approved by a competent person, no one works alone, and the rescue procedure is tested.', WHS('s 80, s 306I')),
      ],
    }],
    ppe: ['harness'],
  },
  {
    when: 'glassHandle',
    steps: [{
      step: 'Handle and install glass panels',
      hazards: ['Back strain and crush from heavy panels.', 'Cuts from glass edges and broken glass.'],
      controls: [
        { only: 'screenReplace', text: 'The old screen is taken out panel by panel, with each panel supported by two people or suction lifters as its fixings are released, and old silicone is cut away with a scraper, not a grinder.' },
        { only: 'paneReplace', text: 'The cracked pane is taped, its beads or glazing seal removed, and the glass taken out from the inside with cut resistant gloves, eye protection and the area below closed off.' },
        src('Use vacuum lifters, glass panel lifters, suction pads and trolleys, not hand carrying.', MODEL('Hazardous manual tasks', 's 4.4, s 4.5')),
        src('Team lifts are an interim control only, with one person in charge and the lift rehearsed.', MODEL('Hazardous manual tasks', 's 4.9')),
        src('Plant that lifts glass keeps it under control and within its limits.', WHS('s 219')),
        'Cut resistant gloves and eye protection. Broken glass is cleaned up straight away and put in a marked container.',
      ],
    }],
    ppe: ['gloveCut', 'glassesClear'],
  },
  {
    when: 'windowInstall',
    steps: [{
      step: 'Install window frames, doors and louvres',
      hazards: ['A fall through the window opening or from the platform.', 'A frame or door falls before it is fixed.', 'Silica dust from drilling fixings into concrete or masonry.', 'Strain lifting frames into openings.', { only: 'louvres', text: 'Cuts from louvre blades and glass edges.' }, { unless: 'louvres', text: 'Cuts from glass edges.' }],
      controls: [
        { only: 'windowReplace', text: 'Old windows and doors are removed one at a time: glass is taped or taken out first, fixings are cut, and the frame is lowered inside by two people. The opening is protected until the new frame is fixed. In a building built before 2004 (asbestos products were used until the national ban at the end of 2003), sealants, packers and wall linings around the frame are checked for asbestos first.' },
        { fact: 'fallControl' },
        'Openings stay protected by edge protection or a barrier until the frame is fixed in them. Frames above the ground floor are installed from inside the building where practicable.',
        'Each frame is packed, plumbed and fixed to the manufacturer\'s instructions before it is let go. Large frames are lifted with a panel lifter or two people, with one person in charge.',
        src('Drill fixings with on-tool extraction, and wear a fit tested P2 respirator.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2, s 7.6.1, s 7.6.2')}`),
        ...SILICA_FOLLOW_UP,
        { only: 'louvres', text: 'Louvre blades and glass are handled with cut resistant gloves that still give a good grip, and kept in their racks until fitted.' },
      ],
    }],
    ppe: ['gloveCut', 'p2', 'glassesClear'],
  },
  {
    when: 'generatorTest',
    steps: [{
      step: 'Run and load test generators',
      hazards: ['Electric shock or arc flash during switching and transfer.', 'Equipment starts or stops without warning during load shedding.', 'Noise and exhaust from running generators.', 'Burns from hot exhausts and surfaces.', 'Fuel spills and fire.'],
      controls: [
        'Load testing and load shedding follow a written switching plan agreed with the facility and the principal contractor. Switching is done only by licensed electricians.',
        'Everyone affected is told before each test. Plant that may start or stop is identified, and people are kept clear of it and of switchboards during transfers.',
        'Generators run only with exhaust discharged outside and away from air intakes. No one works in an enclosed generator room while engines run unless it is ventilated.',
        'Hearing protection is worn near running generators, with signposted hearing protector areas.',
        'Hot exhausts and surfaces are guarded or marked, and are not touched until cool.',
        'Fuel is handled with spill kits and a fire extinguisher at hand, and no ignition sources near fuel.',
      ],
    }],
    ppe: ['earMuffs', 'gloveGeneral'],
  },
  {
    when: 'serviceLabels',
    steps: [{
      step: 'Label pipes, ducts and equipment',
      hazards: ['A fall from a ladder or platform while labelling overhead services.', 'Contact with hot pipes or energised equipment.', 'Fumes from paints and adhesives.'],
      controls: [
        'Overhead labels are fixed from a platform ladder or mobile scaffold, not by leaning out from a stepladder.',
        'Hot pipes and energised equipment are identified first. Labels near them are fixed only when they are safe to touch, or with the equipment isolated.',
        'Paints, primers and adhesives are used as their safety data sheets set out, with ventilation and gloves.',
      ],
    }],
    ppe: ['gloveGeneral'],
  },
  {
    when: 'servicesStrip',
    steps: [{
      step: 'Isolate, make safe and remove old services',
      hazards: ['Cutting into live cables, pressurised pipes, gas or refrigerant.', 'Old services fall when their supports are cut.', 'Sharp edges, residues and old insulation (which may contain asbestos or synthetic mineral fibres).'],
      controls: [
        'Before removal, each service is identified and labelled, and isolated at its source: electrical circuits by a licensed electrician, locked out and proved de-energised; water and drainage drained; gas purged by a licensed gas fitter.',
        { text: 'Refrigerant is recovered by a refrigerant handling licence holder before pipework or plant is opened.', only: 'refrigerantWork' },
        'Services that stay in use are labelled, protected and kept clear of the removal.',
        'Pipework, ducts, cable trays and fittings are supported or lowered under control before their hangers are cut, from platforms set out in the fall controls, with an exclusion zone below.',
        'Lagging and insulation are checked against the asbestos register before they are disturbed.',
        'Removed items are taken down, not dropped, and stored or taken away as the principal contractor directs.',
      ],
    }],
    ppe: ['gloveCut', 'glassesClear'],
  },
  {
    when: 'hardwareFit',
    steps: [{
      step: 'Fit locks, closers and other hardware',
      hazards: ['Cuts and strain from power tools and repetitive fixing.', 'A door swings or falls while hardware is fitted.', 'Dust from drilling.'],
      controls: [
        'Doors are wedged or held while closers, hinges and locks are fitted. Heavy doors are taken off only with two people or a door lifter.',
        'Power tools are used with guards in place and with eye protection. Repetitive fixing is broken up with other tasks.',
        'Drill dust is cleaned up with a vacuum, not by dry sweeping.',
      ],
    }],
    ppe: ['glassesClear', 'gloveGeneral'],
  },
  {
    when: 'ceilingGrid',
    steps: [{
      step: 'Install suspended grid ceilings',
      hazards: ['A fall from the mobile scaffold, EWP or platform ladder.', 'Silica dust and noise drilling hanger anchors into the slab.', 'Cutting a post-tensioning tendon or a service when drilling.', 'Neck and shoulder strain from overhead work.', 'Dust and fibres from cutting ceiling tiles.', 'Contact with cables in the ceiling space.'],
      controls: [
        { fact: 'fallControl' },
        'Hangers are fixed from a mobile scaffold, EWP or platform ladder suited to the height, never from the top of a stepladder or from the grid.',
        'Before drilling into the slab, scan and mark reinforcement, conduits and pipes. In a post-tensioned slab, check the post-tensioning drawings and never drill within a marked tendon zone.',
        src('Drill hanger anchors with on-tool extraction, and wear a fit tested P2 respirator.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2, s 7.6.1, s 7.6.2')}`),
        ...SILICA_FOLLOW_UP,
        'Cables in the ceiling space are treated as live until the electrician confirms they are isolated. Light fittings and services are not moved by the ceiling crew.',
        src('Overhead work is broken up with other tasks, and tiles are cut on a bench with a knife or a saw with dust extraction.', MODEL('Hazardous manual tasks', 's 4.7')),
        'The area below is barricaded while the grid and tiles are installed.',
      ],
    }],
    ppe: ['p2', 'glassesClear', 'earPlugs'],
  },
  {
    when: 'playground',
    steps: [{
      step: 'Install playground equipment and softfall',
      hazards: ['Equipment parts fall or tip while they are lifted and stood.', 'Strain lifting heavy parts.', 'Striking underground services when digging footings.', 'Skin and lung irritation from rubber softfall binders.', 'The public enters the work area.'],
      controls: [
        'The work area is fenced off from the public, with signs, until the equipment is complete and inspected.',
        src('Get the current underground services information before digging footings, and locate services on site, for example through Before You Dig Australia.', WHS('s 304')),
        'Heavy parts are lifted with a machine or by two people with lifting aids, and are propped or braced until fixed, to the manufacturer\'s instructions.',
        'Rubber softfall binders are used as their safety data sheet sets out, with gloves, eye protection and good ventilation. Workers using isocyanate binders have the respiratory protection and health monitoring the data sheet calls for.',
        'The installed equipment is checked against the manufacturer\'s instructions before the fence comes down.',
      ],
    }],
    ppe: ['gloveChemical', 'glassesClear'],
  },
  {
    when: 'hddBore',
    steps: [{
      step: 'Bore under the road or ground with a directional drill',
      hazards: ['The drill head strikes a buried electrical cable, gas main or other service.', 'Being caught in the rotating drill string or rod handling.', 'Drilling fluid under pressure blows out at the surface.', 'Traffic and the public near the entry and exit pits.', 'Noise from the rig.'],
      controls: [
        src('Get the current underground services information before boring, and locate services on site, for example through Before You Dig Australia.', WHS('s 304')),
        'Services along and across the bore path are exposed by potholing (vacuum or hand digging) and their depth confirmed before the bore passes them. The bore path is tracked and recorded as it goes.',
        'Only the trained operator runs the rig. No one stands near the rotating rods, and the rod handler and operator use agreed signals and the rig\'s interlocks.',
        'Entry and exit pits are fenced, and drilling fluid is contained and disposed of as the principal contractor directs.',
        'Traffic management is in place where the rig or pits are near the road.',
        'If a service is struck, stop at once, keep everyone clear, and call the asset owner and 000.',
      ],
    }],
    ppe: ['earMuffs', 'hivis'],
  },
  {
    when: 'structureDemolition',
    steps: [{
      step: 'Demolish the structure',
      hazards: ['The structure collapses unexpectedly or in the wrong direction.', 'Asbestos or lead is disturbed.', 'A live service is struck or cut.', 'Falling debris strikes a worker or the public.', 'An excavator or other demolition plant overturns or strikes a person.', 'Silica dust and noise from breaking masonry and slabs.'],
      controls: [
        { unless: 'attachedStructure', ...src('All gas, electricity, water, sewer, telecommunications and other services are disconnected and capped at or outside the building line by the authorities or licensed trades before demolition starts, and confirmed in writing.', QCODE('Demolition', 's 3.8')) },
        src('Asbestos likely to be disturbed is identified before demolition and, so far as is reasonably practicable, removed by a licensed asbestos removalist before demolition starts.', `${WHS('s 451, s 452, s 453')}; ${QCODE('Demolition', 's 3.6, s 4.2')}`),
        { only: 'attachedStructure', text: 'Services to the attached structure are isolated and capped back to the house by the licensed trades, the shared wall is propped or protected, and the house stays weatherproof and safe to use.' },
        'Demolition is done by a contractor holding any demolition licence the state requires.',
        src('Where the structure, or a load-bearing part of it, is at least 6 m high, the regulator is given written notice at least 5 days before the work starts.', WHS('s 142')),
        src('An exclusion zone is fenced and signed around the structure, wide enough that falling or rebounding debris cannot reach anyone outside it. No one enters while demolition is under way.', QCODE('Demolition', 's 4.3')),
        { unless: 'lightStructure', ...src('The structure is demolished in the reverse order to its construction, from the roof down, and kept stable at every stage. No one works inside or under it while it is being pulled down.', QCODE('Demolition', 's 4.12')) },
        src('Excavators and other demolition plant have operator protective devices (falling object protection and a seat belt), and only the operator and a spotter in sight of the operator are near them.', QCODE('Demolition', 's 4.12')),
        src('Debris is removed as the work goes, and is not dropped freely except into a fenced drop zone.', QCODE('Demolition', 's 4.7')),
        { only: 'masonryDemo', ...src('Breaking masonry and slabs is processing a crystalline silica substance: water sprays keep dust down, and anyone still at risk wears a fit tested respirator. Hearing protection near breakers and hammers.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2')}`) },
        'Neighbours are told before work starts, and the boundary is protected from debris and dust.',
      ],
    }],
    ppe: ['p2', 'earMuffs', 'hivis'],
  },
  {
    when: 'claddingInstall',
    steps: [{
      step: 'Install battens and external cladding',
      hazards: ['A fall from the scaffold, EWP or ladder.', { unless: 'hebel', text: 'Silica dust from cutting fibre cement sheets.' }, { only: 'hebel', text: 'Silica dust from cutting AAC (Hebel) panels.' }, { unless: 'panelCladding', text: 'Nail gun injuries.' }, { unless: 'panelCladding', text: 'Strain handling long boards and sheets.' }, { only: 'panelCladding', text: 'Strain or crush handling heavy panels.' }, 'Boards blow off in the wind.'],
      controls: [
        { fact: 'fallControl' },
        'Cladding at height is fixed from a scaffold or EWP, not from ladders.',
        { ...src('Fibre cement is cut by scoring and snapping or with shears where possible. Where it is sawn, the saw has on-tool extraction, and a fit tested P2 respirator is worn.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2')}`), only: 'fibreCement', unless: 'hebel' },
        { only: 'hebel', ...src('AAC panels are cut with a hand saw or a power saw with on-tool extraction, and a fit tested P2 respirator is worn where a power saw is used. Cutting AAC with a power tool is processing crystalline silica.', WHS('s 529B, s 529C')) },
        ...SILICA_FOLLOW_UP.slice(0, 2).map((item) => ({ only: 'hebel', ...(typeof item === 'string' ? { text: item } : item) })),
        { only: 'hebel', text: 'Panels are lifted with a panel lifter or by two people within the supplier\'s weights, and fixed with the supplier\'s fixings as each one is placed.' },
        { unless: 'panelCladding', text: 'Nail guns are used with the single shot (sequential) trigger, never carried with a finger on the trigger, and disconnected before clearing a jam.' },
        { unless: 'panelCladding', ...src('Long boards and sheets are carried by two people or with a trolley, and stacked flat near where they are used.', MODEL('Hazardous manual tasks', 's 4.4, s 4.5')) },
        'Boards and sheets are not handled at height in strong wind, and loose material is tied down at the end of the day.',
      ],
    }],
    ppe: ['glassesClear', 'earPlugs', 'p2'],
  },
  {
    when: 'repointing',
    steps: [{
      step: 'Rake out and repoint masonry',
      hazards: ['Silica dust from raking out mortar and cutting stone or brick.', 'A fall from the scaffold or platform.', 'Loose masonry falls onto people below.', 'Skin burns from lime and cement mortar.'],
      controls: [
        { fact: 'silicaControls' },
        src('Raking out mortar with a power tool is processing a crystalline silica substance: use a tool with on-tool extraction, or hand tools, and wear a fit tested P2 respirator.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2')}`),
        ...SILICA_FOLLOW_UP,
        'Loose stones and bricks are found and made safe before work below. The area below is barricaded.',
        'Mortar is mixed and used with gloves, long sleeves and eye protection. Skin that touches it is washed straight away.',
      ],
    }],
    ppe: ['p2', 'gloveChemical', 'glassesClear'],
  },
  {
    when: 'fixtures',
    steps: [{
      step: 'Fix rails, fittings and equipment to walls and floors',
      hazards: ['Drilling into hidden cables or pipes.', 'Silica dust from drilling masonry, concrete or tiles.', 'Strain lifting fittings into place.', 'People in an occupied building walk into the work area.'],
      controls: [
        'Before drilling, check for cables and pipes with a detector and the services drawings, and keep clear of them.',
        src('Drilling masonry, concrete or tiles is done with on-tool dust extraction, and a fit tested P2 respirator is worn where dust remains.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2')}`),
        'Fixings suit the wall or floor and the load, as the manufacturer specifies. Heavy items are lifted into place by two people or with a lifter.',
        'In occupied buildings, the work area is screened or barricaded and kept tidy, with cords off walkways.',
        { only: 'fixturePower', text: 'Any power connection is made by a licensed electrician.' },
      ],
    }],
    ppe: ['glassesClear', 'p2'],
  },
  {
    when: 'accessSteel',
    steps: [{
      only: 'stairOnly',
      step: 'Install the steel staircase',
      hazards: ['A fall from an open stair flight or landing before the handrails are fixed.', 'A stair flight falls or swings while it is lifted.', 'Strain lifting steel sections.', 'Silica dust drilling anchors into concrete.'],
      controls: [
        'Stair flights are lifted into place with a crane, hoist or lifting aid rated for them, never over people, and supported until they are bolted or welded.',
        'Temporary handrails or edge protection are fixed to the open sides of flights and landings until the permanent handrails are in, and the stair is not used until then.',
        'The area below is barricaded while flights and handrails are installed.',
        src('Anchors drilled into concrete are drilled with on-tool extraction, and a fit tested P2 respirator is worn.', WHS('s 529B, s 529C')),
        'The stair and handrails are built to the design and the stair standards, and checked before handover.',
      ],
    }, {
      unless: 'stairOnly',
      step: 'Install access ladders, platforms and walkways',
      hazards: ['A fall from the roof edge, the platform or the ladder before guardrails are fixed.', 'Steel sections fall onto people below.', 'Strain lifting steel sections.', 'Silica dust drilling anchors into concrete.'],
      controls: [
        { fact: 'fallControl' },
        'Guardrails on platforms and walkways are fixed before the platform is used, and ladder cages before the ladder is used.',
        { only: 'roofContext', text: 'Sections are lifted to the roof by crane or hoist, not carried up ladders. The area below is barricaded.' },
        src('Anchors drilled into concrete are drilled with on-tool extraction, and a fit tested P2 respirator is worn.', WHS('s 529B, s 529C')),
        'Platforms, ladders and walkways are built to the design and AS 1657, and are not used until they are complete and checked.',
      ],
    }],
    ppe: ['harness', 'glassesClear'],
  },
  {
    when: 'garageDoor',
    steps: [{
      step: 'Install the garage or roller door and its motor',
      hazards: ['The door or its spring releases stored energy and strikes a person.', { unless: 'doorSpring', text: 'The door falls while it is lifted into place.' }, 'Strain lifting the door.', 'Electric shock connecting the motor.'],
      controls: [
        'Springs are tensioned and released only with the manufacturer\'s tools and method, by a person trained in that door. No one stands in line with a spring under tension.',
        { unless: 'doorSpring', text: 'The door is lifted into place by two people or with a lifter, and held until its brackets are fixed.' },
        { only: 'doorSpring', text: 'The door is lowered and clamped, or the spring is fully unwound with the manufacturer\'s winding bars, before the broken spring is removed. Ladders are platform ladders, set up clear of the door.' },
        { unless: 'doorSpring', text: 'The motor is plugged into a socket, or connected by a licensed electrician.' },
        'The safety reverse and limits are tested before the door is handed over.',
      ],
    }],
    ppe: ['gloveGeneral', 'glassesClear'],
  },
  {
    when: 'anchorInstall',
    steps: [{
      step: 'Install anchor points and static lines',
      hazards: ['A fall from the roof edge or through the roof while installing the system.', 'An anchor is fixed into a structure that cannot hold it.'],
      controls: [
        { fact: 'fallControl' },
        'The installers work behind edge protection or on a temporary restraint system while the permanent system is installed.',
        'Anchors and lines are fixed only to structure the designer or a competent person has confirmed can carry the load, to the manufacturer\'s instructions and AS/NZS 1891.4 and AS/NZS 5532.',
        'The system is inspected and certified by a competent person, and tagged, before anyone uses it.',
      ],
    }],
    ppe: ['harness'],
  },
  {
    when: 'jointSealing',
    steps: [{
      step: 'Clean out and seal floor joints',
      hazards: ['Silica dust from sawing or grinding out joints.', 'Skin and lung sensitisation from polyurethane sealants.', 'Knee and back strain working at floor level.', { only: 'siteVehicles', text: 'Vehicles and other plant moving around the work.' }],
      controls: [
        { fact: 'safetyDataSheet' },
        src('Joints are cleaned out with a saw or grinder with on-tool extraction or water, and a fit tested P2 respirator is worn.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2')}`),
        'Sealants and primers are applied as their safety data sheets set out, with chemical resistant gloves and eye protection, and the respirator the data sheet lists where vapour or spray can be breathed in.',
        'Knee pads, and tasks rotated to limit time kneeling.',
        { only: 'siteVehicles', text: 'The work area is barricaded from forklifts, vehicles and other plant, as the site manager arranges.' },
      ],
    }],
    ppe: ['kneePads', 'gloveChemical', 'p2'],
  },
  {
    when: 'pipeRelining',
    steps: [{
      step: 'Clean, inspect and reline the pipe',
      hazards: ['Sewage and gases in the pipe and access chambers.', 'Skin and lung irritation from relining resins.', 'Water jetting under high pressure.', { only: 'road', text: 'Traffic at access points in the road.' }, 'Entering an access chamber that is a confined space.'],
      controls: [
        'Pipes are cleaned and inspected with jetters and cameras from the surface. No one enters an access chamber unless it has been assessed and a confined space permit is in place.',
        'High pressure jetting is done only by trained operators, with the hose and nozzle controlled before the pump starts.',
        'Resins and curing agents are used as their safety data sheets set out, with gloves, eye protection and ventilation.',
        'Flows are bypassed or stopped by arrangement with the asset owner before the pipe is relined.',
        { only: 'road', text: 'Access points in the road or footpath have traffic management and barriers.' },
        'Workers wash before eating, and cuts are covered, because of sewage.',
      ],
    }],
    ppe: ['gloveChemical', 'glassesClear', 'gumboots'],
  },
  {
    when: 'belowGroundWp',
    steps: [{
      step: 'Waterproof walls below ground',
      hazards: ['The excavation beside the wall collapses.', 'A fall into the excavation.', 'Fumes from primers and membranes in a confined excavation.', { only: 'torchOn', text: 'Burns from torch-on membranes.' }],
      controls: [
        'No one works in the excavation beside the wall unless its sides are battered, benched or shored as the excavation design requires, or the excavation is less than 1.5 m deep and the ground is stable.',
        'Access is by a secured ladder, and the edge has a barrier.',
        { fact: 'safetyDataSheet' },
        'Primers and membranes are used as their safety data sheets set out. In a narrow excavation, fumes are ventilated and no ignition sources are used near solvents.',
        { only: 'torchOn', text: 'Torch-on membrane is laid under a hot work permit, with an extinguisher at hand and gas cylinders kept upright at the top of the excavation, not in it.' },
        'Backfill is placed only after the membrane and its protection board are in place, and no one is in the excavation while it is backfilled.'
      ],
    }],
    ppe: ['gloveChemical', 'p2'],
  },
  {
    when: 'concreteRepair',
    steps: [{
      step: 'Break out and repair damaged concrete',
      hazards: ['Silica dust and noise from breaking out and grinding concrete.', 'Vibration from breakers and grinders.', 'Skin burns and sensitisation from repair mortars and coatings.', 'Concrete pieces fall onto people below.'],
      controls: [
        { fact: 'silicaControls' },
        src('Breaking out and grinding concrete is processing a crystalline silica substance: use tools with on-tool extraction or water, and wear a fit tested P2 respirator.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2')}`),
        ...SILICA_FOLLOW_UP,
        'Before breaking out, the extent is marked and the structure is checked by the engineer where reinforcement or load-bearing members are affected.',
        'Repair mortars, primers and coatings are used as their safety data sheets set out, with gloves and eye protection.',
        { only: 'crackInjection', text: 'Epoxy or polyurethane injection resins are mixed and injected as their safety data sheets set out, with chemical gloves and eye protection. Ports and packers are checked, and pressure is released before any fitting is undone.' },
        'The area below is barricaded, and loose concrete is removed before work moves on.',
        'Hearing protection when breaking or grinding, and use of vibrating tools is rotated.',
      ],
    }],
    ppe: ['p2', 'earMuffs', 'glassesClear', 'gloveChemical'],
  },
  {
    when: 'liftInstall',
    steps: [{
      step: 'Install the lift rails, car and machine',
      hazards: ['A fall down the open shaft.', 'A load falls in the shaft onto people below.', 'Being crushed by the car or counterweight.', 'Electric shock from the lift supply.'],
      controls: [
        'Landing openings stay barricaded except while a landing door is being fitted, and workers at an opening use travel restraint.',
        'Lifting beams and anchors are rated, tagged and proof tested before use, and loads are slung by licensed doggers or riggers where the work needs it.',
        'No one works under a load or below others in the shaft. Work in the pit happens only when nothing can fall from above.',
        'The car and counterweight are secured against movement whenever anyone works under or near them, and the machine is isolated and locked out.',
        'The lift supply is connected by a licensed electrician, and the lift is not used until it has been commissioned and certified.',
      ],
    }],
    ppe: ['harness', 'glassesClear'],
  },
  {
    when: 'asphaltLay',
    steps: [{
      step: 'Lay and roll asphalt',
      hazards: ['Burns from hot asphalt.', 'Fumes from hot bitumen.', 'Struck by the paver, roller or trucks.', 'Traffic next to the work.', 'Heat stress.'],
      controls: [
        'Only the plant operators and the crew needed are inside the work area, and everyone wears high visibility clothing. Trucks reverse only with a spotter in sight of the driver.',
        'Workers keep clear of the paver screed and roller, and make eye contact with the operator before approaching.',
        'Hot asphalt is handled with long sleeves, gloves and boots. Burns are cooled with water straight away.',
        'Work upwind of fumes where possible.',
        'Traffic management is in place before work starts, as the approved plan sets out.',
        'Cool water, shade and rest breaks in hot weather.',
      ],
    }],
    ppe: ['hivisNight', 'gloveGeneral', 'sunHat'],
  },
  {
    when: 'floorSanding',
    steps: [{
      step: 'Sand and finish timber floors',
      hazards: ['Fine wood dust from sanding.', 'Fire from dust and from solvent coatings.', 'Fumes and sensitisation from polyurethane finishes.', 'Noise.'],
      controls: [
        { only: 'deckRefinish', text: 'Deck strippers and cleaners are used as their safety data sheets set out, with chemical gloves and eye protection, and run-off is kept out of drains and gardens.' },
        'Sanders have dust bags or extraction, and a P2 respirator is worn while sanding.',
        { unless: 'deckRefinish', text: 'Dust bags are emptied into a metal bin outside the building at the end of each day, not left inside, as fine dust can catch fire.' },
        { fact: 'safetyDataSheet' },
        { unless: 'deckRefinish', text: 'Finishes are applied as their safety data sheets set out, with the room ventilated, no ignition sources, and the respirator the data sheet lists.' },
        { only: 'deckRefinish', text: 'Oils and stains are applied as their safety data sheets set out, and oily rags are spread out to dry or kept in a sealed metal bin, as they can self-heat and catch fire.' },
        'Hearing protection while sanding.',
      ],
    }],
    ppe: ['p2', 'earMuffs', 'gloveChemical'],
  },
  {
    when: 'rendering',
    steps: [{
      step: 'Apply render to walls',
      hazards: ['A fall from the scaffold or platform.', 'Skin burns from cement render.', 'Silica dust from mixing render and cutting or grinding masonry.', 'Strain mixing and applying render.'],
      controls: [
        { fact: 'fallControl' },
        'Render is mixed with a mixer or paddle, and bags are moved with a trolley.',
        'Gloves, long sleeves and eye protection are worn. Skin that touches wet render is washed straight away.',
        'Mixing dry render and cutting or grinding masonry is done with dust controls, and a P2 respirator is worn where dust remains.',
      ],
    }],
    ppe: ['gloveChemical', 'glassesClear', 'p2'],
  },
  {
    when: 'roofFittings',
    steps: [{
      step: 'Fix fittings on the roof',
      hazards: ['A fall from the roof edge or through the roof.', { only: 'ventReplace', text: 'A fall through the open vent hole.' }, 'Cuts from sheet metal and flashing edges.', 'Heat and sun on the roof.'],
      controls: [
        { fact: 'fallControl' },
        'Work at the edge is done behind edge protection or from a scaffold or EWP, not by leaning out from the roof.',
        'Brittle or fragile roofing and skylights are found and covered or fenced before anyone walks the roof.',
        'Cut resistant gloves are worn when handling mesh and flashings, and offcuts are bagged, not left on the roof.',
        { only: 'ventReplace', text: 'The old vent is unfixed and lifted off only when the new one is ready to go on, the opening is covered if it is left at all, and the new vent is fixed and sealed to the manufacturer\'s instructions.' },
        'Work is planned for the cooler part of the day in hot weather, with water and breaks.',
      ],
    }],
    ppe: ['gloveCut', 'sunHat', 'sunscreen'],
  },
  {
    when: 'restump',
    steps: [{
      step: 'Jack the house and replace stumps',
      hazards: ['The house drops or moves when jacked.', 'Crushed under the floor or house.', 'Striking services under the house.', 'Strain and awkward postures working under the floor.', 'Asbestos or lead in old sheeting and paint under the house.'],
      controls: [
        'Jacking points, jack capacities and the temporary supports are planned before work starts, and the engineer\'s design is followed where the house is raised or the structure altered.',
        'The house is jacked in small lifts and packed with timber or steel cribbing as it goes. No one goes under a part that is held only by a jack.',
        'Services (water, sewer, gas and power) are located and disconnected or made flexible by licensed trades before the house is raised.',
        'Holes for new stumps are dug by hand or machine after the services are located, and backfilled or covered when left.',
        'Work under the floor is broken up with breaks, with knee pads and enough lighting.',
        'Sheeting and paint on older houses are checked for asbestos and lead before they are disturbed.',
      ],
    }],
    ppe: ['kneePads', 'gloveGeneral'],
  },
  {
    when: 'flueInstall',
    steps: [{
      step: 'Install the heater and flue',
      hazards: ['A fall from the roof while fitting the flue and cowl.', 'The heater is heavy and can crush or strain.', 'Fire if the flue or heater is too close to combustible materials.', 'Cuts from sheet metal.'],
      controls: [
        { fact: 'fallControl' },
        'The heater is moved with a trolley or by two people, and set on a hearth that takes its weight.',
        'Clearances from the heater and flue to combustible materials follow the manufacturer\'s instructions and AS/NZS 2918.',
        'The roof penetration is flashed and sealed, and the flue is supported and braced as the manufacturer requires.',
        'Cut resistant gloves when handling flue sections and flashings.',
      ],
    }],
    ppe: ['gloveCut'],
  },
  {
    when: 'testTag',
    steps: [{
      step: 'Inspect, test and tag electrical equipment',
      hazards: ['Electric shock from damaged equipment during testing.', 'Equipment in use is switched off without warning.'],
      controls: [
        'Testing is done by a competent person, to AS/NZS 3760 or AS/NZS 3012 for construction equipment, with a calibrated tester.',
        'Equipment is visually inspected before it is tested, and damaged items are tagged out of service straight away.',
        'Equipment is unplugged before it is tested, and users are told before their equipment is taken out of use.',
        'Each item passed is tagged with the test date, the retest date and the tester\'s name, and results are recorded.',
      ],
    }],
    ppe: [],
  },
  {
    when: 'edgeProtectionInstall',
    steps: [{
      step: 'Install or remove edge protection',
      hazards: ['A fall from the edge while the edge protection is being installed or removed.', 'Components fall onto people below.'],
      controls: [
        'Edge protection is installed working back from the edge, or by workers using travel restraint set so they cannot reach the edge.',
        'Posts and clamps are fixed to the manufacturer\'s instructions, and each section is complete before workers move along it.',
        'An exclusion zone is set up below, and components are not stacked at the edge.',
        'Edge protection is removed only when the edge is no longer needed, or a permanent barrier is in place.',
      ],
    }],
    ppe: ['harness'],
  },
  {
    when: 'rockBreak',
    steps: [{
      step: 'Break rock with a hydraulic hammer',
      hazards: ['Flying rock and chips strike people.', 'Silica dust from breaking rock.', 'Noise and vibration.', 'Plant overturns at an excavation edge.'],
      controls: [
        'An exclusion zone is kept around the hammer, and only the operator is inside it.',
        src('Breaking is done with water sprays to keep dust down, and anyone in the area still at risk wears a fit tested P2 respirator.', WHS('s 529B, s 529C')),
        ...SILICA_FOLLOW_UP.slice(0, 2),
        'Hearing protection is worn within the signposted area, and operators\' exposure to vibration is managed by rotating tasks.',
        'The excavator carrying the hammer stays back from excavation edges and works on firm level ground.',
      ],
    }],
    ppe: ['earMuffs', 'p2', 'glassesClear'],
  },
  {
    when: 'drainClear',
    steps: [{
      step: 'Clear the drain with a drain machine or jetter',
      hazards: ['Hands caught in the rotating drain cable.', 'High pressure water from the jetter hose.', { unless: 'stormwaterOnly', text: 'Sewage on the skin or in the eyes.' }, { unless: 'stormwaterOnly', text: 'Gases from the drain.' }],
      controls: [
        'Drain machines are used with their guards, a foot switch and leather drain cleaning gloves, and the cable is never held by hand while it rotates.',
        'Jetter hoses and nozzles are rated for the pressure, and the nozzle is in the pipe before the pump starts.',
        'Gloves and eye protection are worn, cuts are covered, and hands are washed before eating.',
        'No one enters a pit or manhole without a confined space assessment.',
      ],
    }],
    ppe: ['gloveChemical', 'glassesClear', 'gumboots'],
  },
  {
    when: 'signageInstall',
    steps: [{
      step: 'Install signs and screens',
      hazards: [{ unless: 'signPostsOnly', text: 'A fall from the EWP or ladder.' }, { unless: 'signPostsOnly', text: 'The sign or screen falls while it is lifted or fixed.' }, { only: 'signPostsOnly', text: 'Striking buried services when digging post holes.' }, { unless: 'signPostsOnly', text: 'Electric shock connecting lit signs.' }, { unless: 'signPostsOnly', text: 'People below are struck by falling items.' }, { only: 'signPostsOnly', text: 'Vehicles in the car park or road strike workers.' }],
      controls: [
        { fact: 'fallControl' },
        { unless: 'signPostsOnly', text: 'Signs and screens are lifted with a crane, hoist or EWP rated for the load, not carried up ladders.' },
        { unless: 'signPostsOnly', text: 'Fixings into the facade suit the wall and the load, as the designer specifies.' },
        'An exclusion zone is set up below, with any footpath closure the council requires.',
        { unless: 'signPostsOnly', text: 'Power to lit signs and screens is connected by a licensed electrician.' },
        { only: 'signPosts', text: 'Sign posts are set in holes dug only after services are located, or bolted to a slab after it is scanned, and the area is closed to vehicles while they go in.' },
      ],
    }],
    ppe: ['harness'],
  },
  {
    when: 'fuelTankRemoval',
    steps: [{
      step: 'Remove the fuel tanks',
      hazards: ['Fire or explosion from fuel vapour in the tank.', 'Contaminated soil and groundwater.', 'The excavation collapses.', 'The tank falls while it is lifted.'],
      controls: [
        'Tanks are emptied, and the vapour is removed or made inert and tested with a gas detector, before any cutting or lifting.',
        'No ignition sources are allowed in the hazardous area around the tank and excavation.',
        'Contaminated soil and water are tested, handled and disposed of as the environmental consultant and the regulator require.',
        'The excavation is battered, benched or shored where people work in or near it.',
        'The excavator is run by a competent operator, stays back from the excavation edge, and works inside an exclusion zone. Services and fuel lines are located before digging.',
        'Where a crane lifts the tank, it is slung by licensed doggers and no one stands under the load.',
      ],
    }],
    ppe: ['gloveChemical', 'p2'],
  },
  {
    when: 'fuelSystems',
    steps: [{
      step: 'Install fuel dispensers and lines',
      hazards: ['Fire or explosion from fuel vapour.', 'Fuel on the skin.', 'Struck by vehicles at an operating site.'],
      controls: [
        'The hazardous areas are identified, and no ignition sources are used in them unless a hot work permit is in place.',
        'Existing tanks and lines are isolated, drained and tested free of vapour before they are opened.',
        'New lines are pressure tested before fuel is introduced.',
        'The work area is barricaded from customer vehicles.',
        'Electrical work in hazardous areas is done by licensed electricians competent in hazardous area work.',
      ],
    }],
    ppe: ['gloveChemical'],
  },
  {
    when: 'accessFloor',
    steps: [{
      step: 'Install raised access flooring',
      hazards: ['A fall into an open floor void.', 'Strain lifting floor panels.', 'Cuts from panel edges.', 'Damage to cables under the floor.'],
      controls: [
        'Open voids are barricaded, and only the panels being worked on are lifted.',
        'Panels are lifted with suction lifters, and stacks are kept low.',
        'Cut resistant gloves are worn when cutting and handling panels.',
        'Cables under the floor are treated as live until the electrician confirms otherwise.',
      ],
    }],
    ppe: ['gloveCut', 'kneePads'],
  },
  {
    when: 'pumpInstall',
    steps: [{
      step: 'Install the pump and pipework',
      hazards: ['The pump falls while it is lifted or lowered.', 'Strain handling pumps and pipe.', 'Electric shock connecting the pump.', 'A fall into an open bore, pit or well.'],
      controls: [
        'Where a pump is too heavy to handle by hand, it is lifted or lowered with a hoist, tripod or crane rated for the load, and no one stands under the load.',
        'Openings, bores and pits are covered or barricaded when not being worked on.',
        'Pipe is moved with mechanical aids or by two people.',
        { only: 'pressureTank', text: 'The pressure tank is set on a level base, its pre-charge and relief valve are set to the manufacturer\'s instructions, and the system is pressurised slowly with the area clear.' },
        'The pump\'s electrical connection is made by a licensed electrician.',
      ],
    }],
    ppe: ['gloveGeneral'],
  },
  {
    when: 'lightningProtection',
    steps: [{
      step: 'Install lightning protection',
      hazards: ['A fall from the roof edge or from the facade access.', 'Tools and materials fall onto people below.', 'Striking buried services when installing earth electrodes.'],
      controls: [
        { fact: 'fallControl' },
        'Down conductors on the facade are installed from an EWP, swing stage or scaffold set out in the fall controls.',
        'An exclusion zone is set up below the work.',
        'Services are located before earth electrodes are driven or buried.',
      ],
    }],
    ppe: ['harness'],
  },
  {
    when: 'abrasiveBlast',
    steps: [{
      step: 'Abrasive blast and repaint steel',
      hazards: ['Lead and other heavy metals in old paint.', 'Dust from the blasting media.', 'Struck by the blast stream or a whipping hose.', 'Noise.', 'A fall from the access platform.'],
      controls: [
        src('Old paint is tested for lead before blasting. Removing paint with more than 1% lead by abrasive blasting is a lead process, with the controls and health monitoring the regulation sets.', WHS('s 392')),
        src('The blasting media contains no more than 1% free crystalline silica.', WHS('schedule 10')),
        'The blast area is enclosed to contain dust and spent media, and only the blaster is inside it.',
        'Blasters wear an air-supplied blasting helmet, and hoses have whip checks. The deadman control is never tied down.',
        'Hearing protection in the signposted area.',
        { fact: 'fallControl' },
      ],
    }],
    ppe: ['earMuffs', 'gloveGeneral'],
  },
  {
    when: 'vehicleHoist',
    steps: [{
      step: 'Install the vehicle hoist',
      hazards: ['Hoist columns or arms fall while they are stood or moved.', 'The hoist pulls out of a slab that cannot carry it.', 'Electric shock or hydraulic fluid injection when connecting and testing.', 'A person is crushed under a raised hoist or vehicle.'],
      controls: [
        src('A vehicle hoist is plant whose design is registered. The design registration number is sighted before it is installed.', WHS('s 243, schedule 5')),
        'Installed to the manufacturer\'s instructions by competent installers. The slab thickness and strength are checked against the manufacturer\'s anchor requirements before drilling, and anchors are torqued as specified.',
        'Columns and arms are stood with a forklift, crane truck or gantry within its rated capacity, and held or braced until they are anchored.',
        'Power to the hoist is connected by a licensed electrician. Hydraulic lines are fitted and bled to the manufacturer\'s instructions, and no one puts a hand near a pressurised leak.',
        'No one goes under a raised hoist until its mechanical locks are engaged. The hoist is load tested and commissioned to the manufacturer\'s instructions before it is handed over.',
      ],
    }],
  },
  {
    when: 'beamInstall',
    steps: [{
      step: 'Lift and fix the new beam or lintel',
      hazards: ['The beam or lintel falls while it is lifted into place.', 'Strain lifting heavy steel.', 'The structure above drops onto the beam before it is fixed and packed.'],
      controls: [
        { only: 'lintelReplace', text: 'The old lintel is cut out only after the masonry above is propped or needled, and loose bricks are removed from the top down.' },
        'The beam or lintel, its bearings and its fixings are to the engineer\'s design.',
        src('Heavy beams and lintels are lifted with a material lift, block and tackle, a gantry or plant, not carried up ladders. Team lifts are planned, with the load shared and the route clear.', `${WHS('s 60')}; ${QCODE('Hazardous manual tasks', 's 4.4, s 4.5')}`),
        'The beam is fully seated and packed on its bearings, and fixed, before any prop is taken out.',
        'Props are removed only when the engineer or the person who designed the propping says it is safe.',
      ],
    }],
  },
  {
    when: 'underslabDrainage',
    steps: [{
      step: 'Lay drainage under the slab or floor',
      hazards: ['Trench sides fall in.', 'Strain from digging, bending and lifting pipe.', 'Primer and solvent cement vapour.', 'Trips and falls into open trenches.'],
      controls: [
        'Trenches stay shallower than 1.5 m, with sides battered or supported where the ground is loose or wet. If a trench needs to go deeper, work stops and the SWMS is reviewed.',
        'Pipes are laid and graded to the drainage plan, and bedded and backfilled as the plumbing standard requires.',
        'Primer and solvent cement are used with ventilation, gloves and eye protection, and kept away from ignition sources.',
        'The drainage is tested and inspected before it is covered, as the plumbing regulator requires.',
        'Open trenches are fenced or covered when no one is working at them.',
        { only: 'subfloor', text: 'Work under an existing floor is done from the subfloor where there is room: the access is checked, sewage is treated as infectious, and the space is assessed as a confined space only if it meets the definition. Where a slab must be cut, it is scanned and saw cut with water or extraction.' },
      ],
    }],
    ppe: ['gloveChemical', 'glassesClear'],
  },
  {
    when: 'trafficSignals',
    steps: [{
      step: 'Install signal or lighting poles, pits and conduits',
      hazards: ['Struck by passing traffic.', 'A pole falls while it is lifted or stood.', 'Striking underground services or overhead lines.', 'Electric shock connecting to the supply.'],
      controls: [
        'All work is inside the closure set out in the traffic management plan, with traffic controllers where the plan requires them.',
        'Underground services are located before pits and conduits are dug, and plant keeps its approach distances from overhead lines.',
        { only: 'polesNamed', text: 'Poles are lifted and stood with a crane truck or EWP by licensed operators and doggers, with an exclusion zone under the load, and bolted to their footings before the slings are released.' },
        'Signal and lighting wiring and the connection to the supply are electrical work for a licensed electrician accredited by the road authority or network operator, and the supply is isolated and proved de-energised before the connection.',
      ],
    }],
    ppe: ['hivis'],
  },
  {
    when: 'footingHoles',
    steps: [{
      step: 'Dig footing holes',
      hazards: ['Striking buried services.', 'Back strain from digging.', 'People stepping into open holes.'],
      controls: [
        src('Get the current underground services information, for example through Before You Dig Australia, before digging, and work to it.', WHS('s 304')),
        'Dig with spades and post hole shovels, take turns, and keep loads small. A powered auger is used only with both hands on the handles and stopped before it is cleared.',
        'Open holes are covered or fenced when no one is working at them.',
      ],
    }],
  },
  {
    when: 'tileRoofStrip',
    steps: [{
      step: 'Strip roof tiles and fix new battens and sarking',
      hazards: ['A fall from the roof edge or through the battens.', 'Tiles fall onto people below.', 'Strain lifting stacks of tiles.', 'Silica dust from cutting concrete or terracotta tiles.'],
      controls: [
        { fact: 'fallControl' },
        'Tiles are passed down by a chute, hoist or materials lift into a closed area, never thrown.',
        'An exclusion zone is kept under the roof edge and the chute while tiles are removed.',
        'Workers walk only on the battens over the trusses, and sarking is never stood on.',
        'Battens are fixed to the trusses as the manufacturer and the roofing standard require, working up from the eaves.',
        src('Tiles are cut with a wet saw or a saw with on-tool extraction, and a fit tested P2 respirator is worn.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2')}`),
      ],
    }],
    ppe: ['p2', 'earPlugs'],
  },
  {
    when: 'treeOnRoof',
    steps: [{
      step: 'Remove the fallen tree from the roof',
      hazards: ['The tree shifts or rolls as it is cut.', 'A fall through the damaged roof.', 'Chainsaw cuts and kickback.', 'Branches or the trunk fall onto people below.'],
      controls: [
        'A qualified arborist plans the removal, working out how the tree is held and which way each piece will move before it is cut.',
        'Where the tree is large, it is held or lifted off in sections by a crane company, with licensed doggers, before or as it is cut.',
        'No one walks on the damaged part of the roof. Work is done from an EWP, or from roof areas the supervisor has checked will carry them, with fall protection.',
        'Chainsaws are used only by trained operators wearing chainsaw chaps, gloves, a helmet with visor and hearing protection.',
        'An exclusion zone is kept under the work, and power to any damaged lines or the house is checked and made safe first.',
      ],
    }],
    ppe: ['earMuffs', 'gloveCut'],
  },
  {
    when: 'flyScreens',
    steps: [{
      step: 'Fit fly screens and security doors',
      hazards: ['Strain lifting heavy security doors.', 'Cuts from mesh and aluminium edges.', 'A fall from a ladder at upper windows.', 'Drilling into hidden wiring.'],
      controls: [
        'Heavy security doors are lifted by two people or with a door lifter.',
        'Gloves are worn when cutting and handling mesh and frames.',
        'Upper storey screens are fitted from inside where possible. Where a ladder is used, it is a platform ladder, set up on firm level ground.',
        'Check for wiring before drilling near switches and power points.',
      ],
    }],
  },
  {
    when: 'mezzanineFloor',
    steps: [{
      step: 'Lay the mezzanine floor',
      hazards: ['A fall from the open edge of the mezzanine.', 'A fall through unfixed floor sheets or gaps.', 'Floor sheets or panels fall onto people below.'],
      controls: [
        { fact: 'fallControl' },
        'Edge protection is fitted to the open edges before floor sheets are laid, or work is done from an EWP below.',
        'Floor sheets are fixed as they are laid. No one walks on loose or unsupported sheets.',
        'Packs of sheets are landed only where the structure is designed to carry them, and an exclusion zone is kept below.',
        'The permanent balustrade and stair are fitted before the floor is used.',
      ],
    }],
  },
  {
    when: 'hydroBlast',
    steps: [{
      step: 'Water blast the surfaces',
      hazards: ['High pressure water penetrates the skin.', 'The lance kicks back or the hose whips.', 'Flying paint, rust and debris.', 'Lead or other hazards in old paint.'],
      controls: [
        'Water blasting is done only by trained operators, to AS/NZS 4233.1, with a dead man control on the lance, hoses and fittings rated for the pressure, and whip checks on the joints.',
        'An exclusion zone is kept around the operator and below the work, with signs.',
        'Operators wear a face shield, waterproof clothing and boots rated for water blasting, and hearing protection.',
        'Old paint is tested for lead before blasting. Where it contains lead, the run-off and debris are captured and the lead risk is controlled.',
      ],
    }],
    ppe: ['earMuffs', 'gumboots'],
  },
  {
    when: 'sprayFoam',
    steps: [{
      step: 'Spray polyurethane foam insulation',
      hazards: ['Breathing isocyanate vapour and mist.', 'Skin and eye sensitisation from isocyanates.', 'Fire from the foam or its chemicals.', 'High pressure hoses from the spray rig.'],
      controls: [
        { fact: 'safetyDataSheet' },
        src('The sprayer wears a supplied air respirator or the respirator the safety data sheet requires, with chemical gloves, coveralls and eye protection.', WHS('s 44, s 49')),
        'The area is closed to everyone else while spraying and until the foam has cured and the space has been ventilated.',
        src('Workers exposed to isocyanates where there is a significant risk to health have health monitoring.', WHS('s 368, schedule 14')),
        'No hot work or other ignition source is near the foam or the chemicals, and an extinguisher is at hand.',
        'Spray rig hoses and fittings are rated for the pressure and checked before use.',
      ],
    }],
    ppe: ['gloveChemical'],
  },
  {
    when: 'precastStair',
    steps: [{
      step: 'Land and fix the precast stair',
      hazards: ['The stair falls or swings while it is lifted.', 'A fall into the stair void or from the landing edge.', 'Hands crushed as the stair is landed.'],
      controls: [
        'The stair is lifted on its cast-in lifting inserts with the rigging the precast designer specifies, by licensed doggers and the crane company.',
        'The stair void and landing edges have edge protection, or workers wear a harness anchored to a rated point, while the stair is landed.',
        'Tag lines are used, and hands stay clear of the bearing until the stair is landed.',
        'The stair stays on the crane until it is seated on its bearings and fixed or propped as the designer requires.',
      ],
    }],
  },
  {
    when: 'ceilingPipework',
    steps: [{
      step: 'Replace pipework in the ceiling',
      hazards: ['A fall from a ladder or platform.', 'Water released when the pipe is cut.', 'Burns and fire from brazing.', 'Dust from opening ceilings in occupied areas.'],
      controls: [
        { fact: 'fallControl' },
        'The water supply to the section is isolated and drained before the pipe is cut, and the occupants are told when water will be off.',
        'Brazing is hot work under the site\'s hot work permit, with combustibles moved or covered, an extinguisher at hand and a fire watch afterwards. Smoke detectors are isolated only under the building\'s procedure.',
        'Ceiling tiles are lifted and the work area screened so dust does not reach occupied areas.',
      ],
    }],
  },
  {
    when: 'deckingStuds',
    steps: [{
      step: 'Lay metal decking and weld shear studs',
      hazards: ['A fall from the leading edge or through gaps in the decking.', 'Decking sheets blown off or slipping.', 'Arc flash, UV and fumes from stud welding.', 'Fire from welding sparks.'],
      controls: [
        { fact: 'fallControl' },
        'Bundles are landed only on the beams at the points the erection sequence allows, and the bands are cut only once the bundle is secure.',
        'Sheets are laid from a protected edge or over safety nets, and fixed as they are laid. Penetrations are covered and marked.',
        'Loose sheets are not left out in wind.',
        'Stud welding is done with screens, eye and face protection rated for welding, and ventilation. Cables and the stud welder are checked before use.',
        'Hot work is done under the site\'s hot work permit, with an extinguisher at hand and a fire watch below.',
      ],
    }],
    ppe: ['earPlugs'],
  },
  {
    when: 'shadeSail',
    steps: [{
      step: 'Install shade sail posts and sails',
      hazards: ['A post falls while it is lifted or stood.', 'A sail fitting or cable lets go under tension.', 'A fall from the EWP or ladder.', 'Children or the public near the work.'],
      controls: [
        'Posts are lifted and stood with a crane truck or excavator within its rated capacity, and braced until the footing concrete has cured.',
        'Sails are tensioned with the fittings and turnbuckles the designer specifies, standing clear of the line of the cable.',
        'Sail fixings at height are done from an EWP or a platform ladder.',
        'The work area is fenced off from children, students and the public, as the school or site manager agrees.',
      ],
    }],
  },
  {
    when: 'boxGutter',
    steps: [{
      step: 'Replace the box gutter',
      hazards: ['A fall from the roof edge or the parapet.', 'A fall through roof sheets or skylights beside the gutter.', 'Cuts from sheet metal.', 'Strain lifting long gutter sections.'],
      controls: [
        { fact: 'fallControl' },
        'Roof sheets and skylights beside the gutter are treated as fragile unless known to be safe, and covered or protected with mesh or barriers.',
        'Gutter sections are lifted to the roof with a hoist, crane or EWP, not carried up ladders.',
        'Gloves are worn when handling and cutting sheet metal.',
        'The building\'s downpipes are kept clear, and the work is protected from rain.',
      ],
    }],
  },
  {
    when: 'membraneRepair',
    steps: [{
      step: 'Repair the roof membrane',
      hazards: [{ only: 'torchOn', text: 'Burns and fire from torch-on membrane.' }, 'Fumes from primers and adhesives.', 'A fall through skylights or fragile areas.'],
      controls: [
        { fact: 'safetyDataSheet' },
        { only: 'torchOn', text: 'Torch-on work is hot work under the site\'s hot work permit, with an extinguisher at hand, gas cylinders kept upright and away from the flame, and a fire watch afterwards.' },
        'Primers and adhesives are used as their safety data sheets set out, with ventilation, gloves and eye protection.',
        'Skylights and fragile areas near the repair are covered or barricaded.',
      ],
    }],
    ppe: ['gloveChemical'],
  },
  {
    when: 'meterInstall',
    steps: [{
      step: 'Install water meters and backflow devices',
      hazards: ['Water under pressure when the supply is opened.', 'Strain lifting heavy valves and meters.', 'Falls into open meter pits.'],
      controls: [
        'Installing meters and backflow devices is plumbing work for a licensed plumber, and testable backflow devices are tested and commissioned by a plumber accredited to test them.',
        { unless: 'waterConnection', text: 'The supply is isolated and the line depressurised before it is cut, and opened slowly once the joints are complete.' },
        'Heavy valves and meters are lifted with two people or a lifting aid.',
        'Open pits are covered or fenced when no one is working at them.',
      ],
    }],
  },
  {
    when: 'tankPlace',
    steps: [{
      step: 'Lift and place tanks, pits or precast units',
      hazards: ['The load swings or falls while it is lifted.', 'A person in the excavation is struck by the load.', 'The excavation edge collapses under the plant.'],
      controls: [
        'Tanks, pits and precast units are lifted on their lifting points with rigging rated for the load, by a licensed operator and dogger where a crane is used.',
        'No one is in the excavation while a unit is lowered. Workers guide it with tag lines from outside the excavation.',
        'Plant stands back from the excavation edge as the excavation design or a competent person sets out.',
      ],
    }],
  },
  {
    when: 'jettyRepair',
    steps: [{
      step: 'Remove and replace damaged timbers',
      hazards: ['A fall through the opened deck.', 'Cuts and kickback from saws.', 'Dust from treated timber.', 'Heavy timbers fall or swing while they are moved.'],
      controls: [
        { fact: 'fallControl' },
        'Openings in the deck are barricaded or covered as soon as boards are removed.',
        { unless: 'heavyTimbers', text: 'Bearers and long timbers are carried by two people or moved on a trolley, and set down, not dropped.' },
        'Saws are used with their guards, and timber is cut on a stable bench or the deck, never held overhanging an edge by hand.',
        'Treated timber is cut with dust extraction or outdoors with a P2 respirator, and offcuts are disposed of as the treatment requires, never burned.',
        { only: 'heavyTimbers', text: 'Piles and bearers are lifted with plant rated for the load, with an exclusion zone and tag lines.' },
      ],
    }],
    ppe: ['p2', 'earPlugs'],
  },
  {
    when: 'floodClean',
    steps: [{
      step: 'Strip flood-damaged linings and insulation',
      hazards: ['Electric shock from wet wiring or switchboards.', 'Contaminated floodwater, mud and mould.', 'Strain lifting wet, heavy plasterboard.', 'Asbestos in older linings.'],
      controls: [
        'Power stays off until a licensed electrician has inspected the installation and says it is safe to turn on.',
        'Gloves, boots, eye protection and a P2 respirator are worn when handling wet linings, insulation and mud. Cuts are covered and hands washed before eating.',
        'Wet plasterboard and insulation are cut into small pieces and bagged or wheeled out.',
        'Linings in a building built before 2004 (asbestos products were used until the national ban at the end of 2003) are checked for asbestos before they are removed.',
      ],
    }],
    ppe: ['gloveChemical', 'p2', 'gumboots'],
  },
  {
    when: 'wallpaperStrip',
    steps: [{
      step: 'Strip wallpaper',
      hazards: ['Burns from the steamer and hot water.', 'Cuts from scrapers.', 'A fall from a ladder or step.', 'Lead in old paint under the paper.'],
      controls: [
        'The steamer is filled and used to the manufacturer\'s instructions, with gloves, and never left on unattended.',
        'Scrapers are used with the blade pushed away from the body.',
        'High walls are reached from a platform ladder or work platform, not by over-reaching.',
        'In a building built before 1970, paint under the paper is tested for lead before it is sanded, and dry sanding is not used on lead paint.',
      ],
    }],
  },
  {
    when: 'underfloorHeating',
    steps: [{
      step: 'Lay underfloor heating cables',
      hazards: ['Electric shock from a damaged cable.', 'Knee and back strain at floor level.', 'Cables damaged by the tiler.'],
      controls: [
        'Heating cables and mats are laid to the manufacturer\'s instructions, and the insulation resistance is tested before, during and after tiling.',
        'The tiler is told where the cables are, and uses plastic trowels over them.',
        'The connection to the supply is electrical work for a licensed electrician, with the circuit isolated and proved de-energised first.',
        'Knee pads, and tasks rotated to limit time kneeling.',
      ],
    }],
    ppe: ['kneePads'],
  },
  {
    when: 'wallDrainage',
    steps: [{
      step: 'Install drainage and backfill behind the retaining wall',
      hazards: ['The cut behind the wall collapses.', 'The wall is pushed over by plant or backfill.', 'Strain shovelling gravel.'],
      controls: [
        'No one works between the wall and an unstable cut. The cut is battered, or work stops and the SWMS is reviewed.',
        'The ag drain, geotextile and drainage gravel are laid as the wall designer specifies.',
        'Backfill is placed and compacted in layers with a plate compactor, and plant stays back from the wall as its designer requires.',
        'Gravel is moved with a bobcat or wheelbarrow, and shovelling is shared.',
      ],
    }],
  },
  {
    when: 'footpathClosure',
    steps: [{
      step: 'Set up traffic barriers and temporary fencing',
      hazards: ['Struck by passing traffic.', 'Strain lifting barriers and fence panels.', 'Fencing blown over by wind.'],
      controls: [
        'Barriers are placed in the order the traffic management plan sets out, working from the protected side.',
        'Water-filled and concrete barriers are moved with plant or trolleys, and filled once in place.',
        'Fence panels are clamped and braced or weighted for the wind loading on any shade cloth or signs.',
        'A clear, signed pedestrian route is kept around the closure.',
      ],
    }],
    ppe: ['hivis'],
  },
  {
    when: 'bmuClean',
    steps: [{
      step: 'Clean windows from the building maintenance unit',
      hazards: ['A fall from the BMU cradle.', 'The BMU fails or strikes the building in wind.', 'Dropped tools or water onto people below.', 'Cleaning chemicals on the skin or in the eyes.'],
      controls: [
        'The BMU is used only by workers trained in its operation, to the building\'s BMU operating manual, after the daily pre-use check.',
        'The BMU has a current inspection and registration, and workers wear a harness attached to the anchor in the cradle.',
        'Work stops when wind or weather exceeds the limits in the BMU manual.',
        'The area below is closed off, and tools and buckets are tethered.',
        'Cleaning chemicals are used as their safety data sheets set out, with gloves and eye protection.',
      ],
    }],
    ppe: ['harness', 'gloveChemical'],
  },
  {
    when: 'officeStrip',
    steps: [{
      step: 'Strip out ceilings, partitions and floor coverings',
      hazards: ['A fall from a platform or ladder while removing ceilings.', 'Ceiling tiles, grid and services fall.', 'Asbestos in older ceilings, partitions and floor coverings.', 'Strain carrying waste.'],
      controls: [
        'Services in the ceilings and partitions are isolated and made safe by the licensed trades before strip-out.',
        'Ceilings are removed from a mobile scaffold or platform ladder, working from one side to the other so loose grid is not overhead.',
        'In a building built before 2004 (asbestos products were used until the national ban at the end of 2003), ceilings, partitions, vinyl and adhesives are checked against the asbestos register, or tested where there is none, before they are disturbed.',
        'Waste goes down in bins on the goods lift or a hoist, not carried down stairs or dropped.',
      ],
    }],
  },
  {
    when: 'coolroomPanels',
    steps: [{
      step: 'Erect coolroom panels',
      hazards: ['Panels topple while they are stood.', 'Strain lifting large panels.', 'A fall from the top of the panels or a ladder.'],
      controls: [
        'Panels are moved with trolleys or panel lifters, and stood by two or more people.',
        'Wall panels are braced until they are joined and the ceiling panels are fixed.',
        'Ceiling panels are fixed from a platform or EWP, and no one walks on them unless they are rated for it.',
        'Sealants are used as their safety data sheets set out.',
        'Refrigeration connections are made only by the holder of a refrigerant handling licence, and electrical connections by a licensed electrician.',
      ],
    }],
  },
  {
    when: 'roofPenetration',
    steps: [{
      step: 'Cut and flash the roof penetration',
      hazards: ['A fall through the opening.', 'Sparks and hot swarf from cutting sheet metal.', 'Cuts from sheet edges.'],
      controls: [
        { fact: 'fallControl' },
        'The opening is covered or barricaded as soon as it is cut, until the duct or upstand is in place.',
        'Sheets are cut with nibblers or shears where possible. Where a grinder is used, swarf is cleaned off the roof and nearby combustibles are protected.',
        'Gloves are worn handling cut sheets.',
        'The flashing is sealed to the manufacturer\'s instructions so the roof stays watertight.',
      ],
    }],
  },
  {
    when: 'workAbove',
    steps: [{
      step: 'Work above traffic or a rail line',
      hazards: ['Tools, paint or materials fall onto traffic or trains below.', 'Struck by passing traffic while setting up.'],
      controls: [
        'Lanes or tracks below are closed under the road authority\'s or rail operator\'s permit, or catch screens or platforms are fitted, before work starts above them.',
        'Tools and materials are tethered, and drop sheets and spray are contained.',
        'Access is from an EWP or scaffold set up inside the closure.',
      ],
    }],
  },
  {
    when: 'splitInstall',
    steps: [{
      step: 'Install split system indoor and outdoor units',
      hazards: ['A fall from a balcony, roof or ladder while fitting outdoor units or wall brackets.', 'Strain lifting outdoor units.', 'Drilling into hidden wiring, pipes or reinforcement.', 'Silica dust from core drilling walls.'],
      controls: [
        { fact: 'fallControl' },
        'Outdoor units on balconies are set down from inside the balustrade. No one climbs on or leans over the balustrade, and units on walls or roofs above 2 m are fitted from an EWP, scaffold or platform.',
        'Outdoor units are carried by two people or lifted with a trolley or lifting aid.',
        'Walls are checked for wiring, pipes and reinforcement before drilling. Core holes are drilled with water or on-tool extraction, with a P2 respirator worn.',
        ...SILICA_FOLLOW_UP.slice(0, 2),
        'The power connection is electrical work for a licensed electrician, with the circuit isolated and proved de-energised first.',
      ],
    }],
    ppe: ['p2'],
  },
  {
    when: 'gateInstall',
    steps: [{
      step: 'Install boom gates and automatic gates',
      hazards: ['A gate or boom falls or swings while it is fixed.', 'Struck by vehicles at the entry.', 'Crushed or struck when the gate or boom is first run.', 'Electric shock connecting the motor.'],
      controls: [
        'The entry is closed to vehicles, or traffic is diverted around the work with barriers and signs, while the gate or boom is installed.',
        'Footings and conduits for gates, booms and ticket machines are dug only after services are located.',
        'Gate leaves, posts and boom housings are lifted with two people or a lifting aid and propped until fixed to their footings or anchors.',
        'Wiring and the power connection are electrical work for a licensed electrician, with the circuit isolated first.',
        'The gate or boom is commissioned with the area closed off, and its safety sensors, loops and force limits are tested before it is used.',
      ],
    }],
    ppe: ['hivis'],
  },
  {
    when: 'poolEquipment',
    steps: [{
      step: 'Install the pool pump and filter',
      hazards: ['Electric shock near water.', 'Strain lifting the pump and filter.', 'Chemicals and fumes from pool water and primers.'],
      controls: [
        'The pump and filter are set on a level base clear of the pool edge, and lifted by two people or with a trolley.',
        'Pipework is joined with primer and solvent cement used with ventilation and gloves.',
        'Hard wiring, new power points and any change to the circuit are electrical work for a licensed electrician. Equipment is plugged into an RCD protected outlet, with the lead clear of water.',
        'Pool chemicals are handled as their safety data sheets set out, with gloves and eye protection.',
      ],
    }],
    ppe: ['gloveChemical'],
  },
  {
    when: 'escalatorInstall',
    steps: [{
      step: 'Install the escalator',
      hazards: ['The truss falls or swings while it is lifted into the building.', 'A fall into the escalator well or pit.', 'Crushing by moving steps or the drive.', 'Electric shock during commissioning.'],
      controls: [
        src('An escalator is plant whose design and item are registered. The registration numbers are sighted before it is installed and before it is used.', WHS('s 243, s 246, schedule 5')),
        'The truss is lifted on the lift plan by the crane company or licensed riggers, with an exclusion zone under the load.',
        'Openings and wells are barricaded with edge protection until the escalator and its balustrades are in place.',
        'The drive is isolated and locked out before anyone works on the steps, drive or pit. Commissioning is done by the escalator contractor with the area closed to the public.',
      ],
    }],
  },
  {
    when: 'tieDowns',
    steps: [{
      step: 'Fit cyclone tie-downs',
      hazards: ['A fall from the roof or through the ceiling.', 'Heat in the roof space.', 'Drilling into hidden wiring.', 'Strain working in tight roof spaces.'],
      controls: [
        { fact: 'fallControl' },
        'Tie-downs, straps and bolts are fitted to the engineer\'s or the manufacturer\'s details.',
        'Cables are checked for before drilling.',
      ],
    }],
  },
  {
    when: 'palletRacking',
    steps: [{
      step: 'Install pallet racking',
      hazards: ['Uprights or beams fall while racking is assembled.', 'A fall from the EWP or ladder.', 'Struck by forklifts in an operating warehouse.', 'Drilling the slab releases silica dust.'],
      controls: [
        'Racking is installed to the manufacturer\'s design and AS 4084, with base plates anchored and beams locked with their safety clips.',
        'Upper beams are fitted from an EWP or scissor lift, never by climbing the racking.',
        'The work area is barricaded from forklifts and other plant, as the site manager arranges.',
        'Slab drilling for anchors is done with on-tool extraction, and a P2 respirator is worn.',
        'Load signs showing the rated capacity are fixed to each bay before it is used.',
      ],
    }],
    ppe: ['p2'],
  },
  {
    when: 'antennaInstall',
    steps: [{
      step: 'Install rooftop antennas and equipment',
      hazards: [{ only: 'rfEquipment', text: 'Exposure to radio frequency energy from live antennas.' }, 'A fall from the roof edge.', 'Equipment falls while it is lifted.', 'Electric shock connecting equipment.'],
      controls: [
        { only: 'rfEquipment', text: 'Work follows the carrier\'s radio frequency safety plan: transmitters near the work are switched off or turned down by the carrier, and workers stay outside the marked exclusion zones (ARPANSA RPS S-1).' },
        { fact: 'fallControl' },
        'Antennas, mounts and cabinets too heavy to carry safely are lifted with a crane or hoist on a lift plan, with an exclusion zone below, not carried up ladders.',
        'Power connections are electrical work for a licensed electrician.',
      ],
    }],
  },
  {
    when: 'roadBarrier',
    steps: [{
      step: 'Install road safety barrier',
      hazards: ['Struck by passing traffic.', 'Striking buried services or overhead lines when driving posts.', 'Noise and vibration from the post driver.', 'Strain and crush injuries handling barrier rails.'],
      controls: [
        'All work is inside the closure set out in the traffic management plan, with traffic controllers where the plan requires them.',
        src('Get the current underground services information, for example through Before You Dig Australia, locate services on site before posts are driven, and work to it.', WHS('s 304')),
        'The post driver is run only by a trained operator, with an exclusion zone around it and approach distances kept from overhead lines.',
        'Rails are lifted with two people or plant, and bolted as they are placed. Hearing protection is worn near the post driver.',
      ],
    }],
    ppe: ['hivis', 'earMuffs'],
  },
  {
    when: 'sprayRoad',
    steps: [{
      step: 'Spray seal the road',
      hazards: ['Burns from hot bitumen.', 'Struck by the sprayer, spreader, roller or passing traffic.', 'Bitumen fumes.', 'Fire from heated bitumen or cutter.'],
      controls: [
        'All work is inside the closure set out in the traffic management plan, with traffic controllers where the plan requires them.',
        'Only trained operators run the bitumen sprayer and aggregate spreader. No one stands beside the spray bar while it is spraying.',
        'Workers near hot bitumen wear long sleeves, gloves, boots and a face shield, and burns are cooled with water straight away.',
        'Plant and trucks work with spotters when reversing, and workers stay out of their path.',
        'Heated bitumen and cutters are kept away from ignition sources, with an extinguisher on the sprayer.',
      ],
    }],
    ppe: ['hivis', 'faceShield'],
  },
  {
    when: 'fireAlarm',
    steps: [{
      step: 'Install the fire detection and alarm system',
      hazards: ['A fall from a ladder or platform fixing detectors.', 'Electric shock at the panel and power supply.', 'A false alarm or an isolated system leaves the building unprotected.'],
      controls: [
        { fact: 'fallControl' },
        'The system is installed and commissioned to AS 1670.1 and the design, by workers holding the fire protection licence or accreditation the state requires.',
        'Any existing system is isolated only under the building owner\'s procedure, with the monitoring service told before and after, and other fire safety measures in place while it is off.',
        'The mains connection to the panel is electrical work for a licensed electrician, with the circuit isolated first.',
      ],
    }],
  },
  {
    when: 'leadPaint',
    steps: [{
      step: 'Remove lead paint',
      hazards: ['Breathing or swallowing lead dust and fumes.', 'Lead dust spreading to the house, the yard and workers\' homes.', 'A fall from a ladder or platform.'],
      controls: [
        'Lead paint is removed by the methods in AS/NZS 4361.2: wet scraping, wet sanding or chemical strippers. No dry sanding, open flame, or heat guns hot enough to fume the paint.',
        src('The work area is enclosed with plastic sheeting, people who are not doing the work are kept out, and debris is collected as the work goes.', WHS('s 396')),
        src('Workers wear a P2 or better respirator and disposable coveralls, do not eat, drink or smoke in the work area, and wash and change before leaving it.', WHS('s 398, s 399')),
        src('Dust is cleaned up with an H class vacuum and wet wiping, never by dry sweeping. Lead waste is bagged and disposed of as the waste rules require.', WHS('s 397')),
        src('Where the work is lead risk work, the regulator is notified and workers have health monitoring before they start.', WHS('s 402, s 403, s 405')),
      ],
    }],
    ppe: ['p2'],
  },
  {
    when: 'handrailReplace',
    steps: [{
      step: 'Cut out and replace the steel handrail',
      hazards: ['A fall through the gap where the old handrail is removed.', 'Sparks and burns from cutting and welding.', 'Cuts from sharp corroded steel.', 'Fumes from cutting galvanised or painted steel.'],
      controls: [
        'A temporary barrier is fixed across the gap before the old handrail is cut out, and stays until the new handrail is fixed.',
        'Cutting and welding are hot work under a hot work permit, with combustibles cleared, an extinguisher at hand and a fire watch afterwards.',
        'Galvanised or painted steel is cut with ventilation or a respirator suited to the fumes.',
        'Cut resistant gloves are worn handling cut steel, and offcuts are removed as the work goes.',
      ],
    }],
    ppe: ['gloveWelding', 'filterEye'],
  },
  {
    when: 'birdDroppings',
    steps: [{
      step: 'Remove bird droppings and nests',
      hazards: ['Breathing dust from dried droppings, which can carry disease.', 'A fall from the EWP or roof structure.', 'Droppings and debris falling on people below.'],
      controls: [
        'Droppings are wetted down with water or a disinfectant before they are scraped, and never dry swept or blown off with compressed air.',
        'Workers wear a P2 respirator, disposable coveralls, gloves and eye protection, and wash before eating or leaving the site.',
        'Work at height is done from an EWP with the harness clipped to its anchor, or from a platform with edge protection.',
        'The area below is closed off and covered with plastic sheeting, and the waste is bagged, sealed and disposed of as the local council requires.',
      ],
    }],
    ppe: ['p2', 'gloveChemical'],
  },
  {
    when: 'roofTarps',
    steps: [{
      step: 'Cover the damaged roof with tarps',
      hazards: ['A fall from the roof or through damaged sheets or tiles.', 'The tarp catches the wind and pulls a worker off balance.', 'Electric shock from storm-damaged wiring or fallen lines.', 'Slips on a wet roof.'],
      controls: [
        { fact: 'fallControl' },
        'Power to the house is checked by a licensed electrician where wiring or the service line may be damaged, and fallen lines are reported to the network operator and kept clear of.',
        'No one walks on damaged sheets or tiles, or works on the roof in high wind, rain or lightning.',
        'Tarps are tied down with ropes to fixed points or weighted with sandbags, never with loose bricks, and are spread from a protected position.',
      ],
    }],
  },
  {
    when: 'gutterClean',
    steps: [{
      step: 'Clean the gutters and downpipes',
      hazards: ['A fall from the roof edge or a ladder.', 'Cuts and infection from debris, sharp metal and droppings.', 'Debris and tools falling on people below.'],
      controls: [
        { fact: 'fallControl' },
        'Gutters are reached from an EWP, a scaffold or a roof with edge protection, not by leaning out from a ladder.',
        'Gloves and eye protection are worn, and debris is bagged, not thrown down.',
        'The area below is barricaded while the gutters are cleaned.',
      ],
    }],
    ppe: ['gloveCut'],
  },
  {
    when: 'grandstand',
    steps: [{
      step: 'Erect and dismantle the temporary grandstand',
      hazards: ['A fall from the tiers or frame while it is erected.', 'The structure collapses or overturns in wind or under crowd load.', 'Components fall onto people below.'],
      controls: [
        'The grandstand is erected to its engineer\'s or supplier\'s design for the crowd and wind loads, on ground checked as able to carry it.',
        src('Where the grandstand is built from scaffolding and a person or object could fall more than 4 m, it is erected and dismantled by licensed scaffolders.', WHS('s 81, schedule 3')),
        'Seats, handrails and stairs are complete, and a competent person inspects and certifies the structure in writing, before the public uses it.',
        'The work area is closed to the public while the grandstand is erected and dismantled, with an exclusion zone below.',
      ],
    }],
  },
  {
    when: 'laundryEquipment',
    steps: [{
      step: 'Install commercial laundry machines',
      hazards: ['A machine tips or crushes a person while it is moved.', 'Strain moving heavy machines.', 'Electric shock or gas leaks when connecting.'],
      controls: [
        'Machines are moved on pallet jacks, skates or trolleys, kept upright, and lifted by a licensed forklift operator where a forklift is used.',
        'Machines are levelled and fixed to the floor to the manufacturer\'s instructions.',
        'Water and drain connections are plumbing work for a licensed plumber, power connections are electrical work for a licensed electrician, and gas dryers are connected by a licensed gas fitter.',
        'Dryer exhaust ducts are fitted to the manufacturer\'s instructions and kept clear of combustible material.',
      ],
    }],
  },
  {
    when: 'graffitiRemoval',
    steps: [{
      step: 'Remove graffiti with chemicals',
      hazards: ['Chemical burns and fumes from graffiti removers.', 'High pressure water from the washer.', 'Chemical run-off into drains.'],
      controls: [
        { fact: 'safetyDataSheet' },
        src('Graffiti removers are used as their safety data sheets set out, with chemical gloves, eye protection and the respirator they call for.', `${WHS('s 351')}; ${QCODE('Managing risks of hazardous chemicals', 's 4.1, s 4.2')}`),
        'Where a pressure washer is used, it is run only by a trained operator, with the area closed to the public.',
        'Run-off is contained and not let into stormwater drains.',
      ],
    }],
    ppe: ['gloveChemical', 'goggles'],
  },
  {
    when: 'platformLift',
    steps: [{
      step: 'Install the platform lift',
      hazards: ['The platform or its mast falls while it is stood.', 'Crushing between the platform and the structure.', 'Electric shock connecting the drive.', 'The public walks into the work area.'],
      controls: [
        'The platform lift is installed and commissioned to the manufacturer\'s instructions and the AS 1735 lift standards by the lift supplier\'s trained installers, with any design or item registration the regulator requires sighted.',
        'Components are lifted with two people or a lifting aid and held or braced until they are fixed.',
        'The power connection is electrical work for a licensed electrician, with the circuit isolated first.',
        'The platform is not used until its safety devices and interlocks are tested and it is handed over.',
      ],
    }],
  },
  {
    when: 'pitLid',
    steps: [{
      step: 'Replace the pit lid or grate',
      hazards: ['Struck by traffic or pedestrians at the pit.', 'Strain or crushed fingers lifting a heavy lid.', 'A fall into the open pit.'],
      controls: [
        'The pit is inside barriers, with the traffic or pedestrian management the location needs.',
        'Heavy lids and grates are lifted with a lid lifter or plant, never by hand alone, and fingers are kept clear of the frame.',
        'The open pit is guarded until the new lid is seated. No one enters the pit.',
      ],
    }],
  },
  {
    when: 'subfloorRepair',
    steps: [{
      step: 'Prop the floor and replace joists or bearers',
      hazards: ['The floor drops while joists or bearers are out.', 'Working in a tight, dark subfloor.', 'Dust from rotten or treated timber, and pests.', 'Striking cables or pipes under the floor.'],
      controls: [
        { fact: 'temporarySupport' },
        'The floor is propped on each side of the section before any joist or bearer is cut out, and the props stay until the new members are fixed.',
        'The subfloor is checked for access, lighting, ventilation, cables, pipes, snakes and spiders before anyone goes in, and is treated as a confined space only if it meets the definition.',
        'Rotten and treated timber is cut with dust extraction or a P2 respirator, and offcuts are removed as the work goes.',
      ],
    }],
    ppe: ['p2'],
  },
  {
    when: 'boosterInstall',
    steps: [{
      step: 'Install the hydrant booster assembly',
      hazards: ['Heavy valves and pipe fall while they are lifted.', 'Water under pressure when connecting to the live main.', 'Strain handling fittings.'],
      controls: [
        'Valves, pipe and the booster cabinet are lifted with plant or a lifting aid rated for the load, and supported until fixed.',
        'The connection to the live water supply is made only under the water authority\'s or building owner\'s isolation, with the line depressurised.',
        'The assembly is pressure tested and commissioned to AS 2419.1 with the area kept clear during the test.',
      ],
    }],
  },
  {
    when: 'pumpOutLine',
    steps: [{
      step: 'Install the pump-out line',
      hazards: ['Sewer or septic gases at the tank or arrestor.', 'Contact with sewage or grease.', 'A fall into an open tank or pit.'],
      controls: [
        'No one enters the tank, arrestor or pit. Work is done from outside, with the lid open only while needed and the opening guarded.',
        'Gloves and eye protection are worn, cuts are covered, and hands are washed before eating.',
        'The line and its suction point are plumbing and drainage work for a licensed plumber, installed to the plumbing rules and the pump-out contractor\'s requirements, and tested before it is used.',
      ],
    }],
    ppe: ['gloveChemical'],
  },
  {
    when: 'applianceSwap',
    steps: [{
      step: 'Disconnect the old appliance and connect the new one',
      hazards: ['Electric shock from the old appliance circuit.', 'Strain lifting the old and new appliances.', 'Dust when cutting or enlarging the benchtop cut-out.'],
      controls: [
        'The circuit is isolated at the switchboard, locked and tagged, and proved de-energised before the old appliance is disconnected.',
        'The old appliance is moved out by two people or on a trolley.',
        'Benchtop cut-outs are cut with on-tool extraction, and stone benchtops are cut wet or with extraction and a P2 respirator.',
        'The new appliance is connected and tested to the manufacturer\'s instructions and the wiring rules before the circuit is re-energised.',
      ],
    }],
  },
  {
    when: 'tankWalls',
    steps: [{
      step: 'Form, reinforce and pour the tank walls',
      hazards: ['A fall from the wall forms or work platform.', 'Wall forms fall or burst during the pour.', 'Struck by the concrete pump hose or kibble.'],
      controls: [
        { fact: 'fallControl' },
        'Wall forms are built and braced to their design, with a work platform and edge protection along the top for fixing reo and placing concrete.',
        'Concrete is placed at the rate the form design allows, and a person watches the forms during the pour.',
        'No one enters the tank to strip forms or finish the inside until the space has been assessed, and entry is under a confined space permit where it is one.',
      ],
    }],
  },
  {
    when: 'crackInjection',
    steps: [{
      step: 'Seal and inject cracks',
      hazards: ['Skin and eye contact with epoxy or polyurethane resins.', 'Resin sprays out under injection pressure.', 'Dust when grinding the crack surface.'],
      controls: [
        { fact: 'safetyDataSheet' },
        'Resins are mixed and injected as their safety data sheets set out, with chemical gloves and eye protection.',
        'Ports and surface seals are checked before pressure is applied, injection pressure is kept within the system limits, and pressure is released before any fitting is undone.',
        'Crack surfaces are ground with on-tool extraction, and a P2 respirator is worn.',
      ],
    }],
    ppe: ['gloveChemical', 'p2'],
  },
  {
    when: 'doorSpringJob',
    steps: [{
      step: 'Replace the roller door spring',
      hazards: ['The spring releases stored energy and strikes a person.', 'The door drops when the spring is released.', 'A fall from the ladder.'],
      controls: [
        'The door is lowered and clamped, or the spring is fully unwound with the manufacturer\'s winding bars, before the broken spring is removed. No one stands in line with a spring under tension.',
        'The work is done by a person trained in that door, using the manufacturer\'s method.',
        'Ladders are platform ladders, set up on level ground clear of the door.',
        'The door\'s balance, safety reverse and limits are tested before it is handed back.',
      ],
    }],
    ppe: ['gloveGeneral', 'glassesClear'],
  },
  {
    when: 'highBays',
    steps: [{
      step: 'Install high bay light fittings',
      hazards: ['A fall from the EWP or scissor lift.', 'Fittings fall while they are lifted or hung.', 'Electric shock at the connection.'],
      controls: [
        'Fittings are lifted on the EWP platform within its rated load, and hung from the structure or cable tray as the manufacturer specifies.',
        'The area below is closed off while fittings are hung.',
        'Circuits are isolated and proved de-energised before fittings are connected, and connections are made by licensed electricians.',
      ],
    }],
  },
  {
    when: 'switchboardReplace',
    steps: [{
      step: 'Remove the old board and fit the new one',
      hazards: ['Electric shock and arc flash from the incoming supply, which stays live until it is disconnected.', 'Asbestos in an older switchboard panel.', 'Strain handling the old and new boards.', 'Dust drilling fixings into masonry.'],
      controls: [
        'The supply is disconnected upstream (at the service fuse or the supply authority\'s point) by a person authorised to do it, and every conductor is tested de-energised before the old board is touched. Anything that cannot be disconnected is treated as live and shrouded.',
        'An older board or panel is treated as containing asbestos unless it has been tested. It is removed whole, without drilling, cutting or breaking it, under the asbestos arrangement in this SWMS.',
        'Circuits are identified and labelled before they are disconnected from the old board.',
        'The new enclosure is fixed to the wall with drilling done using on-tool extraction, and the circuits are terminated, protected and labelled as the wiring rules require.',
        'Electrical work is done only by a licensed electrician.',
      ],
    }],
    ppe: ['gloveInsulated'],
  },
  {
    when: 'solarHotWaterRoof',
    steps: [{
      step: 'Fix the solar collectors and tank frame to the roof',
      hazards: ['A fall from the roof edge or through the roof.', 'A collector or tank falls while it is lifted or placed.', 'Wind catching collectors on the roof.', 'Cuts from broken glass or sheet edges.'],
      controls: [
        'Collectors, the tank and the frame are lifted to the roof with a crane, hoist or lifting aid, never carried up a ladder, and set down only on the roof structure.',
        'The frame is fixed through to the roof structure to the manufacturer\'s instructions for the wind region, and every roof penetration is flashed and sealed.',
        'Collectors are not handled on the roof in strong wind, and loose items are tied down.',
        'Cut-resistant gloves are worn handling collectors and roof sheet edges.',
        'The water connections are plumbing work for a licensed plumber, and any power connection is electrical work for a licensed electrician.',
      ],
    }],
    ppe: ['gloveCut'],
  },
  {
    when: 'commercialAppliance',
    steps: [{
      step: 'Set and connect the appliance',
      hazards: ['Strain or the machine tipping while it is moved and set.', 'Electric shock at the power connection.', 'Water leaks and slips at the connections.', { only: 'heatedAppliance', text: 'Scalds from hot water and steam when the machine is commissioned.' }],
      controls: [
        'The machine is moved on a trolley or by two or more people, and set on a bench or base rated for its weight.',
        'Water connections, the filter and any backflow prevention device the plumbing rules require are fitted by a licensed plumber.',
        'The power connection is made by a licensed electrician to an outlet or circuit rated for the machine.',
        { only: 'heatedAppliance', text: 'The machine is filled, heated and commissioned to the manufacturer\'s instructions, with steam and hot water outlets pointed away from people.' },
        { unless: 'heatedAppliance', text: 'The machine is commissioned to the manufacturer\'s instructions, and its drain runs to a waste with the air gap the plumbing rules require.' },
      ],
    }],
  },
  {
    when: 'shoringWall',
    steps: [{
      step: 'Install the shoring wall',
      hazards: ['The piling rig overturns or strikes a person.', 'The face between piles or panels collapses as the dig goes down.', 'The neighbouring footing is undermined.', 'Striking underground services.'],
      controls: [
        'The shoring is designed by an engineer and installed in the sequence on the drawings. Any change is approved by the designer first.',
        'The piling rig works on a working platform designed for it, inside an exclusion zone.',
        'The dig goes down in stages no deeper than the design allows before the next row of anchors or props, and the face between piles is lagged or sprayed as each stage is opened.',
        'Underground services, including those beyond the boundary, are located before piling.',
        'Movement of the shoring and the neighbouring building is monitored against the engineer\'s trigger levels, and work stops if a level is reached.',
      ],
    }],
  },
  {
    when: 'floorFrame',
    steps: [{
      step: 'Lay floor joists and the floor deck',
      hazards: ['A fall from the edge of the floor frame or through the joists.', 'Strain lifting joists, bearers and flooring sheets.', 'Nail gun injuries.'],
      controls: [
        { fact: 'fallControl' },
        'Edge protection or a perimeter scaffold is in place around an upper floor before joists are laid, and no one walks on joists that are not braced.',
        'Flooring sheets are laid and fixed as the work goes, so no one stands on loose sheets, and stair and other voids are covered or guarded.',
        'Joists and bearers are handled by two people or lifted by plant, and stacked on the deck only where the frame can carry them.',
        'Nail guns have a sequential trigger, and are disconnected before clearing jams.',
      ],
    }],
  },
  {
    when: 'tactileInstall',
    steps: [{
      step: 'Install tactile indicators',
      hazards: ['A fall on the stairs while kneeling or working.', 'The public walks into the work area.', 'Skin and breathing exposure to adhesives.', 'Silica dust from drilling stud holes into concrete.'],
      controls: [
        'The part of the stair being worked on is barricaded, with a safe way past kept open or the stair closed under the site or station operator\'s arrangements.',
        'Work is done facing the stair, with kneeling pads, tools and materials kept off the treads in use.',
        'Adhesives are used as their safety data sheets set out, with ventilation, gloves and eye protection.',
        src('Stud holes are drilled with on-tool extraction, and a fit tested P2 respirator is worn.', WHS('s 529B, s 529C')),
        ...SILICA_FOLLOW_UP.slice(0, 2),
        'Indicators are set out and fixed to AS/NZS 1428.4.1 and the manufacturer\'s instructions.',
      ],
    }],
    ppe: ['p2', 'gloveChemical'],
  },
  {
    when: 'openingBrickUp',
    steps: [{
      step: 'Remove old frames and cut lintel bearings',
      hazards: ['Broken glass and a frame falling as it is cut free.', 'Masonry above the opening drops before the lintel is in.', 'Silica dust from cutting brickwork.'],
      controls: [
        'Glass is taken out or taped first, and each frame is cut free and lowered by two people.',
        'The brickwork above the opening is supported by the temporary support before any brick is cut out for the lintel bearings.',
        src('Bearings are cut with a wet saw or with on-tool extraction, and the cutter wears a fit tested P2 respirator.', WHS('s 529B, s 529C')),
        ...SILICA_FOLLOW_UP.slice(0, 2),
      ],
    }],
    ppe: ['p2', 'gloveCut'],
  },
  {
    when: 'pitPipeRepair',
    steps: [{
      step: 'Repair the pipe in the pit',
      hazards: ['Flow or stored water released when the pipe is opened.', 'Contact with contaminated water and silt.', 'Fumes and skin contact from repair resins and sealants.'],
      controls: [
        'Upstream flow is stopped, diverted or plugged with a rated pipe plug before the joint is opened, and the plug is not removed while anyone is in the pit.',
        'Gloves, eye protection and waterproof clothing are worn, cuts are covered, and hands are washed before eating.',
        'Repair resins, mortars and sealants are used as their safety data sheets set out, with ventilation into the pit.',
        'No hot work or petrol engines are used in the pit.',
      ],
    }],
    ppe: ['gloveChemical'],
  },
  {
    when: 'wetWellClean',
    steps: [{
      step: 'Clean out the wet well',
      hazards: ['Hydrogen sulphide and other gases released when sludge is disturbed.', 'Contact with sewage and infection.', 'Pumps or valves operated while people are in the well.'],
      controls: [
        'Sludge and debris are removed with a vacuum truck from the surface wherever possible, so the time anyone spends in the well is kept short.',
        'The gas detector stays on in the well while sludge is disturbed, and everyone leaves at once if it alarms.',
        'Pumps and inlet valves stay locked out under the confined space permit until everyone is out.',
        'Gloves, eye protection and waterproof clothing are worn, cuts are covered, hands are washed before eating, and contaminated clothing is removed before leaving site.',
      ],
    }],
    ppe: ['gloveChemical', 'gumboots'],
  },
  {
    when: 'buildUnder',
    steps: [{
      step: 'Build in underneath the raised house',
      hazards: ['The raised house moves or drops onto people underneath.', 'Strain handling blocks, frames and sheets.', 'Silica dust from cutting blocks or fibre cement.'],
      controls: [
        'No one works under the house until it sits on its permanent posts or on temporary supports designed and checked for the job.',
        'Walls are built to the drawings, with blocks or frames lifted by two people or with lifting aids.',
        'Blocks and fibre cement are cut with a wet saw or on-tool extraction, and a fit tested P2 respirator is worn.',
        'Any plumbing, drainage or electrical work in the new rooms is done by the licensed trades.',
      ],
    }],
    ppe: ['p2'],
  },
  {
    when: 'cattleGrid',
    steps: [{
      step: 'Install the cattle grid',
      hazards: ['The grid falls or swings while it is lifted.', 'Crushing between the grid and its footings.', 'Plant strikes a person.'],
      controls: [
        'The grid is lifted on its lifting points with plant and rigging rated for its weight, and slung by a licensed dogger where a crane is used.',
        'No one stands under the grid or puts hands between the grid and its footings while it is lowered. Workers guide it with tag lines.',
        'The grid is fixed to its footings to the supplier\'s instructions before traffic or stock use it.',
      ],
    }],
  },
  {
    when: 'cycloneShutters',
    steps: [{
      step: 'Install cyclone shutters',
      hazards: ['A fall from a ladder or platform.', 'Strain or crushed fingers handling shutter panels and tracks.', 'Silica dust drilling fixings into masonry or concrete.'],
      controls: [
        'Shutters above 2 m are fixed from a platform, scaffold or EWP, and platform ladders are used only for short work below 2 m.',
        'Panels and tracks are carried by two people, and fingers are kept clear of the roll and track.',
        src('Fixings into masonry or concrete are drilled with on-tool extraction, and a fit tested P2 respirator is worn.', WHS('s 529B, s 529C')),
        'Shutters are fixed to the manufacturer\'s instructions for the wind region, and any motor is connected by a licensed electrician.',
      ],
    }],
    ppe: ['p2'],
  },
  {
    when: 'collapsedWall',
    steps: [{
      step: 'Clear the collapsed wall and protect the footpath',
      hazards: ['Remaining sections of the wall fall onto workers or the public.', 'Strain handling bricks and rubble.', 'Silica dust from broken brickwork.'],
      controls: [
        'The footpath next to the wall is closed or a protected walkway is set up, with the approval of the authority that controls it.',
        'Loose and leaning sections are taken down from the top, or propped, before anyone works below them.',
        'Rubble is wetted down to control dust and removed with a wheelbarrow or plant, not thrown.',
      ],
    }],
    ppe: ['p2', 'gloveGeneral'],
  },
  {
    when: 'acService',
    steps: [{
      step: 'Service and repair the rooftop units',
      hazards: ['The unit starts while someone is working on it.', 'Electric shock from the unit supply.', 'Refrigerant release.', 'A fall from the roof edge.', 'Cuts from fins and sheet edges.'],
      controls: [
        'Each unit is isolated at its local isolator and locked out, and each worker fits their own lock and tests that it will not start.',
        'Electrical fault finding and repairs are done by a licensed electrician, and refrigerant work only by the holder of a refrigerant handling licence.',
        'Work near the roof edge is done inside the roof edge protection or with travel restraint.',
        'Cut-resistant gloves are worn handling fins and panels.',
      ],
    }],
    ppe: ['gloveCut'],
  },
  {
    when: 'rampBuild',
    steps: [{
      step: 'Build the access ramp',
      hazards: ['Striking buried services when digging footings.', 'Cement burns and strain placing concrete.', 'Visitors walk into the work area.'],
      controls: [
        src('Get the current underground services information before digging, and work to it.', WHS('s 304')),
        'The ramp, landings and handrails are built to the design and the access standard gradients.',
        'Concrete is placed with gloves and boots, and skin contact with wet concrete is washed off straight away.',
        'The work area is fenced off from building users, with another accessible route kept open where one is needed.',
      ],
    }],
    ppe: ['gloveChemical', 'gumboots'],
  },
  {
    when: 'outdoorKitchen',
    steps: [{
      step: 'Build the outdoor kitchen',
      hazards: ['Strain or crush handling heavy benchtops, cabinets and blocks.', 'Silica dust from cutting stone, tiles or blocks.', 'Cuts and kickback from saws.'],
      controls: [
        'Engineered stone benchtops, panels and slabs are banned and are not installed or processed.',
        'Benchtops and heavy units are moved with trolleys or lifting aids, or by enough people for the weight, and supported until fixed.',
        src('Stone, tiles and blocks are cut wet or with on-tool extraction, and the cutter wears a fit tested P2 respirator.', WHS('s 529B, s 529C')),
        ...SILICA_FOLLOW_UP.slice(0, 2),
        'Saws are used with their guards in place, with the work clamped.',
      ],
    }],
    ppe: ['p2', 'earMuffs'],
  },
  {
    when: 'gasLineTest',
    steps: [{
      step: 'Pressure test the gas line',
      hazards: ['A joint or fitting fails under test pressure.', 'Gas released when the line is purged or commissioned.'],
      controls: [
        { fact: 'pressureTesting' },
        'The line is tested with air or nitrogen, never oxygen, at the pressure and for the time the gas installation standard sets, with a gauge rated for the test.',
        'The area around the line under test is kept clear, and pressure is released before any fitting is touched.',
        'The line is purged to a safe place outdoors, with no ignition sources nearby, before the appliance is lit.',
      ],
    }],
  },
  {
    when: 'fenceRemove',
    steps: [{
      step: 'Take down the old fence',
      hazards: ['Cuts from sheet and wire edges.', 'Strain lifting panels and digging out posts.', 'Asbestos in an old fibro fence.', 'Children, animals or the public get through the gap.'],
      controls: [
        'An old fibro fence on a property built before 2004 (asbestos products were used until the national ban at the end of 2003) is treated as asbestos unless tested, and is not cut or broken.',
        'The fence is taken down in sections, with the boundary kept secure by temporary fencing where a pool, animals or the public need it.',
        'Sheets and wire are handled with cut-resistant gloves, and old posts and footings are dug out or cut off below ground, with the holes filled or covered.',
      ],
    }],
    ppe: ['gloveCut'],
  },
  {
    when: 'vanityInstall',
    steps: [{
      step: 'Remove and fit the vanity',
      hazards: ['Strain lifting the vanity and top.', 'Silica dust drilling tiles or a stone top.', 'Water damage when the old connections are opened.'],
      controls: [
        'The water is isolated at the room or service valve before the old vanity is disconnected.',
        'The old and new vanities are moved by two people, and the new unit is fixed to the wall or floor as the supplier specifies.',
        src('Tiles and stone tops are drilled with on-tool extraction or water, and a P2 respirator is worn.', WHS('s 529B, s 529C')),
      ],
    }],
    ppe: ['p2'],
  },
  {
    when: 'shedTakeDown',
    steps: [{
      step: 'Take down the shed frame',
      hazards: ['The frame collapses while members are removed.', 'Cuts from sheet metal and fixings.', 'Strain handling frame members.'],
      controls: [
        'The frame is taken down by hand from the top, after the wall and roof sheets are off, with each section supported or braced until it is released.',
        'Cut-resistant gloves and eye protection are worn, and fixings are cut or unscrewed, not torn out.',
        'Members are carried by two people and stacked clear of the work.',
      ],
    }],
    ppe: ['gloveCut'],
  },
  {
    when: 'controlPanelInstall',
    steps: [{
      step: 'Mount and wire the control panel',
      hazards: ['Electric shock from the incoming supply.', 'Strain or crush handling the panel.', { only: 'pumpStation', text: 'Sewer gas from cable conduits that run to the wet well.' }],
      controls: [
        'The panel is fixed to its plinth, stand or wall as its designer specifies, lifted with a lifting aid or by enough people for its weight.',
        'The incoming supply is isolated, locked and proved de-energised before it is terminated, and the work is done by a licensed electrician.',
        { only: 'pumpStation', text: 'No one enters the wet well. Cable conduits from the wet well are sealed so sewer gas cannot reach the panel, and work at the well is done from outside it.' },
      ],
    }],
  },
  {
    when: 'rockLining',
    steps: [{
      step: 'Place the rock lining',
      hazards: ['Crushed hands or feet placing rock.', 'Plant placing rock strikes a worker.', 'Rock rolls down the batter.'],
      controls: [
        'Large rock is placed by the excavator, with workers out of its reach while it is moving, and two-way acknowledgement before anyone approaches.',
        'Smaller rock is placed by hand with gloves and steel-capped boots, lifting only pieces one person can handle.',
        'Work on the batter is from below or beside the rock being placed, never downhill of it.',
      ],
    }],
    ppe: ['gloveGeneral'],
  },
  {
    when: 'lintelReplace',
    steps: [{
      step: 'Cut out the old lintel',
      hazards: ['Brickwork above drops before it is supported.', 'Silica dust from cutting and breaking brickwork.', 'Noise.', 'Falling bricks and debris.'],
      controls: [
        'The old lintel is cut out only after the masonry above is propped or needled, and loose bricks are removed from the top down.',
        src('Brickwork is cut with a wet saw or with on-tool extraction, and the cutter wears a fit tested P2 respirator and hearing protection.', WHS('s 529B, s 529C')),
        ...SILICA_FOLLOW_UP.slice(0, 2),
        'The area below is closed off while brickwork is cut and the lintel is out.',
      ],
    }],
    ppe: ['p2', 'earMuffs'],
  },
  {
    when: 'subBoardInstall',
    steps: [{
      step: 'Mount the sub-board and run the sub-mains',
      hazards: ['Electric shock at the main switchboard, which stays partly energised.', 'Strain lifting the board and cable drums.', 'A fall from a ladder or platform running cable at height.'],
      controls: [
        'The sub-board is fixed to the wall or frame as the manufacturer specifies before it is wired.',
        'The sub-mains are run on tray or in conduit from a platform or EWP, with cable drums on stands and pulled with a winch or enough people.',
        'Before termination at the main switchboard, the circuit is isolated, locked and proved de-energised, and live parts nearby are shrouded.',
      ],
    }],
  },
  {
    when: 'glassWind',
    steps: [{
      step: 'Handle glass in the wind',
      hazards: ['Wind catches a panel.'],
      controls: [
        src('Large panels are handled outside only in low wind.', QCODE('Hazardous manual tasks', 's 3.4, s 4.6')),
        'Panels at the edge are secured until fixed.',
      ],
    }],
  },
  {
    when: 'glazingDrill',
    steps: [{
      step: 'Drill tiled walls for fixings',
      hazards: ['Silica dust from drilling tiles and the wall behind.', 'Drilling into hidden pipes or cables.'],
      controls: [
        { fact: 'silicaControls' },
        src('Drilling tiles and masonry with 1% or more crystalline silica with a power tool is processing that must be controlled: on-tool extraction or wet methods, and respirators for anyone still at risk. Assess in writing before drilling whether it is high risk, without counting PPE or administrative controls, and without relying only on the dust controls used for the processing. If it cannot be determined, treat it as a risk to health.', `${WHS('s 529A, s 529B, s 529C, s 529CA')}; ${QCODE('Silica', 's 5.1, s 7.4.1, s 7.4.2, s 7.6')}`),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start and the work follows it (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
        src('Air monitoring is done where it is not certain the exposure standard is met, and results are kept for 30 years. For high risk processing, results over the exposure standard go to the regulator within 14 days. Workers with a significant risk from ongoing exposure have health monitoring supervised by a registered medical practitioner.', `${WHS('s 50, s 368, s 371, s 529CE, schedule 14')}; ${QCODE('Silica', 's 9.1, s 9.4, s 10.1, s 10.2')}`),
        src('Check for hidden pipes and cables before drilling.', WHS('s 40')),
      ],
    }],
    ppe: ['p2', 'glassesClear'],
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
        src('Natural stone and porcelain with 1% or more crystalline silica: cutting, drilling and polishing with power tools is processing that must be controlled, with wet methods or on-tool extraction, and respirators for anyone still at risk. Cut in the factory where possible.', `${WHS('s 529A, s 529B, s 529C')}; ${QCODE('Silica', 's 5.1, s 7.1, s 7.4.1, s 7.4.2, s 7.6')}`),
        src('Assess in writing before processing whether it is high risk, without counting PPE or administrative controls, and without relying only on the dust controls used for the processing. Where it is high risk, a silica risk control plan is given to workers before they start and the work follows it (stop if it does not), and workers have completed crystalline silica training.', WHS('s 529CA, s 529CB, s 529CC, s 529CD')),
        src('Air monitoring is done where it is not certain the exposure standard is met, and results are kept for 30 years. For high risk processing, results over the exposure standard go to the regulator within 14 days. Workers with a significant risk from ongoing exposure have health monitoring supervised by a registered medical practitioner.', `${WHS('s 50, s 368, s 371, s 529CE, schedule 14')}; ${QCODE('Silica', 's 9.1, s 9.4, s 10.1, s 10.2')}`),
        src('Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak. Hearing protection worn for the whole time of the noise, with hearing tests within 3 months of starting and at least every 2 years.', `${WHS('s 56, s 57, s 58')}; ${QCODE('Managing noise and preventing hearing loss', 's 2.2, s 5.3, s 5.4')}`),
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
        src('Use lift trolleys or vacuum lifters. Where team lifts are regular, redesign the task to use mechanical aids. Training in lifting technique is not the main control.', QCODE('Hazardous manual tasks', 's 4.1, s 4.4, s 4.7')),
        src('Any team lift is matched to the load, rehearsed, and led by one person.', MODEL('Hazardous manual tasks', 's 4.9')),
        'Benchtops are carried on edge in an A-frame and supported along their length until fixed.',
        { only: 'naturalStone', ...src('Cut-outs and edge work are done by the supplier off site where possible. Natural stone cut on site is cut wet or with on-tool extraction, by workers wearing fit tested P2 respirators, as cutting it is processing crystalline silica.', WHS('s 529B, s 529C')) },
        ...SILICA_FOLLOW_UP.slice(0, 1).map((item) => ({ only: 'naturalStone', ...(typeof item === 'string' ? { text: item } : item) })),
        'Benchtops are fixed and joined with adhesives and sealants used as their safety data sheets set out, with ventilation and gloves.',
      ],
    }],
  },
  {
    when: 'fireAtHeight',
    steps: [{
      step: 'Install sprinkler and hydrant pipework at height',
      hazards: ['A fall from an EWP, ladder or open riser.', 'Strain lifting pipe overhead.', 'Pipe or fittings fall onto people below.', 'Silica dust from drilling concrete for hanger anchors.'],
      controls: [
        { fact: 'fallControl' },
        src('Prevent falls first. Use EWPs or scaffolds before ladders.', `${WHS('s 79, s 306D')}; ${MODEL('Managing the risk of falls', 's 9')}`),
        src('Ladders are industrial and rated for at least 120 kg. No tools that need two hands, or a high degree of leverage such as stillsons, on a ladder without extra fall protection. Where a fall of 2 m or more is possible, single and extension ladders are secured at or near the top or bottom, and the user keeps 3 limbs on the ladder.', `${WHS('s 306L, s 306M')}; ${MODEL('Managing the risk of falls', 's 9, s 9.1')}`),
        src('In a boom EWP, the harness is attached to the EWP\'s anchor point. Booms of 11 m or more need a licensed operator. No one uses a fall arrest harness alone.', `${WHS('s 81, s 306I, schedule 3')}; ${QCODE('Managing the risk of falls', 's 5.1, s 10.1')}`),
        src('Risers are covered or screened. While a riser is open, the opening has edge protection, or the worker at it uses travel restraint set so they cannot reach the opening.', `${WHS('s 306D, s 306E, s 306F, s 306G')}; ${QCODE('Managing the risk of falls', 's 4.2, s 6.1')}`),
        'Only the section being worked on is opened.',
        src('Use pipe lifters and mechanical aids. Team lifts are an interim control only.', MODEL('Hazardous manual tasks', 's 4.5, s 4.9')),
        { fact: 'silicaControls' },
        src('Drilling concrete for hanger anchors with a power tool is processing a crystalline silica substance and must be controlled: on-tool extraction or wet methods, and respirators for anyone still at risk. Assess in writing before drilling whether it is high risk, without counting PPE or administrative controls, and without relying only on the dust controls used for the processing. If it cannot be determined, treat it as a risk to health.', `${WHS('s 529A, s 529B, s 529C, s 529CA')}; ${QCODE('Silica', 's 5.1, s 7.4.1, s 7.4.2, s 7.6')}`),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start and the work follows it (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
        src('Air monitoring is done where it is not certain the exposure standard is met, and results are kept for 30 years. For high risk processing, results over the exposure standard go to the regulator within 14 days. Workers with a significant risk from ongoing exposure have health monitoring supervised by a registered medical practitioner.', `${WHS('s 50, s 368, s 371, s 529CE, schedule 14')}; ${QCODE('Silica', 's 9.1, s 9.4, s 10.1, s 10.2')}`),
        'Before drilling into a slab, scan and mark reinforcement, conduits and pipes. In a post-tensioned slab, check the post-tensioning drawings, and never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval.',
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
        src('Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak. Hearing protection is worn the whole time workers are exposed to the noise, in signposted areas, with hearing tests.', `${WHS('s 56, s 57, s 58')}; ${QCODE('Managing noise and preventing hearing loss', 's 2.2, s 5.3, s 5.4')}`),
      ],
    }],
    ppe: ['earMuffs', 'glassesClear'],
  },
  {
    when: 'fireLive',
    steps: [{
      step: 'Work on live fire systems and in pump rooms',
      hazards: ['Water under pressure released.', 'Pumps start automatically.', 'The building is unprotected while the system is impaired.', 'Noise from running pumps.'],
      controls: [
        { fact: 'isolationProcedure' },
        src('Lock out pumps and isolate valves. Each worker fits their own padlock, a tag alone is not an isolation, and only the person who applied a lock or tag removes it.', MODEL('Managing the risks of plant in the workplace', 's 4.5')),
        src('Release stored pressure before breaking into pipework.', MODEL('Managing the risks of plant in the workplace', 's 4.5')),
        src('Warn everyone before pumps are restarted.', MODEL('Managing the risks of plant in the workplace', 's 3.6')),
        src('Where a diesel pump is run indoors, the pump room is ventilated and the exhaust is taken outside, so no one breathes diesel exhaust above the exposure standard.', `${WHS('s 49')}; ${QCODE('Managing risks of hazardous chemicals', 's 1.5, s 2.1, s 4.1')}`),
        src('Pump runs and diesel pump tests are noisy: keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak, signpost the pump room as a hearing protector area, and wear hearing protection for the whole time of the noise.', `${WHS('s 56, s 57, s 58')}; ${QCODE('Managing noise and preventing hearing loss', 's 2.2, s 5.3')}`),
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
        { only: 'landingDoors', text: 'Landing door sets are moved on trolleys, lifted by two people or with a lifter, and fixed to the manufacturer\'s instructions, with each shaft opening barricaded until its door is locked.' },
        { fact: 'fallControl' },
        src('Secure barriers stop anyone but the people working in the lift well from reaching its openings. People working in the well use secure working platforms or equivalent to stop a fall, a secure barrier protects them from falling objects, and there is a safe way into and out of the pit.', WHS('s 236')),
        src('Shaft openings have barriers or fixed covers as soon as they are formed: covers are strong enough to take anyone who could fall onto them, securely fixed so they cannot be moved or removed by accident, and marked as covering a hole. Edge protection top rail at least 900 mm.', `${WHS('s 78, s 306E, s 306F')}; ${MODEL('Managing the risk of falls', 's 4.2')}`),
        src('Where harnesses are used in the shaft, anchors are rated at least 15 kN for one person, the lanyard is attached before moving to the edge, and a rescue procedure is set up.', WHS('s 80, s 306I')),
        src('Toe boards on edge protection, and exclusion zones and no go areas below.', `${WHS('s 55')}; ${QCODE('Managing the risk of falls', 's 5.1, s 8.1')}`),
        src('Prevent objects falling first: tool lanyards, and catch platforms or nets.', WHS('s 54, s 55')),
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
        src('Slinging and directing loads out of the operator\'s view is dogging, and setting up hoists is rigging. Dual lifts need at least an intermediate rigging licence. Sight each licence.', WHS('s 81, s 85, schedule 3')),
        src('Install with the manufacturer\'s jigs and tools, by competent people with the available information.', `${WHS('s 204')}; ${MODEL('Managing the risks of plant in the workplace', 's 3.2')}`),
      ],
    }],
  },
  {
    when: 'liftCar',
    steps: [{
      step: 'Work on the car top and in the pit',
      hazards: ['The car moves while someone is on it or in the pit.', 'Crush between the car and the shaft.', 'A fall from the car top or into the pit.', 'A poor atmosphere in the pit.'],
      controls: [
        { fact: 'plantIsolation' },
        src('Work that does not need the car to move is done with power, stored energy and gravity isolated and locked out.', MODEL('Managing the risks of plant in the workplace', 's 4.5')),
        src('Where the car must move for inspection or testing, its controls are operated only by the person doing the work, and can be locked off.', `${WHS('s 210')}; ${QCODE('Managing the risks of plant in the workplace', 's 3.6, s 4.2')}`),
        'The car runs only on inspection control from the car top or pit.',
        src('People on the car top or in the pit work from secure platforms or equivalent that stop a fall, such as car top guardrails, and there is a safe way into and out of the pit.', `${WHS('s 79, s 236')}; ${MODEL('Managing the risk of falls', 's 4.2')}`),
        src('The lift design is registered before it is supplied, and the lift is registered before it is commissioned for use. Adjustments, tests and inspections needed to commission it can be done before then.', WHS('s 231, s 233, s 234, schedule 5')),
        src('The pit is assessed. If it is a confined space: a written entry permit from a competent person, the atmosphere tested before entry, continuous communication, a standby person at the pit, and practised first aid and rescue procedures.', `${WHS('s 66, s 67, s 69, s 74')}; ${MODEL('Confined spaces', 's 1.1, s 4.3, s 4.5, s 4.6, s 5')}`),
      ],
    }],
  },
  {
    when: 'passiveFire',
    steps: [{
      step: 'Seal penetrations and fire stop',
      hazards: ['A fall through an open penetration or riser.', 'Fibres from batts and dust from cutting.', 'Skin contact with sealants and mastics.'],
      controls: [
        { text: 'Smoke and fire dampers are lifted into place with a hoist, lifter or two people, working from a platform suited to the height, and are fixed to the manufacturer\'s instructions.', only: 'dampers' },
        { ...src('Damper and collar fixings drilled into concrete or masonry are drilled with on-tool extraction, and a fit tested P2 respirator is worn.', WHS('s 529B, s 529C')), only: 'dampers' },
        { fact: 'fallControl' },
        src('Penetrations keep their covers until they are sealed. Mesh over a penetration also has a solid cover over it.', `${WHS('s 79, s 306F')}; ${QCODE('Managing the risk of falls', 's 4.2')}`),
        'Only the penetration being worked on is opened.',
        src('While a riser or large penetration is open, the opening has edge protection, or the worker at it uses travel restraint set so they cannot reach the opening.', `${WHS('s 306D, s 306E, s 306G')}; ${QCODE('Managing the risk of falls', 's 4.2, s 6.1')}`),
        src('No stepladders beside an open penetration without extra fall protection.', MODEL('Managing the risk of falls', 's 9.1')),
        src('Ladders are manufactured for industrial use and rated for at least 120 kg.', WHS('s 306M')),
        src('The current safety data sheet for each sealant, mastic and batt is at the work area, the products are on the register, and decanted products are labelled.', WHS('s 342, s 344, s 346')),
        src('Keep dust and fibres below the exposure standard, monitor where unsure, and wear respiratory protection where fibres remain.', `${WHS('s 49, s 50')}; ${QCODE('Managing risks of hazardous chemicals', 's 1.5, s 3.3, s 4.1')}`),
      ],
    }],
    ppe: ['p2', 'gloveChemical', 'longs'],
  },
  {
    when: 'siteEstablish',
    steps: [{
      step: 'Erect fencing, hoardings and gantries',
      hazards: [{ only: 'hoarding', text: 'The public is struck by falling objects.' }, 'Unauthorised entry to the site.', { only: 'hoarding', text: 'Hoardings or gantries collapse.' }, { unless: 'hoarding', text: 'Fence panels blow over in wind.' }, { unless: 'hoarding', text: 'Strain handling fence panels and bases.' }],
      controls: [
        src('The site is secured from unauthorised access.', WHS('s 298')),
        { unless: 'hoarding', text: 'Fence panels are set in their bases, clamped together and braced or ballasted against wind as the supplier specifies. Shade cloth or signs go on only where the bracing is designed for them.' },
        { unless: 'hoarding', text: 'Panels and bases are carried by two people or moved on a trolley.' },
        { only: 'hoarding', ...src('The barricade or hoarding is set by the angle from the highest point of the work to the hoarding line: 15 degrees or less, at least 900 mm high; over 15 to 30 degrees, a hoarding at least 1,800 mm high; over 30 and under 75 degrees, a fully sheeted hoarding at least 1,800 mm high; 75 degrees or more, a fully sheeted hoarding at least 1,800 mm high and a gantry, closure or catch platform with screening.', WHS('s 315F, s 315G')) },
        { only: 'gantry', ...src('Gantries are engineer designed (5 kPa, or 10 kPa where work other than light work is done above 10 m) and stop falling objects, water and dust. The overhead platform is secured against lifting or coming apart, with solid sheeting on its outer edge to at least the higher of 900 mm and anything stored on it. The area below is lit to at least 50 lux, the gantry cannot tip over or rotate (for example if a truck backs into it), and it is engineer designed for any shed or materials on it.', WHS('s 315K')) },
        { only: 'hoarding', ...src('Loads are lifted over the footpath or road only where the area is closed or a gantry protects people from the load.', WHS('s 315L, s 315M')) },
        src('Get the current underground services information before digging or driving footings for fences, hoardings and gantries, and work to it.', WHS('s 304')),
        { only: 'road', ...src('Footpath or road closures have written approval from the authority that controls the area.', WHS('s 315M')) },
        { only: 'gantry', ...src('Gantries and covered ways in tube and coupler are erected by licensed intermediate scaffolders.', WHS('schedule 3')) },
        src('Temporary cables are kept off access routes, materials are stacked away from fences and hoardings, and emergency exits stay clear and lit.', `${WHS('s 40')}; ${QCODE('Managing electrical risks', 's 3')}`),
      ],
    }],
  },
  {
    when: 'siteSheds',
    steps: [{
      step: 'Set up site sheds',
      hazards: ['A shed falls while it is lifted or set down.', 'A shed moves or overturns in wind.', 'A fall from shed stairs or roofs.'],
      controls: [
        src('Sheds are placed by the supplier\'s truck or lifted by the crane company under its lift plan, with lifting gear rated for the shed, kept under control and never over people. Only licensed dogmen sling and release them.', WHS('s 219, schedule 3')),
        { only: 'gantry', ...src('Sheds on a gantry go only where the engineer\'s design allows for their load.', WHS('s 315K')) },
        { only: 'siteToilets', text: 'Toilets are connected to water and sewer by a licensed plumber, or their holding tanks are pumped out by a licensed contractor, and power is connected by a licensed electrician.' },
        'Sheds are set level on their supports and tied down to the supplier\'s instructions. Stairs and landings have handrails before the sheds are used.',
        src('No one goes onto a shed roof to sling or set stacked sheds unless fall protection is in place: sling from the ground or from an EWP where possible.', WHS('s 78, s 306D')),
      ],
    }],
  },
  {
    when: 'sitePlant',
    steps: [{
      step: 'Separate plant and people on site',
      hazards: ['A person is struck by plant or a truck.'],
      controls: [
        src('Plant does not collide with people, and has a warning device where it could.', `${WHS('s 215')}; ${QCODE('Managing the risks of plant in the workplace', 's 3.8, s 4.4')}`),
        'Combine alarms with flashing lights.',
        src('Physical barriers separate pedestrians from plant.', QCODE('Excavation work', 's 2.3')),
        'Separate entries, or marked walkways with kerbs or barriers, and clear vehicle paths.',
        src('Plan for blind spots. Plant operators and ground workers use two way acknowledgement before anyone approaches plant.', QCODE('Excavation work', 's 4.3')),
        'Use a spotter for reversing trucks.',
        src('An exclusion zone, with signs and barricades, around trucks and plant while they load and unload.', `${WHS('s 214, s 215')}; ${QCODE('Managing the risks of plant in the workplace', 's 3.8')}`),
        'Traffic controllers hold pedestrians and traffic when the crane company\'s dogman asks. Crane lifts are run by the crane company.',
      ],
    }],
    ppe: ['hivisNight'],
  },
  {
    when: 'sawCut',
    steps: [{
      step: 'Saw cut concrete',
      hazards: ['Silica dust.', 'Cutting a post-tensioning tendon or live service.', 'Electric shock from wet cutting.', { unless: 'groundCut', text: 'A cut section falls.' }, { only: 'slabRemoval', text: 'Struck by plant or broken concrete while sections are lifted out.' }, 'Noise.'],
      controls: [
        { only: 'kerbWork', ...src('Get the current underground services information before cutting or breaking out, and work to it.', WHS('s 304')) },
        { only: 'kerbWork', text: 'The damaged section is saw cut and broken out with a breaker or excavator, and the rubble is loaded out, inside the traffic or pedestrian management for the work.' },
        { fact: 'silicaControls' },
        src('Cutting concrete is processing a crystalline silica substance and must be controlled: wet cutting or on-tool extraction, and respirators for anyone still at risk.', `${WHS('s 529A, s 529B, s 529C')}; ${QCODE('Silica', 's 5.1, s 7.4.1, s 7.4.2, s 7.6')}`),
        src('Assess in writing before cutting whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until that is determined.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
        src('Air monitoring is done where it is not certain the exposure standard is met, and results are kept for 30 years. For high risk processing, results over the exposure standard go to the regulator within 14 days. Workers with a significant risk from ongoing exposure have health monitoring supervised by a registered medical practitioner.', `${WHS('s 50, s 368, s 371, s 529CE, schedule 14')}; ${QCODE('Silica', 's 9.1, s 9.4, s 10.1, s 10.2')}`),
        { text: 'Every opening has the structural engineer\'s written approval before cutting.', only: 'cutOpening' },
        'Before cutting a post-tensioned slab, check the post-tensioning drawings, and scan and mark tendons, conduits and pipes. No cutting within a marked tendon zone unless the engineer gives a written method for it, including any temporary propping.',
        src('Services may be hidden in slabs and walls: scan, and isolate and confirm before cutting. Use RCD protected equipment, and keep leads out of water.', `${ESR('s 140')}; ${QCODE('Managing electrical risks', 's 3, s 3.3')}`),
        { unless: 'groundCut', ...src('No concrete saws on ladders.', QCODE('Managing the risk of falls', 's 9.1')) },
        src('Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak, with signposted hearing protector areas and hearing tests.', `${WHS('s 56, s 57, s 58')}; ${QCODE('Managing noise and preventing hearing loss', 's 2.2, s 5.3, s 5.4')}`),
        'Contain slurry and dispose of it as the principal contractor directs.',
        { only: 'slabRemoval', text: 'Use an excavator or bobcat to break up and lift out the cut sections, or break them into pieces small enough to lift by hand, with no one near the bucket, and load them for disposal.' },
      ],
    }],
    ppe: ['p2', 'earMuffs', 'gumboots', 'faceShield'],
  },
  {
    when: 'sawCut',
    steps: [{
      step: 'Remove cut sections',
      hazards: ['A cut section falls or drops when it is freed.', 'Back injury moving heavy sections.', 'A fall through the new opening.'],
      // Only where sections are cut out: cutting reglets or joints frees nothing.
      only: 'cutOpening',
      controls: [
        'Before the last cut, the section is supported by props or slung from lifting points set out by the engineer\'s method, so it cannot drop or swing when it is freed.',
        src('Sections are lifted with plant and lifting gear rated for their weight, kept under control and never over people. Loads are slung, and the operator is directed when the load is out of view, only by a licensed dogman.', WHS('s 81, s 219, schedule 3')),
        src('Use trolleys and mechanical aids to move sections. Cut sections small enough to handle, where the engineer allows.', MODEL('Hazardous manual tasks', 's 4.4, s 4.5')),
        src('An exclusion zone below and beside the work until the section is out.', WHS('s 55')),
        { unless: 'trench', ...src('Every new floor opening is covered as soon as it is cut, with a cover strong enough to take anyone who could fall onto them, securely fixed so they cannot be moved or removed by accident, and marked as covering a hole. Wall openings at an edge have edge protection fixed before the section is removed.', `${WHS('s 306E, s 306F')}; ${MODEL('Managing the risk of falls', 's 4.2')}`) },
      ],
    }],
  },
  {
    when: 'landscape',
    steps: [{
      step: 'Move soil and mulch, and plant',
      hazards: ['Back strain from bags and soil.', 'Dust.', 'Heat.'],
      controls: [
        src('Order smaller bags, or have bulk loads moved by machine. Deliver as close as possible to where the materials are used. Use mechanical aids, and rotate tasks.', MODEL('Hazardous manual tasks', 's 4.4, s 4.5, s 4.7, s 4.9')),
        src('Keep dust down with wet methods.', MODEL('Managing risks of hazardous chemicals', 's 4.1')),
        { unless: 'landscapeLift', text: 'Before digging swales, irrigation trenches or planting holes, get the services plans (for example through Before You Dig Australia) and locate services on site. Pothole by hand or with a vacuum near services.' },
        'The irrigation connection to the water supply and its backflow device is made by a licensed plumber.',
        'Protect finished paving, hard surfaces and membranes with boards or mats where plant or barrows cross them.',
        'Potting mix, compost and soil can carry Legionella bacteria. Open bags away from the face, keep the material damp, wear gloves and a P2 mask, and wash hands before eating, drinking or smoking.',
        src('Cool drinking water, shade and rest breaks in hot weather.', `${WHS('s 40, s 41')}; ${QCODE('Hazardous manual tasks', 's 4.6')}`),
      ],
    }],
    ppe: ['sunHat', 'sunscreen', 'gloveGeneral', 'p2'],
  },
  {
    when: 'paving',
    steps: [{
      step: 'Lay and cut pavers',
      hazards: ['Silica dust from cutting pavers.', 'Noise.', 'Kneeling.'],
      controls: [
        src('Get the current underground services information before excavating the paving bed, and work to it.', WHS('s 304')),
        { only: 'paverRepair', text: 'Collapsed pavers are lifted out by hand or with a paver lifter, and the bed is dug out to find the cause, such as a broken pipe, before it is rebuilt.' },
        'Use a plate compactor to compact the bedding before the pavers are laid, with its guards in place and hearing protection worn.',
        { fact: 'silicaControls' },
        src('Pavers are not engineered stone, but cutting pavers with 1% or more crystalline silica is processing that must be controlled: wet cutting or on-tool extraction, and respirators for anyone still at risk. Assess in writing before cutting whether it is high risk, without counting PPE or administrative controls, and without relying only on the dust controls used for the processing. If it cannot be determined, treat it as a risk to health.', `${WHS('s 529A, s 529B, s 529C, s 529CA')}; ${QCODE('Silica', 's 5.1, s 7.4.1, s 7.4.2, s 7.6')}`),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start and the work follows it (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
        src('Air monitoring is done where it is not certain the exposure standard is met, and results are kept for 30 years. For high risk processing, results over the exposure standard go to the regulator within 14 days. Workers with a significant risk from ongoing exposure have health monitoring supervised by a registered medical practitioner.', `${WHS('s 50, s 368, s 371, s 529CE, schedule 14')}; ${QCODE('Silica', 's 9.1, s 9.4, s 10.1, s 10.2')}`),
        src('Keep saw noise below 85 dB(A) over 8 hours and 140 dB(C) peak. Hearing protection where noise is above the standard, with hearing tests within 3 months of starting and at least every 2 years.', WHS('s 56, s 57, s 58')),
        src('Use handling aids for pavers. Kneeling is a hazardous posture.', MODEL('Hazardous manual tasks', 's 2.2, s 4.4')),

      ],
    }],
    ppe: ['p2', 'earMuffs'],
  },
  {
    when: 'podiumEdge',
    steps: [{
      step: 'Work at podium edges',
      hazards: ['A fall from the podium edge.', 'Soil or tools fall from the edge.'],
      controls: [
        { fact: 'fallControl' },
        src('Edge protection at the podium edge: top rail at least 900 mm above the surface the work is done from, with a mid rail or infill, and no go areas below. Where planter soil raises the surface, the guardrail is raised to suit, or access to raised soil within reach of the edge is prevented.', `${WHS('s 306D, s 306E')}; ${MODEL('Managing the risk of falls', 's 5.2, s 8.1')}`),
        src('Nothing is stored or left loose at the edge, and tools near the edge are on lanyards.', WHS('s 55, s 54')),
      ],
    }],
  },
  {
    when: 'carPark',
    steps: [{
      step: 'Work in the car park',
      hazards: ['Vehicles in the car park.'],
      controls: [
        'In the car park, work inside the principal contractor\'s traffic management: the work area is closed to vehicles with barriers, or workers are separated from traffic.',
      ],
    }],
  },
  {
    when: 'temporaryTowers',
    replaces: ['propping'],
    steps: [{
      step: 'Land steel on temporary support towers',
      hazards: ['A tower or the steel on it collapses.', 'Steel moves when it is released from the towers.'],
      controls: [
        { fact: 'temporarySupport' },
        src('Towers are erected to the engineer\'s design on a base that can take their load, and checked by the engineer before steel is landed on them. Towers built from scaffolding are erected by licensed scaffolders.', WHS('s 81, schedule 3')),
        'Towers stay loaded until the steel is connected and braced to the erection sequence and the steel erection engineer releases it. Towers are unloaded and removed only in the engineer\'s sequence.',
        src('Brace and secure the structure as it is built, to prevent structural collapse.', QCODE('Steel construction', 's 2.8')),
      ],
    }],
  },
  {
    when: 'turf',
    steps: [{
      step: 'Lay turf',
      hazards: ['Back strain from turf rolls.', 'Struck by plant moving turf.', 'Heat.'],
      controls: [
        src('Use a turf laying machine for large turf rolls. Use mechanical aids for smaller rolls, and rotate tasks.', MODEL('Hazardous manual tasks', 's 4.5, s 4.9')),
        src('Plant has a warning device, and operators and ground workers use two way acknowledgement before anyone approaches plant.', `${WHS('s 215')}; ${MODEL('Excavation work', 's 4.3')}`),
        src('Cool drinking water, shade and rest breaks in hot weather.', `${WHS('s 40, s 41')}; ${QCODE('Hazardous manual tasks', 's 4.6')}`),
      ],
    }],
    ppe: ['sunHat', 'sunscreen'],
  },
  {
    when: 'cleaningStands',
    steps: [{
      step: 'Clean the stands and aisles',
      hazards: ['A fall at the front edge of a tier, down stepped aisles or at a vomitory.', 'Slips on wet, sloping surfaces.'],
      controls: [
        src('Balustrades and barriers at tier fronts and vomitories are in place before cleaning.', `${WHS('s 78')}; ${QCODE('Managing the risk of falls', 's 4.2')}`),
        'No one climbs on them or works outside them.',
        src('Sloping and wet surfaces are a fall hazard: wear slip resistant footwear.', QCODE('Managing the risk of falls', 's 3.2, s 3.3')),
        'Use the stepped aisles, and keep wet areas small and signed.',
        'Carry cleaning gear in small loads, or move it with trolleys along the concourses.',
      ],
    }],
  },
  {
    when: 'landscapeLift',
    steps: [{
      step: 'Get soil and plants to the podium',
      hazards: ['A load falls during the lift.', 'The slab is overloaded.'],
      controls: [
        src('Soil, mulch and plants are delivered by crane or hoist to where they are used.', MODEL('Hazardous manual tasks', 's 4.7')),
        'Crane lifts are done by the crane company under its lift plan. Bulk bags and soil are landed and stored only where the slab is rated to take them, as the principal contractor directs.',
      ],
    }],
  },
  {
    when: 'dualLift',
    steps: [{
      step: 'Plan and do the dual lift',
      hazards: ['One crane is overloaded as the load shifts between the cranes.', 'The load swings, twists or drops.'],
      controls: [
        src('A load is lifted by more than one crane only where each crane is specifically designed to lift a load. Loads stay within each crane\'s limits, under control, and never over people.', WHS('s 219')),
        'The crane company plans the dual lift with a lift plan that sets the share of the load on each crane and the limits for the lift. The lift does not start until the plan is agreed and the people in it are briefed.',
        src('Dual lifts are directed by riggers holding at least an intermediate rigging licence. Sight each licence.', WHS('s 85, schedule 3')),
        src('Mobile and crawler cranes over 10 t are registered items. Get the registration details from the crane company.', WHS('schedule 5')),
      ],
    }],
  },
  {
    when: 'precastTier',
    steps: [{
      step: 'Place precast seating units on the rakers',
      hazards: ['A unit falls or slips off its bearings.', 'Hands or feet crushed between the unit and the raker.', 'A fall from a tier edge or down the sloping bowl.', 'A unit or tool falls onto people below.'],
      controls: [
        { fact: 'tierErection' },
        src('Rigging of precast concrete members needs at least a basic rigging licence. Sight each licence.', WHS('s 85, schedule 3')),
        src('Units are lifted with lifting attachments suited to the load, within limits, kept under control and never over people.', WHS('s 219')),
        'Each unit is landed on its bearings and fixed to the erection design before the hook is released. Hands and feet stay clear of the bearings until the unit is down.',
        'Brace and secure the structure as it is built, to the erection design.',
        src('Travel restraint is installed by a competent person and users are trained. It may not be practicable on slopes over 15 degrees, where fall arrest may be more appropriate.', `${WHS('s 306G')}; ${QCODE('Managing the risk of falls', 's 6, s 6.1')}`),
        'Travel restraint is inspected at least every 6 months.',
        src('Where fall arrest is used, anchors carry at least 15 kN for one person, there is enough clearance below, no one works alone, and the rescue procedure is set up and tested.', WHS('s 80, s 306I')),
        src('Units are moved and placed by crane, not by hand. Bearing pads and fixings are handled in small loads, with tasks rotated.', `${WHS('s 60')}; ${QCODE('Hazardous manual tasks', 's 4.4, s 4.7')}`),
        src('Open tier edges have edge protection with a top rail at least 900 mm above the surface, no gap over 450 mm between rails or between the lowest rail and the toe board, and a toe board or bottom rail. Where the surface the work is done from slopes more than 26 degrees, mesh or sheeting extends at least 900 mm up the edge protection.', WHS('s 306E')),
        src('An exclusion zone is set up below and beside the units being placed.', `${WHS('s 55')}; ${QCODE('Managing the risk of falls', 's 8.1')}`),
      ],
    }],
    ppe: ['harness'],
  },
  {
    when: 'safetyNet',
    steps: [{
      step: 'Install and use safety nets',
      hazards: ['A fall into a net that is poorly set up hits something below.', 'Nets damaged by hot work or debris.'],
      controls: [
        src('Safety nets are designed by an engineer or competent person for the purpose, and installed so a person falling into the net will not hit anything below it.', WHS('s 306J')),
        src('Nets are securely anchored before work starts, hung no more than 2 m below the work area, and inspected after they are installed, moved or repaired. They are not used to get in or out of the work area.', MODEL('Managing the risk of falls', 's 7.2')),
        src('No welding, oxy cutting or other work that could damage the net is done above it, and material is not left to build up in the net.', MODEL('Managing the risk of falls', 's 7.2')),
        src('Nets are erected by people holding a basic rigging or basic scaffolding licence, or trainees supervised by them.', `${WHS('schedule 3')}; ${QCODE('Managing the risk of falls', 's 7.2')}`),
        src('Static lines are erected by people holding a basic rigging licence, or trainees supervised by them.', WHS('schedule 3')),
        src('Trades are sequenced so they do not work above or below each other at the same time.', MODEL('Managing the risk of falls', 's 8.3')),
        src('A safety net is a fall arrest system: the procedure to rescue anyone caught in a net is set up and tested before work starts.', WHS('s 80')),
      ],
    }],
  },
  {
    when: 'sportsLighting',
    steps: [{
      step: 'Install sports lighting and screens at height',
      hazards: [{ unless: 'sportsField', text: 'A fall from the EWP or the roof edge.' }, { only: 'sportsField', text: 'A fall from the EWP.' }, 'The EWP overturns, or hits power lines or structure.', 'Tools, fittings or the load fall onto people below.'],
      controls: [
        { fact: 'fallControl' },
        src('Boom EWPs with a boom of 11 m or more are operated by a licensed operator. The harness is attached to the EWP\'s designated anchor point, not the handrail.', `${WHS('schedule 3')}; ${MODEL('Managing the risk of falls', 's 5.1')}`),
        src('Plan for the EWP contacting electric lines, overturning, falls from the platform and crushing. Some EWPs are not suitable for windy conditions outdoors: work within the manufacturer\'s wind limit.', MODEL('Managing the risk of falls', 's 5.1')),
        { only: 'craneNamed', ...src('Screens and light frames are lifted by the crane company with lifting attachments suited to the load, within limits, kept under control and never over people.', WHS('s 219')) },
        { only: 'craneNamed', ...src('People are lifted in a crane work box only where plant designed to lift people, such as an EWP, is not reasonably practicable. The box has a registered design and is securely attached, people stay in it and wear a harness, and there is a way to get them out safely if the crane fails.', WHS('s 219(3), s 220(1), schedule 5')) },
        src('Connecting lights and screens to the supply is electrical work, done by licensed electrical workers with the circuits isolated.', ESA('s 18, s 55, s 56')),
        src('Light fittings and screen parts are moved with trolleys and lifting aids, not carried by hand at height.', `${WHS('s 60')}; ${MODEL('Hazardous manual tasks', 's 4.5')}`),
        src('Tools and fittings at height are on lanyards, and an exclusion zone is set up below.', `${WHS('s 55')}; ${QCODE('Managing the risk of falls', 's 8.1')}`),
      ],
    }],
    ppe: ['harness'],
  },
  {
    when: 'earthworks',
    steps: [{
      step: 'Run earthmoving plant',
      hazards: ['Plant rolls over.', 'A worker is struck by plant.', 'The operator is thrown from the plant.', 'Plant strikes a buried service.'],
      controls: [
        { fact: 'excavationPlan' },
        src('Manage the risks of plant overturning, things falling on the operator, the operator being thrown out, and plant colliding with people or things. Operator protective devices (such as rollover protection and seatbelts) are fitted and used, and no one rides on plant except the operator.', WHS('s 214, s 215')),
        src('Reversing alarms can be heard by the people they warn over the noise of the work.', `${WHS('s 215')}; ${QCODE('Managing noise and preventing hearing loss', 's 2.4')}`),
        'Plant has a warning device that warns people at risk from its movement.',
        src('Traffic management for the plant is in place, and operators and ground workers use two way acknowledgement before anyone approaches plant.', MODEL('Excavation work', 's 4.3')),
        src('Operators can show they are competent on the type of plant they use.', MODEL('Excavation work', 's 4.3')),
        src('Plant, trucks and spoil stay out of the zone of influence of excavations and batters, and plant approaches trenches and embankments across the line, not parallel to it.', MODEL('Excavation work', 's 4.1, s 4.3')),
        src('Get the current underground services information before digging, and work to it.', WHS('s 304')),
        src('Plan haul roads and plant routes for blind spots, and keep plant away from overhangs and the edges of deep excavations. Ground workers wear high visibility clothing.', MODEL('Excavation work', 's 4.3')),
        src('Where a person could fall from a cut face or batter crest, install barriers or bunds, and set up clear pedestrian detours.', MODEL('Excavation work', 's 4.4')),
        'Spoil trucks leave through the site gate under the traffic management plan.',
        { text: 'Rollers and plate compactors are run by competent operators. Ride-on rollers have rollover protection and a seat belt, and keep back from trench and batter edges. Vibration is managed by rotating operators.', only: 'compaction' },
        src('Keep dust down with wet methods, such as water carts.', QCODE('Managing risks of hazardous chemicals', 's 4.1')),
        src('Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak. Hearing protection where noise is above the standard, with hearing tests within 3 months of starting and at least every 2 years.', WHS('s 56, s 57, s 58')),
      ],
    }],
    ppe: ['hivisNight', 'earPlugs'],
  },
  {
    when: 'seating',
    steps: [{
      step: 'Drill the tiers and fix seats',
      hazards: ['Silica dust from drilling concrete.', 'Noise.', 'Strain from repeated drilling, kneeling and lifting seats.', 'Vibration from drills.', 'A fall from a tier edge or down the sloping bowl.'],
      controls: [
        { fact: 'fallControl' },
        src('Open tier edges have edge protection with a top rail at least 900 mm above the surface, no gap over 450 mm between rails or between the lowest rail and the toe board, and a toe board or bottom rail. Where the surface the work is done from slopes more than 26 degrees, mesh or sheeting extends at least 900 mm up the edge protection.', WHS('s 306E')),
        { fact: 'silicaControls' },
        src('Drilling concrete with a power tool is processing a crystalline silica substance and must be controlled: on-tool extraction or wet methods, and respirators for anyone still at risk. Assess in writing before drilling whether it is high risk, without counting PPE or administrative controls, and without relying only on the dust controls used for the processing. If it cannot be determined, treat it as high risk.', `${WHS('s 529A, s 529B, s 529C, s 529CA')}; ${QCODE('Silica', 's 5.1, s 7.4.1, s 7.4.2, s 7.6')}`),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start and the work follows it (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
        src('Air monitoring is done where it is not certain the exposure standard is met, and results are kept for 30 years. For high risk processing, results over the exposure standard go to the regulator within 14 days. Workers with a significant risk from ongoing exposure have health monitoring supervised by a registered medical practitioner.', `${WHS('s 50, s 368, s 371, s 529CE, schedule 14')}; ${QCODE('Silica', 's 9.1, s 9.4, s 10.1, s 10.2')}`),
        src('Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak. If you need to raise your voice to talk to someone 1 m away, the noise is likely to be hazardous. Hearing protection is worn the whole time workers are exposed to the noise, in signposted areas, with hearing tests within 3 months of starting and at least every 2 years.', `${WHS('s 56, s 57, s 58')}; ${QCODE('Managing noise and preventing hearing loss', 's 2.2, s 3.2, s 5.3, s 5.4')}`),
        src('Repeated drilling and fixing is a hazardous manual task (repetition, awkward posture and vibration from drills): rotate tasks, use drill stands where possible, and have seats delivered by truck or crane to the tier where they are fitted.', `${WHS('s 60')}; ${QCODE('Hazardous manual tasks', 's 1.2, s 2.2, s 4.4, s 4.5, s 4.7')}`),
      ],
    }],
    ppe: ['p2', 'earMuffs', 'glassesClear'],
  },
  {
    when: 'medicalGasBraze',
    replaces: ['hotWork'],
    steps: [{
      step: 'Braze medical gas pipework',
      hazards: ['Fire from brazing near combustible material or oxygen.', 'Burns.', 'Nitrogen used for purging displaces the air in a small space or ceiling void.', 'Fumes from brazing.'],
      controls: [
        { fact: 'hotWorkPermit' },
        src('Brazing is a welding process. Hot work is done under a written hot work permit, taking into account the occupied areas around the work.', MODEL('Welding processes', 's 1.1, s 3.4')),
        src('Keep oil, grease and other hydrocarbons away from oxygen pipework, fittings and tools: oxygen in contact with them can ignite and cause a fire or explosion.', MODEL('Welding processes', 's 3.4')),
        src('Nitrogen and other inert gases are an asphyxiation hazard in high concentrations. Ventilate the work area, and monitor the atmosphere where gas could collect.', MODEL('Welding processes', 's 3.6')),
        'Pipework is purged with oxygen-free nitrogen while brazing, to the medical gas installer\'s procedure.',
        src('Gas cylinders are secured at all times and stored upright, with flashback arrestors on the gas hoses.', MODEL('Welding processes', 's 3.4, s 3.6')),
      ],
    }],
    ppe: ['gloveWelding', 'filterEye'],
  },
  {
    when: 'medicalGasLive',
    replaces: ['pressureTest'],
    steps: [{
      step: 'Test and connect to live medical gas services',
      hazards: ['A release of gas under pressure.', 'Oxygen leaks enrich the air and greatly increase the fire risk.', 'Nitrous oxide or nitrogen in the air.', 'Patients lose their gas supply.'],
      controls: [
        { fact: 'serviceShutdown' },
        { fact: 'pressureTesting' },
        src('Live medical gas pipework is pressurised gas piping: work on or near it is high risk construction work.', WHS('s 291')),
        src('Isolate by lock-out: each worker fits their own lock, and a tag alone is not an isolation.', MODEL('Managing the risks of plant in the workplace', 's 4.5')),
        src('Oxygen leaks are hard to detect. Monitor the atmosphere so the oxygen level stays between 19.5% and 23.5% (the safe oxygen level), ventilate the area, and do not work if it is outside that range.', `${WHS('s 51, s 52, schedule 19')}; ${QCODE('Welding processes', 's 3.6')}`),
        'Stop work and leave if the oxygen level is outside that range. No ignition sources while there is any risk of oxygen enrichment.',
        'Pressure tests use oxygen-free nitrogen, never standard grade nitrogen or oxygen, pressurised in stages, with joints accessible and the area cleared during the test.',
        'Exclusion zone around pipework under test. No one works on it while it is under pressure, and pressure is released before any fitting is touched.',
        src('A brazed tie-in is done under a written hot work permit that takes the occupied hospital areas into account.', QCODE('Welding processes', 's 3.4')),
        'Any smoke detection is isolated only for the work area, as the hospital agrees.',
        src('A brazed tie-in is made only after the main is isolated and depressurised, and the oxygen level at the joint is confirmed at no more than 23%. Oil and grease are kept away from oxygen fittings.', `${WHS('s 52')}; ${QCODE('Welding processes', 's 3.4, s 3.6')}`),
        src('Pipework carrying each gas is labelled, and pipework is protected from impact and damage.', WHS('s 343, s 358')),
      ],
    }],
  },
  {
    when: 'gasCylinders',
    steps: [{
      step: 'Handle gas cylinders and manifolds',
      hazards: ['A cylinder falls or is damaged and releases gas.', 'Back strain moving cylinders.'],
      controls: [
        src('Keep the fewest cylinders practicable at the work area.', WHS('s 53')),
        src('Cylinders are secured against falling, kept upright, and valves are closed when not in use.', `${MODEL('Managing risks of hazardous chemicals', 'appendix J')}; ${QCODE('Welding processes', 's 3.4, s 3.6')}`),
        'Valves are closed when cylinders are empty, valves are never lubricated, and leaks are never repaired by the user. Treat empty cylinders as if they were full.',
        src('Move cylinders with a cylinder trolley, not by rolling or carrying.', MODEL('Hazardous manual tasks', 's 4.5')),
        src('Each cylinder carries a current inspection mark.', WHS('s 224')),
        src('Monitor the manifold room atmosphere for oxygen enrichment (above 23%) while cylinders are connected or changed, and ventilate the room.', `${WHS('s 51, schedule 19')}; ${QCODE('Welding processes', 's 3.6')}`),
      ],
    }],
  },
  {
    when: 'leadShielding',
    steps: [{
      step: 'Install lead shielding',
      hazards: ['Lead dust or fume from cutting, grinding or finishing lead.', 'Lead taken home on clothing or swallowed when eating.', 'Back strain from heavy lead-lined sheets.'],
      controls: [
        src('Cutting lead with power tools, or hand grinding and finishing lead, is a lead process. Before work, assess whether it is lead risk work without counting PPE. Until that is decided, treat it as lead risk work.', WHS('s 392, s 394, s 402')),
        'Where possible, cut lead-lined board by scoring and snapping, or have it cut to size off site, instead of cutting with power tools.',
        src('Lead contamination is kept within the lead process area, and the area is cleaned by methods that do not spread lead.', WHS('s 396, s 397')),
        src('No eating, drinking, chewing gum or smoking in the lead process area. Workers remove contaminated clothing and wash their hands and faces before eating or drinking, in an eating area that lead cannot reach.', WHS('s 398, s 399')),
        src('Contaminated clothing and PPE are sealed in a container before they leave the lead process area.', WHS('s 400')),
        src('Workers are told about the lead process and its hazards before they are engaged and before they start.', WHS('s 395')),
        src('Changing rooms and washing, showering and toilet facilities are provided and kept in good order, to stop lead spreading or being swallowed.', WHS('s 399')),
        src('If it is lead risk work: the regulator is notified in writing within 7 days, and workers have health monitoring before they start and 1 month after.', WHS('s 403, s 405')),
        src('Lead-lined sheets are moved with sheet trolleys and lifters, not carried by hand.', `${WHS('s 60')}; ${MODEL('Hazardous manual tasks', 's 4.5')}`),
      ],
    }],
    ppe: ['p2', 'gloveCut'],
  },
  {
    when: 'liveHospital',
    steps: [{
      step: 'Work next to the live hospital',
      hazards: ['Patients, staff or visitors enter the work area.', 'Dust, noise or vibration reaches patients and sensitive equipment.', 'Emergency exits or access routes are blocked.', 'Hidden live services are struck.', 'Objects fall onto people next to the work.'],
      controls: [
        src('This SWMS takes into account that the work is next to an operating hospital, and the hospital\'s requirements agreed with the principal contractor.', WHS('s 299')),
        src('The work area is secured from unauthorised access. Where access cannot be prevented, hazards in it are isolated.', WHS('s 298')),
        src('Hospital entries, exits and emergency routes stay open, identifiable, free of obstruction and lit, and the emergency plan allows for patients and the people at the hospital. A register of who is on site is kept.', WHS('s 40, s 43')),
        src('The principal contractor finds the essential services at or near the work before it starts.', WHS('s 40, s 315')),
        { only: 'hospitalCut', text: 'Services may be hidden in slabs and walls: scan and confirm before drilling or cutting.' },
        { only: 'ambulance', ...src('Ambulance routes and the emergency department entry stay clear at all times: trucks and plant give way to ambulances, and traffic controllers hold site traffic when an ambulance approaches.', WHS('s 315')) },
        src('Objects cannot fall onto people next to the work: exclusion zones, enclosed lifting areas and no loads over people.', `${WHS('s 54, s 55, s 219')}; ${QCODE('Managing the risk of falls', 's 8.1')}`),
        src('Workers\' exposure to dust and noise is kept below the exposure standards.', WHS('s 49, s 56, s 57')),
        src('Take extra care with vibration near hospital equipment that is sensitive to shock and vibration.', MODEL('Excavation work', 's 3.4')),
        'Noise, dust and vibration limits at the hospital are those agreed with the hospital, and are checked while the work is done.',
        'Dust and infection control measures agreed with the hospital (such as sealed barriers and keeping doors closed) are in place before work starts, and checked each day.',
        { only: 'hospitalCut', ...src('Before drilling, cutting or penetrating an existing building, get the hospital\'s asbestos register. In a building built before 31 December 1989, asbestos likely to be disturbed by the demolition or refurbishment is identified, and removed where reasonably practicable, before the work starts. Inaccessible areas likely to contain asbestos are assumed to contain it.', WHS('s 422, s 427, s 447, s 450, s 452, s 456')) },
      ],
    }],
  },
  {
    when: 'helipad',
    steps: [{
      step: 'Build the helipad at the roof edge',
      hazards: ['A fall from the roof or helipad edge.', 'A fall through an opening in the deck.', 'The deck or steel falls during lifting.'],
      controls: [
        { fact: 'fallControl' },
        src('Prevent falls first. Edge protection at the roof and helipad edges: top rail at least 900 mm, a mid rail and a toe board.', `${WHS('s 306D, s 306E')}; ${QCODE('Managing the risk of falls', 's 5.2')}`),
        src('No more than 450 mm between rails, or between the lowest rail and the toe board.', WHS('s 306E')),
        src('Openings in the deck are made safe as soon as they are formed, with covers or barricading.', MODEL('Managing the risk of falls', 's 4.2')),
        src('Where safety nets are used, they are installed so a person falling into the net will not hit anything below it, as close as practicable below the work and no more than 2 m below it.', `${WHS('s 306J')}; ${QCODE('Managing the risk of falls', 's 7.2')}`),
        'Safety nets are designed by an engineer or competent person, and hung at the distance below the work the manufacturer or engineer specifies.',
        src('Where fall arrest is used, anchors carry at least 15 kN for one person or 21 kN for two, no one uses it alone, and the rescue procedure is in place.', WHS('s 80, s 306I')),
        src('Deck panels and steel are lifted by the crane company, kept under control and never over people. Slinging is done by licensed dogmen, and placing and securing steel by licensed riggers.', WHS('s 81, s 219, schedule 3')),
      ],
    }],
    ppe: ['harness'],
  },
  {
    when: 'pneumaticTube',
    steps: [{
      step: 'Install pneumatic tube pipework in ceilings',
      hazards: ['A fall from a scissor lift or ladder.', 'Drilling into hidden cables or gas pipes in the ceiling.', 'Back strain lifting tube lengths and stations overhead.'],
      controls: [
        { fact: 'fallControl' },
        src('Check the ceiling services before drilling or fixing: cables, medical gas and other pipes may be hidden above the ceiling and in slabs.', WHS('s 40')),
        src('Where the ceiling has energised cables or live medical gas pipes, work near them is high risk construction work: stop and have this SWMS reviewed if it is not listed above.', WHS('s 291')),
        { only: 'liveHospital', ...src('In existing buildings, inaccessible ceiling spaces likely to contain asbestos are assumed to contain it until a competent person shows otherwise.', WHS('s 422')) },
        src('Use lifting aids for tube lengths and stations, and rotate overhead work.', MODEL('Hazardous manual tasks', 's 4.5, s 4.9')),
      ],
    }],
  },
  {
    when: 'structuralOpening',
    steps: [{
      step: 'Cut an opening in a load-bearing wall',
      hazards: ['The wall or the structure above collapses.', 'A cut section falls.'],
      controls: [
        src('Cutting an opening in a load-bearing wall is demolition work: it is done by, or for, a holder of a demolition licence, with the licence holder\'s nominated supervisor readily available whenever the work is done.', WHS('s 143, s 144')),
        src('Where the structure is at least 6 m high, written notice is given to the regulator at least 5 days before the work starts.', WHS('s 142')),
        'Props stay in place until the engineer confirms the new opening and its supports are complete.',
        src('Before the work starts, the principal contractor closes the adjoining area or erects perimeter containment screening where objects could fall.', WHS('s 315H, s 315I')),
      ],
    }],
  },
  {
    when: 'generatorPlant',
    steps: [{
      step: 'Install generators and fuel systems',
      hazards: ['Fire or explosion from diesel or its vapour.', 'Fuel spills.', 'Diesel exhaust and noise when generators run.', 'The generator starts while someone is working on it.'],
      controls: [
        { fact: 'safetyDataSheet' },
        src('Work on or near fuel lines is high risk construction work.', WHS('s 291')),
        src('Keep the least practicable quantity of fuel at the work area, keep ignition sources out of hazardous areas, and contain and clean up spills straight away.', WHS('s 53, s 355, s 357')),
        src('Generators and tanks are lifted into place by the crane company or moved on skates and rollers.', `${WHS('s 219')}; ${QCODE('Hazardous manual tasks', 's 4.4')}`),
        'Keep generators and tanks under control and never move them over people.',
        { unless: 'generatorTest', ...src('The generator\'s connection, changeover switch and switchboard work are electrical work for a licensed electrician, with the supply isolated and proved de-energised first.', ESA('s 55, s 56')) },
        src('Generators are isolated by lock-out before work on them, with automatic starting disabled, and each worker fits their own lock.', MODEL('Managing the risks of plant in the workplace', 's 4.5')),
        { ...src('When generators are run for testing, the exhaust is taken outside and the room ventilated so no one breathes diesel exhaust above the exposure standard.', `${WHS('s 49')}; ${QCODE('Managing risks of hazardous chemicals', 's 1.5, s 2.1, s 4.1')}`), unless: 'generatorTest' },
        { ...src('Noise is kept below 85 dB(A) over 8 hours and 140 dB(C) peak, with hearing protection in signposted areas.', WHS('s 56, s 57, s 58')), unless: 'generatorTest' },
      ],
    }],
    ppe: ['earMuffs', 'gloveChemical'],
  },
  {
    when: 'boilerPlant',
    steps: [{
      step: 'Install and commission boilers and pressure vessels',
      hazards: ['Release of steam or pressure.', 'Burns from hot surfaces.', 'Fire or explosion from fuel.', 'Heat stress next to operating plant.'],
      controls: [
        src('Boilers and pressure vessels at hazard level A, B or C have a registered design and are registered items before they are used.', WHS('s 243, s 246, schedule 5')),
        src('Boilers are operated only by a person holding a standard or advanced boiler operation licence as the boiler requires.', WHS('s 81, schedule 3')),
        src('Isolate steam, water and fuel by lock-out before work, and release stored pressure.', MODEL('Managing the risks of plant in the workplace', 's 4.5')),
        src('No ignition sources are taken into a hazardous area around fuel systems. Work on or near gas or fuel lines is high risk construction work, listed above where it applies.', WHS('s 291, s 355')),
        src('Where other boilers or hot plant in the room stay in operation, the area has artificial extremes of temperature, which makes the work high risk construction work: plan breaks, cool water and limits on time near hot plant.', `${WHS('s 40, s 41, s 291')}; ${QCODE('Hazardous manual tasks', 's 4.6')}`),
        { only: 'gasBoiler', text: 'The gas supply is isolated and the old boiler disconnected, and the new boiler connected, leak tested and commissioned, only by a gas fitter holding the licence or authorisation the appliance needs.' },
      ],
    }],
  },
  {
    when: 'asbestosCheck',
    steps: [{
      step: 'Check for asbestos before starting',
      hazards: ['Asbestos in fibro, eaves, wall and floor linings, or vinyl tiles is disturbed and its fibres breathed in.'],
      controls: [
        { fact: 'asbestosArrangement' },
        { ...src('Before refurbishing a house, all asbestos likely to be disturbed is identified, and removed so far as is reasonably practicable before the work starts.', WHS('s 457')), unless: 'structureDemolition', only: 'domesticPremises' },
        src('Buildings built before 31 December 1989 are checked for asbestos before demolition or refurbishment. Where there is no asbestos register, a competent person inspects first. Material that cannot be identified, but a competent person believes is asbestos, is treated as asbestos.', WHS('s 422, s 447, s 451')),
        src('Asbestos is removed by a licensed asbestos removalist, except for 10 m2 or less of non-friable asbestos removed under the regulation.', WHS('s 458')),
        src('No high-pressure water spray or compressed air on asbestos, and no power tools or brooms on it unless their use is controlled. Exposure to airborne asbestos is eliminated so far as is reasonably practicable.', WHS('s 420, s 446')),
        'If material that may be asbestos is found during the work, stop, keep people away, and do not restart until it has been identified.',
      ],
    }],
  },
  {
    when: 'stripOut',
    steps: [{
      step: 'Strip out the room',
      hazards: ['Dust, including silica from tiles and render.', 'Cuts from broken tiles, glass and sheet edges.', 'Back strain carrying waste.', 'Hidden live cables or water pipes.', 'Noise from breakers and grinders.'],
      controls: [
        { only: 'kitchenStrip', text: 'Kitchen equipment is disconnected by the licensed trades, moved on trolleys or pallet jacks, and exhaust canopies are lowered with a lifter or from a platform, never held overhead from a ladder.' },
        src('Water, power and gas to the room are isolated by the licensed trades before strip-out. Check walls for hidden services before cutting or breaking.', WHS('s 40')),
        src('Removing tiles and render with power tools is processing a crystalline silica substance: use wet methods or on-tool extraction, with respirators for anyone still at risk.', `${WHS('s 529A, s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.1, s 7.4.2, s 7.6')}`),
        src('Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak, with hearing protection when breakers and grinders run.', WHS('s 56, s 57, s 58')),
        src('Carry waste in small loads or use a chute or barrow to the skip, and rotate tasks.', QCODE('Hazardous manual tasks', 's 4.4, s 4.7')),
        'Cut resistant gloves and eye protection when breaking tiles and sheets. Keep the floor clear of broken material.',
      ],
    }],
    ppe: ['p2', 'earMuffs', 'gloveCut', 'goggles'],
  },
  {
    when: 'deckBuild',
    steps: [
      {
        step: 'Set out and dig post holes',
        hazards: ['Striking buried power, gas, water or sewer services.', 'Strain from digging and lifting posts.'],
        controls: [
          src('Get the underground services information before digging, and locate services on site.', WHS('s 304')),
          src('Use a post hole digger or auger.', `${WHS('s 208')}; ${QCODE('Hazardous manual tasks', 's 4.4')}`),
          'Keep the guards in place, and use two people for hand-held augers.',
          'Barricade open holes until the posts are set.',
        ],
      },
      {
        step: 'Build the deck frame and lay the decking',
        hazards: ['A fall from the edge of the deck frame or between joists.', 'Cuts and kickback from saws.', 'Back strain lifting bearers, joists and boards.', 'Timber dust.'],
        controls: [
          { fact: 'fallControl' },
          src('Work from the ground, a platform or a scaffold where possible. Where a person could fall, prevent it with edge protection or work platforms before using fall arrest.', WHS('s 78, s 79, s 306C, s 306D')),
          src('Saws have their guards in place. Cut on a stable bench, not on the deck frame.', WHS('s 208')),
          src('Two people carry long bearers and joists, or use mechanical aids. Rotate kneeling work.', MODEL('Hazardous manual tasks', 's 4.5, s 4.9')),
          src('Keep timber dust below the exposure standard: cut outside or with extraction, and wear a dust mask when cutting treated timber.', WHS('s 49')),
          { only: 'deckStairs', text: 'Stairs and balustrades are built to the drawings, and the open edges and stair openings are protected with temporary rails until the permanent balustrade is fixed.' },
        ],
      },
    ],
    ppe: ['earPlugs', 'glassesClear', 'gloveGeneral'],
  },
  {
    when: 'houseFraming',
    steps: [
      {
        step: 'Stand and brace wall frames',
        hazards: ['A frame falls over before it is braced.', 'A fall from the top plate or a ladder.', 'Nail gun injuries.', 'Back strain lifting frames.'],
        controls: [
          { fact: 'fallControl' },
          'Brace and secure each frame as it is stood, to the frame drawings, before letting go of it.',
          src('Housing construction: where a person could fall 3 m or more, prevent the fall with edge protection, scaffolds or work platforms before using fall arrest.', WHS('s 306D, s 306E')),
          src('Ladders are industrial, rated for at least 120 kg, secured, and not used for work that needs two hands or a high degree of leverage.', `${WHS('s 306L, s 306M')}; ${MODEL('Managing the risk of falls', 's 9.1')}`),
          'Nail guns are used with the single shot (sequential) trigger, never carried with a finger on the trigger, and disconnected before clearing a jam.',
          src('Lift frames with enough people or a crane, not alone. Rotate lifting tasks.', MODEL('Hazardous manual tasks', 's 4.5, s 4.9')),
        ],
      },
      {
        step: 'Fix roof trusses',
        hazards: ['A fall from the top plate, the trusses or the roof edge.', 'Trusses fall like dominoes before they are braced.', 'A truss load strikes a worker.'],
        controls: [
          src('Trusses are fixed from inside the edge protection or scaffold, with temporary bracing fitted as each truss is placed, to the truss supplier\'s bracing layout.', WHS('s 306D, s 306E')),
          src('Truss bundles are lifted by the crane company, kept under control, never over people, and landed only on supports that can take them.', WHS('s 219')),
          src('No one works below the trusses while they are lifted or placed.', WHS('s 55')),
        ],
      },
    ],
    ppe: ['harness', 'earPlugs', 'glassesClear'],
  },
  {
    when: 'fenceBuild',
    steps: [{
      step: 'Dig post holes and build the fence',
      hazards: ['Striking buried services.', 'Entanglement in a post hole auger.', { unless: 'chainWire', text: 'Back strain from posts, sheets and concrete bags.' }, { only: 'chainWire', text: 'Back strain from posts, rails, wire rolls and concrete bags.' }, 'Cement burns.', { unless: 'farmWork', text: 'Neighbours or the public near the work.' }, { only: 'farmWork', text: 'Stock moving into the work area.' }, 'Silica dust, noise and flying particles from cutting and coring.', { only: 'gateWork', text: 'A gate leaf falls or crushes a person.' }, 'Heat and sun.'],
      controls: [
        src('Get the underground services information before digging, and locate services on site, for example through Before You Dig Australia.', WHS('s 304')),
        src('Augers are used with guards in place and loose clothing secured. Two people handle a two-person auger.', WHS('s 208')),
        { only: 'chainWire', text: 'Chain wire is unrolled and tensioned with a strainer and tie wire, with gloves and eye protection, standing clear of the line of the wire while it is under tension.' },
        src('Use barrows and trolleys for posts, sheets and concrete bags, order smaller bags where possible, and rotate tasks.', QCODE('Hazardous manual tasks', 's 4.4, s 4.7')),
        'Wear waterproof chemical resistant gloves and eye protection when mixing concrete. Wash cement off skin straight away.',
        { unless: 'farmWork', ...src('Keep the public and neighbours out of the work area with barriers, and cover or fence open holes.', WHS('s 298')) },
        { only: 'farmWork', text: 'Stock are moved out of the paddock or yard, or kept out with a temporary fence, while the work is done, and open holes are covered or fenced.' },
        'Cut posts, rails and panels with a drop saw or grinder with its guards in place, with the work clamped, and wear eye and hearing protection.',
        src('Where posts are set in paving or concrete, core or cut the hole with water suppression or on-tool extraction, as cutting concrete and pavers releases silica dust. Anyone still at risk of exposure wears a fit tested P2 respirator.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.1, s 7.4.2, s 7.6.1, s 7.6.2')}`),
        src('Assess in writing before drilling or cutting whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until that is determined.', WHS('s 529CA')),
        SILICA_FOLLOW_UP[1],
        { text: 'Wiring for automatic gate motors is done by a licensed electrician.', only: 'gateMotor' },
        { only: 'steelRails', text: 'Rails welded on site are hot work: a fire extinguisher is at hand, dry grass is cleared or wetted, and the welder wears a welding helmet, gloves and natural fibre clothing.' },
        { only: 'gateWork', text: 'Heavy gate leaves are hung with lifting aids and propped until fixed.' },
        { only: 'gateMotor', text: 'Automatic gates are commissioned with the area closed off, and their safety sensors and force limits are tested before the gates are used.' },
        { only: 'substation', text: 'No one enters the substation or works inside its fence without the network operator\'s access permit and escort, and plant and materials keep the network operator\'s exclusion distances from live equipment.' },
        { only: 'substation', text: 'The fence is earthed and bonded to the network operator\'s design, and fence panels are not joined to an existing substation fence until the earthing is in place, because of step and touch voltages.' },
        'Sun protection: hat, long sleeves, sunglasses and SPF 30 or higher sunscreen. Cool drinking water, shade and rest breaks in hot weather.',
      ],
    }],
    ppe: ['gloveCut', 'gloveChemical', 'glassesClear', 'earMuffs', 'sunHat', 'sunscreen', 'p2'],
  },
  {
    when: 'roofSpace',
    steps: [{
      step: 'Work in the roof space',
      hazards: ['Heat stress in the roof space.', 'A fall through the ceiling.', 'Insulation fibres and dust.', 'Contact with live cables.'],
      controls: [
        { only: 'exhaustFan', text: 'The fan is fixed to the ceiling framing to the manufacturer\'s instructions, its duct is run to the outlet without crushing, and it is connected by a licensed electrician.' },
        src('Roof cavities get very hot: work early in the day, limit time in the roof, take breaks, and drink water.', `${WHS('s 40')}; ${QCODE('Hazardous manual tasks', 's 4.6')}`),
        { only: 'looseFill', text: 'Before anyone enters the roof space, check the loose-fill asbestos insulation register for the house. If loose, fluffy insulation of unknown type is found, stop work, keep out of the roof space and have it tested.' },
        'Walk only on the ceiling joists or on crawl boards laid across them, never on the ceiling sheets.',
        'Wear a dust mask, long sleeves and gloves when moving insulation.',
        'Treat all cables in the roof space as live until they are proved de-energised.',
        { ...src('Work in a roof space (between the roof and the top floor ceiling) only when the electrical installation is de-energised. If that is not reasonably practicable, a risk assessment is done, the risks are as low as reasonably practicable, and the work follows a written statement of the controls.', ESR('s 31, s 33, s 34')), only: 'roofSpaceRule' },
        { unless: 'roofSpaceRule', text: 'Turn off the power at the main switchboard before going into the roof space, where the work allows it.' },
        { unless: 'tieDowns', text: 'No metal staples, fixings or foil insulation near cables.' },
      ],
    }],
    ppe: ['p2', 'longs'],
  },
  {
    when: 'cleaning',
    steps: [{
      step: 'Clean with chemicals',
      hazards: ['Chemical burns and fumes.', 'Reactions between cleaning products.'],
      controls: [
        { fact: 'safetyDataSheet' },
        src('Safety data sheets are at the work area, and decanted containers are labelled.', `${WHS('s 342, s 344, s 351')}; ${QCODE('Managing risks of hazardous chemicals', 's 2.2, s 2.3')}`),
        'Keep safety data sheets for supermarket products used for work, and never mix products.',
        src('Each product is on the hazardous chemicals register, with its current safety data sheet, kept where workers can get to it.', WHS('s 346')),
        src('Use diluted, ready-to-use products, keep lids closed, and contain spills.', `${WHS('s 357')}; ${QCODE('Managing risks of hazardous chemicals', 's 4.1, s 4.2')}`),
        'No acid cleaning products are used without the builder\'s written consent.',
      ],
    },
    {
      step: 'Clean floors, fixtures and plant rooms',
      hazards: ['Slips on wet and polished floors.', 'Electric shock from floor machines near water.', 'Contact with live or moving plant.', 'Needle-stick and cuts from sharps and debris.', 'Strain from repetitive cleaning.'],
      controls: [
        'Mop and polish one section at a time, with wet floor signs, and keep people off floors until they are dry.',
        'Light fittings and appliances are wiped only when switched off and cool.',
        'Floor scrubbers and polishers have their leads checked and tagged and are protected by an RCD. Keep leads out of water.',
        'Enter plant rooms only with the builder\'s permission. Do not touch, open or clean live or moving plant.',
        'Report sharps and pick them up only with tongs into a sharps container, never by hand.',
        'Construction dust is cleaned up with a vacuum fitted with a HEPA filter or by damp methods, not by dry sweeping or compressed air. Wear a P2 respirator where dust is raised.',
        'Use long-handled tools, rotate tasks and take breaks.',
      ],
    }],
    ppe: ['gloveChemical', 'goggles', 'gloveCut', 'p2'],
  },
  {
    when: 'cleaningHeight',
    steps: [{
      step: 'Clean windows and balconies',
      hazards: ['A fall from a balcony or from a ladder near an edge.', 'Items fall from balconies.'],
      controls: [
        { text: 'Work from the building maintenance unit (BMU) only where it has been inspected and its certification is current, the operators are trained in it, harnesses are attached to its anchor points, and work stops in high wind.', only: 'bmu' },
        src('Work from the floor with extendable tools where possible. Where cleaning is near a balcony or open edge, the balustrade or barrier is in place first.', `${WHS('s 78')}; ${MODEL('Managing the risk of falls', 's 4.1, s 4.2')}`),
        { unless: 'bmu', text: 'Outside glass that cannot be reached from the floor or a balcony is cleaned only from an EWP, or by a rope access or building maintenance unit contractor under their own SWMS.' },
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
          src('When licensed asbestos removal is finished, a clearance inspection is done by an independent competent person (an independent licensed asbestos assessor for friable asbestos) before the area is reopened.', WHS('s 473')),
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
          src('Ventilate or purge, never with pure oxygen. Test from outside for oxygen (19.5% to 23.5%), flammable gas (below 5% of the lower explosive limit) and toxic gases such as hydrogen sulphide and carbon monoxide.', `${WHS('s 71, s 72, schedule 19')}; ${QCODE('Confined spaces', 's 3.2, s 3.4, s 4.5')}`),
        ],
      },
      {
        step: 'Enter and work',
        hazards: ['A fall at the access.', 'A worker is overcome by the atmosphere.'],
        controls: [
          { fact: 'fallControl' },
          src('Monitor the air continuously, with the flammable gas alarm set at 5% of the lower explosive limit. Leave at once if any alarm sounds.', WHS('s 72')),
          'Access by fixed ladder, or by a tripod and winch with a harness where there is a fall at the access.',
          src('A standby person stays outside, in continuous contact, and never enters to rescue. Rescue is started from outside.', `${WHS('s 69, s 74')}; ${QCODE('Confined spaces', 's 4.6, s 5')}`),
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
      hazards: ['Silica dust from grinding concrete.', 'Silica dust from cutting fibre cement.', 'Noise.', 'Flying particles and sparks.'],
      controls: [
        { fact: 'silicaControls' },
        src('Grinding concrete is processing a crystalline silica substance and must be controlled: wet suppression, on-tool extraction or local exhaust, and respirators worn by anyone still at risk.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.1, s 7.4.2, s 7.6')}`),
        src('Assess in writing before grinding whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until that is determined.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
        src('Where it is uncertain whether dust is below the exposure standard, monitor the air.', WHS('s 50')),
        src('Health monitoring is provided for workers at significant risk from crystalline silica.', `${WHS('s 368, schedule 14')}; ${QCODE('Silica', 's 10, s 10.1')}`),
        src('Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak. Wear hearing protection near grinders.', `${WHS('s 56, s 57')}; ${QCODE('Managing noise and preventing hearing loss', 's 2.2, s 5.3')}`),
        src('Vacuum or wet clean dust, never dry sweep.', MODEL('Managing risks of hazardous chemicals', 's 4.1')),
        { text: 'Grinding steel throws sparks and hot particles: do it before any solvent-based primer or membrane is opened, keep combustibles clear, and wear a face shield over safety glasses.', only: 'steelGrind' },
        { text: 'Cut fibre cement by scoring and snapping, or with a saw fitted with on-tool extraction.', only: 'fibreCement' },
        { ...src('Reglets are cut into concrete with a saw fitted with water suppression or on-tool extraction, and the written silica assessment covers the reglet cutting.', QCODE('Silica', 's 7.4.1, s 7.4.2')), only: 'regletCut' },
      ],
    }],
    ppe: ['p2', 'earMuffs', 'glassesClear', 'faceShield'],
  },
  {
    when: 'wpLiquid',
    steps: [{
      step: 'Apply primers and liquid membranes',
      hazards: ['Breathing vapour from primers and membranes.', 'Fire from flammable vapour where solvent-based products are used.', 'Skin and eye contact.', 'Knee strain from long periods kneeling.'],
      controls: [
        { text: 'Spray rigs are run only by trained operators: the gun is never pointed at anyone, the trigger is locked when not spraying, pressure is released before the tip is cleaned, and the area downwind is closed off from overspray.', only: 'sprayApply' },
        { fact: 'safetyDataSheet' },
        { only: 'waterproofTile', text: 'Where a shower base or tray is replaced, the new base is set and connected to the waste by a licensed plumber before the membrane goes on.' },
        src('The current safety data sheet for each product is at the work area, the product is on the hazardous chemicals register, and anything decanted is labelled.', WHS('s 342, s 344, s 346')),
        src('Use a less hazardous product where possible, such as a water-based membrane instead of a solvent or two-part epoxy system.', `${WHS('s 36')}; ${QCODE('Managing risks of hazardous chemicals', 's 4.1')}`),
        src('Keep vapour below the exposure standard. Vapour heavier than air collects low down: extract from the lowest point and bring fresh air in from above.', `${WHS('s 49')}; ${QCODE('Managing risks of hazardous chemicals', 's 1.5, s 3.4, s 4.1')}`),
        src('No ignition sources where flammable vapour may be present. Keep only small quantities at the work area.', WHS('s 53, s 355')),
        'A suitable fire extinguisher is kept at the work area while solvent-based primers or membranes are in use.',
        src('Lids stay on except when pouring, and spills are contained and cleaned up straight away.', `${WHS('s 357')}; ${MODEL('Managing risks of hazardous chemicals', 's 4.2')}`),
        src('Wear gloves resistant to the product used, and no eating, drinking or smoking in the work area.', MODEL('Managing risks of hazardous chemicals', 's 4.1')),
        src('Where solvent-based products are used, fans and electrical equipment are designed for hazardous areas.', MODEL('Managing risks of hazardous chemicals', 's 4.2')),
        src('If the safety data sheet lists isocyanates, workers who use the product as ongoing work have health monitoring supervised by a registered medical practitioner.', WHS('s 368, s 371, schedule 14')),
        'Wear the fit tested half-face respirator, with the filter type the safety data sheet lists, when applying solvent-based or two-part products, or where vapour cannot be kept below the exposure standard.',
        src('Long periods kneeling are a hazardous manual task: rotate tasks.', QCODE('Hazardous manual tasks', 's 2.2, s 4.7')),
        'Use knee pads.',
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
        src('Bitumen is a combustible fuel: clear rubbish and other fuel from the area, and keep fire-fighting equipment at the work area.', `${QCODE('Managing risks of hazardous chemicals', 's 4.2, s 6.3, appendix H')}; ${MODEL('Welding processes', 's 3.4')}`),
        'A hot work permit is issued before torching.',
        src('LPG cylinders are upright and secured, have a working relief valve, and valves are closed when not in use. Fittings are leak tested with detergent or leak spray.', `${QCODE('Managing risks of hazardous chemicals', 's 4.2')}; ${QCODE('Welding processes', 's 3.6')}`),
        'Flashback arrestors are fitted, and hoses have crimped or permanent clips.',
        src('Gas heavier than air collects in pits and low areas, so keep low-lying work areas well ventilated.', QCODE('Welding processes', 's 3.6')),
        'No torching in pits, sumps or enclosed spaces.',
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
        src('Work from a solid surface with edge protection wherever a fall of 2 m or more is possible: top rail at least 900 mm, rails no more than 450 mm apart, toe board at least 150 mm.', WHS('s 78, s 306D, s 306E')),
        src('Openings are covered with fixed covers that take a fall.', WHS('s 306F')),
        src('Where travel restraint is used, it stops the wearer reaching the edge. Fall arrest is used only with someone on site who can rescue.', MODEL('Managing the risk of falls', 's 6.1, s 7.3')),
        src('No materials stacked near edges, and loose material is secured against wind.', WHS('s 54, s 55')),
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
        src('Hoist loads stay within the rated load and under control, landing gates stay closed except while loading, and no one stands under a load being lifted.', WHS('s 219')),
        'Ballast and insulation boards are moved in small loads with barrows or trolleys, boards are handled by two people, board handling stops in strong wind, and spreading tasks are rotated.',
        src('Long periods kneeling are a hazardous manual task: rotate tasks.', `${WHS('s 60')}; ${QCODE('Hazardous manual tasks', 's 2.2, s 4.7')}`),
        'Use knee pads.',
      ],
    }],
  },
  {
    when: 'pressureTest',
    steps: [{
      step: 'Pressure test and commission',
      hazards: ['A fitting or cap blows off under pressure.', 'Flooding.'],
      controls: [
        { fact: 'pressureTesting' },
        'Exclusion zone around the pipework under test. No one works on it while it is under pressure.',
        'Release pressure fully before tightening or changing fittings.',
      ],
    }],
  },
  {
    when: 'hotWater',
    steps: [{
      step: 'Commission hot water',
      hazards: ['Hot water scalds.', 'Burns from hot pipes.'],
      controls: [
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
          { unless: 'poolOnly', text: 'Check the weather, and the tides on tidal water, before starting. Stop work in rough conditions.' },
        ],
      },
      {
        unless: 'poolOnly',
        step: 'Work over the water',
        hazards: [{ unless: 'poolOnly', text: 'A fall into the water from the edge, an open bay or the work boat.' }, { only: 'poolOnly', text: 'A fall into the pool.' }, 'Splinters and cuts.', 'Power tool injuries.', 'Tools and materials fall into the water.'],
        controls: [
          { unless: 'poolOnly', text: 'Life jackets are worn by anyone who could fall into the water.' },
          { text: 'Open one bay at a time and cover or barricade it.', only: 'deckingWork' },
          { text: 'Wear gloves when handling timber.', only: 'deckingWork' },
          { text: 'A punt, barge or work boat is moored and stable before anyone works from it, is not overloaded, and is run by a competent operator.', only: 'workBoat' },
          'Use tools with guards in place, and battery tools rather than mains power over the water where practical.',
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
        hazards: ['Breathing in paint vapour.', { only: 'occupied', text: 'Residents, patients or the public walk into the work or breathe paint fumes.' }, { only: 'nightWork', text: 'Poor lighting and fatigue at night.' }],
        controls: [
          { fact: 'safetyDataSheet' },
          { only: 'occupied', text: 'Low odour, water-based products are used, and rooms are ventilated before they are reopened.' },
          src('The current safety data sheet is at the work area, the product is on the register, and containers are labelled. Use water-based paint instead of solvent-based paint where possible.', `${WHS('s 341, s 344, s 346')}; ${QCODE('Managing risks of hazardous chemicals', 's 1.6, s 2.2, s 2.3, s 4.1')}`),
          src('Ventilate as the label says: natural ventilation suits only small amounts of low toxicity products. Use fans or extraction otherwise.', MODEL('Managing risks of hazardous chemicals', 's 4.1, s 4.2')),
        ],
      },
      {
        step: 'Sand and fill surfaces',
        hazards: ['Dust from sanding filler and surfaces.', 'Lead dust where existing surfaces with old paint are sanded or stripped.'],
        controls: [
          'Where existing painted surfaces are sanded or stripped, old paint may contain lead, which is common in paint used before 1970. Test it first, and if it contains lead, follow AS/NZS 4361.2 for removing lead paint.',
          'Sand with dust extraction or wet sanding where possible. Clean up dust with a vacuum, never by dry sweeping.',
          'Wear a P2 respirator and eye protection for dry sanding.',
          { only: 'paintExternal', text: 'Preparation at height is done only once the access and fall protection set out for painting the outside of the structure are in place.' },
        ],
      },
      {
        step: 'Paint',
        hazards: ['Paint on the skin or in the eyes.', 'Trips over drop sheets and tins.'],
        controls: [
          src('Wear the gloves and eye protection the safety data sheet lists.', QCODE('Managing risks of hazardous chemicals', 's 4.1, s 4.2')),
          src('Painting is a repetitive task: rotate tasks.', QCODE('Hazardous manual tasks', 's 2.2, s 4.7')),
          'Tape down drop sheets at their edges, and keep walkways clear of tins and trays.',
          'Keep only the paint needed in the work area, with lids on when not in use.',
        ],
      },
      {
        step: 'Clean brushes and rollers',
        hazards: ['Paint washings polluting drains, stormwater or soil.', 'Solvent vapour and skin contact from cleaning solvents.'],
        controls: [
          'Clean water-based paint equipment at the washout facility, never in a drain, gutter or on the ground.',
          'Collect solvent and solvent-based paint waste in closed, labelled containers for disposal as hazardous waste.',
          'Wear the gloves the safety data sheet lists when cleaning with solvents, with the area ventilated.',
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
        src('Fall hazards under 2 m are identified, assessed and controlled before work starts.', WHS('s 306C')),
        src('Ladders are industrial and rated for at least 120 kg. Use platform ladders, step platforms or trestles rather than stepladders.', `${WHS('s 306M')}; ${MODEL('Managing the risk of falls', 's 9.1')}`),
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
        src('Heavier than air vapour collects in low and enclosed areas, such as stairwells, pits and basements.', `${WHS('s 51')}; ${QCODE('Managing risks of hazardous chemicals', 's 3.4, appendix I')}`),
        'An atmosphere above 5% of the lower explosive limit is a hazardous atmosphere: stop and ventilate.',
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
        src('Where it is uncertain whether vapour is below the exposure standard, for example in enclosed rooms, stairwells or basements, monitor the air.', WHS('s 49, s 50')),
        src('Painters exposed to solvents and noise together: noise is reduced to 80 dB(A) or below, as the noise code recommends for ototoxic substances, with hearing tests.', QCODE('Managing noise and preventing hearing loss', 'appendix B, s 5.4')),
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
// Kinds of work any trade can strike, built partly from the steps above so the
// cited controls are written once. Each goes in after the kind it is closest to.
function addAfter(when, activity) {
  const at = ACTIVITIES.findIndex((item) => item.when === when);
  ACTIVITIES.splice(at + 1, 0, activity);
}
const stepOf = (when, name) => ACTIVITIES.find((item) => item.when === when).steps.find((step) => step.step === name);
const without = (controls, pattern) => controls.filter((item) => !pattern.test(typeof item === 'string' ? item : item.text || ''));

// Roof work by a trade other than the roofer (solar hot water, lightning conductors,
// cowls, tiling a roof top): getting onto the roof and lifting equipment to it.
addAfter('roof', {
  when: 'roofAccess',
  steps: [
    {
      step: 'Get onto the roof and set up fall protection',
      hazards: ['Falling from the roof edge or through an opening.', 'Falling through a skylight or fragile roof surface.'],
      controls: [
        { fact: 'fallControl' },
        'Fall protection is in place and checked before anyone goes onto the roof.',
        src('Roof edge protection is erected to the manufacturer\'s instructions: top rail at least 900 mm above the surface, a toe board at least 150 mm high or a bottom rail 150 mm to 250 mm above the surface, and no more than 450 mm between rails, or between the lowest rail and the toe board.', WHS('s 306E')),
        'Skylights, roof openings and any fragile surface are covered with fixed covers that take a fall, or fenced off, before work starts near them.',
        'Access by a scaffold stair, or a ladder secured top and bottom that extends above the landing.',
        'Do not work on the roof in wet, windy or stormy weather.',
      ],
    },
    {
      unless: 'treeOnRoof',
      step: 'Lift equipment and materials to the roof',
      hazards: ['A load falls onto people below.', 'Strain carrying equipment up ladders.', 'Overloading the roof structure.'],
      controls: [
        'Equipment and materials too heavy or bulky to carry safely are lifted to the roof by crane, hoist or materials lift, never carried up a ladder.',
        'Where a crane is used, the lift is done under the crane company\'s or principal contractor\'s lift plan, slung and directed by a licensed dogger, with no load passing over people.',
        'Ballast and insulation boards are moved in small loads with barrows or trolleys, boards are handled by two people, board handling stops in strong wind, and spreading tasks are rotated.',
        'Exclusion zone below the lift and below the roof edge, with barriers and signs.',
        'Heavy equipment and materials are placed only where the roof structure is designed to take them, as the engineer or supplier sets out.',
        'Secure equipment and offcuts on the roof against wind, and keep them back from the edge.',
      ],
    },
  ],
  ppe: ['sunHat', 'sunscreen'],
});

// Working inside a lift car (tiling or finishing the car floor or walls).
addAfter('liftCar', {
  when: 'liftCarWork',
  steps: [{
    step: 'Work inside lift cars',
    hazards: ['The lift moves while people are in the car.', 'A fall into the lift shaft through open landing doors.'],
    controls: [
      'The lift contractor isolates and locks the lift before work in the car, and issues its permit. Each of our workers in the car fits a personal lock to the isolation.',
      'Landing doors stay closed, or are barricaded where open, and no one works at an open shaft.',
      'The lift is not returned to service until our crew has left the car and each worker has removed their lock.',
    ],
  }],
});

// Reinstating asphalt over trenches.
addAfter('trench', {
  when: 'asphalt',
  steps: [{
    step: 'Saw cut and reinstate asphalt',
    hazards: ['Burns from hot asphalt.', 'Fumes from hot asphalt and bitumen.', 'Silica dust and noise from saw cutting.', 'Traffic and plant near the work.'],
    controls: [
      src('Saw cut existing asphalt and concrete wet or with dust extraction, with hearing and eye protection. Cutting concrete is processing a crystalline silica substance.', QCODE('Silica', 's 5.1, s 7.4.1, s 7.4.2')),
      ...without(stepOf('coreDrill', 'Core drill through the slab or wall').controls, /falling core|Cover or barricade the hole|Drilling concrete is processing/).filter((item) => !item.fact),
      'Hot asphalt is handled with long sleeves, gloves and boots, and kept away from other workers. Work upwind of the fumes where possible.',
      'Any roller or truck works inside the traffic management or barriers set out for the work, with a spotter when reversing.',
    ],
  }],
  ppe: ['earMuffs', 'gloveGeneral', 'gloveWelding', 'p2', 'glassesClear'],
});

// Installing glasswool or other mineral fibre insulation.
addAfter('plasterSheets', {
  when: 'insulation',
  steps: [{
    step: 'Install insulation',
    hazards: ['Skin, eye and throat irritation from glasswool fibres.', { only: 'ceilingInsulation', text: 'Strain working overhead.' }, { only: 'ceilingInsulation', text: 'Electric shock from damaged or live cables and fittings in the ceiling space.' }, { only: 'ceilingInsulation', text: 'A fall through the ceiling.' }, { only: 'ceilingInsulation', text: 'Heat stress in the roof space.' }],
    controls: [
      { ...src('Before the insulation is installed, an on-site assessment of the electrical risk is done by a worker trained to do it, and the controls it calls for are in place. The record is kept for 5 years.', ESR('s 40, s 41')), only: 'roofSpaceWork' },
      { ...src('Insulation is not fastened to the ceiling structure with metal or other conductive fasteners, and is kept clear of recessed light fittings and their transformers as the wiring rules require.', ESR('s 38, s 39')), only: 'roofSpaceWork' },
      { only: 'looseFill', text: 'Before anyone enters the roof space, check the loose-fill asbestos insulation register for the house. If loose, fluffy insulation of unknown type is found, stop work, keep out of the roof space and have it tested.' },
      { text: 'In the roof space, walk only on joists or crawl boards, and plan work for the cooler part of the day, with breaks and water.', only: 'roofSpaceWork' },
      'Handle insulation with long sleeves, gloves and eye protection, and wear a P2 respirator when cutting it or working in dusty spaces.',
      'Cut insulation with a knife, not a power saw, and clean up with a vacuum, not by sweeping.',
      { text: 'Install ceiling insulation from a platform, not by reaching overhead from a ladder.', unless: 'roofSpaceWork', only: 'ceilingInsulation' },
      { only: 'wallInsulation', text: 'Wall batts are fitted between studs from the floor or a platform ladder, and cables in the wall cavity are treated as live and kept clear of.' },
    ],
  }],
  ppe: ['p2', 'glassesClear'],
});

// Cutting steel with oxy-acetylene: the hot work controls, without the pipe brazing lines.
const brazing = stepOf('hotWork', 'Braze and solder pipe joints (hot work)');
addAfter('hotWork', {
  when: 'oxyCutting',
  steps: [{
    step: 'Cut steel with oxy-acetylene (hot work)',
    hazards: ['Fire from sparks, slag or hot metal.', 'Gas cylinder leaks or flashback.', 'Fumes.', 'Burns and eye injury.'],
    controls: [
      ...without(brazing.controls, /Mark hot pipe|Hot work at height or in risers/),
      'Remove or cover combustible materials where sparks and slag can reach them, including on the floor below.',
      'A fire watch is kept during the cutting and for the time the hot work permit sets after it stops.',
      'Wear filter eye protection rated for gas cutting, fire-resistant gloves and natural fibre clothing.',
    ],
  }],
  ppe: ['gloveWelding', 'filterEye'],
});

// Drilling or cutting concrete, masonry or stone by a trade without its own cutting
// step (fixing frames, anchors, posts): the silica controls from core drilling.
const coring = stepOf('coreDrill', 'Core drill through the slab or wall');
addAfter('coreDrill', {
  when: 'silicaDrill',
  steps: [{
    step: 'Drill or cut concrete, masonry or stone',
    hazards: ['Silica dust from drilling or cutting.', 'Noise and vibration.', 'Striking hidden services.'],
    controls: [
      { only: 'grinding', text: 'Grinding concrete is done with a shrouded grinder on H class extraction, and pedestrians are kept out of the area with barriers.' },
      ...without(coring.controls, /falling core|Cover or barricade the hole/),
      { unless: 'grindOnly', text: 'Scan or check drawings for hidden services and reinforcement before drilling into walls and slabs.' },
      'Use low-vibration tools and rotate operators to limit hand-arm vibration.',
    ],
  }],
  ppe: ['p2', 'earMuffs', 'glassesClear'],
});

// Skid steers, posi-tracks and other small mobile plant.
addAfter('earthworks', {
  when: 'smallPlant',
  steps: [{
    step: 'Operate small earthmoving plant',
    hazards: ['A person is struck by plant.', 'Plant rolls over on a slope or edge.', 'Plant damages finished work or services.'],
    controls: [
      { only: 'gravelWork', text: 'Use a roller or plate compactor to compact the gravel in layers after it is spread with the bobcat, and give tipping trucks a spotter.' },
      { only: 'rockLining', text: 'Rocks are placed with an excavator or bobcat, and no one stands between the rock and the machine or below rock on a slope.' },
      'Operators can show they are competent on the type of plant they use, and plant is checked before each shift.',
      'Plant has a warning device and reversing alarm, and ground workers stay out of its path. Operators and ground workers use two way acknowledgement before anyone approaches.',
      'Seatbelts are worn where rollover protection is fitted. Plant works across slopes as little as possible and stays back from edges, batters and excavations.',
      'Routes are planned away from pedestrians, and a spotter is used where the operator cannot see.',
      'Where plant travels on a public road, it does so only under the traffic management plan.',
    ],
  }],
  ppe: ['hivis', 'earPlugs'],
});

// Removing trees, stumps and roots.
addAfter('landscape', {
  when: 'treeRemoval',
  steps: [{
    step: 'Remove trees, stumps and roots',
    hazards: [{ unless: 'stumpOnly', text: 'A tree or limb falls on a person.' }, { unless: 'stumpOnly', text: 'Chainsaw cuts and kickback.' }, 'Stump grinder debris.', 'Striking services or overhead power lines.', { unless: 'stumpOnly', text: 'Noise from chainsaws and stump grinders.' }],
    controls: [
      { unless: 'stumpOnly', text: 'Where trees are felled, they are felled from the ground only by competent chainsaw operators, with a plan for the direction of fall. A tree that must be dismantled at height is done by an arborist under their own SWMS.' },
      { unless: 'stumpOnly', text: 'Keep an exclusion zone around felling of at least twice the height of the tree, and around any work under a tree being cut.' },
      'Check for overhead power lines and buried services before felling or grinding. Work near power lines only under the network operator\'s requirements.',
      { unless: 'stumpOnly', text: 'Chainsaws have a working chain brake and are refuelled only when stopped and cool. Operators wear chainsaw chaps or trousers, a helmet with face shield, and hearing protection.' },
      'Stump grinders are used with their guards in place and an exclusion zone for flying debris.',
    ],
  }],
  ppe: ['faceShield', 'earMuffs', 'chaps', 'gloveCut'],
});

// Herbicides and ground treatment.
addAfter('treeRemoval', {
  when: 'groundChemicals',
  steps: [{
    step: 'Treat the ground with chemicals',
    hazards: ['Skin, eye and breathing contact with herbicides or termiticides.', 'Spray drift onto people, plants or waterways.'],
    controls: [
      { fact: 'safetyDataSheet' },
      'Each product is applied as its label and safety data sheet require, by a worker trained for it. Termite treatments are applied only by a holder of a Queensland Health pest management licence for timber pests, who also holds a QBCC termite management (chemical) licence for treatments to new building work. Herbicide spraying with powered ground equipment in a regulated area is done only by a licensed commercial operator.',
      'Do not spray in wind that carries drift, or near drains and waterways. Keep people out of treated areas for the time the label sets.',
      'Mix and decant only in a ventilated area with spill containment, and wear the gloves, eye protection and respirator (with the filter or cartridge type) the label lists.',
    ],
  }],
  ppe: ['gloveChemical', 'goggles'],
});

// Connecting to an incoming water supply.
addAfter('sewerConnection', {
  when: 'waterConnection',
  steps: [{
    step: 'Connect to the water supply',
    hazards: ['Water under pressure when a live main or supply is cut into.', 'Flooding.', 'Contaminating the drinking water supply.'],
    controls: [
      'Connections to the water authority\'s main are made only with its approval, and by it where it requires.',
      'The supply is isolated at the valve, locked or tagged so it cannot be opened, and depressurised and drained before cutting in.',
      'New pipework is restrained and supported before it is charged, and charged slowly with air released.',
      'Backflow prevention is installed and tested as the plumbing approval requires, before the supply is used.',
    ],
  }],
  ppe: ['gloveGeneral'],
});

// Standing door frames and hanging doors.
addAfter('carpJoinery', {
  when: 'doorHang',
  steps: [{
    step: 'Stand frames and hang doors',
    hazards: ['Strain handling heavy doors.', 'A door or frame falls on a person.', 'Silica dust from drilling masonry for fixings.', 'Power tool injuries.'],
    controls: [
      'Heavy doors are moved on door trolleys and hung with a door lifter or by two people.',
      'Frames are fixed or braced as soon as they are stood, and doors are wedged or propped until hung.',
      src('Drill masonry and concrete for frame fixings with on-tool dust extraction, and wear a fit tested P2 respirator where dust remains.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2, s 7.6.1, s 7.6.2')}`),
      ...SILICA_FOLLOW_UP,
      'Adhesives, sealants and sealers are used as their safety data sheets set out, with good ventilation and gloves resistant to the product.',
      'Use power tools with guards in place, with eye and hearing protection.',
      { text: 'Automatic door operators and tracks are fixed from a platform suited to the height. The mains connection is made by a licensed electrician, and the supply is isolated while the operator is fitted.', only: 'autoDoors' },
      { text: 'Automatic doors are commissioned with the doorway closed off, and their safety sensors are tested for crush and entrapment before the doorway is opened to people.', only: 'autoDoors' },
    ],
  }],
  ppe: ['gloveGeneral', 'glassesClear'],
});

// Slabs on ground: house and ground floor slabs, driveways, paths, kerbs and pads.
// They come before the deck work, as a ground slab is poured first.
addAfter(ACTIVITIES[ACTIVITIES.findIndex((item) => item.when === 'formwork') - 1].when, {
  when: 'slabGround',
  steps: [
    {
      step: 'Prepare the ground and set out',
      hazards: ['Striking underground services.', { unless: 'smallPour', text: 'Plant strikes a person.' }, 'An excavation for edge beams, footings or thickened edges collapses, or a person falls in.', 'Dust, noise and vibration from compaction.'],
      controls: [
        { ...src('Get the current underground services information before digging, and locate services on site, for example through Before You Dig Australia.', WHS('s 304')), unless: 'trench' },
        { unless: 'smallPour', text: 'Excavators, bobcats and rollers are run by competent operators, checked before each shift, with an exclusion zone and a spotter where people work nearby.' },
        { unless: 'kerbWork', ...src('Boxing out, thickened edges, edge beams and footings are dug no deeper than needed, and battered or benched where the ground needs it.', WHS('s 305')) },
        // Where this SWMS has the trench steps, deeper trenches are covered by them.
        { ...src('A trench or shaft deeper than 1.5 m is high risk construction work this SWMS does not cover: stop and have the SWMS reviewed before anyone enters it.', WHS('s 291')), unless: 'trench' },
        'Open excavations are barricaded, and people cross only at set crossing points.',
        'Plate compactors and rollers are used with guards in place, operators are rotated to limit vibration, and hearing protection is worn.',
        'Dust from fill and the subgrade is kept down with water.',
      ],
    },
    {
      step: 'Set edge forms and prepare the base',
      hazards: ['Impalement on stakes, pegs and starter bars.', 'Cuts and kickback from saws.', 'Nail gun injuries.', 'Back strain from form boards and stakes.', 'Trips over forms and stakes.', 'Back strain and trips handling pods and vapour barrier rolls.'],
      controls: [
        'Cap stakes, star pickets and starter bars as soon as they are in place. Bars are bent over only where the engineer allows it.',
        'Cut form boards with a saw that has its guards in place, with the work supported, and wear eye and hearing protection.',
        'Nail guns are used with the single shot (sequential) trigger, never pointed at anyone, and disconnected before clearing a jam.',
        'Deliver and stack materials close to where they are used, and team lift long boards.',
        'Pod bundles and vapour barrier rolls are moved on trolleys. Lay boards where people cross pods or sheeting, and weigh down sheeting and pods against wind.',
      ],
    },
    {
      unless: 'kerbWork',
      step: 'Place and tie reo on the ground',
      hazards: ['Impalement on bars.', 'Cuts and back strain handling mesh and bars.', 'Trips on bar chairs and mesh.', 'Sparks and noise from cutting bars.'],
      controls: [
        'Mesh sheets are handled by two people or with a mechanical aid, wearing cut resistant gloves.',
        'Cap or cover exposed bar ends and starter bars.',
        'Lay walkways over mesh where people need to cross it.',
        'Cut bars with a bar cutter, or with a grinder or cut-off saw with its guards in place. Wear eye and hearing protection, and keep sparks clear of other workers and plastic sheeting.',
        'Rotate tying tasks, and use a tying tool or long-handled tier to limit bending.',
      ],
    },
  ],
  ppe: ['gloveCut', 'earMuffs', 'sunHat', 'sunscreen'],
});

// Placing and finishing a slab on ground, also for a concreter who only pours.
addAfter('slabGround', {
  when: 'slabPour',
  steps: [
    {
      step: 'Place concrete',
      hazards: [{ unless: 'smallPour', text: 'A reversing concrete truck strikes a person.' }, { unless: 'smallPour', text: 'Contact with overhead power lines.' }, { unless: 'smallPour', text: 'Struck by a swinging chute.' }, { unless: 'smallPour', text: 'Struck by a pump hose or a burst line.' }, 'Cement burns to the skin and eyes.', 'Back strain from barrowing and screeding.'],
      controls: [
        { unless: 'smallPour', text: 'Concrete trucks reverse only with a spotter, into a marked area kept clear of people, and stand on firm ground back from excavation edges.' },
        { unless: 'smallPour', text: 'Check for overhead power lines before a truck, pump or boom sets up. Keep plant outside the approach distances, with a spotter where it could come close.' },
        { unless: 'smallPour', text: 'Keep clear of the chute while it is swung or extended.' },
        'Where a line pump or boom pump is used, check pipes, clamps and the end hose before pumping, keep people clear of the end hose at start-up, and clear blockages only after the pressure is released.',
        src('Where a concrete placing boom is used, it is registered plant and its operator holds a high risk work licence for a concrete placing boom.', WHS('s 81, schedule 3, schedule 5')),
        'Where the truck or pump stands on the road or footpath, the traffic management set out for the work is in place and people walking past are kept clear or diverted.',
        'Wear safety gumboots, chemical resistant gloves, eye protection and long sleeves, and wash wet concrete off the skin straight away.',
        'Barrow loads are kept to what a person can handle, on boarded runs, and barrowing and screeding are rotated.',
        { unless: 'smallPour', text: 'Vibrators have their leads checked and tagged and are protected by an RCD.' },
        'Where the engineer inspects before the pour, the pour starts only once the inspection is passed.',
        'Slump tests and test cylinders are taken at the chute with the truck stopped, wearing gloves and eye protection.',
      ],
    },
    {
      step: 'Finish, joint and cure',
      hazards: [{ unless: 'smallPour', text: 'Power trowel injuries.' }, 'Carbon monoxide from petrol plant used where exhaust can collect.', 'Silica dust and noise from saw cutting joints.', 'Chemicals in curing compounds and sealers.', 'Knee and back strain finishing edges.'],
      controls: [
        { unless: 'smallPourOrKerb', text: 'Power trowels have their guards in place and a working stop switch that cuts out when released, and are never left running unattended.' },
        { unless: 'smallPour', text: 'Petrol trowels, saws and generators run only outdoors or where exhaust cannot collect.' },
        src('Where control joints are saw cut, or concrete is cut or drilled, it is done wet or with on-tool extraction. This is processing a crystalline silica substance. Anyone still at risk of exposure wears a fit tested P2 respirator.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 5.1, s 7.4.1, s 7.4.2, s 7.6.1, s 7.6.2')}`),
        src('Before any saw cutting or drilling, assess in writing whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation.', WHS('s 529CA')),
        SILICA_FOLLOW_UP[1],
        src('Where it is uncertain whether dust is below the exposure standard, monitor the air.', WHS('s 50')),
        src('Health monitoring is provided for workers at significant risk from crystalline silica.', `${WHS('s 368, schedule 14')}; ${QCODE('Silica', 's 10, s 10.1')}`),
        'Concrete saws have their blade guards in place, and electric saws used wet are protected by an RCD, with leads kept out of water.',
        src('Hearing protection where noise exceeds the exposure standard, such as near saws, power trowels and compactors. Workers who must wear it have hearing tests within 3 months of starting and at least every 2 years.', WHS('s 57, s 58')),
        'Curing compounds and sealers are used as their safety data sheets set out, with chemical resistant gloves and eye protection.',
        'Use knee pads and kneeling boards for edge finishing, and rotate tasks.',
      ],
    },
  ],
  ppe: ['gloveChemical', 'gloveCut', 'gumboots', 'goggles', 'earMuffs', 'p2', 'kneePads', 'sunHat', 'sunscreen'],
});

const PPE = [
  { area: 'Head', items: [['hardHat', 'Hard hat'], ['chinStrap', 'Chin strap'], ['sunHat', 'Broad brim or neck flap']] },
  { area: 'Eyes and face', items: [['glassesClear', 'Safety glasses, clear'], ['glassesTinted', 'Safety glasses, tinted'], ['goggles', 'Goggles'], ['faceShield', 'Face shield'], ['filterEye', 'Filter eye protection (brazing or welding)']] },
  { area: 'Hearing', items: [['earPlugs', 'Ear plugs'], ['earMuffs', 'Ear muffs']] },
  { area: 'Breathing', items: [['p2', 'P2 respirator (fit tested)'], ['halfFace', 'Half-face respirator with filters (fit tested)']] },
  { area: 'Hands', items: [['gloveGeneral', 'General purpose gloves'], ['gloveCut', 'Cut resistant gloves'], ['gloveChemical', 'Chemical resistant gloves'], ['gloveInsulated', 'Insulated electrical gloves'], ['gloveWelding', 'Welding or heat resistant gloves'], ['gloveCold', 'Cold resistant gloves (refrigerant)']] },
  { area: 'Body', items: [['longs', 'Long sleeves and long pants'], ['hivis', 'Hi-vis, day'], ['hivisNight', 'Hi-vis, day and night'], ['coveralls', 'Disposable coveralls'], ['chaps', 'Chainsaw chaps or trousers'], ['arcRated', 'Arc-rated face shield and flame-resistant clothing']] },
  { area: 'Knees', items: [['kneePads', 'Knee pads']] },
  { area: 'Feet', items: [['boots', 'Safety boots'], ['gumboots', 'Safety gumboots']] },
  { area: 'Sun', items: [['sunscreen', 'Sunscreen']] },
  { area: 'Falls and water', items: [['harness', 'Full body harness'], ['lifeJacket', 'Life jacket']] },
];

const SITE_MINIMUM = ['hardHat', 'glassesClear', 'gloveGeneral', 'longs', 'hivis', 'boots'];
const PPE_IDS = new Set(PPE.flatMap((group) => group.items.map(([id]) => id)));

// A fact control may carry `otherwise`, a line used only when the fact is not given.
// A choice control gives the lines for the option the user chose.
// cite is the state: its own sources are printed after each control, where they
// have been checked (see citations.js). Unchecked sources are left off.
function expand(control, factText, cite = 'qld') {
  if (typeof control === 'string') {
    const text = localText(control, cite);
    return text == null ? [] : [text];
  }
  if (control.text) {
    const text = localText(control.text, cite);
    if (text == null) return [];
    // A line reworded for another state keeps only sources that still fit it: none for Queensland-only law.
    const source = cite && control.source && text === control.text ? localSource(control.source, cite) : '';
    return [source ? `${text} (${source})` : text];
  }
  if (control.choice) return (control.options[factText(control.choice)] || []).flatMap((item) => expand(item, factText, cite));
  const text = factText(control.fact);
  if (text) return [text];
  return control.otherwise ? [control.otherwise] : [];
}

// Residential and small works the trades do every day, added so the step picker and
// the task's words have job steps for them. Isolation, roof access, fall controls and
// silica come from the steps those kinds of work already have.
ACTIVITIES.push(
  {
    when: 'solarPV',
    steps: [
      {
        only: 'solarPanels',
        step: 'Install solar panels and mounting rails on the roof',
        hazards: ['A fall from the roof edge or through a skylight or fragile sheet.', 'Panels catch the wind and pull a worker off balance or blow off the roof.', 'Strain carrying panels on the roof.', 'Panels, rails or tools fall onto people below.'],
        controls: [
          { fact: 'fallControl' },
          'Panels go up by a materials hoist, panel lifter, ladder lift or crane, not carried up a ladder.',
          'Panels are not handled on the roof in strong or gusty wind, and each panel is clamped as soon as it is placed.',
          'Rails are fixed into the rafters or purlins to the racking supplier\'s instructions, and roof penetrations are sealed.',
          'Below the work, the area is fenced off and no one stands under the roof edge while panels and rails are moved.',
        ],
      },
      {
        step: 'Connect the solar array and inverter',
        hazards: [{ only: 'solarArray', text: 'Electric shock from the array: panels make DC voltage whenever light falls on them, and cannot be switched off at the panel.' }, { unless: 'solarArray', text: 'Electric shock from DC and AC terminals at the inverter and battery.' }, 'A DC arc and burns when connectors are pulled apart under load.', 'Electric shock from the AC supply at the switchboard.'],
        controls: [
          'Electrical work is done only by a licensed electrical worker.',
          { only: 'inverterReplace', text: 'The old inverter is isolated on both the AC and DC sides, and proved de-energised, before it is disconnected and taken off the wall.' },
          { only: 'solarArray', text: 'Array conductors are treated as live in daylight. Connectors stay apart until the final connection, panels are covered with an opaque cover where their conductors must be worked on, and DC connectors are never pulled apart under load: the DC isolator is opened first.' },
          { only: 'inverterReplace', text: 'The old inverter is isolated on both its AC and DC sides, and the DC isolators locked off, before it is disconnected and removed. The new inverter is mounted to the manufacturer\'s instructions and AS/NZS 4777.1 on a wall that can carry it.' },
          { unless: 'inverterReplace', text: 'The array, inverter and isolators are installed to AS/NZS 5033, AS/NZS 4777.1 and the manufacturers\' instructions, with the required signs fitted.' },
          'The system is tested before it is connected, and is not connected to the grid until the distribution entity has approved the connection.',
        ],
      },
    ],
    ppe: ['gloveInsulated', 'sunHat', 'sunscreen'],
  },
  {
    when: 'batteryStorage',
    steps: [{
      step: 'Install the battery system',
      hazards: ['Electric shock and arc flash: a battery stays energised and cannot be switched off inside.', 'Fire from a damaged or wrongly installed lithium battery.', 'Strain lifting heavy battery modules onto a wall or stand.'],
      controls: [
        'Electrical work is done only by a licensed electrical worker.',
        'The battery is installed to AS/NZS 5139 and the manufacturer\'s instructions, including where it may and may not go, its clearances and its fire protection.',
        'Battery terminals stay covered and the battery isolator open until the final connection. Only insulated tools are used at the terminals.',
        'Modules are lifted with a team lift or a lifting aid, within the manufacturer\'s weights, onto a wall or stand checked for the load.',
        'A module that has been dropped, is damaged or is swollen is not installed. It is moved outside, away from buildings, and handled as the supplier directs.',
        'A fire extinguisher suited to electrical fires is at hand.',
      ],
    }],
    ppe: ['gloveInsulated'],
  },
  {
    when: 'meterBox',
    steps: [{
      step: 'Replace the meter box and consumer mains connection',
      hazards: ['Electric shock and arc flash: the consumer mains and service fuse stay live until the distribution entity disconnects them.', 'Asbestos in an older meter panel.', 'A fall from a ladder at the meter box.'],
      controls: [
        'Electrical work is done only by a licensed electrical worker.',
        'The supply is disconnected at the service fuse or pole by the distribution entity or a person it authorises, and the mains are tested de-energised before work.',
        'Meters are removed, moved or refitted only by the distribution entity or the metering provider, or a person they authorise.',
        'An older meter panel is treated as containing asbestos unless it has been tested. It is removed whole, without drilling, cutting or breaking it, under the asbestos arrangement in this SWMS, and disposed of as asbestos waste.',
        src('If asbestos cement is found or suspected, work on it stops. High-pressure water and compressed air are never used on it, and power tools only where their use is controlled; the work follows the asbestos rules.', WHS('s 446')),
        src('The consumer mains and main switchboard are not connected for the first time until the distribution entity has examined them, confirmed there are no serious defects and tested them.', ESR('s 217, s 218')),
        src('Give the distribution entity the notice of test, and issue the certificate of testing and safety.', ESR('s 208, s 228')),
        src('Single or extension ladders are used for access, with 3 points of contact, or for permitted work only: nothing carried that restricts movement or balance, the body centred between the stiles, and tools used with one hand. Where a person could fall 2 m or more (3 m in housing construction), the worker keeps 3 limbs on the ladder or uses a pole strap or a harness not attached to the ladder, and the ladder is secured at the top or bottom. Ladders are industrial and rated for at least 120 kg.', WHS('s 306A, s 306K, s 306L, s 306M')),
      ],
    }],
    ppe: ['gloveInsulated', 'arcRated'],
  },
  {
    when: 'gasFitting',
    steps: [
      {
        step: 'Isolate the gas and disconnect the old appliance',
        // Only where an old appliance comes out.
        only: 'replaceAppliance',
        hazards: ['Fire or explosion from escaping gas.', 'Strain moving the old appliance.'],
        controls: [
          src('Gas work is done only by a person holding a gas work licence or authorisation for that work.', 'Petroleum and Gas (Production and Safety) Act 2004 (Qld)'),
          'The gas is turned off at the meter or cylinder and the line is capped as soon as it is disconnected. No smoking, flames or sparks near the work.',
          'Heavy appliances are moved by two people or with a trolley.',
        ],
      },
      {
        step: 'Connect, leak test and commission the gas appliance',
        hazards: ['Fire or explosion from a leaking joint.', 'Carbon monoxide from a blocked flue or poor ventilation.', 'Burns from hot pipes, flues and appliances.'],
        controls: [
          { ...src('Gas work is done only by a person holding a gas work licence or authorisation for that work.', 'Petroleum and Gas (Production and Safety) Act 2004 (Qld)'), unless: 'replaceAppliance' },
          { only: 'subfloor', text: 'New pipe under the house is run from the subfloor where there is room: the access is checked, cables and other services are kept clear, and the space is assessed as a confined space only if it meets the definition.' },
          'Joints are leak tested after connection with a pressure test and leak detection fluid or a gas detector, never with a flame. The line is purged of air before the appliance is lit.',
          'The appliance is commissioned to the manufacturer\'s instructions, including the gas pressure, the flue, combustion air and a check that combustion products do not spill into the room or covered area.',
        ],
      },
    ],
    ppe: ['gloveGeneral'],
  },
  {
    when: 'floorCoating',
    steps: [{
      step: 'Apply epoxy or polyurethane floor coatings',
      hazards: ['Skin and lung sensitisation from epoxy resins and isocyanates.', 'Fire from solvent vapour where it can collect.', 'Slips on wet or freshly coated floors.'],
      controls: [
        { fact: 'safetyDataSheet' },
        src('Ventilate when using solvent coatings, especially in small or enclosed rooms and garages, and keep ignition sources away.', `${WHS('s 351, s 355')}; ${QCODE('Managing risks of hazardous chemicals', 's 4.1, s 4.2')}`),
        'Wear the gloves, eye protection and respirator the safety data sheet lists. Skin that touches resin is washed straight away; once a worker is sensitised, any later contact can cause a reaction.',
        src('If the safety data sheet lists isocyanates, workers who use the product as ongoing work have health monitoring supervised by a registered medical practitioner.', WHS('s 368, s 371, schedule 14')),
        { only: 'stairWork', text: 'Stairs are coated a section at a time, with another route kept open for people using the building or the stair closed under the site operator\'s arrangements, and treads are prepared by hand with a scraper or a sander on extraction.' },
        'The coated area is closed off with signs until it has cured enough to walk on.',
      ],
    }],
    ppe: ['gloveChemical', 'halfFace', 'goggles', 'kneePads'],
  },
  {
    when: 'roofBattens',
    steps: [{
      step: 'Fix roof battens to the trusses',
      hazards: ['A fall from the roof edge.', 'A fall through the open truss frame.', 'Nail gun injuries.', 'Trusses collapse if they are not braced.'],
      controls: [
        { fact: 'fallControl' },
        'Edge protection or a perimeter scaffold is in place before work on the roof frame starts.',
        'Trusses are braced to the truss supplier\'s layout, temporary bracing included, before battens go on.',
        'Where a person could fall through the truss frame, a safety net, fall arrest system or working platform is used. Standing on fixed battens is relied on only where the batten spacing and roof pitch give secure footing, as with closely spaced tile battens. No one walks on unsupported top chords.',
        'Nail guns are used with the single shot (sequential) trigger, never carried with a finger on the trigger, and disconnected before clearing a jam.',
        'Battens are lifted to the roof in bundles by a hoist or crane, or passed up from a scaffold, not carried up a ladder.',
      ],
    }],
    ppe: ['harness', 'earPlugs'],
  },
  {
    when: 'gutters',
    steps: [{
      step: 'Install gutters, fascia, downpipes and eaves linings',
      hazards: ['A fall from the eaves edge or a ladder.', 'Cuts from sheet metal edges.', 'Metal gutters or ladders touching the overhead service line to the building.', 'Strain handling long lengths.'],
      controls: [
        { fact: 'fallControl' },
        'Work at the eaves is done from a scaffold, mobile scaffold or EWP.',
        src('Single or extension ladders are used for access, with 3 points of contact, or for permitted work only: nothing carried that restricts movement or balance, the body centred between the stiles, and tools used with one hand. Where a person could fall 2 m or more (3 m in housing construction), the worker keeps 3 limbs on the ladder or uses a pole strap or a harness not attached to the ladder, and the ladder is secured at the top or bottom. Ladders are industrial and rated for at least 120 kg.', WHS('s 306A, s 306K, s 306L, s 306M')),
        'Before work, find the overhead service line to the building. Keep ladders and long metal lengths well clear of it, and ask the distribution entity to cover or disconnect it where the work is close.',
        'Cut-resistant gloves are worn for sheet metal, and cut edges are deburred.',
        'On a building built before 2004 (asbestos products were used until the national ban at the end of 2003), fibre cement eaves linings, gutters and downpipes are treated as asbestos unless tested, and are not cut, drilled or broken until they have been.',
        src('If asbestos cement is found or suspected, work on it stops. High-pressure water and compressed air are never used on it, and power tools only where their use is controlled; the work follows the asbestos rules.', WHS('s 446')),
        'New fibre cement eaves linings are cut by scoring and snapping or with shears, or with a saw with on-tool extraction and a fit tested P2 respirator. They are never dry cut without extraction.',
        'Long lengths are carried by two people.',
      ],
    }],
    ppe: ['gloveCut', 'sunHat', 'sunscreen'],
  },
  {
    when: 'skylight',
    steps: [{
      step: 'Cut in and install the skylight',
      hazards: ['A fall through the roof opening while the skylight is out.', 'A fall from the roof edge.', 'Live cables and heat in the roof space.', { unless: 'tiledRoof', text: 'Sparks and sharp edges when cutting roof sheet.' }],
      controls: [
        { fact: 'fallControl' },
        src('The opening is covered as soon as it is cut, with a cover strong enough to take anyone who could fall onto it, securely fixed so it cannot be moved or removed by accident, and marked as covering a hole.', `${WHS('s 306F')}; ${MODEL('Managing the risk of falls', 's 4.2')}`),
        { unless: 'tiledRoof', text: 'Before the sheet is cut, safety mesh is confirmed under it, or the opening is guarded or the worker uses travel restraint, until the cover or the skylight is in.' },
        { unless: 'tiledRoof', text: 'Roof sheet is cut with nibblers or snips where possible, not a grinder, to avoid sparks and hot swarf.' },
        { only: 'tiledRoof', text: 'Tiles are lifted off and stacked on the roof battens away from the edge.' },
        { only: 'skylightRepair', text: 'The broken skylight is removed and the opening covered before the new one is fitted, and broken glass or polycarbonate is bagged, not dropped.' },
        'A finished skylight without a mesh guard is a fragile surface. It is marked, and no one walks on or leans on it.',
        { unless: 'roofSpace', text: 'In the roof space, cables are treated as live, workers stand only on joists or crawl boards, and roof space work is kept short in hot weather.' },
        { unless: 'tiledRoof', text: 'An older roof is checked for asbestos cement before it is cut.' },
        src('If asbestos cement is found or suspected, work on it stops. High-pressure water and compressed air are never used on it, and power tools only where their use is controlled; the work follows the asbestos rules.', WHS('s 446')),
      ],
    }],
    ppe: ['gloveCut'],
  },
  {
    when: 'kitchenEquipment',
    steps: [{
      unless: 'hoodOnly',
      step: 'Deliver and install commercial kitchen equipment',
      hazards: ['Crushing or strain moving heavy equipment and benches.', { only: 'rangeHood', text: 'A fall from a platform or ladder while fixing hoods and ducts overhead.' }, 'Equipment tipping while it is moved or levelled.', 'Cuts from stainless steel edges.', 'Electric shock or gas leaks at connections.', { only: 'refrigEquipment', text: 'Refrigerant release at connections.' }, { only: 'stainlessFab', text: 'Burns and fumes from welding or grinding stainless steel on site.' }],
      controls: [
        { only: 'rangeHood', text: 'Hoods and exhaust ducts are lifted into place with a lifter or from a platform, supported until fixed to structure checked for their weight, and never held overhead from a ladder.' },
        { only: 'fireSuppression', text: 'The hood fire suppression system is installed and commissioned by a licensed fire protection contractor to the manufacturer\'s design, and is not left isolated once cooking starts.' },
          { text: 'Coolroom panels are stood and fixed in sequence, propped until joined, and ceiling panels are lifted with a panel lifter or from a platform, never by hand overhead from a ladder.', only: 'coolroom' },
        'Heavy equipment is moved with trolleys, pallet jacks or skates on a planned route, within the floor\'s load limits, with enough people. Tall items are kept upright and secured against tipping until they are fixed.',
        'Equipment is levelled and fixed or restrained to the supplier\'s instructions.',
        'Electrical connections are made by a licensed electrician, gas connections by a licensed gas fitter, and water and waste connections by a licensed plumber.',
        { text: 'Refrigerant work on refrigeration equipment is done only by the holder of a refrigerant handling licence.', unless: 'refrigerantWork', only: 'refrigEquipment' },
        'Cut-resistant gloves are worn when handling stainless steel sheet, benches and shelving.',
        { only: 'stainlessFab', text: 'Welding or grinding stainless steel on site is hot work, done under a hot work permit with fume extraction.' },
      ],
    }, {
      only: 'hoodOnly',
      step: 'Install the exhaust hood',
      hazards: ['A fall from a platform or ladder while fixing the hood and ducts overhead.', 'The hood or a duct section falls while it is lifted.', 'Cuts from stainless steel edges.', 'Electric shock at the fan and lighting connections.'],
      controls: [
        'Hoods and exhaust ducts are lifted into place with a lifter or from a platform, supported until fixed to structure checked for their weight, and never held overhead from a ladder.',
        { only: 'fireSuppression', text: 'The hood fire suppression system is installed and commissioned by a licensed fire protection contractor to the manufacturer\'s design, and is not left isolated once cooking starts.' },
        'The fan and hood lighting are connected by a licensed electrician.',
        'Cut-resistant gloves are worn when handling the hood and duct sections.',
      ],
    }],
    ppe: ['gloveCut'],
  },
  {
    when: 'safetyMesh',
    steps: [{
      step: 'Install safety mesh and sarking',
      hazards: ['A fall between purlins before the mesh is fixed.', 'A fall from the roof edge.', 'Mesh that is badly fixed or lapped fails under a falling person.'],
      controls: [
        { fact: 'fallControl' },
        'Safety mesh to AS/NZS 4389 is run out from a protected edge, and fixed, lapped and tensioned over the purlins to the manufacturer\'s details.',
        'A competent person checks the mesh before any sheet goes on, and damaged mesh is replaced.',
        'Sarking is laid only over mesh that is already fixed. No one stands on sarking between purlins.',
        'Mesh does not protect against a fall from the edge: edge protection stays in place.',
      ],
    }],
    ppe: ['gloveCut'],
  },
  {
    when: 'waterHeater',
    steps: [{
      only: 'poolHeater',
      step: 'Install and connect the pool heater',
      hazards: ['Strain or crushing moving the unit.', 'Electric shock near pool water.', 'Water leaks and slips at the filtration connections.'],
      controls: [
        'The unit is moved by two people or with a trolley, and set level on a base or pad that takes its full weight, with the airflow clearances the manufacturer sets.',
        'The water connections to the filtration line are made with the pump off and the line drained, to the manufacturer\'s instructions.',
        'The power connection is electrical work for a licensed electrician, with the circuit isolated first and the equipment bonded as the wiring rules require near a pool.',
        'The heater is commissioned and leak checked to the manufacturer\'s instructions before it is left running.',
      ],
    }, {
      unless: 'poolHeater',
      step: 'Disconnect and connect the water heater',
      hazards: [{ only: 'replaceAppliance', text: 'Scalds from stored hot water and hot pipes.' }, { only: 'replaceAppliance', text: 'Water damage and slips while draining.' }, 'Strain or crushing moving the heater.', { only: 'poolHeater', text: 'Electric shock near pool water.' }],
      controls: [
        'The water connections are plumbing work for a licensed plumber.',
        { text: 'The old heater is turned off and left to cool before it is drained, and drained to a floor waste or outside.', only: 'replaceAppliance' },
        { unless: 'poolHeater', text: 'The new heater has its temperature and pressure relief valve and drain line fitted to the manufacturer\'s instructions.' },
        { unless: 'poolHeater', text: 'Water to bathroom outlets is delivered no hotter than 50 °C, or 45 °C in early childhood centres, schools, and aged and health care buildings, with a tempering or thermostatic mixing valve where the plumbing rules require one.' },
        { only: 'electricHeater', text: 'Disconnecting and reconnecting the power to an electric heater is electrical work for a licensed electrician, with the circuit isolated first.' },
        'Heaters are moved by two people or with a trolley, and set on a base that takes their full weight.',
        { only: 'upperFloor', text: 'Units go to upper floors by the goods lift, a hoist or a crane, not carried up stairs or ladders, and are set down from inside the balustrade.' },
        { text: 'The old gas heater is disconnected and its gas line capped and leak tested by a licensed gas fitter.', only: 'gasToElectric' },
        { text: 'The heat pump\'s electrical connection is made by a licensed electrician.', only: 'heatPump' },
      ],
    }],
  },
  {
    when: 'rainwaterTank',
    steps: [{
      step: 'Install the rainwater tank and pump',
      hazards: ['Strain or crushing moving a large tank.', 'An empty tank blown over by wind.', 'Striking services when digging the base or pipes.', 'Electric shock from the pump connection.', 'A tank entered by a worker is a confined space.'],
      controls: [
        'The tank sits on a base built to the tank supplier\'s specification.',
        { only: 'tankStand', text: 'The tank stand is built to the engineer\'s or supplier\'s design. The empty tank is lifted onto it with a crane truck or other plant by licensed operators, with an exclusion zone, and work on top of the stand has fall protection.' },
        'Empty tanks are moved by enough people or with a lifting aid, and tied down when wind is forecast.',
        src('Get the current underground services information, for example through Before You Dig Australia, locate services on site before digging, and work to it.', WHS('s 304')),
        'The pump is plugged into an existing RCD-protected outlet, or its supply is installed by a licensed electrician.',
        'Connecting the tank to the building\'s water service or fixtures, such as toilets and the laundry, is plumbing work for a licensed plumber. A mains top-up has the backflow prevention the plumbing rules require.',
        'No one enters the tank. Work inside a tank is confined space work under its own permit and SWMS.',
      ],
    }],
  },
  {
    when: 'retainingWall',
    steps: [{
      step: 'Build the retaining wall',
      hazards: ['The cut face behind the wall collapses onto a worker.', 'The wall fails if it is built higher or loaded more than it was designed for.', 'Striking services when digging.', { only: 'timberWall', text: 'Strain handling sleepers and posts.' }, { unless: 'timberOnlyWall', text: 'Strain handling blocks.' }, { only: 'timberWall', text: 'Dust from cutting treated timber.' }, { unless: 'timberOnlyWall', text: 'Silica dust from cutting blocks.' }],
      controls: [
        { only: 'wallRepair', unless: 'collapsedWall', text: 'A failed wall is propped, or the area below it fenced off, until it is taken down from the top. It is never undermined, and no one works on its low side while it is unstable.' },
        'A wall over 1 m high, within 1.5 m of a building or another retaining wall, or with a load near the top such as a driveway or sloping ground, is built to an engineer\'s design and any building approval it needs.',
        src('Get the current underground services information before digging, and work to it.', WHS('s 304')),
        'The cut face is battered back or benched, or excavated in short lengths. No one works between an unsupported cut face and the wall where the face could fall on them.',
        { unless: 'masonryLay', text: 'Drainage and backfill are placed as the design shows, and backfill is compacted in layers.' },
        { only: 'timberWall', text: 'Sleepers and posts are team lifted or moved by machine.' },
        { unless: 'timberOnlyWall', text: 'Blocks are team lifted or moved by machine, and stacked close to the work.' },
        { only: 'timberWall', text: 'Treated timber is cut outside with dust extraction or a P2 respirator, and hands are washed before eating.' },
        { unless: 'timberOnlyWall', text: 'Blocks are cut with a wet saw or a saw with on-tool extraction, never dry cut without extraction, and the cutter wears a fit tested P2 respirator.' },
      ],
    }],
    ppe: ['p2', 'gloveGeneral'],
  },
  {
    when: 'kitStructure',
    steps: [{
      step: 'Erect the frame and roof of the structure',
      hazards: ['The frame collapses before it is braced.', 'A fall from the frame or roof.', 'Roof sheets caught by the wind.', 'Striking services when digging footings.'],
      controls: [
        { fact: 'fallControl' },
        src('Get the current underground services information before digging, and work to it.', WHS('s 304')),
        'Footings are dug and poured to the kit supplier\'s or engineer\'s details. Open holes are covered or fenced.',
        { only: 'kitBuild', text: 'Posts are stood, plumbed and braced, and the frame is braced to the kit instructions before roof sheets go on.' },
        { unless: 'kitBuild', text: 'Posts are stood, plumbed and braced, and the frame is braced to the engineer\'s or supplier\'s details before roof sheets go on.' },
        'Where the structure is fixed to the house, the fascia, wall or slab is checked as able to take the load, to the supplier\'s or engineer\'s details.',
        { only: 'roofExtension', text: 'Where the new roof ties into the existing roof, the existing roof is walked only on its purlin lines with fall protection, and the junction is flashed to the manufacturer\'s details.' },
        'Roof sheets are fixed from a scaffold, platform or EWP, and not handled in strong wind.',
      ],
    }],
    ppe: ['gloveCut', 'sunHat', 'sunscreen'],
  },
  {
    when: 'tiledRoof',
    steps: [{
      step: 'Work on a tiled roof',
      hazards: ['Tiles break underfoot and a worker falls through or slides.', 'A fall from the roof edge.', 'Tiles fall onto people below.', 'Silica dust from cutting concrete or terracotta tiles.'],
      controls: [
        { fact: 'fallControl' },
        'Walk only on the lower part of each tile, over the batten, or on roof ladders or boards that spread the load. Wet, mossy or broken tiles are not walked on.',
        'Tiles stacked on the roof are spread along the battens so they cannot slide, and the area below is fenced off.',
        { unless: 'tileRoofStrip', ...src('Drill with on-tool extraction. Anyone still at risk of exposure wears a fit tested respirator (P2 or better).', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2, s 7.6.1, s 7.6.2')}`) },
        { unless: 'tileRoofStrip', text: 'Tiles are cut with a wet saw or a saw with on-tool extraction, never dry cut without extraction.' },
        src('Assess in writing before cutting whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until that is determined.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
      ],
    }],
    ppe: ['p2', 'sunHat', 'sunscreen'],
  },
  {
    when: 'pressureClean',
    steps: [
      {
        unless: 'grindSeal',
        step: 'Pressure clean surfaces',
        hazards: ['Injection injury from the high-pressure jet.', 'Slips on wet surfaces.', 'Electric shock where water meets leads and connections.', 'Run-off of dirty water into stormwater drains.'],
        controls: [
          'The lance is never pointed at anyone, the trigger lock is on whenever the operator is not spraying, and the operator is trained in the machine. An injection injury is a medical emergency, even if it looks minor.',
          'Electric machines and leads are on an RCD, and plugs and connections are kept out of the water.',
          'Wastewater is kept out of stormwater drains: bunded, collected and disposed of as the local council requires.',
          src('If asbestos cement is found or suspected, work on it stops. High-pressure water and compressed air are never used on it, and power tools only where their use is controlled; the work follows the asbestos rules.', WHS('s 446')),
          'The work area is closed to the public, and wet surfaces are signed.',
        ],
      },
      {
        step: 'Apply sealers to concrete, pavers or timber',
        only: 'sealing',
        hazards: ['Fire from solvent vapour.', 'Breathing sealer vapour.', 'Slips on wet sealer.'],
        controls: [
          { fact: 'safetyDataSheet' },
          src('Ventilate when using solvent sealers, especially in small or enclosed rooms, and keep ignition sources away.', `${WHS('s 351, s 355')}; ${QCODE('Managing risks of hazardous chemicals', 's 4.1, s 4.2')}`),
          'The area stays closed until the sealer is dry.',
        ],
      },
    ],
    ppe: ['goggles', 'earPlugs', 'gumboots'],
  },
  {
    when: 'lineMarking',
    steps: [{
      step: 'Paint line marking',
      hazards: ['Struck by passing vehicles or plant.', 'Breathing paint vapour.', 'Strain from bending and kneeling.'],
      controls: [
        { fact: 'safetyDataSheet' },
        'Line marking paint is used outdoors or with ventilation, away from ignition sources, as its safety data sheet says.',
        'The area is closed to vehicles and plant with barriers, cones and signs. On a road in use, a traffic management plan is followed and traffic controllers are used where it requires them.',
        { only: 'siteVehicles', text: 'In a working warehouse or car park, the area is separated from forklifts and vehicles with physical barriers agreed with the site, not just paint or tape.' },
        'Line marking machines are used with their guards in place, and kept clear of others while running.',
      ],
    }],
    ppe: ['hivis', 'kneePads'],
  },
  {
    when: 'bollards',
    steps: [{
      step: 'Install bollards, barriers, wheel stops and speed humps',
      hazards: [{ unless: 'footpathWork', text: 'Struck by vehicles while working in a car park or driveway.' }, { only: 'footpathWork', text: 'Pedestrians walk into the work area on the footpath.' }, 'Strain lifting heavy bollards, barriers and stops.', 'Striking buried or embedded services when drilling or digging.'],
      controls: [
        { unless: 'footpathWork', text: 'The work area is closed to vehicles with barriers, cones and signs before work starts.' },
        { only: 'footpathWork', text: 'The work area on the footpath is barricaded, with a signed, clear way past for pedestrians, including people using wheelchairs and prams, kept open or a detour set up.' },
        { unless: 'coreDrill', ...src('Get the current underground services information before digging, and work to it.', WHS('s 304')) },
        { unless: 'coreDrill', text: 'Before drilling a slab, the area is scanned for conduits, pipes and reinforcement.' },
        { only: 'fuelSite', text: 'At a service station or other fuel site, work follows the site operator\'s permit and hazardous area rules: no ignition sources in the zones around dispensers, vents and tank fill points, and underground tanks and fuel lines are located before any drilling or digging.' },
        'Heavy bollards, barriers and concrete stops are lifted with a team lift, a trolley or plant, and fixed to the supplier\'s or engineer\'s details.',
      ],
    }],
    ppe: ['hivis'],
  },
  {
    when: 'shallowTrench',
    steps: [{
      step: 'Dig a shallow trench and lay pipe or cable',
      hazards: ['Striking buried services.', 'Entanglement in a trencher.', 'People tripping into the open trench.', 'Strain from hand digging.'],
      controls: [
        src('Get the current underground services information, for example through Before You Dig Australia, locate services on site before digging, and work to it.', WHS('s 304')),
        'The trench stays shallower than 1.5 m. If it needs to go deeper, work stops and the SWMS is reviewed.',
        'A trencher is used only by a trained operator, with its guards in place and no one near the chain. The engine is stopped before anything is cleared from it.',
        'The open trench is fenced or covered when no one is working at it.',
        'Installing and connecting electrical cable is electrical work for a licensed electrician, and connecting to the water supply is plumbing work for a licensed plumber. Digging the trench is not.',
      ],
    }],
  },
);

// Steps for the kinds of work found, between the opening and closing steps.
// `flags` names the kinds of work found; `factText` returns the user's text for a fact.
// Work the library does not know uses `fallback`, a step built from the task.
function jobStepsFor(flags, factText, fallback) {
  let found = ACTIVITIES.filter((activity) => flags[activity.when]);
  const replaced = new Set(found.flatMap((activity) => activity.replaces || []));
  found = found.filter((activity) => !replaced.has(activity.when));
  // With no kind of work recognised, the task itself is the only step: marked so the
  // draft is stood down rather than issued with no real hazards or controls.
  let middle = found.length ? found.flatMap((activity) => activity.steps) : [{ ...fallback, fallback: true }];
  // Work done inside a confined space happens before the permit is closed.
  const close = middle.filter((step) => step.step === 'Leave and close up');
  middle = [...middle.filter((step) => step.step !== 'Leave and close up'), ...close];
  // Asbestos is checked, and the room stripped out, before anything new goes in.
  const FIRST = ['Check for asbestos before starting', 'Prepare the asbestos work area', 'Remove the asbestos', 'Bag, label and dispose of asbestos waste', 'Strip out the room'];
  middle = [...FIRST.flatMap((name) => middle.filter((step) => step.step === name)), ...middle.filter((step) => !FIRST.includes(step.step))];
  // An asbestos meter panel comes out only once the supply is disconnected.
  if (middle.some((step) => step.step === 'Replace the meter box and consumer mains connection')) {
    const off = middle.filter((step) => step.step === 'Isolate and prove de-energised');
    middle = [...off, ...middle.filter((step) => !off.includes(step))];
  }
  // The circuit is isolated and proved de-energised before it is worked on.
  const isolate = middle.find((step) => step.step === 'Isolate and prove de-energised');
  const fitOff = middle.findIndex((step) => step.step === 'Rough-in and fit-off');
  if (isolate && fitOff >= 0 && middle.indexOf(isolate) > fitOff) {
    middle = middle.filter((step) => step !== isolate);
    middle.splice(fitOff, 0, isolate);
  }
  // The glass handling lines join the glass installation step rather than repeat it.
  const handling = middle.find((step) => step.step === 'Handle glass and panels');
  const install = middle.find((step) => step.step === 'Handle and install glass panels');
  if (handling && install) {
    // Only the handling lines the installation step does not already cover (vacuum lifters under a crane, their inspection, wind).
    const extra = handling.controls.filter((item) => !/^(Use vacuum lifters and glass panel lifters|Team lifts are an interim|Wear cut resistant gloves)/.test(typeof item === 'string' ? item : item.text || ''));
    middle = middle.filter((step) => step !== handling).map((step) => (step === install ? { ...install, hazards: [...install.hazards, 'A vacuum lifter loses grip.'], controls: [...install.controls, ...extra] } : step));
  }
  // The whole-structure step covers the general demolition step.
  if (middle.some((step) => step.step === 'Demolish the structure')) middle = middle.filter((step) => step.step !== 'Demolish');
  // Services are isolated and made safe before anything is demolished.
  const demolish = middle.findIndex((step) => step.step === 'Demolish');
  if (demolish >= 0) {
    const first = middle.filter((step, index) => index > demolish && ['Isolate and prove de-energised', 'Isolate, make safe and remove old services'].includes(step.step));
    if (first.length) {
      middle = middle.filter((step) => !first.includes(step));
      middle.splice(middle.findIndex((step) => step.step === 'Demolish'), 0, ...first);
    }
  }
  // Units are placed before the excavation is backfilled, and the beam goes in once
  // the opening is cut but before any bricking up.
  const moveBefore = (name, target) => {
    const step = middle.find((item) => item.step === name);
    const at = middle.findIndex((item) => item.step === target);
    if (step && at >= 0 && middle.indexOf(step) > at) {
      middle = middle.filter((item) => item !== step);
      middle.splice(middle.findIndex((item) => item.step === target), 0, step);
    }
  };
  const moveAfter = (name, target) => {
    const step = middle.find((item) => item.step === name);
    const at = middle.findIndex((item) => item.step === target);
    if (step && at >= 0 && middle.indexOf(step) < at) {
      middle = middle.filter((item) => item !== step);
      middle.splice(middle.findIndex((item) => item.step === target) + 1, 0, step);
    }
  };
  moveBefore('Lift and place tanks, pits or precast units', 'Backfill and restore');
  moveBefore('Set up the concrete pump and placing boom', 'During the pour');
  moveBefore('Install the battery system', 'Test, connect and commission');
  moveBefore('Dig footing holes', 'Cut blocks and bricks');
  moveBefore('Dig footing holes', 'Mix mortar');
  moveBefore('Take down the old fence', 'Dig post holes and build the fence');
  moveBefore('Take down the old fence', 'Dig footing holes');
  moveBefore('Take down the old fence', 'Mix mortar');
  moveBefore('Pressure test the gas line', 'Connect, leak test and commission the gas appliance');
  moveBefore('Build the outdoor kitchen', 'Connect, leak test and commission the gas appliance');
  moveBefore('Take down the shed frame', 'Bag, label and dispose of asbestos waste');
  moveBefore('Use an elevating work platform', 'Install temporary support');
  moveBefore('Cut out the old lintel', 'Mix mortar');
  moveBefore('Cut out the old lintel', 'Lift and fix the new beam or lintel');
  moveBefore('Mount the sub-board and run the sub-mains', 'Test, connect and commission');
  moveBefore('Mount and wire the control panel', 'Test, connect and commission');
  moveBefore('Work in the roof space', 'Fit cyclone tie-downs');
  moveBefore('Build the retaining wall', 'Mix mortar');
  moveBefore('Clean the gutters and downpipes', 'Clear the drain with a drain machine or jetter');
  moveBefore('Leave unfinished work safe', 'Test, connect and commission');
  moveBefore('Clear the collapsed wall and protect the footpath', 'Mix mortar');
  moveBefore('Clear the collapsed wall and protect the footpath', 'Lay blocks and bricks');
  moveBefore('Work with the crane crew during lifts', 'Lift and place tanks, pits or precast units');
  moveBefore('Isolate the gas and disconnect the old appliance', 'Strip out the room');
  moveAfter('Remove old frames and cut lintel bearings', 'Install temporary support');
  moveBefore('Remove old frames and cut lintel bearings', 'Cut blocks and bricks');
  moveAfter('Lay floor joists and the floor deck', 'Stand and brace wall frames');
  moveBefore('Install the shoring wall', 'Bulk excavate and load trucks');
  moveBefore('Protect neighbouring buildings and the street', 'Bulk excavate and load trucks');
  moveAfter('Strip formwork and backprop', 'Pump and place concrete');
  moveAfter('Strip formwork and backprop', 'Finish concrete');
  moveBefore('Work at open lift shafts and landing doors', 'Install the lift rails, car and machine');
  moveBefore('Deliver and place switchboards', 'Pull cables and handle cable drums');
  moveBefore('Isolate and prove de-energised', 'Pull cables and handle cable drums');
  moveBefore('Set up site sheds', 'Install construction power and temporary lighting');
  moveBefore('Isolate and prove de-energised', 'Install construction power and temporary lighting');
  moveAfter('Inspect, test and maintain construction power', 'Work on or near energised parts');
  moveBefore('Cut and flash the roof penetration', 'Install ductwork, pipework and units at height');
  moveBefore('Clear the drain with a drain machine or jetter', 'Clean, inspect and reline the pipe');
  moveBefore('Install water meters and backflow devices', 'Connect to the water supply');
  moveBefore('Isolate the gas and disconnect the old appliance', 'Install doors, joinery and cabinets');
  moveBefore('Work in the roof space', 'Spray polyurethane foam insulation');
  moveBefore('Operate small earthmoving plant', 'Excavate');
  moveBefore('Operate small earthmoving plant', 'Backfill and restore');
  moveBefore('Lift equipment and materials to the roof', 'Receive plant and move it into position');
  moveBefore('Work with the crane crew during lifts', 'Lift equipment and materials to the roof');
  moveBefore('Erect coolroom panels', 'Pressure test with nitrogen');
  moveBefore('Remove the old board and fit the new one', 'Test, connect and commission');
  moveBefore('Work in the roof space', 'Test, connect and commission');
  moveBefore('Work at edges', 'Apply primers and liquid membranes');
  moveBefore('Work at edges', 'Repair the roof membrane');
  moveBefore('Work with the crane crew during lifts', 'Backfill and restore');
  moveBefore('Get soil and plants to the podium', 'Move soil and mulch, and plant');
  moveBefore('Pressure clean surfaces', 'Prepare to paint');
  moveBefore('Mix mortar', 'Lay blocks and bricks');
  moveBefore('Mix mortar and core fill', 'Lay blocks and bricks');
  moveBefore('Deliver and install commercial kitchen equipment', 'Plumbing rough-in and fit-off');
  moveBefore('Work with the crane crew during lifts', 'Lift materials to and from the roof');
  moveBefore('Work with the crane crew during lifts', 'Fix new roofing');
  moveBefore('Pull cables and handle cable drums', 'Backfill and restore');
  moveBefore('Isolate and prove de-energised', 'Pull cables and handle cable drums');
  moveBefore('Install signal or lighting poles, pits and conduits', 'Pull cables and handle cable drums');
  moveBefore('Isolate and prove de-energised', 'Pull cables and handle cable drums');
  moveBefore('Prepare the asbestos work area', 'Remove old roofing');
  moveBefore('Remove the asbestos', 'Remove old roofing');
  moveBefore('Bag, label and dispose of asbestos waste', 'Remove old roofing');
  moveBefore('Install the pump-out line', 'Backfill and restore');
  moveBefore('Work in the roof space', 'Seal penetrations and fire stop');
  moveBefore('Install signal or lighting poles, pits and conduits', 'Backfill and restore');
  moveBefore('Install the battery system', 'Connect the solar array and inverter');
  moveAfter('Fix rails, fittings and equipment to walls and floors', 'Build the deck frame and lay the decking');
  moveAfter('Fix rails, fittings and equipment to walls and floors', 'Install access ladders, platforms and walkways');
  moveAfter('Install bollards, barriers, wheel stops and speed humps', 'Core drill through the slab or wall');
  moveAfter('Cut out and replace the steel handrail', 'Work over the water');
  // Asbestos roof sheets are removed from the roof, so roof access and fall protection go up first.
  const access = middle.find((item) => ['Set up roof access and fall protection', 'Get onto the roof and set up fall protection'].includes(item.step));
  const asbestosFirst = middle.findIndex((item) => item.step === 'Prepare the asbestos work area');
  if (access && asbestosFirst >= 0 && middle.some((item) => item.step === 'Remove old roofing') && middle.indexOf(access) > asbestosFirst) {
    middle = middle.filter((item) => item !== access);
    middle.splice(middle.findIndex((item) => item.step === 'Prepare the asbestos work area'), 0, access);
  }
  moveBefore('Work on a tiled roof', 'Cut in and install the skylight');
  moveBefore('Work on a tiled roof', 'Strip roof tiles and fix new battens and sarking');
  moveAfter('Install balustrades at open edges', 'Build the deck frame and lay the decking');
  moveBefore('Drill tiled walls for fixings', 'Handle and install glass panels');
  moveBefore('Install the pump and pipework', 'Backfill and restore');
  moveBefore('Lift and place tanks, pits or precast units', 'Lay pipes, pits and conduits');
  moveBefore('Fix plant on its supports', 'Install plant and equipment on the roof');
  moveAfter('Fix plant on its supports', 'Install plant and equipment on the roof');
  moveBefore('Build the retaining wall', 'Lay blocks and bricks');
  moveAfter('Paint the outside of the structure at height', 'Sand and fill surfaces');
  moveAfter('Handle and install glass panels', 'Install window frames, doors and louvres');
  moveBefore('Remove lead paint', 'Prepare to paint');
  moveBefore('Install gutters, fascia, downpipes and eaves linings', 'Prepare to paint');
  // Rescue equipment is set up before anyone works over the water.
  const rescue = middle.find((item) => item.step === 'Set up rescue equipment');
  if (rescue) middle = [rescue, ...middle.filter((item) => item !== rescue)];
  // Work over the water is set up before any work from the punt or jetty.
  const overWater = middle.find((item) => item.step === 'Work over the water');
  if (overWater) middle = [...middle.filter((item) => item.step === 'Set up rescue equipment'), overWater, ...middle.filter((item) => item !== overWater && item.step !== 'Set up rescue equipment')];
  moveBefore('Saw cut concrete', 'Excavate');
  moveBefore('Saw cut concrete', 'Prepare the ground and set out');
  moveBefore('Remove cut sections', 'Prepare the ground and set out');
  moveBefore('Remove cut sections', 'Excavate');
  moveBefore('Apply primers and liquid membranes', 'Cut tiles and stone');
  moveBefore('Apply primers and liquid membranes', 'Lay tiles');
  moveBefore('Install split system indoor and outdoor units', 'Pressure test with nitrogen');
  moveBefore('Connect to the live sewer', 'Backfill and restore');
  moveBefore('Prepare to enter the confined space', 'Connect to the live sewer');
  moveBefore('Enter and work', 'Connect to the live sewer');
  moveBefore('Leave and close up', 'Backfill and restore');
  moveBefore('Work with the crane crew during lifts', 'Lift and place tanks, pits or precast units');
  moveAfter('Clean out the wet well', 'Enter and work');
  moveAfter('Repair the pipe in the pit', 'Enter and work');
  moveBefore('Use an elevating work platform', 'Prepare the asbestos work area');
  moveBefore('Use mobile scaffolds', 'Prepare the asbestos work area');
  moveBefore('Work at edges', 'Apply primers and liquid membranes');
  moveAfter('Install doors, joinery and cabinets', 'Strip out ceilings, partitions and floor coverings');
  moveBefore('Install the cattle grid', 'Backfill and restore');
  moveBefore('Run earthmoving plant', 'Place the rock lining');
  moveBefore('Build the retaining wall', 'Mix mortar');
  moveBefore('Take down the old fence', 'Mix mortar');
  moveBefore('Dig footing holes', 'Mix mortar');
  moveBefore('Take down the old fence', 'Dig footing holes');
  moveBefore('Cut out the old lintel', 'Mix mortar');
  moveBefore('Cut out the old lintel', 'Lift and fix the new beam or lintel');
  moveBefore('Connect to the water supply', 'Backfill and restore');
  // A new building goes up in order: frames, trusses, roof, cladding, then linings.
  moveBefore('Stand and brace wall frames', 'Set up roof access and fall protection');
  moveBefore('Fix roof trusses', 'Set up roof access and fall protection');
  moveAfter('Install battens and external cladding', 'Fix roof trusses');
  moveAfter('Install battens and external cladding', 'Fix new roofing');
  moveAfter('Move and fix plasterboard sheets', 'Install battens and external cladding');
  moveAfter('Lift and fix the new beam or lintel', 'Cut an opening in a load-bearing wall');
  moveAfter('Lift and fix the new beam or lintel', 'Cut blocks and bricks');
  moveBefore('Lift and fix the new beam or lintel', 'Lay blocks and bricks');
  moveBefore('Install temporary support', 'Cut an opening in a load-bearing wall');
  // Safety mesh goes in before the sheets are laid over it.
  const mesh = middle.find((step) => step.step === 'Install safety mesh and sarking');
  const sheets = middle.findIndex((step) => step.step === 'Fix new roofing');
  if (mesh && sheets >= 0 && middle.indexOf(mesh) > sheets) {
    middle = middle.filter((step) => step !== mesh);
    middle.splice(sheets, 0, mesh);
  }
  // Old roofing comes off once the roof access and fall protection are set up.
  const strip = middle.find((step) => step.step === 'Remove old roofing');
  const setUp = middle.findIndex((step) => step.step === 'Set up roof access and fall protection');
  if (strip && setUp >= 0) {
    middle = middle.filter((step) => step !== strip);
    middle.splice(setUp + 1, 0, strip);
  }
  // Asbestos cement roof sheets: the old roofing is the asbestos, removed once under the asbestos controls.
  const asbestosOut = middle.find((step) => step.step === 'Remove the asbestos');
  const prepare = middle.find((step) => step.step === 'Prepare the asbestos work area');
  if (flags.asbestosRoof && strip && asbestosOut && prepare) {
    const merged = { ...strip, hazards: [...asbestosOut.hazards, ...strip.hazards], controls: [...asbestosOut.controls, ...strip.controls] };
    middle = middle.filter((step) => step !== asbestosOut && step !== prepare).map((step) => (step === strip ? merged : step));
    middle.splice(middle.indexOf(merged), 0, prepare);
  }
  const before = {
    ...BEFORE,
    controls: [...BEFORE.controls, ...new Set(BEFORE_EXTRA.filter((item) => flags[item.when] && !(item.unless && flags[item.unless])).flatMap((item) => expand(item.text, factText, flags.cite)))],
  };
  const seen = new Set();
  const steps = [before, ...middle, FINISH]
    .filter((step) => (!step.only || flags[step.only]) && (!step.unless || !flags[step.unless]))
    .filter((step) => !seen.has(step.step) && seen.add(step.step));
  // Post-tensioning checks apply only where the task is on post-tensioned slabs.
  const pt = (line) => (flags.ptSlab ? line : line.replace(/a post-tensioning tendon or /gi, '').split(/(?<=\.)\s+(?=[A-Z])/).filter((part) => !/post-tension|tendon/i.test(part)).join(' '));
  // A line already given in an earlier step is not repeated in a later one.
  const said = new Set();
  // A step left with no controls (energised work answered "none") is not work this SWMS covers.
  return steps.map((step) => ({
    ...(step.fallback ? { fallback: true } : {}),
    step: step.step === 'Erect fencing, hoardings and gantries' && !flags.hoarding ? 'Erect temporary fencing' : step.step === 'Sand and finish timber floors' && flags.deckRefinish ? 'Strip, sand and refinish the deck' : step.step === 'Install signs and screens' && flags.signPostsOnly ? 'Install signs on posts' : step.step === 'Drill or cut concrete, masonry or stone' && flags.grindOnly ? 'Grind concrete' : step.step === 'Install doors, joinery and cabinets' && !flags.cabinetWork ? (flags.trimWork ? 'Install doors and trim' : 'Install doors') : step.step,
    hazards: step.hazards.filter((item) => typeof item === 'string' || ((!item.only || flags[item.only]) && (!item.unless || !flags[item.unless]))).map((item) => (typeof item === 'string' ? item : item.text)).map((line) => localText(line, flags.cite || 'qld')).map(pt).filter(Boolean),
    controls: [...new Set(step.controls.filter((item) => (!item.only || flags[item.only]) && (!item.unless || !flags[item.unless])).flatMap((item) => expand(item, factText, flags.cite)).map(pt).filter(Boolean))],
  })).map((step) => {
    if (step.step === 'Before starting' || step.step === 'Finish and clean up') return step;
    const controls = step.controls.filter((line) => !said.has(line));
    controls.forEach((line) => said.add(line));
    return { ...step, controls };
  }).filter((step) => step.fallback || step.controls.length);
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
    // Most kinds of work need a harness only in some methods (a boom lift, work outside
    // edge protection). It stays ticked when one is in use, and always on a swing stage
    // or for confined space rescue.
    else if (!['swingStage', 'paintSwing', 'confined'].some((when) => flags[when])) ticked.delete('harness');
    if (!indoors) ticked.add('sunscreen');
  }
  return PPE.map((group) => ({
    area: group.area,
    items: group.items.map(([id, label]) => ({ id, label, ticked: ticked.has(id) })),
  }));
}

module.exports = { jobStepsFor, ppeFor, PPE, SITE_MINIMUM, ACTIVITIES };
